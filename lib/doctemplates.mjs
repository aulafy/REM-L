// Plantillas propias de cartas y contratos (las de serie viven en public/doctpl.js).
export function createDocTemplates({ db, run, one, all, nowIso, str, HttpError, log }) {
  db.exec("CREATE TABLE IF NOT EXISTS doc_templates(id INTEGER PRIMARY KEY, name TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL)");
  return {
    state: () => ({ docTemplates: all('SELECT * FROM doc_templates ORDER BY name COLLATE NOCASE') }),
    async route(m, p, body) {
      let g;
      if (m === 'POST' && p === '/api/doc-templates') { const name = str(body.name, 100), text = str(body.body, 20000); if (!name || !text) throw new HttpError(400, 'Pon un nombre y el texto'); const id = Number(run('INSERT INTO doc_templates(name,body,created_at) VALUES(?,?,?)', name, text, nowIso()).lastInsertRowid); log(`Plantilla de documento creada: ${name}`); return one('SELECT * FROM doc_templates WHERE id=?', id); }
      if ((g = p.match(/^\/api\/doc-templates\/(\d+)$/))) {
        const id = Number(g[1]); if (!one('SELECT 1 FROM doc_templates WHERE id=?', id)) throw new HttpError(404, 'No existe');
        if (m === 'PUT') { const name = str(body.name, 100), text = str(body.body, 20000); if (!name || !text) throw new HttpError(400, 'Pon un nombre y el texto'); run('UPDATE doc_templates SET name=?, body=? WHERE id=?', name, text, id); return one('SELECT * FROM doc_templates WHERE id=?', id); }
        if (m === 'DELETE') { run('DELETE FROM doc_templates WHERE id=?', id); return { ok: true }; }
      }
    },
  };
}
