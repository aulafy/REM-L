import { store, on, field, formModal, mutate, confirmBox, toast, go, openModal } from './core.js';
import { html, raw, eur, eurPlain, toCents, esc, clientOf, icon, fdate } from './util.js';
import { validNif, today, addDays } from './calc.js';

const val = (v) => (v == null ? '' : v);

export function clientModal(c = null, done) {
  return formModal({
    title: c ? 'Editar cliente' : 'Nuevo cliente', wide: true, submit: c ? 'Guardar cambios' : 'Crear cliente',
    fields: [field({ name: 'name', label: 'Nombre o razón social', value: val(c?.name), required: true, cls: 'full', attrs: 'autofocus autocomplete="off"' }),
      field({ name: 'nif', label: 'NIF / CIF', value: val(c?.nif), hint: 'Necesario para emitir facturas' }), field({ name: 'email', label: 'Email', type: 'email', value: val(c?.email) }),
      field({ name: 'phone', label: 'Teléfono', type: 'tel', value: val(c?.phone) }), field({ name: 'address', label: 'Dirección', value: val(c?.address) }),
      field({ name: 'city', label: 'Población', value: val(c?.city) }), field({ name: 'zip', label: 'Código postal', value: val(c?.zip) }),
      field({ name: 'notes', label: 'Notas internas', rows: 3, value: val(c?.notes), cls: 'full' })].map(String).join('').replace(/class="field full"/g, 'class="field" style="grid-column:1/-1"'),
    onSubmit: async (v, close) => {
      if (v.nif && !validNif(v.nif)) throw new Error('El NIF/CIF no parece válido. Revisa las letras y los números.');
      const row = await mutate(c ? 'PUT' : 'POST', c ? `/api/clients/${c.id}` : '/api/clients', v, c ? 'Cliente actualizado' : 'Cliente creado');
      close(); done?.(row);
    },
  });
}

export function expenseModal(e = null) {
  const cats = ['alquiler', 'material', 'suministros', 'vehículo', 'servicios profesionales', 'marketing', 'impuestos y tasas', 'otros'];
  const m = formModal({
    title: e ? 'Editar gasto' : 'Nuevo gasto', wide: true, submit: e ? 'Guardar cambios' : 'Añadir gasto',
    fields: [field({ name: 'concept', label: 'Concepto', value: val(e?.concept), required: true, attrs: 'autofocus' }), field({ name: 'supplier', label: 'Proveedor', value: val(e?.supplier) }),
      field({ name: 'date', label: 'Fecha', type: 'date', value: e?.date || today(), required: true }), field({ name: 'category', label: 'Categoría', options: cats.map((c) => [c, c[0].toUpperCase() + c.slice(1)]), value: e?.category || 'otros' }),
      field({ name: 'amount', label: 'Importe', value: e ? eurPlain(e.total) : '', required: true, hint: 'Lo que figura en la factura, con IVA incluido', attrs: 'inputmode="decimal" placeholder="0,00"' }),
      field({ name: 'iva', label: 'IVA incluido', options: [[21, '21 %'], [10, '10 %'], [4, '4 %'], [0, 'Sin IVA']], value: e?.iva ?? 21 }),
      field({ name: 'status', label: 'Pago', options: [['paid', 'Ya pagado'], ['pending', 'Pendiente de pago']], value: e?.pending ? 'pending' : 'paid' }),
      field({ name: 'due', label: 'Vence el', type: 'date', value: e?.due || '', hint: 'Si lo dejas vacío, 30 días después de la fecha', cls: 'due-field' })].join(''),
    onSubmit: async (v, close) => {
      const total = toCents(v.amount); if (total <= 0) throw new Error('Introduce un importe mayor que cero.');
      const iva = Number(v.iva), base = Math.round(total / (1 + iva / 100)), pending = v.status === 'pending';
      await mutate(e ? 'PUT' : 'POST', e ? `/api/expenses/${e.id}` : '/api/expenses', { ...v, base, total, iva, pending, due: pending ? v.due : (e?.due || '') }, e ? 'Gasto actualizado' : pending ? 'Gasto añadido a pagos pendientes' : 'Gasto añadido'); close();
    },
  });
  const sel = m.el.querySelector('[name=status]'), due = m.el.querySelector('[name=due]')?.closest('.field') || m.el.querySelector('.due-field'), sync = () => { if (due) due.style.display = sel.value === 'pending' ? '' : 'none'; };
  sel?.addEventListener('change', sync); sync();
}

export function taskModal(t = null, preset = {}) {
  const S = store.S;
  formModal({
    title: t ? 'Editar tarea' : 'Nueva tarea', submit: t ? 'Guardar' : 'Añadir tarea',
    fields: [field({ name: 'title', label: '¿Qué hay que hacer?', value: val(t?.title ?? preset.title), required: true, attrs: 'autofocus' }), field({ name: 'due', label: 'Fecha límite', type: 'date', value: t?.due ?? preset.due ?? '' }),
      field({ name: 'client_id', label: 'Cliente (opcional)', combo: true, options: [['', '— Ninguno —'], ...S.clients.filter((c) => !c.archived).map((c) => [c.id, c.name])], value: t?.client_id ?? preset.client_id ?? '' })].join(''),
    onSubmit: async (v, close) => { await mutate(t ? 'PUT' : 'POST', t ? `/api/tasks/${t.id}` : '/api/tasks', { ...t, ...v, document_id: t?.document_id ?? preset.document_id }, t ? 'Tarea actualizada' : 'Tarea añadida'); close(); },
  });
}

