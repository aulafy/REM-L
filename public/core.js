// Infraestructura compartida: estado, navegación, capas, avisos y acciones.
import { html, raw, esc, icon, api, norm } from './util.js';
import { upgradeCombos } from './combo.js';
import { parseCommand } from './commands.js';
import { today } from './calc.js';

export const store = { S: null, view: null, params: [] };
export const ACT = {};          // acciones por data-act
export const on = (name, fn) => { ACT[name] = fn; };

export async function reload() { store.S = await api('GET', '/api/state'); }
export const go = (hash) => { if (location.hash === hash) refresh(); else location.hash = hash; };
export const refresh = () => window.dispatchEvent(new Event('rem-render'));
export async function mutate(method, path, body, okMsg) {
  try { const out = await api(method, path, body); await reload(); refresh(); if (okMsg) toast(okMsg); return out; }
  catch (e) { toast(e.message, 'err'); throw e; }
}

// ---------- avisos ----------
export function toast(msg, kind = '', action) {
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.innerHTML = `<span>${esc(msg)}</span>`;
  if (action) { const b = document.createElement('button'); b.textContent = action.label; b.onclick = () => { action.run(); el.remove(); }; el.append(b); }
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 6000 : action ? 6000 : 3200);
}

// ---------- capas modales ----------
let stack = [];
export function openModal({ title, body, footer = '', wide = false, cls = '', label, onMount, onClose } = {}) {
  const prev = document.activeElement;
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''} ${cls}" role="dialog" aria-modal="true" aria-label="${esc(label || title || 'Diálogo')}">
    ${title ? `<div class="modal-h"><h2>${esc(title)}</h2><span class="spacer"></span><button class="btn ghost icon sm" data-close aria-label="Cerrar">${icon('x')}</button></div>` : ''}
    <div class="modal-b">${body}</div>${footer ? `<div class="modal-f">${footer}</div>` : ''}</div>`;
  const close = (v) => { ov.remove(); stack = stack.filter((s) => s !== api_); document.body.style.overflow = ''; prev?.focus?.(); onClose?.(v); };
  const api_ = { close, el: ov };
  stack.push(api_);
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  ov.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
  ov.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      const f = [...ov.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((x) => !x.disabled && x.offsetParent);
      if (!f.length) return; const a = f[0], z = f[f.length - 1];
      if (e.shiftKey && document.activeElement === a) { z.focus(); e.preventDefault(); } else if (!e.shiftKey && document.activeElement === z) { a.focus(); e.preventDefault(); }
    }
  });
  document.body.append(ov); document.body.style.overflow = 'hidden';
  (ov.querySelector('[autofocus]') || ov.querySelector('input,select,textarea') || ov.querySelector('.modal')).focus?.();
  upgradeCombos(ov); onMount?.(ov, close);
  return api_;
}
export const topModal = () => stack[stack.length - 1];
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && stack.length) topModal().close(); });

export function confirmBox({ title, text, ok = 'Confirmar', danger = false }) {
  return new Promise((res) => {
    let done = false;
    openModal({ title, body: `<p class="muted" style="padding-bottom:6px">${esc(text)}</p>`, footer: `<button class="btn" data-close>Cancelar</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok autofocus>${esc(ok)}</button>`,
      onMount: (el, close) => el.querySelector('[data-ok]').addEventListener('click', () => { done = true; close(); res(true); }), onClose: () => { if (!done) res(false); } });
  });
}

// ---------- formularios ----------
export function field({ name, label, type = 'text', value = '', hint = '', required = false, options, rows, placeholder = '', attrs = '', cls = '', combo = false }) {
  const id = 'f_' + name + Math.random().toString(36).slice(2, 6);
  let ctl;
  if (options) ctl = html`<select class="input" id="${id}" name="${name}" ${combo ? raw('data-combo') : ''}>${options.map(([v, l]) => html`<option value="${v}" ${String(v) === String(value) ? raw('selected') : ''}>${l}</option>`)}</select>`;
  else if (rows) ctl = html`<textarea class="input" id="${id}" name="${name}" rows="${rows}" placeholder="${placeholder}">${value}</textarea>`;
  else ctl = html`<input class="input" id="${id}" name="${name}" type="${type}" value="${value}" placeholder="${placeholder}" ${required ? raw('required') : ''} ${raw(attrs)}>`;
  return html`<div class="field ${cls}"><label for="${id}">${label}${required ? html` <span class="muted">*</span>` : ''}</label>${ctl}${hint ? html`<span class="hint">${hint}</span>` : ''}</div>`;
}
export const formValues = (form) => Object.fromEntries([...new FormData(form)].map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));

// Modal con formulario: onSubmit(valores) → promesa; si lanza, se muestra el error en el propio modal.
export function formModal({ title, fields, submit = 'Guardar', wide, onSubmit, extraFooter = '' }) {
  return openModal({
    title, wide, body: `<form id="mf" novalidate><div class="grid ${wide ? 'g2' : ''}" style="padding-bottom:6px">${fields}</div><p class="err" id="mf-err" role="alert" style="color:var(--red);font-size:13px;margin-top:8px"></p></form>`,
    footer: `${extraFooter}<span class="spacer"></span><button class="btn" data-close type="button">Cancelar</button><button class="btn primary" id="mf-ok" type="button">${esc(submit)}</button>`,
    onMount: (el, close) => {
      const form = el.querySelector('#mf'), btn = el.querySelector('#mf-ok'), err = el.querySelector('#mf-err');
      const send = async () => {
        err.textContent = '';
        const bad = [...form.querySelectorAll('[required]')].find((i) => !i.value.trim());
        if (bad) { bad.setAttribute('aria-invalid', 'true'); bad.focus(); err.textContent = 'Completa los campos obligatorios.'; return; }
        btn.disabled = true;
        try { await onSubmit(formValues(form), close); } catch (e) { err.textContent = e.message; btn.disabled = false; }
      };
      btn.onclick = send; form.addEventListener('submit', (e) => { e.preventDefault(); send(); });
      form.addEventListener('input', (e) => e.target.removeAttribute?.('aria-invalid'));
    },
  });
}

// ---------- búsqueda global (⌘K) ----------
export function openPalette() {
  const S = store.S;
  const items = [
    ...['hoy', 'mensajes', 'clientes', 'facturas', 'presupuestos', 'gastos', 'tareas', 'informes', 'ajustes'].map((v) => ({ g: 'Ir a', t: v[0].toUpperCase() + v.slice(1), href: '#/' + v, i: v })),
    { g: 'Ayuda', t: 'Recorrido guiado de la app', run: () => import('./tour.js').then((t) => t.startTour()), i: 'sparkle' }, { g: 'Crear', t: 'Pegar un mensaje', run: () => ACT.pasteMsg(), i: 'mensajes' }, { g: 'Crear', t: 'Nueva factura', href: '#/facturas/nueva', i: 'plus' }, { g: 'Crear', t: 'Nuevo presupuesto', href: '#/presupuestos/nuevo', i: 'plus' },
    { g: 'Crear', t: 'Nuevo cliente', run: () => ACT.newClient(), i: 'plus' }, { g: 'Crear', t: 'Nuevo gasto', run: () => ACT.newExpense(), i: 'plus' }, { g: 'Crear', t: 'Nueva tarea', run: () => ACT.newTask(), i: 'plus' },
    ...(S.messages || []).filter((m) => m.direction === 'in').slice(0, 60).map((m) => ({ g: 'Mensajes', t: m.peer_name, s: m.body.slice(0, 40), href: '#/mensajes/' + m.id, i: 'mensajes', k: m.body + ' ' + (m.subject || '') })),
    ...S.clients.filter((c) => !c.archived).map((c) => ({ g: 'Clientes', t: c.name, s: c.nif || c.city, href: '#/clientes/' + c.id, i: 'clientes', k: c.email })),
    ...S.documents.map((d) => { const c = S.clients.find((x) => x.id === d.client_id); return { g: { factura: 'Facturas', albaran: 'Albaranes' }[d.type] || 'Presupuestos', t: (d.number || 'Borrador') + (c ? ' · ' + c.name : ''), s: '', href: `#/${{ factura: 'facturas', albaran: 'albaranes' }[d.type] || 'presupuestos'}/${d.id}`, i: d.type === 'factura' ? 'facturas' : 'presupuestos' }; }),
  ];
  let sel = 0, shown = [];
  const m = openModal({ cls: 'palette', label: 'Buscar', body: `<input id="pq" placeholder="Busca, o ordena: «gasto gasolina 45 €», «tarea llamar a Pedro mañana»…" autocomplete="off" aria-label="Buscar"><ul id="pl" role="listbox"></ul>`,
    onMount: (el, close) => {
      const q = el.querySelector('#pq'), ul = el.querySelector('#pl');
      const draw = () => {
        const t = norm(q.value);
        shown = (t ? items.filter((x) => norm(x.t + ' ' + (x.s || '') + ' ' + (x.k || '')).includes(t)) : items.filter((x) => x.g === 'Ir a' || x.g === 'Crear')).slice(0, 30);
        { const cmd = q.value.trim().length > 2 ? parseCommand(q.value, { clients: S.clients, today: today(), defaultIva: Number(S.settings?.default_iva ?? 21) }) : null; if (cmd) shown.unshift({ g: 'Orden', t: 'Hacer: ' + cmd.summary, i: 'sparkle', run: () => import('./assistant.js').then((a) => a.confirmActions(cmd.actions, cmd.summary)) }); }
        if (q.value.trim().length > 2) shown.push({ g: 'Asistente', t: `Preguntar: ${q.value.trim()}`, i: 'sparkle', run: () => import('./views/hoy.js').then((h) => h.askModal(q.value.trim())), keep: true });
        sel = Math.min(sel, Math.max(0, shown.length - 1));
        let last = '';
        ul.innerHTML = shown.map((x, n) => `${x.g !== last ? `<li class="grp" role="presentation">${last = x.g}</li>` : ''}<li role="option" data-n="${n}" aria-selected="${n === sel}">${icon(x.i)}<span>${esc(x.t)}</span>${x.s ? `<small>${esc(x.s)}</small>` : ''}</li>`).join('') || '<li class="grp">Sin resultados</li>';
        ul.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
      };
      const pick = (n) => { const x = shown[n]; if (!x) return; const qv = q.value.trim(); close(); if (x.href) go(x.href); else if (x.keep) import('./views/hoy.js').then((h) => h.askModal(qv)); else x.run?.(); };
      q.addEventListener('input', () => { sel = 0; draw(); });
      q.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, shown.length - 1); draw(); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
        else if (e.key === 'Enter') pick(sel);
      });
      ul.addEventListener('click', (e) => { const li = e.target.closest('[data-n]'); if (li) pick(Number(li.dataset.n)); });
      draw();
    } });
  return m;
}
