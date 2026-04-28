# 12. Testing

Sección de la documentación técnica enterprise. Describe cómo se prueba el sistema PILA: qué framework se usa, qué tipos de tests están presentes, cuál es el inventario completo, cómo correrlos y los gaps reales que aún no están cubiertos.

> Fecha de auditoría del inventario: **2026-04-28**.
> Total de archivos `*.test.ts` en el monorepo (excluyendo `node_modules`): **21**.

---

## 12.1 Stack de testing

El monorepo usa una sola herramienta para todos los tests automatizados de TypeScript:

| Pieza             | Versión  | Dónde está                                             |
| ----------------- | -------- | ------------------------------------------------------ |
| **Vitest**        | `^4.1.5` | `apps/web` (devDep) y `apps/bot-colpatria` (devDep)    |
| **@vitest/ui**    | `^4.1.5` | `apps/web` (UI opcional para `pnpm test:ui`)           |
| **k6**            | externo  | `tests/load/*.k6.js`                                   |
| **Lighthouse CI** | externo  | `tests/load/lighthouse.config.js` (config para `lhci`) |

Las apps `@pila/cli` y los paquetes `@pila/core`, `@pila/db` **no tienen test runner instalado** — su validación pasa por `tsc --noEmit` (typecheck) y por los tests de las apps que los consumen. El runner del workspace (`pnpm -r --if-present test`) los ignora silenciosamente porque no tienen script `test`.

### Filosofía: funciones puras, no mocks de DB

Una decisión deliberada del proyecto es **no mockear Prisma** en los tests. En su lugar, la lógica crítica se extrae a funciones puras (`packages/core` o módulos `lib/` dentro de cada app) que reciben datos como argumento y devuelven datos. El I/O contra la BD queda en archivos separados (`*.repo.ts`, `*.actions.ts`) que no se testean unitariamente.

Esto se nota en patrones como el de `apps/web/src/lib/alertas/inactividad-helpers.test.ts`, donde el helper interno `diasEntre` se **re-implementa local al test** porque la función de orquestación que lo usa (`cargarAlertasInactividad`) toca Prisma:

```ts
// Tomado tal cual del archivo
function diasEntre(a: Date, b: Date): number {
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / MS_DIA));
}
```

El comentario del propio archivo explica la decisión: _"La función exportada `cargarAlertasInactividad` es difícil de testear sin un mock de Prisma. Aquí blindamos la matemática del cálculo de días — que es lo que realmente afecta al usuario (umbrales)."_

Es una postura conservadora pero coherente con un incidente histórico documentado en la memoria del usuario (regla "no tocar la BD destructivamente"): se prefiere no testear con BD real ni con mocks de Prisma de baja fidelidad, y blindar en cambio la lógica pura que el negocio realmente depende de que sea correcta.

---

## 12.2 Tipos de tests presentes

### 1) Unitarios (la mayoría)

Funciones puras: validaciones, helpers, mappers, parsers de texto. No requieren red, ni filesystem real, ni BD. Corren en milisegundos. Cubren los siguientes dominios:

- Mapeo PILA → AXA (tipos de documento, género, fechas, salario, truncados de longitud).
- Diff y payload de auditoría (`calcularDiff`, `prepararPayload`).
- Cálculo de DV de NIT (algoritmo DIAN).
- Title-case de nombres y normalización de texto (acentos, mayúsculas).
- Padding de campos para el archivo plano PILA (`padNum`, `padAlpha`, `padMoney`, `padDate`).
- Construcción de la línea cotizante (registro tipo 02, 693 bytes exactos).
- Políticas de planos (E, I, K) y banderas de subsistemas (EPS/AFP/ARL/CCF).
- Detección de origen de PDF de cartera (Salud Total, SOS, Sanitas, SURA, Protección).
- Parser de extractos bancarios (formatos ISO/latino, símbolo `$`, miles).
- Parser de plantilla de importación masiva de cotizantes (Excel/CSV).
- Detector de disparos del bot Colpatria.
- Detector de disparos de Soporte · Afiliaciones (ALTA/REACTIVACIÓN/CAMBIO).
- Cálculo de fecha límite de cobros aliados.
- Resolución de configuración Colpatria por nivel de riesgo y centro de trabajo.
- Cripto AES-GCM de credenciales Colpatria (round-trip + tampering).
- Sugerencia automática de sucursal por mayoría histórica.
- Días de incapacidad / cartera y clasificación de urgencia.

