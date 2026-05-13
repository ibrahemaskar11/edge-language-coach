/**
 * Compiles the short, self-contained report to PDF via pandoc.
 *
 * Run:
 *   pnpm docs:pdf:short
 *
 * Output: docs/edge-language-coach-report-short.pdf
 *
 * Use `pnpm docs:pdf` for the full bundle (architecture + C4 + SLO + ADRs).
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const input = "docs/report.md";
const output = "docs/edge-language-coach-report-short.pdf";

if (!existsSync(input)) {
  console.error(`missing input: ${input}`);
  process.exit(1);
}

const args = [
  input,
  "-o", output,
  "--pdf-engine=xelatex",
  "--resource-path=docs",
  "--toc",
  "-V", "geometry:margin=1in",
  "-V", "fontsize=11pt",
  "-V", "colorlinks=true",
  "--highlight-style=tango",
];

console.log(`pandoc ${args.map((a) => (a.includes(" ") ? `"${a}"` : a)).join(" ")}`);

const result = spawnSync("pandoc", args, { stdio: "inherit" });

if (result.error?.code === "ENOENT") {
  console.error("\npandoc not found on PATH. Install with: winget install JohnMacFarlane.Pandoc");
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`\npandoc failed (exit code ${result.status}).`);
  console.error("If the error mentions a missing LaTeX engine, install MiKTeX or TeX Live.");
  process.exit(result.status ?? 1);
}

console.log(`\nwrote ${output}`);
