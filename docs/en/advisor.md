# For accountants and advisory firms

[Español](../asesor.md) · **English** · [Documentation index](README.md)

How data reaches you from a client who uses REM.

## What they can hand over

| What | Where your client gets it | Format |
|---|---|---|
| Invoices (number, date, client, tax ID, base, VAT, IRPF, total, status) | Reports, or Settings → Data | CSV |
| Expenses (date, supplier, concept, category, base, VAT, total, paid) | Reports, or Settings → Data | CSV |
| Clients (name, tax ID, contact, address) | Reports, or Settings → Data | CSV |
| Workbook with invoices, expenses, clients and quarterly VAT | Reports → «Todo en Excel» | `.xlsx` with filters and totals |
| Indicative figures for forms 130, 303, 115 and 347 | Money → Forms | CSV |
| Period report with VAT summary | Reports → PDF | PDF |
| Statement per client | Client record → «Extracto PDF» | PDF |
| Everything (full copy) | Settings → Data | «Todo (JSON)» or `.db` backup |

CSV files use Spanish formatting (decimal comma) and UTF-8.

## What you should know

- **REM is not a compliant invoicing system.** If your client issues official invoices with REM, it does not comply with the VeriFactu regulation. The right way is to issue them with a compliant program and import them into REM. See [Legal framework](legal.md).
- **Forms are indicative:** REM files nothing and applies no professional judgement.
- **Corrective invoices:** REM never deletes invoices; it corrects them with corrective invoices that appear in the exports.
- There is currently no structured way to send your adjustments back into REM; it is one of the improvements under consideration ([roadmap](roadmap.md)).

Which export format would save you work? Open an [issue](https://github.com/aulafy/REM-L/issues/new/choose) or write to the author.
