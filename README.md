# REM Negocio

Clientes, presupuestos, facturas, cobros, gastos y tareas para pymes y autónomos. Una web app que corre **en tu propio equipo**: sin cuentas, sin nube, sin dependencias (solo Node ≥ 22.13).

Nace de la filosofía de [REM](https://github.com/aulafy/REM): local primero, revisión humana y **aprobar no es enviar**. REM Negocio redacta mensajes (recordatorios de pago, seguimiento de presupuestos) pero nunca envía nada por ti.

## Arrancar

```sh
npm start            # http://127.0.0.1:4400
REM_DATA_DIR=/ruta REM_PORT=4500 npm start   # datos y puerto propios
```

Los datos van por defecto a `~/Library/Application Support/REM Negocio` (SQLite) con una copia automática diaria (se conservan las últimas 20).
Para probarlo: en la pantalla de bienvenida, «Explorar con datos de ejemplo» (todo ficticio).

## Novedad: bandeja con asistente local

- **Mensajes:** Telegram (bot), correo (IMAP/SMTP con contraseña de aplicación) y mensajes pegados de WhatsApp/iMessage, en una sola bandeja.
- **Asistente (Ollama, opcional):** deja un borrador de respuesta con los datos de tu negocio (RAG: BM25 + embeddings opcionales). Trata el mensaje del cliente como texto, nunca como órdenes, y nada se envía hasta que pulsas Enviar.
- **Conocimiento:** tarifas, horarios y condiciones que el asistente puede citar; también contesta preguntas desde Hoy.
- **Voz mínima:** «Escuchar» (voz de macOS), «Dictar» (reconocimiento del navegador) y notas de voz de Telegram con whisper.cpp si lo tienes.
- Tokens y contraseñas en el llavero de macOS.

## Agentes y memoria

- **Política y aprobación:** cada acción de un agente tiene un modo (hacerlo solo / preguntar / dejármelo). El suelo en código (enviar mensajes solos, emitir facturas, borrar o exportar datos) no lo desbloquea ninguna regla. «Parar todo» detiene y vacía la cola.
- **Tres agentes, un trabajo cada uno:** Mañana (resumen del día), Cobros (máx. 3 sugerencias al día) y Noche (cierre y tareas a mañana, máx. 15). Solo leen; se ejecutan a su hora y se ponen al día al arrancar.
- **Memoria:** `negocio.md` (reglas y tono), datos aprobados por ti (visibles y editables) y, opcional, [Hindsight](https://github.com/vectorize-io/hindsight) en local para memoria a largo plazo.
- **Observabilidad:** registro de llamadas al modelo (duración, tokens, errores; nunca el texto) y tope por hora.

## Tickets y documentos (OCR local)

Sube una foto o un PDF en **Gastos → Subir ticket** (o arrástralo), o envíalo por **Telegram o correo**: los adjuntos llegan solos a la cola de revisión. Se lee en tu equipo (PDF con texto directamente; escaneados y fotos con Apple Vision → Tesseract → modelo de visión de Ollama), la IA extrae proveedor, fecha, base, IVA y total, y la app **comprueba que los importes aparecen en el texto y que cuadran**. Si hay dudas, relee con el modelo de visión. Nada se crea sin tu revisión; los documentos personales (DNI…) no se envían a ningún modelo y se pueden borrar.

## Módulos a medida

En **Ajustes → Módulos** el autónomo amplía la app sin código: campos extra en clientes y facturas, plantillas de mensajes con variables, reglas que solo *proponen* tareas e informes propios. Se instalan desde una galería, pegando un JSON o **describiéndoselo a Claude** con su propia clave de API (opcional, guardada en el llavero; solo se envía el texto que escribe, nunca datos de clientes). Un módulo es **datos, no código**: se valida de forma estricta, se muestra qué podrá hacer antes de instalarlo, pasa por la política de aprobación y se puede quitar.

## Qué incluye

| Área | Qué resuelve |
|---|---|
| **Hoy** | Qué cobrar, qué está vencido, presupuestos aceptados sin facturar o sin respuesta, tareas y evolución mensual |
| **Clientes** | Ficha con NIF validado, historial, deuda, tareas y notas |
| **Presupuestos** | Numeración automática, estados (borrador → enviado → aceptado/rechazado), caducidad y **conversión a factura** |
| **Facturas** | Borrador → emitida (número correlativo F2026-0001, ya no se edita) → cobros parciales/totales → vencida; **rectificativas** en vez de borrar; IVA múltiple, descuentos, IRPF; hoja imprimible/PDF |
| **Cobros** | Registro por factura con control de importe pendiente; reclamación con borrador de mensaje (correo/WhatsApp/copiar) |
| **Gastos** | Con IVA soportado y categorías |
| **Informes** | Ingresos, gastos, resultado, resumen de IVA tipo 303 por trimestre, mejores clientes, export CSV para el asesor |
| **Ajustes** | Datos fiscales y logo, valores por defecto, catálogo, copias, exportación JSON, IA local opcional (Ollama) |
| **General** | Buscador ⌘K, tema claro/oscuro, móvil con barra inferior, accesible por teclado |

## Límites que conviene saber

- **Posicionamiento:** herramienta de gestión interna (control de clientes, cobros, gastos e informes). **No es software de facturación certificado**: no cumple Verifactu/SII ni envía registros a la AEAT. Las facturas que prepara sirven de control interno; para emitir facturas oficiales hay que usar un sistema conforme a la normativa. Consúltalo con tu asesor.
- Los informes de IVA son orientativos.
- El servidor solo escucha en `127.0.0.1`, exige la cabecera `X-REM` en las escrituras y rechaza otros `Host`.
- La IA local es opcional; solo admite direcciones locales y únicamente reformula el texto del borrador.

## Pruebas

```sh
npm test
```
