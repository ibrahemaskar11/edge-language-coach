# Edge Language Coach — Architecture Report

## 1. System Overview

Edge Language Coach is an Italian language learning app. It uses LLM-driven conversation practice, spaced-repetition flashcards and automated topic curation to help learners improve fluency.

The system is a distributed, event-driven architecture with three independently deployable runtime units:

| Unit | Technology | Role |
|------|-----------|------|
| Web | React 19 + Vite served by nginx | SPA, static build |
| Gateway | Fastify (Node.js 22) | REST API, auth, reliability primitives |
| Workers | Node.js + BullMQ | Async jobs (scraper, summary, flashcards) |

Full C4 diagrams are in [docs/c4-diagram.md](./c4-diagram.md).

---

## 2. Reliability Mechanisms

### 2.1 Circuit breaker (Groq API)

The gateway wraps every Groq call (chat completions, Whisper transcription) in an `opossum` circuit breaker. The chat breaker opens after a 50 percent error rate over a rolling 60 s window (minimum 10 requests) and resets after 30 s. The transcribe breaker has the same thresholds but a 60 s timeout (audio inference is slower).

When a breaker is open, requests fail immediately instead of blocking the event loop on a stalled upstream. Breaker state is exposed as a Prometheus gauge (`groq_circuit_breaker_state`) and visible in the Grafana dashboard.

**Measured behaviour.** We exercised the breaker with a mock Groq server ([mocks/groq-mock.mjs](../mocks/groq-mock.mjs)) in slow mode (30 s sleep per request, exceeding the 15 s breaker timeout) and a driver script ([mocks/breaker-driver.mjs](../mocks/breaker-driver.mjs)) firing 60 requests at concurrency 12. Full output at [load/breaker-demo-output.txt](../load/breaker-demo-output.txt).

| Phase | Calls | Per-call latency | Status |
|---|---|---|---|
| Closed (probing) | 1 to 7 | 15.3 s (timeout) | breaker collecting failure samples |
| Transition | call 7 | | volumeThreshold (10) plus 50 percent error rate crossed, breaker opens |
| Open (short-circuit) | 8 to 60 | 12 to 58 ms | requests fail fast, never reach mock |

Adjacent-call latency cliff: 15,300 ms to 25 ms. Without the breaker all 60 requests would have queued against the slow upstream and paid the 15 s timeout each. With it, only 7 calls paid that cost.

### 2.2 Rate limiting, retries and idempotency

- **Rate limit.** 60 requests/minute per authenticated user (per IP for unauthenticated traffic), backed by Redis so the limit is shared across gateway replicas. Health probes are allowlisted.
- **Retries.** BullMQ workers use `attempts: 3, backoff: { type: 'exponential', delay: 5000 }`. Failed jobs after the retry budget are logged at `error` level with `dlq: true` and visible in Bull Board at `:3002/queues`.
- **Idempotency.** The scraper sets `scraper:slot:<date>:<6h-window>` in Redis on success (TTL 6 h). A retry inside the same window is a no-op. Title-level deduplication against the last 30 days of topics is a second layer.

### 2.3 Timeouts

Gateway 30 s connection, 5 s keep-alive. Groq chat 15 s, transcribe 60 s. Health probe 2 s per dependency (Redis, Supabase, Groq).

### 2.4 Recovery Time Objectives

Derived from the configured timeouts and retry policies, not measured separately.

| Failure mode | Total RTO |
|---|---|
| Groq slowdown or outage | about 90 s (breaker opens within one 60 s window, then 30 s resetTimeout, then 2 s `/readyz` propagation) |
| Redis blip | about 20 s |
| Gateway replica crash | sub-second (nginx-lb round-robins to a healthy replica) |
| Worker job failure | about 20 s before DLQ visibility |
| Scraper duplicate replay | about 1 s |

The Groq RTO dominates because it covers the user-facing chat path.

### 2.5 Integration tests

The reliability claims above are pinned in CI. The gateway has a Vitest suite ([apps/gateway/src/__tests__/health.test.ts](../apps/gateway/src/__tests__/health.test.ts)) using Fastify's `inject()` harness, with Redis, Supabase and Groq mocked at module boundaries so tests run hermetically. Currently covered: `/livez` 200, `/readyz` 200 when healthy, `/readyz` 503 with the failing dep named when Redis or Groq go down.

CI ([.github/workflows/ci.yml](../.github/workflows/ci.yml)) runs `pnpm turbo test` ahead of typecheck and build on every push and PR. Breaker, rate-limit and queue-retry tests are the natural next additions.

---

## 3. Scalability

### 3.1 Horizontal gateway scale-out

The gateway is stateless. Session state lives in Supabase, rate-limit counters live in Redis. Scaling is one flag:

```bash
docker compose up --scale gateway=3
```

`nginx-lb` sits in front and round-robins via Docker's built-in DNS. The web SPA and Prometheus both target `nginx-lb:3001`, so adding replicas needs no client-side or scrape-config change.

### 3.2 Measured behaviour

