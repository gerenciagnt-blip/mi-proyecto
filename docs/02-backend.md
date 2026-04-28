# Sistema PILA — Sección 4: Backend

> Documentación técnica para auditoría. Refleja exclusivamente lo que está en el código del repositorio, no roadmap ni intención.

## 1. Posición arquitectónica

El "backend" en este proyecto **no es un servicio separado**. Vive dentro de la aplicación `apps/web` y se ejecuta sobre el runtime de Next.js 15.1 (App Router). La superficie pública del backend está compuesta por dos mecanismos de Next:

1. **Server Actions** (`'use server'`) — manejan toda la mutación de datos: crear, editar, eliminar entidades, gestionar estado de incapacidades, abrir/cerrar períodos contables, generar planos, emitir transacciones, etc. Son funciones async TypeScript invocadas directamente desde formularios React (Server Components y Client Components vía `useActionState`).
2. **Route Handlers** (`route.ts`) — usados sólo para casos donde Server Actions no aplica: (a) endpoints binarios (PDF, XLSX, TXT, CSV), (b) entry points para sistemas externos (NextAuth callback, health check, hooks), y (c) endpoints JSON consumidos por `fetch` desde el cliente (ej. notificaciones).

No hay controllers, ni Express, ni REST a la usanza tradicional. El monorepo expone el dominio mediante:

- `apps/web` — la aplicación web y, por tanto, el backend.
- `apps/cli` — herramienta administrativa (`@pila/cli`) para tareas batch fuera de request lifecycle.
- `packages/db` — cliente Prisma compartido (`@pila/db`).
- `packages/core` — tipos y utilidades compartidos (`@pila/core`).

## 2. Lenguaje y framework

- **TypeScript estricto.** El proyecto entero compila con `pnpm typecheck` (`tsc --noEmit`).
- **Node ≥ 20.** `apps/web/package.json` declara `@types/node` ^22 y NextAuth 5 beta, ambos requieren Node moderno.
- **Next.js 15.1.3** con App Router exclusivamente. No hay `pages/` aparte del shim que Next deja para errores legacy.
- **React 19.0.0** — Server Components por default; `'use client'` solo en formularios y componentes interactivos.
- **Prisma** — cliente en `@pila/db` (Prisma 5+ con `$extends`).
- **NextAuth 5.0.0-beta.31** — sesión JWT, provider Credentials.
- **Zod 4.3.6** — validación de input. `pino` 10 + `pino-pretty` para logging. `@sentry/nextjs` 10 para error tracking. `bcryptjs` 3 para hash de password. `@react-pdf/renderer` para PDFs y `exceljs`/`xlsx` para Excel. `pdf-parse` para extracción de texto de PDFs de cartera.

### Convenciones del proyecto

De `CLAUDE.md` y configuración:

- Comentarios y mensajes de commit en español.
- ESLint configurado vía `apps/web/.eslintrc.json` con preset `next/core-web-vitals` (sin reglas custom).
- Encoding UTF-8 sin BOM, finales de línea CRLF (Windows).
- Archivos de prueba con sufijo `.test.ts` viven junto a la implementación; no hay carpeta de tests separada.
- Nunca commitear `.env` ni credenciales; preferir commits nuevos sobre `--amend`.

## 3. Entry points

### 3.1 Root del App Router

`apps/web/src/app/page.tsx`:

```ts
import { redirect } from 'next/navigation';
export default function HomePage() {
  redirect('/dashboard');
}
```

Redirige al dashboard. La autenticación efectiva la fuerza el middleware antes de que el render llegue acá.

### 3.2 Layout raíz

`apps/web/src/app/layout.tsx` (49 líneas):

- Marca `export const dynamic = 'force-dynamic'` para evitar el bug donde el `/404` estático cae en el fallback de Pages Router.
- Carga las fuentes Montserrat y Roboto vía `next/font/google` con CSS variables (`--font-montserrat`, `--font-roboto`).
- Define metadatos (`title: 'Sistema PILA'`, viewport, iconos).
- No envuelve a los hijos en ningún provider — la sesión se consume con `auth()` server-side desde cada componente que lo necesite.

### 3.3 Instrumentation hook

`apps/web/src/instrumentation.ts` — hook estándar de Next que se ejecuta una vez al arranque del server:

- Bypassa Edge runtime (`if (process.env.NEXT_RUNTIME !== 'nodejs') return;`).
- Llama a `instrumentarPrisma()` (slow query log opt-in vía `PILA_QUERY_PROBE=true`).
- Si hay `SENTRY_DSN`, dispara la inicialización lazy de Sentry.
- Exporta `onRequestError(err, request, context)` que enrutea cualquier error de page render, route handler, server action o middleware a `captureError` con metadatos del request.

### 3.4 Middleware Edge

`apps/web/src/middleware.ts` (115 líneas) — corre en Edge runtime, sin Prisma ni bcrypt:

1. Importa `authConfig` (la versión liviana sin providers) y monta NextAuth para chequear sesión.
2. Genera un nonce criptográfico (16 bytes base64 URL-safe) para CSP por cada request.
3. Construye la directiva CSP con `'strict-dynamic'`, `'nonce-XXX'`, `'unsafe-inline'` como fallback, y `connect-src` que incluye Sentry y PagoSimple si están configurados.
4. Define rutas públicas (`/login`, `/api/auth/*`, `/api/health`) que se sirven sin sesión. Cualquier otra ruta sin sesión → redirect a `/login?callbackUrl=...`.
5. Inyecta el header `x-nonce` en el request para que server components lo lean si necesitan scripts inline.
6. Aplica `Content-Security-Policy-Report-Only` a la respuesta (modo report-only mientras se valida; se promueve a CSP estricta cuando no haya violations).
7. El `matcher` excluye `_next/static`, `_next/image`, `favicon.ico` y assets estáticos para que no consuman ciclos del middleware.

## 4. Server Actions — la arquitectura real

Todas las mutaciones del dominio se implementan como Server Actions. Hay **39 archivos `actions.ts`** en `apps/web/src/app/`, agrupados por módulo. El convention es:

- Cada archivo abre con `'use server';`.
- Exporta funciones async que retornan un `ActionState` discriminado: `{ error?: string; ok?: boolean; mensaje?: string }`.
- Validan input con Zod (`safeParse`) antes de tocar Prisma.
- Llaman a `requireAuth()`, `requireStaff()` o `requireRole(...)` para autorización.
- Aplican `getUserScope()` cuando la entidad es scopeada por sucursal.
- Ejecutan transacciones Prisma (array o callback) para garantizar atomicidad.
- Llaman a `auditarCreate/Update/Delete/Evento` para registrar el cambio.
- Emiten `emitirNotificacion` cuando otro rol del sistema debe enterarse.
- Cierran con `revalidatePath()` para forzar re-render de los listados afectados.

### 4.1 Inventario completo de actions por módulo

**Administrativo (aliado, scope sucursal)**

- `apps/web/src/app/admin/administrativo/cartera/actions.ts`
- `apps/web/src/app/admin/administrativo/incapacidades/actions.ts`

**Base de datos (cotizantes y afiliaciones)**

- `apps/web/src/app/admin/base-datos/actions.ts`
- `apps/web/src/app/admin/base-datos/importar/actions.ts`

**Catálogos (parametrización)**

- `actividades/actions.ts`, `asesores/actions.ts`, `comprobantes/[sucursalId]/actions.ts`, `entidades/actions.ts`, `medios-pago/actions.ts`, `planes/actions.ts`, `servicios/actions.ts`, `smlv/actions.ts`, `tarifas/actions.ts`, `tipos-cotizante/actions.ts` y `tipos-cotizante/[id]/actions.ts`.

**Configuración**

- `apps/web/src/app/admin/configuracion/colpatria-jobs/actions.ts`

**Cuentas de cobro**

- `apps/web/src/app/admin/cuentas-cobro/actions.ts`

**Empresas planilla**

- `apps/web/src/app/admin/empresas/actions.ts`
- `apps/web/src/app/admin/empresas/[id]/colpatria/actions.ts`
- `apps/web/src/app/admin/empresas/[id]/config/actions.ts`

**Perfil**

- `apps/web/src/app/admin/perfil/actions.ts`

**Planos**

- `apps/web/src/app/admin/planos/actions.ts`

**Soporte (staff cross-sucursal)**

- `afiliaciones/actions.ts`, `cartera/actions.ts`, `incapacidades/actions.ts`, `juridico/actions.ts`
- Sub-módulo Finanzas: `cobro-aliados/actions.ts`, `detalle-movimientos/actions.ts`, `movimientos-incapacidades/actions.ts`, `movimientos-incapacidades/[id]/actions.ts`.

**Sucursales**

- `apps/web/src/app/admin/sucursales/actions.ts`

**Transacciones**

- `apps/web/src/app/admin/transacciones/actions.ts`
- `apps/web/src/app/admin/transacciones/cartera/actions.ts`
- `apps/web/src/app/admin/transacciones/nueva-transaccion/actions.ts`

**Usuarios**

- `apps/web/src/app/admin/usuarios/actions.ts`
- `apps/web/src/app/admin/usuarios/roles/actions.ts`
- `apps/web/src/app/admin/usuarios/[id]/empresas/actions.ts`

**Otros**

- `apps/web/src/app/dashboard/actions.ts`
- `apps/web/src/app/login/actions.ts`

### 4.2 Actions clave por módulo (firma + comportamiento)

#### Login — `app/login/actions.ts`

```ts
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState>;
```

- Lee `email`/`password` del FormData.
- **Pre-check** rate-limit con `getRateLimitStatus(email)`. Si está bloqueado, retorna mensaje con tiempo restante sin invocar `signIn` (evita bcrypt + DB hit).
- Llama `signIn('credentials', { email, password, redirectTo: '/admin' })`.
- Captura `AuthError` y reconsulta el estado post-intento; si este intento disparó el bloqueo, retorna mensaje de bloqueo.
- Re-lanza errores `NEXT_REDIRECT` para que el redirect funcione.

#### Soporte/Incapacidades — `app/admin/soporte/incapacidades/actions.ts`

```ts
export async function gestionSoporteIncapAction(
  incapacidadId: string,
  params: { descripcion: string; nuevoEstado?: IncapacidadEstado },
): Promise<ActionState>;
```

- Autoriza con `requireStaff()`.
- Bloquea gestión si el caso está en `TRASLADO_A_JURIDICO` o `EN_PROCESO_JURIDICO` (sólo el área legal cierra).
- Ejecuta `prisma.$transaction(async (tx) => { ... })` que:
  1. Si hay cambio de estado, `tx.incapacidad.update({ data: { estado: cambio } })`.
  2. `tx.incapacidadGestion.create({ data: { incapacidadId, accionadaPor: 'SOPORTE', nuevoEstado: cambio ?? null, descripcion, userId, userName } })`.
- Si hubo cambio de estado, escribe en bitácora con `auditarEvento({ entidad: 'Incapacidad', accion: 'GESTIONAR_SOPORTE', cambios: { antes, despues, campos: ['estado'] } })`.
- Emite notificación al aliado dueño de la sucursal con `emitirNotificacion`.
- `revalidatePath('/admin/soporte/incapacidades')` y `'/admin/administrativo/incapacidades'`.

```ts
export async function subirDocumentoSoporteIncapAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState>;
```

- Valida `tipo` con `IncapacidadDocumentoTipoMedicoEnum.safeParse` (rechaza tipos jurídicos).
- Valida MIME contra `MIMES_PERMITIDOS` y tamaño contra `TAMANO_MAX` (5 MB).
- Persiste con `guardarDocumentoIncapacidad(buf, file.name, incapacidadId)` y crea fila `incapacidadDocumento` con `accionadaPor='SOPORTE'`.
- Audita y revalida.

```ts
export async function anularIncapacidadAction(incapacidadId: string): Promise<ActionState>;
```

- Borra la incapacidad (cascade documentos) y registra `accion: 'ANULAR'` con snapshot del estado previo.

#### Soporte/Jurídico — `app/admin/soporte/juridico/actions.ts`

```ts
export async function gestionJuridicoIncapAction(
  incapacidadId: string,
  params: { descripcion: string; nuevoEstado?: IncapacidadEstado },
): Promise<ActionState>;
```

