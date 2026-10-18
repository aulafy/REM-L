// Retención separada: importar o restaurar muchas veces no debe borrar las copias automáticas diarias.
import { readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export const BACKUP_LIMITS = { auto: 20, manual: 10, safety: 10, imported: 5, other: 5 };
export const backupKind = (name) => /-auto\.db$/.test(name) ? 'auto' : /-manual\.db$/.test(name) ? 'manual' : /-antes-de-/.test(name) ? 'safety' : /-importada\.db$/.test(name) ? 'imported' : 'other';

export function pruneBackups(dir, limits = BACKUP_LIMITS) {
  const groups = Object.create(null), removed = [];
  for (const name of readdirSync(dir).filter((x) => x.endsWith('.db')).sort().reverse()) (groups[backupKind(name)] ||= []).push(name);
  for (const [kind, files] of Object.entries(groups)) for (const name of files.slice(limits[kind] ?? limits.other)) { unlinkSync(join(dir, name)); removed.push(name); }
  return removed;
}
