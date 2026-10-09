import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { CorrectionSpan, DictionaryTerm } from './correction';
import { phoneticDistance, phoneticGrams } from './phonetics';
import { CLINICAL_TERMS } from './clinical-terms';

export const DICTIONARY_RETRIEVAL_VERSION = 'phonetic-context-v2';

type ProvenanceRow = Record<string, string | number | undefined>;
let cached: Promise<DictionaryTerm[]> | undefined;
const normalize = (value: string) => value.replace(/\s+/g, '').normalize('NFC');
const stableId = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 20);

export function loadDictionary(): Promise<DictionaryTerm[]> {
  cached ??= (async () => {
    const groups = await Promise.all([
      readFile(path.join(process.cwd(), 'data/변증명_출처기록.json'), 'utf8').then((value) => ({ kind: 'pattern' as const, rows: JSON.parse(value).기록 as ProvenanceRow[] })),
      readFile(path.join(process.cwd(), 'data/처방명_출처기록.json'), 'utf8').then((value) => ({ kind: 'prescription' as const, rows: JSON.parse(value).기록 as ProvenanceRow[] })),
    ]);
    const terms = new Map<string, DictionaryTerm>();
    for (const group of groups) for (const row of group.rows) {
      const term = String(row.변증명 || row.처방명 || '');
      if (!term) continue;
      const key = `${group.kind}:${term}`;
      const id = stableId(key);
      const sourceId = stableId(JSON.stringify(row));
      const source = {
        id: sourceId,
        title: row.자료번호 ? `${row.자료원} ${row.자료번호}` : `${row.출처종류 || '원본'} ${String(row.파일 || row.출처URL || '').split('/').at(-1) || ''}${row.페이지 ? ` p.${row.페이지}` : ''}`,
        original: String(row.원문 || row.원문처방명 || term),
        ...(row.출처URL ? { url: String(row.출처URL) } : {}),
      };
      const existing = terms.get(key);
      if (existing) {
        existing.source_ids.push(sourceId);
        existing.sources.push(source);
        if (!existing.hanja && row.한자) existing.hanja = String(row.한자);
      } else terms.set(key, { id, term, hanja: row.한자 ? String(row.한자) : /[\u3400-\u9fff]/.test(String(row.원문 || '')) ? String(row.원문) : null, kind: group.kind, source_ids: [sourceId], sources: [source] });
    }
    for (const term of terms.values()) {
      // Spoken pattern names often omit the final 證. Keep the canonical source intact.
      if (term.kind === 'pattern' && term.term.endsWith('증') && term.term.length >= 4) term.aliases = [term.term.slice(0, -1)];
    }
    for (const entry of CLINICAL_TERMS) {
      const id = stableId(`clinical:${entry.term}`), sourceId = stableId(`${entry.source}:${entry.quote}`);
      terms.set(`clinical:${entry.term}`, { id, term: entry.term, hanja: entry.hanja, kind: 'clinical', source_ids: [sourceId], sources: [{ id: sourceId, title: entry.source, original: entry.quote }] });
    }
    return [...terms.values()];
  })();
  return cached;
}

export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const above = prev[j + 1];
      prev[j + 1] = Math.min(prev[j + 1] + 1, prev[j] + 1, diagonal + (a[i] === b[j] ? 0 : 1));
      diagonal = above;
    }
  }
  return prev[b.length];
}

type Entry = { term: DictionaryTerm; form: string; normalized: string };
type SearchIndex = { entries: Entry[]; known: Set<string>; grams: Map<string, number[]> };
const indexes = new WeakMap<DictionaryTerm[], SearchIndex>();
function searchIndex(terms: DictionaryTerm[]): SearchIndex {
  const cachedIndex = indexes.get(terms);
  if (cachedIndex) return cachedIndex;
  const entries = terms.flatMap(term => [term.term, ...(term.aliases ?? (term.kind === 'pattern' && term.term.endsWith('증') && term.term.length >= 4 ? [term.term.slice(0, -1)] : []))].map(form => ({ term, form, normalized: normalize(form) })));
  const grams = new Map<string, number[]>();
  entries.forEach((entry, index) => {
    for (const gram of phoneticGrams(entry.normalized)) {
      const bucket = grams.get(gram) ?? []; bucket.push(index); grams.set(gram, bucket);
    }
  });
  const result = { entries, grams, known: new Set(entries.map(entry => entry.normalized)) };
  indexes.set(terms, result); return result;
}

