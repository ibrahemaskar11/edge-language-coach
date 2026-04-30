import { Worker } from "bullmq";
import { connection, defaultWorkerOptions } from "../lib/queues.js";
import { logger } from "../lib/logger.js";
import { runFlashcardGeneration } from "../jobs/flashcard.job.js";

export function createFlashcardWorker() {
  return new Worker(
    "flashcard-generate",
    async (job) => {
      const { sessionId, userId } = job.data as { sessionId: string; userId: string };
      const log = logger.child({
        queue: "flashcard-generate",
        jobId: job.id,
        sessionId,
        userId,
      });
      await runFlashcardGeneration(sessionId, userId, log);
    },
    { connection, concurrency: 3, ...defaultWorkerOptions }
  );
}
