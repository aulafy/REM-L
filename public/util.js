import { docStatus, today } from './calc.js';

// ---------- plantillas HTML con escapado automático ----------
class Raw { constructor(s) { this.s = s; } toString() { return this.s; } }
export const raw = (s) => new Raw(String(s ?? ''));
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const part = (v) => (v instanceof Raw ? v.s : Array.isArray(v) ? v.map(part).join('') : v == null || v === false ? '' : esc(v));
export const html = (s, ...v) => new Raw(s.reduce((a, x, i) => a + x + (i < v.length ? part(v[i]) : ''), ''));

// ---------- formato ----------
const nf = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' });
export const eur = (c) => nf.format((c || 0) / 100).replace(/ /g, ' ');
export const eurPlain = (c) => ((c || 0) / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const toCents = (v) => Math.round(parseFloat(String(v).replace(/\./g, (m, o, s) => (s.includes(',') ? '' : m)).replace(',', '.')) * 100) || 0;
const df = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
const dfs = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
export const fdate = (iso) => (iso ? df.format(new Date(iso + 'T12:00:00')).replace('.', '') : '—');
export const fdateShort = (iso) => (iso ? dfs.format(new Date(iso + 'T12:00:00')).replace('.', '') : '—');
export function relDate(iso, now = today()) {
  if (!iso) return '';
  const d = Math.round((new Date(iso + 'T12:00:00') - new Date(now + 'T12:00:00')) / 864e5);
  if (d === 0) return 'hoy'; if (d === 1) return 'mañana'; if (d === -1) return 'ayer';
  return d > 0 ? `en ${d} días` : `hace ${-d} días`;
}
export const initials = (n) => String(n).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const HUES = [214, 202, 226, 160, 148, 30, 36, 196]; // azules, verdes y naranjas suaves
export const hue = (n) => HUES[[...String(n)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7) % HUES.length];
export const avatar = (name, size = '') => html`<span class="avatar ${size}" style="--h:${hue(name)}" aria-hidden="true">${initials(name)}</span>`;

// ---------- estados ----------
export const STATUS = {
  borrador: ['Borrador', 'grey'], emitida: ['Emitida', 'blue'], cobrada: ['Cobrada', 'green'], parcial: ['Cobro parcial', 'amber'], vencida: ['Vencida', 'red'],
  rectificada: ['Rectificada', 'grey'], enviado: ['Enviado', 'blue'], aceptado: ['Aceptado', 'green'], rechazado: ['Rechazado', 'red'], caducado: ['Caducado', 'amber'], facturado: ['Facturado', 'violet'],
};
export const badge = (st) => html`<span class="badge ${STATUS[st]?.[1] || 'grey'}">${STATUS[st]?.[0] || st}</span>`;
export const paidOf = (S, id) => S.payments.filter((p) => p.document_id === id).reduce((a, p) => a + p.amount, 0);
export const statusOf = (S, d) => docStatus(d, paidOf(S, d.id), S.serverDate);
export const clientOf = (S, id) => S.clients.find((c) => c.id === id);
export const docLabel = (d) => (d.number || (d.type === 'presupuesto' ? 'Presupuesto' : 'Borrador de factura'));

// ---------- iconos (trazo, 24×24) ----------
const P = {
  // navegación (un símbolo claro por módulo)
  hoy: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9v11a1 1 0 0 0 1 1h3.5v-6h5v6H18a1 1 0 0 0 1-1V9"/>',
  mensajes: '<path d="M21 15.5a2 2 0 0 1-2 2H8.5L4 21V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 12.5h5"/>',
  clientes: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20.5a6.5 6.5 0 0 1 13 0"/><path d="M15.5 4.7a3.5 3.5 0 0 1 0 6.6"/><path d="M18 14.2a6.5 6.5 0 0 1 3.5 6.3"/>',
  dinero: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.7"/><path d="M6 12h.01M18 12h.01"/>',
  ajustes: '<path d="M4 7h8M17 7h3M4 17h3M12 17h8"/><circle cx="14.5" cy="7" r="2.5"/><circle cx="9.5" cy="17" r="2.5"/>',
  // dinero
  facturas: '<path d="M5.5 3h13a1 1 0 0 1 1 1v17l-3-1.8-2.2 1.8-2.3-1.8-2.3 1.8-2.2-1.8-3 1.8V4a1 1 0 0 1 1-1z"/><path d="M9 8h6M9 12h6"/>',
  presupuestos: '<path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 16.5h4"/>',
  gastos: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/><path d="M6.5 15h3"/>',
  informes: '<path d="M4 4v16h16"/><path d="M8.5 16v-4M12.5 16V8M16.5 16v-6.5"/>',
  tareas: '<rect x="3.5" y="3.5" width="17" height="17" rx="3.5"/><path d="m8 12.3 3 3 5-6"/>',
  coins: '<circle cx="12" cy="12" r="9"/><path d="M15.4 8.8a4.5 4.5 0 0 0-6.9 1.7v3a4.5 4.5 0 0 0 6.9 1.7"/><path d="M7.5 11h6M7.5 13.5h6"/>',
  // acciones
  plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', check: '<path d="m4.5 12.5 5 5L19.5 7"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20.5 20.5-4.2-4.2"/>',
  edit: '<path d="M4 20h4.2L19.3 8.9a2 2 0 0 0 0-2.8l-1.4-1.4a2 2 0 0 0-2.8 0L4 15.8z"/><path d="m13.5 6.3 4.2 4.2"/>',
  trash: '<path d="M4 7h16"/><path d="M9.5 7V4.5h5V7"/><path d="M6 7l.9 12.2a1.5 1.5 0 0 0 1.5 1.3h7.2a1.5 1.5 0 0 0 1.5-1.3L18 7"/><path d="M10 11v6M14 11v6"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
  download: '<path d="M12 3.5v11"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4.5 19.5h15"/>',
  print: '<path d="M7 9V3.5h10V9"/><path d="M7 17.5H5.5a1.5 1.5 0 0 1-1.5-1.5v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1.5 1.5 0 0 1-1.5 1.5H17"/><rect x="7" y="14" width="10" height="6.5" rx="1"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 7.5 8.5 6 8.5-6"/>',
  send: '<path d="M21.5 2.5 10.5 13.5"/><path d="M21.5 2.5 14.8 21.2a.5.5 0 0 1-.93.03L10.5 13.5 2.8 10.2a.5.5 0 0 1 .03-.93z"/>',
  arrow: '<path d="M4.5 12h15"/><path d="m13.5 6 6 6-6 6"/>', back: '<path d="M19.5 12h-15"/><path d="m10.5 6-6 6 6 6"/>',
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>', refresh: '<path d="M20 12a8 8 0 0 0-14-5.3L4 9"/><path d="M4 4.5V9h4.5"/><path d="M4 12a8 8 0 0 0 14 5.3L20 15"/><path d="M20 19.5V15h-4.5"/>',
  archive: '<rect x="3" y="4" width="18" height="4.5" rx="1.2"/><path d="M5 8.5V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.5"/><path d="M10 12.5h4"/>',
  // estado y asistente
  alert: '<path d="M10.3 4 2.5 17.6A2 2 0 0 0 4.2 20.6h15.6a2 2 0 0 0 1.7-3L13.7 4a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4"/><path d="M12 17h.01"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.4 3 7.7 7.5 9 4.5-1.3 7.5-4.6 7.5-9V6z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
  sparkle: '<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 15.5v4M17 17.5h4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  book: '<path d="M12 6.5C10.4 5 8 4.5 4 4.5V18c4 0 6.4.5 8 2 1.6-1.5 4-2 8-2V4.5c-4 0-6.4.5-8 2z"/><path d="M12 6.5V20"/>',
  mic: '<rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3.5"/>',
  speaker: '<path d="M11 5 6.5 9H3.5v6h3L11 19z"/><path d="M15.5 8.7a4.5 4.5 0 0 1 0 6.6"/><path d="M18.5 6a8.5 8.5 0 0 1 0 12"/>',
  phone: '<path d="M5.5 3.5h3l1.8 4.6-2.2 1.4a11 11 0 0 0 5.4 5.4l1.4-2.2 4.6 1.8v3a1.5 1.5 0 0 1-1.6 1.5A15.5 15.5 0 0 1 4 5.1 1.5 1.5 0 0 1 5.5 3.5z"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  moon: '<path d="M20.5 14.2A8.5 8.5 0 0 1 9.8 3.5a8.5 8.5 0 1 0 10.7 10.7z"/>',
};
export const icon = (n, cls = '') => html`<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${raw(P[n] || '')}</svg>`;

// ---------- red ----------
export async function api(method, path, body) {
  const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'No se pudo completar la acción');
  return j;
}
export const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
export const plural = (n, s, p) => `${n} ${n === 1 ? s : p}`;
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
