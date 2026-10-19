# Hoja de ruta de REM Negocio

Estado a 19/10/2026. Orden = valor / esfuerzo. Una función cada vez, con pruebas y commit local.

## Hecho
- Clientes, presupuestos, facturas (rectificativas, cobros), gastos, informes, tareas
- Mensajes: Telegram, correo (IMAP/SMTP), WhatsApp/iMessage pegados · asistente local (Ollama), RAG, `negocio.md`, memoria editable, Hindsight (opcional)
- Política de acciones + cola de aprobación + «Parar todo» · agentes Mañana / Cobros / Noche · registro de llamadas al modelo
- OCR local de tickets y PDF (Telegram, correo, subida) · módulos declarativos con Claude (opcional)
- PDF nativo (facturas, presupuestos, informes, extracto) · enviar con PDF adjunto
- Restaurar/importar copias · facturas recurrentes · cartas y contratos desde plantillas · calendario .ics · Excel .xlsx

## Siguiente bloque (en este orden)
1. ~~Previsión de tesorería (30/60/90 días)~~ ✅ hecho: Dinero → Tesorería (cobros con retraso real por cliente, recurrentes, gastos habituales, IVA, saldo opcional)
2. ~~Gastos recurrentes~~ ✅ hecho: se registran solos cada periodo (uno por cada periodo que faltó), con importe estimado opcional; la tesorería los usa
3. ~~Notificaciones del sistema~~ ✅ hecho: Ajustes → Avisos (mensajes agrupados, resumen diario, propuestas, silencio, sin datos sensibles por defecto) y contador en el título de la pestaña
4. ~~Historial único por cliente~~ ✅ hecho: en la ficha, línea de tiempo con mensajes, facturas, cobros, presupuestos, tareas y memoria, más «Próximamente»; filtros y búsqueda
5. ~~Adjuntar archivos a clientes y facturas~~ ✅ hecho: tarjeta «Archivos» en la ficha del cliente y en la factura/presupuesto (arrastrar o elegir, ver, descargar, renombrar, nota); lista de tipos permitida con comprobación de contenido, máx. 25 MB, y aparecen en el historial
6. ~~Importar facturas y gastos históricos desde CSV~~ ✅ hecho: Ajustes → Datos → «Importar datos antiguos» (vista previa, columnas detectadas y editables, duplicados omitidos, copia antes de importar). Excel `.xlsx` se leerá en el punto 7

## Archivos de Office (añadido)
7. ~~Leer Word, PowerPoint y Excel~~ ✅ hecho: `.docx` / `.pptx` / `.xlsx` (ZIP con límites de tamaño, CRC y bomba de descompresión; sin ejecutar nada) y `.rtf` / `.doc` / `.odt` con `textutil` en macOS.
   - Ajustes → Conocimiento → «Desde un archivo…» rellena un documento del asistente
   - Adjuntos de Telegram y correo (`.docx` `.pptx` `.xlsx` `.rtf`): su texto aparece en el mensaje; el asistente lo trata como dato
   - Importar facturas y gastos desde `.xlsx` (elige hoja; fechas e importes por formato de celda)
   - Límites: de PowerPoint solo texto y notas (sin imágenes ni diagramas); `.ppt` y `.xls` antiguos no soportados; Excel: hojas ocultas ignoradas, máx. 20 000 filas y 100 columnas
8. ~~Generar `.docx` de cartas y contratos~~ ✅ hecho: botón «Descargar Word» junto al PDF en el documento de cada cliente (estilos reales de Word, viñetas, negrita/cursiva, A4; verificado con python-docx; sin dependencias)
9. ~~Propuesta comercial en `.pptx` a partir de un presupuesto~~ ✅ hecho: «Descargar propuesta (PowerPoint)» en cada presupuesto — 5 diapositivas 16:9 editables (portada, qué incluye, inversión con tabla y totales, condiciones, siguientes pasos); verificado con python-pptx y Quick Look

