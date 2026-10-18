import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { parseCsv, parseMoney, parseDate, parsePct, autoMap } from '../lib/importer.mjs';

test('importes: formato español, inglés, negativos y símbolos', () => {
  const c = { '1.234,56': 123456, '1234,5': 123450, '1234.56': 123456, '1.234': 123400, '1,234.50': 123450, '12': 1200, '0,07': 7, '(45,00)': -4500, '-45 €': -4500, '€ 1.000': 100000, '45-': -4500, '1.234.567,89': 123456789, '2,005': 201, '': null, 'abc': null, '12,3x': null };
  for (const [k, v] of Object.entries(c)) assert.equal(parseMoney(k), v, k);
  assert.equal(parsePct('21 %'), 21); assert.equal(parsePct('0,21'), 21); assert.equal(parsePct('10,5'), 10.5); assert.equal(parsePct('abc'), null); assert.equal(parsePct('150'), null);
});
test('fechas: dd/mm/aaaa, aaaa-mm-dd, años cortos, mes en texto, serie de Excel; rechaza inexistentes', () => {
  assert.equal(parseDate('05/03/2026'), '2026-03-05'); assert.equal(parseDate('5-3-26'), '2026-03-05'); assert.equal(parseDate('2026-03-05'), '2026-03-05'); assert.equal(parseDate('15 oct 2026'), '2026-10-15'); assert.equal(parseDate('3 de enero de 2025'), '2025-01-03');
  assert.equal(parseDate('46000'), '2025-12-09'); assert.equal(parseDate('31/02/2026'), null); assert.equal(parseDate('13/13/2026'), null); assert.equal(parseDate('hoy'), null);
});
test('CSV: delimitador, comillas con saltos y separadores, BOM y líneas vacías', () => {
  const t = '﻿Fecha;Cliente;Total\r\n01/01/2026;"Pérez; S.L.";"1.000,00"\r\n\r\n02/01/2026;"Dice ""hola""\nlinea 2";5\r\n';
  const { rows, delimiter } = parseCsv(t); assert.equal(delimiter, ';'); assert.equal(rows.length, 3); assert.equal(rows[1][1], 'Pérez; S.L.'); assert.equal(rows[2][1], 'Dice "hola"\nlinea 2');
  assert.equal(parseCsv('a,b\n1,2').delimiter, ','); assert.equal(parseCsv('a\tb\n1\t2').delimiter, '\t');
});
test('columnas: detecta cabeceras habituales sin acentos ni mayúsculas', () => {
  const m = autoMap('facturas', ['Nº Factura', 'Fecha', 'Razón social', 'CIF', 'Base imponible', 'IVA %', 'Cuota IVA', 'Total factura', 'Cobrada']);
  assert.deepEqual(m, { number: 0, date: 1, client: 2, nif: 3, base: 4, iva_rate: 5, iva_amount: 6, total: 7, paid: 8 });
});

let child, base;
const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
before(async () => {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: mkdtempSync(join(tmpdir(), 'rem-im-')), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});
after(() => child.kill());

const FACT = `Número;Fecha;Cliente;NIF;Concepto;Base;IVA %;Total;Cobrada
F2024-0001;15/01/2024;Taller Pérez S.L.;B12345678;Reparación;1.000,00;21;1.210,00;sí
F2024-0002;20/02/2024;Taller Pérez S.L.;B12345678;Mantenimiento;500,00;21;605,00;no
F2024-0003;05/03/2024;Ana Ruiz;12345678z;Diseño;1.000,00;21;1.060,00;15/03/2024
F2024-0004;31/02/2024;Fecha mala;B1;x;10;21;12,10;no
F2024-0005;10/04/2024;;;x;10;21;12,10;no
F2024-0006;11/04/2024;Luis;X1;x;100,00;21;999,00;no`;

