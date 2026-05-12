import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { readFile } from "node:fs/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const SAFETY_POLICY_PATH = resolve(__dirname, "../../../docs/safety-policy.md");

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:3001";
const WORKERS_URL = process.env.WORKERS_URL ?? "http://localhost:3002";
const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? "";

function requireAdminKey() {
  if (!ADMIN_API_KEY) {
    return {
      content: [{ type: "text" as const, text: JSON.stringify({ error: "ADMIN_API_KEY is not configured." }) }],
      isError: true as const,
    };
  }
  return null;
}

function parseGauge(text: string, name: string, labels?: Record<string, string>): number | null {
  const lines = text.split("\n").filter((l) => l.startsWith(name) && !l.startsWith("#"));
  for (const line of lines) {
    if (labels) {
      const allMatch = Object.entries(labels).every(([k, v]) => line.includes(`${k}="${v}"`));
      if (!allMatch) continue;
    }
    const value = line.split(" ").at(-1);
    const num = parseFloat(value ?? "");
    return isNaN(num) ? null : num;
  }
  return null;
}

const server = new McpServer({ name: "observability-mcp", version: "1.0.0" });

server.tool(
  "get_service_health",
  "Check liveness and readiness of the gateway and workers services",
  {},
  async () => {
    const authError = requireAdminKey();
    if (authError) return authError;
    const [gateway, workers] = await Promise.all([
      fetch(`${GATEWAY_URL}/readyz`)
        .then((r) => r.json())
        .catch((e: unknown) => ({ error: String(e) })),
      fetch(`${WORKERS_URL}/readyz`)
        .then((r) => r.json())
        .catch((e: unknown) => ({ error: String(e) })),
    ]);
    return {
      content: [{ type: "text", text: JSON.stringify({ gateway, workers }, null, 2) }],
    };
  },
);

server.tool(
  "get_queue_metrics",
  "Get waiting job counts for all BullMQ queues from the gateway Prometheus metrics",
  {},
  async () => {
    const authError = requireAdminKey();
    if (authError) return authError;
    const text = await fetch(`${GATEWAY_URL}/metrics`).then((r) => r.text());
    const flashcard = parseGauge(text, "queue_depth_total", { queue: "flashcard-generate" });
    const summary = parseGauge(text, "queue_depth_total", { queue: "summary-generate" });
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { "flashcard-generate": { waiting: flashcard }, "summary-generate": { waiting: summary } },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  "get_circuit_breaker_state",
  "Get the current state of Groq circuit breakers. State: 0=closed (healthy), 1=open (blocking), 2=half-open (testing)",
  {},
  async () => {
    const authError = requireAdminKey();
    if (authError) return authError;
    const text = await fetch(`${GATEWAY_URL}/metrics`).then((r) => r.text());
    const chat = parseGauge(text, "groq_circuit_breaker_state", { breaker: "chat" });
    const transcribe = parseGauge(text, "groq_circuit_breaker_state", { breaker: "transcribe" });
    const label = (v: number | null) =>
      v === 0 ? "closed" : v === 1 ? "open" : v === 2 ? "half-open" : "unknown";
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              chat: { value: chat, state: label(chat) },
              transcribe: { value: transcribe, state: label(transcribe) },
            },
            null,
            2,
          ),
        },
      ],
    };
  },
);

server.tool(
  "get_active_sessions",
  "Get the number of currently active learning sessions (status=coaching)",
  {},
  async () => {
    const authError = requireAdminKey();
    if (authError) return authError;
    const text = await fetch(`${GATEWAY_URL}/metrics`).then((r) => r.text());
    const count = parseGauge(text, "active_sessions_total");
    return {
      content: [{ type: "text", text: JSON.stringify({ activeSessions: count }) }],
    };
  },
);

server.tool(
  "get_groq_latency",
  "Get raw Groq API latency histogram lines from the gateway metrics (includes p50/p95/p99 bucket data)",
  {},
  async () => {
    const authError = requireAdminKey();
    if (authError) return authError;
    const text = await fetch(`${GATEWAY_URL}/metrics`).then((r) => r.text());
    const lines = text
      .split("\n")
      .filter((l) => l.startsWith("groq_request_duration_seconds"))
      .join("\n");
    return { content: [{ type: "text", text: lines || "No Groq latency data available yet." }] };
  },
);

server.tool(
  "get_safety_policy",
  "Returns the operational safety policy that bounds what this agent is allowed to do. Call this once at the start of a session before any remediation action. The returned document defines capability classes (deterministic, agentic, human in the loop), economic guardrails (tool call ceiling, inference cost ceiling), action boundaries and the rollback rule. Bind yourself to it.",
  {},
  async () => {
    try {
      const text = await readFile(SAFETY_POLICY_PATH, "utf8");
      return { content: [{ type: "text", text }] };
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "safety policy not readable",
              path: SAFETY_POLICY_PATH,
              details: String(err),
            }),
          },
        ],
        isError: true,
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
