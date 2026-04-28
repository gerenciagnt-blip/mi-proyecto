# Performance & Load Tests

Suite de scripts para medir resistencia, latencia y escalabilidad del sistema.
Generado en la auditoría 2026-04-28 — ver el reporte en `docs/auditoria-2026-04.md` (si lo hay) o el chat de origen.

## Herramientas

| Tool                    | Propósito               | Install                                      |
| ----------------------- | ----------------------- | -------------------------------------------- |
| **k6**                  | Stress + endurance HTTP | https://k6.io/docs/get-started/installation/ |
| **Lighthouse CI**       | Web Vitals frontend     | `npm i -g @lhci/cli`                         |
| **pnpm cli analyze:db** | Auditoría real de BD    | Ya en el monorepo                            |

## Reglas de uso

1. **NUNCA correr contra producción sin permiso explícito**. Estos scripts generan tráfico real
   (login, lecturas pesadas) y pueden disparar rate-limits, romper sesiones, o tumbar PagoSimple
   si lo combinas con `validar-subtipos`.
2. **Staging primero**. La meta es comparar staging vs prod periódicamente.
3. **Coordinar con BD**: avisa al equipo antes de un stress run — Neon cobra por cómputo.

## Scripts incluidos

### `health.k6.js` — sanity baseline (5 VUs, 30s)

Verifica que el server respira y mide latencia base de `/api/health`.

```bash
k6 run --env BASE_URL=http://localhost:3000 tests/load/health.k6.js
```

### `login-stress.k6.js` — escala 100 → 500 → 1000 VUs

Mide hasta qué carga de login concurrente aguanta NextAuth + bcrypt cost 12 + rate-limit.

```bash
k6 run \
  --env BASE_URL=https://staging.tu-dominio.co \
  --env TEST_EMAIL=loadtest@example.com \
  --env TEST_PASSWORD='loadtestPass123!' \
  tests/load/login-stress.k6.js
```

⚠️ bcrypt cost 12 ≈ 200ms por hash en CPU típica. A 1000 VUs concurrentes saturas CPU
del runtime. **Síntoma esperado**: p99 sube a varios segundos. Si quieres más throughput
sin tocar la seguridad, sube replicas/instancias, no bajes el cost.

### `afiliaciones-list.k6.js` — endurance 50 VUs × 5 min

Apunta a páginas con queries pesadas (`/admin/base-datos`, `/soporte/finanzas/cobro-aliados`).
Detecta degradación gradual (memory leak, BD pool exhausted, query plan flip).

```bash
k6 run \
  --env BASE_URL=https://staging.tu-dominio.co \
  --env SESSION_COOKIE='next-auth.session-token=eyJ...' \
  tests/load/afiliaciones-list.k6.js
```

Para extraer la cookie: login en browser → DevTools → Application → Cookies → copia
`next-auth.session-token` (URL-encode si tiene caracteres especiales).

### `lighthouse.config.js` — Web Vitals (LCP, CLS, TBT)

Audita performance, accesibilidad y best practices en las páginas claves.

```bash
pnpm dev &
lhci autorun --config=tests/load/lighthouse.config.js
```

Gates configurados:

- Performance ≥ 70
- Accessibility ≥ 85
- LCP < 3.5s, TBT < 500ms, CLS < 0.1

## Auditoría de BD (incluida en el repo)

```bash
# Reporte completo de tablas + queries lentas (necesita pg_stat_statements)
pnpm cli analyze:db --by total --limit 25

# Solo reporte de tablas e índices (no requiere extension)
pnpm cli analyze:db --tables-only

# Resetear estadísticas (requiere superuser)
pnpm cli analyze:db --reset
```

Para activar reporte de queries en Neon:

1. Settings → Extensions → habilitar `pg_stat_statements`.
2. Reiniciar conexión Prisma (deploy o reload de la app).
3. Volver a correr `analyze:db`.

## Métricas objetivo (acuerdos sugeridos)

| Métrica                  | Target  | Critical |
| ------------------------ | ------- | -------- |
| Login p95                | < 1s    | < 3s     |
| Listado afiliaciones p95 | < 2s    | < 5s     |
| Health check p95         | < 200ms | < 1s     |
| Error rate global        | < 1%    | < 5%     |
| LCP (frontend)           | < 2.5s  | < 4s     |
| CLS                      | < 0.1   | < 0.25   |

## Próximos scripts a agregar

- `bdua-ruaf-burst.k6.js` — burst contra `consultarCotizanteBduaRuaf` para validar
  que el rate-limit local protege la cuota PagoSimple.
- `colpatria-bot-load.k6.js` — encolar 100 jobs simultáneos via API y medir cuánto
  tarda el worker en drenarlos.
- `pdf-generation.k6.js` — generar comprobantes PDF concurrentemente (cuello de
  botella @react-pdf/renderer).
