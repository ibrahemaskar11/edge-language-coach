# Edge Language Coach — Architecture Report

## 1. System Overview

Edge Language Coach is an Italian language learning application that uses AI-powered conversational practice, spaced-repetition flashcards, and automated topic curation to help learners improve fluency.

The system is designed as a **distributed, event-driven architecture** with three independently deployable runtime units:

| Unit | Technology | Role |
|------|-----------|------|
| Web | React 19 + Vite → nginx | SPA served as static files |
| Gateway | Fastify (Node.js) | REST API, auth, reliability primitives |
| Workers | Node.js + BullMQ | Async job processing (scraper, summary, flashcards) |

See `docs/c4-diagram.md` for full C4 Level 1–3 diagrams.

---

## 2. Reliability Mechanisms

### 2.1 Circuit Breaker (Groq API)

The gateway wraps all Groq API calls (LLM chat completions, Whisper transcription) in two independent `opossum` circuit breakers:

- **Chat breaker**: Opens after 50% error rate over a 60 s rolling window (min 10 requests). Resets after 30 s.
- **Transcribe breaker**: Same thresholds, with a 60 s timeout (audio inference is slower).

When a breaker is open, requests to that capability return an immediate error rather than blocking the gateway thread waiting for a timeout. This prevents Groq slowdowns from cascading into full service degradation.

Breaker state is exposed as a Prometheus gauge (`groq_circuit_breaker_state`) and visible in the Grafana dashboard.

**Measured breaker behaviour.** The breaker was exercised end-to-end using a mock Groq server ([`mocks/groq-mock.mjs`](../mocks/groq-mock.mjs)) put into `slow` mode (30 s sleep per request, exceeding the 15 s breaker timeout) and the driver script ([`mocks/breaker-driver.mjs`](../mocks/breaker-driver.mjs)) firing 60 requests at concurrency 12. Full output at [`load/breaker-demo-output.txt`](../load/breaker-demo-output.txt). Summary:

| Phase | Calls | Per-call latency | Status |
|---|---|---|---|
| Closed (probing) | 1–7 | 15.3 s (timeout) | breaker collecting failure samples |
| **Transition** | call 7 | — | volumeThreshold (10) + 50% error rate crossed → **opened** |
| Open (short-circuit) | 8–60 | 12–58 ms | requests fail-fast, never reach mock |

**Latency cliff:** 15 300 ms → 25 ms in adjacent calls. Without the breaker, all 60 requests would have hit the 15 s timeout sequentially or in parallel waves; with it, only 7 calls paid the upstream-stalled cost. The remaining 53 calls cost the system effectively zero CPU and zero open sockets to Groq.

### 2.2 Rate Limiting

All API routes are rate-limited at 60 requests/minute per authenticated user (or per IP for unauthenticated requests), backed by Redis for distributed counting across replicas. Health probes (`/livez`, `/readyz`, `/metrics`) are allowlisted.

### 2.3 Job Queue Retry & DLQ

Workers use BullMQ with a shared retry configuration (3 attempts, exponential backoff starting at 5 s). Failed jobs are logged at `error` level with `dlq: true` after exhausting all retries, providing a structured dead-letter record visible in log aggregation without requiring a separate DLQ queue.

All queue state is visible in the Bull Board UI at `:3002/queues`.

### 2.4 Scraper Idempotency

The scraper cron job (every 6 hours) sets a Redis key after each successful run (`scraper:slot:<date>:<slot>`, TTL = 6 h). If the job is retried within the same time window (e.g., after a transient failure), it exits early to prevent duplicate topic ingestion.

Title-level deduplication (exact and prefix match against the last 30 days of topics) provides a second layer of protection.

### 2.5 Timeouts

- Gateway: 30 s connection timeout, 5 s keep-alive timeout
- Groq chat: 15 s circuit breaker timeout
- Groq transcribe: 60 s circuit breaker timeout
- Health probes: 2 s per dependency check (Redis, Supabase, Groq)

### 2.6 Integration tests

