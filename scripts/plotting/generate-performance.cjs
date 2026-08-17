#!/usr/bin/env node
"use strict";

const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..", "..");
const outputPath = join(
  root,
  "docs",
  "sage-compatibility",
  "plotting",
  "performance.json",
);

const document = {
  schema_version: 1,
  policy: {
    purpose:
      "Cross-platform regression ceilings for representative plotting workloads; these are not claims about typical latency.",
    timing_evidence:
      "Timing gates execute from the cited test or benchmark. Host-specific observations are printed by benchmarks and are not checked in.",
    native_mode:
      "Semantic workloads run correctly with native extensions disabled unless the workload explicitly exercises Chromium.",
    update_rule:
      "Change a workload or budget only with an implementation measurement and a focused regression test.",
  },
  workloads: [
    {
      id: "plotspec-materialize-100k-line",
      stage: "semantic-construction",
      scale: { points: 100000, repetitions: 3 },
      budgets: { best_spec_seconds: 3, best_detach_seconds: 2 },
      command: "node --test test/plot-spec-core.cjs",
      evidence: ["test/plot-spec-core.cjs"],
      platforms: ["cpython", "sagejs-native-disabled"],
    },
    {
      id: "plotspec-lower-20k-line-eight-times",
      stage: "plotly-lowering",
      scale: { points: 20000, iterations: 8 },
      budgets: { wall_seconds_each_runtime: 15 },
      command: "node --test test/plot-axes-composition.cjs",
      evidence: ["test/plot-axes-composition.cjs"],
      platforms: ["cpython", "sagejs-native-disabled"],
    },
    {
      id: "sage-curve-sample-and-spec-100k",
      stage: "mathematical-sampling-and-semantic-construction",
      scale: { points: 100000, repetitions: 3 },
      budgets: {
        setup_ms: 1000,
        sampling_ms: 8000,
        plotspec_ms: 8000,
        lowering_ms: 8000,
        maximum_evaluations: 1000000,
      },
      command: "node bench/graphics-curve-sampling.cjs --check",
      evidence: [
        "bench/graphics-curve-sampling.cjs",
        "test/graphics-curve-semantics.cjs",
        "docs/sage-compatibility/plotting/oracle/plot-curves.json",
      ],
      platforms: ["sagejs-compiled", "sagejs-native-disabled"],
    },
    {
      id: "field-grid-materialization",
      stage: "mathematical-sampling",
      scale: { scalar_samples: 160000, vector_samples: 10000 },
      budgets: { process_timeout_seconds: 120 },
      command: "node bench/plot-field-grids.cjs",
      evidence: ["bench/plot-field-grids.cjs", "test/sage-2d-fields.cjs"],
      platforms: ["cpython", "sagejs-native-disabled"],
    },
    {
      id: "animation-60-frames-30k-points",
      stage: "animation-construction-and-lowering",
      scale: { frames: 60, total_points: 30000 },
      budgets: { wall_seconds: 15, serialized_bytes: 2000000 },
      command: "node --test test/plot-animation-panels.cjs",
      evidence: ["test/plot-animation-panels.cjs"],
      platforms: ["sagejs-native-disabled", "chromium-optional"],
    },
    {
      id: "surface-semantic-lowering",
      stage: "3d-semantic-construction-and-lowering",
      scale: { grid: [300, 300], samples: 90000 },
      budgets: { plotspec_seconds: 8, process_timeout_seconds: 120 },
      command: "node bench/sage-plot3d-plotspec.cjs",
      evidence: [
        "bench/sage-plot3d-plotspec.cjs",
        "test/sage-plot3d-plotspec.cjs",
        "test/plot-surface-layers.cjs",
        "docs/sage-compatibility/plotting/oracle/surface-layers.json",
      ],
      platforms: ["cpython", "sagejs-native-disabled", "chromium-optional"],
    },
    {
      id: "warm-static-export",
      stage: "chromium-export",
      scale: { repeated_exports: 3, formats: ["png", "svg"] },
      budgets: {
        render_timeout_seconds: 30,
        max_output_bytes: 67108864,
        minimum_warm_speedup: 1,
      },
      command: "node bench/graphics-export-worker.cjs",
      evidence: [
        "bench/graphics-export-worker.cjs",
        "test/graphics-export-worker.cjs",
      ],
      platforms: ["chromium-optional"],
    },
    {
      id: "polyglot-frontend-warm-session",
      stage: "frontend-translation",
      scale: { warm_iterations: 9, shared_session: true },
      budgets: { benchmark_process_timeout_seconds: 120 },
      command: "pnpm bench:polyglot",
      evidence: [
        "bench/polyglot.cjs",
        "test/matlab-plotting.cjs",
        "test/wolfram-plotting.cjs",
      ],
      platforms: ["sagejs-native-disabled"],
    },
    {
      id: "semantic-and-render-gallery",
      stage: "product-quality",
      scale: { source: "gallery/performance.json" },
      budgets: { delegated: true },
      command: "node --test test/plot-gallery-quality.cjs",
      evidence: [
        "test/plot-gallery-quality.cjs",
        "docs/sage-compatibility/plotting/gallery/performance.json",
      ],
      platforms: ["sagejs-native-disabled", "chromium-optional"],
    },
  ],
};

const encoded = `${JSON.stringify(document, null, 2)}\n`;

function main(args = process.argv.slice(2)) {
  if (args.includes("--check")) {
    const current = readFileSync(outputPath, "utf8");
    if (current !== encoded) {
      throw new Error(
        "plotting performance ledger is stale; run node scripts/plotting/generate-performance.cjs",
      );
    }
    return;
  }
  writeFileSync(outputPath, encoded);
}

if (require.main === module) main();

module.exports = { document, main };
