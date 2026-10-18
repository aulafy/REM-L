# REM Negocio

Clientes, presupuestos, facturas, cobros, gastos y tareas para pymes y autónomos. Una web app que corre **en tu propio equipo**: sin cuentas, sin nube, sin dependencias (solo Node ≥ 22.13).

Nace de la filosofía de [REM](https://github.com/aulafy/REM): local primero, revisión humana y **aprobar no es enviar**. REM Negocio redacta mensajes (recordatorios de pago, seguimiento de presupuestos) pero nunca envía nada por ti.

## Arrancar

```sh
npm start            # http://127.0.0.1:4400
REM_DATA_DIR=/ruta REM_PORT=4500 npm start   # datos y puerto propios
```

Los datos van por defecto a `~/Library/Application Support/REM Negocio` (SQLite) con una copia automática diaria (se conservan las últimas 20 automáticas, separadas de las manuales y de seguridad).
Para probarlo: en la pantalla de bienvenida, «Explorar con datos de ejemplo» (todo ficticio).

## Novedad: bandeja con asistente local

- **Mensajes:** Telegram (bot), correo (IMAP/SMTP con contraseña de aplicación y conexión cifrada obligatoria) y mensajes pegados de WhatsApp/iMessage, en una sola bandeja.
- **Asistente (Ollama, opcional):** deja un borrador de respuesta con los datos de tu negocio (RAG: BM25 + embeddings opcionales). Trata el mensaje del cliente como texto, nunca como órdenes, y nada se envía hasta que pulsas Enviar.
- **Conocimiento:** tarifas, horarios y condiciones que el asistente puede citar; también contesta preguntas desde Hoy.
- **Voz mínima:** «Escuchar» (voz de macOS), «Dictar» (reconocimiento del navegador) y notas de voz de Telegram con whisper.cpp si lo tienes.
- Tokens y contraseñas en el llavero de macOS.

## Agentes y memoria

- **Política y aprobación:** cada acción de un agente tiene un modo (hacerlo solo / preguntar / dejármelo). El suelo en código (enviar mensajes solos, emitir facturas, borrar o exportar datos) no lo desbloquea ninguna regla. «Parar todo» detiene y vacía la cola.
- **Tres agentes, un trabajo cada uno:** Mañana (resumen del día), Cobros (máx. 3 sugerencias al día) y Noche (cierre y tareas a mañana, máx. 15). Solo leen; se ejecutan a su hora y se ponen al día al arrancar.
- **Memoria:** `negocio.md` (reglas y tono), datos aprobados por ti (visibles y editables) y, **solo si quieres**, [Hindsight](https://github.com/vectorize-io/hindsight) en local para memoria a largo plazo (apagado por defecto; la app funciona igual sin él).
- **Observabilidad:** registro de llamadas al modelo (duración, tokens, errores; nunca el texto) y tope por hora.

## PDF y envío por correo

**Descargar PDF** de facturas y presupuestos, del informe del periodo (IVA incluido) y del **extracto de cada cliente**. Se generan en tu equipo con el WebKit nativo de macOS (A4 paginado, sin internet ni JavaScript; el HTML se sanea antes). Si tienes el correo conectado, **Enviar con PDF** manda el mensaje con la factura adjunta desde tu cuenta, tras tu confirmación. En equipos sin macOS la descarga cae a «Imprimir».

## Más herramientas básicas

- **Copias de seguridad:** automática diaria; en Ajustes → Datos puedes **restaurar** (guarda antes una copia de lo actual), **descargar** e **importar** copias (.db). Antes de aceptar o restaurar una copia se comprueban SQLite, sus relaciones y la versión del esquema. Automáticas, manuales, importadas y copias previas a operaciones delicadas tienen retención separada.
- **Historial por cliente:** en cada ficha, una línea de tiempo única (mensajes, facturas, cobros, presupuestos, tareas, memoria) con lo que viene («Próximamente»), filtros y búsqueda.
- **Archivos adjuntos:** en clientes y facturas/presupuestos, arrastra o elige contratos, planos o albaranes (PDF, imágenes, Word, Excel, PowerPoint, texto; hasta 25 MB). Se guardan en tu equipo, se comprueba que el contenido coincide con la extensión, se abren sin ejecutar nada y se borran con su cliente o documento.
- **Importar histórico:** en Ajustes → Datos, sube un CSV o un Excel de facturas emitidas o de gastos (separador y acentos detectados solos; importes y fechas en formato español). Ves una vista previa con las columnas reconocidas —que puedes corregir—, avisos y filas con error; no se guarda nada hasta confirmar. Las facturas conservan número y fecha, los clientes se emparejan por NIF o nombre, los cobros se registran y lo ya importado se omite si repites el archivo.
- **Cartas y contratos en Word:** además del PDF, «Descargar Word» genera un `.docx` editable (títulos, listas, negrita, líneas de firma) con el texto que hayas ajustado, creado en tu equipo.
- **Modelos fiscales (orientativos):** Dinero → Modelos calcula con tus datos las cifras del 130, 303, 115 y 347 por trimestre/año, con CSV para tu asesor. No presenta nada ante Hacienda.
- **Albaranes:** crea albaranes de entrega (numeración A) y pásalos a factura de uno en uno o en bloque por cliente; la factura lleva una cabecera por albarán.
- **Tareas:** con prioridad, repetición (la siguiente aparece al completar la actual) y subtareas con progreso.
- **Acceso y arranque:** bloqueo con PIN (4-12 cifras, se guarda con scrypt, se bloquea solo tras inactividad y limita los intentos; no cifra el disco), arranque automático al iniciar sesión en macOS y un icono en la barra de menús con los contadores de lo pendiente.
- **Series de facturación:** crea series con su propio prefijo y numeración anual (F, TA…) en Ajustes → Facturación y elige la serie al crear cada factura.
- **Horas por cliente:** en Dinero → Horas apuntas el tiempo (o usas el cronómetro) con tu tarifa por hora y, con «Facturar horas», se crea un borrador de factura con una línea por entrada. Si borras ese borrador, las horas quedan libres otra vez.
- **Cuentas a pagar:** al apuntar un gasto puedes marcarlo «Pendiente de pago» con su vencimiento. Ves cuánto debes (y lo vencido) en Gastos y en Hoy, lo marcas «Pagado» con un clic, entra en la previsión de Tesorería el día que vence, en tu calendario (.ics), en el resumen de la mañana y en el Excel/CSV. Los gastos de antes cuentan como pagados.
- **Propuesta en PowerPoint:** desde cualquier presupuesto, «Descargar propuesta (PowerPoint)» crea una presentación editable de 5 diapositivas con tus datos, las líneas, los totales y las condiciones; sin internet ni plantillas externas.
- **Leer Word, PowerPoint y Excel:** el texto de `.docx`, `.pptx` y `.xlsx` se extrae en tu equipo, sin abrir ni ejecutar nada (límites de tamaño y de descompresión). Sirve para alimentar el Conocimiento del asistente, para ver el contenido de los adjuntos de Telegram y correo —tratado como dato del remitente, nunca como órdenes— y para importar facturas y gastos desde un `.xlsx`. `.rtf`, `.doc` y `.odt` se leen con `textutil` de macOS; los `.ppt` y `.xls` antiguos no se admiten.
- **Avisos de macOS:** Ajustes → Avisos: mensajes nuevos (agrupados), resumen del día, propuestas por aprobar y horario de silencio. Por privacidad no muestran nombres ni importes salvo que lo actives.
- **Gastos recurrentes:** alquiler, cuotas, seguros… se registran solos cada periodo (y los que falten si la app estuvo cerrada); botón «Repetir» en cualquier gasto.
- **Facturas recurrentes:** «Repetir…» en una factura; cada periodo pendiente prepara su propio **borrador** (hasta 12 por ejecución, sin saltarse los restantes y nunca se emite solo).
- **Cartas y contratos:** plantillas con variables (reclamación de pago, contrato de servicios, consentimiento de datos) desde la ficha del cliente → vista previa editable → PDF. Plantillas propias en Ajustes → Documentos.
- **Calendario:** Tareas → Calendario: suscripción `.ics` con tareas, vencimientos de facturas, caducidad de presupuestos y recurrentes (enlace privado renovable, solo en tu Mac).
- **Tesorería:** Dinero → Tesorería: previsión a 30/60/90 días con vencimientos, el retraso medio con que paga cada cliente, facturas recurrentes, gastos habituales, IVA del trimestre y, si lo apuntas, tu saldo bancario.
- **Excel:** libro `.xlsx` con facturas, gastos, clientes e IVA trimestral (importes y fechas reales, filtros y totales con fórmulas).

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

La estructura de relaciones, las reglas que evitan datos incoherentes, el **modo reparación** (si la base tiene relaciones rotas, la app arranca y deja restaurar una copia o repararla, con copia previa) y las consultas de diagnóstico están documentadas en [Integridad de datos](docs/integridad-datos.md).

En Ajustes → Datos, **Borrar todos los datos** crea primero una copia de la base y elimina registros, ajustes, secretos del llavero y archivos adjuntos locales. La copia `.db` no contiene los adjuntos, por lo que la pantalla lo advierte como una operación irreversible para esos archivos.

## Licencia

Uso **propio** gratuito, también en tu propio negocio (ver [LICENSE](LICENSE)). Prohibido revenderlo, ofrecerlo como servicio a terceros, redistribuirlo o incorporarlo a otros productos sin permiso por escrito. No es software de facturación certificado.
