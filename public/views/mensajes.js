import { store, on, go, mutate, toast, openModal, formModal, field, confirmBox, refresh } from '../core.js';
import { html, raw, esc, icon, avatar, clientOf, fdate, api } from '../util.js';
import { dictate, say, canDictate } from '../voice.js';
import { templatesFor, templateVars, renderTemplate } from '../ext.js';

const CH = { telegram: ['Telegram', 'send'], email: ['Correo', 'mail'], whatsapp: ['WhatsApp', 'mensajes'], imessage: ['iMessage', 'mensajes'], otro: ['Mensaje', 'mensajes'] };
let filter = 'pendientes';
const drafts = {}; // texto en edición por mensaje (sobrevive a repintados)

export const ago = (iso) => { const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 1 ? 'ahora' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : fdate(iso.slice(0, 10)); };
export const pending = (S) => S.messages.filter((m) => m.direction === 'in' && ['nuevo', 'listo'].includes(m.status));
const keyOf = (m) => `${m.channel}|${m.peer_addr || m.peer_name}`;
const canSend = (S, m) => (m.channel === 'telegram' && S.channels.telegram.on) || (m.channel === 'email' && S.channels.email.on);

function list(S, sel) {
  const incoming = S.messages.filter((m) => m.direction === 'in');
  const rows = incoming.filter((m) => (filter === 'pendientes' ? ['nuevo', 'listo'].includes(m.status) : filter === 'respondidos' ? m.status === 'respondido' : m.status === 'archivado'));
  const counts = { pendientes: pending(S).length };
  return html`<div class="inbox-list">
    <div class="inbox-head"><div class="seg" role="group" aria-label="Filtrar mensajes">${[['pendientes', `Por responder${counts.pendientes ? ' · ' + counts.pendientes : ''}`], ['respondidos', 'Respondidos'], ['archivados', 'Archivo']].map(([k, l]) => html`<button data-act="mfilter" data-k="${k}" aria-pressed="${filter === k}">${l}</button>`)}</div></div>
    ${rows.length ? html`<ul class="mlist" role="listbox" aria-label="Mensajes">${rows.map((m) => html`<li><a class="mrow ${sel === m.id ? 'sel' : ''} ${['nuevo', 'listo'].includes(m.status) ? 'unread' : ''}" href="#/mensajes/${m.id}" role="option" aria-selected="${sel === m.id}">
      ${avatar(m.peer_name)}<div class="mbody"><div class="mtop"><b>${m.peer_name}</b><span class="when">${ago(m.created_at)}</span></div><div class="msub">${m.subject ? html`<b>${m.subject}</b> · ` : ''}${m.body.replace(/\s+/g, ' ').slice(0, 90)}</div>
      <div class="mtags"><span class="chip">${icon(CH[m.channel]?.[1] || 'mensajes', 'sm')}${CH[m.channel]?.[0] || 'Mensaje'}</span>${m.status === 'nuevo' && S.channels.ai.on ? html`<span class="chip busy"><i class="dots"></i>Preparando respuesta</span>` : m.draft ? html`<span class="chip ok">${icon('sparkle', 'sm')}Borrador listo</span>` : ''}</div></div></a></li>`)}</ul>`
      : html`<div class="empty" style="padding:44px 18px">${icon('mensajes')}<h3>${filter === 'pendientes' ? 'Todo respondido' : 'Nada por aquí'}</h3><p>${filter === 'pendientes' ? (S.channels.telegram.on || S.channels.email.on ? 'Los mensajes nuevos aparecerán aquí en cuanto lleguen.' : 'Conecta Telegram o tu correo para recibir aquí los mensajes de tus clientes.') : 'Todavía no hay mensajes en esta lista.'}</p>${filter === 'pendientes' && !(S.channels.telegram.on || S.channels.email.on) ? html`<a class="btn primary" href="#/ajustes" data-act="goChannels">Conectar canales</a>` : ''}</div>`}</div>`;
}

