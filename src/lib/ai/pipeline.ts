import { AiTextPrivacy, identitiesForVisit, privacyAudit } from '@/lib/privacy/text';
import { randomUUID } from 'node:crypto';
import { readState, updateState } from '@/lib/server/store';
import { AppError } from '@/lib/server/errors';
import { readAudio } from '@/lib/audio/storage';
import { transcribeAudio, transcribeContentAudio } from './transcribe';
import { alignTranscriptContent, DUAL_TRANSCRIPTION_VERSION } from './transcription-alignment';
import { DICTIONARY_RETRIEVAL_VERSION, loadDictionary, retrieveCorrectionSpans } from './dictionary';
import { validateCorrections } from './correction';
import { generateSoap, proposeCorrections, inferSpeakerRoles } from './provider';
import { AI_MODELS } from './config';
import { effectiveSpeaker } from '@/lib/audio/speaker-roles';
import type { RuntimeJob, Transcript } from '@/lib/types';
import { collectClinicalSoapSources, soapInputSnapshot, soapEvidenceRef } from './soap-inputs';
import { ensureClinicalAnalysis } from './clinical-analysis-jobs';

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
  const visitId = job.visit_id;
  if (typeof job.result?.transcriptId === 'string') return job.result.transcriptId;
  const recording = state.recordings.find((item) => item.id === job.recording_id && item.visit_id === visitId);
  if (!recording) throw new AppError(404, 'RECORDING_NOT_FOUND', '전사할 음성을 찾을 수 없습니다.');
  const priorDiarized = state.transcripts.find((item) => item.id === job.result?.diarizedTranscriptId && item.visit_id === visitId);
  const priorContent = state.transcripts.find((item) => item.id === job.result?.contentTranscriptId && item.visit_id === visitId);
  await patchJob(jobId, { status: 'running', stage: 'transcribing', result: { transcription_pipeline: DUAL_TRANSCRIPTION_VERSION } });
  const audio = !priorDiarized || !priorContent ? await readAudio(recording) : null;
  const [diarized, content] = await Promise.allSettled([
    priorDiarized ? Promise.resolve(priorDiarized) : transcribeAudio(audio!, recording.filename),
    priorContent ? Promise.resolve(priorContent) : transcribeContentAudio(audio!, recording.filename),
  ]);
  // Persist each successful channel before throwing, so retry only calls the missing channel.
  await updateState((next) => {
    const currentJob = next.jobs.find((item) => item.id === jobId)!;
    currentJob.result = { ...currentJob.result, transcription_pipeline: DUAL_TRANSCRIPTION_VERSION, model: AI_MODELS.transcription, diarization_model: AI_MODELS.diarization };
    function saveSource(key: 'diarizedTranscriptId' | 'contentTranscriptId', text: string, segments: Transcript['segments']) {
      if (typeof currentJob.result?.[key] === 'string') return;
      const id = randomUUID();
      const revision = Math.max(0, ...next.transcripts.filter((item) => item.visit_id === visitId).map((item) => item.revision)) + 1;
      next.transcripts.push({ id, clinic_id: next.clinic.id, visit_id: visitId, revision, status: 'raw', source_asset_key: 'manual_seed', text, segments, origin: 'manual_demo' });
      currentJob.result![key] = id;
    }
    if (diarized.status === 'fulfilled') saveSource('diarizedTranscriptId', diarized.value.text, diarized.value.segments);
    if (content.status === 'fulfilled') saveSource('contentTranscriptId', content.value.text, [{ id: randomUUID(), ordinal: 1, speaker: 'unknown', text: content.value.text, start_ms: null, end_ms: null }]);
    currentJob.updated_at = new Date().toISOString();
  });
  if (content.status === 'rejected') throw content.reason;
  if (diarized.status === 'rejected') throw diarized.reason;
  const saved = (await readState()).state;
  const savedJob = saved.jobs.find((item) => item.id === jobId)!;
  const original = saved.transcripts.find((item) => item.id === savedJob.result?.diarizedTranscriptId)!;
  const primary = saved.transcripts.find((item) => item.id === savedJob.result?.contentTranscriptId)!;
  const alignment = alignTranscriptContent(primary.text, original.segments);
  await patchJob(jobId, { stage: 'speaker_roles' });
  const privacy = new AiTextPrivacy(identitiesForVisit(saved, visitId));
  let speakerRoles: NonNullable<Transcript['speaker_roles']> = {};
  let speakerNote: string | null = null;
  try { speakerRoles = await inferSpeakerRoles(primary.text, alignment.segments, privacy); }
  catch { speakerNote = '화자 역할 자동 추론에 실패해 미확인으로 남겼습니다. 전사 검토에서 그룹 또는 구간 역할을 수정할 수 있습니다.'; }
  const segments = alignment.segments.map(segment => ({ ...segment, speaker: effectiveSpeaker(segment, speakerRoles) }));
  await updateState((next) => {
    const currentJob = next.jobs.find((item) => item.id === jobId)!;
    if (currentJob.result?.transcriptId) return;
    const id = randomUUID();
    const transcript: Transcript = { id, clinic_id: next.clinic.id, visit_id: visitId, revision: Math.max(0, ...next.transcripts.filter((item) => item.visit_id === visitId).map((item) => item.revision)) + 1, status: 'raw', source_asset_key: 'manual_seed', text: primary.text, segments, speaker_roles: speakerRoles, origin: 'manual_demo' };
    next.transcripts.push(transcript);
    const rawSpeakers = Object.fromEntries(segments.flatMap((segment) => segment.raw_speaker ? [[segment.id, segment.raw_speaker]] : []));
    currentJob.result = { ...currentJob.result, mode: 'actual_ai', transcriptId: id, rawSpeakers, model: AI_MODELS.transcription, diarization_model: AI_MODELS.diarization, speaker_role_model: AI_MODELS.correction, speaker_role_note: speakerNote, alignment: { algorithm: alignment.algorithm, changed_groups: alignment.changed_groups, unassigned_groups: alignment.unassigned_groups, warnings: alignment.warnings }, text_privacy: privacyAudit(currentJob.result?.text_privacy, 'speaker_roles', privacy) };
    currentJob.updated_at = new Date().toISOString();
  });
  return (await readState()).state.jobs.find((item) => item.id === jobId)!.result!.transcriptId as string;
}

