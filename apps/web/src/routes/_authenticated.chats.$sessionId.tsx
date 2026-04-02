import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useSession } from "@/hooks/use-api";

export const Route = createFileRoute("/_authenticated/chats/$sessionId")({
  component: ChatDetailPage,
});

type ChatMessage = { role: "ai" | "user"; text: string };

function parseTranscript(transcript: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const lines = transcript.split("\n");
  let current: ChatMessage | null = null;

  for (const line of lines) {
    if (line.startsWith("AI: ")) {
      if (current) messages.push(current);
      current = { role: "ai", text: line.slice(4) };
    } else if (line.startsWith("User: ")) {
      if (current) messages.push(current);
      current = { role: "user", text: line.slice(6) };
    } else if (current) {
      current.text += "\n" + line;
    }
  }
  if (current) messages.push(current);
  return messages;
}

interface Mistake {
  original: string;
  correction: string;
  explanation: string;
}

interface GoodPoint {
  phrase: string;
  reason: string;
}

function parseFeedback(feedback: any[]) {
  const mistakes: Mistake[] = [];
  const goodPoints: GoodPoint[] = [];
  let followUp = "";

  for (const fb of feedback) {
    const content = fb.content as any;
    if (fb.type === "mistakes" && content?.mistakes) {
      mistakes.push(...content.mistakes);
    } else if (fb.type === "good_points" && content?.goodPoints) {
      goodPoints.push(...content.goodPoints);
    } else if (fb.type === "follow_up" && content?.followUp) {
      followUp = content.followUp;
    }
  }

  return { mistakes, goodPoints, followUp };
}

function ChatDetailPage() {
  const { sessionId } = Route.useParams();
  const { data: session, isLoading } = useSession(sessionId);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="space-y-4">
        <Link to="/chats" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to Past Chats
        </Link>
        <p>Session not found.</p>
      </div>
    );
  }

  const messages = session.transcript ? parseTranscript(session.transcript) : [];
  const { mistakes, goodPoints, followUp } = parseFeedback(session.feedback ?? []);

  return (
    <div className="space-y-6">
      <Link
        to="/chats"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        &larr; Back to Past Chats
      </Link>

      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">
            {session.topic?.title ?? "Untitled"}
          </h1>
          <Badge variant="secondary" className="text-xs">
            {session.topic?.level}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date(session.createdAt).toLocaleDateString()} &middot;{" "}
          {messages.length} messages &middot; {session.status}
        </p>
      </div>

      {/* Conversation */}
      {messages.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Conversation
          </h2>
          <div className="space-y-4">
            {messages.map((msg, i) => (
              <div key={i} className="flex gap-3">
                {msg.role === "ai" ? (
                  <>
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/50 text-xs text-muted-foreground">
                      AI
                    </div>
                    <Card className="max-w-2xl border-border/50">
                      <CardContent className="p-4">
                        <p className="text-sm">{msg.text}</p>
                      </CardContent>
                    </Card>
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
          </div>
        </section>
      )}

      {/* Feedback */}
      {(mistakes.length > 0 || goodPoints.length > 0 || followUp) && (
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Session Feedback
          </h2>

          {/* Mistakes */}
          {mistakes.length > 0 && (
            <Card className="border-border/50">
              <CardContent className="space-y-3 p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-red-400">
                  Corrections
                </p>
                {mistakes.map((m, i) => (
                  <div key={i} className="rounded-md bg-accent/50 px-3 py-2 text-sm">
                    <p className="text-muted-foreground">
                      <span className="line-through">{m.original}</span>
                      {" → "}
                      <span className="font-medium text-foreground">{m.correction}</span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">{m.explanation}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Good Points */}
          {goodPoints.length > 0 && (
            <Card className="border-border/50">
              <CardContent className="space-y-3 p-5">
                <p className="text-xs font-medium uppercase tracking-wider text-green-400">
                  Good Points
                </p>
                {goodPoints.map((gp, i) => (
                  <div key={i} className="rounded-md bg-accent/50 px-3 py-2 text-sm">
                    <p className="font-medium">"{gp.phrase}"</p>
                    <p className="mt-1 text-xs text-muted-foreground">{gp.reason}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Follow Up */}
          {followUp && (
            <Card className="border-border/50">
              <CardContent className="p-5">
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Next Steps
                </p>
                <p className="text-sm text-muted-foreground">{followUp}</p>
              </CardContent>
            </Card>
          )}
        </section>
      )}

      {/* Empty state */}
      {messages.length === 0 && mistakes.length === 0 && (
        <Card className="border-border/50">
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">
              This session doesn't have any content yet.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
