import { store } from '../core.js';
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
        <div class="page-head"><div><h1>Tareas</h1><p class="sub">${open.length ? `${open.length} pendientes` : 'Nada pendiente'}</p></div><div class="actions"><button class="btn primary" data-act="newTask">${icon('plus', 'sm')}Nueva tarea</button></div></div>
        ${groups.length ? html`<div class="stack">${groups.map(([name, items, tone]) => html`<section class="card"><div class="card-h"><h2>${name}</h2><span class="badge ${tone || 'grey'}">${items.length}</span></div><ul class="list">${items.map(row)}</ul></section>`)}</div>`
          : html`<div class="card"><div class="empty">${icon('tareas')}<h3>Todo hecho</h3><p>Apunta aquí llamadas, entregas y recordatorios para que no se te olviden.</p><button class="btn primary" data-act="newTask">Añadir tarea</button></div></div>`}
        ${done.length ? html`<p style="margin:22px 0 10px"><button class="btn ghost sm" data-act="toggleDone">${showDone ? 'Ocultar' : 'Mostrar'} completadas (${done.length})</button></p>${showDone ? html`<section class="card"><ul class="list">${done.map(row)}</ul></section>` : ''}` : ''}`;
    },
  },
};
import { on } from '../core.js';
on('toggleDone', () => { showDone = !showDone; window.dispatchEvent(new Event('rem-render')); });
