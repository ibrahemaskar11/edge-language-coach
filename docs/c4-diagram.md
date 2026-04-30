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
