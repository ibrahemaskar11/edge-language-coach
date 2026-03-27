import type { FastifyInstance } from "fastify";

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: {
      userId: string;
      email: string;
      fullName?: string;
      dateOfBirth?: string;
    };
  }>("/api/auth/callback", async (request, reply) => {
    const { userId, email, fullName, dateOfBirth } = request.body;

    const { data, error } = await fastify.supabase
      .from("profiles")
      .upsert(
        {
          id: userId,
          email,
          full_name: fullName ?? null,
          date_of_birth: dateOfBirth ?? null,
        },
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
