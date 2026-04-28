# 8. Base de datos

> **Sección 8 del plan técnico enterprise.** Documentación derivada directamente de `packages/db/prisma/schema.prisma` (2.608 líneas) y de las 63 migraciones aplicadas en `packages/db/prisma/migrations/`. La nomenclatura, los `@@map`, los modificadores y los índices reflejan exactamente lo que hay en el schema; nada se inventa.

---

## 8.1 Motor

| Componente          | Versión / detalle                                                         |
| ------------------- | ------------------------------------------------------------------------- |
| Motor               | **PostgreSQL 16**                                                         |
| Hosting (dev)       | **Neon Cloud** (serverless Postgres con branching)                        |
| ORM / cliente       | **Prisma 6.19** (`@prisma/client`)                                        |
| Provider Prisma     | `postgresql` (`datasource db { provider = "postgresql" }`)                |
| Generador           | `prisma-client-js` (cliente JS/TS típado)                                 |
| Variable de entorno | `DATABASE_URL` (formato `postgresql://USER:PASS@HOST/DB?sslmode=require`) |

### 8.1.1 Conexión

El cliente Prisma lee la URL desde `env("DATABASE_URL")` (declarado al inicio del schema). En desarrollo local el aliado `Jhon` usa una rama de Neon (cloud); las credenciales viven exclusivamente en `.env` raíz del monorepo y nunca se commitean.

