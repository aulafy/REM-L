# Integridad de datos

REM Negocio usa SQLite con `PRAGMA foreign_keys=ON`. Las escrituras pasan por las validaciones del servidor y las operaciones que asignan número de factura se ejecutan dentro de una transacción.

El esquema se versiona mediante `PRAGMA user_version`. Las migraciones pendientes se aplican en una sola transacción y el arranque se detiene si la base pertenece a una versión futura o si `quick_check`/`foreign_key_check` detectan corrupción o relaciones rotas.

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
| `recurring.client_id` | `clients.id` | Impide dejar una recurrencia apuntando a un cliente inexistente. |

Algunas referencias son deliberadamente polimórficas o compatibles con bases antiguas y no tienen clave foránea: `files(owner_type, owner_id)`, `activity(ref_type, ref_id)`, `tasks.document_id`, `recurring.last_doc_id` y `attachments.expense_id`. Sus ciclos de vida se resuelven en las rutas de la aplicación: los archivos validan el destino antes de insertarse; al borrar clientes o documentos se eliminan archivos, se liberan horas y se restauran albaranes cuando corresponde. El registro de actividad puede conservar una referencia histórica aunque el objeto ya no exista.

## Reglas de coherencia de negocio

- Las fechas se validan como días ISO reales (`AAAA-MM-DD`); valores como `2026-02-31` se rechazan en documentos, gastos, tareas, horas y recurrentes.
- Una factura no puede emitirse con una fecha anterior a la última ya emitida dentro de la misma serie y año. Así, la numeración conserva el orden cronológico.
- Las líneas admiten cantidades finitas de hasta `|1.000.000|` y precios enteros, en céntimos, de hasta `|10.000.000.000|`. Los totales deben ser enteros seguros de JavaScript.
- Una factura ordinaria solo se emite con total positivo. Las correcciones negativas se realizan mediante factura rectificativa.
- Los recurrentes atrasados crean un borrador por periodo. Cada ejecución procesa como máximo 12 y conserva el primer periodo restante para la siguiente pasada.
- La exportación CSV neutraliza texto que Excel podría interpretar como fórmula, sin convertir importes negativos en texto.
- Los cuerpos JSON tienen límites por endpoint y un JSON malformado devuelve `400`. La voz de macOS recibe el texto mediante un fichero temporal, no como argumento de proceso.

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
