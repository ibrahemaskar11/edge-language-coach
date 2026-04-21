import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useStats, useReports, useReport } from "@/hooks/use-api";

export const Route = createFileRoute("/_authenticated/playground/reports/")({
  component: ReportsPage,
});

function ReportsPage() {
  const { data: stats } = useStats();
  const { data: reports, isLoading: reportsLoading } = useReports();

  // Fetch the most recent week's detail to show aggregated mistakes/strengths
  const latestWeekId = reports?.[0]?.weekId ?? "";
  const { data: latestDetail } = useReport(latestWeekId);

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

      {/* Common Mistakes — from most recent week */}
      {latestDetail && latestDetail.topMistakes.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Recent Mistake Patterns
          </h2>
          <Card className="border-border/50">
            <CardContent className="space-y-3 p-5">
              {latestDetail.topMistakes.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>&bull;</span>
                  <span>{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Strengths — from most recent week */}
      {latestDetail && latestDetail.topStrengths.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Recent Strengths
          </h2>
          <Card className="border-border/50">
            <CardContent className="space-y-3 p-5">
              {latestDetail.topStrengths.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>&bull;</span>
                  <span>{item}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Past Reports */}
      <section className="space-y-3">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Past Reports
        </h2>
        {reportsLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="h-5 w-5" />
          </div>
        ) : !reports || reports.length === 0 ? (
          <Card className="border-border/50">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">
                No sessions yet. Complete a session to see your weekly reports.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border/50">
            <CardContent className="divide-y divide-border/50 p-0">
              {reports.map((report) => (
                <Link
                  key={report.weekId}
                  to="/playground/reports/$reportId"
                  params={{ reportId: report.weekId }}
                  className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-accent/50"
                >
                  <span className="text-sm text-muted-foreground">
                    {report.weekLabel} &middot; {report.sessionCount}{" "}
                    {report.sessionCount === 1 ? "session" : "sessions"} &middot;{" "}
                    {report.completedCount} completed
                  </span>
                  <span className="shrink-0 text-sm text-muted-foreground">
                    View <ArrowRight className="inline h-3 w-3" />
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
