# Sistema PILA — Changelog

Versionado semántico de cambios materiales en código y arquitectura,
ordenado del más reciente al más antiguo. Cada entrada incluye los
commits clave y los documentos técnicos afectados (sección de `docs/`).

---

## 2.0.0 · 2026-05-07

Segundo release mayor. Consolida los sprints abril–mayo de 2026:
permisos granulares en toda la app admin, módulo Reporte AT (radicación
e investigación de accidentes de trabajo), retención de archivos por
bucket, hardening de seguridad (CSP enforce, rate-limit IP, k6/LH en
CI), y refactor del cliente Prisma para resolver el bug Windows + pnpm

- Next 15.

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
  EPS/AFP con `codigoAxa` (28 EPS + 5 AFP) usando matching stopword
  - estricto en duplicados.

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
