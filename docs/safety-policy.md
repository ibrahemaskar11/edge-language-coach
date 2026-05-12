---
title: "Edge Language Coach — Operational Safety Policy"
geometry: margin=1in
fontsize: 11pt
colorlinks: true
---

# Operational Safety Policy

This is the safety policy for the agentic operator surface (the two MCP servers in `apps/observability-mcp` and `apps/remediation-mcp`). It says what the agent is allowed to do, where the boundaries are and what happens when it tries to step outside them.

The policy is written down here, enforced in code at the MCP server boundary and exposed to the agent itself through the `get_safety_policy` tool on `observability-mcp` so the agent self-binds before it ever calls a remediation tool.

## 1. Capability classification

Every operational capability is either deterministic automation, agentic decision making or human in the loop. The line is not impact magnitude, it is whether the decision needs interpretation across heterogeneous signals.

| Capability | Class | Why |
|---|---|---|
| Circuit breaker trip, BullMQ retry, rate limiter, scraper idempotency | Deterministic | Threshold over a rolling window or a fixed retry budget. No judgement needed. |
| `get_service_health` / `get_groq_latency` synthesis | Agentic (advisory) | Answering "is Groq actually healthy now" needs cross-correlating `/readyz`, the breaker gauge and the latency histogram. No single metric answers it. |
| `pause_queue` / `resume_queue` during a drain | Agentic (bounded) | Reversible. Restricted to a typed enum of known queues. Low blast radius. |
| `reset_circuit_breaker` | Human in the loop | Reversible but consequential. Agent proposes, human approves by holding the `ADMIN_API_KEY`. |
| `flush_dead_letter_queue` | Human in the loop | Irreversible. Requires `confirm: true` from a human in the tool call. |
| Infrastructure scaling | Operator only | Out of agent scope. |

The agentic value sits in the diagnosis step before `reset_circuit_breaker`. Deciding whether to reset is not "if metric X > threshold then act". It is "the breaker is open, but is Groq actually healthy and is the rest of the system in a state where resetting is safe". That cross-signal interpretation is what the LLM tool-use loop is good at and what a static runbook would have to enumerate exhaustively to match.

## 2. Least privilege

The two MCP servers are split by privilege so that an agent connected only to `observability-mcp` has no way to mutate state.

`observability-mcp` is read only over `/metrics` and `/readyz`. No auth needed because no mutation is possible. `remediation-mcp` mutates Redis and the gateway admin route, behind three layers of guard (typed input, secret, irreversibility check).

The reasoning runs in an isolated process. Telemetry is consumed read only. Every write action goes through a typed interface with policy checks in front of it.

## 3. Action boundaries

Each tool has guards picked so that a riskier action sits behind a stronger barrier.

| Tool | Typed input | Secret | Irreversibility check |
|---|---|---|---|
| `pause_queue`, `resume_queue` | `zod.enum(["flashcard-generate", "summary-generate"])` rejects unknown queues | not required | not required (reversible) |
| `reset_circuit_breaker` | zod schema on the breaker name | `ADMIN_API_KEY` HTTP header on the gateway admin route | not required (breaker can re-open if upstream is still bad) |
| `flush_dead_letter_queue` | zod enum on queue name | not required | `confirm: true` argument mandatory; refusal with a typed error without it |

Hallucinated tool names, malformed arguments and wrong types are rejected at the boundary by zod before any dispatch. The MCP server cannot execute a tool that does not exist in its registry.

## 4. Idempotency

Where it matters, operations are no-ops on a duplicate call. `pause_queue` on an already paused queue is a no-op. `reset_circuit_breaker` on an already closed breaker is a no-op. The scraper uses a Redis key with a 6 h TTL so a worker restart mid-scrape does not cause duplicate topic ingestion.

`flush_dead_letter_queue` is not idempotent, which is why it sits behind `confirm: true` rather than relying on idempotency.

## 5. Auditability

Every call to `remediation-mcp` writes a structured pino line to **stderr** (`stdout` is the MCP transport). The line includes timestamp, tool name, the agent's arguments, the principal and the result.

After an incident, you can grep stderr for the sequence of tool calls and see exactly what the agent did and in what order. Read tools on `observability-mcp` do not audit per call to avoid log spam.

## 6. Economic guardrails

The agent has bounded resource consumption. Past any threshold the agent stops and defers to a human.

