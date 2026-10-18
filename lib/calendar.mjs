// Calendario en formato iCalendar (.ics): tareas, vencimientos de facturas, caducidad de presupuestos y facturas recurrentes.
import { docStatus, addDays } from '../public/calc.js';

const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// Líneas de máximo 75 octetos, continuadas con CRLF + espacio (sin partir caracteres multibyte).
export function fold(line) {
  const out = []; let cur = '', bytes = 0;
  for (const ch of line) { const b = Buffer.byteLength(ch); if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; } cur += ch; bytes += b; }
  out.push(cur); return out.join('\r\n ');
}
const d8 = (iso) => iso.replace(/-/g, '');
const eur = (c) => (c / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });

export function buildIcs({ tasks, documents, payments, clients, recurring = [], expenses = [], settings = {}, now = new Date(), today }) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''), cn = (id) => clients.find((c) => c.id === id)?.name || '';
  const paid = (id) => payments.filter((p) => p.document_id === id).reduce((a, p) => a + p.amount, 0);
  const ev = [];
  const add = (uid, date, summary, desc = '', cat = '') => ev.push(['BEGIN:VEVENT', `UID:${uid}@rem-negocio`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d8(date)}`, `DTEND;VALUE=DATE:${d8(addDays(date, 1))}`, `SUMMARY:${esc(summary)}`, ...(desc ? [`DESCRIPTION:${esc(desc)}`] : []), ...(cat ? [`CATEGORIES:${esc(cat)}`] : []), 'TRANSP:TRANSPARENT', 'END:VEVENT']);
  for (const t of tasks) if (!t.done && /^\d{4}-\d{2}-\d{2}$/.test(t.due || '')) add(`tarea-${t.id}`, t.due, t.title, cn(t.client_id), 'Tarea');
  for (const d of documents) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.due_date || '')) continue;
    if (d.type === 'factura' && d.status === 'emitida' && d.total > 0 && docStatus(d, paid(d.id), today || d.due_date) !== 'cobrada') add(`factura-${d.id}`, d.due_date, `Vence ${d.number} · ${cn(d.client_id)} · ${eur(d.total - paid(d.id))}`, 'Cobro pendiente', 'Cobro');
    if (d.type === 'presupuesto' && d.status === 'enviado') add(`presupuesto-${d.id}`, d.due_date, `Caduca el presupuesto ${d.number} · ${cn(d.client_id)}`, eur(d.total), 'Presupuesto');
  }
  for (const e of expenses) if (e.pending && /^\d{4}-\d{2}-\d{2}$/.test(e.due || '')) add(`pago-${e.id}`, e.due, `Pagar ${e.supplier || e.concept} · ${eur(e.total)}`, e.concept, 'Pago');
  for (const r of recurring) if (r.active && /^\d{4}-\d{2}-\d{2}$/.test(r.next_date)) add(`recurrente-${r.id}`, r.next_date, `Se prepara la factura recurrente: ${r.name}`, cn(r.client_id), 'Facturación');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//REM Negocio//ES', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(settings.company_name ? 'REM · ' + settings.company_name : 'REM Negocio')}`, 'X-WR-TIMEZONE:Europe/Madrid', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', ...ev.flat(), 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
}
