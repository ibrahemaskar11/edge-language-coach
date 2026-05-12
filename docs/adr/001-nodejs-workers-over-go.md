# ADR 001 — Node.js Workers over Go Microservices

**Date:** 2026-04-30
**Status:** Accepted

## Context

The original plan was three independently deployable Go services (Topic Scraper, Recommendations Engine, Flashcard/SRS Engine) talking to the gateway over internal REST. The goal was to demonstrate a distributed system with independently scalable components.

## Decision

Implement the workers as a single Node.js service (`apps/workers`) using BullMQ on Redis instead of three Go services. The three logical workers (scraper, summary, flashcard) stay isolated as separate `Worker` instances with their own queues and concurrency settings.

## Consequences

Positive: one language runtime, shared types via `@edge/shared`, BullMQ provides at-least-once delivery and retry and DLQ for free, and there is no per-service Dockerfile or CI step to maintain.

Negative: workers cannot scale independently from each other in Docker (one service scales all three, mitigated by per-queue concurrency). A crash in one worker process affects all three (mitigated by job persistence in Redis and BullMQ retries). Less dramatic polyglot story for the demo.