function detail(S, m) {
  const c = clientOf(S, m.client_id);
  const thread = S.messages.filter((x) => keyOf(x) === keyOf(m)).sort((a, b) => a.id - b.id);
  const text = drafts[m.id] ?? m.draft ?? '';
  const send = canSend(S, m), isWa = m.channel === 'whatsapp', waNum = (m.peer_addr || '').replace(/\D/g, '');
  return html`<section class="inbox-detail" aria-label="Conversación con ${m.peer_name}">
    <div class="dhead"><a class="btn ghost icon back-only" href="#/mensajes" aria-label="Volver a la lista">${icon('back')}</a>${avatar(m.peer_name, 'lg')}<div class="grow"><h2>${m.peer_name}</h2>
      <div class="muted dsub">${CH[m.channel]?.[0]}${m.peer_addr && m.channel !== 'telegram' ? ' · ' + m.peer_addr : ''}${c ? html` · <a href="#/clientes/${c.id}">Ver ficha</a>` : ''}</div></div>
      <button class="btn sm" data-act="msgQuote" data-id="${m.id}" title="Crear presupuesto para este cliente" aria-label="Crear presupuesto">${icon('presupuestos', 'sm')}<span class="lbl-wide">Presupuesto</span></button><button class="btn sm" data-act="msgTask" data-id="${m.id}" title="Crear tarea" aria-label="Crear tarea">${icon('tareas', 'sm')}<span class="lbl-wide">Tarea</span></button><button class="btn ghost icon" data-act="msgArchive" data-id="${m.id}" aria-label="${m.status === 'archivado' ? 'Recuperar' : 'Archivar'}" title="${m.status === 'archivado' ? 'Recuperar' : 'Archivar'}">${icon('archive')}</button></div>
    ${!c ? html`<div class="notice" style="margin:0 20px 14px">${icon('user')}<span>Contacto nuevo. <a href="#" data-act="msgClient" data-id="${m.id}"><b>Guardar como cliente</b></a>${S.clients.some((x) => !x.archived) ? html` o vincular a uno existente: <select class="input" data-act-change="linkClient" data-id="${m.id}" data-combo style="min-height:34px;width:auto;display:inline-block;padding:4px 10px" aria-label="Vincular a un cliente existente"><option value="">Elegir…</option>${S.clients.filter((x) => !x.archived).map((x) => html`<option value="${x.id}">${x.name}</option>`)}</select>` : ''}</span></div>` : ''}
    <div class="thread" id="thread">${thread.map((x) => html`<div class="bubble ${x.direction === 'out' ? 'out' : 'in'}">${x.subject && x.direction === 'in' ? html`<div class="bsub">${x.subject}</div>` : ''}<div class="btxt">${x.body}</div><div class="bmeta">${x.direction === 'out' ? 'Tú · ' : ''}${ago(x.created_at)}${x.direction === 'in' ? html` · <button class="linkbtn" data-act="speakMsg" data-text="${x.body}" aria-label="Escuchar mensaje" aria-pressed="false">${icon('speaker', 'sm')}Escuchar</button>` : ''}</div></div>`)}</div>
    ${['archivado', 'respondido'].includes(m.status) ? html`<div class="notice" style="margin:0 20px 20px">${icon('check')}<span>${m.status === 'respondido' ? 'Ya has respondido a este mensaje.' : 'Archivado.'} <a href="#" data-act="msgReopen" data-id="${m.id}">Volver a abrir</a></span></div>` : html`
    <div class="composer"><div class="comp-h"><label for="draft">Tu respuesta</label>${m.draft && drafts[m.id] === undefined ? html`<span class="chip ok">${icon('sparkle', 'sm')}Borrador del asistente · revísalo</span>` : m.status === 'nuevo' && S.channels.ai.on ? html`<span class="chip busy"><i class="dots"></i>El asistente está redactando…</span>` : ''}<span class="spacer"></span>
      ${m.intent && !['error', 'adjunto'].includes(m.intent) ? html`<span class="chip">${m.intent}</span>` : ''}</div>
      ${m.intent === 'adjunto' ? html`<div class="notice" style="margin-bottom:8px">${icon('book')}<span>Solo ha enviado un adjunto: no hay nada que responder. <a href="#/gastos"><b>Revisarlo en Gastos</b></a>.</span></div>` : ''}${m.intent === 'error' ? html`<div class="notice warn" style="margin-bottom:8px">${icon('alert')}<span>El asistente no ha podido preparar una respuesta (¿está Ollama abierto?). Puedes escribirla tú o <a href="#" data-act="redraft" data-id="${m.id}">intentarlo de nuevo</a>.</span></div>` : ''}<textarea id="draft" class="input" rows="6" data-id="${m.id}" placeholder="Escribe tu respuesta o dicta con el micrófono…">${text}</textarea>
      ${m.sources.length ? html`<details class="src"><summary>${icon('book', 'sm')}Basado en ${m.sources.length} dato${m.sources.length > 1 ? 's' : ''} de tu negocio</summary>${m.sources.map((s) => html`<p><b>${s.title}</b> — ${s.text}</p>`)}</details>` : (S.channels.ai.on ? html`<p class="hint muted" style="font-size:12.5px;margin:6px 2px 0">No he encontrado datos del negocio relacionados. <a href="#/ajustes" data-act="goKnowledge">Añade tus tarifas y condiciones</a> para respuestas mejores.</p>` : '')}
      <div class="comp-f"><div class="row wrap" style="gap:6px">
        ${canDictate ? html`<button class="btn sm icon" data-act="dictate" aria-pressed="false" aria-label="Dictar respuesta" title="Dictar">${icon('mic', 'sm')}</button>` : ''}
        ${templatesFor(S).length ? html`<select class="input" id="tpl" aria-label="Insertar plantilla" style="min-height:32px;width:auto;padding:2px 10px;font-size:13px"><option value="">Plantilla…</option>${templatesFor(S).map((t, i) => html`<option value="${i}">${t.name}</option>`)}</select>` : ''}
        <button class="btn sm icon" data-act="speakDraft" aria-pressed="false" aria-label="Escuchar la respuesta" title="Escuchar">${icon('speaker', 'sm')}</button>
        ${S.channels.ai.on ? html`<button class="btn sm icon" data-act="redraft" data-id="${m.id}" aria-label="Pedir otra versión" title="Otra versión">${icon('refresh', 'sm')}</button>` : ''}</div><span class="spacer"></span>
        ${send ? html`<button class="btn primary" data-act="msgSend" data-id="${m.id}">${icon('send', 'sm')}Enviar por ${CH[m.channel][0]}</button>`
          : html`<button class="btn" data-act="msgCopy" data-id="${m.id}">${icon('copy', 'sm')}Copiar</button>${isWa && waNum ? html`<a class="btn" data-act="msgWa" data-id="${m.id}" href="#">WhatsApp</a>` : ''}<button class="btn primary" data-act="msgDone" data-id="${m.id}">${icon('check', 'sm')}Marcar respondido</button>`}</div>
      ${send ? '' : html`<p class="hint muted" style="font-size:12.5px;margin:8px 2px 0">${m.channel === 'telegram' || m.channel === 'email' ? 'Conecta este canal en Ajustes para responder desde aquí.' : 'Este canal se responde en su propia app: copia el texto, envíalo y márcalo como respondido.'}</p>`}</div>`}</section>`;
}

