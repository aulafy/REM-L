import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { parseXml, parseFacturae, facturaeToRows } from '../lib/facturae.mjs';

const party = (tag, nif, name, extra = '') => `<${tag}><TaxIdentification><PersonTypeCode>J</PersonTypeCode><ResidenceTypeCode>R</ResidenceTypeCode><TaxIdentificationNumber>${nif}</TaxIdentificationNumber></TaxIdentification><LegalEntity><CorporateName>${name}</CorporateName><AddressInSpain><Address>Calle Mayor 5</Address><PostCode>46001</PostCode><Town>Valencia</Town><Province>Valencia</Province><CountryCode>ESP</CountryCode></AddressInSpain>${extra}</LegalEntity></${tag}>`;
const tax = (code, rate, base, amount) => `<Tax><TaxTypeCode>${code}</TaxTypeCode><TaxRate>${rate}</TaxRate><TaxableBase><TotalAmount>${base}</TotalAmount></TaxableBase><TaxAmount><TotalAmount>${amount}</TotalAmount></TaxAmount></Tax>`;
const line = (d, q, p, rate, iva) => `<InvoiceLine><ItemDescription>${d}</ItemDescription><Quantity>${q}</Quantity><UnitOfMeasure>01</UnitOfMeasure><UnitPriceWithoutTax>${p}</UnitPriceWithoutTax><TotalCost>${(q * p).toFixed(2)}</TotalCost><GrossAmount>${(q * p).toFixed(2)}</GrossAmount><TaxesOutputs>${tax('01', rate, (q * p).toFixed(2), iva)}</TaxesOutputs></InvoiceLine>`;
const invoice = ({ nr, series = 'A', date, cls = 'OO', lines, wh = '', due = '2026-02-14', corr = '' }) => `<Invoice><InvoiceHeader><InvoiceNumber>${nr}</InvoiceNumber><InvoiceSeriesCode>${series}</InvoiceSeriesCode><InvoiceDocumentType>FC</InvoiceDocumentType><InvoiceClass>${cls}</InvoiceClass>${corr}</InvoiceHeader><InvoiceIssueData><IssueDate>${date}</IssueDate><InvoiceCurrencyCode>EUR</InvoiceCurrencyCode><TaxCurrencyCode>EUR</TaxCurrencyCode><LanguageName>es</LanguageName></InvoiceIssueData><TaxesOutputs>${tax('01', '21.00', '1000.00', '210.00')}</TaxesOutputs>${wh}<InvoiceTotals><TotalGrossAmount>1000.00</TotalGrossAmount><TotalGrossAmountBeforeTaxes>1000.00</TotalGrossAmountBeforeTaxes><TotalTaxOutputs>210.00</TotalTaxOutputs><InvoiceTotal>1210.00</InvoiceTotal></InvoiceTotals><Items>${lines}</Items><PaymentDetails><Installment><InstallmentDueDate>${due}</InstallmentDueDate><InstallmentAmount>1210.00</InstallmentAmount><PaymentMeans>04</PaymentMeans><AccountToBeCredited><IBAN>ES9121000418450200051332</IBAN></AccountToBeCredited></Installment></PaymentDetails><AdditionalData><InvoiceAdditionalInformation>Pedido 77 &amp; entrega</InvoiceAdditionalInformation></AdditionalData></Invoice>`;
const file = (seller, buyer, invoices, sig = true) => `<?xml version="1.0" encoding="UTF-8"?>\n<fe:Facturae xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:fe="http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml"><FileHeader><SchemaVersion>3.2.2</SchemaVersion><Modality>I</Modality><InvoiceIssuerType>EM</InvoiceIssuerType><Batch><BatchIdentifier>${seller[0]}A1</BatchIdentifier><InvoicesCount>${invoices.length}</InvoicesCount></Batch></FileHeader><Parties>${party('SellerParty', ...seller)}${party('BuyerParty', ...buyer)}</Parties><Invoices>${invoices.join('')}</Invoices>${sig ? '<ds:Signature Id="s1"><ds:SignedInfo><ds:Reference URI="#x"/></ds:SignedInfo><ds:SignatureValue>AAAA</ds:SignatureValue></ds:Signature>' : ''}</fe:Facturae>`;
const ME = ['B12345674', 'Yo Reformas S.L.'], CLIENT = ['A58818501', 'Clínica Dental &amp; Salud S.A.'], SUPPLIER = ['B76543210', 'Suministros Gil S.L.'];
const EMITIDA = file(ME, CLIENT, [invoice({ nr: '000123', date: '2026-01-15', lines: line('Reparación &lt;urgente&gt;', 1, 800, '21.00', '168.00') + line('Material <![CDATA[eléctrico & más]]>', 2, 100, '10.00', '20.00'), wh: `<TaxesWithheld>${tax('04', '15.00', '1000.00', '150.00')}</TaxesWithheld>` }), invoice({ nr: '000124', date: '2026-02-01', lines: line('Mantenimiento', 1, 1000, '21.00', '210.00') })]);

