import { responseReceipt } from '@/lib/server/kakao';
import ResponseView from './ResponseView';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export default async function CareResponsePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const receipt = await responseReceipt(token);
    return <ResponseView token={token} body={receipt.body} options={receipt.options} />;
  } catch {
    return <main style={{ maxWidth: 560, margin: '60px auto', padding: 24 }}><h1>안내 링크를 확인해 주세요</h1><p>링크가 만료되었거나 안내를 확인할 수 없습니다.</p></main>;
  }
}
