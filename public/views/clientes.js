import { store, on, go, mutate, toast } from '../core.js';
import { extCard, bindExt } from '../ext.js';
import { downloadPdf, downloadDocx } from '../pdfdl.js';
import { BUILTIN, mdToHtml, renderDoc, docVars, docCss } from '../doctpl.js';
import { openModal } from '../core.js';
import { timelineOf, GROUPS } from '../timeline.js';
import { filesCard, bindFiles } from '../filesui.js';
import { fdate as fd2 } from '../util.js';
import { html, raw, eur, fdate, fdateShort, relDate, icon, badge, avatar, clientOf, paidOf, statusOf, norm, plural } from '../util.js';

function clientStats(S, c) {
  const docs = S.documents.filter((d) => d.client_id === c.id);
  const inv = docs.filter((d) => d.type === 'factura' && d.status !== 'borrador');
  const billed = inv.reduce((a, d) => a + d.total, 0);
  const paid = inv.reduce((a, d) => a + (d.status === 'rectificada' ? 0 : paidOf(S, d.id)), 0);
  const openInv = inv.filter((d) => d.status === 'emitida' && d.total > 0);
  const pending = openInv.reduce((a, d) => a + Math.max(0, d.total - paidOf(S, d.id)), 0);
  const overdue = openInv.filter((d) => statusOf(S, d) === 'vencida').length;
  const last = docs.map((d) => d.issue_date).sort().pop();
  return { docs, billed, pending, overdue, last };
}

