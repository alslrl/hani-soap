import { assertSameOrigin, requireSession } from '@/lib/server/auth';
import { mutateState, publicEnvelope } from '@/lib/server/store';
import { errorResponse, jsonResponse, readBody } from '@/lib/server/http';
import { invariant } from '@/lib/server/errors';
import type { ActionRequest } from '@/lib/types';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const session = await requireSession(request); const action = await readBody(request);
    invariant(action.expectedVersion === undefined || typeof action.expectedVersion === 'number' && Number.isSafeInteger(action.expectedVersion), '버전 형식을 확인해 주세요.');
    return jsonResponse(publicEnvelope(await mutateState(action as ActionRequest, { sessionId: session.id })));
  } catch (error) { return errorResponse(error); }
}
