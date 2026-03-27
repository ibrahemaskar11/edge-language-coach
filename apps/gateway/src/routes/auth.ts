import type { FastifyInstance } from "fastify";

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: { userId: string; email: string; fullName?: string };
  }>("/api/auth/callback", async (request, reply) => {
    const { userId, email, fullName } = request.body;

    const { data, error } = await fastify.supabase
      .from("profiles")
      .upsert(
        { id: userId, email, full_name: fullName },
        { onConflict: "id" }
      )
      .select()
      .single();

    if (error) {
      return reply.status(500).send({ message: error.message });
    }

    return reply.send(data);
  });
}
