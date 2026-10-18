// Tarjeta «Archivos» para clientes y documentos: subir (también arrastrando), ver, descargar, renombrar y eliminar.
import { store, on, mutate, toast, confirmBox, formModal, field, reload, refresh } from './core.js';
import { html, raw, esc, icon, fdate } from './util.js';

const size = (n) => (n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
const EXT = (n) => (n.split('.').pop() || '').slice(0, 4).toUpperCase();
const inline = (f) => ['pdf', 'image', 'text'].includes(f.kind) && f.mime !== 'image/heic';

export function filesCard(S, type, id, { title = 'Archivos' } = {}) {
  const list = (S.files || []).filter((f) => f.owner_type === type && f.owner_id === id), key = `${type}:${id}`;
  return html`<section class="card files-card" data-drop="${key}" aria-label="${title}"><div class="card-h"><h2>${title}</h2><label class="btn sm ghost more" for="fu-${type}-${id}">${icon('plus', 'sm')}Añadir</label><input id="fu-${type}-${id}" class="sr" type="file" multiple data-upload="${key}"></div>
    ${list.length ? html`<ul class="list">${list.map((f) => html`<li>${f.kind === 'image' && f.mime !== 'image/heic' ? html`<img class="thumb" src="/api/files/${f.id}/view" alt="" loading="lazy">` : html`<span class="thumb ext" aria-hidden="true">${EXT(f.name)}</span>`}
      <div class="grow" style="min-width:0"><a class="t" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ink)" href="/api/files/${f.id}/${inline(f) ? 'view' : 'download'}" ${inline(f) ? raw('target="_blank" rel="noopener"') : ''}>${f.name}</a><div class="d" style="white-space:normal">${size(f.size)} · ${fdate(f.created_at.slice(0, 10))}${f.note ? ' · ' + f.note : ''}</div></div>
      <a class="btn ghost icon sm" href="/api/files/${f.id}/download" aria-label="Descargar ${f.name}" title="Descargar">${icon('download', 'sm')}</a><button class="btn ghost icon sm" data-act="fileEdit" data-id="${f.id}" aria-label="Renombrar o añadir nota" title="Renombrar">${icon('edit', 'sm')}</button><button class="btn ghost icon sm" data-act="fileDel" data-id="${f.id}" aria-label="Eliminar ${f.name}" title="Eliminar">${icon('trash', 'sm')}</button></li>`)}</ul>`
      : html`<div class="dropzone"><p class="muted">Arrastra aquí contratos, planos, albaranes… <br><span style="font-size:12.5px">PDF, imágenes, Word, Excel, PowerPoint o texto · hasta 25 MB</span></p></div>`}</section>`;
}

async function upload(key, files) {
  const [type, id] = key.split(':'); let ok = 0;
  for (const f of files) {
    try { const r = await fetch(`/api/files?owner_type=${type}&owner_id=${id}&name=${encodeURIComponent(f.name)}`, { method: 'PUT', headers: { 'X-REM': '1' }, body: f }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'No se pudo subir'); ok++; }
    catch (e) { toast(`${f.name}: ${e.message}`, 'err'); }
  }
  if (ok) { await reload(); refresh(); toast(ok === 1 ? 'Archivo añadido' : `${ok} archivos añadidos`); }
}
export function bindFiles(root) {
  root.querySelectorAll('[data-upload]').forEach((i) => i.addEventListener('change', () => { const fs = [...i.files]; i.value = ''; upload(i.dataset.upload, fs); }));
  root.querySelectorAll('[data-drop]').forEach((z) => {
    ['dragenter', 'dragover'].forEach((ev) => z.addEventListener(ev, (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); z.classList.add('over'); } }));
    z.addEventListener('dragleave', (e) => { if (!z.contains(e.relatedTarget)) z.classList.remove('over'); });
    z.addEventListener('drop', (e) => { e.preventDefault(); z.classList.remove('over'); const fs = [...e.dataTransfer.files]; if (fs.length) upload(z.dataset.drop, fs); });
  });
}
on('fileDel', async (el) => { const f = store.S.files.find((x) => x.id === Number(el.dataset.id)); if (await confirmBox({ title: 'Eliminar archivo', text: `Se borra «${f.name}» de tu equipo. No se puede deshacer.`, ok: 'Eliminar', danger: true })) await mutate('DELETE', `/api/files/${f.id}`, undefined, 'Archivo eliminado'); });
on('fileEdit', (el) => { const f = store.S.files.find((x) => x.id === Number(el.dataset.id)); formModal({ title: 'Archivo', submit: 'Guardar', fields: [field({ name: 'name', label: 'Nombre', value: f.name, required: true, attrs: 'autofocus' }), field({ name: 'note', label: 'Nota (opcional)', value: f.note || '', placeholder: 'Ej.: firmado el 12/10' })].join(''), onSubmit: async (v, close) => { await mutate('PUT', `/api/files/${f.id}`, v, 'Guardado'); close(); } }); });
