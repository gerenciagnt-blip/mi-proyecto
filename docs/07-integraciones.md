# 9 · Integraciones externas

> Esta sección documenta cada sistema de terceros con el que el monorepo
> habla, qué módulo lo encapsula, qué variables de entorno controla, qué
> shape tiene la conversación y qué pasa cuando falla. Si vas a agregar
> una integración nueva, cópiate la plantilla de PagoSimple (config →
> http → auth → módulos por dominio) — funciona bien y es testable.

## 9.0 · Mapa de integraciones

| #   | Integración              | Tipo                  | Módulo principal                                                                | Activa en prod |
| --- | ------------------------ | --------------------- | ------------------------------------------------------------------------------- | -------------- |
| 1   | PagoSimple (PILA)        | API REST + JSON       | `apps/web/src/lib/pagosimple/`                                                  | Sí             |
| 2   | Colpatria ARL            | Scraping Playwright   | `apps/web/src/lib/colpatria/` + `apps/bot-colpatria/`                           | Sí             |
| 3   | BDUA / RUAF              | API (vía PagoSimple)  | `apps/web/src/lib/pagosimple/bdua-ruaf.ts`                                      | Sí             |
| 4   | Sentry                   | SDK observability     | `apps/web/src/lib/sentry.ts` · `apps/bot-colpatria/src/lib/sentry.ts`           | Opcional       |
| 5   | Filesystem (UPLOADS_DIR) | Almacenamiento local  | `apps/bot-colpatria/src/lib/storage.ts` + cualquier `route.ts` que escriba PDFs | Sí             |
| 6   | Amazon S3 (backups)      | API · `aws s3 cp`     | `.github/workflows/db-backup.yml`                                               | Sí (semanal)   |
| 7   | Neon Postgres            | Driver pg             | `packages/db` (Prisma)                                                          | Sí             |
| 8   | NextAuth v5              | Library               | `apps/web/src/auth.ts` + `auth.config.ts`                                       | Sí             |
| 9   | Google APIs (legacy)     | OAuth/Service Account | (no implementado, solo vars en `.env.example`)                                  | No             |
| 10  | Resend (correo)          | API REST              | (pendiente Sprint 4.4)                                                          | No             |
| 11  | Twilio (SMS/WSP)         | API REST              | (pendiente Sprint 4.5)                                                          | No             |

---

## 9.1 · PagoSimple (operador PILA)

### Resumen

PagoSimple es el **operador externo** que valida y cobra las planillas
PILA contra el SGSS. Toda la información que enviamos viaja por su API
REST documentada en el Swagger oficial:

- Base URL prod: `https://api.pagosimple.com` (configurable vía
  `PAGOSIMPLE_BASE_URL`).
- Swagger oficial:
  `https://reportes.pagosimple.com.co/developer-docs/apis/pila/`.

La integración cubre seis APIs lógicas del operador:

1. **Sesión** — login y emisión de `auth_token`.
2. **Aportantes** — sync empresa/cotizante como contributor.
3. **Planillas** — validación + obtención de URL de pago.
4. **Marcación asistida** (parcial — endpoints expuestos en `types.ts`,
   no usados en flujo actual).
5. **Comprobantes** (`vouchers`) — descarga de PDF oficial.
6. **BDUA/RUAF** — consulta de afiliación actual (ver § 9.3).

### Módulos

```
apps/web/src/lib/pagosimple/
├── config.ts            ← lee + valida env, cachea PagosimpleConfig
├── client.ts            ← fetch wrapper, decoder de envelope, errores
├── auth.ts              ← cache de session_token + token + auth_token
├── aportantes.ts        ← sync Empresa / Cotizante → contributor
├── planillas.ts         ← validate / total / payment / inconsistencies / correction
├── comprobantes.ts      ← descarga PDF oficial post-pago
├── bdua-ruaf.ts         ← consulta BDUA/RUAF (§ 9.3)
├── bdua-cache.ts        ← cache in-memory 30min TTL
├── validar-subtipos.ts  ← genera 3 planos sintéticos para validar subtipos cotizante
└── types.ts             ← tipos de las 6 APIs Swagger
```

### Variables de entorno

