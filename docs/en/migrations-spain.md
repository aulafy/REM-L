# Migrating to REM Negocio from the apps Spanish freelancers use

[Español](../migraciones-espana.md) · **English**

Status (19/10/2026): **strategy, partly implemented**. What exists is marked ✅. Everything that depends on real exports from specific programs (per-program presets) and on third-party API terms is still pending.

## 1. What a freelancer uses today

A list built from industry comparisons (to be verified with real users: these sources have affiliations) and from the question «where does a one-person business keep its data?».

| Family | Programs | Notes |
|---|---|---|
| Cloud invoicing and accounting | **Holded**, **Quipu** (TeamSystem group), **Billin / TeamSystem Facturas**, **Contasimple**, **Anfix** | The most frequent in 2026 comparisons. All of them talk about VeriFactu. |
| Classic desktop | **Factusol / Contasol / Facturaplus** (Software del Sol, now TeamSystem), Sage, A3 | Lots of history; proprietary formats; export to Excel/CSV. |
| Spreadsheets | **Excel**, Google Sheets, Numbers | The most used «program» of all: home-made templates, one per person. |
| CRM and contacts | **HubSpot** (free tier), **Zoho CRM**, **Pipedrive**, Odoo, Clientify; **Google Contacts**, **Outlook**, **macOS Contacts**, WhatsApp Business | Export contacts to CSV; some have an API. |
| Invoice standard | **Facturae** (XML, 3.2.2 the latest) | Mandatory with Spanish public administrations; many programs produce and read it. |

