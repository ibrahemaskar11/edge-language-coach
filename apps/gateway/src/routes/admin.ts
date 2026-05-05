import type { FastifyInstance } from "fastify";
import { env } from "../env.js";

export async function adminRoutes(fastify: FastifyInstance) {
  fastify.post("/admin/breakers/reset", async (request, reply) => {
    const key = request.headers["x-admin-key"];
    if (!env.ADMIN_API_KEY || key !== env.ADMIN_API_KEY) {
      return reply.status(401).send({ error: "unauthorized" });
    }
    fastify.groqBreakers.chat.close();
    fastify.groqBreakers.transcribe.close();
    fastify.log.info({ actor: "admin" }, "circuit breakers force-closed");
    return reply.send({ reset: true, breakers: ["groq-chat", "groq-transcribe"] });
  });
}