| Variable                          | Obligatorio | Uso                                                 |
| --------------------------------- | ----------- | --------------------------------------------------- |
| `PAGOSIMPLE_BASE_URL`             | Sí          | Endpoint raíz, sin slash final (se normaliza)       |
| `PAGOSIMPLE_MASTER_NIT`           | Sí          | NIT del aportante MAESTRO operadora                 |
| `PAGOSIMPLE_MASTER_COMPANY`       | Sí          | Razón social maestro                                |
| `PAGOSIMPLE_MASTER_SECRET_KEY`    | Sí          | Secret entregado por PagoSimple al onboarding       |
| `PAGOSIMPLE_MASTER_DOCUMENT_TYPE` | Sí          | Default `CC`                                        |
| `PAGOSIMPLE_MASTER_DOCUMENT`      | Sí          | Cédula del usuario maestro que firma con secret_key |
| `PAGOSIMPLE_MASTER_PASSWORD`      | Sí          | Password del usuario maestro                        |
| `PAGOSIMPLE_TOKEN_TTL_MIN`        | No          | TTL del cache de tokens en minutos (default `15`)   |

`config.ts` lee estas variables **una sola vez al primer uso**, cachea
el objeto `PagosimpleConfig` y, si falta cualquiera de las
obligatorias, retorna `null` en `getPagosimpleConfig()` y emite un
warning. La función `requirePagosimpleConfig()` lanza si no está
configurado — la usan los módulos que sí necesitan estar conectados.
`isPagosimpleEnabled()` se usa en la UI para mostrar/ocultar botones.

### Flujo de autenticación (3 tokens)

PagoSimple usa autenticación en **dos pasos** que producen tres tokens
distintos:

```
┌─────────────────┐     POST /auth/login
│ Master creds    │ ───────────────────────────▶ { session_token, token }
│ (env)           │
└─────────────────┘

┌─────────────────────────┐      GET /auth/{id}/{tipo}/{doc}
│ id = PagosimpleContribID │ ───────────────────────────────▶ { auth_token }
│  (o NIT del maestro)     │      headers: nit + token + session_token
└─────────────────────────┘
```

| Token           | Origen                        | Headers donde viaja                     | Vida                           |
| --------------- | ----------------------------- | --------------------------------------- | ------------------------------ |
| `session_token` | `POST /auth/login`            | `session_token`                         | TTL del cache (15 min default) |
| `token`         | `POST /auth/login`            | `token`                                 | Misma sesión                   |
| `auth_token`    | `GET /auth/{id}/{tipo}/{doc}` | `auth_token` (además de los anteriores) | 15 min                         |

Diseño del cache (`auth.ts`):

- `sessionCache: { current: CachedSession | null }` — un único maestro
  por proceso.
- `authCache: Map<string, CachedAuth>` — clave `"{id}|{tipo}|{doc}"`.
- Margen de 60 s antes de expirar para refrescar proactivamente.
- `withAuthRetry(fn)` reintenta una vez si el primer intento devuelve
  401 (invalida cache + login + reintento). No hace bucles infinitos.

> **Caveat serverless**: cada lambda mantiene su propio cache en
> memoria. Si PagoSimple limita sesiones concurrentes en producción
> habría que mover a Redis (Upstash). Por ahora con `regions: ['iad1']`
> y warm starts en Vercel rinde bien.

### Headers

| Helper                 | Headers que produce               | Cuándo usarlo                                                |
| ---------------------- | --------------------------------- | ------------------------------------------------------------ |
| `getBaseAuthHeaders()` | `nit` + `token` + `session_token` | Endpoints "abiertos" (BDUA/RUAF, vouchers/report-types)      |
| `getFullAuthHeaders()` | base + `auth_token`               | Mayoría de endpoints (planillas, contributor PUT, marcación) |

### Particularidad: planillas son **2 pasos, no 3**

Cuando se diseñó el módulo se asumieron 3 pasos (upload → validate →
guardar). El Swagger oficial **solo expone 2**:

1. `POST /payroll/validate` (multipart) — sube el archivo plano
   _y_ lo valida en una sola llamada. Devuelve `validation_status`
   junto con `payroll_validations[]` que incluye `payroll_code` y
   `payroll_number`.
2. `GET /payroll/payment/{payroll_number}` — devuelve la URL PSE.

`payroll_number > 0` ⇒ planilla guardada oficialmente con cero errores.
`payroll_number = 0` ⇒ hay errores; se conserva sólo el `payroll_code`
para consultar inconsistencias.

#### `POST /payroll/validate` — request

| Campo (multipart)  | Tipo    | Notas                                                                                                                      |
| ------------------ | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| `payroll_file`     | binario | Plano TXT codificado UTF-8, MIME `text/plain`                                                                              |
| `execution_params` | string  | JSON serializado: `{ is_UGPP, is_novelties_planillaN, file_type }`. `file_type` siempre va `"I"` por contrato del Swagger. |

