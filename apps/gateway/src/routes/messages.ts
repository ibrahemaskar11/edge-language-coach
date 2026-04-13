import type { FastifyInstance } from "fastify";
import { sendMessageSchema, llmCoachResponseSchema } from "@edge/shared";
import { ZodError } from "zod";
import { toCamelCase } from "../utils/camelcase.js";
import { env } from "../env.js";

function triggerFlashcardGeneration(fastify: FastifyInstance, sessionId: string, userId: string) {
  fetch(`${env.FLASHCARD_GENERATOR_URL}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, userId }),
  }).catch((err) => fastify.log.warn(`flashcard-generator unavailable: ${err}`));
}

function triggerSummaryGeneration(fastify: FastifyInstance, sessionId: string, userId: string) {
  fetch(`${env.SUMMARY_GENERATOR_URL}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, userId }),
  }).catch((err) => fastify.log.warn(`summary-generator unavailable: ${err}`));
}

const TOTAL_TURNS = 5;

function buildSystemPrompt(topic: {
  title: string;
  description: string;
  level: string;
  talkingPoints: string[];
}, turnNumber: number): string {
  const isLastTurn = turnNumber >= TOTAL_TURNS;
  const talkingPointsList = topic.talkingPoints.length
    ? topic.talkingPoints.map((p, i) => `${i + 1}. ${p}`).join("\n")
    : "No specific talking points.";

  return `You are an Italian language coach helping a student practice conversational Italian.

## Session Info
- Topic: ${topic.title}
- Level: ${topic.level}
- Description: ${topic.description}
- Talking Points:
${talkingPointsList}
- Current turn: ${turnNumber} of ${TOTAL_TURNS}

## Your Role
- Converse naturally in Italian at the ${topic.level} level
- Gently correct grammar and vocabulary mistakes
- Praise good language usage when you notice it
- Keep the conversation moving through the topic's talking points
- Keep your reply concise (2-4 sentences)
${isLastTurn ? "- This is the FINAL turn. Wrap up the conversation with a brief summary of what was discussed and encourage the student." : ""}

## Response Format
You MUST respond with valid JSON only — no markdown, no extra text:
{
  "reply": "Your Italian response here",
  "mistakes": [
    { "original": "student's incorrect phrase", "correction": "corrected phrase", "explanation": "brief explanation in English" }
  ],
  "goodPoints": [
    { "phrase": "student's good phrase", "reason": "why it was good (in English)" }
  ],
  "followUp": "A short follow-up question or prompt in Italian to continue the conversation",
  "shouldEndSession": ${isLastTurn ? "true" : "false"}
}

If there are no mistakes, set "mistakes" to [].
If there are no good points, set "goodPoints" to [].`;
}

