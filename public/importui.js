// Asistente «Importar desde CSV»: elegir archivo → revisar columnas y filas → importar. Nada se guarda hasta confirmar.
import { on, toast, openModal, reload, refresh, store } from './core.js';
import { esc, eur, fdate, icon, api } from './util.js';

export const toBase64 = (buf) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode(...b.subarray(i, i + 32768)); return btoa(s); };

const LABEL = { facturas: 'facturas emitidas', gastos: 'gastos' };
const FIELD_LABELS = {
  facturas: [['number', 'Número de factura'], ['date', 'Fecha de emisión'], ['client', 'Cliente'], ['nif', 'NIF/CIF'], ['concept', 'Concepto'], ['base', 'Base imponible'], ['iva_rate', 'IVA %'], ['iva_amount', 'Cuota de IVA'], ['irpf_rate', 'IRPF %'], ['total', 'Total'], ['paid', 'Cobrada (sí/no o fecha)'], ['due_date', 'Vencimiento']],
  gastos: [['date', 'Fecha'], ['supplier', 'Proveedor'], ['concept', 'Concepto'], ['category', 'Categoría'], ['base', 'Base imponible'], ['iva_rate', 'IVA %'], ['iva_amount', 'Cuota de IVA'], ['total', 'Total'], ['notes', 'Notas']],
};
const MISSING = { date: 'la fecha', total: 'el total o la base', client: 'el cliente (nombre o NIF)', concept: 'el concepto o el proveedor' };

function decode(buf) { try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('windows-1252').decode(buf); } }

function start(kind) {
  const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.csv,.tsv,.txt,.xlsx,text/csv' });
  inp.addEventListener('change', async () => {
    const f = inp.files[0]; if (!f) return;
    if (f.size > 12e6) return toast('El archivo es demasiado grande (máximo 12 MB). Divídelo por años.', 'err');
    const buf = await f.arrayBuffer();
    if (/\.xlsx$/i.test(f.name)) {
      try {
        const r = await api('POST', '/api/extract', { name: f.name, data: toBase64(buf), want: 'sheets' });
        const pref = new RegExp(kind === 'facturas' ? 'factur|ingres|venta' : 'gast|compra', 'i'), sheets = r.sheets.filter((s) => s.rows > 1);
        if (!sheets.length) return toast('El libro no tiene filas de datos.', 'err');
        wizard(kind, null, f.name, sheets, sheets.findIndex((s) => pref.test(s.name)) >= 0 ? sheets.findIndex((s) => pref.test(s.name)) : sheets.reduce((b, s, i) => (s.rows > sheets[b].rows ? i : b), 0));
      } catch (e) { toast(e.message, 'err'); }
    } else wizard(kind, decode(buf), f.name);
  });
  inp.click();
}

