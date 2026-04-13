import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useAuthStore } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useTopics, useStats, useSessions, useFlashcardDecks, useRecommendedTopics } from "@/hooks/use-api";

export const Route = createFileRoute("/_authenticated/")({
  component: PlaygroundPage,
});

function PlaygroundPage() {
  const user = useAuthStore((s) => s.user);
  const firstName =
    user?.user_metadata?.fullName?.split(" ")[0] ??
    user?.email?.split("@")[0] ??
    "there";

  const { data: topics, isLoading: topicsLoading } = useTopics();
  const { data: stats, isLoading: statsLoading } = useStats();
  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const { data: decks } = useFlashcardDecks();
  const { data: recommendedData, isLoading: recLoading } = useRecommendedTopics();

  const isLoading = topicsLoading || statsLoading || sessionsLoading || recLoading;

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const recommendedTopics = recommendedData?.slice(0, 4) ?? topics?.slice(0, 4) ?? [];
  const recentSessions = stats?.recentSessions ?? sessions?.slice(0, 3) ?? [];
  const totalDue = decks?.reduce((sum, d) => sum + d.dueToday, 0) ?? 0;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Playground</h1>
        <p className="mt-1 text-muted-foreground">
          Welcome back, {firstName}. Ready to practice your Italian?
        </p>
      </div>

      {/* Quick Access */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Quick Access
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link to="/topics">
            <Card className="border-border/50 transition-colors hover:bg-accent/50">
              <CardContent className="p-5">
                <p className="font-semibold">New Session</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Start practicing
                </p>
              </CardContent>
            </Card>
          </Link>
          <Link to="/flashcards">
            <Card className="border-border/50 transition-colors hover:bg-accent/50">
              <CardContent className="p-5">
                <p className="font-semibold">Flashcards</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {totalDue > 0 ? `${totalDue} due today` : "Review your cards"}
                </p>
              </CardContent>
            </Card>
          </Link>
          <Link to="/reports">
            <Card className="border-border/50 transition-colors hover:bg-accent/50">
              <CardContent className="p-5">
                <p className="font-semibold">Reports</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  View progress
                </p>
              </CardContent>
            </Card>
          </Link>
        </div>
      </section>

      {/* Recommended for You */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Recommended for You
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {recommendedTopics.map((topic) => (
            <Link key={topic.id} to="/topics/$topicId" params={{ topicId: topic.id }}>
              <Card className="border-border/50 transition-colors hover:bg-accent/50">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold">{topic.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {topic.level} &middot; {topic.category}
                      </p>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      Start <ArrowRight className="inline h-3 w-3" />
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">
                    {topic.description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
        <div className="text-right">
          <Link
            to="/topics"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            View all topics <ArrowRight className="inline h-3 w-3" />
          </Link>
        </div>
      </section>

      {/* Recent Activity */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Recent Activity
        </h2>
        <Card className="border-border/50">
          <CardContent className="space-y-3 p-5">
            {recentSessions.length > 0 ? (
              recentSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <span>&bull;</span>
                  {session.topic?.title ?? "Untitled"} &middot;{" "}
                  {new Date(session.createdAt).toLocaleDateString()} &middot;{" "}
                  {session.status}
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No sessions yet. Start your first one!
              </p>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Your Stats */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Your Stats
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            {
              value: String(stats?.sessionsThisWeek ?? 0),
              label: "Sessions this week",
            },
            {
              value: String(stats?.totalSessions ?? 0),
              label: "Total sessions",
            },
            {
              value: String(stats?.completedSessions ?? 0),
              label: "Completed",
            },
          ].map((stat) => (
            <Card key={stat.label} className="border-border/50">
              <CardContent className="p-5">
                <p className="text-3xl font-bold">{stat.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {stat.label}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
