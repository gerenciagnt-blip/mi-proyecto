# 11. DevOps / Infraestructura

Esta sección documenta cómo se construye, ejecuta, monitorea y mantiene el Sistema PILA: setup local, variables de entorno, integración continua, jobs programados (cron) en GitHub Actions, deploy, logging, monitoreo, backups, retención de datos y pruebas de carga. Toda la información está derivada del repositorio (`.github/workflows/*.yml`, `package.json`, `.env.example`, `.husky/pre-commit`, `apps/web/src/lib/logger.ts`, `tests/load/`); no se inventa nada.

---

## 1. Cómo correr localmente

### Pre-requisitos

- **Node.js ≥ 20.0.0** (declarado en `package.json` → `engines.node`).
- **pnpm 10.33.0** exacto (declarado en `package.json` → `packageManager`). Activar con Corepack:
  ```bash
  corepack enable
  corepack prepare pnpm@10.33.0 --activate
  ```
- **PostgreSQL 16+**. En desarrollo el equipo usa una BD dev en **Neon** (cloud, gratis). Localmente también vale un Postgres instalado nativo o vía Docker, pero el monorepo no provee `docker-compose` para esto.
- **Git Bash** en Windows (entorno estándar del proyecto). En macOS/Linux, cualquier shell estándar funciona.
- (Opcional) Para el bot Colpatria: `playwright install --with-deps chromium` se ejecuta dentro del workflow; en local solo si vas a correr el bot.

### Setup paso a paso

1. **Clonar el repositorio**

   ```bash
   git clone https://github.com/gerenciagnt-blip/mi-proyecto.git
   cd mi-proyecto
   ```

2. **Copiar `.env.example` a `.env`** y completar valores. Como mínimo:
   - `DATABASE_URL` — apuntando a Neon dev o Postgres local.
   - `AUTH_SECRET` — generar con `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
   - `AUTH_URL=http://localhost:3000`.
   - El resto puede quedar vacío en dev (PagoSimple, Sentry, S3, Colpatria son opcionales en local).

3. **Instalar dependencias**

   ```bash
   pnpm install
   ```

   Esto también prepara los hooks de Husky (`prepare` script).

4. **Aplicar migraciones de Prisma**

   ```bash
   pnpm db:migrate
   ```

5. **Sembrar datos de prueba** (idempotente, seguro de correr varias veces):

   ```bash
   pnpm cli seed:test-data
   ```

   Crea sucursal `TEST-01`, usuario `aliado-test@pila.local` (password `Aliado123!`) con rol ALIADO_OWNER. El comando aborta automáticamente si detecta más de 50 usuarios en BD (presunción de "esto ya es prod").

6. **Levantar la web**
   ```bash
   pnpm dev
   ```

URL local: **http://localhost:3000**

### Comandos auxiliares útiles

- `pnpm db:studio` — abre Prisma Studio para ver/editar registros.
- `pnpm cli -- ping` — verifica que la CLI conecta a la BD.
- `pnpm typecheck` / `pnpm lint` — validaciones del workspace.
- `pnpm build` — build de producción (ejecuta `pnpm -r build` en todos los paquetes).

---

## 2. Variables de entorno

Todas las variables están declaradas en `.env.example`. La columna **Req. dev / prod** indica obligatoriedad: las marcadas `[DEV]` son opcionales en local; las `[PROD]` son obligatorias para deploy real.

