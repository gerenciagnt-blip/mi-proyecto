# 7. Bot Colpatria ARL — Automatización del portal AXA

> Documentación técnica del único bot del sistema. Vive en `apps/bot-colpatria/`. Es un proceso Node separado del `apps/web` (Next.js): se invoca desde la línea de comandos vía `tsx` y corre en GitHub Actions como tarea programada.

---

## 7.1 Visión y propósito

El **Bot Colpatria** es un automatizador RPA (Robotic Process Automation) construido sobre **Playwright**. No es un chatbot conversacional: es un agente que abre un navegador headless Chromium y opera el portal web del operador ARL **AXA Colpatria** (`aplicaciones.axacolpatria.co` y `portalarl.axacolpatria.co`) en nombre de cada empresa aliada.

**¿Por qué existe?**

El portal AXA Colpatria no expone API pública para registrar afiliaciones. La única manera de afiliar un cotizante a la ARL es entrando manualmente al portal, eligiendo Aplicación → Perfil → Empresa → Afiliación, navegando a _Ingreso Individual_, llenando 32 campos en dos pasos (`formConsulta` + `formIngreso`) con cascadas AJAX dependientes, y descargando el PDF de comprobante. Una afiliación manual toma **5 minutos o más** por cotizante.

El volumen real del proyecto registra entre **1.500 y 2.100 afiliaciones por mes** distribuidas en varias empresas aliadas. Hacer ese volumen a mano es inviable: el bot lo automatiza extremo a extremo.

**Alcance actual.** El bot solo soporta:

- **Tipo de evento**: `CREAR` (afiliación nueva). El evento `REACTIVAR` está modelado en el payload pero no implementado en el portal — un job con `evento: 'REACTIVAR'` se marca `FAILED` con mensaje `Evento "REACTIVAR" no implementado` (`apps/bot-colpatria/src/commands/procesar.ts:244-254`).
- **Modalidad**: `DEPENDIENTE`. Las afiliaciones independientes no van por Colpatria y se filtran en el disparador (`apps/web/src/lib/colpatria/disparos.ts:148`).
- **Jornada**: solo `completa = true`. Si llegara `false`, `llenarYCrearEmpleado` lanza explícitamente: `"Jornada parcial no implementada — el bot solo procesa 'completa=Sí'"` (`apps/bot-colpatria/src/pages/ingreso-individual.ts:389`).

---

## 7.2 Stack técnico

Definido en `apps/bot-colpatria/package.json`:

| Componente         | Paquete                | Versión              |
| ------------------ | ---------------------- | -------------------- |
| Browser automation | `playwright`           | `^1.49.0`            |
| CLI parser         | `commander`            | `^13.0.0`            |
| Logger             | `pino` + `pino-pretty` | `^9.6.0` / `^13.0.0` |
| Telemetría         | `@sentry/node`         | `^10.50.0`           |
| Runner TypeScript  | `tsx`                  | `^4.19.2`            |
| Tests              | `vitest`               | `^4.1.5`             |
| Carga de `.env`    | `dotenv-cli`           | `^8.0.0`             |

Dependencias internas: `@pila/db` (cliente Prisma compartido) y `@pila/core` (constantes `APP_NAME`/`APP_VERSION`). El paquete es ESM puro (`"type": "module"`) y privado (`"private": true`).

El bot **no importa nada de `apps/web`** — son dos apps diferentes del monorepo y la frontera está marcada de forma deliberada. Cuando hay lógica que ambas necesitan (cifrado, resolución de configuración por nivel de riesgo, shape del payload), se replica explícitamente con un comentario marcando que debe mantenerse en sincronía.

---

## 7.3 Estructura de archivos

```
apps/bot-colpatria/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts                 # entry CLI Commander (7 comandos)
    ├── commands/
    │   ├── procesar.ts          # procesa N jobs PENDING (núcleo del bot)
    │   ├── login-auto.ts        # cron 7 AM Lun–Sáb: login proactivo
    │   ├── logout-auto.ts       # cron 9 PM: borra sesiones cacheadas
    │   ├── limpiar-pdfs.ts      # cron 3 AM: TTL 3 días para PDFs
    │   ├── test-ingreso.ts      # debug end-to-end de un job/afiliación
    │   ├── test-login.ts        # debug solo del login
    │   └── watchdog.ts          # auto-corrección de cola standalone
    ├── pages/
    │   ├── login.ts             # paso /Autenticacion + /Bienvenida
    │   └── ingreso-individual.ts # form 32 campos + descarga PDF
    └── lib/
        ├── browser.ts           # abrirBrowser/nuevoContext + esperarSinOverlay
        ├── crypto.ts            # AES-256-GCM (espejo de apps/web)
        ├── logger.ts            # pino con redact + hook a Sentry
        ├── payload-form.ts      # función pura PILA → AXA
        ├── payload-form.test.ts # 34 tests (vitest)
        ├── sentry.ts            # captureError/captureMessage/flushSentry
        ├── session.ts           # cargar/guardar/invalidar storageState
        ├── storage.ts           # guardar PDF + validar UPLOADS_DIR
        └── watchdog.ts          # zombies + reciclar RETRYABLE + alertas
```

---

## 7.4 Comandos detallados

