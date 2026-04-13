import type { FastifyInstance } from "fastify";
import { toCamelCase } from "../utils/camelcase.js";

// --- ISO week helpers ---

function toISOWeekId(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Thursday of current week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function weekMondayFromId(weekId: string): Date {
  const [yearStr, wStr] = weekId.split("-W");
  const year = parseInt(yearStr, 10);
  const week = parseInt(wStr, 10);
  // Jan 4 is always in ISO week 1
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4.getTime() - (jan4Day - 1) * 86400000);
  return new Date(week1Monday.getTime() + (week - 1) * 7 * 86400000);
}

function weekLabel(weekId: string): string {
  const monday = weekMondayFromId(weekId);
  return `Week of ${monday.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  })}`;
}

function topN<T>(
  items: T[],
  key: (item: T) => string,
  n: number
): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

// --- Route registration ---

export async function reportRoutes(fastify: FastifyInstance) {
  // GET /api/reports — list of ISO-week summaries for the authenticated user
  fastify.get("/api/reports", async (request, reply) => {
    const { data, error } = await fastify.supabase
      .from("sessions")
      .select("id, created_at, status")
      .eq("user_id", request.userId)
      .order("created_at", { ascending: false });

    if (error) return reply.status(500).send({ message: error.message });

    const sessions = data ?? [];

    // Group by ISO week
    const weeks = new Map<string, { sessionCount: number; completedCount: number }>();
    for (const s of sessions) {
      const weekId = toISOWeekId(new Date(s.created_at));
      if (!weeks.has(weekId)) {
        weeks.set(weekId, { sessionCount: 0, completedCount: 0 });
      }
      const w = weeks.get(weekId)!;
      w.sessionCount++;
      if (s.status === "complete") w.completedCount++;
    }

    const result = [...weeks.entries()]
      .sort((a, b) => b[0].localeCompare(a[0])) // newest first
      .map(([weekId, counts]) => ({
        weekId,
        weekLabel: weekLabel(weekId),
        ...counts,
      }));

    return reply.send(result);
  });

  // GET /api/reports/:weekId — full stats for a specific ISO week
  fastify.get<{ Params: { weekId: string } }>(
    "/api/reports/:weekId",
    async (request, reply) => {
      const { weekId } = request.params;

      // Validate weekId format
      if (!/^\d{4}-W\d{2}$/.test(weekId)) {
        return reply.status(400).send({ message: "Invalid weekId format. Expected YYYY-Www" });
      }

      const monday = weekMondayFromId(weekId);
      const nextMonday = new Date(monday.getTime() + 7 * 86400000);

      // Fetch sessions in this week with summary + topic title
      const { data: sessions, error: sessErr } = await fastify.supabase
        .from("sessions")
        .select("id, created_at, status, summary, topic:topics(title)")
        .eq("user_id", request.userId)
        .gte("created_at", monday.toISOString())
        .lt("created_at", nextMonday.toISOString())
        .order("created_at", { ascending: false });

      if (sessErr) return reply.status(500).send({ message: sessErr.message });

      const sessionList = sessions ?? [];

      if (sessionList.length === 0) {
        return reply.status(404).send({ message: "No sessions found for this week" });
      }

      // Build per-session data
      const sessionItems = sessionList.map((s: any) => ({
        id: s.id,
        topicTitle: (s.topic as any)?.title ?? "Unknown",
        score: (s.summary as any)?.score ?? null,
        status: s.status,
        createdAt: s.created_at,
      }));

      // Aggregate mistakeTags and grammarFocus from summaries
      const allMistakeTags: string[] = [];
      const allGrammarFocus: string[] = [];

      for (const s of sessionList) {
        const summary = (s as any).summary;
        if (summary) {
          if (Array.isArray(summary.mistakeTags)) {
            allMistakeTags.push(...summary.mistakeTags);
          }
          if (Array.isArray(summary.grammarFocus)) {
            allGrammarFocus.push(...summary.grammarFocus);
          }
        }
      }

      const topMistakes = topN(allMistakeTags, (x) => x, 5);
      const topStrengths = topN(allGrammarFocus, (x) => x, 5);

      return reply.send({
        weekId,
        weekLabel: weekLabel(weekId),
        sessions: sessionItems,
        topMistakes,
        topStrengths,
      });
    }
  );
}
