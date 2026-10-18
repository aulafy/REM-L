# REM Negocio para Mac: asistente de puesta en marcha, copias e importación

Estado: **diseño para aprobar** (18/10/2026). Nada de esto está programado todavía.

## 1. Objetivo

Que una persona sin conocimientos técnicos, con un negocio de una sola persona, pase de «he descargado la app» a «tengo mis datos, mis copias funcionan y sé usarla» en **menos de 30 minutos**, sin abrir la terminal ni instalar Node.

Criterios de éxito (se miden con usuarios reales, ver `PRUEBA_CON_USUARIOS.md`):
- El 80 % termina el asistente sin ayuda.
- Al final hay **una copia cifrada hecha y una restauración probada** (no solo «programada»).
- Sus clientes existentes ya están dentro y revisados.
- Sabe dónde mirar cada día (Hoy) y qué hace cada pestaña.

## 2. Decisiones ya tomadas

| Tema | Decisión |
|---|---|
| Formato | App nativa **SwiftUI** («REM Negocio.app») que lleva dentro Node, el servidor y los ayudantes nativos. |
| Importación con IA | El usuario sube un archivo; **Claude propone un plan de mapeo declarativo**; un motor local lo ejecuta con vista previa. |
| Copias | A una carpeta que elige la persona (USB, NAS, iCloud Drive…), **cifradas** con frase de paso, con prueba de restauración. |
| Siguiente paso | Primero este diseño; se programa por fases tras aprobarlo. |

## 3. Arquitectura

```
REM Negocio.app (SwiftUI, hardened runtime, firmada y notarizada)
├─ Shell nativo
│   ├─ Supervisor del servidor (arranca/para/reinicia Node, elige puerto libre, vigila salud)
│   ├─ Asistente de puesta en marcha (SwiftUI, ver §4)
│   ├─ Panel «Salud de tu instalación» (copias, PIN, FileVault, espacio, versión)
│   ├─ Ventana principal: WKWebView con la interfaz actual (http://127.0.0.1:PUERTO)
│   └─ Cosas que solo puede hacer lo nativo: selector de carpetas (NSOpenPanel),
│        Contactos de macOS (Contacts.framework), arranque al iniciar sesión (SMAppService),
│        detección de discos externos, notificaciones, llavero (SecItem)
├─ Resources/node  (binario oficial universal, firmado)
├─ Resources/app   (server.mjs, lib/, public/)
└─ Resources/bin   (ayudantes ya compilados: PDF, OCR, barra de menús; universales y firmados)
```

- La app **no usa App Sandbox** (se distribuye fuera de la Mac App Store con Developer ID). Así el servidor puede escribir en la carpeta de copias que la persona elija sin trucos.
- El shell habla con el servidor por una API local con un **token de administración** propio (guardado en el llavero), distinto del PIN del usuario.
- El servidor sigue siendo la única fuente de verdad: el asistente solo rellena ajustes y lanza acciones que ya existen o que se añaden como endpoints (`/api/backup/*`, `/api/import/*`, `/api/setup/*`).
- Actualizaciones: comprobación de un JSON de versiones firmado + descarga del .dmg; migraciones de base de datos con `PRAGMA user_version` y copia automática antes de migrar.

## 4. El asistente, paso a paso

Cada paso tiene: una pantalla, un botón principal, «Saltar por ahora» (si no es imprescindible) y se puede reabrir desde Ajustes. El progreso se guarda: se puede cerrar y volver.

| # | Paso | Qué ocurre | Imprescindible |
|---|---|---|---|
| 0 | Bienvenida | Qué es REM, que los datos se quedan en el Mac, comprobación del equipo (macOS, espacio, FileVault activado o no). | Sí |
| 1 | Tu negocio | Nombre, NIF (validado con dígito de control), dirección, logo, forma jurídica (autónomo/sociedad). | Sí |
| 2 | Cómo facturas | Plantilla por actividad (servicios, oficios, comercio, hostelería…) que rellena IVA, IRPF, plazo de pago, serie de facturas, tarifa por hora, pie de factura e IBAN. Siempre editable. | Sí |
| 3 | Copias de seguridad | §5. Termina con una copia hecha y restaurada de prueba. | Sí |
| 4 | Traer tus datos | §6: contactos, clientes, facturas antiguas, gastos. | No |
| 5 | Mensajes y asistente | Opcional: Telegram, correo, detectar Ollama (y guiar la descarga de un modelo), clave de la API de Claude para la importación asistida. | No |
| 6 | Acceso y arranque | PIN, abrir al iniciar sesión, icono en la barra de menús. | Recomendado |
| 7 | Cómo funciona | Recorrido guiado de 2 minutos sobre datos de ejemplo en una base temporal (Hoy, Mensajes, Clientes, Dinero, Ajustes), con «prueba tú» en 3 acciones: crear un cliente, un presupuesto y registrar un gasto. | Recomendado |
| 8 | Todo listo | Lista de comprobación en verde/ámbar y siguientes pasos. La misma lista queda fija en Hoy hasta completarla. | — |

