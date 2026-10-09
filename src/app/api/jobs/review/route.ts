import { randomUUID } from 'node:crypto';
import { requireSession, assertSameOrigin } from '@/lib/server/auth';
import { AppError } from '@/lib/server/errors';
import { readBody, errorResponse, jsonResponse } from '@/lib/server/http';
import { updateState } from '@/lib/server/store';
import { applyAcceptedCorrections, validateCorrections, type CorrectionSpan, type ValidatedCorrection } from '@/lib/ai/correction';
import type { Segment } from '@/lib/types';

export async function POST(request: Request) {
  try {
    const session = await requireSession(request);
    assertSameOrigin(request);
    const { jobId, decisions, manualText, speakers, expectedTranscriptRevision } = await readBody(request, 300_000);
    if (typeof jobId !== 'string') throw new AppError(400, 'JOB_REQUIRED', '검토할 전사 작업을 선택해 주세요.');
    let transcriptId = '';
    await updateState((state) => {
      const job = state.jobs.find((item) => item.id === jobId && item.clinic_id === state.clinic.id);
      const raw = state.transcripts.find((item) => item.id === job?.result?.transcriptId);
      if (!job || !raw) throw new AppError(404, 'TRANSCRIPT_NOT_FOUND', '검토할 원문을 찾을 수 없습니다.');
      const latest = state.transcripts.filter((item) => item.visit_id === raw.visit_id).sort((a, b) => b.revision - a.revision)[0];
      const baseId = job.result?.reviewedTranscriptId || raw.id;
      if (latest.id !== baseId) throw new AppError(409, 'TRANSCRIPT_VERSION_CONFLICT', '검토 대상보다 새 전사가 있습니다. 최신 내용을 확인해 주세요.');
      if (expectedTranscriptRevision !== undefined && latest.revision !== expectedTranscriptRevision) throw new AppError(409, 'TRANSCRIPT_VERSION_CONFLICT', '새 전사 버전이 있습니다. 최신 내용을 확인해 주세요.');
      const stored = (job.result?.corrections || []) as ValidatedCorrection[];
      const submitted = Array.isArray(decisions) ? decisions as { span_id: string; status: string; candidate_id?: string }[] : [];
      const retrieved = (job.result?.correction_spans ?? []) as CorrectionSpan[];
      if (new Set(submitted.map(item => item.span_id)).size !== submitted.length || submitted.some((item) => !stored.some((candidate) => candidate.span_id === item.span_id) || !['accepted', 'rejected'].includes(item.status) || item.candidate_id !== undefined && (item.status !== 'accepted' || typeof item.candidate_id !== 'string'))) throw new AppError(400, 'INVALID_REVIEW', '교정 검토 항목을 확인해 주세요.');
      const corrections = stored.map((item) => {
        const decision = submitted.find(value => value.span_id === item.span_id);
        if (decision?.candidate_id) {
          const span = retrieved.find(value => value.id === item.span_id);
          if (!span || !span.candidates.some(value => value.id === decision.candidate_id)) throw new AppError(400, 'INVALID_REVIEW', '제공된 사전 후보 중에서 선택해 주세요.');
          const selected = validateCorrections(raw.text, [span], [{ span_id: span.id, decision: 'suggest', candidate_id: decision.candidate_id, reason: '의료진이 출처를 확인하고 사전 후보를 직접 선택했습니다.' }])[0];
          return { ...selected, review_status: 'accepted' as const };
        }
        if (decision?.status === 'accepted' && item.decision !== 'suggest') throw new AppError(400, 'INVALID_REVIEW', '수락할 사전 후보를 먼저 선택해 주세요.');
        return { ...item, review_status: (decision?.status ?? 'rejected') as ValidatedCorrection['review_status'] };
      });
      const corrected = applyAcceptedCorrections(raw.text, corrections);
      if (manualText !== undefined && (typeof manualText !== 'string' || !manualText.trim() || manualText.length > 150_000)) throw new AppError(400, 'INVALID_TRANSCRIPT_TEXT', '검토 전사 내용을 확인해 주세요.');
      const text = typeof manualText === 'string' ? manualText : corrected;
      const speakerMap = speakers && typeof speakers === 'object' && !Array.isArray(speakers) ? speakers as Record<string, string> : {};
      const allowed = ['clinician', 'patient', 'guardian', 'unknown'];
      if (Object.values(speakerMap).some((item) => !allowed.includes(item))) throw new AppError(400, 'INVALID_SPEAKER', '화자 역할을 확인해 주세요.');
      transcriptId = randomUUID();
      let segments: Segment[];
      if (typeof manualText === 'string' && manualText !== corrected) {
        // A freely rewritten transcript cannot retain inaccurate word offsets or inferred roles.
        segments = [{ id: randomUUID(), ordinal: 1, speaker: 'unknown', text, start_ms: null, end_ms: null }];
      } else {
        let globalOffset = 0;
        segments = raw.segments.map((segment) => {
          const start = raw.text.indexOf(segment.text, globalOffset);
          if (start >= 0) globalOffset = start + segment.text.length;
          const scoped = corrections.filter((item) => start >= 0 && item.start >= start && item.end <= start + segment.text.length).map((item) => ({ ...item, start: item.start - start, end: item.end - start }));
          return { ...segment, id: randomUUID(), speaker: (speakerMap[segment.id] || segment.speaker) as Segment['speaker'], text: applyAcceptedCorrections(segment.text, scoped) };
        });
      }
      state.transcripts.push({ ...raw, id: transcriptId, revision: latest.revision + 1, status: 'reviewed', text, segments });
      job.result = { ...job.result, model_corrections: job.result?.model_corrections ?? stored, corrections, reviewedTranscriptId: transcriptId, reviewed_by: session.id, reviewed_at: new Date().toISOString() };
      job.updated_at = new Date().toISOString();
    }, { sessionId: session.id });
    return jsonResponse({ transcriptId, saved: true });
  } catch (error) { return errorResponse(error); }
}
