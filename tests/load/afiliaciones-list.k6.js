/**
 * k6 endurance test — lectura de listados pesados.
 *
 * Apunta a las páginas que sabemos cargan mucho data:
 *   /admin/base-datos              (afiliaciones + 10 catálogos)
 *   /soporte/finanzas/cobro-aliados (take: 300 con includes)
 *
 * Mide:
 *   - p95/p99 de TTFB y total response time.
 *   - Cómo escala con concurrencia 1 → 100 VUs.
 *   - Throughput máximo (req/s) antes de degradación.
 *
 * Requiere un cookie de sesión válida (obtenida una vez con login real).
 * Pega aquí el cookie completo o usa setup() para loguearte.
 *
 * Run:
 *   k6 run \
 *     --env BASE_URL=https://staging.tu-dominio.co \
 *     --env SESSION_COOKIE='next-auth.session-token=...' \
 *     tests/load/afiliaciones-list.k6.js
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const ttfb = new Trend('ttfb_ms', true);
const total = new Trend('total_ms', true);

export const options = {
  scenarios: {
    sustained: {
      executor: 'constant-vus',
      vus: 50,
      duration: '5m',
    },
  },
  thresholds: {
    'ttfb_ms{page:base-datos}': ['p(95)<1500'],
    'total_ms{page:base-datos}': ['p(95)<3000'],
    'ttfb_ms{page:cobros}': ['p(95)<1500'],
    http_req_failed: ['rate<0.02'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const COOKIE = __ENV.SESSION_COOKIE;

if (!COOKIE) {
  throw new Error('Set SESSION_COOKIE con el next-auth.session-token vía --env');
}

const headers = { Cookie: COOKIE };

export default function () {
  group('GET /admin/base-datos', () => {
    const r = http.get(`${BASE_URL}/admin/base-datos`, {
      headers,
      tags: { page: 'base-datos' },
    });
    ttfb.add(r.timings.waiting, { page: 'base-datos' });
    total.add(r.timings.duration, { page: 'base-datos' });
    check(r, { 'status 200': (res) => res.status === 200 });
  });

  group('GET /soporte/finanzas/cobro-aliados', () => {
    const r = http.get(`${BASE_URL}/soporte/finanzas/cobro-aliados`, {
      headers,
      tags: { page: 'cobros' },
    });
    ttfb.add(r.timings.waiting, { page: 'cobros' });
    total.add(r.timings.duration, { page: 'cobros' });
    check(r, { 'status 200': (res) => res.status === 200 });
  });

  sleep(1 + Math.random());
}
