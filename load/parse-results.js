#!/usr/bin/env node
// Parses k6 --out json result files and prints p50/p95/p99 + error rate per scenario.
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function parseFile(filePath) {
  const latency = {};   // scenario -> number[]
  const errors = {};    // scenario -> number[]

  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    if (obj.type !== "Point") continue;

    const scenario = obj.data?.tags?.scenario ?? "unknown";
    const value = obj.data?.value ?? 0;

    if (obj.metric === "gateway_latency_ms") {
      (latency[scenario] ??= []).push(value);
    } else if (obj.metric === "gateway_errors") {
      (errors[scenario] ??= []).push(value);
    }
  }

  return { latency, errors };
}

const files = [
  { label: "Baseline",   file: "results-baseline.json" },
  { label: "Stressed",   file: "results-stressed.json" },
  { label: "Scaled-out", file: "results-scaled.json" },
];

console.log("\n=== k6 Measured Results ===\n");
console.log("Scenario     | p50 (ms) | p95 (ms) | p99 (ms) | Error Rate");
console.log("-------------|----------|----------|----------|------------");

for (const { label, file } of files) {
  const { latency, errors } = await parseFile(resolve(__dirname, file));

  // Merge all scenarios from this file (baseline/stressed/scaled_out data lives in one file each)
  const allLatency = Object.values(latency).flat().sort((a, b) => a - b);
  const allErrors  = Object.values(errors).flat();

  const p50 = percentile(allLatency, 50).toFixed(1);
  const p95 = percentile(allLatency, 95).toFixed(1);
  const p99 = percentile(allLatency, 99).toFixed(1);
  const errRate = allErrors.length
    ? ((allErrors.filter(v => v > 0).length / allErrors.length) * 100).toFixed(2)
    : "0.00";

  console.log(`${label.padEnd(13)}| ${p50.padStart(8)} | ${p95.padStart(8)} | ${p99.padStart(8)} | ${errRate}%`);
}

console.log();
