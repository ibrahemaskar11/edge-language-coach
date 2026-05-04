import type { FastifyInstance } from "fastify";

/**
 * Demo-only route for triggering the Groq circuit breaker.
 *
 * Registered only when DEMO_MODE=1 so it cannot leak into production.
 * Calls the gateway's wrapped `groqChat()` (subject to opossum), so when
 * the upstream Groq (or its mock) is slow/erroring, this route is the
 * fastest way to drive enough volume to flip the breaker open.
 *
 * Skips auth + rate-limit (via allowList entries in server.ts) so a
 * standalone driver script can hit it without a JWT.
 */
export async function breakerDemoRoutes(app: FastifyInstance) {
  app.post("/api/breaker-demo/chat", async (_req, reply) => {
    const start = Date.now();
    try {
      const completion = await app.groqChat({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: "say hi" }],
        max_tokens: 5,
      });
      const elapsedMs = Date.now() - start;
      const breaker = app.groqBreakers.chat;
      return {
        ok: true,
        elapsedMs,
        breakerState: breaker.opened ? "open" : breaker.halfOpen ? "halfOpen" : "closed",
        content: completion.choices[0]?.message?.content ?? null,
      };
    } catch (err) {
      const elapsedMs = Date.now() - start;
      const breaker = app.groqBreakers.chat;
      reply.status(503);
      return {
        ok: false,
        elapsedMs,
        breakerState: breaker.opened ? "open" : breaker.halfOpen ? "halfOpen" : "closed",
        error: (err as Error).message,
      };
    }
  });
}
