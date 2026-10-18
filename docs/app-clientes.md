# REM Clientes: la app para hablar con tus empresas

Estado: **documento de producto para discutir** (18/10/2026). No hay código. Las cosas que no he podido verificar van marcadas con «(verificar)».

## 1. La idea en una frase

> Una sola app (y, sobre todo, un solo enlace) para que una persona **pida, siga y pague** lo que le debe cualquier empresa que use REM: consultas, presupuestos, pedidos, citas, incidencias, envíos, facturas y garantías, **sin darle su teléfono a nadie** y sin depender de WhatsApp.

No es «otro chat». El chat es solo la puerta; el producto es el **expediente** de cada asunto, compartido entre cliente y empresa, con estados claros.

## 2. Por qué puede ganar (y por qué puede fracasar)

**A favor**
- REM ya tiene el **lado de la empresa**: clientes, presupuestos, albaranes, facturas, cobros, tareas, mensajes y un asistente con aprobación humana. Esto es la «otra mitad» de la misma conversación.
- Las pequeñas empresas están **hartas** de WhatsApp personal mezclado con el trabajo (horarios, números privados, mensajes perdidos, sin trazabilidad) y los clientes de que cada comercio tenga un canal distinto.
- Local-first y E2EE son un argumento real de confianza que los grandes no pueden copiar fácilmente.

**En contra (hay que mirarlo de frente)**
1. **Arranque en frío**: nadie descarga una app para un único comercio. Si la app exige instalación, muere.
2. **WhatsApp es gratis y universal**. Hay que ser *mucho* mejor en lo que WhatsApp no hace (estructura, estado, documentos, pago) y *no peor* en lo que sí hace (rapidez, fotos, notas de voz).
3. **Confianza y fraude**: suplantación de empresas, cambio de IBAN, spam a comercios.
4. **Legal**: RGPD, consumo (desistimiento, garantías), facturación (Verifactu) y, si haces de intermediario, obligaciones de servicios digitales.
5. **Alcance**: es un producto distinto (otra app, otro servidor, otra seguridad). No debe frenar a REM.

Mi lectura: **es buena idea si se construye empezando por el enlace, no por la app**, y si primero se demuestra con 5-10 negocios reales que sus clientes lo usan en lugar de WhatsApp.

## 3. Principios

1. **El cliente no necesita cuenta ni instalar nada para empezar.** Un enlace o un QR abre el expediente (versión web instalable). La app es una mejora: «todas mis empresas en un sitio».
2. **Sin número de teléfono obligatorio.** La identidad es una clave en el dispositivo; el teléfono o el email son opcionales (para recuperar).
3. **Cifrado de extremo a extremo.** El servidor intermedio solo ve sobres cifrados.
4. **La empresa manda en su casa.** Puede cerrar el canal, exigir invitación o limitar horarios; REM sigue funcionando sin este canal.
5. **Estructura antes que texto libre.** Presupuesto, pedido, pago, envío y entrega son *objetos tipados*, no frases. Eso hace útil a un agente y difícil de engañar.
6. **REM nunca toca el dinero.** Enlaces de pago de la propia empresa, transferencia con QR (EPC) o «marcado como cobrado» por la empresa.
7. **Las IA proponen, las personas deciden** (como en el resto de REM), en los dos lados.

## 4. El expediente (la pieza central)

Cada asunto es un **caso** con un estado y una línea de tiempo.

```
Caso { id, empresa, cliente, tipo: consulta | presupuesto | pedido | cita | incidencia | devolución,
       estado, eventos[], adjuntos[], etiquetas }
Eventos: mensaje · solicitud · presupuesto (líneas, validez) · aceptación · pedido confirmado ·
         pago solicitado (enlace/IBAN/QR) · pago confirmado (por la empresa) · envío (transportista + seguimiento) ·
         entrega · factura/documento (PDF/Facturae) · valoración · garantía · cierre
```