export async function correctionStep(jobId: string) {
  const { state } = await readState();
  const job = state.jobs.find((item) => item.id === jobId)!;
  if (job.result?.corrections) return;
  const transcript = state.transcripts.find((item) => item.id === job.result?.transcriptId);
  if (!transcript) throw new Error('TRANSCRIPT_NOT_FOUND');
  await patchJob(jobId, { stage: 'dictionary_correction' });
  const privacy = new AiTextPrivacy(identitiesForVisit(state, job.visit_id));
  const spans = retrieveCorrectionSpans(transcript.text, await loadDictionary());
  const corrections = validateCorrections(transcript.text, spans, await proposeCorrections(transcript.text, spans, privacy));
  await patchJob(jobId, { result: { corrections, correction_spans: spans, correction_version: DICTIONARY_RETRIEVAL_VERSION, text_privacy: privacyAudit(job.result?.text_privacy, 'correction', privacy), correction_model: spans.length ? AI_MODELS.correction : null, correction_note: spans.length ? '용어 제안은 의료진 검토 전이며 SOAP에는 아직 적용하지 않았습니다.' : '로컬 검색에서 교정 후보 구간이 없어 원문을 유지했습니다.' } });
}

export async function soapStep(jobId: string) {
  const { state } = await readState();
  const job = state.jobs.find((item) => item.id === jobId)!;
  if (job.result?.soapId) return;
  const preferredTranscriptId = job.result?.reviewedTranscriptId || job.result?.transcriptId;
  const transcript = state.transcripts.find((item) => item.id === preferredTranscriptId);
  if (!transcript) throw new Error('TRANSCRIPT_NOT_FOUND');
  const clinicalSources = collectClinicalSoapSources(state, job.visit_id);
  const inputSnapshot = soapInputSnapshot(state, transcript);
  await patchJob(jobId, { stage: 'soap_draft', status: 'running' });
  const privacy = new AiTextPrivacy(identitiesForVisit(state, job.visit_id));
  const result = await generateSoap(transcript.segments, privacy, clinicalSources);
  const id = randomUUID();
  let freshSoapStored = false;
  await updateState((next) => {
    const currentJob = next.jobs.find((item) => item.id === jobId)!;
    if (currentJob.result?.soapId) return;
    const newerTranscript = next.transcripts.some((item) => item.visit_id === job.visit_id && item.revision > transcript.revision);
    const changedClinicalInputs = soapInputSnapshot(next, transcript).hash !== inputSnapshot.hash;
    if (newerTranscript || changedClinicalInputs) {
      currentJob.result = { ...currentJob.result, soap_preview: result.sections, evidence: result.evidence, warnings: [...result.warnings, '생성 중 전사·시술·검토 필기·재진 입력이 변경되었습니다. 최신 입력으로 다시 생성해 주세요.'], input_transcript_id: transcript.id, input_transcript_revision: transcript.revision, input_snapshot: inputSnapshot, stale_input: true, soap_model: AI_MODELS.soap, text_privacy: privacyAudit(currentJob.result?.text_privacy, 'soap', privacy) };
      currentJob.status = 'waiting_review'; currentJob.stage = 'stale_input'; currentJob.updated_at = new Date().toISOString();
      const oldRecording = next.recordings.find((item) => item.id === job.recording_id);
      if (oldRecording) oldRecording.status = 'completed';
      return;
    }
    const revision = Math.max(0, ...next.soap_documents.filter((item) => item.visit_id === job.visit_id).map((item) => item.revision)) + 1;
    next.soap_documents.push({ id, clinic_id: next.clinic.id, visit_id: job.visit_id, revision, input_transcript_id: transcript.id, input_snapshot: inputSnapshot, status: 'draft', sections: result.sections, source_refs: result.evidence.map(item => soapEvidenceRef(item.segment_id, item.quote, transcript.segments, clinicalSources)), approved_at: null, approved_by: null, origin: 'manual_demo' });
    currentJob.result = { ...currentJob.result, soapId: id, evidence: result.evidence, warnings: result.warnings, followup_questions: result.followup_questions, soap_model: AI_MODELS.soap, input_snapshot: inputSnapshot, text_privacy: privacyAudit(currentJob.result?.text_privacy, 'soap', privacy), input_transcript_id: transcript.id, input_transcript_revision: transcript.revision, stale_input: false };
    currentJob.status = 'waiting_review'; currentJob.stage = 'review_needed'; currentJob.updated_at = new Date().toISOString();
    const recording = next.recordings.find((item) => item.id === job.recording_id);
    if (recording) recording.status = 'completed';
    const visit = next.visits.find((item) => item.id === job.visit_id)!;
    visit.record_status = 'review_needed';
    freshSoapStored = true;
  });
  if (freshSoapStored) await ensureClinicalAnalysis(job.visit_id, transcript.id, job.session_id);
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
