import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useDueFlashcards, useReviewFlashcard, useTopic } from "@/hooks/use-api";

export const Route = createFileRoute("/_authenticated/flashcards/$topicId")({
  component: FlashcardReviewPage,
});

function FlashcardReviewPage() {
  const { topicId } = Route.useParams();
  const { data: cards, isLoading } = useDueFlashcards(topicId);
  const { data: topic } = useTopic(topicId);
  const reviewMutation = useReviewFlashcard();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [completed, setCompleted] = useState(0);

  // Snapshot cards on first load so the count stays stable during the session
  const sessionCardsRef = useRef<NonNullable<typeof cards> | null>(null);
  if (cards && sessionCardsRef.current === null) {
    sessionCardsRef.current = cards;
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const dueCards = sessionCardsRef.current ?? [];
  const totalDue = dueCards.length;
  const card = dueCards[currentIndex];
  const isDone = completed >= totalDue || !card;

  function handleRate(rating: "hard" | "good" | "easy") {
    if (!card) return;
    reviewMutation.mutate({ id: card.id, rating });
    setRevealed(false);
    setCompleted((c) => c + 1);
    if (currentIndex < dueCards.length - 1) {
      setCurrentIndex((i) => i + 1);
    }
  }

  const progress = isDone ? totalDue : completed + 1;
  const progressPercent = totalDue > 0 ? (progress / totalDue) * 100 : 100;

  return (
    <div className="space-y-6">
      <Link
        to="/flashcards"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        &larr; Back to Flashcards
      </Link>

      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">
          {topic?.title ?? "Loading..."}
        </h1>
        {topic && (
          <Badge variant="secondary" className="text-xs">
            {topic.level}
          </Badge>
        )}
        <Badge variant="outline" className="text-xs">
          {totalDue} due
        </Badge>
      </div>

      {isDone ? (
        <div className="flex flex-col items-center gap-4 py-16">
          <p className="text-lg font-medium">
            {totalDue === 0 ? "No cards due!" : "All cards reviewed!"}
          </p>
          <p className="text-sm text-muted-foreground">
            {totalDue === 0
              ? "You're all caught up. Come back later."
              : "Great work. Come back later for more."}
          </p>
          <Button asChild variant="outline">
            <Link to="/flashcards">Back to Flashcards</Link>
          </Button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-6 py-8">
          <Card
            className="w-full max-w-lg cursor-pointer border-border/50"
            onClick={() => setRevealed(!revealed)}
          >
            <CardContent className="flex min-h-[240px] flex-col items-center justify-center p-8 text-center">
              {revealed ? (
                <p className="text-xl font-semibold">
                  {card!.flashcard?.back}
                </p>
              ) : (
                <>
                  <p className="mb-4 text-xs uppercase tracking-wider text-muted-foreground">
                    {card!.flashcard?.type}
                  </p>
                  <p className="text-xl font-semibold">
                    {card!.flashcard?.front}
                  </p>
                  <p className="mt-4 text-sm text-muted-foreground">
                    Tap to reveal
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {revealed && (
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => handleRate("hard")}
                className="w-28 text-red-400 hover:text-red-400"
              >
                Hard
              </Button>
              <Button
                variant="outline"
                onClick={() => handleRate("good")}
                className="w-28 text-yellow-400 hover:text-yellow-400"
              >
                Good
              </Button>
              <Button
                variant="outline"
                onClick={() => handleRate("easy")}
                className="w-28 text-green-400 hover:text-green-400"
              >
                Easy
              </Button>
            </div>
          )}

          <div className="w-full max-w-lg space-y-2">
            <p className="text-center text-sm text-muted-foreground">
              Progress: {progress} / {totalDue}
            </p>
            <div className="h-1 w-full overflow-hidden rounded-full bg-border/50">
              <div
                className="h-full rounded-full bg-foreground/30 transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