### 2) Integración (pocos, contra portal real)

El bot Colpatria tiene dos comandos CLI que se comportan como tests de integración:

- `pnpm bot-colpatria -- test-login` (`apps/bot-colpatria/src/commands/test-login.ts`) — abre Playwright contra `https://servicios.colpatria.com`, valida credenciales reales (descifradas en runtime), guarda cookies y reporta si el login funcionó.
- `pnpm bot-colpatria -- test-ingreso` (`apps/bot-colpatria/src/commands/test-ingreso.ts`) — flujo completo de ingreso de un cotizante de prueba contra el portal AXA.

No están en `vitest`. Son scripts CLI con código de salida 0/≠0, pensados para correrse manualmente o desde un workflow de GitHub Actions de smoke-test antes de habilitar despliegues que toquen el bot. Tienen el costo de requerir credenciales reales y consumen cupo del portal — por eso no se corren en CI normal.

### 3) E2E desde CLI (PagoSimple)

`apps/cli/src/commands/pagosimple-test-all.ts` — batería completa de pruebas contra la **API real de PagoSimple** (no es Playwright sobre la web propia). Se ejecuta con `pnpm cli -- pagosimple-test-all`. Cubre el ping, listados, validación de subtipos y sincronización de planillas. Como golpea endpoints reales, no se usa en CI; sirve para validar manualmente que la integración sigue funcionando después de cambios de schema, credenciales o despliegues.

> **Importante:** no hay tests Playwright contra la app web propia (Next.js). El nombre "E2E" aquí significa "ejercita el flujo de punta a punta contra una integración externa", no "navegador apuntando a `localhost:3000`".

### 4) Performance / Load (k6 + Lighthouse)

Suite separada en `tests/load/` con k6 (HTTP stress/endurance) y Lighthouse CI (Web Vitals del frontend). Detalle en §12.5.

---

## 12.3 Inventario completo de tests

Los 21 archivos `*.test.ts` del proyecto (todos consumidos por Vitest), con su path absoluto-relativo desde la raíz del monorepo, una descripción de qué cubren y la cantidad aproximada de tests `it()` que contienen.