export const views = {
  mensajes: {
    title: (S, p) => { const m = S.messages.find((x) => x.id === Number(p[0])); return m ? m.peer_name : 'Mensajes'; },
    render(S, p) {
      const id = Number(p[0]) || null, m = id ? S.messages.find((x) => x.id === id && x.direction === 'in') : null;
      return html`<div class="page-head compact ${m ? 'sel' : ''}"><div><h1>Mensajes</h1></div><div class="actions"><button class="btn" data-act="pasteMsg">${icon('plus', 'sm')}Pegar mensaje</button></div></div>
        <div class="inbox ${m ? 'has-sel' : ''}">${list(S, id)}${m ? detail(S, m) : html`<div class="inbox-detail empty-pane"><div class="empty">${icon('mensajes')}<h3>Elige un mensaje</h3><p>El asistente deja preparada una respuesta para que solo tengas que revisarla.</p></div></div>`}</div>`;
    },
    mount(root, S, p) {
      const ta = root.querySelector('#draft');
      if (ta) {
        ta.addEventListener('input', () => { drafts[ta.dataset.id] = ta.value; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight + 2, 360) + 'px'; });
        ta.addEventListener('blur', () => { api('POST', `/api/messages/${ta.dataset.id}/draft`, { draft: ta.value }).catch(() => {}); });
        ta.style.height = Math.min(ta.scrollHeight + 2, 360) + 'px';
        ta.addEventListener('keydown', (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') root.querySelector('[data-act="msgSend"],[data-act="msgDone"]')?.click(); });
      }
      root.querySelectorAll('[data-act-change="linkClient"]').forEach((sel) => sel.addEventListener('change', async () => { if (sel.value) { try { await mutate('POST', `/api/messages/${sel.dataset.id}/client`, { client_id: sel.value }, 'Contacto vinculado'); } catch {} } }));
      root.querySelector('#tpl')?.addEventListener('change', (e) => { const t = templatesFor(S)[Number(e.target.value)]; if (!t) return; const cur = S.messages.find((x) => x.id === Number(p[0])), ta = root.querySelector('#draft'); const txt = renderTemplate(t.text, templateVars(S, cur?.client_id)); ta.value = ta.value.trim() ? ta.value.replace(/\s*$/, '\n\n') + txt : txt; ta.dispatchEvent(new Event('input')); e.target.value = ''; ta.focus(); });
      const th = root.querySelector('#thread'); if (th) th.scrollTop = th.scrollHeight;
    },
  },
};

const M = (el) => store.S.messages.find((x) => x.id === Number(el.dataset.id));
const draftOf = (m) => document.getElementById('draft')?.value ?? drafts[m.id] ?? m.draft ?? '';
on('mfilter', (el) => { filter = el.dataset.k; refresh(); });
on('goChannels', () => { import('./ajustes.js').then((a) => a.openTab('canales')); go('#/ajustes'); });
on('goKnowledge', () => { import('./ajustes.js').then((a) => a.openTab('conocimiento')); go('#/ajustes'); });
on('dictate', (el) => dictate(document.getElementById('draft'), el));
on('speakDraft', (el) => { const t = document.getElementById('draft')?.value.trim(); if (!t) return toast('Todavía no hay texto que escuchar.'); say(t, el); });
on('speakMsg', (el) => say(el.dataset.text, el));
on('redraft', async (el) => { const m = M(el); delete drafts[m.id]; el.disabled = true; try { await mutate('POST', `/api/messages/${m.id}/redraft`, {}); } catch {} });
on('msgArchive', async (el) => { const m = M(el), arch = m.status === 'archivado'; await mutate('POST', `/api/messages/${m.id}/${arch ? 'reopen' : 'archive'}`, {}); if (!arch) { toast('Archivado', '', { label: 'Deshacer', run: () => mutate('POST', `/api/messages/${m.id}/reopen`, {}) }); goNext(m.id); } else toast('Recuperado'); });
on('msgReopen', (el) => mutate('POST', `/api/messages/${el.dataset.id}/reopen`, {}));
on('msgClient', (el) => { const m = M(el); formModal({ title: 'Guardar como cliente', submit: 'Guardar cliente', fields: field({ name: 'name', label: 'Nombre', value: m.peer_name, required: true, attrs: 'autofocus' }).toString(), onSubmit: async (v, close) => { await mutate('POST', `/api/messages/${m.id}/client`, { name: v.name }, 'Cliente guardado'); close(); } }); });
on('msgTask', (el) => { const m = M(el); formModal({ title: 'Nueva tarea', submit: 'Crear tarea', fields: field({ name: 'title', label: '¿Qué hay que hacer?', value: m.task || `Responder a ${m.peer_name}`, required: true, attrs: 'autofocus' }).toString(), onSubmit: async (v, close) => { await mutate('POST', `/api/messages/${m.id}/task`, { title: v.title }, 'Tarea creada'); close(); } }); });
on('msgQuote', async (el) => { const m = M(el); let cid = m.client_id; if (!cid) cid = (await mutate('POST', `/api/messages/${m.id}/client`, {}, 'Cliente guardado')).client_id; go(`#/presupuestos/nuevo?cliente=${cid}`); });
on('msgCopy', async (el) => { const t = draftOf(M(el)); try { await navigator.clipboard.writeText(t); toast('Respuesta copiada'); } catch { toast('No se pudo copiar; selecciona el texto.', 'err'); } });
on('msgWa', (el) => { const m = M(el), t = draftOf(m); window.open(`https://wa.me/${m.peer_addr.replace(/\D/g, '').replace(/^(\d{9})$/, '34$1')}?text=${encodeURIComponent(t)}`, '_blank', 'noopener'); });
on('msgDone', async (el) => { const m = M(el); await api('POST', `/api/messages/${m.id}/draft`, { draft: draftOf(m) }); await mutate('POST', '/api/messages/replied', { id: m.id }, 'Marcado como respondido'); delete drafts[m.id]; goNext(m.id); });
on('msgSend', async (el) => {
  const m = M(el), t = draftOf(m).trim(); if (!t) return toast('Escribe la respuesta antes de enviar.', 'err');
  if (!(await confirmBox({ title: `Enviar a ${m.peer_name}`, text: t.length > 220 ? t.slice(0, 220) + '…' : t, ok: 'Enviar ahora' }))) return;
  el.disabled = true;
  try { await mutate('POST', `/api/messages/${m.id}/send`, { text: t }, 'Enviado'); delete drafts[m.id]; goNext(m.id); } catch { el.disabled = false; }
});
function goNext(id) { const n = pending(store.S).find((x) => x.id !== id); go(n ? `#/mensajes/${n.id}` : '#/mensajes'); }
on('pasteMsg', () => {
  formModal({ title: 'Pegar un mensaje', submit: 'Añadir a mensajes', fields: html`<div class="notice" style="grid-column:1/-1">${icon('mensajes')}<span>Para WhatsApp, iMessage o cualquier otro canal: pega aquí lo que te escribió el cliente y el asistente te prepara la respuesta.</span></div>
    ${field({ name: 'channel', label: 'Canal', options: [['whatsapp', 'WhatsApp'], ['imessage', 'iMessage'], ['otro', 'Otro']] })}${field({ name: 'peer_name', label: 'Nombre del cliente', required: true, attrs: 'autofocus' })}
    <div style="grid-column:1/-1">${field({ name: 'peer_addr', label: 'Teléfono (opcional)', hint: 'Para abrir la conversación de WhatsApp con tu respuesta', attrs: 'inputmode="tel"' })}</div><div style="grid-column:1/-1">${field({ name: 'body', label: 'Mensaje', rows: 5, required: true })}</div>`.toString(),
    onSubmit: async (v, close) => { const m = await mutate('POST', '/api/messages/manual', v); close(); go(`#/mensajes/${m.id}`); } });
});
