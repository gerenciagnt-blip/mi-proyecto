/**
 * Happy path · login → dashboard.
 *
 * Usa las credenciales del seed de pruebas (`pnpm cli seed:test-data`):
 *   - email:    aliado-test@pila.local
 *   - password: Aliado123!
 *   - rol:      ALIADO_OWNER (sucursal TEST-01)
 *
 * Si este test falla en local, lo más probable es que:
 *   1. No has corrido `pnpm cli seed:test-data`, o
 *   2. La BD apuntada por DATABASE_URL no coincide con la del seed.
 */

import { test, expect } from '@playwright/test';

const TEST_EMAIL = 'aliado-test@pila.local';
const TEST_PASSWORD = 'Aliado123!';

test.describe('Auth · login + acceso a admin', () => {
  test('credenciales válidas redirigen a /admin', async ({ page }) => {
    await page.goto('/login');

    // Llenamos el form (los inputs tienen name="email" y name="password")
    await page.locator('input[name="email"]').fill(TEST_EMAIL);
    await page.locator('input[name="password"]').fill(TEST_PASSWORD);

    // Submit y esperar redirect — NextAuth puede pasar por callbacks
    // antes de aterrizar en /admin.
    await Promise.all([
      page.waitForURL(/\/admin/, { timeout: 10_000 }),
      page.getByRole('button', { name: /ingresar/i }).click(),
    ]);

    // Verificamos que estamos dentro del admin (el navbar lateral debe
    // estar visible; los items varían según el rol pero "Inicio"
    // siempre está).
    await expect(page.getByRole('link', { name: /inicio/i }).first()).toBeVisible();
  });

  test('credenciales inválidas muestran error sin redirect', async ({ page }) => {
    await page.goto('/login');

    await page.locator('input[name="email"]').fill(TEST_EMAIL);
    await page.locator('input[name="password"]').fill('contraseña-incorrecta');
    await page.getByRole('button', { name: /ingresar/i }).click();

    // Debe quedarse en /login y mostrar un mensaje de error.
    await expect(page).toHaveURL(/\/login/);
    // El form tiene un Alert variant="danger" con el mensaje.
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 5_000 });
  });

  test('acceso a /admin sin login redirige a /login', async ({ page }) => {
    // Sin sesión previa (storageState: undefined en la config).
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/login/);
  });
});
