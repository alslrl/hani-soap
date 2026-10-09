import { privacyCount } from '@/lib/privacy/summary';

export function TextPrivacyNotice({ audit }: { audit: unknown }) {
  const count = privacyCount(audit);
  if (count === null) return null;
  return <p style={{ color: 'var(--muted)', fontSize: 12, lineHeight: 1.7, margin: '8px 0' }} data-testid="text-privacy-notice">
    AI 전송용 텍스트에서 식별정보 {count}곳 가림 · 요청별 사본 합계 · 원음·이미지 제외
  </p>;
}
