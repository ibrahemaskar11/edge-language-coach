import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { randomUUID } from "node:crypto";
import { env } from "./env.js";
import { logger } from "./lib/logger.js";
import { connection as redisConnection } from "./lib/queues.js";
import {
  httpRequestDuration,
  httpRequestTotal,
  groqCircuitBreakerState,
  queueDepth,
  activeSessionsGauge,
  register,
} from "./lib/metrics.js";
import { flashcardQueue, summaryQueue } from "./lib/queues.js";
import { supabasePlugin } from "./plugins/supabase.js";
import { groqPlugin } from "./plugins/groq.js";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { topicRoutes } from "./routes/topics.js";
import { sessionRoutes } from "./routes/sessions.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { statsRoutes } from "./routes/stats.js";
import { flashcardRoutes } from "./routes/flashcards.js";
import { messageRoutes } from "./routes/messages.js";
import { recommendationRoutes } from "./routes/recommendations.js";
import { reportRoutes } from "./routes/reports.js";
import { profileRoutes } from "./routes/profile.js";
import { transcribeRoutes } from "./routes/transcribe.js";
import { healthRoutes } from "./routes/health.js";
import { breakerDemoRoutes } from "./routes/breaker-demo.js";

const app = Fastify({
  loggerInstance: logger,
  genReqId: (req) => (req.headers["x-request-id"] as string | undefined) ?? randomUUID(),
  requestIdHeader: "x-request-id",
  requestIdLogLabel: "requestId",
  connectionTimeout: 30_000,
  keepAliveTimeout: 5_000,
});

// Record HTTP request duration and count for Prometheus
app.addHook("onResponse", (req, reply, done) => {
  const route = req.routeOptions?.url ?? req.url;
  const labels = { method: req.method, route, status_code: String(reply.statusCode) };
  httpRequestDuration.observe(labels, reply.elapsedTime / 1000);
  httpRequestTotal.inc(labels);
  done();
});

await app.register(cors, {
  origin: true,
  credentials: true,
});

await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });
await app.register(supabasePlugin);
await app.register(groqPlugin);
await app.register(authPlugin);

// Rate limit registered AFTER authPlugin so its onRequest hook runs after auth
// has populated request.userId. Health probes are excluded by allowList.
await app.register(rateLimit, {
  global: true,
  max: 60,
  timeWindow: "1 minute",
  redis: redisConnection,
  keyGenerator: (req) => req.userId || req.ip,
  allowList: (req) =>
    req.url === "/livez" ||
    req.url === "/readyz" ||
    req.url === "/metrics" ||
    req.url.startsWith("/api/breaker-demo"),
});

await app.register(healthRoutes);

// Prometheus metrics endpoint
app.get("/metrics", async (_req, reply) => {
  // Refresh circuit breaker gauges
  const { chat, transcribe } = app.groqBreakers;
  const breakerState = (b: { opened: boolean; halfOpen: boolean }) =>
    b.opened ? 1 : b.halfOpen ? 2 : 0;
  groqCircuitBreakerState.set({ breaker: "chat" }, breakerState(chat));
  groqCircuitBreakerState.set({ breaker: "transcribe" }, breakerState(transcribe));

  // Refresh queue depth gauges
  const [fcWaiting, sumWaiting] = await Promise.all([
    flashcardQueue.getWaitingCount(),
    summaryQueue.getWaitingCount(),
  ]);
  queueDepth.set({ queue: "flashcard-generate" }, fcWaiting);
  queueDepth.set({ queue: "summary-generate" }, sumWaiting);

  // Refresh active sessions gauge
  const { count } = await app.supabase
    .from("sessions")
    .select("id", { head: true, count: "exact" })
    .eq("status", "active");
  activeSessionsGauge.set(count ?? 0);

  reply.header("Content-Type", register.contentType);
  return reply.send(await register.metrics());
});

await app.register(authRoutes);
await app.register(topicRoutes);
await app.register(sessionRoutes);
await app.register(feedbackRoutes);
await app.register(statsRoutes);
await app.register(flashcardRoutes);
await app.register(messageRoutes);
await app.register(recommendationRoutes);
await app.register(reportRoutes);
await app.register(profileRoutes);
await app.register(transcribeRoutes);

if (env.DEMO_MODE) {
  app.log.warn("DEMO_MODE=1 — registering /api/breaker-demo (NOT for production)");
  await app.register(breakerDemoRoutes);
}

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
