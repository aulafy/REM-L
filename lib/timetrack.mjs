import { isIsoDate } from '../public/calc.js';
// Control de horas por cliente → factura. Las horas sin facturar se agrupan por cliente y se convierten en un BORRADOR de factura
// (una línea por entrada); al borrar ese borrador, las horas vuelven a quedar libres.
export function createTime({ db, run, one, all, nowIso, str, HttpError, log, today, createDocument, settingsObj }) {
  db.exec(`CREATE TABLE IF NOT EXISTS time_entries(id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE, date TEXT NOT NULL, minutes INTEGER NOT NULL,
    description TEXT NOT NULL DEFAULT '', rate INTEGER NOT NULL DEFAULT 0, doc_id INTEGER, created_at TEXT NOT NULL);`);
  const bad = (m) => new HttpError(400, m);
  const okDate = isIsoDate;
  const row = (id) => { const r = one('SELECT * FROM time_entries WHERE id=?', id); if (!r) throw new HttpError(404, 'No existe'); return r; };
  function clean(b, cur = {}) {
    const client_id = Number(b.client_id ?? cur.client_id); if (!one('SELECT 1 FROM clients WHERE id=?', client_id)) throw bad('Elige un cliente');
    const minutes = Math.round(Number(b.minutes ?? cur.minutes)); if (!Number.isFinite(minutes) || minutes < 1 || minutes > 24 * 60) throw bad('La duración debe estar entre 1 minuto y 24 horas');
    const date = String(b.date ?? cur.date ?? today()); if (!okDate(date)) throw bad('Fecha no válida');
    const rate = b.rate === undefined || b.rate === '' || b.rate === null ? (cur.rate ?? Number(settingsObj().hourly_rate || 0)) : Math.round(Number(b.rate));
    if (!Number.isFinite(rate) || rate < 0 || rate > 10000000) throw bad('Tarifa no válida');
    return { client_id, minutes, date, rate, description: str(b.description ?? cur.description, 300) };
  }
  // Usa la menor precisión que conserva tanto el importe de cada entrada como la duración acumulada.
  // Así, por ejemplo, 3 × 20 min quedan como 0,3333 + 0,3334 + 0,3333 = 1 h, no 0,99 h.
  function billedHours(rows) {
    const result = new Map();
    for (const rate of new Set(rows.map((r) => r.rate))) {
      const group = rows.filter((r) => r.rate === rate); let chosen;
      for (let decimals = 2; decimals <= 10 && !chosen; decimals++) {
        const scale = 10 ** decimals, values = []; let minutes = 0, previous = 0, valid = true;
        for (const row of group) {
          minutes += row.minutes;
          const cumulative = Math.round(minutes * scale / 60), qty = (cumulative - previous) / scale;
          previous = cumulative; values.push(qty);
          if (Math.round(qty * rate) !== Math.round(row.minutes * rate / 60)) valid = false;
        }
        if (valid) chosen = values;
      }
      (chosen || group.map((r) => r.minutes / 60)).forEach((qty, i) => result.set(group[i].id, qty));
    }
    return result;
  }

  function invoice(b) {
    const cid = Number(b.client_id); if (!one('SELECT 1 FROM clients WHERE id=?', cid)) throw bad('Elige un cliente');
    const ids = Array.isArray(b.ids) && b.ids.length ? b.ids.map(Number) : null;
    const rows = all('SELECT * FROM time_entries WHERE client_id=? AND doc_id IS NULL ORDER BY date, id', cid).filter((r) => !ids || ids.includes(r.id));
    if (!rows.length) throw new HttpError(409, 'No hay horas sin facturar para este cliente');
    if (rows.some((r) => r.rate <= 0)) throw bad('Hay horas sin tarifa: indícala en cada entrada o en Ajustes → Facturación');
    const iva = Number(settingsObj().default_iva ?? 21), fmt = (d) => d.split('-').reverse().slice(0, 2).join('/'), quantities = billedHours(rows);
    const lines = rows.map((r) => ({ desc: `${fmt(r.date)} · ${r.description || 'Trabajo'}`, qty: quantities.get(r.id), price: r.rate, iva, discount: 0 }));
    const d = createDocument({ type: 'factura', client_id: cid, lines, notes: `Horas trabajadas: ${(rows.reduce((a, r) => a + r.minutes, 0) / 60).toFixed(2).replace('.', ',')} h` });
    for (const r of rows) run('UPDATE time_entries SET doc_id=? WHERE id=?', d.id, r.id);
    log(`Horas facturadas: ${rows.length} entradas en un borrador de factura`, 'document', d.id); return d;
  }
  return {
    state: () => ({ timeEntries: all('SELECT * FROM time_entries ORDER BY date DESC, id DESC') }),
    release: (docId) => run('UPDATE time_entries SET doc_id=NULL WHERE doc_id=?', docId),
    async route(m, p, body) {
      let g;
      if (m === 'POST' && p === '/api/time') { const v = clean(body); const id = Number(run('INSERT INTO time_entries(client_id,date,minutes,description,rate,created_at) VALUES(?,?,?,?,?,?)', v.client_id, v.date, v.minutes, v.description, v.rate, nowIso()).lastInsertRowid); return row(id); }
      if (m === 'POST' && p === '/api/time/invoice') return invoice(body);
      if ((g = p.match(/^\/api\/time\/(\d+)$/))) {
        const id = Number(g[1]), cur = row(id); if (cur.doc_id) throw new HttpError(409, 'Esas horas ya están en una factura');
        if (m === 'PUT') { const v = clean(body, cur); run('UPDATE time_entries SET client_id=?, date=?, minutes=?, description=?, rate=? WHERE id=?', v.client_id, v.date, v.minutes, v.description, v.rate, id); return row(id); }
        if (m === 'DELETE') { run('DELETE FROM time_entries WHERE id=?', id); return { ok: true }; }
      }
    },
  };
}
