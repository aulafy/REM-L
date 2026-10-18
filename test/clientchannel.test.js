import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';
import { generateIdentity, fingerprint, sessionKey, seal, open, toB64u, fromB64u } from '../relay/public/proto.js';

let relay, rem, rbase, base, dir; const procs = [];
const port = () => new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const until = async (fn, ms = 15000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 60)); } };
const rj = async (method, path, body, tok) => { const r = await fetch(rbase + path, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const call = async (method, path, body) => { const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => ({})) }; };
const state = async () => (await call('GET', '/api/state')).json;

// Un «cliente web» simulado con el mismo protocolo que el navegador
class Customer {
  constructor(biz, bizPub, name) { this.biz = biz; this.bizPub = bizPub; this.name = name; this.since = 0; }
  async init() { this.id = await generateIdentity(); this.cfp = await fingerprint(this.id.pubRaw); this.key = await sessionKey(this.id.priv, fromB64u(this.bizPub), this.biz, this.cfp); return this; }
  async post(payload, cname = this.name) { return rj('POST', `/v1/biz/${this.biz}/inbox`, { cfp: this.cfp, cpub: toB64u(this.id.pubRaw), env: await seal(this.key, payload, { biz: this.biz, cfp: this.cfp, dir: 'c2b' }), cname }); }
  async poll(wait = 0) { const r = await rj('GET', `/v1/c/${this.biz}/${this.cfp}/outbox?since=${this.since}&wait=${wait}`); const out = []; for (const it of r.json.items) { this.since = Math.max(this.since, it.id); out.push(await open(this.key, it.env, { biz: this.biz, cfp: this.cfp, dir: 'b2c' })); } return out; }
  async next(type, ms = 6000) { const t = Date.now(); this.buf ||= []; for (;;) { const i = this.buf.findIndex((p) => p.t === type); if (i >= 0) return this.buf.splice(i, 1)[0]; this.buf.push(...await this.poll(1)); if (Date.now() - t > ms) throw new Error('timeout esperando ' + type); } }
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'rem-cc-')); const rp = await port(), p = await port(); rbase = `http://127.0.0.1:${rp}`; base = `http://127.0.0.1:${p}`;
  relay = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'relay/server.mjs'], { env: { ...process.env, RELAY_PORT: String(rp), RELAY_DATA_DIR: join(dir, 'relay'), RELAY_INVITES: 'piloto-1,piloto-2', RELAY_RATE_CUST: '6', RELAY_MAX_WAIT: '3', RELAY_ACK_GRACE_MS: '0' }, stdio: 'pipe' });
  rem = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { env: { ...process.env, REM_PORT: String(p), REM_DATA_DIR: join(dir, 'rem'), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0', REM_RELAY_WAIT: '2' }, stdio: 'pipe' }); procs.push(relay, rem);
  for (let i = 0; i < 60; i++) { try { await fetch(rbase + '/healthz'); await fetch(base + '/api/state'); break; } catch { await new Promise((r) => setTimeout(r, 100)); } }
});
after(() => procs.forEach((x) => x.kill()));

