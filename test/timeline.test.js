import test from 'node:test';
import assert from 'node:assert/strict';
import { timelineOf } from '../public/timeline.js';

const nb = (x) => String(x).replace(/\u00a0/g, ' ');
const S = {
  serverDate: '2026-10-18', settings: {},
  clients: [{ id: 1, name: 'Ana', created_at: '2026-01-05T10:00:00.000Z' }, { id: 2, name: 'Otro', created_at: '2026-01-06T10:00:00.000Z' }],
  messages: [{ id: 1, client_id: 1, channel: 'telegram', direction: 'in', body: 'Hola,   ¿cuánto cuesta?\n' + 'x'.repeat(300), subject: '', created_at: '2026-10-10T09:00:00.000Z' }, { id: 2, client_id: 1, channel: 'email', direction: 'out', body: 'Son 120 €', subject: '', created_at: '2026-10-10T09:30:00.000Z' }, { id: 3, client_id: 2, channel: 'telegram', direction: 'in', body: 'de otro', created_at: '2026-10-11T09:00:00.000Z' }],
  documents: [
    { id: 10, type: 'factura', status: 'emitida', number: 'F1', client_id: 1, total: 100000, issue_date: '2026-09-01', due_date: '2026-10-01', created_at: '2026-09-01T08:00:00.000Z' },
    { id: 11, type: 'factura', status: 'emitida', number: 'F2', client_id: 1, total: 50000, issue_date: '2026-10-05', due_date: '2026-11-04', created_at: '2026-10-05T08:00:00.000Z' },
    { id: 12, type: 'factura', status: 'borrador', number: '', client_id: 1, total: 700, issue_date: '2026-10-17', created_at: '2026-10-17T08:00:00.000Z' },
    { id: 13, type: 'presupuesto', status: 'aceptado', number: 'P1', client_id: 1, total: 90000, issue_date: '2026-08-01', due_date: '2026-08-31', created_at: '2026-08-01T08:00:00.000Z', updated_at: '2026-08-10T10:00:00.000Z' },
    { id: 14, type: 'presupuesto', status: 'enviado', number: 'P2', client_id: 1, total: 30000, issue_date: '2026-10-12', due_date: '2026-11-11', created_at: '2026-10-12T08:00:00.000Z', updated_at: '2026-10-12T08:00:00.000Z' },
    { id: 15, type: 'factura', status: 'emitida', number: 'F9', client_id: 2, total: 1, issue_date: '2026-10-01', due_date: '2026-11-01', created_at: '2026-10-01T08:00:00.000Z' }],
  payments: [{ id: 1, document_id: 10, date: '2026-10-08', amount: 40000, method: 'bizum' }, { id: 2, document_id: 15, date: '2026-10-09', amount: 1, method: 'x' }],
  tasks: [{ id: 1, client_id: 1, title: 'Llamar', due: '2026-10-25', done: 0, created_at: '2026-10-11T08:00:00.000Z' }, { id: 2, client_id: 1, title: 'Enviar plano', due: '2026-10-09', done: 1, created_at: '2026-10-08T08:00:00.000Z' }, { id: 3, client_id: 2, title: 'ajena', due: '', done: 0, created_at: '2026-10-08T08:00:00.000Z' }],
  memory: [{ id: 1, client_id: 1, text: 'Prefiere las tardes', created_at: '2026-10-12T08:00:00.000Z' }, { id: 2, client_id: null, text: 'general', created_at: '2026-10-12T08:00:00.000Z' }],
  recurring: [{ id: 1, client_id: 1, active: true, name: 'Mantenimiento', next_date: '2026-11-20' }, { id: 2, client_id: 1, active: false, name: 'Pausado', next_date: '2026-11-21' }],
};

test('historial: solo el cliente, ordenado del más reciente al más antiguo', () => {
  const { past } = timelineOf(S, 1); assert.ok(past.every((i, k) => k === 0 || past[k - 1].at >= i.at), 'orden descendente');
  const ids = past.map((i) => i.id); assert.ok(!ids.includes('m3') && !ids.includes('d15') && !ids.includes('p2') && !ids.includes('t3') && !ids.includes('me2'), 'nada de otros clientes ni de memoria general');
  assert.deepEqual(ids.slice(0, 3), ['d12', 'me1', 'dq14'].filter((x) => ids.includes(x)).length ? ids.slice(0, 3) : ids.slice(0, 3)); assert.equal(ids.at(-1), 'c1', 'lo primero que pasó: el cliente se creó');
});
test('historial: facturas, cobros, presupuestos, mensajes, tareas y memoria con sus textos', () => {
  const { past } = timelineOf(S, 1), by = (id) => past.find((i) => i.id === id);
  assert.equal(by('d10').title, 'Factura F1 emitida'); assert.equal(nb(by('d10').detail), '1000,00 €'); assert.equal(nb(by('p1').title), 'Cobro de 400,00 €'); assert.match(by('p1').detail, /F1 · bizum/);
  assert.equal(by('d13').title, 'Presupuesto P1 creado'); assert.equal(by('ds13').title, 'Presupuesto P1 aceptado'); assert.equal(by('d12').title, 'Borrador de factura creado');
  assert.equal(by('m1').title, 'Telegram recibido'); assert.equal(by('m1').detail.length, 140); assert.ok(!by('m1').detail.includes('\n')); assert.equal(by('m2').title, 'Respondiste por Correo');
  assert.equal(by('t2').title, 'Tarea hecha: Enviar plano'); assert.equal(by('me1').title, 'Se recuerda: Prefiere las tardes'); assert.equal(by('m1').href, '#/mensajes/1'); assert.equal(by('d10').group, 'facturacion'); assert.equal(by('m1').group, 'mensajes');
});
test('historial: lo vencido aparece como vencido y lo futuro va a «Próximamente»', () => {
  const { upcoming, past } = timelineOf(S, 1); assert.ok(past.some((i) => i.id === 'dv10' && i.kind === 'vencida' && i.title === 'F1 vencida' && nb(i.detail) === 'Pendiente 600,00 €'), 'F1 vencida con lo que falta por cobrar');
  assert.deepEqual(upcoming.map((i) => i.id), ['dv11', 'dq14', 'tv1', 'r1'].sort((a, b) => ({ dv11: '2026-11-04', dq14: '2026-11-11', tv1: '2026-10-25', r1: '2026-11-20' }[a]).localeCompare({ dv11: '2026-11-04', dq14: '2026-11-11', tv1: '2026-10-25', r1: '2026-11-20' }[b])));
  assert.ok(!upcoming.some((i) => i.id === 'r2'), 'recurrente pausado fuera'); assert.ok(!past.some((i) => ['dv11', 'tv1'].includes(i.id)));
});
test('historial: cliente inexistente o sin actividad', () => { assert.deepEqual(timelineOf(S, 99), { upcoming: [], past: [] }); const t = timelineOf({ ...S, messages: [], documents: [], payments: [], tasks: [], memory: [], recurring: [] }, 2); assert.equal(t.past.length, 1); assert.equal(t.upcoming.length, 0); });