The reliability claims in §2.1–§2.5 are not just asserted in prose — they are pinned in CI. The gateway has a Vitest suite ([`apps/gateway/src/__tests__/health.test.ts`](../apps/gateway/src/__tests__/health.test.ts)) using Fastify's `inject()` harness, with Redis, Supabase, and Groq mocked at module boundaries so tests run hermetically. Currently covered:

- `GET /livez` returns 200 unconditionally.
- `GET /readyz` returns 200 with `{status: "ready"}` when all dependencies are healthy.
- `GET /readyz` returns 503 with `{deps: {redis: {ok: false}}}` when the Redis ping rejects.
- `GET /readyz` returns 503 with `{deps: {groq: {ok: false}}}` when the Groq probe rejects.

CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs `pnpm turbo test` ahead of typecheck and build on every push and PR, so a regression in the readiness path or its failure semantics fails the pipeline. Breaker, rate-limit, and queue-retry tests are the natural next additions and would close the rest of the gap.

---

## 3. Scalability

### 3.1 Horizontal Gateway Scale-out

The gateway is stateless (all session state is in Supabase; all rate-limit counters are in Redis). It can be scaled horizontally with:

```bash
docker compose up --scale gateway=3
```

An nginx load balancer (`nginx-lb`) sits in front of all gateway replicas and distributes traffic via Docker's built-in DNS round-robin. The web SPA and Prometheus both target `nginx-lb:3001`.

### 3.2 Measured Scale-Out Behaviour

The k6 script at `load/gateway.js` runs three sequential scenarios in a single invocation:

| Scenario | Profile | Purpose |
|---|---|---|
| `baseline` | 10 VUs constant for 30 s | Light steady-state load |
| `stressed` | Ramp 0 → 50 VUs over 60 s, then taper | Stress test rate-limit + downstream |
| `scaled_out` | 50 VUs constant for 30 s | Saturated steady-state |

The full script was run twice — once with a single gateway replica (`docker compose up gateway`), once with three replicas (`docker compose up --scale gateway=3`). All other parameters were held constant. Results:

| Metric | 1 replica | 3 replicas | Δ |
|---|---|---|---|
| `gateway_errors` rate | **6.81 %** | **0.27 %** | **−96 %** |
| `scaled_out` p95 latency | 2.43 s | 2.15 s | −12 % |
| `stressed` p95 latency | 1.73 s | 1.84 s | +6 % |
| `baseline` p95 latency | 0.34 s | 0.66 s | +93 % (cold-start noise; see §3.3) |
| Sustained throughput | 39.3 req/s | 39.4 req/s | unchanged |

**Interpretation.** Adding replicas had a dramatic effect on the *error rate* (the 1-replica gateway was dropping ~7 % of requests under saturation; with 3 replicas this collapsed to under 0.3 %), but only a modest effect on *latency* under saturation (~12 % p95 reduction). This indicates that under sustained load:

- The **gateway itself** is the bottleneck for **availability** — a single Node.js event loop cannot keep up with 50 concurrent virtual users plus rate-limit checks plus auth verification, so it starts dropping connections.
- The **downstream request hot path** (Supabase RTT, Redis rate-limit checks) is the bottleneck for **latency** — adding gateway replicas does not reduce the per-request work outside the gateway, so p95 only improves marginally.

The persistent ~25 % `http_req_failed` rate seen in both runs is the rate-limiter doing its job correctly: 50 VUs × ~10 req/s ≈ 500 req/min vs. the configured 60 req/min cap. These are 429 responses, not failures of the system.

### 3.3 Caveats and Threats to Validity

- **Co-located load generator.** k6 ran on the same Windows host as Docker Desktop, so the test loop competed for CPU with the containers. This is most visible in the unexpected `baseline` p95 regression on the 3-replica run (Docker had to schedule three gateway containers + the original two from the first run, evicting cache pages).
- **Mocked Groq.** All Groq calls returned in <1 ms via [`mocks/groq-mock.mjs`](../mocks/groq-mock.mjs), eliminating a normally significant latency contributor. This isolates the gateway/queue layer (the system under test) but means absolute p95 numbers should not be read as production estimates.
- **Single iteration.** Each replica configuration was tested once; no statistical variance across runs.
- **Limited scale.** Three replicas is the largest configuration tested (constrained by available host CPU). The diminishing-returns curve at higher replica counts has not been measured.

