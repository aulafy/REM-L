// REM Negocio — servidor local sin dependencias (Node ≥ 22.13, node:sqlite).
import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { join, extname, dirname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { computeTotals, today, addDays, docStatus, advanceDate, isIsoDate } from './public/calc.js';
import { toCsv } from './public/csv.js';
import { createInbox } from './lib/inbox.mjs';
import { createAgents } from './lib/agents.mjs';
import { speak, setLlmHooks } from './lib/ai.mjs';
import { htmlToPdf, warmPdf, pdfAvailable } from './lib/pdf.mjs';
import { createLlmLog } from './lib/llmlog.mjs';
import { createHindsight } from './lib/hindsight.mjs';
import { createScheduler } from './lib/scheduler.mjs';
import { createAttachments } from './lib/attachments.mjs';
import { createModules } from './lib/modules.mjs';
import { createRecurring } from './lib/recurring.mjs';
import { createDocTemplates } from './lib/doctemplates.mjs';
import { buildIcs } from './lib/calendar.mjs';
import { buildXlsx } from './lib/xlsx.mjs';
import { createNotifier } from './lib/notify.mjs';
import { createFiles } from './lib/files.mjs';
import { createImporter } from './lib/importer.mjs';
import { createOffice } from './lib/office.mjs';
import { buildDocx } from './lib/docx.mjs';
import { proposalDeck } from './lib/pptx.mjs';
import { createTime } from './lib/timetrack.mjs';
import { createLock } from './lib/lock.mjs';
import { createAutostart } from './lib/autostart.mjs';
import { createMenubar } from './lib/menubar.mjs';
import { randomBytes } from 'node:crypto';
import { restoreFrom, summarize, isSqlite } from './lib/restore.mjs';
import { migrateSchema, databaseHealth, cleanSoftRefs, fixForeignKeys } from './lib/schema.mjs';
import { pruneBackups } from './lib/backups.mjs';
import { clearAllSecrets } from './lib/secrets.mjs';

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
migrateSchema(db);

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
const date = (v, req = true) => { v = str(v, 10); if (!v && !req) return ''; if (!isIsoDate(v)) throw bad('Fecha no válida'); return v; };

function cleanLines(lines) {
  if (!Array.isArray(lines) || lines.length > 200) throw bad('Líneas no válidas');
  return lines.map((l) => {
    const qty = Number(l.qty ?? 0), price = int(l.price ?? 0);
    if (!Number.isFinite(qty) || Math.abs(qty) > 1e6) throw bad('Cantidad no válida');
    if (Math.abs(price) > 1e10) throw bad('Precio no válido');
    return { desc: str(l.desc, 400), qty, price, iva: rate(l.iva, 21), discount: rate(l.discount, 0) };
  });
}

function settingsObj() { return Object.fromEntries(all('SELECT key,value FROM settings').map((r) => [r.key, JSON.parse(r.value)])); }
// Lo que ve el navegador: sin el hash del PIN ni el token de la barra de menús.
function pubSettings() { const { pin_hash, menubar_token, ...s } = settingsObj(); return { ...s, pin_on: !!pin_hash }; }
function saveSetting(k, v) { run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, JSON.stringify(v)); }
const SETTING_KEYS = ['notify_on', 'notify_messages', 'notify_digest', 'notify_approvals', 'notify_details', 'notify_quiet_from', 'notify_quiet_to', 'notify_digest_time', 'cash_balance', 'cash_balance_date', 'cash_include_overdue', 'cash_include_estimates', 'claude_model', 'checklist_dismissed', 'llm_max_per_hour', 'embed_model', 'whisper_model', 'tts_voice', 'company_name', 'company_nif', 'company_address', 'company_city', 'company_zip', 'company_email', 'company_phone', 'company_iban', 'logo',
  'default_iva', 'default_irpf', 'hourly_rate', 'invoice_series', 'lock_idle_min', 'payment_days', 'quote_days', 'invoice_footer', 'quote_footer', 'ollama_url', 'ollama_model', 'onboarded', 'accent'];

