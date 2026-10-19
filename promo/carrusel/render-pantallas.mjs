import { launch, sleep } from '../cdp.mjs';
import { mkdirSync } from 'node:fs'; import { dirname, join } from 'node:path'; import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url)), out = join(here, 'out'); mkdirSync(out, { recursive: true });
const b = await launch(9622); const p = await b.newPage(); await p.viewport(1080, 1350, 1);
await p.goto(`file://${join(here, 'pantallas.html')}`, 1200); await p.eval('Promise.all([...document.images].map(i=>i.decode().catch(()=>{})))');
for (let i = 0; i < 8; i++) { await p.eval(`window.scrollTo(0, ${i * 1350})`); await sleep(150); await p.shot(join(out, `pantalla-${i + 1}.png`), { x: 0, y: i * 1350, width: 1080, height: 1350 }); }
b.kill(); process.exit(0);
