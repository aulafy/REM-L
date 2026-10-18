// Importar facturas y gastos históricos desde CSV (y, más adelante, hojas de Excel ya convertidas a filas).
// Dos pasos: analizar (vista previa, sin tocar nada) y aplicar (una transacción, con copia previa).
const MAX_ROWS = 5000;
const CATS = ['alquiler', 'material', 'suministros', 'vehículo', 'servicios profesionales', 'marketing', 'impuestos y tasas', 'otros'];

export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ---------- CSV ----------
export function parseCsv(text) {
  text = String(text ?? '').replace(/^﻿/, '');
  const head = text.split(/\r?\n/, 5).join('\n');
  const count = (c) => (head.match(new RegExp(c === '\t' ? '\\t' : '\\' + c, 'g')) || []).length;
  const delimiter = [';', '\t', ',', '|'].map((c) => [c, count(c)]).sort((a, b) => b[1] - a[1])[0];
  const d = delimiter[1] ? delimiter[0] : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"' && cur === '') q = true;
    else if (c === d) { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; }
    else cur += c;
    if (rows.length > MAX_ROWS + 1) break;
  }
  row.push(cur); if (row.some((x) => x.trim() !== '')) rows.push(row);
  return { rows: rows.map((r) => r.map((x) => x.trim())), delimiter: d };
}

// ---------- valores ----------
// Importe en céntimos desde «1.234,56», «1234.56», «(12,00)», «-45 €»…; null si no es un número.
export function parseMoney(v) {
  let s = String(v ?? '').trim(); if (!s) return null;
  let neg = false; if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[€$£\s ]|eur(os?)?/gi, '');
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); } else if (s.startsWith('+')) s = s.slice(1);
  if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1); }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  let dec = '';
  if (lc >= 0 && ld >= 0) { const sep = lc > ld ? ',' : '.'; const at = Math.max(lc, ld); dec = s.slice(at + 1); s = s.slice(0, at).replace(/[.,]/g, ''); if (sep && /\D/.test(dec)) return null; }
  else if (lc >= 0 || ld >= 0) {
    const ch = lc >= 0 ? ',' : '.', parts = s.split(ch);
    if (parts.length > 2) s = parts.join('');                                  // 1.234.567
    else if (ch === '.' && /^\d{1,3}\.\d{3}$/.test(s) && !/^0\./.test(s)) s = parts.join(''); // 1.234 = mil doscientos
    else { s = parts[0]; dec = parts[1]; }
  }
  if (!/^\d*$/.test(s) || !/^\d*$/.test(dec)) return null;
  const cents = Number(s || 0) * 100 + Math.round(Number((dec + '00').slice(0, 2)) + (Number((dec + '000')[2]) >= 5 ? 1 : 0));
  return neg ? -cents : cents;
}
// Porcentaje: «21», «21 %», «21,5», «0,21» (fracción).
export function parsePct(v) {
  const s = String(v ?? '').replace('%', '').replace(',', '.').trim(); if (!s || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  let n = Number(s); if (n > 0 && n < 1) n *= 100; return n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null;
}
const validDate = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d && y >= 1990 && y <= 2100; };
const iso = (y, m, d) => (validDate(y, m, d) ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null);
const MONTHS = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };
export function parseDate(v) {
  const s = String(v ?? '').trim(); if (!s) return null; let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/))) return iso(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:[ T].*)?$/))) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  if ((m = s.match(/^(\d{1,2})\s*(?:de\s+)?([a-záéíóú]{3,})\.?\s*(?:de\s+)?(\d{4})$/i)) && MONTHS[norm(m[2]).slice(0, 3)]) return iso(+m[3], MONTHS[norm(m[2]).slice(0, 3)], +m[1]);
  if (/^\d{5}$/.test(s) && +s > 32000 && +s < 70000) { const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000); return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()); } // serie de Excel
  return null;
}
const snap = (n, list, tol) => { const b = list.reduce((a, x) => (Math.abs(x - n) < Math.abs(a - n) ? x : a), list[0]); return Math.abs(b - n) <= tol ? b : Math.round(n * 100) / 100; };