Principios: lenguaje llano, sin jerga; cada pantalla explica **por qué** pide algo; ningún paso envía datos fuera sin decirlo antes.

## 5. Copias de seguridad

**Qué se copia:** base de datos (consistente, con `VACUUM INTO`), archivos adjuntos y ajustes (sin secretos del llavero).

**Formato `.rembak`:** ZIP interno → cifrado AES-256-GCM, clave derivada de la frase de paso con scrypt; cabecera con versión, sal e IV; suma de control. Sin dependencias (módulo `crypto` de Node).

**Destino:** carpeta elegida en el asistente (USB, NAS, iCloud Drive). Si el disco no está, la copia queda en cola y se avisa; nunca se falla en silencio.

**Cuándo:** una al día, una al cerrar la app y una antes de cada importación, restauración, migración o borrado.

**Retención:** 7 diarias + 4 semanales + 12 mensuales, más las últimas 5 «de seguridad» (antes de operaciones delicadas). Así unas cuantas importaciones no borran el historial diario.

**Verificación (clave de la confianza):**
1. Tras cada copia: descifrar, comprobar la suma y `PRAGMA integrity_check` sobre una copia temporal.
2. En el asistente: **restauración de prueba** a una carpeta temporal y comparar el número de clientes y facturas. Solo entonces el paso se marca como hecho.
3. Aviso en Hoy si hay más de 3 días sin copia o la última no se verificó.

**Frase de paso y recuperación:** se muestra una **hoja de recuperación imprimible** (código de 24 caracteres que también abre la copia). Se explica con claridad que sin frase ni código la copia no se puede abrir. También sirve para restaurar en otro Mac.

**Restaurar:** desde el panel de Salud o desde la pantalla de reparación; antes de restaurar siempre se guarda una copia de lo actual, y se impide restaurar una copia de una versión más nueva que la instalada.

## 6. Importación de datos y contactos

### 6.1 Principio de diseño

> La IA **propone** cómo leer un archivo; **nunca ejecuta** nada ni toca tus datos. Un motor local, determinista y con vista previa hace la importación real.

### 6.2 Fuentes

| Capa | Fuentes | Cómo |
|---|---|---|
| A. Fijas, sin red | Contactos de macOS (Contacts.framework, con permiso), vCard (.vcf), CSV y Excel (ya existen), CSV de Google Contacts y Outlook | Importadores locales con mapeo guiado. |
| B. Presets por programa | Holded, Quipu, Billin, Factura Directa, Contasol/Facturaplus, Excel «caseros» típicos | Detección por firma de cabeceras y plantilla de mapeo versionada. |
| C. Asistida por IA | Cualquier tabla o exportación que no encaje en A/B | §6.3. |
| D. Formatos antiguos | DBF, texto de ancho fijo, CSV raros, Excel con celdas combinadas | Lector DBF y de ancho fijo en local; el diseño del registro lo propone la IA (§6.3). Fallback con conversor generado, ver §6.4. |

### 6.3 Importación asistida por IA (capa C)

1. **Perfilado local.** El motor lee el archivo y construye un perfil por tabla/hoja: nombres de columnas, tipos inferidos, nº de filas, valores distintos frecuentes y unas 10 filas de muestra.
2. **Enmascarado.** Antes de enviar nada, NIF, emails, teléfonos, IBAN y nombres se sustituyen por valores con la misma forma (`B1234****`, `a***@d***.com`, `9xx xxx xxx`). Opción explícita para enviar muestra real (desactivada por defecto). Pantalla de consentimiento que muestra **exactamente** lo que se enviará.
3. **Petición a la API de Claude** (clave propia del usuario, en el llavero): el perfil enmascarado + el esquema de destino (clientes, facturas, líneas, cobros, gastos, artículos). La respuesta es un **plan de importación en JSON**, validado contra un esquema estricto.
4. **El plan es declarativo, no es código:** para cada campo destino indica la columna(s) de origen y una transformación de un **catálogo cerrado** (`trim`, `upper`, `parse_date(formato)`, `parse_money(local)`, `split`, `concat`, `map_values`, `regex_extract` acotada, `constante`, `lookup`). Además: cómo agrupar líneas en facturas, qué hacer con duplicados y las dudas que debe resolver la persona.
5. **Ejecución local en seco.** El motor aplica el plan a **todos** los datos y enseña: filas que entran, duplicados, errores con su motivo, totales que no cuadran, clientes nuevos, y una comparación «cifra de tu programa antiguo» frente a «cifra importada» (por ejemplo, total facturado del año).
6. **Revisión y edición.** La persona corrige el mapeo en una tabla; puede pedir a la IA un nuevo intento con sus comentarios.
7. **Confirmación.** Copia automática previa → importación en una transacción → informe → **deshacer** (lote de importación identificado: borra solo lo creado; si ya se editó, avisa).

Seguridad frente a datos hostiles: el contenido del archivo se pasa como **dato citado**, el resultado debe pasar el esquema (un «ignora lo anterior» en una celda no puede crear acciones fuera del catálogo), y los límites de tamaño y número de llamadas se registran en el registro de llamadas al modelo (sin guardar el texto).

