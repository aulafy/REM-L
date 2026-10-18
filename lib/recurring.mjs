// Facturas recurrentes: cada periodo se prepara un BORRADOR (nunca se emite solo: emitir sigue siendo cosa de la persona).
import { advanceDate } from '../public/calc.js';
const EVERY = { month: 1, quarter: 3, year: 12 };
export const advance = advanceDate;

export function createRecurring({ db, run, one, all, nowIso, str, HttpError, log, today, createDocument }) {
  db.exec(`CREATE TABLE IF NOT EXISTS recurring(id INTEGER PRIMARY KEY, name TEXT NOT NULL, client_id INTEGER REFERENCES clients(id), lines TEXT NOT NULL, irpf REAL DEFAULT 0, notes TEXT DEFAULT '',
    every TEXT NOT NULL, anchor INTEGER NOT NULL, next_date TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, last_doc_id INTEGER, last_run TEXT, created_at TEXT NOT NULL);`);
  const view = (r) => ({ ...r, lines: JSON.parse(r.lines), active: !!r.active });
  const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(Date.parse(d));

  function generate(r, { schedule = true } = {}) {
    const doc = createDocument({ type: 'factura', client_id: r.client_id, lines: JSON.parse(r.lines), irpf: r.irpf, notes: [r.notes, `Recurrente: ${r.name}`].filter(Boolean).join('\n'), issue_date: today() });
    let skipped = 0, next = r.next_date;
    if (schedule) { next = advance(r.next_date, r.every, r.anchor); while (next <= today()) { next = advance(next, r.every, r.anchor); skipped++; } }
    run('UPDATE recurring SET last_doc_id=?, last_run=?, next_date=? WHERE id=?', doc.id, today(), next, r.id);
    log(`Factura recurrente preparada: «${r.name}» (borrador)${skipped ? ` · se omitieron ${skipped} periodo(s) con la app cerrada` : ''}`, 'document', doc.id); return doc;
  }
  const runDue = () => { let n = 0; for (const r of all("SELECT * FROM recurring WHERE active=1 AND next_date<=?", today())) { try { generate(r); n++; } catch { /* cliente archivado, etc. */ } } return n; };

  return {
    runDue, state: () => ({ recurring: all('SELECT * FROM recurring ORDER BY next_date').map(view) }),
    async route(m, p, body) {
      let g;
      if (m === 'POST' && p === '/api/recurring') {
        const src = body.from_document_id ? one("SELECT * FROM documents WHERE id=? AND type='factura'", Number(body.from_document_id)) : null; if (body.from_document_id && !src) throw new HttpError(404, 'Factura no encontrada');
        if (!EVERY[body.every]) throw new HttpError(400, 'Frecuencia no válida'); if (!validDate(body.next_date)) throw new HttpError(400, 'Fecha no válida');
        const lines = src ? src.lines : JSON.stringify(Array.isArray(body.lines) ? body.lines : []); const cid = src ? src.client_id : Number(body.client_id) || null;
        if (!cid || !one('SELECT 1 FROM clients WHERE id=?', cid)) throw new HttpError(400, 'Elige un cliente'); if (!JSON.parse(lines).length) throw new HttpError(400, 'Faltan los conceptos');
        const id = Number(run('INSERT INTO recurring(name,client_id,lines,irpf,notes,every,anchor,next_date,created_at) VALUES(?,?,?,?,?,?,?,?,?)', str(body.name, 100) || 'Factura recurrente', cid, lines, src ? src.irpf : 0, '', body.every, Number(body.next_date.slice(8, 10)), body.next_date, nowIso()).lastInsertRowid);
        log(`Factura recurrente creada: ${str(body.name, 100)}`, 'recurring', id); return view(one('SELECT * FROM recurring WHERE id=?', id));
      }
      if (m === 'POST' && p === '/api/recurring/check') return { generated: runDue() };
      if ((g = p.match(/^\/api\/recurring\/(\d+)(?:\/(run))?$/))) {
        const id = Number(g[1]), r = one('SELECT * FROM recurring WHERE id=?', id); if (!r) throw new HttpError(404, 'No existe');
        if (m === 'POST' && g[2] === 'run') return generate(r, { schedule: false });
        if (m === 'PUT') {
          const every = body.every ?? r.every, nd = body.next_date ?? r.next_date; if (!EVERY[every]) throw new HttpError(400, 'Frecuencia no válida'); if (!validDate(nd)) throw new HttpError(400, 'Fecha no válida');
          run('UPDATE recurring SET name=?, every=?, next_date=?, anchor=?, active=? WHERE id=?', str(body.name ?? r.name, 100), every, nd, Number(nd.slice(8, 10)), body.active === undefined ? r.active : body.active ? 1 : 0, id); return view(one('SELECT * FROM recurring WHERE id=?', id));
        }
        if (m === 'DELETE') { run('DELETE FROM recurring WHERE id=?', id); return { ok: true }; }
      }
    },
  };
}
