import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./env.js";
import { supabasePlugin } from "./plugins/supabase.js";
import { authPlugin } from "./plugins/auth.js";
import { authRoutes } from "./routes/auth.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
  credentials: true,
});

await app.register(supabasePlugin);
await app.register(authPlugin);
await app.register(authRoutes);

app.get("/health", async () => ({ status: "ok" }));

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
