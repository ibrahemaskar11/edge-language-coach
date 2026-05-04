import express from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { connection, flashcardQueue, summaryQueue, scraperQueue } from "./lib/queues.js";
import { createFlashcardWorker } from "./workers/flashcard.worker.js";
import { createSummaryWorker } from "./workers/summary.worker.js";
import { createScraperWorker } from "./workers/scraper.worker.js";
import { logger } from "./lib/logger.js";
import { defaultWorkerOptions } from "./lib/queues.js";
import {
  register,
  jobDuration,
  jobsDeadLetterTotal,
  queueDepth,
} from "./lib/metrics.js";

const MAX_ATTEMPTS = defaultWorkerOptions.attempts;

function jobElapsedSeconds(job: { processedOn?: number; finishedOn?: number }): number | null {
  if (!job.processedOn) return null;
  const end = job.finishedOn ?? Date.now();
  return (end - job.processedOn) / 1000;
}

function attachJobMetrics(worker: ReturnType<typeof createFlashcardWorker>, queueName: string) {
  worker.on("completed", (job) => {
    const elapsed = jobElapsedSeconds(job);
    if (elapsed !== null) {
      jobDuration.observe({ queue: queueName, status: "completed" }, elapsed);
    }
  });

  worker.on("failed", (job, err) => {
    if (!job) return;
    const isDlq = (job.attemptsMade ?? 0) >= MAX_ATTEMPTS;
    if (isDlq) {
      jobsDeadLetterTotal.inc({ queue: queueName });
      const elapsed = jobElapsedSeconds(job);
      if (elapsed !== null) {
        jobDuration.observe({ queue: queueName, status: "failed" }, elapsed);
      }
    }
    const level = isDlq ? "error" : "warn";
    logger[level](
      {
        dlq: isDlq,
        queue: queueName,
        jobId: job.id,
        jobName: job.name,
        attempt: job.attemptsMade,
        maxAttempts: MAX_ATTEMPTS,
        err: { message: err.message, stack: err.stack },
      },
      isDlq ? "job exhausted all retries — dead-lettered" : "job failed, will retry",
    );
  });
}

// Start all workers and keep references for readiness checks
const workers = {
  flashcard: createFlashcardWorker(),
  summary: createSummaryWorker(),
  scraper: createScraperWorker(),
};

attachJobMetrics(workers.flashcard, "flashcard-generate");
attachJobMetrics(workers.summary,   "summary-generate");
attachJobMetrics(workers.scraper,   "topic-scrape");

// Bull Board monitoring UI
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/queues");
createBullBoard({
  queues: [
    new BullMQAdapter(flashcardQueue),
    new BullMQAdapter(summaryQueue),
    new BullMQAdapter(scraperQueue),
  ],
  serverAdapter,
});

const app = express();
app.use(express.json());
app.use("/queues", serverAdapter.getRouter());

const PROBE_TIMEOUT_MS = 2_000;

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`${label} timeout`)), ms)),
  ]);
}

async function checkRedis(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const reply = await withTimeout(connection.ping(), PROBE_TIMEOUT_MS, "redis");
    return reply === "PONG" ? { ok: true } : { ok: false, error: `unexpected reply: ${reply}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

app.get("/livez", (_req, res) => {
  res.json({ status: "ok" });
});

app.get("/metrics", async (_req, res) => {
  try {
    const [fcWaiting, sumWaiting, scrapeWaiting] = await Promise.all([
      flashcardQueue.getWaitingCount(),
      summaryQueue.getWaitingCount(),
      scraperQueue.getWaitingCount(),
    ]);
    queueDepth.set({ queue: "flashcard-generate" }, fcWaiting);
    queueDepth.set({ queue: "summary-generate" }, sumWaiting);
    queueDepth.set({ queue: "topic-scrape" }, scrapeWaiting);
  } catch (err) {
    logger.warn({ err: { message: (err as Error).message } }, "failed to refresh queue depth");
  }
  res.set("Content-Type", register.contentType);
  res.send(await register.metrics());
});

app.get("/readyz", async (_req, res) => {
  const redis = await checkRedis();
  const workerStatus = {
    flashcard: workers.flashcard.isRunning(),
    summary: workers.summary.isRunning(),
    scraper: workers.scraper.isRunning(),
  };
  const workersOk = Object.values(workerStatus).every(Boolean);
  const allOk = redis.ok && workersOk;

  res.status(allOk ? 200 : 503).json({
    status: allOk ? "ready" : "not_ready",
    deps: { redis, workers: workerStatus },
  });
});

// Manual scrape trigger (keeps same API contract as old Go service)
app.post("/scrape", async (_req, res) => {
  await scraperQueue.add("manual", {});
  res.status(202).json({ message: "scrape job enqueued" });
});

const port = Number(process.env.WORKERS_PORT ?? 3002);
app.listen(port, () => {
  logger.info({ port }, "workers running — Bull Board at /queues");
});

async function shutdown(signal: string) {
  logger.info({ signal }, "shutting down");
  await Promise.allSettled([
    workers.flashcard.close(),
    workers.summary.close(),
    workers.scraper.close(),
  ]);
  await connection.quit().catch(() => {});
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
