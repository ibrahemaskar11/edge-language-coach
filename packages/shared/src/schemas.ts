import { z } from "zod";

// ─── Topic ───────────────────────────────────────────────

export const topicSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  level: z.string(),
  category: z.string(),
  talkingPoints: z.array(z.string()).optional(),
  createdAt: z.string().datetime(),
});

export type Topic = z.infer<typeof topicSchema>;

// ─── Session ─────────────────────────────────────────────

export const sessionStatusEnum = z.enum([
  "recording",
  "transcribing",
  "coaching",
  "complete",
]);

export const createSessionSchema = z.object({
  topicId: z.string().uuid(),
});

export const sessionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  topicId: z.string().uuid(),
  audioUrl: z.string().nullable(),
  transcript: z.string().nullable(),
  status: sessionStatusEnum,
  createdAt: z.string().datetime(),
  feedback: z.array(z.lazy(() => feedbackSchema)).optional(),
  topic: topicSchema.optional(),
});

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type Session = z.infer<typeof sessionSchema>;

// ─── Coaching Feedback ───────────────────────────────────

export const mistakeSchema = z.object({
  original: z.string(),
  correction: z.string(),
  explanation: z.string(),
});

export const goodPointSchema = z.object({
  phrase: z.string(),
  reason: z.string(),
});

export const feedbackContentSchema = z.object({
  mistakes: z.array(mistakeSchema),
  goodPoints: z.array(goodPointSchema),
  followUp: z.string(),
});

export const feedbackSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  type: z.enum(["mistakes", "good_points", "follow_up"]),
  content: z.unknown(),
  turn: z.number().int().positive(),
  createdAt: z.string().datetime(),
});

export type Mistake = z.infer<typeof mistakeSchema>;
export type GoodPoint = z.infer<typeof goodPointSchema>;
export type FeedbackContent = z.infer<typeof feedbackContentSchema>;
export type Feedback = z.infer<typeof feedbackSchema>;

// ─── API Responses ───────────────────────────────────────

export const transcribeResponseSchema = z.object({
  transcript: z.string(),
});

export const coachResponseSchema = feedbackContentSchema;

export type TranscribeResponse = z.infer<typeof transcribeResponseSchema>;
export type CoachResponse = z.infer<typeof coachResponseSchema>;

// ─── Mutation Inputs ────────────────────────────────────

export const updateSessionSchema = z.object({
  transcript: z.string().optional(),
  status: sessionStatusEnum.optional(),
  audioUrl: z.string().optional(),
});

export type UpdateSessionInput = z.infer<typeof updateSessionSchema>;

export const createFeedbackSchema = z.object({
  type: z.enum(["mistakes", "good_points", "follow_up"]),
  content: z.unknown(),
  turn: z.number().int().positive(),
});

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;

// ─── Flashcards ─────────────────────────────────────────

export const flashcardSchema = z.object({
  id: z.string().uuid(),
  topicId: z.string().uuid(),
  type: z.string(),
  front: z.string(),
  back: z.string(),
  createdAt: z.string().datetime(),
});

export type Flashcard = z.infer<typeof flashcardSchema>;

export const userFlashcardSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  flashcardId: z.string().uuid(),
  ease: z.number(),
  interval: z.number().int(),
  nextReview: z.string().datetime(),
  reviewCount: z.number().int(),
  createdAt: z.string().datetime(),
  flashcard: flashcardSchema.optional(),
});

export type UserFlashcard = z.infer<typeof userFlashcardSchema>;

export const reviewFlashcardSchema = z.object({
  rating: z.enum(["hard", "good", "easy"]),
});

export type ReviewFlashcardInput = z.infer<typeof reviewFlashcardSchema>;

// ─── Messages ────────────────────────────────────────────

export const messageSchema = z.object({
  id: z.string().uuid(),
  sessionId: z.string().uuid(),
  role: z.enum(["ai", "user"]),
  content: z.string(),
  turn: z.number().int(),
  createdAt: z.string().datetime(),
});

export type Message = z.infer<typeof messageSchema>;

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(2000),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const llmCoachResponseSchema = z.object({
  reply: z.string(),
  mistakes: z.array(mistakeSchema).default([]),
  goodPoints: z.array(goodPointSchema).default([]),
  followUp: z.string().default(""),
  shouldEndSession: z.boolean().optional(),
});

export type LlmCoachResponse = z.infer<typeof llmCoachResponseSchema>;

export const coachTurnResponseSchema = z.object({
  userMessage: messageSchema,
  aiMessage: messageSchema,
  feedback: feedbackContentSchema,
  turnNumber: z.number().int(),
  totalTurns: z.number().int(),
  sessionComplete: z.boolean(),
});

export type CoachTurnResponse = z.infer<typeof coachTurnResponseSchema>;