Máquina de estados común (ejemplo para un pedido): `consulta → presupuestado → aceptado → pendiente de pago → pagado → en preparación → enviado → entregado → cerrado`, con ramas `rechazado`, `cancelado`, `incidencia` y `devolución`.

Cómo encaja con REM hoy: presupuestos ✅, albaranes ✅ (entrega), facturas ✅, cobros ✅, tareas ✅, mensajes ✅, adjuntos ✅, asistente con aprobación ✅. El canal de clientes añade **un transporte y una vista compartida**, no un sistema nuevo de gestión.

## 5. Qué ve cada lado

**Cliente** (web instalable o app)
- *Mis empresas*: lista con estado de cada asunto abierto.
- *Un asunto*: conversación + tarjetas (presupuesto con «Aceptar», pago con QR/enlace, envío con seguimiento, documentos para descargar).
- *Información de la empresa*: horario, dirección, cómo contactar, política de devoluciones, verificación.
- *Mis documentos*: facturas, presupuestos, garantías y manuales guardados en el dispositivo.
- *Seguridad*: aviso si cambia el IBAN, el nombre o la clave de una empresa.

**Empresa** (dentro de REM)
- Un canal más en **Mensajes**: «REM Clientes», junto a Telegram y correo, con los casos vinculados a la ficha del cliente.
- Botones de acción rápida: «Enviar presupuesto» (el que ya existe), «Pedir pago», «Marcar enviado», «Cerrar».
- Perfil público: nombre, horario, QR y enlace; modo «solo con invitación».
- El asistente de REM redacta respuestas; la persona aprueba.

## 6. Arquitectura propuesta

```
Cliente (web/app)  ⇄  Relé «ciego» (store-and-forward, solo sobres cifrados)  ⇄  REM en el Mac de la empresa
        └─ clave en el dispositivo                                           └─ conexión SALIENTE (sin abrir puertos)
```

- **¿Por qué un relé?** El Mac de la empresa puede estar apagado o detrás de un router. Hace falta un buzón que guarde los sobres hasta que REM se conecte. No ve el contenido.
- **Identidad**: par de claves por empresa y por cliente (Ed25519/X25519). El enlace/QR de una empresa lleva su clave pública y la dirección del relé (los clientes «fijan» esa clave la primera vez, como en Signal).
- **Cifrado**: no inventar criptografía. Opciones (decisión pendiente):
  - **A. Construir la capa de producto sobre Matrix** (cifrado maduro con Olm/Megolm, federación, notificaciones, servidores autoalojables, SDK para web/iOS/Android). Pro: se apoya en algo probado. Contra: pesado, cuentas y salas, dependencia.
  - **B. Relé propio mínimo con una construcción estándar** (Noise u otra revisada) usando las primitivas de la plataforma. Pro: encaja con «cero dependencias» y es pequeño. Contra: hay que auditarlo y mantenerlo bien; riesgo si se hace mal.
  - **C. MLS (RFC 9420)** con una librería existente. Pro: estándar moderno. Contra: aún poco asentado en este uso.
  - **Mi recomendación para el prototipo: B con una construcción estándar y revisión externa antes de tener usuarios reales; y mantener el protocolo lo bastante abstracto como para poder pasar a A o C.** No lanzar a usuarios sin auditoría criptográfica.
- **Notificaciones**: web push (PWA) y, en nativo, push del sistema (el relé solo envía «hay algo nuevo», sin contenido).
- **Adjuntos**: cifrados en el cliente, el relé guarda blobs opacos con caducidad.
- **Descubrimiento**: al principio **solo por enlace y QR** (en el mostrador, la factura, la tarjeta, el email). Un directorio buscable es una segunda fase, porque trae moderación, suplantación y responsabilidad.

Reutilización: tus proyectos `wh` (mensajería con agentes y supervisión humana) y `AgentLink` ya exploran el mismo problema desde el lado de los agentes; conviene revisar qué de su protocolo se puede aprovechar.

