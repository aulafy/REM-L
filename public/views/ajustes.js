import { store, on, mutate, toast, confirmBox, field, formValues, formModal, go, refresh } from '../core.js';
import { html, raw, eur, eurPlain, icon, api, fdate } from '../util.js';
import { openModal } from '../core.js';
import { validNif } from '../calc.js';

let tab = 'canales';
const TABS = [['canales', 'Canales'], ['conocimiento', 'Conocimiento'], ['ia', 'IA y voz'], ['empresa', 'Empresa'], ['facturacion', 'Facturación'], ['catalogo', 'Catálogo'], ['datos', 'Datos y copias']];
export const openTab = (k) => { tab = k; };
const v = (x) => x ?? '';

function logoResize(file) {
  return new Promise((res, rej) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return rej(new Error('Usa una imagen PNG, JPG o WebP.'));
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, 320 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/png')); };
    img.onerror = () => rej(new Error('No se pudo leer la imagen.')); img.src = url;
  });
}

export const views = {
  ajustes: {
    title: () => 'Ajustes',
    render(S) {
      const s = S.settings;
      const body = {
        empresa: html`<form data-save class="card"><div class="card-h"><h2>Datos de tu empresa</h2></div><div class="card-b grid g2">
          <div class="field" style="grid-column:1/-1"><span class="lbl">Logotipo</span><div class="row">${s.logo ? html`<img src="${s.logo}" alt="Logotipo actual" style="height:48px;max-width:160px;border-radius:8px;border:1px solid var(--line);padding:4px;background:#fff">` : html`<span class="avatar lg">${(s.company_name || 'R')[0]}</span>`}
            <label class="btn sm" for="logo-in">Subir imagen</label><input id="logo-in" class="sr" type="file" accept="image/png,image/jpeg,image/webp">${s.logo ? html`<button type="button" class="btn sm ghost" data-act="rmLogo">Quitar</button>` : ''}</div><span class="hint">Aparece en tus facturas y presupuestos.</span></div>
          ${field({ name: 'company_name', label: 'Nombre o razón social', value: v(s.company_name), required: true })}${field({ name: 'company_nif', label: 'NIF / CIF', value: v(s.company_nif), required: true })}
          ${field({ name: 'company_address', label: 'Dirección', value: v(s.company_address) })}${field({ name: 'company_city', label: 'Población', value: v(s.company_city) })}
          ${field({ name: 'company_zip', label: 'Código postal', value: v(s.company_zip) })}${field({ name: 'company_email', label: 'Email', type: 'email', value: v(s.company_email) })}${field({ name: 'company_phone', label: 'Teléfono', value: v(s.company_phone) })}
          ${field({ name: 'company_iban', label: 'IBAN para cobros', value: v(s.company_iban), hint: 'Se muestra en tus facturas' })}</div>
          <div class="card-h" style="border-top:1px solid var(--line);border-bottom:0"><span class="spacer"></span><button class="btn primary" type="submit">Guardar cambios</button></div></form>`,
        facturacion: html`<form data-save class="card"><div class="card-h"><h2>Valores por defecto</h2></div><div class="card-b grid g2">
          ${field({ name: 'default_iva', label: 'IVA habitual', options: [[21, '21 % general'], [10, '10 % reducido'], [4, '4 % superreducido'], [0, '0 % exento']], value: s.default_iva ?? 21 })}
          ${field({ name: 'default_irpf', label: 'Retención IRPF habitual', options: [[0, 'Ninguna'], [7, '7 %'], [15, '15 %'], [19, '19 %']], value: s.default_irpf ?? 0 })}
          ${field({ name: 'payment_days', label: 'Plazo de pago (días)', type: 'number', value: s.payment_days ?? 30, attrs: 'min="0" max="365"' })}${field({ name: 'quote_days', label: 'Validez de presupuestos (días)', type: 'number', value: s.quote_days ?? 30, attrs: 'min="1" max="365"' })}
          <div style="grid-column:1/-1">${field({ name: 'invoice_footer', label: 'Pie de las facturas', rows: 2, value: v(s.invoice_footer), hint: 'Ej.: datos del Registro Mercantil, texto de protección de datos…' })}</div>
          <div style="grid-column:1/-1">${field({ name: 'quote_footer', label: 'Pie de los presupuestos', rows: 2, value: v(s.quote_footer) })}</div></div>
          <div class="card-h" style="border-top:1px solid var(--line);border-bottom:0"><span class="spacer"></span><button class="btn primary" type="submit">Guardar cambios</button></div></form>`,
        catalogo: html`<section class="card"><div class="card-h"><h2>Artículos y servicios</h2><button class="btn sm more" data-act="newItem">${icon('plus', 'sm')}Nuevo</button></div>
          ${S.items.length ? html`<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nombre</th><th class="right">Precio</th><th class="hide-sm">IVA</th><th></th></tr></thead><tbody>${S.items.map((i) => html`<tr><td><span class="name">${i.name}</span><br><small class="muted">${i.description}</small></td><td class="right num">${eur(i.price)} <small class="muted">/ ${i.unit}</small></td><td class="hide-sm">${i.iva} %</td>
            <td class="right nowrap"><button class="btn ghost icon sm" data-act="editItem" data-id="${i.id}" aria-label="Editar ${i.name}">${icon('edit', 'sm')}</button><button class="btn ghost icon sm" data-act="deleteItem" data-id="${i.id}" aria-label="Eliminar ${i.name}">${icon('trash', 'sm')}</button></td></tr>`)}</tbody></table></div>`
            : html`<div class="empty">${icon('facturas')}<h3>Tu catálogo está vacío</h3><p>Guarda tus servicios y productos habituales para añadirlos a una factura con un clic.</p><button class="btn primary" data-act="newItem">Añadir el primero</button></div>`}</section>`,
        datos: html`<div class="stack"><section class="card"><div class="card-h"><h2>Copias de seguridad</h2><button class="btn sm more" data-act="backupNow">${icon('shield', 'sm')}Crear copia ahora</button></div><div class="card-b"><p class="muted" style="margin-bottom:12px">REM guarda una copia automática cada día en tu equipo y conserva las últimas 20. Guarda también una copia fuera del ordenador de vez en cuando.</p>
          ${S.backups.length ? html`<ul class="list" style="margin:0 -18px -18px">${S.backups.slice(0, 6).map((b) => html`<li><div class="grow"><div class="t">${b.name.slice(8, 18)} · ${b.name.slice(19, 27).replace(/-/g, ':')}</div><div class="d">${b.name.includes('manual') ? 'Manual' : b.name.includes('antes') ? 'Antes de borrar' : 'Automática'} · ${(b.size / 1024).toFixed(0)} KB</div></div></li>`)}</ul>` : html`<p class="muted">Aún no hay copias.</p>`}</div></section>
          <section class="card"><div class="card-h"><h2>Exportar tus datos</h2></div><div class="card-b row wrap"><a class="btn" href="/api/export" download="rem-negocio-datos.json">${icon('download', 'sm')}Todo (JSON)</a><a class="btn" href="/api/export.csv?kind=facturas" download>Facturas (CSV)</a><a class="btn" href="/api/export.csv?kind=gastos" download>Gastos (CSV)</a><a class="btn" href="/api/export.csv?kind=clientes" download>Clientes (CSV)</a></div></section>
          <section class="card"><div class="card-h"><h2>Zona delicada</h2></div><div class="card-b row wrap">${!S.clients.length && !S.documents.length ? html`<button class="btn" data-act="loadDemo">${icon('sparkle', 'sm')}Cargar datos de ejemplo</button>` : ''}<button class="btn danger" data-act="resetAll">${icon('trash', 'sm')}Borrar todos los datos…</button></div></section></div>`,
        canales: html`<div class="stack">
          <section class="card"><div class="card-h"><h2>Telegram</h2>${S.channels.telegram.on ? html`<span class="pill-on more">● Conectado ${S.channels.telegram.bot}</span>` : ''}</div><div class="card-b">${S.channels.telegram.on ? html`<p class="muted" style="margin-bottom:12px">Los mensajes que reciba tu bot aparecerán en Mensajes y podrás responder desde ahí.</p><button class="btn danger" data-act="tgDisconnect">Desconectar</button>`
            : html`<ol class="muted" style="margin:0 0 14px;padding-left:18px"><li>En Telegram, abre <b>@BotFather</b> y envía <code>/newbot</code>.</li><li>Copia el token que te da y pégalo aquí.</li><li>Comparte el enlace de tu bot con tus clientes.</li></ol><form id="tg-form" class="row"><input class="input" name="token" placeholder="123456:ABC…" aria-label="Token del bot" autocomplete="off" style="flex:1"><button class="btn primary" type="submit">Conectar</button></form><p class="hint muted" style="font-size:12.5px;margin-top:8px">El token se guarda en el llavero de macOS.</p>`}</div></section>
          <section class="card"><div class="card-h"><h2>Correo electrónico</h2>${S.channels.email.on ? html`<span class="pill-on more">● Conectado ${S.channels.email.user}</span>` : ''}</div><div class="card-b">${S.channels.email.on ? html`${S.channels.email.error ? html`<div class="notice warn" style="margin-bottom:12px">${icon('alert')}<span>Último error: ${S.channels.email.error}</span></div>` : ''}<p class="muted" style="margin-bottom:12px">REM revisa tu bandeja cada minuto y deja los mensajes en Mensajes. No marca ni borra nada en tu correo.</p><button class="btn danger" data-act="mailDisconnect">Desconectar</button>`
            : html`<form id="mail-form" class="grid g2"><div class="notice" style="grid-column:1/-1">${icon('shield')}<span>Usa una <b>contraseña de aplicación</b> (Gmail, iCloud, Outlook…), no la de tu cuenta. Se guarda en el llavero de macOS.</span></div>
              ${field({ name: 'email_user', label: 'Tu correo', type: 'email', required: true })}${field({ name: 'email_pass', label: 'Contraseña de aplicación', type: 'password', required: true })}
              ${field({ name: 'imap_host', label: 'Servidor de entrada (IMAP)', placeholder: 'imap.gmail.com', required: true })}${field({ name: 'smtp_host', label: 'Servidor de salida (SMTP)', placeholder: 'smtp.gmail.com', required: true })}
              <div style="grid-column:1/-1"><button class="btn primary" type="submit">Conectar correo</button><span class="muted" id="mail-err" style="margin-left:12px;color:var(--red)"></span></div></form>`}</div></section>
          <section class="card"><div class="card-h"><h2>WhatsApp e iMessage</h2></div><div class="card-b"><p class="muted">WhatsApp Business oficial exige verificar tu negocio con Meta y un servidor público, así que de momento se hace de forma sencilla y segura: <b>pega el mensaje</b> del cliente (Mensajes → Pegar mensaje), el asistente te prepara la respuesta y la abres en WhatsApp con un clic. Lo mismo con iMessage.</p></div></section></div>`,
        conocimiento: html`<section class="card"><div class="card-h"><h2>Lo que sabe el asistente de tu negocio</h2><button class="btn sm more" data-act="newDoc">${icon('plus', 'sm')}Añadir</button></div>
          ${S.knowledge.length ? html`<ul class="list">${S.knowledge.map((k) => html`<li class="link" data-act="editDoc" data-id="${k.id}"><span class="badge ic-only blue" style="padding:7px">${icon('book', 'sm')}</span><div class="grow"><div class="t">${k.title}</div><div class="d">${k.chunks} fragmentos · actualizado ${fdate(k.updated_at.slice(0, 10))}</div></div>${icon('edit', 'sm')}</li>`)}</ul>`
            : html`<div class="empty">${icon('book')}<h3>Cuéntale cómo trabajas</h3><p>Tarifas, horarios, zona de servicio, garantías, formas de pago, preguntas frecuentes… El asistente solo responderá con lo que le cuentes aquí.</p><button class="btn primary" data-act="newDoc" data-tpl="1">Empezar con una plantilla</button></div>`}
          <div class="card-b" style="border-top:1px solid var(--line)"><p class="muted" style="font-size:13px">Se guarda en tu equipo. ${S.channels.ai.embeddings ? 'Búsqueda semántica activada.' : 'Búsqueda por palabras clave (sin modelo). Añade un modelo de embeddings en IA y voz para entender sinónimos.'}</p></div></section>`,
        ia: html`<form data-save class="card"><div class="card-h"><h2>IA local</h2></div><div class="card-b stack"><div class="notice">${icon('sparkle')}<span>REM funciona completo sin IA. Con un modelo local (Ollama) el asistente redacta respuestas y contesta preguntas. <b>Nada sale de tu ordenador</b>; solo se admiten direcciones locales.</span></div>
          <div class="grid g2">${field({ name: 'ollama_url', label: 'Dirección de Ollama', value: v(s.ollama_url), placeholder: 'http://127.0.0.1:11434' })}${field({ name: 'ollama_model', label: 'Modelo de texto', value: v(s.ollama_model), placeholder: 'p. ej. qwen3:8b', hint: S.channels.ai.on ? 'Activado' : 'Rellena dirección y modelo para activarlo' })}
          ${field({ name: 'embed_model', label: 'Modelo de embeddings (opcional)', value: v(s.embed_model), placeholder: 'nomic-embed-text', hint: 'Mejora la búsqueda en tu conocimiento' })}</div>
          <div id="models" class="muted" style="font-size:13px"></div>
          <hr style="border:0;border-top:1px solid var(--line);width:100%"><h3 style="font-size:14.5px">Voz</h3>
          <div class="grid g2">${field({ name: 'tts_voice', label: 'Voz para «Escuchar»', value: v(s.tts_voice), placeholder: 'Mónica (vacío = voz del sistema)', hint: 'Usa las voces de macOS: nada se envía fuera.' })}${field({ name: 'whisper_model', label: 'Modelo whisper.cpp (opcional)', value: v(s.whisper_model), placeholder: '/ruta/ggml-base.bin', hint: S.channels.ai.whisper ? 'Transcribirá las notas de voz de Telegram' : 'Necesita whisper-cli instalado y la ruta del modelo' })}</div>
          <p class="muted" style="font-size:12.5px">El botón «Dictar» usa el reconocimiento de voz de tu navegador; según el navegador, el audio puede procesarse fuera del equipo.</p></div>
          <div class="card-h" style="border-top:1px solid var(--line);border-bottom:0"><button class="btn" type="button" data-act="checkModels">Comprobar modelos</button><span class="spacer"></span><button class="btn primary" type="submit">Guardar</button></div></form>`,
      }[tab];
      return html`<div class="page-head"><div><h1>Ajustes</h1></div></div>
        <div class="toolbar"><div class="seg" role="tablist" aria-label="Secciones">${TABS.map(([k, l]) => html`<button role="tab" data-act="stab" data-k="${k}" aria-pressed="${tab === k}" aria-selected="${tab === k}">${l}</button>`)}</div></div>
        <div style="max-width:780px">${body}</div>`;
    },
    mount(root, S) {
      const form = root.querySelector('form[data-save]');
      form?.addEventListener('submit', async (e) => {
        e.preventDefault(); const d = formValues(form);
        if (d.company_nif !== undefined && d.company_nif && !validNif(d.company_nif)) return toast('El NIF/CIF no parece válido.', 'err');
        if (d.company_name !== undefined && !d.company_name) return toast('Pon el nombre de tu empresa.', 'err');
        await mutate('PUT', '/api/settings', d, 'Ajustes guardados');
      });
      root.querySelector('#tg-form')?.addEventListener('submit', async (e) => { e.preventDefault(); const token = e.target.token.value.trim(); if (!token) return toast('Pega el token de tu bot.', 'err'); try { await mutate('POST', '/api/channels/telegram', { token }, 'Telegram conectado'); } catch {} });
      root.querySelector('#mail-form')?.addEventListener('submit', async (e) => { e.preventDefault(); const d = formValues(e.target), err = root.querySelector('#mail-err'); err.textContent = ''; const b = e.target.querySelector('button'); b.disabled = true; b.textContent = 'Conectando…';
        try { await mutate('POST', '/api/channels/email', d, 'Correo conectado'); } catch (x) { err.textContent = x.message; b.disabled = false; b.textContent = 'Conectar correo'; } });
      root.querySelector('#logo-in')?.addEventListener('change', async (e) => { const f = e.target.files[0]; if (!f) return; try { await mutate('PUT', '/api/settings', { logo: await logoResize(f) }, 'Logotipo actualizado'); } catch (err) { toast(err.message, 'err'); } });
    },
  },
};
on('stab', (el) => { tab = el.dataset.k; refresh(); });
on('rmLogo', () => mutate('PUT', '/api/settings', { logo: '' }, 'Logotipo quitado'));
on('backupNow', async () => { await mutate('POST', '/api/backups', {}, 'Copia creada'); });
on('loadDemo', async () => { await mutate('POST', '/api/demo', {}, 'Datos de ejemplo cargados'); go('#/hoy'); });
on('resetAll', () => {
  formModal({ title: 'Borrar todos los datos', submit: 'Borrar todo', fields: html`<div class="notice warn" style="grid-column:1/-1">${icon('alert')}<span>Se borrarán clientes, facturas, gastos y ajustes. Antes se guarda una copia automática. Escribe <b>BORRAR</b> para confirmar.</span></div>${field({ name: 'confirm', label: 'Confirmación', attrs: 'autocomplete="off" autofocus' })}`.toString(),
    onSubmit: async (d, close) => { if (d.confirm !== 'BORRAR') throw new Error('Escribe BORRAR en mayúsculas.'); await mutate('POST', '/api/reset', { confirm: 'BORRAR' }, 'Datos borrados'); close(); go('#/hoy'); } });
});

