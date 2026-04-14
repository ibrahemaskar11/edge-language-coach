import { Queue } from "bullmq";
import { Redis } from "ioredis";

export const connection = new Redis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
  { maxRetriesPerRequest: null } // required by BullMQ
);
connection.on("error", () => {}); // suppress retry noise when Redis is unavailable

export const flashcardQueue = new Queue("flashcard-generate", { connection });
export const summaryQueue   = new Queue("summary-generate",   { connection });
export const scraperQueue   = new Queue("topic-scrape",       { connection });
