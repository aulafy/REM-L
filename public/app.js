import { store, ACT, reload, go, toast, openPalette, openModal, refresh } from './core.js';
import { html, raw, icon, esc, statusOf, paidOf } from './util.js';
import { today } from './calc.js';

const VIEWS = {};
const NAV = [['hoy', 'Hoy'], ['clientes', 'Clientes'], ['presupuestos', 'Presupuestos'], ['facturas', 'Facturas'], ['gastos', 'Gastos'], ['tareas', 'Tareas'], ['informes', 'Informes']];
const root = document.getElementById('root');

async function loadViews() {
  const mods = await Promise.all(['hoy', 'clientes', 'documentos', 'gastos', 'tareas', 'informes', 'ajustes', 'onboarding'].map((n) => import(`./views/${n}.js`)));
  for (const m of mods) Object.assign(VIEWS, m.views);
}

function counts(S) {
  const t = S.serverDate;
  return {
    facturas: S.documents.filter((d) => d.type === 'factura' && statusOf(S, d) === 'vencida').length,
    tareas: S.tasks.filter((x) => !x.done && x.due && x.due <= t).length,
    presupuestos: S.documents.filter((d) => d.type === 'presupuesto' && d.status === 'aceptado').length,
  };
}

function shell(S, key, content) {
  const c = counts(S), st = S.settings;
  const link = (k, l) => html`<a href="#/${k}" ${key === k ? raw('aria-current="page"') : ''}>${icon(k)}<span>${l}</span>${k === 'facturas' && c.facturas ? html`<span class="count alert" title="Facturas vencidas">${c.facturas}</span>` : k === 'tareas' && c.tareas ? html`<span class="count alert" title="Tareas para hoy o vencidas">${c.tareas}</span>` : k === 'presupuestos' && c.presupuestos ? html`<span class="count" title="Aceptados, pendientes de facturar">${c.presupuestos}</span>` : ''}</a>`;
  const theme = document.documentElement.dataset.theme;
  return html`<div class="app">
    <aside class="side" aria-label="Navegación principal">
      <div class="brand"><span class="logo">${st.logo ? html`<img src="${st.logo}" alt="">` : (st.company_name || 'R')[0].toUpperCase()}</span><div><b>${st.company_name || 'Tu negocio'}</b><small>REM Negocio</small></div></div>
      <nav class="nav">${NAV.map(([k, l]) => link(k, l))}</nav>
      <div class="side-foot">
        <div class="safe">${icon('shield', 'sm')}<span>Tus datos se guardan solo en este equipo. Última copia: ${S.backups[0] ? S.backups[0].name.slice(8, 18) : 'ninguna'}.</span></div>
        <nav class="nav">${link('ajustes', 'Ajustes')}</nav>
      </div>
    </aside>
    <div class="main">
      <header class="top" id="top">
        <button class="search-btn" data-act="palette" aria-label="Buscar o crear">${icon('search', 'sm')}<span>Buscar…</span><kbd>⌘K</kbd></button>
        <span class="grow"></span>
        <button class="btn ghost icon" data-act="theme" aria-label="Cambiar entre tema claro y oscuro" title="Tema">${icon(theme === 'dark' ? 'sun' : 'moon')}</button>
        <button class="btn primary" data-act="quick"><span class="hide-sm" style="display:contents">${icon('plus', 'sm')}</span> Nuevo</button>
      </header>
      <main class="page" id="page" tabindex="-1">${content}</main>
    </div>
    <nav class="tabbar" aria-label="Navegación">
      ${[['hoy', 'Hoy'], ['facturas', 'Facturas'], ['clientes', 'Clientes'], ['tareas', 'Tareas']].map(([k, l]) => html`<a href="#/${k}" ${key === k ? raw('aria-current="page"') : ''}>${icon(k)}${l}</a>`)}
      <a href="#/mas" ${['mas', 'presupuestos', 'gastos', 'informes', 'ajustes'].includes(key) ? raw('aria-current="page"') : ''}>${icon('menu')}Más</a>
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
  const v = key === 'mas' ? VIEWS.mas : VIEWS[key] || VIEWS.hoy;
  const k = VIEWS[key] || key === 'mas' ? key : 'hoy';
  const y = window.scrollY, same = !fresh; fresh = false;
  root.innerHTML = shell(S, k, v.render(S, params)).toString();
  v.mount?.(root, S, params);
  document.title = `${v.title?.(S, params) || 'REM Negocio'} · REM Negocio`;
  store.view = k;
  window.scrollTo(0, same ? y : 0);
  const top = document.getElementById('top');
  clearTimeout(scrollSpy); top && (top.classList.toggle('scrolled', window.scrollY > 4));
}

VIEWS.mas = {
  title: () => 'Más',
  render: (S) => html`<div class="page-head"><div><h1>Más</h1></div></div><div class="card"><ul class="list">${[['presupuestos', 'Presupuestos'], ['gastos', 'Gastos'], ['informes', 'Informes'], ['ajustes', 'Ajustes']].map(([k, l]) => html`<li class="link" data-href="#/${k}">${icon(k)}<span class="grow t">${l}</span>${icon('arrow', 'sm')}</li>`)}</ul></div>`,
};

// ---------- eventos globales ----------
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
ACT.theme = () => {
  const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next; try { localStorage.setItem('rem-theme', next); } catch {}
  refresh();
};
ACT.quick = () => {
  const m = openModal({ title: 'Crear', body: `<div class="grid g2" style="padding-bottom:10px">${[['facturas/nueva', 'facturas', 'Factura'], ['presupuestos/nuevo', 'presupuestos', 'Presupuesto'], ['', 'clientes', 'Cliente', 'newClient'], ['', 'gastos', 'Gasto', 'newExpense'], ['', 'tareas', 'Tarea', 'newTask']]
    .map(([h, i, l, act]) => `<button class="btn" style="justify-content:flex-start;min-height:52px" ${act ? `data-act="${act}"` : `data-href="#/${h}"`} data-close>${icon(i).toString()}${l}</button>`).join('')}</div>`,
    onMount: (el) => el.addEventListener('click', (e) => { const b = e.target.closest('[data-href]'); if (b) go(b.dataset.href); }) });
};

(async function boot() {
  try { await Promise.all([reload(), loadViews()]); } catch (e) { root.innerHTML = `<div class="welcome"><h1>No se pudo cargar</h1><p class="muted">${esc(e.message)}. ¿Está el servidor en marcha?</p></div>`; return; }
  const { registerActions } = await import('./actions.js'); registerActions();
  render();
  if (location.hash === '' || location.hash === '#') history.replaceState(null, '', '#/hoy');
})();
