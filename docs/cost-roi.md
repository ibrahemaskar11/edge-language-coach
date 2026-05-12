---
title: "Edge Language Coach — Cost, ROI and Return on Agent"
geometry: margin=1in
fontsize: 11pt
colorlinks: true
---

# Cost, ROI and Return on Agent

The point of this document is to show that the engineering choices were made with cost in mind, not just technical merit. The system currently runs entirely on free tiers. Section 4 walks through what changes when we scale to 20 active users and what changes again at the point where free tiers stop covering us.

## 1. SLOs

In [docs/slo-table.md](./slo-table.md). Headlines: API availability at least 99 percent, `/api/messages` p95 under 2 s at baseline, queue job success at least 95 percent per day, at least 5 fresh topics per day.

## 2. Cost of one hour of downtime

This is a language coaching app, not fraud detection. We are honest that the absolute downtime cost is small.

At our current scale (no paying users yet), direct revenue loss is zero. The cost is reputational and habit-breaking. Language learning depends on daily streaks; an outage during someone's evening session is the kind of thing that ends the habit.

If we project a 100 paying user scale, the downtime cost is roughly $20 to $60 per hour. About $1/h of direct revenue loss plus $10 to $50 of churn risk (5 percent baseline monthly churn, a 10 percent lift on the cohort that saw the outage, $10/mo LTV scaled over 12 months). Still small, which is why the resilience investment in Section 3 stays proportional.

The same primitives applied to one of the SRS example domains (fraud-alert triage, hospital escalation) would have hourly downtime costs in the thousands. The substrate transfers, the cost regime does not.

## 3. Justified resilience investment

The single largest resilience investment is the 3-replica gateway behind `nginx-lb`. From the architecture report:

| Configuration | Cost on Oracle free tier | Error rate under saturation |
|---|---|---|
| 1 gateway replica | $0 | 6.81 percent |
| 3 gateway replicas | $0 | 0.27 percent |

A 96 percent error rate reduction for zero extra cost. On a paid provider this would cost roughly $10 to $20/mo extra (two small containers). At the low end of our projected downtime cost ($20/h), the 3-replica investment pays for itself after about one avoided incident per month.

## 4. Current and projected operational cost

### Current scale (development, no real users yet)

Everything is on free tiers. Real numbers, not estimates:

| Service | Tier | Cost | Headroom |
|---|---|---|---|
| Oracle Cloud VM (gateway, workers, Redis, nginx-lb) | Always Free | $0 | 4 ARM cores, 24 GB RAM |
| Vercel (SPA hosting) | Hobby | $0 | 100 GB bandwidth/mo |
| Supabase (Postgres + auth) | Free | $0 | 500 MB DB, 2 GB egress/mo |
| GitHub Actions (CI/CD) | Free for public repos | $0 | 2,000 minutes/mo |
| Groq API (LLM) | Pay as you go | $0 to $1 | a few hundred dev requests |
| **Total** | | **$0 to $1/mo** | |

We pay essentially nothing right now.

### Projected scale (20 active users)

20 users at 5 sessions a week, 15 messages per session, 500 tokens per message. That is about 400 sessions and 3M tokens a month.

| Service | Tier | Cost | Notes |
|---|---|---|---|
| Oracle Cloud VM | Always Free | $0 | Still inside 4 cores / 24 GB. Plenty of headroom. |
| Vercel | Hobby | $0 | 20 users will not get close to the 100 GB bandwidth cap. |
| Supabase | Free | $0 | DB size grows with sessions and flashcards but stays well under 500 MB. |
| GitHub Actions | Free | $0 | Same CI volume regardless of user count. |
| Groq API | Pay as you go | about $2 to $3 | 3M tokens at $0.59/$0.79 per million for input/output, split roughly 50/50. |
| **Total** | | **about $2 to $4/mo** | |

The cost grows almost entirely with Groq usage. Everything else stays free at this scale.

### When do free tiers stop covering us

The thresholds, roughly:

- **Supabase free tier** runs out around 200 to 500 users, depending on how much session history we retain. Egress is the usual first limit. Pro tier is $25/mo.
- **Oracle Always Free VM** is comfortable up to a few hundred users at this load profile. Past that we would either move to a paid Oracle shape ($20 to $40/mo) or split workers onto a second VM.
- **Vercel hobby** caps at 100 GB egress/mo. The SPA is small, so this is unlikely to bite before Supabase does.
- **Groq** has no tier, you just pay per token. At 1,000 users the LLM cost is about $100 to $150/mo on its own.

A reasonable estimate for the system running at 1,000 users: $150 to $250/mo all in. Still under any normal SaaS infrastructure budget.

## 5. Agent-related cost ceiling

The agent burns tokens on the client side (Claude Desktop, Claude Code or another MCP client) when it calls our tools. The MCP servers themselves do not call any LLM.

