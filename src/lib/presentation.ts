/** Remove fixture headings from presentation without changing stored records. */
export function displayRecordText(text: string): string {
  return text
    .replace(/^\[가상 안내\s*·\s*모의 발송\]\s*/u, '')
    .replace(/^합성 과거 (?:이력:\s*|방문[.:]\s*)/u, '')
    .replace(/^(?:모의 응답|카카오 본인 발송 데모 응답):\s*/u, '');
}
