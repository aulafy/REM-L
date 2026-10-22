// Asistente «Importar desde CSV»: elegir archivo → revisar columnas y filas → importar. Nada se guarda hasta confirmar.
import { on, toast, openModal, reload, refresh, store, confirmBox, formModal, field } from './core.js';
import { esc, eur, fdate, icon, api } from './util.js';

export const toBase64 = (buf) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode(...b.subarray(i, i + 32768)); return btoa(s); };

const LABEL = { facturas: 'facturas emitidas', gastos: 'gastos', clientes: 'clientes' };
const NOUN = { facturas: 'facturas', gastos: 'gastos', clientes: 'clientes' };
const FIELD_LABELS = {
  clientes: [['name', 'Nombre o razón social'], ['first_name', 'Nombre (de pila)'], ['middle_name', 'Segundo nombre'], ['last_name', 'Apellidos'], ['company', 'Empresa'], ['nif', 'NIF/CIF'], ['email', 'Email'], ['phone', 'Teléfono'], ['phone_alt', 'Teléfono 2'], ['address', 'Dirección'], ['city', 'Población'], ['zip', 'Código postal'], ['notes', 'Notas']],
  facturas: [['number', 'Número de factura'], ['date', 'Fecha de emisión'], ['client', 'Cliente'], ['nif', 'NIF/CIF'], ['concept', 'Concepto'], ['base', 'Base imponible'], ['iva_rate', 'IVA %'], ['iva_amount', 'Cuota de IVA'], ['irpf_rate', 'IRPF %'], ['total', 'Total'], ['paid', 'Cobrada (sí/no o fecha)'], ['due_date', 'Vencimiento']],
  gastos: [['date', 'Fecha'], ['supplier', 'Proveedor'], ['concept', 'Concepto'], ['category', 'Categoría'], ['base', 'Base imponible'], ['iva_rate', 'IVA %'], ['iva_amount', 'Cuota de IVA'], ['total', 'Total'], ['notes', 'Notas']],
};
const MISSING = { date: 'la fecha', total: 'el total o la base', client: 'el cliente (nombre o NIF)', concept: 'el concepto o el proveedor', name: 'el nombre (o nombre y apellidos, o la empresa)' };

function decode(buf) {
  const b = new Uint8Array(buf);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf);   // algunos programas de escritorio exportan en UTF-16
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(buf);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); }
}

// Facturae XML (factura electrónica): uno o varios archivos; si no se sabe si son emitidas o recibidas, se pregunta.
async function startFacturae() {
  const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.xml,text/xml,application/xml', multiple: true });
  inp.addEventListener('change', async () => {
    const fs = [...inp.files]; if (!fs.length) return; if (fs.some((f) => f.size > 12e6)) return toast('Algún archivo es demasiado grande (máximo 12 MB).', 'err');
    const texts = []; for (const f of fs) texts.push(decode(await f.arrayBuffer())); const name = fs.length === 1 ? fs[0].name : `${fs.length} facturas Facturae`;
    const go = async (direction) => { const src = { kind: 'facturae', facturae: texts, direction }; const p = await api('POST', '/api/import/preview', src); wizard(p.kind, null, name, null, 0, src); };
    try { await go(''); }
    catch (e) {
      if (!/emitidas.*recibidas/.test(e.message)) return toast(e.message, 'err');
      openModal({ title: '¿Emitidas o recibidas?', body: '<p style="margin:0">No he podido saber por el NIF si estas facturas las has <b>emitido tú</b> (tus ventas) o las has <b>recibido</b> (tus compras). Completa el NIF de tu negocio en Ajustes → Asistente → Cómo trabajas para que se detecte solo.</p>', footer: '<button class="btn" data-close>Cancelar</button><button class="btn" data-dir="recibidas">Son recibidas (gastos)</button><button class="btn primary" data-dir="emitidas">Son emitidas (ventas)</button>',
        onMount: (el, close) => el.querySelectorAll('[data-dir]').forEach((b) => b.addEventListener('click', async () => { close(); try { await go(b.dataset.dir); } catch (err) { toast(err.message, 'err'); } })) });
    }
  });
  inp.click();
}

