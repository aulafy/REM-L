// REM Clientes · protocolo v0 (PROTOTIPO). Una sola implementación para el navegador del cliente y para REM (Node ≥ 22): WebCrypto.
//   Identidad: ECDH P-256 (clave pública = punto sin comprimir de 65 bytes). Huella = base64url(SHA-256(pública))[0..22].
//   Sesión: secreto ECDH → HKDF-SHA-256 (sal «rem-clientes-v0», info «biz|cfp») → AES-256-GCM, IV aleatorio de 12 bytes,
//           datos autenticados «rem0|biz|cfp|c2b» (cliente→empresa) o «…|b2c». Sin secreto adelantado (forward secrecy): es un prototipo.
const te = new TextEncoder(), td = new TextDecoder(), subtle = globalThis.crypto.subtle;
export const toB64u = (u8) => btoa(String.fromCharCode(...new Uint8Array(u8))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64u = (s) => { const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((String(s).length + 3) % 4)); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };

const rawFromJwk = (jwk) => { const x = fromB64u(jwk.x), y = fromB64u(jwk.y); const r = new Uint8Array(65); r[0] = 4; r.set(x, 1); r.set(y, 33); return r; };
export async function generateIdentity() {
  const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), jwk = await subtle.exportKey('jwk', kp.privateKey);
  return { priv: kp.privateKey, pubRaw: new Uint8Array(await subtle.exportKey('raw', kp.publicKey)), jwk };
}
export async function importIdentity(jwk) { return { priv: await subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), pubRaw: rawFromJwk(jwk), jwk }; }
export async function fingerprint(pubRaw) { return toB64u(new Uint8Array(await subtle.digest('SHA-256', pubRaw))).slice(0, 22); }

export async function sessionKey(priv, theirPubRaw, biz, cfp) {
  if (theirPubRaw.length !== 65 || theirPubRaw[0] !== 4) throw new Error('Clave pública no válida');
  const pub = await subtle.importKey('raw', theirPubRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const secret = await subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256), base = await subtle.importKey('raw', secret, 'HKDF', false, ['deriveKey']);
  return subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: te.encode('rem-clientes-v0'), info: te.encode(`${biz}|${cfp}`) }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const aad = (biz, cfp, dir) => te.encode(`rem0|${biz}|${cfp}|${dir}`);
export async function seal(key, payload, ctx) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12)), ct = await subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(ctx.biz, ctx.cfp, ctx.dir) }, key, te.encode(JSON.stringify(payload)));
  return { iv: toB64u(iv), ct: toB64u(ct) };
}
export async function open(key, env, ctx) {
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: fromB64u(env.iv), additionalData: aad(ctx.biz, ctx.cfp, ctx.dir) }, key, fromB64u(env.ct));
  return JSON.parse(td.decode(pt));
}
// Tipos de mensaje (payload.t): hello · text · quote · quote_reply · pay · paid_claim · status
export const TYPES = ['hello', 'text', 'quote', 'quote_reply', 'pay', 'paid_claim', 'status'];