| #   | Archivo                                                | Cubre                                                                                                                                                                                                                                                                                                                                                 | `it()` aprox. |
| --- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1   | `apps/bot-colpatria/src/lib/payload-form.test.ts`      | Mapeo PILA→AXA: tipos doc (CC/NIT/TI/CE/PAS), género, fechas (regla "today+1"), validación de payload, truncados de nombres/cargo, salario, EPS/AFP códigos AXA, jornada. Usa `vi.useFakeTimers()` para fijar "hoy".                                                                                                                                  | 35            |
| 2   | `apps/web/src/lib/auditoria/payload.test.ts`           | `prepararPayload()` para acciones CREAR / EDITAR / ELIMINAR: filtro automático de `passwordHash`, `token`, `apiKey`, `apiSecret`, `pagosimplePin`; respeto de `camposPermitidos`; descripciones por defecto.                                                                                                                                          | 17            |
| 3   | `apps/web/src/lib/auditoria/diff.test.ts`              | `calcularDiff()` lógica pura: triviales, CREATE, DELETE, UPDATE, equivalencia null/undefined, Date, Decimal-like, arrays/objetos anidados, exclusión por `camposPermitidos`.                                                                                                                                                                          | 27            |
| 4   | `apps/web/src/lib/cartera/detector.test.ts`            | `detectarOrigen` (5 EPS/AFP por header/NIT/URL), `normalizarPeriodo`, `parsearMonto` (formatos US/latino), `normalizarTipoDoc`.                                                                                                                                                                                                                       | 31            |
| 5   | `apps/web/src/lib/cartera/labels.test.ts`              | `diasEntre`, `clasificarUrgencia` (umbrales fresca / media / alta / critica).                                                                                                                                                                                                                                                                         | 10            |
| 6   | `apps/web/src/lib/cartera/sugerir-sucursal.test.ts`    | `mejorSucursalSugerida` (ranking por mayoría + tiebreaker por fecha más reciente), `clasificarConfianza` (BAJA/MEDIA/ALTA por % de ocurrencias).                                                                                                                                                                                                      | 15            |
| 7   | `apps/web/src/lib/colpatria/config-resolver.test.ts`   | `resolverConfigParaAfiliacion` por nivel de riesgo (I-V), fallback al default empresa, exposición de constantes hardcoded (`tipoSalario='1'`, `modalidadTrabajo='01'`, `tareaAltoRiesgo='0000001'`).                                                                                                                                                  | 16            |
| 8   | `apps/web/src/lib/colpatria/crypto.test.ts`            | AES-GCM round-trip de credenciales/cookies, IV aleatorio (cada cifrado distinto), formato `iv:authTag:cipher`, detección de tampering (auth tag corrupto), `esDescifrable` defensivo.                                                                                                                                                                 | 13            |
| 9   | `apps/web/src/lib/colpatria/disparos.test.ts`          | `debeDisparar` — guards de modalidad (DEPENDIENTE), estado (ACTIVA), empresa con `colpatriaActivo=true`, ARL Colpatria por código o nombre. Re-implementa la regla local para no mockear Prisma.                                                                                                                                                      | 10            |
| 10  | `apps/web/src/lib/cotizantes/csv-import.test.ts`       | `parsePlantillaCotizantes` (Excel/CSV en memoria con `xlsx`): happy path, errores por fila (sin nombre, fecha mal, tipo doc no aceptado, email malformado), duplicados intra-archivo, mapeo flexible de columnas (con acentos), detección de columnas faltantes/extra; `generarPlantillaCsv` y re-parseo del CSV generado.                            | 15            |
| 11  | `apps/web/src/lib/dashboard/kpis-helpers.test.ts`      | `delta` porcentual (incluye edge `anterior=0`), `rangoMes` (febrero bisiesto, mes con 30/31), `periodoAnterior` (rollover de año). Helpers re-implementados al test.                                                                                                                                                                                  | 14            |
| 12  | `apps/web/src/lib/finanzas/cobro-generar.test.ts`      | `excluirPorRetiroCorto` (regla "≤5 días no cobra"), `calcularFechaLimite` (día 15 del mes siguiente, rollover de año).                                                                                                                                                                                                                                | 11            |
| 13  | `apps/web/src/lib/finanzas/parser-extracto.test.ts`    | `parseExtractoBancarioFromTexto` (extracción heurística de movimientos desde PDF), formatos de fecha ISO/latino, valor con `$` y miles, descarte de ruido (<$1.000), hash de identidad estable, robustez ante texto vacío.                                                                                                                            | 14            |
| 14  | `apps/web/src/lib/incapacidades/dias.test.ts`          | `estaCerrada` (PAGADA/RECHAZADA terminales, APROBADA NO), `diasIncapacidad` para casos activos (urgencia por umbral) y cerrados (días entre radicación y cierre).                                                                                                                                                                                     | 11            |
| 15  | `apps/web/src/lib/nit.test.ts`                         | `calcularDV` algoritmo DIAN: NITs reales con DV conocido, ignora separadores (puntos/guiones/espacios), longitud 5-15, cédula como NIT.                                                                                                                                                                                                               | 5             |
| 16  | `apps/web/src/lib/text.test.ts`                        | `titleCase` (mayúscula a Title con conectores en minúscula), `sentenceCase`, `titleCaseFields` (aplica solo a las llaves indicadas, preserva null/undefined).                                                                                                                                                                                         | 11            |
| 17  | `apps/web/src/lib/planos/format.test.ts`               | Helpers de ancho fijo PILA: `padNum`, `padAlpha`, `padMoney` (truncar, no redondear), `padDate`, `padPeriodo`, `padTarifa` (porcentaje a fracción), `blank`, `shiftMes` (rollover año), `assertLength`, `normalizeText` (sin acentos, mayúsculas, conserva guiones/puntos/apóstrofes).                                                                | 36            |
| 18  | `apps/web/src/lib/planos/generar.test.ts`              | `construirCotizante` — contrato de longitud (676 + 17 padding operador = 693 bytes), posiciones de campos críticos, IBC con prorrateo redondeo hacia arriba, banderas ING/RET, plano K (Decreto 2616), plano E + RESOLUCIÓN, omisión pensión por subtipo, IBC CCF simbólico de $1, campo 25 IGE, actividad económica CIIU, salario integral campo 41. | 32            |
| 19  | `apps/web/src/lib/planos/politicas.test.ts`            | `aplicaOmisionPension` (subtipos canónicos 02/03/04/05/12), `banderasSubsistemas` (E/I/K × ORDINARIO/RESOLUCION), `identificacionForzada`, `planillasParaAfiliacion` (qué planos genera cada combinación).                                                                                                                                            | 20            |
| 20  | `apps/web/src/lib/soporte-af/disparos.test.ts`         | `detectarDisparos` — la regla "solo dispara si estado final es ACTIVA": NUEVA (CREATE), REACTIVACION, CAMBIO_FECHA_INGRESO, CAMBIO_EMPRESA, CAMBIO_NIVEL_ARL, CAMBIO_PLAN_SGSS; orden de disparos múltiples; null safety.                                                                                                                             | 14            |
| 21  | `apps/web/src/lib/alertas/inactividad-helpers.test.ts` | `diasEntre` (mismos instante, 24h, año bisiesto, orden invertido), umbrales 30 y 60 días. Helpers re-implementados al test.                                                                                                                                                                                                                           | 11            |

