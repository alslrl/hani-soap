"use client";
import { useEffect, useState } from 'react';
import type { CareResponse } from '@/lib/types';
import { KAKAO_RESPONSE_LABELS } from '@/lib/kakao';
export default function ResponseView({ token, body, options }: { token: string; body: string; options: CareResponse['option'][] }) {
  const [option, setOption] = useState<CareResponse['option'] | ''>('');
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  useEffect(() => { const value = new URLSearchParams(window.location.search).get('option'); if (options.includes(value as CareResponse['option'])) setOption(value as CareResponse['option']); }, [options]);
  async function submit() {
    setBusy(true); setFeedback('');
    try {
      const result = await fetch(`/api/care/responses/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ option, detail: option === 'discomfort' ? detail || null : null }) });
      const value = await result.json(); if (!result.ok) throw new Error(value.error ?? '응답을 저장하지 못했습니다.');
      setFeedback('응답을 전달했습니다. 진료실 화면에서 확인할 수 있습니다.');
    } catch (error) { setFeedback(error instanceof Error ? error.message : '응답을 저장하지 못했습니다.'); }
    finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 560, margin: '40px auto', padding: '24px 20px' }}>
    <p style={{ color: 'var(--accent)' }}>HaniSOAP · 카카오 본인 발송 데모</p><h1 style={{ fontSize: 24 }}>진료 후 안내</h1>
    <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, margin: '28px 0' }}>{body}</p>
    <fieldset style={{ border: '1px solid var(--line)', padding: 20, borderRadius: 12 }}><legend>현재 상태를 선택해 주세요</legend>
      {options.map((value) => <label key={value} style={{ display: 'block', padding: '12px 0' }}><input type="radio" name="option" value={value} checked={option === value} onChange={() => setOption(value)} /> {KAKAO_RESPONSE_LABELS[value]}</label>)}
      {option === 'discomfort' && <label>불편한 점 <select aria-label="불편한 점" value={detail} onChange={(event) => setDetail(event.target.value)} style={{ display: 'block', width: '100%', marginTop: 8, padding: 12 }}><option value="">상세 선택은 선택사항이에요</option><option value="stomach_discomfort">속이 불편해요</option><option value="difficulty_taking">약 챙기기가 어려워요</option><option value="other">기타</option></select></label>}
    </fieldset>
    <button type="button" disabled={!option || busy} onClick={submit} style={{ background: 'var(--accent)', color: 'white', border: 0, borderRadius: 10, width: '100%', padding: 16, marginTop: 20 }}>{busy ? '전달 중…' : '응답 전달'}</button>
    {feedback && <p role="status">{feedback}</p>}
    <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 28 }}>가상 환자 안내에 본인이 응답하는 시연입니다.</p>
  </main>;
}
