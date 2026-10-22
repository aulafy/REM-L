# REM Negocio roadmap

[Español](../../ROADMAP.md) · **English**

Status as of 22/10/2026. Order = value / effort. One feature at a time, with tests and a local commit.

## Done
- Clients, quotes, invoices (corrective invoices, payments), expenses, reports, tasks
- Messages: Telegram, email (IMAP/SMTP), pasted WhatsApp/iMessage · local assistant (Ollama), RAG, `negocio.md`, editable memory, Hindsight (optional)
- Action policy + approval queue + «Stop everything» · Morning / Collections / Night agents · model call log
- Local OCR of receipts and PDFs (Telegram, email, upload) · declarative modules with Claude (optional)
- Native PDF (invoices, quotes, reports, statement) · send with PDF attached
- Restore/import backups · recurring invoices · letters and contracts from templates · .ics calendar · Excel .xlsx

## Next block (in this order)
1. ~~Cash-flow forecast (30/60/90 days)~~ ✅ done: Money → Cash flow (collections using each client's real delay, recurring items, usual expenses, VAT, optional balance)
2. ~~Recurring expenses~~ ✅ done: recorded automatically each period (one per missed period), with optional estimated amount; the forecast uses them
3. ~~System notifications~~ ✅ done: Settings → Notifications (grouped messages, daily summary, proposals, quiet hours, no sensitive data by default) and a counter in the tab title
4. ~~Single timeline per client~~ ✅ done: messages, invoices, payments, quotes, tasks and memory plus «Coming up»; filters and search
5. ~~Attach files to clients and invoices~~ ✅ done: «Files» card (drag or pick, view, download, rename, note); allow-list of types with content check, max 25 MB, shown in the timeline
6. ~~Import historical invoices and expenses from CSV~~ ✅ done: Settings → Data → «Import old data» (preview, detected and editable columns, duplicates skipped, backup before importing)

## Office files (added)
7. ~~Read Word, PowerPoint and Excel~~ ✅ done: `.docx` / `.pptx` / `.xlsx` (ZIP with size, CRC and decompression-bomb limits; nothing executed) and `.rtf` / `.doc` / `.odt` via `textutil` on macOS
   - Settings → Knowledge → «From a file…» fills an assistant document
   - Telegram and email attachments: their text appears in the message; the assistant treats it as data
   - Import invoices and expenses from `.xlsx` (choose sheet; dates and amounts by cell format)
   - Limits: PowerPoint text and notes only; legacy `.ppt` and `.xls` not supported; Excel: hidden sheets ignored, max 20,000 rows and 100 columns
8. ~~Generate `.docx` letters and contracts~~ ✅ done: «Download Word» next to PDF (real Word styles, bullets, bold/italic, A4; verified with python-docx; no dependencies)
9. ~~`.pptx` sales proposal from a quote~~ ✅ done: 5 editable 16:9 slides (cover, scope, investment with table and totals, terms, next steps); verified with python-pptx and Quick Look

## Later
10. ~~Accounts payable~~ ✅ done: an expense can be «pending payment» with a due date; what you owe in Expenses and Today, «Paid» button, filter, payments in the forecast, .ics calendar, morning summary and exports
11. ~~Hours per client → invoice~~ ✅ done: Money → Hours (log, timer, hourly rate, «Bill hours» creates a draft with one line per entry; deleting the draft frees the hours)
12. ~~Quarterly summaries 130 / 115 / 347~~ ✅ done: Money → Forms with 130, 303, 115 and 347, CSV and a notice that they are indicative; nothing is filed
13. ~~Configurable invoice series~~ ✅ done: Settings → Billing → Series (1-4 letter prefix, own yearly counter, default), selector on each invoice; P and R reserved
14. ~~Delivery notes → invoice~~ ✅ done: Money → Delivery notes (series A); several notes of the same client become ONE draft invoice; deleting the draft frees them
15. ~~Tasks with repetition, priority and subtasks~~ ✅ done
16. ~~Launch at login + menu-bar icon · PIN lock~~ ✅ done: Settings → Access and startup (PIN with scrypt, cookie session, inactivity lock and attempt limit; user LaunchAgent; native icon with counters). The PIN does not encrypt the disk

## Block 2 (October 2026)
17. ✅ **Mac app (SwiftUI)**: setup assistant, encrypted `.rembak` backups with verification and test restore, import of contacts and files from other programs (CSV, Excel, vCard, Facturae XML, DBF) with preview, undo and optional AI help with a validated declarative plan; `.dmg` and release workflow (notarisation **not** tested with real credentials)
18. ✅ **REM Clientes (prototype)**: encrypted web chat link, blind relay (with acknowledgements and deletion of delivered messages), channel in REM with quote, payment and status cards
19. ✅ **Structured email (level 0)**: email cards with single-use token and verified reply (sender + SPF/DKIM)
20. ✅ **Fill company details from its website** (optional, field-by-field review)
21. ✅ **Natural-language commands** with confirmation (rules, or optional local model) and keyboard shortcuts (`/`, `N`+letter)
22. ✅ **Touch-friendly UI** (44 px targets) and its own **icon system**
23. ✅ **Load test** (`npm run stress`): found and fixed real relay bugs
24. ✅ **Educational documentation**: build tutorial, the book «Manual del usuario de REM» (`book/`, CC BY-SA 4.0) and a Claude Code skill (`.claude/skills/rem-negocio`). The code becomes **MIT**.

## Block 3 (October 2026)
25. ✅ **Lightweight polling**: the web client checks `/api/pulse` every 6 s instead of downloading the whole state; gzip for large responses
26. ✅ **Email**: messages are no longer lost when more than 15 arrive at once after connecting an empty mailbox (found by the simulator)
27. ✅ **SME simulator** (`npm run sim`): three fictitious seeded businesses with simulated Telegram, IMAP/SMTP and Ollama; also with the real model
28. ✅ **Documentation for businesses**: short README, docs by audience, status by feature, security and privacy, legal framework, CHANGELOG, SECURITY and CONTRIBUTING

## Under consideration (decision pending)
- **Tax boundary, «companion mode»**: REM would not issue the official invoice. Drafts and pro formas marked «NOT AN INVOICE», export to the compliant program and import of the official invoice as the canonical document. See [Legal framework](legal.md)
- Rule-based quarterly review («possible inconsistencies» before handing over to the accountant), round trip with the accountant and a collections file (promises, next action, returned debits)

## Pending
- **Presets for specific programs** (Holded, Quipu, Billin, Contasimple, Factusol…): they need real, anonymised exports; none is written without them
- **Deploy a relay** with HTTPS and test REM Clientes with real businesses; then QR codes and push notifications
- **Performance with large data**: `/api/state` weighs about 6 MB with 5,000 clients and 10,000 invoices; polling no longer downloads it, but it still needs pagination
- **Hindsight**: restrict its address to this computer, as is already done for Ollama
- **Notarisation** of the Mac app with an Apple Developer account
- **Independent security audit** of the client channel and protocol before using it with sensitive data
- **Database encryption at rest** (today only `.rembak` backups are encrypted)

## Only if users ask for it
- Bank reconciliation (bank CSV)
- Mobile access on the local network with PIN (receipt photos with the camera)

## Out of scope (owner's decision)
- Turning REM into a compliant invoicing system (VeriFactu / non-VeriFactu) or SII. See «Under consideration» for the alternative.
