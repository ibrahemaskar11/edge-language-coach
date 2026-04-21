import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Mic, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useTopic } from "@/hooks/use-api";
import * as api from "@/lib/queries";
import type { SendMessageInput, CoachTurnResponse } from "@edge/shared";

export const Route = createFileRoute("/_authenticated/playground/session/$topicId")({
  component: ChatSessionPage,
});

type Mistake = { original: string; correction: string; explanation: string };
type GoodPoint = { phrase: string; reason: string };

type ChatMsg = {
  role: "ai" | "user";
  content: string;
  transcribed?: boolean;
  mistakes?: Mistake[];
  goodPoints?: GoodPoint[];
};

const GREETING: ChatMsg = {
  role: "ai",
  content:
    "Ciao! Sono il tuo coach di italiano. Parliamo di questo argomento. Come vuoi iniziare?",
};

// ─── Voice Recorder ──────────────────────────────────────

type VoiceState = "idle" | "recording" | "transcribing";

interface VoiceRecorderHandle { start: () => void }
interface VoiceRecorderProps {
  onTranscribed: (text: string) => void;
  onStateChange: (active: boolean) => void;
  disabled: boolean;
}

const VoiceRecorder = forwardRef<VoiceRecorderHandle, VoiceRecorderProps>(function VoiceRecorder({
  onTranscribed,
  onStateChange,
  disabled,
}, ref) {
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [elapsed, setElapsed] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const barsContainerRef = useRef<HTMLDivElement>(null);

  const cleanup = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    cancelAnimationFrame(animFrameRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    audioCtxRef.current?.close().catch(() => {});
    mediaRecorderRef.current = null;
    streamRef.current = null;
    audioCtxRef.current = null;
    analyserRef.current = null;
  }, []);

  useEffect(() => cleanup, [cleanup]);

  // Drive waveform bars via direct DOM mutation (no React re-renders at 60 fps)
  useEffect(() => {
    if (voiceState !== "recording") return;
    const analyser = analyserRef.current;
    const container = barsContainerRef.current;
    if (!analyser || !container) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const bars = Array.from(container.children) as HTMLElement[];
    const step = Math.max(1, Math.floor(bufferLength / bars.length));

    const draw = () => {
      animFrameRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      bars.forEach((bar, i) => {
        const val = dataArray[i * step] / 255;
        bar.style.height = `${Math.max(8, val * 100)}%`;
      });
    };
    draw();

    return () => cancelAnimationFrame(animFrameRef.current);
  }, [voiceState]);

  const transition = (s: VoiceState) => {
    setVoiceState(s);
    onStateChange(s !== "idle");
  };

  const startRecording = useCallback(async () => {
    if (disabled) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64; // 32 frequency bins
      source.connect(analyser);
      analyserRef.current = analyser;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.start();

      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
      transition("recording");
    } catch {
      // microphone permission denied or unavailable
    }
  }, [disabled]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(ref, () => ({ start: startRecording }), [startRecording]);

  const cancel = () => {
    mediaRecorderRef.current?.stop();
    cleanup();
    chunksRef.current = [];
    setElapsed(0);
    transition("idle");
  };

  const send = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    cancelAnimationFrame(animFrameRef.current);

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });

    cleanup();
    transition("transcribing");

    try {
      const blob = new Blob(chunksRef.current, { type: "audio/webm" });
      chunksRef.current = [];
      const text = await api.transcribeAudio(blob);
      if (text.trim()) onTranscribed(text.trim());
    } catch {
      // transcription failed — just return to idle
    } finally {
      setElapsed(0);
      transition("idle");
    }
  };

  const fmt = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (voiceState === "idle") return null;

  return (
    <div className="flex flex-1 items-center gap-3 min-w-0">
      {voiceState === "recording" ? (
        <>
          {/* Pulsing dot + timer */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xs tabular-nums text-muted-foreground">
              {fmt(elapsed)}
            </span>
          </div>

          {/* Animated frequency bars */}
          <div
            ref={barsContainerRef}
            className="flex flex-1 items-center gap-[2px] h-8 overflow-hidden"
            aria-hidden
          >
            {Array.from({ length: 28 }, (_, i) => (
              <div
                key={i}
                className="w-[3px] rounded-full bg-primary flex-shrink-0"
                style={{ height: "8%" }}
              />
            ))}
          </div>

          {/* Cancel / Send */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={cancel}
              title="Cancel"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-border/50 text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void send()}
              title="Send"
              className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
          </div>
        </>
      ) : (
        /* Transcribing */
        <div className="flex flex-1 items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="h-4 w-4" />
          <span>Transcribing…</span>
        </div>
      )}
    </div>
  );
});

