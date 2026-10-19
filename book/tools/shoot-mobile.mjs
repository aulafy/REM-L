import { launch, sleep } from '../../promo/cdp.mjs';
const REM = 'http://127.0.0.1:4801', OUT = process.argv[2] || '../figures';
const b = await launch(9604); const w = await b.newPage(); await w.scheme('light'); await w.viewport(390, 844, 3, true);
await w.goto(REM + '/', 500); await w.eval("localStorage.setItem('rem-theme','light')");
for (const [n, r] of [['e42-movil-hoy', 'hoy'], ['e43-movil-facturas', 'facturas']]) { await w.goto(`${REM}/#/${r}`, 400); await w.eval('location.reload()'); await sleep(1300); await w.eval("document.querySelector('[data-act=dismissChecklist]')?.click()"); await sleep(200); await w.shot(`${OUT}/${n}.png`); }
b.kill(); process.exit(0);
