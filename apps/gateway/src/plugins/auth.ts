import fp from "fastify-plugin";
import jwt from "jsonwebtoken";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { env } from "../env.js";

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

      try {
        const payload = jwt.verify(token, env.SUPABASE_JWT_SECRET) as {
          sub: string;
          email: string;
        };
        request.userId = payload.sub;
        request.userEmail = payload.email;
      } catch {
        return reply.status(401).send({ message: "Invalid token" });
      }
    }
  );
});