Todos los comandos se invocan vía `pnpm --filter @pila/bot-colpatria <comando>` o, dentro de la app, `pnpm bot-colpatria <comando>`. El entry `src/index.ts` envuelve cada uno en `runWithSentry()` que captura excepciones no manejadas, las manda a Sentry y hace `flushSentry()` antes de `process.exit()` — necesario porque los runners de GitHub Actions matan el proceso al terminar y los eventos de Sentry pendientes se pierden si no se hace flush explícito.

### `procesar` — núcleo del bot

```
pnpm bot-colpatria procesar [--limite <n>] [--empresa-id <id>]
```

Default `--limite 20` jobs por corrida.

**Cron**: `0/15 13-22 * * 1-5` (cada 15 min, 13:00–22:45 UTC = 8 AM – 5:45 PM Colombia, lunes a viernes). Definido en `.github/workflows/bot-colpatria-procesar.yml`. Timeout del job: 25 min (`timeout-minutes: 25`).

**Flujo paso a paso** (`apps/bot-colpatria/src/commands/procesar.ts`):

1. **Validación `UPLOADS_DIR`** (no bloqueante) — corre `validarUploadsDirOAlertar` para detectar si el path apunta a un volumen efímero del runner, lo que haría que los PDFs guardados se borren al terminar el job. Si detecta riesgo, manda mensaje a Sentry y sigue.
2. **Watchdog preventivo** — corre `runWatchdog()` antes de tomar jobs nuevos: revive zombies, recicla `RETRYABLE` listos, detecta tasa anormal de fallos. Si falla, solo loguea y sigue (no bloquea).
3. **Toma de jobs con lock** — usa `prisma.$transaction` con `SELECT … FOR UPDATE SKIP LOCKED` para evitar carrera entre dos workers que se solapen en el cron. Marca los seleccionados como `RUNNING` dentro de la misma transacción.
4. **Agrupación por empresa** — para reusar la sesión: una sola sesión Playwright por empresa que se aplica a todos sus jobs en la corrida.
5. **Validación de configuración de empresa** — antes de abrir browser, exige que estén seteados los 10 campos `colpatria*` requeridos. Si falta algo: marca todos los jobs de esa empresa como `RETRYABLE` (`retryable=true` porque el ADMIN puede arreglarlo configurando la empresa). Si la descifrado del password falla: `FAILED` definitivo.
6. **Login con cache de sesión** — `cargarSesion` lee `ColpatriaSesion`; si existe y `expiraEn > now`, prueba con `sesionValida(page)` (visita una URL del portal y mira si rebota a `/Autenticacion`). Si la sesión es válida la reusa; si no, invalida y hace `loginCompleto`.
7. **Por cada job**:
   - `validarPayloadParaIngreso` — si hay errores: `FAILED` no-retryable (requiere fix del ADMIN en PILA).
   - `resolverConfig(empresa, payload.afiliacion.nivelRiesgo)` — espejo de `apps/web/src/lib/colpatria/config-resolver.ts`. Si el nivel tiene mapeo en `EmpresaNivelRiesgo` lo aplica; si no, cae al default de la empresa.
   - `prepararCamposIngreso(payload, config)` — conversión pura PILA → AXA (`apps/bot-colpatria/src/lib/payload-form.ts`).
   - `verificarEmpleado(page, campos.consulta)` — paso BUSCAR. Tres resultados: `NUEVO` / `EXISTE` / `ERROR`.
   - Si `NUEVO`: `llenarYCrearEmpleado(page, campos)` llena los 32 campos, hace submit, y si fue OK intenta capturar el PDF.
   - Si tiene `pdfBuffer`: `guardarPdfComprobante` lo persiste a `<UPLOADS_DIR>/colpatria/<empresaId>/<YYYY-MM>/<jobId>-<hash12>.pdf`.
   - Marca el job: `marcarOk` (status `SUCCESS`, `pdfPath`, `durationMs`) o `marcarFallo` (`RETRYABLE` si transitorio, `FAILED` si definitivo).
8. **Bitácora cruzada** — `registrarGestionBot` busca la `SoporteAfiliacion` vinculada a la afiliación del job y le agrega una `SoporteAfGestion` con `accionadaPor='BOT'`, `userName='Bot Colpatria'`, descripción según el resultado. Es informativa y no bloqueante: si falla, solo se loguea.

**Recuperación de sesión expirada**: si en medio del procesamiento `verificarEmpleado` retorna `ERROR` con mensaje `Sesión expiró`, el catch del bucle de jobs lanza `'SESION_EXPIRADA'`, captura ese error específico, marca el job como `PENDING` para que el siguiente run lo retome y rompe el bucle de la empresa actual (`procesar.ts:333-345`).

**Exit code**: `0` si todos los jobs OK, `1` si hubo al menos un fallido.

### `login-auto` — login programado de la mañana

```
pnpm bot-colpatria login-auto
```

**Cron**: `0 12 * * 1-6` = 12:00 UTC = **7:00 AM hora Colombia, Lun–Sáb** (`.github/workflows/bot-colpatria-login-auto.yml`).

Itera todas las empresas con `active=true`, `colpatriaActivo=true` y los selectores AXA completos. Para cada una:

1. Descifra el password.
2. Abre browser fresco (no reusa cache — el cron es el que establece la sesión del día).
3. Ejecuta `loginCompleto` y verifica con `sesionValida` que llegó al portal interno.
4. Guarda el `storageState` cifrado en `ColpatriaSesion` con `expiraEn = now + 8h`.
5. Si falla: invalida la sesión vieja con `.catch(() => {})` para no dejar credenciales caducas y reporta en el resumen final.

