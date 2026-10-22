# Seguridad y privacidad

**Español** · [English](en/security-privacy.md) · [Índice de la documentación](README.md)

Qué guarda REM, dónde, qué sale de tu equipo y cuándo, y qué no está protegido todavía. Para avisar de un fallo de seguridad: [SECURITY.md](../SECURITY.md).

## Dónde están tus datos

| Qué | Dónde (macOS) |
|---|---|
| Base de datos (SQLite) | `~/Library/Application Support/REM Negocio/negocio.db` |
| Copias automáticas y manuales (`.db`) | `…/REM Negocio/backups/` (se conservan las últimas 20 automáticas, aparte de las manuales y las de seguridad) |
| Adjuntos (tickets, contratos…) | dentro de la misma carpeta de datos |
| Copias cifradas `.rembak` (app de Mac) | la carpeta que elijas (USB, NAS, iCloud Drive) |
| Tokens y contraseñas | llavero de macOS |

Se puede cambiar la carpeta con `REM_DATA_DIR`.

## Qué sale de tu equipo

Por defecto, **nada**. No hay cuentas, telemetría ni comprobación automática de actualizaciones. Solo hay tráfico de red si activas alguna de estas funciones:

| Función (todas opcionales) | Destino | Qué se envía |
|---|---|---|
| Telegram | API de Telegram | Los mensajes que respondes y la lectura de los que te llegan a tu bot |
| Correo | Tu servidor IMAP/SMTP (cifrado obligatorio salvo en `127.0.0.1`) | Lectura de tu bandeja; los correos que tú envías |
| Asistente con IA local (Ollama) | **Solo este equipo**: REM rechaza direcciones que no sean locales | Mensajes, datos de tu negocio y memoria aprobada, para redactar borradores |
| Módulos «describiéndoselo a Claude» | API de Anthropic, con tu clave | Solo el texto que escribes, nunca datos de clientes |
| Importar «Ordenar con IA» | API de Anthropic, con tu clave | Una **muestra enmascarada** del archivo, que ves antes de enviarla |
| Rellenar los datos desde tu web | Tu web; opcionalmente Claude para resumir | Peticiones a tus páginas públicas; el texto público extraído si eliges Claude |
| Memoria a largo plazo (Hindsight) | La dirección que configures; por defecto `127.0.0.1:8888` | Textos de mensajes y memoria. **Ojo:** REM no impide poner una dirección remota |
| REM Clientes (experimental) | El relé que configures | Mensajes **cifrados de extremo a extremo**; el relé no puede leerlos |
| App de Mac · «Buscar actualizaciones» | GitHub (solo cuando lo pulsas) | Una consulta pública, sin datos tuyos |

## Cómo se protege la app

- **Solo en tu equipo:** el servidor escucha en `127.0.0.1`, rechaza otros `Host` y exige la cabecera `X-REM` en las escrituras, lo que frena peticiones de otras webs. Cabeceras CSP, `nosniff` y `no-referrer`.
- **PIN opcional:** 4-12 cifras guardadas con scrypt, bloqueo por inactividad y espera tras varios intentos fallidos. **El PIN no cifra el disco.**
- **Secretos:** en el llavero de macOS. En equipos sin llavero solo viven en memoria y hay que volver a conectar Telegram y el correo tras cada reinicio.
- **Copias:** las `.rembak` van cifradas con AES-256-GCM y una clave derivada de tu frase de paso (scrypt); se verifican descifrándolas y el asistente de la app de Mac prueba una restauración.
- **Adjuntos:** se comprueba que el contenido coincide con la extensión, máximo 25 MB, nunca se ejecutan; los Office se leen con límites de tamaño y de descompresión.

## La IA nunca actúa sola

- **Aprobar no es enviar:** el asistente deja borradores; nada sale hasta que pulsas Enviar.
- **Suelo en código:** enviar mensajes, emitir facturas y borrar o exportar datos no se pueden automatizar con ninguna regla. «Parar todo» detiene y vacía la cola.
- **El texto del cliente es un dato, no una orden:** viaja en el prompt como contenido, nunca en las reglas del asistente.
- **Registro sin contenido:** se anotan duración, tokens y errores de cada llamada al modelo, nunca el texto, con un tope por hora (60 por defecto, configurable).

## Qué está probado

- Más de 270 pruebas automáticas (`npm test`) en cada cambio, en macOS.
- El [simulador de pymes](../sim/README.md) comprueba que ningún mensaje se pierde ni se duplica y que un modelo **que obedece a la inyección de instrucciones** no consigue emitir facturas, borrar clientes, crear tareas ni guardar memoria sin aprobación. También se ha probado con un modelo real (qwen3.5 9B en Ollama) y mensajes hostiles: ninguno pasó.
- Prueba de carga con miles de clientes, facturas y mensajes cifrados (`npm run stress`).

## Lo que todavía no está protegido

- **La base de datos no está cifrada en reposo.** Activa FileVault en el Mac.
- **Sin auditoría independiente**, ni de la app ni del canal REM Clientes y su protocolo.
- La app de Mac **no está notarizada** todavía.
- La dirección de Hindsight no se restringe a este equipo.
