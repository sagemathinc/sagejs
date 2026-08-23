#!/usr/bin/env node
"use strict";

const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

function display(value) { return value === null || value === undefined ? "—" : Number(value).toFixed(value < 1 ? 4 : 2); }
function displayStats(value) {
  return value ? `${display(value.median_ms)} ± ${display(value.mad_ms)}` : "—";
}
function notes(row, backendId) {
  const values = [];
  if (row.reason) values.push(row.reason);
  if (row.status === "ok" && backendId === "magma") {
    values.push("10 ms Realtime resolution; zero means below resolution");
  }
  if (row.status === "ok" && backendId === "pari") {
    values.push("1 ms getwalltime resolution; zero means below resolution");
  }
  if (row.effective_pari_bit_precision !== undefined) {
    values.push(`PARI bits ${row.requested_precision_bits ?? "n/a"}→${row.effective_pari_bit_precision}`);
  }
  return (values.join("; ") || "—").replaceAll("|", "\\|").replaceAll("\n", " ");
}
function main() {
  const input = resolve(process.argv[2]); const output = process.argv[3] ? resolve(process.argv[3]) : null;
  const receipt = JSON.parse(readFileSync(input, "utf8"));
  const lines = [
    "# Frozen Phase-0 competitive hyperelliptic baseline", "",
    `Generated from \`${input}\` (${receipt.generated_at_utc}).`, "",
    `Source commit: \`${receipt.source_commit}\`. Corpus: \`${receipt.corpus.sha256}\` (${receipt.corpus.cases} ${receipt.corpus.tier} cases).`, "",
    "> This is the before-performance baseline. It is not the final acceptance receipt; rerun the identical harness at the final integrated performance SHA for the after comparison.", "",
    `Host: ${receipt.host.hostname}, ${receipt.host.architecture} ${receipt.host.platform}, ${receipt.host.cpu}, Node ${receipt.host.node}.`, "",
    "> Times are median ± MAD in milliseconds. “Loop/item” is a serial repeated warm loop, not a packed batch. A cache hit is never labeled warm arithmetic. Unsupported and unavailable cells are retained.", "",
    "> Magma 2.18-5 reports `Realtime()` in 10 ms quanta and PARI/GP reports `getwalltime()` in 1 ms quanta. A displayed zero for those backends means below timer resolution, never zero cost; no finite speed ratio may be inferred from it.", "",
    "| Case | Backend | Status | Object cold wall | Object cold CPU | Warm wall | Warm CPU | Warm mode | Loop/item wall | Loop/item CPU | Exact digest | Notes |", "|---|---|---:|---:|---:|---:|---:|---|---:|---:|---|---|",
  ];
  for (const backend of receipt.backends) {
    for (const row of backend.rows ?? []) {
      lines.push(`| ${row.id} | ${backend.backend.id} | ${row.status} | ${displayStats(row.statistics?.object_cold)} | ${displayStats(row.statistics?.object_cold_cpu)} | ${displayStats(row.statistics?.warm)} | ${displayStats(row.statistics?.warm_cpu)} | ${row.warm_mode ?? "—"} | ${displayStats(row.statistics?.repeated_warm_per_item)} | ${displayStats(row.statistics?.repeated_warm_cpu_per_item)} | ${row.exact_result_sha256 ? `\`${row.exact_result_sha256.slice(0, 12)}…\`` : "—"} | ${notes(row, backend.backend.id)} |`);
    }
  }
  lines.push("", "## Resident resource envelope", "", "| Backend | Process-cold wall ms | Outer CPU user/system ms | Resident peak RSS KiB | Mathematical user/system s |", "|---|---:|---:|---:|---:|");
  for (const backend of receipt.backends) {
    const outerCpu = backend.process_cpu_ms ? `${display(backend.process_cpu_ms.user)} / ${display(backend.process_cpu_ms.system)}` : "—";
    const mathCpu = backend.resources?.user_seconds === undefined ? "—" : `${display(backend.resources.user_seconds)} / ${display(backend.resources.system_seconds)}`;
    lines.push(`| ${backend.backend.id} | ${display(backend.process_cold_wall_ms)} | ${outerCpu} | ${backend.resources?.peak_rss_kib ?? "—"} | ${mathCpu} |`);
  }
  lines.push("", "## Validation", "");
  lines.push(receipt.validation.failed_rows.length ? `Failed rows: ${receipt.validation.failed_rows.join(", ")}.` : "Every emitted timing row passed its declared exact or numerical result contract.");
  lines.push("", "Exact cross-backend digests are computed only after normalization (for example, Magma's odd-degree infinity weight is checked but not treated as an extra mathematical result).", "", "## Host preflight", "", "```text");
  for (const row of receipt.host.commands) lines.push(`$ ${row.command}\n${row.stdout}${row.stderr ? `\n${row.stderr}` : ""}`);
  lines.push("```", "");
  const serialized = `${lines.join("\n")}\n`; if (output) writeFileSync(output, serialized); else process.stdout.write(serialized);
}
main();