Procesamiento **secuencial** (no paralelo) — abrir N browsers en paralelo agotaría memoria del runner y AXA puede leerlo como tráfico sospechoso. Exit code `0` si todo OK, `1` si al menos una empresa falló (las demás sí se cachearon).

### `logout-auto` — limpieza nocturna

```
pnpm bot-colpatria logout-auto
```

**Cron**: `0 2 * * 0,2,3,4,5,6` = 2:00 UTC = **9:00 PM hora Colombia** (`.github/workflows/bot-colpatria-logout-auto.yml`). Nota: el cron incluye los días `0,2,3,4,5,6` (domingo + martes a sábado).

No abre browser. Solo borra los registros de `ColpatriaSesion` para todas las empresas. El cierre real en AXA ocurre por inactividad server-side. Lo que importa es:

- Dejar la BD limpia al final del día.
- Forzar al `login-auto` siguiente a hacer login fresco — así las credenciales se prueban a diario y cualquier cuenta bloqueada se detecta temprano.

Exit code siempre `0` (operación idempotente; "sin sesiones" no es error).

### `limpiar-pdfs` — retención de evidencia

```
pnpm bot-colpatria limpiar-pdfs --dias 3 [--dry-run]
```

**Cron**: `0 8 * * *` = 8:00 UTC = **3:00 AM hora Colombia, todos los días** (`.github/workflows/bot-colpatria-limpiar-pdfs.yml`).

Política decidida con el operador: 3 días bastan para que el aliado verifique el comprobante; después se considera evidencia histórica y libera disco. Volumen estimado en estado estable: ~200 PDFs en disco simultáneamente (vs ~6.000+ sin retención).

Para cada `ColpatriaAfiliacionJob` con `status=SUCCESS`, `pdfPath` no nulo, `pdfArchivedAt` nulo y `createdAt < now - dias`:

1. Resuelve el path absoluto; si contiene `..` o sale fuera de `UPLOADS_DIR` lo omite (path traversal defensivo).
2. `unlink(abs)`. Si el archivo ya no existe (`ENOENT`), cuenta como `yaInexistentes` y sigue.
3. Hace `update` del job con `pdfArchivedAt = now`. El registro permanece en BD como evidencia histórica; lecturas posteriores del PDF deben retornar `410 Gone`.

Modo `--dry-run` solo lista qué borraría, no toca filesystem ni BD. Exit codes: `0` OK, `1` errores parciales, `2` error fatal antes de iterar.

### `test-login` — debug aislado del login

```
pnpm bot-colpatria test-login --empresa-id <id> [--screenshot <path>] [--keep-open]
```

No procesa jobs. Carga la config de UNA empresa, prueba la sesión cacheada si existe (modo verificación), si no o si falla hace login fresco, guarda screenshot del estado final y actualiza `ColpatriaSesion` si todo salió bien. Sirve para validar que las credenciales y los selectores AXA configurados en `/admin/empresas/[id]/colpatria` son correctos. Soporta `COLPATRIA_HEADLESS=false` en el entorno para ver el browser. Exit codes: `0` OK, `1` config incompleta, `2` empresa no encontrada o sin credenciales, `3` login falló.

### `test-ingreso` — debug end-to-end

```
pnpm bot-colpatria test-ingreso --empresa-id <id> --job-id <id>
pnpm bot-colpatria test-ingreso --empresa-id <id> --afiliacion-id <id>
pnpm bot-colpatria test-ingreso --empresa-id <id> --documento <numDoc>
```

Tres modos para identificar el payload: por `job-id` real (más preciso), por `afiliacion-id` (construye payload on-the-fly replicando `dispararColpatriaSiAplica`), o por `documento` del cotizante (resuelve la afiliación `ACTIVA` más reciente del cotizante en la empresa). Útil para probar antes de que el trigger automático cree el job real.

Replica el flujo completo: login (con reuso de sesión) → `verificarEmpleado` → `llenarYCrearEmpleado` → captura PDF. Permite override CLI de `--eps-codigo-axa` y `--afp-codigo-axa` cuando los códigos AXA no están aún configurados en el catálogo. **Crítico**: NO modifica el job en BD — es solo debug, deja screenshot y guarda el PDF si lo hubo, pero no toca el estado del `ColpatriaAfiliacionJob`.

### `watchdog` — corrección manual de cola

```
pnpm bot-colpatria watchdog [--dry-run] [--max-intentos <n>]
```

Standalone del watchdog (que ya corre embebido al inicio de cada `procesar`). Útil para pruebas locales (`--dry-run`), debug ad-hoc cuando el operador sospecha jobs colgados, o para programar cron dedicado más frecuente que `procesar`. Reporta zombies revividos, RETRYABLE→PENDING, agotados, y tasa de fallos en ventana 30 min. Exit `1` si hay agotados o tasa anormal (señal operacional para que el workflow alerte).

---

## 7.5 Flujo conversacional con el portal AXA

### Login (`apps/bot-colpatria/src/pages/login.ts`)

URLs hardcodeadas en el módulo (única ubicación con URLs literales del portal):

- `URL_LOGIN`: `https://aplicaciones.axacolpatria.co/Seguridad/Autenticacion/Autenticacion`
- `URL_BIENVENIDA`: `https://aplicaciones.axacolpatria.co/Seguridad/Autenticacion/Bienvenida`
- `URL_PORTAL_BASE`: `https://portalarl.axacolpatria.co/PortalARL/`