Sources consulted: comparisons by [Infoautónomos](https://www.infoautonomos.com/blog/mejor-programa-facturacion-pymes/) and [GuíaFiscal](https://guiafiscal.es/comparativas/mejor-programa-facturacion-autonomos/), [Quipu vs Billin](https://getquipu.com/blog/quipu-vs-billin/), [Billin's API page](https://www.billin.net/?p=35802), the [official Facturae 3.2.2 schema](https://www.facturae.gob.es/content/dam/facturae/formato/versiones/Facturaev3_2_2.xml) and CRM export guides (Pipedrive, HubSpot, Zoho).

**What is NOT verified** and must not be assumed: the exact column names of each export, which plans include an API, the database engine of Factusol/Contasol. Project rule: **no preset for a program is written without a real (anonymised) export in front of us**.

## 2. Guiding principle

> One import engine, many «entry doors». Each program is just a way of reaching the same rows, with the same analysis, the same preview, the same prior backup and the same «undo».

That engine exists ✅ (`lib/importer.mjs`): clients, issued invoices and expenses, deduplication, batches with undo. Its key piece for this strategy is the **declarative plan** ✅ (`lib/importplan.mjs`), which describes how to turn someone else's table into ours without executing code. **A program preset is just a saved plan** with its header signature.

## 3. Four entry doors (from most to least universal)

### Door 0 · Universal formats
| Format | Status | Detail |
|---|---|---|
| CSV / Excel (.xlsx) | ✅ | Separator and column detection. |
| vCard (.vcf), macOS Contacts, Google and Outlook CSV (English and Spanish) | ✅ | Mobile as main phone; landline as second; company + person. |
| **Facturae XML** (issued and received) | ✅ | Public standard (structure checked against the official 3.2.2 schema): parties, lines with VAT, IRPF withholding, due date. Detects issued/received using your tax ID or asks you; several files at once; our own safe XML reader (no entities or DTD). No real samples from specific programs yet: to be tested with user files. |
| UTF-16 / Windows-1252 / unusual separators | Partial | The browser already detects UTF-8 and Windows-1252; UTF-16 is missing (used by some desktop exporters, to be verified). |
| VAT record books (tax-agency format, XLSX/CSV) | To study | Accountants ask for them; they could also be imported. |

### Door 1 · Per-program presets (guided manual export)
- For each program: a «**How to export your data from X**» card (3-5 steps with screenshots) + a **saved plan** that recognises its export by the headers.
- Automatic detection: the user drops the file and the app says «This looks like an export from X».
- Presets live in `presets/*.json` (plan + signature + version + date of the sample export), with **regression tests against synthetic exports** that reproduce the real structure.
- Suggested order (value × ease): Holded → Quipu → Billin → Contasimple → Anfix → Factusol/Contasol → CRM (HubSpot, Pipedrive, Zoho).

### Door 2 · Direct API connection (with the user's own key)
- For those that offer it (Holded, Quipu and Billin say they have an API; **plans, limits and terms to be verified**; also HubSpot, Pipedrive and Zoho).
- The user pastes their key (local keychain) and REM **reads** contacts, invoices and expenses **read-only**, paginating, and turns them into the same engine rows. No intermediate server: the connection goes from the user's Mac to the provider.
- Advantage: no manual export and higher fidelity (lines, taxes, payments). Risks: plans without API, rate limits, provider changes, terms of use. That is why it is door 2, not door 0.

### Door 3 · Desktop and legacy formats
- Factusol/Contasol/Facturaplus/Sage: the **export to Excel/CSV** route from the program itself (the UTF-16 encoding of some exports must be confirmed with a real one).
- Files that are not even tables (DBF, fixed width, text reports): the **AI assistant** ✅ proposes the plan (including the record layout) and the local reader applies it; as a last resort, **phase 4** of generated, sandboxed converters.

## 4. What data is migrated (and with what fidelity)

| Data | Today ✅ | Next |
|---|---|---|
| Clients / contacts | ✅ with deduplication by tax ID, email and name | Several contacts per company (people) as notes or linked clients. |
| Issued invoices | ✅ with several lines (rows sharing a number) and several VAT rates | Lines with discount and quantities. |
| Payments | ✅ paid/unpaid with date | Partial payments and payment methods. |
| Expenses / received invoices | ✅ | Explicit withholding and VAT. |
| Quotes, delivery notes, items/catalogue | — | Same plan mechanism. |
| Files (invoice PDFs) | — | Attach them to the document if the export includes paths or a ZIP. |
| **Numbering continuity** | ✅ | If imported numbers use another format, at the end it proposes «the next invoice will be F2026-0058», applied with one click (also in Settings). |
| CRM: people/organisations | ✅ as clients | Deals → optional quotes; notes → client notes; activities → tasks. |

## 5. Quality checks before accepting anything

1. **Totals reconciliation**: «your old program says X invoiced in 2025; REM imported X». Per year and quarter (base, VAT, IRPF).
2. **Duplicates** (done) and **numbering gaps** per series.
3. **Preview with a real sample and warnings** (done) and batch **«undo»** (done).
4. Downloadable **import report**: what came in, what did not and why (to show your accountant).
5. Imported invoices are **history**: they are not reissued or re-signed; they are marked as imported. REM is not certified invoicing software (VeriFactu): history is kept as it is.

## 6. Keeping it honest

- **Samples programme**: ask beta users for an anonymised export (a local script masks tax IDs, names and amounts while keeping the shape). Each sample joins a corpus and produces a preset with its test.
- **Preset versioning**: each preset carries the date and version of the source program; if an export does not fit, the engine falls back to the AI assistant instead of failing.
- **No telemetry**: nothing is sent unless the user does it. The AI assistant shows exactly what it would send (implemented ✅) and the sample is masked by default.
- **Measure**: % of columns correctly mapped, % of rows imported without intervention and % of totals that reconcile, per program.

## 7. Proposed work plan

| Order | Deliverable | Effort |
|---|---|---|
| 1 | ✅ **Numbering continuity** and **multi-line invoices**. | done |
| 2 | ✅ **Facturae XML importer** (issued and received). | done |
| 3 | ✅ recognition framework (`lib/presets.mjs`: signature + export guide, with Google Contacts and Outlook) and export guides. Missing: the full **preset** framework (plan + signature + «how to export» card), automatic detection and **one real program with a sample export**. | M |
| 4 | **Holded and Quipu** via manual export (presets); then a read-only API connection if terms are confirmed. | M-L |
| 5 | Billin, Contasimple, Anfix. | M each |
| 6 | Factusol/Contasol (UTF-16, Excel) and CRMs (HubSpot, Pipedrive, Zoho). | M |
| 7 | Totals reconciliation per year/quarter and import report. | S-M |

## 8. Open decisions

1. Which **3 programs** do the people you will give REM to use most? That fixes the real order and tells us which sample exports to request.
2. Can you obtain **real anonymised exports** (or test accounts) from those programs?
3. Do you want the **API connection** (more convenient, more fragile) or only guided manual export at first?
4. Do **quotes and items** need importing, or are clients, invoices and expenses enough?
