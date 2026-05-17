# Sistema PILA — Changelog

Versionado semántico de cambios materiales en código y arquitectura,
ordenado del más reciente al más antiguo. Cada entrada incluye los
commits clave y los documentos técnicos afectados (sección de `docs/`).

---

## 2.1.0 · 2026-05-17

Release de mejora estructural y observabilidad. Cierra 10 PRs (#28–#37)
en una sesión de barrido del backlog post-2.0. No agrega módulos
funcionales nuevos: refuerza performance, observabilidad, tests,
mantenibilidad y prepara la app para E2E sistemático.

### Highlights

- **Barrido HIGH — performance + zod + índices** (PR #28): N+1 fix en
  `listarConversacionesAction` (de 100 counts a 1 query + JS grouping),
  4 índices Prisma compuestos nuevos. Migración
  `20260517191138_perf_indices_barrido` aplicada.
- **Limpieza estructural** (PR #29): elimina 5 permisos huérfanos del
  catálogo. Fusión: el módulo paralelo
  `/admin/soporte/planillas-errores` desaparece — la validación de
  planillas vive ahora dentro de Planos como tab "Validación" con
  botón "Ver errores" por planilla.
- **`config-resolver` unificado en `@pila/core`** (PR #30): la lógica
  de resolución Colpatria que estaba duplicada **dos veces** se
  centraliza en `packages/core/src/colpatria/`. Bot importa de core
  con un adapter `toConfigSnapshot()`. -227 LOC de duplicación.
  También se reducen los `include` profundos del query de planos
  (`periodo: true` y `conceptos: true` → `select` explícito).
- **Logger estructurado en server actions críticas** (PR #31): 8
  `console.error`/`console.warn` migrados a `createLogger` (pino).
  Logs filtrables por scope + forward automático a Sentry en nivel ≥
  error. Nuevo job CI `db-migrations-check` que levanta Postgres
  efímero y corre `prisma migrate diff` contra `schema.prisma`.
- **Monitoreo bot Colpatria** (PR #32): `JobsHealthBar` arriba del
  listado en `/admin/configuracion/colpatria-jobs` con contadores y
  alerta visual si hay jobs colgados (PENDING > 30 min o RUNNING > 15
  min). Endpoint `GET/POST /api/cron/colpatria-health` que reenvía a
  Sentry. Workflow `bot-colpatria-health-check.yml` cada 30 min en
  horario laboral.
- **Backup BD reforzado** (PR #33): cron semanal → **diario** a las
  5 AM UTC (RPO de 7 → 1 día). Schedule mensual adicional que dispara
  con `verify_restore=true`. Job nuevo `notify-on-failure` que postea
  al endpoint `/api/cron/backup-alert` → forward a Sentry si falla.
- **Tests del motor de liquidación SGSS** (PR #34): 33 tests sobre
  `lib/liquidacion/calcular.ts`. El motor calcula el dinero de cada
  transacción y antes tenía 0 tests. Total repo: 362 → 395 tests
  passing.
- **Split de archivos monstruo** (PR #35, #36):
  - `admin/planos/page.tsx`: **1070 → 354 LOC** (-67%) extrayendo
    `_helpers.ts` y 5 sub-componentes en `_components/`.
  - `admin/chat/actions.ts`: **1242 → 1012 LOC** (-19%) extrayendo
    tipos a `_shared.ts` y helpers internos a `_helpers.ts`.
- **Setup E2E con Playwright** (PR #37): `@playwright/test`,
  `playwright.config.ts`, `apps/web/e2e/` con 2 happy paths iniciales
  (`smoke-landing`, `auth-login`), workflow manual `e2e-manual.yml`.

### Schema / migraciones

- `20260517191138_perf_indices_barrido` — 4 índices compuestos:
  `afiliacion[asesorComercialId, modalidad]`,
  `[asesorComercialId, fechaRetiro]`,
  `comprobante[periodoId, estado]`,
  `mensaje[conversacionId, autorId, createdAt]`.

### Workflows GitHub Actions

- **Nuevos**: `bot-colpatria-health-check.yml` (cada 30 min lun-vie),
  `e2e-manual.yml` (workflow_dispatch).
- **Modificados**: `db-backup.yml` (diario + mensual con test restore
  - job de alerta), `ci.yml` (job nuevo `db-migrations-check` con
    Postgres efímero).
- **Endpoints nuevos**: `/api/cron/colpatria-health`,
  `/api/cron/backup-alert`.

### Tests

- 395 unit tests (24 archivos en `apps/web/src/lib/`) — antes 362.
- 57 unit tests en el bot.
- 5 tests E2E en `apps/web/e2e/` (smoke-landing + auth-login).
- Cobertura crítica nueva: motor de liquidación (33 casos).

### Acciones operativas pendientes

- Configurar secrets GitHub `APP_URL` + `CRON_SECRET` para que los
  crons de health-check del bot y de backup-alert puedan postear al
  endpoint de la app desplegada.

### Pendientes vivos

- 5 archivos quedan en >1000 LOC: `chat/panel-conversacion.tsx`,
  `base-datos/afiliacion-form.tsx`, `landing/page.tsx`,
  `transacciones/nueva-transaccion/actions.ts`,
  `base-datos/actions.ts`.
- TODOs comunicaciones: PQRS por email vía Resend, por WhatsApp.
- `WHATSAPP_NUMBER` placeholder en landing.

### Documentos afectados

- `04-apis.md`, `05-bot-colpatria.md`, `09-devops.md`,
  `10-testing.md`, `11-performance-riesgos-roadmap.md`.

---

## 2.0.0 · 2026-05-07

Segundo release mayor. Consolida los sprints abril–mayo de 2026:
permisos granulares en toda la app admin, módulo Reporte AT (radicación
e investigación de accidentes de trabajo), retención de archivos por
bucket, hardening de seguridad (CSP enforce, rate-limit IP, k6/LH en
CI) y refactor del cliente Prisma para resolver el bug Windows / pnpm
/ Next 15.

### Highlights

- **Reporte AT (nuevo módulo end-to-end)**: Aliado radica desde
  Administrativo (modal con auto-arrastre del cotizante de la
  sucursal); Soporte gestiona desde su bandeja con cambio de estado +
  bitácora + carga del FURAT u otros soportes (5 MB, PDF/imagen,
  retención 30 días). Endpoint de descarga restringido a staff con
  `soporte.reporte_at`. Modelos Prisma `ReporteAccidenteTrabajo`,
  `ReporteATDocumento`, `ReporteATGestion` + enums de estado, causa,
  documento.
- **Permisos granulares (`requirePermiso`) en toda la app admin**:
  todas las pages bajo `/admin/*` validan el módulo del catálogo
  `MODULOS` antes de renderizar (page-level guard, no solo sidebar).
  Sidebar respeta RolCustom (no solo rol base).
- **Cliente Prisma con `output` custom** (`packages/db/src/generated/client/`):
  fix definitivo del bug "Prisma Client could not locate the Query
  Engine" en Windows + pnpm + Next 15. Cliente y `query_engine.dll.node`
  viven en la misma carpeta, sin depender de symlinks pnpm.
  `postinstall` regenera tras `pnpm install`.
- **Retención de archivos por bucket** (`pnpm cli retention:run`):
  incapacidades regulares **120d**, incapacidades confidenciales del
  flujo jurídico **180d** (extendido), soporte-afiliaciones **120d**,
  reporte-at **30d**.
- **Sprint 8 REACTIVAR** del bot Colpatria: misma ruta del flujo NUEVA
  (IngresoIndividual → BUSCAR → re-llenar formulario), validado en
  runtime contra ARL AXA Colpatria.
- **Sprint 8.6 — Certificado de afiliación vigente**: cola
  `ColpatriaCertificadoJob`, scraper on-demand
  (`/EmpleadoDependiente/ConsultarEmpleado`), descarga del PDF al
  servir y borrado inmediato (sin retención).
- **Catálogo EPS/AFP con `codigoAxa` completo**: 28 EPS + 5 AFP
  poblados automáticamente vía `scrape-codigos-axa` con stopword
  fuzzy matching (estricto cuando hay duplicados — no rompe el bot).
- **PagoSimple resiliente**: errores parciales en sync por aportante
  ya no rompen el cron; el job termina con resumen de OK/fallos.
- **Hardening de seguridad**: rate-limit por IP en login (30 fails /
  15 min), CSP en modo enforce en producción, k6 + Lighthouse en CI.
- **Auto-refresh** del admin cada 30s con pause cuando el tab está
  oculto (no consume DB cuando nadie mira la pantalla).
- **Landing**: textos legales (Términos, Política de privacidad,
  Habeas Data) actualizados a la versión oficial validada por el
  abogado (5 mayo 2026); redes sociales (Instagram + Facebook) en
  el footer; nuevo servicio "Gestión de AT" en `#servicios`.

### Cambios por área

#### Backend (`apps/web/src/lib`, `apps/web/src/app/.../actions.ts`)

- `lib/auth-helpers.ts`: nueva función `requirePermiso(modulo)` que
  combina `requireAuth` + `puedeAccederModulo`.
- `lib/permisos-runtime.ts`: nueva función `puedeAccederModulo` con
  fallback (ADMIN siempre, sin RolCustom → defaults por rol base, con
  RolCustom → matriz custom). 12 tests de regresión.
- `lib/permisos.ts`: 6 nuevos módulos en `MODULOS`
  (`dashboard_ejecutivo`, `cuentas_cobro`, `notificaciones`,
  `soporte.juridico.pqrs`, `colpatria.certificado_vigente`,
  `admin.reporte_at`, `soporte.reporte_at`).
- `lib/auth-rate-limit.ts`: bucket de fails por IP (separado del
  bucket por email) — `getRateLimitStatusByIp` + `extraerIpDeHeaders`.
- `lib/reporte-at/`: `consecutivo.ts` (RAT-NNNNNN vía secuencia
  Postgres), `validations.ts` (zod schemas + labels), `storage.ts`
  (uploads agrupados por reporteAtId).
- Server actions de Reporte AT: `radicarReporteAtAction`,
  `gestionarReporteAtAction` (FormData con FURAT opcional),
  `gestionAliadoReporteAtAction`, `buscarCotizanteReporteAtAction`
  (auto-arrastre).

#### Frontend (`apps/web/src/app`)

- **Reporte AT**:
  - Aliado: `/admin/administrativo/reporte-at` (listado + filtros + stats),
    `/admin/administrativo/reporte-at/nuevo` (form completo en
    secciones: accidente, trabajador con auto-arrastre por documento,
    empresa, hechos, causas multi-select, partes del cuerpo con
    lateralidad, responsables), `[id]` (detalle + bitácora con notas).
  - Modal: parallel route interceptor `@modal/(.)nuevo` con shell
    `RadicarModalShell` (Dialog `xl` con scroll vertical). Refresh /
    URL directa cae al `/nuevo/page.tsx` standalone.
  - Soporte: `/admin/soporte/reporte-at` (bandeja cross-sucursal con
    filtros estado/sucursal/búsqueda), `[id]` (detalle + form de
    cambio de estado con FURAT + lista de documentos).
- **Sidebar (`admin-nav.tsx`)**: cada item tiene `modulo?: string` y
  el layout calcula `modulosAccesibles` para filtrar.
- **Auto-refresh** (`auto-refresh.tsx`): client component que dispara
  `router.refresh()` cada 30s, pausa con
  `document.visibilityState !== 'visible'`.
- **Landing**:
  - `_components/legal-modal.tsx`: política de privacidad y habeas
    data oficiales (5 mayo 2026), constantes canónicas (`NIT`, `EMAIL`,
    `DIRECCION_FISICA`, `HORARIO`).
  - `page.tsx`: nuevo servicio "Gestión de AT" (icono `ClipboardList`,
    tono ámbar); footer con bloque "Síguenos" (Instagram + Facebook,
    SVG inline).

#### Base de datos

- Nuevas migraciones (66 → 69):
  - `20260506163843_reporte_at_modulo_inicial`
  - `20260506092824_colpatria_certificado_jobs`
  - `20260507082625_reporte_at_documentos`
- Nuevos modelos: `ReporteAccidenteTrabajo`, `ReporteATDocumento`,
  `ReporteATGestion`, `ColpatriaCertificadoJob`.
- Nuevos enums: `ReporteATEstado` (RADICADO/EN_REVISION/CERRADO/
  ANULADO), `ReporteATCausa` (7 causas oficiales), `ReporteATAccionadaPor`,
  `ReporteATDocumentoTipo` (FURAT/OTRO).
- Secuencia Postgres `reporte_at_consecutivo_seq` para `RAT-NNNNNN`.
- **Schema Prisma `output` custom** → `packages/db/src/generated/client/`.

#### APIs (Route Handlers)

- Nuevo endpoint `GET /api/reporte-at/[id]/documentos/[docId]` —
  descarga adjuntos del reporte AT, restringido a staff con
  `soporte.reporte_at`. 410 Gone cuando ya fue purgado por retención
  (30 días).
- `GET /api/incapacidades/[id]/documentos/[docId]`: el mensaje 410
  ahora indica el plazo correcto según `confidencial` (120 vs 180).

#### Bot Colpatria (`apps/bot-colpatria`)

- `lib/decidir-accion.ts`: pure function que decide entre NUEVA /
  REACTIVAR según el estado encontrado en el portal AXA.
- `pages/certificado-vigente.ts` (Sprint 8.6): scraper on-demand que
  navega a `/EmpleadoDependiente/ConsultarEmpleado` (URL configurable
  vía `COLPATRIA_CONSULTA_URL`), llena formulario y dispara la
  descarga del PDF "Imprimir datos básicos" via network capture
  con firma binaria `%PDF-`.
- `commands/scrape-codigos-axa.ts`: poblado automático del catálogo
  EPS/AFP con `codigoAxa` (28 EPS + 5 AFP) usando matching por
  stopword fuzzy (estricto cuando hay duplicados — no rompe el bot).

#### CLI (`apps/cli`)

- `commands/retention-run.ts` refactorizado:
  - Reglas por bucket (constantes en `DIAS`):
    - `INCAPACIDAD_REGULAR = 120`
    - `INCAPACIDAD_CONFIDENCIAL = 180` (extendido)
    - `SOPORTE_AF = 120`
    - `REPORTE_AT = 30`
  - Nuevo módulo `reporte-at` ejecutable con
    `pnpm cli retention:run --module reporte-at`.

#### DevOps (`.github/workflows`, `next.config.mjs`)

- k6 load tests + Lighthouse CI integrados al pipeline.
- CSP en modo enforce en producción (Report-Only en dev).
- `serverExternalPackages` simplificado (Prisma 6 ya no requiere el
  workaround tras `output` custom).

### Fixes notables

- **Prisma 6 + pnpm + Next 15 + Windows**: el cliente generado en
  `node_modules/.pnpm/.../node_modules/.prisma/client/` perdía la
  referencia al `query_engine-windows.dll.node` cuando Webpack
  bundleaba el cliente. **Fix**: salida custom dentro del package
  (`packages/db/src/generated/client/`) — el resolver siempre
  encuentra el binario.
- **Bundle del navegador**: client components de Reporte AT importaban
  enums runtime de `@pila/db`, lo que arrastraba PrismaClient al
  bundle del browser. **Fix**: `validations.ts` define tuplas
  literales `as const` y los client components solo usan los tipos
  derivados.
- **Edge case de Convida (matching duplicado en scraper AXA)**: si dos
  opciones del portal matcheaban contra la misma entidad de BD, el
  scraper ahora salta ambas (no actualiza ninguna) en vez de elegir
  arbitrariamente.

### Métricas

| Métrica            | v1.0 (28-abr) | v2.0 (07-may) |
| ------------------ | ------------- | ------------- |
| Líneas de código   | ~30 000       | ~32 500       |
| Modelos Prisma     | 50+           | 53+           |
| Migraciones        | 63            | 69            |
| Tests Vitest       | ~368          | 362           |
| Módulos en MODULOS | ~20           | 27            |
| Workflows GH       | 12            | 12            |
| Comandos CLI       | 15            | 15            |

---

## 1.0.0 · 2026-04-28 (`3c4325f`)

Generación inicial completa de las 11 secciones de documentación
técnica enterprise / due diligence.

Estado del sistema en ese momento: production-ready para los módulos
core (afiliaciones, PILA, cartera, incapacidades, jurídico, bot
Colpatria). Pendientes declarados: notificaciones email/SMS (4.4/4.5),
Carné AXA (8.6), REACTIVAR en bot, catálogo EPS/AFP completo.

Ver detalles en cada `docs/0X-*.md` y en el resumen del
[`docs/README.md`](README.md).

---

## Política de versionado

- **MAJOR** (X.0.0): cambios arquitectónicos, nuevos módulos
  end-to-end, breaking changes en contratos públicos, refactors
  significativos en el modelo de datos.
- **MINOR** (X.Y.0): nuevas funcionalidades en módulos existentes,
  reglas operativas (retención, permisos), nuevos workflows,
  optimizaciones de performance materiales.
- **PATCH** (X.Y.Z): bug fixes, correcciones de copy, hot-fixes de
  seguridad puntuales, ajustes de configuración.

Se mantiene `master` como rama de release; los tags se aplican
después del barrido de QA y la actualización de este changelog.
