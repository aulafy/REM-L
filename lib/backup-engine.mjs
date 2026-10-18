// Copias cifradas a una carpeta que elige la persona (USB, NAS, iCloud Drive…): hacerlas, verificarlas, probar la restauración y podarlas.
import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, statSync, renameSync, unlinkSync, rmSync, mkdtempSync, statfsSync, accessSync, constants } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { createKeyset, encryptBackup, decryptBackup, readHeader, unlockKey, rewrapPassphrase, EXT } from './rembak.mjs';
import { databaseHealth } from './schema.mjs';

const DAY = 864e5, TABLES = ['clients', 'documents', 'expenses', 'tasks', 'messages'];
const MAX_FILES_BYTES = 600 * 1048576;
const kindOf = (name) => (/-manual\.rembak$/.test(name) ? 'manual' : /-seguridad\.rembak$/.test(name) ? 'safety' : 'daily');

// Qué copias se quedan: 7 diarias (la última de cada día), 4 semanales y 12 mensuales (la última de cada semana/mes), 10 manuales y 5 de seguridad.
export function selectKeep(items, limits = { daily: 7, weekly: 4, monthly: 12, manual: 10, safety: 5 }) {
  const keep = new Set(), by = (k) => items.filter((i) => i.kind === k).sort((a, b) => b.created.localeCompare(a.created));
  for (const i of by('manual').slice(0, limits.manual)) keep.add(i.name); for (const i of by('safety').slice(0, limits.safety)) keep.add(i.name);
  const seen = { d: new Set(), w: new Set(), m: new Set() };
  const week = (iso) => { const d = new Date(iso.slice(0, 10) + 'T12:00:00Z'), t = new Date(d); t.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); const y = t.getUTCFullYear(); return `${y}-W${Math.ceil(((t - new Date(Date.UTC(y, 0, 1))) / DAY + 1) / 7)}`; };
  for (const i of by('daily')) { const d = i.created.slice(0, 10); if (!seen.d.has(d) && seen.d.size < limits.daily) { seen.d.add(d); keep.add(i.name); continue; } }
  for (const i of by('daily')) { if (keep.has(i.name)) continue; const w = week(i.created); if (!seen.w.has(w) && seen.w.size < limits.weekly) { seen.w.add(w); keep.add(i.name); } }
  for (const i of by('daily')) { if (keep.has(i.name)) continue; const m = i.created.slice(0, 7); if (!seen.m.has(m) && seen.m.size < limits.monthly) { seen.m.add(m); keep.add(i.name); } }
  return keep;
}

