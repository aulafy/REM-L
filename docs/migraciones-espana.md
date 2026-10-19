# Migrar a REM Negocio desde las apps que usan los autónomos en España

Estado (19/10/2026): **estrategia con parte ya implementada**. Lo que existe se marca con ✅. Sigue pendiente todo lo que dependa de exportaciones reales de programas concretos (presets por programa) y de condiciones de las API de terceros.

## 1. Qué usa un autónomo hoy

Lista construida con comparativas del sector (a verificar con usuarios reales: son fuentes con afiliación) y con el criterio de «dónde están los datos de un negocio de una persona».

| Familia | Programas | Notas |
|---|---|---|
| Facturación y contabilidad en la nube | **Holded**, **Quipu** (grupo TeamSystem), **Billin / TeamSystem Facturas**, **Contasimple**, **Anfix** | Los que más aparecen en las comparativas de 2026. Todos hablan de VeriFactu. |
| Escritorio clásico | **Factusol / Contasol / Facturaplus** (Software del Sol, hoy TeamSystem), Sage, A3 | Mucho histórico; datos en formatos propios; exportan a Excel/CSV. |
| Hojas de cálculo | **Excel**, Google Sheets, Numbers | El «programa» más usado de todos: plantillas propias, una por persona. |
| CRM y contactos | **HubSpot** (versión gratuita), **Zoho CRM**, **Pipedrive**, Odoo, Clientify; **Google Contactos**, **Outlook**, **Contactos de macOS**, WhatsApp Business | Exportan contactos a CSV; algunos tienen API. |
| Estándar de factura | **Facturae** (XML, 3.2.2 la más reciente) | Obligatorio con las administraciones públicas; muchos programas lo generan y lo leen. |

