# Performance, riesgos y roadmap

> Documento técnico enterprise — secciones 13, 14 y 15 del manual de arquitectura de `mi-proyecto` (monorepo PILA / SGSS).
> Audiencia: CTO, líder técnico, arquitecto de plataforma. El propósito es dar contexto suficiente para tomar decisiones de inversión en infraestructura, refactor y producto.
> Toda la información se basa en el código real del repo, los commits recientes (`git log`) y la memoria del proyecto. No hay especulación.

---

## 13. PERFORMANCE

El sistema atiende ~70 aliados que afilian de forma concurrente, un bot Playwright que opera contra el portal AXA Colpatria, integraciones con PagoSimple (BDUA / RUAF / planos PILA) y una BD Postgres en Neon (dev) con previsión de pooler en prod. Los esfuerzos de performance se han concentrado en tres frentes: cache, índices y control de concurrencia.

### 13.1 Estrategias de cache implementadas

#### 13.1.1 Cache de catálogos `/admin/base-datos`

Implementación en `apps/web/src/lib/catalogos-cache.ts`. Usa `unstable_cache` de Next.js con TTL automático y `revalidateTag` para invalidación manual desde server actions. Las claves cacheadas son:

| Catálogo                | TTL  | Tag                        | Justificación                        |
| ----------------------- | ---- | -------------------------- | ------------------------------------ |
| Tipos de cotizante      | 12 h | `catalogo:tipos-cotizante` | Estructura SGSS estable              |
| DIVIPOLA (deptos+munis) | 24 h | `catalogo:departamentos`   | DANE, ~33 deptos / ~1.100 municipios |
| Entidades SGSS          | 12 h | `catalogo:entidades`       | EPS/AFP/ARL/CCF, ~100 filas          |
| Actividades CIIU        | 24 h | `catalogo:actividades`     | DIAN, catálogo grande y muy estable  |
| Planes SGSS             | 12 h | `catalogo:planes`          | Servicios que vende cada aliado      |
| SMLV singleton          | 24 h | `catalogo:smlv`            | Cambia una vez al año                |

Resultado documentado en commit `3f8ff5f` ("Cachear catálogos en /admin/base-datos — 47× más rápido p95"). El cache solo aplica a queries determinísticas (no dependientes de usuario o scope) y se invalida puntualmente desde `/admin/catalogos/*` cuando el operador edita.

#### 13.1.2 Cache BDUA / RUAF

Implementación en `apps/web/src/lib/pagosimple/bdua-cache.ts`, commit `ed5fd18` (TTL 30 min). Es un `Map` in-memory con eviction LRU (`MAX_ENTRIES = 5000`), envuelto por `getBduaCached`, `setBduaCached`, `invalidateBduaCached`. Caso de uso: con 70 aliados afiliando en paralelo, el mismo cotizante puede consultarse varias veces en una hora (recargas, dual-check del jefe, distintos aliados sobre la misma persona). Sin cache cada consulta pegaba a PagoSimple (~2-3 s); con cache hit la respuesta es ~1 ms.

Caveat documentado en el propio archivo: en multi-instancia (Vercel serverless) cada lambda tiene su memoria. La efectividad depende del routing sticky. Si crece la base, la migración natural es Upstash Redis (cambio mínimo: reemplazar `Map` por cliente `@upstash/redis`).

#### 13.1.3 Token cache PagoSimple

Tokens OAuth con TTL configurable vía `PAGOSIMPLE_TOKEN_TTL_MIN` (default 15 min, ver `.env.example` línea 38 y `apps/web/src/lib/pagosimple/config.ts` línea 62). Evita re-loguearse en cada llamada al gateway de PagoSimple.

#### 13.1.4 Sesión Colpatria cacheada en BD

La sesión del bot contra el portal AXA se persiste cifrada (AES-256-GCM con `COLPATRIA_ENC_KEY`) en BD por hasta 8 h. Reduce el costo de re-loguearse cada job a un costo amortizado por turno operativo. Workflows GH Actions `bot-colpatria-login-auto.yml` y `bot-colpatria-logout-auto.yml` coordinan apertura y cierre (Lun-Sáb 7 AM / 9 PM, commit `3e94f85`).

### 13.2 Índices de base de datos

Commit `df9238d` ("Índices compuestos en 4 tablas de alto volumen") y trabajo previo. El schema (`packages/db/prisma/schema.prisma`) define ~70 índices simples y 4 compuestos clave para queries paginadas con filtros frecuentes:

| Índice compuesto                                             | Tabla                       | Uso                                               |
| ------------------------------------------------------------ | --------------------------- | ------------------------------------------------- |
| `[afiliacionId, estado]` (línea 1105)                        | `LiquidacionDetalle`        | Listado de detalles por afiliación filtrado       |
| `[cotizanteId, periodoId]` (línea 1275)                      | `Comprobante` (upsert path) | Búsqueda de comprobante único por persona+periodo |
| `[sucursalAsignadaId, estado, updatedAt(desc)]` (línea 1561) | `CarteraConsolidada`        | Bandeja "abiertas más recientes" por sucursal     |
| `[sucursalId, estado, fechaRadicacion(desc)]` (línea 1733)   | `Incapacidad`               | Bandeja por sucursal ordenada                     |
| `[estado, fechaRadicacion(desc)]` (línea 1918)               | `SoporteAfiliacion`         | Bandeja de soporte por estado                     |
| `[asignadoAUserId, estado]` (línea 1921)                     | `SoporteAfiliacion`         | "Mis casos" del agente                            |

Otros índices por jobs Colpatria (`[status, createdAt]`, `[empresaId, status]`), bitácora (`[entidad, entidadId]`, `[userId, createdAt]`), notificaciones (`[destinoUserId, createdAt]`, `[destinoRole, createdAt]`) y CronRun (`[jobName, startedAt]`).

### 13.3 Server Components y streaming en Next 15

- App Router: la mayoría de pages son **server components** que reducen el bundle JS al cliente. Solo cuando hay interactividad (forms, dialogs, filtros con state) se marca `"use client"`.
- `dynamic = 'force-dynamic'` se usa puntualmente en rutas con datos frescos críticos (notificaciones, dashboard, comprobantes en línea, health). Verificado en 10+ archivos vía grep.
- **Suspense**: presente en `apps/web/src/app/layout.tsx` y rutas con interceptación (`@modal/(.)[id]/page.tsx` para juridico, incapacidades, roles). El uso aún es básico — no hay streaming agresivo de listas grandes.
- **`revalidatePath()` y `revalidateTag()`** desde server actions tras operaciones de escritura — patrón consistente en todo `/admin`.

### 13.4 Manejo de concurrencia

#### 13.4.1 Transacciones Prisma

Operaciones que tocan varias tablas (afiliación + comprobante + ítems de liquidación, registro de cobro consolidado, transición de soporte) se envuelven en `prisma.$transaction([...])` para garantizar atomicidad. Si falla un paso, no queda nada huérfano.

#### 13.4.2 Cola `ColpatriaAfiliacionJob`

Modelo en `schema.prisma` líneas 2545–2607. Estados: `PENDING`, `RUNNING`, `SUCCESS`, `FAILED`, `RETRYABLE`. Diseño:

- Un trigger crea un job al confirmar la afiliación (commit `82814b8`).
- Un único worker Playwright (`apps/bot-colpatria`) toma jobs `PENDING` con `SELECT FOR UPDATE SKIP LOCKED` evitando races.
- `intento` distingue reintentos sobre la misma afiliación.
- `payload` es snapshot inmutable: si la afiliación cambia después, el job sigue con lo que tenía.
- `screenshotsPaths` guarda capturas por paso (login, llenado, submit, resultado) para auditar fallos.

#### 13.4.3 Watchdog del bot

Implementado en `apps/bot-colpatria/src/lib/watchdog.ts` (commit `0e84a2d`). Tres responsabilidades:

1. **Jobs zombies**: detecta `RUNNING` sin update por >15 min y los recicla (caso típico: crash del worker entre `status='RUNNING'` y el update final).
2. **Reciclaje de RETRYABLE**: devuelve a `PENDING` los jobs marcados como retry transitorio (sesión expirada, captcha inesperado, timeout).
3. **Alerta de fallos masivos silenciosos**: si todos los jobs empiezan a fallar (AXA cambió HTML, credenciales caducaron) emite `Sentry.captureMessage`.

Las 3 funciones son idempotentes y baratas (~50 ms total) y se invocan al inicio de cada `procesar` antes de tomar nuevos jobs.

#### 13.4.4 Pool de conexiones

Neon en dev opera sin pgbouncer dedicado por aliado — el límite de conexiones concurrentes es la principal restricción para las pruebas de carga. En prod la recomendación documentada (`tests/load/README.md`) es activar `pg_stat_statements` y usar pooler.

