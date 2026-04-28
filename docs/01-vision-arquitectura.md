# Sistema PILA — Visión, Arquitectura y Estructura

> Documento de auditoría técnica · secciones 1, 2, 3.
> Complementa `docs/architecture.md` (no lo reemplaza). Si hay redundancia,
> lo que está allí prevalece como referencia operativa.

---

## 1. Visión general del sistema

### 1.1 Producto

Sistema PILA es una plataforma SaaS interna para una operadora colombiana
de **Planilla Integrada de Liquidación de Aportes (PILA)**. El producto
unifica en una sola aplicación lo que antes vivía en tres aplicaciones
separadas en Google Apps Script (~30.000 líneas combinadas): la operación
comercial de la sucursal aliada, la operación interna de soporte y la
administración financiera.

El nombre del paquete raíz es `sistema-pila` (`package.json:2`). Las apps
se publican como `@pila/web`, `@pila/cli`, `@pila/bot-colpatria` y los
paquetes compartidos como `@pila/db`, `@pila/core`.

La operadora presta a sus sucursales aliadas los siguientes servicios,
todos cubiertos por la plataforma:

1. Mantenimiento de la base maestra de **cotizantes** (personas) y
   **empresas planilla** (NITs que aportan en PILA por sus empleados).
2. Generación de **comprobantes de cobro** (afiliación, mensualidad, otros
   servicios) emitidos por la sucursal al cotizante o a la empresa.
3. Consolidación de comprobantes en **planillas PILA** (TXT formato
   resolución 2388/2016), por empresa o por independiente, agrupados por
   período de aporte.
4. Carga automática de las planillas al operador externo **PagoSimple**
   (API REST), validación, corrección y pago vía PSE.
5. Operación de **cartera** (estados de cuenta de EPS, AFP, ARL y CCF) con
   parsers por entidad, conciliación, marcación de mora real y traslado
   al aliado para gestión de cobro.
6. Radicación de **incapacidades** con documentos del cotizante,
   bitácora de gestión y borrado físico a los 120 días para cumplir
   retención legal.
7. **Finanzas internas**: cobro mensual de la operadora a la sucursal por
   los servicios prestados, conciliación contra extracto bancario.
8. Bot **Colpatria** (Playwright) para automatizar ingreso de afiliaciones
   ARL Sura/Colpatria en el portal del operador, con watchdog,
   reciclaje de jobs y auditoría.
9. Módulo **jurídico** (Sprint 9) para soporte legal con documentos
   confidenciales y estados de proceso.

### 1.2 Problema que resuelve

El stack legacy en Google Apps Script no escalaba: ~30.000 LOC repartidas
en hojas de cálculo y triggers heterogéneos, sin tipos, sin transacciones
ACID, con cuotas de ejecución diaria de Google que cortaban procesos
batch. La migración objetivo es a un monorepo TypeScript con PostgreSQL
gestionado, App Router de Next.js 15 y Prisma como capa de datos. Esto
trae:

- Tipos estáticos end-to-end (formularios → server actions → ORM → BD).
- Transacciones reales (`prisma.$transaction`) para consecutivos atómicos
  e integridad cross-tabla.
- Migraciones SQL versionadas (63 migraciones a la fecha en
  `packages/db/prisma/migrations/`).
- Despliegue independiente por capa (web, CLI, bot, BD).
- Auditoría centralizada (`AuditLog`) y trazabilidad de cambios.

### 1.3 Usuarios del sistema

El sistema define cuatro roles de plataforma + un sistema de roles
personalizables. Definidos en el modelo de roles (`docs/architecture.md`,
sección "Modelo de roles") y materializados en `apps/web/src/lib/permisos.ts`
y `apps/web/src/lib/permisos-runtime.ts`.

```
┌────────────────┬────────────────────────────────────────────────────┐
│ Rol            │ Alcance                                            │
├────────────────┼────────────────────────────────────────────────────┤
│ ADMIN          │ Staff. Acceso total. Configura matriz de permisos, │
│                │ roles custom, tarifas, parámetros del sistema.     │
├────────────────┼────────────────────────────────────────────────────┤
│ SOPORTE        │ Staff. Cross-tenant. Gestiona cartera consolidada, │
│                │ incapacidades de todas las sucursales, finanzas    │
│                │ (cobro a aliados), afiliaciones críticas.          │
├────────────────┼────────────────────────────────────────────────────┤
│ ALIADO_OWNER   │ Tenant. Dueño de UNA sucursal. Ve solo su data.    │
│                │ Facturación, cobranza, planillas PILA, gestión de  │
│                │ cartera asignada, radicación de incapacidades.     │
├────────────────┼────────────────────────────────────────────────────┤
│ ALIADO_USER    │ Tenant. Operador de UNA sucursal. Permisos finos   │
│                │ según el RolCustom que el OWNER le asignó.         │
├────────────────┼────────────────────────────────────────────────────┤
│ RolCustom      │ No es un rol base. Es una agrupación de permisos   │
│                │ creada por ADMIN o por un OWNER de sucursal para   │
│                │ asignar a sus ALIADO_USER. Materializa permisos    │
│                │ granulares (ver/crear/editar/borrar por dominio).  │
└────────────────┴────────────────────────────────────────────────────┘
```

`ADMIN` y `SOPORTE` son **staff** y atraviesan tenants. `ALIADO_OWNER` y
`ALIADO_USER` están **scopeados** por su `sucursalId` (helper en
`apps/web/src/lib/sucursal-scope.ts`). El middleware de Next
(`apps/web/src/middleware.ts`) valida sesión NextAuth y redirige a
`/login` si falta.

### 1.4 Flujo end-to-end

El recorrido de un cotizante por la plataforma, desde su alta hasta el
cobro de cartera y eventual incapacidad:

```
  ┌─────────────┐
  │  Cotizante  │  alta manual o import CSV (lib/cotizantes/csv-import.ts)
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │ Afiliación  │  cotizante × empresa × período · estado vigente/retiro
  └──────┬──────┘
         │ dispara solicitud
         ▼
  ┌─────────────┐    SOPORTE valida en /admin/soporte/afiliaciones
  │ Soporte AF  │    estados: PENDIENTE / APROBADA / RECHAZADA
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │ Transacción │  /admin/transacciones/nueva → genera Comprobantes
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │ Comprobante │  consecutivo Postgres atómico (lib/consecutivo.ts)
  └──────┬──────┘
         │ agrupa por (empresa | independiente) × período
         ▼
  ┌─────────────┐
  │  Planilla   │  CONSOLIDADO → genera TXT (lib/planos/generar.ts)
  └──────┬──────┘
         │ POST multipart /payroll/upload
         ▼
  ┌─────────────┐
  │ PagoSimple  │  API REST · validación · correcciones automáticas
  └──────┬──────┘
         │ PSE
         ▼
  ┌─────────────┐
  │   PAGADA    │  cron pagosimple:sync-planillas re-consulta cada 15min
  └─────────────┘

  En paralelo:
  ┌─────────────┐
  │   Cartera   │  EPS/AFP/ARL/CCF emiten estados de cuenta → SOPORTE sube
  │ consolidada │  PDF · parser por entidad · match por NIT/cédula
  └──────┬──────┘
         │ MORA_REAL / CARTERA_REAL → notifica al ALIADO
         ▼
  ┌─────────────┐
  │ Aliado paga │  registra gestión → notifica a SOPORTE
  └─────────────┘

  ┌─────────────┐
  │ Incapacidad │  ALIADO radica · sube documentos · día 121: borrado físico
  │             │  archivos, registro queda como evidencia
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │  Jurídico   │  caso confidencial · estados de proceso · documentos     │
  └─────────────┘
```

---

## 2. Arquitectura detallada

### 2.1 Diagrama de componentes

```
                       ┌──────────────────────────┐
                       │   USUARIOS (navegador)   │
                       │  ADMIN · SOPORTE · ALIADO│
                       └────────────┬─────────────┘
                                    │ HTTPS
                                    ▼
   ┌───────────────────────────────────────────────────────────────┐
   │                        apps/web (@pila/web)                    │
   │                Next.js 15.1 · React 19 · App Router            │
   │                                                                 │
   │   ┌─────────┐  ┌──────────────┐  ┌─────────────────────────┐  │
   │   │ pages/  │  │ Server       │  │ src/lib/<dominio>/      │  │
   │   │ login   │  │ Components   │  │ pagosimple, planos,     │  │
   │   │ admin/* │──│ + Server     │──│ cartera, incapacidades, │  │
   │   │ api/*   │  │ Actions      │  │ finanzas, colpatria...  │  │
   │   └─────────┘  └──────┬───────┘  └────────────┬────────────┘  │
   │                       │ NextAuth v5                            │
   │                       │ middleware.ts                          │
   │                       │                                        │
   │   instrumentation.ts (Sentry node) · sentry.client (browser)  │
   └───────────────────────┼────────────────────────────────────────┘
                           │
                           │ usa @pila/db (Prisma client)
                           ▼
   ┌───────────────────────────────────────────────────────────────┐
   │                     packages/db (@pila/db)                     │
   │  PrismaClient extendido con $allOperations probe              │
   │  schema.prisma (100k chars · ~60 modelos) + 63 migraciones    │
   └───────────────────────┬────────────────────────────────────────┘
                           │ TCP/SSL
                           ▼
   ┌───────────────────────────────────────────────────────────────┐
   │              PostgreSQL 16 · Neon (cloud)                      │
   │  Branches dev / prod · pooled · serverless cold start          │
   └───────────────────────────────────────────────────────────────┘

   ─────────────  Apps off-line / batch  ─────────────

   ┌─────────────────────┐         ┌─────────────────────────┐
   │  apps/cli           │         │  apps/bot-colpatria     │
   │  @pila/cli          │         │  @pila/bot-colpatria    │
   │  Commander · tsx    │         │  Playwright · pino      │
   │  15 comandos:       │         │  Login · ingreso ARL    │
   │  retention, cobros, │         │  watchdog · reciclaje   │
   │  pagosimple sync... │         │  jobs RETRYABLE         │
   └──────────┬──────────┘         └──────────┬──────────────┘
              │                               │
              └───────────┬───────────────────┘
                          │ ambos usan @pila/db
                          ▼
                   PostgreSQL Neon

   ─────────────  Sistemas externos  ─────────────

   ┌──────────────────┐  ┌───────────────────┐  ┌─────────────────┐
   │   PagoSimple     │  │   BDUA / RUAF     │  │ Colpatria/Sura  │
   │  REST · planilla │  │  consulta seg.    │  │ portal ARL web  │
   │  upload, sync    │  │  social cotizante │  │ (scrapeo bot)   │
   └──────────────────┘  └───────────────────┘  └─────────────────┘
   ┌──────────────────┐  ┌───────────────────┐
   │     Sentry       │  │   Neon (Postgres) │
   │  errores + APM   │  │   BD gestionada   │
   └──────────────────┘  └───────────────────┘
```

Clientes a APIs externas viven en `apps/web/src/lib/<dominio>/client.ts`:

- `lib/pagosimple/client.ts` — HTTP client con auth de sesión.
- `lib/pagosimple/bdua-ruaf.ts` — consulta seguridad social.
- `lib/pagosimple/bdua-cache.ts` — cache 30min TTL para reducir llamadas
  repetidas (commit `ed5fd18`).
- `lib/colpatria/disparos.ts` — encolado de jobs para el bot.