const llmlog = createLlmLog({ db, run, all, one, nowIso, settingsObj, HttpError });
setLlmHooks({ log: llmlog.record, check: llmlog.check });
const agents = createAgents({ db, run, one, all, dataDir: DATA, nowIso, HttpError, settingsObj, saveSetting });
const hindsight = createHindsight({ settingsObj, saveSetting, log: (e) => agents.log(e) });
const modules = createModules({ db, run, one, all, nowIso, str, HttpError, settingsObj, saveSetting, agents });
const recurring = createRecurring({ db, run, one, all, nowIso, str, HttpError, log, today, createDocument, createExpense: (b) => C.expenses.create(b) });
const docTemplates = createDocTemplates({ db, run, one, all, nowIso, str, HttpError, log });
const importer = createImporter({ db, run, one, all, tx, nowIso, log, settingsObj, addDays, makeBackup, HttpError, computeTotals });
const office = createOffice({ HttpError });
const autostart = createAutostart({ script: fileURLToPath(import.meta.url), dataDir: DATA, port: PORT, HttpError });
const menubar = createMenubar({ dataDir: DATA, port: PORT, settingsObj, saveSetting, counts: () => notifier.counts(), HttpError, log: (t) => log(t) });
const lock = createLock({ settingsObj, saveSetting, run, HttpError, log });
const timeTrack = createTime({ db, run, one, all, nowIso, str, HttpError, log, today, createDocument, settingsObj });
const files = createFiles({ db, run, one, all, dataDir: DATA, nowIso, str, HttpError, log });
const notifier = createNotifier({ settingsObj, saveSetting, log: (e) => agents.log(e), count: () => {
  const t = today(), over = all("SELECT * FROM documents WHERE type='factura' AND status='emitida' AND total>0").map(docRow).filter((d) => docStatus(d, one('SELECT COALESCE(SUM(amount),0) s FROM payments WHERE document_id=?', d.id).s, t) === 'vencida');
  const eur = over.reduce((a, d) => a + d.total - one('SELECT COALESCE(SUM(amount),0) s FROM payments WHERE document_id=?', d.id).s, 0);
  return { messages: one("SELECT COUNT(*) n FROM messages WHERE direction='in' AND status IN ('nuevo','listo')").n, overdue: over.length, overdueEur: (eur / 100).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' }), tasks: one("SELECT COUNT(*) n FROM tasks WHERE done=0 AND due<>'' AND due<=?", t).n, approvals: one("SELECT COUNT(*) n FROM approvals WHERE status='pending'").n };
} });
agents.setOnApproval((s) => notifier.approval(s));
const scheduler = createScheduler({ db, run, one, all, nowIso, settingsObj, saveSetting, agents, HttpError, modules, recurring, notifier });
const attachments = createAttachments({ db, run, one, all, dataDir: DATA, nowIso, str, HttpError, settingsObj, agents, createExpense: (b) => C.expenses.create(b) });
const inbox = createInbox({ db, run, one, all, log, tx, HttpError, nowIso, str, settingsObj, saveSetting, agents, dataDir: DATA, hindsight, attachments, modules, notifier });
cleanSoftRefs(db);
// Modo reparación: con relaciones rotas o una base dañada el servidor arranca igual, pero solo deja restaurar una copia sana o reparar (con copia previa).
let repair = null;
const checkHealth = () => { const h = databaseHealth(db); repair = h.ok ? null : { damaged: !(h.quick.length === 1 && h.quick[0] === 'ok'), broken: h.foreignKeys.length, tables: [...new Set(h.foreignKeys.map((f) => f.table))] }; return !repair; };
checkHealth();
const startServices = () => { inbox.start(); scheduler.start(); menubar.start(); };
const REPAIR_OPEN = new Set(['GET /api/lock', 'POST /api/unlock', 'POST /api/lock', 'GET /api/repair', 'POST /api/repair/restore', 'POST /api/repair/fix']);

const icsToken = () => { let t = settingsObj().ics_token; if (!t) { t = randomBytes(16).toString('hex'); saveSetting('ics_token', t); } return t; };
const icsText = () => buildIcs({ tasks: all('SELECT * FROM tasks'), documents: all('SELECT * FROM documents').map(docRow), payments: all('SELECT * FROM payments'), clients: all('SELECT * FROM clients'), recurring: all('SELECT * FROM recurring'), expenses: all('SELECT * FROM expenses WHERE pending=1'), settings: settingsObj(), today: today() });

// Libro de Excel para el asesor: facturas, gastos, clientes e IVA por trimestre.
function xlsxBook(kind) {
  const t = today(), paid = (id) => one('SELECT COALESCE(SUM(amount),0) s FROM payments WHERE document_id=?', id).s, cname = (id) => one('SELECT name, nif FROM clients WHERE id=?', id ?? -1) || {};
  const invoices = all("SELECT * FROM documents WHERE type='factura' AND status<>'borrador' ORDER BY issue_date, number").map(docRow);
  const sheets = {
    facturas: { name: 'Facturas', totals: ['base', 'iva_total', 'irpf_total', 'total', 'paid', 'pending'], columns: [{ header: 'Número', key: 'number', width: 14 }, { header: 'Fecha', key: 'issue_date', type: 'date', width: 12 }, { header: 'Vencimiento', key: 'due_date', type: 'date', width: 13 }, { header: 'Cliente', key: 'client', width: 30 }, { header: 'NIF', key: 'nif', width: 13 }, { header: 'Base', key: 'base', type: 'money' }, { header: 'IVA', key: 'iva_total', type: 'money' }, { header: 'IRPF', key: 'irpf_total', type: 'money' }, { header: 'Total', key: 'total', type: 'money' }, { header: 'Cobrado', key: 'paid', type: 'money' }, { header: 'Pendiente', key: 'pending', type: 'money' }, { header: 'Estado', key: 'status', width: 13 }],
      rows: invoices.map((d) => { const p = d.status === 'rectificada' ? 0 : paid(d.id), c = cname(d.client_id); return { ...d, client: c.name || '', nif: c.nif || '', paid: p, pending: d.status === 'emitida' && d.total > 0 ? Math.max(0, d.total - p) : 0, status: docStatus(d, p, t) }; }) },
    gastos: { name: 'Gastos', totals: ['base', 'iva_amt', 'total'], columns: [{ header: 'Fecha', key: 'date', type: 'date', width: 12 }, { header: 'Proveedor', key: 'supplier', width: 26 }, { header: 'Concepto', key: 'concept', width: 30 }, { header: 'Categoría', key: 'category', width: 20 }, { header: 'Base', key: 'base', type: 'money' }, { header: 'IVA %', key: 'iva', type: 'number', width: 8 }, { header: 'IVA', key: 'iva_amt', type: 'money' }, { header: 'Total', key: 'total', type: 'money' }, { header: 'Estado', key: 'estado', width: 11 }, { header: 'Vencimiento', key: 'due', type: 'date', width: 13 }, { header: 'Pagado el', key: 'paid_date', type: 'date', width: 12 }],
      rows: all('SELECT * FROM expenses ORDER BY date').map((e) => ({ ...e, iva_amt: e.total - e.base, estado: e.pending ? 'pendiente' : 'pagado', due: e.due || null, paid_date: e.paid_date || null })) },
    clientes: { name: 'Clientes', totals: ['billed', 'pending'], columns: [{ header: 'Nombre', key: 'name', width: 30 }, { header: 'NIF', key: 'nif', width: 13 }, { header: 'Email', key: 'email', width: 28 }, { header: 'Teléfono', key: 'phone', width: 14 }, { header: 'Dirección', key: 'address', width: 28 }, { header: 'CP', key: 'zip', width: 8 }, { header: 'Población', key: 'city', width: 16 }, { header: 'Facturado', key: 'billed', type: 'money' }, { header: 'Pendiente', key: 'pending', type: 'money' }],
      rows: all('SELECT * FROM clients WHERE archived=0 ORDER BY name COLLATE NOCASE').map((c) => { const mine = invoices.filter((d) => d.client_id === c.id); return { ...c, billed: mine.reduce((a, d) => a + d.total, 0), pending: mine.filter((d) => d.status === 'emitida' && d.total > 0).reduce((a, d) => a + Math.max(0, d.total - paid(d.id)), 0) }; }) },
  };
  // IVA por trimestre: repercutido (facturas emitidas) menos soportado (gastos).
  const q = new Map(); const slot = (date) => { const k = `${date.slice(0, 4)}-T${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`; if (!q.has(k)) q.set(k, { period: k, ingresos: 0, iva_rep: 0, gastos: 0, iva_sop: 0 }); return q.get(k); };
  for (const d of invoices) { const r = slot(d.issue_date); r.ingresos += d.base; r.iva_rep += d.iva_total; } for (const e of sheets.gastos.rows) { const r = slot(e.date); r.gastos += e.base; r.iva_sop += e.iva_amt; }
  sheets.iva = { name: 'IVA trimestral', totals: ['ingresos', 'iva_rep', 'gastos', 'iva_sop', 'resultado'], columns: [{ header: 'Periodo', key: 'period', width: 12 }, { header: 'Ingresos (base)', key: 'ingresos', type: 'money', width: 18 }, { header: 'IVA repercutido', key: 'iva_rep', type: 'money', width: 18 }, { header: 'Gastos (base)', key: 'gastos', type: 'money', width: 16 }, { header: 'IVA soportado', key: 'iva_sop', type: 'money', width: 16 }, { header: 'IVA a liquidar', key: 'resultado', type: 'money', width: 16 }],
    rows: [...q.values()].sort((a, b) => a.period.localeCompare(b.period)).map((r) => ({ ...r, resultado: r.iva_rep - r.iva_sop })) };
  const pick = kind === 'todo' ? ['facturas', 'gastos', 'clientes', 'iva'] : [kind]; if (pick.some((k) => !sheets[k])) throw bad('Tipo no válido');
  return buildXlsx(pick.map((k) => sheets[k]));
}

// Series de facturación: cada serie tiene su prefijo y su contador anual (F2026-0001, FA2026-0001…). La primera es la predeterminada.
const SERIES_DEFAULT = [{ prefix: 'F', name: 'General' }];
const seriesList = () => { const l = settingsObj().invoice_series; return Array.isArray(l) && l.length ? l : SERIES_DEFAULT; };
const pickSeries = (v) => (seriesList().some((s) => s.prefix === v) ? v : seriesList()[0].prefix);
function cleanSeries(v) {
  if (!Array.isArray(v) || !v.length || v.length > 10) throw bad('Define entre 1 y 10 series');
  const seen = new Set(); return v.map((s) => { const prefix = String(s?.prefix ?? '').trim().toUpperCase(), name = str(s?.name, 40) || prefix;
    if (!/^[A-Z]{1,4}$/.test(prefix)) throw bad('El prefijo son de 1 a 4 letras (sin números)'); if (['P', 'R'].includes(prefix)) throw bad(`El prefijo ${prefix} está reservado (presupuestos y rectificativas)`); if (seen.has(prefix)) throw bad(`El prefijo ${prefix} está repetido`); seen.add(prefix); return { prefix, name }; });
}
function nextNumber(type, year, series = 'F') {
  const prefix = type === 'presupuesto' ? 'P' : type === 'albaran' ? 'A' : type === 'rectificativa' ? 'R' : series || 'F';
  const t = type === 'rectificativa' ? 'factura' : type;
  const rows = all(`SELECT number FROM documents WHERE type=? AND number LIKE ?`, t, `${prefix}${year}-%`);
  const max = rows.reduce((m, r) => Math.max(m, Number(r.number.split('-')[1]) || 0), 0);
  return `${prefix}${year}-${String(max + 1).padStart(4, '0')}`;
}

function saveTotals(d) {
  const t = computeTotals(d.lines, d.irpf);
  if (![t.base, t.ivaTotal, t.irpfTotal, t.total].every(Number.isSafeInteger)) throw bad('Los importes son demasiado grandes');
  return { base: t.base, iva_total: t.ivaTotal, irpf_total: t.irpfTotal, total: t.total };
}
function docRow(r) { return { ...r, lines: JSON.parse(r.lines) }; }
function getDoc(id) { const r = one('SELECT * FROM documents WHERE id=?', id); if (!r) throw new HttpError(404, 'No existe'); return docRow(r); }

function createDocument(b) {
  const type = ['presupuesto', 'albaran'].includes(b.type) ? b.type : 'factura';
  const s = settingsObj();
  const issue = date(b.issue_date ?? today());
  const lines = cleanLines(b.lines ?? []);
  const irpf = rate(b.irpf, s.default_irpf ?? 0);
  const d = { lines, irpf };
  const tot = saveTotals(d);
  const due = type === 'albaran' ? '' : b.due_date !== undefined ? date(b.due_date, false) : addDays(issue, type === 'presupuesto' ? (s.quote_days ?? 30) : (s.payment_days ?? 30));
  const number = type === 'presupuesto' || type === 'albaran' ? nextNumber(type, issue.slice(0, 4)) : '';
  const cid = b.client_id ? Number(b.client_id) : null;
  if (cid && !one('SELECT id FROM clients WHERE id=?', cid)) throw bad('Cliente no encontrado');
  const res = run(`INSERT INTO documents(type,status,number,client_id,issue_date,due_date,lines,irpf,notes,source_id,base,iva_total,irpf_total,total,created_at,updated_at,series)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, type, type === 'albaran' ? 'pendiente' : 'borrador', number, cid, issue, due, JSON.stringify(lines), irpf, str(b.notes, 2000), b.source_id ?? null,
    tot.base, tot.iva_total, tot.irpf_total, tot.total, nowIso(), nowIso(), type === 'factura' ? pickSeries(b.series) : '');
  const id = Number(res.lastInsertRowid);
  log(`Creado ${type === 'presupuesto' ? 'presupuesto ' + number : type === 'albaran' ? 'albarán ' + number : 'borrador de factura'}`, 'document', id);
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
  if (cur.status === 'facturado') throw new HttpError(409, 'Este documento ya se facturó');
  const lines = b.lines ? cleanLines(b.lines) : cur.lines;
  const irpf = b.irpf !== undefined ? rate(b.irpf) : cur.irpf;
  const tot = saveTotals({ lines, irpf });
  const cid = b.client_id === undefined ? cur.client_id : (b.client_id ? Number(b.client_id) : null);
  if (cid && !one('SELECT id FROM clients WHERE id=?', cid)) throw bad('Cliente no encontrado');
  if (cur.type === 'factura' && b.series !== undefined) run('UPDATE documents SET series=? WHERE id=?', pickSeries(b.series), id);
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
    if (!d.lines.length || !Number.isSafeInteger(d.total) || d.total === 0) throw bad('Añade al menos una línea con importe');
    if (d.total < 0) throw bad('El total no puede ser negativo: para corregir una factura usa una rectificativa');
    const client = one('SELECT * FROM clients WHERE id=?', d.client_id);
    const s = settingsObj();
    if (!s.company_name || !s.company_nif) throw bad('Completa los datos de tu empresa en Ajustes (nombre y NIF) antes de emitir');
    if (!client.nif) throw bad('El cliente necesita NIF/CIF para emitir una factura');
    const prefix = d.series || 'F', year = d.issue_date.slice(0, 4), last = one("SELECT MAX(issue_date) m FROM documents WHERE type='factura' AND status<>'borrador' AND number LIKE ?", `${prefix}${year}-%`).m;
    if (last && d.issue_date < last) throw new HttpError(409, `La serie ${prefix} ya tiene facturas emitidas el ${last.split('-').reverse().join('/')}: la fecha de esta no puede ser anterior (así los números siguen el orden de las fechas). Cámbiala.`);
    const number = nextNumber('factura', year, prefix);
    run('UPDATE documents SET status=?, number=?, updated_at=? WHERE id=?', 'emitida', number, nowIso(), id);
    log(`Emitida la factura ${number}`, 'document', id);
    return getDoc(id);
  });
}

// Albaranes → UNA factura (borrador) del mismo cliente: cada albarán aporta una línea de cabecera y sus conceptos.
function invoiceFromNotes(b) {
  return tx(() => {
    const ids = [...new Set((Array.isArray(b.ids) ? b.ids : []).map(Number))]; if (!ids.length || ids.length > 100) throw bad('Elige al menos un albarán');
    const notes = ids.map((id) => getDoc(id)); if (notes.some((n) => n.type !== 'albaran')) throw bad('Solo se facturan albaranes');
    if (notes.some((n) => n.status !== 'pendiente')) throw new HttpError(409, 'Alguno de los albaranes ya está facturado');
    if (new Set(notes.map((n) => n.client_id)).size !== 1 || !notes[0].client_id) throw bad('Los albaranes deben ser del mismo cliente');
    notes.sort((a, b) => a.issue_date.localeCompare(b.issue_date) || a.number.localeCompare(b.number));
    const lines = notes.flatMap((n) => [{ desc: `Albarán ${n.number} · ${n.issue_date.split('-').reverse().join('/')}`, qty: 0, price: 0, iva: Number(settingsObj().default_iva ?? 21), discount: 0 }, ...n.lines]);
    const inv = createDocument({ type: 'factura', client_id: notes[0].client_id, lines, notes: notes.some((n) => n.notes) ? notes.filter((n) => n.notes).map((n) => `${n.number}: ${n.notes}`).join('\n') : '' });
    for (const n of notes) run("UPDATE documents SET status='facturado', source_id=?, updated_at=? WHERE id=?", inv.id, nowIso(), n.id);
    log(`${notes.length === 1 ? 'Albarán ' + notes[0].number : notes.length + ' albaranes'} pasado(s) a factura`, 'document', inv.id); return inv;
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
  pruneBackups(join(DATA, 'backups'));
  return { name, size: statSync(file).size };
}
const listBackups = () => readdirSync(join(DATA, 'backups')).filter((f) => f.endsWith('.db')).sort().reverse().map((f) => ({ name: f, size: statSync(join(DATA, 'backups', f)).size }));
if (!repair) {
  const last = listBackups()[0];
  if (!last || !last.name.includes(today())) { try { makeBackup('auto'); } catch {} }
}

// ---------- modo reparación ----------
const backupPath = (n) => { if (!/^negocio-[\w.:-]+\.db$/.test(String(n || '')) || !existsSync(join(DATA, 'backups', n))) throw new HttpError(404, 'Esa copia no existe'); return join(DATA, 'backups', n); };
function leaveRepair(text) { log(text); if (checkHealth()) { startServices(); console.log('REM Negocio: datos reparados; servicios en marcha.'); } return { ok: !repair, repair }; }
function repairRoute(m, p, body) {
  if (m === 'GET' && p === '/api/repair') return { repair: !!repair, ...(repair || {}), backups: listBackups().slice(0, 40).map((b) => ({ ...b, summary: summarize(join(DATA, 'backups', b.name)) })).filter((b) => b.summary) };
  if (m !== 'POST' || !['/api/repair/restore', '/api/repair/fix'].includes(p)) return;
  if (!repair) throw new HttpError(409, 'Tus datos no necesitan reparación');
  if (p === '/api/repair/restore') {
    const file = backupPath(body.name); if (!summarize(file)) throw new HttpError(409, 'Esa copia también está dañada; elige otra');
    const safety = makeBackup('antes-de-reparar'), keepPin = one('SELECT value FROM settings WHERE key=?', 'pin_hash');
    try { restoreFrom(db, file); if (keepPin) saveSetting('pin_hash', JSON.parse(keepPin.value)); } catch (e) { throw new HttpError(500, 'No se pudo restaurar; nada ha cambiado: ' + e.message); }
    return { ...leaveRepair(`Modo reparación: restaurada la copia ${body.name}`), safety: safety.name };
  }
  if (repair.damaged) throw new HttpError(409, 'La base de datos está dañada y no se puede reparar aquí: restaura una copia');
  const safety = makeBackup('antes-de-reparar'); let out;
  try { out = fixForeignKeys(db); } catch (e) { throw new HttpError(500, 'No se pudo reparar; nada ha cambiado: ' + e.message); }
  return { ...leaveRepair(`Modo reparación: ${out.fixed} referencia(s) rota(s) corregida(s)`), ...out, safety: safety.name };
}

// ---------- estado ----------
function state() {
  const docs = all('SELECT * FROM documents ORDER BY issue_date DESC, id DESC').map(docRow);
  const pays = all('SELECT * FROM payments ORDER BY date DESC, id DESC');
  return {
    settings: pubSettings(), startup: { autostart: autostart.status(), menubar: menubar.status() },
    clients: all('SELECT * FROM clients ORDER BY name COLLATE NOCASE'),
    items: all('SELECT * FROM items ORDER BY name COLLATE NOCASE'),
    documents: docs, payments: pays,
    expenses: all('SELECT * FROM expenses ORDER BY date DESC, id DESC'),
    tasks: all('SELECT * FROM tasks ORDER BY done, CASE WHEN due=\'\' THEN 1 ELSE 0 END, due'),
    activity: all('SELECT * FROM activity ORDER BY id DESC LIMIT 60'),
    backups: listBackups(), serverDate: today(), ...inbox.state(), ...agents.state(), ...llmlog.state(), ...hindsight.state(), ...scheduler.state(), ...attachments.state(), ...modules.state(), ...recurring.state(), ...docTemplates.state(), ...files.state(), ...timeTrack.state(),
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
// NIF sin espacios, puntos ni guiones: «b-12.345.678» y «B12345678» son el mismo cliente.
const normNif = (v) => str(v, 20).toUpperCase().replace(/[\s.-]/g, '');
const NIF_SQL = "replace(replace(replace(upper(nif),' ',''),'.',''),'-','')";
const nifOwner = (nif, exceptId = 0) => (nif ? one(`SELECT id, name, archived FROM clients WHERE ${NIF_SQL}=? AND id<>? LIMIT 1`, nif, exceptId) : null);
function assertNifFree(b, id = 0) {
  if (b.nif === undefined) return; const nif = normNif(b.nif), cur = id ? one('SELECT nif FROM clients WHERE id=?', id) : null;
  if (cur && normNif(cur.nif) === nif) return; // sin cambios: no bloquea guardar fichas que ya estaban repetidas en bases antiguas
  const o = nifOwner(nif, id);
  if (o) throw new HttpError(409, `Ya existe un cliente con ese NIF: ${o.name}${o.archived ? ' (archivado)' : ''}`);
}
const S = (n = 300) => (v) => str(v, n);
const C = {
  clients: crud('clients', ['name', 'nif', 'email', 'phone', 'address', 'city', 'zip', 'notes', 'archived'],
    { name: req('el nombre'), nif: (v) => normNif(v), email: S(200), phone: S(40), address: S(300), city: S(100), zip: S(10), notes: S(3000), archived: (v) => (v ? 1 : 0) }, { stamp: true }),
  items: crud('items', ['name', 'description', 'price', 'iva', 'unit'], { name: req('el nombre'), description: S(500), price: int, iva: (v) => rate(v, 21), unit: S(20) }),
  expenses: crud('expenses', ['date', 'supplier', 'concept', 'category', 'base', 'iva', 'total', 'notes', 'pending', 'due', 'paid_date', 'supplier_nif'],
    { date: (v) => date(v), supplier: S(200), concept: req('el concepto'), category: S(40), base: int, iva: (v) => rate(v, 21), total: int, notes: S(1000), pending: (v) => (v ? 1 : 0), due: (v) => date(v, false), paid_date: (v) => date(v, false), supplier_nif: (v) => str(v, 20).toUpperCase().replace(/[\s.-]/g, '') }),
  tasks: crud('tasks', ['title', 'due', 'client_id', 'document_id', 'done', 'priority', 'repeat', 'parent_id'],
    { title: req('el título'), due: (v) => date(v, false), client_id: (v) => (v ? Number(v) : null), document_id: (v) => (v ? Number(v) : null), done: (v) => (v ? 1 : 0), priority: (v) => (v === undefined || v === null || v === '' ? 1 : [0, 1, 2].includes(Number(v)) ? Number(v) : (() => { throw bad('Prioridad no válida'); })()), repeat: (v) => { v = String(v ?? ''); if (v && !REPEATS.includes(v)) throw bad('Repetición no válida'); return v; }, parent_id: (v) => (v ? Number(v) : null) }, { stamp: true }),
};
// Pendiente de pago → necesita vencimiento (por defecto, 30 días tras la fecha del gasto); al pagarlo se guarda cuándo.
function expenseBody(b, cur) {
  const o = { ...b }, pending = o.pending === undefined ? !!cur?.pending : !!o.pending;
  if (pending) { o.pending = 1; o.paid_date = ''; o.due = o.due ? o.due : cur?.due || addDays(o.date || cur?.date || today(), 30); }
  else { o.pending = 0; if (cur?.pending && !o.paid_date) o.paid_date = today(); if (o.due === undefined) o.due = cur?.due || ''; }
  return o;
}
// Tareas: prioridad (0 baja, 1 normal, 2 alta), repetición y subtareas (un solo nivel).
const REPEATS = ['day', 'week', 'month', 'quarter', 'year'];
function taskBody(b, cur) {
  const o = { ...b }, parent = o.parent_id === undefined ? cur?.parent_id : o.parent_id, repeat = o.repeat === undefined ? cur?.repeat || '' : o.repeat, due = o.due === undefined ? cur?.due || '' : o.due;
  for (const [k, t, msg] of [['document_id', 'documents', 'El documento de la tarea no existe'], ['client_id', 'clients', 'El cliente de la tarea no existe']]) if (o[k] && !one(`SELECT 1 FROM ${t} WHERE id=?`, Number(o[k]))) throw bad(msg);
  if (parent) {
    const p = one('SELECT id, parent_id FROM tasks WHERE id=?', Number(parent)); if (!p) throw bad('La tarea principal no existe'); if (p.parent_id) throw bad('Una subtarea no puede tener subtareas'); if (cur && p.id === cur.id) throw bad('Una tarea no puede ser subtarea de sí misma');
    if (cur && one('SELECT 1 FROM tasks WHERE parent_id=?', cur.id)) throw bad('Esta tarea tiene subtareas: no puede ser subtarea');
    o.repeat = '';
  } else if (repeat && !due) throw bad('Pon una fecha para que la tarea se repita');
  return o;
}
// Al completar una tarea que se repite nace la siguiente (desde su fecha, y siempre en el futuro), con sus subtareas sin hacer.
function spawnNext(t) {
  const anchor = Number((t.due || today()).slice(8, 10)), step = (d) => (t.repeat === 'day' ? addDays(d, 1) : t.repeat === 'week' ? addDays(d, 7) : advanceDate(d, t.repeat, anchor));
  let d = t.due || today(), n = 0; do { d = step(d); n++; } while (d <= today() && n < 400);
  const nid = Number(run('INSERT INTO tasks(title,due,client_id,document_id,done,priority,repeat,parent_id,created_at) VALUES(?,?,?,?,0,?,?,NULL,?)', t.title, d, t.client_id, t.document_id, t.priority, t.repeat, nowIso()).lastInsertRowid);
  for (const s of all('SELECT * FROM tasks WHERE parent_id=? ORDER BY id', t.id)) run("INSERT INTO tasks(title,due,client_id,document_id,done,priority,repeat,parent_id,created_at) VALUES(?,?,?,?,0,?,'',?,?)", s.title, s.due ? d : '', s.client_id, s.document_id, s.priority, nid, nowIso());
  log(`Tarea repetida: «${t.title}» → ${d}`, 'tasks', nid); return nid;
}
// Un cliente con documentos o facturas recurrentes se archiva (y sus recurrentes se pausan); si no, se borra con sus archivos y campos extra.
function deleteClient(id) {
  if (!one('SELECT 1 FROM clients WHERE id=?', id)) throw new HttpError(404, 'No existe');
  return tx(() => {
    if (one('SELECT 1 FROM documents WHERE client_id=?', id) || one('SELECT 1 FROM recurring WHERE client_id=?', id)) {
      const paused = Number(run('UPDATE recurring SET active=0 WHERE client_id=? AND active=1', id).changes);
      run('UPDATE clients SET archived=1 WHERE id=?', id); log(`Cliente archivado${paused ? ` (${paused} recurrente(s) en pausa)` : ''}`, 'clients', id); return { archived: true, paused };
    }
    files.removeFor('client', id); run("DELETE FROM ext_values WHERE entity='clients' AND entity_id=?", id); run('DELETE FROM clients WHERE id=?', id); return { ok: true };
  });
}
const TABLE_OF = { clients: 'clients', items: 'items', expenses: 'expenses', tasks: 'tasks' };

async function route(req_, url, body) {
  const m = req_.method, p = url.pathname;
  { const r = repairRoute(m, p, body); if (r !== undefined) return r; }
  if (m === 'GET' && p === '/api/state') return { ...state(), pdf: pdfAvailable(DATA), icsToken: icsToken() };
  if (m === 'POST' && p === '/api/hindsight') {
    if (body.disconnect) { hindsight.disconnect(); return hindsight.state().hindsight; }
    try { await hindsight.connect(str(body.url, 200) || 'http://127.0.0.1:8888'); } catch (e) { throw new HttpError(400, 'No se pudo conectar con Hindsight: ' + e.message); }
    return hindsight.state().hindsight;
  }
  { const r = await scheduler.route(m, p, body); if (r !== undefined) return r; }
  { const r = await attachments.route(m, p, body); if (r !== undefined) return r; }
  { const r = await modules.route(m, p, body); if (r !== undefined) return r; }
  { const r = await recurring.route(m, p, body); if (r !== undefined) return r; }
  { const r = await docTemplates.route(m, p, body); if (r !== undefined) return r; }
  { const r = await files.route(m, p, body); if (r !== undefined) return r; }
  { const r = await importer.route(m, p, body); if (r !== undefined) return r; }
  { const r = await office.route(m, p, body); if (r !== undefined) return r; }
  { const r = await timeTrack.route(m, p, body); if (r !== undefined) return r; }
  { const r = await autostart.route(m, p, body); if (r !== undefined) return r; }
  { const r = await menubar.route(m, p, body); if (r !== undefined) return r; }
  { const r = (await agents.route(m, p, body)) ?? (await inbox.route(m, p, body)); if (r !== undefined) return r; }
  let g;
  if ((g = p.match(/^\/api\/(clients|items|expenses|tasks)(?:\/(\d+))?$/))) {
    const [, name, id] = g;
    if (name === 'tasks' && (m === 'POST' || m === 'PUT')) body = taskBody(body, id ? one('SELECT * FROM tasks WHERE id=?', Number(id)) : null);
    if (name === 'clients' && (m === 'POST' || m === 'PUT')) assertNifFree(body, Number(id || 0));
    if (name === 'expenses' && (m === 'POST' || m === 'PUT')) body = expenseBody(body, id ? one('SELECT * FROM expenses WHERE id=?', Number(id)) : null);
    if (m === 'POST' && !id) { const row = C[name].create(body); log(`Nuevo ${{ clients: 'cliente', items: 'artículo', expenses: 'gasto', tasks: 'tarea' }[name]}: ${row.name || row.concept || row.title}`, name, row.id); return row; }
    if (m === 'PUT' && id) { const before = name === 'tasks' ? one('SELECT * FROM tasks WHERE id=?', Number(id)) : null, row = C[name].update(Number(id), body); if (before && !before.done && row.done && row.repeat && !row.parent_id) row.next_id = spawnNext(row); return row; }
    if (m === 'DELETE' && id) {
      if (name === 'clients') return deleteClient(Number(id));
      run(`DELETE FROM ${TABLE_OF[name]} WHERE id=?`, Number(id)); return { ok: true };
    }
  }
  if (m === 'POST' && p === '/api/clients/import') {
    const rows = Array.isArray(body.rows) ? body.rows.slice(0, 5000) : [];
    let added = 0, skipped = 0;
    tx(() => { for (const r of rows) {
      const name = str(r.name, 300); if (!name) { skipped++; continue; }
      const nif = normNif(r.nif);
      if (nifOwner(nif)) { skipped++; continue; }
      run('INSERT INTO clients(name,nif,email,phone,address,city,zip,created_at) VALUES(?,?,?,?,?,?,?,?)', name, nif, str(r.email, 200), str(r.phone, 40), str(r.address, 300), str(r.city, 100), str(r.zip, 10), nowIso()); added++;
    } });
    log(`Importados ${added} clientes`); return { added, skipped };
  }
  if (m === 'POST' && p === '/api/documents') return createDocument(body);
  if (m === 'POST' && p === '/api/delivery-notes/invoice') return invoiceFromNotes(body);
  if ((g = p.match(/^\/api\/documents\/(\d+)$/))) {
    const id = Number(g[1]);
    if (m === 'PUT') return updateDocument(id, body);
    if (m === 'DELETE') { const d = getDoc(id); if (d.status !== 'borrador' && !(['presupuesto', 'albaran'].includes(d.type) && d.status !== 'facturado')) throw new HttpError(409, 'Los documentos emitidos no se borran: usa una factura rectificativa'); files.removeFor('document', id); timeTrack.release(id); run('UPDATE tasks SET document_id=NULL WHERE document_id=?', id); run("DELETE FROM ext_values WHERE entity='documents' AND entity_id=?", id); run("UPDATE documents SET status='pendiente', source_id=NULL WHERE type='albaran' AND source_id=?", id); run('DELETE FROM documents WHERE id=?', id); log(`Eliminado ${d.number || 'borrador'}`); return { ok: true }; }
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
      else if (k === 'lock_idle_min') v = Math.min(240, Math.max(0, Math.round(Number(v)) || 0));
      else if (k === 'invoice_series') v = cleanSeries(v);
      else if (k === 'hourly_rate') v = Math.max(0, Math.round(Number(v) || 0));
      else if (['notify_on', 'notify_messages', 'notify_digest', 'notify_approvals', 'notify_details'].includes(k)) v = !!v;
      else if (['notify_quiet_from', 'notify_quiet_to', 'notify_digest_time'].includes(k)) { v = String(v || ''); if (v && !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw bad('Hora no válida'); }
      else if (k === 'checklist_dismissed' || k === 'cash_include_overdue' || k === 'cash_include_estimates') v = !!v;
      else if (k === 'cash_balance') { if (v === '' || v === null) { run('DELETE FROM settings WHERE key IN (?,?)', 'cash_balance', 'cash_balance_date'); continue; } v = Math.round(Number(v)); if (!Number.isFinite(v) || Math.abs(v) > 1e11) throw bad('Saldo no válido'); }
      else if (k === 'cash_balance_date') v = date(v, false);
      else if (k === 'llm_max_per_hour') v = Math.min(1000, Math.max(1, Math.round(Number(v)) || 60));
      else if (typeof v === 'string') v = k === 'logo' ? (v.length < 400000 && /^data:image\/(png|jpeg|svg\+xml|webp);base64,/.test(v) ? v : '') : str(v, 400);
      run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', k, JSON.stringify(v));
    }
    return pubSettings();
  }
  if (m === 'POST' && p === '/api/ai/draft') return aiDraft(body);
  if (m === 'POST' && p === '/api/notify/test') return { ok: await notifier.test() };
  if (m === 'POST' && p === '/api/calendar/rotate') { saveSetting('ics_token', randomBytes(16).toString('hex')); return { token: icsToken() }; }
  if (m === 'POST' && p === '/api/backups') return makeBackup('manual');
  { let g;
    if ((g = p.match(/^\/api\/backups\/([^/]+)\/summary$/)) && m === 'GET') { const s = summarize(backupPath(decodeURIComponent(g[1]))); if (!s) throw new HttpError(409, 'La copia está dañada'); return s; }
    if (m === 'POST' && p === '/api/backups/restore') {
      const file = backupPath(body.name); if (!summarize(file)) throw new HttpError(409, 'La copia está dañada');
      const safety = makeBackup('antes-de-restaurar'); const keepPin = one('SELECT value FROM settings WHERE key=?', 'pin_hash'); try { restoreFrom(db, file); if (keepPin) saveSetting('pin_hash', JSON.parse(keepPin.value)); } catch (e) { throw new HttpError(500, 'No se pudo restaurar; tus datos siguen intactos: ' + e.message); }
      log(`Copia restaurada: ${body.name}`); return { ok: true, safety: safety.name, summary: summarize(file) };
    }
    if (m === 'POST' && p === '/api/backups/import') {
      const buf = Buffer.from(String(body.data || ''), 'base64'); if (buf.length < 100 || buf.subarray(0, 16).toString('latin1') !== 'SQLite format 3\0') throw new HttpError(400, 'Ese archivo no es una copia de REM Negocio');
      const name = `negocio-${new Date().toISOString().replace(/[:.]/g, '-')}-importada.db`, file = join(DATA, 'backups', name); writeFileSync(file, buf);
      const s = summarize(file); if (!s) { unlinkSync(file); throw new HttpError(400, 'Ese archivo no contiene una base íntegra y compatible de REM Negocio'); } pruneBackups(join(DATA, 'backups')); return { name, summary: s };
    }
  }
  if (m === 'GET' && p === '/api/export') return { exportedAt: nowIso(), ...state() };
  if (m === 'POST' && p === '/api/demo') { const { seedDemo } = await import('./demo.mjs'); return seedDemo({ db, run, one, createDocument, issueInvoice, convertQuote, today, log }); }
  if (m === 'POST' && p === '/api/reset') {
    if (body.confirm !== 'BORRAR') throw bad('Confirmación necesaria');
    makeBackup('antes-de-borrar');
    inbox.stop();
    files.purgeAll(); attachments.purgeAll(); clearAllSecrets();
    for (const name of ['negocio.md', 'policy.json', 'activity.jsonl', 'rem.log']) rmSync(join(DATA, name), { force: true });
    for (const t of ['time_entries', 'files', 'recurring_expenses', 'doc_templates', 'recurring', 'ext_values', 'modules', 'attachments', 'briefings', 'llm_calls', 'briefings', 'memory', 'approvals', 'messages', 'chunks', 'knowledge', 'payments', 'documents', 'tasks', 'expenses', 'items', 'clients', 'activity', 'settings']) run(`DELETE FROM ${t}`);
    return { ok: true };
  }
  throw new HttpError(404, 'Ruta no encontrada');
}

// ---------- HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };
async function readJson(req, limit = 16e6) {
  const chunks = []; let n = 0;
  for await (const c of req) { n += c.length; if (n > limit) throw bad('Demasiado grande'); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { throw bad('JSON no válido'); }
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const host = (req.headers.host || '').split(':')[0];
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(host)) { res.writeHead(403).end('Forbidden'); return; }
    const headers = { 'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
    if (url.pathname.startsWith('/api/')) {
      if (!lock.allowed(req, url)) throw new HttpError(401, 'locked');
      if (repair && !REPAIR_OPEN.has(`${req.method} ${url.pathname}`)) throw new HttpError(503, 'repair');
      if (url.pathname === '/api/menubar' && req.method === 'GET') { const out = menubar.handle(url); res.writeHead(200, { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(out)); return; }
      if (url.pathname === '/api/export.csv') return csv(url, res, headers);
      if (url.pathname === '/api/export.xlsx') { const kind = url.searchParams.get('kind') || 'todo'; const book = xlsxBook(kind); res.writeHead(200, { ...headers, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': `attachment; filename="rem-negocio-${kind}-${today()}.xlsx"`, 'Cache-Control': 'no-store' }).end(book); return; }
      if (req.method === 'GET' && /^\/api\/attachments\/\d+\/file$/.test(url.pathname)) {
        const f = attachments.fileOf(Number(url.pathname.split('/')[3])); if (!f) throw new HttpError(404, 'No existe');
        res.writeHead(200, { ...headers, 'Content-Security-Policy': "frame-ancestors 'self'", 'Content-Type': f.mime, 'Content-Disposition': 'inline', 'Cache-Control': 'private, max-age=3600' }).end(readFileSync(f.path)); return;
      }
      if (req.method === 'GET' && /^\/api\/backups\/[^/]+\/file$/.test(url.pathname)) {
        const n = decodeURIComponent(url.pathname.split('/')[3]); if (!/^negocio-[\w.:-]+\.db$/.test(n) || !existsSync(join(DATA, 'backups', n))) throw new HttpError(404, 'No existe');
        res.writeHead(200, { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${n}"`, 'Cache-Control': 'no-store' }).end(readFileSync(join(DATA, 'backups', n))); return;
      }
      if (url.pathname === '/api/calendar.ics' && req.method === 'GET') {
        if (url.searchParams.get('t') !== icsToken()) throw new HttpError(403, 'Enlace no válido');
        res.writeHead(200, { ...headers, 'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="rem-negocio.ics"', 'Cache-Control': 'no-store' }).end(icsText()); return;
      }
      if (url.pathname === '/api/files' && req.method === 'PUT') {
        if (req.headers['x-rem'] !== '1') throw new HttpError(403, 'Petición no autorizada');
        const limit = Number(process.env.REM_MAX_FILE || 25 * 1024 * 1024); const chunks = []; let n = 0;
        for await (const c of req) { n += c.length; if (n <= limit + 1024) chunks.push(c); else if (n > 200 * 1048576) { req.destroy?.(); break; } } // se descarta el exceso sin guardarlo
        if (n > limit + 1024) throw new HttpError(413, `El archivo supera ${Math.round(limit / 1048576)} MB`);
        const f = files.save({ owner_type: url.searchParams.get('owner_type'), owner_id: Number(url.searchParams.get('owner_id')), name: url.searchParams.get('name'), buffer: Buffer.concat(chunks) });
        res.writeHead(200, { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(f)); return;
      }
      if (req.method === 'GET' && /^\/api\/files\/\d+\/(download|view)$/.test(url.pathname)) {
        const [, , , id, how] = url.pathname.split('/'), f = files.fileOf(Number(id)); if (!f) throw new HttpError(404, 'No existe'); const inline = how === 'view' && f.inline;
        res.writeHead(200, { ...headers, 'Content-Security-Policy': f.kind === 'pdf' ? "frame-ancestors 'self'" : "frame-ancestors 'self'; sandbox", 'Content-Type': f.mime, 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`, 'Cache-Control': 'private, max-age=600' }).end(readFileSync(f.path)); return;
      }
      if (url.pathname === '/api/pdf' && req.method === 'POST') {
        if (req.headers['x-rem'] !== '1') throw new HttpError(403, 'Petición no autorizada');
        const b = await readJson(req, 3e6); if (typeof b.html !== 'string' || !b.html.trim()) throw bad('Falta el contenido');
        const pdf = htmlToPdf(b.html, DATA, readFileSync(join(PUBLIC, 'pdf.css'), 'utf8')); if (!pdf) throw new HttpError(501, 'Este equipo no puede generar PDF; usa Imprimir');
        res.writeHead(200, { ...headers, 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${String(b.filename || 'documento').replace(/[^\w.\- ]+/g, '_').slice(0, 80)}.pdf"`, 'Cache-Control': 'no-store' }).end(pdf); return;
      }
      { const g = req.method === 'GET' && url.pathname.match(/^\/api\/documents\/(\d+)\/pptx$/);
        if (g) {
          const d = getDoc(Number(g[1])); if (d.type !== 'presupuesto') throw new HttpError(409, 'La propuesta se genera desde un presupuesto');
          const deck = proposalDeck({ doc: d, client: d.client_id ? one('SELECT * FROM clients WHERE id=?', d.client_id) : null, s: settingsObj(), totals: { base: d.base, ivaTotal: d.iva_total, irpfTotal: d.irpf_total, total: d.total } });
          res.writeHead(200, { ...headers, 'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'Content-Disposition': `attachment; filename="Propuesta ${String(d.number || 'presupuesto').replace(/[^\w.\-]+/g, '_')}.pptx"`, 'Cache-Control': 'no-store' }).end(deck); return;
        } }
      if (url.pathname === '/api/docx' && req.method === 'POST') {
        if (req.headers['x-rem'] !== '1') throw new HttpError(403, 'Petición no autorizada');
        const b = await readJson(req, 1e6); if (typeof b.text !== 'string' || !b.text.trim()) throw bad('Falta el contenido');
        const name = String(b.filename || 'documento').replace(/[^\w.\- ñáéíóúüÑÁÉÍÓÚÜ]+/g, '_').slice(0, 80);
        res.writeHead(200, { ...headers, 'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}.docx`, 'Cache-Control': 'no-store' }).end(buildDocx({ markdown: b.text.slice(0, 200000), title: String(b.filename || '').slice(0, 200), author: settingsObj().company_name || '' })); return;
      }
      if (url.pathname === '/api/tts' && req.method === 'POST') {
        if (req.headers['x-rem'] !== '1') throw new HttpError(403, 'Petición no autorizada');
        const b = await readJson(req, 100000); const wav = speak(str(b.text, 1500), settingsObj().tts_voice || '');
        if (!wav) throw new HttpError(501, 'Este equipo no tiene voz del sistema disponible');
        res.writeHead(200, { ...headers, 'Content-Type': 'audio/wav', 'Cache-Control': 'no-store' }).end(wav); return;
      }
      if (req.method !== 'GET' && req.headers['x-rem'] !== '1') throw new HttpError(403, 'Petición no autorizada');
      let body = {};
      if (req.method !== 'GET' && req.method !== 'DELETE') body = await readJson(req);
      const out = lock.route(req, req.method, url.pathname, body) ?? await route(req, url, body);
      res.writeHead(200, { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(req._cookie ? { 'Set-Cookie': req._cookie } : {}) }).end(JSON.stringify(out));
      return;
    }
    let f = normalize(url.pathname === '/' ? '/index.html' : url.pathname).replace(/^(\.\.[/\\])+/, '');
    const file = join(PUBLIC, f);
    if (!file.startsWith(PUBLIC) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404, headers).end('No encontrado'); return; }
    res.writeHead(200, { ...headers, 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }).end(readFileSync(file));
  } catch (e) {
    const status = e instanceof HttpError ? e.status : /UNIQUE/.test(String(e.message)) ? 409 : 500;
    if (status === 500) console.error(e);
    if (res.headersSent) { try { res.end(); } catch { /* la conexión ya se cerró */ } return; } // fallo después de empezar a responder: no volver a escribir cabeceras
    res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: status === 500 ? 'Error interno' : e.message }));
  }
});

