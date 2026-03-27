import fp from "fastify-plugin";
import { createHmac } from "crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { env } from "../env.js";

declare module "fastify" {
  interface FastifyRequest {
    userId: string;
    userEmail: string;
  }
}

function base64UrlDecode(str: string): Buffer {
  const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
  return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function verifyJwt(token: string): { sub: string; email: string } {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid token format");

  const [headerB64, payloadB64, signatureB64] = parts;
  const signature = base64UrlDecode(signatureB64);

  const hmac = createHmac("sha256", env.SUPABASE_JWT_SECRET);
  hmac.update(`${headerB64}.${payloadB64}`);
  const expected = hmac.digest();

  if (!signature.equals(expected)) {
    throw new Error("Invalid token signature");
  }

  const payload = JSON.parse(base64UrlDecode(payloadB64).toString());

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Token expired");
  }

  return { sub: payload.sub, email: payload.email };
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
        const { sub, email } = verifyJwt(token);
        request.userId = sub;
        request.userEmail = email;
      } catch {
        return reply.status(401).send({ message: "Invalid token" });
      }
    }
  );
});
