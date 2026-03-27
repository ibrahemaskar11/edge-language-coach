import Fastify from "fastify";
import cors from "@fastify/cors";
import { env } from "./env.js";
import { prismaPlugin } from "./plugins/prisma.js";

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
  credentials: true,
});

await app.register(prismaPlugin);

app.get("/health", async () => ({ status: "ok" }));

try {
  await app.listen({ port: env.PORT, host: "0.0.0.0" });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
