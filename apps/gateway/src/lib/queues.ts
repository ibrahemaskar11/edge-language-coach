import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../env.js";
import { logger } from "./logger.js";

export const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

let lastRedisErrorAt = 0;
connection.on("error", (err) => {
  const now = Date.now();
  if (now - lastRedisErrorAt > 5_000) {
    lastRedisErrorAt = now;
    logger.warn({ err: { message: err.message, code: (err as NodeJS.ErrnoException).code } }, "redis error");
  }
});

export const flashcardQueue = new Queue("flashcard-generate", { connection });
export const summaryQueue = new Queue("summary-generate", { connection });
