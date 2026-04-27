# Edge Language Coach

A language learning platform built as a monorepo with a React frontend, Fastify API gateway, and BullMQ async workers backed by Redis and Supabase.

## Architecture

```
apps/
  web/        # React 19 + Vite + TanStack Router (frontend)
  gateway/    # Fastify REST API (port 3001)
  workers/    # BullMQ job processors (port 3002)
packages/
  db/         # Prisma client + schema
  shared/     # Shared types and utilities
```

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [pnpm](https://pnpm.io/) v10.18.3
- [Docker](https://www.docker.com/) (for Redis)
- A [Supabase](https://supabase.com/) project
- A [Groq](https://console.groq.com/) API key

## Installation

**1. Clone the repository**

```bash
git clone git@github.com:ibrahemaskar11/edge-language-coach.git
cd edge-language-coach
```

**2. Install dependencies**

```bash
pnpm install
```

**3. Set up environment variables**

```bash
cp .env.example .env
```

Edit `.env` and fill in your credentials:

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous/public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (server-side only) |
| `SUPABASE_JWT_SECRET` | Supabase JWT secret |
| `DATABASE_URL` | Postgres connection string from Supabase |
| `GROQ_API_KEY` | Groq API key for LLM inference |
| `PORT` | Gateway port (default: `3001`) |

**4. Push the database schema**

```bash
pnpm db:push
```

**5. (Optional) Seed the database**

```bash
pnpm db:seed
```

## Running in Development

Start Redis via Docker and all apps in watch mode with a single command:

```bash
pnpm dev
```

This starts:
- Redis on `localhost:6379`
- Gateway on `http://localhost:3001`
- Workers dashboard on `http://localhost:3002`
- Web app on `http://localhost:5173`

## Running with Docker Compose

To run Redis and the workers service together:

```bash
docker compose up
```

## Building for Production

```bash
pnpm build
```

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, TailwindCSS v4, TanStack Router/Query |
| API Gateway | Fastify 5, Zod, JWT |
| Workers | BullMQ, Bull Board |
| Database | Supabase (Postgres), Prisma |
| Cache / Queue | Redis 7 |
| AI Inference | Groq SDK |
| Monorepo | Turborepo, pnpm workspaces |
