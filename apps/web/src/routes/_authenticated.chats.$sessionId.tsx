import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { useSession, useMessages } from "@/hooks/use-api";

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

type TurnFeedback = { mistakes: Mistake[]; goodPoints: GoodPoint[] };

function buildFeedbackByTurn(feedback: any[]): Map<number, TurnFeedback> {
  const map = new Map<number, TurnFeedback>();
  for (const fb of feedback) {
    const turn = fb.turn ?? 0;
    if (!map.has(turn)) map.set(turn, { mistakes: [], goodPoints: [] });
    const entry = map.get(turn)!;
    const content = fb.content as any;
    if (fb.type === "mistakes" && content?.mistakes) {
      entry.mistakes.push(...content.mistakes);
    } else if (fb.type === "good_points" && content?.goodPoints) {
      entry.goodPoints.push(...content.goodPoints);
    }
  }
  return map;
}

function ChatDetailPage() {
  const { sessionId } = Route.useParams();
  const { data: session, isLoading: sessionLoading } = useSession(sessionId);
  const { data: dbMessages, isLoading: messagesLoading } = useMessages(sessionId);

  const isLoading = sessionLoading || messagesLoading;

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

  // Use messages table if available, fall back to transcript blob for old sessions
  const messages: Array<{ role: "ai" | "user"; text: string; turn: number }> =
    dbMessages && dbMessages.length > 0
      ? dbMessages.map((m) => ({ role: m.role as "ai" | "user", text: m.content, turn: m.turn }))
      : session.transcript
      ? parseTranscript(session.transcript).map((m, i) => ({ ...m, turn: Math.floor(i / 2) + 1 }))
      : [];

  const feedbackByTurn = buildFeedbackByTurn(session.feedback ?? []);

  return (
    <div className="flex flex-col gap-6">
      <Link
        to="/chats"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        &larr; Back to Past Chats
      </Link>

      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">
            {session.topic?.title ?? "Untitled"}
          </h1>
          <Badge variant="secondary" className="text-xs">
            {session.topic?.level}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {session.status}
          </Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {new Date(session.createdAt).toLocaleDateString()} &middot;{" "}
          {messages.length} messages
        </p>
      </div>

      {/* Conversation with inline feedback */}
      {messages.length > 0 ? (
        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className="flex gap-3">
              {msg.role === "ai" ? (
                <>
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/50 text-xs text-muted-foreground">
                    AI
                  </div>
                  <div className="max-w-2xl space-y-2">
                    {/* Inline feedback for this turn */}
                    {(() => {
                      const fb = feedbackByTurn.get(msg.turn);
                      if (!fb) return null;
                      return (
                        <>
                          {fb.mistakes.length > 0 && (
                            <Card className="border-border/50">
                              <CardContent className="space-y-2 p-4">
                                <p className="text-xs font-medium uppercase tracking-wider text-red-400">
                                  Corrections
                                </p>
                                {fb.mistakes.map((m, j) => (
                                  <div key={j} className="rounded-md bg-accent/50 px-3 py-2 text-sm">
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
                          {fb.goodPoints.length > 0 && (
                            <Card className="border-border/50">
                              <CardContent className="space-y-2 p-4">
                                <p className="text-xs font-medium uppercase tracking-wider text-green-400">
                                  Good Points
                                </p>
                                {fb.goodPoints.map((gp, j) => (
                                  <div key={j} className="rounded-md bg-accent/50 px-3 py-2 text-sm">
                                    <p className="font-medium">"{gp.phrase}"</p>
                                    <p className="mt-1 text-xs text-muted-foreground">{gp.reason}</p>
                                  </div>
                                ))}
                              </CardContent>
                            </Card>
                          )}
                        </>
                      );
                    })()}
                    <Card className="border-border/50">
                      <CardContent className="p-4">
                        <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
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
        </div>
      ) : (
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
