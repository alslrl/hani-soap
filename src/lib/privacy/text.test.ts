import { describe, expect, it } from 'vitest';
import { AiTextPrivacy } from './text';
import { privacyCount } from './summary';
const identities = [{ value: '김서연', kind: 'patient_name' as const }, { value: '이윤정', kind: 'guardian_name' as const }];

describe('bounded text identifiers', () => {
  it('masks honorific recipient particles and restores exact case endings', () => {
    const privacy = new AiTextPrivacy([...identities, { value: '이상', kind: 'patient_name' }]);
    for (const raw of ['김서연님에게 설명합니다.', '김서연님한테 알려 주세요.', '김서연님께서도 답했습니다.', '김서연님의 기록.', '이상님에게 안내합니다.']) {
      const masked = privacy.mask(raw);
      expect(masked).not.toContain(raw.startsWith('이상') ? '이상' : '김서연');
      expect(privacy.restore(masked)).toBe(raw);
    }
    expect(privacy.mask('검사 이상 없음')).toBe('검사 이상 없음');
  });
  it('masks known names and formatted identifiers while preserving clinical values and exact originals', () => {
    const privacy = new AiTextPrivacy(identities);
    const original = '김서연님, 보호자 이윤정입니다. 연락처 010-1234-5678, +82 10 9876 5432, a.test+visit@example.com, 900101-1234567. 우측 45cm, 좌측 43cm, NRS 8, 하루 3회 식후 30분, 2주 뒤 내원. 2026-10-09 방문, 25세.';
    const masked = privacy.mask(original);
    for (const value of ['김서연', '이윤정', '010-1234-5678', '+82 10 9876 5432', 'a.test+visit@example.com', '900101-1234567']) expect(masked).not.toContain(value);
    for (const value of ['우측 45cm', '좌측 43cm', 'NRS 8', '하루 3회 식후 30분', '2주 뒤', '2026-10-09', '25세']) expect(masked).toContain(value);
    expect(privacy.restore(masked)).toBe(original);
    expect(privacy.summary().redacted_count).toBe(6);
    expect(JSON.stringify(privacy)).not.toContain('김서연');
  });
  it('uses a shared reversible mapping across segments and quotes without changing IDs or numeric fields', () => {
    const privacy = new AiTextPrivacy(identities);
    const original = { id: 'd8cc8359-d388-5eb2-9797-72834e7f1286', text: '김 서연님은 01012345678로 연락해 주세요.', evidence: ['김 서연님은 01012345678로 연락해 주세요.'], start_ms: 1200, end_ms: 2400 };
    const masked = privacy.mask(original);
    expect(masked.text).toBe(masked.evidence[0]); expect(masked.id).toBe(original.id);
    expect(masked.start_ms).toBe(1200); expect(privacy.restore(masked)).toEqual(original);
    expect(original.text).toContain('김 서연');
    expect(privacyCount({ soap: privacy.summary() })).toBe(4);
  });
  it('avoids replacing short clinical words and malformed resident-number shapes', () => {
    const privacy = new AiTextPrivacy([{ value: '이상', kind: 'patient_name' }]);
    expect(privacy.mask('검사 이상 없음. 999999-1234567. 통증 8점.')).toBe('검사 이상 없음. 999999-1234567. 통증 8점.');
    expect(privacy.mask('이상님은 통증 8점입니다.')).not.toContain('이상님');
  });
  it('handles overlapping email, name and digit matches only once and rejects invented markers', () => {
    const privacy = new AiTextPrivacy([{ value: 'patient', kind: 'patient_name' }]);
    const raw = 'patient01012345678@example.com';
    const masked = privacy.mask(raw);
    expect(privacy.summary().redacted_count).toBe(1); expect(privacy.restore(masked)).toBe(raw);
    expect(() => privacy.restore('[HANI_PII:invented:phone:1]')).toThrow('PRIVACY_UNKNOWN_MARKER');
    expect(privacyCount({ old: { version: 'none', checked: true, redacted_count: 9 } })).toBeNull();
  });
});