> El conteo de `it()` excluye los `describe()` y los bloques `beforeAll/afterAll`.

---

## 12.4 Cobertura

- **Total aproximado de tests `it()` ejecutables**: ~368 (333 en `@pila/web` + 35 en `@pila/bot-colpatria`).
- **Cobertura instrumentada (`%` líneas/branches)**: **no medida formalmente**. No hay configuración de `@vitest/coverage-v8` ni `c8` en ninguna app, ni en CI ni local. Si se quisiera medir, bastaría con agregar el plugin a `apps/web` y a `apps/bot-colpatria` y correr `vitest run --coverage`.
- **Cobertura cualitativa**: alta sobre la lógica pura de cálculo crítica (planos, mapeo PILA→AXA, diffs de auditoría, cripto). Baja sobre Server Actions, repos y orquestadores que tocan Prisma — se cubren indirectamente vía tipos (`tsc`) y los tests CLI de integración (test-login, test-ingreso, pagosimple-test-all).

---

## 12.5 Cómo correr los tests

### Desde el workspace (todo a la vez)

```bash
pnpm test
```

Esto es `pnpm -r --if-present test` (definido en el `package.json` raíz, scripts.test). Recorre todos los paquetes; los que no tienen script `test` (cli, core, db) se ignoran sin warning. Dura ~2-4 segundos en local.

### Por app individual

```bash
# Solo la suite del web (332+ tests)
pnpm --filter @pila/web test

# Solo la suite del bot Colpatria (35 tests)
pnpm --filter @pila/bot-colpatria test
```

### Modo watch (durante desarrollo)

```bash
pnpm --filter @pila/web test:watch
pnpm --filter @pila/bot-colpatria test -- --watch
```

### UI interactiva (solo web, requiere `@vitest/ui`)

```bash
pnpm --filter @pila/web test:ui
```

Abre un panel HTML en `http://localhost:51204` con tree de archivos, filtros y resultados.

### Tests CLI / integración (manuales)

```bash
# Bot Colpatria contra portal real
pnpm bot-colpatria -- test-login
pnpm bot-colpatria -- test-ingreso

# PagoSimple end-to-end
pnpm cli -- pagosimple-test-all
pnpm cli -- pagosimple-ping
pnpm cli -- pagosimple-validar-subtipos
```

