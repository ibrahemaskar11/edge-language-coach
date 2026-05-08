# C4 Architecture Diagrams

## Level 1 — System Context

```mermaid
graph TB
    user["Language Learner\n(Browser)"]
    system["Edge Language Coach\n[Software System]\nItalian language practice\nvia AI-powered chat"]
    supabase["Supabase\n[External System]\nPostgreSQL + Auth"]
    groq["Groq API\n[External System]\nLLM inference (Llama 3.3)\nWhisper transcription"]

    user -->|"Uses (HTTPS)"| system
    system -->|"Reads/writes sessions,\ntopics, flashcards"| supabase
    system -->|"Chat completions,\naudio transcription"| groq
```

## Level 2 — Container Diagram

```mermaid
graph TB
    browser["Browser SPA\n[React 19 + Vite]\nUser interface for chat,\nflashcards, reports"]

    nginx_web["Web Server\n[nginx:alpine]\nServes static SPA,\nproxies /api to nginx-lb"]

    nginx_lb["Load Balancer\n[nginx:alpine]\nRound-robin across\ngateway replicas"]

    gateway["API Gateway\n[Fastify / Node.js]\nAuth, rate limiting,\ncircuit breaker, REST API\n:3001"]

    workers["Workers\n[Node.js / BullMQ]\nScraper, summary,\nflashcard generation\n:3002"]

    redis["Redis\n[redis:7-alpine]\nBullMQ job queues,\nrate-limit counters\n:6379"]

    prometheus["Prometheus\n[prom/prometheus]\nMetrics scraping\n:9090"]

    grafana["Grafana\n[grafana/grafana]\nDashboards & alerting\n:3000"]

    supabase[("Supabase\n[External]\nPostgreSQL + Auth")]
    groq["Groq API\n[External]"]

    browser -->|"HTTPS"| nginx_web
    nginx_web -->|"proxy /api"| nginx_lb
    nginx_lb -->|"round-robin"| gateway
    gateway -->|"enqueue jobs"| redis
    gateway -->|"SQL queries"| supabase
    gateway -->|"LLM / Whisper\n(circuit-broken)"| groq
    workers -->|"consume jobs"| redis
    workers -->|"SQL writes"| supabase
    workers -->|"LLM inference"| groq
    prometheus -->|"scrape /metrics"| nginx_lb
    grafana -->|"PromQL queries"| prometheus
```

## Level 2b — Operator Surface (Agentic MCP)

A separate plane from the user-request data flow. MCP clients (Claude Desktop, Claude Code, automated runbook agents) speak the stdio transport to two servers split by privilege.

```mermaid
graph LR
    operator["Operator / Agent\n(Claude Desktop, Claude Code)"]

    obs_mcp["observability-mcp\n[stdio MCP server]\nRead-only:\n• get_service_health\n• get_queue_metrics\n• get_circuit_breaker_state\n• get_active_sessions\n• get_groq_latency"]

    rem_mcp["remediation-mcp\n[stdio MCP server]\nGuarded write:\n• pause_queue / resume_queue\n• reset_circuit_breaker (ADMIN_API_KEY)\n• flush_dead_letter_queue (confirm:true)"]

    gateway["API Gateway\n:3001"]
    workers["Workers\n:3002"]
    redis["Redis"]
    admin["POST /admin/breakers/reset\n(ADMIN_API_KEY-guarded)"]
    audit["stderr audit log\n(pino, structured)"]

    operator -->|"stdio"| obs_mcp
    operator -->|"stdio"| rem_mcp

    obs_mcp -->|"GET /metrics, /readyz"| gateway
    obs_mcp -->|"GET /readyz"| workers

    rem_mcp -->|"BullMQ admin"| redis
    rem_mcp -->|"x-admin-key"| admin
    admin --- gateway
    rem_mcp -.->|"every call"| audit
```

Loop closure: detect (Prometheus / Grafana, not shown) → diagnose (`observability-mcp`) → remediate (`remediation-mcp`).

## Level 3 — Gateway Component Diagram

```mermaid
graph TB
    subgraph Gateway ["API Gateway (Fastify)"]
        auth["Auth Plugin\n(JWT validation)"]
        rl["Rate Limit Plugin\n(@fastify/rate-limit + Redis)\n60 req/min per user"]
        cb["Circuit Breaker\n(opossum)\nchat + transcribe breakers"]
        routes["Route Handlers\n/api/topics, /api/sessions,\n/api/messages, /api/flashcards,\n/api/reports, /api/transcribe"]
        health["Health Routes\n/livez, /readyz, /metrics"]
        queue_client["Queue Client\n(BullMQ producer)\nflashcard-generate\nsummary-generate"]
    end

    req["Incoming Request"] --> auth --> rl --> routes
    routes --> cb
    routes --> queue_client
    cb -->|"Groq SDK"| groq["Groq API"]
    queue_client -->|"Redis"| redis["Redis"]
    health -->|"ping"| redis
```
