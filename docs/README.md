# Sistema PILA — Documentación Técnica

> Documentación de nivel **enterprise / due diligence** del Sistema PILA.
> Generada el 2026-04-28 — última versión validada contra `master @ 3c4325f`.
>
> Uso: cualquier equipo que entre nuevo (auditor, arquitecto, desarrollador,
> operador) puede entender, mantener, escalar o reimplementar el sistema
> únicamente con estos documentos + el código fuente.

---

## Índice

| #   | Sección                                                        | Archivo                                                                  | Líneas |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------ | ------ |
| 1   | **Visión, arquitectura y estructura**                          | [`01-vision-arquitectura.md`](01-vision-arquitectura.md)                 | 770    |
| 2   | **Backend** (Server Actions, lib, validations, transactions)   | [`02-backend.md`](02-backend.md)                                         | 740    |
| 3   | **Frontend** (App Router, components, theming)                 | [`03-frontend.md`](03-frontend.md)                                       | 484    |
| 4   | **APIs** (19 Route Handlers + 10 Server Actions críticos)      | [`04-apis.md`](04-apis.md)                                               | 869    |
| 5   | **Bot Colpatria** (RPA Playwright + 7 comandos + crypto)       | [`05-bot-colpatria.md`](05-bot-colpatria.md)                             | 484    |
| 6   | **Base de datos** (50+ modelos Prisma + 63 migraciones)        | [`06-base-datos.md`](06-base-datos.md)                                   | 820    |
| 7   | **Integraciones externas** (PagoSimple, BDUA/RUAF, Sentry, S3) | [`07-integraciones.md`](07-integraciones.md)                             | 756    |
| 8   | **Seguridad** (auth, RBAC, OWASP, encryption, CSP)             | [`08-seguridad.md`](08-seguridad.md)                                     | 429    |
| 9   | **DevOps / infraestructura** (env vars, 12 workflows, deploy)  | [`09-devops.md`](09-devops.md)                                           | 504    |
| 10  | **Testing** (21 archivos Vitest, k6 load tests, gaps)          | [`10-testing.md`](10-testing.md)                                         | 369    |
| 11  | **Performance, riesgos y roadmap**                             | [`11-performance-riesgos-roadmap.md`](11-performance-riesgos-roadmap.md) | 302    |
| —   | Arquitectura legacy (preexistente, complementaria)             | [`architecture.md`](architecture.md)                                     | 255    |

**Total**: ~7037 líneas / ~46.000 palabras de documentación.

---

## Cómo leer esta documentación

### Si sos **auditor** o **due diligence**

1. Empezá por `01-vision-arquitectura.md` (panorama).
2. Después `08-seguridad.md` (controles, OWASP, gaps honestos).
3. Después `11-performance-riesgos-roadmap.md` (lo que el CTO leería).
4. Profundizá en `06-base-datos.md` para entender el modelo de datos.
5. `04-apis.md` para superficie de ataque / contratos.

### Si sos **desarrollador nuevo**

1. `01-vision-arquitectura.md` — qué es y cómo encaja.
2. `09-devops.md` — cómo correrlo localmente.
3. `02-backend.md` y `03-frontend.md` — patrones del codebase.
4. `06-base-datos.md` cuando toques modelos Prisma.

### Si sos **operador / soporte funcional**

1. `01-vision-arquitectura.md` sección "Flujo end-to-end".
2. `05-bot-colpatria.md` para entender el flujo automatizado ARL.
3. `07-integraciones.md` para entender PagoSimple y BDUA/RUAF.

### Si sos **CTO / decision maker**

1. `11-performance-riesgos-roadmap.md` — primero.
2. `08-seguridad.md` — controles + gaps.
3. `01-vision-arquitectura.md` sección "Decisiones técnicas".

---

## Resumen ejecutivo

**Sistema PILA** es una plataforma SaaS para la operación de
**Planilla Integrada de Liquidación de Aportes** en Colombia. Migra
~30.000 líneas de Apps Script legacy a un monorepo TypeScript moderno
y unificado.

| Aspecto       | Valor                                                                    |
| ------------- | ------------------------------------------------------------------------ |
| Arquitectura  | Monorepo pnpm (3 apps + 2 packages)                                      |
| Stack web     | Next.js 15.1 App Router · React 19 · TailwindCSS 4 · TypeScript estricto |
| BD            | PostgreSQL 16 (Neon) · Prisma 6.19 · 50+ modelos · 63 migraciones        |
| Auth          | NextAuth v5 + bcrypt(12) + RBAC con `RolCustom` (matriz módulo × acción) |
| Bot RPA       | Playwright + Pino + Commander (Colpatria ARL — 1500–2100 afil/mes)       |
| CLI admin     | 15 comandos (admin-create, seeds, migraciones, sync, retención)          |
| Workflows     | 12 GitHub Actions (CI + crons operativos)                                |
| Tests         | ~368 tests Vitest + suite k6/Lighthouse                                  |
| Observability | Sentry (web + bot) + pino estructurado                                   |
| Crypto        | AES-256-GCM scrypt KDF (credenciales Colpatria)                          |
| Storage       | Filesystem `UPLOADS_DIR` absoluto + S3 backup BD                         |

**Estado**: **production-ready** para los módulos core (afiliaciones,
PILA, cartera, incapacidades, jurídico, bot Colpatria). Pendientes
declarados: notificaciones email/SMS (4.4/4.5), Carné AXA (8.6),
REACTIVAR en bot, catálogo EPS/AFP completo.

---

## Convenciones de la documentación

- **Idioma**: español (Colombia).
- **Paths**: relativos al worktree (`apps/web/src/...`). Click para abrir.
- **Citas de código**: con paths y números de línea exactos donde aplica.
- **No invención**: cada afirmación está respaldada por código real,
  schema, commit, o `.env.example`. Lo que no está implementado se
  declara explícitamente como gap o pendiente.
- **Diagramas**: ASCII art (no Mermaid) para que rendericen en cualquier
  visor markdown sin dependencias.

---

## Mantenimiento de estos docs

Estos documentos son **vivos** — actualizá cuando:

- Agregues un nuevo módulo a `apps/web/src/app/admin/`.
- Cambies un contrato externo (PagoSimple, BDUA/RUAF, Colpatria).
- Modifiques el schema Prisma con migración no-aditiva.
- Agregues / cambies env vars críticas.
- Modifiques flujos de auth o RBAC.
- Cambies el patrón de despliegue.

**No actualices** estos docs cuando:

- Cambies estilos visuales puntuales.
- Refactorices un componente sin cambiar su API.
- Hagas bug fixes localizados que no alteran la arquitectura.

Para refrescar la documentación completa, regenerala con el comando que
inició esta entrega — los agentes leen el código real y reescriben las
secciones afectadas.

---

## Versionado de la documentación

| Fecha      | Commit    | Cambios                                         |
| ---------- | --------- | ----------------------------------------------- |
| 2026-04-28 | `3c4325f` | Generación inicial completa de las 11 secciones |

---

## Contacto

- **Owner**: Jhon Alexander Sepúlveda · `gerencia.gnt@gmail.com`
- **Repo**: <https://github.com/gerenciagnt-blip/mi-proyecto>
- **Rama principal**: `master`
