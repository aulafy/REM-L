// Esquema SQLite versionado. Las migraciones son crecientes, transaccionales y no dependen de paquetes externos.
export const SCHEMA_VERSION = 1;

const versionOf = (db) => Number(db.prepare('PRAGMA user_version').get().user_version || 0);
const hasColumn = (db, table, column) => db.prepare(`PRAGMA table_info("${table}")`).all().some((x) => x.name === column);

const MIGRATIONS = [{
  version: 1,
  up(db) {
    for (const [column, type] of [['pending', 'INTEGER DEFAULT 0'], ['due', "TEXT DEFAULT ''"], ['paid_date', "TEXT DEFAULT ''"]]) if (!hasColumn(db, 'expenses', column)) db.exec(`ALTER TABLE expenses ADD COLUMN ${column} ${type}`);
    if (!hasColumn(db, 'documents', 'series')) db.exec("ALTER TABLE documents ADD COLUMN series TEXT DEFAULT ''");
    for (const [column, type] of [['priority', 'INTEGER DEFAULT 1'], ['repeat', "TEXT DEFAULT ''"], ['parent_id', 'INTEGER REFERENCES tasks(id) ON DELETE CASCADE']]) if (!hasColumn(db, 'tasks', column)) db.exec(`ALTER TABLE tasks ADD COLUMN ${column} ${type}`);
    if (!hasColumn(db, 'expenses', 'supplier_nif')) db.exec("ALTER TABLE expenses ADD COLUMN supplier_nif TEXT DEFAULT ''");
  },
}];

export function migrateSchema(db) {
  const current = versionOf(db);
  if (current > SCHEMA_VERSION) throw new Error(`La base pertenece a una versión más nueva de REM Negocio (esquema ${current}; esta versión admite hasta ${SCHEMA_VERSION})`);
  if (current === SCHEMA_VERSION) return current;
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const migration of MIGRATIONS) if (migration.version > current) { migration.up(db); db.exec(`PRAGMA user_version=${migration.version}`); }
    db.exec('COMMIT'); return SCHEMA_VERSION;
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

// Referencias sin clave foránea (por compatibilidad con bases antiguas): se limpian al arrancar y al restaurar. Idempotente.
const hasTable = (db, t) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(t);
export function cleanSoftRefs(db) {
  let n = 0; const exec = (sql) => { n += Number(db.prepare(sql).run().changes); };
  if (hasTable(db, 'tasks') && hasTable(db, 'documents')) exec('UPDATE tasks SET document_id=NULL WHERE document_id IS NOT NULL AND document_id NOT IN (SELECT id FROM documents)');
  if (hasTable(db, 'ext_values')) exec("DELETE FROM ext_values WHERE (entity='clients' AND entity_id NOT IN (SELECT id FROM clients)) OR (entity='documents' AND entity_id NOT IN (SELECT id FROM documents))");
  return n;
}

export function databaseHealth(db) {
  const quick = db.prepare('PRAGMA quick_check').all().map((row) => Object.values(row)[0]);
  const foreignKeys = db.prepare('PRAGMA foreign_key_check').all();
  return { ok: quick.length === 1 && quick[0] === 'ok' && foreignKeys.length === 0, quick, foreignKeys, schemaVersion: versionOf(db) };
}

export function assertDatabaseHealthy(db) {
  const health = databaseHealth(db);
  if (!health.ok) throw new Error(`La base de datos no supera la comprobación de integridad (${health.foreignKeys.length} relación(es) rota(s); ${health.quick.join(', ')})`);
  return health;
}
