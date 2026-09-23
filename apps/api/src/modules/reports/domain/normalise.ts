export function normalise(description: string): string {
  const trimmed = description.trim();
  const key = trimmed
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*\d+$/, '')
    .trim();
  return key === '' ? trimmed : key;
}
