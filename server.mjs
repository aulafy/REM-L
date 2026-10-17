// REM Negocio — servidor local sin dependencias (Node ≥ 22.13, node:sqlite).
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync } from 'node:fs';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { computeTotals, today, addDays } from './public/calc.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(ROOT, 'public');
const DATA = process.env.REM_DATA_DIR || join(homedir(), 'Library', 'Application Support', 'REM Negocio');
const PORT = Number(process.env.REM_PORT || 4400);
mkdirSync(join(DATA, 'backups'), { recursive: true });

const db = new DatabaseSync(join(DATA, 'negocio.db'));
db.exec(`
PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS clients(id INTEGER PRIMARY KEY, name TEXT NOT NULL, nif TEXT DEFAULT '', email TEXT DEFAULT '', phone TEXT DEFAULT '',
  address TEXT DEFAULT '', city TEXT DEFAULT '', zip TEXT DEFAULT '', notes TEXT DEFAULT '', archived INTEGER DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', price INTEGER NOT NULL DEFAULT 0, iva REAL NOT NULL DEFAULT 21, unit TEXT DEFAULT 'ud');
CREATE TABLE IF NOT EXISTS documents(id INTEGER PRIMARY KEY, type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'borrador', number TEXT DEFAULT '', client_id INTEGER REFERENCES clients(id),
  issue_date TEXT NOT NULL, due_date TEXT DEFAULT '', lines TEXT NOT NULL DEFAULT '[]', irpf REAL DEFAULT 0, notes TEXT DEFAULT '', corrects_id INTEGER, source_id INTEGER,
  base INTEGER DEFAULT 0, iva_total INTEGER DEFAULT 0, irpf_total INTEGER DEFAULT 0, total INTEGER DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS payments(id INTEGER PRIMARY KEY, document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE, date TEXT NOT NULL, amount INTEGER NOT NULL, method TEXT DEFAULT 'transferencia', note TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS expenses(id INTEGER PRIMARY KEY, date TEXT NOT NULL, supplier TEXT DEFAULT '', concept TEXT NOT NULL, category TEXT DEFAULT 'otros', base INTEGER NOT NULL, iva REAL DEFAULT 21, total INTEGER NOT NULL, notes TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS tasks(id INTEGER PRIMARY KEY, title TEXT NOT NULL, due TEXT DEFAULT '', client_id INTEGER REFERENCES clients(id) ON DELETE SET NULL, document_id INTEGER, done INTEGER DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS activity(id INTEGER PRIMARY KEY, at TEXT NOT NULL, text TEXT NOT NULL, ref_type TEXT DEFAULT '', ref_id INTEGER);
CREATE UNIQUE INDEX IF NOT EXISTS ux_doc_number ON documents(type, number) WHERE number <> '';
`);

const nowIso = () => new Date().toISOString();
const run = (sql, ...p) => db.prepare(sql).run(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);
const log = (text, ref_type = '', ref_id = null) => run('INSERT INTO activity(at,text,ref_type,ref_id) VALUES(?,?,?,?)', nowIso(), text, ref_type, ref_id);
const tx = (fn) => { db.exec('BEGIN'); try { const v = fn(); db.exec('COMMIT'); return v; } catch (e) { db.exec('ROLLBACK'); throw e; } };

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const bad = (m) => new HttpError(400, m);

// ---------- validación ----------
const str = (v, max = 500) => String(v ?? '').trim().slice(0, max);
const int = (v) => { const n = Math.round(Number(v)); if (!Number.isFinite(n)) throw bad('Importe no válido'); return n; };
const rate = (v, d = 0) => { const n = Number(v ?? d); if (!Number.isFinite(n) || n < 0 || n > 100) throw bad('Porcentaje no válido'); return n; };
const date = (v, req = true) => { v = str(v, 10); if (!v && !req) return ''; if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) throw bad('Fecha no válida'); return v; };

function cleanLines(lines) {
  if (!Array.isArray(lines) || lines.length > 200) throw bad('Líneas no válidas');
  return lines.map((l) => ({ desc: str(l.desc, 400), qty: Number(l.qty) || 0, price: int(l.price || 0), iva: rate(l.iva, 21), discount: rate(l.discount, 0) }));
}

