# APIs — Sistema PILA

> Referencia técnica de los endpoints REST y los Server Actions críticos. Esta
> es la documentación que un integrador externo o un auditor consulta para
> entender qué expone el sistema, con qué autenticación y qué garantías de
> seguridad ofrece. Toda la información proviene de la lectura directa del
> código fuente.
>
> Última actualización: **2026-05-17** (v2.1).

## Endpoints nuevos en v2.1

### `GET/POST /api/cron/colpatria-health`

Health check de la cola de jobs del bot Colpatria. Disparado por el
workflow `bot-colpatria-health-check.yml` cada 30 min en horario
laboral. Si hay jobs PENDING > 30 min o RUNNING > 15 min, el endpoint
los reporta como `error` al logger pino, que los reenvía
automáticamente a Sentry. Si la cola está sana, no se emite nada a
Sentry (no se quema cuota).

- **Auth**: `Authorization: Bearer <CRON_SECRET>` (o localhost en dev).
- **Returns**: JSON con snapshot completo de la cola para debugging.

### `POST /api/cron/backup-alert`

Webhook one-shot llamado solo cuando el workflow `db-backup.yml`
falla (`needs: backup` + `if: failure()`). Recibe
`{workflow, runUrl, step?, details?}` y loggea como `error` → forward
automático a Sentry.

- **Auth**: `Authorization: Bearer <CRON_SECRET>`.
- **Body**: JSON con detalle del fallo.

### Cambio de comportamiento en `/admin/planos`

