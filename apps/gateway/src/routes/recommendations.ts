import type { FastifyInstance } from "fastify";
import { toCamelCase } from "../utils/camelcase.js";
import { env } from "../env.js";

interface RecommendationEntry {
  topicId: string;
  score: number;
}

export async function recommendationRoutes(fastify: FastifyInstance) {
  fastify.get("/api/recommendations", async (request, reply) => {
    const limit = 10;

    // Call the recommendations microservice
    let recommendations: RecommendationEntry[] = [];
    try {
      const recRes = await fetch(
        `${env.RECOMMENDATIONS_URL}/recommend?userId=${request.userId}&limit=${limit}`
      );
      if (recRes.ok) {
        recommendations = await recRes.json() as RecommendationEntry[];
      } else {
        fastify.log.warn(`recommendations service returned ${recRes.status}`);
      }
    } catch (err) {
      fastify.log.warn(`recommendations service unavailable: ${err}`);
    }

    // Graceful fallback: if service is down, return most recent topics
    if (!recommendations || recommendations.length === 0) {
      const { data, error } = await fastify.supabase
        .from("topics")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) return reply.status(500).send({ message: error.message });
      return reply.send(toCamelCase(data));
    }

    // Fetch full topic data for the recommended IDs
    const topicIds = recommendations.map((r) => r.topicId);

    const { data, error } = await fastify.supabase
      .from("topics")
      .select("*")
      .in("id", topicIds);

    if (error) return reply.status(500).send({ message: error.message });

    // Re-order to preserve score ranking from recommendations service
    const topicMap = new Map((data ?? []).map((t: { id: string }) => [t.id, t]));
    const ordered = recommendations
      .map((r) => topicMap.get(r.topicId))
      .filter(Boolean);

    return reply.send(toCamelCase(ordered));
  });
}