function settingsObj() { return Object.fromEntries(all('SELECT key,value FROM settings').map((r) => [r.key, JSON.parse(r.value)])); }
const SETTING_KEYS = ['company_name', 'company_nif', 'company_address', 'company_city', 'company_zip', 'company_email', 'company_phone', 'company_iban', 'logo',
  'default_iva', 'default_irpf', 'payment_days', 'quote_days', 'invoice_footer', 'quote_footer', 'ollama_url', 'ollama_model', 'onboarded', 'accent'];

function nextNumber(type, year) {
  const prefix = type === 'presupuesto' ? 'P' : type === 'rectificativa' ? 'R' : 'F';
  const t = type === 'rectificativa' ? 'factura' : type;
  const rows = all(`SELECT number FROM documents WHERE type=? AND number LIKE ?`, t, `${prefix}${year}-%`);
  const max = rows.reduce((m, r) => Math.max(m, Number(r.number.split('-')[1]) || 0), 0);
  return `${prefix}${year}-${String(max + 1).padStart(4, '0')}`;
}

function saveTotals(d) {
  const t = computeTotals(d.lines, d.irpf);
  return { base: t.base, iva_total: t.ivaTotal, irpf_total: t.irpfTotal, total: t.total };
}
function docRow(r) { return { ...r, lines: JSON.parse(r.lines) }; }
function getDoc(id) { const r = one('SELECT * FROM documents WHERE id=?', id); if (!r) throw new HttpError(404, 'No existe'); return docRow(r); }

function createDocument(b) {
  const type = b.type === 'presupuesto' ? 'presupuesto' : 'factura';
  const s = settingsObj();
  const issue = date(b.issue_date ?? today());
  const lines = cleanLines(b.lines ?? []);
  const irpf = rate(b.irpf, s.default_irpf ?? 0);
  const d = { lines, irpf };
  const tot = saveTotals(d);
  const due = b.due_date !== undefined ? date(b.due_date, false) : addDays(issue, type === 'presupuesto' ? (s.quote_days ?? 30) : (s.payment_days ?? 30));
  const number = type === 'presupuesto' ? nextNumber('presupuesto', issue.slice(0, 4)) : '';
  const cid = b.client_id ? Number(b.client_id) : null;
  if (cid && !one('SELECT id FROM clients WHERE id=?', cid)) throw bad('Cliente no encontrado');
  const res = run(`INSERT INTO documents(type,status,number,client_id,issue_date,due_date,lines,irpf,notes,source_id,base,iva_total,irpf_total,total,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, type, 'borrador', number, cid, issue, due, JSON.stringify(lines), irpf, str(b.notes, 2000), b.source_id ?? null,
    tot.base, tot.iva_total, tot.irpf_total, tot.total, nowIso(), nowIso());
  const id = Number(res.lastInsertRowid);
  log(`Creado ${type === 'presupuesto' ? 'presupuesto ' + number : 'borrador de factura'}`, 'document', id);
  return getDoc(id);
}

function updateDocument(id, b) {
  const cur = getDoc(id);
  const locked = cur.type === 'factura' && cur.status !== 'borrador';
  if (locked) {
    // Factura emitida: solo se puede cambiar la nota interna y el vencimiento.
    run('UPDATE documents SET notes=?, due_date=?, updated_at=? WHERE id=?', str(b.notes ?? cur.notes, 2000), b.due_date !== undefined ? date(b.due_date, false) : cur.due_date, nowIso(), id);
    return getDoc(id);
  }
  if (cur.status === 'facturado') throw new HttpError(409, 'Este presupuesto ya se facturó');
  const lines = b.lines ? cleanLines(b.lines) : cur.lines;
  const irpf = b.irpf !== undefined ? rate(b.irpf) : cur.irpf;
  const tot = saveTotals({ lines, irpf });
  const cid = b.client_id === undefined ? cur.client_id : (b.client_id ? Number(b.client_id) : null);
  if (cid && !one('SELECT id FROM clients WHERE id=?', cid)) throw bad('Cliente no encontrado');
  run(`UPDATE documents SET client_id=?, issue_date=?, due_date=?, lines=?, irpf=?, notes=?, base=?, iva_total=?, irpf_total=?, total=?, updated_at=? WHERE id=?`,
    cid, b.issue_date ? date(b.issue_date) : cur.issue_date, b.due_date !== undefined ? date(b.due_date, false) : cur.due_date, JSON.stringify(lines), irpf,
    str(b.notes ?? cur.notes, 2000), tot.base, tot.iva_total, tot.irpf_total, tot.total, nowIso(), id);
  return getDoc(id);
}

function issueInvoice(id) {
  return tx(() => {
    const d = getDoc(id);
    if (d.type !== 'factura' || d.status !== 'borrador') throw new HttpError(409, 'Solo se pueden emitir borradores de factura');
    if (!d.client_id) throw bad('Elige un cliente antes de emitir');
    if (!d.lines.length || d.total === 0) throw bad('Añade al menos una línea con importe');
    const client = one('SELECT * FROM clients WHERE id=?', d.client_id);
    const s = settingsObj();
    if (!s.company_name || !s.company_nif) throw bad('Completa los datos de tu empresa en Ajustes (nombre y NIF) antes de emitir');
    if (!client.nif) throw bad('El cliente necesita NIF/CIF para emitir una factura');
    const number = nextNumber('factura', d.issue_date.slice(0, 4));
    run('UPDATE documents SET status=?, number=?, updated_at=? WHERE id=?', 'emitida', number, nowIso(), id);
    log(`Emitida la factura ${number}`, 'document', id);
    return getDoc(id);
  });
}

function rectify(id) {
  return tx(() => {
    const d = getDoc(id);
    if (d.type !== 'factura' || d.status !== 'emitida' || d.corrects_id) throw new HttpError(409, 'Solo se rectifica una factura emitida');
    const lines = d.lines.map((l) => ({ ...l, qty: -l.qty }));
    const tot = saveTotals({ lines, irpf: d.irpf });
    const number = nextNumber('rectificativa', today().slice(0, 4));
    const res = run(`INSERT INTO documents(type,status,number,client_id,issue_date,due_date,lines,irpf,notes,corrects_id,base,iva_total,irpf_total,total,created_at,updated_at)
      VALUES('factura','emitida',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, number, d.client_id, today(), today(), JSON.stringify(lines), d.irpf, `Rectifica la factura ${d.number}`, id,
      tot.base, tot.iva_total, tot.irpf_total, tot.total, nowIso(), nowIso());
    run('UPDATE documents SET status=?, updated_at=? WHERE id=?', 'rectificada', nowIso(), id);
    log(`Factura ${d.number} rectificada con ${number}`, 'document', id);
    return getDoc(Number(res.lastInsertRowid));
  });
}

