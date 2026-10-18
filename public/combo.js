// Selector con búsqueda (patrón combobox ARIA, como Radix/shadcn). Mejora cualquier <select data-combo> sin perder el valor del formulario.
import { norm } from './util.js';
let open = null;
const close = () => { if (open) { open.pop.remove(); open.btn.setAttribute('aria-expanded', 'false'); open.btn.focus({ preventScroll: true }); open = null; } };
document.addEventListener('mousedown', (e) => { if (open && !open.pop.contains(e.target) && e.target !== open.btn && !open.btn.contains(e.target)) close(); });
window.addEventListener('resize', close); window.addEventListener('scroll', (e) => { if (open && !open.pop.contains(e.target)) close(); }, true);

export function upgradeCombos(root = document) {
  root.querySelectorAll('select[data-combo]:not([data-up])').forEach((sel) => {
    sel.dataset.up = '1'; sel.classList.add('sr'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'input combo-btn'; btn.setAttribute('role', 'combobox'); btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    const lab = sel.id && document.querySelector(`label[for="${sel.id}"]`); if (lab) btn.setAttribute('aria-labelledby', (lab.id ||= sel.id + '-lbl')); else btn.setAttribute('aria-label', sel.getAttribute('aria-label') || 'Elegir');
    const paint = () => { const o = sel.selectedOptions[0]; btn.innerHTML = `<span class="${o && o.value ? '' : 'ph'}"></span><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>`; btn.firstChild.textContent = o ? o.textContent : ''; };
    paint(); sel.after(btn); sel.addEventListener('change', paint);
    if (lab) lab.addEventListener('click', (e) => { e.preventDefault(); btn.focus(); });
    const show = () => {
      close(); btn.setAttribute('aria-expanded', 'true');
      const pop = document.createElement('div'); pop.className = 'combo-pop'; const id = 'cb' + Math.random().toString(36).slice(2, 7);
      pop.innerHTML = `<input class="combo-q" placeholder="Buscar…" aria-label="Buscar" autocomplete="off" role="searchbox"><ul role="listbox" id="${id}"></ul>`;
      const r = btn.getBoundingClientRect(); pop.style.cssText = `position:fixed;left:${Math.max(8, Math.min(r.left, innerWidth - Math.max(r.width, 260) - 8))}px;min-width:${Math.max(r.width, 260)}px;z-index:90;`;
      document.body.append(pop); const below = innerHeight - r.bottom; if (below < 280 && r.top > below) pop.style.bottom = `${innerHeight - r.top + 6}px`; else pop.style.top = `${r.bottom + 6}px`;
      const q = pop.querySelector('input'), ul = pop.querySelector('ul'); let idx = 0, shown = [];
      const opts = [...sel.options].map((o) => ({ v: o.value, t: o.textContent }));
      const draw = () => { const t = norm(q.value); shown = opts.filter((o) => !t || norm(o.t).includes(t)); idx = Math.min(idx, Math.max(0, shown.length - 1));
        ul.innerHTML = shown.map((o, i) => `<li role="option" id="${id}-${i}" data-i="${i}" aria-selected="${o.v === sel.value}" class="${i === idx ? 'act' : ''}">${o.t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</li>`).join('') || '<li class="none">Sin resultados</li>';
        q.setAttribute('aria-activedescendant', `${id}-${idx}`); ul.querySelector('.act')?.scrollIntoView({ block: 'nearest' }); };
      const pick = (i) => { const o = shown[i]; if (!o) return; sel.value = o.v; sel.dispatchEvent(new Event('change', { bubbles: true })); sel.dispatchEvent(new Event('input', { bubbles: true })); close(); };
      q.addEventListener('input', () => { idx = 0; draw(); });
      q.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { idx = Math.min(idx + 1, shown.length - 1); draw(); e.preventDefault(); } else if (e.key === 'ArrowUp') { idx = Math.max(idx - 1, 0); draw(); e.preventDefault(); } else if (e.key === 'Enter') { pick(idx); e.preventDefault(); } else if (e.key === 'Escape') { e.stopPropagation(); close(); } else if (e.key === 'Tab') close(); });
      ul.addEventListener('mousedown', (e) => { const li = e.target.closest('[data-i]'); if (li) { e.preventDefault(); pick(Number(li.dataset.i)); } });
      open = { pop, btn }; draw(); q.focus();
    };
    btn.addEventListener('click', () => (open && open.btn === btn ? close() : show()));
    btn.addEventListener('keydown', (e) => { if (['ArrowDown', 'ArrowUp'].includes(e.key) || (e.key.length === 1 && !e.metaKey && !e.ctrlKey && e.key !== ' ')) { e.preventDefault(); show(); } });
  });
}
