// Adjuntos (fotos de tickets y documentos): se guardan en local, se leen con OCR y se proponen como gasto. Nada se crea sin revisión.
import { mkdirSync, writeFileSync, readFileSync, existsSync, unlinkSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ocrImage, parseReceipt, IMAGE_TYPES, saveTemp } from './ocr.mjs';
import { pdfText, pdfPageImage } from './pdf.mjs';

const MAX = 10 * 1024 * 1024;
const MAGIC = { jpg: (b) => b[0] === 0xff && b[1] === 0xd8, png: (b) => b.subarray(0, 4).toString('hex') === '89504e47', webp: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP', heic: (b) => b.subarray(4, 8).toString() === 'ftyp', pdf: (b) => b.subarray(0, 4).toString() === '%PDF' };

export function createAttachments({ db, run, one, all, dataDir, nowIso, str, HttpError, settingsObj, agents, createExpense }) {
  db.exec(`CREATE TABLE IF NOT EXISTS attachments(id INTEGER PRIMARY KEY, name TEXT NOT NULL, file TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER, text TEXT DEFAULT '', parsed TEXT DEFAULT '{}', flags TEXT DEFAULT '[]',
    engine TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'procesando', sensitive INTEGER DEFAULT 0, expense_id INTEGER, created_at TEXT NOT NULL);`);
  for (const [c, d] of [['source', "TEXT DEFAULT 'app'"], ['peer', "TEXT DEFAULT ''"]]) if (!all('PRAGMA table_info(attachments)').some((x) => x.name === c)) db.exec(`ALTER TABLE attachments ADD COLUMN ${c} ${d}`);
  const dir = join(dataDir, 'files'); mkdirSync(dir, { recursive: true });
  const ai = () => { const s = settingsObj(); return s.ollama_url && s.ollama_model ? s : null; };
  let queue = Promise.resolve();

  const hasAmount = (t) => /\d[.,]\d{2}/.test(t) && /total/i.test(t);
  async function process_(id) {
    const a = one('SELECT * FROM attachments WHERE id=?', id); if (!a) return;
    const src = join(dir, a.file); let tmp = null, text = '', engine = '';
    try {
      if (a.mime === 'application/pdf') {
        const t = pdfText(src, dataDir); if (t.length >= 40 && hasAmount(t)) { text = t; engine = 'Texto del PDF'; }
        else { const im = pdfPageImage(src, dataDir); if (im) { tmp = im; ({ text, engine } = await ocrImage(im.file, dataDir, { ai: ai() })); engine = 'PDF escaneado · ' + engine; } else if (t) { text = t; engine = 'Texto del PDF'; } }
      } else { tmp = saveTemp(readFileSync(src), IMAGE_TYPES[a.mime]); ({ text, engine } = await ocrImage(tmp.file, dataDir, { ai: ai() })); }
      if (!text) { run("UPDATE attachments SET status='error', engine=? WHERE id=?", engine, id); return; }
      let r = await parseReceipt(text, { ai: ai() }), used = engine, txt = text;
      // Si hay avisos, se relee con el modelo de visión (más lento pero más preciso) y se queda la lectura con menos avisos.
      if (r.flags.length && ai() && tmp && !process.env.REM_OCR_FAKE && !/visión/.test(engine)) {
        const second = await ocrImage(tmp.file, dataDir, { ai: ai(), forceVision: true });
        if (second.text) { const r2 = await parseReceipt(second.text, { ai: ai() }); if (r2.flags.length < r.flags.length) { r = r2; used = second.engine; txt = second.text; } }
      }
      run("UPDATE attachments SET text=?, parsed=?, flags=?, engine=?, sensitive=?, status='por_revisar' WHERE id=?", txt.slice(0, 8000), JSON.stringify(r.parsed), JSON.stringify(r.flags), used + (r.usedAi ? ' + IA' : ''), r.sensitive ? 1 : 0, id);
    } catch { run("UPDATE attachments SET status='error' WHERE id=?", id); } finally { tmp?.done(); }
  }
  // Entrada común (subida manual, Telegram, correo): valida, guarda en local y encola la lectura. Devuelve el id o null.
  const MAX_PENDING = 50;
  function ingest({ buffer, mime, name, source = 'app', peer = '' }) {
    const ext = IMAGE_TYPES[String(mime || '').toLowerCase()]; if (!ext) throw new HttpError(400, 'Solo se admiten fotos (JPG, PNG, WebP, HEIC) y PDF');
    if (!buffer?.length) throw new HttpError(400, 'Archivo vacío'); if (buffer.length > MAX) throw new HttpError(413, 'El archivo supera 10 MB'); if (!MAGIC[ext](buffer)) throw new HttpError(400, 'El archivo no parece válido');
    if (one("SELECT COUNT(*) n FROM attachments WHERE status IN ('procesando','por_revisar','error')").n >= MAX_PENDING) throw new HttpError(429, 'Hay demasiados documentos pendientes de revisar');
    const file = `${randomBytes(12).toString('hex')}.${ext}`; writeFileSync(join(dir, file), buffer);
    const id = Number(run('INSERT INTO attachments(name,file,mime,size,source,peer,created_at) VALUES(?,?,?,?,?,?,?)', str(name, 120) || 'documento', file, String(mime).toLowerCase(), buffer.length, source, str(peer, 120), nowIso()).lastInsertRowid);
    queue = queue.then(() => process_(id)).catch(() => {}); return id;
  }
  // Ejecutor del agente (para cuando los adjuntos lleguen por Telegram o correo): crea el gasto a partir de lo leído.
  agents.register('create_expense', ({ attachment_id }) => saveExpense(attachment_id, null, 'asistente'));

  function saveExpense(id, over, who) {
    const a = one('SELECT * FROM attachments WHERE id=?', id); if (!a) throw new HttpError(404, 'No existe');
    if (a.status === 'gasto') throw new HttpError(409, 'Ya se creó un gasto con este documento');
    const p = { ...JSON.parse(a.parsed || '{}'), ...(over || {}) };
    const total = Math.round(Number(p.total) * 100), iva = [0, 4, 10, 21].includes(Number(p.iva)) ? Number(p.iva) : 21;
    if (!(total > 0)) throw new HttpError(400, 'Falta un importe válido'); if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || '')) throw new HttpError(400, 'Falta una fecha válida');
    const e = createExpense({ date: p.date, supplier: p.supplier || '', concept: p.concept || p.supplier || 'Gasto', category: p.category || 'otros', base: (() => { const b = Math.round(Number(p.base) * 100), calc = Math.round(total / (1 + iva / 100)); return b > 0 && Math.abs(Math.round(b * (1 + iva / 100)) - total) <= 2 ? b : calc; })(), iva, total, notes: `Ticket #${id}` });
    run("UPDATE attachments SET status='gasto', expense_id=? WHERE id=?", e.id, id); return e;
  }

  const view = (a) => ({ id: a.id, name: a.name, mime: a.mime, source: a.source || 'app', peer: a.peer || '', status: a.status, engine: a.engine, sensitive: !!a.sensitive, expense_id: a.expense_id, created_at: a.created_at, parsed: JSON.parse(a.parsed || '{}'), flags: JSON.parse(a.flags || '[]'), text: a.sensitive ? '' : (a.text || '').slice(0, 3000) });
  return {
    ingest,
    purgeAll: () => { for (const a of all('SELECT * FROM attachments')) try { unlinkSync(join(dir, a.file)); } catch {} for (const e of readdirSync(dir, { withFileTypes: true })) if (!e.isDirectory()) try { unlinkSync(join(dir, e.name)); } catch {} run('DELETE FROM attachments'); },
    state: () => ({ attachments: all("SELECT * FROM attachments WHERE status IN ('procesando','por_revisar','error') OR created_at>? ORDER BY id DESC LIMIT 40", new Date(Date.now() - 7 * 864e5).toISOString()).map(view) }),
    fileOf: (id) => { const a = one('SELECT * FROM attachments WHERE id=?', id); return a && existsSync(join(dir, a.file)) ? { path: join(dir, a.file), mime: a.mime } : null; },
    async route(m, p, body) {
      let g;
      if (m === 'POST' && p === '/api/attachments') { const id = ingest({ buffer: Buffer.from(String(body.data || ''), 'base64'), mime: body.mime, name: body.name, source: 'app' }); return view(one('SELECT * FROM attachments WHERE id=?', id)); }
      if ((g = p.match(/^\/api\/attachments\/(\d+)\/(expense|discard|retry)$/)) && m === 'POST') {
        const id = Number(g[1]); if (!one('SELECT 1 FROM attachments WHERE id=?', id)) throw new HttpError(404, 'No existe');
        if (g[2] === 'discard') { run("UPDATE attachments SET status='descartado' WHERE id=?", id); return { ok: true }; }
        if (g[2] === 'retry') { run("UPDATE attachments SET status='procesando' WHERE id=?", id); queue = queue.then(() => process_(id)).catch(() => {}); return { ok: true }; }
        const e = saveExpense(id, body, 'persona'); agents.log({ agent: 'persona', action: 'create_expense', decision: 'proceed', reason: 'Gasto creado desde un ticket revisado', summary: `${e.supplier || e.concept} · ${(e.total / 100).toFixed(2)} €` }); return e;
      }
      if ((g = p.match(/^\/api\/attachments\/(\d+)$/)) && m === 'DELETE') {
        const a = one('SELECT * FROM attachments WHERE id=?', Number(g[1])); if (!a) return { ok: true };
        try { unlinkSync(join(dir, a.file)); } catch {} run('DELETE FROM attachments WHERE id=?', a.id); agents.log({ agent: 'persona', action: 'delete_data', decision: 'proceed', reason: 'Documento borrado por la persona' }); return { ok: true };
      }
    },
  };
}
