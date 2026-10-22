# Status by feature

[Español](../estado.md) · **English** · [Documentation index](README.md)

REM is a young project: some parts are thoroughly tested and others are experiments. This table says which is which. Reviewed on 22/10/2026 (version 1.0.0).

| Level | Meaning |
|---|---|
| ✅ **Stable** | Covered by automated tests and the SME simulator. Ready for real data, with backups on. |
| 🟡 **Beta** | Works and is tested, but has little experience with real businesses or depends on external pieces. Use it with care. |
| 🧪 **Experimental** | Prototype. Try it with fictitious data. |
| ⛔ **Not available** | Does not exist; do not assume it. |

## Management

| Feature | Status | Notes |
|---|---|---|
| Clients, quotes, delivery notes, tasks, hours | ✅ | |
| Payments, expenses, accounts payable, series | ✅ | |
| Invoices and corrective invoices (internal tracking) | ✅ | **Do not use as the official invoice**: see [Legal framework](legal.md) |
| `.db` backups, restore, repair mode | ✅ | |
| Import CSV / Excel / Facturae / DBF | ✅ | No specific presets for Holded, Quipu, etc. |
| Export CSV / Excel / JSON | ✅ | |
| PIN lock | ✅ | Does not encrypt the disk |
| 30/60/90 cash flow | 🟡 | A forecast, not accounting |
| Forms 130, 303, 115, 347 | 🟡 | **Indicative**; not validated with accountants |
| Recurring invoices and expenses | 🟡 | Recurring invoices are never issued automatically |
| Natural-language commands | 🟡 | Always ask for confirmation |
| PDF, Word and PowerPoint | 🟡 | Native PDF on macOS only; elsewhere, «Print» |

## Messages and AI

| Feature | Status | Notes |
|---|---|---|
| Inbox: Telegram and email | 🟡 | Tested against simulated servers; little experience with real providers |
| WhatsApp / iMessage | 🟡 | Only by **pasting** messages; no direct connection |
| Assistant with Ollama (drafts) | 🟡 | Tested with qwen3.5 9B: 18/18 drafts, ~9 s each on an M4 Mac |
| Morning, Collections and Night agents | 🟡 | Read-only; they only propose |
| Receipt OCR | 🟡 | Best on macOS (Apple Vision) |
| Hindsight memory | 🧪 | Off by default |
| Modules generated with Claude, «Sort with AI» | 🧪 | Need your API key |
| Fill in details from your website | 🧪 | Always with field-by-field review |
| Voice (listen, dictate, voice notes) | 🧪 | |

## Client channel

| Feature | Status | Notes |
|---|---|---|
| Email cards (accept quote, report payment) | 🧪 | Reply verified with token and SPF/DKIM |
| REM Clientes and relay | 🧪 | No relay deployed and no security audit |

## Platforms

| Platform | Status | Notes |
|---|---|---|
| macOS (browser + `npm start`) | ✅ | Where it is tested (CI on macOS) |
| Mac app (SwiftUI) | 🟡 | Builds in CI; **not notarised** and no downloadable release yet |
| Linux / Windows | 🧪 | Starts, but no keychain (secrets lost on restart), no native PDF or Apple OCR; not tested |
| Several users at once | ⛔ | Designed for one person per computer |

## Not available

- ⛔ Compliant invoicing system (VeriFactu / non-VeriFactu) and SII.
- ⛔ B2B e-invoicing and payment-status reporting.
- ⛔ Database encryption at rest (only `.rembak` backups).
- ⛔ Bank reconciliation and SEPA direct-debit batches.