**Paso 1: credenciales.** Los selectores son tolerantes a cambios de `name=`/`id` que AXA hace entre versiones:

```ts
"input[placeholder='USUARIO'], input[placeholder='Usuario'], input[name='Usuario'], input[name='username']";
```

Submit en cascada: primero `Enter` en el campo password (más resiliente porque depende solo del handler nativo del form, no del tag del CTA); si en 5 s la URL no cambió, fallback con click en `text=/iniciar.{0,3}sesi[óo]n/i` (regex case-insensitive). Si tras el submit la URL sigue siendo `/Autenticacion/Autenticacion`, lanza `Login rechazado por el portal — credenciales inválidas o cuenta bloqueada`.

**Paso 2: pantalla `/Bienvenida`.** Cuatro selects encadenados con AJAX (`GetDatosUsuario`):

1. `#ddlAplicaciones` ← `cfg.aplicacion` (típicamente `"ARP"`).
2. `#ddlPerfiles` ← `cfg.perfil` (`"OFI"` u `"OPE"`).
3. `#ddlEmpresas` ← `cfg.empresaIdInterno` (recargado vía AJAX tras seleccionar perfil).
4. `#ddlAfiliaciones` ← `cfg.afiliacionId` (recargado tras empresa).

Antes de cada `selectOption` hay un `waitForFunction` que espera a que el `<select>` tenga al menos una opción real, con timeout 15 s. Como AXA usa Bootstrap-select que oculta el `<select>` nativo con CSS, todos los `selectOption` van con `{ force: true }` para no chocar con el chequeo de visibilidad de Playwright.

Entre selects, `esperarSinOverlay(page)` aguarda a que desaparezca el spinner `text=Cargando` que el portal muestra durante AJAX.

**Paso 3: click `Ingresar`.** El botón es `<input type='submit'>`, no `<button>`, así que el selector cubre las tres formas. Tras el click se espera `networkidle` con 30 s y se valida que la URL final no contenga `/Autenticacion/` — si quedamos ahí, lanza `SegundoPaso no nos llevó al portal — quedamos en {urlFinal}. ¿Empresa/afiliación incorrecta?`.

**Verificación de sesión** (`sesionValida`): visita `URL_PORTAL_BASE + EmpleadoDependiente/IngresoIndividual` y retorna `true` si la URL final no contiene `/Autenticacion/`. Más confiable que mirar cookies — el portal puede tenerlas pero invalidadas server-side.

### Ingreso individual (`apps/bot-colpatria/src/pages/ingreso-individual.ts`)

URL única: `https://portalarl.axacolpatria.co/PortalARL/EmpleadoDependiente/IngresoIndividual`.

#### `verificarEmpleado` — paso BUSCAR

1. Navega a la URL con `waitUntil: 'networkidle'`. Si la URL queda en `/Autenticacion/` retorna `ERROR` con mensaje `Sesión expiró antes del BUSCAR`.
2. Llena `#TipoIdentificacionSelect` (mapeado PILA→AXA) y `#txtNumeroDocumento`.
3. Click `BUSCAR` con selector múltiple: `button:has-text('BUSCAR'), button:has-text('Buscar'), input[type='submit'][value='BUSCAR']`.
4. `waitForLoadState('networkidle', 30000)` + `esperarSinOverlay` + `waitForTimeout(1500)` (margen para animaciones CSS de modales).
5. **Detección PRIORITARIA del modal "ya existe"** — _antes_ de leer `ID_OPERACION`. Lee `extraerMensajeError` y si matchea `/ya existe/i`, cierra el modal con `cerrarModalAceptar` y retorna `{ kind: 'EXISTE', idOperacion: '?' }`. Esta prioridad es deliberada: AXA NO rellena `ID_OPERACION` cuando el empleado ya existe, simplemente bloquea con un modal "Información Importante".
6. Si no hubo modal, espera a que `#txtPrimerNombre` sea visible (timeout 8 s). Si no se renderea, retorna `ERROR`.
7. Lee `#ID_OPERACION` con `inputValue()`. Si es `"0"` o `""` → `NUEVO`; cualquier otro valor → `EXISTE` con ese ID. El bot solo procesa `NUEVO`; `EXISTE` se marca FAILED no-retryable con mensaje "Empleado ya existe en AXA (ID_OPERACION=…); reactivación no implementada".

#### `llenarYCrearEmpleado` — los 32 campos

Distribuidos en cuatro bloques:

**Datos personales**: `#txtPrimerNombre`, `#txtSegundoNombre`, `#txtPrimerApellido`, `#txtSegundoApellido`, `#dtpFechaNacimiento` (vía `fillFecha`), `#GeneroSelect`, `#estadoCivilSelect` (opcional).

**Domicilio + contacto**: `#DepartamentoSelect` (vía `selectByLabel` con match flexible PILA→AXA), espera a `#CiudadSelect` poblado por la cascada AJAX, `#CiudadSelect` (también `selectByLabel`), `#txtDireccionDomicilio` (id estable; el `name` del HTML tiene typo `DireccionDocmicilio`), `#txtTelefono`, `#txtCelular`, `#txtEmail`.

