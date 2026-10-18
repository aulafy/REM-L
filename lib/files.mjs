// Archivos adjuntos a clientes y documentos: almacén local con lista blanca de tipos comprobados por su CONTENIDO.
// Nunca se ejecutan ni se interpretan; se sirven por id con cabeceras seguras. Sin HTML ni SVG (podrían llevar scripts).
import { mkdirSync, writeFileSync, existsSync, unlinkSync, readFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { randomBytes } from 'node:crypto';

const MAX = () => Number(process.env.REM_MAX_FILE || 25 * 1024 * 1024), PER_OWNER = 100;
const OLE = (b) => b.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1', ZIP = (b) => b.subarray(0, 2).toString('latin1') === 'PK';
const TYPES = {
  pdf: ['application/pdf', (b) => b.subarray(0, 4).toString() === '%PDF', 'pdf'], png: ['image/png', (b) => b.subarray(0, 4).toString('hex') === '89504e47', 'image'], jpg: ['image/jpeg', (b) => b[0] === 0xff && b[1] === 0xd8, 'image'], jpeg: ['image/jpeg', (b) => b[0] === 0xff && b[1] === 0xd8, 'image'],
  webp: ['image/webp', (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP', 'image'], heic: ['image/heic', (b) => b.subarray(4, 8).toString() === 'ftyp', 'image'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', ZIP, 'office'], xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ZIP, 'office'], pptx: ['application/vnd.openxmlformats-officedocument.presentationml.presentation', ZIP, 'office'],
  doc: ['application/msword', OLE, 'office'], xls: ['application/vnd.ms-excel', OLE, 'office'], ppt: ['application/vnd.ms-powerpoint', OLE, 'office'], odt: ['application/vnd.oasis.opendocument.text', ZIP, 'office'], ods: ['application/vnd.oasis.opendocument.spreadsheet', ZIP, 'office'],
  rtf: ['application/rtf', (b) => b.subarray(0, 5).toString() === '{\\rtf', 'office'],
  txt: ['text/plain; charset=utf-8', (b) => !b.subarray(0, 4096).includes(0), 'text'], csv: ['text/csv; charset=utf-8', (b) => !b.subarray(0, 4096).includes(0), 'text'], md: ['text/plain; charset=utf-8', (b) => !b.subarray(0, 4096).includes(0), 'text'],
};
const INLINE = new Set(['pdf', 'image', 'text']);
export const safeName = (n) => (basename(String(n || '').replace(/\\/g, '/')).replace(/[\u0000-\u001f<>:"|?*]+/g, '').replace(/^\.+/, '').trim().slice(0, 120) || 'archivo');
const OWNERS = { client: 'clients', document: 'documents' };

export function createFiles({ db, run, one, all, dataDir, nowIso, str, HttpError, log }) {
  db.exec(`CREATE TABLE IF NOT EXISTS files(id INTEGER PRIMARY KEY, owner_type TEXT NOT NULL, owner_id INTEGER NOT NULL, name TEXT NOT NULL, stored TEXT NOT NULL, mime TEXT NOT NULL, kind TEXT NOT NULL, size INTEGER NOT NULL, note TEXT DEFAULT '', created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS ix_files_owner ON files(owner_type, owner_id);`);
  const dir = join(dataDir, 'files', 'owned'); mkdirSync(dir, { recursive: true });
  const view = (f) => ({ id: f.id, owner_type: f.owner_type, owner_id: f.owner_id, name: f.name, mime: f.mime.split(';')[0], kind: f.kind, size: f.size, note: f.note, created_at: f.created_at });

  function save({ owner_type, owner_id, name, buffer }) {
    if (!OWNERS[owner_type]) throw new HttpError(400, 'Destino no válido'); if (!one(`SELECT 1 FROM ${OWNERS[owner_type]} WHERE id=?`, owner_id)) throw new HttpError(404, 'No existe el cliente o documento');
    if (!buffer?.length) throw new HttpError(400, 'Archivo vacío'); if (buffer.length > MAX()) throw new HttpError(413, `El archivo supera ${Math.round(MAX() / 1048576)} MB`);
    const nm = safeName(name), ext = (nm.split('.').pop() || '').toLowerCase(), t = TYPES[ext]; if (!t) throw new HttpError(400, 'Tipo de archivo no permitido (PDF, imágenes, Word, Excel, PowerPoint, texto)'); if (!t[1](buffer)) throw new HttpError(400, 'El contenido no coincide con el tipo del archivo');
    if (one('SELECT COUNT(*) n FROM files WHERE owner_type=? AND owner_id=?', owner_type, owner_id).n >= PER_OWNER) throw new HttpError(429, 'Demasiados archivos en este elemento');
    const stored = `${randomBytes(14).toString('hex')}.${ext}`; writeFileSync(join(dir, stored), buffer);
    const id = Number(run('INSERT INTO files(owner_type,owner_id,name,stored,mime,kind,size,created_at) VALUES(?,?,?,?,?,?,?,?)', owner_type, owner_id, nm, stored, t[0], t[2], buffer.length, nowIso()).lastInsertRowid);
    log(`Archivo adjuntado: ${nm}`, owner_type, owner_id); return view(one('SELECT * FROM files WHERE id=?', id));
  }
  const removeRow = (f) => { try { unlinkSync(join(dir, f.stored)); } catch {} run('DELETE FROM files WHERE id=?', f.id); };
  return {
    save, view,
    removeFor: (owner_type, owner_id) => { for (const f of all('SELECT * FROM files WHERE owner_type=? AND owner_id=?', owner_type, owner_id)) removeRow(f); },
    purgeAll: () => { for (const f of all('SELECT * FROM files')) removeRow(f); for (const name of readdirSync(dir)) try { unlinkSync(join(dir, name)); } catch {} },
    state: () => ({ files: all('SELECT * FROM files ORDER BY id DESC').map(view) }),
    fileOf: (id) => { const f = one('SELECT * FROM files WHERE id=?', id); return f && existsSync(join(dir, f.stored)) ? { path: join(dir, f.stored), name: f.name, mime: f.mime, kind: f.kind, inline: INLINE.has(f.kind) } : null; },
    async route(m, p, body) {
      let g;
      if ((g = p.match(/^\/api\/files\/(\d+)$/))) {
        const f = one('SELECT * FROM files WHERE id=?', Number(g[1])); if (!f) throw new HttpError(404, 'No existe');
        if (m === 'PUT') { const nm = body.name !== undefined ? safeName(body.name) : f.name; const e1 = (f.name.split('.').pop() || '').toLowerCase(), e2 = (nm.split('.').pop() || '').toLowerCase(); if (e1 !== e2) throw new HttpError(400, 'No se puede cambiar la extensión'); run('UPDATE files SET name=?, note=? WHERE id=?', nm, str(body.note ?? f.note, 300), f.id); return view(one('SELECT * FROM files WHERE id=?', f.id)); }
        if (m === 'DELETE') { removeRow(f); log(`Archivo eliminado: ${f.name}`, f.owner_type, f.owner_id); return { ok: true }; }
      }
    },
  };
}
