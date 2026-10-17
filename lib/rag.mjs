// RAG mínimo del negocio: trozos de texto + BM25 (siempre) y embeddings locales (opcional) fusionados.
const STOP = new Set('de la que el en y a los del se las por un para con no una su al lo como mas pero sus le ya o este si porque esta entre cuando muy sin sobre tambien me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mi antes algunos que unos yo otro otras otra el tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros es son te tu tus ti'.split(' '));
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
export const tokens = (s) => norm(s).split(/[^a-z0-9ñ€]+/).filter((t) => t.length > 1 && !STOP.has(t)).map((t) => (t.length > 4 ? t.replace(/(es|s)$/, '') : t));

export function chunkText(text, max = 700) {
  const paras = String(text).replace(/\r/g, '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out = []; let cur = '';
  const flush = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (const p of paras) {
    if (p.length > max) { flush(); for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max)); continue; }
    if ((cur + '\n\n' + p).length > max) flush();
    cur += (cur ? '\n\n' : '') + p;
  }
  flush(); return out;
}

// chunks: [{id, doc_id, title, text, embedding?: number[]}]
export function search(chunks, query, { k = 4, queryEmbedding = null } = {}) {
  const q = tokens(query); if (!q.length && !queryEmbedding) return [];
  const docs = chunks.map((c) => ({ c, t: tokens(c.title + ' ' + c.text) }));
  const avg = docs.reduce((a, d) => a + d.t.length, 0) / (docs.length || 1) || 1;
  const df = new Map(); for (const d of docs) for (const t of new Set(d.t)) df.set(t, (df.get(t) || 0) + 1);
  const N = docs.length;
  const bm = docs.map(({ c, t }) => {
    const tf = new Map(); for (const x of t) tf.set(x, (tf.get(x) || 0) + 1);
    let s = 0; for (const w of q) { const f = tf.get(w); if (!f) continue; const idf = Math.log(1 + (N - (df.get(w) || 0) + 0.5) / ((df.get(w) || 0) + 0.5)); s += idf * (f * 2.2) / (f + 1.2 * (0.25 + 0.75 * t.length / avg)); }
    return { c, s };
  });
  const rank = (arr) => new Map(arr.filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x, i) => [x.c.id, i]));
  const rb = rank(bm);
  let re = new Map();
  if (queryEmbedding) {
    const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; } return d / (Math.sqrt(na * nb) || 1); };
    re = rank(chunks.filter((c) => c.embedding).map((c) => ({ c, s: cos(queryEmbedding, c.embedding) - 0.3 })));
  }
  const score = new Map();
  for (const [id, r] of rb) score.set(id, (score.get(id) || 0) + 1 / (60 + r));
  for (const [id, r] of re) score.set(id, (score.get(id) || 0) + 1 / (60 + r));
  return [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([id]) => chunks.find((c) => c.id === id));
}
