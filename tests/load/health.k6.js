/**
 * k6 baseline — health check.
 *
 * Útil como sanity test antes de los escenarios pesados:
 * confirma que el server responde y mide latencia base.
 *
 * Run:
 *   k6 run --env BASE_URL=http://localhost:3000 tests/load/health.k6.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const latency = new Trend('health_latency_ms');
const errors = new Rate('health_errors');

export const options = {
  scenarios: {
    smoke: {
      executor: 'constant-vus',
      vus: 5,
      duration: '30s',
    },
  },
  thresholds: {
    // Threshold realista: si la BD está en cloud (Neon) y la app corre en
    // local, el RTT base ya es 200-400ms. Para localhost+localhost-db
    // bajar a 100ms.
    health_latency_ms: ['p(95)<2000'],
    health_errors: ['rate<0.05'],
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export default function () {
  const r = http.get(`${BASE_URL}/api/health`);
  latency.add(r.timings.duration);
  const ok = check(r, {
    'status 200': (res) => res.status === 200,
    // El endpoint devuelve { checks: { db: { ok, latencyMs, error } } }.
    'db check ok': (res) => {
      try {
        const j = JSON.parse(res.body);
        return j?.checks?.db?.ok === true;
      } catch {
        return false;
      }
    },
    'db latency reported': (res) => {
      try {
        const j = JSON.parse(res.body);
        return typeof j?.checks?.db?.latencyMs === 'number';
      } catch {
        return false;
      }
    },
  });
  errors.add(!ok);
  sleep(1);
}
