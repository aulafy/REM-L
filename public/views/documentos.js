import { store, on, go, toast, mutate, confirmBox, openModal, field, formModal } from '../core.js';
import { html, raw, esc, eur, eurPlain, toCents, fdate, relDate, icon, badge, avatar, clientOf, paidOf, statusOf, docLabel, norm, plural, STATUS } from '../util.js';
import { computeTotals, addDays, today } from '../calc.js';
import { clientModal } from '../actions.js';
import { messageModal, reminderText, quoteText, invoiceText } from '../messages.js';

const KIND = { facturas: { type: 'factura', one: 'Factura', many: 'Facturas', newLabel: 'Nueva factura', nuevo: 'nueva' }, presupuestos: { type: 'presupuesto', one: 'Presupuesto', many: 'Presupuestos', newLabel: 'Nuevo presupuesto', nuevo: 'nuevo' } };
const filters = { facturas: [['todas', 'Todas'], ['borrador', 'Borradores'], ['pendientes', 'Pendientes'], ['vencidas', 'Vencidas'], ['cobradas', 'Cobradas']], presupuestos: [['todos', 'Todos'], ['borrador', 'Borrador'], ['enviado', 'Enviados'], ['aceptado', 'Aceptados'], ['rechazado', 'Rechazados'], ['facturado', 'Facturados']] };
const state = { facturas: { f: 'todas', q: '', sort: null }, presupuestos: { f: 'todos', q: '', sort: null } };
const th = (key, k, label, cls = '') => { const s = state[key].sort, on = s && s.k === k; return html`<th class="${cls}" aria-sort="${on ? (s.dir === 1 ? 'ascending' : 'descending') : 'none'}"><button class="sortbtn" data-act="sortBy" data-t="${key}" data-k="${k}">${label}<span class="arr">${on ? (s.dir === 1 ? '↑' : '↓') : ''}</span></button></th>`; };
const SORTS = { numero: (S, d) => d.number || '~', cliente: (S, d) => clientOf(S, d.client_id)?.name || '', fecha: (S, d) => d.issue_date, venc: (S, d) => d.due_date || '', total: (S, d) => d.total };
let draft = null;

const base = (S, d) => ({ ...d });
function matchFilter(S, key, d) {
  const st = statusOf(S, d), f = state[key].f;
  if (['todas', 'todos'].includes(f)) return true;
  if (key === 'facturas') return f === 'borrador' ? st === 'borrador' : f === 'pendientes' ? ['emitida', 'parcial', 'vencida'].includes(st) && d.total > 0 : f === 'vencidas' ? st === 'vencida' : st === 'cobrada';
  return st === f || (f === 'enviado' && st === 'caducado');
}

function makeView(key) {
  const K = KIND[key];
  return {
    title: (S, p) => { const id = Number(p[0]); const d = S.documents.find((x) => x.id === id); return d ? docLabel(d) : p[0] ? K.newLabel : K.many; },
    render(S, p) {
      const seg = p[0] || '';
      if (seg === K.nuevo) return editor(S, key, null);
      if (/^\d+$/.test(seg)) {
        const d = S.documents.find((x) => x.id === Number(seg) && x.type === K.type);
        if (!d) return html`<div class="empty"><h3>No se encuentra el documento</h3><a class="btn" href="#/${key}">Volver</a></div>`;
        if (p[1] === 'editar' || (d.type === 'factura' && d.status === 'borrador')) return editor(S, key, d);
        return detail(S, key, d);
      }
      return list(S, key);
    },
    mount(root, S, p) {
      const seg = p[0] || '';
      if (seg === K.nuevo || p[1] === 'editar' || (/^\d+$/.test(seg) && S.documents.find((x) => x.id === Number(seg))?.status === 'borrador' && key === 'facturas')) mountEditor(root, S, key);
      const i = root.querySelector('#dq');
      if (i) i.addEventListener('input', () => { state[key].q = i.value; const pos = i.selectionStart; window.dispatchEvent(new Event('rem-render')); const n = document.getElementById('dq'); n?.focus(); n?.setSelectionRange(pos, pos); });
    },
  };
}
export const views = { facturas: makeView('facturas'), presupuestos: makeView('presupuestos') };

