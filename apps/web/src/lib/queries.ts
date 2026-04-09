import { apiFetch } from "./api";
import type {
  Topic,
  Session,
  Feedback,
  CreateSessionInput,
  UpdateSessionInput,
  CreateFeedbackInput,
  UserFlashcard,
  ReviewFlashcardInput,
  Message,
  SendMessageInput,
  CoachTurnResponse,
} from "@edge/shared";

// ─── Topics ─────────────────────────────────────────────
export const fetchTopics = () => apiFetch<Topic[]>("/topics");
export const fetchTopic = (id: string) => apiFetch<Topic>(`/topics/${id}`);

// ─── Sessions ───────────────────────────────────────────
export const createSession = (body: CreateSessionInput) =>
  apiFetch<Session>("/sessions", {
    method: "POST",
    body: JSON.stringify(body),
  });

export const fetchSessions = () => apiFetch<Session[]>("/sessions");

export const fetchSession = (id: string) =>
  apiFetch<Session>(`/sessions/${id}`);

export const updateSession = (id: string, body: UpdateSessionInput) =>
  apiFetch<Session>(`/sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });

// ─── Feedback ───────────────────────────────────────────
export const fetchFeedback = (sessionId: string) =>
  apiFetch<Feedback[]>(`/sessions/${sessionId}/feedback`);

export const createFeedback = (
  sessionId: string,
  body: CreateFeedbackInput
) =>
  apiFetch<Feedback>(`/sessions/${sessionId}/feedback`, {
    method: "POST",
    body: JSON.stringify(body),
  });

// ─── Stats ──────────────────────────────────────────────
export interface Stats {
  sessionsThisWeek: number;
  totalSessions: number;
  completedSessions: number;
  recentSessions: Session[];
}

export const fetchStats = () => apiFetch<Stats>("/stats");

// ─── Flashcards ─────────────────────────────────────────
export interface FlashcardDeck {
  topicId: string;
  title: string;
  level: string;
  totalCards: number;
  dueToday: number;
  totalReviews: number;
}

export const fetchFlashcardDecks = () =>
  apiFetch<FlashcardDeck[]>("/flashcards");

export const fetchDueFlashcards = (topicId: string) =>
  apiFetch<UserFlashcard[]>(`/flashcards/${topicId}`);

export const fetchAllFlashcards = (topicId: string) =>
  apiFetch<UserFlashcard[]>(`/flashcards/${topicId}/all`);

export const reviewFlashcard = (id: string, body: ReviewFlashcardInput) =>
  apiFetch<UserFlashcard>(`/flashcards/${id}/review`, {
    method: "POST",
    body: JSON.stringify(body),
  });

// ─── Messages ────────────────────────────────────────────
export const fetchMessages = (sessionId: string) =>
  apiFetch<Message[]>(`/sessions/${sessionId}/messages`);

export const sendMessage = (sessionId: string, body: SendMessageInput) =>
  apiFetch<CoachTurnResponse>(`/sessions/${sessionId}/messages`, {
    method: "POST",
    body: JSON.stringify(body),
  });

export const endSession = (sessionId: string) =>
  apiFetch<Session>(`/sessions/${sessionId}/end`, { method: "POST" });