test('lector XML: namespaces, CDATA, entidades, comentarios, autocierres, firma ignorada y rechazos', () => {
  const r = parseXml('<?xml version="1.0"?><!-- c --><a:r xmlns:a="x"><b k="1 > 2">x &amp; &#65;&#x42; <![CDATA[<y>]]></b><c/><d></d></a:r>'); const root = r.kids[0]; assert.equal(root.name, 'r'); assert.equal(root.kids[0].text.trim(), 'x & AB <y>'); assert.deepEqual(root.kids.map((k) => k.name), ['b', 'c', 'd']);
  for (const bad of ['<a><b></a>', '<a>', '<a></a></a>', '<a><!-- sin cerrar </a>', '<a><![CDATA[x</a>', '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><a>&e;</a>']) assert.throws(() => parseXml(bad), /mal formado|entidades|desparejadas|sin cerrar/, bad);
  assert.equal(parseXml('<!DOCTYPE a><a>&e;</a>').kids[0].text, '', 'una entidad desconocida se descarta'); assert.throws(() => parseXml('<a>'.repeat(100) + '</a>'.repeat(100)), /anidado/); assert.throws(() => parseXml('<a>' + '<b/>'.repeat(10), { maxNodes: 5 }), /demasiados/);
});
test('Facturae: partes, líneas con distinto IVA, retención IRPF, vencimiento, IBAN y texto escapado', () => {
  const f = parseFacturae(EMITIDA); assert.equal(f.version, '3.2.2'); assert.deepEqual([f.seller.nif, f.buyer.nif, f.buyer.name, f.buyer.zip, f.buyer.city], ['B12345674', 'A58818501', 'Clínica Dental & Salud S.A.', '46001', 'Valencia']); assert.equal(f.invoices.length, 2);
  const i = f.invoices[0]; assert.deepEqual([i.number, i.date, i.due, i.irpfRate, i.total, i.iban], ['A000123', '2026-01-15', '2026-02-14', 15, 121000, 'ES9121000418450200051332']);
  assert.deepEqual(i.lines.map((l) => [l.desc, l.price, l.iva]), [['Reparación <urgente>', 80000, 21], ['Material eléctrico & más', 20000, 10]]); assert.equal(i.notes, 'Pedido 77 & entrega');
  assert.throws(() => parseFacturae('<x/>'), /no encuentro el elemento Facturae/); assert.throws(() => parseFacturae('<Facturae><Invoices/></Facturae>'), /no contiene facturas/);
});
test('Facturae → filas: emitidas (tú vendes) por detección con tu NIF; recibidas; ambigüedad pide dirección', () => {
  const e = facturaeToRows([EMITIDA], { ownNif: 'b-12345674' }); assert.equal(e.kind, 'facturas'); assert.equal(e.direction, 'emitidas'); assert.equal(e.rows.length, 3); assert.deepEqual(e.rows[0], ['A000123', '2026-01-15', 'Clínica Dental & Salud S.A.', 'A58818501', 'Reparación <urgente>', '800,00', '21', '15', '2026-02-14']);
  const r = facturaeToRows([file(SUPPLIER, ME, [invoice({ nr: '9', series: '', date: '2026-03-03', lines: line('Cable', 3, 100, '21.00', '63.00') + line('Libro', 1, 20, '4.00', '0.80') })])], { ownNif: 'B12345674' }); assert.equal(r.kind, 'gastos'); assert.deepEqual(r.rows.map((x) => [x[3], x[4]]), [['300,00', '21'], ['20,00', '4']]); assert.match(r.rows[0][5], /Factura 9 del proveedor \(B76543210\)/);
  assert.throws(() => facturaeToRows([EMITIDA], { ownNif: '' }), (e2) => e2.needsDirection); assert.equal(facturaeToRows([EMITIDA], { ownNif: '', direction: 'emitidas' }).kind, 'facturas'); assert.throws(() => facturaeToRows([file(ME, ME, [invoice({ nr: '1', date: '2026-01-01', lines: line('x', 1, 1, '21.00', '0.21') })])], { ownNif: 'B12345674' }), (e2) => e2.needsDirection, 'si eres vendedor y comprador, ambiguo');
});

