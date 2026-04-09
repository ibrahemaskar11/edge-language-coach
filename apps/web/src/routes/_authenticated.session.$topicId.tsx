import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useTopic, useCreateSession } from "@/hooks/use-api";
import * as api from "@/lib/queries";
import type { SendMessageInput, CoachTurnResponse } from "@edge/shared";

export const Route = createFileRoute("/_authenticated/session/$topicId")({
  component: ChatSessionPage,
});

type Mistake = { original: string; correction: string; explanation: string };
type GoodPoint = { phrase: string; reason: string };

type ChatMsg = {
  role: "ai" | "user";
  content: string;
  mistakes?: Mistake[];
  goodPoints?: GoodPoint[];
};

const GREETING: ChatMsg = {
  role: "ai",
  content:
    "Ciao! Sono il tuo coach di italiano. Parliamo di questo argomento. Come vuoi iniziare?",
};

function ChatSessionPage() {
  const { topicId } = Route.useParams();
  const { data: topic } = useTopic(topicId);
  const createSession = useCreateSession();
  const qc = useQueryClient();

  const sessionIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [messages, setMessages] = useState<ChatMsg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [turnNumber, setTurnNumber] = useState(0);
  const [totalTurns, setTotalTurns] = useState(5);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);

  const sendMutation = useMutation<CoachTurnResponse, Error, SendMessageInput>({
    mutationFn: (body) => {
      const sid = sessionIdRef.current;
      if (!sid) throw new Error("No session");
      return api.sendMessage(sid, body);
    },
    onSuccess: (data) => {
      const sid = sessionIdRef.current!;
      setTurnNumber(data.turnNumber);
      setTotalTurns(data.totalTurns);
      setMessages((prev) => [
        ...prev,
        {
          role: "ai",
          content: data.aiMessage.content,
          mistakes: data.feedback.mistakes,
          goodPoints: data.feedback.goodPoints,
        },
      ]);
      if (data.sessionComplete) {
        setSessionComplete(true);
        qc.invalidateQueries({ queryKey: ["sessions"] });
        qc.invalidateQueries({ queryKey: ["sessions", sid] });
        qc.invalidateQueries({ queryKey: ["stats"] });
      }
    },
    onError: (_err, _vars, _ctx) => {
      // Remove optimistic user message on failure
      setMessages((prev) => prev.filter((_, i) => i !== prev.length - 1));
    },
  });

  const endMutation = useMutation({
    mutationFn: () => {
      const sid = sessionIdRef.current;
      if (!sid) throw new Error("No session");
      return api.endSession(sid);
    },
    onSuccess: () => {
      const sid = sessionIdRef.current!;
      setSessionComplete(true);
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["sessions", sid] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  // Create session on mount
  useEffect(() => {
    createSession.mutate(
      { topicId },
      {
        onSuccess: (session) => {
          sessionIdRef.current = session.id;
          setSessionStarted(true);
        },
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    const content = input.trim();
    if (!content || !sessionIdRef.current || sendMutation.isPending || sessionComplete) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content }]);
    sendMutation.mutate({ content });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

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
          <p className="mt-1 text-sm text-muted-foreground">{topic.description}</p>
        )}
      </div>

      {/* Messages */}
      <div className="space-y-4 pb-2">
        {messages.map((msg, i) => (
          <div key={i} className="flex gap-3">
            {msg.role === "ai" ? (
              <>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/50 text-xs text-muted-foreground">
                  AI
                </div>
                <div className="max-w-2xl space-y-2">
                  {/* Inline feedback */}
                  {(msg.mistakes && msg.mistakes.length > 0) ||
                  (msg.goodPoints && msg.goodPoints.length > 0) ? (
                    <Card className="border-border/50">
                      <CardContent className="space-y-2 p-4">
                        {msg.mistakes && msg.mistakes.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium uppercase tracking-wider text-red-400">
                              Corrections
                            </p>
                            {msg.mistakes.map((m, j) => (
                              <div
                                key={j}
                                className="rounded-md bg-accent/50 px-3 py-2 text-sm"
                              >
                                <p className="text-muted-foreground">
                                  <span className="line-through">{m.original}</span>
                                  {" → "}
                                  <span className="font-medium text-foreground">
                                    {m.correction}
                                  </span>
                                </p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {m.explanation}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                        {msg.goodPoints && msg.goodPoints.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium uppercase tracking-wider text-green-400">
                              Good Points
                            </p>
                            {msg.goodPoints.map((gp, j) => (
                              <div
                                key={j}
                                className="rounded-md bg-accent/50 px-3 py-2 text-sm"
                              >
                                <p className="font-medium">"{gp.phrase}"</p>
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {gp.reason}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ) : null}
                  <Card className="border-border/50">
                    <CardContent className="p-4">
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </CardContent>
                  </Card>
                </div>
              </>
            ) : (
              <>
                <div className="flex-1" />
                <Card className="max-w-2xl border-border/50 bg-accent/30">
                  <CardContent className="p-4">
                    <p className="text-sm">{msg.content}</p>
                  </CardContent>
                </Card>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/50 text-xs text-muted-foreground">
                  Y
                </div>
              </>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {sendMutation.isPending && (
          <div className="flex gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/50 text-xs text-muted-foreground">
              AI
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="h-4 w-4" />
              <span>Thinking...</span>
            </div>
          </div>
        )}

        {/* Session complete */}
        {sessionComplete && (
          <div className="rounded-md border border-border/50 bg-accent/20 p-4 text-center">
            <p className="text-sm font-medium">Session complete</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {turnNumber}/{totalTurns} turns &middot; Great work!
            </p>
            <div className="mt-3 flex justify-center gap-3">
              {sessionIdRef.current && (
                <Button variant="outline" size="sm" asChild>
                  <Link to="/chats/$sessionId" params={{ sessionId: sessionIdRef.current }}>
                    View Summary
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="sm" asChild>
                <Link to="/topics">Back to Topics</Link>
              </Button>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      {!sessionComplete && (
        <Card className="border-border/50">
          <CardContent className="flex items-center gap-3 p-3">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={sessionStarted ? "Scrivi in italiano…" : "Setting up session…"}
              disabled={!sessionStarted || sendMutation.isPending}
              className="flex-1 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
            />
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-muted-foreground">
                {turnNumber}/{totalTurns}
              </span>
              <Button
                size="sm"
                onClick={handleSend}
                disabled={!input.trim() || !sessionStarted || sendMutation.isPending}
              >
                <Send className="h-4 w-4" />
              </Button>
              <button
                onClick={() => endMutation.mutate()}
                disabled={!sessionStarted || endMutation.isPending}
                className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
              >
                End
              </button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