| Categoría  | Nombre                            | Tipo   | Req. dev | Req. prod      | Default                      | Notas                                                                                                                                                                                          |
| ---------- | --------------------------------- | ------ | -------- | -------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BD         | `DATABASE_URL`                    | secret | sí       | sí             | —                            | Postgres con `sslmode=require`. En prod usar URL con pooling (`-pooler.us-east-1.aws.neon.tech`).                                                                                              |
| Auth       | `AUTH_SECRET`                     | secret | sí       | sí             | —                            | Mín. 32 bytes base64. Generar con `crypto.randomBytes(32).toString('base64')`.                                                                                                                 |
| Auth       | `AUTH_URL`                        | string | sí       | sí             | `http://localhost:3000`      | URL pública del sitio (con `https` en prod).                                                                                                                                                   |
| PagoSimple | `PAGOSIMPLE_BASE_URL`             | string | no       | sí (si se usa) | `https://api.pagosimple.com` | Si vacío, módulo deshabilitado.                                                                                                                                                                |
| PagoSimple | `PAGOSIMPLE_MASTER_NIT`           | string | no       | sí (si se usa) | —                            | Aportante MASTER.                                                                                                                                                                              |
| PagoSimple | `PAGOSIMPLE_MASTER_COMPANY`       | string | no       | sí (si se usa) | —                            |                                                                                                                                                                                                |
| PagoSimple | `PAGOSIMPLE_MASTER_SECRET_KEY`    | secret | no       | sí (si se usa) | —                            |                                                                                                                                                                                                |
| PagoSimple | `PAGOSIMPLE_MASTER_DOCUMENT_TYPE` | string | no       | sí (si se usa) | `CC`                         |                                                                                                                                                                                                |
| PagoSimple | `PAGOSIMPLE_MASTER_DOCUMENT`      | string | no       | sí (si se usa) | —                            |                                                                                                                                                                                                |
| PagoSimple | `PAGOSIMPLE_MASTER_PASSWORD`      | secret | no       | sí (si se usa) | —                            |                                                                                                                                                                                                |
| PagoSimple | `PAGOSIMPLE_TOKEN_TTL_MIN`        | number | no       | no             | `15`                         | TTL en minutos del token cacheado.                                                                                                                                                             |
| Storage    | `UPLOADS_DIR`                     | string | sí       | sí             | `./uploads`                  | DEBE ser ABSOLUTO si web y bot corren con cwd distintos; sin path absoluto cada app resuelve `./uploads` en su propio cwd y los archivos divergen.                                             |
| Logging    | `LOG_LEVEL`                       | string | no       | no             | `info`                       | Niveles: `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent`. Recomendado `debug` en dev, `info`/`warn` en prod.                                                                      |
| Sentry     | `SENTRY_DSN`                      | secret | no       | recomendado    | —                            | Si vacío, SDK queda en modo no-op. Server-side.                                                                                                                                                |
| Sentry     | `NEXT_PUBLIC_SENTRY_DSN`          | secret | no       | recomendado    | —                            | Mismo DSN; expuesto al bundle del cliente para errores client-side. **Hay que setear las dos**.                                                                                                |
| Entorno    | `NODE_ENV`                        | string | no       | sí             | `development`                | Controla `pino-pretty` vs JSON crudo.                                                                                                                                                          |
| S3 backup  | `AWS_ACCESS_KEY_ID`               | secret | no       | sí (si se usa) | —                            | Solo lo usa el workflow `db-backup.yml`.                                                                                                                                                       |
| S3 backup  | `AWS_SECRET_ACCESS_KEY`           | secret | no       | sí (si se usa) | —                            |                                                                                                                                                                                                |
| S3 backup  | `AWS_REGION`                      | string | no       | no             | `us-east-1`                  |                                                                                                                                                                                                |
| S3 backup  | `BACKUP_S3_BUCKET`                | string | no       | sí (si se usa) | —                            |                                                                                                                                                                                                |
| S3 backup  | `BACKUP_S3_PREFIX`                | string | no       | no             | `pila-prod`                  | Prefijo dentro del bucket.                                                                                                                                                                     |
| Legacy     | `GOOGLE_SERVICE_ACCOUNT_EMAIL`    | string | no       | no             | —                            | No usado activamente.                                                                                                                                                                          |
| Legacy     | `GOOGLE_SERVICE_ACCOUNT_KEY`      | secret | no       | no             | —                            |                                                                                                                                                                                                |
| Legacy     | `DRIVE_ROOT_FOLDER_ID`            | string | no       | no             | —                            |                                                                                                                                                                                                |
| Legacy     | `DRIVE_SOPORTES_FOLDER_ID`        | string | no       | no             | —                            |                                                                                                                                                                                                |
| Colpatria  | `COLPATRIA_BASE_URL`              | string | no       | sí (si se usa) | —                            | Portal AXA Colpatria ARL.                                                                                                                                                                      |
| Colpatria  | `COLPATRIA_HEADLESS`              | string | no       | no             | `true`                       | `true` = sin UI (servidor); `false` = debug con UI.                                                                                                                                            |
| Colpatria  | `COLPATRIA_ENC_KEY`               | secret | no       | sí (si se usa) | —                            | 32 bytes hex. AES-256-GCM con scrypt KDF para encriptar credenciales y cookies de sesión. **Si se rota, los registros previos no se descifran** y hay que reingresar credenciales por empresa. |

