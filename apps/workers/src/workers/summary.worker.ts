import { Worker } from "bullmq";
import { connection } from "../lib/queues.js";
import { logger } from "../lib/logger.js";
import { runSummaryGeneration } from "../jobs/summary.job.js";

export function createSummaryWorker() {
  return new Worker(
    "summary-generate",
    async (job) => {
      const { sessionId, userId } = job.data as { sessionId: string; userId: string };
      const log = logger.child({
        queue: "summary-generate",
        jobId: job.id,
        sessionId,
        userId,
      });
      await runSummaryGeneration(sessionId, userId, log);
    },
    { connection, concurrency: 3 }
  );
}
