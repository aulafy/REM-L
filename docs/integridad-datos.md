# Integridad de datos

**Español** · [English](en/data-integrity.md)

REM Negocio usa SQLite con `PRAGMA foreign_keys=ON`. Las escrituras pasan por las validaciones del servidor y las operaciones que asignan número de factura se ejecutan dentro de una transacción.

El esquema se versiona mediante `PRAGMA user_version`. Las migraciones pendientes se aplican en una sola transacción y el arranque se detiene si la base pertenece a una versión futura.

Si `quick_check` o `foreign_key_check` fallan, la app **no se cae**: arranca en **modo reparación** (ver más abajo).

## Relaciones persistentes

| Origen | Destino | Comportamiento |
|---|---|---|
| `documents.client_id` | `clients.id` | Impide eliminar un cliente con documentos; la API lo archiva. |
| `payments.document_id` | `documents.id` | `ON DELETE CASCADE`; al eliminar un borrador desaparecen sus cobros asociados. |
| `tasks.client_id` | `clients.id` | `ON DELETE SET NULL`; la tarea puede sobrevivir sin el cliente. |
| `tasks.parent_id` | `tasks.id` | `ON DELETE CASCADE`; las subtareas desaparecen con su tarea principal. |
| `time_entries.client_id` | `clients.id` | `ON DELETE CASCADE`. |
| `messages.client_id` | `clients.id` | `ON DELETE SET NULL`; se conserva el histórico del mensaje. |
| `memory.client_id` | `clients.id` | `ON DELETE CASCADE`. |
| `chunks.doc_id` | `knowledge.id` | `ON DELETE CASCADE`. |
| `recurring.client_id` | `clients.id` | Impide dejar una recurrencia apuntando a un cliente inexistente. Al «borrar» un cliente con recurrentes, la API lo archiva y pone sus recurrentes en pausa. |

Algunas referencias son deliberadamente polimórficas o compatibles con bases antiguas y no tienen clave foránea. La aplicación las mantiene así:

| Referencia | Cómo se mantiene |
|---|---|
| `tasks.document_id` | Al crear o editar una tarea se comprueba que el documento existe (también el cliente: antes daba error 500). Al borrar un borrador, sus tareas quedan desenlazadas. |
| `ext_values(entity, entity_id)` | Al borrar un cliente o un documento se eliminan sus campos extra. |
| `files(owner_type, owner_id)` | Se valida el destino al subir; los archivos se eliminan con su cliente o documento. |
| `time_entries.doc_id`, albaranes (`source_id`) | Al borrar el borrador, las horas y los albaranes vuelven a quedar libres. |
| `recurring.last_doc_id`, `attachments.expense_id`, `activity(ref_type, ref_id)` | Referencias históricas: pueden apuntar a algo que ya no existe y la app lo tolera. |

Las referencias de `tasks.document_id` y `ext_values` que hayan quedado colgando de versiones anteriores se limpian solas al arrancar y después de restaurar una copia (operación idempotente).

## Reglas de coherencia de negocio

- El NIF de un cliente se guarda sin espacios, puntos ni guiones, y no puede repetirse entre clientes (tampoco con uno archivado: la API devuelve `409` y dice cuál lo tiene). Varios clientes sin NIF sí están permitidos. La importación de clientes omite los NIF ya existentes.

- Las fechas se validan como días ISO reales (`AAAA-MM-DD`); valores como `2026-02-31` se rechazan en documentos, gastos, tareas, horas y recurrentes.
- Una factura no puede emitirse con una fecha anterior a la última ya emitida dentro de la misma serie y año. Así, la numeración conserva el orden cronológico.
- Las líneas admiten cantidades finitas de hasta `|1.000.000|` y precios enteros, en céntimos, de hasta `|10.000.000.000|`. Los totales deben ser enteros seguros de JavaScript.
- Una factura ordinaria solo se emite con total positivo. Las correcciones negativas se realizan mediante factura rectificativa.
- Los recurrentes atrasados crean un borrador por periodo. Cada ejecución procesa como máximo 12 y conserva el primer periodo restante para la siguiente pasada.
- La exportación CSV neutraliza texto que Excel podría interpretar como fórmula, sin convertir importes negativos en texto.
- Los cuerpos JSON tienen límites por endpoint y un JSON malformado devuelve `400`. La voz de macOS recibe el texto mediante un fichero temporal, no como argumento de proceso.

## Modo reparación

Si al arrancar la base no supera `quick_check` o tiene relaciones rotas (por ejemplo, una copia antigua o manipulada), el servidor arranca igualmente. Pero:

- No se inician el correo, Telegram, los agentes ni el icono de la barra de menús, y no se hace la copia automática del día (para no desplazar las copias buenas).
- La API responde `503 repair` a todo salvo el PIN y las rutas de reparación. El navegador muestra la pantalla «Hay que revisar tus datos» con dos opciones:
  - **Reparar automáticamente** (solo si el archivo no está dañado): las referencias que admiten `NULL` se desenlazan y las filas que no pueden quedar sueltas (p. ej. un cobro de una factura inexistente) se eliminan. Todo ocurre en una transacción.
  - **Restaurar una copia**: solo se ofrecen las copias íntegras y compatibles.
- Las dos opciones guardan antes una copia `…-antes-de-reparar.db` de lo actual. Al terminar, si la base ya está sana, los servicios arrancan sin reiniciar.

Rutas: `GET /api/repair`, `POST /api/repair/fix` y `POST /api/repair/restore {name}`.

## Comprobación

La suite automatizada cubre estas reglas y las relaciones principales:

```sh
npm test
```

Las copias importadas se abren en modo de solo lectura y se comprueban antes de incorporarlas. Al restaurar se vuelve a verificar la base resultante dentro de la transacción; si falla, se hace `ROLLBACK` y la base activa permanece intacta. La retención es independiente por finalidad: 20 automáticas, 10 manuales, 10 previas a operaciones delicadas, 5 importadas y 5 de otros tipos.

La orden **Borrar todos los datos** guarda antes una copia SQLite y después elimina también adjuntos (incluidos posibles archivos huérfanos), secretos conocidos y ficheros locales de configuración/actividad. Los adjuntos no forman parte del `.db` y no pueden recuperarse desde esa copia.

Para auditar manualmente una base detenida, se pueden ejecutar estas consultas con una herramienta SQLite:

```sql
PRAGMA foreign_keys;
PRAGMA foreign_key_check;
PRAGMA integrity_check;
```

El resultado esperado es `1` para `foreign_keys`, ninguna fila para `foreign_key_check` y `ok` para `integrity_check`.