function csv(url, res, headers) {
  const kind = url.searchParams.get('kind');
  const eur = (c) => (c / 100).toFixed(2).replace('.', ',');
  let rows;
  if (kind === 'facturas') rows = [['Número', 'Fecha', 'Cliente', 'NIF', 'Base', 'IVA', 'IRPF', 'Total', 'Estado'], ...all(`SELECT d.*, c.name cn, c.nif cnif FROM documents d LEFT JOIN clients c ON c.id=d.client_id WHERE d.type='factura' AND d.status<>'borrador' ORDER BY d.issue_date`).map((d) => [d.number, d.issue_date, d.cn, d.cnif, eur(d.base), eur(d.iva_total), eur(d.irpf_total), eur(d.total), d.status])];
  else if (kind === 'gastos') rows = [['Fecha', 'Proveedor', 'Concepto', 'Categoría', 'Base', 'IVA %', 'Total', 'Estado', 'Vencimiento', 'Pagado el'], ...all('SELECT * FROM expenses ORDER BY date').map((e) => [e.date, e.supplier, e.concept, e.category, eur(e.base), e.iva, eur(e.total), e.pending ? 'pendiente' : 'pagado', e.due, e.paid_date])];
  else if (kind === 'clientes') rows = [['Nombre', 'NIF', 'Email', 'Teléfono', 'Dirección', 'Ciudad', 'CP'], ...all('SELECT * FROM clients ORDER BY name').map((c) => [c.name, c.nif, c.email, c.phone, c.address, c.city, c.zip])];
  else throw bad('Tipo no válido');
  res.writeHead(200, { ...headers, 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${kind}-${today()}.csv"` }).end(toCsv(rows));
}

server.listen(PORT, '127.0.0.1', () => { console.log(`REM Negocio en http://127.0.0.1:${PORT}/\nDatos: ${DATA}`); if (repair) console.error(`AVISO: la base de datos no supera la comprobación de integridad (${repair.broken} relación(es) rota(s)${repair.damaged ? ', base dañada' : ''}). Abre la app para restaurar una copia o repararla.`); else startServices(); if (process.env.REM_PDF_WARM !== '0') warmPdf(DATA); });
export { server, db };
