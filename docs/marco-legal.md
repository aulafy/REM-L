# Marco legal: facturas, Verifactu y datos

**Español** · [English](en/legal.md) · [Índice de la documentación](README.md)

> Revisado el **22 de octubre de 2026** con las páginas oficiales de la AEAT enlazadas abajo. Esto es información, no asesoramiento fiscal ni legal: confírmalo con tu asesor.

## En tres líneas

1. La normativa de sistemas de facturación (RRSIF, «Verifactu») se aplica a los programas **con los que se expiden facturas**, aunque no envíen nada a Hacienda.
2. **REM Negocio no es un sistema de facturación conforme**: no tiene registros con hash encadenado, firma, registro de eventos ni declaración responsable.
3. Por eso, hoy, **la factura oficial debe emitirse en un programa conforme**. REM sirve para preparar, controlar, cobrar y entregar el cierre al asesor.

## Qué dice la AEAT

**A quién se aplica.** El reglamento se aplica a los sistemas informáticos de facturación (SIF), es decir, a los que se usan para expedir facturas. Según la AEAT, el reglamento «no aplica a sistemas informáticos que no expidan facturas» (contabilidad, presupuestos, gestión). Si un programa expide facturas pero no las envía a la AEAT, **sigue sujeto**: en la modalidad no VERI\*FACTU debe generar y conservar los registros de facturación con sus requisitos (hash encadenado, firma, conservación). Fuente: [AEAT · Cuestiones generales y ámbito de aplicación](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/cuestiones-generales-ambitos-aplicacion.html) (actualizada el 21/10/2026).

**Desde cuándo.** Fechas vigentes según esa misma página:

| Quién | Fecha límite para usar un sistema conforme |
|---|---|
| Contribuyentes del Impuesto sobre Sociedades | antes del **1 de enero de 2027** |
| Resto de obligados (autónomos, etc.) | antes del **1 de julio de 2027** |

Si se publica un cambio de fechas, mandan las de la AEAT; revisa la página enlazada.

**No hay «software homologado».** No existe certificación de terceros ni registro previo: el productor del programa incluye una **declaración responsable** en cada versión, y cada versión necesita la suya. Fuente: [AEAT · Certificación y declaración responsable](https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu/preguntas-frecuentes/certificacion-sistemas-informaticos-declaracion-responsable.html) (actualizada el 21/10/2026).

**Factura electrónica entre empresas (otra obligación distinta).** La regula la Orden HAC/1028/2026. Fuente: [AEAT · Calendario de implantación](https://sede.agenciatributaria.gob.es/Sede/iva/factura-electronica/calendario-implantacion.html) (actualizada el 13/10/2026).

| Quién | Factura electrónica B2B | Comunicar estado de pago |
|---|---|---|
| Volumen de operaciones > 8 M€ | 6 de octubre de 2027 | 6 de octubre de 2027 |
| Resto de personas jurídicas y entidades | 6 de octubre de 2028 | 6 de octubre de 2028 |
| Resto de personas físicas y entidades en atribución de rentas | 6 de octubre de 2028 | 6 de octubre de 2029 |

REM **no** implementa la factura electrónica B2B ni la comunicación de estados de pago.

## Qué hace REM hoy, sin rodeos

REM numera facturas de forma correlativa (F2026-0001), tiene un estado «emitida», genera el PDF y permite enviarlo por correo. **Si usas ese PDF como tu factura oficial, estás usando REM como sistema de facturación, y REM no cumple el reglamento.** El aviso de «uso interno» no cambia eso.

## Cómo usarlo correctamente hoy

- **Emite la factura oficial en un programa conforme** (tu asesor te indicará uno). REM puede **importar** después esas facturas (CSV, Excel o Facturae XML; Ajustes → Datos) para que cobros, tesorería, informes y el cierre trimestral trabajen con los datos oficiales.
- Usa REM para **presupuestos, albaranes, borradores, cobros, gastos, tareas, mensajes con clientes y la exportación para el asesor**.
- Las cifras de los modelos 130, 303, 115 y 347 son **orientativas**: REM no presenta nada ante Hacienda.

**En estudio:** un «modo acompañante» que haga esta frontera explícita en la propia app (borradores marcados como «NO ES FACTURA» hasta importar la factura oficial). Ver [ROADMAP.md](../ROADMAP.md).

## Protección de datos (RGPD)

- REM guarda los datos **en tu equipo**. El autor de REM no recibe, aloja ni trata tus datos ni los de tus clientes; no hay cuentas ni telemetría.
- Tu negocio es el **responsable del tratamiento** de los datos de sus clientes, como con cualquier programa instalado.
- Si activas servicios de terceros (Telegram, tu proveedor de correo, la API de Claude, un relé de REM Clientes), esos datos pasan por ellos con sus propias condiciones. La lista completa está en [Seguridad y privacidad](seguridad-privacidad.md#qué-sale-de-tu-equipo).
- REM incluye una plantilla de «consentimiento de datos» en Cartas y contratos; revísala con tu asesor antes de usarla.
