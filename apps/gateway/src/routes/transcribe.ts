import type { FastifyInstance } from "fastify";

export async function transcribeRoutes(fastify: FastifyInstance) {
  fastify.post(
    "/api/transcribe",
    {
      config: {
        rateLimit: { max: 10, timeWindow: "1 minute" },
      },
    },
    async (request, reply) => {
      let data;
      try {
        data = await request.file();
      } catch {
        return reply.status(400).send({ message: "Expected multipart/form-data" });
      }

      if (!data) {
        return reply.status(400).send({ message: "No audio file provided" });
      }

      const buffer = await data.toBuffer();
      const file = new File([new Uint8Array(buffer)], "audio.webm", {
        type: data.mimetype || "audio/webm",
      });

      try {
        const result = await fastify.groqTranscribe({
          file,
          model: "whisper-large-v3",
          language: "it",
        });
        return reply.send({ transcript: result.text });
      } catch (err) {
        const e = err as { code?: string; status?: number; headers?: Record<string, string> };
        const isOpen = e.code === "EOPENBREAKER";
        const isRateLimited = e.status === 429;
        fastify.log.warn({ err, breakerOpen: isOpen, rateLimited: isRateLimited }, "Whisper transcription failed");
        if (isRateLimited) {
          const retryAfter = Number(e.headers?.["retry-after"]) || 60;
          return reply
            .status(429)
            .header("Retry-After", String(retryAfter))
            .send({ message: "Transcription is busy right now. Please wait a moment and try again.", retryAfter });
        }
        return reply.status(503).send({
          message: isOpen ? "Transcription service temporarily unavailable." : "Transcription service error.",
        });
      }
    },
  );
}