## Después
10. ~~Cuentas a pagar~~ ✅ hecho: un gasto puede quedar «pendiente de pago» con vencimiento; aviso de lo que debes en Gastos y en Hoy, botón «Pagado», filtro, pagos en la Tesorería (sin contarlos dos veces), calendario .ics, resumen de la mañana y exportaciones
11. ~~Control de horas por cliente → factura~~ ✅ hecho: Dinero → Horas (apuntar, cronómetro, tarifa por hora, «Facturar horas» crea un borrador con una línea por entrada; borrar el borrador libera las horas)
12. ~~Resúmenes trimestrales 130 / 115 / 347~~ ✅ hecho: Dinero → Modelos con 130 (acumulado, 20 %, retenciones, pagos anteriores), 303 (IVA por tipos), 115 (alquileres 19 %) y 347 (> 3.005,06 € con desglose trimestral, NIF de proveedor), CSV y aviso de que son orientativos; no presenta nada
13. ~~Series de facturación configurables~~ ✅ hecho: Ajustes → Facturación → Series (prefijo de 1-4 letras, contador anual propio, predeterminada), selector en cada factura; P y R reservados
14. ~~Albaranes → factura~~ ✅ hecho: Dinero → Albaranes (numeración A, pendiente/facturado, hoja de entrega); varios albaranes del mismo cliente pasan a UN borrador de factura con una cabecera por albarán; al borrar el borrador se liberan
15. ~~Tareas con repetición, prioridad y subtareas~~ ✅ hecho: prioridad alta/normal/baja, repetición diaria/semanal/mensual/trimestral/anual (al completar nace la siguiente, siempre en el futuro) y subtareas de un nivel que se copian al repetir
16. ~~Arranque automático + icono en barra de menús · bloqueo con PIN~~ ✅ hecho: Ajustes → Acceso y arranque (PIN con scrypt, sesión por cookie, bloqueo por inactividad y límite de intentos; LaunchAgent de usuario; icono nativo con contadores). El PIN no cifra el disco. Icono de barra de menús: comprobado que compila, arranca, consulta y se cierra solo, pero no capturé la pantalla

## Bloque 2 (octubre 2026)
17. ✅ **App de Mac (SwiftUI)**: asistente de puesta en marcha, copias cifradas `.rembak` con verificación y restauración de prueba, importación de contactos y de archivos de otros programas (CSV, Excel, vCard, Facturae XML, DBF) con vista previa, deshacer y ayuda opcional de IA con plan declarativo validado; `.dmg` y flujo de publicación (la notarización **no** se ha probado con credenciales reales)
18. ✅ **REM Clientes (prototipo)**: enlace de chat web cifrado, relé ciego (con acuse de recibo y borrado de lo entregado), canal en REM con tarjetas de presupuesto, pago y estado
19. ✅ **Correo estructurado (nivel 0)**: tarjetas por email con token de un solo uso y respuesta verificada (remitente + SPF/DKIM)
20. ✅ **Rellenar los datos de la empresa desde su web** (opcional, con revisión campo a campo)
21. ✅ **Órdenes en lenguaje natural** con confirmación (reglas, o modelo local opcional) y atajos de teclado (`/`, `N`+letra)
22. ✅ **Interfaz táctil** (objetivos de 44 px) y **sistema de iconos** propio
23. ✅ **Prueba de carga** (`npm run stress`): ha encontrado y corregido fallos reales del relé
24. ✅ **Documentación educativa**: tutorial de construcción, libro «Manual del usuario de REM» (`book/`, CC BY-SA 4.0) y skill de Claude Code (`.claude/skills/rem-negocio`). El código pasa a **MIT**.

## Pendiente
- **Presets por programa concreto** (Holded, Quipu, Billin, Contasimple, Factusol…): necesitan exportaciones reales y anonimizadas; no se escribe ninguno sin ellas
- **Desplegar un relé** con HTTPS y probar REM Clientes con negocios reales; después, QR y notificaciones push
- **Rendimiento con muchos datos**: `/api/state` pesa unos 6 MB con 5 000 clientes y 10 000 facturas; paginarlo
- **Notarización** de la app de Mac con una cuenta de Apple Developer
- **Auditoría de seguridad independiente** del canal con clientes y del protocolo antes de usarlo con datos sensibles
- **Cifrado de la base de datos en reposo** (hoy solo están cifradas las copias `.rembak`)

## Solo si hay usuarios que lo pidan
- Conciliación bancaria (CSV del banco)
- Acceso desde el móvil en la red local con PIN (fotos de tickets con la cámara)

## Fuera de alcance (decisión del usuario)
- Verifactu / SII: REM Negocio se posiciona como gestión interna, no como software de facturación certificado.