El módulo paralelo `/admin/soporte/planillas-errores` se eliminó en
v2.1 (PR #29). La validación de planillas con errores PagoSimple
vive ahora dentro de `/admin/planos` como **tab "Validación"** con un
botón "Ver errores" por planilla. El endpoint
`POST inconsistenciasPlanillaPagosimpleAction` no cambió, solo migró
de carpeta.

## Convenciones generales

### Modelo de autenticación

Toda la superficie HTTP (excepto `/api/health` y `/api/auth/[...nextauth]`)
exige una sesión válida emitida por NextAuth v5 (JWT con cookie HTTP-only).
Los helpers de autorización viven en `apps/web/src/lib/auth-helpers.ts` y se
combinan así:

| Helper                                 | Comportamiento                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `requireAuth()`                        | Devuelve la sesión o redirige a `/login`.                                                                             |
| `requireStaff()`                       | Exige rol `ADMIN` o `SOPORTE`. Aliados (rol `ALIADO_OWNER`) reciben 403/redirect.                                     |
| `requireRole('ADMIN', 'SOPORTE', ...)` | Lista blanca explícita.                                                                                               |
| `getUserScope()`                       | Resuelve si la sesión es de tipo `STAFF` o `SUCURSAL` (con `sucursalId` adjunto) — base del aislamiento multi-tenant. |
| `puedeDescargarDocConfidencial()`      | Para documentos del flujo jurídico: solo `ADMIN` o `RolCustom` con permiso `soporte.juridico_confidencial`.           |

### Aislamiento por sucursal (scope)

Las cuentas de tipo `SUCURSAL` (aliados) solo pueden ver y descargar recursos
asociados a su `sucursalId`. Los endpoints aplican filtros explícitos:

- En cotizantes/incapacidades/soporte-af: por columna `sucursalId` directa.
- En comprobantes: por unión sobre `cotizante.sucursalId`,
  `cuentaCobro.sucursalId` o `asesorComercial.sucursalId` (con `null` permitido
  para asesores globales).
- En cartera: el aliado puede ver un consolidado **solo si tiene al menos una
  línea** asignada a su sucursal.

### Anti path-traversal

Cualquier endpoint que sirva un archivo binario desde disco aplica las mismas
3 validaciones antes de leer:

1. Rechaza la cadena literal `..` en el path persistido.
2. `resolve(join(uploadsRoot(), path))` y verifica que el resultado siga
   prefijado por `uploadsRoot()`.
3. Si `readFile` falla, responde 404 sin filtrar la ruta interna.

### Headers de respuesta para descargas

Todas las descargas binarias usan:

```
Content-Type: <mime real>
Content-Disposition: attachment; filename="<nombre amigable>"
Cache-Control: no-store
```

`Cache-Control: no-store` impide que un proxy o CDN cachee material sensible.

### Códigos HTTP usados

| Código | Significado en este sistema                                                             |
| ------ | --------------------------------------------------------------------------------------- |
| 200    | OK con cuerpo.                                                                          |
| 202    | Aceptado, ejecución asíncrona (ej. dispatch a GitHub Actions).                          |
| 400    | Path inválido o parámetros mal formados.                                                |
| 401    | Sin sesión o sesión inválida.                                                           |
| 403    | Sesión válida pero sin permiso sobre el recurso (scope o RBAC).                         |
| 404    | Recurso no existe o archivo no está en disco.                                           |
| 410    | Recurso expiró por política de retención (PDF Colpatria archivado, doc 120 días).       |
| 500    | Error genérico del servidor (ej. fallo en `generarPlano`).                              |
| 502    | Bad Gateway al integrar con GitHub API o PagoSimple.                                    |
| 503    | Dependencia caída (BD en `/health`, PagoSimple deshabilitado, `GITHUB_TOKEN` faltante). |

---

## Endpoints REST

### 1. `GET|POST /api/auth/[...nextauth]`

**Archivo:** `apps/web/src/app/api/auth/[...nextauth]/route.ts`

Catch-all de NextAuth v5. Re-exporta los handlers que arma `@/auth`. Maneja:

- `GET /api/auth/session` — devuelve la sesión actual.
- `GET /api/auth/csrf` — token CSRF para forms.
- `GET /api/auth/providers` — providers configurados.
- `POST /api/auth/signin/<provider>` — inicia sesión.
- `GET|POST /api/auth/signout` — cierra sesión.
- `GET /api/auth/callback/<provider>` — callback OAuth/credentials.

**Auth:** público (es el mecanismo que crea la sesión).

**Provider configurado:** `Credentials` — email + password con bcrypt
verificado contra `User.passwordHash`. Estrategia JWT con cookie
`__Secure-next-auth.session-token` en producción.

**Errores:**

- 401 si las credenciales no validan.
- 302 a `/login?error=...` para errores recuperables.

---

### 2. `GET /api/buscar`

**Archivo:** `apps/web/src/app/api/buscar/route.ts`

Buscador global que cruza ocho módulos en una sola llamada (todas las queries
corren en paralelo con `Promise.all`).

**Auth:** `requireAuth` implícito (devuelve `{ groups: [] }` con 401 si no hay
sesión).

**Query params:**

| Nombre | Tipo   | Obligatorio | Descripción                                                        |
| ------ | ------ | ----------- | ------------------------------------------------------------------ |
| `q`    | string | sí          | Texto a buscar. Mínimo 2 caracteres; menos devuelve `{groups:[]}`. |

**Módulos consultados (máximo 5 resultados por categoría):**

1. **Cotizantes** — por número de documento, primer nombre, primer/segundo apellido.
2. **Empresas planilla** — por NIT o nombre. _(visible solo a STAFF)_.
3. **Cuentas de cobro** — por código `CCB-`, NIT o razón social.
4. **Comprobantes** — por consecutivo `CMP-`.
5. **Planillas** — por consecutivo `PLN-`.
6. **Consolidados de cartera** — por consecutivo `CC-`, entidad o NIT empresa. _(STAFF only)_.
7. **Incapacidades** — por consecutivo `INC-`.
8. **Asesores comerciales** — por código `AS-` o nombre.

**Scope:**

- `STAFF` ve todos los recursos.
- `SUCURSAL` recibe filtrado por `sucursalId` en cada query.

**Response 200:**

```json
{
  "groups": [
    {
      "tipo": "cotizante",
      "label": "Cotizantes",
      "items": [
        {
          "id": "...",
          "titulo": "Juan Pérez",
          "subtitulo": "CC 1098765",
          "href": "/admin/base-datos?q=1098765"
        }
      ]
    }
  ]
}
```

**Errores:** `401` (sesión inválida → `{groups:[]}`), `200` con grupos vacíos
para `q.length < 2`.

**Ejemplo:**

```bash
curl -b "next-auth.session-token=..." \
  "https://app.example.com/api/buscar?q=1098"
```

---

### 3. `GET /api/cartera/[id]/export.xlsx`

**Archivo:** `apps/web/src/app/api/cartera/[id]/export.xlsx/route.ts`

Exporta un `CarteraConsolidado` completo a un libro `.xlsx` con dos hojas:

- **Cabecera** — una fila con consecutivo, fecha, entidad, empresa, período,
  totales, estado, origen PDF, observaciones.
- **Detalle** — una fila por cada `CarteraDetallado` con tipo/n° doc, nombre,
  período de cobro, valor, IBC, novedad, estado de la línea, sucursal asignada
  y la última gestión asociada.

**Auth:** `requireStaff()` — ADMIN o SOPORTE. Los aliados deben usar el
reporte de "Administrativo · Cartera" donde solo ven sus líneas.

**Path params:**

| Nombre | Descripción                    |
| ------ | ------------------------------ |
| `id`   | UUID del `carteraConsolidado`. |

**Response 200 (binario):**

| Header                | Valor                                                               |
| --------------------- | ------------------------------------------------------------------- |
| `Content-Type`        | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` |
| `Content-Disposition` | `attachment; filename="<consecutivo>.xlsx"`                         |

**Errores:** `401` (sin sesión), `403` (no STAFF), `404` (consolidado no
existe).

---

### 4. `GET /api/cartera/[id]/pdf`

**Archivo:** `apps/web/src/app/api/cartera/[id]/pdf/route.ts`

Descarga el PDF original cargado al importar el consolidado (campo
`archivoOrigenPath`).

**Auth:** `requireAuth()` + `getUserScope()`.

- `STAFF` siempre puede descargar.
- `SUCURSAL` solo si `prisma.carteraDetallado.findFirst({ consolidadoId, sucursalAsignadaId })` devuelve algo. Si no, `403`.

**Validaciones de seguridad:**

- Rechaza `..` en `archivoOrigenPath` → `400 Ruta inválida`.
- `resolve(join(uploadsRoot(), path))` debe seguir prefijado por
  `uploadsRoot()` → si no, `400 Ruta fuera del raíz`.
- Si `readFile` falla → `404 Archivo no encontrado en disco`.

**Response 200:** `application/pdf`, attachment con nombre `<consecutivo>.pdf`.

**Errores:** `401`, `403`, `404` (consolidado o archivo), `400` (path
traversal).

---

### 5. `GET /api/colpatria/jobs/[id]/pdf`

**Archivo:** `apps/web/src/app/api/colpatria/jobs/[id]/pdf/route.ts`

Descarga el comprobante de afiliación que el bot Colpatria capturó tras un
submit exitoso al portal AXA (`ColpatriaAfiliacionJob.pdfPath`).

**Auth:** `requireRole('ADMIN', 'SOPORTE')`. Aliados no tienen acceso al área
de bot.

**Política de retención (Sprint 8.5.C):**

- Si `pdfArchivedAt` no es null → el cron de limpieza ya borró el archivo.
  Responde `410 Gone` con `{ error, archivedAt }`.
- Si `pdfPath` es null → `404 PDF no disponible para este job`.

**Validaciones anti-traversal:** mismas que el resto de descargas (rechazo de
`..` y verificación del prefijo `uploadsRoot()`).

**Response 200:** `application/pdf`, filename
`comprobante-colpatria-<numeroDocumento>.pdf`.

**Errores:** `401`, `403`, `404`, `410`, `400`.

---

### 6. `POST /api/colpatria/procesar-ahora`

**Archivo:** `apps/web/src/app/api/colpatria/procesar-ahora/route.ts`

Dispara el bot Colpatria para procesar jobs `PENDING` fuera del cron de
GitHub Actions ("Procesar pendientes ahora" en la UI).

**Auth:** `requireRole('ADMIN', 'SOPORTE')`.

**Body:** ninguno.

**Estrategia dual:**

1. **Local / dev** (`NODE_ENV !== 'production'`): hace `spawn('pnpm', ['bot-colpatria', 'procesar', '--limite', N])` con `detached:true` y `unref()`. El proceso corre en el server local; respuesta inmediata.
2. **Producción con `GITHUB_TOKEN`:** `POST` a la API GitHub
   `/repos/<owner>/<repo>/actions/workflows/bot-colpatria-procesar.yml/dispatches`
   con `ref: <branch>` e `inputs.limite`. Requiere PAT con scope `workflow`.
3. **Producción sin token:** `503` con mensaje pidiendo configurar el secret.

**Idempotencia:** el comando `procesar` toma jobs `PENDING` con
`FOR UPDATE SKIP LOCKED`, así que disparar varias veces no causa doble
procesamiento.

**Responses:**

| Status | `kind`              | Significado                                                 |
| ------ | ------------------- | ----------------------------------------------------------- |
| 200    | `NADA_QUE_PROCESAR` | No hay jobs PENDING.                                        |
| 202    | `LOCAL_SPAWNED`     | Proceso lanzado en server local (incluye `pid` aproximado). |
| 202    | `GH_DISPATCHED`     | Workflow disparado en GH Actions.                           |
| 502    | `GH_API_ERROR`      | GitHub rechazó el dispatch.                                 |
| 502    | `NETWORK_ERROR`     | No se pudo contactar GitHub.                                |
| 503    | `CONFIG_FALTANTE`   | Falta `GITHUB_TOKEN` en producción.                         |
| 500    | `SPAWN_ERROR`       | `child_process.spawn` falló en local.                       |

Todas devuelven JSON con `{ kind, message, pending? }`.

**Ejemplo:**

```bash
curl -X POST -b "session=..." https://app.example.com/api/colpatria/procesar-ahora
```

---

### 7. `GET /api/comprobantes/[id]/pagosimple-pdf`

**Archivo:** `apps/web/src/app/api/comprobantes/[id]/pagosimple-pdf/route.ts`

Descarga el comprobante oficial generado por **PagoSimple** (no el PDF local
del renderer interno).

**Auth:** `requireAuth()` + scope check.

- `SUCURSAL`: el comprobante debe pertenecer a la sucursal por al menos una de
  las relaciones (`cotizante`, `cuentaCobro`, `asesorComercial`). Si no, `403`.

**Pre-requisito:** `isPagosimpleEnabled()` debe ser `true`. Si no →
`503 La integración con PagoSimple no está configurada`.

**Query params opcionales:**

| Nombre        | Valores   | Default | Descripción                                                  |
| ------------- | --------- | ------- | ------------------------------------------------------------ |
| `report_type` | `1` o `2` | `2`     | `1` = prefactura (antes de pagar), `2` = comprobante pagado. |

**Flujo interno (`fetchComprobantePagoSimple`):**

1. Valida que el comprobante sea agrupación `INDIVIDUAL` con cotizante.
2. Toma el `payroll_number` de una planilla activa asociada.
3. `POST /voucher/report-types` al endpoint PagoSimple → PDF base64.

**Response 200:** `application/pdf`, attachment. El nombre lo retorna PagoSimple.

**Errores:**

- `401` sesión inválida.
- `403` sin permiso sobre el comprobante.
- `404` comprobante no existe.
- `503` PagoSimple deshabilitado.
- `4xx/5xx` propagado de PagoSimple (mapeado a `502` si está fuera del rango).

---

### 8. `GET /api/cotizantes/template.csv`

**Archivo:** `apps/web/src/app/api/cotizantes/template.csv/route.ts`

Plantilla CSV con header esperado y una fila de ejemplo, lista para
importación bulk de cotizantes desde la UI del aliado.

**Auth:** `requireAuth()`.

**Response 200:**

| Header                | Valor                                             |
| --------------------- | ------------------------------------------------- |
| `Content-Type`        | `text/csv; charset=utf-8`                         |
| `Content-Disposition` | `attachment; filename="plantilla-cotizantes.csv"` |

**Detalle de implementación:** se prepende el BOM UTF-8 (`﻿`) para que
Excel detecte la codificación y no rompa los acentos al abrir el archivo en
Windows.

---

### 9. `GET /api/health`

**Archivo:** `apps/web/src/app/api/health/route.ts`

Endpoint de salud para Kubernetes liveness, Vercel cron health, Uptime Kuma o
similares.

**Auth:** **público** (no requiere sesión). La info expuesta no es sensible.

**Lógica:** ejecuta `prisma.$queryRaw\`SELECT 1\`` y mide la latencia. Cualquier
otra query del dominio sería más cara y enmascararía degradación gradual.

**Response 200 (sano):**

```json
{
  "status": "ok",
  "timestamp": "2026-04-28T14:32:01.123Z",
  "uptimeSec": 8421,
  "service": "@pila/web",
  "checks": {
    "db": { "ok": true, "latencyMs": 12, "error": null }
  },
  "totalMs": 13
}
```

**Response 503 (degraded):** mismo shape con `status: "degraded"`,
`checks.db.ok: false` y mensaje en `checks.db.error`. El handler nunca lanza.

**Headers:** `Cache-Control: no-store, max-age=0`.

---

### 10. `GET /api/incapacidades/[id]/documentos/[docId]`

**Archivo:** `apps/web/src/app/api/incapacidades/[id]/documentos/[docId]/route.ts`

Sirve un documento adjunto a una incapacidad (certificados médicos,
historiales, oficios jurídicos).

**Auth:** `requireAuth()` + `getUserScope()`.

**Validaciones (en orden):**

1. **Existencia y consistencia** — el documento existe y pertenece a la
   incapacidad indicada (`docId.incapacidadId === id`). Si no → `404`.
2. **Retención 120 días** — `eliminado === true` → `410 Archivo ya fue
eliminado por retención (120 días)`.
3. **Scope** — `SUCURSAL` solo descarga documentos de su sucursal.
4. **Confidencialidad jurídica** — si `confidencial === true`:
   - `SUCURSAL` → `403 Documento confidencial — restringido al área jurídica`.
   - `STAFF` sin permiso `soporte.juridico_confidencial` y no `ADMIN` →
     `403 Documento confidencial — sin permiso para descargar`.
5. **Anti-traversal** — `..`, prefijo `uploadsRoot`, `readFile`.

**Response 200:** MIME real del documento (`archivoMime`), filename
`archivoNombreOriginal` con comillas escapadas.

**Errores:** `401`, `403` (3 variantes), `404`, `410`, `400`.

---

### 11. `GET /api/mov-detalle/[id]/documentos/[docId]`

**Archivo:** `apps/web/src/app/api/mov-detalle/[id]/documentos/[docId]/route.ts`

Sirve el soporte de pago de un detalle de movimiento (módulo de finanzas
internas: cobros del aliado).

**Auth:** `requireStaff()`. Finanzas no es accesible a aliados.

**Validaciones:**

- Documento existe y `docId.detalleId === id` → si no, `404`.
- Anti-traversal estándar.
- Si el archivo no está en disco (limpieza manual o retención futura) →
  `404 Archivo no encontrado en disco`.

**Response 200:** MIME del archivo, attachment con `archivoNombreOriginal`.

---

### 12. `GET /api/notificaciones`

**Archivo:** `apps/web/src/app/api/notificaciones/route.ts`

Devuelve las últimas 20 notificaciones del usuario y el conteo de no leídas
(usado por el dropdown de la campana al abrirse).

**Auth:** `auth()` directo. Sin sesión → `200` con `{ items: [], count: 0 }`
(no falla; permite render silencioso en componentes opcionales).

**Internamente llama:**

- `listarRecientes(userId, role, sucursalId, 20)`.
- `contarNoLeidas(userId, role, sucursalId)`.

**Response 200:**

```json
{
  "items": [
    {
      "id": "...",
      "tipo": "INCAPACIDAD_NUEVA",
      "titulo": "Nueva incapacidad radicada",
      "mensaje": "...",
      "href": "/admin/soporte/incapacidades/...",
      "createdAt": "2026-04-28T14:00:00.000Z",
      "leida": false
    }
  ],
  "count": 3
}
```

---

### 13. `POST /api/notificaciones/[id]/leer`

**Archivo:** `apps/web/src/app/api/notificaciones/[id]/leer/route.ts`

Marca una notificación como leída.

**Auth:** sesión obligatoria → `401 No autenticado` si falta.

**Path params:** `id` = UUID de la notificación.

**Validación de propiedad:** la hace `marcarLeida(id, userId)` server-side
(evita que un usuario marque notificaciones de otro).

**Response 200:** `{ ok: true }`.

---

### 14. `GET /api/notificaciones/count`

**Archivo:** `apps/web/src/app/api/notificaciones/count/route.ts`

Endpoint **liviano** para el polling del badge de la campana (cada 60s en el
cliente). Solo retorna el conteo, sin items.

**Auth:** sesión opcional. Sin sesión → `{ count: 0 }`.

**Response 200:** `{ count: number }`.

---

### 15. `POST /api/notificaciones/leer-todas`

**Archivo:** `apps/web/src/app/api/notificaciones/leer-todas/route.ts`

Marca todas las notificaciones visibles del usuario como leídas (botón
"limpiar" del dropdown).

**Auth:** obligatoria → `401` si falta.

**Response 200:** `{ ok: true, count: <cuántas se marcaron> }`.

---

### 16. `GET /api/planos/[id]/plano.txt`

**Archivo:** `apps/web/src/app/api/planos/[id]/plano.txt/route.ts`

Genera y descarga el archivo plano PILA según resolución 2388/2016:

- Encabezado tipo 01 de 359 bytes.
- Una línea por cotizante de **693 bytes** (676 oficiales + 17 de padding con
  la actividad económica del operador).
- Separador `CRLF (\r\n)`.

**Auth:** `requireStaff()`. Los aliados no manejan el archivo plano
directamente — el botón está oculto en su UI y el endpoint redirige a login si
intentan manipular la URL.

**Reglas de negocio:**

- Estado de la planilla debe ser `CONSOLIDADO` o `PAGADA`. Si es `ANULADA` →
  `410 Planilla anulada — plano no disponible`.
- "Primera mensualidad" se calcula con `cotizantesConMensualidadPrevia`: un
  cotizante NO tiene mensualidad previa si no existe ninguna procesada fuera
  de esta planilla. Esa flag activa la novedad ARL obligatoria del primer mes.

**Response 200:** `text/plain; charset=utf-8`, filename derivado de la planilla.

**Errores:** `401`, `403` (no staff), `404` (planilla no existe), `410`
(anulada), `500` con mensaje del error de generación.

---

### 17. `GET /api/soporte-af/[id]/documentos/[docId]`

**Archivo:** `apps/web/src/app/api/soporte-af/[id]/documentos/[docId]/route.ts`

Sirve un documento adjunto de una solicitud **Soporte · Afiliaciones**
(novedades de aliados al staff: cambios de salario, retiros, etc.).

**Auth:** `requireAuth()`.

- `SUCURSAL` solo descarga documentos de solicitudes de su sucursal.
- `STAFF` puede descargar cualquiera.

**Validaciones:**

- Pertenencia (`docId.soporteAfId === id`).
- Retención 120 días (`eliminado === true` → `410`).
- Scope (`403` si la solicitud es de otra sucursal).
- Anti-traversal estándar.

---

### 17b. `GET /api/reporte-at/[id]/documentos/[docId]` (v2.0)

**Archivo:** `apps/web/src/app/api/reporte-at/[id]/documentos/[docId]/route.ts`

Sirve un documento adjunto a un **Reporte AT** (FURAT u otro soporte
operativo cargado por Soporte al gestionar el caso). El aliado **NO**
descarga estos archivos; son operativos del staff.

**Auth:** `requirePermiso('soporte.reporte_at')`. Aliado obtiene `403`
implícito vía la guard.

**Validaciones:**

- Pertenencia (`docId.reporteAtId === id`).
- **Retención 30 días** (`eliminado === true` → `410` con mensaje "30 días").
- Anti-traversal estándar.

**Headers de respuesta:** `Content-Type: <archivoMime>`,
`Content-Disposition: attachment; filename="<archivoNombreOriginal>"`,
`Cache-Control: no-store`.

---

### 18. `GET /api/transacciones/cartera/excel`

**Archivo:** `apps/web/src/app/api/transacciones/cartera/excel/route.ts`

Exporta un Excel con la **cartera del período en curso** (cotizantes activos
sin mensualidad procesada en el mes). Usado para gestión de cobro.

**Auth:** `requireAuth()`. Aliados ven solo su cartera (filtrado por
`sucursalId`).

**Comportamiento:**

1. Resuelve `PeriodoContable` del mes actual. Si no existe → `404 No hay
período contable del mes en curso`.
2. Calcula los IDs ya facturados (`MENSUALIDAD INDIVIDUAL` no anulada con
   `procesadoEn != null`).
3. Lista cotizantes con afiliaciones `ACTIVA` y `id NOT IN (facturados)`.
4. Aplica `debeFacturarseEnPeriodo` para descartar los que no toca cobrar
   este mes según su `modalidad`/`formaPago`/`fechaIngreso`.
5. Por cada afiliación elegible corre `calcularLiquidacion(...)` con tarifas
   y FSP del período.
6. Construye dos hojas:
   - **Cartera** — fila por cotizante con tipo doc, n° doc, nombre, modalidad,
     régimen, plan SGSS, empresa planilla y CC, asesor, fecha ingreso,
     salario, total a liquidar, n° gestiones registradas. Header en azul
     (`#1E40AF`), fila total al final con fondo lavanda.
   - **Resumen** — totales y desgloses por modalidad y por empresa planilla.
7. Filtros automáticos en la fila 1 de "Cartera"; freeze pane en la fila 1.

**Response 200:** `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`,
filename `cartera_<YYYY>-<MM>.xlsx`.

**Errores:** `401`, `404` (sin período).

---

### 19. `GET /api/transacciones/cuadre/excel`

**Archivo:** `apps/web/src/app/api/transacciones/cuadre/excel/route.ts`

**Cuadre de caja** por rango de fechas: una fila por liquidación con
desglose completo de conceptos (EPS, AFP, ARL, CCF, FSP, admón, servicios) y
hoja de resumen.

**Auth:** `requireAuth()`. Aliado ve solo su caja; STAFF ve todo y suma una
columna extra "Usuario dueño" (resuelta vía `cargarDuenosPorSucursal`).

**Query params:**

| Nombre  | Tipo             | Default | Descripción                                                          |
| ------- | ---------------- | ------- | -------------------------------------------------------------------- |
| `desde` | ISO `YYYY-MM-DD` | hoy     | Fecha de pago desde (inclusive).                                     |
| `hasta` | ISO `YYYY-MM-DD` | `desde` | Fecha de pago hasta (inclusive). Si `desde > hasta` se intercambian. |

Solo acepta el regex `/^\d{4}-\d{2}-\d{2}$/`. Cualquier otro valor cae al
default.

**Lógica de filtrado:**

- `comprobante.fechaPago BETWEEN desde AND hasta+1d` con `procesadoEn != null`.
- Solo comprobantes activos cuentan en totales (anulados se muestran tachados
  pero no suman).
- Conceptos con subconcepto que contiene "interno" (insensible a
  mayúsculas) se clasifican como **cobros internos del aliado** (CCF $100, ARL
  1 día) y se separan del SGSS real que va al operador PILA.

**Hojas:**

- **Detalle** — ~36 columnas; ver código para el orden completo. Columnas
  monetarias con formato `"$"#,##0`, `% ARL` con `0.0000%`. Filas anuladas en
  gris con `strike: true`.
- **Resumen** — totales recibido/anulado, transacciones, desgloses por
  concepto, por medio de pago y por usuario.

**Response 200:** `.xlsx`, filename `cuadre-caja_<YYYY-MM-DD>.xlsx` o
`cuadre-caja_<desde>_a_<hasta>.xlsx`.

---

## Server Actions críticos

Los Server Actions (`'use server'`) son funciones invocables desde la UI vía
`form action={action}` o `action(formData)`. No son endpoints HTTP públicos
en sentido estricto, pero **un integrador externo necesita conocer sus
contratos** porque encapsulan la lógica de negocio sensible que un endpoint
REST eventual replicaría.

Cada acción toma `(prev: ActionState, formData: FormData)` y devuelve
`Promise<ActionState>` con shape `{ ok?: true } | { error: string }`.

### Crear afiliación

**Función:** `createAfiliacionAction(prev, formData)`
**Archivo:** `apps/web/src/app/admin/base-datos/actions.ts:414`

Crea (o reactiva) un cotizante y su afiliación. Política clave:

- Un cotizante puede tener **máximo dos afiliaciones**: una `DEPENDIENTE` y
  una `INDEPENDIENTE`.
- Si vuelve a entrar después de inactivarse, se **reactiva** el registro
  existente sobre-escribiendo datos del form (incluyendo `estado` y
  `fechaIngreso` nuevos). Nunca hay duplicados.

**Auth:** `requireAuth()` + `getUserScope()`.

**Resolución de sucursal:**

- `SUCURSAL`: sucursal del aliado (forzada). Si la cuenta de cobro elegida
  no es de esa sucursal → error.
- `STAFF`: hereda de la cuenta de cobro elegida (que siempre tiene
  `sucursalId`). Sin CC, queda `null` (legado).

**Validaciones:** `CotizanteSchema` y `AfiliacionSchema` (Zod), cascada de
limpieza de IDs por plan, `validateAfiliacion` (régimen, restricciones, empresa
cruzada).

**Side effects:**

- Crea registros en `prisma.cotizante` y `prisma.afiliacion`.
- Dispara `dispararColpatriaSiAplica` si la empresa tiene `colpatriaActivo`.
- Audita el evento.

### Actualizar afiliación

**Función:** `updateAfiliacionAction(id, prev, formData)`
**Archivo:** `apps/web/src/app/admin/base-datos/actions.ts:617`

Mismas validaciones que `create` pero sobre un registro existente. Si cambia
salario, plan, EPS/AFP/ARL/CCF o empresa, también puede disparar Colpatria
para registrar la novedad correspondiente.

### Radicar incapacidad

**Función:** `radicarIncapacidadAction(prev, formData)`
**Archivo:** `apps/web/src/app/admin/administrativo/incapacidades/actions.ts:150`

Radica una incapacidad nueva con sus documentos de soporte.

**Auth:** `requireAuth()` + `getUserScope()`.

**Inputs (`FormData`):**

- `tipo` — enum `IncapacidadTipo` (`COMUN`, `LABORAL`, etc.).
- `tipoDocumento`, `numeroDocumento` — para matchear cotizante.
- `fechaInicio`, `fechaFin` — ISO.
- `observaciones`.
- Archivos adjuntos por tipo (`archivo_INCAPACIDAD`, `archivo_HISTORIA`, etc.).

**Validaciones:**

- `IncapacidadRadicarSchema` (Zod).
- Cotizante debe existir en la sucursal del aliado (o cualquiera para STAFF).
- Cotizante debe tener `sucursalId` asignada.
- Archivos: tipos MIME en lista blanca, máximo 5 MB cada uno.

**Side effects:** crea `Incapacidad` con consecutivo `INC-XXXXX`, persiste
documentos en `uploadsRoot/incapacidades/<id>/`, audita y notifica al área de
soporte.

**Response:** `{ ok: true, incapacidadId, consecutivo }` o `{ error }`.

### Subir documento confidencial (jurídico)

**Función:** `subirDocumentoJuridicoAction(prev, formData)`
**Archivo:** `apps/web/src/app/admin/soporte/juridico/actions.ts:189`

Adjunta un documento del expediente legal a una incapacidad en flujo
jurídico. Marca el doc como `confidencial: true`, lo que activa las
restricciones de descarga vistas en el endpoint REST 10.

**Auth:** `requireStaff()` + `puedeDescargarDocConfidencial()`. Si el rol
custom no tiene `soporte.juridico_confidencial` y no es `ADMIN` → error.

**Estado de la incapacidad:** debe ser `TRASLADO_A_JURIDICO` o
`EN_PROCESO_JURIDICO`. En cualquier otro estado, el upload se rechaza para
no contaminar el flujo confidencial.

**Validaciones de archivo:**

- Tipo en `MIMES_PERMITIDOS`.
- Tamaño ≤ 5 MB.
- Tipo de documento en `IncapacidadDocumentoTipoJuridicoEnum` (subset
  jurídico — médicos rechazados).

**Side effects:** persiste el archivo, crea `IncapacidadDocumento` con
`confidencial: true` y `accionadaPor: 'JURIDICO'`, audita el evento.

### Gestionar incapacidad (aliado / jurídico)

**Funciones:**

- `gestionAliadoIncapAction(prev, formData)` — `apps/web/src/app/admin/administrativo/incapacidades/actions.ts:366`
- `gestionJuridicoIncapAction(prev, formData)` — `apps/web/src/app/admin/soporte/juridico/actions.ts:66`

Registran una gestión (cambio de estado, observación, cobro a EPS, etc.) en
el historial de la incapacidad. La de aliado solo permite estados accesibles
al aliado; la jurídica permite los estados especiales del flujo legal
(`TRASLADO_A_JURIDICO`, `EN_PROCESO_JURIDICO`, `CIERRE_JURIDICO_*`).

### Crear / actualizar RolCustom

**Funciones:**

- `createRolCustomAction(prev, formData)` — `actions.ts:62`
- `updateRolCustomAction(id, prev, formData)` — `actions.ts:108`
- `toggleRolCustomAction(id)` — `actions.ts:159`
- `deleteRolCustomAction(id)` — `actions.ts:167`
- `savePermisosAction(rolId, prev, formData)` — `actions.ts:18`

**Archivo:** `apps/web/src/app/admin/usuarios/roles/actions.ts`

**Auth:** `requireStaff()`.

Manejan los roles custom (combinaciones de permisos por módulo + acción que
extienden `ADMIN`/`SOPORTE`/`ALIADO_OWNER`). Cada permiso es una tupla
`(modulo, accion)` validada contra `VALID_MODULE_KEYS` y `VALID_ACCIONES`.

Update borra todos los permisos previos en transacción y los recrea
(estrategia replace-all para evitar estados intermedios).

### Trigger Colpatria

**Función:** `dispararColpatriaSiAplica(input)`
**Archivo:** `apps/web/src/lib/colpatria/disparos.ts:95`

Evalúa si una creación/actualización de afiliación dispara un job al bot
Colpatria y, si sí, lo persiste en `ColpatriaAfiliacionJob` con estado
`PENDING`.

**Garantía:** **nunca tira excepciones**. Los errores se loguean pero la
operación principal (CREATE/UPDATE de afiliación) no falla por un problema
del disparo. El operador puede revisar la bitácora.

**Snapshot:** captura todos los datos necesarios para que el bot rellene el
form del portal AXA (datos del cotizante, empresa con `colpatriaActivo`, EPS,
AFP con código AXA, salario, fecha ingreso, cargo, etc.).

**Retorno:** `string | null` — id del job creado o `null` si no aplica.

### Validar subtipos PagoSimple

**Función:** `validarSubtiposCotizanteEnPagosimple(input)`
**Archivo:** `apps/web/src/lib/pagosimple/validar-subtipos.ts:532`

Valida si un cotizante puede usar ciertos subtipos de cotización contra
PagoSimple. Estrategia: envía hasta **3 planos en paralelo** (uno por cada
grupo de `GRUPOS_OMISION_PENSION`) compartiendo el mismo `auth_token` para
no triplicar el costo de auth.

**Auth interna:** `getFullAuthHeaders` con `pagosimpleContributorId` y NIT.
Si falla → `{ ok: false, error: "Auth PagoSimple falló: ..." }`.

**Modo legacy:** si `input.subtipos` viene definido, envía un solo plano con
ese subset (testing).

### Generar plano PILA (helper)

**Función:** `generarPlano(planilla, conMensualidadPrevia)`
**Archivo:** `apps/web/src/lib/planos/generar.ts`

Llamada por el endpoint REST 16 (`/api/planos/[id]/plano.txt`). Construye el
TXT respetando el formato 2388/2016: registro 01 (359 bytes), N registros 02
de 693 bytes, separador CRLF.

Devuelve `{ contenido: string, filename: string }`. Tira `Error` con mensaje
descriptivo si la planilla no es serializable (ej. cotizante sin EPS).

### Fetch comprobante PagoSimple (helper)

**Función:** `fetchComprobantePagoSimple(comprobanteId, opts)`
**Archivo:** `apps/web/src/lib/pagosimple/comprobantes.ts:49`

Llamada por el endpoint REST 7. Encapsula:

1. Validación de agrupación INDIVIDUAL + cotizante presente.
2. Búsqueda de planilla activa para extraer `payroll_number`.
3. Llamada a `/voucher/report-types` con `report_type` (1 o 2).
4. Decodificación base64 → `Buffer`.

**Retorno:** `{ ok: true, pdf, filename } | { ok: false, error, code? }`.

---

## Resumen de seguridad

| Riesgo                                | Mitigación implementada                                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Path traversal en descargas           | Triple validación (rechazo de `..`, prefijo `uploadsRoot()`, fallo silencioso de `readFile`).        |
| Acceso cruzado entre sucursales       | `getUserScope()` + filtros explícitos en cada query.                                                 |
| Documentos legales filtrados          | Flag `confidencial` + `puedeDescargarDocConfidencial()` + bloqueo absoluto a aliados.                |
| Caché de material sensible            | `Cache-Control: no-store` en todas las descargas.                                                    |
| Doble procesamiento de jobs Colpatria | `FOR UPDATE SKIP LOCKED` en el comando `procesar`.                                                   |
| Token GitHub expuesto                 | Solo en variable de entorno; el endpoint solo dispara, nunca echo del token.                         |
| Subida de archivos maliciosos         | Lista blanca de MIMEs + límite de tamaño (5 MB para confidenciales) + hash SHA-256 persistido.       |
| Retención prolongada                  | Cron de limpieza marca `eliminado: true` a los 120 días; PDFs Colpatria archivan en `pdfArchivedAt`. |

---

## Cambios futuros previsibles

- CSP con nonces — enforce en prod, Report-Only en dev (commit `847286a` + promoción posterior).
- Cache BDUA/RUAF con TTL de 30 min (ya implementado, ver
  `pagosimple/bdua-cache.ts`, commit `ed5fd18`).
- Watchdog del bot Colpatria con detección de zombies y reciclaje de
  retryables (commit `0e84a2d`).

> Esta sección es un punto de control para integradores: si tu integración
> depende de un comportamiento descrito aquí, fíjate en cambios de los
> commits posteriores a la fecha de este documento.