// ---------- columnas ----------
export const FIELDS = {
  facturas: [
    ['number', 'Número de factura', ['numero', 'n factura', 'num factura', 'numero factura', 'factura', 'n', 'no', 'nº', 'invoice', 'invoice number', 'num']],
    ['date', 'Fecha de emisión', ['fecha', 'fecha factura', 'fecha emision', 'emision', 'date', 'fecha de emision', 'fecha expedicion']],
    ['client', 'Cliente', ['cliente', 'nombre', 'razon social', 'nombre cliente', 'destinatario', 'customer', 'client']],
    ['nif', 'NIF/CIF', ['nif', 'cif', 'nif cif', 'cif nif', 'dni', 'vat', 'identificacion fiscal']],
    ['concept', 'Concepto', ['concepto', 'descripcion', 'detalle', 'description']],
    ['base', 'Base imponible', ['base', 'base imponible', 'neto', 'subtotal', 'importe sin iva', 'importe neto']],
    ['iva_rate', 'IVA %', ['iva', 'iva %', '% iva', 'tipo iva', 'tipo', 'porcentaje iva', 'vat rate']],
    ['iva_amount', 'Cuota de IVA', ['cuota iva', 'cuota', 'importe iva', 'iva eur', 'iva importe', 'total iva']],
    ['irpf_rate', 'IRPF %', ['irpf', 'irpf %', '% irpf', 'retencion', 'retencion %', '% retencion']],
    ['total', 'Total', ['total', 'importe', 'importe total', 'total factura', 'total eur', 'amount']],
    ['paid', 'Cobrada (sí/no o fecha)', ['cobrada', 'pagada', 'cobrado', 'pagado', 'estado', 'situacion', 'paid', 'fecha cobro', 'fecha de cobro', 'fecha pago']],
    ['due_date', 'Vencimiento', ['vencimiento', 'fecha vencimiento', 'vence', 'fecha de vencimiento', 'due date']],
  ],
  gastos: [
    ['date', 'Fecha', ['fecha', 'date', 'fecha gasto', 'fecha factura', 'fecha de la factura']],
    ['supplier', 'Proveedor', ['proveedor', 'emisor', 'acreedor', 'supplier', 'vendor', 'nombre', 'comercio']],
    ['concept', 'Concepto', ['concepto', 'descripcion', 'detalle', 'description', 'gasto']],
    ['category', 'Categoría', ['categoria', 'tipo gasto', 'clasificacion', 'category', 'cuenta']],
    ['base', 'Base imponible', ['base', 'base imponible', 'neto', 'subtotal', 'importe sin iva']],
    ['iva_rate', 'IVA %', ['iva', 'iva %', '% iva', 'tipo iva', 'tipo', 'porcentaje iva']],
    ['iva_amount', 'Cuota de IVA', ['cuota iva', 'cuota', 'importe iva', 'iva eur', 'total iva']],
    ['total', 'Total', ['total', 'importe', 'importe total', 'total eur', 'amount']],
    ['notes', 'Notas', ['notas', 'observaciones', 'comentarios', 'nota', 'notes']],
  ],
};
export function autoMap(kind, headers) {
  const spec = FIELDS[kind], map = {}, used = new Set(), H = headers.map(norm);
  for (const pass of [0, 1]) for (const [key, , syn] of spec) {
    if (map[key] !== undefined) continue;
    const i = H.findIndex((h, j) => !used.has(j) && h && (pass === 0 ? syn.includes(h) : syn.some((s) => s.length > 3 && (h.startsWith(s + ' ') || h.endsWith(' ' + s)))));
    if (i >= 0) { map[key] = i; used.add(i); }
  }
  return map;
}
const cleanMap = (kind, map, ncols) => { const out = {}; for (const [k] of FIELDS[kind]) { const v = map?.[k]; if (v !== undefined && v !== null && v !== '' && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) < ncols) out[k] = Number(v); } return out; };