export function createBackupEngine({ db, dataDir, settingsObj, saveSetting, getSecret, setSecret, log, HttpError, today, nowIso, appVersion = '', schemaVersion = 1, extraDirs = ['files', 'attachments'] }) {
  const cfg = () => settingsObj().backup_cfg || {}, save = (patch) => saveSetting('backup_cfg', { ...cfg(), ...patch });
  const bad = (m) => new HttpError(400, m);
  const keyBuf = () => { const h = getSecret('backup_key'); return h ? Buffer.from(h, 'hex') : null; };
  const stamp = () => new Date().toISOString().replace(/[:.]/g, '-');
  let running = false;

  function destStatus(dest = cfg().dest) {
    if (!dest) return { ok: false, reason: 'No has elegido una carpeta' };
    try { if (!existsSync(dest)) return { ok: false, reason: 'La carpeta no está disponible (¿está conectado el disco?)' }; if (!statSync(dest).isDirectory()) return { ok: false, reason: 'No es una carpeta' }; accessSync(dest, constants.W_OK); return { ok: true }; }
    catch { return { ok: false, reason: 'No se puede escribir en esa carpeta' }; }
  }
  const counts = (d) => Object.fromEntries(TABLES.map((t) => { try { return [t, d.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n]; } catch { return [t, 0]; } }));

  function collect() {
    const tmp = mkdtempSync(join(tmpdir(), 'rem-bk-')), snap = join(tmp, 'negocio.db');
    try {
      db.exec(`VACUUM INTO '${snap.replace(/'/g, "''")}'`);
      const files = [{ name: 'negocio.db', data: readFileSync(snap) }]; let bytes = 0, skipped = 0;
      const walk = (abs, rel) => { for (const e of readdirSync(abs, { withFileTypes: true })) { const a = join(abs, e.name), r = `${rel}/${e.name}`; if (e.isDirectory()) walk(a, r); else if (e.isFile()) { const sz = statSync(a).size; if (bytes + sz > MAX_FILES_BYTES) { skipped++; continue; } bytes += sz; files.push({ name: r, data: readFileSync(a) }); } } };
      for (const d of extraDirs) { const abs = join(dataDir, d); if (existsSync(abs)) walk(abs, d); }
      const s = new DatabaseSync(snap, { readOnly: true }); const c = counts(s); s.close();
      return { files, counts: c, skipped, fileBytes: bytes };
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  // Comprobación completa: se descifra la copia escrita, se abre su base de datos y se compara con lo anotado al crearla.
  function verifyBuffer(buf, key) {
    const bk = decryptBackup(buf, { key }), tmp = mkdtempSync(join(tmpdir(), 'rem-vf-')), f = join(tmp, 'negocio.db');
    try { writeFileSync(f, bk.read('negocio.db')); const d = new DatabaseSync(f, { readOnly: true }); try { const ic = d.prepare('PRAGMA integrity_check').get(), h = databaseHealth(d), c = counts(d); const same = TABLES.every((t) => c[t] === (bk.meta.counts || {})[t]); return { ok: ic.integrity_check === 'ok' && same && h.schemaVersion <= schemaVersion, integrity: ic.integrity_check, counts: c, meta: bk.meta, schemaVersion: h.schemaVersion, same }; } finally { d.close(); } }
    finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  function entries(dest = cfg().dest) {
    if (!destStatus(dest).ok) return [];
    return readdirSync(dest).filter((n) => n.endsWith(EXT) && n.startsWith('rem-')).map((name) => {
      try { const full = join(dest, name), buf = readFileSync(full), { header } = readHeader(buf); return { name, size: buf.length, kind: kindOf(name), created: header.meta?.created || '', counts: header.meta?.counts || {}, files: header.meta?.files ?? 0, version: header.meta?.appVersion || '' }; }
      catch { return { name, size: 0, kind: kindOf(name), created: '', damaged: true, counts: {} }; }
    }).sort((a, b) => b.name.localeCompare(a.name));
  }
  function prune(dest) { const items = entries(dest).filter((i) => !i.damaged), keep = selectKeep(items), removed = []; for (const i of items) if (!keep.has(i.name)) { try { unlinkSync(join(dest, i.name)); removed.push(i.name); } catch { /* en uso */ } } return removed; }

  function run(kind = 'daily') {
    const c = cfg(); if (!c.wraps || !keyBuf()) throw new HttpError(409, 'Primero configura las copias cifradas');
    const ds = destStatus(); if (!ds.ok) { save({ last_error: ds.reason, last_error_at: nowIso() }); throw new HttpError(409, ds.reason); }
    if (running) throw new HttpError(409, 'Ya se está haciendo una copia'); running = true;
    try {
      const { files, counts: cn, skipped, fileBytes } = collect(), meta = { created: nowIso(), appVersion, schema: schemaVersion, counts: cn, files: files.length - 1, fileBytes, skippedFiles: skipped, kind };
      const buf = encryptBackup({ files, key: keyBuf(), wraps: c.wraps, meta }), name = `rem-${stamp()}-${kind === 'manual' ? 'manual' : kind === 'safety' ? 'seguridad' : 'diaria'}${EXT}`, tmp = join(c.dest, `.${name}.part`), final = join(c.dest, name);
      writeFileSync(tmp, buf, { mode: 0o600 }); renameSync(tmp, final);
      const back = readFileSync(final), v = verifyBuffer(back, keyBuf()); if (!v.ok) { unlinkSync(final); throw new HttpError(500, 'La copia no superó la verificación y se descartó'); }
      const removed = prune(c.dest); save({ last_ok: nowIso(), last_file: name, last_verified: nowIso(), last_error: '', last_size: buf.length });
      log(`Copia cifrada hecha: ${name}${removed.length ? ` (se retiraron ${removed.length} antiguas)` : ''}`); return { name, size: buf.length, counts: cn, files: files.length - 1, skipped, removed, verified: true };
    } catch (e) { save({ last_error: e.message, last_error_at: nowIso() }); throw e; } finally { running = false; }
  }

  return {
    status: destStatus, entries, prune, selectKeep,
    config() { const c = cfg(), ds = c.dest ? destStatus() : { ok: false, reason: '' }; return { configured: !!(c.wraps && keyBuf()), keyOnThisMac: !!keyBuf(), dest: c.dest || '', destOk: ds.ok, destReason: ds.reason || '', enabled: c.enabled !== false, lastOk: c.last_ok || '', lastFile: c.last_file || '', lastError: c.last_error || '', lastVerified: c.last_verified || '', restoreTestedAt: c.restore_tested_at || '', createdAt: c.created_at || '' }; },
    setup({ dest, passphrase, current }) {
      const d = String(dest || '').trim(); if (!d.startsWith('/')) throw bad('Elige una carpeta'); try { mkdirSync(d, { recursive: true }); } catch { throw bad('No se puede crear esa carpeta'); } const ds = destStatus(d); if (!ds.ok) throw bad(ds.reason);
      const c = cfg();
      if (c.wraps) { // ya había claves: cambiar la carpeta o (con la frase actual) la frase de paso
        if (!keyBuf() && current) { const k = unlockKey(c.wraps, current); if (!k) throw new HttpError(403, 'La frase de paso no es correcta'); setSecret('backup_key', k.toString('hex')); } // otro Mac: se recupera la clave con la frase
        if (passphrase) { const k = unlockKey(c.wraps, current || ''); if (!k) throw new HttpError(403, 'La frase de paso actual no es correcta'); if (String(passphrase).length < 8) throw bad('La frase de paso debe tener al menos 8 caracteres'); save({ dest: d, wraps: rewrapPassphrase(k, passphrase, c.wraps), enabled: true }); setSecret('backup_key', k.toString('hex')); log('Frase de paso de las copias cambiada'); }
        else save({ dest: d, enabled: true });
        return { configured: true, recoveryCode: null };
      }
      let ks; try { ks = createKeyset(passphrase); } catch (e) { throw bad(e.message); }
      setSecret('backup_key', ks.key.toString('hex')); save({ dest: d, wraps: ks.wraps, enabled: true, created_at: nowIso() }); log('Copias cifradas configuradas');
      return { configured: true, recoveryCode: ks.recoveryCode };
    },
    setEnabled: (on) => save({ enabled: !!on }),
    run,
    // Se llama cada minuto: hace la copia diaria si toca y la carpeta está disponible (si no, avisa y reintenta luego).
    tick() { const c = cfg(); if (!c.wraps || c.enabled === false || running) return null; const last = c.last_ok ? Date.parse(c.last_ok) : 0; if (last && Date.now() - last < 20 * 3600e3) return null; if (c.last_try && Date.now() - Date.parse(c.last_try) < 10 * 60e3) return null; save({ last_try: nowIso() }); try { return run('daily'); } catch { return null; } },
    verifyLatest() { const list = entries().filter((e) => !e.damaged); if (!list.length) throw new HttpError(409, 'Todavía no hay copias'); const buf = readFileSync(join(cfg().dest, list[0].name)), v = verifyBuffer(buf, keyBuf()); if (v.ok) save({ last_verified: nowIso() }); return { name: list[0].name, ...v }; },
    // Restaurar de prueba: abre la última copia en una carpeta temporal y comprueba que contiene lo que dice (no toca tus datos).
    testRestore() {
      const list = entries().filter((e) => !e.damaged); if (!list.length) throw new HttpError(409, 'Haz primero una copia'); const buf = readFileSync(join(cfg().dest, list[0].name)), v = verifyBuffer(buf, keyBuf());
      const live = counts(db); if (v.ok) save({ restore_tested_at: nowIso() }); return { ok: v.ok, name: list[0].name, backup: v.counts, live, integrity: v.integrity, created: v.meta?.created };
    },
    // Descifra una copia con la frase o el código y deja su base de datos en `outDir`; el servidor decide cómo aplicarla.
    extract(file, secret, outDir) {
      const c = cfg(), full = file.startsWith('/') ? file : join(c.dest || '', file); if (!existsSync(full)) throw new HttpError(404, 'Esa copia no existe');
      let bk; try { bk = decryptBackup(readFileSync(full), secret); } catch (e) { if (e.user) throw new HttpError(e.message.includes('frase') ? 403 : 400, e.message); throw e; }
      mkdirSync(outDir, { recursive: true }); const dbf = join(outDir, 'negocio.db'); writeFileSync(dbf, bk.read('negocio.db'));
      const restoreFiles = () => { for (const n of bk.names) { if (n === 'negocio.db') continue; const rel = n.split('/'); if (rel.some((p) => p === '..' || p === '' || p.includes('\\')) || !extraDirs.includes(rel[0])) continue; const target = join(dataDir, ...rel); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bk.read(n)); } };
      return { db: dbf, meta: bk.meta, restoreFiles };
    },
    health() {
      const c = cfg(), checks = [], add = (id, level, title, detail) => checks.push({ id, level, title, detail });
      const conf = this.config();
      if (!conf.configured) add('backup', 'bad', 'Copias de seguridad sin configurar', 'Elige una carpeta y una frase de paso.');
      else {
        if (!conf.destOk) add('dest', 'bad', 'La carpeta de copias no está disponible', conf.destReason);
        const age = c.last_ok ? (Date.now() - Date.parse(c.last_ok)) / DAY : Infinity;
        if (age === Infinity) add('last', 'bad', 'Todavía no se ha hecho ninguna copia', 'Pulsa «Hacer copia ahora».'); else if (age > 3) add('last', 'warn', `La última copia es de hace ${Math.floor(age)} días`, 'Conecta el disco o revisa la carpeta.'); else add('last', 'ok', 'Copia reciente', `Hace ${age < 1 ? 'menos de un día' : Math.floor(age) + ' días'}.`);
        add('verified', c.last_verified ? 'ok' : 'warn', c.last_verified ? 'Última copia verificada' : 'La copia no está verificada', c.last_verified ? 'Se descifró y se comprobó su contenido.' : 'Ejecuta la verificación.');
        const t = c.restore_tested_at ? (Date.now() - Date.parse(c.restore_tested_at)) / DAY : Infinity; add('restore', t === Infinity ? 'warn' : t > 90 ? 'warn' : 'ok', t === Infinity ? 'Nunca has probado restaurar' : t > 90 ? 'Hace más de 3 meses que no pruebas restaurar' : 'Restauración probada', t === Infinity ? 'Hazlo una vez: una copia sin probar no es una garantía.' : '');
      }
      try { const fs = statfsSync(dataDir), free = fs.bavail * fs.bsize; add('disk', free < 1e9 ? 'bad' : free < 5e9 ? 'warn' : 'ok', free < 5e9 ? 'Queda poco espacio en el disco' : 'Espacio en disco suficiente', `${(free / 1e9).toFixed(1)} GB libres.`); } catch { /* sin datos */ }
      if (process.platform === 'darwin') { const r = spawnSync('fdesetup', ['status'], { encoding: 'utf8', timeout: 5000 }); if (r.status === 0) { const on = /FileVault is On/i.test(r.stdout); add('filevault', on ? 'ok' : 'warn', on ? 'Disco cifrado (FileVault)' : 'FileVault está desactivado', on ? '' : 'Si pierdes el Mac, tus datos se podrían leer. Actívalo en Ajustes del Sistema → Privacidad y seguridad.'); } }
      const level = checks.some((x) => x.level === 'bad') ? 'bad' : checks.some((x) => x.level === 'warn') ? 'warn' : 'ok';
      return { level, checks };
    },
  };
}
