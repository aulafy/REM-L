// Dónde se ven los módulos: campos extra (fichas), plantillas (mensajes) e informes propios.
import { html, raw, esc, eur, icon, api, clientOf, paidOf, statusOf } from './util.js';
import { store, mutate, toast } from './core.js';
import { DATASETS, renderTemplate, runReport } from './modspec.js';

const enabled = (S) => (S.modules || []).filter((m) => m.enabled);
export const fieldsFor = (S, entity) => enabled(S).flatMap((m) => m.manifest.custom_fields.filter((f) => f.entity === entity).map((f) => ({ ...f, module: m.name })));

export function extCard(S, entity, id) {
  const fs = fieldsFor(S, entity); if (!fs.length) return '';
  const vals = S.ext?.[entity]?.[id] || {};
  return html`<section class="card"><div class="card-h"><h2>Campos extra</h2><span class="muted more" style="font-size:13px">Añadidos por tus módulos</span></div><div class="card-b grid">${fs.map((f) => { const v = vals[f.key] ?? '', n = `x_${f.key}`;
    return html`<div class="field"><label for="${n}">${f.label}</label>${f.type === 'select' ? html`<select class="input" id="${n}" data-ext="${entity}:${id}:${f.key}"><option value="">—</option>${f.options.map((o) => html`<option ${o === v ? raw('selected') : ''}>${o}</option>`)}</select>`
      : f.type === 'checkbox' ? html`<label class="row" style="gap:8px"><input type="checkbox" class="check" id="${n}" data-ext="${entity}:${id}:${f.key}" ${v ? raw('checked') : ''}><span class="muted">Sí</span></label>`
      : html`<input class="input" id="${n}" data-ext="${entity}:${id}:${f.key}" type="${f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}" value="${v}" ${f.type === 'number' ? raw('step="any"') : ''}>`}</div>`; })}</div></section>`;
}
export function bindExt(root) {
  root.querySelectorAll('[data-ext]').forEach((el) => el.addEventListener('change', async () => {
    const [entity, id, key] = el.dataset.ext.split(':'); const value = el.type === 'checkbox' ? el.checked : el.value;
    try { await api('PUT', `/api/ext/${entity}/${id}`, { key, value }); const S = store.S; S.ext[entity] ||= {}; (S.ext[entity][id] ||= {})[key] = value ? String(value) : undefined; toast('Guardado'); } catch (e) { toast(e.message, 'err'); }
  }));
}

// ---------- plantillas de mensajes ----------
export const templatesFor = (S) => enabled(S).flatMap((m) => m.manifest.templates.map((t) => ({ ...t, module: m.name })));
export function templateVars(S, clientId) {
  const c = clientOf(S, clientId), s = S.settings;
  const open = S.documents.filter((d) => d.client_id === clientId && d.type === 'factura' && d.status === 'emitida' && d.total > paidOf(S, d.id)).sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''))[0];
  return { cliente: (c?.name || '').split(' ')[0], negocio: s.company_name || '', iban: s.company_iban || '', numero_factura: open?.number || '', importe_pendiente: open ? eur(open.total - paidOf(S, open.id)) : '', fecha_vencimiento: open?.due_date ? new Date(open.due_date + 'T12:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }) : '' };
}
export { renderTemplate };

// ---------- informes de módulos ----------
function rowsOf(S, dataset) {
  if (dataset === 'invoices') return S.documents.filter((d) => d.type === 'factura' && d.status !== 'borrador').map((d) => ({ number: d.number, client: clientOf(S, d.client_id)?.name || '—', status: statusOf(S, d), date: d.issue_date, month: d.issue_date.slice(0, 7), year: d.issue_date.slice(0, 4), base: d.base, iva_total: d.iva_total, total: d.total }));
  if (dataset === 'expenses') return S.expenses.map((e) => ({ supplier: e.supplier || '—', category: e.category, date: e.date, month: e.date.slice(0, 7), year: e.date.slice(0, 4), base: e.base, total: e.total, iva: e.iva }));
  return S.clients.filter((c) => !c.archived).map((c) => ({ name: c.name, city: c.city || '—', nif: c.nif }));
}
export function reportsCard(S) {
  const rs = enabled(S).flatMap((m) => m.manifest.reports.map((r) => ({ ...r, module: m.name }))); if (!rs.length) return '';
  return html`<div class="stack" style="margin-top:22px"><h2 style="font-size:18px">Mis informes</h2>${rs.map((r) => { const out = runReport(r, rowsOf(S, r.dataset)), money = r.metric.kind === 'sum';
    return html`<section class="card"><div class="card-h"><h2>${r.name}</h2><span class="muted more" style="font-size:13px">${DATASETS[r.dataset].label} · ${r.module}</span></div>${out.rows.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${r.group_by || 'Total'}</th><th class="right">${money ? 'Suma' : 'Número'}</th></tr></thead><tbody>${out.rows.map((x) => html`<tr><td>${x.key}</td><td class="right num">${money ? eur(x.value) : x.value}</td></tr>`)}${out.rows.length > 1 ? html`<tr><td><b>Total</b></td><td class="right num"><b>${money ? eur(out.total) : out.total}</b></td></tr>` : ''}</tbody></table></div>` : html`<div class="empty" style="padding:24px"><p>Sin datos para este informe.</p></div>`}</section>`; })}</div>`;
}