// ---------- análisis ----------
const PAID_YES = /^(si|s|x|1|true|ok|cobrad[oa]|pagad[oa]|paid|abonad[oa])$/, PAID_NO = /^(no|n|0|false|pendiente|impagad[oa]|sin cobrar|por cobrar)?$/;

function amounts({ base, rate, ivaAmt, total, irpfRate }, defaultIva, warn) {
  let irpf = irpfRate ?? 0, r = rate;
  if (base === null && total === null) return { err: 'Falta el importe (base o total)' };
  if (r === null && base !== null && ivaAmt !== null && base !== 0) r = snap(Math.abs(ivaAmt / base) * 100, [0, 4, 5, 10, 21], 0.6);
  if (r === null && base !== null && total !== null && irpfRate === null && base !== 0) { const x = snap(((total - base) / base) * 100, [0, 4, 5, 10, 21], 0.6); if (x >= 0 && x <= 30) r = x; }
  if (r === null) { r = defaultIva; warn('IVA no indicado: se ha supuesto el ' + r + ' %'); }
  const calc = (b, ir) => b + Math.round((b * r) / 100) - Math.round((b * ir) / 100);
  if (base === null) { base = Math.round(total / (1 + r / 100 - irpf / 100)); }
  let comp = calc(base, irpf);
  if (total !== null && Math.abs(comp - total) > 2 && irpfRate === null && comp > total && base > 0) {
    const pct = snap(((comp - total) / base) * 100, [1, 2, 7, 15, 19], 0.35);
    if (Math.abs(calc(base, pct) - total) <= 2) { irpf = pct; comp = calc(base, irpf); warn(`Se ha deducido una retención de IRPF del ${pct} %`); }
  }
  if (total !== null && Math.abs(comp - total) > 2) return { err: `El total no cuadra: base e IVA suman ${(comp / 100).toFixed(2)} y el archivo dice ${(total / 100).toFixed(2)}` };
  if (total !== null && comp !== total) warn('Diferencia de céntimos con el total del archivo');
  return { base, rate: r, irpf, total: comp };
}

const cell = (row, i) => (i === undefined ? '' : row[i] ?? '');

