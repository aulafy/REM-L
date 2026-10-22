# Desarrollo y pruebas

**Español** · [English](en/development.md) · [Índice de la documentación](README.md)

## Arquitectura en una línea

Un servidor Node sin dependencias (`server.mjs` + `lib/`, SQLite con `node:sqlite`) y una interfaz web sin framework (`public/`), todo en `127.0.0.1`. La explicación completa, paso a paso, está en el [tutorial de construcción](tutorial/TUTORIAL.md).

| Carpeta | Qué hay |
|---|---|
| `server.mjs`, `lib/` | API, base de datos, agentes, canales, importadores, PDF, copias |
| `public/` | Interfaz (vistas, cálculos fiscales en `calc.js`, órdenes en `commands.js`) |
| `mac/` | App nativa SwiftUI |
| `relay/` | Relé ciego de REM Clientes |
| `sim/` | Simulador de pymes |
| `test/` | Pruebas (`node:test`) |
| `book/`, `ebook/` | Libro «Manual del usuario de REM» (CC BY-SA 4.0) |
| `promo/`, `web/` | Material de presentación y página de ejemplo |

## Pruebas

```sh
npm test                 # pruebas automáticas (node:test, sin dependencias)
npm run sim              # simulador: tres pymes ficticias con Telegram, correo y modelo simulados
npm run sim -- --llm real --model qwen3.5:9b-mlx   # el mismo recorrido con tu Ollama
npm run stress           # prueba de carga
```

- **Simulador de pymes:** ver [sim/README.md](../sim/README.md). Antes de usar `--llm real`, comprueba que ninguna otra aplicación esté usando Ollama: cargar el modelo puede desalojar otro de memoria.
- **Integridad de datos:** relaciones, reglas contra datos incoherentes, modo reparación y consultas de diagnóstico en [integridad-datos.md](integridad-datos.md).
- **Prueba de carga:** `npm run stress` (opciones: `--clients 5000 --invoices 10000 --customers 1000 --only a|b`) levanta una empresa y un relé reales y comprueba: **A)** miles de clientes y facturas con escrituras concurrentes (numeración sin duplicados ni huecos, totales, cobros, exportaciones, copia e `integrity_check`); **B)** miles de clientes de REM Clientes cifrando mensajes a la vez. Referencia en un Mac: 10.000 facturas emitidas en ~26 s. Límite conocido: con 5.000 clientes y 10.000 facturas, `/api/state` pesa ~6 MB y tarda ~1,4 s; el sondeo periódico ya usa `/api/pulse`, pero falta paginar.

## Variables de entorno

| Variable | Para qué |
|---|---|
| `REM_DATA_DIR`, `REM_PORT` | Carpeta de datos y puerto |
| `REM_NO_KEYCHAIN=1` | No usar el llavero (pruebas); los secretos quedan en memoria |
| `REM_TELEGRAM_BASE`, `REM_TG_POLL` | API de Telegram alternativa (simulador) y espera del sondeo |
| `REM_MAIL_EVERY` | Cada cuántos ms se lee el correo |
| `REM_PDF_WARM=0` | No precalentar el motor de PDF |

## Ampliar REM

- **Módulos declarativos** (campos, plantillas, reglas, informes) sin tocar código: Ajustes → Módulos.
- **Skill de Claude Code** para operar, probar y crear módulos: `.claude/skills/rem-negocio/`.
- Cómo contribuir: [CONTRIBUTING.md](../CONTRIBUTING.md).