function start(kind) {
  if (kind === 'facturae') return startFacturae();
  const inp = Object.assign(document.createElement('input'), { type: 'file', accept: kind === 'clientes' ? '.csv,.tsv,.txt,.xlsx,.dbf,.vcf,text/csv,text/vcard' : '.csv,.tsv,.txt,.xlsx,.dbf,text/csv' });
  inp.addEventListener('change', async () => {
    const f = inp.files[0]; if (!f) return;
    if (f.size > 12e6) return toast('El archivo es demasiado grande (máximo 12 MB). Divídelo por años.', 'err');
    const buf = await f.arrayBuffer();
    if (/\.(xlsx|dbf)$/i.test(f.name)) {
      try {
        const r = await api('POST', '/api/extract', { name: f.name, data: toBase64(buf), want: 'sheets' });
        const pref = new RegExp(kind === 'facturas' ? 'factur|ingres|venta' : kind === 'clientes' ? 'client|contact' : 'gast|compra', 'i'), sheets = r.sheets.filter((s) => s.rows > 1);
        if (!sheets.length) return toast('El libro no tiene filas de datos.', 'err');
        wizard(kind, null, f.name, sheets, sheets.findIndex((s) => pref.test(s.name)) >= 0 ? sheets.findIndex((s) => pref.test(s.name)) : sheets.reduce((b, s, i) => (s.rows > sheets[b].rows ? i : b), 0));
      } catch (e) { toast(e.message, 'err'); }
    } else if (/\.vcf$/i.test(f.name)) wizard(kind, null, f.name, null, 0, { vcard: decode(buf) });
    else wizard(kind, decode(buf), f.name);
  });
  inp.click();
}

// ---- consentimiento: se enseña EXACTAMENTE lo que se enviaría a Claude ----
async function askAI(kind, src, fileName, feedback = '') {
  let raw = false, pay;
  const load = async () => { pay = await api('POST', '/api/import/ai/payload', { kind, ...src, raw, feedback, source: fileName }); };
  try { await load(); } catch (e) { toast(e.message, 'err'); return null; }
  return new Promise((resolve) => {
    let done = false; const finish = (v) => { if (!done) { done = true; resolve(v); } };
    const draw = (el) => {
      el.querySelector('#ai-body').innerHTML = `<p style="margin:0">Claude (de Anthropic) leerá <b>una muestra pequeña</b> de tu archivo (nombres de columnas y unas filas) y propondrá cómo traducirlo a REM. <b>El archivo completo no sale de tu Mac</b>: el plan lo aplica tu equipo.</p>
        ${pay.masked ? `<div class="notice">${icon('shield').toString()}<span>La muestra va <b>enmascarada</b>: los nombres, NIF, emails, teléfonos e importes se sustituyen por su forma («Aaa Aaaa», «A99999999»). Las fechas y las columnas con pocos valores repetidos (categorías, estados) se ven tal cual.</span></div>` : `<div class="notice warn">${icon('alert').toString()}<span><b>Muestra SIN enmascarar:</b> se enviarán datos reales de tus clientes. Asegúrate de que puedes hacerlo.</span></div>`}
        ${pay.key ? '' : `<div class="notice warn">${icon('alert').toString()}<span>Falta la clave de la API de Claude. Añádela en Ajustes → Avanzado → Módulos y vuelve a intentarlo.</span></div>`}
        <label class="row" style="gap:8px"><input type="checkbox" id="ai-raw" ${raw ? 'checked' : ''}> <span>Enviar la muestra sin enmascarar (menos privado, más preciso)</span></label>
        <details open><summary class="lbl" style="cursor:pointer">Esto es lo que se enviará (${(pay.bytes / 1024).toFixed(1)} KB)</summary><pre style="max-height:240px;overflow:auto;white-space:pre-wrap;font-size:12px;background:var(--surface-2);padding:10px;border-radius:8px;margin:8px 0 0">${esc(pay.user)}</pre></details>
        <p class="muted" style="margin:0;font-size:12.5px">Se usa tu propia clave y el coste corre de tu cuenta de Anthropic (unos céntimos). REM guarda en su registro que se hizo la consulta y su tamaño, nunca el contenido.</p>`;
      el.querySelector('#ai-raw').addEventListener('change', async (e) => { raw = e.target.checked; await load(); draw(el); });
      el.querySelector('#ai-go').disabled = !pay.key;
    };
    openModal({ title: 'Ordenar con IA', wide: true, body: '<div id="ai-body" class="stack"></div>', footer: '<button class="btn" data-close>Cancelar</button><button class="btn primary" id="ai-go">Enviar la muestra a Claude</button>', onClose: () => finish(null),
      onMount: (el, close) => { draw(el); el.querySelector('#ai-go').addEventListener('click', async (e) => {
        const b = e.currentTarget; b.disabled = true; b.textContent = 'Consultando a Claude…';
        try { const r = await api('POST', '/api/import/ai/suggest', { kind, ...src, raw, feedback, source: fileName, consent: true }); finish(r); close(); }
        catch (err) { toast(err.message, 'err'); b.disabled = false; b.textContent = 'Enviar la muestra a Claude'; }
      }); } });
  });
}