function convertQuote(id) {
  return tx(() => {
    const q = getDoc(id);
    if (q.type !== 'presupuesto' || !['aceptado', 'enviado', 'borrador'].includes(q.status)) throw new HttpError(409, 'No se puede facturar este presupuesto');
    const inv = createDocument({ type: 'factura', client_id: q.client_id, lines: q.lines, irpf: q.irpf, notes: `Según presupuesto ${q.number}`, source_id: id });
    run('UPDATE documents SET status=?, updated_at=? WHERE id=?', 'facturado', nowIso(), id);
    log(`Presupuesto ${q.number} convertido en factura`, 'document', inv.id);
    return inv;
  });
}

// ---------- copias ----------
function makeBackup(tag = 'auto') {
  const name = `negocio-${new Date().toISOString().replace(/[:.]/g, '-')}-${tag}.db`;
  const file = join(DATA, 'backups', name);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const files = readdirSync(join(DATA, 'backups')).filter((f) => f.endsWith('.db')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - 20))) unlinkSync(join(DATA, 'backups', f));
  return { name, size: statSync(file).size };
}
const listBackups = () => readdirSync(join(DATA, 'backups')).filter((f) => f.endsWith('.db')).sort().reverse().map((f) => ({ name: f, size: statSync(join(DATA, 'backups', f)).size }));
{
  const last = listBackups()[0];
  if (!last || !last.name.includes(today())) { try { makeBackup('auto'); } catch {} }
}