export function paymentModal(doc) {
  const S = store.S;
  const paid = S.payments.filter((p) => p.document_id === doc.id).reduce((a, p) => a + p.amount, 0), pending = doc.total - paid;
  formModal({
    title: `Registrar cobro · ${doc.number}`, submit: 'Registrar cobro',
    fields: [html`<div class="notice" style="grid-column:1/-1">${icon('coins')}<span>Pendiente de cobro: <b>${eur(pending)}</b> de ${eur(doc.total)}.</span></div>`,
      field({ name: 'amount', label: 'Importe cobrado', value: eurPlain(pending), required: true, attrs: 'inputmode="decimal" autofocus' }), field({ name: 'date', label: 'Fecha del cobro', type: 'date', value: today(), required: true }),
      field({ name: 'method', label: 'Forma de pago', options: [['transferencia', 'Transferencia'], ['efectivo', 'Efectivo'], ['tarjeta', 'Tarjeta'], ['bizum', 'Bizum'], ['domiciliación', 'Domiciliación'], ['otro', 'Otro']] }),
      field({ name: 'note', label: 'Nota', placeholder: 'Opcional' })].join(''),
    onSubmit: async (v, close) => {
      await mutate('POST', '/api/payments', { document_id: doc.id, amount: toCents(v.amount), date: v.date, method: v.method, note: v.note }, 'Cobro registrado'); close();
    },
  });
}

export function itemModal(it = null) {
  formModal({
    title: it ? 'Editar artículo' : 'Nuevo artículo o servicio', submit: it ? 'Guardar' : 'Crear',
    fields: [field({ name: 'name', label: 'Nombre', value: val(it?.name), required: true, attrs: 'autofocus' }), field({ name: 'description', label: 'Descripción', value: val(it?.description) }),
      field({ name: 'price', label: 'Precio (sin IVA)', value: it ? eurPlain(it.price) : '', attrs: 'inputmode="decimal" placeholder="0,00"' }), field({ name: 'iva', label: 'IVA', options: [[21, '21 %'], [10, '10 %'], [4, '4 %'], [0, 'Exento (0 %)']], value: it?.iva ?? 21 }),
      field({ name: 'unit', label: 'Unidad', value: it?.unit || 'ud', hint: 'ud, h, mes, kg…' })].join(''),
    onSubmit: async (v, close) => { await mutate(it ? 'PUT' : 'POST', it ? `/api/items/${it.id}` : '/api/items', { ...v, price: toCents(v.price) }, it ? 'Artículo actualizado' : 'Artículo creado'); close(); },
  });
}

export function registerActions() {
  const S = () => store.S;
  const byId = (el, list) => S()[list].find((x) => x.id === Number(el.dataset.id));
  on('newClient', () => clientModal());
  on('editClient', (el) => clientModal(byId(el, 'clients')));
  on('newExpense', () => expenseModal());
  on('editExpense', (el) => expenseModal(byId(el, 'expenses')));
  on('payExpense', async (el) => { const e = byId(el, 'expenses'); await mutate('PUT', `/api/expenses/${e.id}`, { pending: false, paid_date: today() }, `«${e.concept}» marcado como pagado`); });
  on('newTask', (el) => taskModal(null, el?.dataset?.client ? { client_id: el.dataset.client } : {}));
  on('editTask', (el) => taskModal(byId(el, 'tasks')));
  on('newItem', () => itemModal());
  on('editItem', (el) => itemModal(byId(el, 'items')));
  on('toggleTask', async (el) => { const t = byId(el, 'tasks'); await mutate('PUT', `/api/tasks/${t.id}`, { ...t, done: t.done ? 0 : 1 }); });
  on('deleteTask', async (el) => { const t = byId(el, 'tasks'); await mutate('DELETE', `/api/tasks/${t.id}`); toast('Tarea eliminada', '', { label: 'Deshacer', run: () => mutate('POST', '/api/tasks', { title: t.title, due: t.due, client_id: t.client_id, done: t.done }, 'Tarea recuperada') }); });
  on('deleteExpense', async (el) => { const e = byId(el, 'expenses'); if (await confirmBox({ title: 'Eliminar gasto', text: `Se eliminará «${e.concept}» (${eur(e.total)}).`, ok: 'Eliminar', danger: true })) await mutate('DELETE', `/api/expenses/${e.id}`, undefined, 'Gasto eliminado'); });
  on('deleteItem', async (el) => { const e = byId(el, 'items'); if (await confirmBox({ title: 'Eliminar artículo', text: `Se eliminará «${e.name}» del catálogo.`, ok: 'Eliminar', danger: true })) await mutate('DELETE', `/api/items/${e.id}`, undefined, 'Artículo eliminado'); });
  on('deleteClient', async (el) => {
    const c = byId(el, 'clients');
    if (!(await confirmBox({ title: 'Eliminar cliente', text: `¿Eliminar a ${c.name}? Si tiene facturas, se archivará para conservar el historial.`, ok: 'Eliminar', danger: true }))) return;
    const r = await mutate('DELETE', `/api/clients/${c.id}`); toast(r.archived ? 'Cliente archivado (tiene documentos)' : 'Cliente eliminado'); go('#/clientes');
  });
  on('addPayment', (el) => paymentModal(byId(el, 'documents')));
  on('deletePayment', async (el) => { if (await confirmBox({ title: 'Anular cobro', text: 'El importe volverá a figurar como pendiente.', ok: 'Anular cobro', danger: true })) await mutate('DELETE', `/api/payments/${el.dataset.id}`, undefined, 'Cobro anulado'); });
}
