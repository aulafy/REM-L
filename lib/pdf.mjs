// PDF → texto (si tiene capa de texto) o imagen de la primera página para el OCR. poppler si existe; si no, PDFKit de macOS.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const binDir = (dataDir) => process.env.REM_BIN_DIR || join(dataDir, 'bin');
const has = (b) => spawnSync('which', [b]).status === 0;
function pdfKitBin(dataDir) {
  if (process.platform !== 'darwin') return null;
  const bin = join(binDir(dataDir), 'pdf-read'); if (existsSync(bin)) return bin;
  if (!has('swiftc')) return null; mkdirSync(binDir(dataDir), { recursive: true });
  return spawnSync('swiftc', ['-O', join(HERE, 'native', 'pdf-read.swift'), '-o', bin], { timeout: 240000 }).status === 0 && existsSync(bin) ? bin : null;
}
export function pdfText(file, dataDir) {
  if (has('pdftotext')) { const r = spawnSync('pdftotext', ['-layout', '-l', '4', file, '-'], { encoding: 'utf8', timeout: 30000 }); if (r.status === 0) return r.stdout.trim(); }
  const k = pdfKitBin(dataDir); if (k) { const r = spawnSync(k, ['text', file], { encoding: 'utf8', timeout: 30000 }); if (r.status === 0) return r.stdout.trim(); }
  return '';
}
// Devuelve la ruta de un PNG con la primera página (el llamador borra el directorio devuelto).
export function pdfPageImage(file, dataDir) {
  const d = mkdtempSync(join(tmpdir(), 'rem-pdf-')), out = join(d, 'p.png');
  if (has('pdftoppm')) { const r = spawnSync('pdftoppm', ['-png', '-r', '170', '-f', '1', '-l', '1', '-singlefile', file, join(d, 'p')], { timeout: 60000 }); if (r.status === 0 && existsSync(out)) return { file: out, done: () => rmSync(d, { recursive: true, force: true }) }; }
  const k = pdfKitBin(dataDir); if (k) { const r = spawnSync(k, ['png', file, out], { timeout: 60000 }); if (r.status === 0 && existsSync(out)) return { file: out, done: () => rmSync(d, { recursive: true, force: true }) }; }
  rmSync(d, { recursive: true, force: true }); return null;
}

// ---------- HTML → PDF (WebKit nativo de macOS; sin JS ni red) ----------
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
function htmlPdfBin(dataDir, sync = true) {
  if (process.platform !== 'darwin') return null;
  const bin = join(binDir(dataDir), 'html-pdf'); if (existsSync(bin)) return bin;
  if (!has('swiftc')) return null; mkdirSync(binDir(dataDir), { recursive: true });
  const args = ['-O', join(HERE, 'native', 'html-pdf.swift'), '-o', bin];
  if (!sync) { spawn('swiftc', args, { stdio: 'ignore', detached: true }).unref(); return null; }
  return spawnSync('swiftc', args, { timeout: 240000 }).status === 0 && existsSync(bin) ? bin : null;
}
export const warmPdf = (dataDir) => { try { if (!existsSync(join(binDir(dataDir), 'html-pdf'))) htmlPdfBin(dataDir, false); } catch {} };
export const pdfAvailable = (dataDir) => process.platform === 'darwin' && (existsSync(join(binDir(dataDir), 'html-pdf')) || has('swiftc'));
// Elimina lo que pudiera ejecutar o cargar algo externo y fuerza una política sin red.
export function sanitizeHtml(h) {
  return String(h).replace(/<\s*(script|iframe|object|embed|link|base|meta|form|svg)\b[\s\S]*?(<\s*\/\s*\1\s*>|$)/gi, '').replace(/<\s*(script|iframe|object|embed|link|base|meta)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '').replace(/\s(href|src|srcset|xlink:href|action|formaction)\s*=\s*("(?!data:image\/(png|jpeg|webp|gif);base64,)[^"]*"|'(?!data:image\/)[^']*')/gi, '');
}
export function htmlToPdf(bodyHtml, dataDir, css = '') {
  const bin = htmlPdfBin(dataDir); if (!bin) return null;
  const d = mkdtempSync(join(tmpdir(), 'rem-hp-')), inp = join(d, 'in.html'), out = join(d, 'out.pdf');
  try {
    writeFileSync(inp, `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>${css}</style></head><body class="doc">${sanitizeHtml(bodyHtml)}</body></html>`);
    const r = spawnSync(bin, [inp, out], { timeout: 60000 }); return r.status === 0 && existsSync(out) ? readFileSync(out) : null;
  } finally { rmSync(d, { recursive: true, force: true }); }
}
