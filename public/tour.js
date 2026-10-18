// Recorrido guiado de 2 minutos: resalta cada zona de la app con una explicación corta. Se puede saltar en cualquier momento (Esc).
import { on, store } from './core.js';
import { api, esc } from './util.js';

const STEPS = [
  { sel: ['.nav a[href="#/hoy"]', '.tabbar a[href="#/hoy"]'], title: 'Hoy', text: 'Tu mesa de trabajo: lo que necesita tu atención ahora (cobros vencidos, presupuestos sin respuesta, mensajes y tareas).' },
  { sel: ['.nav a[href="#/mensajes"]', '.tabbar a[href="#/mensajes"]'], title: 'Mensajes', text: 'Telegram, correo y mensajes pegados en una bandeja. El asistente prepara borradores; tú decides si enviarlos: aprobar no es enviar.' },
  { sel: ['.nav a[href="#/clientes"]', '.tabbar a[href="#/clientes"]'], title: 'Clientes', text: 'La ficha de cada cliente reúne su historial: facturas, cobros, mensajes, archivos y tareas.' },
  { sel: ['.nav a[href="#/facturas"]', '.nav a[href="#/dinero"]', '.tabbar a[href="#/facturas"]', '.tabbar a[href="#/dinero"]'], title: 'Dinero', text: 'Facturas, presupuestos, albaranes, gastos, horas, informes, modelos fiscales y la previsión de tesorería. Las facturas emitidas no se editan: se corrigen con una rectificativa.' },
  { sel: ['[data-act="quick"]'], title: 'Crear', text: 'Desde aquí creas casi cualquier cosa: una factura, un cliente, un gasto, una tarea o pegas un mensaje.' },
  { sel: ['.search-btn'], title: 'Buscar y saltar (⌘K)', text: 'Busca clientes, facturas o acciones, y salta a cualquier pantalla con el teclado.' },
  { sel: ['.nav a[href="#/ajustes"]', '.tabbar a[href="#/ajustes"]'], title: 'Ajustes', text: 'Tu empresa, canales, copias de seguridad, acceso con PIN e importación desde otros programas. Revisa «Datos y copias» de vez en cuando.' },
  { sel: [], title: '¡Eso es todo!', text: 'Si te pierdes, pulsa ⌘K y escribe «recorrido» para verlo otra vez. Empieza por crear tu primer cliente o factura.' },
];
const visible = (sel) => { for (const s of sel) { const el = document.querySelector(s); if (el && el.offsetParent !== null) return el; } return null; };

let running = false;
export function startTour() {
  if (running) return; running = true;
  const steps = STEPS.map((s) => ({ ...s, el: visible(s.sel) })).filter((s) => s.el || !s.sel.length);
  const hl = document.createElement('div'); hl.className = 'tour-hl'; const pop = document.createElement('div'); pop.className = 'tour-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-modal', 'false'); pop.setAttribute('aria-label', 'Recorrido guiado');
  document.body.append(hl, pop); let i = 0;
  const end = async (finished) => { running = false; hl.remove(); pop.remove(); document.removeEventListener('keydown', key, true); window.removeEventListener('resize', place); if (finished) { try { await api('POST', '/api/setup', { tour: true }); } catch { /* sin servidor de configuración */ } } };
  const place = () => {
    const s = steps[i], r = s.el?.getBoundingClientRect();
    if (r) { Object.assign(hl.style, { display: 'block', top: r.top - 6 + 'px', left: r.left - 6 + 'px', width: r.width + 12 + 'px', height: r.height + 12 + 'px' }); } else hl.style.display = 'none';
    const w = Math.min(340, innerWidth - 24); pop.style.width = w + 'px';
    const ph = pop.offsetHeight; let top = r ? r.bottom + 14 : (innerHeight - ph) / 2, left = r ? r.left : (innerWidth - w) / 2;
    if (r && r.left < innerWidth / 3 && r.width < 260 && r.top < innerHeight - 200 && !s.sel.some((x) => x.startsWith('.tabbar'))) { left = r.right + 16; top = Math.max(12, Math.min(r.top - 6, innerHeight - ph - 12)); }
    if (top + ph > innerHeight - 12) top = Math.max(12, (r ? r.top - ph - 14 : innerHeight - ph - 12)); left = Math.max(12, Math.min(left, innerWidth - w - 12)); Object.assign(pop.style, { top: top + 'px', left: left + 'px' });
  };
  const draw = () => {
    const s = steps[i], last = i === steps.length - 1;
    pop.innerHTML = `<div class="tour-n">${i + 1} / ${steps.length}</div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p><div class="tour-b">${last ? '' : '<button class="btn ghost sm" data-t="skip">Saltar</button>'}<span class="spacer"></span>${i ? '<button class="btn sm" data-t="back">Atrás</button>' : ''}<button class="btn primary sm" data-t="next">${last ? 'Terminar' : 'Siguiente'}</button></div>`;
    s.el?.scrollIntoView?.({ block: 'nearest' }); place(); pop.querySelector('[data-t=next]').focus();
  };
  pop.addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; if (b.dataset.t === 'skip') end(false); else if (b.dataset.t === 'back') { i = Math.max(0, i - 1); draw(); } else if (i === steps.length - 1) end(true); else { i++; draw(); } });
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); end(false); } else if (e.key === 'ArrowRight') pop.querySelector('[data-t=next]')?.click(); else if (e.key === 'ArrowLeft') pop.querySelector('[data-t=back]')?.click(); };
  document.addEventListener('keydown', key, true); window.addEventListener('resize', place); draw();
}
on('tour', () => startTour());
export const maybeTourFromHash = () => { if (store.query?.get('tour') === '1') { history.replaceState(null, '', location.hash.split('?')[0] || '#/hoy'); setTimeout(startTour, 500); } };