---

## 3. Docker

**Sistema deployado nativo, sin Docker actualmente.**

No existen `Dockerfile` ni `docker-compose.yml` en el repositorio. La única referencia a Docker es en `db-backup.yml`, que levanta un contenedor `postgres:16` efímero opcional para verificar la integridad del dump (paso `Test restore`).

---

## 4. CI / Pre-commit

### Husky pre-commit (`.husky/pre-commit`)

Antes de cada commit (saltable con `git commit --no-verify` para emergencias):

1. `pnpm typecheck` — recorre el workspace recursivo (`pnpm -r typecheck`). Tarda ~15s y atrapa errores cruzados entre paquetes.
2. `pnpm exec lint-staged` — corre **prettier --write** sobre los archivos staged según el patrón declarado en `package.json`:
   - `apps/web/**/*.{ts,tsx}`
   - `apps/cli/**/*.ts`
   - `apps/bot-colpatria/**/*.ts`
   - `packages/**/*.{ts,tsx}`
   - `*.{json,md,yml,yaml}`

Si cualquier paso falla, el commit se aborta con mensaje claro.

### GitHub Actions CI (`.github/workflows/ci.yml`)

- **Trigger**: `push` y `pull_request` a `master`.
- **Concurrency**: cancela runs anteriores si llega un push nuevo al mismo branch.
- **Runner**: `ubuntu-latest`, `timeout-minutes: 15`.
- **Env dummy** (no toca BD real): `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL` con valores ficticios — el build de Next solo invoca `prisma generate`, no queries.
- **Pasos**:
  1. Checkout
  2. Setup pnpm 10.33.0
  3. Setup Node 20 (con cache pnpm)
  4. `pnpm install --frozen-lockfile`
  5. `pnpm db:generate` (genera el Prisma Client)
  6. `pnpm typecheck`
  7. `pnpm lint`
  8. `pnpm build`
  9. `pnpm test` (corre `vitest` en los paquetes que lo tengan, marcado con `--if-present`)

---

## 5. GitHub Actions — cron jobs y mantenimiento

Los workflows comparten una validación común en cada job: el secret `DATABASE_URL` se valida con un regex `^"?postgres(ql)?://` y se hace strip de comillas/espacios accidentales antes de exportarlo a Prisma. Esto previene un error críptico de Prisma cuando un secret se guarda mal en GitHub.

### `ci.yml` — Continuous Integration

- **Trigger**: `push` o `pull_request` a `master`.
- **Hace**: typecheck, lint, build, tests del workspace completo.
- **Env**: dummy values (no toca BD real).
- **On-failure**: bloquea el merge del PR. Hay que arreglar y re-pushear.

### `bot-colpatria-procesar.yml` — Worker Colpatria ARL

- **Cron**: `0/15 13-22 * * 1-5` → cada 15 min, 13:00–22:45 UTC, lunes a viernes (= 8:00 AM–5:45 PM Colombia, días hábiles).
- **Workflow_dispatch**: input `limite` (default `20`).
- **Hace**: procesa los jobs `PENDING` de afiliación/novedad en el portal AXA Colpatria via Playwright. Sprint 8.3 — actualmente el step real está placeholder hasta que el worker se implemente; existe el esqueleto del cron para no perder horario.
- **Env**: `DATABASE_URL`, `UPLOADS_DIR`, `COLPATRIA_BASE_URL`, `COLPATRIA_HEADLESS=true`, `COLPATRIA_ENC_KEY`.
- **Timeout**: 25 min (margen para 20 jobs × ~1 min cada uno).
- **On-failure**: el job queda en estado `RETRYABLE` o `FAILED` en BD según la clasificación del error; el watchdog (commit `0e84a2d`) detecta zombies y recicla los retryables. Sentry recibe el error si `SENTRY_DSN` está configurado.

### `bot-colpatria-login-auto.yml` — Login proactivo 7 AM