- `requireStaff()`. Verifica que el caso esté en `TRASLADO_A_JURIDICO` o `EN_PROCESO_JURIDICO`.
- Valida que el `nuevoEstado` esté en `ESTADOS_PERMITIDOS_JURIDICO` (`TRASLADO_A_JURIDICO`, `EN_PROCESO_JURIDICO`, `APROBADA`, `PAGADA`, `RECHAZADA`).
- Crea `IncapacidadGestion` con `accionadaPor='JURIDICO'`.

#### Administrativo/Incapacidades — `app/admin/administrativo/incapacidades/actions.ts`

```ts
export async function radicarIncapacidadAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState & { incapacidadId?: string; consecutivo?: string }>;
```

- `requireAuth()`, calcula `getUserScope()`.
- Construye payload manual desde FormData y lo valida con `IncapacidadRadicarSchema.safeParse(payload)`.
- Busca cotizante con scope (aliado solo ve los de su sucursal).
- Recolecta archivos de la forma `formData.get(`doc.${tipoMedico}`)` iterando `IncapacidadDocumentoTipoMedicoEnum.options`.
- Valida que se adjunte al menos `CERTIFICADO_INCAPACIDAD`.
- Genera consecutivo con `nextIncapacidadConsecutivo()`.
- Crea la incapacidad con snapshots de la afiliación activa, calcula días de incapacidad (extremos inclusivos).
- Persiste cada documento al disco (`guardarDocumentoIncapacidad`) y crea filas `IncapacidadDocumento`.
- Audita con `auditarCreate(...)`.
- Notifica al staff que llegó una nueva radicación.

#### Transacciones — `app/admin/transacciones/actions.ts`

```ts
export async function abrirPeriodoAction(_prev, formData): Promise<ActionState>;
export async function cerrarPeriodoAction(periodoId: string);
export async function reabrirPeriodoAction(periodoId: string);
```

- `requireAuth()`. `abrirPeriodoAction` lee `anio`/`mes` y los valida; consulta `smlvConfig.findUnique({ where: { id: 'singleton' } })` (singleton pattern); si el período ya existe es idempotente; caso contrario crea `periodoContable` con snapshot del SMLV vigente.
- `cerrarPeriodoAction` actualiza `estado: 'CERRADO'` con `cerradoEn: new Date()`.
- `reabrirPeriodoAction` invierte el cierre.

#### Catálogos (patrón típico) — `app/admin/catalogos/entidades/actions.ts`, etc.

Todos los catálogos siguen la forma:

1. `'use server'` + import de Zod schema desde `@/lib/validations`.
2. `requireStaff()` o `requireAdmin()`.
3. `Schema.safeParse(formObject)`.
4. `prisma.<modelo>.create/update/delete`.
5. `auditarCreate/Update/Delete` con `camposPermitidos` whitelist.
6. `revalidatePath`.

Los Zod schemas viven centralizados en `apps/web/src/lib/validations.ts` (SucursalCreateSchema, EmpresaCreateSchema, EntidadSgssSchema, ActividadSchema, TipoCotizanteSchema, AsesorSchema, MedioPagoSchema, ServicioAdicionalSchema, CuentaCobroSchema, CotizanteSchema, AfiliacionSchema, TarifaSgssSchema, PlanSgssSchema, FspRangoSchema, etc.).

## 5. Capa de servicios — `apps/web/src/lib/<dominio>/`

Hay **16 sub-dominios** de servicios. Cada uno encapsula la lógica que sería contaminante en el archivo `actions.ts` y la deja testeable de forma aislada (los `*.test.ts` viven al lado de la implementación).

### 5.1 `lib/alertas/`

- `inactividad.ts` + `inactividad-helpers.test.ts` — detector de cotizantes/afiliaciones inactivas.

### 5.2 `lib/auditoria/`

Sistema centralizado de bitácora — descrito en detalle en §7.

- `index.ts` (API pública), `with-audit.ts` (wrappers `auditarCreate/Update/Delete/Evento`), `payload.ts` (preparación + filtros sensibles), `registrar.ts` (persiste en `AuditLog` con captura de actor desde `auth()` y de IP desde `headers()`), `diff.ts` (`calcularDiff` puro), `scope.ts`, `resolver.ts`.

### 5.3 `lib/cartera/`

Pipeline completo del módulo cartera — extracción y reconocimiento de PDFs de EPS:

- `parse.ts` — orquestador (PDF → texto → detector → parser).
- `detector.ts` (`detectarOrigen(texto)`) — heurísticas de header/footer para SALUD_TOTAL, SOS, SURA, PROTECCION.
- `parsers/proteccion.ts`, `parsers/salud-total.ts`, `parsers/sos.ts`, `parsers/sura.ts` — parsers específicos por EPS.
- `normalizer.ts` — normaliza la salida cruda a un shape común.
- `storage.ts` — persiste archivos a `UPLOADS_DIR` y expone `uploadsRoot`, `guardarArchivo`.
- `consecutivo.ts`, `labels.ts`, `sugerir-sucursal.ts`, `types.ts`.

### 5.4 `lib/colpatria/`

Job-runner para el bot Colpatria ARL (Sprint 8):

- `disparos.ts` — decide si una afiliación dispara un job al bot, basado en reglas: modalidad `DEPENDIENTE`, estado `ACTIVA`, empresa con `colpatriaActivo=true`, ARL con código en `['ARL-007', 'COLPATRIA', 'ARL-COLPATRIA']`, y evento `CREAR` o `REACTIVAR`. Devuelve un `ColpatriaPayload` (snapshot completo) que se persiste en `ColpatriaAfiliacionJob.payload` para que el worker no haga joins en runtime.
- `config-resolver.ts` — resuelve qué Centro de Trabajo, Grupo, Tipo de Ocupación, etc. usar para una afiliación, mezclando mapeo `EmpresaNivelRiesgo` y defaults de empresa. Tiene quemados `TipoSalario='1'`, `ModalidadTrabajo='01'`, `TareaAltoRiesgo='0000001'`.
- `crypto.ts` (+ test) — encrypt/decrypt de credenciales del bot.

### 5.5 `lib/incapacidades/`

