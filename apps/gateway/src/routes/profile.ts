import type { FastifyInstance } from "fastify";
import { toCamelCase } from "../utils/camelcase.js";

interface PlacementQuestionRow {
  id: string;
  level: string;
  question: string;
  options: string[];
  answer: number;
  sort_order: number;
}

export async function profileRoutes(fastify: FastifyInstance) {
  fastify.get("/api/onboarding/questions", async (_request, reply) => {
    const { data, error } = await fastify.supabase
      .from("placement_questions")
      .select("id, level, question, options, answer, sort_order")
      .order("sort_order", { ascending: true });

    if (error) return reply.status(500).send({ message: error.message });
    return reply.send(
      (data as PlacementQuestionRow[]).map((q) => toCamelCase(q))
    );
  });

  fastify.get("/api/profile", async (request, reply) => {
    const { data, error } = await fastify.supabase
      .from("profiles")
      .select("italian_level, onboarding_completed")
      .eq("id", request.userId)
      .single();

    if (error) return reply.status(500).send({ message: error.message });
    return reply.send(toCamelCase(data));
  });

  fastify.patch<{
    Body: { italianLevel?: string; onboardingCompleted?: boolean };
  }>("/api/profile", async (request, reply) => {
    const { italianLevel, onboardingCompleted } = request.body;

    const updates: Record<string, unknown> = {};
    if (italianLevel !== undefined) updates.italian_level = italianLevel;
    if (onboardingCompleted !== undefined) updates.onboarding_completed = onboardingCompleted;

    const { data, error } = await fastify.supabase
      .from("profiles")
      .update(updates)
      .eq("id", request.userId)
      .select("italian_level, onboarding_completed")
      .single();

    if (error) return reply.status(500).send({ message: error.message });
    return reply.send(toCamelCase(data));
  });
}
