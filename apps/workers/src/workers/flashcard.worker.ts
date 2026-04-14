import { Worker } from "bullmq";
import { connection } from "../lib/queues.js";
import { runFlashcardGeneration } from "../jobs/flashcard.job.js";

export function createFlashcardWorker() {
  return new Worker(
    "flashcard:generate",
    async (job) => {
      const { sessionId, userId } = job.data as { sessionId: string; userId: string };
      await runFlashcardGeneration(sessionId, userId);
    },
    { connection, concurrency: 3 }
  );
}