function wizard(kind, text, fileName, sheets = null, sheet = 0) {
  let mapping = null, p = null, busy = false; if (sheets) text = sheets[sheet].csv;
  const m = openModal({ title: `Importar ${LABEL[kind]}`, wide: true, body: '<div id="im-body" class="stack"><p class="muted">Leyendo el archivo…</p></div>', footer: '<button class="btn" data-close>Cancelar</button><button class="btn primary" id="im-ok" disabled>Importar</button>',
    onMount: (el, close) => { el.querySelector('#im-ok').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Importando…';
      try { const r = await api('POST', '/api/import/commit', { kind, text, mapping }); await reload(); close(); refresh(); toast(`${r.imported} ${LABEL[kind]} importadas${r.clients ? ` · ${r.clients} clientes nuevos` : ''}. Se guardó una copia antes de importar.`); }
      catch (err) { toast(err.message, 'err'); b.disabled = false; b.textContent = 'Importar'; }
    }); } });
  const root = m.el, body = () => root.querySelector('#im-body'), ok = () => root.querySelector('#im-ok');
  async function refreshPreview() {
    busy = true;
    try { p = await api('POST', '/api/import/preview', { kind, text, mapping }); } catch (e) { body().innerHTML = `<div class="notice warn">${icon('alert')}<span>${esc(e.message)}</span></div>`; ok().disabled = true; return; } finally { busy = false; }
    mapping = p.mapping; render();
  }
  function render() {
    const opts = (sel) => `<option value="">— no importar —</option>${p.headers.map((h, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(h || `Columna ${i + 1}`)}</option>`).join('')}`;
    const miss = p.missing.map((k) => MISSING[k] || k);
    const w = (x) => (x.warnings?.length ? `<span class="badge amber" title="${esc(x.warnings.join(' · '))}">aviso</span>` : '');
    body().innerHTML = `<p class="muted" style="margin:0">${esc(fileName)} · ${p.total} filas</p>
      ${sheets && sheets.length > 1 ? `<label class="field"><span class="lbl">Hoja del libro</span><select class="input" id="im-sheet">${sheets.map((s, i) => `<option value="${i}" ${i === sheet ? 'selected' : ''}>${esc(s.name)} (${s.rows - 1} filas)</option>`).join('')}</select></label>` : ''}
      ${miss.length ? `<div class="notice warn">${icon('alert').toString()}<span>No encuentro ${esc(miss.join(', '))}. Elige la columna correspondiente abajo.</span></div>`
      : `<div class="grid g3" style="gap:10px"><div class="stat"><b>${p.ok}</b><span class="muted">se importarán</span></div><div class="stat"><b>${p.duplicates}</b><span class="muted">ya existen</span></div><div class="stat"><b>${p.failed}</b><span class="muted">con errores</span></div></div>
      <p class="muted" style="margin:0">Suman <b>${eur(p.sum)}</b>${p.newClients ? ` · se crearán <b>${p.newClients}</b> clientes nuevos` : ''}${p.withWarnings ? ` · ${p.withWarnings} con avisos` : ''}.</p>`}
      <details ${miss.length ? 'open' : ''}><summary class="lbl" style="cursor:pointer">Columnas del archivo</summary><div class="grid g2" style="margin-top:10px">${FIELD_LABELS[kind].map(([k, l]) => `<label class="field"><span class="lbl">${l}</span><select class="input" data-map="${k}">${opts(p.mapping[k])}</select></label>`).join('')}</div></details>
      ${p.sample.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Fecha</th><th>${kind === 'facturas' ? 'Factura · cliente' : 'Concepto'}</th><th class="right">Base</th><th class="right">IVA</th><th class="right">Total</th><th></th></tr></thead><tbody>${p.sample.map((x) => `<tr><td class="nowrap">${fdate(x.date)}</td><td>${kind === 'facturas' ? `<span class="name">${esc(x.number || 'sin número')}</span><br><small class="muted">${esc(x.name || x.nif)}${x.paidDate ? ' · cobrada' : ''}</small>` : `<span class="name">${esc(x.concept)}</span><br><small class="muted">${esc(x.supplier)} · ${esc(x.category)}</small>`}</td><td class="right num">${eur(x.base)}</td><td class="right num nowrap">${x.rate} %</td><td class="right num"><b>${eur(x.total)}</b></td><td>${w(x)}</td></tr>`).join('')}</tbody></table></div><p class="muted" style="margin:0;font-size:12.5px">Primeras filas de muestra.</p>` : ''}
      ${p.problems.length ? `<details><summary class="lbl" style="cursor:pointer">Filas que no se importarán (${p.problems.length}${p.failed + p.duplicates > p.problems.length ? '+' : ''})</summary><ul class="list" style="margin:8px 0 0">${p.problems.map((x) => `<li style="padding:8px 0"><span class="badge ${x.duplicate ? 'grey' : 'red'}">Línea ${x.line}</span><span class="grow" style="white-space:normal">${esc(x.errors.join('. '))}</span></li>`).join('')}</ul></details>` : ''}`;
    body().querySelector('#im-sheet')?.addEventListener('change', (e) => { sheet = Number(e.target.value); text = sheets[sheet].csv; mapping = null; refreshPreview(); });
    ok().disabled = !p.ok || miss.length > 0; ok().textContent = p.ok ? `Importar ${p.ok}` : 'Importar';
    body().querySelectorAll('[data-map]').forEach((s) => s.addEventListener('change', () => { if (busy) return; mapping = { ...mapping }; if (s.value === '') delete mapping[s.dataset.map]; else mapping[s.dataset.map] = Number(s.value); refreshPreview(); }));
  }
  refreshPreview();
}

export const importCard = () => `<section class="card"><div class="card-h"><h2>Importar datos antiguos</h2></div><div class="card-b"><p class="muted" style="margin-bottom:12px">Trae tus facturas emitidas o tus gastos de años anteriores desde un archivo Excel (.xlsx) o CSV. Verás una vista previa y no se guarda nada hasta que confirmes; antes de importar se crea una copia de seguridad. Las facturas conservan su número y fecha originales.</p>
  <div class="row wrap"><button class="btn" data-act="importPick" data-kind="facturas">${icon('facturas', 'sm').toString()}Importar facturas…</button><button class="btn" data-act="importPick" data-kind="gastos">${icon('gastos', 'sm').toString()}Importar gastos…</button></div></div></section>`;
on('importPick', (el) => start(el.dataset.kind));
