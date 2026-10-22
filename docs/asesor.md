# Para asesores y gestorías

**Español** · [English](en/advisor.md) · [Índice de la documentación](README.md)

Cómo te llegan los datos de un cliente que usa REM.

## Qué te puede entregar

| Qué | Dónde lo saca tu cliente | Formato |
|---|---|---|
| Facturas (número, fecha, cliente, NIF, base, IVA, IRPF, total, estado) | Informes, o Ajustes → Datos | CSV |
| Gastos (fecha, proveedor, concepto, categoría, base, IVA, total, pagado) | Informes, o Ajustes → Datos | CSV |
| Clientes (nombre, NIF, contacto, dirección) | Informes, o Ajustes → Datos | CSV |
| Libro con facturas, gastos, clientes e IVA trimestral | Informes → «Todo en Excel» | `.xlsx` con filtros y totales |
| Cifras orientativas de los modelos 130, 303, 115 y 347 | Dinero → Modelos | CSV |
| Informe del periodo con resumen de IVA | Informes → PDF | PDF |
| Extracto por cliente | Ficha del cliente → «Extracto PDF» | PDF |
| Todo (copia completa) | Ajustes → Datos | «Todo (JSON)» o copia `.db` |

Los CSV usan formato español (coma decimal) y UTF-8.

## Lo que debes saber

- **REM no es un sistema de facturación conforme.** Si tu cliente expide sus facturas oficiales con REM, no cumple el reglamento Verifactu. Lo correcto es emitirlas en un programa conforme e importarlas en REM. Ver [Marco legal](marco-legal.md).
- **Los modelos son orientativos:** REM no presenta nada ni aplica criterios de un profesional.
- **Rectificativas:** REM no borra facturas; las corrige con rectificativas que aparecen en las exportaciones.
- Hoy no hay forma de devolver tus ajustes a REM de forma estructurada; es una de las mejoras en estudio ([ROADMAP.md](../ROADMAP.md)).

¿Qué formato de exportación te ahorraría trabajo? Abre una [incidencia](https://github.com/aulafy/REM-L/issues/new/choose) o escribe al autor.
