import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { requireSession, SESSION_COOKIE } from './auth';
import { AppError } from './errors';

export async function getPageSession() {
  const cookieStore = await cookies();
  const requestHeaders = await headers();
  const host = requestHeaders.get('host') || 'localhost:3000';
  const protocol = requestHeaders.get('x-forwarded-proto') || 'http';
  const request = new Request(`${protocol}://${host}`, { headers: { cookie: `${SESSION_COOKIE}=${cookieStore.get(SESSION_COOKIE)?.value || ''}` } });
  try { return await requireSession(request); }
  catch (error) { if (error instanceof AppError && error.status === 401) return null; throw error; }
}
export async function requirePageSession() {
  const session = await getPageSession();
  if (!session) redirect('/access');
  return session;
}
