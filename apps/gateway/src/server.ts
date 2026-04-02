import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./env.js";
import { supabasePlugin } from "./plugins/supabase.js";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";
import { topicRoutes } from "./routes/topics.js";
import { sessionRoutes } from "./routes/sessions.js";
import { feedbackRoutes } from "./routes/feedback.js";
import { statsRoutes } from "./routes/stats.js";
import { flashcardRoutes } from "./routes/flashcards.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
  credentials: true,
});

await app.register(supabasePlugin);
await app.register(authPlugin);
await app.register(authRoutes);
await app.register(topicRoutes);
await app.register(sessionRoutes);
await app.register(feedbackRoutes);
await app.register(statsRoutes);
await app.register(flashcardRoutes);

app.get("/health", async () => ({ status: "ok" }));

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
