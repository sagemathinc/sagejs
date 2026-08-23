#!/usr/bin/env node
"use strict";

const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

function display(value) { return value === null || value === undefined ? "—" : Number(value).toFixed(value < 1 ? 4 : 2); }
function main() {
  const input = resolve(process.argv[2]); const output = process.argv[3] ? resolve(process.argv[3]) : null;
  const receipt = JSON.parse(readFileSync(input, "utf8"));
  const lines = [
    "# Competitive hyperelliptic baseline report", "",
    `Generated from \`${input}\` (${receipt.generated_at_utc}).`, "",
    `Source commit: \`${receipt.source_commit}\`. Corpus: \`${receipt.corpus.sha256}\` (${receipt.corpus.cases} ${receipt.corpus.tier} cases).`, "",
    `Host: ${receipt.host.hostname}, ${receipt.host.architecture} ${receipt.host.platform}, ${receipt.host.cpu}, Node ${receipt.host.node}.`, "",
    "> Times are medians in milliseconds. “Loop/item” is a serial repeated warm loop, not a packed batch. A cache hit is never labeled warm arithmetic. Unsupported and unavailable cells are retained.", "",
    "| Case | Backend | Status | Object cold | Warm | Warm mode | Loop/item | Exact digest |", "|---|---|---:|---:|---:|---|---:|---|",
  ];
  for (const backend of receipt.backends) {
    for (const row of backend.rows ?? []) {
      lines.push(`| ${row.id} | ${backend.backend.id} | ${row.status} | ${display(row.statistics?.object_cold?.median_ms)} | ${display(row.statistics?.warm?.median_ms)} | ${row.warm_mode ?? "—"} | ${display(row.statistics?.repeated_warm_per_item?.median_ms)} | ${row.exact_result_sha256 ? `\`${row.exact_result_sha256.slice(0, 12)}…\`` : "—"} |`);
    }
  }
  lines.push("", "## Validation", "");
  lines.push(receipt.validation.failed_rows.length ? `Failed rows: ${receipt.validation.failed_rows.join(", ")}.` : "Every emitted timing row passed its declared exact or numerical result contract.");
  lines.push("", "Exact cross-backend digests are computed only after normalization (for example, Magma's odd-degree infinity weight is checked but not treated as an extra mathematical result).", "", "## Host preflight", "", "```text");
  for (const row of receipt.host.commands) lines.push(`$ ${row.command}\n${row.stdout}${row.stderr ? `\n${row.stderr}` : ""}`);
  lines.push("```", "");
  const serialized = `${lines.join("\n")}\n`; if (output) writeFileSync(output, serialized); else process.stdout.write(serialized);
}
main();
