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
        const isOpen = (err as Error & { code?: string }).code === "EOPENBREAKER";
        fastify.log.error({ err, breakerOpen: isOpen }, "Whisper transcription failed");
        return reply.status(503).send({
          message: isOpen ? "Transcription service temporarily unavailable" : "Transcription service error",
        });
      }
    },
  );
}
