import type { FastifyInstance } from "fastify";
import { reviewFlashcardSchema } from "@edge/shared";
import { ZodError } from "zod";
import { toCamelCase } from "../utils/camelcase.js";

export async function flashcardRoutes(fastify: FastifyInstance) {
  // Get user's flashcard decks grouped by topic
  fastify.get("/api/flashcards", async (request, reply) => {
    // Get user's topics
    const { data: userTopics, error: utError } = await fastify.supabase
      .from("user_topics")
      .select("topic_id")
      .eq("user_id", request.userId);

    if (utError) return reply.status(500).send({ message: utError.message });

    const topicIds = (userTopics ?? []).map((ut) => ut.topic_id);
    if (topicIds.length === 0) return reply.send([]);

    // Get topics with their flashcard counts
    const { data: topics } = await fastify.supabase
      .from("topics")
      .select("id, title, level")
      .in("id", topicIds);

    // Get all user flashcards for these topics
    const { data: userFlashcards } = await fastify.supabase
      .from("user_flashcards")
      .select("id, flashcard_id, next_review, review_count, flashcard:flashcards(topic_id)")
      .eq("user_id", request.userId);

    const now = new Date().toISOString();
    const decks = (topics ?? [])
      .map((topic) => {
        const topicCards = (userFlashcards ?? []).filter(
          (uf: any) => uf.flashcard?.topic_id === topic.id
        );
        const dueToday = topicCards.filter(
          (uf) => uf.next_review <= now
        ).length;
        const totalReviews = topicCards.reduce(
          (sum, uf) => sum + (uf.review_count ?? 0),
          0
        );

        return {
          topicId: topic.id,
          title: topic.title,
          level: topic.level,
          totalCards: topicCards.length,
          dueToday,
          totalReviews,
        };
      })
      .filter((d) => d.totalCards > 0);

    return reply.send(decks);
  });

  // Get due flashcards for a topic
  fastify.get<{ Params: { topicId: string } }>(
    "/api/flashcards/:topicId",
    async (request, reply) => {
      const { topicId } = request.params;
      const now = new Date().toISOString();

      const { data, error } = await fastify.supabase
        .from("user_flashcards")
        .select("*, flashcard:flashcards(*)")
        .eq("user_id", request.userId)
        .lte("next_review", now);

      if (error) return reply.status(500).send({ message: error.message });

      // Filter by topic (join filter)
      const filtered = (data ?? []).filter(
        (uf: any) => uf.flashcard?.topic_id === topicId
      );

      return reply.send(toCamelCase(filtered));
    }
  );

  // Get all flashcards for a topic
  fastify.get<{ Params: { topicId: string } }>(
    "/api/flashcards/:topicId/all",
    async (request, reply) => {
      const { topicId } = request.params;

      const { data, error } = await fastify.supabase
        .from("user_flashcards")
        .select("*, flashcard:flashcards(*)")
        .eq("user_id", request.userId);

      if (error) return reply.status(500).send({ message: error.message });

      const filtered = (data ?? []).filter(
        (uf: any) => uf.flashcard?.topic_id === topicId
      );

      return reply.send(toCamelCase(filtered));
    }
  );

  // Review a flashcard (SRS update)
  fastify.post<{ Params: { id: string } }>(
    "/api/flashcards/:id/review",
    async (request, reply) => {
      let body;
      try {
        body = reviewFlashcardSchema.parse(request.body);
      } catch (err) {
        if (err instanceof ZodError) {
          return reply
            .status(400)
            .send({ message: "Validation error", errors: err.flatten().fieldErrors });
        }
        throw err;
      }

      const { data: uf } = await fastify.supabase
        .from("user_flashcards")
        .select("*")
        .eq("id", request.params.id)
        .eq("user_id", request.userId)
        .single();

      if (!uf) {
        return reply.status(404).send({ message: "Flashcard not found" });
      }

      let ease = uf.ease as number;
      let interval = uf.interval as number;
      const now = new Date();

      switch (body.rating) {
        case "hard":
          ease = Math.max(1.3, ease - 0.2);
          interval = Math.max(1, Math.round(interval * 0.5));
          break;
        case "good":
          interval = Math.round(interval * ease);
          break;
        case "easy":
          ease = Math.min(3.0, ease + 0.15);
          interval = Math.round(interval * ease * 1.3);
          break;
      }

      const nextReview = new Date(
        now.getTime() + interval * 24 * 60 * 60 * 1000
      );

      const { data, error } = await fastify.supabase
        .from("user_flashcards")
        .update({
          ease,
          interval,
          next_review: nextReview.toISOString(),
          review_count: (uf.review_count as number) + 1,
        })
        .eq("id", uf.id)
        .select("*, flashcard:flashcards(*)")
        .single();

      if (error) return reply.status(500).send({ message: error.message });
      return reply.send(toCamelCase(data));
    }
  );
}
