import type { FastifyInstance } from "fastify";
import { connection } from "../lib/queues.js";

const PROBE_TIMEOUT_MS = 2_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), ms)),
  ]);
}

async function checkRedis(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const reply = await withTimeout(connection.ping(), PROBE_TIMEOUT_MS, "redis");
    return reply === "PONG" ? { ok: true } : { ok: false, error: `unexpected reply: ${reply}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function checkSupabase(app: FastifyInstance): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const result = await withTimeout(
      Promise.resolve(app.supabase.from("topics").select("id", { head: true, count: "exact" }).limit(1)),
      PROBE_TIMEOUT_MS,
      "supabase",
    );
    return result.error ? { ok: false, error: result.error.message } : { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

async function checkGroq(app: FastifyInstance): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await withTimeout(app.groq.models.list(), PROBE_TIMEOUT_MS, "groq");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function healthRoutes(app: FastifyInstance) {
  app.get("/livez", async () => ({ status: "ok" }));

  app.get("/readyz", async (_req, reply) => {
    const [redis, supabase, groq] = await Promise.all([
      checkRedis(),
      checkSupabase(app),
      checkGroq(app),
    ]);

    const deps = { redis, supabase, groq };
    const allOk = redis.ok && supabase.ok && groq.ok;
    reply.status(allOk ? 200 : 503);
    return { status: allOk ? "ready" : "not_ready", deps };
  });
}
