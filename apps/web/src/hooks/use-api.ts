import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/queries";
import type {
  CreateSessionInput,
  UpdateSessionInput,
  CreateFeedbackInput,
  ReviewFlashcardInput,
} from "@edge/shared";

// ─── Topics ─────────────────────────────────────────────
export function useTopics() {
  return useQuery({ queryKey: ["topics"], queryFn: api.fetchTopics });
}

export function useTopic(id: string) {
  return useQuery({
    queryKey: ["topics", id],
    queryFn: () => api.fetchTopic(id),
    enabled: !!id,
  });
}

// ─── Sessions ───────────────────────────────────────────
export function useSessions() {
  return useQuery({ queryKey: ["sessions"], queryFn: api.fetchSessions });
}

export function useSession(id: string) {
  return useQuery({
    queryKey: ["sessions", id],
    queryFn: () => api.fetchSession(id),
    enabled: !!id,
  });
}

export function useCreateSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateSessionInput) => api.createSession(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

export function useUpdateSession(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateSessionInput) => api.updateSession(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sessions", id] });
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
}

// ─── Feedback ───────────────────────────────────────────
export function useFeedback(sessionId: string) {
  return useQuery({
    queryKey: ["feedback", sessionId],
    queryFn: () => api.fetchFeedback(sessionId),
    enabled: !!sessionId,
  });
}

export function useCreateFeedback(sessionId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateFeedbackInput) =>
      api.createFeedback(sessionId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["feedback", sessionId] });
    },
  });
}

// ─── Stats ──────────────────────────────────────────────
export function useStats() {
  return useQuery({ queryKey: ["stats"], queryFn: api.fetchStats });
}

// ─── Flashcards ─────────────────────────────────────────
export function useFlashcardDecks() {
  return useQuery({
    queryKey: ["flashcard-decks"],
    queryFn: api.fetchFlashcardDecks,
  });
}

export function useDueFlashcards(topicId: string) {
  return useQuery({
    queryKey: ["flashcards", topicId, "due"],
    queryFn: () => api.fetchDueFlashcards(topicId),
    enabled: !!topicId,
  });
}

export function useAllFlashcards(topicId: string) {
  return useQuery({
    queryKey: ["flashcards", topicId, "all"],
    queryFn: () => api.fetchAllFlashcards(topicId),
    enabled: !!topicId,
  });
}

export function useReviewFlashcard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, rating }: { id: string; rating: ReviewFlashcardInput["rating"] }) =>
      api.reviewFlashcard(id, { rating }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flashcards"] });
      qc.invalidateQueries({ queryKey: ["flashcard-decks"] });
    },
  });
}