test('relé: registro solo por invitación, perfil público y validaciones de clave', async () => {
  assert.equal((await rj('POST', '/v1/biz/register', { pub: 'x'.repeat(87), invite: 'piloto-1' })).status, 400); const id = await generateIdentity();
  assert.equal((await rj('POST', '/v1/biz/register', { pub: toB64u(id.pubRaw), invite: 'nada' })).status, 403); assert.equal((await rj('POST', '/v1/biz/register', { pub: toB64u(id.pubRaw) })).status, 403);
  const ok = (await rj('POST', '/v1/biz/register', { pub: toB64u(id.pubRaw), invite: 'piloto-2', name: 'Fontanería Gil' })).json; assert.equal(ok.biz, await fingerprint(id.pubRaw)); assert.match(ok.token, /^[a-f0-9]{64}$/);
  const pr = (await rj('GET', `/v1/biz/${ok.biz}`)).json; assert.equal(pr.name, 'Fontanería Gil'); assert.equal(pr.pub, toB64u(id.pubRaw)); assert.ok(!('token' in pr) && !('token_hash' in pr));
  assert.equal((await rj('PUT', `/v1/biz/${ok.biz}/profile`, { name: 'X' })).status, 401); assert.equal((await rj('PUT', `/v1/biz/${ok.biz}/profile`, { name: 'X' }, 'f'.repeat(64))).status, 401); assert.equal((await rj('PUT', `/v1/biz/${ok.biz}/profile`, { hours: 'L-V 9-18' }, ok.token)).status, 200);
  assert.equal((await rj('GET', `/v1/biz/${ok.biz}`)).json.hours, 'L-V 9-18'); assert.equal((await rj('GET', '/v1/biz/AAAAAAAAAAAAAAAAAAAAAA')).status, 404); assert.equal((await rj('GET', `/v1/biz/${ok.biz}/inbox?since=0`)).status, 401);
});
test('REM: activar el canal (invitación incorrecta = 403) y enlace para compartir', async () => {
  assert.equal((await call('POST', '/api/client-channel/enable', { relay: rbase, invite: 'mala' })).status, 403); assert.equal((await call('POST', '/api/client-channel/enable', { relay: 'ftp://x' })).status, 400); assert.equal((await call('POST', '/api/client-channel/enable', { relay: 'http://relay.ejemplo.com', invite: 'piloto-1' })).status, 400, 'http solo en local');
  await call('PUT', '/api/settings', { company_name: 'Fontanería Gil', company_iban: 'ES9121000418450200051332', company_phone: '960000000' });
  const r = (await call('POST', '/api/client-channel/enable', { relay: rbase, invite: 'piloto-1', name: 'Fontanería Gil' })); assert.equal(r.status, 200, JSON.stringify(r.json)); assert.match(r.json.link, new RegExp(`^${rbase}/c/[\\w-]{22}$`)); globalThis.__biz = r.json.biz;
  const s = await state(); assert.equal(s.relay.on, true); assert.ok(!JSON.stringify(s).includes('relay_token') && !JSON.stringify(s).includes('relay_identity'), 'las claves no llegan al navegador');
  const page = await fetch(r.json.link); assert.equal(page.status, 200); assert.match(await page.text(), /<div id="app">/); assert.match(page.headers.get('content-security-policy'), /script-src 'self'/); assert.equal((await fetch(rbase + '/proto.js')).status, 200); assert.equal((await fetch(rbase + '/../server.mjs')).status, 404);
  const prof = (await rj('GET', `/v1/biz/${globalThis.__biz}`)).json; assert.equal(prof.name, 'Fontanería Gil'); assert.equal(prof.phone, '960000000'); globalThis.__pub = prof.pub;
});
test('conversación de punta a punta: el cliente escribe, REM lo recibe, REM responde y el cliente lo lee (todo cifrado)', async () => {
  const c = await new Customer(globalThis.__biz, globalThis.__pub, 'Marta').init(); globalThis.__c = c;
  assert.equal((await c.post({ t: 'hello', name: 'Marta Soler', ts: Date.now() })).status, 200); assert.equal((await c.post({ t: 'text', id: 'm1', text: 'Hola, ¿podéis arreglarme un grifo que gotea?', ts: Date.now() })).status, 200);
  const msg = await until(async () => (await state()).messages.find((m) => m.channel === 'rem' && /grifo/.test(m.body))); assert.equal(msg.peer_name, 'Marta Soler'); assert.equal(msg.peer_addr, c.cfp); assert.equal(msg.direction, 'in'); globalThis.__mid = msg.id;
  assert.equal((await c.post({ t: 'text', id: 'm1', text: 'Hola, ¿podéis arreglarme un grifo que gotea?', ts: Date.now() })).status, 200); await new Promise((r) => setTimeout(r, 400)); assert.equal((await state()).messages.filter((m) => m.channel === 'rem' && /grifo/.test(m.body)).length, 1, 'el mismo mensaje reenviado no se duplica');
  const out = await call('POST', `/api/messages/${msg.id}/send`, { text: 'Hola Marta, claro. Mañana por la tarde puedo pasarme.' }); assert.equal(out.status, 200, JSON.stringify(out.json)); const got = await c.next('text'); assert.equal(got.text, 'Hola Marta, claro. Mañana por la tarde puedo pasarme.');
  assert.equal((await state()).messages.find((m) => m.direction === 'out' && m.channel === 'rem').body.startsWith('Hola Marta'), true);
});
test('el relé es ciego: nada legible en su base de datos y los sobres no se pueden abrir con otra clave ni en otro sentido', async () => {
  const dbr = new DatabaseSync(join(dir, 'relay', 'relay.db'), { readOnly: true }), dump = JSON.stringify([dbr.prepare('SELECT * FROM inbox').all(), dbr.prepare('SELECT * FROM outbox').all()]); dbr.close();
  for (const s of ['grifo', 'Marta Soler', 'Hola Marta', 'tarde']) assert.ok(!dump.includes(s), `«${s}» no debe verse`);
  const c = globalThis.__c, other = await new Customer(globalThis.__biz, globalThis.__pub, 'Intruso').init(), env = await seal(c.key, { t: 'text', text: 'secreto' }, { biz: c.biz, cfp: c.cfp, dir: 'c2b' });
  await assert.rejects(open(other.key, env, { biz: c.biz, cfp: c.cfp, dir: 'c2b' })); await assert.rejects(open(c.key, env, { biz: c.biz, cfp: c.cfp, dir: 'b2c' }), 'un sobre de ida no vale como de vuelta'); await assert.rejects(open(c.key, env, { biz: c.biz, cfp: 'X'.repeat(22), dir: 'c2b' }));
  const t = { ...env, ct: env.ct.slice(0, -4) + (env.ct.slice(-4) === 'AAAA' ? 'BBBB' : 'AAAA') }; await assert.rejects(open(c.key, t, { biz: c.biz, cfp: c.cfp, dir: 'c2b' }));
});
test('presupuesto: REM lo envía como tarjeta; el cliente lo acepta y el presupuesto pasa a «aceptado»; no se puede cambiar después ni aceptar desde otra clave', async () => {
  const c = globalThis.__c, cl = (await call('POST', `/api/messages/${globalThis.__mid}/client`, { name: 'Marta Soler' })).json; assert.ok(cl.client_id);
  const q = (await call('POST', '/api/documents', { type: 'presupuesto', client_id: cl.client_id, lines: [{ desc: 'Cambio de grifo', qty: 1, price: 4500, iva: 21 }, { desc: 'Juntas', qty: 2, price: 300, iva: 21 }] })).json;
  assert.equal((await call('POST', '/api/client-channel/send-quote', { doc_id: q.id })).status, 200); const card = await c.next('quote'); assert.equal(card.total, q.total); assert.equal(card.lines.length, 2); assert.equal(card.title, `Presupuesto ${q.number}`); assert.equal(card.qid, `q${q.id}`);
  const other = await new Customer(globalThis.__biz, globalThis.__pub, 'Otro').init(); await other.post({ t: 'hello', name: 'Otro' }); await other.post({ t: 'quote_reply', qid: card.qid, action: 'accept' }); await new Promise((r) => setTimeout(r, 600)); assert.notEqual((await state()).documents.find((d) => d.id === q.id).status, 'aceptado', 'otra clave no puede aceptar');
  await c.post({ t: 'quote_reply', qid: card.qid, action: 'accept' }); await until(async () => (await state()).documents.find((d) => d.id === q.id).status === 'aceptado'); const info = (await state()).messages.find((m) => /ACEPTADO/.test(m.body)); assert.ok(info, 'avisa en Mensajes'); assert.match(info.body, new RegExp(q.number));
  await c.post({ t: 'quote_reply', qid: card.qid, action: 'reject' }); await new Promise((r) => setTimeout(r, 500)); assert.equal((await state()).documents.find((d) => d.id === q.id).status, 'aceptado', 'ya decidido: no cambia');
  assert.equal((await call('POST', '/api/client-channel/send-quote', { doc_id: 99999 })).status, 404);
  const f = (await call('POST', '/api/documents', { type: 'factura', client_id: cl.client_id, lines: [{ desc: 'x', qty: 1, price: 100, iva: 21 }] })).json; assert.equal((await call('POST', '/api/client-channel/send-quote', { doc_id: f.id })).status, 409, 'solo presupuestos');
});
test('pago y envío: datos de pago de la empresa en la tarjeta, enlace solo https, aviso «ya he pagado» y seguimiento', async () => {
  const c = globalThis.__c, cl = (await state()).clients.find((x) => x.name === 'Marta Soler');
  assert.equal((await call('POST', '/api/client-channel/send-pay', { client_id: cl.id, amount: 0, concept: 'x' })).status, 400); assert.equal((await call('POST', '/api/client-channel/send-pay', { client_id: cl.id, amount: 5445, concept: 'x', link: 'http://malo.example/pagar' })).status, 400); assert.equal((await call('POST', '/api/client-channel/send-pay', { client_id: cl.id, amount: 5445, concept: 'x', link: 'javascript:alert(1)' })).status, 400);
  assert.equal((await call('POST', '/api/client-channel/send-pay', { client_id: cl.id, amount: 5445, concept: 'Cambio de grifo', link: 'https://pago.fontaneriagil.example/p/123' })).status, 200); const pay = await c.next('pay'); assert.deepEqual([pay.amount, pay.holder, pay.iban, pay.link], [5445, 'Fontanería Gil', 'ES9121000418450200051332', 'https://pago.fontaneriagil.example/p/123']);
  await c.post({ t: 'paid_claim', pid: pay.id }); const claim = await until(async () => (await state()).messages.find((m) => /ya ha hecho el pago/.test(m.body))); assert.match(claim.body, /Compruébalo en tu banco/);
  assert.equal((await call('POST', '/api/client-channel/status', { client_id: cl.id, state: 'Enviado', text: 'Sale hoy', tracking: { carrier: 'Correos', code: 'PQ1', url: 'javascript:alert(1)' } })).status, 200); const st = await c.next('status'); assert.equal(st.state, 'Enviado'); assert.equal(st.tracking, undefined, 'un enlace que no es https se descarta');
  await call('POST', '/api/client-channel/status', { client_id: cl.id, state: 'En reparto', tracking: { carrier: 'Correos', code: 'PQ1', url: 'https://correos.example/seguimiento?c=PQ1' } }); assert.equal((await c.next('status')).tracking.url, 'https://correos.example/seguimiento?c=PQ1');
  assert.equal((await call('POST', '/api/client-channel/status', { cfp: 'Z'.repeat(22), state: 'x' })).status, 404, 'cliente que nunca escribió');
});
test('relé: lo entregado se borra (acuse de recibo) y los ids no se reutilizan al vaciarse la cola', async () => {
  const c = await new Customer(globalThis.__biz, globalThis.__pub, 'Lucía').init(); await c.post({ t: 'hello', name: 'Lucía' });
  const rdb = () => new DatabaseSync(join(dir, 'relay', 'relay.db'), { readOnly: true }), count = (t) => { const d = rdb(); const n = d.prepare(`SELECT COUNT(*) n FROM ${t} WHERE biz=?`).get(globalThis.__biz).n; d.close(); return n; };
  await until(() => count('inbox') === 0, 10000).catch((e) => { throw new Error('inbox=' + count('inbox') + ' ' + e.message); }); // REM lo leyó y confirmó: ya no está en el relé
  const maxId = () => { const d = rdb(); const m = d.prepare("SELECT seq FROM sqlite_sequence WHERE name='inbox'").get().seq; d.close(); return m; }; const before = maxId();
  const pz = await c.post({ t: 'text', id: 'z1', text: 'mensaje tras vaciar la cola', ts: Date.now() }); assert.equal(pz.status, 200, JSON.stringify(pz.json)); await until(async () => (await state()).messages.find((m) => /tras vaciar la cola/.test(m.body)), 10000); assert.ok(maxId() > before, 'el id sigue creciendo');
  await call('POST', `/api/messages/${(await state()).messages.find((m) => /tras vaciar la cola/.test(m.body)).id}/send`, { text: 'recibido' }); assert.equal((await c.next('text')).text, 'recibido'); await c.poll(0); assert.equal(count('outbox') >= 0, true);
  const d = rdb(), left = d.prepare('SELECT COUNT(*) n FROM outbox WHERE biz=? AND cfp=?').get(globalThis.__biz, c.cfp).n; d.close(); assert.equal(left, 0, 'lo que el cliente ya leyó se borra del relé');
});
test('límites y abuso: ritmo por cliente, tamaño, bloqueo, huella falsa y empresa que no acepta mensajes', async () => {
  const biz = globalThis.__biz, c = await new Customer(biz, globalThis.__pub, 'Spammer').init(); let last; for (let i = 0; i < 8; i++) last = await c.post({ t: 'text', id: 's' + i, text: 'hola ' + i }); assert.equal(last.status, 429);
  const big = await new Customer(biz, globalThis.__pub, 'Grande').init(); const env = await seal(big.key, { t: 'text', text: 'x'.repeat(70000) }, { biz, cfp: big.cfp, dir: 'c2b' }); assert.equal((await rj('POST', `/v1/biz/${biz}/inbox`, { cfp: big.cfp, cpub: toB64u(big.id.pubRaw), env })).status, 413);
  const fake = await new Customer(biz, globalThis.__pub, 'Falso').init(); assert.equal((await rj('POST', `/v1/biz/${biz}/inbox`, { cfp: 'A'.repeat(22), cpub: toB64u(fake.id.pubRaw), env: await seal(fake.key, { t: 'text', text: 'x' }, { biz, cfp: fake.cfp, dir: 'c2b' }) })).status, 400, 'la huella debe corresponder a la clave');
  assert.equal((await rj('POST', `/v1/biz/${biz}/inbox`, { cfp: fake.cfp, cpub: toB64u(fake.id.pubRaw), env: { iv: 'a', ct: 'b' } })).status, 400);
  assert.equal((await call('POST', '/api/client-channel/block', { cfp: c.cfp })).status, 200); const c2 = await new Customer(biz, globalThis.__pub, 'Spammer').init(); c2.cfp = c.cfp; c2.id = c.id; c2.key = c.key; assert.equal((await c2.post({ t: 'text', text: 'otra vez' })).status, 403, 'bloqueado');
  assert.equal((await call('POST', '/api/client-channel/profile', { accepting: false })).status, 200); const late = await new Customer(biz, globalThis.__pub, 'Tarde').init(); assert.equal((await late.post({ t: 'text', text: 'hola' })).status, 403); await call('POST', '/api/client-channel/profile', { accepting: true });
});
test('desactivar el canal: el relé deja de aceptar mensajes y REM deja de leer', async () => {
  assert.equal((await call('POST', '/api/client-channel/disable', {})).json.on, false); assert.equal((await rj('GET', `/v1/biz/${globalThis.__biz}`)).json.accepting, false);
  assert.equal((await call('POST', `/api/messages/${globalThis.__mid}/send`, { text: 'hola' })).status, 409);
});

