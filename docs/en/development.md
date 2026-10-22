# Development and testing

[Español](../desarrollo.md) · **English** · [Documentation index](README.md)

## Architecture in one line

A dependency-free Node server (`server.mjs` + `lib/`, SQLite via `node:sqlite`) and a framework-free web interface (`public/`), all on `127.0.0.1`. The full step-by-step explanation is in the [build tutorial](tutorial.md).

| Folder | Contents |
|---|---|
| `server.mjs`, `lib/` | API, database, agents, channels, importers, PDF, backups |
| `public/` | Interface (views, tax calculations in `calc.js`, commands in `commands.js`) |
| `mac/` | Native SwiftUI app |
| `relay/` | Blind relay for REM Clientes |
| `sim/` | SME simulator |
| `test/` | Tests (`node:test`) |
| `book/`, `ebook/` | The book «Manual del usuario de REM» (CC BY-SA 4.0) |
| `promo/`, `web/` | Presentation material and a sample landing page |

## Tests

```sh
npm test                 # automated tests (node:test, no dependencies)
npm run sim              # simulator: three fictitious businesses with simulated Telegram, email and model
npm run sim -- --llm real --model qwen3.5:9b-mlx   # the same run with your Ollama
npm run stress           # load test
```

- **SME simulator:** see [sim/README.md](../../sim/README.md). Before using `--llm real`, make sure no other application is using Ollama: loading the model may evict another one from memory.
- **Data integrity:** relations, rules against inconsistent data, repair mode and diagnostic queries in [data-integrity.md](data-integrity.md).
- **Load test:** `npm run stress` (options: `--clients 5000 --invoices 10000 --customers 1000 --only a|b`) starts a real business server and relay and checks: **A)** thousands of clients and invoices with concurrent writes (numbering without duplicates or gaps, totals, payments, exports, backup and `integrity_check`); **B)** thousands of REM Clientes customers encrypting messages at once. Reference on a Mac: 10,000 invoices issued in ~26 s. Known limit: with 5,000 clients and 10,000 invoices, `/api/state` weighs ~6 MB and takes ~1.4 s; periodic polling already uses `/api/pulse`, but pagination is still to do.

## Environment variables

| Variable | Purpose |
|---|---|
| `REM_DATA_DIR`, `REM_PORT` | Data folder and port |
| `REM_NO_KEYCHAIN=1` | Do not use the keychain (tests); secrets stay in memory |
| `REM_TELEGRAM_BASE`, `REM_TG_POLL` | Alternative Telegram API (simulator) and polling wait |
| `REM_MAIL_EVERY` | How often email is read, in ms |
| `REM_PDF_WARM=0` | Do not pre-warm the PDF engine |

## Extending REM

- **Declarative modules** (fields, templates, rules, reports) without touching code: Settings → Advanced → Modules.
- **Claude Code skill** to operate, test and create modules: `.claude/skills/rem-negocio/`.
- How to contribute: [CONTRIBUTING.md](../../CONTRIBUTING.md).
