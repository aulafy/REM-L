// «1:30», «1h30», «1,5», «90m», «45» (minutos si es > 12 sin unidad) → minutos
export function parseDuration(v) {
  const s = String(v ?? '').trim().toLowerCase().replace(',', '.'); let m;
  if ((m = s.match(/^(\d+):(\d{1,2})$/))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = s.match(/^(\d+)\s*h\s*(\d{1,2})$/))) return Number(m[1]) * 60 + Number(m[2]);
  if ((m = s.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?$/)) && (m[1] || m[2])) return Math.round(Number(m[1] || 0) * 60 + Number(m[2] || 0));
  if (/^\d+(\.\d+)?$/.test(s)) { const n = Number(s); return n > 12 ? Math.round(n) : Math.round(n * 60); }
  return null;
}
export const fmtDur = (min) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;
