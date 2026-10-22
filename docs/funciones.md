# Funciones de REM Negocio

**Español** · [English](en/features.md) · [Índice de la documentación](README.md)

Descripción detallada de lo que hace la app. Qué está maduro y qué no: [Estado por función](estado.md). Qué sale de tu equipo: [Seguridad y privacidad](seguridad-privacidad.md).

> **Facturas y Verifactu:** REM numera y genera facturas, pero **no es un sistema de facturación conforme** con el reglamento (RRSIF/Verifactu). Lee [Marco legal](marco-legal.md) antes de usarlo para expedir facturas.

## Cómo está organizada

| Menú | Qué hay |
|---|---|
| **Hoy** | Resumen del día y una lista con lo importante, de lo más urgente a lo menos |
| **Mensajes** | La bandeja con Telegram, correo y mensajes pegados |
| **Clientes** | Fichas con todo el historial de cada cliente |
| **Dinero** | **Ventas** (facturas y presupuestos; también albaranes, horas y facturas que se repiten si los activas), **Gastos** y **Cómo voy** (tesorería, informes y modelos de Hacienda) |
| **Ajustes** | **Tu empresa**, **Mensajes**, **Asistente**, **Seguridad y copias** y **Avanzado** |

Las funciones que no uses no aparecen: actívalas en Ajustes → Tu empresa → Funciones. Junto a cada término técnico hay un botón «?» con una explicación corta.

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
| **Mensajes** | Bandeja única (Telegram, correo, WhatsApp/iMessage pegados, REM Clientes) con borradores del asistente |
| **Tareas y Horas** | Tareas con subtareas y repetición; horas por cliente que se facturan |
| **Tesorería y Modelos** | Previsión 30/60/90 días; cifras orientativas de los modelos 130, 303, 115 y 347 |
| **General** | Buscador ⌘K, tema claro/oscuro, móvil con barra inferior, accesible por teclado |

## Mensajes y asistente local

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

## Órdenes en lenguaje natural y atajos
Escribe en la barra de Hoy o en ⌘K cosas como «factura a Marta por 3 horas a 40 €», «recuérdame llamar a Pedro mañana», «gasto gasolina 45,50 €», «nuevo cliente Ana López 612345678» o «abre clientes». REM lo interpreta con reglas (sin IA) o, si tienes un modelo local, con él; **muestra lo que va a hacer y solo lo ejecuta si confirmas** (las facturas se crean como borrador; si hay dos clientes parecidos, eliges). Atajos: `/` busca u ordena, `N` luego `F`/`P`/`C`/`G`/`T` crea factura/presupuesto/cliente/gasto/tarea. En móvil los botones tienen al menos 44 px y respetan la zona segura. Código: `public/commands.js` (puro y probado), `public/assistant.js`.

## PDF y envío por correo

**Descargar PDF** de facturas y presupuestos, del informe del periodo (IVA incluido) y del **extracto de cada cliente**. Se generan en tu equipo con el WebKit nativo de macOS (A4 paginado, sin internet ni JavaScript; el HTML se sanea antes). Si tienes el correo conectado, **Enviar con PDF** manda el mensaje con la factura adjunta desde tu cuenta, tras tu confirmación. En equipos sin macOS la descarga cae a «Imprimir».

## Más herramientas básicas

