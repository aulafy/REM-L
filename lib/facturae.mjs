// Facturae (factura electrónica española, 3.2.x) → filas para el importador. Sin librerías: un lector XML mínimo y seguro
// (no resuelve entidades propias ni DTD, límites de tamaño, profundidad y nodos) y la lectura de los bloques estándar del esquema oficial.
const fail = (m) => Object.assign(new Error(m), { user: true });
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const dec = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => (e[0] === '#' ? (() => { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)); return n > 0 && n < 0x110000 && !(n >= 0xd800 && n < 0xe000) ? String.fromCodePoint(n) : ''; })() : ENT[e.toLowerCase()] ?? ''));

export function parseXml(text, { maxNodes = 300000, maxDepth = 64, maxBytes = 12e6 } = {}) {
  text = String(text ?? '').replace(/^﻿/, ''); if (text.length > maxBytes) throw fail('El XML es demasiado grande');
  const root = { name: '#root', kids: [], text: '' }, stack = [root]; let i = 0, nodes = 0; const n = text.length;
  while (i < n) {
    const lt = text.indexOf('<', i); if (lt < 0) { stack.at(-1).text += dec(text.slice(i)); break; }
    if (lt > i) stack.at(-1).text += dec(text.slice(i, lt)); i = lt;
    if (text.startsWith('<!--', i)) { const e = text.indexOf('-->', i + 4); if (e < 0) throw fail('XML mal formado (comentario sin cerrar)'); i = e + 3; continue; }
    if (text.startsWith('<![CDATA[', i)) { const e = text.indexOf(']]>', i + 9); if (e < 0) throw fail('XML mal formado (CDATA sin cerrar)'); stack.at(-1).text += text.slice(i + 9, e); i = e + 3; continue; }
    if (text.startsWith('<?', i)) { const e = text.indexOf('?>', i + 2); if (e < 0) throw fail('XML mal formado'); i = e + 2; continue; }
    if (text.startsWith('<!', i)) { const e = text.indexOf('>', i); if (e < 0) throw fail('XML mal formado'); if (/<!ENTITY/i.test(text.slice(i, e + 200))) throw fail('El XML declara entidades propias: no se admite'); i = e + 1; continue; } // DOCTYPE ignorado
    if (text[i + 1] === '/') { const e = text.indexOf('>', i); if (e < 0) throw fail('XML mal formado'); const name = text.slice(i + 2, e).trim().replace(/^.*:/, ''); const top = stack.pop(); if (!top || top.name !== name || !stack.length) throw fail('XML mal formado (etiquetas desparejadas)'); i = e + 1; continue; }
    // etiqueta de apertura: nombre hasta espacio, / o >; los atributos se saltan respetando comillas
    let j = i + 1; while (j < n && !/[\s/>]/.test(text[j])) j++; const name = text.slice(i + 1, j).replace(/^.*:/, '');
    if (!name) throw fail('XML mal formado'); let q = null; while (j < n) { const c = text[j]; if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c; else if (c === '>') break; j++; }
    if (j >= n) throw fail('XML mal formado (etiqueta sin cerrar)');
    const self = text[j - 1] === '/' && !q; if (++nodes > maxNodes) throw fail('El XML tiene demasiados elementos');
    const node = { name, kids: [], text: '' }; stack.at(-1).kids.push(node);
    if (!self) { if (stack.length > maxDepth) throw fail('El XML está demasiado anidado'); stack.push(node); } i = j + 1;
  }
  if (stack.length !== 1) throw fail('XML mal formado (faltan etiquetas de cierre)');
  return root;
}

const kid = (n, name) => n?.kids.find((k) => k.name === name), kids = (n, name) => (n ? n.kids.filter((k) => k.name === name) : []);
const path = (n, ...names) => names.reduce((a, x) => kid(a, x), n);
const txt = (n) => (n ? n.text.trim() : '');
const num = (n) => { const v = Number(txt(n)); return Number.isFinite(v) ? v : null; };
const cents = (n) => { const v = num(n); return v === null ? null : Math.round(v * 100); };
const cl = (s) => String(s ?? '').toUpperCase().replace(/[\s.-]/g, '');

function party(p) {
  if (!p) return null; const tax = path(p, 'TaxIdentification'), le = kid(p, 'LegalEntity'), ind = kid(p, 'Individual'), who = le || ind, addr = kid(who, 'AddressInSpain') || kid(who, 'OverseasAddress');
  const name = le ? txt(kid(le, 'CorporateName')) || txt(kid(le, 'TradeName')) : [txt(kid(ind, 'Name')), txt(kid(ind, 'FirstSurname')), txt(kid(ind, 'SecondSurname'))].filter(Boolean).join(' ');
  return { nif: cl(txt(kid(tax, 'TaxIdentificationNumber'))), name, address: txt(kid(addr, 'Address')), zip: txt(kid(addr, 'PostCode')), city: txt(kid(addr, 'Town')), email: txt(path(who, 'ContactDetails', 'ElectronicMail')), phone: txt(path(who, 'ContactDetails', 'Telephone')) };
}
// Impuestos de una línea o de la factura: IVA = código 01 (o sin código), retenciones IRPF = 04; otros (IGIC, IPSI…) se anotan.
const taxes = (container) => kids(container, 'Tax').map((t) => ({ code: txt(kid(t, 'TaxTypeCode')) || '01', rate: num(kid(t, 'TaxRate')) ?? 0, base: cents(path(t, 'TaxableBase', 'TotalAmount')), amount: cents(path(t, 'TaxAmount', 'TotalAmount')) }));