```
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

### 8.1.2 Comandos típicos

| Acción                      | Comando                                        |
| --------------------------- | ---------------------------------------------- |
| Aplicar migraciones         | `pnpm db:migrate`                              |
| Inspeccionar / editar datos | `pnpm db:studio`                               |
| Generar cliente             | `pnpm prisma generate` (auto en `postinstall`) |
| Resetear (peligroso)        | `pnpm prisma migrate reset`                    |

---

## 8.2 Diagrama entidad-relación (ASCII)

Agrupado por **dominios funcionales**. Las flechas (`──>`) representan FKs (entidad origen apunta al destino del FK).

```
┌────────────────────────── AUTH & RBAC ──────────────────────────┐
│                                                                 │
│  RolCustom ───── PermisoCustom (PK compuesta)                   │
│      │                                                          │
│      │  basedOn:Role                                            │
│      ▼                                                          │
│   Role(enum) ◄── Permiso (PK compuesta role+modulo+accion)      │
│      ▲                                                          │
│  User ──────────► Sucursal? (sucursalId)                        │
│   │       └─────► RolCustom? (rolCustomId)                      │
│   ├──► UsuarioEmpresa ──► Empresa                               │
│   ├──► AuditLog (autor)                                         │
│   └──► LoginAttempt (correlación por email)                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌────────────────────────── TENANT ───────────────────────────────┐
│                                                                 │
│  Sucursal (codigo único, bloqueadaPorMora, tarifas)             │
│    ├── 1:1 ComprobanteFormato                                   │
│    ├── 1:N MedioPago, AsesorComercial, ServicioAdicional        │
│    ├── 1:N Cotizante, Planilla, CuentaCobro, Incapacidad        │
│    └── 1:N CarteraDetallado (sucursalAsignadaId)                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────── CATÁLOGOS ──────────────────────────────┐
│                                                                 │
│  EntidadSgss (tipo: EPS|AFP|ARL|CCF; codigoAxa)                 │
│  ActividadEconomica ── Cargo                                    │
│  TipoCotizante ── Subtipo                                       │
│  PlanSgss (regimen, incluyeEps/Afp/Arl/Ccf)                     │
│  Departamento ── Municipio  (DIVIPOLA)                          │
│  SmlvConfig (singleton)                                         │
│  TarifaSgss (concepto, modalidad, nivelRiesgo, exonera)         │
│  FspRango (smlvDesde / smlvHasta / porcentaje)                  │
│  Empresa ─┬─ EmpresaNivelRiesgo                                 │
│           ├─ EmpresaActividad                                   │
│           ├─ EmpresaTipoCotizante                               │
│           └─ EmpresaSubtipoCotizante                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────── AFILIACIÓN ─────────────────────────────┐
│                                                                 │
│  Cotizante ──► Sucursal? (multi-tenant)                         │
│      │  unique (sucursalId, tipoDoc, numDoc)                    │
│      ▼                                                          │
│  Afiliacion (unique cotizanteId+modalidad)                      │
│      ├──► Empresa? (planilla)                                   │
│      ├──► CuentaCobro? (agrupador)                              │
│      ├──► AsesorComercial? / PlanSgss? / ActividadEconomica?    │
│      ├──► TipoCotizante / Subtipo? / NivelRiesgo                │
│      ├──► EntidadSgss×4 (eps/afp/arl/ccf)                       │
│      └─── AfiliacionServicio ──► ServicioAdicional              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────── TRANSACCIONAL ───────────────────────────┐
│                                                                 │
│  PeriodoContable (anio+mes únicos)                              │
│      ├──► Liquidacion (unique periodoId+afiliacionId+tipo)      │
│      │       └── LiquidacionConcepto (línea por concepto)       │
│      ├──► Comprobante (consecutivo CMP-######)                  │
│      │       └── ComprobanteLiquidacion (m2m)                   │
│      └──► Planilla (consecutivo PLN-######)                     │
│              └── PlanillaComprobante (m2m)                      │
│                                                                 │
│  CarteraConsolidado (consecutivo CC-######)                     │
│      └── CarteraDetallado ── CarteraGestion                     │
│                                                                 │
│  GestionCartera (cotizante × periodo, bitácora)                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌────────────── SOPORTE · INCAPACIDADES · JURÍDICO ───────────────┐
│                                                                 │
│  Incapacidad (consecutivo INC-######)                           │
│      ├── IncapacidadDocumento (confidencial:bool, retención 120d)│
│      └── IncapacidadGestion                                     │
│                                                                 │
│  SoporteAfiliacion (consecutivo SOP-AF-######)                  │
│      ├── SoporteAfDocumento                                     │
│      └── SoporteAfGestion                                       │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────── FINANZAS ───────────────────────────────┐
│                                                                 │
│  CobroAliado (consecutivo CA-######)                            │
│      ├── CobroAliadoConcepto                                    │
│      └── CobroAliadoDocumento                                   │
│                                                                 │
│  MovimientoIncapacidad (MI-######)                              │
│      └── MovimientoIncDetalle                                   │
│              └── MovimientoDetalleDocumento                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌────────────────── BOT COLPATRIA ARL (Sprint 8) ─────────────────┐
│                                                                 │
│  Empresa ── 1:1 ColpatriaSesion (cookies encriptadas)           │
│      └── 1:N ColpatriaAfiliacionJob (status, intento, payload)  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────── AUDITORÍA · CRON · NOTIFICACIONES ───────────────┐
│                                                                 │
│  AuditLog (entidad+entidadId, userId, userSucursalId,           │
│            entidadSucursalId)                                   │
│  CronRun (jobName, status, startedAt, durationMs, output, error)│
│  Notificacion ── NotificacionLectura (user × notif)             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8.3 Tablas (modelos Prisma)

A continuación se documentan los modelos del schema, agrupados por dominio. Cada uno incluye la tabla `Campo | Tipo | Modificadores | Notas`, índices y relaciones relevantes.

### 8.3.1 Dominio AUTH & RBAC

#### `User` → `users`

Usuario del sistema. Cada usuario pertenece a una sucursal (excepto staff `ADMIN`/`SOPORTE`, que son globales) y opcionalmente puede tener un `RolCustom` que afina sus permisos sobre el rol base.

| Campo          | Tipo          | Modificadores                        | Notas                                                             |
| -------------- | ------------- | ------------------------------------ | ----------------------------------------------------------------- | ------- | ------------ | ------------------------ |
| `id`           | `String`      | `@id @default(cuid())`               | PK                                                                |
| `email`        | `String`      | `@unique`                            | Lowercased en aplicación                                          |
| `name`         | `String`      |                                      |                                                                   |
| `passwordHash` | `String`      |                                      | Hash bcrypt                                                       |
| `role`         | `Role` (enum) |                                      | `ADMIN                                                            | SOPORTE | ALIADO_OWNER | ALIADO_USER (deprecado)` |
| `sucursalId`   | `String?`     | FK → `Sucursal` `onDelete: Restrict` | Null sólo para staff                                              |
| `rolCustomId`  | `String?`     | FK → `RolCustom` `onDelete: SetNull` | Si está seteado, los permisos efectivos vienen de `PermisoCustom` |
| `active`       | `Boolean`     | `@default(true)`                     |                                                                   |
| `createdAt`    | `DateTime`    | `@default(now())`                    |                                                                   |
| `updatedAt`    | `DateTime`    | `@updatedAt`                         |                                                                   |

Índices: `@@index([sucursalId])`, `@@index([rolCustomId])`.

Relaciones inversas: `comprobantesCreados`, `planillasCreadas`, `carterasCreadas`, `incapacidadesCreadas`, `notificaciones`, `auditLogsComoActor`, plus 14 backrefs (gestiones, documentos, etc.).

#### `Account`, `Session`, `VerificationToken` (NextAuth)

> El schema actual **no incluye** los modelos `Account`, `Session`, `VerificationToken` del NextAuth Prisma adapter — la autenticación está implementada con el flujo Credentials sobre `User.passwordHash`. Si se migra a OAuth, esos modelos se añadirían en una nueva migración. Lo registrado a nivel de bitácora de login está en `LoginAttempt`.

#### `LoginAttempt` → `login_attempts`

Bitácora de intentos de login (alimenta el rate-limit "3 fallos en 10 min").

| Campo       | Tipo       | Modificadores          | Notas                   |
| ----------- | ---------- | ---------------------- | ----------------------- | ------------- | ------------- | ------------- |
| `id`        | `String`   | `@id @default(cuid())` |                         |
| `email`     | `String`   |                        | Normalizado a lowercase |
| `ip`        | `String?`  |                        |                         |
| `userAgent` | `String?`  |                        |                         |
| `success`   | `Boolean`  | `@default(false)`      |                         |
| `motivo`    | `String?`  |                        | `password_wrong         | user_inactive | unknown_email | rate_limited` |
| `createdAt` | `DateTime` | `@default(now())`      |                         |

Índices: `@@index([email, createdAt])`, `@@index([createdAt])`.

#### `Permiso` → `permisos`

Matriz de permisos para roles base. Presencia = permitido. PK compuesta.

| Campo    | Tipo     | Modificadores   | Notas                   |
| -------- | -------- | --------------- | ----------------------- | ----- | ------ | --------- |
| `role`   | `Role`   | parte de `@@id` | PK                      |
| `modulo` | `String` | parte de `@@id` | ej. `config.sucursales` |
| `accion` | `String` | parte de `@@id` | `VER                    | CREAR | EDITAR | ELIMINAR` |

`@@id([role, modulo, accion])`. ADMIN se saltea esta tabla (todo permitido implícitamente).

#### `RolCustom` → `roles_custom`

Roles personalizados que heredan de `ALIADO_OWNER` o `SOPORTE`.

| Campo                    | Tipo       | Modificadores          | Notas                                 |
| ------------------------ | ---------- | ---------------------- | ------------------------------------- |
| `id`                     | `String`   | `@id @default(cuid())` |                                       |
| `nombre`                 | `String`   | `@unique`              |                                       |
| `descripcion`            | `String?`  |                        |                                       |
| `basedOn`                | `Role`     |                        | `ALIADO_OWNER` o `SOPORTE` (no ADMIN) |
| `active`                 | `Boolean`  | `@default(true)`       |                                       |
| `createdAt`, `updatedAt` | `DateTime` |                        |                                       |

#### `PermisoCustom` → `permisos_custom`

| Campo         | Tipo     | Modificadores                                         | Notas |
| ------------- | -------- | ----------------------------------------------------- | ----- |
| `rolCustomId` | `String` | parte de `@@id`, FK → `RolCustom` `onDelete: Cascade` |       |
| `modulo`      | `String` | parte de `@@id`                                       |       |
| `accion`      | `String` | parte de `@@id`                                       |       |

### 8.3.2 Dominio TENANT

#### `Sucursal` → `sucursales`

Equivale a un **aliado**: cada sucursal es un tenant.

| Campo                    | Tipo       | Modificadores          | Notas                                       |
| ------------------------ | ---------- | ---------------------- | ------------------------------------------- |
| `id`                     | `String`   | `@id @default(cuid())` |                                             |
| `codigo`                 | `String`   | `@unique`              | ej. `ALI-001`                               |
| `nombre`                 | `String`   |                        |                                             |
| `active`                 | `Boolean`  | `@default(true)`       |                                             |
| `bloqueadaPorMora`       | `Boolean`  | `@default(false)`      | Si `true`, el aliado solo ve/paga su CxC    |
| `tarifaOrdinario`        | `Decimal?` | `@db.Decimal(12,2)`    | Tarifa por afiliación/mes régimen ORDINARIO |
| `tarifaResolucion`       | `Decimal?` | `@db.Decimal(12,2)`    | Tarifa régimen RESOLUCION                   |
| `createdAt`, `updatedAt` | `DateTime` |                        |                                             |

Relaciones 1:N a casi todo el dominio operativo (users, planillas, incapacidades, cobrosAliado, soportesAfiliacion, etc.). Para la auditoría, dos backrefs: `auditLogsComoActorSucursal` y `auditLogsComoEntidadSucursal`.

#### `UsuarioEmpresa` → `usuarios_empresas`

Permiso granular usuario × empresa (PK compuesta).

| Campo       | Tipo       | Modificadores                                       | Notas |
| ----------- | ---------- | --------------------------------------------------- | ----- |
| `userId`    | `String`   | parte de `@@id`, FK → `User` `onDelete: Cascade`    |       |
| `empresaId` | `String`   | parte de `@@id`, FK → `Empresa` `onDelete: Cascade` |       |
| `createdAt` | `DateTime` | `@default(now())`                                   |       |

### 8.3.3 Dominio CATÁLOGOS

#### `Empresa` → `empresas`

Empresa cliente global, administrada por ADMIN. Es el único modelo con campos del **bot Colpatria** (Sprint 8) y de la integración **PagoSimple**.

Bloque base: `id`, `nit @unique`, `nombre`, `dv?`, `nombreComercial?`, `tipoPersona? (TipoPersona)`, representante legal (`repLegalTipoDoc?`, `repLegalNumeroDoc?`, `repLegalNombre?`), ubicación (`direccion?`, `ciudad?`, `departamento?`, `departamentoId?`, `municipioId?`, `telefono?`, `email?`).

Bloque PILA: `ciiuPrincipal?`, `arlId?` (FK `EntidadSgss`), `fechaInicioActividades?`, `exoneraLey1607` (`@default(false)`).

Bloque PagoSimple: `pagosimpleContributorId?`, `pagosimpleSyncedAt?`.

Bloque Colpatria (Sprint 8): `colpatriaActivo` (`@default(false)`), `colpatriaUsuario?`, `colpatriaPasswordEnc?` (AES-256-GCM con `COLPATRIA_ENC_KEY`), `colpatriaPasswordSetAt?`, `colpatriaAplicacion?` (`@default("ARP")`), `colpatriaPerfil?` (`@default("OFI")`), `colpatriaEmpresaIdInterno?`, `colpatriaAfiliacionId?`, defaults del form: `colpatriaCodigoSucursalDefault?`, `colpatriaTipoAfiliacionDefault?`, `colpatriaGrupoOcupacionDefault?`, `colpatriaTipoOcupacionDefault?`, `colpatriaModalidadTrabajoDefault?` (deprecado, hardcoded "01" en bot).

Relaciones inversas: `nivelesPermitidos`, `actividadesPermitidas`, `tiposPermitidos`, `subtiposPermitidos`, `accesos` (UsuarioEmpresa), `afiliaciones`, `planillas`, `carterasConsolidado`, `incapacidades`, `colpatriaSesion` (1:1), `colpatriaJobs` (1:N).

Índices: `@@index([arlId])`, `@@index([departamentoId])`, `@@index([municipioId])`.

#### `EmpresaNivelRiesgo` → `empresa_nivel_riesgo`

PK compuesta `(empresaId, nivel)`. Mapea cada nivel ARL permitido a su código AXA Colpatria de centro de trabajo / grupo / tipo de ocupación (todos opcionales: si null, usar defaults de empresa).

#### `EmpresaActividad`, `EmpresaTipoCotizante`, `EmpresaSubtipoCotizante`

Tres tablas de unión para listas blancas de catálogos por empresa, todas con PK compuesta y `onDelete: Cascade` desde Empresa.

#### `EntidadSgss` → `entidades_sgss`

Catálogo unificado EPS/AFP/ARL/CCF.

| Campo                    | Tipo              | Modificadores          | Notas                                                                |
| ------------------------ | ----------------- | ---------------------- | -------------------------------------------------------------------- |
| `id`                     | `String`          | `@id @default(cuid())` |                                                                      |
| `tipo`                   | `TipoEntidadSgss` |                        | EPS / AFP / ARL / CCF                                                |
| `codigo`                 | `String`          |                        | Código del MinSalud                                                  |
| `nombre`                 | `String`          |                        |                                                                      |
| `codigoMinSalud`         | `String?`         |                        |                                                                      |
| `nit`                    | `String?`         |                        |                                                                      |
| `codigoAxa`              | `String?`         |                        | Sprint 8.5 — código del catálogo Colpatria (solo EPS/AFP relevantes) |
| `active`                 | `Boolean`         | `@default(true)`       |                                                                      |
| `createdAt`, `updatedAt` | `DateTime`        |                        |                                                                      |

`@@unique([tipo, codigo])`, `@@index([tipo])`. Backrefs hacia `Empresa`, `Afiliacion` (4 roles), `Incapacidad` (4 roles), `MovimientoIncapacidad`.

#### Otros catálogos

- **`ActividadEconomica`** (`actividades_economicas`): `codigoCiiu @unique`, `descripcion`, `active`. Relaciones a `Cargo`, `Afiliacion`, `EmpresaActividad`.
- **`Cargo`** (`cargos`): `codigo @unique`, `nombre`, `actividadEconomicaId?`. Índice por actividad.
- **`AsesorComercial`** (`asesores_comerciales`): scoped por sucursal (nullable = global). `@@unique([sucursalId, codigo])`.
- **`MedioPago`** (`medios_pago`): scoped por sucursal. `@@unique([sucursalId, codigo])`.
- **`ServicioAdicional`** (`servicios_adicionales`): `precio Decimal(12,2)`, scoped por sucursal.
- **`TipoCotizante`** (`tipos_cotizante`): `codigo @unique`, `modalidad: Modalidad @default(DEPENDIENTE)`. Hijos: `Subtipo`.
- **`Subtipo`** (`subtipos_cotizante`): `@@unique([codigo, tipoCotizanteId])`.
- **`PlanSgss`** (`planes_sgss`): `codigo @unique`, `nombre`, `incluyeEps/Afp/Arl/Ccf` (booleans), `regimen: RegimenPlan @default(AMBOS)`. Índice por `regimen`.
- **`ComprobanteFormato`** (`comprobante_formatos`): 1:1 con sucursal, `logoUrl`, `encabezado`, `pieDePagina`, `camposConfig: Json?`.
- **`CuentaCobro`** (`cuentas_cobro`): empresa empleadora agrupadora; `@@unique([sucursalId, codigo])`.
- **`SmlvConfig`** (`smlv_config`): singleton (`id @default("singleton")`), `valor Decimal(12,2)`, `vigenteDesde`.
- **`TarifaSgss`** (`tarifas_sgss`): `concepto`, `modalidad?`, `nivelRiesgo?`, `exonera?`, `porcentaje Decimal(6,4)`, `etiqueta?`, `vigenteDesde`. Índices por `concepto` y `active`.
- **`FspRango`** (`fsp_rangos`): rangos de SMLV con `porcentaje Decimal(6,4)`. `smlvHasta` null = sin tope.
- **`Departamento`** (`departamentos`): DIVIPOLA 2 dígitos. `codigo @unique`, `nombre @unique`.
- **`Municipio`** (`municipios`): DIVIPOLA 5 dígitos. `@@unique([nombre, departamentoId])`.

### 8.3.4 Dominio AFILIACIÓN

#### `Cotizante` → `cotizantes`

| Campo                                                                  | Tipo                  | Modificadores                        | Notas                        |
| ---------------------------------------------------------------------- | --------------------- | ------------------------------------ | ---------------------------- | --- | --- | --- | --- | --- | ---- |
| `id`                                                                   | `String`              | `@id @default(cuid())`               |                              |
| `sucursalId`                                                           | `String?`             | FK → `Sucursal` `onDelete: Restrict` | Multi-tenant; null = legado  |
| `tipoDocumento`                                                        | `TipoDocumento`       |                                      | `CC                          | CE  | NIT | PAS | TI  | RC  | NIP` |
| `numeroDocumento`                                                      | `String`              |                                      |                              |
| `fechaExpedicionDoc`                                                   | `DateTime?`           |                                      |                              |
| `primerNombre`, `segundoNombre?`, `primerApellido`, `segundoApellido?` | `String`              |                                      |                              |
| `fechaNacimiento`                                                      | `DateTime`            |                                      |                              |
| `genero`                                                               | `Genero`              |                                      | `M                           | F   | O`  |
| `estadoCivil`                                                          | `String?`             |                                      | Sprint 8: códigos AXA `1..5` |
| `telefono`, `celular`, `email`, `direccion`                            | `String?`             |                                      |                              |
| `municipioId`, `departamentoId`                                        | `String?`             | FK → DIVIPOLA `onDelete: SetNull`    |                              |
| `pagosimpleContributorId`, `pagosimpleSyncedAt`                        | `String? / DateTime?` |                                      | Sólo INDEPENDIENTE           |
| `createdAt`, `updatedAt`                                               | `DateTime`            |                                      |                              |

Único: `@@unique([sucursalId, tipoDocumento, numeroDocumento])`.

Índices: `@@index([sucursalId])`, `@@index([primerApellido, primerNombre])`, `@@index([municipioId])`, `@@index([departamentoId])`.

#### `Afiliacion` → `afiliaciones`

Liga un cotizante a su empleador (o no, si independiente) con plan, nivel ARL, salario y fechas. **Único par cotizante × modalidad** (Sprint Soporte reorg fase 2 — un cotizante tiene como máximo una DEPENDIENTE y una INDEPENDIENTE).

Campos clave: `cotizanteId`, `empresaId?`, `cuentaCobroId?`, `asesorComercialId?`, `planSgssId?`, `actividadEconomicaId?`, `tipoCotizanteId`, `subtipoId?`, `modalidad`, `nivelRiesgo`, `regimen?`, `formaPago?` (sólo INDEP), `salario Decimal(12,2)`, `valorAdministracion Decimal(12,2)`, `fechaIngreso`, `fechaRetiro?`, `estado: EstadoAfiliacion @default(ACTIVA)`.

Bloque bot Colpatria: `cargo?` (ej. "Operario"), `tipoSalario?` (deprecado, default `"BASICO"`).

Entidades SGSS: `epsId?`, `afpId?`, `arlId?` (sólo INDEP), `ccfId?`.

Únicos e índices:

```
@@unique([cotizanteId, modalidad])  -- Sprint Soporte reorg fase 2
@@index([cotizanteId])
@@index([empresaId])
@@index([estado])
@@index([modalidad])
@@index([actividadEconomicaId])
@@index([arlId])
```

Borrado de cotizante → `Cascade`. Empresa → `Restrict`.

#### `AfiliacionServicio` → `afiliacion_servicios`

PK compuesta. Vínculo m2m entre `Afiliacion` y `ServicioAdicional`.

### 8.3.5 Dominio TRANSACCIONAL

#### `PeriodoContable` → `periodos_contables`

Período mensual contable. `@@unique([anio, mes])`. Estados: `ABIERTO | CERRADO`. `smlvSnapshot` denormaliza el SMLV vigente al abrir.

#### `Liquidacion` → `liquidaciones`

| Campo                                                              | Tipo                | Modificadores                    | Notas                                   |
| ------------------------------------------------------------------ | ------------------- | -------------------------------- | --------------------------------------- | ------------ | ------ | -------- |
| `id`                                                               | `String`            | `@id`                            |                                         |
| `periodoId`                                                        | `String`            | FK → `PeriodoContable` `Cascade` |                                         |
| `afiliacionId`                                                     | `String`            | FK → `Afiliacion` `Cascade`      |                                         |
| `tipo`                                                             | `TipoLiquidacion`   | `@default(MENSUALIDAD)`          | `VINCULACION                            | MENSUALIDAD` |
| `ibc`                                                              | `Decimal(12,2)`     |                                  | Base de cotización                      |
| `periodoAporteAnio?`, `periodoAporteMes?`                          | `Int?`              |                                  | Distinto al contable para INDEP vencido |
| `diasCotizados`                                                    | `Int`               | `@default(30)`                   |                                         |
| `diaDesde?`, `diaHasta?`                                           | `Int?`              |                                  | Para liquidaciones parciales (1..30)    |
| `totalEmpleador`, `totalTrabajador`, `totalGeneral`, `totalPagado` | `Decimal(14,2)`     | `@default(0)`                    |                                         |
| `estado`                                                           | `EstadoLiquidacion` | `@default(BORRADOR)`             | `BORRADOR                               | REVISADA     | PAGADA | ANULADA` |

`@@unique([periodoId, afiliacionId, tipo])`. Índices: por `periodoId`, `afiliacionId`, `estado`, `tipo`, y compuesto `[afiliacionId, estado]` (Sprint perf).

#### `LiquidacionConcepto` → `liquidacion_conceptos`

Línea de desglose. `concepto` (string libre: `EPS | AFP | ARL | CCF | SENA | ICBF | FSP | ADMIN`), `subconcepto?`, `base`, `porcentaje Decimal(8,4)`, `valor Decimal(14,2)`, `aCargoEmpleador: Boolean @default(true)`. Se recrea en cada recálculo.

#### `Comprobante` → `comprobantes`

Agrupador de liquidaciones con consecutivo `CMP-######`. Tres formas de agrupación (`AgrupacionComprobante`): `INDIVIDUAL`, `EMPRESA_CC`, `ASESOR_COMERCIAL`. Estados: `BORRADOR | EMITIDO | PAGADO | ANULADO`.

Campos clave: `tipo (TipoComprobante)`, `agrupacion`, `consecutivo @unique`, destinatario (`cotizanteId? | cuentaCobroId? | asesorComercialId?` — sólo uno se llena), totales (`totalSgss`, `totalAdmon`, `totalServicios`, `totalEmpleador`, `totalTrabajador`, `totalGeneral`, `totalPagado` — todos `Decimal(14,2) @default(0)`), pago (`numeroComprobanteExt?`, `formaPago?`, `fechaPago?`, `medioPagoId?`, `procesadoEn?`, `emitidoEn?`, `pagadoEn?`), `valorAdminOverride?`, `aplicaNovedadRetiro Boolean @default(false)`, `esCierreMasivo Boolean @default(false)`, `numeroPlanilla?`, `createdById?`.

Índices: por `periodoId`, `estado`, `tipo+agrupacion`, `cotizanteId`, `cuentaCobroId`, `asesorComercialId`, `medioPagoId`, `procesadoEn`, `numeroPlanilla`, `createdById`.

#### `ComprobanteLiquidacion` → `comprobante_liquidaciones`

Pivote m2m. PK compuesta. Una liquidación puede estar en varios comprobantes.

#### `Planilla` → `planillas`

Planilla PILA por aportante × período. Consecutivo `PLN-######`. Tipo: `E | I | Y | N | K | A | S` (Resolución 2388/2016). Estados: `CONSOLIDADO | PAGADA | ANULADA`.

Campos: `periodoId`, `sucursalId?`, `tipoPlanilla`, `numeroPlanillaExt?`, `empresaId?` (NN si tipo E), `cotizanteId?` (NN si I/Y), `periodoAporteAnio + periodoAporteMes`, totales por subsistema (`totalSalud`, `totalPension`, `totalArl`, `totalCcf`, `totalSena`, `totalIcbf`, `totalFsp`, `totalGeneral` — todos `Decimal(14,2)`), `cantidadCotizantes Int`, `estado`, `generadoEn`, `pagadoEn?`, `createdById?`, `observaciones?`.

Bloque PagoSimple: `pagosimpleNumero?`, `pagosimplePin?`, `pagosimpleEstadoValidacion?`, `pagosimplePaymentUrl?`, `pagosimpleTotalSgss?`, `pagosimpleTotalMora?`, `pagosimpleTotalPagar?`, `pagosimpleSyncedAt?`.

Índices: `[periodoId]`, `[sucursalId]`, `[estado]`, `[tipoPlanilla]`, `[empresaId]`, `[cotizanteId]`, `[periodoAporteAnio, periodoAporteMes]`.

#### `PlanillaComprobante` → `planillas_comprobantes`

Pivote m2m. PK compuesta. `onDelete` desde Planilla = `Cascade`, desde Comprobante = `Restrict`.

### 8.3.6 Dominio CARTERA

#### `CarteraConsolidado` → `cartera_consolidado`

Cabecera de un PDF de estado de cuenta importado. Consecutivo `CC-######`.

| Campo                                      | Tipo                  | Notas                                                                |
| ------------------------------------------ | --------------------- | -------------------------------------------------------------------- |
| `tipoEntidad`                              | `CarteraTipoEntidad`  | EPS/AFP/ARL/CCF                                                      |
| `entidadNombre`, `entidadNit?`             | `String / String?`    |                                                                      |
| `empresaNit`, `empresaRazonSocial`         | `String`              | Denormalizado del PDF                                                |
| `empresaId?`                               | `String?`             | Match contra Empresa                                                 |
| `periodoDesde?`, `periodoHasta?`           | `String?`             | Formato `AAAA-MM`                                                    |
| `cantidadRegistros`, `valorTotalInformado` | `Int / Decimal(15,2)` |                                                                      |
| `estado`                                   | `CarteraEstado`       | Inicial: `EN_CONCILIACION`                                           |
| `origenPdf`                                | `CarteraOrigenPdf?`   | PROTECCION / SALUD_TOTAL / EPS_SOS / EPS_SURA / EPS_SANITAS / MANUAL |
| `archivoOrigenPath?`, `archivoOrigenHash?` | `String?`             | sha-256                                                              |

`@@unique([empresaNit, entidadNombre, periodoHasta])` (anti re-import silencioso). Índices: `[empresaId]`, `[estado]`, `[fechaRegistro]`.

#### `CarteraDetallado` → `cartera_detallado`

Una línea = un cotizante × período × valor.

| Campo                                                | Tipo            | Notas                           |
| ---------------------------------------------------- | --------------- | ------------------------------- |
| `consolidadoId`                                      | `String`        | FK Cascade                      |
| `tipoDocumento`, `numeroDocumento`, `nombreCompleto` | enum/string     |                                 |
| `periodoCobro`                                       | `String`        | `AAAA-MM`                       |
| `valorCobro`, `ibc?`                                 | `Decimal(15,2)` |                                 |
| `novedad?`                                           | `String?`       | IGE/NVL/etc.                    |
| `sucursalAsignadaId?`                                | `String?`       | Auto-match por cédula; editable |
| `cotizanteId?`                                       | `String?`       |                                 |
| `estado`                                             | `CarteraEstado` |                                 |

Índices simples: `[consolidadoId]`, `[sucursalAsignadaId]`, `[cotizanteId]`, `[estado]`, `[numeroDocumento]`. **Compuesto Sprint perf**: `[sucursalAsignadaId, estado, updatedAt(sort: Desc)]` para la bandeja administrativa.

#### `CarteraGestion` → `cartera_gestion`

Bitácora por línea. `accionadaPor: CarteraAccionadaPor (SOPORTE | ALIADO)`, `nuevoEstado?`, `descripcion`, `userId?`, `userName?`.

#### `GestionCartera` → `gestiones_cartera`

Bitácora paralela "antigua" por (cotizante × periodo) — mantiene LLAMADA/EMAIL/SMS/VISITA/NOTA/OTRO. Índices: `[cotizanteId]`, `[periodoId]`, `[cotizanteId, periodoId]`.

### 8.3.7 Dominio SOPORTE · INCAPACIDADES · JURÍDICO

#### `Incapacidad` → `incapacidades`

Radicación. Consecutivo `INC-######`.

| Campo                                         | Tipo                | Notas                      |
| --------------------------------------------- | ------------------- | -------------------------- |
| `sucursalId`                                  | `String`            | tenant owner               |
| `cotizanteId`                                 | `String`            | match por tipoDoc + numDoc |
| `tipo`                                        | `IncapacidadTipo`   | EG / LM / LP / AT / ATSOAT |
| `fechaInicio`, `fechaFin`                     | `DateTime`          |                            |
| `diasIncapacidad`                             | `Int`               |                            |
| `empresaPlanillaId?` y snapshots de entidades | `String?`           | EPS/AFP/ARL/CCF al radicar |
| `fechaAfiliacionSnap?`                        | `DateTime?`         |                            |
| `estado`                                      | `IncapacidadEstado` | Default `RADICADA`         |
| `observaciones?`, `createdById?`              |                     |                            |

Índices: `[sucursalId]`, `[cotizanteId]`, `[estado]`, `[tipo]`, `[fechaRadicacion]`, **compuesto Sprint perf** `[sucursalId, estado, fechaRadicacion(sort: Desc)]`.

#### `IncapacidadDocumento` → `incapacidad_documentos`

Adjunto con retención 120 días.

| Campo                                                                               | Tipo                                       | Notas                                                                              |
| ----------------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------- | ------ | --------- |
| `incapacidadId`                                                                     | `String`                                   | FK Cascade                                                                         |
| `tipo`                                                                              | `IncapacidadDocumentoTipo`                 | 11 valores (6 médicos + 5 jurídicos)                                               |
| `archivoPath`, `archivoHash`, `archivoMime`, `archivoSize`, `archivoNombreOriginal` | mixto                                      | hash sha-256 hex                                                                   |
| `eliminado`                                                                         | `Boolean @default(false)`                  | Día 121: archivo borrado, fila queda                                               |
| `eliminadoEn`                                                                       | `DateTime?`                                |                                                                                    |
| `accionadaPor`                                                                      | `IncapacidadAccionadaPor @default(ALIADO)` | `SOPORTE                                                                           | ALIADO | JURIDICO` |
| `confidencial`                                                                      | `Boolean @default(false)`                  | **Sprint Jurídico** — sólo permiso `soporte.juridico_confidencial` puede descargar |
| `userId?`                                                                           | `String?`                                  |                                                                                    |

Índices: `[incapacidadId]`, `[tipo]`, `[eliminado]`, `[userId]`.

#### `IncapacidadGestion` → `incapacidad_gestion`

Bitácora con `accionadaPor`, `nuevoEstado?`, `descripcion`, `userId?`.

#### `SoporteAfiliacion` → `soporte_afiliacion`

Solicitud automática a soporte cuando el aliado crea/edita una afiliación ACTIVA. Consecutivo `SOP-AF-######`.

Campos: `afiliacionId`, `cotizanteId`, `sucursalId` (denormalizado), `createdById?`, `disparos: SoporteAfTipoDisparo[]` (array enum), `snapshotAntes / snapshotDespues: Json?`, `modalidadSnap`, `planNombreSnap?`, `regimenSnap?`, `estado` (default EN_PROCESO), `estadoObservaciones?`, `gestionadoPorId?`, `gestionadoEn?`, **`asignadoAUserId?`** (Sprint Soporte reorg — asignación proactiva), `periodoId?`.

Índices: `[sucursalId, estado]`, `[periodoId]`, `[createdById]`, `[afiliacionId]`, `[cotizanteId]`, `[fechaRadicacion]`, `[asignadoAUserId]`, **compuestos Sprint perf**: `[estado, fechaRadicacion(sort: Desc)]` y `[asignadoAUserId, estado]`.

#### `SoporteAfDocumento` → `soporte_afiliacion_documentos`

Mismo formato que `IncapacidadDocumento` (retención 120d). `accionadaPor: SoporteAfAccionadaPor` (`SOPORTE | ALIADO | BOT`).

#### `SoporteAfGestion` → `soporte_afiliacion_gestion`

Bitácora análoga con enum `SoporteAfAccionadaPor` (incluye `BOT`).

### 8.3.8 Dominio FINANZAS

#### `CobroAliado` → `cobro_aliado`

Cobro mensual al aliado. `@@unique([sucursalId, periodoId])`.

Campos: `consecutivo @unique` (CA-######), `fechaGenerado`, `fechaLimite` (día 15 mes siguiente), `fechaPagado?`, `fechaBloqueo?`, `cantAfiliaciones`, `cantMensualidades`, `valorAfiliaciones`, `valorMensualidades`, `totalCobro`, `estado: CobroAliadoEstado` (PENDIENTE/PAGADO/VENCIDO/ANULADO), `medioPagoId?`, `referenciaPago?`, `observaciones?`, `createdById?`.

Índices: `[estado]`, `[fechaLimite]`, `[periodoId]`.

#### `CobroAliadoConcepto` → `cobro_aliado_concepto`

Línea: `tipo: CobroAliadoConceptoTipo` (AFILIACION_PROCESADA/MENSUALIDAD), `referenciaId?` (afiliacion o comprobante), `regimen?`, `cantidad`, `valorUnit Decimal(12,2)`, `subtotal Decimal(12,2)`.

#### `CobroAliadoDocumento` → `cobro_aliado_documento`

Soportes (recibo de pago, etc.) con campos archivo estándar.

#### `MovimientoIncapacidad` → `movimiento_incapacidad`

Movimiento bancario importado. Consecutivo `MI-######`. Estados: `PENDIENTE | CONCILIADO | ANULADO`. `hashIdentidad @unique` previene duplicados al re-importar (`sha256(banco|fecha|valor|concepto)`).

Sprint Soporte reorg: `entidadSgssId?` para registrar la EPS/ARL origen del depósito.

Índices: `[estado]`, `[fechaIngreso]`, `[empresaId]`, `[entidadSgssId]`.

#### `MovimientoIncDetalle` → `movimiento_inc_detalle`

Desglose por cotizante.

| Campo                                                                          | Tipo                      | Notas                                |
| ------------------------------------------------------------------------------ | ------------------------- | ------------------------------------ |
| `movimientoId`                                                                 | `String`                  | FK Cascade                           |
| `tipoDocumento`, `numeroDocumento`, `nombreCompleto`                           | snapshot                  |                                      |
| `cotizanteId?`, `incapacidadId?`, `sucursalId?`                                | FKs opcionales            | match por documento                  |
| `subtotal`, `retencion4x1000` (0.4%), `retencionImpuesto` (3.5%), `totalPagar` | `Decimal(12,2)`           |                                      |
| `formaPago`                                                                    | `MovimientoFormaPago?`    | **Legacy** (deprecado)               |
| `medioPago`                                                                    | `MedioPagoFisico?`        | EFECTIVO / TRANSFERENCIA             |
| `numeroTransaccion?`                                                           | `String?`                 | Obligatorio si TRANSFERENCIA         |
| `estado`                                                                       | `MovimientoDetalleEstado` | PENDIENTE/EN_PROCESO/PAGADA/DEVUELTA |
| `fechaPago?`, `pagadoConEmpresaId?`                                            |                           |                                      |

Índices: `[movimientoId]`, `[estado]`, `[numeroDocumento]`, `[sucursalId]`, `[incapacidadId]`.

#### `MovimientoDetalleDocumento` → `movimiento_det_documento`

Comprobantes individuales (transferencia, recibo).

### 8.3.9 Dominio BOT COLPATRIA (Sprint 8)

#### `ColpatriaSesion` → `colpatria_sesiones`

Sesión cacheada con el portal AXA. 1:1 con `Empresa` (`empresaId @unique`).

| Campo        | Tipo        | Notas                                         |
| ------------ | ----------- | --------------------------------------------- |
| `cookiesEnc` | `String`    | `storageState` Playwright cifrado AES-256-GCM |
| `expiraEn`   | `DateTime?` | Si null o pasado → login fresco               |

#### `ColpatriaAfiliacionJob` → `colpatria_afiliacion_jobs`

| Campo                                      | Tipo                 | Notas                                                                                                                                   |
| ------------------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `afiliacionId`, `empresaId`                | `String`             | Cascade desde ambos                                                                                                                     |
| `status`                                   | `ColpatriaJobStatus` | PENDING/RUNNING/SUCCESS/FAILED/RETRYABLE                                                                                                |
| `intento`                                  | `Int @default(1)`    | 1..MAX_INTENTOS                                                                                                                         |
| `payload`                                  | `Json`               | Snapshot de la afiliación al crear                                                                                                      |
| `startedAt?`, `finishedAt?`, `durationMs?` |                      |                                                                                                                                         |
| `pdfPath?`                                 | `String?`            | Relativo a UPLOADS_DIR                                                                                                                  |
| `pdfArchivedAt?`                           | `DateTime?`          | **Sprint 8.5.C** — marca cuando el cron borra el PDF físico (3d default), `pdfPath` queda como evidencia (el endpoint retorna 410 Gone) |
| `screenshotsPaths?`                        | `Json?`              | Array de paths por paso                                                                                                                 |
| `error?`, `errorDetalle?`                  | `String? / Json?`    |                                                                                                                                         |

Índices: `[status, createdAt]`, `[afiliacionId]`, `[empresaId, status]`.

### 8.3.10 Dominio AUDITORÍA · CRON · NOTIFICACIONES

#### `AuditLog` → `audit_logs`

Bitácora transversal. Visibilidad: STAFF ve todo; ALIADO_OWNER sólo cuando `userSucursalId` o `entidadSucursalId` coincide con su sucursal; ALIADO_USER no accede.

Campos: `entidad`, `entidadId`, `accion` (CREAR/EDITAR/ELIMINAR/TOGGLE — string libre), `userId?`, `userName?`, `descripcion?`, `cambios: Json?` (`{antes, despues, campos}`), `createdAt`. Sprint 6 añadió: `userRole?`, `userSucursalId?`, `entidadSucursalId?`, `ip?`.

Índices: `[entidad, entidadId]`, `[userId, createdAt]`, `[userSucursalId, createdAt]`, `[entidadSucursalId, createdAt]`, `[createdAt]`.

Retención: cron mensual purga filas con `createdAt > 12 meses` (workflow `auditoria-purge-monthly.yml`).

#### `CronRun` → `cron_runs`

Cada ejecución de un cron registra arranque/cierre, `durationMs`, `output` y `error`.

| Campo                      | Tipo            | Notas                            |
| -------------------------- | --------------- | -------------------------------- |
| `jobName`                  | `String`        | Nombre del workflow (kebab-case) |
| `status`                   | `CronRunStatus` | RUNNING / OK / ERROR             |
| `startedAt`, `finishedAt?` | `DateTime`      |                                  |
| `durationMs?`              | `Int?`          |                                  |
| `output?`, `error?`        | `String?`       |                                  |

Índices: `[jobName, startedAt]`, `[startedAt]`. Alimenta el "status page" del Sprint 7.3.

#### `Notificacion` → `notificaciones`

Targeting flexible: `destinoUserId? | destinoRole? | destinoSucursalId?` (al menos uno). Tipo enum: SOPORTE_NUEVA_AFILIACION / SOPORTE_NUEVA_INCAPACIDAD / SOPORTE_RESPUESTA_CARTERA / ALIADO_CARTERA_ASIGNADA / ALIADO_GESTION_INCAPACIDAD / SOPORTE_NOTA_INCAPACIDAD.

Campos: `titulo`, `mensaje`, `href?`, `metadatos: Json?`. Índices por cada destino + `createdAt`.

#### `NotificacionLectura` → `notificacion_lectura`

`@@unique([notificacionId, userId])`. Marca leída por usuario, sin duplicar el origen.

---

## 8.4 Enums

| Enum                       | Valores                                                                                                                                                                                                                         | Uso                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `Role`                     | `ADMIN`, `SOPORTE`, `ALIADO_OWNER`, `ALIADO_USER` (deprecado)                                                                                                                                                                   | Roles base del sistema                               |
| `TipoPersona`              | `NATURAL`, `JURIDICA`                                                                                                                                                                                                           | Empresa / CuentaCobro                                |
| `TipoDocumento`            | `CC`, `CE`, `NIT`, `PAS`, `TI`, `RC`, `NIP`                                                                                                                                                                                     | Cotizante, CarteraDetallado                          |
| `NivelRiesgo`              | `I`, `II`, `III`, `IV`, `V`                                                                                                                                                                                                     | ARL                                                  |
| `TipoEntidadSgss`          | `EPS`, `AFP`, `ARL`, `CCF`                                                                                                                                                                                                      | EntidadSgss                                          |
| `Genero`                   | `M`, `F`, `O`                                                                                                                                                                                                                   | Cotizante                                            |
| `EstadoAfiliacion`         | `ACTIVA`, `INACTIVA`                                                                                                                                                                                                            |                                                      |
| `Regimen`                  | `ORDINARIO`, `RESOLUCION`                                                                                                                                                                                                       | Afiliación                                           |
| `Modalidad`                | `DEPENDIENTE`, `INDEPENDIENTE`                                                                                                                                                                                                  | TipoCotizante / Afiliación                           |
| `FormaPago`                | `VIGENTE`, `VENCIDO`                                                                                                                                                                                                            | Sólo INDEPENDIENTE                                   |
| `RegimenPlan`              | `ORDINARIO`, `RESOLUCION`, `AMBOS`                                                                                                                                                                                              | PlanSgss                                             |
| `EstadoPeriodo`            | `ABIERTO`, `CERRADO`                                                                                                                                                                                                            |                                                      |
| `EstadoLiquidacion`        | `BORRADOR`, `REVISADA`, `PAGADA`, `ANULADA`                                                                                                                                                                                     |                                                      |
| `TipoLiquidacion`          | `VINCULACION`, `MENSUALIDAD`                                                                                                                                                                                                    |                                                      |
| `TipoComprobante`          | `AFILIACION`, `MENSUALIDAD`                                                                                                                                                                                                     |                                                      |
| `AgrupacionComprobante`    | `INDIVIDUAL`, `EMPRESA_CC`, `ASESOR_COMERCIAL`                                                                                                                                                                                  |                                                      |
| `EstadoComprobante`        | `BORRADOR`, `EMITIDO`, `PAGADO`, `ANULADO`                                                                                                                                                                                      |                                                      |
| `FormaPagoTransaccion`     | `POR_CONFIGURACION`, `CONSOLIDADO`, `POR_MEDIO_PAGO`                                                                                                                                                                            |                                                      |
| `TipoPlanilla`             | `E`, `I`, `Y`, `N`, `K`, `A`, `S`                                                                                                                                                                                               | Resolución 2388/2016                                 |
| `EstadoPlanilla`           | `CONSOLIDADO`, `PAGADA`, `ANULADA`                                                                                                                                                                                              |                                                      |
| `CarteraTipoEntidad`       | `EPS`, `AFP`, `ARL`, `CCF`                                                                                                                                                                                                      |                                                      |
| `CarteraEstado`            | `EN_CONCILIACION`, `CONCILIADA`, `ENVIADA`, `MORA_REAL`, `CARTERA_REAL`, `PAGADA_CARTERA_REAL`                                                                                                                                  |                                                      |
| `CarteraOrigenPdf`         | `PROTECCION`, `SALUD_TOTAL`, `EPS_SOS`, `EPS_SURA`, `EPS_SANITAS`, `MANUAL`                                                                                                                                                     | Detección de parser                                  |
| `CarteraAccionadaPor`      | `SOPORTE`, `ALIADO`                                                                                                                                                                                                             |                                                      |
| `IncapacidadTipo`          | `ENFERMEDAD_GENERAL`, `LICENCIA_MATERNIDAD`, `LICENCIA_PATERNIDAD`, `ACCIDENTE_TRABAJO`, `ACCIDENTE_TRANSITO_SOAT`                                                                                                              |                                                      |
| `IncapacidadEstado`        | `RADICADA`, `EN_REVISION`, `APROBADA`, `PAGADA`, `RECHAZADA`, **`TRASLADO_A_JURIDICO`**, **`EN_PROCESO_JURIDICO`**                                                                                                              | Sprint Jurídico (2026-04-28) añadió los dos últimos  |
| `IncapacidadDocumentoTipo` | `COPIA_CEDULA`, `CERTIFICADO_INCAPACIDAD`, `HISTORIA_CLINICA`, `CERTIFICADO_BANCARIO`, `AUTORIZACION_PAGO_TERCEROS`, `FURIPS_SOAT`, **`DERECHO_PETICION`**, **`TUTELA`**, **`DESACATO`**, **`RESOLUCION`**, **`OTRO_JURIDICO`** | 5 últimos sprint Jurídico (sólo `confidencial=true`) |
| `IncapacidadAccionadaPor`  | `SOPORTE`, `ALIADO`, **`JURIDICO`**                                                                                                                                                                                             |                                                      |
| `SoporteAfTipoDisparo`     | `NUEVA`, `REACTIVACION`, `CAMBIO_FECHA_INGRESO`, `CAMBIO_EMPRESA`, `CAMBIO_NIVEL_ARL`, `CAMBIO_PLAN_SGSS`                                                                                                                       |                                                      |
| `SoporteAfEstado`          | `EN_PROCESO`, `PROCESADA`, `RECHAZADA`, `NOVEDAD`                                                                                                                                                                               |                                                      |
| `SoporteAfAccionadaPor`    | `SOPORTE`, `ALIADO`, `BOT`                                                                                                                                                                                                      | `BOT` añadido en Sprint Soporte reorg                |
| `CobroAliadoEstado`        | `PENDIENTE`, `PAGADO`, `VENCIDO`, `ANULADO`                                                                                                                                                                                     |                                                      |
| `CobroAliadoConceptoTipo`  | `AFILIACION_PROCESADA`, `MENSUALIDAD`                                                                                                                                                                                           |                                                      |
| `MovimientoIncEstado`      | `PENDIENTE`, `CONCILIADO`, `ANULADO`                                                                                                                                                                                            |                                                      |
| `MovimientoFormaPago`      | `PAGO_COTIZANTE`, `PAGO_ALIADO`, `CRUCE_COBRO_ALIADO`                                                                                                                                                                           | Legacy                                               |
| `MedioPagoFisico`          | `EFECTIVO`, `TRANSFERENCIA`                                                                                                                                                                                                     | Sustituye al anterior                                |
| `MovimientoDetalleEstado`  | `PENDIENTE`, `EN_PROCESO`, `PAGADA`, `DEVUELTA`                                                                                                                                                                                 |                                                      |
| `NotificacionTipo`         | `SOPORTE_NUEVA_AFILIACION`, `SOPORTE_NUEVA_INCAPACIDAD`, `SOPORTE_RESPUESTA_CARTERA`, `ALIADO_CARTERA_ASIGNADA`, `ALIADO_GESTION_INCAPACIDAD`, `SOPORTE_NOTA_INCAPACIDAD`                                                       |                                                      |
| `CronRunStatus`            | `RUNNING`, `OK`, `ERROR`                                                                                                                                                                                                        |                                                      |
| `ColpatriaJobStatus`       | `PENDING`, `RUNNING`, `SUCCESS`, `FAILED`, `RETRYABLE`                                                                                                                                                                          |                                                      |

---

## 8.5 Migraciones

Total acumulado: **63 migraciones** versionadas en `packages/db/prisma/migrations/`. La más antigua es `20260420195713_init` y la más reciente `20260428212016_juridico_doc_tipos_extension`. A continuación, las **últimas 15 migraciones más relevantes** con su propósito:

| #   | Carpeta                                                    | Propósito                                                                                                                                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `20260428212016_juridico_doc_tipos_extension`              | `ALTER TYPE IncapacidadDocumentoTipo` añade 5 valores jurídicos (`DERECHO_PETICION`, `TUTELA`, `DESACATO`, `RESOLUCION`, `OTRO_JURIDICO`).                                                                                                                                                                                                    |
| 2   | `20260428171056_juridico_estados_y_documento_confidencial` | `IncapacidadEstado` += `TRASLADO_A_JURIDICO` y `EN_PROCESO_JURIDICO`; `IncapacidadAccionadaPor` += `JURIDICO`; `incapacidad_documentos.confidencial Boolean DEFAULT false`.                                                                                                                                                                   |
| 3   | `20260428144906_agregar_indices_compuestos_perf`           | **Índices compuestos en 4 tablas de alto volumen** (commit `df9238d`): `cartera_detallado(sucursalAsignadaId, estado, updatedAt DESC)`, `incapacidades(sucursalId, estado, fechaRadicacion DESC)`, `liquidaciones(afiliacionId, estado)`, `soporte_afiliacion(estado, fechaRadicacion DESC)` y `soporte_afiliacion(asignadoAUserId, estado)`. |
| 4   | `20260427210000_afiliacion_unique_cotizante_modalidad`     | `CREATE UNIQUE INDEX afiliaciones(cotizanteId, modalidad)` — un cotizante sólo puede tener una afiliación DEPENDIENTE y una INDEPENDIENTE.                                                                                                                                                                                                    |
| 5   | `20260427202811_notif_soporte_nota_incapacidad`            | `NotificacionTipo` += `SOPORTE_NOTA_INCAPACIDAD`.                                                                                                                                                                                                                                                                                             |
| 6   | `20260427193218_incapacidad_doc_accionada_por`             | `incapacidad_documentos.accionadaPor` (default ALIADO) — distingue subidas de soporte vs aliado.                                                                                                                                                                                                                                              |
| 7   | `20260427183939_detalle_mov_medio_pago_devuelta`           | `MovimientoIncDetalle.medioPago` (`MedioPagoFisico`), `numeroTransaccion`; estado += `DEVUELTA`.                                                                                                                                                                                                                                              |
| 8   | `20260427180826_soporte_reorg_asignacion_entidad`          | `SoporteAfAccionadaPor` += `BOT`; `soporte_afiliacion.asignadoAUserId`; `movimiento_incapacidad.entidadSgssId` con FK.                                                                                                                                                                                                                        |
| 9   | `20260427142053_sprint8_5c_pdf_archived_at`                | `colpatria_afiliacion_jobs.pdfArchivedAt` — marca cuándo se borró el PDF físico (3d) preservando metadata.                                                                                                                                                                                                                                    |
| 10  | `20260427132148_sprint8_5a_codigo_axa_entidades`           | `entidades_sgss.codigoAxa` — mapeo de catálogo AXA Colpatria.                                                                                                                                                                                                                                                                                 |
| 11  | `20260426235937_sprint8_05c_colpatria_grupotipo_por_nivel` | `empresa_nivel_riesgo.colpatriaGrupoOcupacion` y `colpatriaTipoOcupacion`.                                                                                                                                                                                                                                                                    |
| 12  | `20260426220035_sprint8_05_colpatria_extended`             | Defaults Colpatria por empresa: aplicación, perfil, IDs internos, sucursal/grupo/tipo ocupación, etc.                                                                                                                                                                                                                                         |
| 13  | `20260426212912_sprint8_colpatria_bot`                     | **Núcleo del bot**: `ColpatriaJobStatus` enum, `colpatria_sesiones`, `colpatria_afiliacion_jobs`, columnas Colpatria en `empresas`.                                                                                                                                                                                                           |
| 14  | `20260426163407_sprint7_cron_run`                          | Tabla `cron_runs` (status page Sprint 7.3).                                                                                                                                                                                                                                                                                                   |
| 15  | `20260426143554_sprint6_audit_log_extension`               | Bitácora extendida: `userRole`, `userSucursalId`, `entidadSucursalId`, `ip`.                                                                                                                                                                                                                                                                  |

> **Migraciones más antiguas relevantes** (ya consolidadas): `init` (esquema base), `catalogos`, `permisos`, `roles_custom`, `cotizante_afiliacion`, `audit_log`, `incapacidades_schema`, `soporte_afiliacion_schema`, `finanzas_schema`, `notificaciones`, `consecutivos_seq_catalogos` (sequences Postgres para CMP-/PLN-/CC-/MI-/CA-/INC-/SOP-AF-).

### 8.5.1 Lección durable — "no shadow URLs / migraciones aditivas siempre"

> En abril de 2026 (commit base de la rama dev) se perdieron datos en Neon dev por usar mal una **shadow database URL** durante un `prisma migrate dev`: Prisma creó una shadow temporal y, con la URL mal configurada, **corrió el reset sobre la BD real**. Lección que aplica para todo el equipo:
>
> 1. **Nunca** ejecutar `prisma migrate reset` sin estar 100% seguro de que el `DATABASE_URL` del shell apunta a una BD descartable.
> 2. **Migraciones aditivas siempre**: añadir columnas nullable o con default; nunca renombrar/eliminar en la misma migración. Las renombradas se hacen en dos pasos (`add`, `dual-write`, luego `drop`).
> 3. La shadow DB sólo se usa cuando el provider lo permite (Postgres local con permiso de `CREATE DATABASE`). En Neon — que no permite shadow nativa — usar `migrate diff` y aplicar con `migrate deploy`.
> 4. Backup manual previo a cualquier migración con DDL destructivo.

---

## 8.6 Índices y performance

### 8.6.1 Índices compuestos (Sprint perf — commit `df9238d`)

| Tabla                | Índice                                         | Justificación                                                                                                                        |
| -------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `cartera_detallado`  | `(sucursalAsignadaId, estado, updatedAt DESC)` | Bandeja `/admin/administrativo/cartera` filtra por sucursal+estado y ordena por update — el KPI del dashboard agrega por mismo trío. |
| `incapacidades`      | `(sucursalId, estado, fechaRadicacion DESC)`   | Bandeja de incapacidades + KPIs filtran por sucursal+estado y ordenan por fecha.                                                     |
| `liquidaciones`      | `(afiliacionId, estado)`                       | Server actions consultan liquidaciones de una afiliación filtradas por estado (BORRADOR/REVISADA/PAGADA).                            |
| `soporte_afiliacion` | `(estado, fechaRadicacion DESC)`               | Bandeja `/admin/soporte/afiliaciones` para staff (sin filtro de sucursal).                                                           |
| `soporte_afiliacion` | `(asignadoAUserId, estado)`                    | Vista "mis tareas asignadas" del soportista.                                                                                         |

### 8.6.2 Cache aplicativo

- **Catálogos `/admin/base-datos`** — cache de respuestas de paginación + filtros con `unstable_cache` de Next.js. Mejora medida: **47× faster en p95** (commit del Sprint perf). Invalidación por tag al editar el catálogo.
- **BDUA/RUAF (PagoSimple)** — cache **in-memory** con TTL **30 minutos**, max 5.000 entradas (`apps/web/src/lib/pagosimple/bdua-cache.ts`). El mismo cotizante puede consultarse varias veces en una hora; con 70 aliados concurrentes esto reduce ~80% de las llamadas a PagoSimple. _No es una tabla de BD_ — vive en memoria de la lambda; si crece, migrar a Upstash Redis es cambio mínimo.

### 8.6.3 Otros índices declarados en schema

A modo de referencia rápida — además de los compuestos de arriba, hay índices simples en casi todas las FKs (`@@index([sucursalId])`, `@@index([cotizanteId])`, `@@index([estado])`, etc.) y uniques de negocio:

- `Cotizante.@@unique([sucursalId, tipoDocumento, numeroDocumento])`
- `Afiliacion.@@unique([cotizanteId, modalidad])`
- `EntidadSgss.@@unique([tipo, codigo])`
- `Subtipo.@@unique([codigo, tipoCotizanteId])`
- `MedioPago / AsesorComercial / ServicioAdicional / ServicioAdicional / CuentaCobro.@@unique([sucursalId, codigo])`
- `PeriodoContable.@@unique([anio, mes])`
- `Liquidacion.@@unique([periodoId, afiliacionId, tipo])`
- `CarteraConsolidado.@@unique([empresaNit, entidadNombre, periodoHasta])`
- `CobroAliado.@@unique([sucursalId, periodoId])`
- `MovimientoIncapacidad.hashIdentidad @unique` (anti-duplicado de extracto)
- `ColpatriaSesion.empresaId @unique` (relación 1:1)
- `NotificacionLectura.@@unique([notificacionId, userId])`

Consecutivos secuenciales (`CMP-######`, `PLN-######`, `CC-######`, `MI-######`, `CA-######`, `INC-######`, `SOP-AF-######`) usan **sequences Postgres** (migraciones `consecutivos_seq_catalogos`, `comprobante_consecutivo_seq`, `planilla_consecutivo_seq`) — atómicos y libres de carrera.

---

## 8.7 Política de retención

### 8.7.1 Documentos

| Tabla                                                 | Vida en disco | Acción al expirar                                                                                                            | Workflow              |
| ----------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `incapacidad_documentos`                              | 120 días      | Borrar archivo físico, marcar `eliminado=true` + `eliminadoEn`. El registro queda como evidencia (hash, mime, size, nombre). | `retention-daily.yml` |
| `soporte_afiliacion_documentos`                       | 120 días      | Igual que incapacidad.                                                                                                       | `retention-daily.yml` |
| `cobro_aliado_documento` / `movimiento_det_documento` | 120 días      | Igual política.                                                                                                              | `retention-daily.yml` |
| `colpatria_afiliacion_jobs.pdfPath`                   | **3 días**    | Borrar PDF, marcar `pdfArchivedAt`. Lecturas posteriores → HTTP 410 Gone.                                                    | `retention-daily.yml` |
| `colpatria_afiliacion_jobs.screenshotsPaths`          | 3 días        | Igual.                                                                                                                       | `retention-daily.yml` |

### 8.7.2 Bitácora y datos

| Tabla            | Retención                                             | Workflow                      |
| ---------------- | ----------------------------------------------------- | ----------------------------- |
| `audit_logs`     | 12 meses (`createdAt < now() - interval '12 months'`) | `auditoria-purge-monthly.yml` |
| `login_attempts` | 90 días aprox.                                        | `retention-daily.yml`         |
| `cron_runs`      | 90 días                                               | `retention-daily.yml`         |

### 8.7.3 Backup

| Recurso                | Frecuencia            | Destino                               | Workflow             |
| ---------------------- | --------------------- | ------------------------------------- | -------------------- |
| Postgres dump completo | Diario                | S3 (bucket `mi-proyecto-db-backups`)  | `db-backup.yml`      |
| Uploads (filesystem)   | Bajo demanda + diario | S3 (mismo bucket, prefijo `uploads/`) | `uploads-backup.yml` |

> Cada workflow registra su ejecución en `cron_runs` con `jobName` igual al nombre del archivo YAML (sin extensión). El status page `/admin/system/cron` (Sprint 7.3) destaca en rojo si el último `OK` de un job está fuera de su intervalo esperado.

---

## 8.8 Notas operativas finales

1. **Multi-tenant** se aplica en código (server actions filtran por `sucursalId` según `session.user`) — el schema NO usa Row-Level Security de Postgres. Cualquier nueva consulta debe respetar la regla.
2. **Decimal** se usa con precisión explícita (`@db.Decimal(p, s)`): porcentajes `(8,4)` o `(6,4)`, montos `(12,2)` o `(14,2)`, valores totalizados grandes `(15,2)` para cartera.
3. **`onDelete`** es deliberadamente conservador: la mayoría de FKs cliente usan `Restrict` o `SetNull` para que un borrado nunca destruya cadenas largas; sólo los pivotes de m2m y los hijos directos (`...Documento`, `...Gestion`, `...Concepto`) usan `Cascade`.
4. **JSON** se usa para snapshots (`AuditLog.cambios`, `SoporteAfiliacion.snapshotAntes/Despues`, `ColpatriaAfiliacionJob.payload`, `Notificacion.metadatos`). Estructura libre por intención: facilita evolución sin migración.
5. **Encriptación a nivel campo**: passwords del bot Colpatria y cookies de sesión van cifradas AES-256-GCM con `COLPATRIA_ENC_KEY` (no se devuelven nunca a la UI; sólo se reporta "configurado / no configurado").
6. **Consecutivos** se generan via sequences Postgres (`@default(dbgenerated(...))` armados en migraciones específicas), garantizando unicidad bajo concurrencia.

---

> Fuente: `packages/db/prisma/schema.prisma` (2.608 líneas) + las 63 migraciones bajo `packages/db/prisma/migrations/`. Última migración aplicada: `20260428212016_juridico_doc_tipos_extension`.
