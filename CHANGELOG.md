# Cambios

**Español**. Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/); versiones con [SemVer](https://semver.org/lang/es/).

## [Sin publicar]

### Añadido
- **Simulador de pymes** (`npm run sim`, `npm run sim:serve`): tres negocios ficticios con semilla, Telegram, IMAP/SMTP y Ollama simulados; modo `--llm real` para probar con tu Ollama.
- `GET /api/pulse`: firma ligera de mensajes y adjuntos para el sondeo del cliente web.
- Documentación para empresas: [Primeros pasos](docs/empezar.md), [Estado por función](docs/estado.md), [Seguridad y privacidad](docs/seguridad-privacidad.md), [Marco legal](docs/marco-legal.md), [Para asesores](docs/asesor.md), [Desarrollo](docs/desarrollo.md), en español e inglés.
- `SECURITY.md`, `CONTRIBUTING.md` y plantillas de incidencias.

### Cambiado
- El cliente web ya no descarga todo `/api/state` cada 6 s; solo cuando cambia algo. Las respuestas JSON grandes se comprimen con gzip.
- README corto orientado a negocios; el detalle de funciones pasa a `docs/funciones.md`. `PRUEBA_CON_USUARIOS.md` pasa a `docs/prueba-con-usuarios.md`.
- El posicionamiento fiscal se explica con fuentes de la AEAT: la normativa se aplica a los programas con los que se expiden facturas, aunque no envíen nada.

### Corregido
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
