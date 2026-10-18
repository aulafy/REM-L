// Cálculo compartido (servidor y navegador). Todos los importes en céntimos.
export const r = (n) => Math.sign(n) * Math.round(Math.abs(n));

export function computeTotals(lines = [], irpf = 0) {
  const groups = new Map();
  let base = 0;
  const detail = lines.map((l) => {
    const gross = (Number(l.qty) || 0) * (Number(l.price) || 0);
    const net = r(gross * (1 - (Number(l.discount) || 0) / 100));
    const rate = Number(l.iva) || 0;
    base += net;
    const g = groups.get(rate) || { rate, base: 0, iva: 0 };
    g.base += net;
    groups.set(rate, g);
    return { net };
  });
  const ivaGroups = [...groups.values()].sort((a, b) => b.rate - a.rate);
  let ivaTotal = 0;
  for (const g of ivaGroups) { g.iva = r(g.base * g.rate / 100); ivaTotal += g.iva; }
  const irpfTotal = r(base * (Number(irpf) || 0) / 100);
  return { base, ivaGroups, ivaTotal, irpfTotal, total: base + ivaTotal - irpfTotal, detail };
}

// Fecha ISO real: rechaza 2026-02-31 (Date.parse la acepta y la corre a marzo).
export const isIsoDate = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number), t = new Date(Date.UTC(y, m - 1, d));
  return y >= 1900 && y <= 2200 && t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};
export const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD local
export const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };

// Estado visible de un documento a partir de lo guardado + cobros + fecha.
export function docStatus(d, paid = 0, now = today()) {
  if (d.type === 'presupuesto') {
    if (d.status === 'enviado' && d.due_date && d.due_date < now) return 'caducado';
    return d.status;
  }
  if (d.status === 'emitida') {
    if (d.total >= 0 && paid >= d.total) return 'cobrada';
    if (d.total < 0) return 'emitida';
    if (d.due_date && d.due_date < now) return 'vencida';
    return paid > 0 ? 'parcial' : 'emitida';
  }
  return d.status; // borrador, rectificada
}

export const NIF_RE = /^([0-9]{8}[A-Z]|[XYZ][0-9]{7}[A-Z]|[ABCDEFGHJNPQRSUVW][0-9]{7}[0-9A-J])$/i;
export function validNif(v) {
  v = String(v || '').replace(/[\s.-]/g, '').toUpperCase();
  if (!v) return true;
  if (!NIF_RE.test(v)) return false;
  const L = 'TRWAGMYFPDXBNJZSQVHLCKE';
  if (/^[0-9]{8}[A-Z]$/.test(v)) return L[Number(v.slice(0, 8)) % 23] === v[8];
  if (/^[XYZ]/.test(v)) return L[Number('XYZ'.indexOf(v[0]) + v.slice(1, 8)) % 23] === v[8];
  return true; // CIF: formato válido (no se verifica el dígito de control)
}

// Siguiente fecha de una serie periódica respetando el día ancla (31 → 28 → 31…).
const EVERY_MONTHS = { month: 1, quarter: 3, year: 12 };
export function advanceDate(iso, every, anchor = Number(iso.slice(8, 10))) {
  const [y, m] = iso.split('-').map(Number), t = (y * 12 + (m - 1)) + EVERY_MONTHS[every], ny = Math.floor(t / 12), nm = (t % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}-${String(Math.min(anchor, new Date(ny, nm, 0).getDate())).padStart(2, '0')}`;
}