export function analyze(kind, text, mapping, ctx) {
  if (!FIELDS[kind]) throw new Error('Tipo no válido');
  const { rows: all } = parseCsv(text);
  if (all.length < 2) throw new Error('El archivo no tiene filas de datos');
  if (all.length - 1 > MAX_ROWS) throw new Error(`Demasiadas filas (máximo ${MAX_ROWS}); divide el archivo por años`);
  const headers = all[0], ncols = Math.max(...all.slice(0, 50).map((r) => r.length));
  const map = mapping ? cleanMap(kind, mapping, ncols) : autoMap(kind, headers);
  const need = kind === 'facturas' ? ['date'] : ['date'];
  const out = { headers, mapping: map, rows: [], missing: need.filter((k) => map[k] === undefined) };
  if (!('total' in map) && !('base' in map)) out.missing.push('total');
  if (kind === 'facturas' && !('client' in map) && !('nif' in map)) out.missing.push('client');
  if (kind === 'gastos' && !('concept' in map) && !('supplier' in map)) out.missing.push('concept');
  if (out.missing.length) return out;
  const seen = new Set(), newClients = new Map();
  for (let n = 1; n < all.length; n++) {
    const r = all[n], g = (k) => cell(r, map[k]), res = { line: n + 1, ok: false, errors: [], warnings: [], data: null, duplicate: false };
    const warn = (w) => res.warnings.push(w);
    const date = parseDate(g('date'));
    if (!date) res.errors.push(g('date') ? `Fecha no válida («${g('date')}»)` : 'Falta la fecha');
    const money = (k) => { const v = g(k); if (v === '') return null; const m = parseMoney(v); if (m === null) res.errors.push(`Importe no válido en ${FIELDS[kind].find((f) => f[0] === k)[1]} («${v}»)`); return m; };
    const pct = (k) => { const v = g(k); if (v === '') return null; const m = parsePct(v); if (m === null) res.errors.push(`Porcentaje no válido («${v}»)`); return m; };
    const base = money('base'), ivaAmt = money('iva_amount'), total = money('total'), rate = pct('iva_rate'), irpfRate = kind === 'facturas' ? pct('irpf_rate') : null;
    if (!res.errors.length) {
      const a = amounts({ base, rate, ivaAmt, total, irpfRate }, ctx.defaultIva ?? 21, warn);
      if (a.err) res.errors.push(a.err);
      else if (kind === 'facturas') {
        const name = g('client').slice(0, 200), nif = g('nif').toUpperCase().replace(/[\s.-]/g, '').slice(0, 20), number = g('number').slice(0, 40);
        if (!name && !nif) res.errors.push('Falta el cliente');
        const due = g('due_date') ? parseDate(g('due_date')) : null; if (g('due_date') && !due) warn('Vencimiento no válido: se calcula según tus días de pago');
        let paidDate = null; const pv = norm(g('paid'));
        if (pv) { const d = parseDate(g('paid')); if (d) paidDate = d; else if (PAID_YES.test(pv)) paidDate = date; else if (!PAID_NO.test(pv)) warn(`Estado «${g('paid')}» no reconocido: se deja pendiente`); }
        if (!res.errors.length) {
          if (number && (ctx.numbers.has(number) || seen.has('f' + number))) { res.duplicate = true; res.errors.push(`La factura ${number} ya existe`); }
          if (number) seen.add('f' + number);
          const key = nif || norm(name); if (!ctx.clientBy(nif, name) && !newClients.has(key)) newClients.set(key, name || nif);
          res.data = { number, date, due, name, nif, concept: g('concept').slice(0, 400) || 'Factura importada', base: a.base, rate: a.rate, irpf: a.irpf, total: a.total, paidDate };
        }
      } else {
        const supplier = g('supplier').slice(0, 200), concept = (g('concept') || supplier).slice(0, 300);
        if (!concept) res.errors.push('Falta el concepto o el proveedor');
        if (!res.errors.length) {
          let cat = norm(g('category')); cat = CATS.find((c) => norm(c) === cat) || (cat ? g('category').toLowerCase().slice(0, 40) : 'otros');
          const key = `${date}|${norm(supplier)}|${a.total}`; if (ctx.expenseKeys.has(key)) { res.duplicate = true; res.errors.push('Ya hay un gasto igual (misma fecha, proveedor e importe)'); }
          res.data = { date, supplier, concept, category: cat, base: a.base, rate: a.rate, total: a.total, notes: g('notes').slice(0, 1000) };
        }
      }
    }
    res.ok = !res.errors.length; out.rows.push(res);
  }
  out.newClients = [...newClients.values()];
  return out;
}

export const summary = (a) => ({
  headers: a.headers, mapping: a.mapping, missing: a.missing, total: a.rows.length, ok: a.rows.filter((r) => r.ok).length, duplicates: a.rows.filter((r) => r.duplicate).length,
  failed: a.rows.filter((r) => !r.ok && !r.duplicate).length, withWarnings: a.rows.filter((r) => r.ok && r.warnings.length).length, newClients: (a.newClients || []).length,
  sum: a.rows.filter((r) => r.ok).reduce((s, r) => s + r.data.total, 0),
  sample: a.rows.filter((r) => r.ok).slice(0, 6).map((r) => ({ line: r.line, warnings: r.warnings, ...r.data })),
  problems: a.rows.filter((r) => !r.ok).slice(0, 25).map((r) => ({ line: r.line, duplicate: r.duplicate, errors: r.errors })),
});

