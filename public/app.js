import { store, ACT, on, reload, go, toast, openPalette, openModal, refresh } from './core.js';
import { html, raw, icon, esc, api, statusOf, paidOf } from './util.js';
import { today } from './calc.js';
import { upgradeCombos } from './combo.js';

const VIEWS = {};
const NAV = [['hoy', 'Hoy'], ['mensajes', 'Mensajes'], ['clientes', 'Clientes'], ['dinero', 'Dinero']];
const DINERO = ['facturas', 'presupuestos', 'albaranes', 'gastos', 'horas', 'informes', 'modelos', 'tesoreria', 'recurrentes'];
const navKey = (k) => (DINERO.includes(k) ? 'dinero' : k === 'tareas' ? 'hoy' : k);
const root = document.getElementById('root');

async function loadViews() {
  const mods = await Promise.all(['hoy', 'mensajes', 'clientes', 'documentos', 'gastos', 'tareas', 'informes', 'tesoreria', 'recurrentes', 'horas', 'modelos', 'ajustes', 'onboarding'].map((n) => import(`./views/${n}.js`)));
  for (const m of mods) Object.assign(VIEWS, m.views);
}

function counts(S) {
  const t = S.serverDate;
  return {
    mensajes: S.messages.filter((m) => m.direction === 'in' && ['nuevo', 'listo'].includes(m.status)).length,
    facturas: S.documents.filter((d) => d.type === 'factura' && statusOf(S, d) === 'vencida').length,
    tareas: S.tasks.filter((x) => !x.done && x.due && x.due <= t).length,
    presupuestos: S.documents.filter((d) => d.type === 'presupuesto' && d.status === 'aceptado').length,
  };
}

function shell(S, key, content) {
  const c = counts(S), st = S.settings;
  const nk = navKey(key);
  const badge = (k) => k === 'mensajes' && c.mensajes ? html`<span class="count" title="Mensajes por responder">${c.mensajes}</span>` : k === 'dinero' && c.facturas ? html`<span class="count alert" title="Facturas vencidas">${c.facturas}</span>` : k === 'hoy' && c.tareas ? html`<span class="count alert" title="Tareas para hoy o vencidas">${c.tareas}</span>` : '';
  const link = (k, l) => html`<a href="#/${k === 'dinero' ? 'facturas' : k}" ${nk === k ? raw('aria-current="page"') : ''}><span class="ni" data-c="${k}">${icon(k)}</span><span>${l}</span>${badge(k)}</a>`;
  const theme = document.documentElement.dataset.theme;
  return html`<div class="app">
    <aside class="side" aria-label="Navegación principal">
      <div class="brand"><span class="logo">${st.logo ? html`<img src="${st.logo}" alt="">` : (st.company_name || 'R')[0].toUpperCase()}</span><div><b>${st.company_name || 'Tu negocio'}</b><small>REM Negocio</small></div></div>
      <nav class="nav">${NAV.map(([k, l]) => link(k, l))}</nav>
      <div class="side-foot">
        <button class="btn ghost sm" data-act="shortcuts" style="justify-content:flex-start;margin-bottom:4px">${icon('menu', 'sm')}Atajos <kbd style="margin-left:auto">?</kbd></button><div class="safe">${icon('shield', 'sm')}<span>Tus datos se guardan solo en este equipo. Última copia: ${S.backups[0] ? S.backups[0].name.slice(8, 18) : 'ninguna'}.</span></div>
        <nav class="nav">${link('ajustes', 'Ajustes')}</nav>
      </div>
    </aside>
    <div class="main">
      <header class="top" id="top">
        <button class="search-btn" data-act="palette" aria-label="Buscar, crear u ordenar">${icon('search', 'sm')}<span>Buscar…</span><kbd>⌘K</kbd></button>
        <span class="grow"></span>
        ${st.pin_on ? html`<button class="btn ghost icon" data-act="lockNow" aria-label="Bloquear la aplicación" title="Bloquear">${icon('lock')}</button>` : ''}<button class="btn ghost icon" data-act="theme" aria-label="Cambiar entre tema claro y oscuro" title="Tema">${icon(theme === 'dark' ? 'sun' : 'moon')}</button>
        <span class="me" title="${st.company_name || ''}">${st.logo ? html`<img src="${st.logo}" alt="">` : (st.company_name || 'R')[0].toUpperCase()}</span><button class="btn primary" data-act="quick"><span class="hide-sm" style="display:contents">${icon('plus', 'sm')}</span> Nuevo</button>
      </header>
      <main class="page" id="page" tabindex="-1">${S.agentsPaused ? html`<div class="notice warn" style="margin:6px 0 16px">${icon('alert')}<span>Los agentes están en pausa: no prepararán borradores ni propuestas. <a href="#" data-act="agentsResume"><b>Reanudar</b></a></span></div>` : ''}${DINERO.includes(key) ? html`<nav class="subtabs" aria-label="Dinero">${[['facturas', 'Facturas'], ['presupuestos', 'Presupuestos'], ['albaranes', 'Albaranes'], ['gastos', 'Gastos'], ['horas', 'Horas'], ['informes', 'Informes'], ['modelos', 'Modelos'], ['tesoreria', 'Tesorería'], ['recurrentes', 'Recurrentes']].map(([k, l]) => html`<a href="#/${k}" ${key === k ? raw('aria-current="page"') : ''}>${l}${k === 'facturas' && c.facturas ? html` <span class="count alert">${c.facturas}</span>` : ''}</a>`)}</nav>` : ''}${content}</main>
    </div>
    <nav class="tabbar" aria-label="Navegación">
      ${[...NAV, ['ajustes', 'Ajustes']].map(([k, l]) => html`<a href="#/${k === 'dinero' ? 'facturas' : k}" ${nk === k ? raw('aria-current="page"') : ''}>${icon(k)}${l}${c.mensajes && k === 'mensajes' ? html`<i class="tabdot"></i>` : ''}</a>`)}
    </nav>
  </div>`;
}