### 13.5 Tests de carga y observabilidad

Suite documentada en `tests/load/README.md`:

| Script                    | Tipo            | Configuración               |
| ------------------------- | --------------- | --------------------------- |
| `health.k6.js`            | Sanity baseline | 5 VUs / 30 s                |
| `login-stress.k6.js`      | Stress login    | Escala 100 → 500 → 1000 VUs |
| `afiliaciones-list.k6.js` | Endurance       | 50 VUs × 5 min              |
| `lighthouse.config.js`    | Web Vitals      | Perf ≥ 70, A11y ≥ 85        |

CLI auxiliar `pnpm cli analyze:db` genera reporte de tablas + queries lentas (requiere `pg_stat_statements`).

Métricas objetivo acordadas (`tests/load/README.md`):

| Métrica                  | Target   | Critical |
| ------------------------ | -------- | -------- |
| Login p95                | < 1 s    | < 3 s    |
| Listado afiliaciones p95 | < 2 s    | < 5 s    |
| Health p95               | < 200 ms | < 1 s    |
| Error rate global        | < 1 %    | < 5 %    |
| LCP frontend             | < 2.5 s  | < 4 s    |
| CLS                      | < 0.1    | < 0.25   |

### 13.6 Tabla — Optimizaciones aplicadas

| Estrategia                      | Ubicación                                   | Métrica / Resultado                         |
| ------------------------------- | ------------------------------------------- | ------------------------------------------- |
| Cache catálogos                 | `apps/web/src/lib/catalogos-cache.ts`       | 47× más rápido p95 en `/admin/base-datos`   |
| Cache BDUA/RUAF (30 min)        | `apps/web/src/lib/pagosimple/bdua-cache.ts` | hit ≈ 1 ms vs ~2-3 s consulta directa       |
| Token cache PagoSimple          | `apps/web/src/lib/pagosimple/config.ts`     | TTL 15 min, `PAGOSIMPLE_TOKEN_TTL_MIN`      |
| Sesión Colpatria cacheada       | `apps/bot-colpatria/src/lib/crypto.ts` + BD | 8 h cifrada AES-256-GCM                     |
| Índices compuestos              | `packages/db/prisma/schema.prisma`          | 4 índices clave en bandejas alto volumen    |
| Server components Next 15       | `apps/web/src/app/admin/**`                 | bundle JS reducido al cliente               |
| `revalidateTag` puntual         | server actions de catálogos                 | invalidación quirúrgica sin perder cache    |
| `SELECT FOR UPDATE SKIP LOCKED` | worker bot-colpatria                        | sin races aún con varios workers candidatos |
| Watchdog 50 ms                  | `apps/bot-colpatria/src/lib/watchdog.ts`    | recupera zombies / RETRYABLE automático     |

### 13.7 Escalabilidad

**Web**: stateless. Salvo el rate-limit de login (que vive en BD via `LoginAttempt` — `apps/web/src/lib/auth-rate-limit.ts`) y los caches in-memory (BDUA, token PagoSimple), no hay estado en proceso. Vercel / cualquier orquestador puede escalar horizontalmente.

**Bot Colpatria**: 1 instancia activa por entorno. El portal AXA no admite múltiples sesiones del mismo usuario simultáneamente (login conflictivo); por eso los workflows `login-auto` y `logout-auto` coordinan ventana operativa. Cualquier paso a multi-worker exige un lock distribuido y separación de credenciales por worker.

**BD**: Neon escala vertical (cómputo + memoria). Read replicas no están implementadas. Para reportería pesada se podría apuntar a una réplica sin cambios mayores en Prisma.

---

## 14. PUNTOS CRÍTICOS Y RIESGOS

### 14.1 Cuellos de botella conocidos

#### 14.1.1 Bot Colpatria — dependencia de portal externo

El bot depende del portal web de AXA Colpatria. Cualquier cambio del proveedor (nuevo selector, layout distinto, cambio de flujo de captcha) requiere fix manual en `apps/bot-colpatria/src/`. Mitigaciones actuales: selectores resilientes (preferencia por `data-*` y texto visible cuando existe), screenshots por paso para diagnóstico rápido, watchdog que detecta fallos masivos y avisa por Sentry.

#### 14.1.2 PagoSimple — caducidad de token

