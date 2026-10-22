# Contribuir

**Español** · English below

¡Gracias! REM es un proyecto pequeño; estas normas lo mantienen sencillo.

## Antes de empezar

- Para cambios grandes, abre antes una [incidencia](https://github.com/aulafy/REM-L/issues/new/choose) y lo hablamos.
- Lee [Desarrollo y pruebas](docs/desarrollo.md) y el [Estado por función](docs/estado.md).

## Reglas del proyecto

1. **Sin dependencias.** Solo Node ≥ 22.13 y su biblioteca estándar. Si crees que hace falta una, justifícalo en la incidencia.
2. **Local primero.** Nada sale del equipo sin que la persona lo active; toda salida nueva se documenta en [Seguridad y privacidad](docs/seguridad-privacidad.md).
3. **Aprobar no es enviar.** La IA propone; enviar, emitir, borrar y exportar siempre requieren a la persona.
4. **Con pruebas.** Cada cambio lleva su prueba en `test/` y `npm test` en verde. Si toca mensajes o la IA, ejecuta también `npm run sim`.
5. **Datos ficticios.** Nunca subas datos reales de clientes, ni en pruebas ni en capturas.
6. **Español primero.** Interfaz, mensajes y documentación en español de España; si cambias un documento que tiene versión en `docs/en/`, actualízala o indícalo en la PR.
7. **Estilo:** el del código que tocas; comentarios en español y solo donde aportan.

## Enviar cambios

1. Haz un fork y una rama.
2. `npm test` (y `npm run sim` si aplica).
3. Abre la PR explicando qué cambia, por qué y cómo lo has probado. Añade una línea en `CHANGELOG.md`, en «Sin publicar».

Al contribuir aceptas publicar tu código con la licencia MIT del proyecto.

---

## Contributing (English)

Thanks! Open an [issue](https://github.com/aulafy/REM-L/issues/new/choose) before large changes. Rules: no dependencies (Node ≥ 22.13 only); local first (document any new outbound traffic); AI proposes, the person approves; every change ships with tests (`npm test`, plus `npm run sim` for messaging or AI); fictitious data only; Spanish first for the UI and docs, updating `docs/en/` when relevant. Contributions are released under the project's MIT licence. See [Development and testing](docs/en/development.md).