#### `POST /payroll/validate` — response (envelope estándar)

```json
{
  "success": true,
  "code": 200,
  "data": {
    "validation_status": "OK | ERROR | WARNING",
    "payroll_validations": [
      {
        "payroll_code": 12345,
        "payroll_number": 67890,
        "number_errors_company": 0,
        "number_errors_contributor": 0,
        "number_warnings": 0,
        "detail_errors_company": [],
        "detail_errors_contributor": [],
        "detail_warnings": []
      }
    ]
  },
  "message": "...",
  "description": "..."
}
```

#### Auto-corrección

Tras el validate, `planillas.ts` examina los errores devueltos: si
**todos** tienen `autocorrect: "Si"`, dispara `POST /payroll/correction`
con el `payroll_code`. Si la corrección produce un nuevo
`payroll_number > 0`, se persiste la planilla con estado interno `OK`.
Si hay aunque sea un error con `autocorrect: "No"`, no se intenta
corregir y la planilla queda en tab **Validación** para que el operador
arregle a mano.

#### Persistencia tras validate

```
planilla.pagosimpleNumero            ← payroll_number || payroll_code
planilla.pagosimpleEstadoValidacion  ← "OK" | "ERROR"
planilla.pagosimpleSyncedAt          ← now()
planilla.pagosimpleTotalSgss         ← sum(total_without_arrear)
planilla.pagosimpleTotalMora         ← sum(arrear_value)
planilla.pagosimpleTotalPagar        ← total_to_pay
planilla.pagosimplePaymentUrl        ← URL PSE (cacheada hasta force=true)
```

### Sync de aportantes (`aportantes.ts`)

| Endpoint                 | Cuándo                              |
| ------------------------ | ----------------------------------- |
| `POST /contributor/pyme` | Crear empresa (Sistema PILA = PYME) |
| `PUT /contributor/pyme`  | Actualizar empresa                  |
| `POST /contributor`      | Crear cotizante independiente       |
| `PUT /contributor`       | Actualizar cotizante independiente  |

El campo `pagosimpleContributorId` (Empresa / Cotizante) almacena el ID
interno generado por el operador. Sin él no se puede emitir
`auth_token` para esa entidad — el bot del form lo solicita
manualmente al admin si está vacío y le indica dónde encontrarlo.

### Shape estándar de respuesta

Todas las APIs envuelven la respuesta:

```ts
type PagosimpleResponse<T> = {
  success: boolean;
  code: number;
  data: T | null;
  message: string;
  description: string;
};
```

`client.ts` desencapsula automáticamente: si `success === false` lanza
`PagosimpleError` con `code` + `message` + `description`. Si la
respuesta no es JSON, o no tiene la shape esperada (típico cuando el
backend responde con error 4xx + body Spring Boot), también lanza con
`code = HTTP status` y un preview del raw body.

### CLI de soporte

