import { Worker } from "bullmq";
import { connection } from "../lib/queues.js";
import { runSummaryGeneration } from "../jobs/summary.job.js";

export function createSummaryWorker() {
  return new Worker(
    "summary:generate",
    async (job) => {
      const { sessionId, userId } = job.data as { sessionId: string; userId: string };
      await runSummaryGeneration(sessionId, userId);
    },
    { connection, concurrency: 3 }
  );
}
