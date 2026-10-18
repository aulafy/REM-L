import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from '../public/csv.js';
import { startServer } from './revision-helper.mjs';

test('CSV conserva negativos numéricos y neutraliza fórmulas', () => {
  for (const n of ['-180,00', '-5', -1234.5, '-1.234,56']) assert.ok(!csvCell(n).includes("'-"), String(n));
  for (const formula of ['=1+1', '+34600111222', '@SUM(A1)', '-cmd|calc', '\t=1', '\r=1', '-']) assert.equal(csvCell(formula), `"'${formula}"`);
  assert.equal(csvCell('hola "q"'), '"hola ""q"""'); assert.equal(csvCell(null), '""');
  assert.equal(toCsv([['a', '-1,00'], ['=x', 'b']]), '﻿"a";"-1,00"\r\n"\'=x";"b"');
});

let api;
before(async () => { api = await startServer('rem-csv-'); });
after(() => api.child.kill());

test('la exportación compartida protege texto y deja rectificativas como números', async () => {
  const invoice = (await api.issue(await api.draft('2026-06-01'))).json;
  const rectified = (await api.request('POST', `/api/documents/${invoice.id}/rectify`, {})).json; assert.ok(rectified.total < 0);
  const csv = await (await fetch(api.base + '/api/export.csv?kind=facturas')).text(); const line = csv.split('\r\n').find((row) => row.includes(rectified.number));
  assert.ok(line); assert.match(line, /"-100,00"/); assert.ok(!line.includes(`"'-`));
  await api.request('POST', '/api/clients', { name: '=HYPERLINK("http://x")', nif: 'B11111111' });
  assert.match(await (await fetch(api.base + '/api/export.csv?kind=clientes')).text(), /"'=HYPERLINK/);
});
