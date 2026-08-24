#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const { readFileSync, writeFileSync } = require("node:fs");
const { resolve } = require("node:path");

const args = process.argv.slice(2);
let output;
const paths = [];
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--output") {
    output = resolve(args[++index]);
  } else {
    paths.push(resolve(args[index]));
  }
}
if (paths.length === 0) {
  throw new Error("usage: report.cjs [--output FILE] RECEIPT...");
}

const values = paths.map((path) => JSON.parse(readFileSync(path, "utf8")));
const primary = values
  .filter((value) =>
    value.schema === "sagejs.hyperelliptic-cross-platform-acceptance.v1"
  )
  .sort((left, right) => platform(left).localeCompare(platform(right)));
const extras = new Map(
  values
    .filter((value) =>
      value.schema === "sagejs.hyperelliptic-phase10-portable-extras.v1"
    )
    .map((value) => [platform(value), value]),
);
assert(primary.length > 0, "at least one primary receipt is required");
const commit = primary[0].repository.commit;
assert(primary.every((value) => value.repository.commit === commit));
assert([...extras.values()].every((value) => value.repository.commit === commit));
const includesPrimaryLinux = primary.some(
  (value) => platform(value) === "linux-x64",
);
const smokeOverlay = [...extras.values()][0]?.repository.package_smoke_overlay;
assert(
  [...extras.values()].every(
    (value) =>
      JSON.stringify(value.repository.package_smoke_overlay) ===
      JSON.stringify(smokeOverlay),
  ),
);

function platform(value) {
  return `${value.host.platform}-${value.host.architecture}`;
}

function number(value, digits = 2) {
  return value === null || value === undefined
    ? "unavailable"
    : Number(value).toFixed(digits);
}

function median(summary) {
  return summary.wall_ms.median;
}

function peakRss(value) {
  const readings = [];
  function visit(item) {
    if (Array.isArray(item)) {
      for (const child of item) visit(child);
    } else if (item && typeof item === "object") {
      if (typeof item.peak_rss_bytes === "number") {
        readings.push(item.peak_rss_bytes);
      }
      for (const child of Object.values(item)) visit(child);
    }
  }
  visit(value.modes);
  return Math.max(...readings);
}

function escape(value) {
  return String(value).replaceAll("|", "\\|").replace(/[\r\n]+/g, " ");
}

const lines = [
  "# Hyperelliptic Phase 10 cross-platform acceptance",
  "",
  `Generated from the committed JSON receipts for exact source \`${commit}\`. ` +
    "Absolute times across architectures are descriptive only.",
  "",
  smokeOverlay
    ? `The independent all-family package smoke uses test-only overlay ` +
      `\`${smokeOverlay.test_patch_commit}\` (patched test ` +
      `\`${smokeOverlay.patched_test_sha256}\`) while preserving the frozen ` +
      "mathematical source commit and clean status."
    : "No test-only package-smoke overlay was recorded.",
  "",
  includesPrimaryLinux
    ? "This matrix includes the quiet `bench-1` Linux-x64 Sage.js receipt, but " +
      "does not duplicate Magma, PARI/GP, or SageMath measurements from their " +
      "separate equal-contract receipts. Missing competitor cells are not " +
      "counted as Sage.js wins."
    : "Magma, PARI/GP, and SageMath competitor rows are **not measured** in " +
      "this platform matrix. Missing competitor cells are not counted as " +
      "Sage.js wins.",
  "",
  "## Host and package matrix",
  "",
  "| Platform | CPU | Node | Native source | Wasm | Standalone | Package smoke |",
  "|---|---|---:|---|---|---|---|",
];

for (const value of primary) {
  const key = platform(value);
  const extra = extras.get(key);
  lines.push(
    `| ${key} | ${escape(value.host.cpu_models.join(", "))} | ` +
      `${value.host.node} | dynamic/native exact | ` +
      `${extra?.wasm.status ?? "not recorded"} | ` +
      `${extra?.standalone.status ?? "not recorded"} | ` +
      `${extra?.wasm.package_load_test.status ?? "not recorded"} |`,
  );
}

lines.push(
  "",
  "## Recorded preflight",
  "",
  "The full system/process snapshots are retained in each JSON receipt. The " +
    "macOS timing rows are descriptive shared-host evidence; transient GUI " +
    "system work was observed during the long dynamic run.",
  "",
  "| Platform | uptime/load at start | compiler probe |",
  "|---|---|---|",
);
for (const value of primary) {
  lines.push(
    `| ${platform(value)} | ${escape(value.host.preflight.uptime.stdout)} | ` +
      `${escape(value.host.preflight.compiler.stdout.split(/\r?\n/)[0])} |`,
  );
}