// ---------- estado ----------
function state() {
  const docs = all('SELECT * FROM documents ORDER BY issue_date DESC, id DESC').map(docRow);
  const pays = all('SELECT * FROM payments ORDER BY date DESC, id DESC');
  return {
    settings: settingsObj(),
    clients: all('SELECT * FROM clients ORDER BY name COLLATE NOCASE'),
    items: all('SELECT * FROM items ORDER BY name COLLATE NOCASE'),
    documents: docs, payments: pays,
    expenses: all('SELECT * FROM expenses ORDER BY date DESC, id DESC'),
    tasks: all('SELECT * FROM tasks ORDER BY done, CASE WHEN due=\'\' THEN 1 ELSE 0 END, due'),
    activity: all('SELECT * FROM activity ORDER BY id DESC LIMIT 60'),
    backups: listBackups(), serverDate: today(),
  };
}

// ---------- IA local opcional (Ollama): solo redacta texto, nunca envía ----------
async function aiDraft(b) {
  const s = settingsObj();
  if (!s.ollama_url || !s.ollama_model) throw new HttpError(409, 'Configura un modelo local en Ajustes');
  const url = new URL('/api/generate', s.ollama_url);
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(url.hostname)) throw new HttpError(400, 'Solo se admiten modelos en este equipo');
  const prompt = String(b.prompt || '').slice(0, 4000);
  const r = await fetch(url, { method: 'POST', body: JSON.stringify({ model: s.ollama_model, prompt, stream: false }), signal: AbortSignal.timeout(90000) });
  if (!r.ok) throw new HttpError(502, 'El modelo local no respondió');
  return { text: String((await r.json()).response || '').trim() };
}

// ---------- rutas ----------
const crud = (table, cols, coerce, extra = {}) => ({
  create: (b) => { const v = cols.map((c) => coerce[c](b[c])); const res = run(`INSERT INTO ${table}(${cols.join(',')}${extra.stamp ? ',created_at' : ''}) VALUES(${cols.map(() => '?').join(',')}${extra.stamp ? ',?' : ''})`, ...v, ...(extra.stamp ? [nowIso()] : [])); return one(`SELECT * FROM ${table} WHERE id=?`, Number(res.lastInsertRowid)); },
  update: (id, b) => { const cur = one(`SELECT * FROM ${table} WHERE id=?`, id); if (!cur) throw new HttpError(404, 'No existe'); const v = cols.map((c) => coerce[c](b[c] === undefined ? cur[c] : b[c])); run(`UPDATE ${table} SET ${cols.map((c) => c + '=?').join(',')} WHERE id=?`, ...v, id); return one(`SELECT * FROM ${table} WHERE id=?`, id); },
});
const req = (f) => (v) => { const s = str(v, 300); if (!s) throw bad(`Falta ${f}`); return s; };
const S = (n = 300) => (v) => str(v, n);
const C = {
  clients: crud('clients', ['name', 'nif', 'email', 'phone', 'address', 'city', 'zip', 'notes', 'archived'],
    { name: req('el nombre'), nif: (v) => str(v, 20).toUpperCase(), email: S(200), phone: S(40), address: S(300), city: S(100), zip: S(10), notes: S(3000), archived: (v) => (v ? 1 : 0) }, { stamp: true }),
  items: crud('items', ['name', 'description', 'price', 'iva', 'unit'], { name: req('el nombre'), description: S(500), price: int, iva: (v) => rate(v, 21), unit: S(20) }),
  expenses: crud('expenses', ['date', 'supplier', 'concept', 'category', 'base', 'iva', 'total', 'notes'],
    { date: (v) => date(v), supplier: S(200), concept: req('el concepto'), category: S(40), base: int, iva: (v) => rate(v, 21), total: int, notes: S(1000) }),
  tasks: crud('tasks', ['title', 'due', 'client_id', 'document_id', 'done'],
    { title: req('el título'), due: (v) => date(v, false), client_id: (v) => (v ? Number(v) : null), document_id: (v) => (v ? Number(v) : null), done: (v) => (v ? 1 : 0) }, { stamp: true }),
};
const TABLE_OF = { clients: 'clients', items: 'items', expenses: 'expenses', tasks: 'tasks' };