// ─── Chat Session Page ────────────────────────────────────

function ChatSessionPage() {
  const { topicId } = Route.useParams();
  const { data: topic } = useTopic(topicId);
  const qc = useQueryClient();

  const sessionIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const voiceRecorderRef = useRef<VoiceRecorderHandle>(null);

  const [messages, setMessages] = useState<ChatMsg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [turnNumber, setTurnNumber] = useState(0);
  const [totalTurns, setTotalTurns] = useState(5);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);

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
    onError: () => {
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

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const ensureSession = async (): Promise<string | null> => {
    let sid = sessionIdRef.current;
    if (sid) return sid;

    setCreatingSession(true);
    try {
      const session = await api.createSession({ topicId });
      sid = session.id;
      sessionIdRef.current = session.id;
      qc.invalidateQueries({ queryKey: ["sessions"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      return sid;
    } catch {
      return null;
    } finally {
      setCreatingSession(false);
    }
  };

  const handleSend = async () => {
    const content = input.trim();
    if (!content || sendMutation.isPending || creatingSession || sessionComplete) return;

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setMessages((prev) => [...prev, { role: "user", content }]);

    const sid = await ensureSession();
    if (!sid) {
      setMessages((prev) => prev.slice(0, -1));
      return;
    }

    sendMutation.mutate({ content });
  };

  const handleVoiceTranscribed = async (text: string) => {
    if (!text || sendMutation.isPending || creatingSession || sessionComplete) return;

    setMessages((prev) => [...prev, { role: "user", content: text, transcribed: true }]);

    const sid = await ensureSession();
    if (!sid) {
      setMessages((prev) => prev.slice(0, -1));
      return;
    }

    sendMutation.mutate({ content: text });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const isBusy = sendMutation.isPending || creatingSession;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
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
                    {msg.transcribed && (
                      <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground/70">
                        <Mic className="h-3 w-3" />
                        transcribed from voice
                      </p>
                    )}
                  </CardContent>
                </Card>
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/50 text-xs text-muted-foreground">
                  Y
                </div>
              </>
            )}
          </div>
        ))}

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

        {sessionComplete && (
          <div className="rounded-md border border-border/50 bg-accent/20 p-4 text-center">
            <p className="text-sm font-medium">Session complete</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {turnNumber}/{totalTurns} turns &middot; Great work!
            </p>
            <div className="mt-3 flex justify-center gap-3">
              {sessionIdRef.current && (
                <Button variant="outline" size="sm" asChild>
                  <Link to="/playground/chats/$sessionId" params={{ sessionId: sessionIdRef.current }}>
                    View Summary
                  </Link>
                </Button>
              )}
              <Button variant="outline" size="sm" asChild>
                <Link to="/playground/topics">Back to Topics</Link>
              </Button>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      {!sessionComplete && (
        <Card className="border-border/50 rounded-full bg-accent/40">
          <CardContent className="flex items-center gap-2 px-4 py-3">
            {!voiceActive && (
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Scrivi in italiano…"
                disabled={isBusy}
                rows={1}
                className="flex-1 resize-none overflow-hidden border-0 bg-transparent py-[6px] px-2 text-sm shadow-none outline-none focus:outline-none placeholder:text-muted-foreground max-h-[200px] disabled:opacity-50 leading-5"
              />
            )}

            {/* VoiceRecorder — renders nothing in idle, expands into waveform bar when active */}
            <VoiceRecorder
              ref={voiceRecorderRef}
              onTranscribed={(text) => void handleVoiceTranscribed(text)}
              onStateChange={setVoiceActive}
              disabled={isBusy || sessionComplete}
            />

            {!voiceActive && (
              <div className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-muted-foreground">
                  {turnNumber}/{totalTurns}
                </span>
                <Button
                  size="icon"
                  onClick={input.trim() ? () => void handleSend() : () => void voiceRecorderRef.current?.start()}
                  disabled={isBusy}
                  className="h-8 w-8 shrink-0 rounded-full"
                >
                  {input.trim() ? (
                    <ArrowUp className="h-4 w-4" />
                  ) : (
                    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-4 w-4">
                      <line x1="3" y1="6" x2="3" y2="10" />
                      <line x1="8" y1="3" x2="8" y2="13" />
                      <line x1="13" y1="6" x2="13" y2="10" />
                    </svg>
                  )}
                </Button>
                <button
                  onClick={() => endMutation.mutate()}
                  disabled={!sessionIdRef.current || endMutation.isPending}
                  className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                >
                  End
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
