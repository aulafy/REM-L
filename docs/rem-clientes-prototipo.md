# REM Clientes · prototipo de validación (guía del piloto)

Objetivo: comprobar con **5-10 negocios reales** si sus clientes usan un enlace de chat estructurado **en vez de WhatsApp**. Producto y estrategia completos en [app-clientes.md](app-clientes.md).

## Qué incluye el prototipo
- **Enlace de chat web** para el cliente (sin app, sin cuenta, sin teléfono), instalable como app web, con cifrado de extremo a extremo en el navegador.
- **Canal «REM Clientes»** en REM: los mensajes llegan a *Mensajes*; se responde desde ahí (con el asistente de siempre: la persona aprueba).
- **Tarjetas tipadas**: presupuesto (el cliente lo acepta o rechaza y REM actualiza su estado), pago (IBAN de la empresa + enlace de pago https + «ya he pagado») y estado del pedido/envío (con enlace de seguimiento).
- **Relé ciego** (`relay/`): buzón que guarda sobres cifrados mientras el Mac está apagado.

## Cómo montarlo (30 minutos)
1. Un servidor con Node ≥ 22 (un VPS pequeño basta) y un dominio con HTTPS delante (Caddy/nginx → `127.0.0.1:4800`).
2. `RELAY_INVITES=negocio-1,negocio-2,… node relay/server.mjs` (un código por negocio piloto).
3. En REM de cada negocio: Ajustes → Canales → **REM Clientes**: dirección del relé + su código → *Activar*. Copiar el enlace.
4. El negocio pone el enlace donde ya habla con sus clientes: firma de correo, factura, cartel/QR (generar el QR con cualquier herramienta), tarjeta, mensaje de bienvenida de WhatsApp.
5. Para enviar un presupuesto: ficha del presupuesto → **Enviar por REM Clientes** (el cliente tiene que haber escrito antes). Para cobrar: en la conversación, **Pedir pago**; para pedidos: **Estado del pedido**.

## Qué medir (2-4 semanas)
| Pregunta | Cómo |
|---|---|
| ¿Cuántos clientes abren el enlace y cuántos escriben? | `peers` en Ajustes; mensajes del canal. |
| ¿Prefieren esto a WhatsApp? | Preguntar a negocio y a 5 clientes de cada uno. |
| ¿Qué tipos de caso aparecen? | Revisión manual de conversaciones (con permiso). |
| ¿Se aceptan presupuestos y se avisan pagos desde la tarjeta? | Estados de presupuestos aceptados por el canal; «ya he pagado». |
| ¿Qué falta o molesta? | Entrevista corta al final de cada semana. |

## Límites conocidos (decir la verdad a los pilotos)
- **Prototipo sin auditoría criptográfica** y sin secreto adelantado: no usar para datos muy sensibles.
- El cliente debe haber escrito antes para que la empresa pueda enviarle tarjetas.
- Sin notificaciones push ni adjuntos todavía; el navegador del cliente hace sondeo mientras la página está abierta.
- Sin recuperación de la clave si el cliente borra los datos del navegador (empieza una conversación nueva).
- REM no gestiona dinero ni emite facturas oficiales por este canal (Verifactu): solo los datos de pago que la empresa configura.
- Un único relé operado por ti: sin federación ni directorio.
