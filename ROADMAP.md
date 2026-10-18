# Hoja de ruta de REM Negocio

Estado a 18/10/2026. Orden = valor / esfuerzo. Una función cada vez, con pruebas y commit local.

## Hecho
- Clientes, presupuestos, facturas (rectificativas, cobros), gastos, informes, tareas
- Mensajes: Telegram, correo (IMAP/SMTP), WhatsApp/iMessage pegados · asistente local (Ollama), RAG, `negocio.md`, memoria editable, Hindsight (opcional)
- Política de acciones + cola de aprobación + «Parar todo» · agentes Mañana / Cobros / Noche · registro de llamadas al modelo
- OCR local de tickets y PDF (Telegram, correo, subida) · módulos declarativos con Claude (opcional)
- PDF nativo (facturas, presupuestos, informes, extracto) · enviar con PDF adjunto
- Restaurar/importar copias · facturas recurrentes · cartas y contratos desde plantillas · calendario .ics · Excel .xlsx

## Siguiente bloque (en este orden)
1. ~~Previsión de tesorería (30/60/90 días)~~ ✅ hecho: Dinero → Tesorería (cobros con retraso real por cliente, recurrentes, gastos habituales, IVA, saldo opcional)
2. Gastos recurrentes
3. Notificaciones del sistema (mensajes, vencidas, tareas de hoy)
4. Historial único por cliente (mensajes, facturas, tareas, documentos)
5. Adjuntar archivos a clientes y facturas
6. Importar facturas y gastos históricos desde Excel/CSV

## Archivos de Office (añadido)
7. **Leer Word, PowerPoint y Excel**: extraer el texto de `.docx` / `.pptx` / `.xlsx` (OOXML, sin ejecutar nada; límites de tamaño y de compresión) y de `.doc` / `.rtf` con `textutil`.
   - Importar al Conocimiento del asistente (tarifas, catálogos)
   - Adjuntos de Telegram y correo: ver el texto en la bandeja; el asistente lo trata como dato, nunca como órdenes
   - Importar clientes/facturas/gastos desde `.xlsx`
   - Límites: de PowerPoint solo texto (sin imágenes ni diagramas); `.ppt` antiguo no soportado
8. **Generar `.docx`** de cartas y contratos (editable por el cliente), además del PDF
9. (Más adelante) Propuesta comercial en `.pptx` a partir de un presupuesto

## Después
10. Cuentas a pagar (gastos con vencimiento y pagado)
11. Control de horas por cliente → factura
12. Resúmenes trimestrales 130 / 115 / 347
13. Series de facturación configurables
14. Albaranes → factura
15. Tareas con repetición, prioridad y subtareas
16. Arranque automático + icono en barra de menús · bloqueo con PIN

## Solo si hay usuarios que lo pidan
- Conciliación bancaria (CSV del banco)
- Acceso desde el móvil en la red local con PIN (fotos de tickets con la cámara)

## Fuera de alcance (decisión del usuario)
- Verifactu / SII: REM Negocio se posiciona como gestión interna, no como software de facturación certificado.
