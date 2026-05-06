/**
 * Lighthouse CI — variante para correr en GitHub Actions.
 *
 * Diferencias con `lighthouse.config.js`:
 *  - Solo páginas públicas (/landing, /login). Las admin pages
 *    requieren login programático que no está montado en CI todavía.
 *  - `numberOfRuns = 1` para que el job no tarde 10 min cada PR.
 *    Si querés más rigor, subir a 3 (tarda más pero la mediana es
 *    menos ruidosa).
 *  - Gates levemente más laxos al inicio para evitar falsos
 *    positivos por el ruido del runner. Ajustar al alza cuando
 *    estabilice.
 *
 * Run local (replicar CI):
 *   pnpm build && pnpm --filter @pila/web start &
 *   lhci autorun --config=tests/load/lighthouse.ci.config.js
 */
module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:3000/login', 'http://localhost:3000/landing'],
      numberOfRuns: 1,
      settings: {
        throttling: {
          rttMs: 40,
          throughputKbps: 10240,
          cpuSlowdownMultiplier: 1,
        },
        formFactor: 'desktop',
        screenEmulation: {
          mobile: false,
          width: 1366,
          height: 850,
          deviceScaleFactor: 1,
          disabled: false,
        },
        // En CI el "first run" siempre tiene caché frío y a veces
        // dispara warnings de performance. Excluir audits ruidosos
        // que no aportan en este contexto.
        skipAudits: ['uses-http2', 'redirects-http'],
      },
    },
    upload: {
      // En CI guardamos los reportes en filesystem para que el step
      // `Upload Lighthouse reports as artifact` los suba a GitHub
      // (retención 14 días). Usamos un outputDir distinto del default
      // de lhci (`.lighthouseci/`) para evitar que el internal cleanup
      // del autorun los borre antes del upload-artifact.
      target: 'filesystem',
      outputDir: './.lhci-reports',
      reportFilenamePattern: '%%PATHNAME%%-%%DATETIME%%.report.%%EXTENSION%%',
    },
    assert: {
      // Gates relajados en una vuelta para evitar falsos positivos
      // del runner. Subir al alza cuando 3 PRs consecutivos pasen
      // limpios.
      assertions: {
        'categories:performance': ['error', { minScore: 0.6 }],
        'categories:accessibility': ['error', { minScore: 0.85 }],
        'categories:best-practices': ['warn', { minScore: 0.8 }],
        'largest-contentful-paint': ['warn', { maxNumericValue: 4000 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['warn', { maxNumericValue: 800 }],
      },
    },
  },
};
