import { requireSession } from '@/lib/server/auth';
import { AppError } from '@/lib/server/errors';
import { readState } from '@/lib/server/store';
import { jsonResponse, errorResponse } from '@/lib/server/http';

export async function GET(request: Request) {
  try {
    await requireSession(request);
    const visitId = new URL(request.url).searchParams.get('visitId');
    const { state } = await readState();
    const visit = state.visits.find((item) => item.id === visitId);
    if (!visit) throw new AppError(404, 'VISIT_NOT_FOUND', '방문을 찾을 수 없습니다.');
    const first = state.visits.filter((item) => item.patient_id === visit.patient_id).sort((a, b) => a.visit_no - b.visit_no)[0];
    const soap = state.soap_documents.find((item) => item.visit_id === first.id && item.origin === 'provided_case');
    return jsonResponse({ mode: 'reference_preview', readOnly: true, label: '초진 사례 검수 자료 · 현재 방문과 별도', sourceVisitId: first.id, sections: soap?.sections ?? null, source_refs: soap?.source_refs ?? [], notice: '의료진이 검수한 과거 비교 자료입니다. 음성 전사나 AI 실행 결과가 아니며 현재 진료기록에 저장하지 않습니다.' });
  } catch (error) { return errorResponse(error); }
}
