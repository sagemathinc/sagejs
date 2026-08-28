// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { pythonExecutable } = require("../tools/python-executable.cjs");
const {
  PROFILE_SOURCE,
  PUBLIC_SOURCE,
  SOURCE_PATHS,
  buildPairedComparison,
  candidateDispositions,
  catalogInsertion,
  deriveCandidateSource,
  expectedOrder,
  helperSource,
  independentOracles,
  reviewedSource,
  reviewedBoundsSource,
  runFeasibility,
  workloadCatalogEntry,
} = require("../bench/optimizer-workloads/arrow-field.cjs");

const root = path.resolve(__dirname, "..");
const profileSource = fs.readFileSync(path.join(root, PROFILE_SOURCE), "utf8");
const publicSource = fs.readFileSync(path.join(root, PUBLIC_SOURCE), "utf8");

test("the public workload and derived candidate remain CPython-parseable", () => {
  const temporary = path.join(
    process.env.TMPDIR || "/tmp",
    `sagejs-arrow-derived-${process.pid}.py`,
  );
  fs.writeFileSync(temporary, deriveCandidateSource(publicSource, profileSource));
  try {
    for (const filename of [path.join(root, PROFILE_SOURCE), temporary]) {
      const result = spawnSync(
        pythonExecutable(),
        ["-c", "compile(open(__import__('sys').argv[1]).read(), __import__('sys').argv[1], 'exec')", filename],
        { encoding: "utf8" },
      );
      assert.equal(result.status, 0, result.stderr);
    }
  } finally {
    fs.rmSync(temporary, { force: true });
  }
  assert.deepEqual(SOURCE_PATHS, [
    PROFILE_SOURCE,
    PUBLIC_SOURCE,
    "src/lib/sage/plot/plot_field.py",
    "src/lib/sagejs/plotting/lowering.py",
    "src/lib/sagejs/plotting/surface_layers.py",
  ]);
  assert.match(profileSource, /campaign1_vector_field_figure/);
  assert.match(profileSource, /campaign1_slope_field_figure/);
  assert.match(profileSource, /lower_plot_spec\(specification\)/);
});

