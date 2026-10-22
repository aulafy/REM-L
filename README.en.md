# REM Negocio

[Español](README.md) · **English**

[![Tests](https://github.com/aulafy/REM-L/actions/workflows/ci.yml/badge.svg)](https://github.com/aulafy/REM-L/actions/workflows/ci.yml) ![MIT licence](https://img.shields.io/badge/licence-MIT-blue) ![Node 22.13+](https://img.shields.io/badge/node-%E2%89%A522.13-green) ![macOS](https://img.shields.io/badge/platform-macOS-lightgrey)

**Day-to-day management for a small business or freelancer, on their own computer.** Clients, quotes, payments, expenses, tasks and client messages on one screen, with a local AI assistant that prepares drafts and never sends anything on its own.

> The interface and tax rules target **Spain** (VAT/IVA, IRPF withholding, NIF tax IDs, forms 130/303/115/347). The architecture, agent design and security model are general.

![REM Negocio «Today» screen with fictitious data](promo/carrusel/img/p-hoy.png)

## Why REM

- **Your data stays on your computer.** No accounts, no cloud, no telemetry. Local database with daily and encrypted backups.
- **You know what to do today.** What to collect, what is overdue, which quotes await an answer and which messages need a reply.
- **AI that proposes, not acts.** A local model (Ollama) drafts replies and payment reminders using your business data. **Approving is not sending:** nothing leaves without your click, not even when a message tries to trick the assistant.
- **A clean close for your accountant.** Quarterly VAT, indicative figures for forms 130/303/115/347, CSV and Excel export.
- **Free and dependency-free.** MIT licence; it only needs Node.js.

## What it is not

> **REM is not a VeriFactu-compliant invoicing system.** Spain's regulation applies to any program used to issue invoices, even if it sends nothing to the tax agency. Issue your official invoices with a compliant program and use REM to prepare, track, collect and hand over the close. Details and official sources: [Legal framework](docs/en/legal.md).

It does not file taxes, is not multi-user and is not yet meant for Windows or Linux.

## Try it in 10 minutes

1. Install [Node.js](https://nodejs.org) 22.13 or later.
2. Download this repository («Code → Download ZIP»).
3. On macOS, double-click **`Iniciar REM Negocio.command`** (or run `npm start`).
4. At `http://127.0.0.1:4400`, choose **«Explorar con datos de ejemplo»** (explore with sample data): everything is fictitious.

Before entering real data, follow the [Getting started](docs/en/getting-started.md) checklist.

## What it includes

| Area | What it solves |
|---|---|
| **Today** | What to collect, what is overdue, pending quotes, tasks and the month's trend |
| **Clients** | Record with validated tax ID, single timeline, debt, files and notes |
| **Quotes and delivery notes** | Statuses, expiry, PowerPoint proposal and conversion to invoice |
| **Invoices and payments** | Internal tracking with series, corrective invoices, VAT, IRPF and partial payments |
| **Expenses and cash flow** | Receipts with local OCR, accounts payable, recurring items and a 30/60/90-day forecast |
| **Messages** | Telegram, email and pasted WhatsApp in one inbox, with assistant drafts |
| **Accountant** | Quarterly VAT, indicative forms, CSV and Excel |
| **Safety** | PIN, daily backups, encrypted backups, repair mode |

Everything, screen by screen: [Features](docs/en/features.md). What is stable and what is experimental: [Status by feature](docs/en/status.md).

## Documentation

| For | Start with |
|---|---|
| **Businesses** | [Getting started](docs/en/getting-started.md) · [Security and privacy](docs/en/security-privacy.md) · [Legal framework](docs/en/legal.md) · [User manual (PDF, Spanish)](ebook/Manual-del-usuario-de-REM.pdf) |
| **Accountants** | [What data you receive and in which format](docs/en/advisor.md) |
| **Developers** | [Development and testing](docs/en/development.md) · [Build tutorial](docs/en/tutorial.md) · [SME simulator](sim/README.md) |

Full index: [docs/en/](docs/en/README.md). Roadmap: [docs/en/roadmap.md](docs/en/roadmap.md). Changes: [CHANGELOG.md](CHANGELOG.md).

## Project status

Version 1.0.0. Core management (clients, quotes, internal invoices, payments, expenses, backups) is **stable**, covered by more than 270 automated tests and an [SME simulator](sim/README.md). Messages, the assistant and the Mac app are **beta**; the encrypted client channel (REM Clientes) is **experimental**. No independent security audit yet and the database is not encrypted at rest: see [Security and privacy](docs/en/security-privacy.md).

## Contributing and contact

Issues and ideas: [GitHub Issues](https://github.com/aulafy/REM-L/issues). How to contribute: [CONTRIBUTING.md](CONTRIBUTING.md). Security issues: [SECURITY.md](SECURITY.md).

It follows the philosophy of [REM](https://github.com/aulafy/REM): local first and human review.

## Licence

Code under **MIT** ([LICENSE](LICENSE)). The book «Manual del usuario de REM» (`book/`, `ebook/`) is distributed under **CC BY-SA 4.0**. Author: Ramon Guillamon (learntouseai@gmail.com).

REM does not provide tax or legal advice.