## 7. Seguridad y fraude (lo que decide si la gente se fía)

| Riesgo | Medida |
|---|---|
| Suplantación de una empresa | Clave fijada al primer contacto; insignia «verificada» solo con prueba (NIF + dominio web o QR físico en el local); aviso de cambio de clave. |
| **Fraude del cambio de IBAN** (el clásico) | Los datos de pago son un objeto firmado; si cambian respecto a casos anteriores, el cliente ve una alerta roja y la empresa debe confirmar con un segundo canal. |
| Spam a empresas | Por defecto **solo con invitación** (enlace/QR); límites por clave; bloqueo y denuncia. |
| Enlaces maliciosos | Los enlaces de pago se muestran con su dominio y se comparan con los del perfil verificado. |
| Inyección de instrucciones en agentes | Los agentes solo actúan sobre **campos tipados y firmados**; el texto libre es dato, nunca orden. |
| Metadatos | El relé conoce claves y horas, no contenido; sin números de teléfono; retención mínima. |
| Pérdida del dispositivo | Recuperación con una frase o llave de acceso (passkey) del sistema; nunca una cuenta central con contraseña. |

## 8. Pagos, envíos y facturas

- **Pagos**: enlace de pago de la empresa (su propia pasarela), transferencia con **QR EPC** (estándar europeo de transferencia) y «pago confirmado» por la empresa. REM no inicia pagos ni maneja fondos: evita ser una entidad regulada. Integraciones directas con pasarelas, más adelante y solo de lectura.
- **Envíos**: transportista + número de seguimiento + enlace; actualizaciones manuales o por la API del transportista (más adelante).
- **Facturas**: el cliente recibe el PDF/Facturae que la empresa adjunta. **Ojo con Verifactu:** REM es gestión interna, no software de facturación certificado; para una factura oficial la empresa usa su programa conforme y la adjunta. El canal no debe presentar como «factura oficial» lo que no lo es.
- **Consumo**: plantillas de desistimiento y garantía legal visibles en el expediente; revisar con un abogado.

## 9. Agentes de IA

- **En la empresa**: el asistente actual de REM (local con Ollama o por API) redacta respuestas, prepara presupuestos y propone el siguiente estado; **la persona aprueba** (igual que hoy).
- **En el cliente**: un «gestor personal» opcional, **local o con su propia clave de API**, que ordena sus asuntos, compara presupuestos, recuerda renovaciones y redacta peticiones. Sus permisos son explícitos: leer, redactar, **nunca pagar ni aceptar** sin confirmación.
- **Entre agentes**: negociación acotada (disponibilidad, plazos, condiciones) con mensajes tipados y límites; cada parte ve y puede detener. Es el punto más novedoso y el más arriesgado: va en una segunda fase.

## 10. Estrategia de lanzamiento

1. **Validar antes de construir** (2-3 semanas): 5-10 negocios con REM; un enlace «escríbeme» que abre un chat web sencillo (aunque sea sin E2EE, solo para medir). Preguntas: ¿los clientes lo usan en vez de WhatsApp? ¿qué tipos de caso aparecen? ¿qué molesta?
2. **MVP del canal «por enlace»** (8-10 semanas): perfil público + QR, relé mínimo, PWA del cliente (mensajes, presupuesto aceptable, pago por QR/enlace, documentos, seguimiento), canal «REM Clientes» en Mensajes, cifrado revisado.
3. **App «todas mis empresas»** (iOS primero) cuando haya masa: una cartera de expedientes y documentos.
4. **Agentes y directorio** (después): gestor personal, negociación entre agentes, directorio con verificación.

Métricas del MVP: porcentaje de clientes que usan el enlace frente a WhatsApp, tiempo medio de respuesta, casos cerrados con estado completo, nº de empresas que lo mantienen activo a las 4 semanas.

