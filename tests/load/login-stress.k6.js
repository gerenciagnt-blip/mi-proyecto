/**
 * k6 stress test — flujo de autenticación.
 *
 * Mide:
 *   - Latencia de POST /api/auth/callback/credentials (login real).
 *   - Cuándo el rate-limit (3 intentos / 10min por email) empieza a cortar.
 *   - Comportamiento bajo 100/500/1000 VUs concurrentes.
 *
 * IMPORTANTE: este script genera tráfico REAL de login. Ejecutar SOLO
 * contra ambiente staging — nunca contra prod sin permiso explícito.
 *
 * Requiere un usuario de prueba pre-creado:
 *   pnpm cli admin:create  (luego export TEST_EMAIL/TEST_PASSWORD)
 *
 * Run:
 *   k6 run \
 *     --env BASE_URL=https://staging.tu-dominio.co \
 *     --env TEST_EMAIL=loadtest@example.com \
 *     --env TEST_PASSWORD=loadtestPass123! \
 *     tests/load/login-stress.k6.js
 */
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

const loginLatency = new Trend('login_latency_ms');
const loginErrors = new Rate('login_errors');
const rateLimited = new Counter('rate_limited_count');

export const options = {
  // Stages clásicos de stress: ramp-up, plateau, ramp-down.
  // Ajusta VUs según el budget del runner.
  scenarios: {
    ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 }, // calentamiento
        { duration: '1m', target: 100 },
        { duration: '30s', target: 500 }, // pico medio
        { duration: '2m', target: 500 },
        { duration: '30s', target: 1000 }, // pico alto (1k VUs)
        { duration: '2m', target: 1000 },
        { duration: '1m', target: 0 }, // ramp-down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    login_latency_ms: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.05'], // <5% al pico
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const EMAIL = __ENV.TEST_EMAIL;
const PASSWORD = __ENV.TEST_PASSWORD;

if (!EMAIL || !PASSWORD) {
  throw new Error('Set TEST_EMAIL y TEST_PASSWORD vía --env');
}

export function setup() {
  // Pre-fetch CSRF token de NextAuth (el endpoint requiere uno por sesión).
  const r = http.get(`${BASE_URL}/api/auth/csrf`);
  return { csrfToken: JSON.parse(r.body).csrfToken };
}

export default function (data) {
  group('login flow', () => {
    const start = Date.now();
    const r = http.post(
      `${BASE_URL}/api/auth/callback/credentials`,
      {
        email: EMAIL,
        password: PASSWORD,
        csrfToken: data.csrfToken,
      },
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        redirects: 0, // capturamos el 302, no seguimos
      },
    );
    loginLatency.add(Date.now() - start);

    const isOK = check(r, {
      'status 200/302': (res) => res.status === 200 || res.status === 302,
    });
    if (!isOK) loginErrors.add(1);
    if (r.status === 429 || (r.body && /bloqueada|rate/i.test(r.body))) {
      rateLimited.add(1);
    }
  });
  sleep(Math.random() * 2);
}
