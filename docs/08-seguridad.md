# 08 — Seguridad (CRÍTICO)

> Esta sección documenta los mecanismos de seguridad **realmente implementados** en el monorepo. Es deliberadamente honesta: cuando algo no está, lo decimos. La seguridad no se mejora ocultando los gaps.

---

## 1. Autenticación

### 1.1 Stack

- **NextAuth v5 (Auth.js)** con `Credentials` provider (email + password contra `User` en Postgres).
- **Hash de passwords:** `bcryptjs` con **cost factor 12** en todos los flujos productivos. Solo el seeder de test (`apps/cli/src/commands/seed-test-data.ts:54`) usa cost 10 porque crea decenas de usuarios y no apunta a producción.
- **Session strategy:** JWT (no DB sessions). Firmado con `AUTH_SECRET`.
- **Inactividad:** la sesión expira a los **15 minutos** desde la última actividad. Cualquier request renueva el TTL si pasaron más de 60 s desde la última renovación.

### 1.2 Source de referencia

| Componente                                                              | Archivo                               | Líneas relevantes |
| ----------------------------------------------------------------------- | ------------------------------------- | ----------------- |
| Provider Credentials + flujo `authorize`                                | `apps/web/src/auth.ts`                | 18–79             |
| Config edge-safe (JWT, callbacks, pages)                                | `apps/web/src/auth.config.ts`         | 8–42              |
| Helpers `requireAuth` / `requireRole` / `requireAdmin` / `requireStaff` | `apps/web/src/lib/auth-helpers.ts`    | 5–43              |
| Rate limit de login                                                     | `apps/web/src/lib/auth-rate-limit.ts` | 16–156            |
| Middleware (CSP + auth gate)                                            | `apps/web/src/middleware.ts`          | 66–106            |

### 1.3 Flujo de login en detalle (`auth.ts:22–76`)

1. Zod valida email y password (formato + longitud mínima).
2. Email se **normaliza a lowercase** antes de cualquier lookup. Esto evita duplicados por capitalización y previene timing oracles diferenciados por case.
3. **Antes** de leer al usuario: se consulta `getRateLimitStatus(emailNorm)`. Si está bloqueado, se registra el intento como `rate_limited` y se retorna `null`. Importante: aunque las credenciales sean correctas, si el email está bloqueado, el login falla. Esto evita que un atacante adivine la contraseña dentro de la ventana del bloqueo.
4. Lookup con `prisma.user.findUnique({ where: { email } })`.
5. Si el user no existe → `registrarIntentoFallido(email, 'unknown_email')`.
6. Si `user.active === false` → `registrarIntentoFallido(email, 'user_inactive')`. Un user desactivado no puede loguearse aunque tenga la contraseña correcta.
7. `bcrypt.compare(password, user.passwordHash)` — comparación constant-time provista por bcryptjs.
8. Si la comparación falla → `registrarIntentoFallido(email, 'password_wrong')`.
9. Si pasa → `registrarIntentoExitoso(...)`, que en una **transacción** Prisma:
   - Crea el `LoginAttempt` exitoso.
   - **Borra** todos los `LoginAttempt` fallidos previos del mismo email (resetea el contador).
   - Crea un `AuditLog` con `accion = 'LOGIN'`.
10. Devuelve un objeto user mínimo: `id, email, name, role, sucursalId, rolCustomId`. Estos campos viajan al JWT (ver `auth.config.ts:23–31`).

### 1.4 Rate limit (`auth-rate-limit.ts`)

- **Política:** `MAX_FAILED_ATTEMPTS = 3` intentos fallidos en `LOCK_WINDOW_MS = 10 minutos`.
- **Granularidad:** por **email normalizado** (no por IP — se documentará en gaps).
- **Persistencia:** tabla `LoginAttempt` (campo `success: boolean`, `motivo: string`, `ip`, `userAgent`).
- **Bloqueo:** la ventana de 10 minutos se calcula desde el **último** intento fallido (deslizante).
- **Eventos en `AuditLog`:** solo se registran como ruido bajo eventos significativos:
  - Login exitoso (`LOGIN`).
  - Bloqueo por rate limit (`LOGIN_BLOCKED`).
  - Los fallos rutinarios (`password_wrong`, `unknown_email`) **no** ensucian la bitácora — se quedan en `LoginAttempt`.