// Tras importar facturas con numeración ajena: ofrecer que la siguiente factura de REM continúe la serie.
function numberingModal(items) {
  const pad = (n) => String(n).padStart(4, '0');
  openModal({ title: 'Continuar tu numeración', body: `<div class="stack"><p style="margin:0">Las facturas que has importado usan otro formato de número, así que REM no sabría por dónde seguir. Elige cómo numerar la <b>siguiente factura</b> de cada año:</p>
    <ul class="list">${items.map((x) => `<li><div class="grow"><div class="t">${x.year}: tu última factura importada es la ${esc(x.last)}</div><div class="d">La siguiente sería ${x.prefix}${x.year}-${pad(x.next)} (ahora empezaría en ${x.prefix}${x.year}-${pad(x.current)}).</div></div><button class="btn sm primary" data-num="${x.year}" data-next="${x.next}" data-prefix="${x.prefix}">Usar ${x.prefix}${x.year}-${pad(x.next)}</button></li>`).join('')}</ul>
    <p class="muted" style="margin:0;font-size:12.5px">Lo puedes cambiar después en Ajustes → Tu empresa → Facturación → Series.</p></div>`, footer: '<button class="btn" data-close>Ahora no</button>',
    onMount: (el) => el.querySelectorAll('[data-num]').forEach((b) => b.addEventListener('click', async () => { b.disabled = true; try { await api('POST', '/api/invoice-numbering', { prefix: b.dataset.prefix, year: b.dataset.num, next: Number(b.dataset.next) }); b.textContent = 'Hecho'; toast('Numeración ajustada'); } catch (e) { toast(e.message, 'err'); b.disabled = false; } })) });
}