- **Copias de seguridad:** automática diaria; en Ajustes → Seguridad y copias puedes **restaurar** (guarda antes una copia de lo actual), **descargar** e **importar** copias (.db). Antes de aceptar o restaurar una copia se comprueban SQLite, sus relaciones y la versión del esquema. Automáticas, manuales, importadas y copias previas a operaciones delicadas tienen retención separada.
- **Historial por cliente:** en cada ficha, una línea de tiempo única (mensajes, facturas, cobros, presupuestos, tareas, memoria) con lo que viene («Próximamente»), filtros y búsqueda.
- **Archivos adjuntos:** en clientes y facturas/presupuestos, arrastra o elige contratos, planos o albaranes (PDF, imágenes, Word, Excel, PowerPoint, texto; hasta 25 MB). Se guardan en tu equipo, se comprueba que el contenido coincide con la extensión, se abren sin ejecutar nada y se borran con su cliente o documento.
- **Importar histórico:** en Ajustes → Seguridad y copias, sube un CSV o un Excel de facturas emitidas o de gastos (separador y acentos detectados solos; importes y fechas en formato español). Ves una vista previa con las columnas reconocidas —que puedes corregir—, avisos y filas con error; no se guarda nada hasta confirmar. Las facturas conservan número y fecha, los clientes se emparejan por NIF o nombre, los cobros se registran y lo ya importado se omite si repites el archivo.
- **Cartas y contratos en Word:** además del PDF, «Descargar Word» genera un `.docx` editable (títulos, listas, negrita, líneas de firma) con el texto que hayas ajustado, creado en tu equipo.
- **Modelos fiscales (orientativos):** Dinero → Cómo voy → Modelos de Hacienda calcula con tus datos las cifras del 130, 303, 115 y 347 por trimestre/año, con CSV para tu asesor. No presenta nada ante Hacienda.
- **Albaranes:** crea albaranes de entrega (numeración A) y pásalos a factura de uno en uno o en bloque por cliente; la factura lleva una cabecera por albarán.
- **Tareas:** con prioridad, repetición (la siguiente aparece al completar la actual) y subtareas con progreso.
- **Acceso y arranque:** bloqueo con PIN (4-12 cifras, se guarda con scrypt, se bloquea solo tras inactividad y limita los intentos; no cifra el disco), arranque automático al iniciar sesión en macOS y un icono en la barra de menús con los contadores de lo pendiente.
- **Series de facturación:** crea series con su propio prefijo y numeración anual (F, TA…) en Ajustes → Tu empresa → Facturación y elige la serie al crear cada factura.
- **Horas por cliente:** en Dinero → Ventas → Horas apuntas el tiempo (o usas el cronómetro) con tu tarifa por hora y, con «Facturar horas», se crea un borrador de factura con una línea por entrada. Si borras ese borrador, las horas quedan libres otra vez.
- **Cuentas a pagar:** al apuntar un gasto puedes marcarlo «Pendiente de pago» con su vencimiento. Ves cuánto debes (y lo vencido) en Gastos y en Hoy, lo marcas «Pagado» con un clic, entra en la previsión de Tesorería el día que vence, en tu calendario (.ics), en el resumen de la mañana y en el Excel/CSV. Los gastos de antes cuentan como pagados.
- **Propuesta en PowerPoint:** desde cualquier presupuesto, «Descargar propuesta (PowerPoint)» crea una presentación editable de 5 diapositivas con tus datos, las líneas, los totales y las condiciones; sin internet ni plantillas externas.
- **Leer Word, PowerPoint y Excel:** el texto de `.docx`, `.pptx` y `.xlsx` se extrae en tu equipo, sin abrir ni ejecutar nada (límites de tamaño y de descompresión). Sirve para alimentar el Conocimiento del asistente, para ver el contenido de los adjuntos de Telegram y correo —tratado como dato del remitente, nunca como órdenes— y para importar facturas y gastos desde un `.xlsx`. `.rtf`, `.doc` y `.odt` se leen con `textutil` de macOS; los `.ppt` y `.xls` antiguos no se admiten.
- **Avisos de macOS:** Ajustes → Mensajes → Avisos: mensajes nuevos (agrupados), resumen del día, propuestas por aprobar y horario de silencio. Por privacidad no muestran nombres ni importes salvo que lo actives.
- **Gastos recurrentes:** alquiler, cuotas, seguros… se registran solos cada periodo (y los que falten si la app estuvo cerrada); botón «Repetir» en cualquier gasto.
- **Facturas recurrentes:** «Repetir…» en una factura; cada periodo pendiente prepara su propio **borrador** (hasta 12 por ejecución, sin saltarse los restantes y nunca se emite solo).
- **Cartas y contratos:** plantillas con variables (reclamación de pago, contrato de servicios, consentimiento de datos) desde la ficha del cliente → vista previa editable → PDF. Plantillas propias en Ajustes → Tu empresa → Cartas y contratos.
- **Calendario:** Tareas → Calendario: suscripción `.ics` con tareas, vencimientos de facturas, caducidad de presupuestos y recurrentes (enlace privado renovable, solo en tu Mac).
- **Tesorería:** Dinero → Cómo voy → Tesorería: previsión a 30/60/90 días con vencimientos, el retraso medio con que paga cada cliente, facturas recurrentes, gastos habituales, IVA del trimestre y, si lo apuntas, tu saldo bancario.
- **Excel:** libro `.xlsx` con facturas, gastos, clientes e IVA trimestral (importes y fechas reales, filtros y totales con fórmulas).

## Tickets y documentos (OCR local)

