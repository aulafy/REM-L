# Catálogo de módulos declarativos (v1)

Fuente de verdad: `public/modspec.js` (catálogo) y `lib/modules.mjs` (`validateManifest`, `describePermissions`, `GALLERY`). Si esto y el código difieren, manda el código.

## Forma del manifiesto
```json
{
  "id": "taller-itv",               // minúsculas, números y guiones (3-40)
  "name": "Taller · ITV",
  "description": "Matrícula y próxima ITV de cada cliente",
  "custom_fields": [ { "entity": "clients", "key": "matricula", "label": "Matrícula", "type": "text" } ],
  "templates": [],
  "rules": [],
  "reports": []
}
```
Límites: hasta 8 campos extra; textos acotados en longitud; el validador rechaza lo que no esté en el catálogo.

## Catálogo
- **entidades** (`ENTITIES`): `clients`, `documents`.
- **tipos de campo** (`FIELD_TYPES`): `text`, `number`, `date`, `select` (mínimo 2 opciones), `checkbox`.
- **variables de plantilla** (`TEMPLATE_VARS`): `cliente`, `negocio`, `numero_factura`, `importe_pendiente`, `fecha_vencimiento`, `iban`. Se usan como `{{variable}}`; cualquier otra se rechaza.
- **eventos de reglas** (`RULE_EVENTS`): `message_received`, `invoice_overdue`, … con condiciones y variables propias de cada evento (míralos en el código).
- **canales** (`CHANNELS`): `telegram`, `email`, `whatsapp`, `imessage`, `otro`.
- **informes** (`DATASETS`): `invoices`, `expenses`, `clients`, con campos, agrupaciones y métricas numéricas definidos; operadores de filtro (`OPS`): `eq`, `gte`, `lte`, `contains`.

## Lo que un módulo NO puede hacer
Ejecutar código, usar internet, enviar mensajes por su cuenta, borrar datos ni facturar solo. Si lo pide, el validador lo descarta.

## Buenas prácticas
- Un módulo, una necesidad. Pocos campos, nombres claros.
- Pide los permisos mínimos y compáralos con `describePermissions`.
- Prueba el flujo en una demo (`scripts/demo.sh`) antes de proponer instalarlo en datos reales.
