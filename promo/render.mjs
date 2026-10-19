// Renderiza el vídeo fotograma a fotograma desde scene.html (determinista: render(t)) y lo guarda como JPEG.
import { launch } from './cdp.mjs';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
const [, , dir = '/tmp/promo/build', fps = '30', dur = '60', every = '1', pre = 'f'] = process.argv; const FPS = Number(fps), N = Math.round(Number(dur) * FPS);
mkdirSync(`${dir}/frames`, { recursive: true });
const b = await launch(9444); const p = await b.newPage(); await p.viewport(1920, 1080, 1);
await p.goto(`file://${dir}/scene.html`, 500); await p.eval('window.__ready'); 
const t0 = Date.now();
for (let i = 0; i < N; i += Number(every)) {
  await p.eval(`render(${(i / FPS).toFixed(4)})`);
  const r = await p.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, optimizeForSpeed: true }); writeFileSync(`${dir}/frames/${pre}${String(i).padStart(5, '0')}.jpg`, Buffer.from(r.data, 'base64'));
  if (i % 150 === 0) console.log(`frame ${i}/${N} · ${((Date.now() - t0) / 1000).toFixed(0)} s`);
}
b.kill(); process.exit(0);
