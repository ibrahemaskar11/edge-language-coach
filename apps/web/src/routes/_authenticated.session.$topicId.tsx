import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { Mic } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTopic, useCreateSession } from "@/hooks/use-api";

export const Route = createFileRoute("/_authenticated/session/$topicId")({
  component: ChatSessionPage,
});

type Message = {
  role: "ai" | "user";
  text: string;
  corrections?: { label: string; text: string }[];
};

function ChatSessionPage() {
  const { topicId } = Route.useParams();
  const { data: topic } = useTopic(topicId);
  const createSession = useCreateSession();
  const sessionIdRef = useRef<string | null>(null);

  const [messages] = useState<Message[]>([
    {
      role: "ai",
      text: "Ciao! Sono il tuo coach di italiano. Parliamo di questo argomento. Come vuoi iniziare?",
    },
  ]);
  const [sessionEnded, setSessionEnded] = useState(false);

  const currentTurn = 1;
  const totalTurns = 5;

  // Create session record on mount
  useEffect(() => {
    if (!sessionIdRef.current && !createSession.isPending) {
      createSession.mutate(
        { topicId },
        {
          onSuccess: (session) => {
            sessionIdRef.current = session.id;
          },
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">
            {topic?.title ?? "Loading..."}
          </h1>
          {topic && (
            <Badge variant="secondary" className="text-xs">
              {topic.level}
            </Badge>
          )}
        </div>
        {topic && (
          <p className="mt-1 text-sm text-muted-foreground">
            {topic.description}
          </p>
        )}
      </div>

      {/* Messages */}
      <div className="space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className="flex gap-3">
            {msg.role === "ai" ? (
              <>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/50 text-xs text-muted-foreground">
                  AI
                </div>
                <div className="max-w-2xl space-y-2">
                  {msg.corrections && (
                    <Card className="border-border/50">
                      <CardContent className="space-y-2 p-4">
                        {msg.corrections.map((c, j) => (
                          <div
                            key={j}
                            className="rounded-md bg-accent/50 px-3 py-2 text-sm text-muted-foreground"
                          >
                            <span className="font-medium">{c.label}</span>
                            {c.text}
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                  <Card className="border-border/50">
                    <CardContent className="p-4">
                      <p className="text-sm">{msg.text}</p>
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              <>
                <div className="flex-1" />
                <Card className="max-w-2xl border-border/50 bg-accent/30">
                  <CardContent className="p-4">
                    <p className="text-sm">{msg.text}</p>
                  </CardContent>
                </Card>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/50 text-xs text-muted-foreground">
                  Y
                </div>
              </>
            )}
          </div>
        ))}

        {/* End state */}
        {sessionEnded && (
          <div className="flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/50 text-xs text-muted-foreground">
              AI
            </div>
            <div className="max-w-2xl space-y-2">
              <Card className="border-border/50">
                <CardContent className="p-4">
                  <p className="text-sm">
                    Complimenti! Hai coperto questo argomento molto bene. Ottimo lavoro!
                  </p>
                  <div className="mt-3 rounded-md bg-accent/50 px-3 py-2 text-sm">
                    <span className="text-xs font-bold uppercase tracking-wider">
                      Session Complete
                    </span>
                    <span className="ml-3 text-muted-foreground">
                      {totalTurns}/{totalTurns} turns
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>

      {/* Bottom bar */}
      {sessionEnded ? (
        <div className="flex gap-3">
          <Button variant="outline" asChild>
            <Link to="/topics">Back to Topics</Link>
          </Button>
        </div>
      ) : (
        <Card className="border-border/50">
          <CardContent className="flex items-center gap-4 p-4">
            <button
              onClick={() => setSessionEnded(true)}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border/50 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
            >
              <Mic className="h-5 w-5" />
            </button>
            <div className="flex-1">
              <p className="text-sm font-medium">Press to record your response</p>
              <p className="text-xs text-muted-foreground">
                Speak in Italian. Your audio will be transcribed and analyzed.
              </p>
            </div>
            <span className="shrink-0 text-sm text-muted-foreground">
              Turn {currentTurn}/{totalTurns}
            </span>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
