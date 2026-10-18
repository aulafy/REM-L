// Restaurar una copia de seguridad (.db de SQLite) sobre la base activa, tabla a tabla y en una transacción.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, openSync, readSync, closeSync } from 'node:fs';
import { SCHEMA_VERSION, databaseHealth, cleanSoftRefs } from './schema.mjs';

export const isSqlite = (file) => { try { const fd = openSync(file, 'r'), b = Buffer.alloc(16); readSync(fd, b, 0, 16, 0); closeSync(fd); return b.toString('latin1') === 'SQLite format 3\0'; } catch { return false; } };
const tablesOf = (d, schema = 'main') => d.prepare(`SELECT name FROM ${schema}.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all().map((r) => r.name);

// Resumen para enseñar qué contiene una copia antes de restaurarla.
export function summarize(file) {
  if (!isSqlite(file)) return null;
  let d; try { d = new DatabaseSync(file, { readOnly: true }); const t = tablesOf(d), health = databaseHealth(d); if (!health.ok || health.schemaVersion > SCHEMA_VERSION || !t.includes('clients') || !t.includes('documents')) return null;
    const n = (sql) => { try { return d.prepare(sql).get().n; } catch { return 0; } };
    return { schemaVersion: health.schemaVersion, clients: n('SELECT COUNT(*) n FROM clients'), invoices: n("SELECT COUNT(*) n FROM documents WHERE type='factura' AND status<>'borrador'"), quotes: n("SELECT COUNT(*) n FROM documents WHERE type='presupuesto'"), expenses: n('SELECT COUNT(*) n FROM expenses'), tasks: n('SELECT COUNT(*) n FROM tasks'), messages: n('SELECT COUNT(*) n FROM messages') };
  } catch { return null; } finally { try { d?.close(); } catch {} }
}

export function restoreFrom(db, file) {
  if (!summarize(file)) throw new Error('La copia no es válida');
  db.prepare('ATTACH DATABASE ? AS bk').run(file);
  try {
    db.exec('PRAGMA foreign_keys=OFF'); db.exec('BEGIN');
    try {
      const have = new Set(tablesOf(db, 'bk'));
      for (const t of tablesOf(db, 'main')) {
        db.exec(`DELETE FROM main."${t}"`);
        if (!have.has(t)) continue;
        const cols = db.prepare(`PRAGMA main.table_info("${t}")`).all().map((c) => c.name), bcols = new Set(db.prepare(`PRAGMA bk.table_info("${t}")`).all().map((c) => c.name)), common = cols.filter((c) => bcols.has(c));
        if (common.length) db.exec(`INSERT INTO main."${t}" (${common.map((c) => `"${c}"`).join(',')}) SELECT ${common.map((c) => `"${c}"`).join(',')} FROM bk."${t}"`);
      }
      cleanSoftRefs(db); const health = databaseHealth(db); if (!health.ok) throw new Error(`La copia contiene relaciones rotas (${health.foreignKeys.length})`);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  } finally { db.exec('PRAGMA foreign_keys=ON'); try { db.exec('DETACH DATABASE bk'); } catch {} }
}
