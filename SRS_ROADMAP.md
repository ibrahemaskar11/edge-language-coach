# SRS Roadmap — Edge Language Coach

Plan for evolving this repo into a defensible submission for the *Scalable and Reliable Services* course at Unibo.

The current architecture (gateway + BullMQ workers + web, with Redis + managed Postgres) already satisfies the *microservices + async messaging* requirement. The gap is in deliberate **reliability engineering**, **observability**, and **scale demonstration** — which is what the course actually grades. This document is the plan to close that gap.

---

## Overview of Steps

Ordered by dependency, not by size. Earlier steps unblock later ones.

| # | Step | Effort | Why it matters for SRS |
|---|------|--------|------------------------|
| 1 | Structured logging + real health/readiness endpoints | S | Prerequisite for probes, tracing, dashboards |
| 2 | Reliability primitives: timeouts, circuit breaker on Groq, rate limiting on gateway | M | Directly addresses "fault tolerance" course content |
| 3 | Queue hardening: retries on all queues, DLQ, idempotency review | S | Makes async path survive transient failures |
| 4 | Containerize gateway + web, unify under docker-compose | S | Needed before you can scale anything |
| 5 | Observability stack: OpenTelemetry traces, Prometheus metrics, Grafana dashboards | L | Single biggest course-differentiator |
| 6 | Scale-out demonstration: multi-replica compose (or K8s) behind a reverse proxy | M | Lets you *show* horizontal scaling in the report |
| 7 | Load test with k6 + measured SLIs (p95 latency, throughput, error rate under load) | M | Converts the architecture into reported numbers |
| 8 | CI/CD pipeline (GitHub Actions) | S | Standard professional hygiene; cheap grade points |
| 9 | Architecture report + ADRs | M | Usually 40–60% of the grade |
| 10 | (Optional) Contract/integration tests for gateway routes and jobs | M | Strong addition if time permits |

**Effort key:** S = hours, M = ~1 day, L = 2–3 days.

Suggested order for a ~2-week window: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 9 (write the report alongside 5–7), then 8 and 10.

---

## Step 1 — Structured logging + real health/readiness endpoints

Everything downstream (probes, alerts, dashboards) needs this.

**Gateway** — replace the current `/health` stub with two endpoints:
- `GET /livez` — process is alive. Return 200 unconditionally.
- `GET /readyz` — dependencies are reachable. Ping Redis, Supabase, and Groq (cheap HEAD or list call); return 503 if any is down, with a JSON body naming the failing dependency.

**Workers** — add `/livez` and `/readyz` to the existing Express app in [apps/workers/src/index.ts](apps/workers/src/index.ts). `/readyz` should verify the BullMQ queue is reachable and at least one worker of each type is attached.

**Logging** — adopt a single structured-logging convention:
- Gateway: Fastify's built-in pino logger with `requestId` propagated from an `X-Request-Id` header (or generated).
- Workers: replace `console.log` in [apps/workers/src/index.ts](apps/workers/src/index.ts) and jobs with pino, correlating on `jobId` and `sessionId`.