Sube una foto o un PDF en **Gastos → Subir ticket** (o arrástralo), o envíalo por **Telegram o correo**: los adjuntos llegan solos a la cola de revisión. Se lee en tu equipo (PDF con texto directamente; escaneados y fotos con Apple Vision → Tesseract → modelo de visión de Ollama), la IA extrae proveedor, fecha, base, IVA y total, y la app **comprueba que los importes aparecen en el texto y que cuadran**. Si hay dudas, relee con el modelo de visión. Nada se crea sin tu revisión; los documentos personales (DNI…) no se envían a ningún modelo y se pueden borrar.

## Módulos a medida

En **Ajustes → Avanzado → Módulos** el autónomo amplía la app sin código: campos extra en clientes y facturas, plantillas de mensajes con variables, reglas que solo *proponen* tareas e informes propios. Se instalan desde una galería, pegando un JSON o **describiéndoselo a Claude** con su propia clave de API (opcional, guardada en el llavero; solo se envía el texto que escribe, nunca datos de clientes). Un módulo es **datos, no código**: se valida de forma estricta, se muestra qué podrá hacer antes de instalarlo, pasa por la política de aprobación y se puede quitar.

## Rellenar los datos desde tu web (opcional)
En Ajustes → Tu empresa → Datos (y en el asistente inicial) puedes pegar la dirección de tu web: REM lee unas pocas páginas (portada, contacto, aviso legal), extrae nombre, teléfono, dirección, horario y NIF (de los datos estructurados `schema.org`, los enlaces y el aviso legal) y te los muestra para que **marques lo que quieres guardar**. Opcionalmente, un modelo local o Claude resume la descripción y el horario si faltan. Seguridad: solo http/https, bloquea redes privadas (también tras redirecciones), respeta `robots.txt`, límites de tamaño/tiempo y el NIF solo se acepta con dígito de control válido. Código: `lib/webprofile.mjs`, `public/webprofile.js`.

## Importar desde otros programas

En Ajustes → Seguridad y copias: **clientes** (Contactos de Mac, Google, Outlook —inglés y español—, vCard, CSV o Excel), **facturas emitidas** y **gastos** (también **tablas DBF** de programas antiguos y **Facturae XML**, el formato de factura electrónica, con varias líneas por factura y continuidad de la numeración). Vista previa con duplicados y errores, copia automática antes de importar y **deshacer** por lote. Si el archivo es raro (títulos, otro programa, columnas con otros nombres), **«Ordenar con IA»** envía a Claude —con tu clave— solo una **muestra enmascarada** (la ves antes) y recibe un *plan declarativo* que REM valida y aplica en tu equipo: la IA propone, no ejecuta ni toca tus datos. Estrategia para los programas más usados en España: [migraciones-espana.md](migraciones-espana.md).

## REM Clientes (experimental)

Un **enlace** para que tus clientes te escriban desde el móvil sin app, sin cuenta y sin darte su teléfono, con cifrado de extremo a extremo y tarjetas de presupuesto (aceptable), pago y estado del pedido. Los mensajes llegan a *Mensajes*. Necesita un relé ciego (`relay/`). Guía del piloto: [rem-clientes-prototipo.md](rem-clientes-prototipo.md); visión del producto: [app-clientes.md](app-clientes.md).

## Tarjetas por correo (nivel 0)
Presupuestos con botones Aceptar/Rechazar, solicitudes de pago y avisos de estado por **email normal**, con respuesta verificada (token de un solo uso + remitente + SPF/DKIM). Ver [app-clientes.md](app-clientes.md) §14.1.

## App de Mac y copias cifradas

En `mac/` hay una **app nativa para macOS** (SwiftUI) que lleva dentro el servidor y guía paso a paso: tu negocio, cómo facturas, copias de seguridad, acceso y arranque. Las copias son archivos **`.rembak` cifrados** (AES-256-GCM, clave derivada de tu frase de paso con scrypt) en la carpeta que elijas (USB, NAS, iCloud Drive); se hace una al día y otra al salir, se verifican descifrándolas, y el asistente **prueba una restauración** antes de darlas por buenas. Incluye una hoja de recuperación con un código por si olvidas la frase. Detalles en [mac/README.md](../mac/README.md) y [asistente-macos.md](asistente-macos.md). Compilar: `scripts/build-mac-app.sh`.

## Diseño
Sistema propio al estilo de los símbolos de Apple: trazo de 1,75 sobre rejilla de 24 con **capa secundaria translúcida** (relieve sin ruido), **mosaicos de color** con degradado y luz superior en la barra lateral, y un **icono de app** (`mac/tools/make-icon.swift`, Core Graphics: superelipse continua, luz cenital, borde de cristal y monograma con volumen) que genera el `.icns`, el `icon.svg` y los iconos PNG web (`public/apple-touch-icon.png`, `icon-192/512.png`).
