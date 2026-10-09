import type { AppState,RuntimeAnnotation } from '@/lib/types';
/** An unreviewed extraction is eligible only when its successful job binds the current ink revision. */
export function isCurrentHandwritingDraft(state: AppState,annotation: RuntimeAnnotation) {
 return !annotation.extraction_reviewed && Boolean(annotation.extracted_text?.trim()) && state.jobs.some(job=>job.kind==='handwriting'&&job.visit_id===annotation.visit_id&&['waiting_review','completed'].includes(job.status)&&job.result?.annotationId===annotation.id&&job.result?.revision===annotation.revision&&job.result?.stale_input!==true&&job.result?.text===annotation.extracted_text);
}
