/** Subsequence match; earlier, tighter and word-start matches score higher. */
export function fuzzyScore(query: string, text: string): number | undefined {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let score = 0;
  let ti = 0;
  let last = -1;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return undefined;
    score += found === last + 1 ? 3 : 0;
    score += found === 0 || /[\s.:›_-]/.test(t[found - 1]) ? 2 : 0;
    score -= Math.min(found - ti, 5) * 0.1;
    last = found;
    ti = found + 1;
  }
  return score;
}