**Datos laborales**: `#dtpFechaIngreso`, `#tipoSalarioSelect` (quemado `"1"`), `#Salaraio` (sí, typo `Salaraio` preservado del HTML AXA; el `name` es `ValorSalario`), `#txtCargo`, cascada `#EmpresasSelect` → `#SucursalSelect` → `#CentroTrabajoSelect`, `#EpsAfiliado`, `#AfpAfiliado`, `#tipoAfiliacionEmpresasSelect`, cascada `#tipoGrupoOcupacionSelect` → `#tipoOcupacionEmpresasSelect`, `#modalidadTrabajoSelect` (quemado `"01"`), `#altoRiesgoSelect` (quemado `"0000001"`).

**Jornada**: radio `#rbJornadaIngIndivDependSi` o `#rbJornadaIngIndivDependNo` (este último lanza error porque jornada parcial no está implementada).

**Submit**: click sobre `#btnModificar, button:has-text('Ingresar Empleado'), input[value='Ingresar Empleado']` con `Promise.all` de `waitForLoadState('networkidle', 60000)`. Después del submit se hace `esperarSinOverlay(page, 30000)` + `waitForTimeout(1500)` para que las animaciones de modal terminen.

**Heurística de éxito**:

- Si la URL cambió a algo distinto de `IngresoIndividual` → probable éxito.
- Si seguimos en `IngresoIndividual` y hay mensaje matching `/exitos[ao]|registrad|guardad|transacci[oó]n.*exit/i` → éxito.
- Si seguimos en `IngresoIndividual` sin mensaje → ambiguo, marca `ok=false`.

#### Captura del PDF de comprobante

Tras submit OK, el bot busca el botón con un selector amplio que cubre _Imprimir Comprobante_, _Comprobante_, _Imprimir_, _Descargar_, formas con `form[action*='ImprimirCreacionIndividual']` y los IDs `#btnImprimir`/`#btnImprimirComprobante`.

**Estrategia network-layer** (no `download` event): registra un listener `context.on('response')` que captura la primera response con `Content-Type: application/pdf` (o URL terminada en `.pdf`) Y firma binaria `%PDF-` válida (primeros 4 bytes = `0x25 0x50 0x44 0x46`). Esto cubre tres casos imposibles de manejar con `page.waitForEvent('download')`:

- Endpoint POST que renderiza inline en el Chrome PDF viewer (no dispara download).
- PDF servido sin header `Content-Disposition: attachment`.
- HTML mal-tipado como `application/pdf` (que se descarta por la firma).

**Fallback download tradicional**: si en 20 s el listener no capturó nada pero Playwright sí emitió un download event, lee el archivo de `download.path()` y valida la firma. Si todo falla, devuelve `null` y el caller marca un warning pero deja el job como `SUCCESS` igual — el operador puede re-imprimir manualmente desde el portal.

#### Modal "Información Importante" + "Empleado vigente"

`extraerMensajeError` lee texto de candidatos en este orden de prioridad: `.alert-danger`, `.alert-warning`, `.alert-success`, `[class*="validation-summary-errors"]`, `#mensaje`, `#msj`, `.modal.show .modal-body`, `.modal.in .modal-body`, `[role="dialog"][aria-hidden="false"] .modal-body`, `.toast-message`, `.notification`. Devuelve los primeros 500 caracteres. `cerrarModalAceptar` busca un botón "ACEPTAR"/"Aceptar" dentro del modal abierto y le da click si existe — silencioso por diseño.

---

## 7.6 Schema relacionado (Prisma)

Definido en `packages/db/prisma/schema.prisma`.

### `ColpatriaAfiliacionJob` (líneas 2545–2607)

Cola de trabajos del bot. Campos:

- `id`, `afiliacionId`, `empresaId` (con FK + `onDelete: Cascade`).
- `status: ColpatriaJobStatus` con enum `PENDING | RUNNING | SUCCESS | FAILED | RETRYABLE` (líneas 2508–2531).
- `intento Int @default(1)` — para distinguir reintentos.
- `payload Json` — snapshot del estado de la afiliación al momento del disparo (shape definido en `ColpatriaPayload`).
- `startedAt`, `finishedAt`, `durationMs` — telemetría.
- `pdfPath String?` — relativo a `UPLOADS_DIR`, formato `colpatria/<empresaId>/<YYYY-MM>/<jobId>-<hash12>.pdf`.
- `pdfArchivedAt DateTime?` — cuando el cron `limpiar-pdfs` borra el archivo, marca este timestamp y deja `pdfPath` intacto. Lecturas posteriores deben retornar `410 Gone`.
- `screenshotsPaths Json?` — array de paths a screenshots por paso.
- `error String?` y `errorDetalle Json?` — diagnóstico.

Índices: `[status, createdAt]`, `[afiliacionId]`, `[empresaId, status]`. Tabla SQL: `colpatria_afiliacion_jobs`.

### `ColpatriaSesion` (líneas 2485–2506)

Sesión cacheada del portal por empresa. Una fila por empresa (`@unique` sobre `empresaId`, FK con cascade).

- `cookiesEnc String` — JSON `storageState` de Playwright cifrado con AES-256-GCM (`COLPATRIA_ENC_KEY`).
- `expiraEn DateTime?` — TTL conservador de 8 h definido en `apps/bot-colpatria/src/lib/session.ts:28` (`SESSION_TTL_MS = 8 * 60 * 60 * 1000`). Si null o pasó, hacer login fresco.
- `createdAt`, `updatedAt`.

Tabla: `colpatria_sesiones`.

### Campos `colpatria*` en `Empresa`

