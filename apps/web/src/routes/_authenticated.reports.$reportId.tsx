import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useReport } from "@/hooks/use-api";

export const Route = createFileRoute("/_authenticated/reports/$reportId")({
  component: ReportDetailPage,
});

function ReportDetailPage() {
  const { reportId } = Route.useParams();
  const { data: report, isLoading, error } = useReport(reportId);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="space-y-4">
        <Link to="/reports" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to Reports
        </Link>
        <p className="text-sm text-muted-foreground">Report not found.</p>
      </div>
    );
  }

  const completedSessions = report.sessions.filter((s) => s.status === "complete");
  const scoredSessions = completedSessions.filter((s) => s.score !== null);
  const avgScore =
    scoredSessions.length > 0
      ? Math.round(
          scoredSessions.reduce((sum, s) => sum + (s.score ?? 0), 0) / scoredSessions.length
        )
      : null;

  return (
    <div className="space-y-10">
      <Link
        to="/reports"
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        &larr; Back to Reports
      </Link>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">{report.weekLabel}</h1>
        <p className="mt-1 text-muted-foreground">
          {report.sessions.length} {report.sessions.length === 1 ? "session" : "sessions"} &middot;{" "}
          {completedSessions.length} completed
          {avgScore !== null ? ` \u00b7 avg score ${avgScore}/10` : ""}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { value: String(report.sessions.length), label: "Sessions" },
          { value: String(completedSessions.length), label: "Completed" },
          { value: avgScore !== null ? `${avgScore}/10` : "—", label: "Avg score" },
          { value: String(report.topMistakes.length), label: "Mistake patterns" },
        ].map((stat) => (
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
              <Link
                key={session.id}
                to="/chats/$sessionId"
                params={{ sessionId: session.id }}
                className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-accent/50"
              >
                <span className="text-sm font-medium">{session.topicTitle}</span>
                <span className="text-sm text-muted-foreground">
                  {session.score !== null ? `Score: ${session.score}/10` : session.status}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </section>

      {/* Common Mistakes + Strengths side by side */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Mistake Patterns
          </h2>
          <Card className="border-border/50">
            <CardContent className="space-y-3 p-5">
              {report.topMistakes.length > 0 ? (
                report.topMistakes.map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>&bull;</span>
                    <span>{item}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Complete sessions to see mistake patterns here.
                </p>
              )}
            </CardContent>
          </Card>
        </section>
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Grammar Focus
          </h2>
          <Card className="border-border/50">
            <CardContent className="space-y-3 p-5">
              {report.topStrengths.length > 0 ? (
                report.topStrengths.map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>&bull;</span>
                    <span>{item}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">
                  Complete sessions to see grammar patterns here.
                </p>
              )}
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
