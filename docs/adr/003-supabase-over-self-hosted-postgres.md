# ADR 003 — Supabase over Self-Hosted PostgreSQL

**Date:** 2026-04-30  
**Status:** Accepted

## Context

The system requires a relational database (user sessions, topics, flashcards, feedback) and an authentication provider. Options considered: self-hosted PostgreSQL + a separate auth service (e.g., Auth.js, Keycloak), or a managed Backend-as-a-Service such as Supabase.

## Decision

Use Supabase (managed PostgreSQL + Auth + Storage).

## Consequences

**Positive:**
- **Auth out of the box**: Row-level security, JWT issuance, OAuth providers, and email/password auth are available without additional services. The gateway validates Supabase JWTs directly, eliminating an auth microservice.
- **Reduced operational surface**: No Postgres container to manage, tune, back up, or upgrade within the project's Docker Compose. Supabase handles backups, connection pooling (PgBouncer), and upgrades.
- **Free tier sufficient**: The project's workload (course demo) comfortably fits within Supabase's free tier.
- **Prisma ORM compatibility**: Supabase PostgreSQL works identically to self-hosted PostgreSQL from Prisma's perspective; migration if needed is a connection string change.

**Negative:**
- **External dependency**: The system cannot run fully offline or in a fully self-contained Docker environment. A self-hosted Supabase stack could be added but adds significant setup complexity.
- **Vendor lock-in on auth**: Supabase-specific JWT claims and row-level security policies would need to be migrated if moving to another provider.
- **Latency variability**: As a managed service in a remote region, Supabase queries add network latency. Mitigated by Prisma connection pooling and Supabase's regional deployments.
