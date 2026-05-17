import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config para tests E2E del web.
 *
 * NO se ejecutan en cada PR (son lentos y requieren BD seedeada). Se
 * corren:
 *   - Localmente: `pnpm e2e` (asume server dev corriendo)
 *   - CI: workflow manual `pnpm-e2e-manual.yml` (cuando se decida que
 *     un PR merece smoke E2E completo)
 *
 * Los tests están en `apps/web/e2e/`. Cada archivo `.e2e.ts` define un
 * happy path. Los datos vienen del seed `cli seed:test-data`:
 *   - email:    aliado-test@pila.local
 *   - password: Aliado123!
 *   - rol:      ALIADO_OWNER (sucursal TEST-01)
 *
 * El `baseURL` apunta por default a localhost:3000; se puede override
 * con env `PLAYWRIGHT_BASE_URL` (p. ej. para apuntar a staging).
 */

export default defineConfig({
  testDir: './e2e',
  // Patrón explícito para no confundirse con tests unitarios de vitest
  // (que usan `*.test.ts`).
  testMatch: '**/*.e2e.ts',
  // Tiempos generosos — el sistema toca BD real y servicios externos.
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // En CI: 1 worker para evitar carrera con la BD compartida. En local
  // (dev rápido), permitir paralelo.
  fullyParallel: !process.env.CI,
  workers: process.env.CI ? 1 : undefined,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Cierra el contexto entre tests para no arrastrar cookies de un
    // test al siguiente (cada test es una sesión limpia).
    storageState: undefined,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
