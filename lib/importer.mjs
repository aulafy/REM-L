// Importar facturas y gastos históricos desde CSV (y, más adelante, hojas de Excel ya convertidas a filas).
// Dos pasos: analizar (vista previa, sin tocar nada) y aplicar (una transacción, con copia previa).
import { validNif } from '../public/calc.js';
import { parseVcard } from './vcard.mjs';
import { facturaeToRows } from './facturae.mjs';
import { detectPreset, PRESETS, GUIDES } from './presets.mjs';
import { validatePlan, executePlan, profileTable, buildPayload, suggestPlan } from './importplan.mjs';
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
  clientes: [
    ['name', 'Nombre o razón social', ['nombre', 'nombre completo', 'razon social', 'cliente', 'nombre cliente', 'nombre y apellidos', 'full name', 'name', 'display name', 'nombre comercial', 'denominacion']],
    ['first_name', 'Nombre (de pila)', ['nombre pila', 'given name', 'first name', 'nombre de pila', 'primer nombre', 'nombre propio']],
    ['middle_name', 'Segundo nombre', ['middle name', 'segundo nombre', 'second name', 'nombre intermedio']],
    ['last_name', 'Apellidos', ['apellidos', 'apellido', 'family name', 'last name', 'surname']],
    ['company', 'Empresa', ['empresa', 'company', 'organization name', 'organization 1 name', 'organizacion', 'compania', 'org', 'nombre de la empresa', 'company name']],
    ['nif', 'NIF/CIF', ['nif', 'cif', 'nif cif', 'cif nif', 'dni', 'vat', 'identificacion fiscal', 'nif dni', 'cif dni']],
    ['email', 'Email', ['email', 'e mail', 'correo', 'correo electronico', 'e mail address', 'e mail 1 value', 'email address', 'mail', 'direccion de correo electronico', 'direccion de correo', 'correo electronico 1', 'primary email']],
    ['phone', 'Teléfono', ['telefono', 'tel', 'movil', 'telefono movil', 'mobile phone', 'mobile', 'cell phone', 'phone 1 value', 'phone', 'primary phone', 'telefono 1', 'celular']],
    ['phone_alt', 'Teléfono 2', ['business phone', 'home phone', 'telefono del trabajo', 'telefono particular', 'telefono de la oficina', 'telefono de casa', 'telefono fijo', 'phone 2 value', 'telefono 2', 'work phone', 'other phone', 'telefono trabajo']],
    ['address', 'Dirección', ['direccion', 'domicilio', 'calle', 'address 1 street', 'business street', 'street', 'address', 'direccion postal', 'calle del trabajo', 'calle de la oficina', 'calle de la empresa', 'direccion del trabajo']],
    ['city', 'Población', ['poblacion', 'ciudad', 'localidad', 'address 1 city', 'business city', 'city', 'municipio', 'ciudad del trabajo', 'ciudad de la oficina', 'ciudad de la empresa']],
    ['zip', 'Código postal', ['cp', 'c p', 'codigo postal', 'address 1 postal code', 'business postal code', 'postal code', 'zip', 'zip code', 'codigo postal del trabajo', 'codigo postal de la oficina', 'codigo postal de la empresa']],
    ['notes', 'Notas', ['notas', 'observaciones', 'comentarios', 'nota', 'notes', 'notes 1']],
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
  // «Nombre» junto a «Apellidos» es el nombre de pila, no la razón social.
  if (kind === 'clientes' && map.name !== undefined && map.last_name !== undefined && map.first_name === undefined && ['nombre', 'name'].includes(H[map.name])) { map.first_name = map.name; delete map.name; }
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
  const all = Array.isArray(text) ? text : parseCsv(text).rows;
  if (all.length < 2) throw new Error('El archivo no tiene filas de datos');
  if (all.length - 1 > MAX_ROWS) throw new Error(`Demasiadas filas (máximo ${MAX_ROWS}); divide el archivo por años`);
  const headers = all[0], ncols = Math.max(...all.slice(0, 50).map((r) => r.length));
  const map = mapping ? cleanMap(kind, mapping, ncols) : autoMap(kind, headers);
  const need = kind === 'clientes' ? [] : ['date'];
  const out = { headers, mapping: map, rows: [], missing: need.filter((k) => map[k] === undefined) };
  if (kind !== 'clientes' && !('total' in map) && !('base' in map)) out.missing.push('total');
  if (kind === 'clientes' && !['name', 'company', 'first_name', 'middle_name', 'last_name'].some((k) => k in map)) out.missing.push('name');
  if (kind === 'facturas' && !('client' in map) && !('nif' in map)) out.missing.push('client');
  if (kind === 'gastos' && !('concept' in map) && !('supplier' in map)) out.missing.push('concept');
  if (out.missing.length) return out;
  const seen = new Set(), newClients = new Map();
  for (let n = 1; n < all.length; n++) {
    const r = all[n], g = (k) => cell(r, map[k]), res = { line: n + 1, ok: false, errors: [], warnings: [], data: null, duplicate: false };
    const warn = (w) => res.warnings.push(w);
    if (kind === 'clientes') { analyzeClient(res, g, ctx, seen, warn, newClients); res.ok = !res.errors.length; out.rows.push(res); continue; }
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
          if (number && ctx.numbers.has(number)) { res.duplicate = true; res.errors.push(`La factura ${number} ya existe`); }
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
  if (kind === 'facturas') mergeLines(out.rows);
  out.newClients = [...newClients.values()];
  return out;
}

// Varias filas con el mismo número de factura = varias LÍNEAS de una misma factura (exportaciones «una fila por línea»).
function mergeLines(rows) {
  const groups = new Map(); for (const r of rows) if (r.ok && r.data?.number) (groups.get(r.data.number) || groups.set(r.data.number, []).get(r.data.number)).push(r);
  for (const [number, g] of groups) {
    if (g.length < 2) continue;
    const a = g[0].data, same = g.every((r) => r.data.date === a.date && r.data.nif === a.nif && norm(r.data.name) === norm(a.name) && r.data.irpf === a.irpf);
    if (!same) { for (const r of g) { r.ok = false; r.errors.push(`Las filas de la factura ${number} mezclan clientes, fechas o retenciones distintas`); } continue; }
    a.lines = g.map((r) => ({ desc: r.data.concept, qty: 1, price: r.data.base, iva: r.data.rate, discount: 0 }));
    a.base = g.reduce((t, r) => t + r.data.base, 0); a.total = g.reduce((t, r) => t + r.data.total, 0); a.paidDate = g.every((r) => r.data.paidDate) ? g.map((r) => r.data.paidDate).sort().pop() : null;
    a.due = a.due || g.find((r) => r.data.due)?.data.due || null; g[0].warnings.push(`Factura de ${g.length} líneas`); g[0].lines = g.length;
    for (const r of g.slice(1)) { r.merged = true; r.data = null; }
  }
}

// Un contacto → cliente: empresa (o nombre y apellidos) como nombre; si hay empresa y persona, la persona va a las notas.
function analyzeClient(res, g, ctx, seen, warn, newClients) {
  const company = g('company').trim(), person = [g('first_name'), g('middle_name'), g('last_name')].map((x) => x.trim()).filter(Boolean).join(' '), direct = g('name').trim();
  const name = (direct || company || person).slice(0, 200); if (!name) { res.errors.push('Falta el nombre'); return; }
  const contact = company && (direct || person) ? (direct && direct !== company ? direct : person) : '';
  const nif = g('nif').toUpperCase().replace(/[\s.-]/g, '').slice(0, 20), email = g('email').trim().toLowerCase().slice(0, 200), phone = (g('phone').trim() || g('phone_alt').trim()).slice(0, 40), phone2 = g('phone').trim() && g('phone_alt').trim() ? g('phone_alt').trim() : '';
  if (nif && !validNif(nif)) warn(`El NIF «${nif}» no parece válido`);
  if (email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) warn(`Email «${email}» no válido: se importa tal cual`);
  const keys = [nif && 'n:' + nif, email && 'e:' + email, 'm:' + norm(name)].filter(Boolean);
  const exists = (nif && ctx.byNif.get(nif)) || (email && ctx.clientEmails?.has(email)) || ctx.byName.get(norm(name));
  if (exists) { res.duplicate = true; res.errors.push('Ya tienes un cliente igual (mismo NIF, email o nombre)'); return; }
  if (keys.some((k) => seen.has(k))) { res.duplicate = true; res.errors.push('Repetido en el propio archivo'); return; }
  keys.forEach((k) => seen.add(k)); newClients.set(keys[0], name);
  const notes = [contact && `Contacto: ${contact}`, phone2 && `Otro teléfono: ${phone2}`, g('notes').trim()].filter(Boolean).join('\n').slice(0, 3000);
  res.data = { name, nif, email, phone, address: g('address').trim().slice(0, 300), city: g('city').trim().slice(0, 100), zip: g('zip').trim().slice(0, 10), notes, total: 0 };
}

export const summary = (a) => ({
  headers: a.headers, mapping: a.mapping, missing: a.missing, total: a.rows.length, ok: a.rows.filter((r) => r.ok && r.data).length, merged: a.rows.filter((r) => r.merged).length, duplicates: a.rows.filter((r) => r.duplicate).length,
  failed: a.rows.filter((r) => !r.ok && !r.duplicate).length, withWarnings: a.rows.filter((r) => r.ok && r.data && r.warnings.length).length, newClients: (a.newClients || []).length,
  sum: a.rows.filter((r) => r.ok && r.data).reduce((s, r) => s + (r.data.total || 0), 0),
  sample: a.rows.filter((r) => r.ok && r.data).slice(0, 6).map((r) => ({ line: r.line, warnings: r.warnings, ...r.data })),
  problems: a.rows.filter((r) => !r.ok).slice(0, 25).map((r) => ({ line: r.line, duplicate: r.duplicate, errors: r.errors })),
});

// ---------- aplicar ----------
export function createImporter({ db, run, one, all, tx, nowIso, log, settingsObj, addDays, makeBackup, HttpError, computeTotals, getSecret = () => '', nextNumber = null, defaultSeries = () => 'F' }) {
  db.exec("CREATE TABLE IF NOT EXISTS import_batches(id INTEGER PRIMARY KEY, kind TEXT NOT NULL, source TEXT DEFAULT '', created_at TEXT NOT NULL, counts TEXT NOT NULL DEFAULT '{}', ids TEXT NOT NULL DEFAULT '{}', undone_at TEXT DEFAULT '')");
  const context = () => {
    const s = settingsObj();
    const clients = all('SELECT id, name, nif, email FROM clients');
    const byNif = new Map(clients.filter((c) => c.nif).map((c) => [c.nif.toUpperCase().replace(/[\s.-]/g, ''), c.id])), byName = new Map(clients.map((c) => [norm(c.name), c.id]));
    return {
      defaultIva: Number(s.default_iva ?? 21), paymentDays: Number(s.payment_days ?? 30),
      numbers: new Set(all("SELECT number FROM documents WHERE type='factura' AND number<>''").map((r) => r.number)),
      expenseKeys: new Set(all('SELECT date, supplier, total FROM expenses').map((e) => `${e.date}|${norm(e.supplier)}|${e.total}`)),
      clientEmails: new Set(clients.map((c) => String(c.email || '').trim().toLowerCase()).filter(Boolean)),
      clientBy: (nif, name) => (nif && byNif.get(nif)) || (name && byName.get(norm(name))) || null, byNif, byName,
    };
  };
  // Entrada: texto CSV, filas ya troceadas (array de arrays u objetos: p. ej. los Contactos de macOS) o texto vCard.
  const input = (b) => {
    if (b.facturae !== undefined) {
      const files = (Array.isArray(b.facturae) ? b.facturae : [b.facturae]).map(String); if (!files.length || files.length > 300 || files.some((f) => f.length < 50 || f.length > 12e6)) throw new HttpError(400, 'Archivo Facturae vacío o demasiado grande');
      let r; try { r = facturaeToRows(files, { direction: ['emitidas', 'recibidas'].includes(b.direction) ? b.direction : '', ownNif: settingsObj().company_nif || '' }); } catch (e) { if (e.user) throw new HttpError(e.needsDirection ? 409 : 400, e.message); throw e; }
      if (r.rows.length > MAX_ROWS) throw new HttpError(400, `Demasiadas filas (máximo ${MAX_ROWS})`);
      return { kind: r.kind, text: [r.headers, ...r.rows], meta: { facturae: { direction: r.direction, invoices: r.invoices, warnings: r.warnings.slice(0, 20), version: r.version } } };
    }
    const kind = String(b.kind || ''); if (!FIELDS[kind]) throw new HttpError(400, 'Tipo no válido');
    if (typeof b.vcard === 'string') { if (kind !== 'clientes') throw new HttpError(400, 'Los contactos solo se importan como clientes'); let v; try { v = parseVcard(b.vcard); } catch (e) { throw new HttpError(400, e.message); } if (!v.rows.length) throw new HttpError(400, 'No he encontrado contactos en ese archivo'); return { kind, text: [v.headers, ...v.rows] }; }
    if (Array.isArray(b.rows)) {
      let rows = b.rows; if (rows.length && !Array.isArray(rows[0]) && typeof rows[0] === 'object') { const keys = [...new Set(rows.flatMap((r) => Object.keys(r || {})))]; rows = [keys, ...rows.map((r) => keys.map((k) => String(r?.[k] ?? '')))]; }
      rows = rows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '').trim()) : [])); if (rows.length < 2 || rows.length > MAX_ROWS + 1) throw new HttpError(400, 'Archivo vacío o con demasiadas filas'); return { kind, text: rows };
    }
    const text = String(b.text ?? ''); if (text.length < 5 || text.length > 8e6) throw new HttpError(400, 'Archivo vacío o demasiado grande');
    return { kind, text };
  };
  // Aplica (si viene) un plan de importación: se valida contra las cabeceras reales y se convierte en filas canónicas + mapeo.
  const resolve = (b) => {
    const inp = input(b); if (!b.plan) return inp;
    const rows = Array.isArray(inp.text) ? inp.text : parseCsv(inp.text).rows, v = validatePlan(b.plan, inp.kind, (raw) => rows[Number.isInteger(raw?.header_row) ? raw.header_row : 0] || []);
    if (!v.ok) throw new HttpError(400, 'El plan no es válido: ' + v.errors.slice(0, 3).join('; '));
    const ex = executePlan(v.plan, inp.kind, rows); return { kind: inp.kind, text: ex.rows, mapping: ex.mapping, plan: v.plan, meta: inp.meta };
  };
  const preview = (b) => { const { kind, text, mapping, meta } = resolve(b); try { const an = analyze(kind, text, b.mapping ?? mapping, context()); return { kind, ...(meta || {}), preset: detectPreset(kind, an.headers), ...summary(an), ...(kind === 'facturas' ? { numbering: numbering(an.rows) } : {}) }; } catch (e) { throw new HttpError(400, e.message); } };

  function commit(b) {
    const { kind, text, mapping, meta } = resolve(b); void meta; const ctx = context(); let a;
    try { a = analyze(kind, text, b.mapping ?? mapping, ctx); } catch (e) { throw new HttpError(400, e.message); }
    if (a.missing.length) throw new HttpError(400, 'Faltan columnas obligatorias');
    const good = a.rows.filter((r) => r.ok && r.data); if (!good.length) throw new HttpError(400, 'No hay filas válidas que importar');
    const backup = makeBackup('antes-de-importar'); let createdClients = 0; const made = { clients: [], documents: [], payments: [], expenses: [] };
    tx(() => {
      for (const { data: d } of good) {
        if (kind === 'clientes') { const id = Number(run('INSERT INTO clients(name,nif,email,phone,address,city,zip,notes,archived,created_at) VALUES(?,?,?,?,?,?,?,?,0,?)', d.name, d.nif, d.email, d.phone, d.address, d.city, d.zip, d.notes, nowIso()).lastInsertRowid); made.clients.push(id); createdClients++; continue; }
        if (kind === 'gastos') { made.expenses.push(Number(run('INSERT INTO expenses(date,supplier,concept,category,base,iva,total,notes) VALUES(?,?,?,?,?,?,?,?)', d.date, d.supplier, d.concept, d.category, d.base, d.rate, d.total, d.notes).lastInsertRowid)); continue; }
        let cid = ctx.clientBy(d.nif, d.name);
        if (!cid) { cid = Number(run('INSERT INTO clients(name,nif,created_at) VALUES(?,?,?)', d.name || d.nif, d.nif, nowIso()).lastInsertRowid); createdClients++; made.clients.push(cid); if (d.nif) ctx.byNif.set(d.nif, cid); ctx.byName.set(norm(d.name || d.nif), cid); }
        const lines = d.lines || [{ desc: d.concept, qty: 1, price: d.base, iva: d.rate, discount: 0 }], t = computeTotals(lines, d.irpf);
        const number = d.number || nextFree(ctx, d.date.slice(0, 4));
        const res = run(`INSERT INTO documents(type,status,number,client_id,issue_date,due_date,lines,irpf,notes,base,iva_total,irpf_total,total,created_at,updated_at) VALUES('factura','emitida',?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          number, cid, d.date, d.due || addDays(d.date, ctx.paymentDays), JSON.stringify(lines), d.irpf, 'Importada de un archivo (histórico)', t.base, t.ivaTotal, t.irpfTotal, t.total, nowIso(), nowIso());
        ctx.numbers.add(number); made.documents.push(Number(res.lastInsertRowid));
        if (d.paidDate && t.total > 0) made.payments.push(Number(run('INSERT INTO payments(document_id,date,amount,method,note) VALUES(?,?,?,?,?)', Number(res.lastInsertRowid), d.paidDate, t.total, 'transferencia', 'Importado').lastInsertRowid));
      }
    });
    const noun = { gastos: 'gastos', clientes: 'clientes', facturas: 'facturas' }[kind], source = String(b.source || '').slice(0, 200);
    const batch = Number(run('INSERT INTO import_batches(kind,source,created_at,counts,ids) VALUES(?,?,?,?,?)', kind, source, nowIso(), JSON.stringify({ imported: good.length, clients: made.clients.length, documents: made.documents.length, expenses: made.expenses.length }), JSON.stringify(made)).lastInsertRowid);
    log(`Importados ${good.length} ${noun}${source ? ` desde «${source}»` : ''}${kind === 'facturas' && createdClients ? ` (${createdClients} clientes nuevos)` : ''}`);
    return { imported: good.length, skipped: a.rows.length - good.length - a.rows.filter((r) => r.merged).length, merged: a.rows.filter((r) => r.merged).length, duplicates: a.rows.filter((r) => r.duplicate).length, clients: createdClients, backup: backup.name, batch, numbering: kind === 'facturas' ? numbering(a.rows) : [] };
  }
  const nextFree = (ctx, year) => { let n = 1, num; do num = `F${year}-${String(n++).padStart(4, '0')}`; while (ctx.numbers.has(num)); return num; };

  // Deshacer un lote: borra solo lo que creó y sigue intacto; lo que ya se usó (cobros nuevos, rectificativas, archivos, mensajes…) se conserva y se cuenta.
  function undo(id) {
    const b = one('SELECT * FROM import_batches WHERE id=?', id); if (!b) throw new HttpError(404, 'Ese lote no existe'); if (b.undone_at) throw new HttpError(409, 'Ese lote ya se deshizo');
    const ids = JSON.parse(b.ids), keep = { documents: 0, clients: 0 }, backup = makeBackup('antes-de-deshacer'); let removed = 0;
    const has = (sql, ...p) => !!one(sql, ...p);
    tx(() => {
      for (const e of ids.expenses || []) removed += Number(run('DELETE FROM expenses WHERE id=?', e).changes);
      for (const d of ids.documents || []) {
        const mine = new Set(ids.payments || []), pays = all('SELECT id FROM payments WHERE document_id=?', d), doc = one('SELECT id, status FROM documents WHERE id=?', d); if (!doc) continue;
        if (pays.some((x) => !mine.has(x.id)) || doc.status === 'rectificada' || has('SELECT 1 FROM documents WHERE corrects_id=?', d) || has("SELECT 1 FROM files WHERE owner_type='document' AND owner_id=?", d) || has('SELECT 1 FROM tasks WHERE document_id=?', d)) { keep.documents++; continue; }
        run('DELETE FROM payments WHERE document_id=?', d); run('DELETE FROM documents WHERE id=?', d); removed++;
      }
      for (const c of ids.clients || []) {
        if (!has('SELECT 1 FROM clients WHERE id=?', c)) continue;
        if (has('SELECT 1 FROM documents WHERE client_id=?', c) || has('SELECT 1 FROM messages WHERE client_id=?', c) || has('SELECT 1 FROM tasks WHERE client_id=?', c) || has('SELECT 1 FROM recurring WHERE client_id=?', c) || has('SELECT 1 FROM time_entries WHERE client_id=?', c) || has("SELECT 1 FROM files WHERE owner_type='client' AND owner_id=?", c)) { keep.clients++; continue; }
        run('DELETE FROM clients WHERE id=?', c); removed++;
      }
      run('UPDATE import_batches SET undone_at=? WHERE id=?', nowIso(), id);
    });
    log(`Importación deshecha (lote ${id}): ${removed} registros eliminados${keep.documents + keep.clients ? `, ${keep.documents + keep.clients} conservados porque ya se habían usado` : ''}`);
    return { removed, kept: keep, backup: backup.name };
  }
  const state = () => ({ importBatches: all('SELECT id, kind, source, created_at, counts, undone_at FROM import_batches ORDER BY id DESC LIMIT 20').map((r) => ({ ...r, counts: JSON.parse(r.counts) })) });

  // ¿Los números importados siguen un formato que REM no continuaría solo? (p. ej. 2026/057 → conviene que la siguiente sea la F2026-0058)
  function numbering(rows) {
    if (!nextNumber) return []; const byYear = new Map(), own = defaultSeries();
    for (const r of rows) if (r.ok && r.data?.number && r.data.date && !new RegExp(`^${own}${r.data.date.slice(0, 4)}-\\d+$`).test(r.data.number)) { const m = /(\d+)\s*$/.exec(r.data.number); if (!m) continue; const y = r.data.date.slice(0, 4), cur = byYear.get(y); if (!cur || Number(m[1]) > cur.n) byYear.set(y, { n: Number(m[1]), last: r.data.number }); }
    const prefix = defaultSeries(), out = [];
    for (const [year, v] of [...byYear].sort()) { const current = Number(nextNumber('factura', year, prefix).split('-')[1]) || 1; if (v.n + 1 > current) out.push({ prefix, year, last: v.last, next: v.n + 1, current }); }
    return out;
  }

  // ---- importación asistida con Claude ----
  const asks = []; // límite por hora
  const sourceRows = (b) => { const inp = input(b); return { kind: inp.kind, rows: Array.isArray(inp.text) ? inp.text : parseCsv(inp.text).rows }; };
  function aiPayload(b) {
    const { kind, rows } = sourceRows(b); if (rows.length < 2) throw new HttpError(400, 'El archivo no tiene filas de datos');
    const profile = profileTable(rows, { raw: b.raw === true, name: String(b.source || '').slice(0, 80) }), pl = buildPayload({ kind, profile, feedback: String(b.feedback || '') });
    return { kind, rows, profile, system: pl.system, user: pl.user, bytes: Buffer.byteLength(pl.system + pl.user), masked: b.raw !== true, key: !!getSecret('anthropic_key') };
  }
  async function aiSuggest(b) {
    if (b.consent !== true) throw new HttpError(400, 'Falta tu consentimiento para enviar la muestra');
    const key = getSecret('anthropic_key'); if (!key) throw new HttpError(409, 'Añade tu clave de la API de Claude en Ajustes → Avanzado → Módulos (o en el asistente) para usar esta ayuda');
    const now = Date.now(); while (asks.length && now - asks[0] > 3600e3) asks.shift(); if (asks.length >= 20) throw new HttpError(429, 'Máximo 20 consultas por hora');
    const pay = aiPayload(b); asks.push(now);
    const r = await suggestPlan({ kind: pay.kind, profile: pay.profile, apiKey: key, model: settingsObj().claude_model || 'claude-sonnet-5-5', base: process.env.REM_ANTHROPIC_BASE || 'https://api.anthropic.com', feedback: String(b.feedback || ''), headers: (raw) => pay.rows[Number.isInteger(raw?.header_row) ? raw.header_row : 0] || [], HttpError });
    log(`Importación asistida: plan propuesto para ${pay.kind} (${pay.bytes} bytes enviados${pay.masked ? ', enmascarados' : ', SIN enmascarar'}; ${r.usage?.input_tokens ?? '?'}/${r.usage?.output_tokens ?? '?'} tokens)`);
    const ex = executePlan(r.plan, pay.kind, pay.rows); let sum = null; try { sum = summary(analyze(pay.kind, ex.rows, ex.mapping, context())); } catch (e) { sum = { error: e.message }; }
    return { plan: r.plan, preview: sum, notes: r.plan.notes, questions: r.plan.questions, confidence: r.plan.confidence, attempts: r.attempts, usage: r.usage, skippedRows: ex.skipped };
  }

  async function route(m, p, body) {
    let g;
    if (m === 'GET' && p === '/api/import/guides') return { presets: PRESETS.map(({ id, name, kind, howto }) => ({ id, name, kind, howto })), guides: GUIDES };
    if (m === 'POST' && p === '/api/import/ai/payload') { const { rows, ...rest } = aiPayload(body); return rest; }
    if (m === 'POST' && p === '/api/import/ai/suggest') return aiSuggest(body);
    if (m === 'POST' && p === '/api/import/preview') return preview(body);
    if (m === 'POST' && p === '/api/import/commit') return commit(body);
    if (m === 'POST' && (g = p.match(/^\/api\/import\/batches\/(\d+)\/undo$/))) return undo(Number(g[1]));
  }
  return { route, preview, commit, state, undo, input, context };
}
