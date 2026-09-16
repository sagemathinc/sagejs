"use strict";

/*
 * Rebuild the frozen splitting-degree catalog with the compiler's Stage-A
 * checked-region machinery.  This is intentionally an experiment driver:
 * it consumes an already-built ordinary kernel (and its portable IR), installs
 * a compiler-owned declaration, emits a private checked graph, and builds the
 * result in a disposable directory.  No arithmetic or bounds check is removed.
 *
 * Usage:
 *   node check_stage_a_catalog_region.cjs \
 *     FIXTURES_JSON BASELINE_BUILD_DIRECTORY COMPILER_WORKTREE
 */

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");

const [fixturesArgument, baselineArgument, compilerArgument] =
  process.argv.slice(2);
if (!fixturesArgument || !baselineArgument || !compilerArgument) {
  throw new Error(
    "usage: node check_stage_a_catalog_region.cjs " +
      "FIXTURES_JSON BASELINE_BUILD_DIRECTORY COMPILER_WORKTREE",
  );
}

const fixturesPath = resolve(fixturesArgument);
const baselineDirectory = resolve(baselineArgument);
const compilerRoot = resolve(compilerArgument);
const { generateArtifacts } = require(join(
  compilerRoot,
  "tools/native-kernel/c-backend.cjs",
));
const {
  installCheckedRegionDeclarations,
  prepareCheckedRegions,
} = require(join(compilerRoot, "tools/native-kernel/checked-regions.cjs"));

const ENTRY = "int64_pari_prime_degree_catalog";

// This is the complete lowered graph cloned by the successful generated-C
// diagnostic.  Keep the order stable: it is the source/provenance order in the
// frozen baseline IR, not a hand-selected subset of hot helpers.
const GRAPH = Object.freeze([
  "int64_pari_prime_degree_catalog",
  "int64_pari_flx_small_factor_workspace_size",
  "int64_pari_get_fs_small",
  "int64_pari_f2x_small_degfact",
  "uint64_f2x_div_exact",
  "uint64_f2x_rem",
  "uint64_f2x_degree_nonzero",
  "int64_pari_flx_small_degfact",
  "int64_pari_flx_small_ddf",
  "int64_pari_flx_small_krouu_odd",
  "int64_pari_flx_small_sort_factor",
  "int64_pari_flx_small_squarefree",
  "_int64_pari_flx_small_ddf",
  "int64_pari_flx_small_quotient",
  "int64_pari_flx_small_optpow",
  "int64_pari_flx_normalize",
  "int64_pari_flx_copy",
  "uint64_pari_word_mod_inverse",
  "int64_pari_flx_deflate",
  "int64_pari_flx_deriv",
  "int64_pari_flx_gcd",
  "int64_pari_flx_divrem",
  "_int64_pari_flx_divrem",
  "int64_pari_flx_flxqv_eval",
  "int64_pari_flxq_mul",
  "int64_pari_flx_mul",
  "int64_pari_flx_rem",
  "int64_pari_flx_sub",
  "int64_pari_flxq_powers",
  "int64_pari_flxq_sqr",
  "int64_pari_flx_sqr",
  "int64_pari_flxq_powu",
  "int64_positive_bit_length",
  "int64_power_of_two",
  "int64_shift_right",
  "int64_pari_flx_div",
]);

