// «Rellenar desde mi web» (opcional): lee la web del negocio, enseña lo encontrado y solo guarda lo que el usuario marque.
import { on, toast, openModal, reload, store } from './core.js';
import { api, esc } from './util.js';

const first = () => `<div class="stack"><p class="muted" style="margin:0">Pega la dirección de tu web y buscaré tus datos (nombre, teléfono, dirección, horario, aviso legal…). <b>No se guarda nada hasta que lo revises.</b></p>
  <div class="field"><label for="wp-url">Dirección de tu web</label><input id="wp-url" class="input" placeholder="www.minegocio.es" autocomplete="url" inputmode="url" autofocus></div>
  <fieldset class="field" style="border:0;padding:0;margin:0"><legend class="lbl">¿Completar lo que falte con IA? (opcional)</legend>
    <label class="row" style="gap:8px"><input type="radio" name="wp-ai" value="" checked> No, solo lo que está escrito en la web</label>
    ${store.S.channels?.ai?.on ? '<label class="row" style="gap:8px"><input type="radio" name="wp-ai" value="local"> Sí, con mi modelo local (no sale nada de tu equipo)</label>' : ''}
    ${store.S.claude?.on ? '<label class="row" style="gap:8px"><input type="radio" name="wp-ai" value="claude"> Sí, con Claude (se envía a Anthropic el texto público de tu web)</label>' : ''}</fieldset>
  <p class="err" id="wp-err" role="alert" style="color:var(--red);font-size:13px;margin:0"></p></div>`;

const review = (r) => `<div class="stack"><p class="muted" style="margin:0">He leído ${r.pages.length} página${r.pages.length === 1 ? '' : 's'} de <b>${esc(new URL(r.url).hostname)}</b>${r.ai ? ` y he usado ${esc(r.ai)} para completar` : ''}. Marca lo que quieres guardar:</p>
  ${r.fields.length ? `<ul class="list">${r.fields.map((f) => `<li style="display:block"><label class="row" style="gap:10px;align-items:flex-start"><input type="checkbox" data-wp="${f.key}" ${f.current && f.current !== f.value ? '' : 'checked'} style="margin-top:4px"><span style="flex:1"><b>${esc(f.label)}</b><br><input class="input" data-wp-v="${f.key}" value="${esc(f.value)}" style="margin:4px 0"><span class="hint">${esc(f.source)}${f.current && f.current !== f.value ? ` · <b>ahora tienes:</b> ${esc(f.current)}` : ''}</span></span></label></li>`).join('')}</ul>` : '<p>No he encontrado datos utilizables en esa web.</p>'}
  ${r.social ? `<details><summary class="muted">Redes encontradas (no se guardan)</summary><pre style="white-space:pre-wrap;font-size:13px">${esc(r.social)}</pre></details>` : ''}
  ${r.notes.map((n) => `<p class="hint" style="margin:0">ℹ ${esc(n)}</p>`).join('')}
  <p class="err" id="wp-err" role="alert" style="color:var(--red);font-size:13px;margin:0"></p></div>`;

export function openWebProfile() {
  openModal({ title: 'Rellenar desde mi web', body: first(), footer: '<button class="btn" data-close type="button">Cancelar</button><span class="spacer"></span><button class="btn primary" id="wp-go" type="button">Buscar mis datos</button>',
    onMount: (el, close) => {
      const go = el.querySelector('#wp-go'), err = () => el.querySelector('#wp-err'), body = () => el.querySelector('.modal-body, [data-modal-body]') || el.querySelector('#wp-url')?.closest('.stack')?.parentElement;
      let step = 1, last = null;
      go.onclick = async () => {
        err().textContent = ''; go.disabled = true;
        try {
          if (step === 1) {
            const url = el.querySelector('#wp-url').value.trim(), ai = el.querySelector('input[name=wp-ai]:checked')?.value || '';
            if (!url) throw new Error('Pega la dirección de tu web.');
            go.textContent = 'Leyendo tu web…'; last = await api('POST', '/api/company/from-web', { url, ai });
            const host = el.querySelector('#wp-url').closest('.stack').parentElement; host.innerHTML = review(last); step = 2; go.textContent = 'Guardar lo marcado'; go.disabled = !last.fields.length;
          } else {
            const fields = {}; el.querySelectorAll('[data-wp]:checked').forEach((c) => { fields[c.dataset.wp] = el.querySelector(`[data-wp-v="${c.dataset.wp}"]`).value; });
            if (!Object.keys(fields).length) throw new Error('No has marcado nada.');
            const r = await api('POST', '/api/company/from-web/apply', { fields }); toast(`Datos guardados (${r.saved.length})`); close(); await reload();
          }
        } catch (e) { err().textContent = e.message; go.textContent = step === 1 ? 'Buscar mis datos' : 'Guardar lo marcado'; }
        go.disabled = false;
      };
    } });
}
on('webProfile', openWebProfile);
