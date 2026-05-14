import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../../../.env") });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { z } from "zod";
import pino from "pino";

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:3001";
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? "";

const VALID_QUEUES = ["flashcard-generate", "summary-generate"] as const;

// Write audit logs to stderr — stdout is reserved for the MCP stdio transport
const log = pino({ level: "info" }, pino.destination(2));

function audit(tool: string, args: unknown, result: string) {
  log.info({ tool, args, result, ts: new Date().toISOString() }, "remediation");
}

function redisClient() {
  return new IORedis(REDIS_URL, { maxRetriesPerRequest: 1, lazyConnect: true });
}

const server = new McpServer({ name: "remediation-mcp", version: "1.0.0" });

server.tool(
  "pause_queue",
  "Pause a BullMQ queue — workers stop picking up new jobs. Safe to run at any time.",
  { name: z.enum(VALID_QUEUES) },
  async ({ name }) => {
    const redis = redisClient();
    try {
      await new Queue(name, { connection: redis }).pause();
      audit("pause_queue", { name }, "paused");
      return { content: [{ type: "text", text: JSON.stringify({ paused: true, queue: name }) }] };
    } finally {
      redis.disconnect();
    }
  },
);

server.tool(
  "resume_queue",
  "Resume a paused BullMQ queue — workers start picking up jobs again.",
  { name: z.enum(VALID_QUEUES) },
  async ({ name }) => {
    const redis = redisClient();
    try {
      await new Queue(name, { connection: redis }).resume();
      audit("resume_queue", { name }, "resumed");
      return { content: [{ type: "text", text: JSON.stringify({ resumed: true, queue: name }) }] };
    } finally {
      redis.disconnect();
    }
  },
);

server.tool(
  "reset_circuit_breaker",
  "Force-close the Groq circuit breakers back to closed (healthy) state. Use when Groq has recovered but the breaker is still open.",
  {},
  async () => {
    const res = await fetch(`${GATEWAY_URL}/admin/breakers/reset`, {
      method: "POST",
      headers: { "x-admin-key": ADMIN_API_KEY },
    });
    const body = (await res.json()) as unknown;
    audit("reset_circuit_breaker", {}, res.ok ? "reset" : `failed (${res.status})`);
    return {
      content: [{ type: "text", text: JSON.stringify(body, null, 2) }],
      isError: !res.ok,
    };
  },
);

server.tool(
  "flush_dead_letter_queue",
  "Remove all failed jobs from a queue. IRREVERSIBLE — requires confirm: true.",
  { name: z.enum(VALID_QUEUES), confirm: z.boolean() },
  async ({ name, confirm }) => {
    if (!confirm) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              error: "This action is irreversible. Pass confirm: true to proceed.",
            }),
          },
        ],
        isError: true,
      };
    }
    const redis = redisClient();
    try {
      const removed = await new Queue(name, { connection: redis }).clean(0, 1000, "failed");
      audit("flush_dead_letter_queue", { name }, `removed ${removed.length} failed jobs`);
      return {
        content: [{ type: "text", text: JSON.stringify({ flushed: removed.length, queue: name }) }],
      };
    } finally {
      redis.disconnect();
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
