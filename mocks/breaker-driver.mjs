/**
 * Drives /api/breaker-demo/chat to demo the Groq circuit breaker tripping live.
 *
 * Run:
 *   node mocks/breaker-driver.mjs
 *   GATEWAY_URL=http://localhost:3001 CONCURRENCY=12 ITERATIONS=80 node mocks/breaker-driver.mjs
 *
 * Tuning notes:
 *   - Mock in `error` mode: any CONCURRENCY works; trips after ~12 iterations.
 *   - Mock in `slow` mode (30s sleep): set CONCURRENCY >= 10 so the rolling
 *     window (60s) sees 10+ failed requests before they age out. Otherwise
 *     the breaker never collects enough volume to trip (`volumeThreshold: 10`
 *     in apps/gateway/src/plugins/groq.ts).
 *
 * Prerequisites:
 *   1. Gateway running with DEMO_MODE=1
 *   2. Mock Groq on :8080, gateway pointed at it via GROQ_BASE_URL
 *   3. Mock set to slow or error mode before starting
 */

const GATEWAY_URL = process.env.GATEWAY_URL ?? "http://localhost:3001";
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 12);
const ITERATIONS = Number(process.env.ITERATIONS ?? 60);
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 100);

let lastState = null;
const stats = { ok: 0, err: 0, byState: { closed: 0, halfOpen: 0, open: 0, unknown: 0 } };
let issued = 0;

async function fire(i) {
  const start = Date.now();
  try {
    const res = await fetch(`${GATEWAY_URL}/api/breaker-demo/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    const body = await res.json().catch(() => ({}));
    const elapsed = Date.now() - start;
    const state = body.breakerState ?? "unknown";

    if (res.ok) stats.ok++;
    else stats.err++;
    stats.byState[state] = (stats.byState[state] ?? 0) + 1;

    const transition = state !== lastState ? `   <-- transition from ${lastState ?? "init"}` : "";
    lastState = state;
    console.log(
      `[${String(i + 1).padStart(3, " ")}/${ITERATIONS}] ` +
        `status=${res.status} elapsed=${elapsed}ms breaker=${state}${transition}`,
    );
  } catch (err) {
    stats.err++;
    const elapsed = Date.now() - start;
    console.log(`[${String(i + 1).padStart(3, " ")}/${ITERATIONS}] FETCH_ERR elapsed=${elapsed}ms ${err.message}`);
  }
}

async function worker() {
  while (true) {
    const i = issued++;
    if (i >= ITERATIONS) return;
    await fire(i);
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

console.log(
  `driving ${GATEWAY_URL}/api/breaker-demo/chat — ` +
    `${ITERATIONS} iterations, concurrency=${CONCURRENCY}, gap=${INTERVAL_MS}ms`,
);

await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

console.log("\n--- summary ---");
console.log(`ok:    ${stats.ok}`);
console.log(`err:   ${stats.err}`);
console.log(
  `states: closed=${stats.byState.closed ?? 0} halfOpen=${stats.byState.halfOpen ?? 0} ` +
    `open=${stats.byState.open ?? 0} unknown=${stats.byState.unknown ?? 0}`,
);