function parse() {
  const [path, qs = ''] = (location.hash || '#/hoy').split('?');
  const [, key = 'hoy', ...params] = path.split('/');
  store.query = new URLSearchParams(qs);
  return [key, params];
}

let scrollSpy, fresh = true;
function render() {
  if (!store.S) return;
  const S = store.S;
  const [key, params] = parse();
  if (!S.settings.onboarded && !S.clients.length && !S.documents.length) { root.innerHTML = VIEWS.onboarding.render(S).toString(); VIEWS.onboarding.mount?.(root, S); document.title = 'Bienvenida · REM Negocio'; return; }
  const v = VIEWS[key] || VIEWS.hoy;
  const k = VIEWS[key] ? key : 'hoy';
  const y = window.scrollY, same = !fresh; fresh = false;
  root.innerHTML = shell(S, k, v.render(S, params)).toString();
  upgradeCombos(root);
  v.mount?.(root, S, params);
  import('./tour.js').then((t) => t.maybeTourFromHash());
  const pend = S.messages.filter((m) => m.direction === 'in' && ['nuevo', 'listo'].includes(m.status)).length;
  document.title = `${pend ? `(${pend}) ` : ''}${v.title?.(S, params) || 'REM Negocio'} · REM Negocio`;
  store.view = k;
  window.scrollTo(0, same ? y : 0);
  if (!same) document.getElementById('page')?.classList.add('enter');
  const top = document.getElementById('top');
  clearTimeout(scrollSpy); top && (top.classList.toggle('scrolled', window.scrollY > 4));
}


// ---------- eventos globales ----------
document.addEventListener('error', (e) => { if (e.target?.classList?.contains('thumb')) e.target.style.visibility = 'hidden'; }, true);
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-act]');
  if (a && ACT[a.dataset.act]) { e.preventDefault(); ACT[a.dataset.act](a, e); return; }
  const l = e.target.closest('[data-href]');
  if (l && !e.target.closest('a,button,input,select,label')) go(l.dataset.href);
});
document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); ACT.palette(); }
  const t = e.target;
  if (e.key === 'Enter' && t.matches?.('tr[data-href]')) go(t.dataset.href);
});
window.addEventListener('scroll', () => document.getElementById('top')?.classList.toggle('scrolled', window.scrollY > 4), { passive: true });
window.addEventListener('hashchange', () => { fresh = true; render(); });
window.addEventListener('rem-render', render);
ACT.palette = () => openPalette();
ACT.shortcuts = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
ACT.theme = () => {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next; try { localStorage.setItem('rem-theme', next); } catch {}
  refresh();
};
ACT.quick = () => {
  const m = openModal({ title: 'Crear', body: `<div class="grid g2" style="padding-bottom:10px">${[['', 'mensajes', 'Mensaje pegado', 'pasteMsg'], ['facturas/nueva', 'facturas', 'Factura'], ['presupuestos/nuevo', 'presupuestos', 'Presupuesto'], ['', 'clientes', 'Cliente', 'newClient'], ['', 'gastos', 'Gasto', 'newExpense'], ['', 'tareas', 'Tarea', 'newTask']]
    .map(([h, i, l, act]) => `<button class="btn" style="justify-content:flex-start;min-height:52px" ${act ? `data-act="${act}"` : `data-href="#/${h}"`} data-close>${icon(i).toString()}${l}</button>`).join('')}</div>`,
    onMount: (el) => el.addEventListener('click', (e) => { const b = e.target.closest('[data-href]'); if (b) go(b.dataset.href); }) });
};


