/** Word-level edit distance: each insertion, deletion or substitution counts once. */
export function wordsChanged(draft: string, edited: string): number {
  const a = draft.trim().split(/\s+/).filter(Boolean);
  const b = edited.trim().split(/\s+/).filter(Boolean);
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) next[j] = Math.min((next[j - 1] ?? 0) + 1, (row[j] ?? 0) + 1, (row[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length] ?? 0;
}

export function privateText(text: string): string {
  return text
    .replace(/^.*\b(?:address|account\s*(?:no|number)|mobile\s*(?:no|number)|phone\s*(?:no|number))\b.*$/gim, '[Personal details removed]')
    .replace(/(?:\+?\d[\d ()-]{5,}\d)/g, (value) => value.replace(/\D/g, '').length >= 7 ? '[Personal details removed]' : value);
}
