// Every state message is parsed fresh, so nothing in it is === to what the window already has.
// Keeping the previous objects wherever the contents are unchanged lets memoized
// components skip the parts of the screen that did not change.

/** `next`, with every part that equals the matching part of `prev` replaced by `prev`'s object. */
export function reuse<T>(prev: unknown, next: T): T {
  if (prev === next) return next;
  if (typeof prev !== "object" || typeof next !== "object" || prev === null || next === null) return next;
  if (Array.isArray(prev) !== Array.isArray(next)) return next;

  if (Array.isArray(next)) {
    const old = prev as unknown[];
    const out = next.map((item, i) => reuse(old[i], item));
    const same = out.length === old.length && out.every((item, i) => item === old[i]);
    return (same ? old : out) as T;
  }

  const old = prev as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  let same = Object.keys(old).length === Object.keys(next).length;
  for (const [key, value] of Object.entries(next)) {
    out[key] = reuse(old[key], value);
    if (out[key] !== old[key] || !(key in old)) same = false;
  }
  return (same ? old : out) as T;
}
