/**
 * Lighthouse CI config — métricas de performance del frontend.
 *
 * Ejecuta auditoría Web Vitals (LCP, FID, CLS, INP) en las páginas más
 * visitadas y guarda histórico para detectar regresiones.
 *
 * Install:
 *   npm install -g @lhci/cli
 *
 * Run:
 *   # contra dev local:
 *   pnpm dev &
 *   lhci autorun --config=tests/load/lighthouse.config.js
 *
 *   # contra staging:
 *   LHCI_BUILD_CONTEXT__CURRENT_BRANCH=$(git branch --show-current) \
 *     lhci autorun \
 *     --config=tests/load/lighthouse.config.js \
 *     --collect.url=https://staging.tu-dominio.co/login
 *
 * Resultados:
 *   - Reporte HTML por URL en .lighthouseci/
 *   - JSON parseable para CI gates
 */
module.exports = {
  ci: {
    collect: {
      url: [
        'http://localhost:3000/login',
        'http://localhost:3000/admin/base-datos',
        'http://localhost:3000/soporte/finanzas/cobro-aliados',
      ],
      // Cantidad de runs por URL (mediana se reporta).
      // En Windows usar 1 para evitar bug EPERM de chrome-launcher al
      // limpiar tmpdir entre runs. En Linux/macOS subir a 3.
      numberOfRuns: process.platform === 'win32' ? 1 : 3,
      settings: {
        // Throttle moderado — no usar Slow 4G porque la app es backoffice
        // interno y los usuarios típicamente están en oficina.
        throttling: {
          rttMs: 40,
          throughputKbps: 10240,
          cpuSlowdownMultiplier: 1,
        },
        // Solo desktop por ahora (los aliados usan PC).
        formFactor: 'desktop',
        screenEmulation: {
          mobile: false,
          width: 1366,
          height: 850,
          deviceScaleFactor: 1,
          disabled: false,
        },
      },
    },
    upload: {
      // Sube reportes a tmp public storage; cambiar a self-hosted en prod.
      target: 'temporary-public-storage',
    },
    assert: {
      // Gates duros — falla CI si bajan de estos umbrales.
      assertions: {
        'categories:performance': ['error', { minScore: 0.7 }],
        'categories:accessibility': ['error', { minScore: 0.85 }],
        'categories:best-practices': ['warn', { minScore: 0.8 }],
        'first-contentful-paint': ['warn', { maxNumericValue: 2000 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 3500 }],
        'total-blocking-time': ['warn', { maxNumericValue: 500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
      },
    },
  },
};
