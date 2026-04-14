import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../env.js";

const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
// Suppress unhandled-error noise when Redis is not running locally
connection.on("error", () => {});

export const flashcardQueue = new Queue("flashcard-generate", { connection });
export const summaryQueue = new Queue("summary-generate", { connection });
