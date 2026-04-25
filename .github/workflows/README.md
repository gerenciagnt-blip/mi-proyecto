# GitHub Actions — workflows del Sistema PILA

Cada workflow corresponde a un job programado o evento. Todos pueden
ejecutarse manualmente desde la UI de Actions con `workflow_dispatch`.

## Workflows activos

| Workflow              | Cron (UTC)                 | Equivalente Bogotá         | Comando CLI                 |
| --------------------- | -------------------------- | -------------------------- | --------------------------- |
| `ci.yml`              | en cada PR/push            | —                          | `lint + typecheck + test`   |
| `retention-daily.yml` | `0 4 * * *` (diario 4 AM)  | 23:00 día anterior         | `retention:run`             |
| `pagosimple-sync.yml` | `*/15 13-22 * * 1-5`       | 8:00–17:00 L-V cada 15 min | `pagosimple:sync-planillas` |
| `cobros-mensual.yml`  | día 1 a las 8 AM UTC       | día 1 · 03:00              | `cobros:generar`            |
| `cobros-daily.yml`    | diario 12 PM UTC           | 7:00                       | `cobros:bloquear-morosos`   |
| `db-backup.yml`       | semanal — domingo 5 AM UTC | domingo 00:00              | `pg_dump → S3`              |

## Secrets requeridos

Configurar en `GitHub → Settings → Secrets and variables → Actions`.

### Mínimo para todos los jobs

- `DATABASE_URL` — conexión a la BD producción (Neon pooler)

### PagoSimple (`pagosimple-sync.yml`)

- `PAGOSIMPLE_BASE_URL`
- `PAGOSIMPLE_MASTER_NIT`
- `PAGOSIMPLE_MASTER_COMPANY`
- `PAGOSIMPLE_MASTER_SECRET_KEY`
- `PAGOSIMPLE_MASTER_DOCUMENT_TYPE`
- `PAGOSIMPLE_MASTER_DOCUMENT`
- `PAGOSIMPLE_MASTER_PASSWORD`

### Retención (`retention-daily.yml`)

- `UPLOADS_DIR` — opcional, default `./uploads`. **Ojo:** si los archivos
  viven en un volumen persistente (S3/Vercel Blob), este job no los limpia
  automáticamente; hay que adaptar para usar el SDK del proveedor.

### Backup (`db-backup.yml`)

- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION` (default `us-east-1`)
- `BACKUP_S3_BUCKET`
- `BACKUP_S3_PREFIX` (opcional, default `pila-prod`)

## Cómo correr un job manualmente

1. `Actions` → seleccionar workflow.
2. `Run workflow` (botón a la derecha).
3. En jobs con `dry`/flags, marcar `true` para simular sin escribir.

## Ejecución local de los mismos comandos

Útil para pruebas antes de programar el cron:

```bash
# Retención (dry)
pnpm cli retention:run --dry

# Sync PagoSimple
pnpm cli pagosimple:sync-planillas

# Sync incluyendo PAGADA (re-verifica si fueron pagadas externamente)
pnpm cli pagosimple:sync-planillas --include-pagadas

# Cobros del mes
pnpm cli cobros:generar --periodo 2026-04

# Bloqueo de aliados morosos
pnpm cli cobros:bloquear-morosos
```

## Troubleshooting

### El job no aparece programado

Los workflows con `schedule:` se activan **solo** cuando están en la rama
default del repo. Mientras se desarrolla en una rama, usar
`workflow_dispatch` para ejecutar manualmente.

### "DATABASE_URL no empieza con postgresql://"

El secret quedó guardado con comillas o saltos de línea. Re-editarlo
copiando solo la URL pelada (sin `"`).

### "PagoSimple no está configurado"

Falta uno de los 7 secrets `PAGOSIMPLE_*`. Verificar en
`Settings → Secrets`.
