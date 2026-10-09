import { appendRecovery, createRecovery } from './recovery';

export type AudioSnapshot = {
  status: 'idle' | 'starting' | 'recording' | 'stopping';
  visitId: string | null;
  audioSessionId: string | null;
  elapsed: number;
  level: number;
  liveStatus: 'off' | 'connecting' | 'connected' | 'failed';
  liveText: string;
  partialText: string;
  recoveryStatus: 'ready' | 'saved' | 'failed';
  error: string | null;
};
const initial: AudioSnapshot = { status: 'idle', visitId: null, audioSessionId: null, elapsed: 0, level: 0, liveStatus: 'off', liveText: '', partialText: '', recoveryStatus: 'ready', error: null };
let snapshot = initial;
const listeners = new Set<() => void>();
const emit = (patch: Partial<AudioSnapshot>) => { snapshot = { ...snapshot, ...patch }; listeners.forEach((listener) => listener()); };
export const audioStore = { subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener); }, getSnapshot: () => snapshot, getServerSnapshot: () => initial };

async function request<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
  return data as T;
}

let stream: MediaStream | null = null;
let recorder: MediaRecorder | null = null;
let peer: RTCPeerConnection | null = null;
let channel: RTCDataChannel | null = null;
let context: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let started = 0;
let recoveryQueue: Promise<void> = Promise.resolve();
let recoveryId: string | null = null;
let chunks: Blob[] = [];
let stopResolve: ((blob: Blob) => void) | null = null;
let beforeUnload: ((event: BeforeUnloadEvent) => void) | null = null;
let connectionGeneration = 0;

async function connectLive(input: MediaStream, visitId: string, audioSessionId: string, generation: number) {
  const livePeer = new RTCPeerConnection();
  peer = livePeer;
  input.getAudioTracks().forEach((track) => livePeer.addTrack(track, input));
  const events = livePeer.createDataChannel('oai-events');
  channel = events;
  const partials = new Map<string, string>();
  const finals = new Map<string, { ordinal: number; text: string }>();
  const order = new Map<string, number>();
  let nextOrdinal = 0;
  events.onopen = () => { if (generation === connectionGeneration) emit({ liveStatus: 'connected' }); };
  events.onmessage = (message) => {
    if (generation !== connectionGeneration) return;
    let event: { type: string; item_id?: string; delta?: string; transcript?: string; error?: { message?: string } };
    try { event = JSON.parse(message.data); } catch { return; }
    if (event.type === 'input_audio_buffer.committed' && event.item_id) order.set(event.item_id, nextOrdinal++);
    if (event.type === 'conversation.item.input_audio_transcription.delta' && event.item_id) {
      partials.set(event.item_id, (partials.get(event.item_id) || '') + (event.delta || ''));
      emit({ partialText: [...partials.values()].join(' ') });
    }
    if (event.type === 'conversation.item.input_audio_transcription.completed' && event.item_id && event.transcript) {
      partials.delete(event.item_id);
      const ordinal = order.get(event.item_id) ?? nextOrdinal++;
      finals.set(event.item_id, { ordinal, text: event.transcript });
      emit({ liveText: [...finals.values()].sort((a, b) => a.ordinal - b.ordinal).map((item) => item.text).join('\n'), partialText: [...partials.values()].join(' ') });
      void request('/api/realtime/events', { visitId, audioSessionId, itemId: event.item_id, ordinal, text: event.transcript }).catch((error: Error) => emit({ error: `실시간 후보 저장 실패: ${error.message}` }));
    }
    if (event.type === 'error') emit({ liveStatus: 'failed', error: '실시간 전사 연결에서 오류가 발생했습니다. 전체 녹음은 계속됩니다.' });
  };
  livePeer.onconnectionstatechange = () => {
    if (generation !== connectionGeneration) return;
    if (['failed', 'disconnected'].includes(livePeer.connectionState)) emit({ liveStatus: 'failed', error: '실시간 연결이 끊겼습니다. 전체 녹음은 계속 저장됩니다.' });
  };
  const offer = await livePeer.createOffer();
  await livePeer.setLocalDescription(offer);
  const result = await request<{ sdp: string }>('/api/realtime/session', { visitId, audioSessionId, sdp: offer.sdp });
  if (generation !== connectionGeneration || snapshot.status === 'idle' || snapshot.status === 'stopping') { livePeer.close(); return; }
  await livePeer.setRemoteDescription({ type: 'answer', sdp: result.sdp });
}

