import { launch, sleep } from './cdp.mjs';
const REM = 'http://127.0.0.1:4701', OUT = '/tmp/promo/shots';
const S = await (await fetch(REM + '/api/state')).json();
const msg = S.messages.find((m) => m.channel === 'rem' && /cocina/.test(m.body)), q = S.documents.find((d) => d.type === 'presupuesto' && d.status === 'aceptado' && /P2026-0003/.test(d.number));
const b = await launch(9555); const w = await b.newPage(); await w.scheme('light'); await w.viewport(1440, 900, 2);
const open = async (u, ms = 1600) => { await w.goto('about:blank', 100); await w.goto(REM + '/', 600); await w.eval("localStorage.setItem('rem-theme','light')"); await w.goto(u, ms); await w.eval("location.reload()"); await sleep(ms); };
await open(`${REM}/#/mensajes/${msg.id}`); await w.shot(`${OUT}/e7-mensaje-cliente.png`);
await open(`${REM}/#/presupuestos/${q.id}`); await w.shot(`${OUT}/e8-presupuesto-aceptado.png`);
console.log(msg.id, q.id, q.number); b.kill(); process.exit(0);