// ---------- aplicar ----------
export function createImporter({ db, run, one, all, tx, nowIso, log, settingsObj, addDays, makeBackup, HttpError, computeTotals }) {
  const context = () => {
    const s = settingsObj();
    const clients = all('SELECT id, name, nif FROM clients');
    const byNif = new Map(clients.filter((c) => c.nif).map((c) => [c.nif.toUpperCase().replace(/[\s.-]/g, ''), c.id])), byName = new Map(clients.map((c) => [norm(c.name), c.id]));
    return {
      defaultIva: Number(s.default_iva ?? 21), paymentDays: Number(s.payment_days ?? 30),
      numbers: new Set(all("SELECT number FROM documents WHERE type='factura' AND number<>''").map((r) => r.number)),
      expenseKeys: new Set(all('SELECT date, supplier, total FROM expenses').map((e) => `${e.date}|${norm(e.supplier)}|${e.total}`)),
      clientBy: (nif, name) => (nif && byNif.get(nif)) || (name && byName.get(norm(name))) || null, byNif, byName,
    };
  };
  const input = (b) => {
    const kind = String(b.kind || ''); if (!FIELDS[kind]) throw new HttpError(400, 'Tipo no válido');
    const text = String(b.text ?? ''); if (text.length < 5 || text.length > 8e6) throw new HttpError(400, 'Archivo vacío o demasiado grande');
    return { kind, text };
  };
  const preview = (b) => { const { kind, text } = input(b); try { return { kind, ...summary(analyze(kind, text, b.mapping, context())) }; } catch (e) { throw new HttpError(400, e.message); } };

  function commit(b) {
    const { kind, text } = input(b); const ctx = context(); let a;
    try { a = analyze(kind, text, b.mapping, ctx); } catch (e) { throw new HttpError(400, e.message); }
    if (a.missing.length) throw new HttpError(400, 'Faltan columnas obligatorias');
    const good = a.rows.filter((r) => r.ok); if (!good.length) throw new HttpError(400, 'No hay filas válidas que importar');
    const backup = makeBackup('antes-de-importar'); let createdClients = 0;
    tx(() => {
      for (const { data: d } of good) {
        if (kind === 'gastos') { run('INSERT INTO expenses(date,supplier,concept,category,base,iva,total,notes) VALUES(?,?,?,?,?,?,?,?)', d.date, d.supplier, d.concept, d.category, d.base, d.rate, d.total, d.notes); continue; }
        let cid = ctx.clientBy(d.nif, d.name);
        if (!cid) { cid = Number(run('INSERT INTO clients(name,nif,created_at) VALUES(?,?,?)', d.name || d.nif, d.nif, nowIso()).lastInsertRowid); createdClients++; if (d.nif) ctx.byNif.set(d.nif, cid); ctx.byName.set(norm(d.name || d.nif), cid); }
        const lines = [{ desc: d.concept, qty: 1, price: d.base, iva: d.rate, discount: 0 }], t = computeTotals(lines, d.irpf);
        const number = d.number || nextFree(ctx, d.date.slice(0, 4));
        const res = run(`INSERT INTO documents(type,status,number,client_id,issue_date,due_date,lines,irpf,notes,base,iva_total,irpf_total,total,created_at,updated_at) VALUES('factura','emitida',?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          number, cid, d.date, d.due || addDays(d.date, ctx.paymentDays), JSON.stringify(lines), d.irpf, 'Importada de un archivo (histórico)', t.base, t.ivaTotal, t.irpfTotal, t.total, nowIso(), nowIso());
        ctx.numbers.add(number);
        if (d.paidDate && t.total > 0) run('INSERT INTO payments(document_id,date,amount,method,note) VALUES(?,?,?,?,?)', Number(res.lastInsertRowid), d.paidDate, t.total, 'transferencia', 'Importado');
      }
    });
    log(`Importadas ${good.length} ${kind === 'gastos' ? 'gastos' : 'facturas'} desde un archivo CSV${createdClients ? ` (${createdClients} clientes nuevos)` : ''}`);
    return { imported: good.length, skipped: a.rows.length - good.length, duplicates: a.rows.filter((r) => r.duplicate).length, clients: createdClients, backup: backup.name };
  }
  const nextFree = (ctx, year) => { let n = 1, num; do num = `F${year}-${String(n++).padStart(4, '0')}`; while (ctx.numbers.has(num)); return num; };

  async function route(m, p, body) {
    if (m === 'POST' && p === '/api/import/preview') return preview(body);
    if (m === 'POST' && p === '/api/import/commit') return commit(body);
  }
  return { route, preview, commit };
}
