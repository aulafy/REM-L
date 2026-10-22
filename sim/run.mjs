#!/usr/bin/env node
// Simulador de implantación: levanta REM con datos de una pyme ficticia, le conecta un Telegram y un correo simulados,
// hace entrar clientes, desconocidos y mensajes hostiles, y comprueba lo que REM debe (y no debe) hacer.
// Uso: node sim/run.mjs [--profile fontanero|asesoria|tienda|all] [--seed 1] [--clients 30] [--months 12] [--keep]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { generate, PROFILES } from './world.mjs';
import { startTelegramMock } from './telegram-mock.mjs';
import { startMailMock, buildEmail } from './mail-mock.mjs';
import { computeTotals } from '../public/calc.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const opts = { profile: arg('profile', 'all'), seed: Number(arg('seed', 1)), clients: Number(arg('clients', 30)), months: Number(arg('months', 12)), keep: process.argv.includes('--keep') };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((r) => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });
const yesterday = () => { const d = new Date(); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };

async function simulate(name) {
  const fails = [], notes = [];
  const check = (ok, msg) => { console.log(`  ${ok ? '✔' : '✖'} ${msg}`); if (!ok) fails.push(`[${name}] ${msg}`); };
  const world = generate(name, { seed: opts.seed, clients: opts.clients, months: opts.months, today: yesterday() });
  console.log(`\n=== ${name}: ${world.clients.length} clientes · ${world.invoices.length} facturas · ${world.quotes.length} presupuestos · ${world.expenses.length} gastos · ${world.inbound.length} mensajes (semilla ${opts.seed}) ===`);

  const dir = mkdtempSync(join(tmpdir(), `rem-sim-${name}-`)), port = await freePort(), base = `http://127.0.0.1:${port}`;
  const tg = await startTelegramMock(), MAIL_USER = `info@${name}-sim.invalid`, mail = await startMailMock({ users: { [MAIL_USER]: 'sim' } });
  let srv;
  const boot = async () => {
    srv = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'server.mjs'], { cwd: ROOT, stdio: 'pipe', env: { ...process.env, REM_PORT: String(port), REM_DATA_DIR: join(dir, 'data'), REM_NO_KEYCHAIN: '1', REM_PDF_WARM: '0', REM_TELEGRAM_BASE: tg.url, REM_TG_POLL: '1', REM_MAIL_EVERY: '400' } });
    for (let i = 0; i < 80; i++) { try { await fetch(base + '/api/state'); return; } catch { await sleep(100); } }
    throw new Error('REM no arranca');
  };
  const stop = async () => { srv.kill(); await new Promise((r) => srv.once('exit', r)); };
  const call = async (m, p, b) => { const r = await fetch(base + p, { method: m, headers: { 'Content-Type': 'application/json', 'X-REM': '1' }, body: b === undefined ? undefined : JSON.stringify(b) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || r.status), { status: r.status }); return j; };
  const until = async (fn, ms = 20000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(150); } return false; };
  const inMsgs = async () => (await call('GET', '/api/state')).messages.filter((m) => m.direction === 'in');
  try {
    await boot();
    // ---------- 1 · datos de la empresa ----------
    await call('PUT', '/api/settings', { company_name: world.company.name, company_nif: world.company.nif, company_address: 'Calle Simulada 1', company_city: world.company.city, company_zip: '30001' });
    const cid = [];
    for (const c of world.clients) cid[c.idx] = (await call('POST', '/api/clients', { name: c.name, nif: c.nif, email: c.email, phone: c.phone, address: c.address, city: c.city, zip: c.zip })).id;
    let badTotals = 0, paid = 0, expectedPaid = 0;
    const issued = [];
    for (const inv of world.invoices) {
      const d = await call('POST', '/api/documents', { type: 'factura', client_id: cid[inv.clientIdx], issue_date: inv.date, lines: inv.lines, irpf: inv.irpf });
      const out = await call('POST', `/api/documents/${d.id}/issue`); issued.push(out);
      if (out.total !== computeTotals(inv.lines, inv.irpf).total) badTotals++;
      for (const p of inv.pay) { const amount = Math.round(out.total * p.frac); expectedPaid += amount; await call('POST', '/api/payments', { document_id: out.id, amount, date: p.date, method: p.method }); paid += amount; }
    }
    for (const q of world.quotes) { const d = await call('POST', '/api/documents', { type: 'presupuesto', client_id: cid[q.clientIdx], issue_date: q.date, lines: q.lines }); if (q.outcome !== 'enviado') await call('POST', `/api/documents/${d.id}/status`, { status: q.outcome }).catch(() => {}); }
    for (const e of world.expenses) await call('POST', '/api/expenses', e);
    let S = await call('GET', '/api/state');
    check(S.clients.length === world.clients.length, `clientes cargados (${S.clients.length}/${world.clients.length})`);
    check(badTotals === 0, `totales de factura = cálculo independiente (${badTotals} diferencias)`);
    const nums = issued.map((d) => d.number), byYear = {}; for (const n of nums) { const m = /^(\D*)(\d{4})-(\d+)$/.exec(n); if (m) (byYear[m[1] + m[2]] ||= []).push(Number(m[3])); }
    check(new Set(nums).size === nums.length && Object.values(byYear).every((l) => l.sort((a, b) => a - b).every((v, i) => v === i + 1)), `numeración correlativa y sin repetidos (${nums.length} facturas)`);
    check(S.payments.reduce((s, p) => s + p.amount, 0) === expectedPaid, `cobros registrados = cobros simulados (${(expectedPaid / 100).toFixed(2)} €)`);
    check(S.expenses.length === world.expenses.length, `gastos cargados (${S.expenses.length})`);
    const csv = await (await fetch(base + '/api/export.csv?kind=facturas', { headers: { 'X-REM': '1' } })).text();
    check(csv.trim().split('\n').length === world.invoices.length + 1, 'export CSV de facturas: una fila por factura');

    // ---------- 2 · canales ----------
    await call('POST', '/api/channels/telegram', { token: '123456:SIM' });
    await call('POST', '/api/channels/email', { imap_host: '127.0.0.1', imap_port: mail.imapPort, imap_secure: 'plain', smtp_host: '127.0.0.1', smtp_port: mail.smtpPort, smtp_secure: 'plain', email_user: MAIL_USER, email_pass: 'sim' });
    await sleep(1500); // deja que REM haga su primera lectura (con el buzón vacío) antes de que lleguen los correos
    const rows = world.inbound.map((m, i) => ({ ...m, n: i, text: m.text + ` (ref ${i})` }));
    const find = (list, r) => list.find((m) => m.body.includes(`(ref ${r.n})`));
    const emit = (r) => r.channel === 'telegram' ? tg.say({ chat: r.chat, name: r.name, text: r.text }) : mail.deliver(MAIL_USER, { from: r.email, fromName: r.name, subject: r.subject || 'Consulta', text: r.text });
    // Oleada A: todo el correo y el primer Telegram de cada chat. Oleada B: el resto de Telegram (ya vinculados).
    const firstTg = new Map(), A = [], B = [];
    for (const r of rows) { if (r.channel === 'email') A.push(r); else if (!firstTg.has(r.chat)) { firstTg.set(r.chat, r); A.push(r); } else B.push(r); }
    const t0 = Date.now(); A.forEach(emit);
    check(await until(async () => (await inMsgs()).length >= A.length, 30000), `oleada A recibida (${A.length} mensajes) en ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    let got = await inMsgs();
    const missing = A.filter((r) => !find(got, r));
    if (missing.length) { const by = {}; for (const r of missing) { const k = r.channel + (r.clientIdx === null ? '-externo' : ''); by[k] = (by[k] || 0) + 1; } console.log('  · faltan por canal:', JSON.stringify(by), '· email_error:', (await call('GET', '/api/state')).settings.email_error || '(ninguno)'); }
    check(missing.length === 0, `ningún mensaje de la oleada A se pierde (faltan ${missing.length})`);
    check(got.length === A.length, `ni duplicados (${got.length} recibidos / ${A.length} enviados)`);
    const mailKnown = A.filter((r) => r.channel === 'email' && r.clientIdx !== null), wrong = mailKnown.filter((r) => find(got, r)?.client_id !== cid[r.clientIdx]);
    check(wrong.length === 0, `correo de clientes conocidos se asocia al cliente por su dirección (${mailKnown.length - wrong.length}/${mailKnown.length})`);
    const strangers = A.filter((r) => r.clientIdx === null && find(got, r)); check(strangers.every((r) => find(got, r).client_id == null), 'desconocidos y hostiles no se asocian a ningún cliente');
    check(tg.sent.length === 0 && mail.sent.length === 0, 'REM no ha enviado nada por su cuenta (aprobar no es enviar)');

    // vincular los chats de Telegram conocidos y mandar la oleada B
    for (const r of A.filter((x) => x.channel === 'telegram' && x.clientIdx !== null)) await call('POST', `/api/messages/${find(got, r).id}/client`, { client_id: cid[r.clientIdx] });
    B.forEach(emit);
    check(await until(async () => (await inMsgs()).length >= rows.length, 30000), `oleada B recibida (${B.length} mensajes de Telegram)`);
    got = await inMsgs(); const wrongB = B.filter((r) => r.clientIdx !== null && find(got, r)?.client_id !== cid[r.clientIdx]);
    check(wrongB.length === 0, `Telegram posterior a vincular se asocia solo al cliente (${B.length - wrongB.length}/${B.length})`);

    // ---------- 3 · hostiles ----------
    S = await call('GET', '/api/state');
    check(S.documents.length === world.invoices.length + world.quotes.length && S.clients.length === world.clients.length, 'los mensajes hostiles no crean facturas ni borran clientes');
    check(tg.sent.length === 0 && mail.sent.length === 0, 'ni siquiera con inyección de instrucciones sale algo sin que la persona lo apruebe');
    const long = rows.find((r) => r.expect === 'largo'); check((find(got, long)?.body.length || 0) > 5000, 'un mensaje de 7000 caracteres se guarda sin romper nada');
    const weird = rows.find((r) => r.expect === 'raro'); check(find(got, weird)?.body.includes('Ñandú') && find(got, weird).body.includes('日本語'), 'acentos, emojis y alfabetos distintos llegan intactos');

    // ---------- 4 · responder ----------
    const known = rows.filter((r) => r.clientIdx !== null).slice(0, 12); let delivered = 0;
    for (const r of known) { const m = find(got, r); await call('POST', `/api/messages/${m.id}/send`, { text: `Respuesta simulada a ${r.name} ✔ (ref ${r.n})` }); }
    for (const r of known) { const ok = r.channel === 'telegram' ? tg.sent.some((s) => String(s.chat.id) === r.chat && s.text.includes(`(ref ${r.n})`)) : mail.sent.some((s) => s.to === r.email && /\(ref \d+\)|Respuesta simulada/.test(Buffer.from(s.raw.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\s/g, ''), 'base64').toString())); if (ok) delivered++; }
    check(delivered === known.length, `respuestas aprobadas llegan a su destinatario correcto (${delivered}/${known.length})`);
    check(mail.sent.every((s) => /^Subject: (Re:|=\?UTF-8)/m.test(s.raw)), 'las respuestas por correo llevan «Re:» en el asunto');

    // ---------- 5 · reinicio sin duplicar ----------
    const before = (await inMsgs()).length; await stop(); await boot();
    // Sin llavero (REM_NO_KEYCHAIN) los secretos solo viven en memoria: se reconectan los canales, que además relee el buzón entero y prueba la deduplicación.
    await call('POST', '/api/channels/telegram', { token: '123456:SIM' });
    await call('POST', '/api/channels/email', { imap_host: '127.0.0.1', imap_port: mail.imapPort, imap_secure: 'plain', smtp_host: '127.0.0.1', smtp_port: mail.smtpPort, smtp_secure: 'plain', email_user: MAIL_USER, email_pass: 'sim' });
    await sleep(2500);
    check((await inMsgs()).length === before, `reiniciar REM no vuelve a leer lo ya leído (${before} mensajes)`);
    const extra = { n: 9001, channel: 'email', email: 'despues@sim-externo.invalid', name: 'Después del reinicio', subject: 'Hola', text: 'Mensaje tras reiniciar (ref 9001)' }; emit(extra);
    const tgExtra = { n: 9002, channel: 'telegram', chat: '991000001', name: 'Telegram tras reinicio', text: 'Hola otra vez (ref 9002)' }; emit(tgExtra);
    check(await until(async () => { const g = await inMsgs(); return find(g, extra) && find(g, tgExtra); }, 20000), 'tras reiniciar, siguen entrando mensajes nuevos de ambos canales');
    check((await inMsgs()).length === before + 2, 'exactamente 2 mensajes nuevos, ninguno repetido');

    // ---------- 6 · fallos de los servicios ----------
    tg.fail(2); mail.dropConnections(2);
    const f1 = { n: 9003, channel: 'email', email: 'caida@sim-externo.invalid', name: 'Durante la caída', subject: 'Hola', text: 'Mientras el servidor falla (ref 9003)' }; emit(f1);
    const f2 = { n: 9004, channel: 'telegram', chat: '991000002', name: 'Telegram caído', text: 'Con Telegram fallando (ref 9004)' }; emit(f2);
    check(await until(async () => { const g = await inMsgs(); return find(g, f1) && find(g, f2); }, 40000), 'REM se recupera solo tras caídas del correo y de Telegram, sin perder mensajes');

    // ---------- 7 · rendimiento y salud ----------
    let t = performance.now(); const st = await call('GET', '/api/state'); const ms = performance.now() - t;
    notes.push(`/api/state: ${(JSON.stringify(st).length / 1e6).toFixed(2)} MB en ${ms.toFixed(0)} ms`);
    await stop(); const ro = new DatabaseSync(join(dir, 'data', 'negocio.db'), { readOnly: true }); const ic = Object.values(ro.prepare('PRAGMA integrity_check').get())[0]; ro.close();
    check(ic === 'ok', 'integridad de la base de datos tras todo el recorrido');
  } catch (e) { fails.push(`[${name}] EXCEPCIÓN: ${e.stack || e.message}`); console.error(e); }
  finally { try { srv.kill(); } catch {} await tg.close(); await mail.close(); if (!opts.keep) rmSync(dir, { recursive: true, force: true }); else console.log('  datos en', dir); }
  for (const n of notes) console.log('  ·', n);
  return fails;
}

const names = opts.profile === 'all' ? Object.keys(PROFILES) : [opts.profile];
const all = []; for (const n of names) all.push(...await simulate(n));
console.log(all.length ? `\n${all.length} FALLO(S):\n - ${all.join('\n - ')}` : '\nTodo correcto.');
process.exit(all.length ? 1 : 0);