### 2.2 Diagrama de capas (request lifecycle)

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. UI · React Server Components (RSC)                            │
│    apps/web/src/app/admin/**/page.tsx                            │
│    Renderiza en server, sin JS inicial salvo donde 'use client'  │
└──────────────────────┬───────────────────────────────────────────┘
                       │ form action / button onClick
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│ 2. Server Action  ('use server')                                  │
│    apps/web/src/app/admin/**/actions.ts                          │
│    - valida con Zod (lib/validations.ts)                         │
│    - resuelve sesión (auth-helpers)                              │
│    - resuelve scope sucursal (sucursal-scope)                    │
│    - chequea permisos (permisos-runtime)                         │
└──────────────────────┬───────────────────────────────────────────┘
                       │ delega lógica
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│ 3. Capa de dominio · src/lib/<dominio>/                           │
│    Lógica pura: parsers, generadores, calculadoras, storage      │
│    de archivos, formatters. Sin Next.js, testeable con Vitest.   │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│ 4. Prisma (packages/db)                                           │
│    prisma.<modelo>.findMany / create / update                    │
│    prisma.$transaction([...]) para integridad atómica            │
└──────────────────────┬───────────────────────────────────────────┘
                       │ SQL
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│ 5. PostgreSQL (Neon)                                              │
│    sequences para consecutivos · @@map snake_case · soft delete  │
│    donde aplica (afiliacion.activa, comprobante.anuladoEn)       │
└──────────────────────────────────────────────────────────────────┘
```

Acceso a APIs externas se hace **desde la capa 3 o 4**, nunca desde el
componente UI. El cliente HTTP siempre vive en `lib/<dominio>/client.ts`.
No existe un BFF separado: el "BFF" es la propia colección de Server
Actions de Next.

### 2.3 Estilo arquitectónico

- **Monorepo modular** con pnpm workspaces (`pnpm-workspace.yaml` define
  `apps/*` y `packages/*`).
- **Capas Next 15 App Router**: Server Components por defecto, Client
  Components solo donde hay interactividad real (formularios complejos,
  tablas filtrables).
- **Server Actions** (`'use server'`) reemplazan la mayoría de los
  endpoints REST. Los `route.ts` que sí existen están en
  `apps/web/src/app/api/` y son **únicamente** para casos que las Server
  Actions no cubren: descargas de archivo (`/api/planos/[id]/plano.txt`,
  `/api/cartera/[id]/pdf`, exports XLSX), webhooks de NextAuth,
  health-check, polling de notificaciones.
- **Sin GraphQL, sin tRPC, sin BFF dedicado**. Server Actions tipadas
  end-to-end son el contrato.
- **Sin REST público** salvo `/api/auth/*` y `/api/health`. Todo lo demás
  exige sesión.

### 2.4 Patrones aplicados

- **Extracción de lógica de dominio a `lib/<dominio>/`**. Las Server
  Actions son orquestadores delgados. Esto permite testear con Vitest
  sin levantar Next (ver `lib/cartera/detector.test.ts`,
  `lib/planos/generar.test.ts`, `lib/finanzas/cobro-generar.test.ts`,
  `lib/dashboard/kpis-helpers.test.ts`, etc.).
- **Validations Zod centralizadas** en `apps/web/src/lib/validations.ts`
  (~14 KB, esquemas reusables para todos los formularios).
- **Transactions Prisma** (`prisma.$transaction([...])`) para integridad
  cross-tabla: alta de comprobante + actualización de consecutivo,
  generación de planilla + actualización de comprobantes, marcado de
  cartera + emisión de notificación.
- **Consecutivos atómicos vía `nextval()` Postgres** (planilla,
  comprobante) para evitar colisiones bajo concurrencia. Catálogos
  menores siguen `findFirst+max+1` por simplicidad
  (ver `docs/architecture.md` §Convenciones).
- **Auditoría con HOF `withAudit`** (`lib/auditoria/with-audit.ts`)
  que envuelve Server Actions y registra antes/después + diff en
  `AuditLog`.
- **Notificaciones con targeting tripartito** (usuario / rol / sucursal)
  - `NotificacionLectura` por usuario.
- **Sentry para errores y APM** (`@sentry/nextjs` en web,
  `@sentry/node` en bot, `instrumentation.ts` para inicializar).
- **Logging estructurado** con `pino` (web y bot).
- **Cache catalógico in-memory** (`lib/catalogos-cache.ts`) para listas
  de entidades SGSS, planes, tarifas que no cambian en tiempo de request.
- **Rate limiting de login** (`lib/auth-rate-limit.ts`).
- **CSP con nonces (Report-Only)** según commit `847286a`.

### 2.5 Justificación de decisiones

| Decisión                                                          | Razón                                                                                                                                                                                              |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Next.js 15 App Router**                                         | RSC reduce JS al cliente. Server Actions tipadas reemplazan REST. Streaming SSR mejora TTFB. Estabiliza la convención de "lógica en server" que el legacy Apps Script ya tenía implícita.          |
| **React 19**                                                      | Required por Next 15.1. Habilita `use()` para data fetching simple en RSC.                                                                                                                         |
| **Prisma 6.x**                                                    | Tipos generados desde el schema. `$transaction` real. Migraciones SQL versionadas. Soporta extensiones (`$extends`) para instrumentación de queries (ver `packages/db/src/index.ts`).              |
| **PostgreSQL en Neon**                                            | Branches por entorno (dev/prod). Serverless con auto-suspend bajo load cero. Soporte SSL gestionado. La app necesita transacciones reales y `nextval()` atómico, descarta MySQL/SQLite/Mongo.      |
| **Playwright para el bot Colpatria**                              | El portal Colpatria/Sura no tiene API. Playwright es headless reliable, soporta multi-browser, y trae auto-wait que reduce flakiness frente a scripts ad-hoc con Selenium o Puppeteer.             |
| **pnpm monorepo**                                                 | Symlinks de workspace evitan duplicar `node_modules`. Filtros (`pnpm --filter @pila/web dev`) permiten arrancar apps independientemente. `pnpm-lock.yaml` único garantiza versiones reproducibles. |
| **TypeScript estricto**                                           | Migrar 30k LOC sin tipos era inviable. Strict mode atrapa errores de schema-vs-código en build.                                                                                                    |
| **Tailwind 3.4 + tailwindcss-animate + class-variance-authority** | Productividad de UI sin CSS-in-JS runtime. CVA para variantes de componentes (botones, badges).                                                                                                    |
| **NextAuth v5 (beta)**                                            | Integración nativa con App Router y middleware. JWT firmado en cookie, bcrypt para passwords.                                                                                                      |
| **`@react-pdf/renderer` + `pdf-parse`**                           | Genera PDFs en server (comprobantes), parsea PDFs entrantes (cartera, extractos). El segundo es legacy pero estable para parsing tabular.                                                          |
| **`xlsx` + `exceljs`**                                            | xlsx para imports rápidos de CSV/XLS en CLI. exceljs para exports estilizados (formato condicional, anchos de columna) en web.                                                                     |
| **Sentry**                                                        | Errores de servidor (App Router + Node), errores de cliente (browser) y traces (DB queries via `prismaIntegration`).                                                                               |

---

## 3. Estructura del proyecto

### 3.1 Árbol completo

```
mi-proyecto/                            ← raíz monorepo
├── .env                                 ← secretos locales (no commit)
├── .env.example                         ← documentación de vars
├── .github/                             ← workflows CI (PR checks, crons)
├── .husky/                              ← hooks git (pre-commit, prepare)
├── CLAUDE.md                            ← instrucciones de Claude
├── package.json                         ← raíz: scripts dev/build/cli
├── pnpm-workspace.yaml                  ← apps/* + packages/*
├── pnpm-lock.yaml
├── tsconfig.base.json                   ← config TS heredada
│
├── apps/
│   ├── web/                             ← @pila/web (Next.js 15)
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── auth.ts                  ← NextAuth v5 setup
│   │   │   ├── auth.config.ts           ← providers + callbacks
│   │   │   ├── middleware.ts            ← gate de sesión
│   │   │   ├── instrumentation.ts       ← Sentry server bootstrap
│   │   │   ├── instrumentation-client.ts← Sentry browser bootstrap
│   │   │   ├── app/                     ← App Router (rutas)
│   │   │   │   ├── layout.tsx
│   │   │   │   ├── page.tsx             ← landing (redirect a /login o /admin)
│   │   │   │   ├── globals.css
│   │   │   │   ├── global-error.tsx
│   │   │   │   ├── not-found.tsx
│   │   │   │   ├── login/               ← form login
│   │   │   │   ├── auth/                ← signout etc.
│   │   │   │   ├── dashboard/           ← deprecated, usar admin/dashboard-ejecutivo
│   │   │   │   ├── admin/               ← UI principal (61 routes, ver §3.2)
│   │   │   │   └── api/                 ← REST (19 endpoints, ver §3.3)
│   │   │   ├── components/              ← UI compartida
│   │   │   │   ├── ui/                  ← primitivas (button, input, table)
│   │   │   │   ├── admin/               ← layout admin, sidebar, topbar
│   │   │   │   ├── auth/                ← componentes de login
│   │   │   │   └── brand/               ← logo, badges
│   │   │   ├── lib/                     ← lógica de dominio (16 sub-dominios, §3.4)
│   │   │   ├── pages/                   ← legacy (vacío o casi)
│   │   │   └── types/                   ← tipos compartidos
│   │   └── tsconfig.json
│   │
│   ├── cli/                             ← @pila/cli (Commander)
│   │   ├── package.json                 ← bin: pila → src/index.ts
│   │   ├── src/
│   │   │   ├── index.ts                 ← registra los 15 comandos
│   │   │   ├── commands/                ← un archivo por comando (§3.5)
│   │   │   └── lib/
│   │   │       └── cron-run.ts          ← wrapper para correr comandos como cron
│   │   └── tsconfig.json
│   │
│   └── bot-colpatria/                   ← @pila/bot-colpatria (Playwright)
│       ├── package.json
│       ├── src/
│       │   ├── index.ts                 ← entry, registra subcommands
│       │   ├── commands/                ← (§3.6)
│       │   ├── lib/                     ← browser, crypto, session, watchdog
│       │   └── pages/                   ← Page Objects de Playwright
│       └── tsconfig.json
│
├── packages/
│   ├── db/                              ← @pila/db (Prisma)
│   │   ├── package.json                 ← scripts prisma:* (generate/migrate/studio/deploy/reset)
│   │   ├── src/
│   │   │   └── index.ts                 ← exporta `prisma` y reexporta `@prisma/client`
│   │   └── prisma/
│   │       ├── schema.prisma            ← ~100 KB · ~60 modelos
│   │       ├── seed-divipola.sql        ← seed de divipola
│   │       └── migrations/              ← 63 migraciones SQL versionadas
│   │
│   └── core/                            ← @pila/core (utils compartidos)
│       ├── package.json
│       └── src/
│           └── index.ts                 ← APP_NAME, APP_VERSION, type Result<T,E>, ok(), err()
│
├── docs/
│   ├── architecture.md                  ← documento operativo de referencia
│   └── 01-vision-arquitectura.md        ← este documento
│
└── tests/                               ← tests E2E o cross-app (vacío al momento)
```

### 3.2 `apps/web/src/app/admin/` — 61 rutas

Inventario completo de páginas bajo `/admin`. Cada ruta incluye `page.tsx`
y, donde aplica, `actions.ts` y componentes locales `*-form.tsx`,
`*-table.tsx`.

| #   | Ruta                                                     | Responsabilidad                                       |
| --- | -------------------------------------------------------- | ----------------------------------------------------- |
| 1   | `/admin`                                                 | Home admin · selector de módulo                       |
| 2   | `/admin/administrativo`                                  | Hub del aliado (cartera + incapacidades)              |
| 3   | `/admin/administrativo/cartera`                          | Aliado: ve cartera asignada (MORA_REAL/CARTERA_REAL)  |
| 4   | `/admin/administrativo/incapacidades`                    | Aliado: radica incapacidades + bandeja                |
| 5   | `/admin/base-datos`                                      | Cotizantes/empresas: hub de la base maestra           |
| 6   | `/admin/base-datos/importar`                             | Import CSV de cotizantes (lib/cotizantes/csv-import)  |
| 7   | `/admin/catalogos`                                       | Hub de catálogos                                      |
| 8   | `/admin/catalogos/actividades`                           | Actividades económicas (CIIU) y nivel ARL             |
| 9   | `/admin/catalogos/asesores`                              | Asesores comerciales por sucursal                     |
| 10  | `/admin/catalogos/comprobantes`                          | Formatos de comprobantes (resolución, nombre, sufijo) |
| 11  | `/admin/catalogos/comprobantes/[sucursalId]`             | Editor por sucursal                                   |
| 12  | `/admin/catalogos/entidades`                             | Entidades SGSS unificadas (EPS/AFP/ARL/CCF)           |
| 13  | `/admin/catalogos/medios-pago`                           | Medios de pago aceptados                              |
| 14  | `/admin/catalogos/planes`                                | Planes complementarios y tarifas                      |
| 15  | `/admin/catalogos/servicios`                             | Servicios facturables al cotizante                    |
| 16  | `/admin/catalogos/smlv`                                  | Histórico de SMLMV                                    |
| 17  | `/admin/catalogos/tarifas`                               | Tarifas SGSS + FSP                                    |
| 18  | `/admin/catalogos/tipos-cotizante`                       | Tipos de cotizante PILA                               |
| 19  | `/admin/catalogos/tipos-cotizante/[id]`                  | Edición de tipo                                       |
| 20  | `/admin/configuracion/bitacora`                          | Auditoría AuditLog (filtros, export)                  |
| 21  | `/admin/configuracion/colpatria-jobs`                    | Jobs del bot Colpatria (estado, reintentar)           |
| 22  | `/admin/configuracion/colpatria-jobs/[id]`               | Detalle de un job                                     |
| 23  | `/admin/cuentas-cobro`                                   | Cuentas de cobro: hub                                 |
| 24  | `/admin/dashboard-ejecutivo`                             | KPIs ejecutivos (lib/dashboard/kpis)                  |
| 25  | `/admin/empresas`                                        | Empresas planilla (lista)                             |
| 26  | `/admin/empresas/[id]`                                   | Detalle empresa                                       |
| 27  | `/admin/empresas/[id]/colpatria`                         | Configuración Colpatria por empresa                   |
| 28  | `/admin/empresas/[id]/config`                            | Config general (CCF, ARL, etc.)                       |
| 29  | `/admin/notificaciones`                                  | Bandeja de notificaciones del usuario                 |
| 30  | `/admin/planos`                                          | Generación y subida de planillas PILA                 |
| 31  | `/admin/sistema`                                         | Estado del sistema (lib/sistema/status)               |
| 32  | `/admin/soporte`                                         | Hub Soporte staff                                     |
| 33  | `/admin/soporte/afiliaciones`                            | Bandeja de solicitudes de afiliación                  |
| 34  | `/admin/soporte/afiliaciones/[id]`                       | Detalle/aprobación                                    |
| 35  | `/admin/soporte/cartera`                                 | Cartera consolidada (sube PDFs entidades)             |
| 36  | `/admin/soporte/cartera/[id]`                            | Detalle de un consolidado, líneas                     |
| 37  | `/admin/soporte/finanzas`                                | Hub finanzas                                          |
| 38  | `/admin/soporte/finanzas/cobro-aliados`                  | Cobros mensuales generados                            |
| 39  | `/admin/soporte/finanzas/cobro-aliados/[id]`             | Detalle de un cobro                                   |
| 40  | `/admin/soporte/finanzas/detalle-movimientos`            | Movimientos del extracto bancario                     |
| 41  | `/admin/soporte/finanzas/movimientos-incapacidades`      | Conciliación incap. con movimientos                   |
| 42  | `/admin/soporte/finanzas/movimientos-incapacidades/[id]` | Detalle                                               |
| 43  | `/admin/soporte/incapacidades`                           | Bandeja de incapacidades cross-tenant                 |
| 44  | `/admin/soporte/incapacidades/[id]`                      | Detalle full-page                                     |
| 45  | `/admin/soporte/incapacidades/@modal/(.)[id]`            | Modal interceptado (Sprint 9)                         |
| 46  | `/admin/soporte/juridico`                                | Bandeja jurídico (Sprint 9)                           |
| 47  | `/admin/soporte/juridico/[id]`                           | Detalle de caso                                       |
| 48  | `/admin/soporte/juridico/@modal/(.)[id]`                 | Modal interceptado                                    |
| 49  | `/admin/sucursales`                                      | Sucursales aliadas (lista)                            |
| 50  | `/admin/sucursales/[id]`                                 | Detalle de sucursal                                   |
| 51  | `/admin/transacciones`                                   | Hub transacciones (nueva, historial)                  |
| 52  | `/admin/transacciones/cartera`                           | Vista de cartera comercial (transaccional)            |
| 53  | `/admin/transacciones/cuadre`                            | Cuadre de cierre del día                              |
| 54  | `/admin/transacciones/historial`                         | Historial de transacciones                            |
| 55  | `/admin/usuarios`                                        | Usuarios (lista)                                      |
| 56  | `/admin/usuarios/[id]`                                   | Detalle/edición                                       |
| 57  | `/admin/usuarios/[id]/empresas`                          | Empresas asignadas a un usuario                       |
| 58  | `/admin/usuarios/roles`                                  | Roles custom                                          |
| 59  | `/admin/usuarios/roles/[id]`                             | Detalle de rol custom (matriz de permisos)            |
| 60  | `/admin/catalogos/page.tsx`                              | Hub catálogos (referenciado arriba)                   |
| 61  | `/admin/administrativo/page.tsx`                         | Hub administrativo (referenciado arriba)              |

### 3.3 `apps/web/src/app/api/` — endpoints REST (19)

Solo casos donde Server Actions no aplican (descargas binarias, webhooks
externos, polling cliente).

| Endpoint                                         | Propósito                                          |
| ------------------------------------------------ | -------------------------------------------------- |
| `GET /api/auth/[...nextauth]`                    | Webhooks NextAuth (signin, callback, signout)      |
| `GET /api/health`                                | Health check (público)                             |
| `GET /api/buscar`                                | Buscador global (cotizantes/empresas/comprobantes) |
| `GET /api/cartera/[id]/pdf`                      | Descarga del PDF original consolidado              |
| `GET /api/cartera/[id]/export.xlsx`              | Export XLSX de líneas de cartera                   |
| `GET /api/colpatria/jobs/[id]/pdf`               | PDF de soporte del job Colpatria                   |
| `POST /api/colpatria/procesar-ahora`             | Trigger manual del bot                             |
| `GET /api/comprobantes/[id]/pagosimple-pdf`      | Descarga PDF de PagoSimple                         |
| `GET /api/cotizantes/template.csv`               | Template CSV para import                           |
| `GET /api/incapacidades/[id]/documentos/[docId]` | Descarga documento de incap.                       |
| `GET /api/mov-detalle/[id]/documentos/[docId]`   | Documento de movimiento                            |
| `GET /api/notificaciones`                        | Lista paginada del usuario                         |
| `GET /api/notificaciones/count`                  | Polling 60s para campana                           |
| `POST /api/notificaciones/leer-todas`            | Marca todas como leídas                            |
| `POST /api/notificaciones/[id]/leer`             | Marca una                                          |
| `GET /api/planos/[id]/plano.txt`                 | Descarga TXT PILA generado                         |
| `GET /api/soporte-af/[id]/documentos/[docId]`    | Descarga documento de afiliación                   |
| `GET /api/transacciones/cartera/excel`           | Export XLSX cartera transaccional                  |
| `GET /api/transacciones/cuadre/excel`            | Export XLSX cuadre                                 |

### 3.4 `apps/web/src/lib/` — 16 sub-dominios

```
src/lib/
├── alertas/           inactividad de usuarios y sucursales
├── auditoria/         AuditLog: registrar, diff, payload, scope, withAudit HOF
├── cartera/           parsers PDF EPS/AFP/ARL/CCF, normalizer, detector entidad
├── catalogos-cache.ts cache in-memory de catálogos estables
├── colpatria/         crypto credenciales bot, config-resolver, disparos
├── consecutivo.ts     wrapper nextval() Postgres
├── cotizantes/        import CSV con validación columna a columna
├── dashboard/         KPIs ejecutivos (helpers + queries Prisma)
├── db-instrumentation probe de Prisma queries para Sentry
├── duenos-sucursal.ts helpers para chequear ALIADO_OWNER
├── excel.ts           helper exceljs (estilos, anchos)
├── finanzas/          generación CobroAliado, parser extracto, storage docs
├── format.ts          formateo COP, fechas, NIT, CC
├── incapacidades/     consecutivo, días, retención 120d, storage, validations
├── liquidacion/       cálculo de aportes (porcentajes, FSP, exoneración)
├── logger.ts          pino server (request id, level)
├── nit.ts             validador dígito verificación NIT
├── notificaciones.ts  helpers emit/list/count por target tripartito
├── pagosimple/        client HTTP, auth, planillas, comprobantes,
│                     aportantes, BDUA/RUAF, BDUA cache, validar-subtipos
├── pdf/               render @react-pdf/renderer (comprobante)
├── permisos.ts        matriz de permisos (constantes)
├── permisos-runtime.ts evaluación runtime contra rol del usuario
├── planos/            generador TXT PILA, formatters, políticas, queries,
│                     codigos (resolución 2388/2016)
├── sentry.ts          inicialización condicional Sentry
├── sistema/           status del sistema (uptime, BD, integraciones)
├── soporte-af/        afiliaciones: cambios, dispatch, retención, storage,
│                     ARL status, consecutivo, disparos
├── sucursal-scope.ts  helper para filtrar queries por sucursal del user
├── text.ts            normalización texto (acentos, mayúsculas)
├── utils.ts           cn() de Tailwind, etc.
└── validations.ts     14KB · esquemas Zod centralizados
```

Resumen de los 16 sub-dominios mencionados en el brief:

| Sub-dominio      | Función                                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `alertas`        | Detección de inactividad (usuarios sin login, sucursales sin actividad).                                                                                  |
| `auditoria`      | Registro centralizado en `AuditLog` con HOF `withAudit` que calcula diff antes/después.                                                                   |
| `cartera`        | Parsers de PDF por entidad SGSS, detector automático de la entidad emisora, normalización de líneas, sugerencia de sucursal por NIT, storage de archivos. |
| `colpatria`      | Crypto AES-GCM para credenciales del bot, resolución de config por empresa, disparos a la cola del bot.                                                   |
| `cotizantes`     | Import CSV con validación columna a columna, mapeo a modelos Cotizante/Afiliacion.                                                                        |
| `dashboard`      | KPIs ejecutivos: planillas pagadas/pendientes, cartera real, incapacidades activas, cobros del mes.                                                       |
| `finanzas`       | Generación mensual de CobroAliado, parser de extracto bancario (CSV/PDF), storage de documentos de detalle.                                               |
| `incapacidades`  | Cálculo de días por tipo, retención de 120 días, consecutivo, storage de documentos, validaciones Zod.                                                    |
| `liquidacion`    | Cálculo de aportes (salud/pensión/ARL/CCF/FSP) con porcentajes vigentes, exoneración Ley 1819.                                                            |
| `notificaciones` | Emisión y consulta con targeting tripartito (usuario/rol/sucursal).                                                                                       |
| `pagosimple`     | Cliente HTTP, auth de sesión, subida de planillas, sincronización de estado, comprobantes PDF, BDUA/RUAF con cache 30min.                                 |
| `pdf`            | Renderer `@react-pdf/renderer` para comprobante de cobro.                                                                                                 |
| `planos`         | Generación TXT PILA según resolución 2388/2016, formatters de campo fijo, políticas de validación, queries de comprobantes a empaquetar.                  |
| `sistema`        | Status del sistema para monitoreo interno.                                                                                                                |
| `soporte-af`     | Workflow completo de aprobación de afiliaciones, ARL status, dispatch a soporte, retención.                                                               |

### 3.5 `apps/cli/src/commands/` — 15 comandos

| Comando                       | Archivo                          | Función                                        |
| ----------------------------- | -------------------------------- | ---------------------------------------------- |
| `admin:create`                | `admin-create.ts`                | Crear primer ADMIN o adicionales               |
| `analyze:db`                  | `analyze-db.ts`                  | Análisis de tamaño/uso de tablas               |
| `auditoria:purge`             | `auditoria-purge.ts`             | Purga AuditLog antiguo                         |
| `cobros:run`                  | `cobros-run.ts`                  | Genera CobroAliado mensual (recomendado día 1) |
| `db:backup`                   | `db-backup.ts`                   | Dump lógico para backup local                  |
| `divipola:seed`               | `divipola-seed.ts`               | Carga catálogo DIVIPOLA                        |
| `entidades-pila:seed`         | `entidades-pila-seed.ts`         | Carga catálogo de entidades SGSS               |
| `pagosimple:ping`             | `pagosimple-ping.ts`             | Health-check de la API externa                 |
| `pagosimple:sync-planillas`   | `pagosimple-sync-planillas.ts`   | Resync estado/totales (cron 15min)             |
| `pagosimple:test-all`         | `pagosimple-test-all.ts`         | Smoke test de todos los endpoints              |
| `pagosimple:validar-subtipos` | `pagosimple-validar-subtipos.ts` | Verifica consistencia subtipos                 |
| `reset:password`              | `reset-password.ts`              | Reset password de un usuario                   |
| `retention:run`               | `retention-run.ts`               | Borra archivos incapacidad >120d (cron diario) |
| `seed:test-data`              | `seed-test-data.ts`              | Datos de prueba para dev                       |
| `uploads:cleanup`             | `uploads-cleanup.ts`             | Limpia uploads huérfanos                       |

Wrapper compartido en `apps/cli/src/lib/cron-run.ts` para ejecutar
cualquier comando en modo cron (logging estructurado, exit code).

### 3.6 `apps/bot-colpatria/src/` — bot Playwright

```
apps/bot-colpatria/src/
├── index.ts                       ← entry Commander, registra subcommands
│
├── commands/
│   ├── login-auto.ts              ← login automatizado al portal
│   ├── logout-auto.ts             ← logout limpio
│   ├── procesar.ts                ← procesa cola de jobs PENDIENTE/RETRYABLE
│   ├── test-login.ts              ← prueba de login interactivo
│   ├── test-ingreso.ts            ← prueba de ingreso de afiliación
│   ├── limpiar-pdfs.ts            ← limpia PDFs locales descargados
│   └── watchdog.ts                ← detecta zombies, recicla RETRYABLE,
│                                    alerta si la cola se atasca
│                                    (commit 0e84a2d)
│
├── lib/
│   ├── browser.ts                 ← bootstrap Playwright (Chromium headless)
│   ├── crypto.ts                  ← descifra credenciales (AES-GCM)
│   ├── session.ts                 ← persistencia de cookies/sesión
│   ├── storage.ts                 ← validación UPLOADS_DIR persistente
│                                    (commit 784e880)
│   ├── watchdog.ts                ← lógica del watchdog (timeouts, métricas)
│   ├── payload-form.ts            ← construye el payload del form ARL
│   ├── payload-form.test.ts       ← test Vitest del payload
│   ├── logger.ts                  ← pino con contexto job
│   └── sentry.ts                  ← Sentry node init
│
└── pages/                         ← Page Objects de Playwright
    ├── login.ts                   ← selectors y acciones de la pantalla login
    └── ingreso-individual.ts      ← form de ingreso individual ARL
```

### 3.7 `packages/db/`

```
packages/db/
├── package.json                   ← scripts prisma:* via dotenv-cli
├── src/
│   └── index.ts                   ← exporta `prisma` (PrismaClient extendido
│                                    con $allOperations probe + buildLogLevels)
│                                    + reexporta '@prisma/client'
└── prisma/
    ├── schema.prisma              ← ~100 KB · ~60 modelos (cotizantes,
    │                              afiliaciones, comprobantes, planillas,
    │                              cartera, incapacidades, finanzas,
    │                              colpatria, jurídico, notificaciones,
    │                              auditoria, permisos, divipola, etc.)
    ├── seed-divipola.sql          ← seed catálogo DIVIPOLA Colombia
    └── migrations/                ← 63 migraciones SQL versionadas
        ├── migration_lock.toml    ← provider postgresql
        ├── 20260420195713_init/
        ├── 20260420211824_empresa_fields_v1/
        ├── 20260420213253_catalogos/
        ├── ...
        └── (62 más, una por feature/sprint)
```

El cliente `prisma` se cachea en `globalThis` en dev para evitar N
instancias con HMR, y expone un hook `__pilaQueryProbe` para
instrumentación opt-in (ver comentario en `packages/db/src/index.ts:8-30`).

### 3.8 `packages/core/src/`

```
packages/core/src/index.ts:
  - export const APP_NAME = 'Sistema PILA'
  - export const APP_VERSION = '0.1.0'
  - export type Result<T, E = string>
  - export const ok<T>(data: T): Result<T>
  - export const err<E = string>(error: E): Result<never, E>
```

Único archivo. Export mínimo deliberado: tipos `Result<T,E>` y constantes
de versión. Usado por `apps/web` y `apps/cli` (declarados en sus
`package.json` como `"@pila/core": "workspace:*"`).

---

## Tablas obligatorias

### Stack tecnológico

| Capa               | Tecnología                    | Versión          | Fuente (`package.json`)                                                |
| ------------------ | ----------------------------- | ---------------- | ---------------------------------------------------------------------- |
| Web framework      | Next.js                       | 15.1.3           | `apps/web/package.json:26`                                             |
| UI runtime         | React + ReactDOM              | 19.0.0           | `apps/web/package.json:31-32`                                          |
| CSS                | TailwindCSS                   | 3.4.17           | `apps/web/package.json:50`                                             |
| CSS animaciones    | tailwindcss-animate           | ^1.0.7           | `apps/web/package.json:34`                                             |
| CSS variantes      | class-variance-authority      | ^0.7.1           | `apps/web/package.json:22`                                             |
| Auth               | NextAuth                      | 5.0.0-beta.31    | `apps/web/package.json:27`                                             |
| Hashing            | bcryptjs                      | ^3.0.3           | `apps/web/package.json:21`                                             |
| Validación         | Zod                           | ^4.3.6           | `apps/web/package.json:36`                                             |
| ORM                | Prisma + @prisma/client       | ^6.1.0           | `packages/db/package.json:20-23`                                       |
| BD                 | PostgreSQL 16 (Neon)          | —                | `migration_lock.toml`                                                  |
| Lenguaje           | TypeScript                    | ^5.7.2           | raíz `package.json:46`                                                 |
| Workspace          | pnpm                          | 10.33.0          | raíz `package.json:6`                                                  |
| Runtime            | Node                          | >=20             | raíz `package.json:8`                                                  |
| PDF render         | @react-pdf/renderer           | ^4.5.1           | `apps/web/package.json:19`                                             |
| PDF parse          | pdf-parse                     | 1.1.1            | `apps/web/package.json:28`                                             |
| Excel write        | exceljs                       | ^4.4.0           | `apps/web/package.json:24`                                             |
| Excel read         | xlsx                          | ^0.18.5          | `apps/web/package.json:35`                                             |
| CLI args           | commander                     | ^13.0.0          | `apps/cli/package.json:18`                                             |
| CLI prompts        | @inquirer/prompts             | ^8.4.2           | `apps/cli/package.json:14`                                             |
| TS runner          | tsx                           | ^4.19.2          | `apps/cli/package.json:26`                                             |
| Browser automation | playwright                    | ^1.49.0          | `apps/bot-colpatria/package.json:18`                                   |
| Logging            | pino + pino-pretty            | ^10.3.1 / ^9.6.0 | `apps/web/package.json:29-30`, `apps/bot-colpatria/package.json:19-20` |
| APM/errores        | @sentry/nextjs / @sentry/node | ^10.50.0         | `apps/web/package.json:20`, `apps/bot-colpatria/package.json:17`       |
| Iconos             | lucide-react                  | ^1.8.0           | `apps/web/package.json:25`                                             |
| Utils CSS          | clsx + tailwind-merge         | ^2.1.1 / ^3.5.0  | `apps/web/package.json:23, 33`                                         |
| Test runner        | Vitest                        | ^4.1.5           | `apps/web/package.json:52`                                             |
| Hooks git          | husky                         | ^9.1.7           | raíz `package.json:43`                                                 |
| Lint stage         | lint-staged                   | ^16.4.0          | raíz `package.json:44`                                                 |
| Format             | prettier                      | ^3.4.2           | raíz `package.json:45`                                                 |
| Env loader         | dotenv-cli                    | ^8.0.0           | múltiples                                                              |

### Apps del monorepo

| Paquete               | Propósito                                             | Entry point                          | Scripts principales                                                                   |
| --------------------- | ----------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------- |
| `@pila/web`           | Aplicación web Next.js 15 (UI, Server Actions, REST)  | `apps/web/src/app/` (App Router)     | `dev`, `build`, `start`, `lint`, `typecheck`, `test`                                  |
| `@pila/cli`           | Herramienta de administración y crons (15 comandos)   | `apps/cli/src/index.ts` (bin `pila`) | `start` (dispatcher Commander), `typecheck`                                           |
| `@pila/bot-colpatria` | Bot Playwright para portal ARL Colpatria/Sura         | `apps/bot-colpatria/src/index.ts`    | `start`, `test-login`, `procesar`, `typecheck`, `test`                                |
| `@pila/db`            | Schema Prisma + cliente compartido + 63 migraciones   | `packages/db/src/index.ts`           | `prisma:generate`, `prisma:migrate`, `prisma:deploy`, `prisma:studio`, `prisma:reset` |
| `@pila/core`          | Tipos y utils compartidos (`Result<T,E>`, constantes) | `packages/core/src/index.ts`         | `typecheck`                                                                           |

Scripts disponibles desde la **raíz** (`package.json`):

| Script                        | Acción                        |
| ----------------------------- | ----------------------------- |
| `pnpm dev`                    | `pnpm --filter @pila/web dev` |
| `pnpm build`                  | `pnpm -r build`               |
| `pnpm lint`                   | `pnpm -r lint`                |
| `pnpm typecheck`              | `pnpm -r typecheck`           |
| `pnpm db:generate`            | `prisma generate`             |
| `pnpm db:migrate`             | `prisma migrate dev`          |
| `pnpm db:studio`              | `prisma studio`               |
| `pnpm cli -- <cmd>`           | dispatcher CLI                |
| `pnpm bot-colpatria -- <cmd>` | dispatcher bot                |
| `pnpm test`                   | `pnpm -r --if-present test`   |
| `pnpm prepare`                | `husky` (instala hooks)       |
