import type { FastifyInstance } from "fastify";

export async function transcribeRoutes(fastify: FastifyInstance) {
  fastify.post("/api/transcribe", async (request, reply) => {
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
      const result = await fastify.groq.audio.transcriptions.create({
        file,
        model: "whisper-large-v3",
        language: "it",
      });
      return reply.send({ transcript: result.text });
    } catch (err) {
      fastify.log.error(err, "Whisper transcription failed");
      return reply.status(502).send({ message: "Transcription service error" });
    }
  });
}