| Resource | Threshold | What happens |
|---|---|---|
| Tool calls per incident | 10 | Agent returns `escalation_required` and stops. Operator takes over. |
| Tool calls per principal per 10 min | 20 | `remediation-mcp` returns `rate_limit_exceeded`. 10 min cooldown. |
| Inference cost per incident | $0.50 | Computed from token usage in the agent client. Agent stops at the ceiling. |
| Inference cost per month | $20 | Hard cap in the agent client config. Past this, agentic features are disabled. |
| Scaling actions | not permitted | Agent cannot trigger `docker compose --scale`. |

The per-incident tool call ceiling is the load-bearing one. It is the bound that protects against a reasoning loop where the agent keeps calling `get_service_health` without converging. Past 10 calls without a remediation plan, the assumption is that the agent does not have enough signal to act.

Enforcement is layered: the agent client tracks the counters and ceilings, the MCP server applies the per-principal rate limit as a second line. Cost ceilings are tracked client side because the MCP server has no visibility into token usage.

## 7. Hallucination and validation

The agent can produce a plausible-looking tool call that is wrong. The policy protects against this in three places.

First, zod schemas at the MCP boundary reject hallucinated tool names, misspelled enums and wrong-typed arguments before dispatch. The agent never executes a hallucination because the boundary refuses to dispatch one.

Second, before a high-impact action like `reset_circuit_breaker`, the agent is expected to call `get_service_health` and confirm the relevant dependency reports healthy. The verify-before-act pattern uses live telemetry as the validation surface. If `/readyz` says Groq is down, the breaker reset is refused.

Third, diagnosis happens entirely through `observability-mcp`, which has no mutation tools. The agent cannot accidentally remediate while diagnosing.

We do not run a staging environment for dry runs. The system is small and the cost of a parallel staging copy is not justified.

## 8. Rollback and safe fallback

The default when the agent is uncertain is to do nothing and escalate. Three cases:

- **Inconsistent telemetry** (e.g. breaker open but `/readyz` says Groq is fine): do not act, escalate with the conflicting signals attached.
- **Per-incident tool call ceiling hit**: stop, return `escalation_required` with the partial diagnosis.
- **Poison-pill job in the DLQ with no clear root cause**: refuse to flush, pause the queue instead and escalate.

The pattern is the same in each case. Bounded reversible action (pause the queue) is preferred over speculative remediation (flush the queue). If the agent cannot reach high confidence on the root cause, it stops and waits for the operator.

## 9. Approval matrix

| Action | Class | Approval |
|---|---|---|
| Breaker trip and half-open probe | Fully automated | None (deterministic) |
| Job retry on transient failure | Fully automated | None (BullMQ policy) |
| `pause_queue` / `resume_queue` during normal operations | Agent autonomous | None (reversible, typed) |
| `reset_circuit_breaker` | Agent advisory, operator executes | Holder of `ADMIN_API_KEY` |
| `flush_dead_letter_queue` | Agent advisory, operator executes | Explicit `confirm: true` from a human |
| Gateway scale-out | Operator only | Out of agent scope |
| Schema migration on Supabase | Operator only | Out of agent scope, CI gated |

## 10. How the policy is enforced

Three layers, outermost to innermost.

**Agent context.** The policy is exposed to the agent through `observability-mcp.get_safety_policy`. The agent calls it at session start and self-binds. This is defence in depth. It fails open if the agent skips the call, which is why the next two layers exist.

**MCP server boundary.** zod schemas reject malformed or hallucinated tool calls. The privilege split between the two servers means an agent connected only to the read-only server cannot mutate at all. Audit lines on stderr give an after-the-fact trace.

**Gateway admin route.** `POST /admin/breakers/reset` checks `ADMIN_API_KEY` and refuses without it. Last line, behind the MCP server, the one that holds when the other two fail.

If the professor acts as a confused or malicious operator during the demo (which the SRS warns is possible), each layer refuses independently. The intended sequence:

- Try `flush_dead_letter_queue` without `confirm: true`. Layer 2 refuses.
- Try `pause_queue` on a queue that does not exist. Layer 2 refuses via the zod enum.
- Try `reset_circuit_breaker` without `ADMIN_API_KEY`. Layer 3 refuses with 401.
- Ask the agent to flush the DLQ in an ambiguous situation. Layer 1 refuses and proposes `pause_queue` instead.

Each refusal leaves a structured trace.

Sources: [apps/observability-mcp/src/index.ts](../apps/observability-mcp/src/index.ts), [apps/remediation-mcp/src/index.ts](../apps/remediation-mcp/src/index.ts), [apps/gateway/src/routes/admin.ts](../apps/gateway/src/routes/admin.ts). The cost ceilings in Section 6 are derived in [docs/cost-roi.md](./cost-roi.md).