Ninguno de estos forma parte de `pnpm test`. Requieren `.env` con credenciales reales y consumen cupo en los portales externos.

---

## 12.6 Ejemplos representativos

### Vitest puro: mapeo PILA→AXA con clock fijado

De `apps/bot-colpatria/src/lib/payload-form.test.ts`. Muestra el patrón de `beforeAll` con `vi.useFakeTimers()` que fija el "hoy" para que la regla `today+1` sea determinista:

```ts
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-04-27T12:00:00Z'));
});
afterAll(() => {
  vi.useRealTimers();
});

describe('mapearTipoDocumento', () => {
  it.each([
    ['CC', '1'],
    ['NIT', '2'],
    ['TI', '3'],
    ['CE', '4'],
    ['PAS', '5'],
  ])('mapea %s → %s', (pila, axa) => {
    expect(mapearTipoDocumento(pila)).toBe(axa);
  });

  it('tira para RC (sin equivalente AXA)', () => {
    expect(() => mapearTipoDocumento('RC')).toThrow(/no tiene equivalente/);
  });
});
```

Y la regla de fecha de ingreso AXA (más rica de lo que parece):

```ts
it('calcularFechaIngresoAxa: regla today+1 vs PILA', () => {
  const hoy = new Date('2026-04-27T12:00:00Z');
  // Sin PILA → siempre mañana
  expect(calcularFechaIngresoAxa(hoy)).toBe('28/04/2026');
  // PILA pasado → mañana
  expect(calcularFechaIngresoAxa(hoy, '2026-01-15')).toBe('28/04/2026');
  // PILA hoy → mañana
  expect(calcularFechaIngresoAxa(hoy, '2026-04-27')).toBe('28/04/2026');
  // PILA mañana → PILA
  expect(calcularFechaIngresoAxa(hoy, '2026-04-28')).toBe('28/04/2026');
  // PILA futuro → PILA
  expect(calcularFechaIngresoAxa(hoy, '2026-05-02')).toBe('02/05/2026');
});
```

### Vitest puro: diff de auditoría

De `apps/web/src/lib/auditoria/payload.test.ts`. Muestra cómo se valida que el filtro de campos sensibles funcione automáticamente:

```ts
it('descarta otros sensibles: token, apiKey, apiSecret, pagosimplePin', () => {
  const p = prepararPayload('CREAR', {
    entidad: 'Config',
    entidadId: 'c1',
    despues: {
      nombre: 'X',
      token: 't',
      apiKey: 'k',
      apiSecret: 's',
      pagosimplePin: '1234',
    },
  });
  expect(p!.cambios?.despues).toEqual({ nombre: 'X' });
});
```

Y el caso "EDITAR sin cambios reales no genera registro":

```ts
it('NO registra si no hay cambios', () => {
  const p = prepararPayload('EDITAR', {
    entidad: 'Cotizante',
    entidadId: 'c1',
    antes: { salario: 1000 },
    despues: { salario: 1000 },
  });
  expect(p).toBeNull();
});
```

Estilo consistente en todo el monorepo: `describe()` agrupa por función, `it()` describe un caso en español, las aserciones usan `expect(...).toBe / toEqual / toThrow / toContain`.

---

## 12.7 Tests de carga (k6) y Web Vitals (Lighthouse)

Suite separada en `tests/load/`. No corre en `pnpm test`; requiere k6 instalado externamente y se ejecuta manualmente o desde un workflow ad-hoc. Documentación completa en `tests/load/README.md`.

