// dBase / FoxPro (.dbf): el formato de tablas de muchos programas de gestión antiguos. Solo lectura, sin dependencias.
// Soporta C, N, F, D, L, I, Y, B, T (los memos .dbt se ignoran). Los registros borrados se saltan.
const fail = (m) => Object.assign(new Error(m), { user: true });
const HI = {
  850: 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ',
  437: 'ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜ¢£¥₧ƒáíóúñÑªº¿⌐¬½¼¡«»░▒▓│┤╡╢╖╕╣║╗╝╜╛┐└┴┬├─┼╞╟╚╔╩╦╠═╬╧╨╤╥╙╘╒╓╫╪┘┌█▄▌▐▀αßΓπΣσµτΦΘΩδ∞φε∩≡±≥≤⌠⌡÷≈°∙·√ⁿ²■ ',
};
// Byte de «language driver» (posición 29) → codificación.
const CP = { 0x01: 437, 0x02: 850, 0x03: 'windows-1252', 0x57: 'windows-1252', 0x58: 'windows-1252', 0x59: 'windows-1252', 0x64: 'iso-8859-2', 0xc8: 'windows-1250', 0x65: 'ibm866', 0x66: 'ibm866', 0xc9: 'windows-1251' };
function decoder(code, bytes) {
  const enc = CP[code];
  if (enc === 437 || enc === 850) { const t = HI[enc]; return (b) => { let s = ''; for (const x of b) s += x < 128 ? String.fromCharCode(x) : t[x - 128]; return s; }; }
  if (enc) { const d = new TextDecoder(enc); return (b) => d.decode(b); }
  // sin driver: UTF-8 si cuadra con todo el archivo, si no Windows-1252
  let utf = true; try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { utf = false; }
  const d = new TextDecoder(utf ? 'utf-8' : 'windows-1252'); return (b) => d.decode(b);
}
const julian = (n) => { const d = new Date(Date.UTC(1970, 0, 1) + (n - 2440588) * 864e5); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; };

export function parseDbf(buf, { maxRows = 20000 } = {}) {
  if (buf.length < 33) throw fail('El archivo no es un DBF válido');
  const ver = buf[0]; if (![0x02, 0x03, 0x04, 0x05, 0x30, 0x31, 0x32, 0x83, 0x8b, 0xf5, 0xfb].includes(ver)) throw fail('El archivo no parece una tabla dBase/FoxPro (.dbf)');
  const count = buf.readUInt32LE(4), headLen = buf.readUInt16LE(8), recLen = buf.readUInt16LE(10), lang = buf[29];
  if (headLen < 33 || headLen > buf.length || recLen < 2 || recLen > 65535) throw fail('La cabecera del DBF está dañada');
  const dec = decoder(lang, buf.subarray(headLen)), fields = []; let off = 1;
  for (let p = 32; p + 32 <= headLen && buf[p] !== 0x0d; p += 32) {
    const nameBytes = buf.subarray(p, p + 11), z = nameBytes.indexOf(0), name = Buffer.from(z < 0 ? nameBytes : nameBytes.subarray(0, z)).toString('latin1').trim(), type = String.fromCharCode(buf[p + 11]), len = buf[p + 16], decs = buf[p + 17];
    if (fields.length >= 255) throw fail('Demasiados campos'); fields.push({ name: name || `CAMPO${fields.length + 1}`, type, len, decs, off }); off += len;
  }
  if (!fields.length) throw fail('El DBF no tiene campos'); if (off > recLen) throw fail('La definición de campos no cuadra con el tamaño del registro');
  const rows = [], total = Math.min(count, Math.floor((buf.length - headLen) / recLen)); let truncated = false;
  for (let r = 0; r < total; r++) {
    const base = headLen + r * recLen; if (buf[base] === 0x2a) continue; // borrado
    if (rows.length >= maxRows) { truncated = true; break; }
    rows.push(fields.map((f) => {
      const raw = buf.subarray(base + f.off, base + f.off + f.len);
      switch (f.type) {
        case 'C': { let e = raw.length; while (e > 0 && (raw[e - 1] === 0x20 || raw[e - 1] === 0)) e--; return dec(raw.subarray(0, e)).trim(); }
        case 'N': case 'F': { const t = raw.toString('latin1').trim(); return /^-?\d*\.?\d*$/.test(t) && /\d/.test(t) ? t.replace('.', ',') : ''; }
        case 'D': { const t = raw.toString('latin1').trim(); return /^\d{8}$/.test(t) && t !== '00000000' ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : ''; }
        case 'L': return /[TtYy]/.test(String.fromCharCode(raw[0])) ? 'sí' : /[FfNn]/.test(String.fromCharCode(raw[0])) ? 'no' : '';
        case 'I': return f.len === 4 ? String(raw.readInt32LE(0)) : '';
        case 'Y': return f.len === 8 ? (Number(raw.readBigInt64LE(0)) / 1e4).toFixed(2).replace('.', ',') : '';
        case 'B': return f.len === 8 ? String(+raw.readDoubleLE(0).toPrecision(15)).replace('.', ',') : '';
        case 'T': { if (f.len !== 8) return ''; const d = raw.readInt32LE(0); return d > 0 ? julian(d) : ''; }
        default: return ''; // M (memo), G, etc.
      }
    }));
  }
  return { headers: fields.map((f) => f.name), rows, total: count, truncated, encoding: CP[lang] ?? 'auto' };
}