- **Cron**: `0 12 * * 1-6` → 12:00 UTC = 7:00 AM Colombia, lunes a sábado.
- **Hace**: hace login fresco contra el portal AXA para todas las empresas con Colpatria activo y deja el `storageState` cifrado en la tabla `ColpatriaSesion`. La primera tanda del worker (que arranca a las 8 AM) ya encuentra sesión cacheada y no paga el costo del login.
- **Env**: `DATABASE_URL`, `COLPATRIA_BASE_URL`, `COLPATRIA_HEADLESS=true`, `COLPATRIA_ENC_KEY`.
- **Setup adicional**: `playwright install --with-deps chromium`.
- **Timeout**: 30 min (login fresco × N empresas).
- **On-failure**: el job queda fallido; las empresas sin sesión cacheada hacen login al inicio de su primer trabajo del día (modo lento, pero funcional).

### `bot-colpatria-logout-auto.yml` — Cierre 9 PM

- **Cron**: `0 2 * * 0,2,3,4,5,6` → 02:00 UTC del día siguiente = 9:00 PM Colombia, lunes a sábado (en cron POSIX queda como días `0` para sábado→domingo y `2-6` para los siguientes).
- **Hace**: borra el `storageState` cifrado de `ColpatriaSesion`. No navega al portal — solo `DELETE` en BD. El siguiente login auto (7 AM) hace login fresco, lo que prueba diariamente que las credenciales siguen vigentes y detecta tempranamente cuentas bloqueadas o passwords cambiados.
- **Env**: solo `DATABASE_URL`.
- **Timeout**: 5 min.
- **On-failure**: las sesiones quedan vivas; al día siguiente el bot las usa hasta que expiren naturalmente.

### `bot-colpatria-limpiar-pdfs.yml` — Retención PDFs

- **Cron**: `0 8 * * *` → 08:00 UTC = 3:00 AM Colombia, todos los días.
- **Workflow_dispatch**: inputs `dias` (default `3`) y `dryRun` (default `false`).
- **Hace**: borra del filesystem (`UPLOADS_DIR`) los PDFs de comprobante con más de 3 días. Conserva la metadata en BD (`pdfPath` permanece, se setea `pdfArchivedAt`).
- **Env**: `DATABASE_URL`, `UPLOADS_DIR`.
- **Timeout**: 10 min.
- **On-failure**: los PDFs viejos quedan; se reintenta al día siguiente. No hay impacto operacional inmediato.

### `cobros-daily.yml` — Bloqueo de morosos

- **Cron**: `0 5 * * *` → 05:00 UTC = 00:00 Colombia, todos los días.
- **Hace**: a partir del día 16 del mes, marca como `VENCIDO` los cobros con `fechaLimite < now` y bloquea la sucursal correspondiente (`bloqueadaPorMora=true`).
- **Env**: `DATABASE_URL`.
- **Timeout**: 10 min.
- **On-failure**: las sucursales no se bloquean ese día; el siguiente run del cron las atrapa.

### `cobros-mensual.yml` — Generación mensual

- **Cron**: `0 5 1 * *` → día 1 de cada mes a las 05:00 UTC = medianoche Colombia.
- **Workflow_dispatch**: input `periodo` (formato `YYYY-MM`, default = mes anterior).
- **Hace**: genera los cobros del **mes anterior** para cada sucursal con tarifas configuradas.
- **Env**: `DATABASE_URL`.
- **Timeout**: 15 min.
- **On-failure**: relanzar manual desde la UI de Actions con el input `periodo` correcto.

### `db-backup.yml` — Backup BD a S3

