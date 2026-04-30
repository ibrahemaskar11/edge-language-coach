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

---

## 3. Scalability

### 3.1 Horizontal Gateway Scale-out

The gateway is stateless (all session state is in Supabase; all rate-limit counters are in Redis). It can be scaled horizontally with:

```bash
docker compose up --scale gateway=2
```

An nginx load balancer (`nginx-lb`) sits in front of all gateway replicas and distributes traffic via Docker's built-in DNS round-robin. The web SPA and Prometheus both target `nginx-lb:3001`.

### 3.2 Worker Concurrency

Workers are not horizontally scaled (they share Redis queues, and BullMQ ensures each job is processed exactly once). Per-queue concurrency is configured independently:

| Queue | Concurrency | Rationale |
|-------|-------------|-----------|
| `flashcard-generate` | 3 | Parallelism limited by Groq rate limits |
| `summary-generate` | 3 | Same |
| `topic-scrape` | 1 | Scraper is serial to avoid race conditions on dedup state |

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

## 5. SLO Targets

See `docs/slo-table.md` for the full SLO table including k6 load test targets and measured results.

Key SLOs:
- API availability ≥ 99%
- `/api/messages` p95 < 2 s at baseline (10 VUs)
- 5xx error rate < 1% at baseline

---

## 6. Trade-offs and Lessons Learned

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

---

## 7. Future Work (Post-Course)

- OpenTelemetry distributed tracing (gateway ↔ workers correlation)
- Agentic MCP operations layer: `observability-mcp` (read-only) + `remediation-mcp` (guarded write)
- Kubernetes deployment manifests (HPA for gateway)
- Redis AOF persistence enabled for production durability
