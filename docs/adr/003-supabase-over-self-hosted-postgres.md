# ADR 003 — Supabase over Self-Hosted PostgreSQL

**Date:** 2026-04-30
**Status:** Accepted

## Context

The system needs a relational database (user sessions, topics, flashcards, feedback) and an authentication provider. Options: self-hosted Postgres plus a separate auth service (Auth.js, Keycloak) or a managed BaaS like Supabase.

## Decision

Use Supabase (managed Postgres plus Auth plus Storage).

## Consequences

Positive: auth is out of the box. Row-level security, JWT issuance, OAuth and email/password are available without an extra service. The gateway validates Supabase JWTs directly, no auth microservice. No Postgres container to manage, tune, back up or upgrade. The free tier comfortably fits a course demo. Prisma works against Supabase identically to self-hosted Postgres, so a switch later is a connection string change.

Negative: external dependency, so the system cannot run fully offline. Vendor lock-in on the auth side (Supabase-specific JWT claims and row-level security policies would need migration). Network latency to Supabase varies; mitigated by Prisma connection pooling and regional deployments.