- `validations.ts` — Zod schemas + enums + labels para UI (descrito en §6).
- `consecutivo.ts` — generador de consecutivo `INC-NNNNNN`.
- `dias.ts` (+ test) — cálculo de días entre fechas con extremos inclusivos.
- `storage.ts` — guarda documentos en `UPLOADS_DIR/incapacidades/<id>` (organización por id para que la retención borre con `rm -rf`). Define `MIMES_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp']` y `TAMANO_MAX = 5 * 1024 * 1024`.
- `retencion.ts` — job de retención 120 días (al día 121 borra archivo físico, marca `eliminado=true` conservando hash/mime/size/nombre).

### 5.6 `lib/cotizantes/`

- `csv-import.ts` (+ test) — parser e importador masivo de cotizantes vía CSV.

### 5.7 `lib/dashboard/`

- `kpis.ts` — `cargarKpis({ sucursalId, ... })` ejecuta todos los counts/aggregates en `Promise.all`. Compara período actual vs anterior con función `delta(actual, anterior)` que devuelve null cuando anterior=0 y actual>0 (incomparable). Retorna `KpisDashboard` con: cotizantes activos, afiliacionesActivas, comprobantesProcesados (KpiValor), totalFacturado (KpiValor), carteraPendienteValor, carteraPagadaValor (KpiValor), incapacidadesActivas, incapacidadesRadicadas (KpiValor), tiempoPromedioResolucionDias, planillasPagadas (KpiValor).
- `kpis-helpers.test.ts`.

### 5.8 `lib/finanzas/`

- `cobro-generar.ts` — genera cobro de aliados.
- `consecutivos.ts` — consecutivos para movimientos.
- `parser-extracto.ts` — parser de extractos bancarios.
- `storage-detalle.ts` — adjuntos a movimientos.

### 5.9 `lib/liquidacion/`

- `calcular.ts` — motor de liquidación. Recibe `CalcInput` con afiliación + plan + entidades SGSS y produce el desglose. Define tipos `TipoLiq = 'VINCULACION' | 'MENSUALIDAD'`. Trabaja con `Prisma.Decimal` (sin floats) y firma `persistirLiquidacion(tx, ...)` que se invoca dentro de transacciones de actions.

### 5.10 `lib/pagosimple/`

Cliente del operador externo PagoSimple:

- `client.ts` — wrapper HTTP. Construye URL absoluta, serializa JSON/multipart, inyecta headers auth, decodifica el envoltorio `{ success, code, data, message, description }`, **reintenta una vez ante 401** (token expirado) con re-login automático, timeout default 30s, tipa la excepción `PagosimpleError`.
- `auth.ts` — gestión de tokens (login + refresh).
- `config.ts` — `requirePagosimpleConfig()` que lee env vars y falla rápido si faltan.
- `aportantes.ts`, `planillas.ts`, `comprobantes.ts` — endpoints específicos del operador.
- `bdua-ruaf.ts` — consulta a BDUA/RUAF (afiliaciones nacionales).
- `bdua-cache.ts` — cache in-memory con TTL 30 min y LRU implícito (`MAX_ENTRIES=5000`). Se justifica con que 70 aliados consultan concurrentemente y el cambio en BDUA es semanal/mensual.
- `validar-subtipos.ts` — validación local previa.
- `types.ts`.

### 5.11 `lib/pdf/`

- `comprobante-pdf.tsx` — renderer `@react-pdf/renderer` del comprobante de transacción.

### 5.12 `lib/planos/`

Generación de planos PILA (formato de ley colombiano):

- `generar.ts` (+ test) — orquestador.
- `format.ts` (+ test) — formato fijo de campos por columna.
- `politicas.ts` (+ test) — reglas de negocio (qué incluye, qué excluye).
- `codigos.ts`, `queries.ts`.

### 5.13 `lib/sistema/`

- `status.ts` — health checks internos (DB up, env vars críticas configuradas).

### 5.14 `lib/soporte-af/`

Soporte de afiliaciones (módulo paralelo a soporte/incapacidades):

- `arl-status.ts`, `cambios.ts`, `consecutivo.ts`, `disparos.ts` (+ test), `dispatch.ts`, `retencion.ts`, `storage.ts`.

### 5.15 Top-level (no agrupados en sub-dominio)

- `auth-helpers.ts`, `auth-rate-limit.ts`, `catalogos-cache.ts`, `consecutivo.ts`, `db-instrumentation.ts`, `duenos-sucursal.ts`, `excel.ts`, `format.ts`, `logger.ts`, `nit.ts` (+ test), `notificaciones.ts`, `permisos.ts`, `permisos-runtime.ts`, `sentry.ts`, `sucursal-scope.ts`, `text.ts` (+ test), `utils.ts`, `validations.ts`.

## 6. Capa de datos

### 6.1 Cliente Prisma único — `@pila/db`

`packages/db/src/index.ts` exporta una instancia única (`export const prisma = ...`) creada con `new PrismaClient(...).$extends({ ... })`. La extensión `pila-query-probe` envuelve `$allOperations` para medir duración y notificar al probe global `globalThis.__pilaQueryProbe` (opt-in). Esto reemplaza el `$on('query', ...)` que es interceptado por OpenTelemetry de `@sentry/node` antes de llegar al listener.

El nivel de logs se controla por `PRISMA_LOG`:

- default prod: `['error']`,
- dev: `['error', 'warn']`,
- `PRISMA_LOG=query`: agrega `'query'`,
- `PRISMA_LOG=info`: agrega `'info'` + `'query'`.

En desarrollo se cachea en `globalForPrisma.prisma` para sobrevivir hot-reload sin abrir conexiones nuevas. El tipo del cliente extendido se exporta como `PilaPrismaClient` para que helpers que reciben `tx` puedan tipar correctamente.

### 6.2 Estrategia de transacciones

El código usa **dos formas** de `prisma.$transaction`:

**Forma array** (`prisma.$transaction([op1, op2, ...])`) — para operaciones independientes que se quieren atómicas. Ejemplo en `auth-rate-limit.ts:119-143`:

```ts
await prisma.$transaction([
  prisma.loginAttempt.create({ data: { email: e, success: true, ... } }),
  prisma.loginAttempt.deleteMany({ where: { email: e, success: false } }),
  prisma.auditLog.create({ data: { entidad: 'Auth', accion: 'LOGIN', ... } }),
]);
```

