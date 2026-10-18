import { store, on, mutate, toast, confirmBox, formModal, field, go } from '../core.js';
import { html, raw, eur, eurPlain, toCents, fdate, icon, clientOf, avatar, api } from '../util.js';
import { computeTotals, advanceDate, today } from '../calc.js';

const EVERY = { month: 'Cada mes', quarter: 'Cada trimestre', year: 'Cada año' };
export const views = {
  recurrentes: {
    title: () => 'Recurrentes',
    render(S) {
      const list = S.recurring;
      return html`<div class="page-head"><div><h1>Recurrentes</h1><p class="sub">Facturas que se repiten (se prepara un <b>borrador</b>: tú lo revisas y lo emites) y gastos fijos (se <b>registran solos</b>).</p></div></div>
        <h2 style="font-size:16px;margin:0 0 10px">Facturas recurrentes</h2>
        <div class="card">${list.length ? html`<ul class="list">${list.map((r) => { const t = computeTotals(r.lines, r.irpf), c = clientOf(S, r.client_id);
          return html`<li>${c ? avatar(c.name) : ''}<div class="grow"><div class="t" style="white-space:normal">${r.name}</div><div class="d">${c?.name || '—'} · ${EVERY[r.every]} · ${eur(t.total)}</div></div>
            <div style="text-align:right;min-width:120px"><div class="muted" style="font-size:12px">${r.active ? 'Próxima' : 'En pausa'}</div><div class="${r.next_date <= S.serverDate && r.active ? 'num' : ''}" style="font-weight:600">${fdate(r.next_date)}</div></div>
            <label class="row" style="gap:6px"><input type="checkbox" class="check" data-rec-on="${r.id}" ${r.active ? raw('checked') : ''} aria-label="Activa"><span class="muted" style="font-size:12.5px">Activa</span></label>
            <button class="btn sm" data-act="recRun" data-id="${r.id}" title="Prepara un borrador ahora sin cambiar el calendario">Generar borrador</button>
            <button class="btn ghost icon sm" data-act="recEdit" data-id="${r.id}" aria-label="Editar">${icon('edit', 'sm')}</button><button class="btn ghost icon sm" data-act="recDel" data-id="${r.id}" aria-label="Eliminar">${icon('trash', 'sm')}</button></li>`; })}</ul>`
          : html`<div class="empty">${icon('refresh')}<h3>Aún no tienes facturas recurrentes</h3><p>Para cobros que se repiten (mantenimientos, cuotas, alquileres): abre una factura y pulsa <b>Repetir…</b>. Cada periodo tendrás un borrador listo.</p><a class="btn primary" href="#/facturas">Ir a Facturas</a></div>`}</div>
        <div class="row" style="margin:26px 0 10px"><h2 style="font-size:16px;margin:0">Gastos recurrentes</h2><span class="spacer"></span><button class="btn sm primary" data-act="newRecExp">${icon('plus', 'sm')}Nuevo gasto recurrente</button></div>
        <div class="card">${S.recurringExpenses.length ? html`<ul class="list">${S.recurringExpenses.map((r) => html`<li><span class="badge ic-only grey" style="padding:7px" aria-hidden="true">${icon('gastos', 'sm')}</span><div class="grow"><div class="t" style="white-space:normal">${r.concept}${r.estimated ? html` <span class="chip busy">Importe estimado</span>` : ''}</div><div class="d">${[r.supplier, r.category, EVERY[r.every]].filter(Boolean).join(' · ')} · ${eur(r.total)}</div></div>
            <div style="text-align:right;min-width:120px"><div class="muted" style="font-size:12px">${r.active ? 'Próximo' : 'En pausa'}</div><div style="font-weight:600">${fdate(r.next_date)}</div></div>
            <label class="row" style="gap:6px"><input type="checkbox" class="check" data-rexp-on="${r.id}" ${r.active ? raw('checked') : ''} aria-label="Activo"><span class="muted" style="font-size:12.5px">Activo</span></label>
            <button class="btn ghost icon sm" data-act="recExpEdit" data-id="${r.id}" aria-label="Editar">${icon('edit', 'sm')}</button><button class="btn ghost icon sm" data-act="recExpDel" data-id="${r.id}" aria-label="Eliminar">${icon('trash', 'sm')}</button></li>`)}</ul>`
          : html`<div class="empty">${icon('gastos')}<h3>Sin gastos recurrentes</h3><p>Alquiler, cuota de autónomos, seguros, suscripciones… Se registran solos cada periodo y la previsión de tesorería los tiene en cuenta. También puedes pulsar <b>Repetir</b> en un gasto ya apuntado.</p><button class="btn primary" data-act="newRecExp">Añadir uno</button></div>`}</div>`;
    },
    mount(root) {
      api('POST', '/api/recurring/check', {}).then(async (r) => { if (r.generated) { const { reload, refresh } = await import('../core.js'); await reload(); refresh(); toast(`${r.generated} borrador(es) preparado(s)`); } }).catch(() => {});
      root.querySelectorAll('[data-rexp-on]').forEach((c) => c.addEventListener('change', async () => { try { await mutate('PUT', `/api/recurring-expenses/${c.dataset.rexpOn}`, { active: c.checked }, c.checked ? 'Activado' : 'En pausa'); } catch {} }));
      root.querySelectorAll('[data-rec-on]').forEach((c) => c.addEventListener('change', async () => { try { await mutate('PUT', `/api/recurring/${c.dataset.recOn}`, { active: c.checked }, c.checked ? 'Activada' : 'En pausa'); } catch {} }));
    },
  },
};

