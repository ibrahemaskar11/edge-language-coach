import fp from "fastify-plugin";
import Groq from "groq-sdk";
import type { FastifyInstance } from "fastify";
import { env } from "../env.js";

declare module "fastify" {
  interface FastifyInstance {
    groq: Groq;
  }
}

export const groqPlugin = fp(async (fastify: FastifyInstance) => {
  const groq = new Groq({ apiKey: env.GROQ_API_KEY });
  fastify.decorate("groq", groq);
});
