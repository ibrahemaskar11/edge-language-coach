import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
    userEmail: string;
  }
}

export const authPlugin = fp(async (fastify: FastifyInstance) => {
  fastify.decorateRequest("userId", "");
  fastify.decorateRequest("userEmail", "");

  fastify.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (
        request.url === "/health" ||
        request.url.startsWith("/api/auth/callback")
      ) {
        return;
      }

      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith("Bearer ")) {
        return reply.status(401).send({ message: "Missing authorization" });
      }

      const token = authHeader.slice(7);

      const {
        data: { user },
        error,
      } = await fastify.supabase.auth.getUser(token);

      if (error || !user) {
        return reply.status(401).send({ message: "Invalid token" });
      }

      request.userId = user.id;
      request.userEmail = user.email ?? "";
    }
  );
});
