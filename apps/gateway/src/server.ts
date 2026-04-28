import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import { randomUUID } from "node:crypto";
import { env } from "./env.js";
import { logger } from "./lib/logger.js";
import { connection as redisConnection } from "./lib/queues.js";
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

const app = Fastify({
  loggerInstance: logger,
  genReqId: (req) => (req.headers["x-request-id"] as string | undefined) ?? randomUUID(),
  requestIdHeader: "x-request-id",
  requestIdLogLabel: "requestId",
  connectionTimeout: 30_000,
  keepAliveTimeout: 5_000,
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
  allowList: (req) => req.url === "/livez" || req.url === "/readyz",
});

await app.register(healthRoutes);
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

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
