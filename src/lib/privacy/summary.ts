export function privacyCount(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const entries = Object.values(value).filter((item) => item && typeof item === 'object' && ['basic-identifiers-v1', 'basic-identifiers-v2'].includes(item.version) && item.checked === true && Number.isSafeInteger(item.redacted_count) && item.redacted_count >= 0);
  return entries.length ? entries.reduce((sum, item) => sum + item.redacted_count, 0) : null;
}
