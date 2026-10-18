// Modo reparación: la base tiene relaciones rotas o está dañada. Sin cargar la app: restaurar una copia sana o reparar (el servidor guarda antes una copia).
import { html, icon } from './util.js';

const TABLES = { payments: 'cobros', documents: 'documentos', tasks: 'tareas', time_entries: 'horas', messages: 'mensajes', memory: 'memoria', recurring: 'recurrentes', chunks: 'conocimiento', clients: 'clientes' };
const KIND = (n) => { const before = /-antes-de-([a-z-]+)\.db$/.exec(n)?.[1]; return /-auto\.db$/.test(n) ? 'automática' : /-manual\.db$/.test(n) ? 'manual' : /-importada\.db$/.test(n) ? 'importada' : before ? 'antes de ' + before.replace(/-/g, ' ') : 'copia'; };
const WHEN = (n) => { const m = /negocio-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})/.exec(n); return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5])).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : n; };
const post = async (path, body) => { const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'No se pudo completar'); return j; };

export async function showRepair(root) {
  let info; try { info = await (await fetch('/api/repair')).json(); } catch { root.innerHTML = '<div class="welcome"><h1>No se pudo conectar con el servidor</h1></div>'; return; }
  if (!info.repair) return location.reload();
  document.title = 'Revisar datos · REM Negocio';
  const what = info.damaged ? 'El archivo de la base de datos está dañado.' : `Hay ${info.broken} ${info.broken === 1 ? 'registro que apunta' : 'registros que apuntan'} a algo que ya no existe (${info.tables.map((t) => TABLES[t] || t).join(', ')}).`;
  root.innerHTML = html`<div class="welcome" role="main">
    <h1 style="font-size:26px;margin-bottom:8px">Hay que revisar tus datos antes de seguir</h1>
    <div class="notice warn" style="margin-bottom:18px">${icon('alert')}<span>${what} Para no empeorarlo, REM Negocio no abre el resto de la aplicación ni ejecuta agentes hasta que elijas qué hacer. Antes de cualquier cambio se guarda una copia de lo actual.</span></div>
    ${info.damaged ? '' : html`<section class="card" style="margin-bottom:16px;padding:18px"><h2 style="margin:0 0 6px;font-size:17px">Reparar automáticamente</h2>
      <p class="muted" style="margin:0 0 12px">Lo que apunte a algo inexistente se desenlaza; si no puede quedar suelto (por ejemplo, un cobro de una factura que no existe), se elimina. Recomendado si no tienes una copia reciente.</p>
      <button class="btn primary" id="rp-fix">${icon('check', 'sm')}Reparar ahora</button></section>`}
    <section class="card" style="padding:18px"><h2 style="margin:0 0 6px;font-size:17px">Restaurar una copia</h2>
      ${info.backups.length ? html`<p class="muted" style="margin:0 0 10px">Solo se muestran copias íntegras. Perderás lo que hicieras después de la fecha de la copia.</p>
        <ul class="list" style="list-style:none;padding:0;margin:0">${info.backups.map((b) => html`<li class="row" style="justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid var(--line)">
          <div><b>${WHEN(b.name)}</b> <span class="muted">· ${KIND(b.name)}</span><br><small class="muted">${b.summary.clients} clientes · ${b.summary.invoices} facturas · ${b.summary.expenses} gastos</small></div>
          <button class="btn" data-restore="${b.name}">Restaurar</button></li>`)}</ul>`
        : html`<p class="muted" style="margin:0">No hay ninguna copia íntegra en este equipo.${info.damaged ? ' Si tienes una copia guardada en otro sitio, cópiala en la carpeta «backups» de tus datos y recarga esta página.' : ''}</p>`}
    </section>
    <p class="err" id="rp-err" role="alert" style="min-height:20px;margin-top:12px;color:var(--red)"></p></div>`.toString();
  const err = root.querySelector('#rp-err');
  const act = async (path, body, confirmText) => {
    if (!confirm(confirmText)) return; err.textContent = ''; root.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    try { const r = await post(path, body); if (r.ok) location.reload(); else { err.textContent = 'Sigue habiendo problemas: prueba con otra copia.'; showRepair(root); } }
    catch (e) { err.textContent = e.message; root.querySelectorAll('button').forEach((b) => { b.disabled = false; }); }
  };
  root.querySelector('#rp-fix')?.addEventListener('click', () => act('/api/repair/fix', {}, 'Se guardará una copia de lo actual y se corregirán las referencias rotas. ¿Continuar?'));
  root.querySelectorAll('[data-restore]').forEach((b) => b.addEventListener('click', () => act('/api/repair/restore', { name: b.dataset.restore }, `Se guardará una copia de lo actual y se restaurará la copia del ${WHEN(b.dataset.restore)}. ¿Continuar?`)));
}