- **Cron**: `0 5 * * 0` → domingos a las 05:00 UTC = medianoche Bogotá del domingo.
- **Workflow_dispatch**: input `verify_restore` (true/false) para correr un test extra de restore en un Postgres efímero (Docker `postgres:16`).
- **Hace**: `pg_dump -Fc -Z 9 --no-owner --no-privileges` (formato custom, comprimido), valida con `pg_restore --list` que el dump tiene ≥10 objetos, sube a `s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/<YYYY-MM-DD_HHMMSS>.dump` con storage class `STANDARD_IA`. Genera summary en GitHub Actions con el comando de restore manual.
- **Setup**: instala `postgresql-client-16` desde el repositorio APT oficial de PostgreSQL.
- **Env**: `DATABASE_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `BACKUP_S3_BUCKET`, `BACKUP_S3_PREFIX`.
- **Timeout**: 30 min.
- **Retención sugerida**: lifecycle rule en S3 a Glacier después de 30 días, eliminar después de 365.
- **On-failure**: si falta cualquier secret, falla con mensaje listando los faltantes; si el dump tiene <10 objetos, aborta upload (sospecha de corrupción).

### `pagosimple-sync.yml` — Sync planillas con PagoSimple

- **Cron**: `*/15 13-22 * * 1-5` → cada 15 min, 13:00–22:45 UTC, lunes a viernes (= 8:00 AM–5:45 PM Bogotá).
- **Workflow_dispatch**: input `include_pagadas` (true/false) para incluir también planillas en estado PAGADA.
- **Hace**: re-consulta el estado de validación de las planillas en CONSOLIDADO contra PagoSimple. Mantiene actualizada la columna de errores del operador sin que el usuario tenga que apretar "Revalidar" manualmente.
- **Env**: todas las `PAGOSIMPLE_MASTER_*` + `DATABASE_URL`.
- **Timeout**: 8 min.
- **On-failure**: el siguiente cron (15 min después) reintenta automáticamente.

### `retention-daily.yml` — Retención por bucket (v2.0)

- **Cron**: `0 4 * * *` → 04:00 UTC = 23:00 Colombia del día anterior, todos los días.
- **Workflow_dispatch**: input `dry` (true/false) para solo contar sin borrar; input `module` para acotar a un bucket (`incapacidades` / `soporte-af` / `reporte-at` / `all`).
- **Hace**: aplica retención **por bucket** (regla declarativa en `apps/cli/src/commands/retention-run.ts`):

  | Bucket                                            |    Días | Notas                                                         |
  | ------------------------------------------------- | ------: | ------------------------------------------------------------- |
  | `incapacidad_documentos` con `confidencial=false` |     120 | Documentos médicos / administrativos del flujo regular.       |
  | `incapacidad_documentos` con `confidencial=true`  | **180** | **v2.0** — extendido por procesos legales (DPP, tutelas).     |
  | `soporte_afiliacion_documentos`                   |     120 | Sin cambios.                                                  |
  | `reporte_at_documentos`                           |  **30** | **v2.0** — soporte operativo de corta duración (FURAT, etc.). |

  Para cada vencido: borra el archivo físico bajo `UPLOADS_DIR`, marca `eliminado=true` + `eliminadoEn` en BD. El registro queda como evidencia (hash, mime, size, nombre).

- **Env**: `DATABASE_URL`, `UPLOADS_DIR`.
- **Timeout**: 10 min.
- **On-failure**: la limpieza se aplaza un día. No hay impacto regulatorio mientras no se acumulen muchos días seguidos. El comando se puede correr manualmente con `pnpm cli retention:run [--dry] [--module ...]`.

### `auditoria-purge-monthly.yml` — Purga bitácora

- **Cron**: `0 5 1 * *` → día 1 de cada mes a las 05:00 UTC = 00:00 Colombia.
- **Workflow_dispatch**: inputs `dry` (true/false) y `meses` (default `12`).
- **Hace**: borra registros de la tabla de auditoría/bitácora con más de N meses (default 12). Día 1 está elegido a propósito porque el cierre del mes anterior ya pasó y la BD está más tranquila.
- **Env**: `DATABASE_URL`.
- **Timeout**: 10 min.
- **On-failure**: relanzar manual; sin urgencia.

### `uploads-cleanup-weekly.yml` — Limpieza huérfanos

- **Cron**: `0 6 * * 0` → domingos 06:00 UTC = 01:00 AM Colombia. Corre **después** del job diario de retention para que los marcadores de BD ya estén actualizados.
- **Workflow_dispatch**: input `dry` (true/false).
- **Hace**: lista archivos en `UPLOADS_DIR` que ya no tienen referencia en BD y los borra del filesystem.
- **Env**: `DATABASE_URL`, `UPLOADS_DIR`.
- **Timeout**: 15 min.
- **On-failure**: los huérfanos quedan ocupando disco; al siguiente domingo se limpian.

---

## 6. Deploy

### Plataforma objetivo

**DigitalOcean** (App Platform o Droplet con volumen persistente), según el plan registrado: "GitHub Actions inicial → DigitalOcean".

### Estado actual

El sistema todavía está en fase de desarrollo / staging. **El deploy a producción está pendiente de definir** — no hay workflow `deploy.yml` ni configuración de App Platform en el repo. Cuando se materialice, los pasos típicos serán:

- Build remoto desde `master` (o tag) con `pnpm install --frozen-lockfile && pnpm build`.
- Aplicar migraciones con `pnpm db:migrate deploy` antes de cambiar el tráfico.
- Health check contra `/api/health` antes de promover el deploy.

### Storage en prod

`UPLOADS_DIR` debe apuntar a un **volumen persistente** montado en la VM/contenedor. Si la web y el bot corren en procesos distintos, ambos deben tener montado el mismo volumen en la misma ruta absoluta — sin path absoluto cada app resuelve `./uploads` relativo a su propio `cwd` y los archivos se "pierden" entre procesos. El bot Colpatria valida explícitamente `UPLOADS_DIR` al inicio (commit `784e880`).

### Base de datos en prod

**Neon** con conexión pooler (URL terminada en `-pooler.us-east-1.aws.neon.tech`). Usar el pooler evita exhaustión del pool de conexiones cuando GitHub Actions dispara muchos workflows simultáneos.

### Secrets en GitHub

Todos los secrets de producción se configuran en **Settings → Secrets and variables → Actions**:

- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_URL`
- `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`
- `UPLOADS_DIR` (ruta del volumen persistente)
- `PAGOSIMPLE_*` (todas)
- `COLPATRIA_*` (`COLPATRIA_BASE_URL`, `COLPATRIA_ENC_KEY`)
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `BACKUP_S3_BUCKET`, `BACKUP_S3_PREFIX`

