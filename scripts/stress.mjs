#!/usr/bin/env node
// Test masivo de REM: (A) la empresa con muchos datos y escrituras concurrentes; (B) muchos clientes de REM Clientes contra un relé real.
// Uso: node scripts/stress.mjs [--clients 3000] [--invoices 4000] [--customers 300] [--conc 40]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { generateIdentity, fingerprint, sessionKey, seal, open, toB64u, fromB64u } from '../relay/public/proto.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const N = { clients: arg('clients', 3000), invoices: arg('invoices', 4000), customers: arg('customers', 300), conc: arg('conc', 40) };
const dir = mkdtempSync(join(tmpdir(), 'rem-stress-')), procs = [], fails = [], metrics = [];
const port = () => new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const check = (ok, msg) => { if (!ok) { fails.push(msg); console.log('  ✖', msg); } else console.log('  ✔', msg); };
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0; };
async function pool(items, n, fn) { let i = 0, errs = 0; await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; try { await fn(items[k], k); } catch { errs++; } } })); return errs; }
const timed = async (name, fn) => { const t = performance.now(); const v = await fn(); const ms = performance.now() - t; metrics.push([name, ms]); return { v, ms }; };
const spawnNode = (file, env) => { const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', ...(process.env.STRESS_NODE_ARGS ? process.env.STRESS_NODE_ARGS.split(' ') : []), file], { env: { ...process.env, ...env }, stdio: 'pipe' }); let log = ''; p.stderr.on('data', (d) => { log += d; }); p.stdout.on('data', (d) => { log += d; }); p.tail = () => log.slice(-800); procs.push(p); return p; };
const rss = (pid) => { try { return Number(spawnSyncRss(pid)); } catch { return 0; } };
import { execSync } from 'node:child_process';
const spawnSyncRss = (pid) => Number(execSync(`ps -o rss= -p ${pid}`).toString().trim()) / 1024;

async function parteEmpresa() {
  console.log(`\n=== A · EMPRESA: ${N.clients} clientes, ${N.invoices} facturas, ${N.conc} escrituras concurrentes ===`);
  const p = await port(), base = `http://127.0.0.1:${p}`, srv = spawnNode('server.mjs', { REM_PORT: String(p), REM_DATA_DIR: join(dir, 'rem'), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0' });
  const call = async (m, path, body) => { const r = await fetch(base + path, { method: m, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || r.status), { status: r.status }); return j; };
  for (let i = 0; i < 80; i++) { try { await fetch(base + '/api/state'); break; } catch { await sleep(100); } }
  await call('PUT', '/api/settings', { company_name: 'Estrés S.L.', company_nif: 'B12345674', company_address: 'Calle 1', company_city: 'Murcia', company_zip: '30001' });
  const idx = Array.from({ length: N.clients }, (_, i) => i);
  const { v: e1, ms: t1 } = await timed('crear clientes', () => pool(idx, N.conc, (i) => call('POST', '/api/clients', { name: `Cliente ${i} ${['García', 'López', 'Martínez', 'Sánchez'][i % 4]}`, nif: i % 3 ? '' : `${String(10000000 + i).slice(0, 8)}${'TRWAGMYFPDXBNJZSQVHLCKE'[(10000000 + i) % 23]}`, email: `c${i}@ejemplo.test`, phone: `6${String(10000000 + i).slice(0, 8)}` })));
  console.log(`  ${N.clients} clientes en ${(t1 / 1000).toFixed(1)} s (${Math.round(N.clients / (t1 / 1000))}/s), errores: ${e1}`); check(e1 === 0, 'altas masivas de clientes sin errores');
  const cl = (await call('GET', '/api/state')).clients; check(cl.length === N.clients, `todos los clientes están (${cl.length}/${N.clients})`);
  const withNif = cl.filter((c) => c.nif).slice(0, 400); const ids = Array.from({ length: N.invoices }, (_, i) => i);
  const made = []; const { v: e2, ms: t2 } = await timed('crear y emitir facturas', () => pool(ids, N.conc, async (i) => { const c = withNif[i % withNif.length]; const d = await call('POST', '/api/documents', { type: 'factura', client_id: c.id, lines: [{ desc: `Servicio ${i}`, qty: 1 + (i % 4), price: 1000 + (i % 50) * 100, iva: [21, 10, 4][i % 3] }, { desc: 'Extra', qty: 1, price: 333, iva: 21 }] }); const out = await call('POST', `/api/documents/${d.id}/issue`); made.push(out); }));
  console.log(`  ${N.invoices} facturas creadas+emitidas en ${(t2 / 1000).toFixed(1)} s (${Math.round(N.invoices / (t2 / 1000))}/s), errores: ${e2}`); check(e2 === 0, 'emisión concurrente sin errores');
  const nums = made.map((d) => d.number), uniq = new Set(nums); check(uniq.size === nums.length, `numeración sin duplicados (${nums.length} números únicos)`);
  const byYear = {}; for (const n of nums) { const m = /^([A-Z]*)(\d{4})-(\d+)$/.exec(n); if (m) (byYear[m[1] + m[2]] ||= []).push(Number(m[3])); }
  const gaps = Object.values(byYear).reduce((a, l) => { l.sort((x, y) => x - y); return a + (l[l.length - 1] - l[0] + 1 - l.length); }, 0); check(gaps === 0, `numeración correlativa sin huecos (huecos: ${gaps})`);
  const st = (await call('GET', '/api/state')); const bad = st.documents.filter((d) => d.type === 'factura' && d.status === 'emitida').filter((d) => { const sub = d.lines.reduce((a, l) => a + Math.round(l.qty * l.price), 0); return d.subtotal !== undefined && d.subtotal !== sub; }); check(bad.length === 0, `totales coherentes con sus líneas (incoherentes: ${bad.length})`);
  // cobros concurrentes
  const emitted = st.documents.filter((d) => d.type === 'factura' && d.status === 'emitida').slice(0, 1000);
  const e3 = await pool(emitted, N.conc, (d) => call('POST', '/api/payments', { document_id: d.id, amount: Math.round(d.total / 2), date: '2026-10-19', method: 'transferencia' })); check(e3 === 0, `1000 cobros parciales concurrentes (errores: ${e3})`);
  // lecturas: latencias bajo carga
  const lat = { state: [], clients: [] };
  const reads = Array.from({ length: 200 }, (_, i) => i); await timed('200 lecturas /api/state (conc 20)', () => pool(reads, 20, async () => { const t = performance.now(); await call('GET', '/api/state'); lat.state.push(performance.now() - t); }));
  console.log(`  /api/state con ${N.clients} clientes y ${N.invoices} facturas: p50 ${pct(lat.state, 0.5).toFixed(0)} ms · p95 ${pct(lat.state, 0.95).toFixed(0)} ms · máx ${Math.max(...lat.state).toFixed(0)} ms`); check(pct(lat.state, 0.95) < 3000, 'p95 de /api/state < 3 s');
  const sz = JSON.stringify(st).length; console.log(`  tamaño de /api/state: ${(sz / 1e6).toFixed(1)} MB`);
  // búsqueda (⌘K) y exportaciones
  const ex = await timed('export CSV', async () => { const r = await fetch(base + '/api/export.csv?kind=facturas', { headers: { 'X-REM': '1' } }); return (await r.text()).length; }); check(ex.v > 1000, `export CSV de facturas (${(ex.v / 1e6).toFixed(1)} MB en ${ex.ms.toFixed(0)} ms)`);
  const xl = await timed('export XLSX', async () => { const r = await fetch(base + '/api/export.xlsx?kind=todo', { headers: { 'X-REM': '1' } }); return (await r.arrayBuffer()).byteLength; }); check(xl.v > 1000, `export XLSX (${(xl.v / 1e6).toFixed(1)} MB en ${xl.ms.toFixed(0)} ms)`);
  // copia de seguridad con muchos datos + restauración de integridad
  const bk = await timed('copia de seguridad', () => call('POST', '/api/backups')); check(!!bk.v, `copia de seguridad con todo (${bk.ms.toFixed(0)} ms)`);
  // idempotencia / validación bajo basura
  const junk = await pool(Array.from({ length: 200 }, (_, i) => i), 20, async (i) => { try { await call('POST', '/api/documents', { type: 'factura', lines: [{ desc: 'x', qty: 'abc', price: -1 }] }); } catch (e) { if (e.status !== 400) throw e; return; } throw new Error('aceptó basura'); }); check(junk === 0, '200 peticiones inválidas concurrentes: todas rechazadas con 400');
  const alive = await fetch(base + '/api/state').then((r) => r.ok).catch(() => false); check(alive, 'el servidor sigue vivo'); console.log(`  memoria del servidor: ${rss(srv.pid).toFixed(0)} MB`);
  const dbs = new DatabaseSync(join(dir, 'rem', 'negocio.db'), { readOnly: true }); const ic = dbs.prepare('PRAGMA integrity_check').get(); dbs.close(); check(Object.values(ic)[0] === 'ok', 'SQLite integrity_check = ok');
  srv.kill();
}

async function parteClientes() {
  console.log(`\n=== B · CLIENTES: ${N.customers} clientes web simultáneos contra un relé real y una empresa ===`);
  const rp = await port(), p = await port(), rbase = `http://127.0.0.1:${rp}`, base = `http://127.0.0.1:${p}`, rdir = join(dir, 'relay');
  const relay = spawnNode('relay/server.mjs', { RELAY_PORT: String(rp), RELAY_DATA_DIR: rdir, RELAY_INVITES: 'stress', RELAY_RATE_IP: '100000', RELAY_RATE_CUST: '1000', RELAY_MAX_WAIT: '2' });
  const srv = spawnNode('server.mjs', { REM_PORT: String(p), REM_DATA_DIR: join(dir, 'rem2'), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0', REM_RELAY_WAIT: '1' });
  const call = async (m, path, body) => { const r = await fetch(base + path, { method: m, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || r.status), { status: r.status }); return j; };
  const rj = async (m, path, body, tok) => { const r = await fetch(rbase + path, { method: m, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
  for (let i = 0; i < 80; i++) { try { await fetch(rbase + '/healthz'); await fetch(base + '/api/state'); break; } catch { await sleep(100); } }
  await call('PUT', '/api/settings', { company_name: 'Estrés S.L.', company_iban: 'ES9121000418450200051332' });
  const en = await call('POST', '/api/client-channel/enable', { relay: rbase, invite: 'stress', name: 'Estrés S.L.' }); const biz = en.biz, pub = (await rj('GET', `/v1/biz/${biz}`)).json.pub;
  const cust = []; await timed('identidades (ECDH)', async () => { for (let i = 0; i < N.customers; i++) { const id = await generateIdentity(), cfp = await fingerprint(id.pubRaw); cust.push({ i, id, cfp, key: await sessionKey(id.priv, fromB64u(pub), biz, cfp), since: 0, got: [] }); } });
  const post1 = async (c, payload) => rj('POST', `/v1/biz/${biz}/inbox`, { cfp: c.cfp, cpub: toB64u(c.id.pubRaw), env: await seal(c.key, payload, { biz, cfp: c.cfp, dir: 'c2b' }), cname: `Cliente ${c.i}` });
  let backoffs = 0; const post = async (c, payload) => { for (let a = 0; a < 40; a++) { const r = await post1(c, payload); if (r.status !== 503 && r.status !== 429) return r; backoffs++; await sleep(150 + Math.random() * 300); } return { status: 503 }; }; // como el cliente real: reintenta con espera si el relé pide calma
  const poll = async (c) => { const r = await rj('GET', `/v1/c/${biz}/${c.cfp}/outbox?since=${c.since}&wait=0`); for (const it of r.json.items) { c.since = Math.max(c.since, it.id); c.got.push(await open(c.key, it.env, { biz, cfp: c.cfp, dir: 'b2c' })); } };
  const M = 5; const sendLat = []; let sentTexts = 0;
  const { v: errs, ms } = await timed('mensajes de clientes', () => pool(cust, 60, async (c) => { await post(c, { t: 'hello', name: `Cliente ${c.i}` }); for (let k = 0; k < M; k++) { const t = performance.now(); const r = await post(c, { t: 'text', id: `m${k}`, text: `Mensaje ${k} del cliente ${c.i}: necesito presupuesto`, ts: Date.now() }); sendLat.push(performance.now() - t); if (r.status !== 200) throw new Error('envío ' + r.status); sentTexts++; } }));
  const total = N.customers * M; console.log(`  ${total} mensajes cifrados en ${(ms / 1000).toFixed(1)} s (${Math.round(total / (ms / 1000))}/s) · latencia de envío p50 ${pct(sendLat, 0.5).toFixed(0)} ms p95 ${pct(sendLat, 0.95).toFixed(0)} ms · errores: ${errs} · reintentos por cola llena: ${backoffs}`); check(errs === 0, 'todos los envíos acaban aceptados por el relé (con reintentos)');
  const t0 = Date.now(); let got = 0; const cdb = new DatabaseSync(join(dir, 'rem2', 'negocio.db'), { readOnly: true }); while (Date.now() - t0 < 180000) { got = cdb.prepare("SELECT COUNT(*) n FROM messages WHERE channel='rem' AND direction='in'").get().n; if (got >= sentTexts) break; await sleep(500); } cdb.close();
  const st = await call('GET', '/api/state'); const ins = (await (async () => { const all = new DatabaseSync(join(dir, 'rem2', 'negocio.db'), { readOnly: true }); const n = all.prepare("SELECT COUNT(*) n, COUNT(DISTINCT ext_id) d FROM messages WHERE channel='rem' AND direction='in'").get(); all.close(); return n; })());
  console.log(`  REM ha recibido ${ins.n} mensajes en ${((Date.now() - t0) / 1000).toFixed(1)} s tras terminar el envío`); check(ins.n === sentTexts, `ni se pierde ni se duplica ningún mensaje (${ins.n}/${sentTexts})`); check(ins.d === ins.n, 'sin identificadores repetidos');
  const pdb = new DatabaseSync(join(dir, 'rem2', 'negocio.db'), { readOnly: true }); const npeers = pdb.prepare("SELECT COUNT(DISTINCT peer_addr) n FROM messages WHERE channel='rem' AND direction='in'").get().n; pdb.close(); check(npeers === N.customers, `una conversación por cliente (${npeers}/${N.customers})`);
  // respuestas masivas de REM → cada cliente lee SOLO lo suyo
  const msgs = (await call('GET', '/api/state')).messages.filter((m) => m.channel === 'rem' && m.direction === 'in'); const byPeer = new Map(); for (const m of msgs) if (!byPeer.has(m.peer_addr)) byPeer.set(m.peer_addr, m);
  const sample = cust.filter((c) => byPeer.has(c.cfp)).slice(0, 150); const er = await pool(sample, 30, (c) => call('POST', `/api/messages/${byPeer.get(c.cfp).id}/send`, { text: `Respuesta privada para ${c.i}` })); check(er === 0, `${sample.length} respuestas de la empresa enviadas (errores: ${er})`);
  await sleep(1500); await pool(sample, 40, poll); let wrong = 0, ok = 0; for (const c of sample) { for (const g of c.got) { if (g.t !== 'text') continue; if (g.text === `Respuesta privada para ${c.i}`) ok++; else wrong++; } } check(wrong === 0 && ok === sample.length, `cada cliente recibe solo su respuesta (${ok}/${sample.length} correctas, ${wrong} cruzadas)`);
  // presupuestos a muchos clientes + aceptación concurrente
  const cl = []; for (const c of sample.slice(0, 60)) { const m = byPeer.get(c.cfp); const k = (await call('POST', `/api/messages/${m.id}/client`, { name: `Cliente ${c.i}` })); const q = await call('POST', '/api/documents', { type: 'presupuesto', client_id: k.client_id, lines: [{ desc: 'Trabajo', qty: 1, price: 10000 + c.i, iva: 21 }] }); await call('POST', '/api/client-channel/send-quote', { doc_id: q.id }); cl.push({ c, q }); }
  await sleep(1500); await pool(cl, 30, async ({ c }) => { await poll(c); }); const quoted = cl.filter(({ c, q }) => c.got.some((g) => g.t === 'quote' && g.qid === `q${q.id}` && g.total === q.total)); check(quoted.length === cl.length, `${cl.length} presupuestos llegan a su cliente con el importe correcto (${quoted.length})`);
  await pool(cl, 30, ({ c, q }) => post(c, { t: 'quote_reply', qid: `q${q.id}`, action: c.i % 2 ? 'accept' : 'reject' })); await sleep(4000);
  const docs = (await call('GET', '/api/state')).documents; const wrongQ = cl.filter(({ c, q }) => docs.find((d) => d.id === q.id)?.status !== (c.i % 2 ? 'aceptado' : 'rechazado')); if (wrongQ.length) console.log('  ejemplo:', JSON.stringify(wrongQ.slice(0, 2).map(({ c, q }) => ({ i: c.i, esperado: c.i % 2 ? 'aceptado' : 'rechazado', real: docs.find((d) => d.id === q.id)?.status })))); check(wrongQ.length === 0, `cada presupuesto refleja la decisión de su cliente (erróneos: ${wrongQ.length})`);
  // el relé es ciego
  const dbr = new DatabaseSync(join(rdir, 'relay.db'), { readOnly: true }); const dump = JSON.stringify([dbr.prepare('SELECT * FROM inbox LIMIT 500').all(), dbr.prepare('SELECT * FROM outbox LIMIT 500').all()]); dbr.close(); check(!/Mensaje \d del cliente|necesito presupuesto|Respuesta privada/.test(dump), 'el relé no contiene ningún texto legible tras el test masivo');
  // abuso: replay, basura, tamaños y cuotas
  const c0 = cust[0]; const big = await rj('POST', `/v1/biz/${biz}/inbox`, { cfp: c0.cfp, cpub: toB64u(c0.id.pubRaw), env: { iv: 'A'.repeat(16), ct: 'A'.repeat(70000) }, cname: 'x' }); check(big.status >= 400 && big.status < 500, `sobre enorme rechazado (${big.status})`);
  const junk = await pool(Array.from({ length: 300 }, (_, i) => i), 30, async (i) => { const r = await rj('POST', `/v1/biz/${biz}/inbox`, { cfp: 'x', cpub: 'y', env: i }); if (r.status < 400 || r.status >= 500) throw new Error('status ' + r.status); }); check(junk === 0, '300 peticiones basura al relé: todas 4xx, sin caída');
  const otherCfp = cust[1].cfp, forged = await rj('POST', `/v1/biz/${biz}/inbox`, { cfp: otherCfp, cpub: toB64u(c0.id.pubRaw), env: await seal(c0.key, { t: 'text', text: 'suplantación', ts: Date.now() }, { biz, cfp: c0.cfp, dir: 'c2b' }), cname: 'Impostor' }); await sleep(2500); const fm = (await call('GET', '/api/state')).messages.some((m) => /suplantación/.test(m.body)); check(!fm, `un cliente no puede suplantar la huella de otro (relé: ${forged.status}; mensaje no entregado)`);
  const q0 = new DatabaseSync(join(rdir, 'relay.db'), { readOnly: true }).prepare('SELECT COUNT(*) n FROM inbox').get().n; console.log(`  cola del relé tras el test: ${q0} sobres pendientes (se vacían al leer REM)`);
  const alive = await Promise.all([fetch(rbase + '/healthz').then((r) => r.ok), fetch(base + '/api/state').then((r) => r.ok)]).catch(() => [false]); check(alive.every(Boolean), `relé y empresa siguen vivos (memoria relé ${rss(relay.pid).toFixed(0)} MB · REM ${rss(srv.pid).toFixed(0)} MB)`);
  relay.kill(); srv.kill();
}

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : '';
try { if (only !== 'b') await parteEmpresa(); if (only !== 'a') await parteClientes(); }
catch (e) { fails.push('EXCEPCIÓN: ' + e.message); console.error(e); }
finally { procs.forEach((p) => p.kill()); await sleep(300); rmSync(dir, { recursive: true, force: true }); }
console.log('\n=== RESUMEN ==='); for (const [n, ms] of metrics) console.log(`  ${n.padEnd(40)} ${(ms / 1000).toFixed(2)} s`);
console.log(fails.length ? `\n${fails.length} FALLO(S):\n - ${fails.join('\n - ')}` : '\nTodo correcto.'); process.exit(fails.length ? 1 : 0);
