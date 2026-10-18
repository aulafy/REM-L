import { store, on, mutate, toast, formModal, field, openModal, confirmBox } from '../core.js';
import { api, esc, eurPlain, toCents } from '../util.js';
import { html, eur, fdate, icon, norm, plural } from '../util.js';

let q = '', cat = '';
export const views = {
  gastos: {
    title: () => 'Gastos',
    render(S) {
      const cats = [...new Set(S.expenses.map((e) => e.category))].sort();
      const rows = S.expenses.filter((e) => (!cat || e.category === cat) && (!q || norm(`${e.concept} ${e.supplier}`).includes(norm(q))));
      const total = rows.reduce((a, e) => a + e.total, 0), base = rows.reduce((a, e) => a + e.base, 0);
      return html`
        <div class="page-head"><div><h1>Gastos</h1><p class="sub">Apunta lo que pagas para saber cuánto ganas de verdad y cuánto IVA puedes deducir.</p></div><div class="actions"><label class="btn" for="tk-in">${icon('download', 'sm')}Subir ticket</label><input id="tk-in" class="sr" type="file" accept="image/*" capture="environment" multiple><button class="btn primary" data-act="newExpense">${icon('plus', 'sm')}Nuevo gasto</button></div></div>
        ${ticketsCard(S)}
        <div class="toolbar"><input class="input" id="gq" type="search" placeholder="Buscar concepto o proveedor…" value="${q}" aria-label="Buscar gastos">
          <select class="input" id="gcat" style="max-width:220px" aria-label="Categoría"><option value="">Todas las categorías</option>${cats.map((c) => html`<option ${c === cat ? 'selected' : ''} value="${c}">${c[0].toUpperCase() + c.slice(1)}</option>`)}</select></div>
        <div class="card">${rows.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Concepto</th><th class="hide-sm">Categoría</th><th class="hide-sm">Fecha</th><th class="right hide-sm">Base</th><th class="right">Total</th><th></th></tr></thead><tbody>
          ${rows.map((e) => html`<tr><td><span class="name">${e.concept}</span><br><small class="muted">${e.supplier}</small></td><td class="hide-sm"><span class="badge grey">${e.category}</span></td><td class="hide-sm nowrap">${fdate(e.date)}</td><td class="right num hide-sm">${eur(e.base)}</td><td class="right num"><b>${eur(e.total)}</b></td>
            <td class="right nowrap"><button class="btn ghost icon sm" data-act="repeatExpense" data-id="${e.id}" aria-label="Repetir ${e.concept} cada periodo" title="Repetir">${icon('refresh', 'sm')}</button><button class="btn ghost icon sm" data-act="editExpense" data-id="${e.id}" aria-label="Editar ${e.concept}">${icon('edit', 'sm')}</button><button class="btn ghost icon sm" data-act="deleteExpense" data-id="${e.id}" aria-label="Eliminar ${e.concept}">${icon('trash', 'sm')}</button></td></tr>`)}</tbody></table></div>
          <div class="card-h" style="border-top:1px solid var(--line);border-bottom:0;background:var(--surface-2);border-radius:0 0 var(--r) var(--r)"><span class="muted">${plural(rows.length, 'gasto', 'gastos')}</span><span class="spacer"></span><span class="muted">Base ${eur(base)} · Total <b style="color:var(--ink)">${eur(total)}</b></span></div>`
          : html`<div class="empty">${icon('gastos')}<h3>${S.expenses.length ? 'Sin resultados' : 'Aún no hay gastos'}</h3><p>${S.expenses.length ? 'Cambia la búsqueda o la categoría.' : 'Registra alquiler, material, suministros… y tus informes de IVA y resultados serán fiables.'}</p>${S.expenses.length ? '' : html`<button class="btn primary" data-act="newExpense">Añadir el primero</button>`}</div>`}</div>`;
    },
    mount(root) {
      const inp = root.querySelector('#tk-in'); inp?.addEventListener('change', () => uploadFiles([...inp.files]));
      const page = root.querySelector('#page'); ['dragover', 'drop'].forEach((ev) => page?.addEventListener(ev, (e) => { e.preventDefault(); if (ev === 'drop') uploadFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))); }));
      const i = root.querySelector('#gq'); i?.addEventListener('input', () => { q = i.value; const p = i.selectionStart; window.dispatchEvent(new Event('rem-render')); const n = document.getElementById('gq'); n?.focus(); n?.setSelectionRange(p, p); });
      root.querySelector('#gcat')?.addEventListener('change', (e) => { cat = e.target.value; window.dispatchEvent(new Event('rem-render')); });
    },
  },
};

const STATUS_TK = { procesando: ['Leyendo…', 'amber'], por_revisar: ['Por revisar', 'blue'], error: ['No se pudo leer', 'red'] };
function ticketsCard(S) {
  const list = (S.attachments || []).filter((a) => ['procesando', 'por_revisar', 'error'].includes(a.status));
  if (!list.length) return '';
  return html`<section class="card" style="margin-bottom:18px" aria-labelledby="h-tk"><div class="card-h"><h2 id="h-tk">Tickets y documentos</h2><span class="muted more" style="font-size:12.5px">Leídos en tu equipo · revisa antes de crear el gasto</span></div>
    <ul class="list">${list.map((a) => html`<li>${a.mime === 'application/pdf' ? html`<span class="thumb pdf" aria-hidden="true">PDF</span>` : html`<img class="thumb" src="/api/attachments/${a.id}/file" alt="" loading="lazy">`}<div class="grow"><div class="t">${a.parsed.supplier || a.name}${a.source !== 'app' ? html` <span class="chip">${icon(a.source === 'telegram' ? 'send' : 'mail', 'sm')}${a.source === 'telegram' ? 'Telegram' : 'Correo'}${a.peer ? ' · ' + a.peer : ''}</span>` : ''}</div><div class="d">${a.status === 'por_revisar' ? `${a.parsed.total != null ? eur(Math.round(a.parsed.total * 100)) + ' · ' : ''}${a.parsed.date || 'sin fecha'}${a.flags.length ? ' · ' + a.flags.length + (a.flags.length === 1 ? ' aviso' : ' avisos') : ''}` : a.status === 'procesando' ? 'Leyendo con OCR local…' : 'Prueba con otra foto más nítida'}</div></div>
      <span class="badge ${STATUS_TK[a.status][1]}">${STATUS_TK[a.status][0]}</span>
      ${a.status === 'por_revisar' ? html`<button class="btn sm primary" data-act="reviewTicket" data-id="${a.id}">Revisar</button>` : a.status === 'error' ? html`<button class="btn sm" data-act="retryTicket" data-id="${a.id}">Reintentar</button>` : ''}
      <button class="btn ghost icon sm" data-act="discardTicket" data-id="${a.id}" aria-label="Descartar" title="Descartar">${icon('x', 'sm')}</button></li>`)}</ul></section>`;
}

// Reduce la foto en el navegador (más rápido y ligero); si no se puede decodificar (p. ej. HEIC en Chrome), se envía tal cual.
async function prepare(file) {
  try {
    const bmp = await createImageBitmap(file), k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height)), c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height); const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)); return { blob, mime: 'image/jpeg' };
  } catch { return { blob: file, mime: file.type }; }
}
const b64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });
async function uploadFiles(files) {
  if (!files.length) return;
  for (const f of files) {
    try { const { blob, mime } = await prepare(f); await api('POST', '/api/attachments', { name: f.name, mime, data: await b64(blob) }); } catch (e) { toast(`${f.name}: ${e.message}`, 'err'); }
  }
  const { reload, refresh } = await import('../core.js'); await reload(); refresh(); toast(files.length === 1 ? 'Ticket subido: leyéndolo…' : `${files.length} tickets subidos: leyéndolos…`);
}
const CATS = ['alquiler', 'material', 'suministros', 'vehículo', 'servicios profesionales', 'marketing', 'impuestos y tasas', 'otros'];
on('reviewTicket', (el) => {
  const a = store.S.attachments.find((x) => x.id === Number(el.dataset.id)), p = a.parsed, F = (k) => a.flags.find((f) => f.field === k);
  const fl = (k) => F(k) ? html`<span class="err" style="font-size:12px;color:var(--orange)">${F(k).msg}</span>` : '';
  formModal({ title: 'Revisar ticket', wide: true, submit: 'Crear gasto',
    fields: html`<div style="grid-column:1/-1;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);gap:20px" class="tk-review"><div>${a.mime === 'application/pdf' ? html`<iframe class="tk-img" style="height:56vh;border:1px solid var(--line)" src="/api/attachments/${a.id}/file" title="Documento PDF"></iframe>` : html`<img class="tk-img" src="/api/attachments/${a.id}/file" alt="Foto del ticket">`}<p class="muted" style="font-size:12px;margin-top:8px">Leído con ${a.engine || 'OCR'}</p>${a.sensitive ? html`<div class="notice warn" style="margin-top:8px">${icon('shield')}<span>Parece un documento personal. No se envía a ningún modelo; se guarda solo en tu equipo.</span></div>` : ''}</div>
      <div class="grid">${a.flags.length ? html`<div class="notice warn">${icon('alert')}<span><b>Revisa estos datos:</b> ${a.flags.map((f) => f.msg).join(' · ')}</span></div>` : html`<div class="notice">${icon('check')}<span>Los importes aparecen en el texto leído y cuadran.</span></div>`}
        ${field({ name: 'supplier', label: 'Proveedor', value: p.supplier || '' })}${field({ name: 'concept', label: 'Concepto', value: p.concept || '' })}
        <div class="grid g2">${field({ name: 'date', label: 'Fecha', type: 'date', value: p.date || '', required: true, hint: F('date')?.msg || '' })}${field({ name: 'category', label: 'Categoría', options: CATS.map((c) => [c, c[0].toUpperCase() + c.slice(1)]), value: p.category || 'otros' })}
        ${field({ name: 'total', label: 'Total (IVA incl.)', value: p.total != null ? eurPlain(Math.round(p.total * 100)) : '', required: true, hint: F('total')?.msg || '', attrs: 'inputmode="decimal"' })}${field({ name: 'iva', label: 'IVA', options: [[21, '21 %'], [10, '10 %'], [4, '4 %'], [0, 'Sin IVA']], value: p.iva ?? 21 })}</div>
        ${a.text ? html`<details class="src"><summary>${icon('book', 'sm')}Texto leído</summary><p style="white-space:pre-wrap;font-family:ui-monospace,Menlo,monospace;font-size:12px">${a.text}</p></details>` : ''}</div></div>`.toString(),
    extraFooter: `<button class="btn danger" type="button" id="tk-del">Borrar documento</button>`,
    onSubmit: async (v, close) => { const total = toCents(v.total); if (total <= 0) throw new Error('Introduce un importe mayor que cero.'); await mutate('POST', `/api/attachments/${a.id}/expense`, { supplier: v.supplier, concept: v.concept, date: v.date, category: v.category, total: total / 100, iva: Number(v.iva) }, 'Gasto creado'); close(); } });
  document.getElementById('tk-del')?.addEventListener('click', async () => { if (await confirmBox({ title: 'Borrar documento', text: 'Se elimina la foto y el texto leído de tu equipo.', ok: 'Borrar', danger: true })) { await mutate('DELETE', `/api/attachments/${a.id}`, undefined, 'Documento borrado'); document.querySelector('.overlay [data-close]')?.click(); } });
});
on('retryTicket', (el) => mutate('POST', `/api/attachments/${el.dataset.id}/retry`, {}));
on('discardTicket', async (el) => { await mutate('POST', `/api/attachments/${el.dataset.id}/discard`, {}); });
