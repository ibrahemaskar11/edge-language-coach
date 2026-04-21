import type { FastifyInstance } from "fastify";
import { toCamelCase } from "../utils/camelcase.js";

interface TopicRow {
  id: string;
  category: string;
  level: string;
  created_at: string;
}

const CEFR_ORDER = ["A1", "A2", "B1", "B2", "C1", "C2"];

function cefrDistance(a: string | null, b: string): number {
  if (!a) return 99;
  const ai = CEFR_ORDER.indexOf(a);
  const bi = CEFR_ORDER.indexOf(b);
  return ai === -1 || bi === -1 ? 99 : Math.abs(ai - bi);
}

interface SessionRow {
  topic_id: string;
  status: string;
  topic: { category: string } | null;
}

interface UserFlashcardRow {
  flashcard: { topic_id: string } | null;
}

export async function recommendationRoutes(fastify: FastifyInstance) {
  fastify.get("/api/recommendations", async (request, reply) => {
    const limit = 10;

    try {
      // Fetch active topics
      const { data: topics, error: topicsError } = await fastify.supabase
        .from("topics")
        .select("id, category, level, created_at")
        .eq("is_active", true);

      if (topicsError || !topics || topics.length === 0) {
        // Fallback: return most recent topics regardless of is_active
        const { data, error } = await fastify.supabase
          .from("topics")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(limit);
        if (error) return reply.status(500).send({ message: error.message });
        return reply.send(toCamelCase(data));
      }

      // Fetch user level for CEFR-aware scoring
      const { data: profileData } = await fastify.supabase
        .from("profiles")
        .select("italian_level")
        .eq("id", request.userId)
        .single();
      const userLevel = (profileData as { italian_level: string | null } | null)?.italian_level ?? null;

      // Fetch user sessions (for completion + category preference scoring)
      const { data: sessions } = await fastify.supabase
        .from("sessions")
        .select("topic_id, status, topic:topics(category)")
        .eq("user_id", request.userId) as { data: SessionRow[] | null };

      // Fetch user flashcard topics (for "has flashcards" bonus)
      const { data: userFlashcards } = await fastify.supabase
        .from("user_flashcards")
        .select("flashcard:flashcards(topic_id)")
        .eq("user_id", request.userId) as { data: UserFlashcardRow[] | null };

      // Build helper sets
      const completedTopicIds = new Set<string>();
      const attemptedTopicIds = new Set<string>();
      const categoryCounts: Record<string, number> = {};

      for (const s of sessions ?? []) {
        attemptedTopicIds.add(s.topic_id);
        if (s.status === "complete") completedTopicIds.add(s.topic_id);
        const cat = s.topic?.category;
        if (cat) categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
      }

      // Favourite category: the one with most completed sessions
      const favCategory = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

      const flashcardTopicIds = new Set<string>(
        (userFlashcards ?? [])
          .map((uf) => uf.flashcard?.topic_id)
          .filter((id): id is string => Boolean(id))
      );

      const now = Date.now();
      const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

      // Score each active topic
      const scored = (topics as TopicRow[]).map((t) => {
        let score = 0;
        if (completedTopicIds.has(t.id)) score -= 20;
        if (favCategory && t.category === favCategory) score += 10;
        if (!attemptedTopicIds.has(t.id)) score += 5;
        if (flashcardTopicIds.has(t.id)) score += 3;
        if (new Date(t.created_at).getTime() > sevenDaysAgo) score += 3;
        const dist = cefrDistance(userLevel, t.level);
        if (dist === 0) score += 15;
        else if (dist === 1) score += 8;
        return { id: t.id, score };
      });

      scored.sort((a, b) => b.score - a.score);
      const topIds = scored.slice(0, limit).map((s) => s.id);

      // Fetch full topic objects in one query
      const { data: fullTopics, error: fullError } = await fastify.supabase
        .from("topics")
        .select("*")
        .in("id", topIds);

      if (fullError) return reply.status(500).send({ message: fullError.message });

      // Re-order to preserve score ranking
      const topicMap = new Map((fullTopics ?? []).map((t: { id: string }) => [t.id, t]));
      const ordered = topIds.map((id) => topicMap.get(id)).filter(Boolean);

      return reply.send(toCamelCase(ordered));
    } catch (err) {
      fastify.log.error(err, "recommendations scoring failed");
      // Final fallback
      const { data, error } = await fastify.supabase
        .from("topics")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) return reply.status(500).send({ message: error.message });
      return reply.send(toCamelCase(data));
    }
  });
}
