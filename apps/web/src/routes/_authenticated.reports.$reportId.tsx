import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";

export const Route = createFileRoute("/_authenticated/reports/$reportId")({
  component: ReportDetailPage,
});

const mockReportData: Record<
  string,
  {
    week: string;
    summary: string;
    stats: { value: string; label: string }[];
    sessions: { topic: string; score: string }[];
    mistakes: string[];
    strengths: string[];
  }
> = {
  "mar-24": {
    week: "Week of Mar 24, 2026",
    summary: "5 sessions · 32 flashcards reviewed · 78% grammar accuracy",
    stats: [
      { value: "5", label: "Sessions completed" },
      { value: "32", label: "Flashcards reviewed" },
      { value: "78%", label: "Grammar accuracy" },
      { value: "4.2", label: "Avg turns per session" },
    ],
    sessions: [
      { topic: "Technology & Society", score: "Score: 7/10" },
      { topic: "Italian Culture & Identity", score: "Score: 8/10" },
      { topic: "Sustainable Living", score: "Score: 6/10" },
      { topic: "Work-Life Balance", score: "Score: 9/10" },
      { topic: "Education Systems", score: "Score: 7/10" },
    ],
    mistakes: [
      "Subjunctive mood — 8 occurrences",
      "Article agreement — 5 occurrences",
      'Preposition "di" vs "da" — 3 occ.',
    ],
    strengths: [
      "Vocabulary range — above average",
      "Pronunciation fluency — improving",
      "Past tense usage — consistent",
    ],
  },
  "mar-17": {
    week: "Week of Mar 17, 2026",
    summary: "3 sessions · 18 flashcards reviewed · 72% grammar accuracy",
    stats: [
      { value: "3", label: "Sessions completed" },
      { value: "18", label: "Flashcards reviewed" },
      { value: "72%", label: "Grammar accuracy" },
      { value: "3.7", label: "Avg turns per session" },
    ],
    sessions: [
      { topic: "Technology & Society", score: "Score: 6/10" },
      { topic: "Italian Culture & Identity", score: "Score: 7/10" },
      { topic: "Education Systems", score: "Score: 8/10" },
    ],
    mistakes: [
      "Subjunctive mood — 6 occurrences",
      "Conditional tense — 4 occurrences",
      "Word order — 3 occurrences",
    ],
    strengths: [
      "Vocabulary range — improving",
      "Listening comprehension — strong",
      "Cultural references — natural",
    ],
  },
  "mar-10": {
    week: "Week of Mar 10, 2026",
    summary: "4 sessions · 25 flashcards reviewed · 75% grammar accuracy",
    stats: [
      { value: "4", label: "Sessions completed" },
      { value: "25", label: "Flashcards reviewed" },
      { value: "75%", label: "Grammar accuracy" },
      { value: "4.0", label: "Avg turns per session" },
    ],
    sessions: [
      { topic: "Sustainable Living", score: "Score: 7/10" },
      { topic: "Work-Life Balance", score: "Score: 8/10" },
      { topic: "Social Media Impact", score: "Score: 6/10" },
      { topic: "Technology & Society", score: "Score: 7/10" },
    ],
    mistakes: [
      "Subjunctive mood — 5 occurrences",
      "Article agreement — 4 occurrences",
      "Reflexive verbs — 3 occurrences",
    ],
    strengths: [
      "Pronunciation fluency — above average",
      "Vocabulary range — consistent",
      "Conversation flow — natural",
    ],
  },
};

function ReportDetailPage() {
  const { reportId } = Route.useParams();
  const report = mockReportData[reportId] ?? mockReportData["mar-24"]!;

  return (
    <div className="space-y-10">
      <Link
        to="/reports"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        &larr; Back to Reports
      </Link>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">{report.week}</h1>
        <p className="mt-1 text-muted-foreground">{report.summary}</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {report.stats.map((stat) => (
          <Card key={stat.label} className="border-border/50">
            <CardContent className="p-5">
              <p className="text-3xl font-bold">{stat.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sessions This Week */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Sessions This Week
        </h2>
        <Card className="border-border/50">
          <CardContent className="divide-y divide-border/50 p-0">
            {report.sessions.map((session) => (
              <div
                key={session.topic}
                className="flex items-center justify-between px-5 py-3"
              >
                <span className="text-sm font-medium">{session.topic}</span>
                <span className="text-sm text-muted-foreground">
                  {session.score}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* Common Mistakes + Strengths side by side */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Common Mistakes
          </h2>
          <Card className="border-border/50">
            <CardContent className="space-y-3 p-5">
              {report.mistakes.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>&bull;</span>
                  <span>{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Strengths
          </h2>
          <Card className="border-border/50">
            <CardContent className="space-y-3 p-5">
              {report.strengths.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>&bull;</span>
                  <span>{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