## 11. Modelo de negocio y operación

- Gratis para el cliente. Para la empresa: incluido con REM hasta un límite razonable; plan de pago si usa el relé alojado (volumen, adjuntos, soporte). Opción de **autoalojar** el relé (código abierto) para quien quiera control total.
- Quién opera el relé: coste, abusos y retirada de contenido ilícito (obligaciones de servicios digitales: verificar si aplican y cómo) son decisiones de negocio, no solo técnicas.
- Licencia: el canal obliga a repensar la licencia actual de REM (uso propio, sin redistribución): el cliente final **no** usa REM, usa el canal; hay que separar licencias del servidor, del protocolo y de las apps.

## 12. Lo que NO haría

- Un directorio público desde el día 1.
- Criptografía hecha en casa sin auditoría.
- Procesar pagos o custodiar dinero.
- Obligar a descargar una app para el primer contacto.
- Prometer «sustituir WhatsApp»: prometer **«un expediente por asunto, sin dar tu teléfono»**.

## 13. Decisiones que necesito de ti

1. ¿Empezamos por **validar** con un prototipo de enlace + chat web (recomendado) o directamente por el MVP completo?
2. ¿Qué tipo de negocio es el **primer caso**? (servicios a domicilio, comercio con pedidos, citas, reparaciones…): define qué tipos de caso y de evento hay que construir primero.
3. Cifrado: ¿Matrix (más pesado, más maduro), relé propio con construcción estándar (recomendado para el prototipo) o MLS?
4. ¿Quién opera el relé al principio (tú/Aulafy) y con qué compromiso de disponibilidad y de privacidad?
5. ¿Reutilizamos el protocolo de `wh`/`AgentLink` para la capa de agentes?
6. ¿Qué licencia queremos para el servidor y el protocolo (abierto) frente a REM (uso propio)?

## 14. Variante: usar el correo electrónico como transporte («WhatsApp sobre email»)

Idea aportada por el usuario (18/10/2026): en vez de un relé propio, que la comunicación viaje por **email** (SMTP/IMAP) y la app le dé **forma de mensajería**. Hay precedentes reales: Delta Chat hace exactamente esto, con cifrado Autocrypt y servidores «chatmail» (verificar el estado actual del proyecto).

### Qué ganamos
- **Cero infraestructura propia**: el correo ya es almacenar-y-reenviar (resuelve «mi Mac está apagado») y es federado. No hay relé que operar, vigilar ni pagar.
- **Universal**: todo el mundo tiene correo; no hace falta instalar nada para el primer contacto (un email bien formado ya es un mensaje).
- **REM ya habla correo** (IMAP/SMTP, adjuntos, hilos): el canal es una extensión, no un sistema nuevo.
- **Sin teléfono**: la identidad es una dirección (y puede ser un alias que el cliente controle).
- **Sin dependencia de nadie**: ni Meta, ni Apple, ni nosotros.

### Qué perdemos o complica
- **Spam y suplantación**: el correo es el protocolo más abusado. Hace falta filtrar por un alias/etiqueta exclusivo del canal, SPF/DKIM/DMARC y fichas con token.
- **Cifrado de extremo a extremo** no es el comportamiento por defecto: hay que usar Autocrypt/OpenPGP (gestión de claves) o aceptar que el contenido es legible por los proveedores de correo. Metadatos siempre visibles.
- **Latencia y fiabilidad**: segundos o minutos, con filtros y carpetas de spam por medio. Para «tiempo real» hace falta IMAP IDLE y notificaciones.
- **Un navegador no puede hablar IMAP/SMTP**: un chat web sin app necesita un servidor intermedio (JMAP o nuestro relé). Las apps nativas sí pueden.
- Cada cliente necesita una dirección de correo (casi todos la tienen, pero no es «anónimo»).