Útil cuando no hay dependencia entre operaciones; Prisma las envía como un solo BEGIN/COMMIT.

**Forma callback interactiva** (`prisma.$transaction(async (tx) => { ... })`) — para flujos donde una operación depende del resultado de otra. Ejemplo en `app/admin/soporte/incapacidades/actions.ts:68-85`:

```ts
await prisma.$transaction(async (tx) => {
  if (cambio) {
    await tx.incapacidad.update({ where: { id: incapacidadId }, data: { estado: cambio } });
  }
  await tx.incapacidadGestion.create({
    data: { incapacidadId, accionadaPor: 'SOPORTE', nuevoEstado: cambio ?? null, ... },
  });
});
```

`tx` es un `PilaPrismaClient` con la transacción atada. Cualquier excepción dispara rollback.

### 6.3 Sucursal scope — `lib/sucursal-scope.ts`

Implementación del modelo multi-tenant. Define `UserScope` discriminado:

```ts
type UserScope =
  | { tipo: 'STAFF'; role: Role; userId: string }
  | { tipo: 'SUCURSAL'; role: Role; userId: string; sucursalId: string };
```

Helpers expuestos:

- `getUserScope()` — lee la sesión y deriva el scope. Retorna null si aliado sin sucursalId (estado inconsistente).
- `scopeWhere()` — fragmento `where` para recursos con `sucursalId NOT NULL` (CuentaCobro, ComprobanteFormato).
- `scopeWhereOpt()` — variante con NULL = "global"; staff ve todo, aliado ve `OR: [{ sucursalId: null }, { sucursalId: mi sucursal }]`.
- `validarSucursalIdAsignable(sucursalId)` — valida que un aliado no pueda crear recursos en otra sucursal o globales.
- `scopeWhereViaCotizante()` — para entidades scopeadas indirectamente vía Cotizante (afiliaciones, comprobantes, gestiones de cartera, liquidaciones).
- `scopeWhereDirect()` — alias tipado de `scopeWhere()`.

Las server actions importan estos helpers y los esparcen en el `where`:

```ts
const scope = await scopeWhere();
const rows = await prisma.cuentaCobro.findMany({ where: { active: true, ...scope } });
```

### 6.4 Auditoría centralizada — `lib/auditoria/`

API pública en `lib/auditoria/index.ts`:

```ts
export { auditarCreate, auditarUpdate, auditarDelete, auditarEvento } from './with-audit';
export { registrarAuditoria } from './registrar';
export { calcularDiff } from './diff';
```

`registrarAuditoria(input)` es la primitiva: captura actor desde `auth()` (userId, userName, userRole, userSucursalId), captura IP best-effort desde `headers().get('x-forwarded-for')` (split en `,` y toma el primero) o `x-real-ip`, serializa el `Diff` a `Prisma.InputJsonValue` y persiste en `AuditLog`. **Nunca lanza excepciones**: cualquier fallo se loguea con `console.error` y se traga, para no romper la operación principal.

`calcularDiff(antes, despues)` compara strings, numbers, booleans, Date (por timestamp), Decimal (por `toString()`), arrays/objetos (por `JSON.stringify`). Considera `null` y `undefined` equivalentes. Devuelve `null` si nada cambió, o `{ antes: {...}, despues: {...}, campos: [...] }` con sólo los campos modificados.

`prepararPayload` (en `payload.ts`) aplica una whitelist de `camposPermitidos` y una blacklist global de campos sensibles (`passwordHash`, etc.) — defensa en profundidad.

Los wrappers `auditarCreate/Update/Delete` consumen `prepararPayload` y luego llaman a `registrarAuditoria`. `auditarEvento` es la versión libre para acciones que no encajan en CRUD (ANULAR, GESTIONAR_SOPORTE, LOGIN, LOGIN_BLOCKED, DOCUMENTO_SOPORTE, etc.).

## 7. Middlewares y helpers transversales

### 7.1 `lib/auth-helpers.ts`

```ts
export async function requireAuth(); // redirect a /login si no hay sesión
export async function requireRole(...allowed: Role[]); // redirect a /admin si no autorizado
export async function requireAdmin(); // shortcut requireRole('ADMIN')
export async function requireStaff(); // shortcut requireRole('ADMIN', 'SOPORTE')
export function esStaff(role: Role): boolean; // sin redirect — para queries condicionales
```

Los `redirect()` lanzan `NEXT_REDIRECT` que Next intercepta y produce un 307 al cliente. **Nunca devuelven una sesión "fake"**; o devuelven la sesión real o cortan el flujo.

### 7.2 `lib/auth-rate-limit.ts`

Política: 3 fallos en 10 minutos → bloqueo de 10 min desde el último fallo.

```ts
export const MAX_FAILED_ATTEMPTS = 3;
export const LOCK_WINDOW_MS = 10 * 60 * 1000;
```

Tipos de motivo: `'password_wrong' | 'user_inactive' | 'unknown_email' | 'rate_limited'`.

`getRateLimitStatus(email)` consulta `LoginAttempt` (success=false, dentro de la ventana). Si la cuenta de fallidos < 3, no bloqueado. Si ≥ 3, calcula `desbloqueoEn = ultimoFallo + LOCK_WINDOW_MS`.

`registrarIntentoFallido` siempre escribe en `LoginAttempt`; sólo escribe en `AuditLog` cuando el motivo es `rate_limited` (los fallos rutinarios de password no ensucian la bitácora).

`registrarIntentoExitoso` ejecuta una transacción array que (a) crea el `LoginAttempt` exitoso, (b) borra `loginAttempt.deleteMany` los fallidos previos del mismo email (reinicia el contador), (c) crea entrada `AuditLog` con `accion: 'LOGIN'`.

### 7.3 `lib/permisos.ts` y `lib/permisos-runtime.ts`

`permisos.ts` — **catálogo estático** de módulos y acciones. Define:

- `ACCIONES = ['VER', 'CREAR', 'EDITAR', 'ELIMINAR']`.
- `MODULOS` con `key`, `label`, `grupo`, y opcional `rolesAplica` (limita a qué roles del sistema le aplica el módulo).
- Agrupa en: Configuración, Soporte, Operación, Administrativo.
- Helpers: `agruparModulos()` (orden estable), `agruparModulosPorRol(role)` (filtra módulos cuyo `rolesAplica` no incluye al rol y esconde grupos vacíos).

