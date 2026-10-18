// REM Clientes · relé «ciego» (PROTOTIPO). Guarda y reenvía sobres cifrados entre un cliente (navegador) y una empresa (REM en su Mac).
// No puede leer los mensajes: solo ve claves públicas, huellas, tamaños y horas. La empresa se conecta SIEMPRE hacia fuera (sin abrir puertos).
// Cero dependencias (Node ≥ 22, node:sqlite). Uso: RELAY_INVITES=codigo1,codigo2 node relay/server.mjs
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url)), PUB = join(HERE, 'public');
const env = process.env, PORT = Number(env.RELAY_PORT || 4800), DATA = env.RELAY_DATA_DIR || join(HERE, 'data');
const INVITES = new Set(String(env.RELAY_INVITES || '').split(',').map((x) => x.trim()).filter(Boolean)), OPEN = env.RELAY_OPEN === '1';
const RETENTION_MS = Number(env.RELAY_RETENTION_DAYS || 14) * 864e5, MAX_CT = 48 * 1024, MAX_QUEUE_BIZ = Number(env.RELAY_MAX_QUEUE_BIZ || 2000), MAX_QUEUE_CUST = 300, MAX_WAIT = Number(env.RELAY_MAX_WAIT || 25);
const LIMIT = { ip: Number(env.RELAY_RATE_IP || 60), cust: Number(env.RELAY_RATE_CUST || 30) }; // envíos por minuto

