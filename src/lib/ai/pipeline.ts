import { randomUUID } from 'node:crypto';
import { readState, updateState } from '@/lib/server/store';
import { AppError } from '@/lib/server/errors';
import { readAudio } from '@/lib/audio/storage';
import { transcribeAudio } from './transcribe';
import { loadDictionary, retrieveCorrectionSpans } from './dictionary';
import { validateCorrections } from './correction';
import { generateSoap, proposeCorrections } from './provider';
import { AI_MODELS } from './config';
import type { RuntimeJob, Transcript } from '@/lib/types';

export async function patchJob(jobId: string, patch: Partial<RuntimeJob>) {
  await updateState((state) => {
    const job = state.jobs.find((item) => item.id === jobId);
    if (!job) throw new AppError(404, 'JOB_NOT_FOUND', 'AI 작업을 찾을 수 없습니다.');
    const result = patch.result ? { ...job.result, ...patch.result } : job.result;
    Object.assign(job, patch, { result, updated_at: new Date().toISOString() });
  });
}

export async function transcribeStep(jobId: string) {
  const { state } = await readState();
  const job = state.jobs.find((item) => item.id === jobId);
  if (!job) throw new AppError(404, 'JOB_NOT_FOUND', 'AI 작업을 찾을 수 없습니다.');
  if (typeof job.result?.transcriptId === 'string') return job.result.transcriptId;
  const recording = state.recordings.find((item) => item.id === job.recording_id && item.visit_id === job.visit_id);
  if (!recording) throw new AppError(404, 'RECORDING_NOT_FOUND', '전사할 음성을 찾을 수 없습니다.');
  await patchJob(jobId, { status: 'running', stage: 'transcribing' });
  const result = await transcribeAudio(await readAudio(recording), recording.filename);
  const id = randomUUID();
  await updateState((next) => {
    const currentJob = next.jobs.find((item) => item.id === jobId)!;
    if (currentJob.result?.transcriptId) return;
    const transcript: Transcript = { id, clinic_id: next.clinic.id, visit_id: job.visit_id, revision: Math.max(0, ...next.transcripts.filter((item) => item.visit_id === job.visit_id).map((item) => item.revision)) + 1, status: 'raw', source_asset_key: 'manual_seed', text: result.text, segments: result.segments, origin: 'manual_demo' };
    next.transcripts.push(transcript);
    currentJob.result = { ...currentJob.result, mode: 'actual_ai', transcriptId: id, rawSpeakers: result.rawSpeakers, model: result.model };
    currentJob.updated_at = new Date().toISOString();
  });
  const latest = await readState();
  return latest.state.jobs.find((item) => item.id === jobId)!.result!.transcriptId as string;
}

export async function correctionStep(jobId: string) {
  const { state } = await readState();
  const job = state.jobs.find((item) => item.id === jobId)!;
  if (job.result?.corrections) return;
  const transcript = state.transcripts.find((item) => item.id === job.result?.transcriptId);
  if (!transcript) throw new Error('TRANSCRIPT_NOT_FOUND');
  await patchJob(jobId, { stage: 'dictionary_correction' });
  const spans = retrieveCorrectionSpans(transcript.text, await loadDictionary());
  const corrections = validateCorrections(transcript.text, spans, await proposeCorrections(transcript.text, spans));
  await patchJob(jobId, { result: { corrections, correction_spans: spans, correction_model: spans.length ? AI_MODELS.correction : null, correction_note: spans.length ? '용어 제안은 의료진 검토 전이며 SOAP에는 아직 적용하지 않았습니다.' : '로컬 검색에서 교정 후보 구간이 없어 원문을 유지했습니다.' } });
}

export async function soapStep(jobId: string) {
  const { state } = await readState();
  const job = state.jobs.find((item) => item.id === jobId)!;
  if (job.result?.soapId) return;
  const preferredTranscriptId = job.result?.reviewedTranscriptId || job.result?.transcriptId;
  const transcript = state.transcripts.find((item) => item.id === preferredTranscriptId);
  if (!transcript) throw new Error('TRANSCRIPT_NOT_FOUND');
  await patchJob(jobId, { stage: 'soap_draft', status: 'running' });
  const result = await generateSoap(transcript.segments);
  const id = randomUUID();
  await updateState((next) => {
    const currentJob = next.jobs.find((item) => item.id === jobId)!;
    if (currentJob.result?.soapId) return;
    const newerTranscript = next.transcripts.some((item) => item.visit_id === job.visit_id && item.revision > transcript.revision);
    const revision = Math.max(0, ...next.soap_documents.filter((item) => item.visit_id === job.visit_id).map((item) => item.revision)) + 1;
    next.soap_documents.push({ id, clinic_id: next.clinic.id, visit_id: job.visit_id, revision, input_transcript_id: transcript.id, status: 'draft', sections: result.sections, source_refs: result.evidence.map((item) => ({ kind: 'provided_transcript', source_id: item.segment_id, quote: item.quote, origin: 'manual_demo' })), approved_at: null, approved_by: null, origin: 'manual_demo' });
    currentJob.result = { ...currentJob.result, soapId: id, evidence: result.evidence, warnings: [...result.warnings, ...(newerTranscript ? ['생성 중 새 전사 버전이 저장되었습니다. 이전 입력으로 생성한 초안입니다.'] : [])], followup_questions: result.followup_questions, soap_model: AI_MODELS.soap, input_transcript_id: transcript.id, input_transcript_revision: transcript.revision, stale_input: newerTranscript };
    currentJob.status = 'waiting_review'; currentJob.stage = 'review_needed'; currentJob.updated_at = new Date().toISOString();
    const recording = next.recordings.find((item) => item.id === job.recording_id);
    if (recording) recording.status = 'completed';
    const visit = next.visits.find((item) => item.id === job.visit_id)!;
    visit.record_status = 'review_needed';
  });
}

export async function failJob(jobId: string, error: unknown) {
  const safe = error instanceof AppError ? error.message : '설정된 AI 모델 처리 중 오류가 발생했습니다. 모델 접근·요청 한도·파일을 확인하고 다시 시도해 주세요.';
  await patchJob(jobId, { status: 'failed', stage: 'failed', error: safe });
  await updateState((state) => {
    const job = state.jobs.find((item) => item.id === jobId);
    const recording = state.recordings.find((item) => item.id === job?.recording_id);
    if (recording) { recording.status = 'failed'; recording.error = safe; }
  });
}