test("the feasibility source is anchored to the exact arrow function and loop", () => {
  const reviewed = reviewedSource(publicSource);
  assert.equal(
    reviewed.completeFunctionSha256,
    "96e2ebd9c76fbddb9954ae43c356832669531371c10ca68e4e6aaee188884570",
  );
  assert.equal(
    reviewed.innerLoopSha256,
    "40b35ba35381f66868673372b33b5c94628b74437b0b14b19e8dd77fe47622f7",
  );
  assert.match(reviewed.innerLoop, /for y_index, y in enumerate\(y_values\)/);
  assert.match(reviewed.innerLoop, /math\.hypot\(float\(u\), float\(v\)\)/);
  assert.match(reviewed.innerLoop, /xs\.extend\(\(back_x \+ side_x/);
  const derived = deriveCandidateSource(publicSource, profileSource);
  assert.equal(derived.includes(reviewed.completeFunction), false);
  assert.match(derived, /def _campaign1_repository_arrow_segments/);
  assert.match(derived, /def _arrow_segments\(layer: PlotLayer\)/);
});

test("all guards precede interruption and transactional output allocation", () => {
  const helper = helperSource(profileSource);
  const preflight = helper.indexOf("Authenticate every indexed read");
  const allocation = helper.indexOf("const xs = new Array(maximumEntries)");
  const interrupt = helper.indexOf("trustedInterrupt();", allocation);
  assert.ok(preflight >= 0 && allocation > preflight && interrupt > allocation);
  const core = helper.slice(allocation, helper.indexOf("xs.length = outputIndex"));
  assert.equal(core.includes("return null"), false);
  assert.match(helper, /getOwnPropertyDescriptor/);
  assert.match(helper, /globalThis\.ρσ_strict_float_unbox !== trustedUnbox/);
  assert.match(helper, /_CAMPAIGN1_ORIGINAL_ARROW_SEGMENTS\(layer\)/);
  assert.match(helper, /_CAMPAIGN1_ARROW_FALLBACK_CALLS \+= 1/);
  const boundsPreflight = helper.indexOf("Preflight every row and coordinate");
  const boundsInterrupt = helper.indexOf("trustedInterrupt();", boundsPreflight);
  const boundsPublish = helper.indexOf("return trustedDict({", boundsInterrupt);
  assert.ok(boundsPreflight >= 0 && boundsInterrupt > boundsPreflight);
  const boundsCore = helper.slice(boundsInterrupt, boundsPublish);
  assert.equal(boundsCore.includes("return null"), false);
  const surfaceSource = fs.readFileSync(
    path.join(root, "src/lib/sagejs/plotting/surface_layers.py"),
    "utf8",
  );
  assert.equal(
    reviewedBoundsSource(surfaceSource).completeFunctionSha256,
    "89164f75366dc045f2d85a2b6f9d6dfa0668a22a61dfcb9e7165d628c06273c3",
  );
});

test("CPython public calls and import-free geometry oracles agree exactly", () => {
  const oracles = independentOracles(root, 100);
  assert.deepEqual(oracles.cpython.vector, {
    completeDigest:
      "4ab0419a2f23a4d957bd68f269bd48b51a5e430f071c38eac5bcedc8ca90a86c",
    traceDigest:
      "2042e501d00ce14b3dc4cfbb3841c11cc6353eddfad490e1fcc144f9b8f7f671",
    xEntries: 70000,
    yEntries: 70000,
  });
  assert.deepEqual(oracles.cpython.slope, {
    completeDigest:
      "646a80f93d35d8340bdc37cb2dad5da2b95772725b03aefb42c27db3a44dc6d2",
    traceDigest:
      "3bf10438e06678ba41456995d74e46baad0ae5678968e1437b14a10097167ee6",
    xEntries: 30000,
    yEntries: 30000,
  });
  assert.deepEqual(oracles.cpython.surface, {
    completeDigest:
      "d5d13be0765b33d0f85daa70aa83e935be3290a9d6f1fc15b72b8d57105d4e9f",
    traceDigest:
      "0cfe0ef769321c0ccc0be21b45929084083133a40e679c113d6ae252817af4f6",
    xEntries: 10000,
    yEntries: 10000,
  });
  assert.equal(oracles.independent.vector.traceDigest, oracles.cpython.vector.traceDigest);
  assert.equal(oracles.independent.slope.traceDigest, oracles.cpython.slope.traceDigest);
  assert.equal(
    oracles.independent.surface.traceDigest,
    oracles.cpython.surface.traceDigest,
  );
});

test("the standard schedule retains eleven deterministic alternating pairs", () => {
  assert.deepEqual(
    Array.from({ length: 11 }, (_unused, index) => expectedOrder(index)),
    ["AB", "BA", "BA", "AB", "AB", "BA", "BA", "AB", "AB", "BA", "BA"],
  );
  let baseline = 10_000;
  let candidate = 1_000;
  const expected = { completeDigest: "a".repeat(64), traceDigest: "b".repeat(64) };
  const comparison = buildPairedComparison({
    phase: "fixture",
    samples: 11,
    baseline: () => ({ nanoseconds: baseline++, ...expected }),
    candidate: () => ({ nanoseconds: candidate++, ...expected }),
    expected,
  });
  assert.equal(comparison.rawPairs.length, 11);
  assert.equal(comparison.opportunityEvidencePairs.length, 11);
  assert.equal(comparison.positivePairs, 11);
});

test("target dispositions distinguish measured, unavailable, and inconclusive routes", () => {
  const dispositions = candidateDispositions();
  assert.equal(dispositions.generic.status, "measured-baseline");
  assert.equal(dispositions.v8.status, "measured-feasibility-not-production-route");
  assert.equal(dispositions.library.status, "unavailable-no-duplicate");
  assert.equal(dispositions.native.status, "not-run-inconclusive");
  assert.equal(dispositions.wasm.status, "not-run-inconclusive");
});

test("the content-addressed workload has a deterministic catalog insertion", () => {
  const workload = workloadCatalogEntry(independentOracles(root, 100));
  assert.equal(
    workload.id,
    "sha256:4185623b431aeed626004df2db3d23033fde1dde094b426cc28f02c6f85be6c0",
  );
  const catalog = JSON.parse(
    fs.readFileSync(path.join(root, "architecture/optimizer-workloads.json"), "utf8"),
  );
  const insertion = catalogInsertion(catalog, workload);
  assert.equal(insertion.index >= 0, true);
  assert.equal(typeof insertion.beforeId === "string" || insertion.beforeId === null, true);
  assert.equal(typeof insertion.afterId === "string" || insertion.afterId === null, true);
});

test("standard evidence refuses an unauthenticated smoke escape hatch", async () => {
  await assert.rejects(
    runFeasibility({ allowUnverifiedBuild: true }),
    /standard arrow-field evidence cannot use an unverified build/,
  );
});

test("the current-build smoke is exact, guarded, and explicitly non-promotable", {
  skip: !fs.existsSync(path.join(root, "dist/tools/kernel-evaluator.js")),
  timeout: 180_000,
}, async () => {
  const report = await runFeasibility({
    root,
    points: 5,
    samples: 1,
    warmups: 1,
    allowUnverifiedBuild: true,
  });
  assert.equal(report.status, "development-smoke-non-promotable");
  assert.equal(report.promotable, false);
  assert.equal(report.productionCompilerRouteClaim, "none");
  assert.equal(report.comparisons.representativeVector.rawPairs.length, 1);
  assert.equal(report.comparisons.heldoutSlope.rawPairs.length, 1);
  assert.equal(report.comparisons.independentSurface.rawPairs.length, 1);
  assert.equal(
    report.comparisons.vectorCopyMaterializationNegative.rawPairs.length,
    1,
  );
  assert.equal(report.guardAudit.transactionalPublication, true);
  assert.equal(report.guardAudit.independentSurfaceExact, true);
});