The k6 script at `load/gateway.js` runs three scenarios back to back: baseline (10 VUs for 30 s), stressed (ramp 0 to 50 VUs over 60 s) and scaled_out (50 VUs for 30 s). We ran it twice, once with one gateway replica and once with three, keeping everything else fixed.

| Metric | 1 replica | 3 replicas | Δ |
|---|---|---|---|
| `gateway_errors` rate | 6.81 % | 0.27 % | −96 % |
| `scaled_out` p95 latency | 2.43 s | 2.15 s | −12 % |
| `stressed` p95 latency | 1.73 s | 1.84 s | +6 % |
| `baseline` p95 latency | 0.34 s | 0.66 s | +93 % (cold-start noise, see Section 3.3) |
| Sustained throughput | 39.3 req/s | 39.4 req/s | unchanged |

Adding replicas had a dramatic effect on error rate (the 1-replica gateway dropped about 7 percent of requests under saturation, the 3-replica setup dropped under 0.3 percent) and a modest effect on latency. The gateway is the bottleneck for availability, the downstream hot path (Supabase RTT, Redis round-trips) is the bottleneck for latency, so adding gateway replicas does not help with the latter.

The persistent ~25 percent `http_req_failed` rate seen in both runs is the rate limiter doing its job. 50 VUs at ~10 req/s is roughly 500 req/min, well over the 60 req/min cap, so most failures are 429s.

### 3.3 Threats to validity

- **Co-located load generator.** k6 ran on the same Windows host as Docker Desktop, competing for CPU. Most visible in the unexpected `baseline` regression on the 3-replica run.
- **Mocked Groq.** All Groq calls returned in under 1 ms via the mock. Deliberate (isolates the gateway and queue layer) but means absolute p95 numbers are not production estimates.
- **Single iteration per configuration.** No statistical variance.

### 3.4 Worker concurrency

Workers scale horizontally too. BullMQ supports multiple consumers on the same queue and guarantees each job is processed exactly once. Per-queue concurrency: 3 for `flashcard-generate` and `summary-generate` (limited by Groq rate limits), 1 for `topic-scrape` (serial to avoid race conditions on dedup state).

### 3.5 Production deployment

Production splits the system across two hosts. The gateway, workers, Redis and `nginx-lb` run on a single Oracle Cloud VM via [docker-compose.prod.yml](../docker-compose.prod.yml), pulling multi-arch (`linux/amd64` and `linux/arm64`) images from GHCR. The React SPA runs on Vercel.

Three GitHub Actions workflows handle the pipeline, separated by path filter so a docs-only or web-only change skips the backend rebuild:

| Workflow | Trigger | Result |
|---|---|---|
| [ci.yml](../.github/workflows/ci.yml) | every push and PR | `pnpm turbo test` plus typecheck plus build. No deploy. |
| [deploy.yml](../.github/workflows/deploy.yml) | push to `main`, paths-ignore web/docs/markdown | tests, then `docker buildx` multi-arch push to GHCR, then SSH deploy to Oracle |
| [deploy-web.yml](../.github/workflows/deploy-web.yml) | push to `main`, paths web/packages/vercel.json | tests, then `npx vercel --prod` |

The Oracle deploy step does `git reset --hard origin/main`, `docker compose pull && up -d`, then **explicitly restarts `nginx-lb`** so it re-resolves the new gateway container. Docker's embedded DNS otherwise caches the old IP and the load balancer keeps trying to reach a container that no longer exists.

The Vercel build is driven by [vercel.json](../vercel.json), which rewrites `/api/:path*` to the Oracle backend, so the browser only ever talks to the Vercel origin. No CORS at the gateway. The prod compose omits Prometheus, Grafana and Bull Board (they remain in `docker-compose.yml` for the local observability story) and the SPA (Vercel handles that).

---

## 4. Observability

All services emit JSON-structured logs via `pino` with `service`, `requestId` and relevant domain fields (`sessionId`, `jobId`, `queue`). Log level is configurable via `LOG_LEVEL`.

Both the gateway and the workers expose `/metrics` in Prometheus text format, scraped every 15 s. Key metrics:

| Metric | Type | Labels |
|---|---|---|
| `http_request_duration_seconds` | Histogram | method, route, status_code |
| `groq_request_duration_seconds` | Histogram | operation, status |
| `groq_circuit_breaker_state` | Gauge | breaker |
| `bullmq_job_duration_seconds` | Histogram | queue, status |
| `jobs_dead_letter_total` | Counter | queue |
| `queue_depth_total` | Gauge | queue |
| `active_sessions_total` | Gauge | |

Node defaults (event-loop lag, GC, RSS) are collected via `collectDefaultMetrics`. A Grafana dashboard provisioned from `docker/grafana/dashboards/edge-coach.json` is auto-loaded on startup.

Two health probes back container orchestration. `GET /livez` always returns 200. `GET /readyz` pings Redis, Supabase and Groq with 2 s timeouts and returns 503 with the failing dependency named in the body.

---

## 5. Operator Surface — Agentic MCP