13 campos en total (`packages/db/prisma/schema.prisma:352-426`):

- **Activación**: `colpatriaActivo Boolean @default(false)`.
- **Credenciales**: `colpatriaUsuario String?`, `colpatriaPasswordEnc String?` (AES-256-GCM), `colpatriaPasswordSetAt DateTime?` (para detectar logins que fallan tras rotación).
- **Selectores `/Bienvenida`**: `colpatriaAplicacion String? @default("ARP")`, `colpatriaPerfil String? @default("OFI")`, `colpatriaEmpresaIdInterno String?` (option value de `#ddlEmpresas`, ~6 dígitos asignados por AXA, NO el NIT), `colpatriaAfiliacionId String?` (option value de `#ddlAfiliaciones`).
- **Defaults del form**: `colpatriaCodigoSucursalDefault`, `colpatriaTipoAfiliacionDefault`, `colpatriaGrupoOcupacionDefault`, `colpatriaTipoOcupacionDefault`. `ModalidadTrabajo` y `TareaAltoRiesgo` son hardcoded en el bot (`"01"` Presencial, `"0000001"` No aplica).

Adicionalmente, `EmpresaNivelRiesgo` tiene tres campos de override por nivel: `colpatriaCentroTrabajo`, `colpatriaGrupoOcupacion`, `colpatriaTipoOcupacion` — usados por `resolverConfig` para mapear el `nivelRiesgo` de la afiliación a centros/grupos/ocupaciones específicos cuando la empresa lo requiere.

Por su parte, `EntidadSgss` tiene `codigoAxa String?` que el bot lee para `epsCodigoAxa` y `afpCodigoAxa` del payload.

---

## 7.7 Watchdog (auto-recovery)

Implementado en `apps/bot-colpatria/src/lib/watchdog.ts`. Tres etapas idempotentes y baratas (~50 ms total) que se ejecutan al inicio de cada `procesar` antes de tomar nuevos jobs.

### Etapa 1: revivir zombies

`revivirJobsZombies` — busca jobs con `status='RUNNING'` y `updatedAt < now - 30 min` (constante `ZOMBIE_TIMEOUT_MS = 30 * 60 * 1000`, justo 2× el `timeout-minutes: 25` del workflow). Los marca como `RETRYABLE` con mensaje `Watchdog: job revivido (RUNNING > 30 min sin progreso)`. Casos típicos: `uncaughtException` de Playwright, OOM del runner, `kill -9` de GH Actions por timeout. Si encuentra alguno, manda `captureMessage` a Sentry con nivel `warning`.

### Etapa 2: reciclar RETRYABLE con backoff exponencial

`reciclarRetryables` — recorre todos los jobs `RETRYABLE` y aplica:

- Si `intento >= maxIntentos` (default 5, configurable vía `--max-intentos`) → `FAILED` definitivo con mensaje "Máximo de N intentos excedido". Manda alerta Sentry porque agotar intentos típicamente indica problema sistémico.
- Si no, calcula cooldown como `min(60 min, 2^intento min)`. Tabla:

| intento | cooldown     |
| ------- | ------------ |
| 1       | 2 min        |
| 2       | 4 min        |
| 3       | 8 min        |
| 4       | 16 min       |
| 5       | 32 min       |
| 6+      | 60 min (cap) |

Si `now - finishedAt >= cooldown`, mueve a `PENDING` con `intento += 1` y limpia `startedAt`/`finishedAt`. Si todavía está en cooldown, lo deja.

### Etapa 3: alertar fallos masivos

`alertarFallosMasivos` — ventana de 30 min (`VENTANA_FALLOS_MIN`). Cuenta jobs por status terminados en esa ventana y calcula `tasa = (FAILED + RETRYABLE) / total`. Si `total >= 5 && tasa > 0.5`, manda `captureMessage` con nivel `error`. El threshold de 5 jobs evita falsos positivos en horas valle. Detecta cambios de HTML en AXA, credenciales caducas masivas, o incidentes de infraestructura.

---

## 7.8 Convenciones aprendidas (lecciones durables del Sprint 8)

Decisiones de diseño que se mantuvieron por costo de aprendizaje real:

**Selectores resilientes — no `name=`/`id` solos.** AXA cambia atributos entre versiones del portal (a veces ofuscados). Los selectores combinan `placeholder` + `type` + texto visible: `input[placeholder='USUARIO'], input[placeholder='Usuario'], input[name='Usuario'], input[name='username']`. Para botones y CTAs, se prioriza el match por texto con regex case-insensitive: `text=/iniciar.{0,3}sesi[óo]n/i`.

**Validación binaria de PDFs.** Los primeros 4 bytes del buffer se comparan contra la firma `%PDF-` (`0x25 0x50 0x44 0x46`) antes de aceptar la response. Esto descarta HTML mal-tipado o redirects de sesión expirada que vuelven con `Content-Type` engañoso. Implementado en `descargarComprobante` (`apps/bot-colpatria/src/pages/ingreso-individual.ts:530-543`).

**`UPLOADS_DIR` absoluto compartido web↔bot.** Validado al inicio de `procesar` por `validarUploadsDirOAlertar` (`apps/bot-colpatria/src/lib/storage.ts:55-149`). Detecta paths efímeros de GH Actions (`/tmp`, `/home/runner/work`, `/home/runner/_work`, default `./uploads`) y manda alerta a Sentry. Sin esto, los PDFs se borran cuando termina el runner y el endpoint `/api/colpatria/jobs/[id]/pdf` devuelve 404 silencioso.