test('facturas: vista previa no toca nada; aplica, crea clientes, cobros e IRPF deducido del total', async () => {
  const before = (await call('GET', '/api/state')).json.documents.length;
  const p = (await call('POST', '/api/import/preview', { kind: 'facturas', text: FACT })).json;
  assert.equal(p.total, 6); assert.equal(p.ok, 3); assert.equal(p.failed, 3); assert.equal(p.newClients, 2); assert.equal(p.sum, 121000 + 60500 + 106000);
  assert.ok(p.sample[2].warnings.some((w) => /IRPF del 15/.test(w)), 'IRPF 15% inferido'); assert.equal(p.sample[2].irpf, 15);
  assert.match(p.problems.map((x) => x.errors.join()).join('|'), /Fecha no válida.*\|.*Falta el cliente.*\|.*no cuadra/s);
  assert.equal((await call('GET', '/api/state')).json.documents.length, before, 'la vista previa no crea nada');
  const r = (await call('POST', '/api/import/commit', { kind: 'facturas', text: FACT })).json; assert.equal(r.imported, 3); assert.equal(r.clients, 2); assert.match(r.backup, /antes-de-importar/);
  const s = (await call('GET', '/api/state')).json, f1 = s.documents.find((d) => d.number === 'F2024-0001'), f2 = s.documents.find((d) => d.number === 'F2024-0002'), f3 = s.documents.find((d) => d.number === 'F2024-0003');
  assert.equal(f1.status, 'emitida'); assert.equal(f1.total, 121000); assert.equal(f1.due_date, '2024-02-14'); assert.equal(f3.total, 106000); assert.equal(f3.irpf_total, 15000);
  assert.equal(s.payments.filter((x) => x.document_id === f1.id)[0].amount, 121000); assert.equal(s.payments.filter((x) => x.document_id === f2.id).length, 0); assert.equal(s.payments.find((x) => x.document_id === f3.id).date, '2024-03-15');
  assert.equal(s.clients.filter((c) => c.name === 'Taller Pérez S.L.').length, 1, 'el mismo NIF no duplica clientes'); assert.equal(s.clients.find((c) => c.name === 'Ana Ruiz').nif, '12345678Z');
});
test('facturas: volver a importar el mismo archivo no duplica nada', async () => {
  const p = (await call('POST', '/api/import/preview', { kind: 'facturas', text: FACT })).json; assert.equal(p.ok, 0); assert.equal(p.duplicates, 3);
  assert.equal((await call('POST', '/api/import/commit', { kind: 'facturas', text: FACT })).status, 400);
});
test('facturas: el siguiente número propio no choca con los importados', async () => {
  const c = (await call('POST', '/api/clients', { name: 'Nuevo', nif: 'B99999999' })).json;
  const d = (await call('POST', '/api/documents', { type: 'factura', client_id: c.id, issue_date: '2024-06-01', lines: [{ desc: 'x', qty: 1, price: 1000, iva: 21 }] })).json;
  await call('PUT', '/api/settings', { company_name: 'Yo', company_nif: 'B00000000' });
  const e = await call('POST', `/api/documents/${d.id}/issue`, {}); assert.equal(e.status, 200); assert.ok(!['F2024-0001', 'F2024-0002', 'F2024-0003'].includes(e.json.number));
});

const GAS = `Fecha,Proveedor,Concepto,Categoría,Base,IVA,Total
03/01/2024,Iberdrola,Luz enero,Suministros,100.00,21,121.00
04/01/2024,Papelería Sol,Folios,material,,,12.10
05/01/2024,Gasolinera,Combustible,Vehículo,50,,60.5
06/01/2024,Alquileres SA,Local,Alquiler,1000,21,1500
07/01/2024,Banco,Comisión,Bancos,5,0,5`;
test('gastos: deduce base/IVA, normaliza categorías y rechaza lo que no cuadra', async () => {
  const p = (await call('POST', '/api/import/preview', { kind: 'gastos', text: GAS })).json; assert.equal(p.ok, 4); assert.equal(p.failed, 1);
  assert.ok(p.sample.find((x) => x.concept === 'Folios').base === 1000 && p.sample.find((x) => x.concept === 'Folios').rate === 21, 'IVA supuesto con aviso');
  assert.ok(p.sample.find((x) => x.concept === 'Folios').warnings.some((w) => /supuesto/.test(w)));
  const r = (await call('POST', '/api/import/commit', { kind: 'gastos', text: GAS })).json; assert.equal(r.imported, 4);
  const ex = (await call('GET', '/api/state')).json.expenses; assert.equal(ex.find((e) => e.concept === 'Luz enero').category, 'suministros'); assert.equal(ex.find((e) => e.concept === 'Combustible').base, 5000); assert.equal(ex.find((e) => e.concept === 'Comisión').category, 'bancos'); assert.equal(ex.find((e) => e.concept === 'Comisión').iva, 0);
  assert.equal((await call('POST', '/api/import/preview', { kind: 'gastos', text: GAS })).json.duplicates, 4, 'segunda vez: todo duplicado');
});
test('mapeo manual y errores: columnas obligatorias y entradas absurdas', async () => {
  const txt = 'A;B;C\n01/02/2024;Cafetería;12,10';
  const p = (await call('POST', '/api/import/preview', { kind: 'gastos', text: txt })).json; assert.deepEqual(p.missing.sort(), ['concept', 'date', 'total']);
  const q = (await call('POST', '/api/import/preview', { kind: 'gastos', text: txt, mapping: { date: 0, concept: 1, total: 2 } })).json; assert.equal(q.ok, 1); assert.deepEqual(q.missing, []);
  assert.equal((await call('POST', '/api/import/commit', { kind: 'gastos', text: txt })).status, 400);
  assert.equal((await call('POST', '/api/import/preview', { kind: 'nada', text: txt })).status, 400); assert.equal((await call('POST', '/api/import/preview', { kind: 'gastos', text: 'x' })).status, 400);
  assert.equal((await call('POST', '/api/import/preview', { kind: 'gastos', text: txt, mapping: { date: 99, concept: -1 } })).json.missing.length > 0, true);
  const evil = 'Fecha,Concepto,Total\n01/01/2024,"<img src=x onerror=alert(1)>",10';
  await call('POST', '/api/import/commit', { kind: 'gastos', text: evil }); assert.ok((await call('GET', '/api/state')).json.expenses.some((e) => e.concept.includes('<img')), 'se guarda como texto; la interfaz lo escapa');
});
