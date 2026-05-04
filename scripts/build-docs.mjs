/**
 * Compiles the architecture report + ADRs into a single PDF via pandoc.
 *
 * Run:
 *   pnpm docs:pdf
 *
 * Prerequisites:
 *   - pandoc on PATH      (winget install JohnMacFarlane.Pandoc)
 *   - a LaTeX engine      (winget install MiKTeX.MiKTeX  -- or TeX Live)
 *
 * Output: docs/edge-language-coach-report.pdf
 */

import { spawnSync } from "node:child_process";
import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const docsDir = "docs";
const adrDir = join(docsDir, "adr");
const output = join(docsDir, "edge-language-coach-report.pdf");

const order = [
  join(docsDir, "architecture-report.md"),
  join(docsDir, "c4-diagram.md"),
  join(docsDir, "slo-table.md"),
];

if (existsSync(adrDir)) {
  const adrs = readdirSync(adrDir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((f) => join(adrDir, f));
  order.push(...adrs);
}

const missing = order.filter((p) => !existsSync(p));
if (missing.length) {
  console.error("missing inputs:", missing);
  process.exit(1);
}

const args = [
  ...order,
  "-o", output,
  "--pdf-engine=xelatex",
  "--toc",
  "-V", "geometry:margin=1in",
  "-V", "fontsize=11pt",
  "-V", "colorlinks=true",
  "--highlight-style=tango",
  "--metadata", "title=Edge Language Coach — Architecture Report",
];

console.log(`pandoc ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`);

const result = spawnSync("pandoc", args, { stdio: "inherit" });

if (result.error?.code === "ENOENT") {
  console.error("\npandoc not found on PATH. Install with: winget install JohnMacFarlane.Pandoc");
  process.exit(1);
}

if (result.status !== 0) {
  console.error("\npandoc failed (exit code " + result.status + ").");
  console.error("If the error mentions a missing LaTeX engine, install MiKTeX or TeX Live.");
  process.exit(result.status ?? 1);
}

console.log(`\nwrote ${output}`);