**Match flexible PILA → AXA Departamento/Ciudad.** AXA antepone código DIVIPOLA con guión: `"76-VALLE"` mientras PILA tiene `"Valle Del Cauca"`. Función `selectByLabel` aplica tres prioridades:

1. **Exacto**: igual normalizado (con o sin código antes del guión).
2. **Primera palabra**: la primera palabra del target coincide con la primera del option stripped.
3. **Substring**: contención bidireccional como último recurso.

Normalización: NFD + strip diacríticos + UPPERCASE + remove dots + collapse multi-spaces. Importante: el código dentro de `page.evaluate` no puede declarar funciones nombradas porque `tsx` con `keepNames` inyecta una llamada `__name()` que no existe en el browser — la normalización va inline cada vez (verboso pero seguro).

**Datepickers jQuery requieren `dispatchEvent('change')`.** El portal usa datepickers jQuery que ignoran los valores tipeados con `page.fill()` salvo que se dispare un evento `change` después. Helper `fillFecha` (`apps/bot-colpatria/src/pages/ingreso-individual.ts:49-55`):

```ts
await page.fill(selector, ddmmyyyy);
await page.evaluate((sel) => {
  const el = document.querySelector(sel) as HTMLInputElement | null;
  if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
}, selector);
```

**Bootstrap-select oculta `<select>` nativo.** AXA muestra el `<select>` con `display: none` y renderiza un `<button>` Bootstrap encima. Playwright detecta el nativo como invisible y rechaza `selectOption`. Solución: `selectOption(selector, value, { force: true })` en todos los `<select>` del portal (`selectByValue` y `selectByLabel`).

**"Ya existe empleado vigente" detectado PRIORITARIAMENTE.** Antes de leer `ID_OPERACION`. AXA no rellena ese campo cuando el empleado ya existe — bloquea con un modal "Información Importante". Si se intenta leer `ID_OPERACION` primero, se confunde un caso `EXISTE` con `NUEVO` o `ERROR`.

**Fecha de ingreso ajustada por regla AXA.** El portal exige fecha entre **mañana** (today + 1) y máximo 30 días después. `calcularFechaIngresoAxa` (`apps/bot-colpatria/src/lib/payload-form.ts:211-238`):

- Sin fecha PILA → mañana.
- Fecha PILA ≤ hoy → mañana (se ajusta y se loguea warning).
- Fecha PILA > hoy → respeta PILA.

Si la fecha PILA es muy lejana al futuro (>30 días), AXA igual la rechaza: el bot deja warning y el portal valida.

**El bot NO importa de `apps/web`.** Cuando hay lógica compartida (cifrado, resolver de config, shape del payload), se replica en ambos lados con un comentario claro. Los archivos `apps/bot-colpatria/src/lib/crypto.ts`, `payload-form.ts` (tipos `ColpatriaPayload`/`ConfigResuelta`) y la función `resolverConfig` interna en `procesar.ts` y `test-ingreso.ts` son réplicas explícitas. Si la divergencia se vuelve dolorosa, mover a `packages/colpatria-crypto` o similar.

---

## 7.9 Crypto y seguridad

`apps/bot-colpatria/src/lib/crypto.ts` — espejo deliberado de `apps/web/src/lib/colpatria/crypto.ts`. Dos helpers, `encrypt` y `decrypt`, cifran las credenciales y los cookies de sesión.

- **Algoritmo**: `aes-256-gcm` (AEAD, integridad incluida).
- **KDF**: `scryptSync(raw, SALT, 32)` con `SALT = 'pila-colpatria-v1'`. La key derivada se cachea en memoria del proceso.
- **IV aleatorio** de 12 bytes por cifrado (`randomBytes(12)`).
- **Formato serializado**: `<ivHex>:<authTagHex>:<cipherHex>`.
- **Variable de entorno**: `COLPATRIA_ENC_KEY`. Mínimo 16 caracteres. Si está vacía o corta, lanza `COLPATRIA_ENC_KEY no configurada o demasiado corta (mín 16 chars)`.

**Rotación = pérdida de acceso.** No hay esquema de re-encriptación con dos keys: si se cambia `COLPATRIA_ENC_KEY`, todos los `colpatriaPasswordEnc` y `cookiesEnc` ya almacenados quedan ilegibles. El procedimiento operativo es: cambiar la env, y luego un ADMIN re-captura todos los passwords desde `/admin/empresas/[id]/colpatria`. Las sesiones cacheadas se descartan al primer `decrypt` fallido (lo hace `cargarSesion` automáticamente).

**Redacción en logs.** `pino` está configurado con redact paths (`apps/bot-colpatria/src/lib/logger.ts:48-57`):

```
*.password, *.passwordHash, *.cookiesEnc, *.colpatriaPasswordEnc, headers.authorization
```

Todos esos campos se reemplazan por `[REDACTED]` en la salida del logger, evitando fugas accidentales en CI/Sentry.

**Hook a Sentry.** `forwardToSentry` se ejecuta para todos los logs con nivel ≥ 50 (error/fatal). Es lazy — solo carga `@sentry/node` si `SENTRY_DSN` está seteado. Si no, no-op. Diseño fire-and-forget para que un fallo de Sentry no bloquee el flujo del bot.

---

## 7.10 Retención de PDFs

