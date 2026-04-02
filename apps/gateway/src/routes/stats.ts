import type { FastifyInstance } from "fastify";
import { toCamelCase } from "../utils/camelcase.js";

export async function statsRoutes(fastify: FastifyInstance) {
  fastify.get("/api/stats", async (request, reply) => {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const weekStart = new Date(now);
    weekStart.setUTCDate(now.getUTCDate() - mondayOffset);
    weekStart.setUTCHours(0, 0, 0, 0);

    const [thisWeekRes, totalRes, completedRes, recentRes] = await Promise.all([
      fastify.supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", request.userId)
        .gte("created_at", weekStart.toISOString()),
      fastify.supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", request.userId),
      fastify.supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", request.userId)
        .eq("status", "complete"),
      fastify.supabase
        .from("sessions")
        .select("*, topic:topics(*)")
        .eq("user_id", request.userId)
        .order("created_at", { ascending: false })
        .limit(5),
    ]);

    return reply.send({
      sessionsThisWeek: thisWeekRes.count ?? 0,
      totalSessions: totalRes.count ?? 0,
      completedSessions: completedRes.count ?? 0,
      recentSessions: toCamelCase(recentRes.data ?? []),
    });
  });
}
