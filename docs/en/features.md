# REM Negocio features

[Español](../funciones.md) · **English** · [Documentation index](README.md)

Detailed description of what the app does. What is mature and what is not: [Status by feature](status.md). What leaves your computer: [Security and privacy](security-privacy.md).

> **Invoices and VeriFactu:** REM numbers and produces invoices, but it is **not a compliant invoicing system** under Spain's RRSIF/VeriFactu regulation. Read [Legal framework](legal.md) before using it to issue invoices.

## How it is organised

| Menu | What is there |
|---|---|
| **Hoy** (Today) | Summary of the day and one list of what matters, most urgent first |
| **Mensajes** (Messages) | The inbox with Telegram, email and pasted messages |
| **Clientes** (Clients) | Records with each client's full history |
| **Dinero** (Money) | **Sales** (invoices and quotes; also delivery notes, hours and repeating invoices if you turn them on), **Expenses** and **How am I doing** (cash flow, reports and tax forms) |
| **Ajustes** (Settings) | **Your business**, **Messages**, **Assistant**, **Security and backups** and **Advanced** |

Features you do not use stay hidden: turn them on in Settings → Your business → Features. Next to each technical term there is a «?» button with a short explanation.

## What it includes

| Area | What it solves |
|---|---|
| **Hoy (Today)** | What to collect, what is overdue, accepted quotes not yet invoiced or unanswered, tasks and monthly trend |
| **Clients** | Client record with validated tax ID, history, debt, tasks and notes |
| **Quotes** | Automatic numbering, statuses (draft → sent → accepted/rejected), expiry and **conversion to invoice** |
| **Invoices** | Draft → issued (sequential number F2026-0001, no longer editable) → partial/full payments → overdue; **corrective invoices** instead of deleting; multiple VAT rates, discounts, IRPF withholding; printable sheet/PDF |
| **Payments** | Per-invoice record with outstanding balance; reminders with a draft message (email/WhatsApp/copy) |
| **Expenses** | With input VAT and categories |
| **Reports** | Income, expenses, result, quarterly VAT summary (form 303 style), top clients, CSV export for your accountant |
| **Settings** | Tax details and logo, defaults, catalogue, backups, JSON export, optional local AI (Ollama) |
| **Messages** | Single inbox (Telegram, email, pasted WhatsApp/iMessage, REM Clientes) with assistant drafts |
| **Tasks and Hours** | Tasks with subtasks and repetition; billable hours per client |
| **Cash flow and tax forms** | 30/60/90-day forecast; indicative figures for forms 130, 303, 115 and 347 |
| **General** | ⌘K search, light/dark theme, mobile layout with bottom bar, keyboard accessible |

## Messages and local assistant

- **Messages:** Telegram (bot), email (IMAP/SMTP with an app password and mandatory encrypted connection) and pasted WhatsApp/iMessage messages, in a single inbox.
- **Assistant (Ollama, optional):** leaves a draft reply using your business data (RAG: BM25 + optional embeddings). It treats the client's message as text, never as instructions, and nothing is sent until you press Send.
- **Knowledge:** rates, opening hours and terms the assistant can quote; it also answers questions from the Today screen.
- **Minimal voice:** «Listen» (macOS voice), «Dictate» (browser speech recognition) and Telegram voice notes with whisper.cpp if you have it.
- Tokens and passwords go into the macOS keychain.

## Agents and memory

