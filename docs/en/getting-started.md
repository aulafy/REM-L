# Getting started

[Español](../empezar.md) · **English** · [Documentation index](README.md)

## Try it in 10 minutes (fictitious data)

1. Install **Node.js 22.13 or later** from [nodejs.org](https://nodejs.org).
2. Download the repository («Code → Download ZIP» on GitHub, or `git clone https://github.com/aulafy/REM-L.git`).
3. On macOS, double-click **`Iniciar REM Negocio.command`**. You can also run `npm start` in the folder.
4. `http://127.0.0.1:4400` opens. On the welcome screen choose **«Explorar con datos de ejemplo»** (explore with sample data).

Suggested tour: **Hoy** (Today: what to collect, what is overdue) → an **invoice** and its PDF → **Dinero → Tesorería** (cash flow) → **Informes** (reports) → **Mensajes** (messages).

To try Telegram and email without real accounts: `npm run sim:serve` starts simulated servers and tells you what to enter in Settings. See the [simulator](../../sim/README.md).

## Before entering real data

- [ ] Read the [Legal framework](legal.md): **the official invoice is issued with a compliant program**, not with REM.
- [ ] Check the [Status by feature](status.md) and only rely on what is ✅ or 🟡.
- [ ] Turn on **FileVault** (the database is not encrypted) and the **PIN** in Settings → Access and startup.
- [ ] Set up off-computer backups: encrypted `.rembak` with the Mac app, or download backups from Settings → Data.
- [ ] Import your clients and history (Settings → Data) and compare totals with your previous program.

## Requirements

| | |
|---|---|
| System | macOS (recommended and tested). Linux and Windows: experimental |
| Node.js | 22.13 or later; no other dependencies |
| Local AI (optional) | [Ollama](https://ollama.com) with a model of about 8-9B; a Mac with 16-24 GB works well |
| Disk | A few MB for the app; data grows with attachments |

## Start-up options

```sh
npm start                                    # http://127.0.0.1:4400
REM_DATA_DIR=/path REM_PORT=4500 npm start   # another data folder and port
```

The **Mac app** (`mac/`) bundles the server and a set-up assistant. There is no notarised downloadable release yet; build it with `scripts/build-mac-app.sh`. See [mac/README.en.md](../../mac/README.en.md).

## Uninstall

Quit REM and delete the data folder (`~/Library/Application Support/REM Negocio`) and the program folder. Secrets are removed via Settings → Data → «Borrar todos los datos» (delete all data), or in Keychain Access by searching «REM Negocio».

## FAQ

**Does my data leave my computer?** No, unless you enable Telegram, email, Claude or REM Clientes. Details in [Security and privacy](security-privacy.md).

**Can I invoice with REM?** You can prepare and track invoices, but the official invoice must be issued with a compliant program. See [Legal framework](legal.md).

**Do I need AI?** No. Everything works without it; AI only drafts and proposes.

**How much does it cost?** The code is free software (MIT).

**Several computers or users?** No: it is designed for one person and one computer.