export function parseFacturae(xml) {
  const doc = parseXml(xml), fe = doc.kids.find((k) => k.name === 'Facturae'); if (!fe) throw fail('No es un archivo Facturae (no encuentro el elemento Facturae)');
  const version = txt(path(fe, 'FileHeader', 'SchemaVersion')), seller = party(path(fe, 'Parties', 'SellerParty')), buyer = party(path(fe, 'Parties', 'BuyerParty'));
  const invoices = kids(path(fe, 'Invoices'), 'Invoice').map((inv) => {
    const h = kid(inv, 'InvoiceHeader'), series = txt(kid(h, 'InvoiceSeriesCode')), nr = txt(kid(h, 'InvoiceNumber')), corr = kid(h, 'Corrective');
    const out = taxes(kid(inv, 'TaxesOutputs')), wh = taxes(kid(inv, 'TaxesWithheld')), irpf = wh.find((t) => t.code === '04');
    const lines = kids(kid(inv, 'Items'), 'InvoiceLine').map((l) => {
      const lt = taxes(kid(l, 'TaxesOutputs')).find((t) => t.code === '01') || taxes(kid(l, 'TaxesOutputs'))[0], qty = num(kid(l, 'Quantity')) ?? 1, net = cents(kid(l, 'GrossAmount'));
      return { desc: txt(kid(l, 'ItemDescription')).slice(0, 400), qty, price: net !== null ? net : cents(kid(l, 'TotalCost')) ?? 0, iva: lt ? lt.rate : (out[0]?.rate ?? 0), taxCode: lt?.code || '01' };
    });
    const inst = kid(kid(inv, 'PaymentDetails'), 'Installment');
    return { number: `${series}${nr}`, series, rawNumber: nr, cls: txt(kid(h, 'InvoiceClass')), corrects: corr ? `${txt(kid(corr, 'InvoiceSeriesCode'))}${txt(kid(corr, 'InvoiceNumber'))}` : '', date: txt(path(inv, 'InvoiceIssueData', 'IssueDate')), due: txt(kid(inst, 'InstallmentDueDate')), iban: txt(path(inst, 'AccountToBeCredited', 'IBAN')),
      currency: txt(path(inv, 'InvoiceIssueData', 'InvoiceCurrencyCode')) || 'EUR', lines, irpfRate: irpf?.rate ?? 0, total: cents(path(inv, 'InvoiceTotals', 'InvoiceTotal')), outputs: out, notes: txt(path(inv, 'AdditionalData', 'InvoiceAdditionalInformation')).slice(0, 500), otherTaxes: out.filter((t) => t.code !== '01').map((t) => t.code) };
  });
  if (!invoices.length) throw fail('El archivo Facturae no contiene facturas');
  return { version, seller, buyer, invoices };
}

export const FACTURAS_HEADERS = ['Número', 'Fecha', 'Cliente', 'NIF', 'Concepto', 'Base', 'IVA %', 'IRPF %', 'Vencimiento'], GASTOS_HEADERS = ['Fecha', 'Proveedor', 'Concepto', 'Base', 'IVA %', 'Notas'];
const money = (c) => (c / 100).toFixed(2).replace('.', ','), disc = (n) => String(n).replace('.', ',');

// direction: 'emitidas' (el vendedor eres tú) | 'recibidas' (el comprador eres tú) | '' = detectar con tu NIF.
export function facturaeToRows(files, { direction = '', ownNif = '' } = {}) {
  const own = cl(ownNif), warnings = [], parsed = files.map(parseFacturae), invoices = parsed.flatMap((p) => p.invoices.map((i) => ({ ...i, seller: p.seller, buyer: p.buyer })));
  let dir = direction; if (!dir && own) { const s = invoices.filter((i) => i.seller?.nif === own).length, b = invoices.filter((i) => i.buyer?.nif === own).length; dir = s && !b ? 'emitidas' : b && !s ? 'recibidas' : ''; }
  if (!dir) throw Object.assign(fail('No sé si estas facturas son emitidas (tú vendes) o recibidas (tú compras). Indícalo.'), { needsDirection: true });
  const kind = dir === 'emitidas' ? 'facturas' : 'gastos', rows = [];
  for (const inv of invoices) {
    if (inv.currency !== 'EUR') { warnings.push(`${inv.number}: moneda ${inv.currency} (se importa el importe tal cual)`); }
    if (inv.otherTaxes.length) warnings.push(`${inv.number}: lleva impuestos distintos del IVA (${[...new Set(inv.otherTaxes)].join(', ')}); solo se importa el IVA`);
    const lines = inv.lines.length ? inv.lines : [{ desc: 'Factura ' + inv.number, qty: 1, price: inv.outputs.reduce((t, x) => t + (x.base || 0), 0), iva: inv.outputs[0]?.rate ?? 21 }];
    if (dir === 'emitidas') for (const l of lines) rows.push([inv.number, inv.date, inv.buyer?.name || '', inv.buyer?.nif || '', l.desc || `Factura ${inv.number}`, money(l.price), disc(l.iva), inv.irpfRate ? disc(inv.irpfRate) : '', inv.due]);
    else { const byRate = new Map(); for (const l of lines) byRate.set(l.iva, (byRate.get(l.iva) || 0) + l.price); for (const [rate, base] of byRate) rows.push([inv.date, inv.seller?.name || inv.seller?.nif || '', lines[0].desc || `Factura ${inv.number}`, money(base), disc(rate), `Factura ${inv.number} del proveedor${inv.seller?.nif ? ` (${inv.seller.nif})` : ''}`]); }
  }
  return { kind, direction: dir, headers: dir === 'emitidas' ? FACTURAS_HEADERS : GASTOS_HEADERS, rows, invoices: invoices.length, warnings, version: parsed[0]?.version || '' };
}