const particles = /(?:이라고는|이라며|이라는|이라고|이라면|입니다|이에요|이네요|에서부터|으로부터|으로는|에서는|에게는|라고는|라고|로는|으로|에서|에게|처럼|보다|까지|부터|은|는|을|를|이|가|에|의|로|도|만)$/;
const stopWords = new Set(['처방', '한약', '치료', '진료', '문진', '현재', '상태', '환자', '보호자', '한의학적', '한의학적으로', '말씀', '정도', '표현', '필요', '가능', '합니다', '하겠습니다']);
const grammaticalEnding = /(?:시고(?:요)?|주세요|주시면|십니다|하겠습니다|했어요|해요|셨나요|실까요|으세요|하세요|나요|인가요)$/;
const quantityWord = /^(?:한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)(?:번|회|주|달|개월|분|시|점|일)$/;
function queryStem(value: string, known: Set<string>): string {
  if (known.has(normalize(value))) return value;
  let stem = value;
  for (let attempt = 0; attempt < 2; attempt++) {
    const next = stem.replace(particles, '');
    if (next === stem || !next) break;
    stem = next;
    if (known.has(normalize(stem))) break;
  }
  return stem;
}
function contextKind(text: string, start: number, end: number, query: string): DictionaryTerm['kind'] | undefined {
  if (query.length >= 4 && /(?:탕|환|산|음)$/.test(query)) return 'prescription';
  const before = text.slice(Math.max(0, start - 55), start).split(/[.!?\n]/).at(-1)!;
  const cues = [...before.matchAll(/한의학적으로|한의학적|변증명|변증|증형|처방명|처방|한약/g)];
  const cue = cues.at(-1)?.[0];
  if (cue) return /한약|처방/.test(cue) ? 'prescription' : 'pattern';
  const around = text.slice(Math.max(0, start - 28), Math.min(text.length, end + 28));
  if (/진맥|맥진|짚어|빠르고.{0,8}미끄러|진찰|인대|발목|염좌|검사|촉진|눌러|[1-3]도\s|손상.{0,8}단계/.test(around)) return 'clinical';
  return undefined;
}
function rankedTerms(query: string, index: SearchIndex, hint?: DictionaryTerm['kind']) {
  const matches = new Map<number, number>();
  for (const gram of phoneticGrams(query)) for (const entryId of index.grams.get(gram) ?? []) {
    const entry = index.entries[entryId];
    if (query.length === 1 && entry.normalized.length !== 1) continue;
    if (hint && entry.term.kind !== hint) continue;
    if (Math.abs(entry.normalized.length - query.length) > 1) continue;
    matches.set(entryId, (matches.get(entryId) ?? 0) + 1);
  }
  const shortlist = [...matches].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 160);
  const ranked = shortlist.flatMap(([id]) => {
    const entry = index.entries[id];
    // Never expand a correctly spoken partial disease/body name into a diagnosis.
    if (entry.normalized.length > query.length && entry.normalized.startsWith(query)) return [];
    if (['염', '암', '증후군'].some(suffix => entry.normalized.endsWith(suffix) && entry.normalized.slice(0, -suffix.length) === query)) return [];
    const length = Math.max(query.length, entry.normalized.length);
    const score = 1 - phoneticDistance(query, entry.normalized) / length;
    const threshold = query.length === 1 ? 0.4 : query.length === 2 ? 0.9 : hint ? 0.72 : query.length >= 4 ? 0.9 : 0.94;
    const distance = editDistance(query, entry.normalized);
    if (score < threshold && !(query.length >= 4 && distance <= 1)) return [];
    return [{ entry, score, distance }];
  }).sort((a, b) => b.score - a.score || a.distance - b.distance || a.entry.term.term.localeCompare(b.entry.term.term));
  const ids = new Set<string>();
  return ranked.filter(item => { if (ids.has(item.entry.term.id)) return false; ids.add(item.entry.term.id); return true; }).slice(0, 5);
}

/** Indexed, bounded retrieval. Every suggestion still requires LLM and clinician review. */
export function retrieveCorrectionSpans(text: string, terms: DictionaryTerm[], limit = 24): CorrectionSpan[] {
  if (!Number.isSafeInteger(limit) || limit <= 0) return [];
  limit = Math.min(limit, 24);
  const index = searchIndex(terms);
  const words = [...text.matchAll(/[가-힣]+/g)];
  const proposals: { span: CorrectionSpan; score: number }[] = [];
  for (let i = 0; i < words.length; i++) for (let width = 1; width <= 3 && i + width <= words.length; width++) {
    const first = words[i], last = words[i + width - 1];
    if (grammaticalEnding.test(last[0]) || words.slice(i, i + width).some(word => quantityWord.test(word[0]))) continue;
    // Do not absorb an already correct drug/pattern name into a longer, different name.
    if (width > 1 && words.slice(i, i + width).some(word => index.known.has(normalize(queryStem(word[0], index.known))))) continue;
    const start = first.index!, stem = queryStem(last[0], index.known);
    const end = last.index! + stem.length;
    const original = text.slice(start, end);
    // Join only adjacent words. Do not cross numbers, punctuation or speaker lines.
    if (width > 1 && words.slice(i, i + width - 1).some((word, offset) => !/^ {1,2}$/.test(text.slice(word.index! + word[0].length, words[i + offset + 1].index!)))) continue;
    const query = normalize(original);
    if (!query || query.length > 18 || index.known.has(query) || stopWords.has(query)) continue;
    const hint = contextKind(text, start, end, query);
    if (query.length < 3 && hint !== 'clinical') continue;
    if (query.length === 1 && !/진맥|맥진|짚어|빠르고.{0,8}미끄러|약하게.{0,6}뛰/.test(text.slice(Math.max(0, start - 28), Math.min(text.length, end + 28)))) continue;
    const ranked = rankedTerms(query, index, hint);
    if (!ranked.length) continue;
    const candidates = ranked.map(({ entry }) => ({ ...entry.term, aliases: entry.term.aliases ?? (entry.form !== entry.term.term ? [entry.form] : []), matched_form: entry.form, sources: entry.term.sources.slice(0, 3) }));
    proposals.push({ span: { id: `span-${start}-${end}`, start, end, original, candidates }, score: ranked[0].score + (hint ? 0.03 : 0) });
  }
  const selected: typeof proposals = [];
  for (const proposal of proposals.sort((a, b) => b.score - a.score || a.span.start - b.span.start || a.span.original.length - b.span.original.length)) {
    if (selected.some(item => proposal.span.start < item.span.end && proposal.span.end > item.span.start)) continue;
    selected.push(proposal);
    if (selected.length >= limit) break;
  }
  return selected.sort((a, b) => a.span.start - b.span.start).map(item => item.span);
}