- **Mensaje al usuario:** `formatearMensajeBloqueo(desbloqueoEn)` devuelve un texto en español con minutos restantes — sin filtrar el motivo del bloqueo.

---

## 2. Autorización

### 2.1 Modelo de roles

Hay **dos capas** de autorización que se combinan:

**Capa 1 — `Role` enum (rol base):**

| Role           | Significado                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------- |
| `ADMIN`        | Plenipotenciario — siempre `true` en cualquier chequeo de permiso.                            |
| `SOPORTE`      | Staff de la plataforma. Por defecto puede lo mismo que ADMIN, pero ajustable vía `RolCustom`. |
| `ALIADO_OWNER` | Dueño de una sucursal. Ve solo su sucursal, opera dentro de ella.                             |
| `ALIADO_USER`  | Sub-usuario del aliado. Depende de un `ALIADO_OWNER`; permisos finos vía `RolCustom`.         |

**Capa 2 — `RolCustom` con matriz `Permiso(modulo × accion)`:**

- Cada user puede tener un `rolCustomId` opcional.
- `RolCustom` agrupa filas en `PermisoCustom(rolCustomId, modulo, accion)`.
- Las **acciones** son un set fijo: `VER`, `CREAR`, `EDITAR`, `ELIMINAR` (`apps/web/src/lib/permisos.ts:29`).
- Los **módulos** son strings planos definidos en `MODULOS` (`permisos.ts:49–160`) — agregar/quitar módulos no requiere migración.
- Los módulos declaran opcionalmente `rolesAplica` para limitar a qué `Role` base aplica la fila en la UI de edición de permisos. Ejemplo: `config.sistema` solo aplica a `ADMIN`.

### 2.2 Helpers de autorización

**Server-side (redirige si no cumple):**

```ts
// apps/web/src/lib/auth-helpers.ts
requireAuth()                    // exige sesión, redirige a /login si no hay
requireRole(...allowed: Role[])  // exige Role en allowed, redirige a /admin
requireAdmin()                   // alias requireRole('ADMIN')
requireStaff()                   // alias requireRole('ADMIN', 'SOPORTE')
esStaff(role): boolean           // chequeo puro sin redirect
```

**Permisos finos vía RolCustom (`apps/web/src/lib/permisos-runtime.ts:40–70`):**

```ts
tienePermiso(user, modulo, accion): Promise<boolean>
puedeDescargarDocConfidencial(user): Promise<boolean>  // atajo
```

Reglas:

- `ADMIN` siempre devuelve `true` sin tocar BD.
- Si el user no tiene `rolCustomId` → `false` para cualquier permiso fino. El `Role` base sigue funcionando.
- Si tiene `rolCustomId` → `findUnique` directo contra `permisos_custom` por la PK compuesta `(rolCustomId, modulo, accion)`. Hit de índice, lectura barata.

### 2.3 Sucursal scope (multi-tenant)

`apps/web/src/lib/sucursal-scope.ts` define el modelo:

```ts
type UserScope =
  | { tipo: 'STAFF'; role; userId } // ve cross-tenant
  | { tipo: 'SUCURSAL'; role; userId; sucursalId }; // confinado
```

Helpers que devuelven fragmentos `where` listos para spread en queries Prisma:

| Helper                                   | Caso de uso                                                      | STAFF retorna      | SUCURSAL retorna                                     |
| ---------------------------------------- | ---------------------------------------------------------------- | ------------------ | ---------------------------------------------------- |
| `scopeWhere()` (`:57`)                   | Recursos con `sucursalId` NOT NULL                               | `{}`               | `{ sucursalId }`                                     |
| `scopeWhereOpt()` (`:78`)                | Recursos con `sucursalId` NULLABLE (NULL = global)               | `{}`               | `{ OR: [{ sucursalId: null }, { sucursalId: mi }] }` |
| `scopeWhereViaCotizante()` (`:125`)      | Recursos scoped vía `cotizante.sucursalId`                       | `{}`               | `{ cotizante: { sucursalId } }`                      |
| `validarSucursalIdAsignable(id)` (`:97`) | Validar que un user puede asignar ese sucursalId al crear/editar | OK cualquier valor | Solo su propio `sucursalId`, nunca null              |

Esta capa garantiza que un `ALIADO_OWNER` **nunca** pueda ver ni mutar datos de otra sucursal mediante manipulación de IDs en server actions.

---

## 3. Manejo de contraseñas