// ---------- listado ----------
function list(S, key) {
  const K = KIND[key], st = state[key];
  if (store.query?.get('f') && filters[key].some(([k]) => k === store.query.get('f'))) { st.f = store.query.get('f'); history.replaceState(null, '', '#/' + key); }
  const docs = S.documents.filter((d) => d.type === K.type).filter((d) => matchFilter(S, key, d))
    .filter((d) => !st.q || norm(`${d.number} ${clientOf(S, d.client_id)?.name || ''}`).includes(norm(st.q)));
  if (st.sort) docs.sort((a, b) => { const x = SORTS[st.sort.k](S, a), y = SORTS[st.sort.k](S, b); return (x < y ? -1 : x > y ? 1 : 0) * st.sort.dir; });
  const total = docs.reduce((a, d) => a + d.total, 0), pend = key === 'facturas' ? docs.filter((d) => d.status === 'emitida').reduce((a, d) => a + Math.max(0, d.total - paidOf(S, d.id)), 0) : 0;
  return html`
    <div class="page-head"><div><h1>${K.many}</h1><p class="sub">${key === 'facturas' ? 'Emite, cobra y reclama sin salir de aquí.' : 'Prepara ofertas y conviértelas en factura con un clic.'}</p></div><div class="actions"><a class="btn primary" href="#/${key}/${K.nuevo}">${icon('plus', 'sm')}${K.newLabel}</a></div></div>
    ${key === 'facturas' ? html`<div class="notice warn" style="margin-bottom:14px">${icon('alert')}<span>REM Negocio es una herramienta de gestión interna: <b>no es software de facturación certificado</b> (Verifactu/SII). Para facturas oficiales usa un sistema conforme a la normativa.</span></div>` : ''}
    <div class="toolbar"><input class="input" id="dq" type="search" placeholder="Buscar por número o cliente…" value="${st.q}" aria-label="Buscar"><div class="seg" role="group" aria-label="Filtrar por estado">${filters[key].map(([k, l]) => html`<button data-act="dfilter" data-key="${key}" data-k="${k}" aria-pressed="${st.f === k}">${l}</button>`)}</div></div>
    <div class="card">${docs.length ? html`<div class="tbl-wrap"><table class="tbl cards"><thead><tr>${th(key, 'numero', 'Número')}${th(key, 'cliente', 'Cliente')}${th(key, 'fecha', 'Fecha', 'hide-sm')}${th(key, 'venc', key === 'facturas' ? 'Vencimiento' : 'Válido hasta', 'hide-sm')}<th>Estado</th>${th(key, 'total', 'Total', 'right')}</tr></thead><tbody>
      ${docs.map((d) => { const stt = statusOf(S, d), c = clientOf(S, d.client_id); return html`<tr class="link" data-href="#/${key}/${d.id}" tabindex="0"><td class="name nowrap a-num">${d.number || html`<span class="muted">Borrador</span>`}</td>
        <td class="a-cli"><div class="cell-client">${c ? avatar(c.name) : ''}<div><span>${c?.name || html`<span class="muted">Sin cliente</span>`}</span></div></div></td><td class="hide-sm nowrap">${fdate(d.issue_date)}</td>
        <td class="hide-sm nowrap" style="${stt === 'vencida' ? 'color:var(--red)' : ''}">${d.status === 'borrador' ? '—' : fdate(d.due_date)}${stt === 'vencida' ? html`<br><small>${relDate(d.due_date, S.serverDate)}</small>` : ''}</td><td class="a-st">${badge(stt)}</td><td class="right num nowrap a-tot"><b>${eur(d.total)}</b></td></tr>`; })}</tbody></table></div>
      <div class="card-h" style="border-top:1px solid var(--line);border-bottom:0;background:var(--surface-2);border-radius:0 0 var(--r) var(--r)"><span class="muted">${plural(docs.length, 'documento', 'documentos')}</span><span class="spacer"></span>${pend ? html`<span class="muted">Pendiente: <b style="color:var(--ink)">${eur(pend)}</b></span><span class="muted">·</span>` : ''}<span class="muted">Total: <b style="color:var(--ink)">${eur(total)}</b></span></div>`
      : html`<div class="empty">${icon(key)}<h3>${st.q || !['todas', 'todos'].includes(st.f) ? 'Nada con ese filtro' : `Aún no hay ${K.many.toLowerCase()}`}</h3><p>${st.q || !['todas', 'todos'].includes(st.f) ? 'Cambia el filtro o la búsqueda.' : key === 'facturas' ? 'Crea tu primera factura: se numera sola y calcula el IVA por ti.' : 'Crea un presupuesto y, si te lo aceptan, conviértelo en factura.'}</p><a class="btn primary" href="#/${key}/${K.nuevo}">${K.newLabel}</a></div>`}</div>`;
}
on('dfilter', (el) => { state[el.dataset.key].f = el.dataset.k; window.dispatchEvent(new Event('rem-render')); });