// ---------- atajos de teclado (estilo Linear/Twenty) ----------
let chord = 0, nchord = 0;
const typing = (t) => t?.matches?.('input,textarea,select,[contenteditable]') || document.querySelector('.overlay');
const SHORTCUTS = [['⌘K', 'Buscar, crear u ordenar'], ['/', 'Buscar u ordenar'], ['N luego F', 'Nueva factura'], ['N luego P', 'Nuevo presupuesto'], ['N luego C', 'Nuevo cliente'], ['N luego G', 'Nuevo gasto'], ['N luego T', 'Nueva tarea'], ['?', 'Ver atajos'], ['G luego H', 'Ir a Hoy'], ['G luego M', 'Ir a Mensajes'], ['G luego C', 'Ir a Clientes'], ['G luego D', 'Ir a Dinero'], ['G luego A', 'Ir a Ajustes'], ['J / K', 'Mensaje siguiente / anterior'], ['R', 'Responder (enfoca el borrador)'], ['E', 'Archivar mensaje'], ['⌘ Enter', 'Enviar o marcar respondido']];
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
  const k = e.key.toLowerCase();
  if (e.key === '?') { e.preventDefault(); openModal({ title: 'Atajos de teclado', body: `<ul class="list" style="margin:0 -22px">${SHORTCUTS.map(([a, b]) => `<li style="padding:10px 22px"><span class="grow">${esc(b)}</span><span>${a.split(' ').map((x) => (/^(luego|\/)$/.test(x) ? `<small class="muted"> ${x} </small>` : `<kbd>${esc(x)}</kbd>`)).join('')}</span></li>`).join('')}</ul>` }); return; }
  if (chord && Date.now() - chord < 1200) { chord = 0; const to = { h: '#/hoy', m: '#/mensajes', c: '#/clientes', d: '#/facturas', a: '#/ajustes' }[k]; if (to) { e.preventDefault(); go(to); } return; }
  if (nchord && Date.now() - nchord < 1200) { nchord = 0; const go_ = { f: () => go('#/facturas/nueva'), p: () => go('#/presupuestos/nuevo'), c: () => ACT.newClient(), g: () => ACT.newExpense(), t: () => ACT.newTask(), m: () => ACT.pasteMsg() }[k]; if (go_) { e.preventDefault(); go_(); } return; }
  if (k === 'n') { nchord = Date.now(); return; }
  if (e.key === '/') { e.preventDefault(); ACT.palette(); return; }
  if (k === 'g') { chord = Date.now(); return; }
  if (store.view === 'mensajes') {
    const rows = [...document.querySelectorAll('.mrow')], cur = rows.findIndex((r) => r.classList.contains('sel'));
    if (k === 'j' || k === 'k') { const n = rows[Math.max(0, Math.min(rows.length - 1, cur + (k === 'j' ? 1 : -1)))]; if (n) { e.preventDefault(); go(n.getAttribute('href')); } }
    else if (k === 'r') { const t = document.getElementById('draft'); if (t) { e.preventDefault(); t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }
    else if (k === 'e') document.querySelector('[data-act="msgArchive"]')?.click();
  }
});

// Sondeo ligero: si llegan mensajes o borradores nuevos, repinta (o avisa si la persona está escribiendo).
let sig = '';
const signature = (S) => S.messages.map((m) => m.id + m.status + (m.draft ? 1 : 0)).join(',') + '|' + (S.attachments || []).map((a) => a.id + a.status).join(',');
setInterval(async () => {
  if (document.hidden || !store.S) return;
  try {
    const next = (await api('GET', '/api/pulse')).sig;
    if (next === sig) return; const first = !sig; sig = next; if (first) return;
    const before = store.S; await reload();
    const typing = document.activeElement?.matches?.('input,textarea,select') || document.querySelector('.overlay');
    const added = store.S.messages.filter((m) => m.direction === 'in' && !before.messages.some((x) => x.id === m.id)).length;
    if (!typing) render(); else if (added) toast(`${added === 1 ? 'Llegó 1 mensaje nuevo' : `Llegaron ${added} mensajes nuevos`}`, '', { label: 'Ver', run: () => go('#/mensajes') });
  } catch {}
}, 6000);

// ---- bloqueo con PIN ----
let lockMod = null;
const lockNow = async () => { lockMod ??= await import('./lock.js'); store.S = null; lockMod.showLock(root); };
window.addEventListener('rem-locked', lockNow);
on('lockNow', async () => { try { await api('POST', '/api/lock', {}); } catch {} lockNow(); });
function watchIdle() {
  const min = Number(store.S.settings.lock_idle_min ?? 15); if (!store.S.settings.pin_on || !min) return;
  let last = Date.now(); for (const ev of ['pointerdown', 'keydown', 'scroll', 'touchstart']) window.addEventListener(ev, () => { last = Date.now(); }, { passive: true });
  setInterval(async () => { if (store.S && Date.now() - last > min * 60000) { try { await api('POST', '/api/lock', {}); } catch {} lockNow(); } }, 15000);
}
(async function boot() {
  try { await Promise.all([reload(), loadViews()]); } catch (e) {
    if (e.message === 'locked') return lockNow();
    if (e.message === 'repair') return (await import('./repair.js')).showRepair(root); root.innerHTML = `<div class="welcome"><h1>No se pudo cargar</h1><p class="muted">${esc(e.message)}. ¿Está el servidor en marcha?</p></div>`; return; }
  const { registerActions } = await import('./actions.js'); registerActions();
  sig = signature(store.S); render(); watchIdle();
  if (location.hash === '' || location.hash === '#') history.replaceState(null, '', '#/hoy');
})();