Sin clave o sin querer enviar datos: modo manual con el mismo motor y mapeo editable a mano.

### 6.4 Conversores a medida con Claude Code (fase posterior y opcional)

Para formatos binarios o propietarios que ni los lectores locales ni el plan declarativo resuelven, se puede pedir a Claude que **genere un conversor a CSV** para ese programa concreto.

Reglas, porque es la parte arriesgada:
- Solo con consentimiento explícito y mostrando el código generado en lenguaje claro.
- Se ejecuta **aislado** (`sandbox-exec`: sin red, solo lectura sobre el archivo de entrada y escritura en una carpeta temporal, con tiempo y memoria limitados).
- Su única salida válida es un CSV/JSON que pasa por el mismo motor local de §6.3 (vista previa, copia previa, deshacer).
- Los conversores que funcionan se guardan como **plantillas versionadas** (capa B) para no volver a generar código para el mismo programa.
- Si no se puede aislar bien en un equipo concreto, no se ofrece.

### 6.5 Contactos

- **Contactos de macOS:** selector con casillas (todos, un grupo o elegidos), mapeo a cliente (nombre o empresa, NIF si hay un campo personalizado, email, teléfono, dirección). Detección de duplicados por NIF y por nombre/email.
- **vCard / CSV de contactos:** mismo motor.
- Regla nueva de datos: **NIF normalizado y único**; los clientes sin NIF se marcan como pendientes de completar antes de poder emitir.

### 6.6 Calidad

Corpus de pruebas con exportaciones **sintéticas** de cada programa y de Excel «caseros», con resultados esperados. Métricas: porcentaje de columnas bien mapeadas, de filas importadas sin intervención y de totales que cuadran. Una regresión del plan de la IA con el corpus se revisa antes de cambiar el modelo o el prompt.

## 7. Distribución

- Firma con Developer ID, `codesign --options runtime`, notarización (`notarytool`) y grapado; entrega en `.dmg`.
- Node oficial universal (arm64 + x86_64) y ayudantes nativos **precompilados y firmados** dentro del `.app` (ya no se compilan en el Mac del usuario).
- Arranque al iniciar sesión con `SMAppService` (en lugar de un plist manual).
- Migración desde la versión web actual: se detecta la carpeta de datos existente y se ofrece adoptarla (con copia previa).
- Solo macOS en esta fase (Apple Silicon e Intel). Windows y Linux quedan fuera de alcance.

## 8. Fases

| Fase | Contenido | Estimación |
|---|---|---|
| **1. Base y copias** | `.app` con supervisor de servidor y ventana; pasos 0-3 y 6; motor de copias cifradas con verificación y restauración de prueba; panel de Salud; migraciones con `user_version`. | 3-4 semanas |
| **2. Datos de entrada** | Contactos de macOS y vCard; presets (capa B); lotes de importación con deshacer; importación asistida por IA con plan declarativo y corpus de pruebas; pasos 4 y 5. | 3-4 semanas |
| **3. Guía y pulido** | Recorrido interactivo (paso 7) y lista de comprobación (paso 8); lector DBF y ancho fijo; actualizaciones; firma y notarización en CI. | 2-3 semanas |
| **4. Opcional** | Conversores generados con aislamiento (§6.4). | según demanda |

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Enviar datos personales a una API externa (RGPD) | Enmascarado, consentimiento detallado, clave propia, modo sin IA, registro de qué se envió (tamaño, no contenido). Revisión legal del texto y, si procede, un acuerdo de tratamiento con el proveedor. |
| Plan de la IA incorrecto | Vista previa con cuadre de totales, copia previa, deshacer, corpus de regresión. |
| Perder la frase de paso | Hoja de recuperación imprimible y mensajes claros; sin ella la copia no se abre (es el propósito). |
| Código generado malicioso o defectuoso (fase 4) | Aislamiento, revisión visible, salida solo por el motor local; se puede no ofrecer. |
| Sin cuenta de Apple Developer no hay distribución cómoda | Decisión previa necesaria (ver abajo). |
| Alcance | Fases cerradas con criterios de aceptación y prueba con usuarios al final de la 1 y de la 2. |

## 10. Preguntas abiertas

1. ¿Hay cuenta de **Apple Developer** (99 $/año) para firmar y notarizar?
2. **Clave de la API de Claude:** ¿la pone cada usuario (recomendado: privacidad y coste a su cargo) o se ofrece un servicio gestionado por vosotros (implica un servidor, coste y tratamiento de datos de terceros)?
3. Versión mínima de macOS que se debe soportar (propongo macOS 13).
4. ¿Qué programas antiguos hay que cubrir primero? Una lista de 3-5 (con exportaciones de ejemplo anonimizadas) vale más que cualquier suposición.
5. ¿La licencia permite repartir el `.app` a usuarios finales? Hoy prohíbe redistribuir: habría que decidir las condiciones de distribución del instalador.
