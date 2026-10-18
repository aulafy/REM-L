import { store, on, mutate, toast, confirmBox, formModal, field, go } from '../core.js';
import { html, raw, eur, fdate, icon, clientOf, avatar, api } from '../util.js';
import { computeTotals, advanceDate, today } from '../calc.js';

const EVERY = { month: 'Cada mes', quarter: 'Cada trimestre', year: 'Cada año' };
export const views = {
  recurrentes: {
    title: () => 'Recurrentes',
    render(S) {
      const list = S.recurring;
      return html`<div class="page-head"><div><h1>Facturas recurrentes</h1><p class="sub">Se prepara un borrador en cada periodo. Tú lo revisas y lo emites: nunca sale solo.</p></div></div>
        <div class="card">${list.length ? html`<ul class="list">${list.map((r) => { const t = computeTotals(r.lines, r.irpf), c = clientOf(S, r.client_id);
          return html`<li>${c ? avatar(c.name) : ''}<div class="grow"><div class="t" style="white-space:normal">${r.name}</div><div class="d">${c?.name || '—'} · ${EVERY[r.every]} · ${eur(t.total)}</div></div>
            <div style="text-align:right;min-width:120px"><div class="muted" style="font-size:12px">${r.active ? 'Próxima' : 'En pausa'}</div><div class="${r.next_date <= S.serverDate && r.active ? 'num' : ''}" style="font-weight:600">${fdate(r.next_date)}</div></div>
            <label class="row" style="gap:6px"><input type="checkbox" class="check" data-rec-on="${r.id}" ${r.active ? raw('checked') : ''} aria-label="Activa"><span class="muted" style="font-size:12.5px">Activa</span></label>
            <button class="btn sm" data-act="recRun" data-id="${r.id}" title="Prepara un borrador ahora sin cambiar el calendario">Generar borrador</button>
            <button class="btn ghost icon sm" data-act="recEdit" data-id="${r.id}" aria-label="Editar">${icon('edit', 'sm')}</button><button class="btn ghost icon sm" data-act="recDel" data-id="${r.id}" aria-label="Eliminar">${icon('trash', 'sm')}</button></li>`; })}</ul>`
          : html`<div class="empty">${icon('refresh')}<h3>Aún no tienes facturas recurrentes</h3><p>Para cobros que se repiten (mantenimientos, cuotas, alquileres): abre una factura y pulsa <b>Repetir…</b>. Cada periodo tendrás un borrador listo.</p><a class="btn primary" href="#/facturas">Ir a Facturas</a></div>`}</div>`;
    },
    mount(root) {
      api('POST', '/api/recurring/check', {}).then(async (r) => { if (r.generated) { const { reload, refresh } = await import('../core.js'); await reload(); refresh(); toast(`${r.generated} borrador(es) preparado(s)`); } }).catch(() => {});
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