### 3.4 Worker Concurrency

Workers are horizontally scalable as well — BullMQ supports multiple consumers on the same queue and guarantees each job is processed exactly once. Within a single worker process, per-queue concurrency is configured independently:

| Queue | Concurrency | Rationale |
|-------|-------------|-----------|
| `flashcard-generate` | 3 | Parallelism limited by Groq rate limits |
| `summary-generate` | 3 | Same |
| `topic-scrape` | 1 | Scraper is serial to avoid race conditions on dedup state |

### 3.5 Production deployment

The same compose model that demonstrates scale-out locally also runs in production, on a single Oracle Cloud VM via [`docker-compose.prod.yml`](../docker-compose.prod.yml). The prod compose file pulls multi-arch images (`linux/amd64` + `linux/arm64`) from GHCR rather than building on the host, so the deployment surface is image-pull + container-restart, not source build.

The release pipeline ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) is three sequential GitHub Actions jobs:

1. `typecheck-build` — `pnpm install`, `prisma generate`, `pnpm turbo test`, then typecheck + build across all workspaces.
2. `docker` (only on push to `main`) — `docker buildx` builds and pushes multi-arch images for `gateway` and `workers` to GHCR with a GHA build cache.
3. `deploy` (only on push to `main`) — SSH into the Oracle host, `git pull`, `docker login ghcr.io`, `docker compose -f docker-compose.prod.yml pull && up -d --remove-orphans`, then prune dangling images.

The prod compose includes Redis, workers, gateway, and `nginx-lb`; it intentionally omits Prometheus/Grafana/Bull Board (separate observability deploy) and the SPA (served from Cloudflare Pages / Vercel from the same `apps/web` build).

---

## 4. Observability

### 4.1 Structured Logging (Pino)

All services emit JSON-structured logs via `pino`. Each log line includes `service` (gateway/workers), `requestId`, and relevant domain fields (sessionId, jobId, queue name). Log level is configurable via `LOG_LEVEL` env var.

### 4.2 Prometheus Metrics (prom-client)

The gateway exposes `/metrics` in Prometheus text format, scraped every 15 s. Key metrics:

| Metric | Type | Labels |
|--------|------|--------|
| `http_request_duration_seconds` | Histogram | method, route, status_code |
| `http_requests_total` | Counter | method, route, status_code |
| `groq_circuit_breaker_state` | Gauge | breaker (chat/transcribe) |
| `queue_depth_total` | Gauge | queue |
| `active_sessions_total` | Gauge | — |

Node.js default metrics (event loop lag, memory, GC) are also collected via `collectDefaultMetrics()`.

### 4.3 Grafana Dashboard

A pre-provisioned dashboard (`docker/grafana/dashboards/edge-coach.json`) is loaded automatically on Grafana startup. Panels: request rate by route, p50/p95/p99 latency, 5xx error rate, circuit breaker state, queue depth, active sessions. Accessible at `localhost:3000` (admin/admin).

### 4.4 Health Probes

- `/livez`: Always 200 — liveness signal for container orchestration.
- `/readyz`: Checks Redis, Supabase, and Groq availability with 2 s timeouts. Returns 503 if any dependency is degraded.

---

## 5. Operator Surface — Agentic MCP