function wizard(kind, text, fileName, sheets = null, sheet = 0, extra = null) {
  let mapping = null, p = null, busy = false, plan = null, planInfo = null; if (sheets) text = sheets[sheet].csv;
  const src = () => (extra || { text }), canAI = !extra;
  const m = openModal({ title: `Importar ${LABEL[kind]}`, wide: true, body: '<div id="im-body" class="stack"><p class="muted">Leyendo el archivo…</p></div>', footer: '<button class="btn" data-close>Cancelar</button><button class="btn primary" id="im-ok" disabled>Importar</button>',
    onMount: (el, close) => { el.querySelector('#im-ok').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Importando…';
      try { const r = await api('POST', '/api/import/commit', { kind, ...src(), mapping: plan ? undefined : mapping, plan: plan || undefined, source: fileName }); await reload(); close(); refresh(); toast(`${r.imported} ${NOUN[kind]} importados${kind === 'facturas' && r.clients ? ` · ${r.clients} clientes nuevos` : ''}. Se guardó una copia antes de importar y puedes deshacerlo en Ajustes → Seguridad y copias.`); if (r.numbering?.length) numberingModal(r.numbering); }
      catch (err) { toast(err.message, 'err'); b.disabled = false; b.textContent = 'Importar'; }
    }); } });
  const root = m.el, body = () => root.querySelector('#im-body'), ok = () => root.querySelector('#im-ok');
  async function refreshPreview() {
    busy = true;
    try { p = await api('POST', '/api/import/preview', { kind, ...src(), mapping: plan ? undefined : mapping, plan: plan || undefined }); } catch (e) { body().innerHTML = `<div class="notice warn">${icon('alert')}<span>${esc(e.message)}</span></div>${canAI ? `<button class="btn" id="im-ai">${icon('sparkle', 'sm')}Probar con IA</button>` : ''}`; ok().disabled = true; body().querySelector('#im-ai')?.addEventListener('click', ai); return; } finally { busy = false; }
    if (!plan) mapping = p.mapping; render();
  }
  async function ai(feedback = '') {
    const r = await askAI(kind, src(), fileName, typeof feedback === 'string' ? feedback : ''); if (!r) return;
    plan = r.plan; planInfo = { notes: r.notes, questions: r.questions, confidence: r.confidence }; refreshPreview();
  }
  function render() {
    const opts = (sel) => `<option value="">— no importar —</option>${p.headers.map((h, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(h || `Columna ${i + 1}`)}</option>`).join('')}`;
    const miss = p.missing.map((k) => MISSING[k] || k), cl = kind === 'clientes';
    const w = (x) => (x.warnings?.length ? `<span class="badge amber" title="${esc(x.warnings.join(' · '))}">aviso</span>` : '');
    const head = cl ? '<th>Nombre</th><th>Contacto</th><th>Población</th><th></th>' : `<th>Fecha</th><th>${kind === 'facturas' ? 'Factura · cliente' : 'Concepto'}</th><th class="right">Base</th><th class="right">IVA</th><th class="right">Total</th><th></th>`;
    const rowOf = (x) => cl ? `<tr><td><span class="name">${esc(x.name)}</span>${x.nif ? `<br><small class="muted">${esc(x.nif)}</small>` : ''}</td><td>${esc(x.email || '')}${x.email && x.phone ? '<br>' : ''}<small class="muted">${esc(x.phone || '')}</small></td><td>${esc(x.city || '')}</td><td>${w(x)}</td></tr>`
      : `<tr><td class="nowrap">${fdate(x.date)}</td><td>${kind === 'facturas' ? `<span class="name">${esc(x.number || 'sin número')}</span><br><small class="muted">${esc(x.name || x.nif)}${x.paidDate ? ' · cobrada' : ''}</small>` : `<span class="name">${esc(x.concept)}</span><br><small class="muted">${esc(x.supplier)} · ${esc(x.category)}</small>`}</td><td class="right num">${eur(x.base)}</td><td class="right num nowrap">${x.rate} %</td><td class="right num"><b>${eur(x.total)}</b></td><td>${w(x)}</td></tr>`;
    body().innerHTML = `<p class="muted" style="margin:0">${esc(fileName)} · ${p.total} filas</p>
      ${p.preset && !plan ? `<p class="muted" style="margin:0">${icon('check', 'sm').toString()} Reconocido: <b>exportación de ${esc(p.preset.name)}</b>.</p>` : ''}
      ${plan ? `<div class="notice">${icon('sparkle').toString()}<span><b>Plan propuesto por Claude</b>${planInfo.confidence != null ? ` (confianza ${Math.round(planInfo.confidence * 100)} %)` : ''}. ${esc(planInfo.notes || '')}${planInfo.questions?.length ? `<br><b>Revisa:</b> ${planInfo.questions.map(esc).join(' · ')}` : ''} <a href="#" id="im-noplan">Volver al mapeo manual</a> · <a href="#" id="im-retry">Pedir otro intento</a></span></div>` : ''}
      ${sheets && sheets.length > 1 ? `<label class="field"><span class="lbl">Hoja del libro</span><select class="input" id="im-sheet">${sheets.map((s, i) => `<option value="${i}" ${i === sheet ? 'selected' : ''}>${esc(s.name)} (${s.rows - 1} filas)</option>`).join('')}</select></label>` : ''}
      ${miss.length ? `<div class="notice warn">${icon('alert').toString()}<span>No encuentro ${esc(miss.join(', '))}. ${plan ? 'Pide otro intento o vuelve al mapeo manual.' : 'Elige la columna correspondiente abajo' + (canAI ? ' o prueba con IA.' : '.')}</span></div>`
      : `<div class="grid g3" style="gap:10px"><div class="stat"><b>${p.ok}</b><span class="muted">se importarán</span></div><div class="stat"><b>${p.duplicates}</b><span class="muted">ya existen</span></div><div class="stat"><b>${p.failed}</b><span class="muted">con errores</span></div></div>
      <p class="muted" style="margin:0">${cl ? `Se crearán <b>${p.ok}</b> clientes` : `Suman <b>${eur(p.sum)}</b>${p.newClients ? ` · se crearán <b>${p.newClients}</b> clientes nuevos` : ''}`}${p.merged ? ` · <b>${p.merged}</b> filas se unen como líneas de otras facturas` : ''}${p.withWarnings ? ` · ${p.withWarnings} con avisos` : ''}.</p>${p.numbering?.length ? `<div class="notice">${icon('check').toString()}<span>Tus números de factura tienen otro formato: al terminar te propondremos cómo continuar la numeración (${p.numbering.map((x) => `${x.year}: tras ${esc(x.last)}`).join(', ')}).</span></div>` : ''}`}
      ${plan ? '' : `<details ${miss.length ? 'open' : ''}><summary class="lbl" style="cursor:pointer">Columnas del archivo</summary><div class="grid g2" style="margin-top:10px">${FIELD_LABELS[kind].map(([k, l]) => `<label class="field"><span class="lbl">${l}</span><select class="input" data-map="${k}">${opts(p.mapping[k])}</select></label>`).join('')}</div></details>`}
      ${p.sample.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr>${head}</tr></thead><tbody>${p.sample.map(rowOf).join('')}</tbody></table></div><p class="muted" style="margin:0;font-size:12.5px">Primeras filas de muestra.</p>` : ''}
      ${p.problems.length ? `<details><summary class="lbl" style="cursor:pointer">Filas que no se importarán (${p.problems.length}${p.failed + p.duplicates > p.problems.length ? '+' : ''})</summary><ul class="list" style="margin:8px 0 0">${p.problems.map((x) => `<li style="padding:8px 0"><span class="badge ${x.duplicate ? 'grey' : 'red'}">Línea ${x.line}</span><span class="grow" style="white-space:normal">${esc(x.errors.join('. '))}</span></li>`).join('')}</ul></details>` : ''}
      ${canAI && !plan ? `<div><button class="btn" id="im-ai">${icon('sparkle', 'sm')}Ordenar con IA…</button> <span class="muted" style="font-size:12.5px">Si tu archivo es raro (títulos, otro programa, columnas con otros nombres).</span></div>` : ''}`;
    body().querySelector('#im-sheet')?.addEventListener('change', (e) => { sheet = Number(e.target.value); text = sheets[sheet].csv; mapping = null; plan = null; refreshPreview(); });
    body().querySelector('#im-ai')?.addEventListener('click', () => ai());
    body().querySelector('#im-noplan')?.addEventListener('click', (e) => { e.preventDefault(); plan = null; mapping = null; refreshPreview(); });
    body().querySelector('#im-retry')?.addEventListener('click', (e) => { e.preventDefault(); formModal({ title: 'Pedir otro intento', submit: 'Pedir otro intento', fields: `<div style="grid-column:1/-1">${field({ name: 'fb', label: '¿Qué debería corregir Claude?', rows: 3, placeholder: 'Por ejemplo: las fechas son mes/día/año', attrs: 'autofocus' })}</div>`, onSubmit: async (v, close) => { close(); ai(v.fb); } }); });
    ok().disabled = !p.ok || miss.length > 0; ok().textContent = p.ok ? `Importar ${p.ok}` : 'Importar';
    body().querySelectorAll('[data-map]').forEach((s) => s.addEventListener('change', () => { if (busy) return; mapping = { ...mapping }; if (s.value === '') delete mapping[s.dataset.map]; else mapping[s.dataset.map] = Number(s.value); refreshPreview(); }));
  }
  refreshPreview();
}

