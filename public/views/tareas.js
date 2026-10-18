import { store, openModal, mutate, toast, confirmBox } from '../core.js';
import { html, raw, fdateShort, relDate, icon, clientOf } from '../util.js';

let showDone = false;
export const views = {
  tareas: {
    title: () => 'Tareas',
    render(S) {
      const t = S.serverDate, open = S.tasks.filter((k) => !k.done), done = S.tasks.filter((k) => k.done);
      const groups = [['Vencidas', open.filter((k) => k.due && k.due < t), 'red'], ['Hoy', open.filter((k) => k.due === t), 'amber'], ['Próximas', open.filter((k) => k.due > t), ''], ['Sin fecha', open.filter((k) => !k.due), '']].filter((g) => g[1].length);
      const row = (k) => html`<li><input type="checkbox" class="check" data-act="toggleTask" data-id="${k.id}" ${k.done ? raw('checked') : ''} aria-label="${k.done ? 'Reabrir' : 'Completar'}: ${k.title}">
        <div class="grow"><div class="t ${k.done ? 'done-t' : ''}" style="white-space:normal">${k.title}</div><div class="d" style="${!k.done && k.due && k.due < t ? 'color:var(--red)' : ''}">${k.due ? `${fdateShort(k.due)} · ${relDate(k.due, t)}` : 'Sin fecha'}${k.client_id ? html` · <a href="#/clientes/${k.client_id}">${clientOf(S, k.client_id)?.name}</a>` : ''}</div></div>
        <button class="btn ghost icon sm" data-act="editTask" data-id="${k.id}" aria-label="Editar">${icon('edit', 'sm')}</button><button class="btn ghost icon sm" data-act="deleteTask" data-id="${k.id}" aria-label="Eliminar">${icon('trash', 'sm')}</button></li>`;
      return html`
        <div class="page-head"><div><h1>Tareas</h1><p class="sub">${open.length ? `${open.length} pendientes` : 'Nada pendiente'}</p></div><div class="actions"><button class="btn" data-act="calendar">${icon('calendar', 'sm')}Calendario</button><button class="btn primary" data-act="newTask">${icon('plus', 'sm')}Nueva tarea</button></div></div>
        ${groups.length ? html`<div class="stack">${groups.map(([name, items, tone]) => html`<section class="card"><div class="card-h"><h2>${name}</h2><span class="badge ${tone || 'grey'}">${items.length}</span></div><ul class="list">${items.map(row)}</ul></section>`)}</div>`
          : html`<div class="card"><div class="empty">${icon('tareas')}<h3>Todo hecho</h3><p>Apunta aquí llamadas, entregas y recordatorios para que no se te olviden.</p><button class="btn primary" data-act="newTask">Añadir tarea</button></div></div>`}
        ${done.length ? html`<p style="margin:22px 0 10px"><button class="btn ghost sm" data-act="toggleDone">${showDone ? 'Ocultar' : 'Mostrar'} completadas (${done.length})</button></p>${showDone ? html`<section class="card"><ul class="list">${done.map(row)}</ul></section>` : ''}` : ''}`;
    },
  },
};
import { on } from '../core.js';
on('toggleDone', () => { showDone = !showDone; window.dispatchEvent(new Event('rem-render')); });

// Tus fechas (tareas, vencimientos, presupuestos, recurrentes) en el Calendario del Mac o en cualquier app que lea .ics.
on('calendar', () => {
  const S = store.S, path = `/api/calendar.ics?t=${S.icsToken}`, web = `webcal://${location.host}${path}`, http_ = `${location.origin}${path}`;
  const m = openModal({ title: 'Calendario', wide: true, body: `<div class="stack" style="padding-bottom:8px"><p class="muted">Un calendario con tus <b>tareas con fecha</b>, los <b>vencimientos de facturas pendientes</b>, la <b>caducidad de presupuestos</b> y las <b>facturas recurrentes</b>. Si te suscribes, se actualiza solo.</p>
    <div class="row wrap"><a class="btn primary" href="${web}">${icon('calendar', 'sm').toString()}Suscribirme en Calendario</a><a class="btn" href="${path}" download="rem-negocio.ics">${icon('download', 'sm').toString()}Descargar .ics</a></div>
    <div class="field"><label for="ics-url">Enlace para otras apps</label><div class="row"><input class="input" id="ics-url" readonly value="${http_}" style="flex:1"><button class="btn" id="ics-copy">${icon('copy', 'sm').toString()}Copiar</button></div><span class="hint">Solo funciona en este Mac, mientras REM Negocio esté abierto. El enlace lleva una clave: no lo compartas.</span></div>
    <div><button class="btn ghost sm" id="ics-rot">Generar un enlace nuevo (el anterior deja de funcionar)</button></div></div>` });
  m.el.querySelector('#ics-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(http_); toast('Enlace copiado'); } catch { m.el.querySelector('#ics-url').select(); } });
  m.el.querySelector('#ics-rot').addEventListener('click', async () => { if (await confirmBox({ title: 'Nuevo enlace', text: 'Las suscripciones actuales dejarán de actualizarse y tendrás que volver a suscribirte.', ok: 'Generar enlace nuevo', danger: true })) { await mutate('POST', '/api/calendar/rotate', {}, 'Enlace renovado'); m.close(); } });
});