| Archivo                              | Tamaño     | Tipo       | Qué mide                                                                                                                                                                |
| ------------------------------------ | ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/load/health.k6.js`            | 62 líneas  | Smoke      | 5 VUs × 30s contra `/api/health`. Latencia base, sanity post-deploy.                                                                                                    |
| `tests/load/login-stress.k6.js`      | 95 líneas  | Stress     | Escala 100 → 500 → 1000 VUs en login (NextAuth + bcrypt cost 12). Detecta el punto donde se satura CPU.                                                                 |
| `tests/load/afiliaciones-list.k6.js` | 76 líneas  | Endurance  | 50 VUs × 5 min contra páginas con queries pesadas (`/admin/base-datos`, `/soporte/finanzas/cobro-aliados`). Detecta memory leaks, pool de BD agotado, query plan flips. |
| `tests/load/lighthouse.config.js`    | 73 líneas  | Web Vitals | Config de Lighthouse CI: gates Performance ≥ 70, Accessibility ≥ 85, LCP < 3.5s, TBT < 500ms, CLS < 0.1.                                                                |
| `tests/load/README.md`               | 116 líneas | Doc        | Instalación, comandos, métricas objetivo, scripts futuros propuestos.                                                                                                   |

### Cómo correrlos

```bash
# Health smoke (local)
k6 run --env BASE_URL=http://localhost:3000 tests/load/health.k6.js

# Login stress (staging — nunca contra prod sin permiso)
k6 run \
  --env BASE_URL=https://staging.tu-dominio.co \
  --env TEST_EMAIL=loadtest@example.com \
  --env TEST_PASSWORD='loadtestPass123!' \
  tests/load/login-stress.k6.js

# Endurance de listados (requiere cookie de sesión real)
k6 run \
  --env BASE_URL=https://staging.tu-dominio.co \
  --env SESSION_COOKIE='next-auth.session-token=eyJ...' \
  tests/load/afiliaciones-list.k6.js

