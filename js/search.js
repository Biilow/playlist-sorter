const fold = (text) => text.normalize('NFD').replace(/\p{Mark}/gu, '').toLowerCase();

// Ignores case and accents. Every word typed has to appear in one of the fields.
export function matchesSearch(query, ...fields) {
  const searched = fold(fields.join(' '));
  return fold(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => searched.includes(word));
}
