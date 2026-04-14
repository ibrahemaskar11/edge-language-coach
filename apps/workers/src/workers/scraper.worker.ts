import { Worker } from "bullmq";
import { connection, scraperQueue } from "../lib/queues.js";
import { runScraper } from "../jobs/scraper.job.js";

export function createScraperWorker() {
  // Schedule cron: every 6 hours
  scraperQueue.add("cron", {}, {
    repeat: { pattern: "0 */6 * * *" },
    jobId: "scrape-cron", // fixed ID prevents duplicate cron entries on restart
  });

  // Trigger immediately on first boot
  scraperQueue.add("startup", {}, { priority: 1 });

  return new Worker(
    "topic-scrape",
    async () => { await runScraper(); },
    { connection, concurrency: 1 } // never run two scrapers concurrently
  );
}