| Comando                                | Para qué                                                                    |
| -------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm cli pagosimple:ping`             | Login maestro y reporta `session_token` (verifica creds)                    |
| `pnpm cli pagosimple:test-all`         | Recorre cada API (auth, contributor GET, planillas total, etc.)             |
| `pnpm cli pagosimple:sync-planillas`   | Re-consulta el estado de validación de planillas en CONSOLIDADO             |
| `pnpm cli pagosimple:validar-subtipos` | Envía planos sintéticos para detectar subtipos PILA permitidos al cotizante |

### Workflow programado

`.github/workflows/pagosimple-sync.yml` corre `*/15 13-22 * * 1-5`
(cada 15 min, 8:00–17:00 Bogotá lunes–viernes). Ejecuta
`pnpm cli pagosimple:sync-planillas` para mantener actualizado el
estado de validación contra el operador. También se puede disparar
manualmente con el flag `include_pagadas` para forzar revalidación
de planillas pagadas.

### Manejo de errores

| Capa                    | Estrategia                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| Token expirado (401)    | `withAuthRetry`: invalida cache + login + reintento (una sola vez)                                   |
| Respuesta no-JSON       | `PagosimpleError(httpStatus, ..., previewRaw)` — visible en logs y en UI con copy útil               |
| `success: false`        | `PagosimpleError(json.code, json.message, json.description)`                                         |
| Errores autocorregibles | `POST /payroll/correction` automático (si todos `autocorrect: "Si"`)                                 |
| UI                      | Tab **Validación** muestra errores no corregibles; tab **Guardado** muestra planillas listas a pagar |
| Observability           | `logger.error(...)` en cada falla; `>= error` se reenvía a Sentry vía hook (ver § 9.4)               |

---

## 9.2 · Colpatria ARL (operador ARL)

### Resumen

Colpatria **no expone API**. La integración es scraping con Playwright
contra el portal AXA Colpatria ARP/Empresas. La documentación completa
del bot está en [`docs/05-bot-colpatria.md`](./05-bot-colpatria.md);
acá solo se referencian los entry points para que el lector se ubique
y los detalles que afectan al sistema integrado.

### Variables de entorno

| Variable             | Obligatorio        | Uso                                                                                       |
| -------------------- | ------------------ | ----------------------------------------------------------------------------------------- |
| `COLPATRIA_BASE_URL` | Sí (si bot activo) | URL del portal Colpatria que el bot abre                                                  |
| `COLPATRIA_HEADLESS` | No                 | `true` (default) en GH Actions, `false` para debug local con UI                           |
| `COLPATRIA_ENC_KEY`  | Sí (si bot activo) | Clave AES-256-GCM (hex 64 chars) para cifrar credenciales y cookies de sesión por empresa |

### Componentes

| Archivo                                         | Rol                                                                |
| ----------------------------------------------- | ------------------------------------------------------------------ |
| `apps/web/src/lib/colpatria/disparos.ts`        | Decide si una afiliación dispara `ColpatriaAfiliacionJob`          |
| `apps/web/src/lib/colpatria/config-resolver.ts` | Mapea afiliación PILA → campos del form AXA (defaults + por nivel) |
| `apps/web/src/lib/colpatria/crypto.ts`          | AES-256-GCM con scrypt KDF para credenciales y cookies             |
| `apps/bot-colpatria/`                           | Worker Node.js + Playwright que consume jobs                       |

### Flujo simplificado

```
Afiliación CREAR/REACTIVAR  →  disparos.ts evalúa guards
                                  ├─ modalidad === DEPENDIENTE
                                  ├─ estado === ACTIVA
                                  ├─ empresa.colpatriaActivo === true
                                  └─ ARL match (códigos: ARL-007, COLPATRIA, ARL-COLPATRIA o nombre incluye "COLPATRIA")
                                          │
                                          ▼
                            ColpatriaAfiliacionJob { status: PENDING, payload: snapshot }
                                          │
                                          ▼  (workflow GH Actions: bot-colpatria-procesar.yml)
                                Worker Playwright procesa → SUCCESS / FAILED / RETRYABLE
```

### Disparo (`disparos.ts`) — payload schema v1

El payload completo se persiste **al disparo** para que el bot no haga
joins durante la ejecución. Si la afiliación cambia entre que se crea
el job y se procesa, el bot sigue con el snapshot original (consistency
audit-friendly). Campos relevantes:

```ts
type ColpatriaPayload = {
  schemaVersion: 1;
  evento: 'CREAR' | 'REACTIVAR';
  afiliacion: {
    id, estado, modalidad, nivelRiesgo, salario, fechaIngreso, cargo,
    epsCodigoAxa, afpCodigoAxa,
    cotizante: { ...campos demográficos... },
    empresa:  { id, nit, nombre },
  };
};
```

> Para el detalle de form-fill, watchdog, retry, retención de PDFs,
> alertas a operador y debug, ver `docs/05-bot-colpatria.md`.

---

## 9.3 · BDUA / RUAF (Ministerio de Salud + SGSS)

### Resumen

| Sigla | Significado                                 | Para qué se consulta            |
| ----- | ------------------------------------------- | ------------------------------- |
| BDUA  | Base de Datos Única de Afiliados (MinSalud) | EPS actual del afiliado         |
| RUAF  | Registro Único de Afiliados al SGSS         | AFP actual + flag de pensionado |

La consulta se hace **vía PagoSimple** (no contra MinSalud directo) en
`POST /bdua-ruaf/data`. Es el caso especial: este endpoint usa solo
headers `nit + token` (NO requiere `session_token` ni `auth_token`).

### Módulo

`apps/web/src/lib/pagosimple/bdua-ruaf.ts`:

- `consultarBduaRuaf(documentType, document)` → `BduaRuafItem[]`.
- `consultarCotizanteBduaRuaf(documentType, document)` → entrada con
  `affiliate_type === 'C'` (filtra beneficiarios `'B'`).

### Request / Response shape

```ts
// Request
type BduaRuafRequest = {
  document_type: string;
  document: string;
};