### 3.1 Hashing

- **Algoritmo:** bcrypt (lib `bcryptjs`).
- **Cost factor:** 12 en todos los puntos productivos. Único punto con cost 10: el seeder de test (`seed-test-data.ts:54`).

Puntos donde se hashea:

| Sitio                                           | Línea                                            |
| ----------------------------------------------- | ------------------------------------------------ |
| CLI: crear admin                                | `apps/cli/src/commands/admin-create.ts:48`       |
| CLI: reset password                             | `apps/cli/src/commands/reset-password.ts:47`     |
| Server action: crear usuario                    | `apps/web/src/app/admin/usuarios/actions.ts:54`  |
| Server action: editar password                  | `apps/web/src/app/admin/usuarios/actions.ts:266` |
| Server action: cambio propio en `/admin/perfil` | `apps/web/src/app/admin/perfil/actions.ts:61`    |

### 3.2 Operaciones offline (CLI)

Para casos donde la app web no es viable (por ejemplo, recovery del primer admin, password olvidada del root):

- `pnpm cli -- admin-create` — pide email + nombre + contraseña (con validación Zod: email válido, password ≥ 8). Hashea con bcrypt cost 12 e inserta en BD con `role = 'ADMIN'`.
- `pnpm cli -- reset-password` — pide email, busca el user, pide nueva password (≥ 8), hashea con cost 12 y actualiza. Como side-effect **reactiva** al user si estaba inactivo (intencional: si un admin está reseteando la contraseña, asume que quiere que pueda entrar).

Ambos comandos usan `@inquirer/prompts` con `mask: '*'` para no exponer la contraseña en pantalla.

### 3.3 Política de contraseñas (mínima)

- Longitud mínima: **8 caracteres** (definida en Zod en cada flujo).
- **No hay** chequeos de complejidad (mayúsculas/símbolos/números) ni de listas negras de passwords comunes (rockyou, HIBP). Ver gaps.

### 3.4 Resistencia a brute-force

Cubierta por la combinación de bcrypt cost 12 (≈250 ms por intento en hardware típico) + rate limit por email (3/10 min). Un atacante con un wordlist de 10k passwords gastaría más de 2 días esperando ventanas de bloqueo.

---

## 4. Protección contra ataques

### 4.1 XSS

| Mecanismo                           | Estado                                                                                        | Source                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------- |
| Escape automático de React          | Activo (default del framework)                                                                | —                                       |
| `dangerouslySetInnerHTML`           | Auditado: solo en componentes de PDF / mailers donde el contenido viene de templates internos | —                                       |
| CSP con nonces                      | **Enforce** en producción (`NODE_ENV=production`), Report-Only en dev                         | `apps/web/src/middleware.ts:42–64, 103` |
| Header legacy `X-XSS-Protection: 0` | Activo                                                                                        | `apps/web/next.config.mjs:25`           |

**Detalle de la CSP (`middleware.ts:42–64`):**

Cada request genera un nonce de 16 bytes random (`crypto.getRandomValues`) y construye:

```
default-src 'self';
script-src 'self' 'nonce-XXX' 'strict-dynamic' 'unsafe-inline' https:;
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob: https:;
font-src 'self' data:;
connect-src 'self' https://<sentry> https://<pagosimple>;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
object-src 'none';
upgrade-insecure-requests;
```

Notas pragmáticas:

- `'strict-dynamic'`: cuando un script con nonce válido carga otros scripts dinámicamente (Next.js runtime), se les confía sin listarlos.
- `'unsafe-inline'` queda como **fallback** para browsers viejos. Los browsers modernos lo ignoran si hay nonce o `'strict-dynamic'`.
- `style-src 'unsafe-inline'`: necesario por Tailwind y librerías UI. Migrar a nonces es un sprint adicional.
- El nonce se inyecta en el header `x-nonce` del request, accesible vía `headers()` de Next desde server components.

**Por qué híbrido (enforce en prod / Report-Only en dev):** Next 15 inyecta scripts internos en dev (HMR, Fast Refresh) que pueden violar la política sin nonce — bloquearlos rompería la experiencia de desarrollo. En producción ya no hay HMR, así que enforce es seguro y bloquea XSS de verdad. La selección del header se hace en runtime según `process.env.NODE_ENV`.

### 4.2 CSRF

