import express from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { connection, flashcardQueue, summaryQueue, scraperQueue } from "./lib/queues.js";
import { createFlashcardWorker } from "./workers/flashcard.worker.js";
import { createSummaryWorker } from "./workers/summary.worker.js";
import { createScraperWorker } from "./workers/scraper.worker.js";
import { logger } from "./lib/logger.js";

// Start all workers and keep references for readiness checks
const workers = {
  flashcard: createFlashcardWorker(),
  summary: createSummaryWorker(),
  scraper: createScraperWorker(),
};

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
