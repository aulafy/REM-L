// Genera el carrusel de LinkedIn (PDF 1080×1350 por página y PNG por diapositiva) desde carrusel.html.
import { launch, sleep } from '../cdp.mjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), out = process.argv[2] || join(here, 'out'); mkdirSync(out, { recursive: true });
const b = await launch(9611); const p = await b.newPage(); await p.viewport(1080, 1350, 1);
await p.goto(`file://${join(here, 'carrusel.html')}`, 1200); await p.eval('Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))');
const pdf = await p.send('Page.printToPDF', { printBackground: true, preferCSSPageSize: true, marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 });
writeFileSync(join(out, 'REM-carrusel-linkedin.pdf'), Buffer.from(pdf.data, 'base64'));
const n = await p.eval('document.querySelectorAll(".s").length');
for (let i = 0; i < n; i++) { await p.eval(`window.scrollTo(0, ${i * 1350})`); await sleep(150); await p.shot(join(out, `diapositiva-${i + 1}.png`), { x: 0, y: i * 1350, width: 1080, height: 1350 }); }
b.kill(); console.log('ok', n); process.exit(0);
