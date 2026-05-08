# SLO Table

## Service Level Objectives

| SLI | Measurement Method | Target (SLO) | Measurement Window |
|-----|--------------------|--------------|-------------------|
| API availability | `1 - rate(http_requests_total{status_code=~"5.."}[5m])` | ≥ 99% | Rolling 5 min |
| `/api/messages` p95 latency | `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{route="/api/messages"}[5m]))` | < 2 s | Rolling 5 min |
| `/api/topics` p95 latency | `histogram_quantile(0.95, rate(http_request_duration_seconds_bucket{route="/api/topics"}[5m]))` | < 500 ms | Rolling 5 min |
| `/readyz` availability | Prometheus `up` metric | 100% | Continuous |
| Queue job success rate | Failed jobs / total jobs processed | ≥ 95% | Per day |
| Scraper freshness | Topics inserted per 24 h | ≥ 5 new topics | Per day |

## k6 Load Test Targets

| Scenario | VUs | Duration | p95 Latency Target | Error Rate Target |
|----------|-----|----------|--------------------|-------------------|
| Baseline | 10 | 30 s | < 2 s | < 1% |
| Stressed | ramp 0→50 | 75 s | < 4 s | < 5% |
| Scaled-out (2 replicas) | 50 | 30 s | < 2 s | < 1% |

## Measured Results

Sourced from `k6 run load/gateway.js` against `docker compose up --scale gateway=N` with Groq mocked (see [architecture-report.md §3](./architecture-report.md) for full methodology and threats to validity). Comparison of the same script run against 1 vs 3 gateway replicas:

| Scenario | Replicas | p95 latency | `gateway_errors` rate | Throughput |
|---|---|---|---|---|
| Baseline | 1 | 0.34 s | n/a | — |
| Baseline | 3 | 0.66 s | n/a | — |
| Stressed | 1 | 1.73 s | n/a | — |
| Stressed | 3 | 1.84 s | n/a | — |
| Scaled-out | 1 | 2.43 s | **6.81 %** | 39.3 req/s |
| Scaled-out | 3 | 2.15 s | **0.27 %** | 39.4 req/s |

**Headline finding:** going from 1 → 3 gateway replicas reduces the `scaled_out` error rate by **~96 %** (6.81 % → 0.27 %) while leaving sustained throughput essentially unchanged (the bottleneck moves from the gateway event loop to the downstream Supabase / Redis RTT). The persistent ~25 % `http_req_failed` rate seen in both runs is the rate-limiter doing its job — 50 VUs × ~10 req/s ≈ 500 req/min vs the configured 60 req/min cap.

The unexpected `baseline` p95 regression on the 3-replica run is host-CPU contention from the co-located k6 generator and is documented under "threats to validity" in the architecture report.

## Reliability Mechanisms vs. Failure Modes

| Failure Mode | Detection | Recovery |
|---|---|---|
| Groq API slow/unavailable | Circuit breaker opens after 50% errors in 60 s window | Breaker resets after 30 s; cached response or 503 returned |
| Redis unavailable | `/readyz` returns 503; rate-limiter falls back to in-memory | BullMQ reconnects automatically; job queue persists in Redis |
| Worker job crash | `job.failed` event logged at `error` level with `dlq: true` after 3 attempts | Manual replay via Bull Board UI at `:3002/queues` |
| Gateway overloaded | Rate limiter returns 429 after 60 req/min per user | nginx-lb spreads load across replicas; scale with `--scale gateway=N` |
| Scraper re-run within same slot | Redis idempotency key checked at job start | Job exits early (`skipping — already completed this slot`) |
