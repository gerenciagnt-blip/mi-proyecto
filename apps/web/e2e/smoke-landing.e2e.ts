/**
 * Smoke test del landing público.
 *
 * NO requiere auth ni BD seedeada — verifica que la página pública
 * `/landing` carga, tiene contenido, y los CTAs principales funcionan.
 * Es el test más barato y más útil como "canary" — si esto falla, el
 * deploy de la web rompió algo grave.
 */

import { test, expect } from '@playwright/test';

test.describe('Landing pública', () => {
  test('carga la página principal', async ({ page }) => {
    await page.goto('/landing');
    // Hay un título principal visible (el branding)
    await expect(page).toHaveTitle(/PILA|Sistema/i);
    // No hay errores de Next visibles
    await expect(page.getByText(/application error|build error/i)).not.toBeVisible();
  });

  test('botón "Ingresar" lleva al login', async ({ page }) => {
    await page.goto('/landing');
    // El landing debe tener un link al login (puede estar en navbar o CTA).
    // Usamos `first()` por si hay varios — basta con que uno funcione.
    const loginLink = page.getByRole('link', { name: /ingresar|iniciar sesi/i }).first();
    await expect(loginLink).toBeVisible();
    await loginLink.click();
    await expect(page).toHaveURL(/\/login/);
  });
});
