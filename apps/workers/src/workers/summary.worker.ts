import { Worker } from "bullmq";
import { connection, defaultWorkerOptions } from "../lib/queues.js";
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
      try {
        await runSummaryGeneration(sessionId, userId, log);
      } catch (err) {
        const e = err as { status?: number; headers?: Record<string, string> };
        if (e.status === 429) {
          const delay = (Number(e.headers?.["retry-after"]) || 60) * 1000;
          log.warn({ delay }, "Groq rate-limited, delaying job");
          await job.moveToDelayed(Date.now() + delay, job.token);
          return;
        }
        throw err;
      }
    },
    { connection, concurrency: 3, ...defaultWorkerOptions }
  );
}