Two [Model Context Protocol](https://modelcontextprotocol.io) servers expose the running system to agent-driven inspection and remediation, without SSH, kubectl or a redeploy. The loop is: detect (Prometheus, Grafana) then diagnose (`observability-mcp`) then remediate (`remediation-mcp`).

The two servers are split by privilege.

### 5.1 `observability-mcp` (read only)

Wraps `/metrics` and `/readyz` as six typed tools. No mutation, no auth needed (stdio, locally scoped). Source: [apps/observability-mcp/src/index.ts](../apps/observability-mcp/src/index.ts).

| Tool | Backed by |
|---|---|
| `get_service_health` | gateway and workers `/readyz` |
| `get_queue_metrics` | `queue_depth_total` per queue |
| `get_circuit_breaker_state` | `groq_circuit_breaker_state{breaker}` |
| `get_active_sessions` | `active_sessions_total` |
| `get_groq_latency` | `groq_request_duration_seconds` histogram lines |
| `get_safety_policy` | returns `docs/safety-policy.md` so the agent self-binds at session start |

### 5.2 `remediation-mcp` (guarded write)

Mutates runtime state through three layered guards (typed input, secret, irreversibility check). Source: [apps/remediation-mcp/src/index.ts](../apps/remediation-mcp/src/index.ts).

| Tool | Mechanism | Guard | Reversible |
|---|---|---|---|
| `pause_queue` / `resume_queue` | BullMQ admin via Redis | `zod.enum` restricts queue name | yes |
| `reset_circuit_breaker` | `POST /admin/breakers/reset` | `ADMIN_API_KEY` header | yes (may re-open if upstream is still bad) |
| `flush_dead_letter_queue` | `Queue.clean('failed')` | `confirm: true` argument required | no |

Every call writes a structured pino audit line to stderr (stdout is reserved for the MCP transport).

### 5.3 Capability classification

Every capability the agent can touch falls into deterministic, agentic or human in the loop. The line is not impact magnitude, it is whether the decision needs interpretation across heterogeneous signals.

| Capability | Class | Approval |
|---|---|---|
| Breaker trip, BullMQ retry, rate limiter, scraper idempotency | Deterministic | None (threshold based) |
| `get_service_health` plus `get_groq_latency` synthesis | Agentic (advisory) | None (read only) |
| `pause_queue` / `resume_queue` during a drain | Agentic (bounded) | None (reversible, typed enum) |
| `reset_circuit_breaker` | Human in the loop | Holder of `ADMIN_API_KEY` |
| `flush_dead_letter_queue` | Human in the loop | Explicit `confirm: true` from a human |
| Infrastructure scaling | Operator only | Out of agent scope |

Full classification, hallucination controls, economic guardrails and rollback rules are in [docs/safety-policy.md](./safety-policy.md). The same numbers are derived in [docs/cost-roi.md](./cost-roi.md). At session start the agent calls `observability-mcp.get_safety_policy` and self-binds before any remediation.

### 5.4 Why this matters for reliability

Without the MCP layer, recovering from an open breaker or a poisoned DLQ needs a Bull Board click-through, a `redis-cli` session or a redeploy. With it, the same primitives are exposed as a typed, audited contract any MCP client can call.

When the breaker demo opens the chat breaker, the recovery is a three-tool dialogue: `get_circuit_breaker_state` to confirm open, verify Groq is healthy, then `reset_circuit_breaker` to close. This partially compensates for the absence of distributed tracing (ADR 004). The operator cannot follow a single span through the system but can interrogate live state with structured tools.

---

## 6. SLO Targets

Full SLO table including k6 load test targets and measured results is in [docs/slo-table.md](./slo-table.md). Headlines: API availability at least 99 percent, `/api/messages` p95 under 2 s at baseline (10 VUs), 5xx rate under 1 percent at baseline.

---

## 7. Trade-offs

Full reasoning is in the ADRs in [docs/adr](./adr/).

- **Node.js workers over Go microservices.** Shared TypeScript types, same toolchain, faster iteration. Workers cannot scale independently (ADR 001).
- **BullMQ on Redis over RabbitMQ.** One Redis instance does both queueing and rate limiting. Redis is not a purpose-built broker (ADR 002).
- **Supabase over self-hosted Postgres.** Saved weeks on auth. External dependency, cannot run fully offline (ADR 003).
- **prom-client only over full OpenTelemetry.** Faster to instrument, fewer services. No cross-service tracing (ADR 004).
- **Stateless gateway.** All shared state in Redis. Horizontal scale-out is one flag.
- **MCP operator surface shipped.** The split between read-only and guarded-write servers is the load-bearing decision. Bundling both into one would have meant every consumer inherits the privilege of the most-privileged tool.

---

## 8. Future Work

- OpenTelemetry distributed tracing (gateway to workers correlation through the BullMQ payload).
- Kubernetes manifests with HPA on `queue_depth_total` and `http_request_duration_seconds`.
- Redis AOF persistence enabled for production durability.
- Tighten `remediation-mcp` auth so `pause_queue` and `resume_queue` also require `ADMIN_API_KEY`, not just `reset_circuit_breaker`.
- Statistical load testing with multiple iterations per configuration on a dedicated load-generation host.