let q = '', filter = 'todos', sort = null, tlGroup = 'todo', tlQ = '', tlShow = 25;
const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const tlWhen = (i) => (i.at.length > 10 && (i.group === 'mensajes') ? new Date(i.at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : fdate(i.at.slice(0, 10)));
const tlRow = (i) => html`<li class="tl-row ${i.href ? 'link' : ''}" ${i.href ? raw(`data-href="${i.href}" tabindex="0"`) : ''}><span class="tl-ic ${['vencida'].includes(i.kind) ? 'warn' : ['cobro', 'factura', 'rectificativa'].includes(i.kind) || i.kind.startsWith('presupuesto-a') ? 'ok' : i.group === 'mensajes' ? 'msg' : ''}">${icon(i.icon, 'sm')}</span><div class="grow"><div class="t">${i.title}</div>${i.detail ? html`<div class="d tl-d">${i.detail}</div>` : ''}</div><span class="when nowrap">${tlWhen(i)}</span></li>`;
function historyCard(S, id) {
  const tl = timelineOf(S, id), ok = (i) => (tlGroup === 'todo' || i.group === tlGroup) && (!tlQ || norm(`${i.title} ${i.detail || ''}`).includes(norm(tlQ)));
  const up = tl.upcoming.filter(ok), past = tl.past.filter(ok), shown = past.slice(0, tlShow); let cur = '';
  return html`<section class="card" style="margin-top:18px" aria-labelledby="h-tl"><div class="card-h" style="flex-wrap:wrap"><h2 id="h-tl">Historial</h2><span class="muted" style="font-size:12.5px">${tl.past.length} movimientos</span><span class="spacer"></span>
    <div class="seg" role="group" aria-label="Filtrar historial">${[['todo', 'Todo'], ...Object.entries(GROUPS)].map(([k, l]) => html`<button data-act="tlf" data-k="${k}" aria-pressed="${tlGroup === k}">${l}</button>`)}</div><input class="input" id="tlq" type="search" placeholder="Buscar…" value="${tlQ}" aria-label="Buscar en el historial" style="max-width:200px;min-height:36px"></div>
    ${up.length ? html`<div class="tl-h">Próximamente</div><ul class="list tl">${up.map(tlRow)}</ul>` : ''}
    ${shown.length ? html`<ul class="list tl">${shown.map((i) => { const m = i.at.slice(0, 7), head = m !== cur ? (cur = m, html`<li class="tl-h" role="presentation">${MONTHS_ES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}</li>`) : ''; return html`${head}${tlRow(i)}`; })}</ul>${past.length > shown.length ? html`<div class="card-b" style="text-align:center"><button class="btn sm" data-act="tlmore">Ver más (${past.length - shown.length})</button></div>` : ''}`
      : html`<div class="empty" style="padding:28px"><p>${tlQ || tlGroup !== 'todo' ? 'Nada con ese filtro.' : 'Aún no hay movimientos.'}</p></div>`}</section>`;
}
const CS = { nombre: ({ c }) => c.name.toLowerCase(), facturado: ({ s }) => s.billed, pendiente: ({ s }) => s.pending };
const cth = (k, label, cls = '') => html`<th class="${cls}" aria-sort="${sort?.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}"><button class="sortbtn" data-act="csort" data-k="${k}">${label}<span class="arr">${sort?.k === k ? (sort.dir === 1 ? '↑' : '↓') : ''}</span></button></th>`;

export const views = {
  clientes: {
    title: (S, p) => (p[0] ? clientOf(S, Number(p[0]))?.name || 'Cliente' : 'Clientes'),
    render(S, p) {
      if (p[0]) return detail(S, Number(p[0]));
      const list = S.clients.filter((c) => !c.archived).map((c) => ({ c, s: clientStats(S, c) }))
        .filter(({ c, s }) => (!q || norm(`${c.name} ${c.nif} ${c.email} ${c.city} ${c.phone}`).includes(norm(q))) && (filter === 'todos' || (filter === 'deuda' && s.pending > 0) || (filter === 'vencido' && s.overdue > 0)));
      if (sort) list.sort((a, b) => { const x = CS[sort.k](a), y = CS[sort.k](b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
      return html`
        <div class="page-head"><div><h1>Clientes</h1><p class="sub">${plural(S.clients.filter((c) => !c.archived).length, 'cliente', 'clientes')}</p></div><div class="actions"><label class="btn" for="csv-in">${icon('download', 'sm')}Importar CSV</label><input id="csv-in" class="sr" type="file" accept=".csv,text/csv"><button class="btn primary" data-act="newClient">${icon('plus', 'sm')}Nuevo cliente</button></div></div>
        <div class="toolbar"><input class="input" id="cq" type="search" placeholder="Buscar por nombre, NIF, email…" value="${q}" aria-label="Buscar clientes">
          <div class="seg" role="group" aria-label="Filtrar">${[['todos', 'Todos'], ['deuda', 'Con deuda'], ['vencido', 'Con vencidas']].map(([k, l]) => html`<button data-act="cfilter" data-k="${k}" aria-pressed="${filter === k}">${l}</button>`)}</div></div>
        <div class="card">${list.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr>${cth('nombre', 'Cliente')}<th class="hide-sm">Contacto</th>${cth('facturado', 'Facturado', 'right')}${cth('pendiente', 'Pendiente', 'right')}</tr></thead><tbody>
          ${list.map(({ c, s }) => html`<tr class="link" data-href="#/clientes/${c.id}" tabindex="0"><td><div class="cell-client">${avatar(c.name)}<div><span class="name">${c.name}</span><small>${[c.nif, c.city].filter(Boolean).join(' · ') || 'Sin datos fiscales'}</small></div></div></td>
            <td class="hide-sm"><div>${c.email || '—'}</div><small class="muted">${c.phone}</small></td><td class="right num">${eur(s.billed)}</td>
            <td class="right num">${s.pending ? html`<span style="${s.overdue ? 'color:var(--red);font-weight:600' : ''}">${eur(s.pending)}</span>` : html`<span class="muted">—</span>`}</td></tr>`)}</tbody></table></div>`
          : html`<div class="empty">${icon('clientes')}<h3>${q || filter !== 'todos' ? 'Sin resultados' : 'Aún no tienes clientes'}</h3><p>${q || filter !== 'todos' ? 'Prueba con otra búsqueda o quita el filtro.' : 'Guarda aquí a quién le vendes: tendrás su historial, cobros y notas en un solo sitio.'}</p>${q || filter !== 'todos' ? '' : html`<button class="btn primary" data-act="newClient">Crear el primero</button>`}</div>`}</div>`;
    },
    mount(root) {
      bindExt(root); bindFiles(root);
      const tq = root.querySelector('#tlq'); tq?.addEventListener('input', () => { tlQ = tq.value; tlShow = 25; const pos = tq.selectionStart; window.dispatchEvent(new Event('rem-render')); const n = document.getElementById('tlq'); n?.focus(); n?.setSelectionRange(pos, pos); });
      root.querySelector('#csv-in')?.addEventListener('change', async (e) => {
        const f = e.target.files[0]; if (!f) return;
        const rows = parseCsv(await f.text());
        if (!rows.length) return toast('No se encontraron clientes. La primera fila debe tener cabeceras (nombre, nif, email, teléfono…).', 'err');
        const r = await mutate('POST', '/api/clients/import', { rows });
        toast(`${r.added} clientes importados${r.skipped ? `, ${r.skipped} omitidos (sin nombre o NIF repetido)` : ''}`);
      });
      const i = root.querySelector('#cq');
      if (i) i.addEventListener('input', () => { q = i.value; const pos = i.selectionStart; window.dispatchEvent(new Event('rem-render')); const n = document.getElementById('cq'); n?.focus(); n?.setSelectionRange(pos, pos); });
    },
  },
};

function detail(S, id) {
  const c = clientOf(S, id);
  if (!c) return html`<div class="empty"><h3>Cliente no encontrado</h3><a class="btn" href="#/clientes">Volver</a></div>`;
  const s = clientStats(S, c), tasks = S.tasks.filter((t) => t.client_id === id);
  const docs = s.docs.slice().sort((a, b) => b.issue_date.localeCompare(a.issue_date));
  return html`
    <a class="crumb" href="#/clientes">${icon('back', 'sm')}Clientes</a>
    <div class="page-head"><div class="row" style="gap:16px">${avatar(c.name, 'lg')}<div><h1>${c.name}</h1><p class="sub">${[c.nif, [c.address, c.zip, c.city].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'Sin datos fiscales'}</p></div></div>
      <div class="actions"><button class="btn" data-act="editClient" data-id="${c.id}">${icon('edit', 'sm')}Editar</button><button class="btn" data-act="clientPdf" data-id="${c.id}">${icon('download', 'sm')}Extracto PDF</button><button class="btn" data-act="clientDoc" data-id="${c.id}">${icon('presupuestos', 'sm')}Documento…</button><a class="btn" href="#/presupuestos/nuevo?cliente=${c.id}">Presupuesto</a><a class="btn primary" href="#/facturas/nueva?cliente=${c.id}">${icon('plus', 'sm')}Factura</a></div></div>
    ${!c.nif ? html`<div class="notice warn" style="margin-bottom:16px">${icon('alert')}<span>Falta el NIF/CIF: lo necesitarás para emitir facturas a este cliente. <a href="#" data-act="editClient" data-id="${c.id}">Añadirlo</a></span></div>` : ''}
    <div class="kpis" style="grid-template-columns:repeat(3,minmax(0,1fr))"><div class="card kpi"><div class="l">Facturado en total</div><div class="v">${eur(s.billed)}</div></div>
      <div class="card kpi ${s.overdue ? 'warn' : ''}"><div class="l">Pendiente de cobro</div><div class="v">${eur(s.pending)}</div><div class="s">${s.overdue ? plural(s.overdue, 'factura vencida', 'facturas vencidas') : 'Sin vencidas'}</div></div>
      <div class="card kpi"><div class="l">Último movimiento</div><div class="v" style="font-size:19px;padding-top:4px">${s.last ? fdate(s.last) : '—'}</div></div></div>
    <div class="cols"><section class="card"><div class="card-h"><h2>Documentos</h2></div>
      ${docs.length ? html`<div class="tbl-wrap"><table class="tbl"><tbody>${docs.map((d) => html`<tr class="link" data-href="#/${{ factura: 'facturas', albaran: 'albaranes' }[d.type] || 'presupuestos'}/${d.id}" tabindex="0"><td><span class="name">${d.number || 'Borrador'}</span><br><small class="muted">${d.type === 'factura' ? 'Factura' : 'Presupuesto'} · ${fdate(d.issue_date)}</small></td><td>${badge(statusOf(S, d))}</td><td class="right num">${eur(d.total)}</td></tr>`)}</tbody></table></div>`
        : html`<div class="empty">${icon('facturas')}<p>Todavía no hay documentos para este cliente.</p></div>`}</section>
      <div class="stack"><section class="card"><div class="card-h"><h2>Contacto</h2></div><div class="card-b"><dl class="kv" style="grid-template-columns:auto 1fr;font-size:13.5px">
        <dt>Email</dt><dd>${c.email ? html`<a href="mailto:${c.email}">${c.email}</a>` : '—'}</dd><dt>Teléfono</dt><dd>${c.phone ? html`<a href="tel:${c.phone}">${c.phone}</a>` : '—'}</dd></dl>
        ${c.notes ? html`<hr style="border:0;border-top:1px solid var(--line);margin:14px 0"><p style="white-space:pre-wrap;color:var(--ink-2)">${c.notes}</p>` : ''}</div></section>
        ${extCard(S, 'clients', c.id)}
        ${filesCard(S, 'client', c.id)}
        <section class="card"><div class="card-h"><h2>Lo que recuerda el asistente</h2><button class="btn sm ghost more" data-act="addMemory" data-client="${c.id}">${icon('plus', 'sm')}Añadir</button></div>${S.memory.filter((x) => x.client_id === c.id).length ? html`<ul class="list">${S.memory.filter((x) => x.client_id === c.id).map((x) => html`<li><div class="grow"><div class="t" style="white-space:normal">${x.text}</div><div class="d">${x.source === 'asistente' ? 'Propuesto y aprobado' : 'Escrito por ti'}</div></div><button class="btn ghost icon sm" data-act="editMemory" data-id="${x.id}" aria-label="Editar">${icon('edit', 'sm')}</button><button class="btn ghost icon sm" data-act="delMemory" data-id="${x.id}" aria-label="Borrar">${icon('trash', 'sm')}</button></li>`)}</ul>` : html`<div class="empty" style="padding:22px"><p>Nada guardado. Apunta preferencias o acuerdos para que las tenga en cuenta.</p></div>`}</section>
        <section class="card"><div class="card-h"><h2>Tareas</h2><button class="btn sm ghost more" data-act="newTask" data-client="${c.id}">${icon('plus', 'sm')}Añadir</button></div>
          ${tasks.length ? html`<ul class="list">${tasks.map((k) => html`<li><input type="checkbox" class="check" data-act="toggleTask" data-id="${k.id}" ${k.done ? raw('checked') : ''} aria-label="Completar: ${k.title}"><div class="grow"><div class="t ${k.done ? 'done-t' : ''}">${k.title}</div><div class="d">${k.due ? fdateShort(k.due) : 'Sin fecha'}</div></div></li>`)}</ul>` : html`<div class="empty" style="padding:24px"><p>Sin tareas para este cliente.</p></div>`}</section>
        <button class="btn danger" data-act="deleteClient" data-id="${c.id}">${icon('trash', 'sm')}Eliminar cliente</button></div></div>
    ${historyCard(S, c.id)}`;
}

on('cfilter', (el) => { filter = el.dataset.k; window.dispatchEvent(new Event('rem-render')); });

// CSV sencillo (separador ; o , y comillas); la primera fila son cabeceras.
function parseCsv(text) {
  text = text.replace(/^\ufeff/, '');
  const sep = (text.split('\n')[0].match(/;/g) || []).length >= (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true; else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  const [head, ...data] = rows.filter((r) => r.some((x) => x.trim()));
  if (!head) return [];
  const map = { name: /^(nombre|raz[oó]n|cliente|name|empresa)/i, nif: /^(nif|cif|dni|nie|vat)/i, email: /mail|correo/i, phone: /tel|m[oó]vil|phone/i, address: /direcc|domicil|address/i, city: /poblaci|ciudad|localidad|city/i, zip: /postal|cp$|zip/i };
  const idx = Object.fromEntries(Object.entries(map).map(([k, re]) => [k, head.findIndex((h) => re.test(h.trim()))]));
  return data.map((r) => Object.fromEntries(Object.entries(idx).map(([k, i]) => [k, i >= 0 ? (r[i] || '').trim() : ''])));
}

on('csort', (el) => { const k = el.dataset.k, asc = k === 'nombre'; sort = !sort || sort.k !== k ? { k, dir: asc ? 1 : -1 } : sort.dir === (asc ? 1 : -1) ? { k, dir: -sort.dir } : null; window.dispatchEvent(new Event('rem-render')); });

on('clientPdf', () => {
  const S = store.S, c = clientOf(S, Number(document.querySelector('[data-act="clientPdf"]').dataset.id)), s = S.settings, esc = (x) => String(x ?? '').replace(/[<>&"]/g, (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[m]));
  const inv = S.documents.filter((d) => d.client_id === c.id && d.type === 'factura' && d.status === 'emitida').sort((a, b) => a.issue_date.localeCompare(b.issue_date));
  const rows = inv.map((d) => ({ d, paid: paidOf(S, d.id) })), tot = rows.reduce((a, r) => a + r.d.total, 0), cob = rows.reduce((a, r) => a + r.paid, 0);
  downloadPdf(`<h1>Extracto de cuenta</h1><p class="muted">${esc(s.company_name)}${s.company_nif ? ' · NIF ' + esc(s.company_nif) : ''} · ${new Date().toLocaleDateString('es-ES')}</p>
    <h2>${esc(c.name)}</h2><p class="muted">${esc([c.nif && 'NIF ' + c.nif, c.address, [c.zip, c.city].filter(Boolean).join(' ')].filter(Boolean).join(' · '))}</p>
    <table><thead><tr><th>Factura</th><th>Fecha</th><th>Vencimiento</th><th class="r">Importe</th><th class="r">Cobrado</th><th class="r">Pendiente</th></tr></thead><tbody>${rows.map(({ d, paid }) => `<tr><td>${esc(d.number)}</td><td>${fd2(d.issue_date)}</td><td>${fd2(d.due_date)}</td><td class="r">${eur(d.total)}</td><td class="r">${eur(paid)}</td><td class="r">${eur(d.total - paid)}</td></tr>`).join('') || '<tr><td colspan="6">Sin facturas emitidas</td></tr>'}
    <tr><td colspan="3"><b>Total</b></td><td class="r"><b>${eur(tot)}</b></td><td class="r"><b>${eur(cob)}</b></td><td class="r"><b>${eur(tot - cob)}</b></td></tr></tbody></table>`, `Extracto ${c.name}`);
});

// Carta o contrato a partir de una plantilla, con los datos del cliente y de tu negocio; se edita y se descarga en PDF.
on('clientDoc', (el) => {
  const S = store.S, cl = clientOf(S, Number(el.dataset.id)), all_ = [...BUILTIN, ...S.docTemplates.map((t) => ({ id: 't:' + t.id, name: t.name, body: t.body, note: 'Tu plantilla' }))];
  const vars = docVars(S, cl, { eurFmt: eur, paidOf }), e = (x) => String(x).replace(/[<>&"]/g, (m) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[m]));
  openModal({ title: `Documento para ${cl.name}`, wide: true, cls: 'docmodal',
    body: `<div class="docgrid"><div class="stack" style="gap:10px"><div class="field"><label for="dt-sel">Plantilla</label><select class="input" id="dt-sel">${all_.map((t, i) => `<option value="${i}">${e(t.name)}</option>`).join('')}</select><span class="hint" id="dt-note"></span></div>
      <div class="field"><label for="dt-txt">Texto (puedes editarlo)</label><textarea class="input" id="dt-txt" rows="18" style="font-family:ui-monospace,Menlo,monospace;font-size:12.5px"></textarea></div></div>
      <div><div class="lbl" style="margin-bottom:6px">Vista previa</div><div class="doc docprev" id="dt-prev"></div></div></div>`,
    footer: `<button class="btn" id="dt-copy">${icon('copy', 'sm').toString()}Copiar texto</button><span class="spacer"></span><button class="btn" data-close>Cerrar</button><button class="btn" id="dt-docx">${icon('download', 'sm').toString()}Descargar Word</button><button class="btn primary" id="dt-pdf">${icon('download', 'sm').toString()}Descargar PDF</button>`,
    onMount: (m) => {
      const sel = m.querySelector('#dt-sel'), txt = m.querySelector('#dt-txt'), prev = m.querySelector('#dt-prev'), note = m.querySelector('#dt-note');
      const load = () => { const t = all_[Number(sel.value)]; txt.value = renderDoc(t.body, vars); note.textContent = t.note || ''; draw(); }, draw = () => { prev.innerHTML = mdToHtml(txt.value); };
      sel.addEventListener('change', load); txt.addEventListener('input', draw); load();
      m.querySelector('#dt-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(txt.value); toast('Texto copiado'); } catch { toast('No se pudo copiar', 'err'); } });
      m.querySelector('#dt-docx').addEventListener('click', () => downloadDocx(txt.value, `${all_[Number(sel.value)].name} - ${cl.name}`));
      m.querySelector('#dt-pdf').addEventListener('click', () => downloadPdf(`<style>${docCss}</style>${mdToHtml(txt.value)}`, `${all_[Number(sel.value)].name} - ${cl.name}`));
    } });
});

on('tlf', (el) => { tlGroup = el.dataset.k; tlShow = 25; window.dispatchEvent(new Event('rem-render')); });
on('tlmore', () => { tlShow += 25; window.dispatchEvent(new Event('rem-render')); });
