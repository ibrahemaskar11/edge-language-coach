# ADR 002 — BullMQ + Redis over RabbitMQ

**Date:** 2026-04-30  
**Status:** Accepted

## Context

The async event-driven layer (Phase 3) needed a message broker to decouple the gateway from the workers (summary generation, flashcard generation, topic scraping). The two main candidates were RabbitMQ (AMQP) and Redis-backed BullMQ.

## Decision

Use BullMQ with Redis as the message broker.

## Consequences

**Positive:**
- **Single dependency**: Redis serves both as the rate-limiter store (via `@fastify/rate-limit`) and the job queue backend, reducing the number of infrastructure services.
- **Rich job lifecycle**: BullMQ provides built-in retry with exponential backoff, dead-letter tracking, delayed jobs, recurring cron jobs, and a monitoring UI (Bull Board) — features that require plugins or custom code in RabbitMQ.
- **Simpler local dev**: `docker compose up redis` is sufficient; no RabbitMQ management UI or vhost setup needed.
- **TypeScript-native**: BullMQ is written in TypeScript; type-safe job data without protobuf/AMQP schema definitions.

**Negative:**
- Redis is not a purpose-built message broker. Under extreme load it can lose acknowledged-but-not-persisted messages if AOF persistence is not enabled. Mitigated by running Redis with default append-only persistence in production.
- BullMQ does not support fanout/pub-sub patterns natively. Not required for current workloads.
- Vendor lock-in to Redis data structures. Switching to RabbitMQ later would require replacing all queue producers and consumers.