async function route(req_, url, body) {
  const m = req_.method, p = url.pathname;
  if (m === 'GET' && p === '/api/state') return state();
  let g;
  if ((g = p.match(/^\/api\/(clients|items|expenses|tasks)(?:\/(\d+))?$/))) {
    const [, name, id] = g;
    if (m === 'POST' && !id) { const row = C[name].create(body); log(`Nuevo ${{ clients: 'cliente', items: 'artículo', expenses: 'gasto', tasks: 'tarea' }[name]}: ${row.name || row.concept || row.title}`, name, row.id); return row; }
    if (m === 'PUT' && id) return C[name].update(Number(id), body);
    if (m === 'DELETE' && id) {
      if (name === 'clients' && one('SELECT 1 FROM documents WHERE client_id=?', Number(id))) { run('UPDATE clients SET archived=1 WHERE id=?', Number(id)); return { archived: true }; }
      run(`DELETE FROM ${TABLE_OF[name]} WHERE id=?`, Number(id)); return { ok: true };
    }
  }
  if (m === 'POST' && p === '/api/clients/import') {
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 5000) : [];
    let added = 0, skipped = 0;
    tx(() => { for (const r of rows) {
      const name = str(r.name, 300); if (!name) { skipped++; continue; }
      const nif = str(r.nif, 20).toUpperCase();
      if (nif && one('SELECT 1 FROM clients WHERE nif=?', nif)) { skipped++; continue; }
      run('INSERT INTO clients(name,nif,email,phone,address,city,zip,created_at) VALUES(?,?,?,?,?,?,?,?)', name, nif, str(r.email, 200), str(r.phone, 40), str(r.address, 300), str(r.city, 100), str(r.zip, 10), nowIso()); added++;
    } });
    log(`Importados ${added} clientes`); return { added, skipped };
  }
  if (m === 'POST' && p === '/api/documents') return createDocument(body);
  if ((g = p.match(/^\/api\/documents\/(\d+)$/))) {
    const id = Number(g[1]);
    if (m === 'PUT') return updateDocument(id, body);
    if (m === 'DELETE') { const d = getDoc(id); if (d.status !== 'borrador' && !(d.type === 'presupuesto' && d.status !== 'facturado')) throw new HttpError(409, 'Los documentos emitidos no se borran: usa una factura rectificativa'); run('DELETE FROM documents WHERE id=?', id); log(`Eliminado ${d.number || 'borrador'}`); return { ok: true }; }
  }
  if ((g = p.match(/^\/api\/documents\/(\d+)\/(issue|rectify|convert|status|duplicate)$/)) && m === 'POST') {
    const id = Number(g[1]);
    if (g[2] === 'issue') return issueInvoice(id);
    if (g[2] === 'rectify') return rectify(id);
    if (g[2] === 'convert') return convertQuote(id);
    if (g[2] === 'duplicate') { const d = getDoc(id); return createDocument({ type: d.type, client_id: d.client_id, lines: d.lines, irpf: d.irpf, notes: d.type === 'factura' ? '' : d.notes }); }
    const d = getDoc(id); const st = str(body.status, 20);
    if (d.type !== 'presupuesto' || !['borrador', 'enviado', 'aceptado', 'rechazado'].includes(st) || d.status === 'facturado') throw bad('Estado no válido');
    run('UPDATE documents SET status=?, updated_at=? WHERE id=?', st, nowIso(), id); log(`Presupuesto ${d.number}: ${st}`, 'document', id); return getDoc(id);
  }
  if (m === 'POST' && p === '/api/payments') {
    const d = getDoc(Number(body.document_id));
    if (d.type !== 'factura' || d.status !== 'emitida') throw bad('Solo se registran cobros en facturas emitidas');
    const amount = int(body.amount); if (amount <= 0) throw bad('El importe debe ser positivo');
    const paid = one('SELECT COALESCE(SUM(amount),0) s FROM payments WHERE document_id=?', d.id).s;
    if (amount > d.total - paid) throw bad('El cobro supera el importe pendiente');
    run('INSERT INTO payments(document_id,date,amount,method,note) VALUES(?,?,?,?,?)', d.id, date(body.date ?? today()), amount, str(body.method, 30) || 'transferencia', str(body.note, 200));
    log(`Cobro registrado en ${d.number}`, 'document', d.id); return { ok: true };
  }
  if (m === 'DELETE' && (g = p.match(/^\/api\/payments\/(\d+)$/))) { run('DELETE FROM payments WHERE id=?', Number(g[1])); return { ok: true }; }
  if (m === 'PUT' && p === '/api/settings') {
    for (const k of SETTING_KEYS) if (body[k] !== undefined) {
      let v = body[k];
      if (['default_iva', 'default_irpf', 'payment_days', 'quote_days'].includes(k)) v = rate(v);
      else if (typeof v === 'string') v = k === 'logo' ? (v.length < 400000 && /^data:image\/(png|jpeg|svg\+xml|webp);base64,/.test(v) ? v : '') : str(v, 400);
      run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, JSON.stringify(v));
    }
    return settingsObj();
  }
  if (m === 'POST' && p === '/api/ai/draft') return aiDraft(body);
  if (m === 'POST' && p === '/api/backups') return makeBackup('manual');
  if (m === 'GET' && p === '/api/export') return { exportedAt: nowIso(), ...state() };
  if (m === 'POST' && p === '/api/demo') { const { seedDemo } = await import('./demo.mjs'); return seedDemo({ db, run, one, createDocument, issueInvoice, convertQuote, today, log }); }
  if (m === 'POST' && p === '/api/reset') {
    if (body.confirm !== 'BORRAR') throw bad('Confirmación necesaria');
    makeBackup('antes-de-borrar');
    for (const t of ['payments', 'documents', 'tasks', 'expenses', 'items', 'clients', 'activity', 'settings']) run(`DELETE FROM ${t}`);
    return { ok: true };
  }
  throw new HttpError(404, 'Ruta no encontrada');
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const host = (req.headers.host || '').split(':')[0];
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) { res.writeHead(403).end('Forbidden'); return; }
    const headers = { 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
    if (url.pathname.startsWith('/api/')) {
      if (url.pathname === '/api/export.csv') return csv(url, res, headers);
      if (req.method !== 'GET' && req.headers['x-rem'] !== '1') throw new HttpError(403, 'Petición no autorizada');
      let body = {};
      if (req.method !== 'GET' && req.method !== 'DELETE') { const chunks = []; let n = 0; for await (const c of req) { n += c.length; if (n > 2e6) throw bad('Demasiado grande'); chunks.push(c); } try { body = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { throw bad('JSON no válido'); } }
      const out = await route(req, url, body);
      res.writeHead(200, { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(out));
      return;
    }
    let f = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^(\.\.[/\\])+/, '');
    const file = join(PUBLIC, f);
    if (!file.startsWith(PUBLIC) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404, headers).end('No encontrado'); return; }
    res.writeHead(200, { ...headers, 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(readFileSync(file));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : /UNIQUE/.test(String(e.message)) ? 409 : 500;
    if (status === 500) console.error(e);
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: status === 500 ? 'Error interno' : e.message }));
  }
});

