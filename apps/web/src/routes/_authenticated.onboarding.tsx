import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { usePlacementQuestions, useUpdateProfile } from "@/hooks/use-api";
import { Logo } from "@/components/logo";
import { Spinner } from "@/components/ui/spinner";
import type { PlacementQuestion } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: OnboardingQuiz,
});

const SECTIONS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
const QUESTIONS_PER_SECTION = 4;

function computeLevel(answers: (number | null)[], questions: PlacementQuestion[]): string {
  let level = "A1";
  for (let s = 0; s < SECTIONS.length; s++) {
    const start = s * QUESTIONS_PER_SECTION;
    const slice = answers.slice(start, start + QUESTIONS_PER_SECTION);
    const correct = slice.filter((a, i) => a === questions[start + i]?.answer).length;
    if (correct >= 2) level = SECTIONS[s];
    else break;
  }
  return level;
}

function OnboardingQuiz() {
  const navigate = useNavigate();
  const { data: questions, isLoading: questionsLoading } = usePlacementQuestions();
  const updateProfile = useUpdateProfile();

  const [step, setStep] = useState<"welcome" | "quiz" | "result">("welcome");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);

  if (questionsLoading || !questions) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const qs: PlacementQuestion[] = questions;
  const totalQuestions = qs.length;
  const currentSection = Math.floor(questionIndex / QUESTIONS_PER_SECTION);
  const detectedLevel = computeLevel(answers, qs);
  const levelIndex = SECTIONS.indexOf(detectedLevel as typeof SECTIONS[number]);

  function handleAnswer(choice: number | null) {
    const updated = [...answers];
    updated[questionIndex] = choice;
    setAnswers(updated);
    setSelected(null);

    if (questionIndex < totalQuestions - 1) {
      setQuestionIndex(questionIndex + 1);
    } else {
      setStep("result");
    }
  }

  async function handleFinish() {
    const finalAnswers = answers.length < totalQuestions
      ? [...answers, ...Array(totalQuestions - answers.length).fill(null)]
      : answers;
    const level = computeLevel(finalAnswers, qs);
    await updateProfile.mutateAsync({ italianLevel: level, onboardingCompleted: true });
    navigate({ to: "/playground" });
  }

  async function handleSkipQuiz() {
    await updateProfile.mutateAsync({ italianLevel: "B1", onboardingCompleted: true });
    navigate({ to: "/playground" });
  }

  // ── Welcome screen ────────────────────────────────────────────────────
  if (step === "welcome") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-foreground">
        <div className="w-full max-w-md text-center">
          <div className="mb-8 flex justify-center">
            <Logo size={40} />
          </div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Welcome
          </p>
          <h1 className="mb-4 text-3xl font-bold tracking-tight">
            What's your Italian level?
          </h1>
          <p className="mb-2 text-[15px] leading-relaxed text-muted-foreground">
            {totalQuestions} questions across 6 CEFR levels — the same structure used by Italian universities to place students.
          </p>
          <p className="mb-10 text-sm text-muted-foreground/60">Takes about 5 minutes.</p>
          <button
            onClick={() => { setAnswers(Array(totalQuestions).fill(null)); setStep("quiz"); }}
            className="w-full rounded-lg bg-primary px-8 py-3.5 font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Start the test
          </button>
          <button
            onClick={handleSkipQuiz}
            className="mt-4 w-full text-sm text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          >
            Skip — I'll set my level later
          </button>
        </div>
      </div>
    );
  }

  // ── Quiz screen ───────────────────────────────────────────────────────
  if (step === "quiz") {
    const q = qs[questionIndex];
    const questionInSection = (questionIndex % QUESTIONS_PER_SECTION) + 1;

    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-foreground">
        <div className="w-full max-w-md">
          {/* Section progress bar */}
          <div className="mb-8 flex items-center gap-1.5">
            {SECTIONS.map((sec, i) => (
              <div key={sec} className="flex flex-1 flex-col gap-1.5">
                <div
                  className={`h-1 rounded-full transition-colors ${
                    i < currentSection
                      ? "bg-primary"
                      : i === currentSection
                      ? "bg-primary/40"
                      : "bg-border"
                  }`}
                />
                <span
                  className={`text-center font-mono text-[9px] tracking-wider ${
                    i === currentSection
                      ? "text-foreground"
                      : "text-muted-foreground/40"
                  }`}
                >
                  {sec}
                </span>
              </div>
            ))}
          </div>

          <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {q.level} · {questionInSection} of {QUESTIONS_PER_SECTION}
          </p>
          <h2 className="mb-8 text-xl font-bold leading-snug">{q.question}</h2>

          <div className="space-y-2.5">
            {q.options.map((opt, i) => (
              <button
                key={i}
                onClick={() => setSelected(i)}
                className={`w-full rounded-lg border px-5 py-3.5 text-left text-[15px] transition-colors ${
                  selected === i
                    ? "border-primary bg-accent text-accent-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>

          <button
            onClick={() => handleAnswer(selected)}
            disabled={selected === null}
            className="mt-6 w-full rounded-lg bg-primary px-8 py-3.5 font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-30"
          >
            {questionIndex < totalQuestions - 1 ? "Next" : "See my level"}
          </button>

          <button
            onClick={() => handleAnswer(null)}
            className="mt-3 w-full text-sm text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            I don't know — skip
          </button>

          <p className="mt-4 text-center text-xs text-muted-foreground/40">
            {questionIndex + 1} / {totalQuestions}
          </p>
        </div>
      </div>
    );
  }

  // ── Result screen ─────────────────────────────────────────────────────
  const totalCorrect = answers.filter((a, i) => a === qs[i]?.answer).length;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-foreground">
      <div className="w-full max-w-md text-center">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Your level
        </p>
        <div className="mb-2 text-7xl font-bold tracking-tight text-foreground">
          {detectedLevel}
        </div>
        <p className="mb-10 text-sm text-muted-foreground">
          {totalCorrect} of {totalQuestions} correct
        </p>

        {/* Section breakdown */}
        <div className="mb-10 flex items-end justify-center gap-2">
          {SECTIONS.map((sec, i) => {
            const start = i * QUESTIONS_PER_SECTION;
            const correct = answers
              .slice(start, start + QUESTIONS_PER_SECTION)
              .filter((a, j) => a === qs[start + j]?.answer).length;
            const passed = correct >= 2;
            return (
              <div key={sec} className="flex flex-col items-center gap-1.5">
                <span className={`font-mono text-[10px] ${passed ? "text-foreground" : "text-muted-foreground/40"}`}>
                  {correct}/4
                </span>
                <div
                  className={`w-9 rounded-sm transition-colors ${passed ? "bg-primary" : "bg-border"}`}
                  style={{ height: `${20 + i * 10}px` }}
                />
                <span className={`font-mono text-[10px] ${i === levelIndex ? "text-foreground font-semibold" : "text-muted-foreground/40"}`}>
                  {sec}
                </span>
              </div>
            );
          })}
        </div>

        <button
          onClick={handleFinish}
          disabled={updateProfile.isPending}
          className="w-full rounded-lg bg-primary px-8 py-3.5 font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {updateProfile.isPending ? "Saving…" : "Start learning"}
        </button>
      </div>
    </div>
  );
}
