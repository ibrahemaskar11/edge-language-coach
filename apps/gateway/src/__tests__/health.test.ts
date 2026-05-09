import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Fastify from "fastify";

// Prevent real Redis connection from being created
vi.mock("../lib/queues.js", () => ({
  connection: { ping: vi.fn().mockResolvedValue("PONG") },
  flashcardQueue: {},
  summaryQueue: {},
}));

// Import after mock is registered
const { healthRoutes } = await import("../routes/health.js");
const { connection } = await import("../lib/queues.js");

function buildTestApp() {
  const app = Fastify({ logger: false });

  // Minimal decorator stubs that healthRoutes reads via app.supabase / app.groq
  app.decorate("supabase", {
    from: () => ({
      select: () => ({ limit: () => Promise.resolve({ error: null }) }),
    }),
  } as any);
  app.decorate("groq", {
    models: { list: vi.fn().mockResolvedValue([]) },
  } as any);

  return app;
}

describe("GET /livez", () => {
  const app = buildTestApp();
  beforeAll(async () => { await app.register(healthRoutes); await app.ready(); });
  afterAll(() => app.close());

  it("returns 200 with { status: 'ok' }", async () => {
    const res = await app.inject({ method: "GET", url: "/livez" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok" });
  });
});

describe("GET /readyz", () => {
  const app = buildTestApp();
  beforeAll(async () => { await app.register(healthRoutes); await app.ready(); });
  afterAll(() => app.close());

  it("returns 200 when all deps healthy", async () => {
    vi.mocked(connection.ping).mockResolvedValue("PONG");
    const res = await app.inject({ method: "GET", url: "/readyz" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ready" });
  });

  it("returns 503 when Redis is unavailable", async () => {
    vi.mocked(connection.ping).mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const res = await app.inject({ method: "GET", url: "/readyz" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: "not_ready", deps: { redis: { ok: false } } });
  });

  it("returns 503 when Groq is unavailable", async () => {
    vi.mocked(connection.ping).mockResolvedValue("PONG");
    vi.mocked(app.groq.models.list).mockRejectedValueOnce(new Error("Groq timeout"));
    const res = await app.inject({ method: "GET", url: "/readyz" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: "not_ready", deps: { groq: { ok: false } } });
  });
});
