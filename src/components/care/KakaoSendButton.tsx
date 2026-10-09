"use client";
import { useState } from 'react';
import Link from 'next/link';
import type { CareMessage } from '@/lib/types';
import { kakaoPreview } from '@/lib/kakao';
import { useKakaoConnection } from './KakaoConnectionPanel';

export function KakaoSendButton({ message, busy, onBusyChange, onComplete }: { message: CareMessage; busy: boolean; onBusyChange: (value: boolean) => void; onComplete: () => Promise<unknown> }) {
  const { connection, error } = useKakaoConnection();
  const [feedback, setFeedback] = useState('');
  const [pending, setPending] = useState(false);
  const blocked = message.status === 'unknown' || message.status === 'sent';
  async function send() {
    onBusyChange(true); setPending(true); setFeedback('');
    try {
      const response = await fetch(`/api/care-messages/${message.id}/send-self`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approvedBody: message.approved_body, retry: message.status === 'failed' }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? '카카오 전송을 처리하지 못했습니다.');
      setFeedback(result.status === 'sent' ? '카카오가 전송 성공을 확인했습니다. 본인의 나와의 채팅에서 확인해 주세요.' : result.status === 'failed' ? '카카오가 전송을 거절했습니다. 연결과 설정을 확인한 뒤 다시 보낼 수 있습니다.' : result.status === 'pending' ? '발송을 처리 중입니다. 중복으로 보내지 않았습니다.' : '전송 결과를 확인할 수 없습니다. 자동으로 다시 보내지 않습니다. 나와의 채팅을 확인해 주세요.');
      await onComplete();
    } catch (error) { setFeedback(error instanceof Error ? error.message : '카카오 전송을 확인해 주세요.'); }
    finally { onBusyChange(false); setPending(false); }
  }
  return <section style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--line)' }} aria-label="카카오 본인 발송">
    <strong>카카오톡 본인 발송</strong>
    <p style={{ fontSize: 12, color: 'var(--muted)' }}>{connection?.connected ? connection.accountLabel : '설정에서 본인 카카오 계정을 연결해 주세요.'} · 가상 환자 데모</p>
    <details><summary>카카오톡 전송 미리보기</summary><p style={{ whiteSpace: 'pre-wrap' }}>{kakaoPreview(message.approved_body ?? '')}</p><small>긴 안내는 200자 미리보기로 보내고, 링크에서 승인 문안 전체를 보여줍니다.</small></details>
    {!blocked && <button type="button" disabled={busy || pending || !connection?.connected} onClick={send} style={{ background: '#FEE500', color: '#191919', border: 0, borderRadius: 8, padding: '12px 16px', marginTop: 12 }}>{pending ? '카카오 전송 중…' : message.status === 'failed' ? '카카오 본인 발송 다시 시도' : '승인 문안 나에게 보내기'}</button>}
    {!connection?.connected && <p><Link href="/settings">카카오 연결 설정 →</Link></p>}
    {message.status === 'unknown' && <p role="status">전송 결과 확인 필요 · 자동 재발송하지 않습니다.</p>}
    {message.status === 'sent' && <p>카카오 본인 발송 완료</p>}
    {(feedback || error) && <p role="status">{feedback || error}</p>}
  </section>;
}
