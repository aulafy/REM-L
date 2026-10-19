# REM Negocio for Mac: setup assistant, backups and import

[Español](../asistente-macos.md) · **English**

Status (19/10/2026): **implemented in `mac/`**: phase 1 (SwiftUI app, assistant, encrypted backups with verification and test restore, health, packaging), phase 2 (client import from CSV, vCard, macOS Contacts, Google and Outlook; batches with undo; AI assistant with validated declarative plan, masked sample and consent) and phase 3 (guided tour, DBF reader, Facturae XML importer, numbering continuity, `.dmg`, manual update check). **Still to test:** signing and notarisation with an Apple Developer account (the release workflow exists but has not run with real credentials), per-program presets (real anonymised exports are needed) and phase 4 (optional). See `mac/README.en.md`.

Changes from the original design: the assistant is native for every step (including «Your business» and «How you invoice», which call the local API); «Bring your data» offers macOS Contacts, the file importer and optional AI help; the checklist lives in `GET /api/setup`.

## 1. Goal

That a non-technical person running a one-person business goes from «I downloaded the app» to «my data is in, my backups work and I know how to use it» in **under 30 minutes**, without opening the terminal or installing Node.

Success criteria (measured with real users, see [user-testing.md](user-testing.md)):
- 80 % finish the assistant unaided.
- At the end there is **one encrypted backup made and one restore tested** (not just «scheduled»).
- Their existing clients are already in and reviewed.
- They know where to look every day (Today) and what each tab does.

## 2. Decisions taken

| Topic | Decision |
|---|---|
| Format | Native **SwiftUI** app («REM Negocio.app») bundling Node, the server and the native helpers. |
| AI-assisted import | The user uploads a file; **Claude proposes a declarative mapping plan**; a local engine executes it with a preview. |
| Backups | To a folder the person chooses (USB, NAS, iCloud Drive…), **encrypted** with a passphrase, with a restore test. |
| Next step | Design first; implemented in phases after approval. |

## 3. Architecture

```
REM Negocio.app (SwiftUI, hardened runtime, signed and notarised)
├─ Native shell
│   ├─ Server supervisor (start/stop/restart Node, pick a free port, watch health)
│   ├─ Setup assistant (SwiftUI, see §4)
│   ├─ «Installation health» panel (backups, PIN, FileVault, disk space, version)
│   ├─ Main window: WKWebView with the current interface (http://127.0.0.1:PORT)
│   └─ Things only native code can do: folder picker (NSOpenPanel),
│        macOS Contacts (Contacts.framework), launch at login (SMAppService),
│        external disk detection, notifications, keychain (SecItem)
├─ Resources/node  (official universal binary, signed)
├─ Resources/app   (server.mjs, lib/, public/)
└─ Resources/bin   (precompiled helpers: PDF, OCR, menu bar; universal and signed)
```

- The app **does not use the App Sandbox** (distributed outside the Mac App Store with Developer ID), so the server can write to the backup folder the person chooses without tricks.
- The shell talks to the server through a local API with its own **admin token** (stored in the keychain), separate from the user's PIN.
- The server remains the single source of truth: the assistant only fills in settings and triggers actions that exist or are added as endpoints (`/api/backup/*`, `/api/import/*`, `/api/setup/*`).
- Updates: check a signed versions JSON + download the .dmg; database migrations with `PRAGMA user_version` and an automatic backup before migrating.

## 4. The assistant, step by step

Each step has a screen, a main button, «Skip for now» (if not essential) and can be reopened from Settings. Progress is saved: you can close and come back.

| # | Step | What happens | Essential |
|---|---|---|---|
| 0 | Welcome | What REM is, that data stays on the Mac, a computer check (macOS, space, FileVault on or off). | Yes |
| 1 | Your business | Name, tax ID (validated with check digit), address, logo, legal form (freelancer/company). | Yes |
| 2 | How you invoice | A template per activity (services, trades, retail, hospitality…) that fills VAT, IRPF, payment terms, invoice series, hourly rate, invoice footer and IBAN. Always editable. | Yes |
| 3 | Backups | §5. Ends with a backup made and a test restore. | Yes |
| 4 | Bring your data | §6: contacts, clients, old invoices, expenses. | No |
| 5 | Messages and assistant | Optional: Telegram, email, detect Ollama (and guide a model download), Claude API key for assisted import. | No |
| 6 | Access and startup | PIN, open at login, menu-bar icon. | Recommended |
| 7 | How it works | A 2-minute guided tour on sample data in a temporary database, with «try it» in 3 actions: create a client, a quote and an expense. | Recommended |
| 8 | All set | Green/amber checklist and next steps. The same list stays pinned in Today until completed. | — |

