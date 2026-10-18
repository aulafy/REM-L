// Historial único de un cliente: todo lo que ha pasado (y lo que viene) ordenado en el tiempo. Función pura sobre el estado.
import { docStatus } from './calc.js';

const CH = { telegram: 'Telegram', email: 'Correo', whatsapp: 'WhatsApp', imessage: 'iMessage', otro: 'Mensaje' };
const eur = (c) => (c / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
const at = (d) => (String(d).length === 10 ? `${d}T12:00:00` : d);
const clip = (s, n = 140) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

export const GROUPS = { mensajes: 'Mensajes', facturacion: 'Facturación', tareas: 'Tareas y notas' };

export function timelineOf(S, clientId, { today = S.serverDate } = {}) {
  const items = [], c = S.clients.find((x) => x.id === clientId); if (!c) return { upcoming: [], past: [] };
  const push = (o) => items.push({ group: 'facturacion', ...o });
  push({ id: `c${c.id}`, at: at(c.created_at), kind: 'cliente', icon: 'user', title: 'Cliente creado', group: 'tareas' });
  for (const m of S.messages.filter((x) => x.client_id === clientId)) {
    push({ id: `m${m.id}`, at: m.created_at, group: 'mensajes', kind: m.direction === 'out' ? 'mensaje-salida' : 'mensaje', icon: m.channel === 'email' ? 'mail' : m.channel === 'telegram' ? 'send' : 'mensajes',
      title: m.direction === 'out' ? `Respondiste por ${CH[m.channel] || 'mensaje'}` : `${CH[m.channel] || 'Mensaje'} recibido${m.subject ? `: ${clip(m.subject, 60)}` : ''}`, detail: clip(m.body), href: `#/mensajes/${m.id}` });
  }
  const paid = (id) => S.payments.filter((p) => p.document_id === id).reduce((a, p) => a + p.amount, 0);
  for (const d of S.documents.filter((x) => x.client_id === clientId)) {
    const link = `#/${{ factura: 'facturas', albaran: 'albaranes' }[d.type] || 'presupuestos'}/${d.id}`, label = d.number || (d.type === 'factura' ? 'Borrador de factura' : 'Presupuesto');
    if (d.type === 'albaran') { push({ id: `d${d.id}`, at: at(d.issue_date), kind: 'albaran', icon: 'facturas', title: `Albarán ${label} ${d.status === 'facturado' ? '(facturado)' : 'entregado'}`, detail: eur(d.total), href: link }); continue; }
    if (d.type === 'factura') {
      if (d.status === 'borrador') push({ id: `d${d.id}`, at: d.created_at, kind: 'borrador', icon: 'edit', title: `Borrador de factura creado`, detail: eur(d.total), href: link });
      else { push({ id: `d${d.id}`, at: at(d.issue_date), kind: d.corrects_id ? 'rectificativa' : 'factura', icon: 'facturas', title: `${d.corrects_id ? 'Factura rectificativa' : 'Factura'} ${label} emitida`, detail: eur(d.total), href: link });
        if (d.status === 'emitida' && d.total > 0 && d.due_date) { const pend = d.total - paid(d.id); if (pend > 0) { const st = docStatus(d, paid(d.id), today); push({ id: `dv${d.id}`, at: at(d.due_date), kind: st === 'vencida' ? 'vencida' : 'vence', icon: st === 'vencida' ? 'alert' : 'calendar', title: st === 'vencida' ? `${label} vencida` : `Vence ${label}`, detail: `Pendiente ${eur(pend)}`, href: link }); } } }
    } else {
      push({ id: `d${d.id}`, at: at(d.issue_date), kind: 'presupuesto', icon: 'presupuestos', title: `Presupuesto ${label} creado`, detail: eur(d.total), href: link });
      if (['aceptado', 'rechazado', 'facturado'].includes(d.status) && d.updated_at) push({ id: `ds${d.id}`, at: d.updated_at, kind: `presupuesto-${d.status}`, icon: d.status === 'rechazado' ? 'x' : 'check', title: `Presupuesto ${label} ${d.status === 'rechazado' ? 'rechazado' : d.status === 'facturado' ? 'facturado' : 'aceptado'}`, detail: eur(d.total), href: link });
      else if (d.status === 'enviado' && d.due_date) push({ id: `dq${d.id}`, at: at(d.due_date), kind: 'caduca', icon: 'calendar', title: `Caduca el presupuesto ${label}`, detail: eur(d.total), href: link });
    }
  }
  const docIds = new Set(S.documents.filter((x) => x.client_id === clientId).map((x) => x.id));
  for (const p of S.payments.filter((x) => docIds.has(x.document_id))) { const d = S.documents.find((x) => x.id === p.document_id); push({ id: `p${p.id}`, at: at(p.date), kind: 'cobro', icon: 'coins', title: `Cobro de ${eur(p.amount)}`, detail: `${d?.number || ''} · ${p.method}`, href: `#/facturas/${p.document_id}` }); }
  for (const t of S.tasks.filter((x) => x.client_id === clientId)) {
    push({ id: `t${t.id}`, at: t.created_at, group: 'tareas', kind: 'tarea', icon: t.done ? 'check' : 'tareas', title: t.done ? `Tarea hecha: ${t.title}` : `Tarea: ${t.title}`, href: '#/tareas' });
    if (!t.done && t.due && t.due >= today) push({ id: `tv${t.id}`, at: at(t.due), group: 'tareas', kind: 'tarea-fecha', icon: 'calendar', title: `Para hacer: ${t.title}`, href: '#/tareas' });
  }
  for (const m of (S.memory || []).filter((x) => x.client_id === clientId)) push({ id: `me${m.id}`, at: m.created_at, group: 'tareas', kind: 'memoria', icon: 'book', title: `Se recuerda: ${m.text}` });
  for (const f of S.files || []) { const mine = f.owner_type === 'client' ? f.owner_id === clientId : docIds.has(f.owner_id); if (!mine) continue; const d = f.owner_type === 'document' ? S.documents.find((x) => x.id === f.owner_id) : null; push({ id: `f${f.id}`, at: f.created_at, group: 'tareas', kind: 'archivo', icon: 'download', title: `Archivo añadido${d ? ` a ${d.number || 'un documento'}` : ''}: ${f.name}`, href: f.owner_type === 'client' ? '' : `#/${d?.type === 'factura' ? 'facturas' : 'presupuestos'}/${f.owner_id}` }); }
  for (const r of (S.recurring || []).filter((x) => x.client_id === clientId && x.active)) push({ id: `r${r.id}`, at: at(r.next_date), kind: 'recurrente', icon: 'refresh', title: `Se prepara la factura recurrente: ${r.name}`, href: '#/recurrentes' });
  const now = `${today}T23:59:59`, future = (i) => i.at.slice(0, 10) > today || (i.at.slice(0, 10) === today && ['vence', 'caduca', 'tarea-fecha', 'recurrente'].includes(i.kind));
  const up = items.filter((i) => future(i) && ['vence', 'caduca', 'tarea-fecha', 'recurrente'].includes(i.kind)).sort((a, b) => a.at.localeCompare(b.at));
  const past = items.filter((i) => !up.includes(i) && i.at <= now).sort((a, b) => b.at.localeCompare(a.at));
  return { upcoming: up, past };
}
