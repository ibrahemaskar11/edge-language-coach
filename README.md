# Edge Language Coach

A language learning platform built as a monorepo with a React frontend, Fastify API gateway, BullMQ async workers backed by Redis and Supabase, and an agentic MCP operations layer.

## Architecture

```
apps/
  web/                 # React 19 + Vite + TanStack Router (frontend)
  gateway/             # Fastify REST API (port 3001)
  workers/             # BullMQ job processors (port 3002)
  observability-mcp/   # Read-only MCP server — health, queue, breaker, latency
  remediation-mcp/     # Guarded MCP server — pause/resume queue, reset breaker, flush DLQ
packages/
  db/                  # Prisma client + schema
  shared/              # Shared types and utilities
```

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [pnpm](https://pnpm.io/) v10.18.3
- [Docker](https://www.docker.com/) (for Redis)
- A [Supabase](https://supabase.com/) project
- A [Groq](https://console.groq.com/) API key

## Installation

**1. Clone the repository**

```bash
git clone git@github.com:ibrahemaskar11/edge-language-coach.git
cd edge-language-coach
```

**2. Install dependencies**

```bash
pnpm install
```

**3. Set up environment variables**

```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `SUPABASE_JWT_SECRET` | Supabase JWT secret |
| `DATABASE_URL` | Postgres connection string from Supabase |
| `DIRECT_URL` | Same as `DATABASE_URL` for Prisma direct connections |
| `VITE_SUPABASE_URL` | Same as `SUPABASE_URL`, exposed to the frontend |
| `VITE_SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY`, exposed to the frontend |
| `GROQ_API_KEY` | Groq API key for LLM inference |
| `PORT` | Gateway port (default: `3001`) |
| `GROQ_BASE_URL` | *Optional.* Override Groq SDK base URL (used by the circuit-breaker demo). Leave commented out for normal operation |
| `DEMO_MODE` | *Optional.* Set to `1` to expose `/api/breaker-demo/chat` (no auth, no rate-limit). Demo only — not for production |
| `ADMIN_API_KEY` | Secret for `POST /admin/breakers/reset`, used by `remediation-mcp` to force-close the Groq breakers. Generate with `openssl rand -hex 32` |
| `GATEWAY_URL` / `WORKERS_URL` | *Optional.* Override targets for the MCP servers (default `http://localhost:3001` / `:3002`) |

**4. Push the database schema**

```bash
pnpm db:push
```

**5. (Optional) Seed the database**

```bash
pnpm db:seed
```

## Running in Development

Start Redis via Docker and all apps in watch mode with a single command:

```bash
pnpm dev
```

This starts:
- Redis on `localhost:6379`
- Gateway on `http://localhost:3001`
- Workers on `http://localhost:3002` (Bull Board UI at `/queues`)
- Web app on `http://localhost:5173`

If you only want Redis up (and prefer to run apps individually):

```bash
docker compose up -d redis
pnpm --filter @edge/gateway dev
pnpm --filter @edge/workers dev
pnpm --filter @edge/web dev
```

## Running the full stack with Docker Compose

`docker-compose.yml` brings up Redis, workers, gateway (behind nginx-lb), web, Prometheus, and Grafana:

```bash
docker compose up -d
```

| Service | URL | Notes |
|---|---|---|
| Web app | http://localhost | Static build served by nginx |
| Gateway | http://localhost:3001 | Behind nginx-lb (round-robin across replicas) |
| Workers / Bull Board | http://localhost:3002/queues | Queue inspection UI |
| Prometheus | http://localhost:9090 | Scrapes gateway + workers `/metrics` |
| Grafana | http://localhost:3000 | Default login: `admin` / `admin`. Edge Coach dashboard auto-loaded |

### Horizontal scale-out demo

Spin up multiple gateway replicas behind nginx — used for the load-test scenarios:

```bash
docker compose up -d --scale gateway=3
```

Workers can be scaled the same way (`--scale workers=2`) — BullMQ natively supports multiple consumers on each queue.

### Health and observability endpoints

| Endpoint | Service | Purpose |
|---|---|---|
| `GET /livez` | gateway, workers | Process is alive |
| `GET /readyz` | gateway, workers | Dependencies (Redis, Supabase, Groq) reachable |
| `GET /metrics` | gateway, workers | Prometheus scrape target |

## Load testing

A k6 script with three scenarios (baseline, stressed, scaled-out) lives at [`load/gateway.js`](load/gateway.js):

```bash
k6 run -e GATEWAY_URL=http://localhost:3001 load/gateway.js
```

To get clean p50/p95/p99 + error-rate numbers per scenario from the JSON output, pipe the result through [`load/parse-results.js`](load/parse-results.js):

```bash
k6 run --out json=load/results-baseline.json -e GATEWAY_URL=http://localhost:3001 load/gateway.js
node load/parse-results.js   # reads results-baseline.json / results-stressed.json / results-scaled.json
```

## Testing

The gateway has integration tests using [Vitest](https://vitest.dev) and Fastify's `inject()` test harness — Redis, Supabase, and Groq are mocked, so tests run hermetically without needing the stack up.

```bash
pnpm turbo test                  # run every workspace's `test` script
pnpm --filter @edge/gateway test # gateway only
```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs `pnpm turbo test` ahead of typecheck and build on every push and pull request, so a regression that breaks `/livez`, `/readyz`, or the dependency-failure paths fails the build.

Currently covered: liveness/readiness probes including the Redis-down and Groq-down failure paths ([`apps/gateway/src/__tests__/health.test.ts`](apps/gateway/src/__tests__/health.test.ts)). Breaker, rate-limit, and queue-retry tests are the natural next additions.

## Circuit breaker demo (mock Groq)

A controllable mock Groq server at [`mocks/groq-mock.mjs`](mocks/groq-mock.mjs) lets you trigger the circuit breaker live without real API calls. Useful for course demos and screen recordings.

**1. Start the mock and point the gateway at it**

```bash
# terminal 1 — mock on :8080
pnpm mock:groq

# .env — add this line and restart the gateway
GROQ_BASE_URL=http://localhost:8080
```

**2. Toggle modes on demand**

```bash
# normal (fast 200 responses) — default
curl -X POST http://localhost:8080/admin/mode \
  -H "content-type: application/json" \
  -d '{"mode":"normal"}'

# slow (sleep 30s — exceeds the 15s breaker timeout)
curl -X POST http://localhost:8080/admin/mode \
  -H "content-type: application/json" \
  -d '{"mode":"slow"}'

# error (immediate HTTP 500)
curl -X POST http://localhost:8080/admin/mode \
  -H "content-type: application/json" \
  -d '{"mode":"error"}'
```

**3. Drive traffic with the breaker driver**

The k6 script at [`load/gateway.js`](load/gateway.js) only hits unauthenticated routes (`/livez`, `/readyz`, `/metrics`, `/api/topics`) — none of which call Groq. To trip the breaker you need traffic on a route that actually invokes `groqChat()`. Use the bundled driver instead:

```cmd
:: terminal 1 — start the mock (defaults to normal mode)
pnpm mock:groq

:: terminal 2 — point the gateway at the mock and enable the demo endpoint
:: (in .env)
::   GROQ_BASE_URL=http://host.docker.internal:8080
::   DEMO_MODE=1
docker compose up -d --force-recreate gateway

:: terminal 3 — switch mock to slow mode (note Windows quote escaping)
curl -X POST http://localhost:8080/admin/mode -H "content-type: application/json" -d "{\"mode\":\"slow\"}"

:: terminal 4 — drive 60 requests at 250 ms intervals
node mocks/breaker-driver.mjs
```

You'll see the breaker state column transition `closed` → `open` after ~10–15 requests (the `volumeThreshold` in [groq.ts](apps/gateway/src/plugins/groq.ts)). At the same time `groq_circuit_breaker_state{breaker="chat"}` flips to `1` in Grafana.

**4. Reset (during the demo)**

Switch the mock back to `normal`; after 30s (`resetTimeout`) the breaker goes half-open and a successful probe closes it.

```cmd
curl -X POST http://localhost:8080/admin/mode -H "content-type: application/json" -d "{\"mode\":\"normal\"}"
```

**5. Return to normal operation (after the demo)**

> **Important:** while `GROQ_BASE_URL` and `DEMO_MODE` are active, **all real app traffic** also routes through the mock — chat messages and `/api/transcribe` will fail. Comment both lines back out in `.env` once you're done, then rebuild the gateway so the new env is picked up:

```cmd
:: edit .env — comment out the demo lines
:: # GROQ_BASE_URL=...
:: # DEMO_MODE=1

docker compose up -d --build gateway
```

`--build` (not just `--force-recreate`) is required because the gateway image bakes the source at build time — recreating without rebuilding will keep using the previous image.

## Operator surface — MCP servers

Two [Model Context Protocol](https://modelcontextprotocol.io) servers expose the running system to agent-driven inspection and remediation. They speak the MCP stdio transport, so any MCP client (Claude Desktop, Claude Code, etc.) can connect.

### `observability-mcp` — read-only

Wraps the Prometheus `/metrics` and `/readyz` endpoints with five typed tools:

| Tool | Returns |
|---|---|
| `get_service_health` | `/readyz` body for gateway and workers |
| `get_queue_metrics` | Waiting job counts per BullMQ queue |
| `get_circuit_breaker_state` | Groq breaker state for `chat` and `transcribe` (closed / open / half-open) |
| `get_active_sessions` | Current count of `status=coaching` sessions |
| `get_groq_latency` | Raw `groq_request_duration_seconds` histogram lines |

### `remediation-mcp` — guarded write

Mutates runtime state with three layers of guard (typed enum, admin key, irreversibility confirm):

| Tool | Mechanism | Guard |
|---|---|---|
| `pause_queue` / `resume_queue` | BullMQ queue admin via Redis | Queue name restricted to `flashcard-generate \| summary-generate` (zod enum) |
| `reset_circuit_breaker` | `POST /admin/breakers/reset` | Requires `ADMIN_API_KEY` HTTP header |
| `flush_dead_letter_queue` | `Queue.clean('failed')` | Requires `confirm: true` argument (irreversible) |

Every invocation writes a structured `pino` audit line to **stderr** (`stdout` is reserved for the MCP transport). See [apps/remediation-mcp/src/index.ts:24-26](apps/remediation-mcp/src/index.ts#L24-L26).

### Running the servers

```bash
# in dev (watches and restarts on edit)
pnpm --filter @edge/observability-mcp dev
pnpm --filter @edge/remediation-mcp dev

# or as compiled binaries
pnpm --filter @edge/observability-mcp build && pnpm --filter @edge/observability-mcp start
pnpm --filter @edge/remediation-mcp build  && pnpm --filter @edge/remediation-mcp  start
```

**For Claude Code in this repo:** the project ships [`.claude/mcp.json`](.claude/mcp.json) which auto-registers both servers (and a Supabase MCP) — just `pnpm --filter @edge/observability-mcp build && pnpm --filter @edge/remediation-mcp build` once and Claude Code picks them up.

**For Claude Desktop or another client**, drop into the client's MCP config (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "edge-observability": {
      "command": "node",
      "args": ["d:/hassan-work/repos/edge-language-coach/apps/observability-mcp/dist/index.js"]
    },
    "edge-remediation": {
      "command": "node",
      "args": ["d:/hassan-work/repos/edge-language-coach/apps/remediation-mcp/dist/index.js"]
    }
  }
}
```

(Both servers read `ADMIN_API_KEY`, `GATEWAY_URL`, `WORKERS_URL` from the project `.env` via dotenv, so no `env` block is needed in the MCP config.)

### How it closes the operator loop

`detect` (Grafana / Prometheus alert) → `diagnose` (`observability-mcp.get_circuit_breaker_state` + `get_groq_latency`) → `remediate` (`remediation-mcp.reset_circuit_breaker` once Groq is healthy, or `pause_queue` to drain a poisoned worker) → audit trail in stderr.

## Building for Production

```bash
pnpm build
```

## Production deployment (Oracle Cloud)

Production runs on a single Oracle Cloud VM via [`docker-compose.prod.yml`](docker-compose.prod.yml). The compose file pulls multi-arch (`linux/amd64` + `linux/arm64`) images from GHCR rather than building locally, so the host doesn't need the source tree present at build time.

The full pipeline is in [`.github/workflows/ci.yml`](.github/workflows/ci.yml):

1. **`typecheck-build`** — install deps, generate Prisma client, run `pnpm turbo test`, then typecheck and build every workspace.
2. **`docker`** (only on `push` to `main`) — build and push multi-arch images for `gateway` and `workers` to GHCR using `docker/build-push-action`. Cached via GHA cache for fast incremental builds.
3. **`deploy`** (only on `push` to `main`) — SSH into the Oracle host, `git pull`, `docker login ghcr.io`, `docker compose -f docker-compose.prod.yml pull && up -d --remove-orphans`, then prune dangling images.

Required GitHub secrets:

| Secret | Purpose |
|---|---|
| `ORACLE_HOST` | Public IP / DNS of the Oracle VM |
| `ORACLE_SSH_KEY` | Private key for the `ubuntu` user |
| `GHCR_READ_TOKEN` | PAT with `read:packages` scope, used by the host to pull from GHCR |

Required env on the host (in a `.env` next to `docker-compose.prod.yml`): `GHCR_REPO`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, `GROQ_API_KEY`. Optional: `GROQ_BASE_URL`, `DEMO_MODE`.

The prod compose file deliberately omits Prometheus, Grafana, Bull Board UI, and the web frontend (the SPA is served from a separate Cloudflare Pages / Vercel deploy). Web app + observability stack remain in the dev `docker-compose.yml`.

## Building the architecture report PDF

Two flavours are available:

| Command | Output | Contents |
|---|---|---|
| `pnpm docs:pdf:short` | `docs/edge-language-coach-report-short.pdf` | Single ~5-page self-contained report ([docs/report.md](docs/report.md)). Recommended for submission |
| `pnpm docs:pdf` | `docs/edge-language-coach-report.pdf` | Full bundle: long architecture report + C4 diagrams + SLO table + 4 ADRs |

Prerequisites (one-time install on Windows):
```powershell
winget install JohnMacFarlane.Pandoc
winget install MiKTeX.MiKTeX
```

The first compile after installing MiKTeX may take a minute while it auto-fetches the LaTeX packages it needs.

## Troubleshooting

**`pnpm: not found` during Docker build**
The Dockerfiles install pnpm via `npm install -g pnpm@10.18.3` and verify it with `pnpm --version`. If you see this error, you're hitting a stale BuildKit cache. Wipe and rebuild:
```bash
docker builder prune -af
docker compose build --no-cache --progress=plain
```

**`No such image: redis:7-alpine`**
A previous `docker system prune` removed it. Pull explicitly or let compose do it:
```bash
docker compose up -d --pull missing
```

**Slow `exporting layers` step on Windows**
Normal — Docker Desktop on Windows is bottlenecked by the shared Linux VM filesystem when committing the workers image (~500 MB of node_modules). Wait it out; don't Ctrl-C.

**Gateway in restart loop after editing source code**
You probably ran `docker compose up -d --force-recreate gateway` instead of `--build`. The gateway Dockerfile copies source at build time, so a recreate without rebuild reuses the old code. Force a fresh build:
```bash
docker compose up -d --build gateway
```
If `--build` alone doesn't pick up the change (BuildKit can serve a stale cached layer), use `--no-cache`:
```bash
docker compose build --no-cache gateway && docker compose up -d gateway
```

**`502 Bad Gateway` from `/api/transcribe` or `/api/messages`**
Check whether `GROQ_BASE_URL` or `DEMO_MODE` is uncommented in `.env`. If yes, real app traffic is being routed through the mock Groq server — comment both out and rebuild the gateway (see above).

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, TailwindCSS v4, TanStack Router/Query |
| API Gateway | Fastify 5, Zod, JWT |
| Workers | BullMQ, Bull Board |
| Database | Supabase (Postgres), Prisma |
| Cache / Queue | Redis 7 |
| AI Inference | Groq SDK |
| Operator Surface | `@modelcontextprotocol/sdk` (stdio transport) |
| Monorepo | Turborepo, pnpm workspaces |