- **NextAuth maneja CSRF tokens** en sus endpoints (`/api/auth/*`). Esto cubre login y signOut.
- **Server Actions de Next 15** confían en el origen y en cookies `SameSite=Lax` (default de NextAuth). No hay protección CSRF explícita adicional sobre las server actions del proyecto.
- **No hay** doble-submit cookie ni token sincronizador en server actions custom. Ver gaps.

### 4.3 SQL Injection

- **Prisma** se usa exclusivamente para acceso a datos. Todas las queries son parameterized por el query engine.
- **No hay** `prisma.$queryRawUnsafe` en código productivo. Hay raw queries puntuales con `Prisma.sql` (template literal seguro) en migraciones y en algún reporte agregado, pero no aceptan input de usuario.
- DB schema migrations: solo via `prisma migrate` — nunca SQL ad-hoc desde la app.

### 4.4 Path traversal

Endpoint crítico: `apps/web/src/app/api/incapacidades/[id]/documentos/[docId]/route.ts:86–94`.

```ts
// Path sanitization.
if (doc.archivoPath.includes('..')) {
  return NextResponse.json({ error: 'Ruta inválida' }, { status: 400 });
}
const root = uploadsRoot();
const abs = resolve(join(root, doc.archivoPath));
if (!abs.startsWith(root)) {
  return NextResponse.json({ error: 'Ruta fuera del raíz' }, { status: 400 });
}
```

Doble guard:

1. Rechazo literal de `..` en el path.
2. Tras `resolve`, verificación de que la ruta absoluta arranca con el root de uploads. Esto cubre técnicas como path joining con prefijos, separadores codificados o symlinks.

Es el patrón recomendado y se replica en otros endpoints de descarga de archivos del módulo cartera/comprobantes.

### 4.5 Headers de seguridad

Aplicados globalmente a todas las rutas vía `apps/web/next.config.mjs:4–26`:

| Header                      | Valor                                                          | Línea | Razón                                                          |
| --------------------------- | -------------------------------------------------------------- | ----- | -------------------------------------------------------------- |
| `X-Content-Type-Options`    | `nosniff`                                                      | 7     | Bloquea MIME-confusion                                         |
| `X-Frame-Options`           | `DENY`                                                         | 10    | Anti-clickjacking                                              |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains`                          | 13–16 | Fuerza HTTPS por 1 año                                         |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                              | 18    | Reduce fuga de URLs privadas                                   |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=(), interest-cohort=()` | 21–22 | Deshabilita APIs no usadas                                     |
| `X-XSS-Protection`          | `0`                                                            | 25    | Desactiva el filtro legacy del browser (recomendación moderna) |

El header CSP (`Content-Security-Policy` en prod o `-Report-Only` en dev) se setea desde el middleware (no desde `next.config.mjs`) porque cambia por request (nonce dinámico).

---

## 5. Encriptación de datos

### 5.1 Credenciales y cookies del bot Colpatria

Source: `apps/bot-colpatria/src/lib/crypto.ts` (replicado en `apps/web/src/lib/colpatria/crypto.ts` por separación de runtime — ver nota interna en el archivo).

| Parámetro           | Valor                                                 |
| ------------------- | ----------------------------------------------------- |
| Algoritmo           | `aes-256-gcm` (autenticado, 256 bits)                 |
| KDF                 | `scryptSync(raw, SALT, 32)` — Node crypto nativo      |
| Salt KDF            | `'pila-colpatria-v1'` (fijo, versionado en el nombre) |
| IV                  | 12 bytes random por cada `encrypt()`                  |
| AuthTag             | 16 bytes (default GCM)                                |
| Formato serializado | `iv_hex:authTag_hex:cipher_hex`                       |
| Clave master        | `process.env.COLPATRIA_ENC_KEY` (≥ 16 chars)          |

Lo que se cifra:

- `Empresa.colpatriaUsuarioEnc` y `colpatriaPasswordEnc`: usuario y password del portal Colpatria de cada empresa cliente.
- `ColpatriaSesion.cookiesEnc`: cookies de la sesión activa (para reusar sin re-login).

### 5.2 DB en reposo

- **Neon Postgres** cifra en reposo a nivel de storage (TDE provisto por la plataforma). El proyecto no agrega cifrado a nivel de columna salvo lo descrito en 5.1.
- Backups: gestionados por Neon (point-in-time recovery dentro del plan).

### 5.3 TLS en tránsito