// ---------- editor ----------
const IVAS = [21, 10, 4, 0];
const blankLine = (S) => ({ desc: '', qty: 1, price: 0, iva: S.settings.default_iva ?? 21, discount: 0 });

function editor(S, key, d) {
  const K = KIND[key];
  if (!draft || draft.id !== (d?.id ?? null) || draft.key !== key) {
    const cid = Number(store.query?.get('cliente')) || d?.client_id || '';
    draft = d ? { key, id: d.id, client_id: d.client_id || '', issue_date: d.issue_date, due_date: d.due_date, irpf: d.irpf, notes: d.notes, lines: d.lines.map((l) => ({ ...l })) }
      : { key, id: null, client_id: cid, issue_date: today(), due_date: addDays(today(), key === 'facturas' ? S.settings.payment_days ?? 30 : S.settings.quote_days ?? 30), irpf: S.settings.default_irpf ?? 0, notes: '', lines: [blankLine(S)] };
  }
  const t = computeTotals(draft.lines, draft.irpf);
  const isInv = key === 'facturas';
  return html`
    <a class="crumb" href="#/${d ? key + '/' + d.id : key}">${icon('back', 'sm')}${d ? docLabel(d) : K.many}</a>
    <div class="page-head"><div><h1>${d ? (d.number ? `Editar ${d.number}` : 'Editar borrador') : K.newLabel}</h1><p class="sub">${isInv ? 'Se guarda como borrador hasta que la emitas: entonces recibe su número y ya no se puede cambiar.' : 'Se numera automáticamente al crearlo.'}</p></div></div>
    <div class="editor" id="editor">
      <div class="stack">
        <section class="card"><div class="card-b grid g2">
          <div class="field" style="grid-column:1/-1"><label for="e-client">Cliente</label><div class="row"><select class="input" id="e-client" data-f="client_id" data-combo><option value="">— Elige un cliente —</option>${S.clients.filter((c) => !c.archived || c.id === draft.client_id).map((c) => html`<option value="${c.id}" ${String(c.id) === String(draft.client_id) ? raw('selected') : ''}>${c.name}</option>`)}</select><button class="btn" data-act="quickClient" type="button">${icon('plus', 'sm')}Nuevo</button></div></div>
          <div class="field"><label for="e-date">Fecha</label><input class="input" id="e-date" type="date" data-f="issue_date" value="${draft.issue_date}"></div>
          <div class="field"><label for="e-due">${isInv ? 'Vencimiento' : 'Válido hasta'}</label><input class="input" id="e-due" type="date" data-f="due_date" value="${draft.due_date}"></div></div></section>
        <section class="card"><div class="card-h"><h2>Conceptos</h2><span class="spacer"></span>${S.items.length ? html`<select class="input" id="e-cat" style="width:auto;min-height:34px" aria-label="Añadir del catálogo"><option value="">Añadir del catálogo…</option>${S.items.map((i) => html`<option value="${i.id}">${i.name} · ${eur(i.price)}</option>`)}</select>` : ''}</div>
          <div class="card-b"><table class="lines"><thead><tr><th style="width:44%">Descripción</th><th style="width:9%">Cant.</th><th style="width:15%">Precio</th><th style="width:11%">IVA</th><th style="width:9%">Dto. %</th><th class="right" style="width:12%;text-align:right">Importe</th><th></th></tr></thead>
            <tbody id="lines">${draft.lines.map((l, i) => lineRow(l, i, t.detail[i]?.net))}</tbody></table>
            <button class="btn sm" data-act="addLine" type="button" style="margin-top:10px">${icon('plus', 'sm')}Añadir línea</button></div></section>
        <section class="card"><div class="card-b grid g2"><div class="field" style="grid-column:1/-1"><label for="e-notes">Notas ${isInv ? 'para el cliente' : 'y condiciones'}</label><textarea class="input" id="e-notes" data-f="notes" rows="3" placeholder="${isInv ? 'Forma de pago, referencias…' : 'Plazo de entrega, condiciones de pago…'}">${draft.notes}</textarea></div>
          <div class="field"><label for="e-irpf">Retención IRPF</label><select class="input" id="e-irpf" data-f="irpf">${[[0, 'Sin retención'], [7, '7 %'], [15, '15 % (profesionales)'], [19, '19 %']].map(([v, l]) => html`<option value="${v}" ${Number(draft.irpf) === v ? raw('selected') : ''}>${l}</option>`)}</select><span class="hint">Solo si eres autónomo y facturas a una empresa.</span></div></div></section>
      </div>
      <aside class="editor-side stack"><section class="card totals"><div class="card-b" id="totals">${totalsBlock(t)}</div>
        <div class="card-b" style="padding-top:0"><div class="stack" style="gap:8px">
          ${isInv ? html`<button class="btn primary" data-act="saveIssue" type="button" style="width:100%">${icon('check', 'sm')}Emitir factura</button>` : html`<button class="btn primary" data-act="saveDraft" data-go="1" type="button" style="width:100%">${icon('check', 'sm')}Guardar presupuesto</button>`}
          ${isInv ? html`<button class="btn" data-act="saveDraft" data-go="1" type="button" style="width:100%">Guardar borrador</button>` : ''}
          ${d ? html`<button class="btn ghost danger" data-act="deleteDoc" data-id="${d.id}" type="button">${icon('trash', 'sm')}Eliminar</button>` : ''}</div></div></section></aside>
    </div>`;
}
function lineRow(l, i, net = 0) {
  return html`<tr data-i="${i}"><td class="desc"><input class="input" data-l="desc" value="${l.desc}" placeholder="Describe el servicio o producto" aria-label="Descripción línea ${i + 1}"></td>
    <td data-lbl="Cantidad"><input class="input" data-l="qty" inputmode="decimal" value="${String(l.qty).replace('.', ',')}" aria-label="Cantidad"></td><td data-lbl="Precio"><input class="input" data-l="price" inputmode="decimal" value="${eurPlain(l.price)}" aria-label="Precio unitario"></td>
    <td data-lbl="IVA"><select class="input" data-l="iva" aria-label="IVA">${IVAS.map((v) => html`<option value="${v}" ${Number(l.iva) === v ? raw('selected') : ''}>${v} %</option>`)}</select></td>
    <td data-lbl="Dto. %"><input class="input" data-l="discount" inputmode="decimal" value="${l.discount || ''}" placeholder="0" aria-label="Descuento"></td><td class="amt" data-net>${eur(net)}</td>
    <td><button class="btn ghost icon sm" data-act="delLine" data-i="${i}" type="button" aria-label="Quitar línea">${icon('x', 'sm')}</button></td></tr>`;
}
function totalsBlock(t) {
  return html`<div class="tr"><span>Base imponible</span><span class="num">${eur(t.base)}</span></div>${t.ivaGroups.filter((g) => g.base).map((g) => html`<div class="tr"><span>IVA ${g.rate} %</span><span class="num">${eur(g.iva)}</span></div>`)}
    ${t.irpfTotal ? html`<div class="tr"><span>Retención IRPF</span><span class="num">−${eur(t.irpfTotal)}</span></div>` : ''}<div class="tr big"><span>Total</span><span class="num">${eur(t.total)}</span></div>`;
}
const num = (v) => parseFloat(String(v).replace(',', '.')) || 0;
function readDraft(root) {
  root.querySelectorAll('[data-f]').forEach((e) => { draft[e.dataset.f] = e.dataset.f === 'irpf' ? Number(e.value) : e.value; });
  draft.lines = [...root.querySelectorAll('#lines tr')].map((tr) => {
    const g = (k) => tr.querySelector(`[data-l="${k}"]`).value;
    return { desc: g('desc'), qty: num(g('qty')), price: toCents(g('price')), iva: Number(g('iva')), discount: num(g('discount')) };
  });
}
function mountEditor(root, S, key) {
  const ed = root.querySelector('#editor'); if (!ed) return;
  const update = () => {
    readDraft(root); const t = computeTotals(draft.lines, draft.irpf);
    root.querySelector('#totals').innerHTML = totalsBlock(t).toString();
    root.querySelectorAll('#lines tr').forEach((tr, i) => { tr.querySelector('[data-net]').textContent = eur(t.detail[i].net); });
  };
  ed.addEventListener('input', update); ed.addEventListener('change', update);
  ed.addEventListener('focusout', (e) => { if (e.target.dataset?.l === 'price') e.target.value = eurPlain(toCents(e.target.value)); });
  root.querySelector('#e-cat')?.addEventListener('change', (e) => {
    const it = S.items.find((x) => x.id === Number(e.target.value)); if (!it) return;
    readDraft(root); const empty = draft.lines.length === 1 && !draft.lines[0].desc && !draft.lines[0].price;
    const line = { desc: it.description ? `${it.name} — ${it.description}` : it.name, qty: 1, price: it.price, iva: it.iva, discount: 0 };
    if (empty) draft.lines = [line]; else draft.lines.push(line); window.dispatchEvent(new Event('rem-render'));
  });
}
on('addLine', () => { readDraft(document); draft.lines.push(blankLine(store.S)); window.dispatchEvent(new Event('rem-render')); setTimeout(() => document.querySelector('#lines tr:last-child [data-l="desc"]')?.focus(), 0); });
on('delLine', (el) => { readDraft(document); draft.lines.splice(Number(el.dataset.i), 1); if (!draft.lines.length) draft.lines.push(blankLine(store.S)); window.dispatchEvent(new Event('rem-render')); });
on('quickClient', () => { readDraft(document); clientModal(null, (c) => { draft.client_id = c.id; window.dispatchEvent(new Event('rem-render')); }); });