- **Policy and approval:** every agent action has a mode (do it / ask / leave it to me). The floor in code (sending messages on its own, issuing invoices, deleting or exporting data) cannot be unlocked by any rule. «Stop everything» halts the agents and empties the queue.
- **Three agents, one job each:** Morning (daily summary), Collections (max. 3 suggestions a day) and Night (wrap-up and tomorrow's tasks, max. 15). They only read; they run on schedule and catch up on start.
- **Memory:** `negocio.md` (rules and tone), facts you have approved (visible and editable) and, **only if you want**, [Hindsight](https://github.com/vectorize-io/hindsight) locally for long-term memory (off by default; the app works the same without it).
- **Observability:** a log of model calls (duration, tokens, errors; never the text) and an hourly cap.

## Natural-language commands and shortcuts
Type in the Today bar or in ⌘K things like «factura a Marta por 3 horas a 40 €» (invoice Marta for 3 hours at €40), «recuérdame llamar a Pedro mañana» (remind me to call Pedro tomorrow), «gasto gasolina 45,50 €» or «abre clientes». REM interprets them with rules (no AI) or, if you have a local model, with it; **it shows what it is going to do and only does it if you confirm** (invoices are created as drafts; if two clients look alike, you choose). Shortcuts: `/` search or command, `N` then `F`/`P`/`C`/`G`/`T` creates invoice/quote/client/expense/task. On mobile, buttons are at least 44 px and respect the safe area. Code: `public/commands.js` (pure and tested), `public/assistant.js`.

## PDF and email sending

**Download PDF** of invoices and quotes, of the period report (VAT included) and of **each client's statement**. They are generated on your computer with the native macOS WebKit (paginated A4, no internet or JavaScript; the HTML is sanitised first). If your email is connected, **Send with PDF** sends the message with the invoice attached from your account, after you confirm. Without macOS the download falls back to «Print».

## More everyday tools

- **Backups:** automatic daily; in Settings → Security and backups you can **restore** (a copy of the current state is saved first), **download** and **import** backups (.db). Before accepting or restoring a backup, SQLite, its relations and the schema version are checked. Automatic, manual, imported and pre-operation backups have separate retention.
- **Client history:** in each record, a single timeline (messages, invoices, payments, quotes, tasks, memory) with what is coming up, filters and search.
- **Attachments:** on clients and invoices/quotes, drag or pick contracts, plans or delivery notes (PDF, images, Word, Excel, PowerPoint, text; up to 25 MB). Stored on your computer, content checked against the extension, opened without executing anything, deleted with their client or document.
- **Importing history:** in Settings → Security and backups, upload a CSV or Excel of issued invoices or expenses (separator and accents detected automatically; Spanish number and date formats). You get a preview with recognised columns —which you can correct—, warnings and rows with errors; nothing is saved until you confirm. Invoices keep number and date, clients are matched by tax ID or name, payments are recorded and anything already imported is skipped if you repeat the file.
- **Letters and contracts in Word:** besides PDF, «Download Word» produces an editable `.docx` (headings, lists, bold, signature lines), created on your computer.
- **Tax forms (indicative):** Money → How am I doing → Tax forms calculates the figures for forms 130, 303, 115 and 347 per quarter/year from your data, with CSV for your accountant. It files nothing with the tax agency.
- **Delivery notes:** create delivery notes (series A) and turn them into invoices one by one or in bulk per client.
- **Tasks:** with priority, repetition (the next one appears when you complete the current one) and subtasks with progress.
- **Access and startup:** PIN lock (4-12 digits, stored with scrypt, locks after inactivity and limits attempts; it does not encrypt the disk), launch at login on macOS and a menu-bar icon with pending counters.
- **Invoice series:** create series with their own prefix and yearly numbering in Settings → Your business → Billing and choose the series for each invoice.
- **Hours per client:** in Money → Sales → Hours you log time (or use the timer) with your hourly rate; «Bill hours» creates a draft invoice with one line per entry. Deleting that draft frees the hours again.
- **Accounts payable:** an expense can be marked «pending payment» with a due date. You see what you owe (and what is overdue) in Expenses and Today, mark it «Paid» with one click, and it feeds the cash-flow forecast, your calendar (.ics), the morning summary and the Excel/CSV export.
- **PowerPoint proposal:** from any quote, «Download proposal (PowerPoint)» creates an editable 5-slide deck with your details, lines, totals and terms; no internet or external templates.
- **Reading Word, PowerPoint and Excel:** text from `.docx`, `.pptx` and `.xlsx` is extracted locally, without opening or executing anything (size and decompression limits). It feeds the assistant's Knowledge, shows the content of Telegram and email attachments —treated as the sender's data, never as instructions— and imports invoices and expenses from `.xlsx`.
- **macOS notifications:** new messages (grouped), daily summary, proposals awaiting approval and quiet hours. For privacy they show no names or amounts unless you enable it.
- **Recurring expenses:** rent, fees, insurance… are recorded automatically each period (including missed ones if the app was closed).
- **Recurring invoices:** «Repeat…» on an invoice; each pending period prepares its own **draft** (never issued automatically).
- **Letters and contracts:** templates with variables (payment claim, service contract, data consent) from the client record → editable preview → PDF. Your own templates in Settings → Your business → Letters and contracts.
- **Calendar:** Tasks → Calendar: an `.ics` subscription with tasks, invoice due dates, quote expiry and recurring items (private, renewable link, only on your Mac).
- **Cash flow:** Money → How am I doing → Cash flow: 30/60/90-day forecast using due dates, each client's typical payment delay, recurring invoices, usual expenses, quarterly VAT and, if you enter it, your bank balance.
- **Excel:** `.xlsx` workbook with invoices, expenses, clients and quarterly VAT (real amounts and dates, filters and formula totals).

## Receipts and documents (local OCR)

Upload a photo or a PDF in **Expenses → Upload receipt** (or drag it), or send it by **Telegram or email**: attachments land in the review queue. It is read on your computer (text PDFs directly; scans and photos with Apple Vision → Tesseract → an Ollama vision model), the AI extracts supplier, date, base, VAT and total, and the app **checks that the amounts appear in the text and add up**. Nothing is created without your review; personal documents (ID cards…) are never sent to any model and can be deleted.

## Custom modules

In **Settings → Advanced → Modules** the user extends the app without code: extra fields on clients and invoices, message templates with variables, rules that only *propose* tasks, and custom reports. They are installed from a gallery, by pasting JSON, or **by describing them to Claude** with your own API key (optional, stored in the keychain; only the text you write is sent, never client data). A module is **data, not code**: it is strictly validated, shows what it will be able to do before installation, goes through the approval policy and can be removed.

## Fill in your details from your website (optional)
In Settings → Your business → Details (and in the first-run assistant) you can paste your website address: REM reads a few pages (home, contact, legal notice), extracts name, phone, address, opening hours and tax ID (from `schema.org` structured data, links and the legal notice) and shows them so **you tick what to save**. Optionally, a local model or Claude summarises the description and hours if missing. Security: http/https only, private networks blocked (also after redirects), `robots.txt` respected, size/time limits, and the tax ID is only accepted with a valid check digit. Code: `lib/webprofile.mjs`, `public/webprofile.js`.

## Importing from other software

In Settings → Security and backups: **clients** (Mac Contacts, Google, Outlook —English and Spanish—, vCard, CSV or Excel), **issued invoices** and **expenses** (also **DBF tables** from legacy programs and **Facturae XML**, the Spanish e-invoice format, with multi-line invoices and numbering continuity). Preview with duplicates and errors, automatic backup before importing and **undo** per batch. If the file is unusual, **«Sort with AI»** sends Claude —with your key— only a **masked sample** (you see it first) and receives a *declarative plan* that REM validates and applies locally: the AI proposes, it never executes or touches your data. Strategy for the most common Spanish programs: [migrations-spain.md](migrations-spain.md).

## REM Clientes (experimental)

A **link** your clients use to write to you from their phone with no app, no account and without giving you their number, with end-to-end encryption and cards for quotes (acceptable with one tap), payment and order status. Messages land in *Messages*. It needs a blind relay (`relay/`). Pilot guide: [rem-clientes-pilot.md](rem-clientes-pilot.md); product vision: [client-app.md](client-app.md).

## Email cards (level 0)
Quotes with Accept/Reject buttons, payment requests and status updates over **plain email**, with verified replies (single-use token + sender + SPF/DKIM). See [client-app.md](client-app.md) §14.1.

## Mac app and encrypted backups

`mac/` contains a **native macOS app** (SwiftUI) that bundles the server and guides you step by step: your business, how you invoice, backups, access and startup. Backups are **encrypted `.rembak` files** (AES-256-GCM, key derived from your passphrase with scrypt) in the folder you choose (USB, NAS, iCloud Drive); one a day and another on quit, verified by decrypting them, and the assistant **tests a restore** before considering them good. It includes a recovery sheet with a code in case you forget the passphrase. Details in [mac/README.en.md](../../mac/README.en.md) and [macos-assistant.md](macos-assistant.md). Build: `scripts/build-mac-app.sh`.

## Design
Its own icon system in the style of Apple's symbols: 1.75 stroke on a 24 grid with a **translucent secondary layer**, **colour tiles** with gradient and top light in the sidebar, and an **app icon** (`mac/tools/make-icon.swift`, Core Graphics: continuous superellipse, top light, glass rim and a monogram with depth) that generates the `.icns`, `icon.svg` and the web PNG icons.
