// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const { pythonExecutable } = require("../tools/python-executable.cjs");
const {
  PROFILE_SOURCE,
  PUBLIC_SOURCE,
  SOURCE_PATHS,
  buildPairedComparison,
  candidateDispositions,
  catalogInsertion,
  consumerObligations,
  deriveCandidateSource,
  deriveFloatMaterializationSource,
  expectedOrder,
  helperSource,
  independentCpythonOracle,
  oracleEvidence,
  runFeasibility,
  workloadCatalogEntry,
} = require("../bench/optimizer-workloads/binary64-nested-all.cjs");

const root = path.resolve(__dirname, "..");
const profileSource = fs.readFileSync(path.join(root, PROFILE_SOURCE), "utf8");
const publicSource = fs.readFileSync(path.join(root, PUBLIC_SOURCE), "utf8");

test("the workload and checked target remain ordinary CPython-parseable source", () => {
  const result = spawnSync(
    pythonExecutable(),
    ["-c", "compile(open(__import__('sys').argv[1]).read(), __import__('sys').argv[1], 'exec')", PROFILE_SOURCE],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(SOURCE_PATHS, [PROFILE_SOURCE, PUBLIC_SOURCE]);
  assert.match(profileSource, /def __profile_prepare__\(\)/);
  assert.match(profileSource, /def __profile_run__\(\)/);
  assert.match(profileSource, /campaign1_scalar_grid\(\)/);
  assert.match(profileSource, /campaign1_vector_grid\(\)/);
});

test("the feasibility module changes only the two reviewed nested all expressions", () => {
  const candidate = deriveCandidateSource(publicSource, profileSource);
  const helper = helperSource(profileSource);
  const candidatePublic = candidate.slice(
    0,
    candidate.lastIndexOf("# BEGIN CAMPAIGN1 CHECKED NESTED BINARY64 ALL"),
  ).trimEnd();
  const restored = candidatePublic
    .replace(
      `if numeric_values is not None and _campaign1_checked_nested_binary64_all(
            numeric_values, all, math.isfinite, False
        ):`,
      `if numeric_values is not None and all(
            math.isfinite(value) for row in numeric_values for value in row
        ):`,
    )
    .replace(
      `if numeric_pairs is not None and _campaign1_checked_nested_binary64_all(
            numeric_pairs, all, math.isfinite, True
        ):`,
      `if numeric_pairs is not None and all(
            math.isfinite(pair[0]) and math.isfinite(pair[1])
            for row in numeric_pairs
            for pair in row
        ):`,
    );
  assert.equal(restored, publicSource.trimEnd());
  assert.equal(candidate.endsWith(`${helper}\n`), true);
  assert.match(helper, /current_all is not _CAMPAIGN1_EXPECTED_ALL/);
  assert.match(helper, /current_isfinite is not _CAMPAIGN1_EXPECTED_ISFINITE/);
  assert.match(helper, /_campaign1_strict_float_unbox/);
  assert.match(helper, /visited % 1024 == 0/);
  assert.match(helper, /return _campaign1_original_nested_all/);
});

test("the adjacent negative changes only scalar float materialization", () => {
  const candidate = deriveFloatMaterializationSource(publicSource, profileSource);
  const candidatePublic = candidate.slice(
    0,
    candidate.lastIndexOf("# BEGIN CAMPAIGN1 CHECKED NESTED BINARY64 ALL"),
  ).trimEnd();
  const restored = candidatePublic.replace(
    `numeric_values = _campaign1_checked_binary64_float_matrix(
                raw_values, float
            )`,
    "numeric_values = [[float(value) for value in row] for row in raw_values]",
  );
  assert.equal(restored, publicSource.trimEnd());
  assert.match(candidate, /def _campaign1_checked_binary64_float_matrix/);
  assert.match(candidate, /return _campaign1_original_float_matrix/);
});

test("independent CPython pins both exact complete public outputs", () => {
  const oracle = independentCpythonOracle(400, 100);
  assert.deepEqual(oracleEvidence(oracle), {
    scalarCompleteOutputDigest:
      "86e417db19f71fde2b9333516cb8d03c8be8f7e94f95feb340c4cb87be79a46e",
    vectorCompleteOutputDigest:
      "bc1f40169c03e0a4491c7ba6fd2284c8dc139fa32522cb72c22a5dd0009d730e",
  });
  assert.deepEqual(oracle.scalar.shape, [400, 400]);
  assert.deepEqual(oracle.scalar.bounds, [0, 1197]);
  assert.deepEqual(oracle.vector.shape, [100, 100]);
  assert.equal(oracle.vector.maximum_magnitude, 99.25);
});

test("the raw comparison preserves all eleven deterministic ABBA pairs", () => {
  assert.deepEqual(
    Array.from({ length: 11 }, (_unused, index) => expectedOrder(index)),
    ["AB", "BA", "BA", "AB", "AB", "BA", "BA", "AB", "AB", "BA", "BA"],
  );
  let baselineClock = 10_000;
  let candidateClock = 1_000;
  const digest = "a".repeat(64);
  const comparison = buildPairedComparison({
    phase: "fixture",
    samples: 11,
    baseline: () => ({ nanoseconds: baselineClock++, digest }),
    candidate: () => ({ nanoseconds: candidateClock++, digest }),
    digest,
  });
  assert.equal(comparison.rawPairs.length, 11);
  assert.equal(comparison.opportunityEvidencePairs.length, 11);
  assert.ok(comparison.rawPairs.every(
    (pair) => pair.baselineCompleteOutputDigest === digest &&
      pair.candidateCompleteOutputDigest === digest,
  ));
});

test("all target outcomes and unrun promotion obligations remain explicit", () => {
  assert.deepEqual(Object.keys(candidateDispositions()), [
    "generic",
    "library",
    "native",
    "v8",
    "wasm",
  ]);
  assert.equal(candidateDispositions().v8.status,
    "measured-feasibility-not-production-route");
  assert.equal(candidateDispositions().native.status, "not-run-inconclusive");
  assert.equal(candidateDispositions().wasm.status, "not-run-inconclusive");
  assert.equal(candidateDispositions().library.status,
    "rejected-not-a-duplicate");

  const obligations = consumerObligations();
  assert.equal(obligations.primaryScalar.status, "measured-by-this-receipt");
  assert.equal(obligations.positiveHeldoutVector.status,
    "measured-by-this-receipt");
  assert.equal(obligations.periodConsumer.status,
    "not-run-requires-post-implementation-neighbor-receipt");
  assert.equal(obligations.classUnitConsumer.status,
    "not-run-requires-post-implementation-neighbor-receipt");
});

test("the exact catalog document has a deterministic sorted insertion", () => {
  const oracle = independentCpythonOracle(400, 100);
  const workload = workloadCatalogEntry(oracle);
  assert.equal(
    workload.id,
    "sha256:abf5e3e0adb55ed60551d3a8c7f4c45004b6cc1b56f2efa6813de4a9a52ce169",
  );
  assert.equal(
    workload.input.digest,
    "7e510042c6c735c8b958658b61991dcbb65845b3d4bf543186b09c8937495455",
  );
  assert.equal(
    workload.oracles[0].expectedDigest,
    "69ff2806ccbeeafc7770e46a2f62af39544b45ad400c22690d6eda890a4cbd79",
  );
  const catalog = JSON.parse(
    fs.readFileSync(path.join(root, "architecture/optimizer-workloads.json"), "utf8"),
  );
  assert.deepEqual(catalogInsertion(catalog, workload), {
    index: 9,
    beforeId:
      "sha256:95c54d3ec3da97334bc810a684ac85edf8f0da6cd6df1d54236d97fb48a546d5",
    afterId:
      "sha256:ac4f25a1636552870e352c39de5046ebdf2cbc058e10a5d9ad2955582ff426c0",
  });
});

test("standard evidence refuses the non-promotable smoke escape hatch", async () => {
  await assert.rejects(
    runFeasibility({ allowUnverifiedBuild: true }),
    /standard binary64 nested-all evidence cannot use an unverified build/,
  );
});

test("the real smoke run is exact, guarded, and mechanically non-promotable", {
  skip: !fs.existsSync(path.join(root, "dist/tools/kernel-evaluator.js")),
  timeout: 180_000,
}, async () => {
  const report = await runFeasibility({
    root,
    scalarPoints: 16,
    vectorPoints: 8,
    samples: 1,
    warmups: 1,
    allowUnverifiedBuild: true,
  });
  assert.equal(report.status, "development-smoke-non-promotable");
  assert.equal(report.promotable, false);
  assert.equal(report.opportunityEvidenceAdapter.consumable, false);
  assert.equal(report.comparisons.scalar.rawPairs.length, 1);
  assert.equal(report.comparisons.vector.rawPairs.length, 1);
  assert.deepEqual(
    report.exactDifferential.currentGeneric,
    report.exactDifferential.checkedV8,
  );
  assert.deepEqual(
    report.exactDifferential.sagejsO0,
    report.exactDifferential.currentGeneric,
  );
  assert.equal(
    report.exactDifferential.checkedFloatMaterializationNegative
      .scalarCompleteOutputDigest,
    report.exactDifferential.currentGeneric.scalarCompleteOutputDigest,
  );
  assert.equal(
    report.comparisons.scalarFloatMaterializationNegative.rawPairs.length,
    1,
  );
});