Token con TTL de 15 min. Si la API falla persistentemente, sync de planos y consulta BDUA/RUAF se bloquean. Sin re-login automático más allá del refresh natural por TTL. La caída del proveedor es punto único de falla.

#### 14.1.3 Neon dev — conexiones concurrentes

Sin pooler dedicado en dev. Las pruebas k6 con muchos VUs saturan rápido la cuota de conexiones. En prod la recomendación documentada es pgbouncer.

#### 14.1.4 Generación de PDF (`@react-pdf/renderer`)

Se identifica como cuello potencial en `tests/load/README.md` (script futuro `pdf-generation.k6.js`). Generar comprobantes en lote es CPU-bound y bloquea el event loop de Node.

### 14.2 Deuda técnica

| Item                                       | Origen / archivo                                           | Estado                                 |
| ------------------------------------------ | ---------------------------------------------------------- | -------------------------------------- |
| CSP en Report-Only                         | `apps/web/src/middleware.ts`, commit `847286a`             | Pasar a Enforce tras validar Sentry    |
| Sprint 4.4 (email) y 4.5 (SMS)             | Roadmap memoria 2026-04                                    | Esperando credenciales Resend/Twilio   |
| Catálogo EPS/AFP completo con `codigoAxa`  | `EntidadSgss.codigoAxa`                                    | Solo 2 mapeados — falta importar Excel |
| Rate limit por email, no por IP            | Login flow                                                 | Agregar bucket por IP (sliding window) |
| Catálogo EPS/AFP completo                  | Solo ~2 entidades mapeadas a códigos AXA                   | Faltan ~50+                            |
| Tests E2E con Playwright contra la web app | No existen — solo Playwright para el bot                   | Cobertura 0 en flujo aliado            |
| CI sin tests automáticos en push           | `.github/workflows/ci.yml` paso `pnpm test` ya configurado | Hay paso, faltan tests reales          |

### 14.3 Vulnerabilidades potenciales

| Vector                                     | Detalle                                                                                                                                                                          | Mitigación actual / propuesta                                 |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Rate limit de login en BD (`LoginAttempt`) | Funciona por email + ventana 10 min, pero la ventana ya está en BD — no en memoria, así que multi-instancia funciona. El riesgo real es enumeración de emails.                   | Considerar hCaptcha tras N intentos                           |
| `AUTH_SECRET` en `.env` plano              | No hay secret manager. Rotación manual.                                                                                                                                          | Migrar a Vault / AWS Secrets Manager / Doppler                |
| `COLPATRIA_ENC_KEY`                        | Rotación = pérdida de acceso a credenciales cifradas. No hay procedimiento de re-cifrado documentado.                                                                            | Procedimiento de rotación con re-cifrado batch                |
| Logs con PII                               | Pino con `redact` configurado (`apps/web/src/lib/logger.ts`, `apps/bot-colpatria/src/lib/logger.ts`). Verificar que ningún `log.info({ cotizante })` evade los paths redactados. | Auditar manualmente uses de logger; añadir test de redaction  |
| Webhooks PagoSimple                        | Verificar firma HMAC en endpoints receptores                                                                                                                                     | Pendiente verificación; si no existe, agregar                 |
| Subida de archivos (`UPLOADS_DIR`)         | Validación de mimetype y tamaño. Persistencia ya validada al inicio del bot (commit `784e880`).                                                                                  | Auditar antivirus / sandboxing en uploads de soporte/jurídico |

### 14.4 Riesgos operativos

| Riesgo                                              | Detalle                                                                     | Probabilidad / Impacto      |
| --------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------- |
| Worktree huérfana en disco (`zen-sanderson-b95c45`) | Memoria 2026-04: folder existe pero no es git worktree. Limpieza pendiente. | Baja / Bajo                 |
| Pre-commit falla por `node_modules` mal             | Bloquea commits hasta `pnpm install` correcto                               | Media / Bajo                |
| Migraciones no testeadas en staging idéntico a prod | Neon dev = compartido. Riesgo de DDL que rompe en prod                      | Media / Alto                |
| Pérdida de datos por mal uso de shadow URL Prisma   | Memoria `feedback_no_db_reset` — ya pasó el 2026-04-20                      | Baja (regla viva) / Crítico |
| Cambio inesperado en portal AXA                     | Bot deja de funcionar; backlog de jobs crece                                | Media / Alto                |
| Caída prolongada de Neon                            | Sistema completamente offline                                               | Baja / Crítico              |
| Caída de PagoSimple                                 | Se bloquean planos y BDUA/RUAF                                              | Media / Medio               |

