import { randomUUID } from 'node:crypto';
import { requireSession, assertSameOrigin } from '@/lib/server/auth';
import { AppError } from '@/lib/server/errors';
import { readBody, errorResponse, jsonResponse } from '@/lib/server/http';
import { updateState } from '@/lib/server/store';
import { applyAcceptedCorrections, type ValidatedCorrection } from '@/lib/ai/correction';
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
      if (expectedTranscriptRevision !== undefined && latest.revision !== expectedTranscriptRevision) throw new AppError(409, 'TRANSCRIPT_VERSION_CONFLICT', '새 전사 버전이 있습니다. 최신 내용을 확인해 주세요.');
      const stored = (job.result?.corrections || []) as ValidatedCorrection[];
      const submitted = Array.isArray(decisions) ? decisions as { span_id: string; status: string }[] : [];
      if (submitted.some((item) => !stored.some((candidate) => candidate.span_id === item.span_id) || !['accepted', 'rejected'].includes(item.status))) throw new AppError(400, 'INVALID_REVIEW', '교정 검토 항목을 확인해 주세요.');
      const corrections = stored.map((item) => ({ ...item, review_status: (submitted.find((decision) => decision.span_id === item.span_id)?.status ?? 'rejected') as ValidatedCorrection['review_status'] }));
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
      job.result = { ...job.result, corrections, reviewedTranscriptId: transcriptId, reviewed_by: session.id, reviewed_at: new Date().toISOString() };
      job.updated_at = new Date().toISOString();
    }, { sessionId: session.id });
    return jsonResponse({ transcriptId, saved: true });
  } catch (error) { return errorResponse(error); }
}