Módulos staff-only (`rolesAplica: STAFF`): config.sucursales, config.usuarios, config.roles, config.empresas_planilla, config.catalogos, config.bitacora, config.colpatria_jobs, soporte.\* completo, etc. ADMIN-only: config.sistema. Aliado-only: admin.cartera, admin.incapacidades.

`permisos-runtime.ts` — chequeo en BD:

```ts
export async function tienePermiso(
  user: UserContext,
  modulo: string,
  accion: Accion,
): Promise<boolean>;
```

- ADMIN siempre `true`.
- Si no tiene `rolCustomId`, `false`.
- Caso contrario, `prisma.permisoCustom.findUnique({ where: { rolCustomId_modulo_accion: { ... } } })` (clave compuesta como PK).

Atajo más usado:

```ts
export async function puedeDescargarDocConfidencial(user) {
  return tienePermiso(user, 'soporte.juridico_confidencial', 'VER');
}
```

Se usa en el endpoint `/api/incapacidades/[id]/documentos/[docId]` y en el render del listado para decidir si el botón de descarga aparece habilitado.

## 8. Validaciones (Zod)

### 8.1 `apps/web/src/lib/validations.ts` (top-level)

Centraliza schemas comunes:

- **Sucursales**: `SucursalCreateSchema` (codigo regex `^[A-Z0-9-]+$`, nombre 1–200), `SucursalUpdateSchema`.
- **Empresas**: `EmpresaCreateSchema` con identificación (NIT solo dígitos, DV opcional 1 dígito), tipoPersona enum, datos de representante legal, contacto (DIVIPOLA `departamentoId`/`municipioId` con texto denormalizado), CIIU 4 dígitos, `arlId` nullable, `exoneraLey1607` con preprocess `'on'|true`, `fechaInicioActividades` que parsea `YYYY-MM-DD` a Date UTC, `pagosimpleContributorId` string nullable.
- **Usuarios**: `UserCreateSchema`, `UserUpdateSchema` con refine que requiere sucursal para roles aliado, `UserPasswordSchema` (mín 8 caracteres).
- **Catálogos**: `EntidadSgssSchema` (incluye `codigoAxa` para mapeo Colpatria), `ActividadSchema`, `TipoCotizanteSchema`, `SubtipoSchema`, `CargoSchema`, `AsesorSchema`, `MedioPagoSchema`, `ServicioAdicionalSchema`, `CuentaCobroSchema`, `TarifaSgssSchema`, `FspRangoSchema`, `PlanSgssSchema`.
- **Cotizante / Afiliación**: `CotizanteSchema`, `AfiliacionSchema`. Esta última con tres `.refine` que validan reglas cruzadas:
  - DEPENDIENTE requiere `empresaId`.
  - DEPENDIENTE requiere `regimen`.
  - INDEPENDIENTE requiere `formaPago`.

### 8.2 `apps/web/src/lib/incapacidades/validations.ts`

Schema del dominio incapacidades:

- **Enums**:
  - `IncapacidadTipoEnum` — `ENFERMEDAD_GENERAL`, `LICENCIA_MATERNIDAD`, `LICENCIA_PATERNIDAD`, `ACCIDENTE_TRABAJO`, `ACCIDENTE_TRANSITO_SOAT`.
  - `DOC_TIPOS_MEDICOS` (constante) — `COPIA_CEDULA`, `CERTIFICADO_INCAPACIDAD`, `HISTORIA_CLINICA`, `CERTIFICADO_BANCARIO`, `AUTORIZACION_PAGO_TERCEROS`, `FURIPS_SOAT`.
  - `DOC_TIPOS_JURIDICOS` — `DERECHO_PETICION`, `TUTELA`, `DESACATO`, `RESOLUCION`, `OTRO_JURIDICO`.
  - `IncapacidadDocumentoTipoEnum` (unión médicos+jurídicos), `IncapacidadDocumentoTipoMedicoEnum` (subset médico), `IncapacidadDocumentoTipoJuridicoEnum` (subset jurídico). El subset se usa para rechazar tipos jurídicos en uploads del flujo regular y viceversa.

- **Labels para UI**:
  - `TIPO_LABEL` — labels de los tipos.
  - `DOC_TIPO_LABEL` — labels completos.
  - `DOC_TIPO_MEDICO_LABEL`, `DOC_TIPO_JURIDICO_LABEL` — derivados parciales para forms específicos.
  - `ESTADO_LABEL` — Record sobre `IncapacidadEstado`: RADICADA, EN_REVISION, APROBADA, PAGADA, RECHAZADA, TRASLADO_A_JURIDICO, EN_PROCESO_JURIDICO.
  - `ESTADO_TONE` — Record con clases Tailwind por estado (sky/amber/violet/emerald/red/indigo).

- **Schema principal**: `IncapacidadRadicarSchema` (`apps/web/src/lib/incapacidades/validations.ts:101-134`):

```ts
const IncapacidadRadicarSchema = z
  .object({
    tipo: IncapacidadTipoEnum,
    tipoDocumento: z.enum(['CC', 'CE', 'NIT', 'PAS', 'TI', 'RC', 'NIP']),
    numeroDocumento: z
      .string()
      .trim()
      .min(4)
      .max(20)
      .regex(/^[A-Z0-9]+$/i, 'Sin espacios ni símbolos'),
    fechaInicio: z.coerce.date({ message: 'Fecha inicio inválida' }),
    fechaFin: z.coerce.date({ message: 'Fecha fin inválida' }),
    observaciones: z
      .string()
      .trim()
      .max(2000)
      .optional()
      .transform((v) => (v && v.length > 0 ? v : undefined)),
  })
  .refine((v) => v.fechaFin >= v.fechaInicio, {
    message: 'La fecha fin debe ser igual o posterior...',
    path: ['fechaFin'],
  })
  .refine(
    (v) =>
      Math.round((v.fechaFin.getTime() - v.fechaInicio.getTime()) / (1000 * 60 * 60 * 24)) + 1 <=
      540,
    { message: 'La incapacidad excede el máximo de 540 días', path: ['fechaFin'] },
  );
```

