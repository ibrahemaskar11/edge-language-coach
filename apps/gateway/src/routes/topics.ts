import type { FastifyInstance } from "fastify";
import { toCamelCase } from "../utils/camelcase.js";

export async function topicRoutes(fastify: FastifyInstance) {
  fastify.get("/api/topics", async (_request, reply) => {
    const { data, error } = await fastify.supabase
      .from("topics")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (error) return reply.status(500).send({ message: error.message });
    return reply.send(toCamelCase(data));
  });

  fastify.get<{ Params: { id: string } }>(
    "/api/topics/:id",
    async (request, reply) => {
      const { data, error } = await fastify.supabase
        .from("topics")
        .select("*")
        .eq("id", request.params.id)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return reply.status(404).send({ message: "Topic not found" });
        }
        return reply.status(500).send({ message: error.message });
      }

      return reply.send(toCamelCase(data));
    }
  );
}