let child, base;
const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
before(async () => {
  const port = await new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); }); base = `http://127.0.0.1:${port}`;
  child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: mkdtempSync(join(tmpdir(), 'rem-fe-')), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0' }, stdio: 'pipe' });
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});
after(() => child.kill());
test('API: sin tu NIF pide dirección (409); con ella importa emitidas con líneas, retención y vencimiento; sugiere la numeración', async () => {
  const none = await call('POST', '/api/import/preview', { kind: 'facturae', facturae: EMITIDA }); assert.equal(none.status, 409); assert.match(none.json.error, /emitidas.*recibidas/);
  const p = (await call('POST', '/api/import/preview', { kind: 'facturae', facturae: EMITIDA, direction: 'emitidas' })).json; assert.equal(p.facturae.invoices, 2); assert.equal(p.facturae.direction, 'emitidas'); assert.deepEqual([p.total, p.ok, p.merged], [3, 2, 1]);
  assert.deepEqual(p.numbering.map((x) => [x.year, x.last, x.next]), [['2026', 'A000124', 125]]);
  const r = (await call('POST', '/api/import/commit', { kind: 'facturae', facturae: EMITIDA, direction: 'emitidas', source: 'facturas-q1.xml' })).json; assert.equal(r.imported, 2);
  const s = (await call('GET', '/api/state')).json, d = s.documents.find((x) => x.number === 'A000123'); assert.deepEqual([d.base, d.iva_total, d.irpf_total, d.total, d.irpf, d.due_date], [100000, 16800 + 2000, 15000, 100000 + 18800 - 15000, 15, '2026-02-14']); assert.deepEqual(d.lines.map((l) => l.iva), [21, 10]);
  assert.equal(s.clients.find((c) => c.nif === 'A58818501').name, 'Clínica Dental & Salud S.A.'); assert.equal((await call('POST', '/api/import/preview', { kind: 'facturae', facturae: EMITIDA, direction: 'emitidas' })).json.ok, 0, 'repetir no duplica');
});
test('API: con tu NIF en Ajustes se detecta solo; recibidas → gastos; varios archivos a la vez; XML hostil rechazado', async () => {
  await call('PUT', '/api/settings', { company_name: 'Yo Reformas S.L.', company_nif: 'B12345674' });
  const rec = file(SUPPLIER, ME, [invoice({ nr: '77', series: 'P', date: '2026-04-04', lines: line('Cable', 3, 100, '21.00', '63.00') })]), rec2 = file(SUPPLIER, ME, [invoice({ nr: '78', series: 'P', date: '2026-04-05', lines: line('Tubo', 1, 50, '21.00', '10.50') })]);
  const p = (await call('POST', '/api/import/preview', { kind: 'facturae', facturae: [rec, rec2] })).json; assert.equal(p.facturae.direction, 'recibidas'); assert.equal(p.kind, 'gastos'); assert.equal(p.ok, 2);
  const r = (await call('POST', '/api/import/commit', { kind: 'facturae', facturae: [rec, rec2] })).json; assert.equal(r.imported, 2); const ex = (await call('GET', '/api/state')).json.expenses.find((e) => e.supplier === 'Suministros Gil S.L.' && e.date === '2026-04-04'); assert.equal(ex.total, 36300); assert.match(ex.notes, /Factura P77/);
  assert.equal((await call('POST', '/api/import/preview', { kind: 'facturae', facturae: '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><Facturae>' + 'x'.repeat(60) + '</Facturae>' })).status, 400);
  assert.equal((await call('POST', '/api/import/preview', { kind: 'facturae', facturae: 'no soy xml en absoluto, de verdad que no, ni de lejos' })).status, 400); assert.equal((await call('POST', '/api/import/preview', { kind: 'facturae', facturae: [] })).status, 400);
});
