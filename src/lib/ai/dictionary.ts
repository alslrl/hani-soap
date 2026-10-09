import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { CorrectionSpan, DictionaryTerm } from './correction';

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

/** Retrieves candidates locally. It does not assert clinical equivalence. */
export function retrieveCorrectionSpans(text: string, terms: DictionaryTerm[], limit = 24): CorrectionSpan[] {
  const result: CorrectionSpan[] = [];
  const known = new Set(terms.map((item) => normalize(item.term)));
  const suffixes = /(탕|환|산|음|증|허|실|열|한|풍|습|기허|방광염)$/;
  for (const match of text.matchAll(/[가-힣]{2,15}/g)) {
    const original = match[0];
    const stem = original.replace(/(?:을|를|으로|로|이라고|입니다|이라는|은|는|에|이|가|하고|합니다|할게요)$/, '');
    if (stem.length < 3 || known.has(stem) || !suffixes.test(stem)) continue;
    const ranked = terms.filter((term) => Math.abs(normalize(term.term).length - stem.length) <= 1).map((term) => ({ term, distance: editDistance(stem, normalize(term.term)) })).filter((item) => item.distance <= (stem.length >= 6 ? 2 : 1)).sort((a, b) => a.distance - b.distance || a.term.term.localeCompare(b.term.term));
    if (!ranked.length) continue;
    const start = match.index!;
    result.push({ id: `span-${start}-${start + stem.length}`, start, end: start + stem.length, original: text.slice(start, start + stem.length), candidates: ranked.slice(0, 5).map((item) => ({ ...item.term, sources: item.term.sources.slice(0, 3) })) });
    if (result.length >= limit) break;
  }
  return result;
}
