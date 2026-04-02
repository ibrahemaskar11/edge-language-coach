import type { FastifyInstance } from "fastify";
import { createFeedbackSchema } from "@edge/shared";
import { ZodError } from "zod";
import { toCamelCase } from "../utils/camelcase.js";

export async function feedbackRoutes(fastify: FastifyInstance) {
  // Get feedback for a session
  fastify.get<{ Params: { id: string } }>(
    "/api/sessions/:id/feedback",
    async (request, reply) => {
      // Check ownership
      const { data: session } = await fastify.supabase
        .from("sessions")
        .select("user_id")
        .eq("id", request.params.id)
        .single();

      if (!session) {
        return reply.status(404).send({ message: "Session not found" });
      }
      if (session.user_id !== request.userId) {
        return reply.status(403).send({ message: "Forbidden" });
      }

      const { data, error } = await fastify.supabase
        .from("feedback")
        .select("*")
        .eq("session_id", request.params.id)
        .order("turn", { ascending: true });

      if (error) return reply.status(500).send({ message: error.message });
      return reply.send(toCamelCase(data));
    }
  );

  // Create feedback for a session
  fastify.post<{ Params: { id: string } }>(
    "/api/sessions/:id/feedback",
    async (request, reply) => {
      let body;
      try {
        body = createFeedbackSchema.parse(request.body);
      } catch (err) {
        if (err instanceof ZodError) {
          return reply
            .status(400)
            .send({ message: "Validation error", errors: err.flatten().fieldErrors });
        }
        throw err;
      }

      // Check ownership
      const { data: session } = await fastify.supabase
        .from("sessions")
        .select("user_id")
        .eq("id", request.params.id)
        .single();

      if (!session) {
        return reply.status(404).send({ message: "Session not found" });
      }
      if (session.user_id !== request.userId) {
        return reply.status(403).send({ message: "Forbidden" });
      }

      const { data, error } = await fastify.supabase
        .from("feedback")
        .insert({
          session_id: request.params.id,
          type: body.type,
          content: body.content,
          turn: body.turn,
        })
        .select()
        .single();

      if (error) return reply.status(500).send({ message: error.message });
      return reply.status(201).send(toCamelCase(data));
    }
  );
}