export async function messageRoutes(fastify: FastifyInstance) {
  // POST /api/sessions/:id/messages — send a user message and get AI response
  fastify.post<{ Params: { id: string } }>(
    "/api/sessions/:id/messages",
    async (request, reply) => {
      let body;
      try {
        body = sendMessageSchema.parse(request.body);
      } catch (err) {
        if (err instanceof ZodError) {
          return reply
            .status(400)
            .send({ message: "Validation error", errors: err.flatten().fieldErrors });
        }
        throw err;
      }

      const sessionId = request.params.id;

      // Verify session ownership and status
      const { data: session } = await fastify.supabase
        .from("sessions")
        .select("id, user_id, status, topic_id")
        .eq("id", sessionId)
        .single();

      if (!session) {
        return reply.status(404).send({ message: "Session not found" });
      }
      if (session.user_id !== request.userId) {
        return reply.status(403).send({ message: "Forbidden" });
      }
      if (session.status === "complete") {
        return reply.status(400).send({ message: "Session is already complete" });
      }

      // Fetch topic
      const { data: topic } = await fastify.supabase
        .from("topics")
        .select("id, title, description, level, talking_points")
        .eq("id", session.topic_id)
        .single();

      if (!topic) {
        return reply.status(404).send({ message: "Topic not found" });
      }

      // Fetch existing messages for context
      const { data: existingMessages } = await fastify.supabase
        .from("messages")
        .select("role, content, turn")
        .eq("session_id", sessionId)
        .order("turn", { ascending: true });

      const messages = existingMessages ?? [];
      const userMessageCount = messages.filter((m) => m.role === "user").length;
      const turnNumber = userMessageCount + 1;

      // Insert user message
      const { data: userMsg, error: userMsgError } = await fastify.supabase
        .from("messages")
        .insert({
          session_id: sessionId,
          role: "user",
          content: body.content,
          turn: turnNumber,
        })
        .select()
        .single();

      if (userMsgError) {
        return reply.status(500).send({ message: userMsgError.message });
      }

      // Build conversation history for Groq
      const groqMessages: Array<{ role: "system" | "assistant" | "user"; content: string }> = [
        {
          role: "system",
          content: buildSystemPrompt(
            {
              title: topic.title,
              description: topic.description,
              level: topic.level,
              talkingPoints: topic.talking_points ?? [],
            },
            turnNumber
          ),
        },
        ...messages.map((m) => ({
          role: m.role === "ai" ? ("assistant" as const) : ("user" as const),
          content: m.content,
        })),
        { role: "user", content: body.content },
      ];

      // Call Groq
      let llmResponse: ReturnType<typeof llmCoachResponseSchema.parse>;
      try {
        const completion = await fastify.groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: groqMessages,
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_tokens: 1024,
        });

        const raw = completion.choices[0]?.message?.content ?? "{}";
        llmResponse = llmCoachResponseSchema.parse(JSON.parse(raw));
      } catch (err) {
        fastify.log.error(err, "Groq call failed");
        return reply.status(502).send({ message: "AI service error" });
      }

      // Insert AI message
      const { data: aiMsg, error: aiMsgError } = await fastify.supabase
        .from("messages")
        .insert({
          session_id: sessionId,
          role: "ai",
          content: llmResponse.followUp
            ? `${llmResponse.reply}\n\n${llmResponse.followUp}`
            : llmResponse.reply,
          turn: turnNumber,
        })
        .select()
        .single();

      if (aiMsgError) {
        return reply.status(500).send({ message: aiMsgError.message });
      }

      // Insert feedback rows
      const feedbackRows: Array<{
        session_id: string;
        type: string;
        content: unknown;
        turn: number;
      }> = [];

      if (llmResponse.mistakes.length > 0) {
        feedbackRows.push({
          session_id: sessionId,
          type: "mistakes",
          content: { mistakes: llmResponse.mistakes },
          turn: turnNumber,
        });
      }

      if (llmResponse.goodPoints.length > 0) {
        feedbackRows.push({
          session_id: sessionId,
          type: "good_points",
          content: { goodPoints: llmResponse.goodPoints },
          turn: turnNumber,
        });
      }

      if (llmResponse.followUp) {
        feedbackRows.push({
          session_id: sessionId,
          type: "follow_up",
          content: { followUp: llmResponse.followUp },
          turn: turnNumber,
        });
      }

      if (feedbackRows.length > 0) {
        await fastify.supabase.from("feedback").insert(feedbackRows);
      }

      // End session when turn limit is reached or LLM signals completion
      const sessionComplete =
        turnNumber >= TOTAL_TURNS || llmResponse.shouldEndSession === true;

      if (sessionComplete) {
        await fastify.supabase
          .from("sessions")
          .update({ status: "complete" })
          .eq("id", sessionId);
        triggerFlashcardGeneration(fastify, sessionId, request.userId);
        triggerSummaryGeneration(fastify, sessionId, request.userId);
      }

      return reply.status(201).send(
        toCamelCase({
          user_message: userMsg,
          ai_message: aiMsg,
          feedback: {
            mistakes: llmResponse.mistakes,
            good_points: llmResponse.goodPoints,
            follow_up: llmResponse.followUp,
          },
          turn_number: turnNumber,
          total_turns: TOTAL_TURNS,
          session_complete: sessionComplete,
        })
      );
    }
  );

  // GET /api/sessions/:id/messages — list all messages
  fastify.get<{ Params: { id: string } }>(
    "/api/sessions/:id/messages",
    async (request, reply) => {
      const sessionId = request.params.id;

      // Verify ownership
      const { data: session } = await fastify.supabase
        .from("sessions")
        .select("user_id")
        .eq("id", sessionId)
        .single();

      if (!session) {
        return reply.status(404).send({ message: "Session not found" });
      }
      if (session.user_id !== request.userId) {
        return reply.status(403).send({ message: "Forbidden" });
      }

      const { data, error } = await fastify.supabase
        .from("messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("turn", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) return reply.status(500).send({ message: error.message });
      return reply.send(toCamelCase(data));
    }
  );

  // POST /api/sessions/:id/end — end session early
  fastify.post<{ Params: { id: string } }>(
    "/api/sessions/:id/end",
    async (request, reply) => {
      const sessionId = request.params.id;

      const { data: session } = await fastify.supabase
        .from("sessions")
        .select("user_id, status")
        .eq("id", sessionId)
        .single();

      if (!session) {
        return reply.status(404).send({ message: "Session not found" });
      }
      if (session.user_id !== request.userId) {
        return reply.status(403).send({ message: "Forbidden" });
      }

      const { data, error } = await fastify.supabase
        .from("sessions")
        .update({ status: "complete" })
        .eq("id", sessionId)
        .select()
        .single();

      if (error) return reply.status(500).send({ message: error.message });
      triggerFlashcardGeneration(fastify, sessionId, request.userId);
      triggerSummaryGeneration(fastify, sessionId, request.userId);
      return reply.send(toCamelCase(data));
    }
  );
}
