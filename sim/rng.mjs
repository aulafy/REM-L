// Generador pseudoaleatorio con semilla (mulberry32): mismos datos para la misma semilla.
export function rng(seed = 1) {
  let a = (seed >>> 0) || 1;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  const pick = (arr) => arr[Math.floor(next() * arr.length)];
  const chance = (p) => next() < p;
  const weighted = (pairs) => { let r = next() * pairs.reduce((s, [, w]) => s + w, 0); for (const [v, w] of pairs) { if ((r -= w) < 0) return v; } return pairs[pairs.length - 1][0]; };
  return { next, int, pick, chance, weighted };
}
