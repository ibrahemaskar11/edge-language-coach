import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from "prom-client";

export const register = new Registry();

collectDefaultMetrics({ register });

export const jobDuration = new Histogram({
  name: "bullmq_job_duration_seconds",
  help: "BullMQ job processing duration in seconds",
  labelNames: ["queue", "status"],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
  registers: [register],
});

export const jobsDeadLetterTotal = new Counter({
  name: "jobs_dead_letter_total",
  help: "Total jobs that exhausted all retries and were dead-lettered",
  labelNames: ["queue"],
  registers: [register],
});

export const queueDepth = new Gauge({
  name: "queue_depth_total",
  help: "Number of waiting jobs per BullMQ queue",
  labelNames: ["queue"],
  registers: [register],
});
