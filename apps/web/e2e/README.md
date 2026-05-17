# E2E Tests — Sistema PILA

Tests end-to-end con Playwright. Se ejecutan contra una instancia real
de la app (dev local o staging desplegado) y validan happy paths críticos.

## Cuándo correr

- **Localmente, antes de un PR grande:** asegura que el flujo principal
  no se rompió.
- **Manual en CI:** el workflow `.github/workflows/e2e-manual.yml` se
  dispara con `workflow_dispatch` cuando vale la pena el smoke.
- **NO en cada PR:** son lentos (>30s cada uno) y requieren BD
  seedeada. El CI normal (`ci.yml`) solo corre unit tests + build.

## Setup local

```bash
# 1. Asegúrate de tener BD dev arriba y seedeada
pnpm cli seed:test-data

# 2. Levanta el server dev (en otra terminal)
pnpm dev

# 3. Instala browsers de Playwright (primera vez)
pnpm -F @pila/web exec playwright install chromium

# 4. Corre los E2E
pnpm -F @pila/web e2e
```

## Tests disponibles

| Archivo                | Qué cubre                                                             |
| ---------------------- | --------------------------------------------------------------------- |
| `smoke-landing.e2e.ts` | Landing público carga + CTA login funciona                            |
| `auth-login.e2e.ts`    | Login con credenciales del seed + manejo de errores + guard de /admin |

## Credenciales de prueba

El seed `cli seed:test-data` crea:

- email: `aliado-test@pila.local`
- password: `Aliado123!`
- rol: `ALIADO_OWNER` (sucursal `TEST-01`)

**Idempotente:** correr varias veces no rompe nada. Usa `--force` para
resetear el password.

## Override de URL

Por default los tests apuntan a `http://localhost:3000`. Para correrlos
contra otro entorno:

```bash
PLAYWRIGHT_BASE_URL=https://staging.pila.example.com pnpm -F @pila/web e2e
```

## Agregar tests nuevos

1. Crear archivo `apps/web/e2e/<feature>.e2e.ts` (el sufijo `.e2e.ts`
   es importante — `playwright.config.ts` solo matchea ese patrón).
2. Usar selectores accesibles (`getByRole`, `getByText`) en vez de
   CSS para que los tests no se rompan con refactors visuales.
3. Si el test necesita data extra al seed default, agregar al
   `cli seed:test-data` (mantener idempotencia).

## Roadmap

Tests que valdría la pena agregar cuando se priorice (1 sprint extra
por cada uno):

- **Crear afiliación end-to-end:** login → base-datos → crear cotizante
  → crear afiliación → ver en listado.
- **Transacción / facturación:** login → transacciones → liquidar mes
  → ver comprobante.
- **Chat:** login con 2 users distintos en 2 contextos → enviar
  mensaje, recibir, reaccionar.
- **PQRS:** anónimo en /landing/pqrs → ver en bandeja staff.
