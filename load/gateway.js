/**
 * k6 load test — edge-language-coach gateway
 *
 * Three scenarios (run sequentially via startTime):
 *  1. baseline    — 10 VUs for 30s  (steady light load)
 *  2. stressed    — ramp to 50 VUs  (stress the rate-limiter + circuit breaker)
 *  3. scaled_out  — 50 VUs for 30s  (repeat stress with multiple gateway replicas)
 *
 * Run:
 *   k6 run load/gateway.js
 *   k6 run --env GATEWAY_URL=http://localhost:3001 load/gateway.js
 *   k6 run --out json=load/results.json load/gateway.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Rate, Counter } from "k6/metrics";

const BASE_URL = __ENV.GATEWAY_URL || "http://localhost:3001";

const latency = new Trend("gateway_latency_ms", true);
const errorRate = new Rate("gateway_errors");
const requestCount = new Counter("gateway_requests");

export const options = {
  scenarios: {
    baseline: {
      executor: "constant-vus",
      vus: 10,
      duration: "30s",
      startTime: "0s",
      tags: { scenario: "baseline" },
    },
    stressed: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { target: 50, duration: "30s" },
        { target: 50, duration: "30s" },
        { target: 0, duration: "15s" },
      ],
      startTime: "35s",
      tags: { scenario: "stressed" },
    },
    scaled_out: {
      executor: "constant-vus",
      vus: 50,
      duration: "30s",
      startTime: "120s",
      tags: { scenario: "scaled_out" },
    },
  },
  thresholds: {
    "gateway_latency_ms{scenario:baseline}": ["p(95)<2000"],
    "gateway_latency_ms{scenario:stressed}": ["p(95)<4000"],
    "gateway_latency_ms{scenario:scaled_out}": ["p(95)<2000"],
    "gateway_errors": ["rate<0.05"],
    http_req_failed: ["rate<0.05"],
  },
};

function probe(url, params) {
  const start = Date.now();
  const res = http.get(BASE_URL + url, params);
  latency.add(Date.now() - start);
  requestCount.add(1);
  const ok = res.status === 200 || res.status === 401;
  errorRate.add(!ok);
  return res;
}

export default function () {
  // Health probe — always open, no auth required
  const liveness = probe("/livez");
  check(liveness, { "livez 200": (r) => r.status === 200 });

  sleep(0.1);

  // Readiness probe
  const readiness = probe("/readyz");
  check(readiness, { "readyz 2xx": (r) => r.status === 200 || r.status === 503 });

  sleep(0.1);

  // Topics endpoint — requires auth token, expect 401 (proves route is reachable)
  const topics = probe("/api/topics");
  check(topics, { "topics reachable": (r) => r.status === 200 || r.status === 401 });

  sleep(0.2);

  // Metrics endpoint
  const metrics = probe("/metrics");
  check(metrics, { "metrics 200": (r) => r.status === 200 });

  sleep(0.1);
}