async function persist(goAfter) {
  readDraft(document);
  const payload = { type: KIND[draft.key].type, client_id: draft.client_id || null, issue_date: draft.issue_date, due_date: draft.due_date, irpf: draft.irpf, notes: draft.notes, lines: draft.lines.filter((l) => l.desc || l.price) };
  if (!payload.lines.length) { toast('Añade al menos un concepto.', 'err'); throw new Error('vacío'); }
  const d = await mutate(draft.id ? 'PUT' : 'POST', draft.id ? `/api/documents/${draft.id}` : '/api/documents', payload);
  draft = null; return d;
}
on('saveDraft', async (el) => { const key = draft.key; const d = await persist(); toast(key === 'facturas' ? 'Borrador guardado' : 'Presupuesto guardado'); go(`#/${key}/${d.id}`); });
on('saveIssue', async () => {
  readDraft(document);
  if (!draft.client_id) { toast('Elige un cliente para emitir la factura.', 'err'); document.getElementById('e-client')?.nextElementSibling?.focus(); return; }
  const t = computeTotals(draft.lines, draft.irpf);
  if (!(await confirmBox({ title: 'Emitir factura', text: `Se le asignará el siguiente número de la serie y dejará de poder editarse (si hay un error, se corrige con una factura rectificativa). Total: ${eur(t.total)}.`, ok: 'Emitir factura' }))) return;
  try { const d = await persist(); const issued = await mutate('POST', `/api/documents/${d.id}/issue`, {}, 'Factura emitida'); go(`#/facturas/${issued.id}`); }
  catch (e) { if (e.message !== 'vacío') { /* ya avisado */ } const id = draft?.id; }
});
on('deleteDoc', async (el) => {
  const d = store.S.documents.find((x) => x.id === Number(el.dataset.id));
  if (!(await confirmBox({ title: 'Eliminar documento', text: `Se eliminará ${docLabel(d)}. Esta acción no se puede deshacer.`, ok: 'Eliminar', danger: true }))) return;
  draft = null; await mutate('DELETE', `/api/documents/${d.id}`, undefined, 'Eliminado'); go(`#/${d.type === 'factura' ? 'facturas' : 'presupuestos'}`);
});