function csv(url, res, headers) {
  const kind = url.searchParams.get('kind');
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""').replace(/^([=+\-@])/, "'$1")}"`;
  const eur = (c) => (c / 100).toFixed(2).replace('.', ',');
  let rows;
  if (kind === 'facturas') rows = [['Número', 'Fecha', 'Cliente', 'NIF', 'Base', 'IVA', 'IRPF', 'Total', 'Estado'], ...all(`SELECT d.*, c.name cn, c.nif cnif FROM documents d LEFT JOIN clients c ON c.id=d.client_id WHERE d.type='factura' AND d.status<>'borrador' ORDER BY d.issue_date`).map((d) => [d.number, d.issue_date, d.cn, d.cnif, eur(d.base), eur(d.iva_total), eur(d.irpf_total), eur(d.total), d.status])];
  else if (kind === 'gastos') rows = [['Fecha', 'Proveedor', 'Concepto', 'Categoría', 'Base', 'IVA %', 'Total'], ...all('SELECT * FROM expenses ORDER BY date').map((e) => [e.date, e.supplier, e.concept, e.category, eur(e.base), e.iva, eur(e.total)])];
  else if (kind === 'clientes') rows = [['Nombre', 'NIF', 'Email', 'Teléfono', 'Dirección', 'Ciudad', 'CP'], ...all('SELECT * FROM clients ORDER BY name').map((c) => [c.name, c.nif, c.email, c.phone, c.address, c.city, c.zip])];
  else throw bad('Tipo no válido');
  res.writeHead(200, { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${kind}-${today()}.csv"` }).end('﻿' + rows.map((r) => r.map(q).join(';')).join('\r\n'));
}

server.listen(PORT, '127.0.0.1', () => console.log(`REM Negocio en http://127.0.0.1:${PORT}/\nDatos: ${DATA}`));
export { server, db };