**Also**: remove the two silent error swallowers at [apps/gateway/src/lib/queues.ts:7](apps/gateway/src/lib/queues.ts#L7) and [apps/workers/src/lib/queues.ts:8](apps/workers/src/lib/queues.ts#L8) — replace with `logger.warn({ err }, "redis error")`. Swallowing errors is directly at odds with the reliability story you want to tell.

**Acceptance**: `curl /readyz` returns 503 with a meaningful body when Redis is stopped; all logs are single-line JSON with consistent fields.

---

## Step 2 — Reliability primitives

### 2a. Timeouts + circuit breaker on Groq

Groq is your only external dependency on the request hot path (chat completions in [apps/gateway/src/routes/messages.ts](apps/gateway/src/routes/messages.ts) and Whisper in [apps/gateway/src/routes/transcribe.ts](apps/gateway/src/routes/transcribe.ts)). When Groq is slow, every gateway request piles up.

Use [`opossum`](https://github.com/nodeshift/opossum) (the de facto Node.js circuit breaker):

```ts
import CircuitBreaker from "opossum";

const groqBreaker = new CircuitBreaker(
  (args) => groq.chat.completions.create(args),
  {
    timeout: 15_000,           // fail the call after 15s
    errorThresholdPercentage: 50,
    resetTimeout: 30_000,      // half-open after 30s
    volumeThreshold: 10,       // need 10 requests before tripping
  }
);
```

Wire it in the gateway's `groq` plugin so every route uses the same breaker instance. Add a metric for `breaker.state` so Grafana can visualize open/closed transitions.

### 2b. Rate limiting on gateway

Add [`@fastify/rate-limit`](https://github.com/fastify/fastify-rate-limit) in [apps/gateway/src/server.ts](apps/gateway/src/server.ts):

```ts
await app.register(import("@fastify/rate-limit"), {
  max: 60,
  timeWindow: "1 minute",
  keyGenerator: (req) => (req as any).user?.id ?? req.ip,
});
```

Per-user by default (via the Supabase-verified JWT), falling back to IP for unauthenticated routes. Tighter limits on `/transcribe` and `/messages` (the expensive routes).

### 2c. Request timeout on Fastify

Set `connectionTimeout` and `keepAliveTimeout` explicitly — defaults are too lenient when a downstream hangs.

**Acceptance**: blocking Groq in a test (e.g. with `toxiproxy` or a mock that sleeps) causes the breaker to open after ~10 requests; gateway returns 503 fast instead of hanging. Rate-limit returns 429 under load.

---

## Step 3 — Queue hardening

Currently retries/backoff are configured only on the flashcard and summary enqueue calls in [apps/gateway/src/routes/messages.ts:10-22](apps/gateway/src/routes/messages.ts#L10-L22). The scraper queue in [apps/workers/src/index.ts:37](apps/workers/src/index.ts#L37) has nothing.

**Centralize** job options in [apps/gateway/src/lib/queues.ts](apps/gateway/src/lib/queues.ts) and its workers counterpart:

```ts
export const defaultJobOpts = {
  attempts: 5,
  backoff: { type: "exponential" as const, delay: 2000 },
  removeOnComplete: { count: 1000, age: 7 * 24 * 3600 },
  removeOnFail: { count: 5000 },  // keep failures longer for inspection
};
```

**Dead-letter handling**: BullMQ keeps failed jobs in the "failed" set; add a simple `QueueEvents` listener in the workers app that logs failures beyond the retry budget and emits a `jobs_dead_letter_total` Prometheus counter (Step 5). For now, the Bull Board UI at `/queues` is sufficient for manual inspection — but name-drop "DLQ strategy" in the report.

**Idempotency review**: write down which jobs are safe to retry. Summary and flashcard generation both re-query state on each run ([summary.job.ts:38-49](apps/workers/src/jobs/summary.job.ts#L38-L49)), so they're naturally idempotent. Scraper can create duplicate topics if not deduped — add a unique constraint or upsert by `url`.

**Acceptance**: killing a worker mid-job causes the job to be retried by another worker; a job that fails 5 times ends up in the "failed" set and emits a DLQ metric.

---

## Step 4 — Containerize everything

Right now only workers have a Dockerfile ([apps/workers/Dockerfile](apps/workers/Dockerfile)). You can't scale what isn't containerized.

**Add** multi-stage Dockerfiles at `apps/gateway/Dockerfile` and `apps/web/Dockerfile`. For the gateway, mirror the workers pattern. For the web app, build with Vite then serve the static `dist/` from `nginx:alpine`.

**Update** [docker-compose.yml](docker-compose.yml) to run all three services plus Redis locally:

```yaml
services:
  redis:    { ... }
  gateway:  { build: ./apps/gateway, ports: ["3001:3001"], depends_on: [redis] }
  workers:  { build: ./apps/workers, ports: ["3002:3002"], depends_on: [redis] }
  web:      { build: ./apps/web,     ports: ["5173:80"] }
```

**Watch out for**: pnpm workspaces in Docker need care. Easiest path is a repo-root build context with a multi-stage build that runs `pnpm deploy --filter @edge/gateway /app/out` to produce a slim image. Document this in an ADR.

**Acceptance**: `docker compose up` brings up the whole stack from clean; the web app can hit the gateway which can dispatch jobs to the workers.

---

## Step 5 — Observability stack

The single biggest course-grade lift. Three pillars: **metrics**, **traces**, **logs** (already done in Step 1).

### 5a. Metrics with Prometheus

Add [`prom-client`](https://github.com/siimon/prom-client) to gateway and workers. Expose `/metrics` on each service.

Minimum useful metrics:
- `http_request_duration_seconds{route, method, status}` — histogram (gateway)
- `groq_request_duration_seconds{operation, status}` — histogram
- `groq_circuit_breaker_state{name}` — gauge (0=closed, 1=half-open, 2=open)
- `bullmq_queue_depth{queue}` — gauge, polled from Bull
- `bullmq_job_duration_seconds{queue, status}` — histogram
- `jobs_dead_letter_total{queue}` — counter

### 5b. Traces with OpenTelemetry

Use `@opentelemetry/auto-instrumentations-node`. Auto-instrument Fastify, HTTP, ioredis, and Prisma. Manually instrument BullMQ producer→consumer by injecting trace context into job data so the trace spans the full request→queue→worker→Groq→Supabase path.

### 5c. Backend: Grafana Cloud (free tier)

Ship metrics via Prometheus remote-write and traces via OTLP to Grafana Cloud. Free tier includes ~10k series and ~50 GB of logs — plenty for a course project and no infra to run yourself.

Build three dashboards:
1. **Gateway SLIs**: RED metrics (Rate, Errors, Duration) per route, p50/p95/p99 latency.
2. **Groq dependency**: request rate, error rate, latency, breaker state.
3. **Queue health**: depth, processing rate, failures, retry distribution per queue.

**Acceptance**: all three dashboards render real data under synthetic load from Step 7; traces in Grafana Tempo show a request spanning gateway → worker → Groq as a single trace.

---

## Step 6 — Scale-out demonstration

The course wants evidence of *horizontal* scaling. Two options — pick one.

### Option A (recommended): multi-replica docker-compose + nginx

Lightest weight. Run the gateway with `deploy.replicas: 3`, put nginx in front as a round-robin load balancer. Workers can scale too — BullMQ natively supports multiple consumers on the same queue (that's the whole point).

```yaml
services:
  nginx:
    image: nginx:alpine
    ports: ["8080:80"]
    volumes: [./deploy/nginx.conf:/etc/nginx/nginx.conf:ro]
    depends_on: [gateway]
  gateway:
    build: ./apps/gateway
    deploy: { replicas: 3 }
  workers:
    build: ./apps/workers
    deploy: { replicas: 2 }
```

Stateless-ness matters: confirm gateway holds no in-memory session state (it shouldn't — auth is JWT).

### Option B: Kubernetes (kind / k3d locally, or managed for demo)

Stronger if the course specifically expects K8s. Write Deployment + Service + HorizontalPodAutoscaler manifests. Use `kind` or `k3d` for local development, and a real cluster only for the final demo (see Hosting section).

Either way, demonstrate in the report that doubling gateway replicas roughly doubles sustained throughput under the Step 7 load test (until workers or Redis become the bottleneck — which is itself a valuable finding to write up).

---

## Step 7 — Load test + measured SLIs

Use [k6](https://k6.io/). Put a script at `load/gateway.js`:

```js
import http from "k6/http";
import { check } from "k6";

export const options = {
  stages: [
    { duration: "30s", target: 20 },
    { duration: "2m",  target: 50 },
    { duration: "30s", target: 0  },
  ],
  thresholds: {
    http_req_duration: ["p(95)<1500"],
    http_req_failed:   ["rate<0.01"],
  },
};

export default function () {
  const res = http.post(`${__ENV.GATEWAY_URL}/messages`, /* ... */);
  check(res, { "status 200": (r) => r.status === 200 });
}
```

Run three scenarios and record results in the report:
1. **Baseline**: 1 gateway replica, no breaker.
2. **With reliability primitives**: 1 replica + breaker + rate-limit.
3. **Scaled out**: 3 replicas + 2 worker replicas.

Report for each: p50/p95/p99 latency, error rate, and where the bottleneck moved. This is the money shot of the project.

**Tip**: mock Groq with a local HTTP server that sleeps 500–2000 ms to keep costs sane. Note this as a test-double in the report.

---

## Step 8 — CI/CD

A `.github/workflows/ci.yml` that runs on PR:
- `pnpm install --frozen-lockfile`
- `pnpm turbo typecheck lint build`
- (Later) `pnpm turbo test`
- Build all three Docker images and push to GHCR on `main`

Cheap grade points; graders look for this.

---

## Step 9 — Architecture report + ADRs

For most Unibo SRS courses, the written deliverable is ~40–60% of the grade. Skeleton:

1. **Context & goals** — what the system does, why the architecture was chosen.
2. **Architecture diagram** — C4 model Level 2 (containers) and Level 3 (components inside gateway + workers). Use [Structurizr](https://structurizr.com) or Mermaid in Markdown.
3. **Scalability analysis** — for each service, discuss stateful vs stateless, scaling axis, expected bottleneck. Reference the k6 results from Step 7.
4. **Reliability analysis** — failure modes per dependency (Groq, Redis, Postgres): what fails, how you detect it, how you recover. Tie each to a code location (circuit breaker, retry, health check).
5. **Observability** — screenshots of Grafana dashboards, description of SLIs, a proposed SLO table (e.g. "99% of `/messages` p95 < 2 s, measured over 28 days").
6. **Trade-offs & limitations** — what you didn't do and why.

Keep ADRs short (one page each) under `docs/adr/`:
- ADR-001: Why BullMQ over Kafka/RabbitMQ
- ADR-002: Supabase as managed Postgres
- ADR-003: Circuit breaker on Groq, not on Postgres
- ADR-004: Grafana Cloud over self-hosted

---

## Step 10 — (Optional) Tests

If time permits:
- **Gateway**: route-level tests with Fastify's `inject()` method, mocking Supabase and Groq plugins.
- **Workers**: unit-test each `*.job.ts` with a mocked Supabase client; the jobs are pure functions of their inputs.
- **Contract**: Zod schemas in [packages/shared](packages/shared/src/schemas.ts) already serve as a contract — add a tiny test that asserts the gateway's response shape parses against the schema the web app imports.

Not required, but strong signal of engineering maturity.

---

## Hosting

Pick **one** deployable set; don't try to multi-cloud for a course.

### Recommended: Fly.io + Grafana Cloud + Upstash

| Component | Host | Rationale |
|-----------|------|-----------|
| Gateway | **Fly.io** (Node.js, `fly scale count 3`) | Free allowance covers a small app; native replica scaling with one command, easy to demo in the report |
| Workers | **Fly.io** | Same platform, stays on Fly's internal network with Redis |
| Web | **Vercel** or **Cloudflare Pages** | Free tier, global edge, zero config for Vite builds |
| Redis | **Upstash Redis** (serverless) | Free tier; TLS + global replication; one connection string |
| Postgres + Auth + Storage | **Supabase** (already in use) | Already configured; free tier covers demo load |
| LLM + Whisper | **Groq** (already in use) | No change |
| Metrics + Traces + Logs | **Grafana Cloud** (free tier) | Prometheus + Tempo + Loki bundled; no infra to run |

This stack is entirely free-tier-able for a course demo, has no vendor that forces a credit card for small usage, and each component has a public dashboard you can screenshot for the report.

### Alternative: one-cloud on DigitalOcean App Platform or Render

If you want everything on one provider:
- **Render**: supports Docker services, managed Redis, PostgreSQL, free static sites. Simpler UX than Fly; slightly less control over scaling.
- **DigitalOcean App Platform** + Managed Redis + Managed Postgres: cleanest for a K8s-like feel without running K8s; ~$12/month minimum.

### If the course requires Kubernetes

- **Local dev + demo**: `kind` or `k3d` — a single-binary local cluster. Sufficient for the final presentation if you record a video.
- **Managed cluster for real demo**: **DigitalOcean Kubernetes** (cheapest entry), or **GKE Autopilot** (pay-per-pod, no node management). Both have free credits for new accounts.
- Ship manifests under `deploy/k8s/` and a Helm chart or Kustomize overlay for `dev` vs `prod`.

### Observability hosting details

- Grafana Cloud free tier: 10k metrics series, 50 GB logs, 50 GB traces — more than enough.
- Alternative if you want self-hosted: `docker-compose.obs.yml` running Prometheus + Grafana + Tempo + Loki — good for local dev, overkill for production demo.

---

## Suggested execution order for a 2-week window

- **Days 1–2**: Steps 1, 3 (logging, health, queue hardening)
- **Days 3–4**: Step 2 (reliability primitives)
- **Day 5**: Step 4 (containerize everything)
- **Days 6–8**: Step 5 (observability — the long one)
- **Days 9–10**: Step 6 (scale out), Step 7 (load test, collect numbers)
- **Day 11**: Step 8 (CI/CD)
- **Days 12–14**: Step 9 (report + ADRs), polish

Step 10 slots in wherever time permits.