Política decidida con el operador: **3 días** de retención en filesystem; metadata permanece en BD para siempre.

- **Cron**: `0 8 * * *` UTC = 3 AM Colombia, todos los días (`.github/workflows/bot-colpatria-limpiar-pdfs.yml`).
- **Comando**: `pnpm bot-colpatria limpiar-pdfs --dias 3`.
- **Acción por archivo**: `unlink` físico → `update { pdfArchivedAt: new Date() }`. `pdfPath` se conserva como evidencia histórica.
- **Defensa path traversal**: omite cualquier `pdfPath` con `..` o que resuelva fuera de `UPLOADS_DIR`.
- **Idempotencia**: si el archivo ya no existe (`ENOENT`), se cuenta `yaInexistentes` y se marca igual `pdfArchivedAt` en BD.
- **Volumen**: ~200 PDFs simultáneos en estado estable (vs ~6.000+ sin retención).

El endpoint web `/api/colpatria/jobs/[id]/pdf` (no documentado aquí) debe distinguir tres casos: `pdfPath` ausente → `404`; `pdfPath` presente y `pdfArchivedAt` null → servir el archivo; `pdfArchivedAt` fechado → `410 Gone` (recurso archivado, ya no disponible).

---

## 7.11 Triggers desde el web

`apps/web/src/lib/colpatria/disparos.ts` exporta `dispararColpatriaSiAplica(input: { evento, afiliacionId })`. Es invocada con `void` desde tres callsites en `apps/web/src/app/admin/base-datos/actions.ts`:

- Línea 601: tras `createAfiliacionAction` exitoso → `evento: 'CREAR'`.
- Línea 787 y 998: dos paths distintos de `updateAfiliacionAction` cuando se detecta transición INACTIVA→ACTIVA → `evento: 'REACTIVAR'`.

**Reglas de disparo** (todas deben cumplirse):

1. `modalidad === 'DEPENDIENTE'`.
2. `estado === 'ACTIVA'` después del save.
3. `empresa.colpatriaActivo === true`.
4. ARL es Colpatria — match por `arl.codigo` contra `['ARL-007', 'COLPATRIA', 'ARL-COLPATRIA']` o por `arl.nombre.toUpperCase().includes('COLPATRIA')`.

Si pasa los guards, construye un `ColpatriaPayload` con `schemaVersion: 1` y persiste un `ColpatriaAfiliacionJob` con status `PENDING`, `intento: 1`. **Nunca tira excepciones**: cualquier error se loguea y retorna `null`. El operador puede revisar la bitácora — un fallo del disparo nunca debe romper la operación principal de afiliación.

El payload es snapshot por diseño: si la afiliación cambia entre el disparo y el procesamiento del job, el bot sigue con lo que se capturó al disparo. Para reflejar cambios hace falta crear un job nuevo (típicamente desde `/admin/empresas/[id]/colpatria/jobs`).

---

## 7.12 Tests

- **Bot**: 34 tests `vitest` en `apps/bot-colpatria/src/lib/payload-form.test.ts` (suite global del proyecto: 39+ tests verdes en bot al 2026-04).
- **Función bajo test**: `prepararCamposIngreso` y los helpers puros (`mapearTipoDocumento`, `mapearGenero`, `validarPayloadParaIngreso`, `calcularFechaIngresoAxa`).
- **Estrategia**: fixtures `payloadBase` y `configBase` con datos realistas, `vi.useFakeTimers` + `vi.setSystemTime('2026-04-27T12:00:00Z')` para que `calcularFechaIngresoAxa` sea determinista.
- **Cobertura**: catálogo de tipos de documento (incluyendo RC/NIP que tiran), género con fallback `'M'`, longitudes máximas (truncamiento + warnings), ajuste de fecha de ingreso, formato de salario (entero, sin decimales), payloads inválidos (cargo vacío, sin email, sin dirección, sin género, sin fecha nacimiento).

Comando: `pnpm --filter @pila/bot-colpatria test` (o `pnpm typecheck` para chequeo TS).

**Lo que NO testea vitest**: los selectores de Playwright. Son frágiles por naturaleza (dependen del HTML real de AXA) y se validan solo end-to-end con `pnpm bot-colpatria test-login` y `pnpm bot-colpatria test-ingreso` contra el portal real, en modo `COLPATRIA_HEADLESS=false` para inspección visual cuando hay duda.

---

**Archivos referenciados**:

- `apps/bot-colpatria/package.json`
- `apps/bot-colpatria/src/index.ts`
- `apps/bot-colpatria/src/commands/{procesar,login-auto,logout-auto,limpiar-pdfs,test-ingreso,test-login,watchdog}.ts`
- `apps/bot-colpatria/src/pages/{login,ingreso-individual}.ts`
- `apps/bot-colpatria/src/lib/{browser,crypto,logger,payload-form,sentry,session,storage,watchdog}.ts`
- `apps/bot-colpatria/src/lib/payload-form.test.ts`
- `.github/workflows/bot-colpatria-{procesar,login-auto,logout-auto,limpiar-pdfs}.yml`
- `packages/db/prisma/schema.prisma` (modelos `Empresa`, `ColpatriaSesion`, `ColpatriaAfiliacionJob`, enum `ColpatriaJobStatus`)
- `apps/web/src/lib/colpatria/disparos.ts`
- `apps/web/src/app/admin/base-datos/actions.ts` (callsites del disparo)
