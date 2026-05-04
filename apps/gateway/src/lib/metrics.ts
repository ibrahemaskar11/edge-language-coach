import {
  Registry,
  Counter,
  Histogram,
  Gauge,
  collectDefaultMetrics,
} from "prom-client";

export const register = new Registry();

collectDefaultMetrics({ register });

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "HTTP request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  registers: [register],
});

export const httpRequestTotal = new Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

export const groqCircuitBreakerState = new Gauge({
  name: "groq_circuit_breaker_state",
  help: "Groq circuit breaker state: 0=closed 1=open 2=half-open",
  labelNames: ["breaker"],
  registers: [register],
});

export const groqRequestDuration = new Histogram({
  name: "groq_request_duration_seconds",
  help: "Groq API request duration in seconds (gateway-side, includes circuit breaker overhead)",
  labelNames: ["operation", "status"],
  buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60],
  registers: [register],
});

export const queueDepth = new Gauge({
  name: "queue_depth_total",
  help: "Number of waiting jobs per BullMQ queue",
  labelNames: ["queue"],
  registers: [register],
});

export const activeSessionsGauge = new Gauge({
  name: "active_sessions_total",
  help: "Number of active (in-progress) sessions",
  registers: [register],
});
