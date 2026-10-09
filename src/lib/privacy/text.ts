import { randomBytes } from 'node:crypto';
import type { AppState } from '@/lib/types';

export const TEXT_PRIVACY_VERSION = 'basic-identifiers-v2';
export const PRIVACY_PROMPT = '개인정보 보호 표식 [HANI_PII:...]은 추정하거나 풀어 쓰지 말고 원문 인용과 결과에 그대로 유지한다.';
export type PrivacyKind = 'patient_name' | 'guardian_name' | 'phone' | 'email' | 'resident_number' | 'person_name' | 'birth_date';
export type KnownIdentity = { value: string; kind: 'patient_name' | 'guardian_name' | 'person_name' };
export type PrivacySummary = { version: typeof TEXT_PRIVACY_VERSION; checked: boolean; redacted_count: number; categories: Partial<Record<PrivacyKind, number>>; scope: 'text_only' };

export function identitiesForVisit(state: AppState, visitId: string): KnownIdentity[] {
  const visit = state.visits.find((item) => item.id === visitId);
  const patient = state.patients.find((item) => item.id === visit?.patient_id);
  if (!patient) throw new Error('PRIVACY_PATIENT_CONTEXT_REQUIRED');
  return [
    { value: patient.display_name, kind: 'patient_name' as const },
    ...(process.env.HANI_PRIVACY_CLINICIAN_NAMES || '').split(',').filter(Boolean).map(value => ({ value: value.trim(), kind: 'person_name' as const })),
    ...(patient.guardian ? [{ value: patient.guardian.display_name, kind: 'guardian_name' as const }] : []),
  ];
}
const escaped = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const emailPattern = /(?<![\w.+-])[\w.!#$%&'*+/=?^`{|}~-]+@[a-z\d](?:[a-z\d-]*[a-z\d])?(?:\.[a-z\d](?:[a-z\d-]*[a-z\d])?)+(?![\w.-])/gi;
const phonePattern = /(?<!\d)(?:0(?:1[016789]|2|[3-6][1-5]|70)|\+82[ .-]*(?:1[016789]|2|[3-6][1-5]|70))[ .-]*\d{3,4}[ .-]*\d{4}(?!\d)/g;
const residentPattern = /(?<!\d)\d{6}[ -]?[1-8]\d{6}(?!\d)/g;
function plausibleResidentNumber(value: string) {
  const digits = value.replace(/\D/g, '');
  const century = ['1', '2', '5', '6'].includes(digits[6]) ? 1900 : 2000;
  const year = century + Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4)); const day = Number(digits.slice(4, 6));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Per-request map stays in server memory. Only summary() may be persisted. */
export class AiTextPrivacy {
  private readonly nonce = randomBytes(8).toString('hex');
  private readonly replacements = new Map<string, string>();
  private readonly reverse = new Map<string, string>();
  private readonly counts: Partial<Record<PrivacyKind, number>> = {};
  private checked = false;
  private readonly spokenNames = new Set<string>();
  private readonly birthDates = new Set<string>();
  private discover(data: unknown) {
    const strings: string[] = [];
    this.walk(data, value => { strings.push(value); return value; });
    for (const text of strings) {
      for (const pattern of [/(?:제\s*이름은|성함은)\s*([가-힣]{2,5})(?=입니다|이에요|예요|이라고)/gu, /(?:학생\s*의사|담당\s*의사|한의사|담당의)\s+([가-힣]{2,5})(?=입니다|이에요|예요)/gu, /\d{4}년\s*\d{1,2}월\s*\d{1,2}일[, ]+([가-힣]{2,5})(?=입니다|이에요|예요)/gu]) {
        for (const match of text.matchAll(pattern)) this.spokenNames.add(match[1]);
      }
      for (const match of text.matchAll(/(?:19|20)\d{2}(?:년\s*\d{1,2}월\s*\d{1,2}일|[-.]\d{1,2}[-.]\d{1,2})/gu)) {
        const before = text.slice(Math.max(0, match.index! - 100), match.index);
        const after = text.slice(match.index! + match[0].length, match.index! + match[0].length + 25);
        if (/생년월일|생일|태어|출생/.test(before) || /^[, ]+[가-힣]{2,5}(?:입니다|이에요|예요)/.test(after)) this.birthDates.add(match[0]);
      }
    }
  }
  constructor(private readonly identities: KnownIdentity[]) {}

