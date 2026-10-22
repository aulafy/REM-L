# Cambios

**Español**. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versiones con [SemVer](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido
- **Simulador de pymes** (`npm run sim`, `npm run sim:serve`): tres negocios ficticios con semilla, Telegram, IMAP/SMTP y Ollama simulados; modo `--llm real` para probar con tu Ollama.
- `GET /api/pulse`: firma ligera de mensajes y adjuntos para el sondeo del cliente web.
- Documentación para empresas: [Primeros pasos](docs/empezar.md), [Estado por función](docs/estado.md), [Seguridad y privacidad](docs/seguridad-privacidad.md), [Marco legal](docs/marco-legal.md), [Para asesores](docs/asesor.md), [Desarrollo](docs/desarrollo.md), en español e inglés.
- `SECURITY.md`, `CONTRIBUTING.md` y plantillas de incidencias.

### Cambiado
- **Interfaz más sencilla** para quien no es técnico:
  - **Hoy**: una sola lista «Lo importante hoy» ordenada por urgencia y un resumen calculado al momento (adiós a «día tranquilo» con facturas vencidas).
  - **Dinero** en tres apartados (Ventas, Gastos, Cómo voy) en vez de nueve pestañas; albaranes, horas, facturas que se repiten y modelos solo aparecen si los usas (Ajustes → Tu empresa → Funciones).
  - **Ajustes** en cinco apartados (Tu empresa, Mensajes, Asistente, Seguridad y copias, Avanzado) en vez de catorce, empezando por tu empresa.
  - Factura nueva: la acción principal es «Guardar borrador»; «Emitir factura…» va aparte y pide confirmación.
  - Ayuda «?» en lenguaje llano junto a los términos técnicos (base imponible, IVA, IRPF, vencimiento, emitir…).
  - Menú «Nuevo» por frecuencia de uso; bienvenida que avanza con Intro y opción «Solo quiero probarlo».
- **Accesibilidad**: letra base de 16 px, contraste AA en textos secundarios e insignias, zonas de clic de al menos 24 px, enlace «Saltar al contenido», apartados de Ajustes como pestañas navegables con flechas, nombres accesibles en contadores y casillas.
- Importes con separador de miles siempre («2.035,86 €»).
- **Sistema de diseño v5**: una sola escala tipográfica (de 17 tamaños a 9; de 8 pesos a 4), alturas fijas de botones y campos (32 · 40 · 44 px) y radios coherentes. Pestañas en dos niveles (control segmentado para el apartado y subrayado para la página), tablas, listas, insignias y contadores unificados.
- Fichas de factura y presupuesto: una acción principal, las de documento (PDF, imprimir, duplicar) en segundo plano y lo delicado (rectificar, eliminar) aparte.
- Detalles: signo menos tipográfico (−289,90 €), fecha de la última copia en lenguaje llano, «Ayuda» en el lateral (recorrido, primeros pasos y atajos), buscador que dice qué busca, aviso legal compacto en Facturas.
- El cliente web ya no descarga todo `/api/state` cada 6 s; solo cuando cambia algo. Las respuestas JSON grandes se comprimen con gzip.
- README corto orientado a negocios; el detalle de funciones pasa a `docs/funciones.md`. `PRUEBA_CON_USUARIOS.md` pasa a `docs/prueba-con-usuarios.md`.
- El posicionamiento fiscal se explica con fuentes de la AEAT: la normativa se aplica a los programas con los que se expiden facturas, aunque no envíen nada.

### Corregido
- Los datos de ejemplo ya no sustituyen el nombre (ni otros datos) que la persona escribió en la bienvenida.
- Correo: al conectar un buzón vacío, la regla «solo los últimos 15» se aplicaba en cada lectura y se perdían correos si llegaban más de 15 de golpe.

## [1.0.0] - 2026-10-19

Primera versión completa. Resumen (detalle en el [historial de git](https://github.com/aulafy/REM-L/commits/main) y en la [hoja de ruta](ROADMAP.md)):

- Clientes, presupuestos, albaranes, facturas con series y rectificativas, cobros, gastos, cuentas a pagar, horas, tareas, tesorería e informes; modelos 130/303/115/347 orientativos.
- Bandeja de mensajes (Telegram, correo, WhatsApp pegado) con asistente local (Ollama), RAG, agentes de solo lectura, política de aprobación y memoria editable.
- OCR local de tickets, PDF nativo, Word, PowerPoint y Excel.
- Copias diarias, restauración, modo reparación; importación desde CSV, Excel, vCard, Facturae y DBF.
- App de Mac (SwiftUI) con asistente y copias cifradas `.rembak`.
- REM Clientes y tarjetas por correo (experimentales).
- Tutorial de construcción, «Manual del usuario de REM» (CC BY-SA 4.0) y licencia MIT.

[Sin publicar]: https://github.com/aulafy/REM-L/compare/459c1e1...HEAD
[1.0.0]: https://github.com/aulafy/REM-L/commits/459c1e1