---

## 7. Logs

Implementación: `apps/web/src/lib/logger.ts` (basado en `pino`).

### Formato

- **Producción**: JSON crudo a stdout. Lo ingestan directamente Vercel/AWS/DO Logs y visores (Datadog, Logtail).
- **Desarrollo**: `pino-pretty` colorizado, con `translateTime: 'HH:MM:ss'`.

### Estructura del registro

```json
{
  "level": 30,
  "service": "@pila/web",
  "scope": "pagosimple",
  "planillaId": "...",
  "msg": "planilla validada"
}
```

Se usan logs hijos por scope:

```ts
const log = logger.child({ scope: 'pagosimple' });
log.info({ planillaId, status }, 'planilla validada');
log.error({ err, planillaId }, 'fallo al subir TXT');
```

### Niveles

`trace` (10), `debug` (20), `info` (30), `warn` (40), `error` (50), `fatal` (60), `silent`. Configurables vía `LOG_LEVEL` (default `info`).

### Hook a Sentry

Cualquier log con nivel ≥ 50 (error/fatal) se reenvía automáticamente a Sentry vía `forwardToSentry()` en el logger. Si el objeto contiene una clave `err: Error`, se captura como exception; el resto de campos van como `extra`. Es **fire-and-forget**: no bloquea ni rompe si Sentry no responde.

### Redacción automática

El logger redacta en `[REDACTED]` cualquier path que matchee:

- `*.password`, `*.passwordHash`
- `*.secret_key`, `*.secretKey`
- `*.auth_token`, `*.token`, `*.session_token`
- `*.AUTH_SECRET`, `*.DATABASE_URL`
- `headers.authorization`, `headers.Authorization`, `headers.token`, `headers.session_token`

---

## 8. Monitoreo

### Sentry

- Source: `apps/web/src/lib/sentry.ts`, `apps/web/src/instrumentation.ts`, `apps/web/src/instrumentation-client.ts`, `apps/web/src/app/global-error.tsx`.
- Captura **errores + tracing**.
- Server-side via `SENTRY_DSN`; cliente vía `NEXT_PUBLIC_SENTRY_DSN`.
- Si las dos vars están vacías, el SDK queda en modo no-op (no hay overhead).

### Health endpoint

`GET /api/health` (`apps/web/src/app/api/health/route.ts`):

