"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';

type Connection = { configured: boolean; connected: boolean; accountLabel: string | null; connectedAt: string | null };
export function useKakaoConnection() {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = () => fetch('/api/integrations/kakao', { cache: 'no-store' }).then(async (response) => {
      const value = await response.json(); if (!response.ok) throw new Error(value.error ?? '카카오 연결 상태를 확인하지 못했습니다.');
      if (active) { setConnection(value); setError(''); }
    }).catch((error: Error) => { if (active) setError(error.message); });
    void load();
    const visible = () => { if (!document.hidden) void load(); };
    document.addEventListener('visibilitychange', visible);
    return () => { active = false; document.removeEventListener('visibilitychange', visible); };
  }, []);
  return { connection, error };
}
export function KakaoConnectionPanel() {
  const { connection, error } = useKakaoConnection();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get('kakao');
    if (result === 'connected') setFeedback('카카오 본인 계정을 연결했습니다.');
    else if (result) setFeedback(result === 'KAKAO_CONSENT_CANCELLED' ? '카카오 연결을 취소했습니다.' : result === 'KAKAO_SCOPE_REQUIRED' ? '카카오톡 메시지 전송 동의를 확인해 주세요.' : '카카오 연결을 완료하지 못했습니다. 다시 연결해 주세요.');
  }, []);
  async function change(disconnect = false) {
    setBusy(true); setFeedback('');
    try {
      const response = await fetch(disconnect ? '/api/integrations/kakao' : '/api/integrations/kakao/connect', { method: disconnect ? 'DELETE' : 'POST' });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? '카카오 연결을 처리하지 못했습니다.');
      if (disconnect) window.location.assign('/settings'); else window.location.assign(result.url);
    } catch (error) { setFeedback(error instanceof Error ? error.message : '카카오 연결을 확인해 주세요.'); setBusy(false); }
  }
  return <section style={{ borderTop: '1px solid var(--line)', marginTop: 28, paddingTop: 20 }} aria-label="카카오 연결">
    <h2 style={{ fontSize: 16 }}>카카오톡 나에게 보내기</h2>
    <p>{connection?.connected ? `연결됨 · ${connection.accountLabel}` : connection?.configured ? '본인 카카오 계정 연결이 필요해요.' : connection ? '서버의 카카오 앱 설정이 필요해요.' : '연결 상태 확인 중…'}</p>
    <p style={{ color: 'var(--muted)', fontSize: 13 }}>승인한 가상 환자 안내를 연결한 본인의 ‘나와의 채팅’에 보냅니다.</p>
    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" disabled={busy || !connection?.configured} onClick={() => change()} style={{ background: '#FEE500', color: '#191919', border: 0, borderRadius: 8, padding: '12px 20px', cursor: 'pointer' }}>{connection?.connected ? '카카오 계정 다시 연결' : '카카오로 연결'}</button>
      {connection?.connected && <><button type="button" disabled={busy} onClick={() => change(true)}>연결 해제</button><Link href="/clinic/care">승인 안내 보내기 →</Link></>}
    </div>
    {(feedback || error) && <p role="status">{feedback || error}</p>}
  </section>;
}
