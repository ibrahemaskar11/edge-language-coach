import type { FastifyInstance } from "fastify";
import { createSessionSchema, updateSessionSchema } from "@edge/shared";
import { ZodError } from "zod";
import { toCamelCase } from "../utils/camelcase.js";

export async function sessionRoutes(fastify: FastifyInstance) {
  // Create a new session
  fastify.post("/api/sessions", async (request, reply) => {
    let body;
    try {
      body = createSessionSchema.parse(request.body);
    } catch (err) {
      if (err instanceof ZodError) {
        return reply
          .status(400)
          .send({ message: "Validation error", errors: err.flatten().fieldErrors });
      }
      throw err;
    }

    // Verify topic exists
    const { data: topic } = await fastify.supabase
      .from("topics")
      .select("id")
      .eq("id", body.topicId)
      .single();

    if (!topic) {
      return reply.status(404).send({ message: "Topic not found" });
    }

    const { data, error } = await fastify.supabase
      .from("sessions")
      .insert({
        user_id: request.userId,
        topic_id: body.topicId,
        status: "coaching",
      })
      .select("*, topic:topics(*)")
      .single();

    if (error) return reply.status(500).send({ message: error.message });
    return reply.status(201).send(toCamelCase(data));
  });

  // List user's sessions
  fastify.get("/api/sessions", async (request, reply) => {
    const { data, error } = await fastify.supabase
      .from("sessions")
      .select("*, topic:topics(*)")
      .eq("user_id", request.userId)
      .order("created_at", { ascending: false });

    if (error) return reply.status(500).send({ message: error.message });
    return reply.send(toCamelCase(data));
  });

  // Get single session with topic + feedback
  fastify.get<{ Params: { id: string } }>(
    "/api/sessions/:id",
    async (request, reply) => {
      const { data, error } = await fastify.supabase
        .from("sessions")
        .select("*, topic:topics(*), feedback(*)")
        .eq("id", request.params.id)
        .single();

      if (error) {
        if (error.code === "PGRST116") {
          return reply.status(404).send({ message: "Session not found" });
        }
        return reply.status(500).send({ message: error.message });
      }

      if (data.user_id !== request.userId) {
        return reply.status(403).send({ message: "Forbidden" });
      }

      return reply.send(toCamelCase(data));
    }
  );

  // Update session
  fastify.patch<{ Params: { id: string } }>(
    "/api/sessions/:id",
    async (request, reply) => {
      let body;
      try {
        body = updateSessionSchema.parse(request.body);
      } catch (err) {
        if (err instanceof ZodError) {
          return reply
            .status(400)
            .send({ message: "Validation error", errors: err.flatten().fieldErrors });
        }
        throw err;
      }

      // Check ownership
      const { data: existing } = await fastify.supabase
        .from("sessions")
        .select("user_id")
        .eq("id", request.params.id)
        .single();

      if (!existing) {
        return reply.status(404).send({ message: "Session not found" });
      }
      if (existing.user_id !== request.userId) {
        return reply.status(403).send({ message: "Forbidden" });
      }

      const updateData: Record<string, unknown> = {};
      if (body.transcript !== undefined) updateData.transcript = body.transcript;
      if (body.status !== undefined) updateData.status = body.status;
      if (body.audioUrl !== undefined) updateData.audio_url = body.audioUrl;

      const { data, error } = await fastify.supabase
        .from("sessions")
        .update(updateData)
        .eq("id", request.params.id)
        .select("*, topic:topics(*)")
        .single();

      if (error) return reply.status(500).send({ message: error.message });
      return reply.send(toCamelCase(data));
    }
  );
}