// Response data (array, puede venir vacío)
type BduaRuafItem = {
  affiliate_type: 'C' | 'B';
  document_type: string;
  document: string;
  first_last_name?: string;
  second_last_name?: string;
  first_name?: string;
  second_name?: string;
  bdua_eps_code?: string;
  bdua_administrator_name?: string;
  bdua_affiliate_date?: string; // YYYYMMDD
  ruaf_afp_code?: string;
  ruaf_administrator_name?: string;
  ruaf_affiliate_date?: string;
  is_pensionary?: 'SI' | 'NO';
};
```

### Cache (`bdua-cache.ts`)

| Parámetro | Valor                                           |
| --------- | ----------------------------------------------- |
| TTL       | 30 minutos (commit `ed5fd18`)                   |
| Capacidad | `MAX_ENTRIES = 5000` (LRU naive)                |
| Clave     | `"{TIPO_DOC.toUpperCase()}:{NUMERO}"`           |
| Bypass    | `forceFresh=true` desde botón "Refrescar" en UI |

Permite que la consulta repetida (recargas, doble-check del jefe,
varios aliados sobre la misma persona) no pegue al operador. Cache hit
≈ 1 ms vs 2–3 s en cold call. Funciona por instancia (memoria local
del proceso); para multi-instancia hace falta migrar a Redis.

### Trigger

Botón **"Consultar BDUA/RUAF"** en el formulario de Nueva Afiliación
(`apps/web/src/app/.../afiliaciones/nueva/...`). Autocompleta:

- Nombres y apellidos del cotizante.
- Código de EPS actual.
- Código de AFP actual + flag pensionado.

Si el cotizante no aparece en BDUA/RUAF, la consulta retorna lista
vacía y el formulario muestra un aviso — el usuario puede continuar
manualmente.

### Errores

| Caso                      | UX                                                                                |
| ------------------------- | --------------------------------------------------------------------------------- |
| Lista vacía (no afiliado) | Aviso "No encontrado en BDUA/RUAF" — usuario llena a mano                         |
| 401 / token expirado      | Refresh automático vía `withAuthRetry` (transparente)                             |
| Timeout / red caída       | `PagosimpleError(0, 'Error de red ...')`, mensaje al usuario, sin caché degradado |

---

## 9.4 · Sentry (observability)

### Resumen

SDK de Sentry para captura de errores y mensajes. **Opcional**: si
`SENTRY_DSN` está vacío, el wrapper queda no-op y no se carga el SDK.

### Variables de entorno

| Variable                 | Lado    | Uso                                                                   |
| ------------------------ | ------- | --------------------------------------------------------------------- |
| `SENTRY_DSN`             | Server  | Server actions, route handlers, bot, CLI, instrumentation             |
| `NEXT_PUBLIC_SENTRY_DSN` | Browser | Bundle del cliente — sin el prefijo `NEXT_PUBLIC_`, Next no la expone |

> **Importante**: hay que setear las **dos** con el mismo DSN para
> capturar tanto errores server-side como client-side. La regla está
> documentada en `.env.example`.

### Módulos

- `apps/web/src/lib/sentry.ts` — wrapper Next.js (`@sentry/nextjs`).
- `apps/bot-colpatria/src/lib/sentry.ts` — wrapper Node puro (`@sentry/node`).

Ambos siguen el mismo patrón:

```ts
import { captureError, captureMessage, setUser, isSentryEnabled } from '@/lib/sentry';

try { ... }
catch (err) {
  captureError(err, { scope: 'pagosimple', planillaId });
  throw err; // sigue propagando
}
```

### Inicialización lazy

`ensureInit()`:

1. Si ya inicializó (`state === 'enabled'`) → reutiliza.
2. Si ya falló o `SENTRY_DSN` está vacío (`state === 'disabled'`) →
   no-op silencioso.
3. Si `unloaded` → `import('@sentry/nextjs')` dinámico, configura
   `tracesSampleRate = 0.1` en prod / `1` en dev, `sendDefaultPii =
