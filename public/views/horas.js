import { store, on, mutate, toast, confirmBox, formModal, field, go } from '../core.js';
import { html, eur, eurPlain, toCents, fdate, icon, clientOf, avatar } from '../util.js';
import { today } from '../calc.js';
import { openTab } from './ajustes.js';
import { parseDuration, fmtDur } from '../duration.js';

const amount = (e) => Math.round(e.minutes * e.rate / 60);
const TIMER = 'rem-timer';
const readTimer = () => { try { return JSON.parse(localStorage.getItem(TIMER) || 'null'); } catch { return null; } };

export const views = {
  horas: {
    title: () => 'Horas',
    render(S) {
      const open = S.timeEntries.filter((e) => !e.doc_id), done = S.timeEntries.filter((e) => e.doc_id).slice(0, 12), tm = readTimer();
      const by = new Map(); for (const e of open) (by.get(e.client_id) || by.set(e.client_id, []).get(e.client_id)).push(e);
      const groups = [...by.entries()].map(([cid, list]) => ({ c: clientOf(S, cid), list, min: list.reduce((a, e) => a + e.minutes, 0), eur: list.reduce((a, e) => a + amount(e), 0) })).sort((a, b) => b.eur - a.eur);
      const noRate = !Number(S.settings.hourly_rate);
      return html`<div class="page-head"><div><h1>Horas</h1><p class="sub">Apunta el tiempo que dedicas a cada cliente y conviértelo en un <b>borrador de factura</b> con un clic.</p></div><div class="actions"><button class="btn primary" data-act="newTime">${icon('plus', 'sm')}Apuntar horas</button></div></div>
        ${noRate ? html`<div class="notice" style="margin-bottom:16px">${icon('coins')}<span>Define tu <b>tarifa por hora</b> en <a href="#/ajustes/facturacion" data-act="goBilling">Ajustes → Facturación</a> para que cada entrada la use por defecto.</span></div>` : ''}
        <section class="card timer" aria-label="Cronómetro" style="margin-bottom:18px"><div class="card-b row wrap" style="gap:12px">${tm
          ? html`<span class="badge amber">${icon('clock', 'sm')}En marcha</span><span class="grow"><b>${clientOf(S, tm.client_id)?.name || 'Cliente'}</b>${tm.desc ? ' · ' + tm.desc : ''} <span class="muted" id="tm-el" data-start="${tm.start}"></span></span><button class="btn primary" data-act="timerStop">Parar y guardar</button><button class="btn ghost" data-act="timerCancel">Descartar</button>`
          : html`<span class="muted grow">Cronómetro: pulsa Empezar y, al parar, se guarda la entrada.</span><button class="btn" data-act="timerStart">${icon('clock', 'sm')}Empezar</button>`}</div></section>
        ${groups.length ? groups.map((g) => html`<section class="card" style="margin-bottom:16px"><div class="card-h">${g.c ? avatar(g.c.name) : ''}<h2 style="margin-left:8px">${g.c?.name || 'Cliente'}</h2><span class="muted more" style="margin-left:auto;margin-right:12px">${fmtDur(g.min)} h · <b style="color:var(--ink)">${eur(g.eur)}</b> + IVA</span><button class="btn sm primary" data-act="billTime" data-id="${g.c?.id}">${icon('facturas', 'sm')}Facturar horas</button></div>
          <ul class="list">${g.list.map((e) => html`<li><div class="grow"><div class="t" style="white-space:normal">${e.description || 'Trabajo'}</div><div class="d">${fdate(e.date)} · ${e.rate ? eur(e.rate) + '/h' : html`<span style="color:var(--red)">sin tarifa</span>`}</div></div><span class="num"><b>${fmtDur(e.minutes)}</b> h</span><span class="num muted" style="min-width:84px;text-align:right">${eur(amount(e))}</span>
            <button class="btn ghost icon sm" data-act="editTime" data-id="${e.id}" aria-label="Editar entrada">${icon('edit', 'sm')}</button><button class="btn ghost icon sm" data-act="delTime" data-id="${e.id}" aria-label="Eliminar entrada">${icon('trash', 'sm')}</button></li>`)}</ul></section>`)
          : html`<div class="card"><div class="empty">${icon('clock')}<h3>No hay horas pendientes de facturar</h3><p>Apunta las horas que trabajas para un cliente (o usa el cronómetro) y facturarlas será un clic.</p><button class="btn primary" data-act="newTime">Apuntar horas</button></div></div>`}
        ${done.length ? html`<h2 style="font-size:16px;margin:26px 0 10px">Ya facturadas</h2><div class="card"><ul class="list">${done.map((e) => html`<li><div class="grow"><div class="t" style="white-space:normal">${e.description || 'Trabajo'}</div><div class="d">${clientOf(S, e.client_id)?.name} · ${fdate(e.date)}</div></div><span class="num">${fmtDur(e.minutes)} h</span><a class="btn ghost sm" href="#/facturas/${e.doc_id}">Ver factura</a></li>`)}</ul></div>` : ''}`;
    },
    mount(root) {
      const el = root.querySelector('#tm-el'); if (!el) return;
      const tick = () => { if (!document.body.contains(el)) return clearInterval(id); const s = Math.max(0, Math.round((Date.now() - Number(el.dataset.start)) / 1000)); el.textContent = `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }, id = setInterval(tick, 1000); tick();
    },
  },
};

function clientField(S, value) { return field({ name: 'client_id', label: 'Cliente', combo: true, required: true, options: [['', '— Elige —'], ...S.clients.filter((c) => !c.archived).map((c) => [c.id, c.name])], value: value ?? '' }); }
function timeModal(e, preset = {}) {
  const S = store.S, rate = e?.rate ?? Number(S.settings.hourly_rate || 0);
  formModal({ title: e ? 'Editar horas' : 'Apuntar horas', submit: e ? 'Guardar' : 'Apuntar',
    fields: [clientField(S, e?.client_id ?? preset.client_id), field({ name: 'date', label: 'Fecha', type: 'date', value: e?.date || today(), required: true }),
      field({ name: 'dur', label: 'Duración', value: e ? fmtDur(e.minutes) : preset.dur || '', required: true, hint: 'Vale 1:30, 1h30, 1,5 o 90m', attrs: 'inputmode="text" placeholder="1:30"' }),
      field({ name: 'rate', label: 'Tarifa por hora (€)', value: rate ? eurPlain(rate) : '', hint: 'Sin IVA', attrs: 'inputmode="decimal"' }),
      `<div style="grid-column:1/-1">${field({ name: 'description', label: '¿Qué hiciste?', value: e?.description ?? preset.desc ?? '', attrs: e ? '' : 'autofocus' })}</div>`].join(''),
    onSubmit: async (v, close) => {
      const minutes = parseDuration(v.dur); if (!minutes) throw new Error('No entiendo la duración. Prueba con 1:30 o 1,5.');
      if (!v.client_id) throw new Error('Elige un cliente.');
      await mutate(e ? 'PUT' : 'POST', e ? `/api/time/${e.id}` : '/api/time', { client_id: Number(v.client_id), date: v.date, minutes, rate: v.rate === '' ? 0 : toCents(v.rate), description: v.description }, e ? 'Horas actualizadas' : 'Horas apuntadas'); close();
    } });
}
const byId = (el) => store.S.timeEntries.find((x) => x.id === Number(el.dataset.id));
on('newTime', () => timeModal(null));
on('editTime', (el) => timeModal(byId(el)));
on('delTime', async (el) => { const e = byId(el); if (await confirmBox({ title: 'Eliminar horas', text: `Se elimina la entrada de ${fmtDur(e.minutes)} h.`, ok: 'Eliminar', danger: true })) await mutate('DELETE', `/api/time/${e.id}`, undefined, 'Eliminada'); });
on('billTime', async (el) => { try { const d = await mutate('POST', '/api/time/invoice', { client_id: Number(el.dataset.id) }, 'Borrador de factura preparado'); go(`#/facturas/${d.id}`); } catch {} });
on('goBilling', () => openTab('facturacion'));
on('timerStart', () => {
  const S = store.S;
  formModal({ title: 'Empezar cronómetro', submit: 'Empezar', fields: [clientField(S), `<div style="grid-column:1/-1">${field({ name: 'description', label: '¿En qué vas a trabajar?', attrs: 'autofocus' })}</div>`].join(''),
    onSubmit: async (v, close) => { if (!v.client_id) throw new Error('Elige un cliente.'); localStorage.setItem(TIMER, JSON.stringify({ client_id: Number(v.client_id), desc: v.description, start: Date.now() })); close(); window.dispatchEvent(new Event('rem-render')); } });
});
on('timerCancel', () => { localStorage.removeItem(TIMER); window.dispatchEvent(new Event('rem-render')); });
on('timerStop', () => {
  const tm = readTimer(); if (!tm) return; const min = Math.max(1, Math.round((Date.now() - tm.start) / 60000)); localStorage.removeItem(TIMER);
  timeModal(null, { client_id: tm.client_id, desc: tm.desc, dur: fmtDur(min) }); window.dispatchEvent(new Event('rem-render'));
});
