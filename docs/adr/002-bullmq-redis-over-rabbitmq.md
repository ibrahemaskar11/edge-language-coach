# ADR 002 — BullMQ + Redis over RabbitMQ

**Date:** 2026-04-30
**Status:** Accepted

## Context

The async event-driven layer needed a message broker between the gateway and the workers (summary generation, flashcard generation, topic scraping). Main candidates were RabbitMQ (AMQP) and BullMQ on Redis.

## Decision

Use BullMQ with Redis as the broker.

## Consequences

Positive: one dependency. Redis is already the rate-limiter store (`@fastify/rate-limit`) so we reuse it as the queue backend. BullMQ provides retry with exponential backoff, dead-letter tracking, delayed jobs, recurring crons and Bull Board out of the box, all of which would be plugins or custom code in RabbitMQ. Local dev is just `docker compose up redis`. BullMQ is TypeScript-native, so job data is type-safe without protobuf or AMQP schema files.

Negative: Redis is not a purpose-built broker. Under extreme load it can lose acknowledged-but-not-persisted messages without AOF persistence (mitigated by enabling AOF in production). No native fanout or pub-sub (not required here). Switching to RabbitMQ later means replacing all queue producers and consumers.
