// PDF → texto (si tiene capa de texto) o imagen de la primera página para el OCR. poppler si existe; si no, PDFKit de macOS.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const has = (b) => spawnSync('which', [b]).status === 0;
function pdfKitBin(dataDir) {
  if (process.platform !== 'darwin') return null;
  const bin = join(dataDir, 'bin', 'pdf-read'); if (existsSync(bin)) return bin;
  if (!has('swiftc')) return null; mkdirSync(join(dataDir, 'bin'), { recursive: true });
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