export const importCard = (S) => `<section class="card"><div class="card-h"><h2>Importar datos antiguos</h2></div><div class="card-b"><p class="muted" style="margin-bottom:12px">Trae tus <b>clientes</b> (Contactos de Mac, Google, Outlook o una hoja de cálculo: CSV, vCard o Excel), tus <b>facturas emitidas</b> o tus <b>gastos</b> de otros programas. Verás una vista previa y no se guarda nada hasta que confirmes; antes de importar se crea una copia de seguridad y puedes <b>deshacer</b> cada importación. Si el archivo es raro, la IA te ayuda a entenderlo.</p>
  <div class="row wrap"><button class="btn" data-act="importPick" data-kind="clientes">${icon('clientes', 'sm').toString()}Importar clientes / contactos…</button><button class="btn" data-act="importPick" data-kind="facturas">${icon('facturas', 'sm').toString()}Importar facturas…</button><button class="btn" data-act="importPick" data-kind="gastos">${icon('gastos', 'sm').toString()}Importar gastos…</button><button class="btn ghost" data-act="importGuides">¿Cómo exporto mis datos?</button><button class="btn" data-act="importPick" data-kind="facturae">${icon('facturas', 'sm').toString()}Facturas electrónicas (Facturae XML)…</button></div></div>
  ${(S?.importBatches || []).length ? `<ul class="list" style="border-top:1px solid var(--line)">${S.importBatches.slice(0, 6).map((b) => `<li><div class="grow"><div class="t">${b.counts.imported} ${NOUN[b.kind] || b.kind}${b.source ? ` · ${esc(b.source)}` : ''}</div><div class="d">${fdate(b.created_at.slice(0, 10))}${b.undone_at ? ' · deshecha' : ''}</div></div>${b.undone_at ? '' : `<button class="btn sm" data-act="importUndo" data-id="${b.id}">Deshacer</button>`}</li>`).join('')}</ul>` : ''}</section>`;
