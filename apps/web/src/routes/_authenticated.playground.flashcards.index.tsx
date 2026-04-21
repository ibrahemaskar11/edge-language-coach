import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useFlashcardDecks } from "@/hooks/use-api";

export const Route = createFileRoute("/_authenticated/playground/flashcards/")({
  component: FlashcardsPage,
});

function FlashcardsPage() {
  const { data: decks, isLoading } = useFlashcardDecks();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const totalDue = decks?.reduce((sum, d) => sum + d.dueToday, 0) ?? 0;
  const totalCards = decks?.reduce((sum, d) => sum + d.totalCards, 0) ?? 0;
  const totalReviews = decks?.reduce((sum, d) => sum + d.totalReviews, 0) ?? 0;
  const retention = totalReviews > 0 ? Math.round((totalReviews / (totalCards * 3)) * 100) : 0;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Flashcards</h1>
        <p className="mt-1 text-muted-foreground">
          Review cards from your coaching sessions
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-border/50">
          <CardContent className="p-5">
            <p className="text-3xl font-bold">{totalDue}</p>
            <p className="mt-1 text-sm text-muted-foreground">Cards due today</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-5">
            <p className="text-3xl font-bold">{totalCards}</p>
            <p className="mt-1 text-sm text-muted-foreground">Total cards</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="p-5">
            <p className="text-3xl font-bold">{retention || "—"}%</p>
            <p className="mt-1 text-sm text-muted-foreground">Retention rate</p>
          </CardContent>
        </Card>
      </div>

      {/* By Topic */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          By Topic
        </h2>
        {!decks?.length ? (
          <p className="text-sm text-muted-foreground">No flashcard decks yet.</p>
        ) : (
          <div className="space-y-3">
            {decks.map((deck) => (
              <Link
                key={deck.topicId}
                to="/playground/flashcards/$topicId"
                params={{ topicId: deck.topicId }}
              >
                <Card className="border-border/50 transition-colors hover:bg-accent/50">
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="space-y-1">
                        <p className="font-semibold">{deck.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {deck.level} &middot; {deck.totalCards} cards &middot;{" "}
                          {deck.dueToday} due today
                        </p>
                      </div>
                      <span className="shrink-0 text-sm text-muted-foreground">
                        Review <ArrowRight className="inline h-3 w-3" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