### 14.5 Tabla — Riesgos por categoría

| Categoría | Riesgo                                        | Probabilidad | Impacto |
| --------- | --------------------------------------------- | ------------ | ------- |
| Técnico   | Cambio layout AXA bloquea bot                 | Media        | Alto    |
| Técnico   | Token PagoSimple no refresca                  | Baja         | Medio   |
| Técnico   | Pool de conexiones Neon saturado              | Media        | Medio   |
| Operativo | Migración Prisma no probada                   | Media        | Alto    |
| Operativo | Pérdida de credenciales por COLPATRIA_ENC_KEY | Baja         | Alto    |
| Operativo | Worktree huérfana en disco                    | Baja         | Bajo    |
| Seguridad | Logs con PII no redactados                    | Media        | Alto    |
| Seguridad | Webhook sin verificación de firma             | Media        | Alto    |
| Seguridad | Secret manager ausente                        | Alta         | Medio   |
| Seguridad | CSP en Report-Only                            | Alta         | Medio   |
| Seguridad | Tests E2E inexistentes en web                 | Alta         | Medio   |

---

## 15. ROADMAP SUGERIDO

> Horizontes 30 / 90 / 180 días pensados para acompañar el crecimiento de aliados (~70 → 300+) y la madurez del producto. Las fechas son indicativas y deben ajustarse al sprint planning del equipo.

### 15.1 Próximos 30 días — mejoras técnicas inmediatas

1. **Habilitar tests automáticos en CI**. La estructura ya existe en `.github/workflows/ci.yml` (paso `pnpm test`), pero falta poblar la suite. Mínimos: unit de `lib/` críticos (catalogos-cache, bdua-cache, crypto, auth-rate-limit, watchdog).
2. **Pasar CSP de Report-Only a Enforce**. Commit `847286a` ya introdujo nonces. Falta el switch en `middleware.ts` y la validación de un par de semanas con monitoreo Sentry.
3. **Migrar rate-limit de login a Redis (Upstash)** si se introduce multi-instancia. Hoy vive en BD vía `LoginAttempt` — funciona pero genera writes innecesarios en cada intento.
4. **Sprint 4.4 + 4.5**: notificaciones email (Resend) y SMS (Twilio). Solo falta credenciales y wiring del adapter.
5. **Catálogo EPS/AFP completo via Excel import**. Solo 2 entidades mapeadas a códigos AXA; el resto rompe el bot. Importer ya existe en `apps/web/src/app/admin/catalogos/_components/import-form.tsx`.
6. **Limpieza de la worktree huérfana** `zen-sanderson-b95c45` y verificación de que no hay otras.

### 15.2 Próximos 90 días — escalabilidad

1. **Read replicas en Neon** para reportería ejecutiva (`/admin/dashboard-ejecutivo`). Prisma admite `replicas` con `@prisma/extension-read-replicas`.
2. **Cache distribuido (Upstash Redis)** para BDUA/RUAF y catálogos compartidos. La interfaz ya está aislada — cambio mecánico.
3. **CDN para uploads pesados** (PDFs de comprobantes, screenshots del bot). Hoy se sirven desde la app; mover a S3 + CloudFront / Vercel Blob.
4. **Bot Colpatria multi-worker con lock distribuido** (Redis o `pg_advisory_lock`). Permitiría paralelizar jobs de empresas distintas sin pisarse.
5. **Activar `pg_stat_statements` en prod + dashboard** de queries lentas (`pnpm cli analyze:db`).
6. **Tests E2E con Playwright contra la web app** — cubrir el flujo crítico aliado: login → afiliar → confirmar → ver comprobante.

### 15.3 Próximos 180 días — funcional + producto

1. **Sprint 8.6 — Carné / Certificado AXA**: descarga del documento físico al final del flujo del bot.
2. **Sprint 8 REACTIVAR**: el bot solo soporta CREAR. Reactivación es flujo distinto en el portal AXA.
3. **Módulo de reportes ejecutivos**: extender `dashboard-ejecutivo` con drill-down por aliado/sucursal/periodo, exportable a Excel.
4. **App móvil (React Native)** consumiendo APIs server actions vía endpoint REST/tRPC compartido. Para aliados que afilian en campo.
5. **Multi-país (CO + LatAm)**: parametrizar catálogos por país, separar reglas DIVIPOLA, revisar regímenes contributivos por jurisdicción.

