// Facturas recurrentes: cada periodo se prepara un BORRADOR (nunca se emite solo: emitir sigue siendo cosa de la persona).
import { advanceDate, isIsoDate } from '../public/calc.js';
const EVERY = { month: 1, quarter: 3, year: 12 };
export const advance = advanceDate;

export function createRecurring({ db, run, one, all, nowIso, str, HttpError, log, today, createDocument, createExpense }) {
  db.exec(`CREATE TABLE IF NOT EXISTS recurring(id INTEGER PRIMARY KEY, name TEXT NOT NULL, client_id INTEGER REFERENCES clients(id), lines TEXT NOT NULL, irpf REAL DEFAULT 0, notes TEXT DEFAULT '',
    every TEXT NOT NULL, anchor INTEGER NOT NULL, next_date TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, last_doc_id INTEGER, last_run TEXT, created_at TEXT NOT NULL);`);
  db.exec(`CREATE TABLE IF NOT EXISTS recurring_expenses(id INTEGER PRIMARY KEY, supplier TEXT DEFAULT '', concept TEXT NOT NULL, category TEXT DEFAULT 'otros', total INTEGER NOT NULL, iva REAL DEFAULT 21, every TEXT NOT NULL, anchor INTEGER NOT NULL, next_date TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1, estimated INTEGER NOT NULL DEFAULT 0, last_expense_id INTEGER, last_run TEXT, created_at TEXT NOT NULL);`);
  const view = (r) => ({ ...r, lines: JSON.parse(r.lines), active: !!r.active });
  const viewE = (r) => ({ ...r, active: !!r.active, estimated: !!r.estimated });

  // Un gasto ya ocurrió: si la app estuvo cerrada se registra UNO POR CADA periodo que faltó (con su fecha), hasta 24.
  function generateExpenses(r) {
    let n = 0, d = r.next_date, last = null;
    while (d <= today() && n < 24) {
      last = createExpense({ date: d, supplier: r.supplier, concept: r.concept, category: r.category, base: Math.round(r.total / (1 + r.iva / 100)), iva: r.iva, total: r.total, notes: r.estimated ? 'Recurrente · importe estimado: revísalo' : 'Recurrente' });
      d = advanceDate(d, r.every, r.anchor); n++;
    }
    if (n) { run('UPDATE recurring_expenses SET next_date=?, last_expense_id=?, last_run=? WHERE id=?', d, last.id, today(), r.id); log(`Gasto recurrente registrado: «${r.concept}»${n > 1 ? ` (${n} periodos)` : ''}`, 'expense', last.id); }
    return n;
  }
  const dueExpenses = () => { let n = 0; for (const r of all('SELECT * FROM recurring_expenses WHERE active=1 AND next_date<=?', today())) { try { n += generateExpenses(r); } catch {} } return n; };
  const validDate = isIsoDate;

  // Un borrador POR CADA periodo pendiente (hasta 12 por ejecución), para no dejar de facturar meses si la app estuvo cerrada.
  // Si quedan más, next_date conserva el primer periodo pendiente para que la siguiente ejecución continúe sin saltos.
  function generate(r, { schedule = true } = {}) {
    const make = (period) => createDocument({ type: 'factura', client_id: r.client_id, lines: JSON.parse(r.lines), irpf: r.irpf, notes: [r.notes, `Recurrente: ${r.name}`, schedule ? `Periodo: ${period}` : ''].filter(Boolean).join('\n'), issue_date: today() });
    const periods = []; let next = r.next_date;
    if (schedule) while (next <= today() && periods.length < 12) { periods.push(next); next = advance(next, r.every, r.anchor); }
    else periods.push(r.next_date);
    const docs = periods.map(make), doc = docs[docs.length - 1];
    run('UPDATE recurring SET last_doc_id=?, last_run=?, next_date=? WHERE id=?', doc.id, today(), schedule ? next : r.next_date, r.id);
    log(`Factura recurrente preparada: «${r.name}» (${docs.length === 1 ? 'borrador' : docs.length + ' borradores, uno por periodo'})`, 'document', doc.id); return { doc, count: docs.length };
  }
  const runDue = () => { let n = dueExpenses(); for (const r of all("SELECT * FROM recurring WHERE active=1 AND next_date<=?", today())) { try { n += generate(r).count; } catch { /* cliente archivado, etc. */ } } return n; };

  return {
    runDue, state: () => ({ recurring: all('SELECT * FROM recurring ORDER BY next_date').map(view), recurringExpenses: all('SELECT * FROM recurring_expenses ORDER BY next_date').map(viewE) }),
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
      if (m === 'POST' && p === '/api/recurring-expenses') {
        const src = body.from_expense_id ? one('SELECT * FROM expenses WHERE id=?', Number(body.from_expense_id)) : null; if (body.from_expense_id && !src) throw new HttpError(404, 'Gasto no encontrado');
        if (!EVERY[body.every]) throw new HttpError(400, 'Frecuencia no válida'); if (!validDate(body.next_date)) throw new HttpError(400, 'Fecha no válida');
        const total = Math.round(Number(src ? src.total : body.total)), iva = [0, 4, 10, 21].includes(Number(src ? src.iva : body.iva)) ? Number(src ? src.iva : body.iva) : 21; if (!(total > 0)) throw new HttpError(400, 'El importe debe ser mayor que cero');
        const concept = str(src ? src.concept : body.concept, 200); if (!concept) throw new HttpError(400, 'Falta el concepto');
        const id = Number(run('INSERT INTO recurring_expenses(supplier,concept,category,total,iva,every,anchor,next_date,estimated,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', str(src ? src.supplier : body.supplier, 200), concept, str(src ? src.category : body.category, 40) || 'otros', total, iva, body.every, Number(body.next_date.slice(8, 10)), body.next_date, body.estimated ? 1 : 0, nowIso()).lastInsertRowid);
        log(`Gasto recurrente creado: ${concept}`, 'recurring', id); return viewE(one('SELECT * FROM recurring_expenses WHERE id=?', id));
      }
      if ((g = p.match(/^\/api\/recurring-expenses\/(\d+)$/))) {
        const id = Number(g[1]), r = one('SELECT * FROM recurring_expenses WHERE id=?', id); if (!r) throw new HttpError(404, 'No existe');
        if (m === 'PUT') { const every = body.every ?? r.every, nd = body.next_date ?? r.next_date, total = body.total === undefined ? r.total : Math.round(Number(body.total)); if (!EVERY[every]) throw new HttpError(400, 'Frecuencia no válida'); if (!validDate(nd)) throw new HttpError(400, 'Fecha no válida'); if (!(total > 0)) throw new HttpError(400, 'Importe no válido');
          run('UPDATE recurring_expenses SET concept=?, supplier=?, category=?, total=?, iva=?, every=?, next_date=?, anchor=?, active=?, estimated=? WHERE id=?', str(body.concept ?? r.concept, 200), str(body.supplier ?? r.supplier, 200), str(body.category ?? r.category, 40), total, [0, 4, 10, 21].includes(Number(body.iva)) ? Number(body.iva) : r.iva, every, nd, Number(nd.slice(8, 10)), body.active === undefined ? r.active : body.active ? 1 : 0, body.estimated === undefined ? r.estimated : body.estimated ? 1 : 0, id); return viewE(one('SELECT * FROM recurring_expenses WHERE id=?', id)); }
        if (m === 'DELETE') { run('DELETE FROM recurring_expenses WHERE id=?', id); return { ok: true }; }
      }
      if ((g = p.match(/^\/api\/recurring\/(\d+)(?:\/(run))?$/))) {
        const id = Number(g[1]), r = one('SELECT * FROM recurring WHERE id=?', id); if (!r) throw new HttpError(404, 'No existe');
        if (m === 'POST' && g[2] === 'run') return generate(r, { schedule: false }).doc;
        if (m === 'PUT') {
          const every = body.every ?? r.every, nd = body.next_date ?? r.next_date; if (!EVERY[every]) throw new HttpError(400, 'Frecuencia no válida'); if (!validDate(nd)) throw new HttpError(400, 'Fecha no válida');
          run('UPDATE recurring SET name=?, every=?, next_date=?, anchor=?, active=? WHERE id=?', str(body.name ?? r.name, 100), every, nd, Number(nd.slice(8, 10)), body.active === undefined ? r.active : body.active ? 1 : 0, id); return view(one('SELECT * FROM recurring WHERE id=?', id));
        }
        if (m === 'DELETE') { run('DELETE FROM recurring WHERE id=?', id); return { ok: true }; }
      }
    },
  };
}
