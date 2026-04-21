import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useSessions } from "@/hooks/use-api";

export const Route = createFileRoute("/_authenticated/playground/chats/")({
  component: ChatsPage,
});

function ChatsPage() {
  const { data: sessions, isLoading } = useSessions();

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Past Chats</h1>
        <p className="mt-1 text-muted-foreground">
          Review your conversation history
        </p>
      </div>

      {!sessions?.length ? (
        <Card className="border-border/50">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">
              No conversations yet.{" "}
              <Link to="/playground/topics" className="underline hover:text-foreground">
                Start your first session!
              </Link>
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <Link
              key={session.id}
              to="/playground/chats/$sessionId"
              params={{ sessionId: session.id }}
            >
              <Card className="border-border/50 transition-colors hover:bg-accent/50">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="font-semibold">
                        {session.topic?.title ?? "Untitled"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(session.createdAt).toLocaleDateString()} &middot;{" "}
                        {session.topic?.level ?? ""} &middot; {session.status}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm text-muted-foreground">
                      View <ArrowRight className="inline h-3 w-3" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