false`, marca `enabled`.

Sample rates conservadores para no inflar la cuota; ajustar según
volumen real.

### Hook desde pino

`apps/web/src/lib/logger.ts` engancha el reenvío a Sentry para logs de
nivel ≥ `error` (50). Diseño:

- El log incluye un `Error` en `obj.err` → se captura como exception.
- Sin `err` → captura como mensaje string.
- Resto del objeto loggeado pasa como `extra` (con redacción de keys
  sensibles: `*.password`, `*.token`, `*.secret_key`, `*.AUTH_SECRET`,
  `*.DATABASE_URL`, etc.).
- **Fire-and-forget**: nunca bloquea el flujo del logger.

Esto significa que **no hace falta llamar `captureError` manual** si
ya estás logueando con pino — el wire-up es automático.

---

## 9.5 · Storage (filesystem local + S3 backup)

### Filesystem local (`UPLOADS_DIR`)

| Variable      | Tipo                               | Notas                                                                                                     |
| ------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `UPLOADS_DIR` | Path absoluto compartido web ↔ bot | En local Windows: `"C:/Users/<user>/mi-proyecto/uploads"`. En DigitalOcean: ruta del volumen persistente. |

> **Sin path absoluto**, el web y el bot resuelven `./uploads` relativo
> a su propio cwd y los archivos divergen. Hay validación al iniciar el
> worker del bot que aborta si detecta un path efímero (typical en GH
> Actions: `/tmp/`, `${RUNNER_TEMP}`, `/home/runner/work/...`).

### Estructura de directorios

```
<UPLOADS_DIR>/
├── colpatria/
│   └── <empresaId>/
│       └── <YYYY-MM>/
│           └── <jobId>-<hash12>.pdf      ← comprobantes AXA del bot
├── incapacidades/
│   └── ...                                ← soportes de incapacidades
├── soporte-af/
│   └── ...                                ← soporte afiliación (Sprint 9 jurídico)
└── cartera/                               ← PDFs de extractos manuales
```

El path del PDF queda persistido como `pdfPath` en
`ColpatriaAfiliacionJob`. El endpoint
`apps/web/src/app/api/colpatria/jobs/[id]/pdf/route.ts` lo sirve con
`requireAdmin()` o validación de pertenencia a la empresa.

### S3 — solo backups de BD

S3 **no se usa para uploads** (estos van al filesystem). Se usa
exclusivamente para el backup semanal de la base, ejecutado por
`.github/workflows/db-backup.yml` (`0 5 * * 0`, domingos 5 AM UTC).

| Variable                | Uso                                             |
| ----------------------- | ----------------------------------------------- |
| `AWS_ACCESS_KEY_ID`     | Cred IAM con permiso `s3:PutObject` al bucket   |
| `AWS_SECRET_ACCESS_KEY` | Idem                                            |
| `AWS_REGION`            | Default `us-east-1`                             |
| `BACKUP_S3_BUCKET`      | Nombre del bucket destino                       |
| `BACKUP_S3_PREFIX`      | Carpeta dentro del bucket (default `pila-prod`) |

Pipeline:

1. `pg_dump -Fc -Z 9 --no-owner --no-privileges` → archivo `.dump`.
2. `pg_restore --list <file>` para sanidad (mínimo 10 objetos).
3. `aws s3 cp ... --storage-class STANDARD_IA --metadata stamp=...`.
4. Opcional: `verify_restore=true` levanta un Postgres efímero con
   Docker y restaura para validar integridad.

Política sugerida (no automatizada en código): lifecycle rule del
bucket que pase a Glacier a los 30 días y borre a los 365.

---

## 9.6 · Neon Postgres (BD)

### Conexión

| Variable       | Valor recomendado                                                               |
| -------------- | ------------------------------------------------------------------------------- |
| `DATABASE_URL` | `postgresql://user:pass@host-pooler.us-east-1.aws.neon.tech/db?sslmode=require` |

> En **producción** conviene apuntar al **endpoint con pooling**
> (PgBouncer): el host termina en `-pooler.us-east-1.aws.neon.tech`.
> Sin pooling, las lambdas de Vercel saturan rápidamente el límite de
> conexiones concurrentes del proyecto Neon.

### Particularidades

- Postgres 16 — el workflow de backup instala explícitamente
  `postgresql-client-16` para compatibilidad con `pg_dump`.
- Las migraciones usan `pnpm db:migrate` (Prisma).
- `prisma.$queryRaw\`SELECT 1\``es el ping de salud que usa`apps/web/src/lib/sistema/status.ts` para la status page de admin.
- Al hacer dumps en GH Actions, se aplica strip de comillas accidentales
  en el secret: `DB="${DATABASE_URL%\"}"; DB="${DB#\"}"`.

### Riesgo conocido

- Shadow URL mal usado borra datos dev (regla `feedback_no_db_reset`
  en memoria). Las migraciones deben referenciar siempre la BD shadow
  separada, **nunca** la BD principal.

---

## 9.7 · NextAuth v5

### Resumen