on('tgDisconnect', async () => { if (await confirmBox({ title: 'Desconectar Telegram', text: 'Dejarás de recibir mensajes de tu bot. Los ya recibidos se conservan.', ok: 'Desconectar', danger: true })) await mutate('POST', '/api/channels/telegram', { disconnect: true }, 'Telegram desconectado'); });
on('mailDisconnect', async () => { if (await confirmBox({ title: 'Desconectar correo', text: 'Dejarás de recibir correos en Mensajes. Los ya recibidos se conservan.', ok: 'Desconectar', danger: true })) await mutate('POST', '/api/channels/email', { disconnect: true }, 'Correo desconectado'); });
on('checkModels', async (el) => { const box = document.getElementById('models'); box.textContent = 'Comprobando…'; try { const r = await api('GET', '/api/ai/status'); box.innerHTML = r.models ? `Modelos instalados: <b>${r.models.map(esc2).join('</b>, <b>')}</b>` : 'No se pudo conectar con Ollama. ¿Está abierto?'; } catch (e) { box.textContent = e.message; } });
const esc2 = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TPL = `Horario\nLunes a viernes de 9:00 a 18:00. Sábados con cita previa.\n\nTarifas\nMano de obra: 45 €/hora (+IVA). Desplazamiento: 25 €. Presupuesto sin compromiso.\n\nZona de servicio\nValencia capital y alrededores (hasta 30 km).\n\nFormas de pago\nTransferencia, tarjeta o Bizum. Facturas a 30 días.\n\nGarantía\n12 meses en reparaciones.\n\nPreguntas frecuentes\n¿Hacéis urgencias? Sí, con recargo del 30 %.`;
function docModal(d, tpl) {
  formModal({ title: d ? 'Editar documento' : 'Nuevo documento', wide: true, submit: d ? 'Guardar' : 'Añadir',
    fields: `<div style="grid-column:1/-1">${field({ name: 'title', label: 'Título', value: d?.title || (tpl ? 'Mi negocio' : ''), required: true, attrs: 'autofocus' })}</div><div style="grid-column:1/-1">${field({ name: 'body', label: 'Contenido', rows: 14, value: d?.body || (tpl ? TPL : ''), required: true, hint: 'Separa los temas con una línea en blanco.' })}</div>`,
    extraFooter: d ? '<button class="btn danger" type="button" id="doc-del">Eliminar</button>' : '',
    onSubmit: async (v, close) => { await mutate(d ? 'PUT' : 'POST', d ? `/api/knowledge/${d.id}` : '/api/knowledge', v, 'Conocimiento guardado'); close(); } });
  document.getElementById('doc-del')?.addEventListener('click', async () => { if (await confirmBox({ title: 'Eliminar documento', text: `Se eliminará «${d.title}».`, ok: 'Eliminar', danger: true })) { await mutate('DELETE', `/api/knowledge/${d.id}`, undefined, 'Eliminado'); document.querySelector('.overlay [data-close]')?.click(); } });
}
on('newDoc', (el) => docModal(null, el.dataset.tpl));
on('editDoc', (el) => docModal(store.S.knowledge.find((k) => k.id === Number(el.dataset.id))));