### 15.4 Refactor sugeridos

| Refactor                                                              | Beneficio                                                 |
| --------------------------------------------------------------------- | --------------------------------------------------------- |
| Limpiar `@deprecated` del schema (DROP COLUMN tipoSalario, modalidad) | Reduce confusión y cierra deuda                           |
| Eliminar `ALIADO_USER` del enum (ya hay `RolCustom`)                  | Modelo de permisos más limpio                             |
| Modularizar `apps/web/src/app/admin/` (~60+ rutas en árbol plano)     | Onboarding más rápido, separación por dominio             |
| Extraer integraciones (PagoSimple, Colpatria) a SDK reutilizable      | Reuso, tests más fáciles, separación de responsabilidades |
| Pasar de Server Actions a tRPC si crece la API pública                | Tipado end-to-end, easier multi-cliente                   |
| Centralizar logger + error handler con OpenTelemetry                  | Observabilidad uniforme web + bot + crons                 |

### 15.5 Infraestructura

1. **Dockerización + Kubernetes** (o Fly.io / Railway) para flexibilidad multi-cloud.
2. **Deploy automatizado** a DigitalOcean o AWS si se sale de Vercel; promover staging-prod parity.
3. **Observabilidad full**:
   - Datadog o Grafana Cloud para métricas + dashboards.
   - Sentry tracing al 100 % (hoy: captura de errores activa, commit `fd04300`).
   - Logs centralizados (Loki / CloudWatch).
4. **Secret management** con Vault, AWS Secrets Manager o Doppler. Eliminar `.env` planos en prod.
5. **Backups verificados**: el workflow `db-backup.yml` existe; agregar restore drill mensual.
6. **Disaster recovery runbook**: caída Neon, caída AXA, caída PagoSimple — qué pasa, quién decide, en cuánto tiempo se recupera.

### 15.6 Tabla — Roadmap por horizonte

| Horizonte | Item                                           | Categoría       |
| --------- | ---------------------------------------------- | --------------- |
| 30 días   | Tests automáticos en CI                        | Técnico         |
| 30 días   | CSP Enforce                                    | Seguridad       |
| 30 días   | Rate-limit a Redis                             | Escalabilidad   |
| 30 días   | Sprint 4.4 + 4.5 (email / SMS)                 | Funcional       |
| 30 días   | Catálogo EPS/AFP completo                      | Funcional       |
| 30 días   | Limpieza worktrees huérfanas                   | Operativo       |
| 90 días   | Read replicas Neon                             | Escalabilidad   |
| 90 días   | Redis distribuido para caches                  | Escalabilidad   |
| 90 días   | CDN para uploads                               | Escalabilidad   |
| 90 días   | Bot multi-worker con lock distribuido          | Escalabilidad   |
| 90 días   | `pg_stat_statements` + dashboard               | Observabilidad  |
| 90 días   | E2E Playwright en web app                      | Calidad         |
| 180 días  | Sprint 8.6 carné AXA                           | Funcional       |
| 180 días  | Sprint 8 REACTIVAR                             | Funcional       |
| 180 días  | Reportes ejecutivos                            | Funcional       |
| 180 días  | Mobile app                                     | Producto        |
| 180 días  | Multi-país                                     | Producto        |
| 180 días  | Dockerización + K8s                            | Infraestructura |
| 180 días  | Observabilidad full (Datadog + Sentry tracing) | Infraestructura |
| 180 días  | Secret manager (Vault / AWS SM / Doppler)      | Seguridad       |

---

### Cierre

El sistema está en un punto sano: hay caches medidas con números reales (47×, ~2-3 s → ~1 ms), una capa de concurrencia robusta (jobs + watchdog + transacciones), y la deuda técnica está documentada con `@deprecated` en el lugar correcto para no perderla de vista. El roadmap propuesto privilegia tres ejes: cerrar deuda visible (CSP, deprecated columns, ALIADO_USER), preparar la base para escalar horizontalmente (Redis, replicas, multi-worker bot, CDN) y madurar el ciclo de calidad (tests E2E, CI con tests reales, observabilidad). Las decisiones más urgentes desde la silla del CTO son: (1) presupuesto de Redis y secret manager, (2) política de rotación para `COLPATRIA_ENC_KEY`, y (3) compromiso de un sprint dedicado a tests E2E antes de abrir más aliados.