Auth.js v5 (NextAuth v5) con un único provider: `Credentials` (email +
password con bcrypt). Estrategia de sesión **JWT** (sin tabla de
sesiones en la BD). Adapter Prisma se usa para `User` y
`AuditLog` de intentos fallidos/exitosos.

### Variables de entorno

| Variable      | Notas                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------- |
| `AUTH_SECRET` | Min 32 bytes base64. **Rotarla = forzar re-login a TODOS los usuarios** (invalida JWTs vivos)   |
| `AUTH_URL`    | URL pública del sitio (`http://localhost:3000` en dev, HTTPS en prod). Necesaria para callbacks |

Generar `AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### Configuración (`auth.config.ts` + `auth.ts`)

| Setting             | Valor                               |
| ------------------- | ----------------------------------- |
| `session.strategy`  | `'jwt'`                             |
| `session.maxAge`    | 15 min (`SESSION_MAX_AGE_SECONDS`)  |
| `session.updateAge` | 60 s — refresca con cada navegación |
| `jwt.maxAge`        | 15 min                              |
| `pages.signIn`      | `/login`                            |

Si el usuario está inactivo > 15 min, el middleware detecta sesión
vencida y redirige a login.

### Flujo de login

1. `Credentials.authorize` valida con Zod (`LoginSchema`).
2. `auth-rate-limit.ts` chequea bloqueo previo (más de N intentos
   fallidos en ventana). Si está bloqueado → `null` aunque las creds
   sean correctas, evita bypass por brute-force.
3. `prisma.user.findUnique` por email lowercased.
4. `bcrypt.compare(password, user.passwordHash)`.
5. Login exitoso → `registrarIntentoExitoso` (limpia contadores y
   escribe `AuditLog`).

### Claims propagados al JWT/session

```ts
token = {
  id,
  role,
  sucursalId,
  rolCustomId, // Sprint Jurídico — para chequear permisos finos sin BD
};
```

`rolCustomId` viaja en el JWT para evitar consultas a BD en cada
request al chequear permisos como "descargar documento confidencial".

### Adapter

El monorepo usa Prisma para `User`/`Account` lookup pero **no** un
adapter NextAuth tradicional para `Session` — el `strategy: 'jwt'`
hace que las sesiones vivan solo en la cookie firmada, sin tabla.

---

## 9.8 · Legacy y pendientes

### Google APIs (Sheets, Drive, Gmail) — **declarado, no activo**

Variables existen en `.env.example`:

```
GOOGLE_SERVICE_ACCOUNT_EMAIL=""
GOOGLE_SERVICE_ACCOUNT_KEY=""
DRIVE_ROOT_FOLDER_ID=""
DRIVE_SOPORTES_FOLDER_ID=""
```

No hay cliente implementado en `apps/web/src/lib/`. Son herencia de
las apps Apps Script previas (las 3 apps que originaron el monorepo).
Si se reactiva el flujo Drive, **hay que escribir un cliente nuevo** —
las credenciales por sí solas no hacen nada en el código actual.

### Resend (correo) — **pendiente Sprint 4.4**

No hay módulo. Cuando se implemente (notificaciones, alertas a
admin/operadora), el cliente debería:

- Vivir en `apps/web/src/lib/email/`.
- Leer `RESEND_API_KEY` desde env.
- Patrón fail-open: si el envío falla, registrar en bitácora pero no
  romper la operación principal (igual que `notificaciones.ts`
  in-app).

### Twilio (SMS / WhatsApp) — **pendiente Sprint 4.5**

Mismo estado: variables aún no agregadas a `.env.example`. Al
implementar, considerar el costo unitario de SMS+WhatsApp para
restringir a casos de alta criticidad (ej. recuperación de password,
alerta de cobro vencido > 30 días).

---

## 9.9 · Patrones transversales de manejo de errores

### Reintento con backoff

| Capa                   | Estrategia                                                                                          |
| ---------------------- | --------------------------------------------------------------------------------------------------- |
| `pagosimple/auth.ts`   | `withAuthRetry`: una sola vez ante 401, sin sleep                                                   |
| `bot-colpatria` worker | Estados `RETRYABLE` con reintentos limitados (configurable por job, ver `docs/05-bot-colpatria.md`) |
| `db-backup.yml`        | No reintenta — falla loud y notifica via summary del Action                                         |
| `pagosimple-sync.yml`  | No reintenta dentro del job; el cron `*/15` produce reintento natural cada 15 min                   |

### Captura a Sentry

Reglas operativas:

- Logs nivel ≥ `error` se reenvían **automáticamente** a Sentry vía
  `forwardToSentry` en `logger.ts` (no hace falta llamar `captureError`
  manual).
- Re-lanzar siempre el error tras capturarlo (el catch debe terminar
  con `throw err`) salvo que la operación sea best-effort declarada
  (notificaciones in-app, post-validate fetch de totales, etc.).
- El bot Colpatria captura también jobs en estado `FAILED` con
  `captureMessage('job FAILED', 'warning', { jobId, empresaId })` para
  visibilidad sin ruido de exceptions.

### UI fallback

| Falla                           | Qué ve el usuario                                                                            |
| ------------------------------- | -------------------------------------------------------------------------------------------- |
| PagoSimple caído                | Mensaje "PagoSimple no responde. Reintenta en unos minutos." + botón Revalidar               |
| BDUA/RUAF timeout               | Form sigue editable; aviso "No se pudo consultar BDUA/RUAF — completa los datos manualmente" |
| Cotizante no en BDUA/RUAF       | Aviso informativo, sin error                                                                 |
| Bot Colpatria FAILED (no retry) | Bandeja Soporte muestra el job con el último error; botón Reencolar manualmente              |
| Sentry no configurado           | Silencioso (no degrada UX)                                                                   |

---

## 9.10 · Tabla resumen

| Integración        | Tipo                 | Variables (env)                                                                                    | Fallback si falla                                                            |
| ------------------ | -------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| PagoSimple         | API REST + JSON      | `PAGOSIMPLE_BASE_URL`, `PAGOSIMPLE_MASTER_*`, `PAGOSIMPLE_TOKEN_TTL_MIN`                           | UI muestra error, planilla queda en `Validación`, retry manual + cron `*/15` |
| Colpatria ARL      | Scraping Playwright  | `COLPATRIA_BASE_URL`, `COLPATRIA_HEADLESS`, `COLPATRIA_ENC_KEY`                                    | Job → `RETRYABLE` o `FAILED`; bandeja Soporte muestra                        |
| BDUA / RUAF        | API (vía PagoSimple) | (mismas que PagoSimple)                                                                            | Cache 30 min; si miss + falla → form editable manual                         |
| Sentry             | SDK observability    | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`                                                             | No-op silencioso                                                             |
| Filesystem uploads | Local FS             | `UPLOADS_DIR`                                                                                      | Bot aborta al iniciar si path es efímero; web log + 404                      |
| S3 (DB backup)     | API · `aws s3 cp`    | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `BACKUP_S3_BUCKET`, `BACKUP_S3_PREFIX` | Workflow falla loud, no degrada app                                          |
| Neon Postgres      | Driver pg (Prisma)   | `DATABASE_URL` (con `-pooler` en prod)                                                             | App cae (sin BD no hay sistema); status page muestra error                   |
| NextAuth v5        | Library              | `AUTH_SECRET`, `AUTH_URL`                                                                          | Login imposible, redirige a `/login`                                         |
| Google APIs        | OAuth/SA (legacy)    | `GOOGLE_SERVICE_ACCOUNT_*`, `DRIVE_*_FOLDER_ID`                                                    | No usado — sin impacto                                                       |
| Resend             | (pendiente)          | (Sprint 4.4)                                                                                       | —                                                                            |
| Twilio             | (pendiente)          | (Sprint 4.5)                                                                                       | —                                                                            |

---

## Cómo agregar una integración nueva

1. Crear `apps/web/src/lib/<servicio>/`:
   - `config.ts` — lee env, valida, cachea `Config`. Patrón
     `getConfig()` (warning si falta) + `requireConfig()` (lanza) +
     `isEnabled()`.
   - `client.ts` — fetch wrapper con timeout, decode de envelope,
     errores tipados.
   - `auth.ts` — si hay tokens, cachear con TTL + invalidación + retry.
   - Un módulo por dominio funcional (`aportantes.ts`,
     `planillas.ts`, etc.).
   - `types.ts` — tipos del request/response del proveedor.
2. Documentar en `.env.example` con bloque comentado (obligatoriedad,
   formato, link a la fuente del valor).
3. Si va a correr en cron: workflow `.github/workflows/<servicio>-*.yml`
   con secrets validation.
4. Si va a correr desde la admin: comando CLI en
   `apps/cli/src/commands/<servicio>-*.ts`.
5. Agregar fila en la tabla de § 9.10 y sección dedicada en este
   documento.
6. Captura a Sentry vía pino `logger.error(...)` — no hace falta
   captura manual.
