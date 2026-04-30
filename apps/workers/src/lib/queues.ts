import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { logger } from "./logger.js";

export const connection = new Redis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  { maxRetriesPerRequest: null } // required by BullMQ
);

let lastRedisErrorAt = 0;
connection.on("error", (err) => {
  const now = Date.now();
  if (now - lastRedisErrorAt > 5_000) {
    lastRedisErrorAt = now;
    logger.warn(
      { err: { message: err.message, code: (err as NodeJS.ErrnoException).code } },
      "redis error",
    );
  }
});

export const defaultWorkerOptions = {
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5_000 },
};

export const flashcardQueue = new Queue("flashcard-generate", { connection });
export const summaryQueue   = new Queue("summary-generate",   { connection });
export const scraperQueue   = new Queue("topic-scrape",       { connection });
