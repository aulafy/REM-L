# Legal framework: invoices, VeriFactu and data

[Español](../marco-legal.md) · **English** · [Documentation index](README.md)

> Reviewed on **22 October 2026** against the official Spanish Tax Agency (AEAT) pages linked below. This is information, not tax or legal advice: confirm it with your accountant.

## In three lines

1. Spain's invoicing-systems regulation (RRSIF, «VeriFactu») applies to programs **used to issue invoices**, even if they send nothing to the tax agency.
2. **REM Negocio is not a compliant invoicing system**: it has no hash-chained records, signature, event log or responsible declaration.
3. So, today, **the official invoice must be issued with a compliant program**. REM is for preparing, tracking, collecting and handing the close over to the accountant.

## What the AEAT says

**Who it applies to.** The regulation applies to invoicing computer systems (SIF), i.e. those used to issue invoices. According to the AEAT, it does not apply to systems that do not issue invoices (accounting, quotes, management). A program that issues invoices but does not send them to the AEAT **is still covered**: in non-VERI\*FACTU mode it must generate and keep invoicing records with their requirements (chained hash, signature, retention). Source: [AEAT · General questions and scope](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/cuestiones-generales-ambitos-aplicacion.html) (updated 21/10/2026).

**From when.** Dates in force according to that page:

| Who | Deadline to use a compliant system |
|---|---|
| Corporate income tax payers | before **1 January 2027** |
| Everyone else obliged (freelancers, etc.) | before **1 July 2027** |

If the dates change, the AEAT's dates prevail; check the linked page.

**There is no «approved software».** There is no third-party certification or prior registration: the producer includes a **responsible declaration** in each version, and every version needs its own. Source: [AEAT · Certification and responsible declaration](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/certificacion-sistemas-informaticos-declaracion-responsable.html) (updated 21/10/2026).

**B2B e-invoicing (a separate obligation).** Regulated by Order HAC/1028/2026. Source: [AEAT · Implementation calendar](https://sede.agenciatributaria.gob.es/Sede/iva/factura-electronica/calendario-implantacion.html) (updated 13/10/2026).

| Who | B2B e-invoice | Report payment status |
|---|---|---|
| Turnover > €8M | 6 October 2027 | 6 October 2027 |
| Other legal persons and entities | 6 October 2028 | 6 October 2028 |
| Other individuals and pass-through entities | 6 October 2028 | 6 October 2029 |

REM does **not** implement B2B e-invoicing or payment-status reporting.

## What REM does today, plainly

REM numbers invoices sequentially (F2026-0001), has an «issued» status, produces the PDF and can email it. **If you use that PDF as your official invoice, you are using REM as an invoicing system, and REM does not comply with the regulation.** An «internal use» notice does not change that.

## How to use it correctly today

- **Issue the official invoice with a compliant program** (your accountant can recommend one). REM can then **import** those invoices (CSV, Excel or Facturae XML; Settings → Security and backups) so payments, cash flow, reports and the quarterly close work with the official data.
- Use REM for **quotes, delivery notes, drafts, payments, expenses, tasks, client messages and the export for your accountant**.
- Figures for forms 130, 303, 115 and 347 are **indicative**: REM files nothing with the tax agency.

**Under consideration:** a «companion mode» that makes this boundary explicit in the app itself (drafts marked «NOT AN INVOICE» until the official invoice is imported). See the [roadmap](roadmap.md).

## Data protection (GDPR)

- REM keeps data **on your computer**. The author of REM does not receive, host or process your data or your clients' data; there are no accounts and no telemetry.
- Your business is the **data controller** for its clients' data, as with any installed program.
- If you enable third-party services (Telegram, your email provider, the Claude API, a REM Clientes relay), that data goes through them under their own terms. The full list is in [Security and privacy](security-privacy.md#what-leaves-your-computer).
- REM includes a «data consent» template in Letters and contracts; review it with your adviser before using it.