// ---------- detalle y hoja imprimible ----------
function sheet(S, d) {
  const c = clientOf(S, d.client_id) || {}, s = S.settings, t = computeTotals(d.lines, d.irpf), isInv = d.type === 'factura', st = statusOf(S, d);
  const title = d.corrects_id ? 'Factura rectificativa' : isInv ? 'Factura' : 'Presupuesto';
  return html`<article class="sheet" aria-label="${title} ${d.number}">
    <div class="sh"><div>${s.logo ? html`<img class="logo" src="${s.logo}" alt="">` : ''}<h2>${title}</h2><div class="small" style="font-size:14px;margin-top:2px"><b style="color:#1c1b22">${d.number || 'Borrador'}</b></div>
      ${st === 'cobrada' ? html`<div style="margin-top:12px"><span class="stamp" style="border-color:#15803d;color:#15803d">Cobrada</span></div>` : st === 'rectificada' ? html`<div style="margin-top:12px"><span class="stamp" style="border-color:#6b6a75;color:#6b6a75">Rectificada</span></div>` : ''}</div>
      <div style="text-align:right"><b>${s.company_name || 'Tu empresa'}</b><br>${s.company_nif ? html`NIF ${s.company_nif}<br>` : ''}${s.company_address || ''}${s.company_address ? html`<br>` : ''}${[s.company_zip, s.company_city].filter(Boolean).join(' ')}${s.company_email ? html`<br>${s.company_email}` : ''}${s.company_phone ? html`<br>${s.company_phone}` : ''}</div></div>
    <div class="sh" style="margin-bottom:0"><div><div class="small">${isInv ? 'Facturar a' : 'Presupuesto para'}</div><b>${c.name || '—'}</b>${c.nif ? html`<br>NIF ${c.nif}` : ''}${c.address ? html`<br>${c.address}` : ''}${c.city ? html`<br>${[c.zip, c.city].filter(Boolean).join(' ')}` : ''}</div>
      <div style="text-align:right"><div class="small">Fecha</div>${fdate(d.issue_date)}<div class="small" style="margin-top:8px">${isInv ? 'Vencimiento' : 'Válido hasta'}</div>${fdate(d.due_date)}</div></div>
    <table><thead><tr><th>Concepto</th><th class="r">Cant.</th><th class="r">Precio</th><th class="r">IVA</th><th class="r">Importe</th></tr></thead><tbody>
      ${d.lines.map((l, i) => html`<tr><td>${l.desc}${l.discount ? html`<div class="small">Descuento ${String(l.discount).replace('.', ',')} %</div>` : ''}</td><td class="r">${String(l.qty).replace('.', ',')}</td><td class="r">${eurPlain(l.price)}</td><td class="r">${l.iva} %</td><td class="r">${eur(t.detail[i].net)}</td></tr>`)}</tbody></table>
    <div class="sum"><div><span>Base imponible</span><span>${eur(t.base)}</span></div>${t.ivaGroups.filter((g) => g.base).map((g) => html`<div><span>IVA ${g.rate} % <span class="small">s/ ${eur(g.base)}</span></span><span>${eur(g.iva)}</span></div>`)}
      ${t.irpfTotal ? html`<div><span>Retención IRPF ${d.irpf} %</span><span>−${eur(t.irpfTotal)}</span></div>` : ''}<div class="big"><span>Total</span><span>${eur(t.total)}</span></div></div>
    ${isInv && s.company_iban ? html`<p style="margin-top:28px"><span class="small">Forma de pago</span><br>Transferencia a <b>${s.company_iban}</b></p>` : ''}
    ${d.notes ? html`<p style="margin-top:16px;white-space:pre-wrap">${d.notes}</p>` : ''}
    ${(isInv ? s.invoice_footer : s.quote_footer) ? html`<p class="small" style="margin-top:28px">${isInv ? s.invoice_footer : s.quote_footer}</p>` : ''}</article>`;
}

