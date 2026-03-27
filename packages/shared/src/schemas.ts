import { z } from "zod";

// ─── Topic ───────────────────────────────────────────────

export const topicSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  level: z.string(),
  category: z.string(),
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
