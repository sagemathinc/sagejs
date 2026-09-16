"use strict";

/*
 * Frozen Stage-G integration driver for the short-power scalar-summary proof.
 *
 * The canonical catalog driver remains unchanged.  This wrapper applies the
 * smallest experiment-only declaration changes in memory: enable the
 * compiler's authenticated scalar-return summaries, update the two expected
 * direct-call counts from three to seven, and require the exact six short-powu
 * origins plus the independently proved evaluator edge. The canonical driver
 * still owns graph construction, four-packet
 * replay, nine malformed controls, code-shape checks, building, and paired
 * timing.
 *
 * Usage:
 *   node check_stage_g_six_copy_edges.cjs \
 *     FIXTURES_JSON BASELINE_BUILD_DIRECTORY COMPILER_WORKTREE \
 *     [--record-rejected-materialization]
 */

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const Module = require("node:module");
const { join } = require("node:path");

if (process.argv.length !== 5 && process.argv.length !== 6) {
  throw new Error(
    "usage: node check_stage_g_six_copy_edges.cjs " +
      "FIXTURES_JSON BASELINE_BUILD_DIRECTORY COMPILER_WORKTREE " +
      "[--record-rejected-materialization]",
  );
}

const rejectedMaterialization =
  process.argv.at(-1) === "--record-rejected-materialization";
if (process.argv.length === 6 && !rejectedMaterialization) {
  throw new Error("unknown diagnostic option");
}
if (rejectedMaterialization) process.argv.pop();

process.argv.push("stage-g");
const canonical = join(__dirname, "check_stage_a_catalog_region.cjs");
let source = readFileSync(canonical, "utf8");

function replaceExactly(needle, replacement, expected) {
  const occurrences = source.split(needle).length - 1;
  assert.equal(occurrences, expected, `canonical driver occurrence drift: ${needle}`);
  source = source.split(needle).join(replacement);
}

replaceExactly(
  '  "virtual-fixed-uint64-views",\n]);',
  '  "virtual-fixed-uint64-views",\n  "scalar-return-summaries",\n]);',
  1,
);
replaceExactly(
  'const STAGE_G_LOCAL_VARIANTS = Object.freeze([Object.freeze({\n' +
    '  ...STAGE_F_LOCAL_VARIANTS[0],\n' +
    '  mode: "direct-result",\n' +
    '})]);',
  'const STAGE_G_LOCAL_VARIANTS = Object.freeze([Object.freeze({\n' +
    '  function: "int64_pari_flx_copy",\n' +
    '  mode: "guarded-direct-result",\n' +
    '  guard: Object.freeze([\n' +
    '    Object.freeze({ kind: "buffer-min-length", parameter: "w", minimum: 393 }),\n' +
    '    Object.freeze({ kind: "int64-range", parameter: "a", minimum: 0, maximum: 384 }),\n' +
    '    Object.freeze({ kind: "int64-range", parameter: "da", minimum: -1, maximum: 8 }),\n' +
    '    Object.freeze({ kind: "int64-range", parameter: "out", minimum: 0, maximum: 384 }),\n' +
    '  ]),\n' +
    '  edges: Object.freeze([193, 198, 207].map((line) => Object.freeze({\n' +
    '    operationOrigin: `int64_pari_flxq_powu:${line}`,\n' +
    '  }))),\n' +
    '  capabilities: Object.freeze(["interval-view-access"]),\n' +
    '})]);',
  1,
);
replaceExactly(
  'mode === "stage-g" ? 3 : mode === "stage-h" ? 4 : 0',
  'mode === "stage-g" ? 7 : mode === "stage-h" ? 4 : 0',
  1,
);
replaceExactly(
  'mode === "stage-g" ? 3 : 4,',
  'mode === "stage-g" ? 7 : 4,',
  1,
);

const censusNeedle = "const localIntervalProofs = [];";
const expectedOperations = [
  "sagejs_checked_r0_int64_pari_flx_flxqv_eval:int64_pari_flx_flxqv_eval:192",
  "sagejs_checked_r0_int64_pari_flxq_powu:int64_pari_flxq_powu:167",
  "sagejs_checked_r0_int64_pari_flxq_powu:int64_pari_flxq_powu:184",
  "sagejs_checked_r0_int64_pari_flxq_powu:int64_pari_flxq_powu:193",
  "sagejs_checked_r0_int64_pari_flxq_powu:int64_pari_flxq_powu:198",
  "sagejs_checked_r0_int64_pari_flxq_powu:int64_pari_flxq_powu:207",
  "sagejs_checked_r0_int64_pari_flxq_powu:int64_pari_flxq_powu:243",
];
replaceExactly(
  censusNeedle,
  `if (mode === "stage-g") {\n` +
    `  assert.deepEqual(\n` +
    `    directCallSites.map((site) => site.operation),\n` +
    `    ${JSON.stringify(expectedOperations, null, 2)},\n` +
    `    "short-power direct-copy origin census changed",\n` +
    `  );\n` +
    `  assert.equal(\n` +
    `    directCallSites.every((site) => site.emission === "unconditional"),\n` +
    `    true,\n` +
    `    "a short-power edge retained a residual guard",\n` +
    `  );\n` +
    `}\n\n${censusNeedle}`,
  1,
);

// The default path retains Stage G's zero-descriptor acceptance gate. This
// explicit mode records the exact rejected code shape so the negative result
// remains reproducible; its underlying canonical report is always marked
// `diagnosticOnly` and its timing is always `qualified: false`.
if (rejectedMaterialization) {
  replaceExactly(
    "  assert.equal(privateSiteCounts.viewValidationFailures, 11);\n" +
      "  assert.equal(privateSiteCounts.uint64BufferLocalDeclarations, 0);\n" +
      "  assert.equal(privateSiteCounts.viewDataAssignments, 0);\n" +
      "  assert.equal(privateSiteCounts.viewLengthAssignments, 0);\n" +
      "  assert.equal(privateSiteCounts.viewOffsetAdjustments, 0);\n\n" +
      "  const [directVariant]",
    "  assert.equal(privateSiteCounts.viewValidationFailures, 11);\n" +
      "  assert.equal(privateSiteCounts.uint64BufferLocalDeclarations, 22);\n" +
      "  assert.equal(privateSiteCounts.viewDataAssignments, 11);\n" +
      "  assert.equal(privateSiteCounts.viewLengthAssignments, 11);\n" +
      "  assert.equal(privateSiteCounts.viewOffsetAdjustments, 11);\n\n" +
      "  const [directVariant]",
    1,
  );
}

const experiment = new Module(canonical, module);
experiment.filename = canonical;
experiment.paths = Module._nodeModulePaths(__dirname);
experiment._compile(source, canonical);