const sel = (id) => store.S.recurring.find((r) => r.id === Number(id));
function recModal(r, d) {
  const S = store.S, def = r ? r.next_date : advanceDate(d.issue_date > today() ? d.issue_date : today(), 'month');
  formModal({ title: r ? 'Editar factura recurrente' : 'Repetir esta factura', submit: r ? 'Guardar' : 'Crear recurrente',
    fields: [field({ name: 'name', label: 'Nombre', value: r?.name || `${d.lines[0]?.desc || 'Factura'} · ${clientOf(S, d.client_id)?.name || ''}`.slice(0, 80), required: true, attrs: 'autofocus' }),
      field({ name: 'every', label: 'Frecuencia', options: Object.entries(EVERY), value: r?.every || 'month' }), field({ name: 'next_date', label: 'Próxima fecha', type: 'date', value: def, required: true, hint: 'Ese día se prepara el borrador (con los mismos conceptos).' })].join(''),
    onSubmit: async (v, close) => { await mutate(r ? 'PUT' : 'POST', r ? `/api/recurring/${r.id}` : '/api/recurring', r ? v : { ...v, from_document_id: d.id }, r ? 'Guardado' : 'Factura recurrente creada'); close(); if (!r) go('#/recurrentes'); } });
}
on('repeatInvoice', (el) => recModal(null, store.S.documents.find((x) => x.id === Number(el.dataset.id))));
on('recEdit', (el) => recModal(sel(el.dataset.id)));
on('recRun', async (el) => { const d = await mutate('POST', `/api/recurring/${el.dataset.id}/run`, {}, 'Borrador preparado'); go(`#/facturas/${d.id}`); });
on('recDel', async (el) => { if (await confirmBox({ title: 'Eliminar recurrente', text: 'Dejará de generar borradores. Las facturas ya creadas no se tocan.', ok: 'Eliminar', danger: true })) await mutate('DELETE', `/api/recurring/${el.dataset.id}`, undefined, 'Eliminada'); });

// ---------- gastos recurrentes ----------
const CATS = ['alquiler', 'material', 'suministros', 'vehículo', 'servicios profesionales', 'marketing', 'impuestos y tasas', 'otros'];
function expModal(r, src) {
  const base = r || src || {}, nextDefault = r ? r.next_date : src ? advanceDate(src.date, 'month') : today();
  formModal({ title: r ? 'Editar gasto recurrente' : 'Nuevo gasto recurrente', wide: true, submit: r ? 'Guardar' : 'Crear',
    fields: [field({ name: 'concept', label: 'Concepto', value: base.concept || '', required: true, attrs: 'autofocus' }), field({ name: 'supplier', label: 'Proveedor', value: base.supplier || '' }),
      field({ name: 'category', label: 'Categoría', options: CATS.map((c) => [c, c[0].toUpperCase() + c.slice(1)]), value: base.category || 'otros' }), field({ name: 'amount', label: 'Importe (IVA incluido)', value: base.total ? eurPlain(base.total) : '', required: true, attrs: 'inputmode="decimal"' }),
      field({ name: 'iva', label: 'IVA incluido', options: [[21, '21 %'], [10, '10 %'], [4, '4 %'], [0, 'Sin IVA']], value: base.iva ?? 21 }), field({ name: 'every', label: 'Frecuencia', options: Object.entries(EVERY), value: r?.every || 'month' }),
      field({ name: 'next_date', label: 'Próxima fecha', type: 'date', value: nextDefault, required: true, hint: 'Se registra ese día (y los periodos que falten si la app estuvo cerrada).' }),
      `<label class="row" style="gap:8px;grid-column:1/-1"><input type="checkbox" class="check" name="estimated" ${base.estimated ? 'checked' : ''}><span>Importe variable: registra el estimado y me avisa en las notas para que lo revise</span></label>`].join(''),
    onSubmit: async (v, close) => { const total = toCents(v.amount); if (total <= 0) throw new Error('Introduce un importe mayor que cero.');
      const body = { concept: v.concept, supplier: v.supplier, category: v.category, total, iva: Number(v.iva), every: v.every, next_date: v.next_date, estimated: !!v.estimated };
      await mutate(r ? 'PUT' : 'POST', r ? `/api/recurring-expenses/${r.id}` : '/api/recurring-expenses', body, r ? 'Guardado' : 'Gasto recurrente creado'); close(); if (!r && location.hash !== '#/recurrentes') go('#/recurrentes'); } });
}
on('newRecExp', () => expModal());
on('recExpEdit', (el) => expModal(store.S.recurringExpenses.find((r) => r.id === Number(el.dataset.id))));
on('repeatExpense', (el) => expModal(null, store.S.expenses.find((e) => e.id === Number(el.dataset.id))));
on('recExpDel', async (el) => { if (await confirmBox({ title: 'Eliminar gasto recurrente', text: 'Dejará de registrarse solo. Los gastos ya registrados no se tocan.', ok: 'Eliminar', danger: true })) await mutate('DELETE', `/api/recurring-expenses/${el.dataset.id}`, undefined, 'Eliminado'); });