mkdirSync(DATA, { recursive: true });
const db = new DatabaseSync(join(DATA, 'relay.db'));
db.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS biz(id TEXT PRIMARY KEY, pub TEXT NOT NULL, token_hash TEXT NOT NULL, profile TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS inbox(id INTEGER PRIMARY KEY AUTOINCREMENT, biz TEXT NOT NULL, cfp TEXT NOT NULL, cpub TEXT NOT NULL, iv TEXT NOT NULL, ct TEXT NOT NULL, cname TEXT DEFAULT '', ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_inbox ON inbox(biz, id);
CREATE TABLE IF NOT EXISTS outbox(id INTEGER PRIMARY KEY AUTOINCREMENT, biz TEXT NOT NULL, cfp TEXT NOT NULL, iv TEXT NOT NULL, ct TEXT NOT NULL, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_outbox ON outbox(biz, cfp, id);
CREATE TABLE IF NOT EXISTS blocked(biz TEXT NOT NULL, cfp TEXT NOT NULL, PRIMARY KEY(biz, cfp));`);
// Migración: sin AUTOINCREMENT, al vaciarse la cola se reutilizarían los ids y la empresa ignoraría mensajes nuevos
for (const t of ['inbox', 'outbox']) { const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(t)?.sql || ''; if (sql && !/AUTOINCREMENT/i.test(sql)) { const mx = db.prepare(`SELECT COALESCE(MAX(id),0) m FROM ${t}`).get().m; db.exec(`ALTER TABLE ${t} RENAME TO ${t}_old; ${sql.replace(/id INTEGER PRIMARY KEY/i, 'id INTEGER PRIMARY KEY AUTOINCREMENT').replace(`TABLE ${t}`, `TABLE ${t}`)}; INSERT INTO ${t} SELECT * FROM ${t}_old; DROP TABLE ${t}_old; INSERT OR REPLACE INTO sqlite_sequence(name,seq) VALUES('${t}',${mx}); CREATE INDEX IF NOT EXISTS ix_${t} ON ${t}(${t === 'inbox' ? 'biz, id' : 'biz, cfp, id'});`); } }
const q = (sql, ...p) => db.prepare(sql).all(...p), one = (sql, ...p) => db.prepare(sql).get(...p), run = (sql, ...p) => db.prepare(sql).run(...p);

class Http extends Error { constructor(status, message) { super(message); this.status = status; } }
const b64u = /^[A-Za-z0-9_-]+$/;
const fp = (pubRaw) => createHash('sha256').update(pubRaw).digest('base64url').slice(0, 22);
const sha = (s) => createHash('sha256').update(s).digest('hex');
const same = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const validPub = (s) => b64u.test(s) && s.length === 87 && Buffer.from(s, 'base64url')[0] === 4; // punto P-256 sin comprimir
const str = (v, n) => String(v ?? '').trim().slice(0, n);

// ---- límites por minuto (memoria) ----
const hits = new Map();
function limit(key, max) { const now = Date.now(), a = (hits.get(key) || []).filter((t) => now - t < 60000); if (a.length >= max) throw new Http(429, 'Demasiados mensajes seguidos. Espera un minuto.'); a.push(now); hits.set(key, a); }
setInterval(() => { const now = Date.now(); for (const [k, a] of hits) if (!a.some((t) => now - t < 60000)) hits.delete(k); }, 60000).unref();

// ---- esperas largas ----
const waiters = new Map();
const wake = (key) => { const s = waiters.get(key); if (s) { for (const f of s) f(); waiters.delete(key); } };
const waitFor = (key, ms) => new Promise((res) => { const s = waiters.get(key) || waiters.set(key, new Set()).get(key), f = () => { clearTimeout(t); res(); }, t = setTimeout(() => { s.delete(f); res(); }, ms); s.add(f); });

const auth = (req, id) => {
  const h = String(req.headers.authorization || ''), tok = h.startsWith('Bearer ') ? h.slice(7).trim() : '', b = one('SELECT * FROM biz WHERE id=?', id);
  if (!b || !tok || !same(sha(tok), b.token_hash)) throw new Http(401, 'No autorizado'); return b;
};
const profileOf = (b) => ({ biz: b.id, pub: b.pub, ...JSON.parse(b.profile) });
const checkEnv = (e, max = MAX_CT) => {
  if (!e || typeof e.iv !== 'string' || typeof e.ct !== 'string' || !b64u.test(e.iv) || !b64u.test(e.ct) || e.iv.length !== 16) throw new Http(400, 'Sobre no válido');
  if (e.ct.length > Math.ceil(max * 4 / 3) + 4 || e.ct.length < 22) throw new Http(413, 'Mensaje demasiado grande o vacío');
};

async function api(req, url, body) {
  const m = req.method, p = url.pathname; let g;
  if (m === 'GET' && p === '/healthz') return { ok: true };
  if (m === 'POST' && p === '/v1/biz/register') {
    const pub = str(body.pub, 120); if (!validPub(pub)) throw new Http(400, 'Clave pública no válida');
    const invite = str(body.invite, 80); if (!OPEN && !INVITES.has(invite)) throw new Http(403, 'Este relé funciona por invitación');
    const id = fp(Buffer.from(pub, 'base64url')), ex = one('SELECT * FROM biz WHERE id=?', id), token = randomBytes(32).toString('hex');
    if (ex) { run('UPDATE biz SET token_hash=? WHERE id=?', sha(token), id); } else run('INSERT INTO biz(id,pub,token_hash,profile,created_at) VALUES(?,?,?,?,?)', id, pub, sha(token), JSON.stringify({ name: str(body.name, 80) || 'Mi negocio', accepting: true }), Date.now());
    return { biz: id, token, existed: !!ex };
  }
  if ((g = p.match(/^\/v1\/biz\/([A-Za-z0-9_-]{22})(\/profile)?$/))) {
    const id = g[1];
    if (m === 'GET' && !g[2]) { const b = one('SELECT * FROM biz WHERE id=?', id); if (!b) throw new Http(404, 'Esta empresa no existe'); const pr = profileOf(b); return { biz: pr.biz, pub: pr.pub, name: pr.name, tagline: pr.tagline || '', hours: pr.hours || '', address: pr.address || '', phone: pr.phone || '', web: pr.web || '', welcome: pr.welcome || '', accepting: pr.accepting !== false }; }
    if (m === 'PUT' && g[2]) { const b = auth(req, id), cur = JSON.parse(b.profile), n = { ...cur }; for (const [k, l] of [['name', 80], ['tagline', 140], ['hours', 300], ['address', 200], ['phone', 40], ['web', 200], ['welcome', 500]]) if (body[k] !== undefined) n[k] = str(body[k], l); if (body.accepting !== undefined) n.accepting = !!body.accepting; if (!n.name) throw new Http(400, 'Falta el nombre'); run('UPDATE biz SET profile=? WHERE id=?', JSON.stringify(n), id); return { ok: true }; }
  }
  if (m === 'POST' && (g = p.match(/^\/v1\/biz\/([A-Za-z0-9_-]{22})\/inbox$/))) {          // cliente → empresa
    const id = g[1], b = one('SELECT * FROM biz WHERE id=?', id); if (!b) throw new Http(404, 'Esta empresa no existe'); if (JSON.parse(b.profile).accepting === false) throw new Http(403, 'Esta empresa no recibe mensajes ahora mismo');
    const cpub = str(body.cpub, 120); if (!validPub(cpub)) throw new Http(400, 'Clave no válida'); const cfp = fp(Buffer.from(cpub, 'base64url'));
    if (body.cfp !== cfp) throw new Http(400, 'La huella no corresponde a la clave'); checkEnv(body.env);
    if (one('SELECT 1 FROM blocked WHERE biz=? AND cfp=?', id, cfp)) throw new Http(403, 'No se pueden enviar mensajes a esta empresa');
    limit('ip:' + (req.socket.remoteAddress || ''), LIMIT.ip); limit('c:' + cfp, LIMIT.cust);
    if (one('SELECT COUNT(*) n FROM inbox WHERE biz=?', id).n >= MAX_QUEUE_BIZ) throw new Http(503, 'La empresa tiene demasiados mensajes pendientes. Inténtalo más tarde.');
    if (one('SELECT COUNT(*) n FROM inbox WHERE biz=? AND cfp=?', id, cfp).n >= MAX_QUEUE_CUST) throw new Http(429, 'Ya hay muchos mensajes tuyos pendientes de leer.');
    const r = run('INSERT INTO inbox(biz,cfp,cpub,iv,ct,cname,ts) VALUES(?,?,?,?,?,?,?)', id, cfp, cpub, body.env.iv, body.env.ct, str(body.cname, 40), Date.now()); wake('in:' + id); return { id: Number(r.lastInsertRowid) };
  }
  if (m === 'GET' && (g = p.match(/^\/v1\/biz\/([A-Za-z0-9_-]{22})\/inbox$/))) {            // empresa lee
    const id = g[1]; auth(req, id); const since = Number(url.searchParams.get('since') || 0), wait = Math.min(MAX_WAIT, Number(url.searchParams.get('wait') || 0));
    if (since > 0) run('DELETE FROM inbox WHERE biz=? AND id<=?', id, since); // acuse de recibo: lo ya entregado a la empresa se borra del relé
    let rows = q('SELECT id,cfp,cpub,iv,ct,cname,ts FROM inbox WHERE biz=? AND id>? ORDER BY id LIMIT 100', id, since); if (!rows.length && wait > 0) { await waitFor('in:' + id, wait * 1000); rows = q('SELECT id,cfp,cpub,iv,ct,cname,ts FROM inbox WHERE biz=? AND id>? ORDER BY id LIMIT 100', id, since); }
    return { items: rows.map((r) => ({ id: r.id, cfp: r.cfp, cpub: r.cpub, env: { iv: r.iv, ct: r.ct }, cname: r.cname, ts: r.ts })) };
  }
  if (m === 'POST' && (g = p.match(/^\/v1\/biz\/([A-Za-z0-9_-]{22})\/outbox$/))) {          // empresa → cliente
    const id = g[1]; auth(req, id); if (!b64u.test(String(body.cfp)) || String(body.cfp).length !== 22) throw new Http(400, 'Destinatario no válido'); checkEnv(body.env);
    if (one('SELECT COUNT(*) n FROM outbox WHERE biz=? AND cfp=?', id, body.cfp).n >= MAX_QUEUE_CUST) throw new Http(429, 'Ese cliente tiene demasiados mensajes sin leer');
    const r = run('INSERT INTO outbox(biz,cfp,iv,ct,ts) VALUES(?,?,?,?,?)', id, body.cfp, body.env.iv, body.env.ct, Date.now()); wake(`out:${id}:${body.cfp}`); return { id: Number(r.lastInsertRowid) };
  }
  if (m === 'GET' && (g = p.match(/^\/v1\/c\/([A-Za-z0-9_-]{22})\/([A-Za-z0-9_-]{22})\/outbox$/))) {   // cliente lee
    const [, id, cfp] = g, since = Number(url.searchParams.get('since') || 0), wait = Math.min(MAX_WAIT, Number(url.searchParams.get('wait') || 0)); limit('p:' + (req.socket.remoteAddress || ''), 240);
    if (since > 0) run('DELETE FROM outbox WHERE biz=? AND cfp=? AND id<=? AND ts<?', id, cfp, since, Date.now() - Number(env.RELAY_ACK_GRACE_MS ?? 60000)); // lo que el cliente ya leyó se borra (la huella actúa como capacidad: prototipo)
    const get = () => q('SELECT id,iv,ct,ts FROM outbox WHERE biz=? AND cfp=? AND id>? ORDER BY id LIMIT 100', id, cfp, since); let rows = get(); if (!rows.length && wait > 0) { await waitFor(`out:${id}:${cfp}`, wait * 1000); rows = get(); }
    return { items: rows.map((r) => ({ id: r.id, env: { iv: r.iv, ct: r.ct }, ts: r.ts })) };
  }
  if (m === 'POST' && (g = p.match(/^\/v1\/biz\/([A-Za-z0-9_-]{22})\/block$/))) { const id = g[1]; auth(req, id); const cfp = str(body.cfp, 22); if (cfp.length !== 22) throw new Http(400, 'Huella no válida'); if (body.block === false) run('DELETE FROM blocked WHERE biz=? AND cfp=?', id, cfp); else { run('INSERT OR IGNORE INTO blocked(biz,cfp) VALUES(?,?)', id, cfp); run('DELETE FROM inbox WHERE biz=? AND cfp=?', id, cfp); } return { ok: true }; }
  throw new Http(404, 'No existe');
}

function purge() { const cut = Date.now() - RETENTION_MS; run('DELETE FROM inbox WHERE ts<?', cut); run('DELETE FROM outbox WHERE ts<?', cut); }
purge(); setInterval(purge, 3600e3).unref();

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
const HEAD = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'" };
export const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    if (url.pathname.startsWith('/v1/') || url.pathname === '/healthz') {
      let body = {}; if (req.method !== 'GET') { const ch = []; let n = 0; for await (const c of req) { n += c.length; if (n > 80 * 1024) throw new Http(413, 'Petición demasiado grande'); ch.push(c); } try { body = JSON.parse(Buffer.concat(ch).toString() || '{}'); } catch { throw new Http(400, 'JSON no válido'); } }
      const out = await api(req, url, body); res.writeHead(200, { ...HEAD, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(out)); return;
    }
    const file = /^\/c\/[A-Za-z0-9_-]{22}\/?$/.test(url.pathname) ? 'c.html' : url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const f = join(PUB, file); if (!f.startsWith(PUB) || !/^[\w.-]+$/.test(file) || !existsSync(f)) { res.writeHead(404, HEAD).end('No encontrado'); return; }
    const ext = file.slice(file.lastIndexOf('.')); res.writeHead(200, { ...HEAD, 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(readFileSync(f));
  } catch (e) {
    const status = e instanceof Http ? e.status : 500; if (status === 500) console.error(e);
    if (res.headersSent) { try { res.end(); } catch { /* cerrada */ } return; } res.writeHead(status, { ...HEAD, 'Content-Type': 'application/json' }).end(JSON.stringify({ error: status === 500 ? 'Error interno' : e.message }));
  }
});
if (process.argv[1] === fileURLToPath(import.meta.url)) server.listen(PORT, env.RELAY_HOST || '127.0.0.1', () => console.log(`REM Clientes · relé (prototipo) en http://${env.RELAY_HOST || '127.0.0.1'}:${PORT}/ · registro ${OPEN ? 'ABIERTO' : `por invitación (${INVITES.size} códigos)`}`));