# Web Vitals (Lighthouse CI)
pnpm dev &
lhci autorun --config=tests/load/lighthouse.config.js
```

### Auditoría de BD (complemento)

Aunque no es test, en la misma carpeta de "salud" del sistema vive `pnpm cli -- analyze-db`, que reporta tamaño de tablas e índices, y queries lentas si `pg_stat_statements` está habilitado en Neon. Sirve para correlacionar resultados de k6 con cuellos de botella en BD.

### Reglas operacionales

El README es explícito: **nunca correr contra producción sin permiso**, staging primero, coordinar con Neon (cobra por cómputo). bcrypt cost 12 ≈ 200ms por hash; con 1000 VUs concurrentes se satura CPU y p99 sube a varios segundos. La recomendación es escalar instancias antes de bajar el cost de bcrypt.

---

## 12.8 CI

`.github/workflows/ci.yml` define un job único `typecheck-lint-build` que corre en cada push/PR a `master`:

```yaml
- Typecheck: pnpm typecheck
- Lint: pnpm lint
- Build: pnpm build
- Tests: pnpm test
```

**Sí corre tests en CI** (`pnpm test`, paso final del job). Lo hace con variables dummy (`DATABASE_URL` apuntando a un postgres inexistente) — eso funciona porque ningún test toca la BD: son funciones puras + el round-trip cripto que solo necesita una env var local. El job tiene `timeout-minutes: 15`, usa pnpm 10.33.0 y Node 20, y cancela runs anteriores del mismo branch (`concurrency`).

Lo que **no** corre en CI:

- Tests CLI (`test-login`, `test-ingreso`, `pagosimple-test-all`) — requieren credenciales reales del portal AXA y de PagoSimple.
- Tests de carga (k6) — necesitan staging dedicado.
- Lighthouse — necesita app levantada en `localhost`.

---

## 12.9 Gaps y mejoras sugeridas

Inventario honesto de lo que falta cubrir, ordenado por impacto:

1. **Sin tests E2E con Playwright contra la app web propia.** Toda la cobertura E2E es contra integraciones externas (portal Colpatria, API PagoSimple). Flujos críticos como "crear cotizante → afiliar → generar plano → descargar TXT" no tienen una prueba end-to-end automatizada — se validan a mano antes de cada release.
2. **Sin tests de Server Actions.** Los archivos `*.actions.ts` de Next.js (que es donde viven las mutaciones del web) no están cubiertos. La cobertura termina en las funciones puras que las actions invocan.
3. **Sin tests de integración con DB real.** Toda función que toca Prisma queda fuera del test runner. La política deliberada es "extraer la lógica a una función pura y testear esa". Funciona bien para validaciones y mapeos, pero deja sin red de seguridad cosas como: queries con joins complejos, índices, migraciones, race conditions y unique constraints.
4. **Cobertura no instrumentada.** No se mide `%` de líneas/branches. Un PR puede bajar cobertura silenciosamente. Agregar `@vitest/coverage-v8` y un gate mínimo (ej. 70% en `lib/`) costaría poco.
5. **Tests CLI no se corren en CI ni programados.** `test-login` contra el portal real podría detectar cambios en el HTML del portal (un selector que cambió, un campo nuevo) antes que un usuario. Hoy se corre solo cuando alguien lo recuerda. Una opción es un workflow nightly que solo dispare en horarios laborales del portal.
6. **Helpers re-implementados al test.** Archivos como `kpis-helpers.test.ts` y `inactividad-helpers.test.ts` re-escriben los helpers internos del módulo principal en el archivo de test para poder probarlos sin BD. Si el módulo original cambia y nadie sincroniza el test, queda probando una implementación obsoleta. Se mitiga exportando los helpers como funciones puras y testeando esos directamente.
7. **No hay tests de regresión visual del frontend.** Lighthouse mide Web Vitals pero no captura cambios de layout. Una herramienta como Percy o Chromatic podría agregarse.

---

## 12.10 Convenciones de testing aprendidas en el proyecto

- **Tests en español.** Los `describe` y `it` se escriben en español, igual que los commits y los comentarios. Ejemplo: `it('formato latino dd/mm/yyyy también funciona')`.
- **No mockear DB.** Se prefiere extraer la lógica a una función pura sin Prisma y testear esa. Si el helper está embebido en un módulo con I/O, se re-implementa local al test (ver `kpis-helpers.test.ts`, `disparos.test.ts` de Colpatria).
- **Determinismo con `vi.useFakeTimers()`.** Cualquier test que dependa de "hoy" usa `vi.setSystemTime(new Date('2026-04-27T12:00:00Z'))` en `beforeAll` y `vi.useRealTimers()` en `afterAll`. Es la única forma de testear reglas como "fecha de ingreso = today+1" sin que falle un día sí y otro no.
- **Validación contra portal real para tests E2E del bot.** Los comandos `test-login` y `test-ingreso` son la única forma confiable de validar que el bot Colpatria sigue funcionando: el portal AXA cambia su HTML sin avisar y los selectores se rompen. Snapshot tests del DOM no servirían. Por eso se acepta el costo de credenciales reales y cupo consumido.
- **Snapshot manual en lugar de inline.** Para casos como `calcularDV` (NIT), se escribe explícito el valor esperado (`expect(calcularDV('900123456')).toBe('8')`) en lugar de usar `toMatchSnapshot()`. Más legible y diff-friendly en PRs.
- **Comentarios al inicio del archivo explican el "por qué".** Casi todos los archivos `*.test.ts` arrancan con un bloque de comentario describiendo qué se prueba y qué se omite a propósito. Hace fácil entender al revisar un PR qué decisiones de cobertura se tomaron.
- **Errores con regex tolerante en `toThrow`.** Patrón típico: `expect(() => fn()).toThrow(/longitud.*esperaba/)`. Permite que el mensaje del error cambie sin romper el test, mientras la intención del error siga siendo la misma.

---

## 12.11 Resumen ejecutivo

- **21 archivos `*.test.ts`** — todos consumidos por Vitest 4.1.5.
- **~368 tests `it()`** entre web y bot-colpatria.
- **0% mocks de Prisma**: la política es extraer lógica pura.
- **CI corre tests** (`pnpm test` en `.github/workflows/ci.yml`) con env dummy.
- **Tests E2E** son CLIs contra portales externos (Colpatria, AXA, PagoSimple), no Playwright sobre la web propia.
- **Tests de carga** k6 + Lighthouse en `tests/load/`, manuales contra staging.
- **Cobertura `%` no instrumentada**, oportunidad clara de mejora.
- **Gaps principales**: E2E web, Server Actions, queries Prisma reales, cobertura instrumentada.
