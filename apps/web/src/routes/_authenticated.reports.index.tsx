import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useStats } from "@/hooks/use-api";

export const Route = createFileRoute("/_authenticated/reports/")({
  component: ReportsPage,
});

function ReportsPage() {
  const { data: stats } = useStats();

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
        <p className="mt-1 text-muted-foreground">Track your learning progress</p>
      </div>

      {/* This Week */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          This Week
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { value: String(stats?.sessionsThisWeek ?? 0), label: "Sessions this week" },
            { value: String(stats?.totalSessions ?? 0), label: "Total sessions" },
            { value: String(stats?.completedSessions ?? 0), label: "Completed" },
          ].map((stat) => (
            <Card key={stat.label} className="border-border/50">
              <CardContent className="p-5">
                <p className="text-3xl font-bold">{stat.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Common Mistakes */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Common Mistakes
        </h2>
        <Card className="border-border/50">
          <CardContent className="space-y-3 p-5">
            {[
              "Subjunctive mood — 8 occurrences",
              "Article agreement — 5 occurrences",
              'Preposition "di" vs "da" — 3 occurrences',
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>&bull;</span>
                <span>{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* Strengths */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Strengths
        </h2>
        <Card className="border-border/50">
          <CardContent className="space-y-3 p-5">
            {[
              "Vocabulary range — above average",
              "Pronunciation fluency — improving",
              "Past tense usage — consistent",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>&bull;</span>
                <span>{item}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* Past Reports */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Past Reports
        </h2>
        <Card className="border-border/50">
          <CardContent className="divide-y divide-border/50 p-0">
            {[
              { id: "mar-24", week: "Week of Mar 24", sessions: 5, accuracy: "78%" },
              { id: "mar-17", week: "Week of Mar 17", sessions: 3, accuracy: "72%" },
              { id: "mar-10", week: "Week of Mar 10", sessions: 4, accuracy: "75%" },
            ].map((report) => (
              <Link
                key={report.id}
                to="/reports/$reportId"
                params={{ reportId: report.id }}
                className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-accent/50"
              >
                <span className="text-sm text-muted-foreground">
                  {report.week} &middot; {report.sessions} sessions &middot;{" "}
                  {report.accuracy} accuracy
                </span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  View <ArrowRight className="inline h-3 w-3" />
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