// Stage A currently supports scalar intervals and constant buffer minima.  This
// is the conservative expressible projection of the diagnostic's stronger
// relational preflight.  It is enough to route every frozen packet through the
// private graph.  Because Stage A retains every check, omitted relationships
// cannot weaken public behavior.
const GUARD = Object.freeze([
  { kind: "buffer-min-length", parameter: "state", minimum: 4 },
  { kind: "int64-range", parameter: "degree", minimum: 2, maximum: 4 },
  {
    kind: "int64-range",
    parameter: "prime_count",
    minimum: 0,
    // Together with degree <= 4 this implies the capacity multiplication fits.
    maximum: "2305843009213693951",
  },
  // The exact relation is length >= degree + 1.  Three is the strongest
  // constant lower bound common to every accepted degree.
  { kind: "buffer-min-length", parameter: "coefficients", minimum: 3 },
  { kind: "buffer-min-length", parameter: "exact_workspace", minimum: 29 },
  { kind: "buffer-min-length", parameter: "word_workspace", minimum: 393 },
  { kind: "buffer-min-length", parameter: "word_metadata", minimum: 393 },
  { kind: "buffer-min-length", parameter: "factor_degrees", minimum: 4 },
  { kind: "buffer-min-length", parameter: "factor_exponents", minimum: 4 },
  { kind: "buffer-min-length", parameter: "group_degrees", minimum: 4 },
  { kind: "buffer-min-length", parameter: "group_counts", minimum: 4 },
  { kind: "buffer-min-length", parameter: "local_state", minimum: 3 },
]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function snapshot(arguments_) {
  return arguments_.map((value) => {
    if (typeof value === "bigint") return String(value);
    if (typeof value.toArray === "function") return value.toArray().map(String);
    return Array.from(value).map(String);
  });
}

function makeArguments(kernel, packet) {
  return packet.map((entry, index) => {
    if (!Array.isArray(entry)) return BigInt(entry);
    if (index === 8) return kernel.createUInt64Buffer(entry.map(BigInt));
    if ([5, 6, 7].includes(index)) {
      return kernel.createIntegerBuffer(entry.length, 16, entry.map(BigInt));
    }
    return kernel.createInt64Buffer(entry.map(BigInt));
  });
}

function geometricMean(values) {
  return Math.exp(
    values.reduce((sum, value) => sum + Math.log(value), 0) / values.length,
  );
}

function elfTextBytes(filename) {
  if (process.platform !== "linux") return null;
  const measured = spawnSync("size", [filename], { encoding: "utf8" });
  if (measured.status !== 0) return null;
  const line = measured.stdout.trim().split("\n").at(-1);
  const value = Number(line.trim().split(/\s+/, 1)[0]);
  return Number.isSafeInteger(value) ? value : null;
}

function batch(kernel, arguments_, repetitions) {
  const start = process.hrtime.bigint();
  for (let index = 0; index < repetitions; index += 1) {
    assert.equal(Number(kernel.tagged(...arguments_)), 0);
  }
  return Number(process.hrtime.bigint() - start) / 1e6;
}

function packetSatisfiesProjection(packet) {
  const degree = BigInt(packet[1]);
  const primeCount = BigInt(packet[4]);
  return (
    packet[22].length >= 4 &&
    degree >= 2n &&
    degree <= 4n &&
    primeCount >= 0n &&
    primeCount <= 2305843009213693951n &&
    packet[0].length >= 3 &&
    packet[5].length >= 29 &&
    packet[8].length >= 393 &&
    packet[9].length >= 393 &&
    packet[10].length >= 4 &&
    packet[11].length >= 4 &&
    packet[12].length >= 4 &&
    packet[13].length >= 4 &&
    packet[14].length >= 3
  );
}

const manifest = JSON.parse(
  readFileSync(join(baselineDirectory, "manifest.json"), "utf8"),
);
assert.deepEqual(
  manifest.ir.functions.map((fn) => fn.name),
  GRAPH,
  "the frozen lowered graph changed",
);
const graphSet = new Set(GRAPH);
const edges = [];
for (const caller of GRAPH) {
  for (const callee of manifest.ir.callGraph?.[caller] || []) {
    assert(graphSet.has(callee), `${caller} calls outside graph: ${callee}`);
    edges.push([caller, callee]);
  }
}

installCheckedRegionDeclarations(manifest.ir, [
  { entry: ENTRY, functions: GRAPH, guard: GUARD },
]);
const [prepared] = prepareCheckedRegions(manifest.ir);
assert.equal(prepared.variants.length, GRAPH.length);

const artifacts = generateArtifacts(manifest.ir, {
  moduleIdentity: manifest.moduleIdentity,
});
const privatePrefix = "tagged_sagejs_checked_r0_";
assert.equal(
  (artifacts.coreSource.match(
    /static int tagged_sagejs_checked_r0_[A-Za-z0-9_]+\(/g,
  ) || []).length,
  GRAPH.length * 2,
  "expected one prototype and one definition for every private function",
);
const dispatchNeedle = `return ${privatePrefix}${ENTRY}(`;
assert(artifacts.coreSource.includes(dispatchNeedle), "missing guarded dispatch");
const firstPrivateDefinition = artifacts.coreSource.indexOf(
  `static int ${privatePrefix}${ENTRY}(`,
  artifacts.coreSource.indexOf(`static int ${privatePrefix}${ENTRY}(`) + 1,
);
const firstNativeDefinition = artifacts.coreSource.indexOf(
  `static int native_${ENTRY}(`,
  firstPrivateDefinition,
);
assert.notEqual(firstNativeDefinition, -1, "missing native entry definition");
const privateDefinitions = artifacts.coreSource.slice(
  firstPrivateDefinition,
  firstNativeDefinition,
);
assert.match(privateDefinitions, /sagejs_word_(?:add|sub|mul)_int64\(/);
assert.match(privateDefinitions, /index out of range/);

const outputDirectory = mkdtempSync(join(tmpdir(), "sagejs-stage-a-catalog-"));
for (const filename of ["binding.gyp", "index.cjs", "manifest.json"]) {
  copyFileSync(
    join(baselineDirectory, filename),
    join(outputDirectory, filename),
  );
}
writeFileSync(join(outputDirectory, "kernel.c"), artifacts.adapterSource);
writeFileSync(join(outputDirectory, "kernel_core.c"), artifacts.coreSource);
writeFileSync(join(outputDirectory, "kernel_core.h"), artifacts.coreHeader);

const nodeGyp = require.resolve("node-gyp/bin/node-gyp.js", {
  paths: [join(compilerRoot, "packages/flint")],
});
const build = spawnSync(process.execPath, [nodeGyp, "rebuild", "--jobs", "4"], {
  cwd: outputDirectory,
  encoding: "utf8",
  maxBuffer: 32 * 1024 * 1024,
});
if (build.status !== 0) {
  process.stderr.write(build.stdout || "");
  process.stderr.write(build.stderr || "");
  throw new Error(`node-gyp exited with status ${build.status}`);
}
writeFileSync(join(outputDirectory, "rebuild.log"), build.stdout + build.stderr);

const fixturesBytes = readFileSync(fixturesPath);
const fixtures = JSON.parse(fixturesBytes);
assert.equal(fixtures.packets.length, 4);
assert(fixtures.packets.every(packetSatisfiesProjection));
const baseline = require(join(baselineDirectory, "index.cjs"))[ENTRY];
const stageA = require(join(outputDirectory, "index.cjs"))[ENTRY];

for (let index = 0; index < fixtures.packets.length; index += 1) {
  const arguments_ = makeArguments(stageA, fixtures.packets[index]);
  const result = Number(stageA.tagged(...arguments_));
  assert.deepEqual(
    { result, args: snapshot(arguments_) },
    fixtures.expected[index],
  );
}

const baselineArguments = makeArguments(baseline, fixtures.packets[0]);
const stageAArguments = makeArguments(stageA, fixtures.packets[0]);
const calibrate = (kernel, arguments_) =>
  Math.max(1, Math.ceil(1000 / batch(kernel, arguments_, 1)));
const baselineRepetitions = calibrate(baseline, baselineArguments);
const stageARepetitions = calibrate(stageA, stageAArguments);
for (let index = 0; index < 2; index += 1) {
  batch(baseline, baselineArguments, baselineRepetitions);
  batch(stageA, stageAArguments, stageARepetitions);
}
const baselineMilliseconds = [];
const stageAMilliseconds = [];
for (let pair = 0; pair < 7; pair += 1) {
  const runBaseline = () =>
    baselineMilliseconds.push(
      batch(baseline, baselineArguments, baselineRepetitions) /
        baselineRepetitions,
    );
  const runStageA = () =>
    stageAMilliseconds.push(
      batch(stageA, stageAArguments, stageARepetitions) / stageARepetitions,
    );
  if (pair % 2 === 0) {
    runBaseline();
    runStageA();
  } else {
    runStageA();
    runBaseline();
  }
}

const baselineCore = readFileSync(join(baselineDirectory, "kernel_core.c"));
const stageACore = readFileSync(join(outputDirectory, "kernel_core.c"));
const baselineAddon = join(
  baselineDirectory,
  "build/Release/sagejs_native_kernel.node",
);
const stageAAddon = join(
  outputDirectory,
  "build/Release/sagejs_native_kernel.node",
);
const result = {
  schema: "sagejs.checked-region/catalog-stage-a-v1",
  diagnosticOnly: true,
  checksRemoved: false,
  entry: ENTRY,
  graph: GRAPH,
  edges,
  guardProjection: GUARD,
  relationalGuardPending: true,
  frozenPackets: fixtures.packets.length,
  activeOutputs: 7081,
  privateVariantCount: prepared.variants.length,
  privateDispatchPresent: true,
  privateChecksRetained: true,
  fixtureSha256: sha256(fixturesBytes),
  baselineCoreSha256: sha256(baselineCore),
  stageACoreSha256: sha256(stageACore),
  baselineCoreBytes: baselineCore.length,
  stageACoreBytes: stageACore.length,
  baselineAddonBytes: statSync(baselineAddon).size,
  stageAAddonBytes: statSync(stageAAddon).size,
  baselineElfTextBytes: elfTextBytes(baselineAddon),
  stageAElfTextBytes: elfTextBytes(stageAAddon),
  timing: {
    boundary: "tagged packet zero; packing/build/assertions excluded",
    alternatingPairs: 7,
    baselineRepetitions,
    stageARepetitions,
    baselineMilliseconds,
    stageAMilliseconds,
    baselineGeometricMeanMilliseconds: geometricMean(baselineMilliseconds),
    stageAGeometricMeanMilliseconds: geometricMean(stageAMilliseconds),
    stageAToBaselineRatio:
      geometricMean(stageAMilliseconds) / geometricMean(baselineMilliseconds),
    qualified: false,
  },
  outputDirectory,
};
console.log(JSON.stringify(result));