### 8.3 Otros archivos `validations.ts` por dominio

Sólo existen dos: el top-level y el de incapacidades. Los otros dominios reutilizan el top-level o definen sus schemas inline en el `actions.ts`.

## 9. Manejo de errores

### 9.1 Patrón ActionState

Todas las server actions retornan un shape uniforme:

```ts
export type ActionState = { error?: string; ok?: boolean; mensaje?: string };
```

Variantes por archivo agregan campos opcionales (ej. `incapacidadId`, `consecutivo`, `error?: string | null`). El cliente consume con `useActionState` y muestra `state.error` o un toast con `state.mensaje`.

**Nunca lanzan excepciones para errores de negocio** — siempre retornan `{ error: '...' }`. Las excepciones quedan reservadas para fallos de infraestructura (DB caída) que escapan al `instrumentation.onRequestError` y van a Sentry.

### 9.2 Hook a Sentry desde el logger

`lib/logger.ts` instala un hook `logMethod` en pino. Cuando un log emite con nivel ≥ 50 (error/fatal), se llama `forwardToSentry(level, obj)` (fire-and-forget, sin `await`):

```ts
async function forwardToSentry(level: number, obj: unknown) {
  if (level < 50) return;
  if (!process.env.SENTRY_DSN) return;
  const { captureError } = await import('./sentry');
  // ...detecta si obj.err es Error y captura como Exception, sino como Message...
  await captureError(err, extra);
}
```

Importa `./sentry` lazy para no cargar el SDK si Sentry no está configurado.

### 9.3 Logger pino estructurado

Configuración en `lib/logger.ts:87-114`:

- `level`: `process.env.LOG_LEVEL` o `'info'`.
- `base: { service: '@pila/web' }`.
- `redact`:
  ```ts
  const REDACT_KEYS = [
    '*.password',
    '*.passwordHash',
    '*.secret_key',
    '*.secretKey',
    '*.auth_token',
    '*.token',
    '*.session_token',
    '*.AUTH_SECRET',
    '*.DATABASE_URL',
    'headers.authorization',
    'headers.Authorization',
    'headers.token',
    'headers.session_token',
  ];
  ```
- En desarrollo: transport `pino-pretty` con colorize, `translateTime: 'HH:MM:ss'`, ignore `pid,hostname,service`.
- En producción: JSON crudo a stdout (Datadog/Logtail-friendly).

`createLogger(scope)` es atajo para `logger.child({ scope })`.

### 9.4 Sentry — `lib/sentry.ts`

Wrapper opcional y lazy. Si no hay `SENTRY_DSN`, las funciones (`captureError`, `captureMessage`, `setUser`, `isSentryEnabled`) son no-op silenciosas. La inicialización ocurre en la primera llamada (estado `'unloaded' | 'enabled' | 'disabled'`); si falla, queda `'disabled'` y no se reintenta. Importa `@sentry/nextjs` dinámicamente. Sample rate 0.1 en prod, 1 en dev. `sendDefaultPii: false` (no manda query strings con tokens).

### 9.5 onRequestError de Next 15

`apps/web/src/instrumentation.ts:43-71` exporta `onRequestError(err, request, context)` que Next invoca ante errores de page render, route handler, server action o middleware. Enrutea con metadatos (`method`, `path`, `routerKind`, `routePath`, `routeType`).

## 10. Flujo end-to-end — gestión de incapacidad por Soporte

Caso: un agente de Soporte abre el detalle de una incapacidad radicada, redacta una nota y cambia el estado a `APROBADA`. Trazamos el camino completo desde el form hasta el re-render.

### 10.1 Form (Client Component)

El componente cliente del detalle (en `apps/web/src/app/admin/soporte/incapacidades/[id]/...`) usa `useActionState` para invocar la server action. El form envía `incapacidadId` y un objeto con `descripcion` + `nuevoEstado`. La server action está marcada con `'use server'` así que el bundler la convierte en un endpoint POST con un id estable.

### 10.2 Middleware Edge

El POST entra primero al middleware (`src/middleware.ts`). Como la ruta no es pública, NextAuth verifica el JWT cookie. Si la sesión expiró (ventana 15 min sin actividad), redirect 307 a `/login?callbackUrl=/admin/soporte/incapacidades/<id>`. Si sigue válida, se genera nonce + CSP, se inyecta `x-nonce` en el request, y se pasa al handler.

### 10.3 Server Action — autorización

`apps/web/src/app/admin/soporte/incapacidades/actions.ts:24-31`:

```ts
export async function gestionSoporteIncapAction(
  incapacidadId: string,
  params: { descripcion: string; nuevoEstado?: IncapacidadEstado },
): Promise<ActionState> {
  const session = await requireStaff();
  const userId = session.user.id;
  const userName = session.user.name;
```

`requireStaff()` (`lib/auth-helpers.ts:33-35`) llama `requireRole('ADMIN', 'SOPORTE')`, que llama `requireAuth()`, que llama `auth()` y, si no hay sesión, dispara `redirect('/login')`. Si el rol no está en la whitelist, `redirect('/admin')`. Como llegamos hasta acá, la sesión está OK.

### 10.4 Validación de input

```ts
const desc = params.descripcion.trim();
if (!desc) return { error: 'La descripción es obligatoria' };
```

Validación inline simple. Para casos más complejos (radicación, edición de afiliación) se usaría `Schema.safeParse(...)`.

### 10.5 Lectura previa para audit y para regla de negocio

```ts
const inc = await prisma.incapacidad.findUnique({
  where: { id: incapacidadId },
  select: { id: true, estado: true, consecutivo: true, sucursalId: true, cotizante: { select: { ... } } },
});
if (!inc) return { error: 'Incapacidad no encontrada' };

if (inc.estado === 'TRASLADO_A_JURIDICO' || inc.estado === 'EN_PROCESO_JURIDICO') {
  return { error: 'Este caso está en flujo jurídico. Solo el área legal puede gestionarlo...' };
}
```

Regla: una vez en flujo jurídico, soporte no puede gestionar (decisión Q3).

### 10.6 Transacción Prisma