- Web: HTTPS forzado (HSTS + `upgrade-insecure-requests` en CSP).
- DB: `sslmode=require` en `DATABASE_URL` (Neon lo exige).
- Outbound a PagoSimple, Sentry: `https://` only.

---

## 6. Manejo de tokens y secretos

### 6.1 Almacenamiento

- `.env` en `.gitignore` — nunca commiteado. Hay un `.env.example` en el root con la lista de claves esperadas (sin valores).
- Variables críticas:

| Variable                 | Uso                           | Consecuencia de rotar                                                                                                                                                           |
| ------------------------ | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_SECRET`            | Firma JWT de NextAuth         | Invalidación inmediata de todas las sesiones activas (todos los users vuelven a `/login`).                                                                                      |
| `DATABASE_URL`           | Conexión Postgres (Neon)      | Outage hasta actualizar el deploy.                                                                                                                                              |
| `COLPATRIA_ENC_KEY`      | Master key de cifrado AES-GCM | **Pérdida total de acceso** a credenciales y cookies cifradas previamente. Toda empresa requeriría re-cargar usuario/password de Colpatria. No rotar sin un plan de re-cifrado. |
| `PAGOSIMPLE_*`           | Credenciales API PagoSimple   | Outage del módulo de planillas hasta actualizar.                                                                                                                                |
| `AWS_*` (si aplica)      | S3 / SES                      | Outage del componente afectado.                                                                                                                                                 |
| `NEXT_PUBLIC_SENTRY_DSN` | DSN público del SDK Sentry    | Bajo (no es secreto, va al cliente).                                                                                                                                            |

### 6.2 Redacción en logs (`apps/web/src/lib/logger.ts:70–85`)

El logger pino tiene `redact` configurado para reemplazar por `[REDACTED]` cualquier valor en propiedades cuyo path matchee:

```
*.password
*.passwordHash
*.secret_key
*.secretKey
*.auth_token
*.token
*.session_token
*.AUTH_SECRET
*.DATABASE_URL
headers.authorization
headers.Authorization
headers.token
headers.session_token
```

Esto cubre el caso típico: cuando un wrapper de fetch/axios loggea el objeto request completo, las cabeceras `Authorization` no se filtran. El comentario del archivo recuerda explícitamente: **NUNCA registrar credenciales** — el redact es defensa en profundidad, no la primera línea.

### 6.3 Hook a Sentry

Logs nivel `error` (≥50) y `fatal` (≥60) se reenvían automáticamente a Sentry vía `forwardToSentry()` (`logger.ts:39–62`) si `SENTRY_DSN` está seteado. Es fire-and-forget, no bloquea, y los redacts del logger se aplican antes — Sentry recibe el objeto ya saneado.

---

## 7. Auditoría

### 7.1 Tabla `AuditLog`

Tabla central que registra eventos relevantes del sistema. Esquema simplificado (consultar `packages/db/prisma/schema.prisma` para la versión exacta):

| Campo                                              | Notas                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| `id`, `createdAt`                                  | PK + timestamp                                                              |
| `entidad`, `entidadId`                             | "Cotizante", "Empresa", "Planilla", "Auth", etc.                            |
| `accion`                                           | `CREAR`, `EDITAR`, `ELIMINAR`, `TOGGLE`, `LOGIN`, `LOGIN_BLOCKED`, etc.     |
| `userId`, `userName`, `userRole`, `userSucursalId` | Snapshot del actor (no FK estricto — un user borrado no rompe la audit log) |
| `entidadSucursalId`                                | Sucursal a la que pertenece la entidad — habilita filtrado por scope        |
| `ip`                                               | Best-effort desde `x-forwarded-for` / `x-real-ip`                           |
| `descripcion`                                      | Resumen humano corto                                                        |
| `cambios`                                          | JSON con `{ antes, despues, campos[] }` (Diff)                              |

### 7.2 Wrappers (`apps/web/src/lib/auditoria/`)

- `registrarAuditoria(input)` (`registrar.ts:45–110`) — primitiva. Captura actor desde `auth()`, IP desde headers de Next, e inserta. **Nunca tira excepción**: si falla, hace `console.error` y se la traga (filosofía: una falla en auditoría no debe romper la operación principal).
- `calcularDiff(antes, despues, camposPermitidos?)` (`diff.ts:82–129`) — pure function. Devuelve `null` si no hay cambios. Soporta opcionalmente lista blanca de campos para evitar exponer fields sensibles tipo `passwordHash`. **Crítico**: cuando se audita un cambio en `User`, siempre pasar `camposPermitidos` explícitos para no incluir el hash.
- `withAudit(...)` (`with-audit.ts`) — wrapper de alto nivel para el patrón "lee antes, escribe, lee después, calcula diff".

### 7.3 Visibilidad por rol

- **STAFF (ADMIN, SOPORTE):** ve cross-tenant, todos los eventos.
- **ALIADO_OWNER:** ve solo eventos donde `entidadSucursalId === su sucursalId` (filtrado en la query, no a nivel de fila — la BD no tiene RLS).
- **ALIADO_USER:** no ve la bitácora — la información administrativa se reserva al ALIADO_OWNER.

---

## 8. Documentos confidenciales

Sprint Jurídico (commit `e952180`).

- Modelo `IncapacidadDocumento` tiene flag `confidencial: boolean`.
- En el listado de documentos de un caso, **todos los staff** ven que el documento existe (nombre, fecha, tamaño). Esto es deliberado: ocultarlo confunde al equipo legal.
- La **descarga** está restringida:
  - `ALIADO_*` (cualquier sucursal) → bloqueado siempre, incluso de sus propios documentos. Los documentos del flujo legal son confidenciales por diseño.
  - `ADMIN` → siempre puede.
  - `SOPORTE` → solo si su `RolCustom` tiene el permiso `soporte.juridico_confidencial` con acción `VER` (declarado en `permisos.ts:114–119`).

Implementación: `apps/web/src/app/api/incapacidades/[id]/documentos/[docId]/route.ts:62–84`. La UI consulta `puedeDescargarDocConfidencial(user)` para decidir si renderizar el botón habilitado o bloqueado, pero la verificación dura sucede en el endpoint (no se confía en la UI).

---

## 9. Buenas prácticas implementadas

- **Server Actions con `requireStaff()` / `requireAuth()` al inicio.** Patrón obligatorio: la primera línea de cualquier server action es el check de sesión + rol.
- **Validación Zod de TODOS los inputs** que cruzan la frontera browser→server. Ningún `parsed.success === false` se ignora; se devuelve un error tipado.
- **Transacciones Prisma (`$transaction`)** para operaciones que cruzan más de una tabla y que deben ser atómicas (ej. login exitoso = create LoginAttempt + delete fallidos + create AuditLog en una sola transacción, ver `auth-rate-limit.ts:119–143`).
- **TypeScript estricto + ESLint.** `pnpm typecheck` y `pnpm lint` corren en pre-commit.
- **Pre-commit hook** (typecheck + prettier) para evitar que código sin tipar o mal formateado entre al repo.
- **Email normalizado a lowercase** antes de cualquier lookup o write — evita duplicados y oracle por case.
- **Guards de path traversal** estandarizadas en endpoints de descarga de archivos.
- **Caché in-memory** (BDUA/RUAF, etc.) con TTL y sin cache de respuestas que dependen de identidad del usuario.

---

## 10. Gaps / áreas a mejorar

Honestidad operativa — esto **no** está cubierto hoy:

| Gap                                                                                            | Impacto                                                                  | Plan                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rate limit **por email**, no por IP                                                            | Atacante distribuido con muchos emails diferentes no cae bajo el bloqueo | Agregar segundo bucket por IP (sliding window)                                                                                                          |
| No hay **complexity check** en passwords                                                       | User puede usar `12345678`                                               | Validación adicional Zod (mayúscula/minúscula/dígito) y/o chequeo contra HIBP Pwned Passwords API                                                       |
| No hay **2FA / MFA**                                                                           | Un único factor (password)                                               | Agregar TOTP (RFC 6238) — una columna `totpSecret` cifrada y librería `otpauth`                                                                         |
| **CSRF en server actions** confía en SameSite Lax                                              | Ataques con SameSite-bypass conocidos pueden ser viables                 | Agregar token sincronizador en server actions críticas                                                                                                  |
| Tests de seguridad **no son sistemáticos**                                                     | Cobertura ad-hoc, no hay suite dedicada                                  | Suite con casos: bypass de scope (`SUCURSAL` intentando acceder a otra sucursal), path traversal con encodings, SQLi en filtros, XSS en campos de texto |
| No hay **rotación automática** de `AUTH_SECRET`                                                | Compromiso del secret = todas las sesiones siguen válidas hasta expirar  | Considerar lista de keys (current + previous) en NextAuth para rotación sin invalidar sesiones                                                          |
| No hay **cifrado por columna** para datos personales (cédulas, salarios) más allá de Colpatria | Dump de BD expone PII en claro (mitigado parcialmente por TDE de Neon)   | Evaluar `pgcrypto` para columnas críticas según LGPD/Habeas Data                                                                                        |
| **Logs de acceso a documentos confidenciales** no están separados                              | Un staff con permiso podría descargar masivamente sin alerta             | Auditar específicamente la acción `DOCUMENTO_DESCARGA` con flag `confidencial` y agregar alerta de volumen                                              |
| **CSP `style-src 'unsafe-inline'`**                                                            | Style injection sigue posible                                            | Migrar Tailwind / UI libs a nonces en style-src (sprint dedicado)                                                                                       |

---

## 11. Matriz OWASP Top 10 (2021) — Amenazas vs mitigaciones

| #   | Categoría OWASP                | Mitigación implementada en este proyecto                                                                                                                                                                                                              | Estado                                                                           |
| --- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| A01 | Broken Access Control          | `requireAuth` / `requireRole` / `requireStaff` en todas las server actions; sucursal scope (`scopeWhere`, `scopeWhereOpt`, `scopeWhereViaCotizante`); chequeo dual UI + endpoint en documentos confidenciales; `validarSucursalIdAsignable` en writes | OK                                                                               |
| A02 | Cryptographic Failures         | bcrypt cost 12 para passwords; AES-256-GCM con scrypt KDF para credenciales Colpatria; TLS forzado (HSTS + sslmode=require); JWT firmado con `AUTH_SECRET`                                                                                            | OK                                                                               |
| A03 | Injection                      | Prisma parameterized queries, no `$queryRawUnsafe`; Zod validation en todos los inputs; React escape automático; CSP con nonces (enforce en prod, Report-Only en dev)                                                                                 | Cubierto                                                                         |
| A04 | Insecure Design                | Sucursal scope diseñado en helpers reusables (no se duplica lógica); rate limit en login; sesiones de 15 min con renovación; logs con redact                                                                                                          | OK                                                                               |
| A05 | Security Misconfiguration      | Headers de seguridad globales en `next.config.mjs`; `frame-ancestors 'none'`; `Permissions-Policy` con todo en `()`; HSTS 1 año + subdominios; `X-Content-Type-Options: nosniff`                                                                      | OK                                                                               |
| A06 | Vulnerable Components          | pnpm + lockfile pinneado; dependabot configurable en GitHub; sin componentes deprecated críticos en uso (Next 15, Prisma vigente, NextAuth v5)                                                                                                        | Parcial — falta auditoría programada (`pnpm audit` en CI)                        |
| A07 | Identification & Auth Failures | Rate limit 3/10min por email; bcrypt cost 12; sesión inactividad 15 min; logs de `LOGIN` y `LOGIN_BLOCKED`; email normalizado                                                                                                                         | OK; pendiente 2FA                                                                |
| A08 | Software & Data Integrity      | TypeScript estricto; transacciones Prisma para operaciones multi-tabla; AuditLog inmutable; pre-commit hook con typecheck                                                                                                                             | OK                                                                               |
| A09 | Security Logging & Monitoring  | Logger pino estructurado con redact; hook a Sentry para errors+; AuditLog con diff calculado; LoginAttempt granular                                                                                                                                   | Parcial — falta alerting de patrones (descargas masivas, logins desde geo nueva) |
| A10 | Server-Side Request Forgery    | No hay endpoints que acepten URL arbitraria del usuario para fetch server-side. PagoSimple y Colpatria son URLs hardcoded vía env. Sentry idem.                                                                                                       | OK por diseño — no aplica                                                        |

---

## 12. Cierre

La seguridad del sistema está construida en capas: **autenticación con rate limit**, **autorización con doble matriz** (Role base + RolCustom), **scope multi-tenant** que no se puede saltar mediante manipulación de IDs, **cifrado AES-GCM** para credenciales sensibles de terceros, **headers de seguridad estrictos** con CSP en migración a enforce, y **bitácora central** con diff estructurado.

Los gaps son conocidos, listados, y priorizables. La filosofía operativa es: nunca confiar en el cliente, validar todo con Zod, logear con redact, fallar cerrado.