export async function startRecording(visitId: string, deviceId?: string) {
  if (snapshot.status !== 'idle') throw new Error('다른 녹음이 진행 중입니다.');
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('HTTPS 주소의 녹음 지원 브라우저로 접속해 주세요.');
  emit({ ...initial, status: 'starting', visitId });
  try {
    // Exactly one microphone acquisition; this same stream feeds both paths.
    stream = await navigator.mediaDevices.getUserMedia({ audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), echoCancellation: true, noiseSuppression: true } });
    const session = await request<{ audioSessionId: string }>('/api/audio/sessions', { visitId });
    const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type));
    recorder = mimeType ? new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 64000 }) : new MediaRecorder(stream, { audioBitsPerSecond: 64000 });
    recoveryId = crypto.randomUUID();
    const extension = recorder.mimeType.includes('mp4') ? 'm4a' : 'webm';
    try {
      await createRecovery({ id: recoveryId, visitId, audioSessionId: session.audioSessionId, mimeType: recorder.mimeType, filename: `consultation-${recoveryId}.${extension}`, createdAt: new Date().toISOString() });
    } catch { emit({ recoveryStatus: 'failed', error: '브라우저 복구 저장소를 열지 못했습니다. 창을 닫지 말고 녹음을 종료 후 저장해 주세요.' }); }
    chunks = [];
    recoveryQueue = Promise.resolve();
    const ownedRecovery = recoveryId;
    recorder.ondataavailable = (event) => {
      if (!event.data.size) return;
      chunks.push(event.data);
      recoveryQueue = recoveryQueue.then(() => appendRecovery(ownedRecovery, event.data)).then(() => emit({ recoveryStatus: 'saved' })).catch(() => emit({ recoveryStatus: 'failed', error: '로컬 복구본 저장에 실패했습니다. 현재 녹음은 종료 후 저장할 수 있습니다.' }));
    };
    recorder.onstop = () => stopResolve?.(new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' }));
    recorder.start(3000);
    started = Date.now();
    emit({ status: 'recording', audioSessionId: session.audioSessionId, liveStatus: 'connecting' });
    beforeUnload = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    const generation = ++connectionGeneration;
    void connectLive(stream, visitId, session.audioSessionId, generation).catch((error: Error) => { if (generation === connectionGeneration) emit({ liveStatus: 'failed', error: `${error.message} 전체 녹음은 계속됩니다.` }); });
    try {
      context = new AudioContext();
      await context.resume();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream).connect(analyser);
      const values = new Float32Array(analyser.fftSize);
      let speechStarted = 0;
      let lastVoice = 0;
      timer = setInterval(() => {
        analyser.getFloatTimeDomainData(values);
        const rms = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0) / values.length);
        const now = Date.now();
        if (rms > 0.015) { lastVoice = now; speechStarted ||= now; }
        if (speechStarted && (now - lastVoice > 900 || now - speechStarted > 15000)) {
          if (channel?.readyState === 'open' && now - speechStarted >= 300) channel.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
          speechStarted = 0;
        }
        emit({ elapsed: now - started, level: Math.min(1, rms * 8) });
      }, 200);
    } catch { emit({ error: '입력 레벨을 표시할 수 없습니다. 전체 녹음은 계속됩니다. 실시간 발화 확정은 수동 버튼을 사용해 주세요.' }); }
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    emit({ ...initial, error: error instanceof Error ? error.message : '마이크를 시작하지 못했습니다.' });
    throw error;
  }
}

export function commitLiveTurn() {
  if (channel?.readyState === 'open') channel.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
}

export async function stopRecording(): Promise<{ blob: Blob; visitId: string; audioSessionId: string; recoveryId: string; durationMs: number }> {
  if (snapshot.status !== 'recording' || !recorder || !snapshot.visitId || !snapshot.audioSessionId || !recoveryId) throw new Error('진행 중인 녹음이 없습니다.');
  const owned = { visitId: snapshot.visitId, audioSessionId: snapshot.audioSessionId, recoveryId, durationMs: Date.now() - started };
  emit({ status: 'stopping' });
  commitLiveTurn();
  const blob = await new Promise<Blob>((resolve) => { stopResolve = resolve; recorder!.stop(); });
  await recoveryQueue;
  await request('/api/audio/sessions', { visitId: owned.visitId, audioSessionId: owned.audioSessionId, action: 'stop' }).catch((error: Error) => emit({ error: `녹음 종료 상태 저장 실패: ${error.message}` }));
  if (timer) clearInterval(timer);
  timer = null;
  // Allow committed final turns a short drain while audio capture has already stopped.
  await new Promise((resolve) => setTimeout(resolve, 800));
  connectionGeneration++;
  peer?.close(); peer = null; channel = null;
  stream?.getTracks().forEach((track) => track.stop()); stream = null;
  await context?.close().catch(() => {}); context = null;
  if (beforeUnload) window.removeEventListener('beforeunload', beforeUnload);
  beforeUnload = null;
  recorder = null; stopResolve = null;
  emit({ status: 'idle', level: 0, liveStatus: 'off' });
  return { blob, ...owned };
}

export async function uploadAudio(file: File | Blob, meta: { visitId: string; filename: string; audioSessionId?: string; durationMs?: number }) {
  if (file.size > 25_000_000) throw new Error('현재 전사 한도는 파일당 25MB입니다. 녹음을 압축하거나 짧은 파일을 선택해 주세요.');
  const init = await request<{ recordingId: string; uploadUrl: string; uploadHeaders?: Record<string, string> }>('/api/audio/uploads', { ...meta, mimeType: file.type || 'audio/mpeg', sizeBytes: file.size });
  const upload = await fetch(init.uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type || 'audio/mpeg', ...init.uploadHeaders }, body: file });
  if (!upload.ok) throw new Error('파일 업로드가 실패했습니다. 녹음 복구본은 유지됩니다.');
  await request('/api/audio/uploads/complete', { recordingId: init.recordingId });
  return init.recordingId;
}

export async function startTranscriptionJob(visitId: string, recordingId: string) {
  return request<{ jobId: string }>('/api/jobs', { visitId, recordingId, kind: 'transcription' });
}

export async function closeRecoveredSession(visitId: string, audioSessionId: string) {
  await request('/api/audio/sessions', { visitId, audioSessionId, action: 'stop' });
}
