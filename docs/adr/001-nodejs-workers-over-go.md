# ADR 001 — Node.js Workers over Go Microservices

**Date:** 2026-04-30  
**Status:** Accepted

## Context

The original architecture plan called for three independently deployable Go services (Topic Scraper, Recommendations Engine, Flashcard/SRS Engine) communicating with the gateway via internal REST APIs. The goal was to demonstrate a distributed system with independently scalable components.

## Decision

Implement the workers as a single Node.js service (`apps/workers`) using BullMQ + Redis instead of three Go services.

The three logical workers (scraper, summary, flashcard) remain isolated as separate `Worker` instances with their own queues and concurrency settings, preserving the distributed semantics without the operational overhead of multiple language runtimes.

## Consequences

**Positive:**
- Single language runtime (TypeScript throughout) reduces cognitive overhead and tooling complexity.
- Shared types and validation schemas via `@edge/shared` eliminate interface contract drift between services.
- BullMQ's persistent queue guarantees (at-least-once delivery, retry, DLQ) replace the reliability burden that would otherwise fall on inter-service HTTP.
- Faster iteration: no need to manage separate Go module versions, Dockerfiles, or CI steps per service.

**Negative:**
- Workers cannot be scaled independently from each other (one Docker service scales all three). Mitigated by BullMQ's per-queue concurrency configuration.
- A crash in one worker process affects all three. Mitigated by the event-driven design: jobs remain in Redis until consumed, and BullMQ retries failed jobs.
- Less dramatic "polyglot" demonstration for the course submission.
