import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import patterns from '../../../data/변증명_출처기록.json';

// These checks enforce the selected publication boundary, not legal clearance.
describe('public dictionary source selection', () => {
  it('keeps only the recorded KTKP pattern subset, without private-PDF paths', () => {
    expect(patterns.기록).toHaveLength(624);
    expect(new Set(patterns.기록.map(row => row.변증명)).size).toBe(573);
    expect(patterns.기록.every(row => row.자료원 === 'KTKP 용어사전(의방성도 공개 스냅샷)')).toBe(true);
    expect(JSON.stringify(patterns.기록)).not.toMatch(/\/Users\/|NCKM|\.pdf/i);
  });
  it('reproduces both public name lists from the retained provenance rows', () => {
    const expected = [...new Set(patterns.기록.map(row => row.변증명))].sort().join('\n') + '\n';
    for (const name of ['변증명_통합.txt', '변증명_온라인.txt']) {
      expect(readFileSync(new URL(`../../../data/${name}`, import.meta.url), 'utf8')).toBe(expected);
    }
  });
});
