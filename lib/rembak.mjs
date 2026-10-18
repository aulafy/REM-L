// Formato de copia cifrada «.rembak»: ZIP (base de datos + archivos) cifrado con AES-256-GCM.
// Una clave de datos aleatoria cifra la copia; esa clave va «envuelta» dos veces en la cabecera: con la frase de paso y con el código de recuperación.
// Así una copia se abre en otro Mac con cualquiera de las dos, sin depender del llavero del equipo original.
import { createCipheriv, createDecipheriv, scryptSync, randomBytes } from 'node:crypto';
import { zip } from './xlsx.mjs';
import { openZip } from './office.mjs';

export const MAGIC = Buffer.from('REMBAK1\n'), EXT = '.rembak';
export const ZIP_LIMITS = { maxEntries: 200000, maxEntry: 2 ** 31 - 1, maxTotal: 8 * 2 ** 30 };
const fail = (m) => Object.assign(new Error(m), { user: true });
const b64 = (b) => Buffer.from(b).toString('base64'), unb64 = (s) => Buffer.from(String(s), 'base64');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I para que se lea bien en papel
export const newRecoveryCode = () => { const b = randomBytes(24); let s = ''; for (const x of b) s += ALPHABET[x % ALPHABET.length]; return s.match(/.{4}/g).join('-'); };
const normSecret = (s, kind) => (kind === 'rec' ? String(s).toUpperCase().replace(/[^A-Z0-9]/g, '') : String(s).normalize('NFC'));
const kek = (secret, kind, salt) => scryptSync(normSecret(secret, kind), salt, 32, { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });

function wrap(K, secret, kind) {
  const salt = randomBytes(16), iv = randomBytes(12), c = createCipheriv('aes-256-gcm', kek(secret, kind, salt), iv), ct = Buffer.concat([c.update(K), c.final()]);
  return { salt: b64(salt), iv: b64(iv), ct: b64(ct), tag: b64(c.getAuthTag()) };
}
function unwrap(w, secret, kind) {
  try { const d = createDecipheriv('aes-256-gcm', kek(secret, kind, unb64(w.salt)), unb64(w.iv)); d.setAuthTag(unb64(w.tag)); return Buffer.concat([d.update(unb64(w.ct)), d.final()]); } catch { return null; }
}
// Claves nuevas: la clave de datos (32 bytes), sus dos envolturas y el código de recuperación (se enseña UNA vez).
export function createKeyset(passphrase) {
  if (String(passphrase || '').length < 8) throw fail('La frase de paso debe tener al menos 8 caracteres');
  const key = randomBytes(32), recoveryCode = newRecoveryCode();
  return { key, recoveryCode, wraps: { pass: wrap(key, passphrase, 'pass'), rec: wrap(key, recoveryCode, 'rec') } };
}
// Cambiar la frase de paso sin tocar las copias antiguas: se vuelve a envolver la misma clave.
export const rewrapPassphrase = (key, passphrase, wraps) => ({ ...wraps, pass: wrap(key, passphrase, 'pass') });
export const unlockKey = (wraps, secret) => unwrap(wraps.pass, secret, 'pass') || unwrap(wraps.rec, secret, 'rec');

export function encryptBackup({ files, key, wraps, meta }) {
  const payload = zip(files.map((f) => ({ name: f.name, data: f.data }))), iv = randomBytes(12);
  const head = Buffer.from(JSON.stringify({ v: 1, alg: 'aes-256-gcm', iv: b64(iv), wraps, meta })), len = Buffer.alloc(4); len.writeUInt32LE(head.length);
  const aad = Buffer.concat([MAGIC, len, head]), c = createCipheriv('aes-256-gcm', key, iv); c.setAAD(aad);
  return Buffer.concat([aad, c.update(payload), c.final(), c.getAuthTag()]);
}
export function readHeader(buf) {
  if (buf.length < MAGIC.length + 4 + 16 || !buf.subarray(0, MAGIC.length).equals(MAGIC)) throw fail('No es una copia de REM Negocio (.rembak)');
  const n = buf.readUInt32LE(MAGIC.length); if (n < 2 || n > 1 << 20 || MAGIC.length + 4 + n + 16 > buf.length) throw fail('La copia está dañada (cabecera)');
  let h; try { h = JSON.parse(buf.toString('utf8', MAGIC.length + 4, MAGIC.length + 4 + n)); } catch { throw fail('La copia está dañada (cabecera)'); }
  if (h.v !== 1 || h.alg !== 'aes-256-gcm' || !h.wraps?.pass || !h.wraps?.rec) throw fail('Esta copia es de una versión que no entiendo');
  return { header: h, aadEnd: MAGIC.length + 4 + n };
}
// `secret` = frase de paso o código de recuperación; o { key } si ya se tiene la clave de datos.
export function decryptBackup(buf, secret) {
  const { header, aadEnd } = readHeader(buf), key = secret?.key || unlockKey(header.wraps, secret);
  if (!key) throw fail('La frase de paso o el código de recuperación no son correctos');
  let plain; try { const d = createDecipheriv('aes-256-gcm', key, unb64(header.iv)); d.setAAD(buf.subarray(0, aadEnd)); d.setAuthTag(buf.subarray(buf.length - 16)); plain = Buffer.concat([d.update(buf.subarray(aadEnd, buf.length - 16)), d.final()]); }
  catch { throw fail('La copia está dañada o ha sido modificada'); }
  const z = openZip(plain, ZIP_LIMITS); return { meta: header.meta, names: z.names, read: (n) => { const t = z.bytes(n); if (!t) throw fail(`Falta ${n} en la copia`); return t; } };
}
