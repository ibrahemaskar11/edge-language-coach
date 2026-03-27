import type { FastifyInstance } from "fastify";

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: { userId: string; email: string; fullName?: string };
  }>("/api/auth/callback", async (request, reply) => {
    const { userId, email, fullName } = request.body;

    const profile = await fastify.prisma.profile.upsert({
      where: { id: userId },
      update: { email, fullName },
      create: { id: userId, email, fullName },
    });

    return reply.send(profile);
  });
}