Principles: plain language, no jargon; each screen explains **why** it asks for something; no step sends data out without saying so first.

## 5. Backups

**What is copied:** the database (consistent, using `VACUUM INTO`), attachments and settings (without keychain secrets).

**`.rembak` format:** inner ZIP → AES-256-GCM encryption, key derived from the passphrase with scrypt; header with version, salt and IV; checksum. No dependencies (Node's `crypto` module).

**Destination:** the folder chosen in the assistant (USB, NAS, iCloud Drive). If the disk is missing, the backup is queued and the user is warned; it never fails silently.

**When:** once a day, on quitting the app and before every import, restore, migration or deletion.

**Retention:** 7 daily + 4 weekly + 12 monthly, plus the last 5 «safety» backups (before delicate operations), so a few imports cannot wipe out the daily history.

**Verification (the key to trust):**
1. After each backup: decrypt, check the checksum and run `PRAGMA integrity_check` on a temporary copy.
2. In the assistant: **test restore** to a temporary folder and compare the number of clients and invoices. Only then is the step marked done.
3. A warning in Today if there has been no backup for more than 3 days or the last one was not verified.

**Passphrase and recovery:** a **printable recovery sheet** is shown (a 24-character code that also opens the backup). It is explained clearly that without the passphrase or code the backup cannot be opened. It also works to restore on another Mac.

**Restoring:** from the Health panel or the repair screen; a copy of the current state is always saved first, and restoring a backup from a newer version than the installed one is blocked.

## 6. Importing data and contacts

### 6.1 Design principle

> The AI **proposes** how to read a file; it **never executes** anything or touches your data. A local, deterministic engine with a preview performs the actual import.

### 6.2 Sources

| Layer | Sources | How |
|---|---|---|
| A. Fixed, offline | macOS Contacts (Contacts.framework, with permission), vCard (.vcf), CSV and Excel, Google Contacts and Outlook CSV | Local importers with guided mapping. |
| B. Per-program presets | Holded, Quipu, Billin, Factura Directa, Contasol/Facturaplus, typical home-made Excel | Detection by header signature and a versioned mapping template. |
| C. AI-assisted | Any table or export that does not fit A/B | §6.3. |
| D. Legacy formats | DBF, fixed-width text, odd CSVs, Excel with merged cells | Local DBF and fixed-width reader; the record layout is proposed by the AI (§6.3). Fallback with a generated converter, see §6.4. |

### 6.3 AI-assisted import (layer C)

1. **Local profiling.** The engine reads the file and builds a profile per table/sheet: column names, inferred types, row count, frequent distinct values and about 10 sample rows.
2. **Masking.** Before anything is sent, tax IDs, emails, phones, IBANs and names are replaced with values of the same shape (`B1234****`, `a***@d***.com`, `9xx xxx xxx`). An explicit option to send a real sample exists (off by default). A consent screen shows **exactly** what will be sent.
3. **Request to the Claude API** (the user's own key, in the keychain): the masked profile + the target schema (clients, invoices, lines, payments, expenses, items). The answer is a **JSON import plan**, validated against a strict schema.
4. **The plan is declarative, not code:** for each target field it names the source column(s) and a transformation from a **closed catalogue** (`trim`, `upper`, `parse_date(format)`, `parse_money(locale)`, `split`, `concat`, `map_values`, bounded `regex_extract`, `constant`, `lookup`). Plus: how to group lines into invoices, what to do with duplicates and which questions the person must resolve.
5. **Local dry run.** The engine applies the plan to **all** the data and shows: rows that go in, duplicates, errors with reasons, totals that do not reconcile, new clients, and a comparison «your old program's figure» vs «imported figure» (e.g. total invoiced in the year).
6. **Review and edit.** The person fixes the mapping in a table and can ask the AI for a new attempt with comments.
7. **Confirm.** Automatic prior backup → import in one transaction → report → **undo** (an identified import batch: deletes only what it created; warns if it was already edited).

Safety against hostile data: file content is passed as **quoted data**, the result must pass the schema (an «ignore the above» in a cell cannot create actions outside the catalogue), and size and call limits are recorded in the model call log (without storing the text).

Without a key, or without wanting to send data: manual mode with the same engine and a hand-editable mapping.

### 6.4 Custom converters with Claude Code (later, optional phase)

For binary or proprietary formats that neither the local readers nor the declarative plan can handle, Claude can be asked to **generate a CSV converter** for that specific program.

Rules, because this is the risky part:
- Only with explicit consent and showing the generated code in plain language.
- It runs **sandboxed** (`sandbox-exec`: no network, read-only on the input file and write access to a temporary folder, with time and memory limits).
- Its only valid output is a CSV/JSON that goes through the same local engine as §6.3 (preview, prior backup, undo).
- Converters that work are saved as **versioned templates** (layer B) so code is not generated again for the same program.
- If it cannot be properly sandboxed on a given computer, it is not offered.

### 6.5 Contacts

- **macOS Contacts:** a picker with checkboxes (all, a group or selected), mapped to clients (name or company, tax ID if there is a custom field, email, phone, address). Duplicate detection by tax ID and by name/email.
- **vCard / contacts CSV:** same engine.
- New data rule: **normalised, unique tax ID**; clients without a tax ID are flagged as incomplete before they can be invoiced.

### 6.6 Quality

A test corpus of **synthetic** exports from each program and home-made Excel files, with expected results. Metrics: % of columns correctly mapped, of rows imported without intervention and of totals that reconcile. A regression of the AI plan against the corpus is reviewed before changing the model or the prompt.

## 7. Distribution

- Developer ID signature, `codesign --options runtime`, notarisation (`notarytool`) and stapling; delivered as a `.dmg`.
- Official universal Node (arm64 + x86_64) and native helpers **precompiled and signed** inside the `.app` (no longer compiled on the user's Mac).
- Launch at login with `SMAppService` (instead of a manual plist).
- Migration from the web version: the existing data folder is detected and offered for adoption (with a prior backup).
- macOS only in this phase (Apple Silicon and Intel). Windows and Linux are out of scope.

## 8. Phases

| Phase | Content | Estimate |
|---|---|---|
| **1. Base and backups** | `.app` with server supervisor and window; steps 0-3 and 6; encrypted backup engine with verification and test restore; Health panel; migrations with `user_version`. | 3-4 weeks |
| **2. Data in** | macOS Contacts and vCard; presets (layer B); import batches with undo; AI-assisted import with declarative plan and test corpus; steps 4 and 5. | 3-4 weeks |
| **3. Guidance and polish** | Interactive tour (step 7) and checklist (step 8); DBF and fixed-width reader; updates; signing and notarisation in CI. | 2-3 weeks |
| **4. Optional** | Generated, sandboxed converters (§6.4). | on demand |

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Sending personal data to an external API (GDPR) | Masking, detailed consent, the user's own key, an AI-free mode, a log of what was sent (size, not content). Legal review of the wording and, where appropriate, a data processing agreement with the provider. |
| Wrong AI plan | Preview with totals reconciliation, prior backup, undo, regression corpus. |
| Losing the passphrase | Printable recovery sheet and clear messages; without it the backup cannot be opened (that is the point). |
| Malicious or faulty generated code (phase 4) | Sandboxing, visible review, output only through the local engine; it can simply not be offered. |
| No Apple Developer account means no convenient distribution | A prior decision is needed (see below). |
| Scope | Closed phases with acceptance criteria and user testing at the end of phases 1 and 2. |

## 10. Open questions

1. Is there an **Apple Developer** account ($99/year) to sign and notarise?
2. **Claude API key:** does each user bring their own (recommended: privacy and cost on their side) or is a managed service offered (implies a server, cost and processing third-party data)?
3. Minimum macOS version to support (proposed: macOS 13).
4. Which legacy programs should be covered first? A list of 3-5 (with anonymised sample exports) is worth more than any assumption.
5. ~~May the `.app` be distributed to end users?~~ Resolved: the code is now MIT, so it can be redistributed keeping the copyright notice.
