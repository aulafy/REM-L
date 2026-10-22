# Estado por función

**Español** · [English](en/status.md) · [Índice de la documentación](README.md)

REM es un proyecto joven: unas partes están probadas a fondo y otras son experimentos. Esta tabla dice cuál es cuál. Revisada el 22/10/2026 (versión 1.0.0).

| Nivel | Qué significa |
|---|---|
| ✅ **Estable** | Cubierto por pruebas automáticas y por el simulador de pymes. Listo para usar con datos reales, con copias activadas. |
| 🟡 **Beta** | Funciona y tiene pruebas, pero poca experiencia con negocios reales o depende de piezas externas. Úsalo vigilando. |
| 🧪 **Experimental** | Prototipo. Pruébalo con datos ficticios. |
| ⛔ **No disponible** | No existe; no lo des por hecho. |

## Gestión

| Función | Estado | Notas |
|---|---|---|
| Clientes, presupuestos, albaranes, tareas, horas | ✅ | |
| Cobros, gastos, cuentas a pagar, series | ✅ | |
| Facturas y rectificativas (control interno) | ✅ | **No usar como factura oficial**: ver [Marco legal](marco-legal.md) |
| Copias `.db`, restaurar, modo reparación | ✅ | |
| Importar CSV / Excel / Facturae / DBF | ✅ | Sin plantillas específicas de Holded, Quipu, etc. |
| Exportar CSV / Excel / JSON | ✅ | |
| Bloqueo con PIN | ✅ | No cifra el disco |
| Tesorería 30/60/90 | 🟡 | Previsión, no contabilidad |
| Modelos 130, 303, 115, 347 | 🟡 | **Orientativos**; sin validar con asesores |
| Facturas y gastos recurrentes | 🟡 | Las facturas recurrentes nunca se emiten solas |
| Órdenes en lenguaje natural | 🟡 | Siempre piden confirmación |
| PDF, Word y PowerPoint | 🟡 | PDF nativo solo en macOS; en otros equipos, «Imprimir» |

## Mensajes e IA

| Función | Estado | Notas |
|---|---|---|
| Bandeja: Telegram y correo | 🟡 | Probado con servidores simulados; poca experiencia con proveedores reales |
| WhatsApp / iMessage | 🟡 | Solo **pegando** los mensajes; no hay conexión directa |
| Asistente con Ollama (borradores) | 🟡 | Probado con qwen3.5 9B: 18/18 borradores, ~9 s cada uno en un Mac M4 |
| Agentes Mañana, Cobros y Noche | 🟡 | Solo leen y proponen |
| OCR de tickets | 🟡 | Mejor en macOS (Apple Vision) |
| Memoria con Hindsight | 🧪 | Apagado por defecto |
| Módulos generados con Claude, «Ordenar con IA» | 🧪 | Requieren tu clave de la API |
| Rellenar datos desde tu web | 🧪 | Siempre con revisión campo a campo |
| Voz (escuchar, dictar, notas de voz) | 🧪 | |

## Canal con clientes

| Función | Estado | Notas |
|---|---|---|
| Tarjetas por correo (aceptar presupuesto, avisar de pago) | 🧪 | Respuesta verificada con token y SPF/DKIM |
| REM Clientes y relé | 🧪 | Sin relé desplegado ni auditoría de seguridad |

## Plataformas

| Plataforma | Estado | Notas |
|---|---|---|
| macOS (navegador + `npm start`) | ✅ | Donde se prueba (CI en macOS) |
| App de Mac (SwiftUI) | 🟡 | Compila en CI; **sin notarizar** y sin versión publicada para descargar |
| Linux / Windows | 🧪 | Arranca, pero sin llavero (los secretos se pierden al reiniciar), sin PDF nativo ni OCR de Apple; no se prueba |
| Varios usuarios a la vez | ⛔ | Pensado para una persona por equipo |

## No disponible

- ⛔ Sistema de facturación conforme (Verifactu / no Verifactu) y SII.
- ⛔ Factura electrónica B2B y comunicación de estados de pago.
- ⛔ Cifrado de la base de datos en reposo (solo las copias `.rembak`).
- ⛔ Conciliación bancaria y remesas SEPA.
