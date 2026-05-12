# ADR 004 — prom-client over Full OpenTelemetry Stack

**Date:** 2026-04-30
**Status:** Accepted

## Context

The observability step required metrics and dashboards. Two approaches: a full OpenTelemetry stack (traces plus metrics plus logs through an OTel Collector) or `prom-client` (Prometheus metrics only) with Grafana.

## Decision

Use `prom-client` to expose Prometheus-format metrics at `/metrics`. Self-host Prometheus and Grafana in Docker Compose. Defer distributed tracing as an optional future enhancement.

## Consequences

Positive: low dependency count. `prom-client` is a single npm package, no OTel Collector sidecar, no OTLP endpoint, no Jaeger or Tempo or Zipkin. Metrics flow directly into Prometheus and Grafana queries it natively, so the whole pipeline is four Compose services (gateway, prometheus, grafana, nginx-lb). Histogram buckets give p50/p95/p99, counters track error rate and volume, which is all we need for the SLO table. Instrumentation is a Fastify `onResponse` hook, about 10 lines.

Negative: no distributed traces. Spans cannot be correlated across gateway-to-worker hops, so a slow summary job cannot be pinned to a specific Groq call without adding OTel later. Pull-based scraping at 15 s is coarser than push-based OTel. Workers do not expose their own `/metrics` endpoint, so queue depth goes through the gateway and adds a query per scrape.
