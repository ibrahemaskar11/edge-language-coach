# ADR 004 — prom-client over Full OpenTelemetry Stack

**Date:** 2026-04-30  
**Status:** Accepted

## Context

Step 5 of the SRS roadmap requires observable metrics and dashboards. Two approaches were considered: (a) full OpenTelemetry (traces + metrics + logs) with an OTel Collector, or (b) prom-client (Prometheus metrics only) with Grafana.

## Decision

Use `prom-client` to expose Prometheus-format metrics at `/metrics`. Pair with a self-hosted Prometheus + Grafana stack in Docker Compose. Defer distributed tracing (OpenTelemetry spans) as an optional future enhancement.

## Consequences

**Positive:**
- **Low dependency count**: `prom-client` is a single npm package with no native dependencies. No OTel Collector sidecar, no OTLP endpoint, no Jaeger/Tempo/Zipkin.
- **Grafana compatibility**: prom-client metrics are consumed directly by Prometheus, which Grafana queries natively. The full metrics pipeline (scrape → store → visualize) fits in four docker-compose services (gateway, prometheus, grafana, nginx-lb).
- **Sufficient for SLO verification**: Histogram buckets provide p50/p95/p99 latency measurements; counters track error rates and request volume — the SLIs needed to evaluate the SLO table.
- **Fast to instrument**: Adding a histogram observe call to Fastify's `onResponse` hook takes ~10 lines of code.

**Negative:**
- **No distributed traces**: Request spans cannot be correlated across gateway → worker hops. A slow summary job cannot be pinpointed to a specific Groq call without adding OTel later.
- **Pull-based scraping**: Prometheus scrapes `/metrics` every 15 seconds; resolution is coarser than push-based OTel. Acceptable for the course demo.
- **Metrics only on gateway**: Workers do not expose a `/metrics` endpoint. Queue depth is proxied through the gateway's metrics, which adds a query-per-scrape overhead.