### Arquitectura recomendada: correo universal + relé opcional
1. **Nivel 0 (sin instalar nada, sin servidor): correo estructurado.** REM envía por SMTP un email con aspecto de tarjeta (presupuesto, pago, estado) y **acciones por respuesta**: enlaces `mailto:` con un **token único** («ACEPTO P2026-0007 [REM:q16:9f3a…]»). Al llegar la respuesta por IMAP, REM valida el token (HMAC ligado al presupuesto y a la dirección del cliente) y aplica el cambio; sin verificación de remitente (DKIM/SPF) queda **pendiente de tu confirmación**. Funciona con cualquier cliente de correo y valida el producto (expedientes tipados) sin relé.
2. **Nivel 1: hilo = expediente.** `Message-ID/References` identifican el caso; cabecera `X-REM-Case` y una parte `application/json` con los datos tipados para quien use la app.
3. **Nivel 2: app/PWA con aspecto de WhatsApp** sobre ese mismo correo (nativa por IMAP/SMTP, o web por JMAP). Con **Autocrypt** donde ambos extremos lo soporten (interoperable con Delta Chat).
4. **Nivel 3: relé** solo como acelerador: enlace web sin correo, notificaciones push y adjuntos grandes. El prototipo actual ya cubre este nivel.

### Seguridad del Nivel 0 (lo que lo hace viable)
- Token de acción **no adivinable** (≥128 bits) y de **un solo uso** por acción; caduca con el presupuesto.
- La respuesta solo cuenta si viene del destinatario original; sin DKIM/SPF correctos, REM pide confirmación humana.
- Los datos de pago nunca se aceptan por respuesta: el cambio de IBAN requiere confirmación fuera del canal.
- Enlaces de pago solo https y mostrando el dominio; avisos de cambio de datos.

### Decisión
Para **validar el producto** el camino más rápido y barato es el **Nivel 0** (cero infraestructura, funciona con cualquier cliente) y mantener el relé como prototipo del Nivel 3. La app con aspecto de WhatsApp (Nivel 2) se decide cuando se vea qué usan de verdad los clientes. Pendiente: confirmar si implementamos el Nivel 0 ahora.

### 14.1 Nivel 0 implementado (18/10/2026): correo estructurado

Ya funciona sobre el correo conectado en Ajustes → Canales, sin servidor intermedio (`lib/emailcards.mjs`):

- **Tarjetas HTML** (con versión de texto) para **presupuesto** (botones Aceptar/Rechazar), **solicitud de pago** (IBAN, enlace https y «Ya he pagado») y **estado del pedido** (con enlace de seguimiento https). Se envían desde el detalle del presupuesto («Enviar tarjeta por correo») y desde la conversación de Mensajes (canal email: «Pedir pago», «Estado del pedido»).
- Los botones son enlaces `mailto:` hacia tu buzón; funcionan en cualquier cliente de correo. Si el cliente no ve botones, basta responder `ACEPTO` / `RECHAZO` / `PAGADO`.
- **Respuesta segura**: cada botón lleva un token aleatorio de 128 bits en el asunto (`[REM:…]`), de un solo uso y con caducidad (30 días); solo se guarda su hash. Una respuesta cambia el estado únicamente si: el token existe y no se ha usado ni caducado, **el remitente es la dirección a la que se envió** y el servidor de correo certifica el origen (`Authentication-Results` con `dkim=pass` o `spf=pass`, sin ningún `fail`). En cualquier otro caso **no se aplica nada** y llega a Mensajes un aviso «⚠ NO se ha aplicado» con el motivo.
- «Ya he pagado» nunca marca cobrado: solo avisa para que lo compruebes en el banco.
- **Límites conocidos**: no hay cifrado de extremo a extremo (es correo); si el buzón del cliente está comprometido, el atacante puede responder como él; la certificación depende de que tu proveedor añada `Authentication-Results` (si no lo hace, nada se aplica automáticamente: es el comportamiento seguro).