on('importPick', (el) => start(el.dataset.kind));
on('importUndo', async (el) => {
  if (!(await confirmBox({ title: 'Deshacer la importación', text: 'Se borra lo que creó esa importación. Lo que ya hayas usado (cobros nuevos, tareas, mensajes, archivos) se conserva. Antes se guarda una copia.', ok: 'Deshacer', danger: true }))) return;
  try { const r = await api('POST', `/api/import/batches/${el.dataset.id}/undo`, {}); await reload(); refresh(); toast(`Deshecho: ${r.removed} registros eliminados${r.kept.documents + r.kept.clients ? ` · ${r.kept.documents + r.kept.clients} se conservan porque ya se usaron` : ''}.`); } catch (e) { toast(e.message, 'err'); }
});

on('importGuides', async () => {
  try {
    const g = await api('GET', '/api/import/guides'), list = [...g.presets.map((p) => ({ name: p.name, steps: p.howto })), ...g.guides.map((x) => ({ name: x.name, steps: x.steps }))];
    openModal({ title: '¿Cómo exporto mis datos?', wide: true, body: `<div class="stack"><p class="muted" style="margin:0">Pasos para sacar tus datos de otros programas. Los menús pueden cambiar según la versión: si no encuentras algo, busca «exportar» en la ayuda del programa.</p>${list.map((x) => `<details><summary class="lbl" style="cursor:pointer">${esc(x.name)}</summary><ol style="margin:8px 0 0;padding-left:20px">${x.steps.map((t) => `<li>${esc(t)}</li>`).join('')}</ol></details>`).join('')}</div>`, footer: '<button class="btn" data-close>Cerrar</button>' });
  } catch (e) { toast(e.message, 'err'); }
});