Fuentes consultadas: comparativas de [Infoautónomos](https://www.infoautonomos.com/blog/mejor-programa-facturacion-pymes/) y [GuíaFiscal](https://guiafiscal.es/comparativas/mejor-programa-facturacion-autonomos/), [Quipu vs Billin](https://getquipu.com/blog/quipu-vs-billin/), la [página de API de Billin](https://www.billin.net/?p=35802), el [esquema oficial de Facturae 3.2.2](https://www.facturae.gob.es/content/dam/facturae/formato/versiones/Facturaev3_2_2.xml) y guías de exportación de CRM (Pipedrive, HubSpot, Zoho).

**Lo que NO está verificado** y no hay que dar por hecho: los nombres exactos de columnas de cada exportación, qué planes incluyen API, el motor de base de datos de Factusol/Contasol. Regla del proyecto: **no se escribe ningún preset de un programa sin una exportación real** (anonimizada) delante.

## 2. Principio rector

> Un solo motor de importación, muchas «puertas de entrada». Cada programa es solo una forma de llegar a las mismas filas, con el mismo análisis, la misma vista previa, la misma copia previa y el mismo «deshacer».

Ese motor ya existe ✅ (`lib/importer.mjs`): clientes, facturas emitidas y gastos, deduplicación, lotes con deshacer. Y su pieza clave para esta estrategia: el **plan declarativo** ✅ (`lib/importplan.mjs`), que describe cómo convertir una tabla ajena en la propia sin ejecutar código. **Un preset de un programa no es más que un plan guardado** con su firma de cabeceras.

## 3. Cuatro puertas de entrada (de más a menos universal)

### Puerta 0 · Formatos universales
| Formato | Estado | Detalle |
|---|---|---|
| CSV / Excel (.xlsx) | ✅ | Detección de separador y de columnas. |
| vCard (.vcf), Contactos de macOS, CSV de Google y Outlook (inglés y español) | ✅ | Móvil como teléfono principal; fijo como segundo; empresa + persona. |
| **Facturae XML** (emitidas y recibidas) | ✅ | Formato estándar y público (estructura contrastada con el esquema oficial 3.2.2): partes, líneas con su IVA, retención IRPF, vencimiento. Detecta emitidas/recibidas con tu NIF o te lo pregunta; varios archivos a la vez; lector XML propio y seguro (sin entidades ni DTD). Sin ejemplos reales de programas concretos: pendiente de probar con archivos de usuarios. |
| UTF-16 / Windows-1252 / separadores raros | Parcial | El navegador ya detecta UTF-8 y Windows-1252; falta UTF-16 (lo usan algunos exportadores de escritorio, por verificar). |
| Libros registro de IVA (formato AEAT, XLSX/CSV) | Por estudiar | Los pide la gestoría; también sirven para importar. |

### Puerta 1 · Presets por programa (exportación manual guiada)
- Para cada programa: tarjeta «**Cómo exportar tus datos desde X**» (3-5 pasos con capturas) + un **plan guardado** que reconoce su exportación por las cabeceras.
- Se detecta solo: el usuario suelta el archivo y la app dice «Parece una exportación de X».
- Los presets viven en `presets/*.json` (plan + firma + versión + fecha de la exportación de muestra), con **pruebas de regresión contra exportaciones sintéticas** que reproducen la estructura real.
- Orden sugerido (valor × facilidad): Holded → Quipu → Billin → Contasimple → Anfix → Factusol/Contasol → CRM (HubSpot, Pipedrive, Zoho).

### Puerta 2 · Conexión directa por API (con la clave del propio usuario)
- Para los que la ofrecen (Holded, Quipu y Billin dicen tener API; **a verificar planes, límites y condiciones**; HubSpot, Pipedrive y Zoho también).
- El usuario pega su clave (llavero local) y REM **lee** contactos, facturas y gastos **solo en lectura**, paginando, y los convierte en las mismas filas del motor. No hay servidor intermedio: la conexión va del Mac del usuario al proveedor.
- Ventaja: sin exportar a mano y con más fidelidad (líneas, impuestos, pagos). Riesgos: planes sin API, límites de uso, cambios del proveedor, condiciones de uso. Por eso es la puerta 2, no la 0.

### Puerta 3 · Escritorio y formatos antiguos
- Factusol/Contasol/Facturaplus/Sage: ruta de **exportar a Excel/CSV** desde el propio programa (hay exportación de informes y de datos; la codificación UTF-16 de algunas exportaciones hay que confirmarla con una real).
- Archivos que ni siquiera son tablas (DBF, ancho fijo, informes en texto): el **asistente con IA** ✅ propone el plan (incluido el diseño de registro) y el lector local lo aplica; como último recurso, la **fase 4** de conversores generados y aislados.

## 4. Qué datos se migran (y con qué fidelidad)

| Dato | Hoy ✅ | Siguiente |
|---|---|---|
| Clientes / contactos | ✅ con deduplicación por NIF, email y nombre | Varios contactos por empresa (personas) como notas o clientes enlazados. |
| Facturas emitidas | ✅ con varias líneas (filas con el mismo número) y varios tipos de IVA | Líneas con descuento y cantidades. |
| Cobros | ✅ pagada/no pagada con fecha | Cobros parciales y métodos de pago. |
| Gastos / facturas recibidas | ✅ | Retención e IVA explícitos (ya en la hoja de ruta de datos). |
| Presupuestos, albaranes, artículos/catálogo | — | Mismo mecanismo de plan. |
| Archivos (PDF de facturas) | — | Adjuntarlos al documento si el export incluye las rutas o un ZIP. |
| **Continuidad de numeración** | ✅ | Si los números importados tienen otro formato, al terminar se propone «la siguiente factura será F2026-0058» y se aplica con un clic (también en Ajustes). |
| CRM: personas/organizaciones | ✅ como clientes | Negocios (deals) → presupuestos opcionales; notas → notas del cliente; actividades → tareas. |

## 5. Comprobaciones de calidad antes de dar nada por bueno

1. **Cuadre de totales**: «tu programa antiguo dice X facturado en 2025; REM ha importado X». Por año y por trimestre (base, IVA, IRPF).
2. **Duplicados** (ya) y **huecos de numeración** por serie.
3. **Vista previa con muestra real y avisos** (ya) y **«deshacer»** del lote (ya).
4. **Informe de importación** descargable: qué entró, qué no y por qué (para enseñárselo a la gestoría).
5. Las facturas importadas son **histórico**, no se reemiten ni se firman de nuevo; se marcan como importadas. REM no es software de facturación certificado (VeriFactu): el histórico se conserva tal cual.

## 6. Cómo mantenerlo sin inventar nada

- **Programa de muestras**: pedir a usuarios beta una exportación anonimizada (un script local que enmascara NIF, nombres e importes manteniendo la forma). Cada muestra entra en un corpus y genera un preset con su prueba.
- **Versionado de presets**: cada preset lleva la fecha y la versión del programa de origen; si una exportación no encaja, el motor cae al asistente con IA en lugar de fallar.
- **Sin telemetría**: nadie envía nada sin hacerlo él. El asistente con IA enseña exactamente lo que enviaría (ya implementado ✅) y la muestra va enmascarada por defecto.
- **Medir**: % de columnas bien mapeadas, % de filas importadas sin intervención y % de totales que cuadran, por programa.

## 7. Plan de trabajo propuesto

| Orden | Entrega | Esfuerzo |
|---|---|---|
| 1 | ✅ **Continuidad de numeración** y **varias líneas por factura**. | hecho |
| 2 | ✅ **Importador Facturae XML** (emitidas y recibidas). | hecho |
| 3 | ✅ marco de reconocimiento (`lib/presets.mjs`: firma + guía de exportación, con Google Contactos y Outlook) y guías de exportación. Falta: Marco de **presets** (plan + firma + tarjeta de «cómo exportar») y detección automática; primeros: Google Contactos, Outlook, Contactos de macOS (ya cubiertos por sinónimos) y **un programa real con exportación de muestra**. | M |
| 4 | **Holded y Quipu** por exportación manual (presets); después, conexión por API de solo lectura si se confirman condiciones. | M-L |
| 5 | Billin, Contasimple, Anfix. | M cada uno |
| 6 | Factusol/Contasol (UTF-16, Excel) y CRM (HubSpot, Pipedrive, Zoho). | M |
| 7 | Cuadre de totales por año/trimestre e informe de importación. | S-M |

## 8. Decisiones que necesito de ti

1. ¿Cuáles son los **3 programas** que más usan las personas a las que vas a dar REM? Con eso fijo el orden real y pido las exportaciones de muestra.
2. ¿Puedes conseguir **exportaciones reales anonimizadas** (o cuentas de prueba) de esos programas?
3. ¿Quieres la **conexión por API** (más cómoda, más frágil) o solo exportación manual guiada al principio?
4. ¿Hay que importar **presupuestos y artículos**, o basta con clientes, facturas y gastos?