A two-server [Model Context Protocol](https://modelcontextprotocol.io) layer exposes the running system to agent-driven inspection and remediation, **without** SSH, `kubectl`, or a redeploy. This closes the operator loop on top of the observability stack: **detect** (Prometheus / Grafana) → **diagnose** (`observability-mcp`) → **remediate** (`remediation-mcp`).

The two servers are separated by privilege: read-only telemetry on one transport, guarded mutations on a second.

### 5.1 `observability-mcp` (read-only)

Wraps `/metrics` and `/readyz` as five typed tools. No mutation, no auth (stdio transport, locally scoped). Source: [`apps/observability-mcp/src/index.ts`](../apps/observability-mcp/src/index.ts).

| Tool | Backed by |
|---|---|
| `get_service_health` | Gateway + workers `/readyz` |
| `get_queue_metrics` | `queue_depth_total` per queue |
| `get_circuit_breaker_state` | `groq_circuit_breaker_state{breaker}` |
| `get_active_sessions` | `active_sessions_total` |
| `get_groq_latency` | `groq_request_duration_seconds` histogram lines |

### 5.2 `remediation-mcp` (guarded write)

Mutates runtime state through three layered guards. Source: [`apps/remediation-mcp/src/index.ts`](../apps/remediation-mcp/src/index.ts).

| Tool | Mechanism | Guard | Reversible? |
|---|---|---|---|
| `pause_queue` / `resume_queue` | BullMQ admin via Redis | `zod.enum` restricts queue name to known queues | yes |
| `reset_circuit_breaker` | `POST /admin/breakers/reset` ([apps/gateway/src/routes/admin.ts](../apps/gateway/src/routes/admin.ts)) | `ADMIN_API_KEY` HTTP header | yes (breakers may re-open if upstream is still bad) |
| `flush_dead_letter_queue` | `Queue.clean('failed')` | `confirm: true` argument required | **no** |

Every invocation writes a structured `pino` audit line to **stderr** (`stdout` is reserved for the MCP transport — see [remediation-mcp/src/index.ts:21-26](../apps/remediation-mcp/src/index.ts#L21-L26)).

### 5.3 Why this matters for reliability

Without the MCP layer, recovery from an open breaker, a poisoned DLQ, or a queue that needs to be drained for maintenance requires either a Bull Board click-through, a `redis-cli` session, or a redeploy. With it, the same diagnostic and remediation primitives are exposed as a typed, audited contract that any MCP client can call — Claude Desktop, Claude Code, or a future automated runbook agent.

Concretely: when the breaker demo opens the chat breaker, the recovery sequence becomes a three-tool dialogue:
1. `observability-mcp.get_circuit_breaker_state` → confirm `chat: open`
2. (operator verifies upstream Groq is healthy)
3. `remediation-mcp.reset_circuit_breaker` → forces both breakers closed; audit line on stderr

This partially compensates for the absence of distributed tracing (ADR-004): the operator cannot follow a single span through the system, but they can interrogate live state with structured tools rather than reading raw metrics by hand.

---

## 6. SLO Targets

See `docs/slo-table.md` for the full SLO table including k6 load test targets and measured results.

Key SLOs:
- API availability ≥ 99%
- `/api/messages` p95 < 2 s at baseline (10 VUs)
- 5xx error rate < 1% at baseline

---

## 7. Trade-offs and Lessons Learned

### Node.js workers over Go microservices
Chose Node.js for velocity (shared TypeScript types, same toolchain). Trade-off: workers cannot scale independently. See ADR 001.

### BullMQ + Redis over RabbitMQ
Single Redis instance serves both rate-limiting and job queuing. Simpler infrastructure for a demo system. Trade-off: Redis is not a purpose-built broker. See ADR 002.

### Supabase over self-hosted PostgreSQL
Eliminates auth infrastructure; trade-off is external dependency making fully offline operation impossible. See ADR 003.

### prom-client over full OpenTelemetry
Faster to instrument, fewer services. Trade-off: no distributed traces across gateway→worker hops. See ADR 004.

### Stateless gateway design
Placing all shared state (rate limits, job queues) in Redis made horizontal scale-out trivial — no sticky sessions, no shared memory. The nginx-lb + Redis combination provides elasticity without code changes.

### Agentic MCP operator surface (shipped)
Originally listed as future work, now shipped as `apps/observability-mcp` and `apps/remediation-mcp`. The split between read-only and guarded-write transports is the load-bearing decision; bundling both into one server would have meant every consumer inherits the privilege of the most-privileged tool.

---

## 8. Future Work (Post-Course)

- OpenTelemetry distributed tracing (gateway ↔ workers correlation)
- Kubernetes deployment manifests (HPA for gateway)
- Redis AOF persistence enabled for production durability
- Tighten remediation-mcp auth: `pause_queue` / `resume_queue` currently rely on stdio-locality and the `zod.enum` queue allow-list; production deployment should require `ADMIN_API_KEY` for all mutating tools, not just `reset_circuit_breaker`