| Bound | Threshold |
|---|---|
| Tool calls per incident | 10 |
| Tool calls per principal per 10 min | 20 |
| Inference cost per incident | $0.50 |
| Inference cost per month | $20 |

Past the per-incident ceiling, the agent stops and escalates. Past the monthly ceiling, agentic features are disabled and the operator falls back to manual diagnosis (Bull Board, `redis-cli`, raw Grafana). Per-month math: 4 incidents at $0.50 each is $2/mo in normal operation. The $20 ceiling is sized for an unusual month with extended diagnosis sessions.

Full enforcement detail is in [docs/safety-policy.md](./safety-policy.md).

## 6. Cost vs reliability trade-off

We picked **3 retry attempts on BullMQ workers, not 10**.

More retries absorb more transient failures, but a poison-pill job (malformed payload, deleted user, deterministic failure) costs the same compute every retry without ever succeeding. At 10 attempts with 5 s exponential backoff, a poison-pill consumes about 85 minutes of retry budget before reaching the DLQ. At 3 attempts, that drops to about 15 seconds.

We chose to surface persistent failures sooner. The cost saved is compute on poison pills. The reliability cost is the rare third-time-successful transient failure that we now miss.

## 7. Automation vs safety trade-off

We picked **`pause_queue` agent autonomous, `flush_dead_letter_queue` human approved**.

Making both agent autonomous would shave minutes off MTTR. But DLQ flush is irreversible. If the root cause was a worker bug that has now been fixed, those jobs could have been replayed instead of discarded.

The line is reversibility, not impact magnitude. Reversible actions can be agent autonomous because the operator can undo. Irreversible actions need a human in the path because the cost of getting it wrong is unbounded.

## 8. Return on Agent

Without the MCP layer, recovering an open Groq breaker means: get paged, SSH to the Oracle VM, tail the gateway logs, check breaker state from the metrics endpoint by hand, decide whether Groq is healthy, `curl` the admin route with the key, watch the next minute of metrics. About 8 to 12 minutes per incident.

With the MCP layer: get paged, ask the agent or open the Inspector, agent calls `get_circuit_breaker_state` and `get_service_health` and `get_groq_latency`, reports back, proposes the reset, operator approves. About 2 to 4 minutes per incident.

Time saved is roughly 6 minutes per incident. At 4 incidents a month and a $30/h ops rate, that is about $12/mo saved. Agent inference cost runs about $2 to $5/mo. Net Return on Agent is about $7 to $10/mo, a 3 to 5 times return on inference cost.

The dollar number is small because the absolute scale is small. The ratio is what matters; it does not change at higher scale.

Two harder-to-quantify benefits do not show up in the dollar math. First, the audit trail is automatic: every remediation call writes a structured pino line on stderr. The same audit through SSH would require operator logging hygiene. Second, the same MCP tools serve a human (Inspector), an agent (Claude) and a future runbook script. Onboarding a new operator means showing them the Inspector once, not teaching them `redis-cli` and the admin route and the Bull Board UI separately.

## 9. Measurable benefit to customers

| Benefit | How it shows up |
|---|---|
| Conversational practice with an LLM tutor | `active_sessions_total` metric |
| Spaced-repetition flashcards generated per session | Flashcard rows in Supabase, queue throughput in Bull Board |
| Fresh topics every 6 hours | Scraper freshness SLO (5 new topics per day) |
| Service availability during a daily session | API availability SLO (99 percent) |
| Recovery from a Groq outage in under 90 s | RTO target (see Section 10) |

## 10. Recovery Time Objectives

Derived from the configured timeouts and retry policies, not measured separately.

| Failure mode | Total RTO |
|---|---|
| Groq slowdown or outage | about 90 s |
| Redis blip | about 20 s |
| Gateway replica crash | sub-second (nginx-lb round-robins to a healthy replica) |
| Worker job failure | about 20 s before DLQ visibility |
| Scraper duplicate replay | about 1 s |

The 90 s Groq RTO dominates because it covers the user-facing chat path. The other modes are either invisible to the user or fall inside one polling interval.

## 11. Budget compliance under stress

The system has no autoscaling, which means cost cannot run away from a stress event by construction.

| Stress | What happens | Cost impact |
|---|---|---|
| Traffic spike to 6x baseline | Rate limiter returns 429s past 60 req/min per user. | None. |
| Queue backlog from a slow worker | BullMQ holds the backlog in Redis. Workers process serially. | None. Latency degrades gracefully. |
| Groq tail latency | Circuit breaker opens, requests fail fast. | Spend goes down (failed calls are not billed). |
| Agent reasoning loop | Per-incident tool call ceiling fires at 10 calls. | Capped at $0.50 per incident, $20 per month. |
| Scaling action requested by agent | Refused. Scaling is out of agent scope. | None. |

The trade-off is real: we cannot absorb a 10x traffic spike without manual intervention. We accept that for a course-scale project.