  private redact(value: string) {
    type Match = { start: number; end: number; kind: PrivacyKind; priority: number };
    const matches: Match[] = [];
    const add = (pattern: RegExp, kind: PrivacyKind, priority: number, valid: (text: string) => boolean = () => true) => {
      for (const match of value.matchAll(pattern)) {
        if (valid(match[0])) matches.push({ start: match.index!, end: match.index! + match[0].length, kind, priority });
      }
    };
    add(emailPattern, 'email', 0);
    add(residentPattern, 'resident_number', 1, plausibleResidentNumber);
    add(phonePattern, 'phone', 2);
    for (const date of this.birthDates) add(new RegExp(escaped(date), 'g'), 'birth_date', 1);
    const seen = new Set<string>();
    for (const identity of [...this.identities, ...[...this.spokenNames].map(value => ({ value, kind: 'person_name' as const }))]) {
      const name = identity.value.trim();
      if (name.length < 2 || seen.has(name)) continue;
      seen.add(name);
      // Two-character names can be ordinary clinical words; require an honorific.
      const honorific = '(?:님|씨)(?=$|[^\\p{L}\\p{N}]|(?:에게|한테|께서|께|은|는|이|가|을|를|의|과|와|도|만))';
      const suffix = identity.kind !== 'person_name' && [...name.replace(/\s/g, '')].length <= 2
        ? `(?=${honorific})`
        : `(?=$|[^\\p{L}\\p{N}]|${honorific}|(?:입니다|이에요|예요|이라고|이란|이라는|은|는|이|가|을|를|의|에게|한테|께서|께|과|와|으로|로|이랑|랑)(?=$|[^\\p{L}\\p{N}]|[은는이가께]))`;
      const spelling = /^[가-힣]{3,}$/.test(name) ? [...name].map(escaped).join('[ \\t]*') : escaped(name);
      add(new RegExp(`(?<![\\p{L}\\p{N}])${spelling}${suffix}`, 'gu'), identity.kind, 3);
    }
    // Prefer the complete email/ID rather than overlapping partial matches.
    const selected: Match[] = [];
    for (const match of matches.sort((a, b) => a.priority - b.priority || b.end - b.start - (a.end - a.start))) {
      if (!selected.some((other) => match.start < other.end && match.end > other.start)) selected.push(match);
    }
    let result = ''; let cursor = 0;
    for (const match of selected.sort((a, b) => a.start - b.start)) {
      const original = value.slice(match.start, match.end);
      const key = `${match.kind}:${original}`;
      let token = this.replacements.get(key);
      if (!token) {
        token = `[HANI_PII:${this.nonce}:${match.kind}:${this.replacements.size + 1}]`;
        this.replacements.set(key, token); this.reverse.set(token, original);
      }
      this.counts[match.kind] = (this.counts[match.kind] ?? 0) + 1;
      result += value.slice(cursor, match.start) + token; cursor = match.end;
    }
    return result + value.slice(cursor);
  }
  mask<T>(data: T): T {
    this.checked = true;
    this.discover(data);
    return this.walk(data, (value) => this.redact(value));
  }
  restore<T>(data: T): T {
    return this.walk(data, (value) => value.replace(/\[HANI_PII:[^\]\r\n]+\]/g, (token) => {
      const original = this.reverse.get(token);
      if (original === undefined) throw new Error('PRIVACY_UNKNOWN_MARKER');
      return original;
    }));
  }
  private walk<T>(data: T, transform: (value: string) => string): T {
    if (typeof data === 'string') return transform(data) as T;
    if (Array.isArray(data)) return data.map((value) => this.walk(value, transform)) as T;
    if (data && typeof data === 'object') return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, this.walk(value, transform)])) as T;
    return data;
  }
  toJSON() { return this.summary(); }
  summary(): PrivacySummary {
    return { version: TEXT_PRIVACY_VERSION, checked: this.checked, redacted_count: Object.values(this.counts).reduce((sum, count) => sum + count, 0), categories: { ...this.counts }, scope: 'text_only' };
  }
}

export function privacyAudit(previous: unknown, stage: string, privacy: AiTextPrivacy) {
  return { ...(previous && typeof previous === 'object' && !Array.isArray(previous) ? previous : {}), [stage]: privacy.summary() };
}