- **200 + `{status:"ok"}`** si la BD responde a `SELECT 1`.
- **503 + `{status:"degraded"}`** si la BD no responde.
- Devuelve `uptimeSec`, `service`, `checks.db.latencyMs`, `totalMs`.
- `Cache-Control: no-store` — siempre fresh.
- No requiere autenticación; apto para Kubernetes liveness, Uptime Kuma, etc.

### Tracking de jobs (CronRun, Sprint 7)

El modelo `CronRun` en `packages/db/prisma/schema.prisma` (migración `20260426163407_sprint7_cron_run`) registra cada ejecución de cron: comando, inicio/fin, status (`OK`/`FAILED`), duración, output. Permite auditar histórico de jobs y detectar saltos (cron que dejó de correr).

---

## 9. Backup y retención

| Job                              | Cron                        | Hace                                                                                               |
| -------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------- |
| `db-backup.yml`                  | Domingos 05:00 UTC          | `pg_dump` completo → S3 (`STANDARD_IA`). Retención sugerida: lifecycle a Glacier 30d, delete 365d. |
| `retention-daily.yml`            | Diario 04:00 UTC            | Borra incapacidades + soporte-af con >120d (retención normativa).                                  |
| `bot-colpatria-limpiar-pdfs.yml` | Diario 08:00 UTC            | Borra PDFs Colpatria con >3d del filesystem (mantiene metadata BD).                                |
| `auditoria-purge-monthly.yml`    | Día 1 de cada mes 05:00 UTC | Purga bitácora con >12 meses.                                                                      |
| `uploads-cleanup-weekly.yml`     | Domingos 06:00 UTC          | Borra archivos huérfanos en `UPLOADS_DIR`.                                                         |

### Restore manual desde S3

```bash
aws s3 cp s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/<YYYY-MM-DD>.dump ./pila.dump
pg_restore --no-owner --no-privileges -d $DATABASE_URL ./pila.dump
```

El workflow `db-backup.yml` genera este snippet en el summary de cada run.

---

## 10. Performance / load testing

Suite ubicada en `tests/load/` (commit `1bbc3ee`). Documentación completa: `tests/load/README.md`.

### Archivos

| Archivo                   | Propósito                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `health.k6.js`            | Sanity baseline — 5 VUs × 30s contra `/api/health`.                                                                    |
| `login-stress.k6.js`      | Stress NextAuth — escala 100 → 500 → 1000 VUs. Atención: bcrypt cost 12 ≈ 200ms/hash satura CPU a 1000 VUs (esperado). |
| `afiliaciones-list.k6.js` | Endurance 50 VUs × 5 min sobre páginas con queries pesadas. Detecta memory leaks, pool exhaustion, query plan flips.   |
| `lighthouse.config.js`    | Web Vitals: Performance ≥70, Accessibility ≥85, LCP <3.5s, TBT <500ms, CLS <0.1.                                       |

### Auditoría de BD

```bash
pnpm cli analyze:db --by total --limit 25     # con pg_stat_statements
pnpm cli analyze:db --tables-only             # tablas + índices, sin extension
pnpm cli analyze:db --reset                   # resetea estadísticas (superuser)
```

### Reglas

1. **Nunca correr contra producción sin permiso explícito** — el tráfico es real (logins, lecturas pesadas) y puede disparar rate-limits o consumir cuota de PagoSimple.
2. **Staging primero**.
3. **Avisar antes de un stress run** — Neon cobra por cómputo.

### Métricas objetivo (sugeridas)

| Métrica                  | Target | Critical |
| ------------------------ | ------ | -------- |
| Login p95                | <1s    | <3s      |
| Listado afiliaciones p95 | <2s    | <5s      |
| Health check p95         | <200ms | <1s      |
| Error rate global        | <1%    | <5%      |
| LCP (frontend)           | <2.5s  | <4s      |
| CLS                      | <0.1   | <0.25    |

---

## Comandos útiles

