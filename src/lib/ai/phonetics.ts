// A retrieval score, not a pronunciation or clinical-equivalence assertion.
// Hangul syllables are compared by onset, vowel and coda rather than as opaque characters.
const ONSETS = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'];
const VOWELS = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'];
const CODAS = [...' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'];
const onsetGroups = ['ㄱㄲㅋ', 'ㄷㄸㅌ', 'ㅂㅃㅍ', 'ㅈㅉㅊ', 'ㅅㅆ', 'ㄴㄹ', 'ㅇㅎ'];
const vowelGroups = ['ㅐㅔㅒㅖ', 'ㅓㅕ', 'ㅗㅛ', 'ㅜㅠㅡ', 'ㅣㅟㅢ', 'ㅏㅑㅘ', 'ㅙㅚㅞ'];
const codaGroups = ['ㄱㄲㅋㄳㄺ', 'ㄷㅅㅆㅈㅊㅌㅎ', 'ㅂㅍㅄㄿ', 'ㄴㄵㄶ', 'ㄹㄼㄽㄾㅀ', 'ㅁㄻ'];

function syllable(char: string): [string, string, string] | null {
  const code = char.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return null;
  return [ONSETS[Math.floor(code / 588)], VOWELS[Math.floor(code % 588 / 28)], CODAS[code % 28]];
}
function componentCost(a: string, b: string, groups: string[]) {
  return a === b ? 0 : groups.some(group => group.includes(a) && group.includes(b)) ? 0.25 : 1;
}
function substitution(a: string, b: string) {
  if (a === b) return 0;
  const left = syllable(a), right = syllable(b);
  if (!left || !right) return 1;
  return 0.5 * componentCost(left[0], right[0], onsetGroups)
    + 0.35 * componentCost(left[1], right[1], vowelGroups)
    + 0.15 * componentCost(left[2], right[2], codaGroups);
}
export function phoneticDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index * 0.9);
  for (let i = 0; i < a.length; i++) {
    let diagonal = previous[0];
    previous[0] = (i + 1) * 0.9;
    for (let j = 0; j < b.length; j++) {
      const above = previous[j + 1];
      previous[j + 1] = Math.min(above + 0.9, previous[j] + 0.9, diagonal + substitution(a[i], b[j]));
      diagonal = above;
    }
  }
  return previous[b.length];
}

function folded(value: string, groups: string[]) {
  return groups.find(group => group.includes(value))?.[0] ?? value;
}
/** Phoneme bigrams only shortlist candidates; the weighted distance ranks them. */
export function phoneticGrams(text: string): Set<string> {
  const key = [...text].map(char => {
    const parts = syllable(char);
    return parts ? folded(parts[0], onsetGroups) + folded(parts[1], vowelGroups) + (parts[2] === ' ' ? '' : folded(parts[2], codaGroups)) : char;
  }).join('');
  return new Set(Array.from({ length: Math.max(0, key.length - 1) }, (_, i) => key.slice(i, i + 2)));
}