function detail(S, key, d) {
  const K = KIND[key], isInv = d.type === 'factura', st = statusOf(S, d), paid = paidOf(S, d.id), pending = d.total - paid, pays = S.payments.filter((p) => p.document_id === d.id);
  const src = d.source_id ? S.documents.find((x) => x.id === d.source_id) : null, cor = d.corrects_id ? S.documents.find((x) => x.id === d.corrects_id) : null;
  const child = !isInv ? S.documents.find((x) => x.source_id === d.id) : null, rect = S.documents.find((x) => x.corrects_id === d.id);
  const btn = (act, icn, label, cls = '') => html`<button class="btn ${cls}" data-act="${act}" data-id="${d.id}" style="width:100%;justify-content:flex-start">${icon(icn, 'sm')}${label}</button>`;
  return html`
    <a class="crumb" href="#/${key}">${icon('back', 'sm')}${K.many}</a>
    <div class="page-head"><div><h1>${d.number} ${badge(st)}</h1><p class="sub">${clientOf(S, d.client_id)?.name || ''} · ${fdate(d.issue_date)}</p></div></div>
    ${st === 'vencida' ? html`<div class="notice warn" style="margin-bottom:16px">${icon('alert')}<span>Venció ${relDate(d.due_date, S.serverDate)}. Quedan <b>${eur(pending)}</b> por cobrar.</span></div>` : ''}
    <div class="editor"><div>${sheet(S, d)}</div>
      <aside class="editor-side stack no-print">
        <section class="card"><div class="card-b stack" style="gap:8px">
          ${isInv ? html`
            ${d.status === 'emitida' && pending > 0 && d.total > 0 ? btn('addPayment', 'coins', 'Registrar cobro', 'primary') : ''}
            ${d.status === 'emitida' && d.total > 0 ? btn('sendInvoice', 'mail', 'Enviar al cliente') : ''}
            ${st === 'vencida' || (d.status === 'emitida' && pending > 0 && d.total > 0 && st !== 'cobrada') ? btn('remind', 'alert', 'Reclamar el pago') : ''}`
          : html`
            ${d.status === 'borrador' ? btn('sendQuote', 'mail', 'Enviar al cliente', 'primary') : ''}
            ${['enviado'].includes(d.status) ? btn('quoteStatus', 'check', 'Marcar como aceptado', 'primary') : ''}
            ${['enviado'].includes(d.status) ? html`<button class="btn" data-act="quoteStatus" data-id="${d.id}" data-s="rechazado" style="width:100%;justify-content:flex-start">${icon('x', 'sm')}Marcar como rechazado</button>` : ''}
            ${['aceptado', 'enviado', 'borrador'].includes(d.status) ? btn('convert', 'facturas', 'Convertir en factura', d.status === 'aceptado' ? 'primary' : '') : ''}
            ${d.status === 'enviado' || d.status === 'rechazado' ? btn('sendQuote', 'mail', 'Reenviar') : ''}
            ${d.status !== 'facturado' ? html`<a class="btn" href="#/presupuestos/${d.id}/editar" style="width:100%;justify-content:flex-start">${icon('edit', 'sm')}Editar</a>` : ''}`}
          <button class="btn" data-act="print" style="width:100%;justify-content:flex-start">${icon('print', 'sm')}Imprimir / guardar PDF</button>
          ${btn('duplicate', 'copy', 'Duplicar')}
          ${isInv && d.status === 'emitida' && !d.corrects_id ? btn('rectify', 'edit', 'Rectificar factura', 'danger') : ''}
          ${!isInv && d.status !== 'facturado' ? btn('deleteDoc', 'trash', 'Eliminar', 'danger') : ''}</div></section>
        ${isInv && d.status === 'emitida' && d.total > 0 ? html`<section class="card"><div class="card-h"><h2>Cobros</h2></div><div class="card-b"><div class="progress" role="progressbar" aria-valuenow="${Math.round(paid / d.total * 100)}" aria-valuemin="0" aria-valuemax="100" aria-label="Cobrado"><i style="width:${Math.min(100, paid / d.total * 100)}%"></i></div>
          <div class="row" style="margin:8px 0 12px;justify-content:space-between"><span class="muted">Cobrado ${eur(paid)}</span><b>${pending > 0 ? `Pendiente ${eur(pending)}` : 'Al día'}</b></div>
          ${pays.length ? html`<ul class="list" style="margin:0 -18px -18px">${pays.map((p) => html`<li><div class="grow"><div class="t">${eur(p.amount)}</div><div class="d">${fdate(p.date)} · ${p.method}</div></div><button class="btn ghost icon sm" data-act="deletePayment" data-id="${p.id}" aria-label="Anular cobro">${icon('x', 'sm')}</button></li>`)}</ul>` : html`<p class="muted">Todavía no se ha registrado ningún cobro.</p>`}</div></section>` : ''}
        ${src || cor || child || rect ? html`<section class="card"><div class="card-h"><h2>Relacionado</h2></div><ul class="list">${[src && [src, 'Presupuesto de origen'], cor && [cor, 'Factura que rectifica'], child && [child, 'Factura generada'], rect && [rect, 'Rectificada por']].filter(Boolean).map(([x, l]) => html`<li class="link" data-href="#/${x.type === 'factura' ? 'facturas' : 'presupuestos'}/${x.id}"><div class="grow"><div class="t">${x.number || 'Borrador'}</div><div class="d">${l}</div></div>${icon('arrow', 'sm')}</li>`)}</ul></section>` : ''}
      </aside></div>`;
}
const docOf = (el) => store.S.documents.find((x) => x.id === Number(el.dataset.id));
on('remind', (el) => { const S = store.S, d = docOf(el); messageModal({ title: 'Reclamar el pago', client: clientOf(S, d.client_id), ...reminderText(S, d) }); });
on('sendInvoice', (el) => { const S = store.S, d = docOf(el); messageModal({ title: 'Enviar factura', client: clientOf(S, d.client_id), ...invoiceText(S, d) }); });
on('sendQuote', (el) => { const S = store.S, d = docOf(el); messageModal({ title: 'Enviar presupuesto', client: clientOf(S, d.client_id), ...quoteText(S, d), onDone: async () => { if (d.status === 'borrador') await mutate('POST', `/api/documents/${d.id}/status`, { status: 'enviado' }); } }); });
on('quoteStatus', (el) => mutate('POST', `/api/documents/${el.dataset.id}/status`, { status: el.dataset.s || 'aceptado' }, 'Estado actualizado'));
on('convert', async (el) => { const inv = await mutate('POST', `/api/documents/${el.dataset.id}/convert`, {}, 'Borrador de factura creado'); go(`#/facturas/${inv.id}`); });
on('duplicate', async (el) => { const d = docOf(el), n = await mutate('POST', `/api/documents/${d.id}/duplicate`, {}, 'Documento duplicado'); go(`#/${d.type === 'factura' ? 'facturas' : 'presupuestos'}/${n.id}${n.type === 'presupuesto' ? '/editar' : ''}`); });
on('rectify', async (el) => {
  const d = docOf(el);
  if (!(await confirmBox({ title: 'Rectificar factura', text: `Se creará una factura rectificativa por el importe contrario y ${d.number} quedará marcada como rectificada. Después podrás emitir una factura correcta.`, ok: 'Crear rectificativa', danger: true }))) return;
  const r = await mutate('POST', `/api/documents/${d.id}/rectify`, {}, 'Factura rectificativa creada'); go(`#/facturas/${r.id}`);
});

on('print', () => window.print());

on('sortBy', (el) => { const st = state[el.dataset.t], k = el.dataset.k, first = k === 'total' || k === 'fecha' ? -1 : 1; if (!st.sort || st.sort.k !== k) st.sort = { k, dir: first }; else if (st.sort.dir === first) st.sort = { k, dir: -first }; else st.sort = null; window.dispatchEvent(new Event('rem-render')); });