| Comando                       | Propósito                                                                                                                                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                    | Levanta `@pila/web` en `http://localhost:3000`.                                                                                                                                                                                                 |
| `pnpm build`                  | Build de producción (`pnpm -r build`).                                                                                                                                                                                                          |
| `pnpm typecheck`              | TypeScript check del workspace completo.                                                                                                                                                                                                        |
| `pnpm lint`                   | Lint del workspace completo.                                                                                                                                                                                                                    |
| `pnpm test`                   | Tests con `--if-present` por paquete.                                                                                                                                                                                                           |
| `pnpm db:generate`            | Genera el Prisma Client.                                                                                                                                                                                                                        |
| `pnpm db:migrate`             | Aplica migraciones Prisma (dev).                                                                                                                                                                                                                |
| `pnpm db:studio`              | Abre Prisma Studio en el navegador.                                                                                                                                                                                                             |
| `pnpm cli -- <cmd>`           | Ejecuta la CLI (`@pila/cli`). Comandos: `seed:test-data`, `retention:run`, `auditoria:purge`, `cobros:generar`, `cobros:bloquear-morosos`, `pagosimple:sync-planillas`, `uploads:cleanup`, `analyze:db`, `admin:create`, `reset-password`, etc. |
| `pnpm bot-colpatria -- <cmd>` | Ejecuta el bot Colpatria (`procesar`, `login-auto`, `logout-auto`, `limpiar-pdfs`).                                                                                                                                                             |
| `git commit --no-verify`      | (Excepcional) Saltea el pre-commit de Husky.                                                                                                                                                                                                    |

---

## Diagrama del pipeline

```
┌────────────────┐
│  dev local     │
│  pnpm dev      │
│  pnpm cli ...  │
└────────┬───────┘
         │ git commit
         │  └─► husky pre-commit
         │      ├─► pnpm typecheck (workspace)
         │      └─► lint-staged → prettier --write
         ▼
┌────────────────┐
│  push / PR     │──► GitHub Actions: ci.yml
│  (master)      │     ├─► checkout + pnpm 10.33.0 + Node 20
│                │     ├─► install --frozen-lockfile
│                │     ├─► db:generate
│                │     ├─► typecheck · lint · build · test
│                │     └─► (cancela runs viejos del mismo branch)
└────────┬───────┘
         │ merge a master
         ▼
┌────────────────┐         ┌──────────────────────────────────┐
│  master verde  │         │  Cron jobs (.github/workflows/) │
│                │         │                                  │
│  Deploy        │         │  Diarios:                        │
│  → DigitalOcean│         │   · cobros-daily      05:00 UTC  │
│  (pendiente    │         │   · retention-daily   04:00 UTC  │
│   de definir)  │         │   · bot-limpiar-pdfs  08:00 UTC  │
│                │         │                                  │
│  BD: Neon      │         │  Semanales:                      │
│   (pooler URL) │         │   · db-backup         dom 05:00  │
│                │         │   · uploads-cleanup   dom 06:00  │
│  Storage:      │         │                                  │
│   volumen      │         │  Mensuales:                      │
│   persistente  │         │   · cobros-mensual    día 1 05:00│
│   = UPLOADS_DIR│         │   · auditoria-purge   día 1 05:00│
│                │         │                                  │
│  Logs: pino    │         │  Horario laboral COL (L-V):      │
│   JSON stdout  │         │   · pagosimple-sync   */15 min   │
│  Sentry:       │         │   · bot-procesar      */15 min   │
│   ≥ error      │         │                                  │
│  Health:       │         │  Lun-Sáb COL:                    │
│   /api/health  │         │   · bot-login-auto    07:00 COL  │
│                │         │   · bot-logout-auto   21:00 COL  │
└────────────────┘         └──────────────────────────────────┘
```

---

## Notas finales

- **Colombia es UTC-5 sin DST** — todos los crons calculan los offsets con esto. Ajustar si el ambiente cambia.
- **Job duplicado el día 1 a las 05:00 UTC**: `cobros-mensual.yml` y `auditoria-purge-monthly.yml` corren a la misma hora. No compiten por recursos (BDs y operaciones distintas), pero el equipo monitorea ambos summaries por separado.
- **Validación robusta de `DATABASE_URL`** en cada workflow — es el bug más común al copiar/pegar secrets en GitHub. El regex + strip de comillas/espacios ya atrapó incidentes en el pasado.
- **El watchdog del bot Colpatria** (commit `0e84a2d`) corre dentro del worker, no como cron separado: detecta zombies, recicla `RETRYABLE` y emite alertas. Documentado en la sección Bot del plan.