lines.push(
  "",
  "## Local factors and Kummer",
  "",
  "| Platform | local factors through 100k packed (ms) | coefficient rows (ms) | Kummer 4096 dynamic wall (ms) | native wall (ms) | speedup | peak RSS (MiB) |",
  "|---|---:|---:|---:|---:|---:|---:|",
);
for (const value of primary) {
  const dynamic = value.modes.dynamic;
  const native = value.modes.native;
  const local = native.local_factors.at(-1);
  const dynamicKummer = median(dynamic.kummer.doubling);
  const nativeKummer = median(native.kummer.doubling);
  lines.push(
    `| ${platform(value)} | ${number(local.packed.wall_ms.median)} | ` +
      `${number(local.coefficients.wall_ms.median)} | ${number(dynamicKummer)} | ` +
      `${number(nativeKummer)} | ${number(dynamicKummer / nativeKummer)}x | ` +
      `${number(peakRss(value) / 2 ** 20, 1)} |`,
  );
}

lines.push(
  "",
  "## Public Cantor workloads",
  "",
  "The following are end-to-end worker wall times, including the public packed " +
    "boundary and result handling. Internal arithmetic-only medians remain in " +
    "the JSON and verifier summary.",
  "",
  "| Platform | Genus | add 1000 dynamic/native wall (ms) | add materialized wall (ms) | scalar 64 dynamic/native wall (ms) | scalar materialized wall (ms) | progression 1000 dynamic/retained native/materialized native wall (ms) |",
  "|---|---:|---:|---:|---:|---:|---:|",
);
for (const value of primary) {
  for (let index = 0; index < value.modes.native.cantor.cases.length; index += 1) {
    const dynamic = value.modes.dynamic.cantor.cases[index];
    const native = value.modes.native.cantor.cases[index];
    lines.push(
      `| ${platform(value)} | ${native.genus} | ` +
        `${number(median(dynamic.add_batch))} / ${number(median(native.add_batch))} | ` +
        `${number(median(native.add_materialized_batch))} | ` +
        `${number(median(dynamic.scalar_batch))} / ${number(median(native.scalar_batch))} | ` +
        `${number(median(native.scalar_materialized_batch))} | ` +
        `${number(median(dynamic.progression_batch))} / ` +
        `${number(median(native.progression_retained_batch))} / ` +
        `${number(median(native.progression_materialized_batch))} |`,
    );
  }
}

lines.push(
  "",
  "## Standalone and authenticated Wasm boundary",
  "",
  "| Platform | Genus | standalone core 1000 (ms) | native raw fixed / standalone | Wasm 1000 (ms) | Wasm / standalone |",
  "|---|---:|---:|---:|---:|---:|",
);
for (const value of primary) {
  const extra = extras.get(platform(value));
  if (!extra) continue;
  for (const wasm of extra.wasm.cantor) {
    const standalone =
      extra.standalone.status === "available"
        ? extra.standalone.value.rows.find((row) => row.genus === wasm.genus)
        : undefined;
    lines.push(
      `| ${platform(value)} | ${wasm.genus} | ` +
        `${number(standalone ? standalone.standalone_core_median_ns / 1e6 : null)} | ` +
        `${number(standalone?.raw_fixed_boundary_to_standalone_ratio, 3)} | ` +
        `${number(wasm.wall_ms.median)} | ` +
        `${number(wasm.wasm_to_standalone_ratio, 3)} |`,
    );
  }
}

lines.push(
  "",
  "## Explicit unavailable cells",
  "",
);
const unavailable = [];
for (const value of primary) {
  const extra = extras.get(platform(value));
  if (extra?.standalone.status !== "available") {
    unavailable.push(
      `- ${platform(value)} standalone: ${extra?.standalone.reason ?? "not recorded"}`,
    );
  }
}
unavailable.push(
  "- Magma, PARI/GP, and SageMath: not measured on this Phase 10 matrix; `bench-1` was explicitly excluded.",
);
lines.push(...unavailable);

lines.push(
  "",
  "## Exactness and resource behavior",
  "",
  "Every primary receipt has a clean source status and matching dynamic/native " +
    "digests. The verifier additionally requires the same local-factor, Kummer, " +
    "tiny-Jacobian, Cantor addition, scalar, and progression digests across hosts.",
  "",
  "| Platform | Wasm manifest | checked short output | cancellation / recovery | package smoke |",
  "|---|---|---|---|---|",
);
for (const value of primary) {
  const extra = extras.get(platform(value));
  if (!extra) continue;
  const wasm = extra.wasm;
  lines.push(
    `| ${platform(value)} | \`${wasm.manifest_sha256}\` | ` +
      `${wasm.resource_bounds.result}; unchanged=${wasm.resource_bounds.short_output_unchanged} | ` +
      `exit ${wasm.cancellation.exit_code}; recovery=${escape(wasm.cancellation.recovery_stdout)} | ` +
      `${wasm.package_load_test.status} (exit ${wasm.package_load_test.exit_code}, ` +
      `stdout \`${wasm.package_load_test.stdout_sha256}\`) |`,
  );
}

lines.push(
  "",
  "The package-smoke status is an independent all-family test. If a future " +
    "cell fails, that does not erase its authenticated direct Cantor/Kummer " +
    "receipt; the failure remains a visible release blocker with complete " +
    "output in the corresponding JSON.",
);

const report = `${lines.join("\n")}\n`;
if (output) {
  writeFileSync(output, report);
} else {
  process.stdout.write(report);
}
