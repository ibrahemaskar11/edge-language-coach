import { Worker } from "bullmq";
import { connection, scraperQueue } from "../lib/queues.js";
import { logger } from "../lib/logger.js";
import { runScraper } from "../jobs/scraper.job.js";

export function createScraperWorker() {
  // Schedule cron: every 6 hours
  scraperQueue.add("cron", {}, {
    repeat: { pattern: "0 */6 * * *" },
    jobId: "scrape-cron", // fixed ID prevents duplicate cron entries on restart
  });

  return new Worker(
    "topic-scrape",
    async (job) => {
      const log = logger.child({ queue: "topic-scrape", jobId: job.id });
      await runScraper(log);
    },
    { connection, concurrency: 1 } // never run two scrapers concurrently
  );
}
