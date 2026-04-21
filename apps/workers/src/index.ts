import express from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { flashcardQueue, summaryQueue, scraperQueue } from "./lib/queues.js";
import { createFlashcardWorker } from "./workers/flashcard.worker.js";
import { createSummaryWorker } from "./workers/summary.worker.js";
import { createScraperWorker } from "./workers/scraper.worker.js";

// Start all workers
createFlashcardWorker();
createSummaryWorker();
createScraperWorker();

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

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Manual scrape trigger (keeps same API contract as old Go service)
app.post("/scrape", async (_req, res) => {
  await scraperQueue.add("manual", {});
  res.status(202).json({ message: "scrape job enqueued" });
});

const port = process.env.WORKERS_PORT ?? 3002;
app.listen(port, () => {
  console.log(`Workers running on :${port} — Bull Board at /queues`);
});
