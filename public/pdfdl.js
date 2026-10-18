// Descarga y adjunto de PDF: el servidor convierte el HTML con el WebKit nativo de macOS (sin internet).
import { toast } from './core.js';
export async function makePdf(html, filename) {
  const r = await fetch('/api/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: JSON.stringify({ html, filename }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No se pudo generar el PDF');
  return r.blob();
}
export async function downloadPdf(html, filename) {
  try { const blob = await makePdf(html, filename); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename.replace(/[^\w.\- ]+/g, '_') + '.pdf'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('PDF descargado'); }
  catch (e) { toast(e.message + (/Imprimir/.test(e.message) ? '' : ''), 'err'); if (/no puede generar/.test(e.message)) window.print(); }
}
export const blobToBase64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = rej; r.readAsDataURL(blob); });

// Word editable (.docx) desde el mismo texto con formato sencillo; se genera en el servidor, sin internet.
export async function downloadDocx(text, filename) {
  try {
    const r = await fetch('/api/docx', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: JSON.stringify({ text, filename }) });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'No se pudo generar el Word');
    const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = filename.replace(/[^\w.\- ñáéíóúüÑÁÉÍÓÚÜ]+/g, '_') + '.docx'; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Word descargado');
  } catch (e) { toast(e.message, 'err'); }
}