```ts
const cambio =
  params.nuevoEstado && params.nuevoEstado !== inc.estado ? params.nuevoEstado : undefined;

await prisma.$transaction(async (tx) => {
  if (cambio) {
    await tx.incapacidad.update({ where: { id: incapacidadId }, data: { estado: cambio } });
  }
  await tx.incapacidadGestion.create({
    data: {
      incapacidadId,
      accionadaPor: 'SOPORTE',
      nuevoEstado: cambio ?? null,
      descripcion: desc,
      userId,
      userName,
    },
  });
});
```

Forma callback porque la creación del `IncapacidadGestion` necesita "ver" el update aplicado dentro del mismo BEGIN/COMMIT. Si cualquiera de las dos operaciones falla, todo revierte.

### 10.7 Auditoría (fuera de la transacción)

```ts
if (cambio) {
  const labelEstado = cambio.replaceAll('_', ' ').toLowerCase();
  await auditarEvento({
    entidad: 'Incapacidad',
    entidadId: incapacidadId,
    accion: 'GESTIONAR_SOPORTE',
    entidadSucursalId: inc.sucursalId,
    descripcion: `Soporte cambió ${inc.consecutivo} a ${labelEstado} · ${desc.slice(0, 80)}`,
    cambios: {
      antes: { estado: inc.estado },
      despues: { estado: cambio },
      campos: ['estado'],
    },
  });
}
```

`auditarEvento` (en `lib/auditoria/with-audit.ts:50-66`) delega a `registrarAuditoria` que captura actor + IP y persiste en `AuditLog`. Sólo se audita si hubo cambio de estado — las notas sin cambio quedan en `IncapacidadGestion` (granularidad finer-grained, no se duplican). Se pone fuera de la transacción a propósito: un fallo en bitácora **no debe romper la operación** (ver `lib/auditoria/registrar.ts:105-109`).

### 10.8 Notificación

```ts
void emitirNotificacion({
  tipo: 'ALIADO_GESTION_INCAPACIDAD',
  destinoSucursalId: inc.sucursalId,
  titulo: `Soporte gestionó incapacidad · ${inc.consecutivo}`,
  mensaje: `${nombreCot} (${inc.cotizante.numeroDocumento}) · → ${labelEstado}`,
  href: '/admin/administrativo/incapacidades?tab=historico',
  metadatos: { incapacidadId, consecutivo: inc.consecutivo, nuevoEstado: cambio ?? null },
});
```

`void` porque la notificación es fire-and-forget. El aliado dueño de la sucursal verá el badge en su nav (`/api/notificaciones/count` polling).

### 10.9 Revalidación + retorno

```ts
revalidatePath('/admin/soporte/incapacidades');
revalidatePath('/admin/administrativo/incapacidades');
return { ok: true };
```

Next invalida el cache de las dos rutas afectadas. El cliente recibe el `ActionState`, el form muestra el toast de éxito y, gracias a la revalidación, el listado se re-renderiza con el estado nuevo en la próxima navegación o automáticamente si está en una ruta cacheada.

### 10.10 Camino del error a Sentry

Si `prisma.$transaction` lanza (DB caída, deadlock retry agotado), el error sale del `try` implícito de la action. Next lo captura y dispara `onRequestError` (de `instrumentation.ts`) con `routeType: 'action'`. Si `SENTRY_DSN` está seteado, `captureError(err, { scope: 'next-request-error', method: 'POST', path: '/admin/soporte/incapacidades/<id>', ... })`. El cliente recibe un 500 genérico (Next no expone el mensaje del error).

Cualquier `logger.error({ err, ...ctx }, 'mensaje')` que se haya emitido durante el flujo dispara también el hook `forwardToSentry` (`lib/logger.ts:39-62`) con el mismo error.

---

## Apéndice A — Route Handlers (no-Server-Actions)

Inventario de `route.ts` en `apps/web/src/app/api/`:

- **Auth**: `auth/[...nextauth]/route.ts` — handlers de NextAuth.
- **Health**: `health/route.ts` — público, retorna estado del sistema.
- **Búsqueda global**: `buscar/route.ts`.
- **Cartera**: `cartera/[id]/export.xlsx/route.ts`, `cartera/[id]/pdf/route.ts`.
- **Colpatria**: `colpatria/jobs/[id]/pdf/route.ts`, `colpatria/procesar-ahora/route.ts`.
- **Comprobantes**: `comprobantes/[id]/pagosimple-pdf/route.ts`.
- **Cotizantes**: `cotizantes/template.csv/route.ts`.
- **Incapacidades**: `incapacidades/[id]/documentos/[docId]/route.ts` — descarga con chequeo de `puedeDescargarDocConfidencial` para documentos jurídicos.
- **Movimientos detalle**: `mov-detalle/[id]/documentos/[docId]/route.ts`.
- **Notificaciones**: `notificaciones/route.ts`, `notificaciones/count/route.ts`, `notificaciones/leer-todas/route.ts`, `notificaciones/[id]/leer/route.ts`.
- **Planos**: `planos/[id]/plano.txt/route.ts`.
- **Soporte AF**: `soporte-af/[id]/documentos/[docId]/route.ts`.
- **Transacciones export**: `transacciones/cartera/excel/route.ts`, `transacciones/cuadre/excel/route.ts`.

Estos handlers comparten la misma capa de servicios, helpers de auth, scope y auditoría que las Server Actions; la única diferencia es que devuelven `Response` con `Content-Type` específico (`application/pdf`, `text/csv`, `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`, `text/plain`).

## Apéndice B — Configuración y variables de entorno relevantes

- `DATABASE_URL` — Postgres (Neon en dev).
- `AUTH_SECRET` — secret de NextAuth.
- `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN` — opcional, activa Sentry.
- `LOG_LEVEL` — pino (default `info`).
- `PRISMA_LOG` — `query` o `info` para debug.
- `PILA_QUERY_PROBE`, `SLOW_QUERY_WARN_MS`, `SLOW_QUERY_CRITICAL_MS` — slow query log opt-in.
- `PAGOSIMPLE_BASE_URL` (+ credenciales de PagoSimple) — operador externo.
- `UPLOADS_DIR` — directorio raíz de adjuntos (cartera, incapacidades, soporte-af).