test('relé: migra una base antigua sin AUTOINCREMENT conservando los mensajes pendientes y la numeración', async () => {
  const mdir = join(dir, 'relay-old'); mkdirSync(mdir, { recursive: true }); const old = new DatabaseSync(join(mdir, 'relay.db'));
  old.exec(`CREATE TABLE biz(id TEXT PRIMARY KEY, pub TEXT NOT NULL, token_hash TEXT NOT NULL, profile TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL);
    CREATE TABLE inbox(id INTEGER PRIMARY KEY, biz TEXT NOT NULL, cfp TEXT NOT NULL, cpub TEXT NOT NULL, iv TEXT NOT NULL, ct TEXT NOT NULL, cname TEXT DEFAULT '', ts INTEGER NOT NULL);
    CREATE TABLE outbox(id INTEGER PRIMARY KEY, biz TEXT NOT NULL, cfp TEXT NOT NULL, iv TEXT NOT NULL, ct TEXT NOT NULL, ts INTEGER NOT NULL);`);
  old.prepare('INSERT INTO inbox(id,biz,cfp,cpub,iv,ct,ts) VALUES(41,?,?,?,?,?,?)').run('B'.repeat(22), 'C'.repeat(22), 'P', 'iv', 'ct', Date.now()); old.close();
  const p = await port(), child = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'relay/server.mjs'], { env: { ...process.env, RELAY_PORT: String(p), RELAY_DATA_DIR: mdir, RELAY_INVITES: 'x' }, stdio: 'pipe' }); procs.push(child);
  await until(async () => { try { return (await fetch(`http://127.0.0.1:${p}/healthz`)).ok; } catch { return false; } }); child.kill(); await new Promise((r) => setTimeout(r, 300));
  const d = new DatabaseSync(join(mdir, 'relay.db'), { readOnly: true }); assert.match(d.prepare("SELECT sql FROM sqlite_master WHERE name='inbox'").get().sql, /AUTOINCREMENT/i); assert.equal(d.prepare('SELECT COUNT(*) n FROM inbox').get().n, 1); assert.equal(d.prepare("SELECT seq FROM sqlite_sequence WHERE name='inbox'").get().seq, 41); d.close();
});
