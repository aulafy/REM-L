# Seguridad

**Español** · English below

## Cómo avisar de un fallo

**No abras una incidencia pública.** Usa el aviso privado de GitHub ([Security → Report a vulnerability](https://github.com/aulafy/REM-L/security/advisories/new)) o escribe a **learntouseai@gmail.com** con:

- qué ocurre y cómo reproducirlo;
- versión o commit, y sistema operativo;
- el impacto que crees que tiene.

Responderé en un plazo de 7 días. Es un proyecto mantenido por una persona: no hay recompensas económicas, pero se reconocerá tu aviso en el [CHANGELOG](CHANGELOG.md) si lo deseas.

## Alcance

Todo el repositorio: servidor (`server.mjs`, `lib/`), interfaz (`public/`), app de Mac (`mac/`) y relé (`relay/`). Interesan especialmente: acceso desde otras webs u otros equipos, salida de datos no documentada (ver [Seguridad y privacidad](docs/seguridad-privacidad.md)), formas de que la IA actúe sin aprobación, inyección en importadores y adjuntos, y el cifrado de las copias `.rembak` y de REM Clientes.

## Versiones con soporte

Solo la última versión de `main`.

---

## Reporting a vulnerability (English)

**Do not open a public issue.** Use GitHub's private reporting ([Security → Report a vulnerability](https://github.com/aulafy/REM-L/security/advisories/new)) or email **learntouseai@gmail.com** with what happens, how to reproduce it, the version or commit, your OS and the impact. You will get a reply within 7 days. Only the latest `main` is supported. See [Security and privacy](docs/en/security-privacy.md) for what REM is designed to protect.
