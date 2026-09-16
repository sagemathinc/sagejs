"use strict";

/*
 * Rebuild the frozen splitting-degree catalog with the compiler's Stage-A
 * checked-region machinery. This is intentionally an experiment driver:
 * it consumes an already-built ordinary kernel (and its portable IR), installs
 * a compiler-owned declaration, emits a private checked graph, and builds the
 * result in a disposable directory. Pass `stage-a` to retain every check,
 * `stage-d` to enable only the capabilities proved from the full guard, or
 * `stage-e` to additionally virtualize validated nonescaping UInt64 views, or
 * `stage-f` to add the bounded local copy variant to Stage E, or `stage-g` to
 * rewrite proved copy edges to one direct-result private core.
 *
 * Usage:
 *   node check_stage_a_catalog_region.cjs \
 *     FIXTURES_JSON BASELINE_BUILD_DIRECTORY COMPILER_WORKTREE MODE
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

const [fixturesArgument, baselineArgument, compilerArgument, mode = "stage-d"] =
  process.argv.slice(2);
if (!fixturesArgument || !baselineArgument || !compilerArgument) {
  throw new Error(
    "usage: node check_stage_a_catalog_region.cjs " +
      "FIXTURES_JSON BASELINE_BUILD_DIRECTORY COMPILER_WORKTREE MODE",
  );
}
if (!["stage-a", "stage-d", "stage-e", "stage-f", "stage-g"].includes(mode)) {
  throw new Error(
    "MODE must be stage-a, stage-d, stage-e, stage-f, or stage-g",
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
  checkedRegionDirectCallEmission,
  checkedRegionDirectResultEmission,
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

// This is the complete preflight recovered from the successful generated-C
// diagnostic, expressed in the compiler's fail-closed relational vocabulary.
const GUARD = Object.freeze([
  { kind: "buffer-min-length", parameter: "state", minimum: 4 },
  { kind: "int64-range", parameter: "degree", minimum: 2, maximum: 4 },
  {
    kind: "int64-range",
    parameter: "prime_count",
    minimum: 0,
    maximum: "9223372036854775807",
  },
  {
    kind: "checked-nonnegative-int64-product",
    name: "capacity",
    left: "prime_count",
    right: "degree",
  },
  {
    kind: "buffer-min-length-affine",
    buffer: "coefficients",
    scalar: "degree",
    offset: 1,
  },
  {
    kind: "buffer-min-length-scalar",
    buffer: "primes",
    scalar: "prime_count",
  },
  { kind: "buffer-min-length", parameter: "exact_workspace", minimum: 29 },
  { kind: "buffer-min-length", parameter: "word_workspace", minimum: 393 },
  { kind: "buffer-min-length", parameter: "word_metadata", minimum: 393 },
  { kind: "buffer-min-length-scalar", buffer: "factor_degrees",
    scalar: "degree" },
  { kind: "buffer-min-length-scalar", buffer: "factor_exponents",
    scalar: "degree" },
  { kind: "buffer-min-length-scalar", buffer: "group_degrees",
    scalar: "degree" },
  { kind: "buffer-min-length-scalar", buffer: "group_counts",
    scalar: "degree" },
  { kind: "buffer-min-length", parameter: "local_state", minimum: 3 },
  { kind: "buffer-min-length-scalar", buffer: "pattern_offsets",
    scalar: "prime_count" },
  { kind: "buffer-min-length-scalar", buffer: "pattern_counts",
    scalar: "prime_count" },
  { kind: "buffer-min-length-scalar", buffer: "full_offsets",
    scalar: "prime_count" },
  { kind: "buffer-min-length-scalar", buffer: "full_counts",
    scalar: "prime_count" },
  { kind: "buffer-min-length-product", buffer: "pattern_degrees",
    product: "capacity" },
  { kind: "buffer-min-length-product", buffer: "pattern_multiplicities",
    product: "capacity" },
  { kind: "buffer-min-length-product", buffer: "full_degrees",
    product: "capacity" },
]);

const STAGE_D_CAPABILITIES = Object.freeze([
  "int64-arithmetic",
  "direct-buffer-access",
  "verified-span-access",
]);
const STAGE_E_CAPABILITIES = Object.freeze([
  ...STAGE_D_CAPABILITIES,
  "virtual-fixed-uint64-views",
]);
const STAGE_F_LOCAL_VARIANTS = Object.freeze([Object.freeze({
  function: "int64_pari_flx_copy",
  guard: Object.freeze([Object.freeze({
    kind: "int64-range",
    parameter: "da",
    minimum: -1,
    maximum: 8,
  })]),
  capabilities: Object.freeze(["interval-view-access"]),
})]);
const STAGE_G_LOCAL_VARIANTS = Object.freeze([Object.freeze({
  ...STAGE_F_LOCAL_VARIANTS[0],
  mode: "direct-result",
})]);
const CAPABILITIES = mode === "stage-a"
  ? Object.freeze([])
  : mode === "stage-d"
    ? STAGE_D_CAPABILITIES
    : STAGE_E_CAPABILITIES;
const LOCAL_VARIANTS = mode === "stage-f"
  ? STAGE_F_LOCAL_VARIANTS
  : mode === "stage-g"
    ? STAGE_G_LOCAL_VARIANTS
    : Object.freeze([]);

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

function execute(kernel, packet) {
  const arguments_ = makeArguments(kernel, packet);
  let outcome;
  try {
    outcome = { kind: "result", value: String(kernel.tagged(...arguments_)) };
  } catch (error) {
    outcome = {
      kind: "exception",
      name: error?.name || null,
      message: error?.message || String(error),
    };
  }
  return { outcome, arguments: snapshot(arguments_) };
}

function changedPacket(packet, change) {
  const copy = structuredClone(packet);
  change(copy);
  return copy;
}

function geometricMean(values) {
  return Math.exp(
    values.reduce((sum, value) => sum + Math.log(value), 0) / values.length,
  );
}

function functionText(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `(?:static|SAGEJS_CHECKED_REGION_(?:HOT_INLINE|COLD)) int ` +
      `tagged_${escaped}\\([^;]+\\)\\n\\{`,
  ).exec(source);
  assert(match, `missing ${name}`);
  const end = source.indexOf("\n}\n", match.index);
  assert.notEqual(end, -1, `unterminated ${name}`);
  return source.slice(match.index, end + 3);
}

function directFunctionText(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `SAGEJS_CHECKED_REGION_HOT_INLINE [^\\n]+ ` +
      `sagejs_direct_${escaped}\\([^;]+\\)\\n\\{`,
  ).exec(source);
  assert(match, `missing direct ${name}`);
  const end = source.indexOf("\n}\n", match.index);
  assert.notEqual(end, -1, `unterminated direct ${name}`);
  return source.slice(match.index, end + 3);
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

function packetSatisfiesGuard(packet) {
  const degree = BigInt(packet[1]);
  const primeCount = BigInt(packet[4]);
  const capacity = degree * primeCount;
  return (
    packet[22].length >= 4 &&
    degree >= 2n &&
    degree <= 4n &&
    primeCount >= 0n &&
    capacity <= 9223372036854775807n &&
    BigInt(packet[0].length) >= degree + 1n &&
    BigInt(packet[3].length) >= primeCount &&
    packet[5].length >= 29 &&
    packet[8].length >= 393 &&
    packet[9].length >= 393 &&
    BigInt(packet[10].length) >= degree &&
    BigInt(packet[11].length) >= degree &&
    BigInt(packet[12].length) >= degree &&
    BigInt(packet[13].length) >= degree &&
    packet[14].length >= 3 &&
    BigInt(packet[15].length) >= primeCount &&
    BigInt(packet[16].length) >= primeCount &&
    BigInt(packet[19].length) >= primeCount &&
    BigInt(packet[20].length) >= primeCount &&
    BigInt(packet[17].length) >= capacity &&
    BigInt(packet[18].length) >= capacity &&
    BigInt(packet[21].length) >= capacity
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
  {
    entry: ENTRY,
    functions: GRAPH,
    guard: GUARD,
    capabilities: CAPABILITIES,
    localVariants: LOCAL_VARIANTS,
  },
]);
const [prepared] = prepareCheckedRegions(manifest.ir);
assert.equal(prepared.variants.length, GRAPH.length + LOCAL_VARIANTS.length);
const preparedFunctions = new Map(
  prepared.variants.map((variant) => [variant.name, variant]),
);
const directResultVariants = prepared.variants.filter(
  (variant) => checkedRegionDirectResultEmission(variant) !== undefined,
);
const directCallSites = [];
for (const variant of prepared.variants) {
  const visitCalls = (value) => {
    if (value === null || typeof value !== "object") return;
    if (
      value.kind === "native.call" &&
      checkedRegionDirectCallEmission(
        variant,
        value,
        preparedFunctions,
      ) !== undefined
    ) {
      directCallSites.push({ function: variant.name, operation: value.id });
    }
    for (const [key, child] of Object.entries(value)) {
      if (key !== "provenance") visitCalls(child);
    }
  };
  visitCalls(variant.body);
}
assert.equal(directResultVariants.length, mode === "stage-g" ? 1 : 0);
assert.equal(directCallSites.length, mode === "stage-g" ? 3 : 0);
const localIntervalProofs = [];
for (const variant of prepared.variants) {
  if (!variant.checkedRegionLocalCapabilities?.includes("interval-view-access")) {
    continue;
  }
  const visit = (value) => {
    if (value === null || typeof value !== "object") return;
    const proof = value.checkedRegionVirtualUInt64ViewProof?.logicalIndexProof;
    if (proof !== undefined) localIntervalProofs.push(proof);
    for (const [key, child] of Object.entries(value)) {
      if (key !== "provenance") visit(child);
    }
  };
  visit(variant.body);
}
assert.equal(
  localIntervalProofs.length,
  mode === "stage-f" || mode === "stage-g" ? 5 : 0,
);

const artifacts = generateArtifacts(manifest.ir, {
  moduleIdentity: manifest.moduleIdentity,
});
const privatePrefix = "tagged_sagejs_checked_r0_";
assert.equal(
  (artifacts.coreSource.match(
    /(?:static|SAGEJS_CHECKED_REGION_HOT_INLINE) int tagged_sagejs_checked_r0_[A-Za-z0-9_]+\(/g,
  ) || []).length,
  (GRAPH.length + (mode === "stage-g" ? 0 : LOCAL_VARIANTS.length)) * 2,
  "expected one prototype and one definition for every private function",
);
const dispatchNeedle = `return ${privatePrefix}${ENTRY}(`;
assert(artifacts.coreSource.includes(dispatchNeedle), "missing guarded dispatch");
const privateDefinition = new RegExp(
  `(?:static|SAGEJS_CHECKED_REGION_HOT_INLINE) int ` +
    `${privatePrefix}${ENTRY}\\([^;]+\\)\\n\\{`,
).exec(artifacts.coreSource);
assert(privateDefinition, "missing private entry definition");
const firstPrivateDefinition = privateDefinition.index;
const nativeDefinition = new RegExp(
  `static int native_${ENTRY}\\([^;]+\\)\\n\\{`,
).exec(artifacts.coreSource.slice(firstPrivateDefinition));
assert(nativeDefinition, "missing native entry definition");
const firstNativeDefinition = firstPrivateDefinition + nativeDefinition.index;
const privateDefinitions = artifacts.coreSource.slice(
  firstPrivateDefinition,
  firstNativeDefinition,
);
const count = (source, expression) => (source.match(expression) || []).length;
const privateSiteCounts = {
  checkedInt64Arithmetic: count(
    privateDefinitions,
    /sagejs_word_(?:add|sub|mul)_int64\(/g,
  ),
  bufferBoundsFailures: count(
    privateDefinitions,
    /(?:Int64|UInt64)Buffer index out of range/g,
  ),
  viewValidationFailures: count(
    privateDefinitions,
    /UInt64Buffer view is outside its buffer/g,
  ),
  uint64BufferLocalDeclarations: count(
    privateDefinitions,
    /sagejs_uint64_buffer\s+[A-Za-z0-9_]+\s*=\s*\{0\}/g,
  ),
  viewDataAssignments: count(privateDefinitions, /\.data =/g),
  viewLengthAssignments: count(privateDefinitions, /\.length =/g),
  viewOffsetAdjustments: count(privateDefinitions, /\.data \+=/g),
  signedBufferIndexCalls: count(
    privateDefinitions,
    /sagejs_signed_buffer_index\(/g,
  ),
  uint64BoundsFailures: count(
    privateDefinitions,
    /UInt64Buffer index out of range/g,
  ),
  int64BoundsFailures: count(
    privateDefinitions,
    /(?<!U)Int64Buffer index out of range/g,
  ),
};
if (mode === "stage-a") {
  assert.match(privateDefinitions, /sagejs_word_(?:add|sub|mul)_int64\(/);
  assert.match(privateDefinitions, /index out of range/);
}
if (mode === "stage-d") {
  assert.equal(privateSiteCounts.viewValidationFailures, 11);
  assert.equal(privateSiteCounts.uint64BufferLocalDeclarations, 22);
  assert.equal(privateSiteCounts.viewDataAssignments, 11);
  assert.equal(privateSiteCounts.viewLengthAssignments, 11);
  assert.equal(privateSiteCounts.viewOffsetAdjustments, 11);
}
if (mode === "stage-e") {
  assert.equal(privateSiteCounts.viewValidationFailures, 11);
  assert.equal(privateSiteCounts.uint64BufferLocalDeclarations, 0);
  assert.equal(privateSiteCounts.viewDataAssignments, 0);
  assert.equal(privateSiteCounts.viewLengthAssignments, 0);
  assert.equal(privateSiteCounts.viewOffsetAdjustments, 0);
}
if (mode === "stage-f") {
  assert.equal(privateSiteCounts.viewValidationFailures, 11);
  assert.equal(privateSiteCounts.checkedInt64Arithmetic, 273);
  assert.equal(privateSiteCounts.bufferBoundsFailures, 63);
  assert.equal(privateSiteCounts.signedBufferIndexCalls, 62);
  assert.equal(privateSiteCounts.uint64BoundsFailures, 63);
  assert.equal(privateSiteCounts.uint64BufferLocalDeclarations, 0);
  assert.equal(privateSiteCounts.viewDataAssignments, 0);
  assert.equal(privateSiteCounts.viewLengthAssignments, 0);
  assert.equal(privateSiteCounts.viewOffsetAdjustments, 0);

  const copyWrapper = functionText(
    artifacts.coreSource,
    "sagejs_checked_r0_int64_pari_flx_copy",
  );
  const copyFast = functionText(
    artifacts.coreSource,
    "sagejs_checked_r0_int64_pari_flx_copy__local_fast_0",
  );
  assert.match(copyWrapper, /sagejs_tagged_arg_da >= \(-INT64_C\(1\)\)/);
  assert.match(copyWrapper, /sagejs_tagged_arg_da <= INT64_C\(8\)/);
  assert.match(copyWrapper, /int64_pari_flx_copy__local_fast_0/);
  assert.match(copyWrapper, /return tagged_int64_pari_flx_copy\(/);
  assert.equal(
    count(copyFast, /UInt64Buffer view is outside its buffer/g),
    2,
    "the local copy clone did not retain both view validations",
  );
  assert.equal(
    count(copyFast, /UInt64Buffer index out of range/g),
    0,
    "the local copy clone retained a UInt64 element bounds failure",
  );
  assert.equal(
    localIntervalProofs.every(
      (proof) =>
        proof.authority === "checked-region-virtual-view-range-v1" &&
        proof.indexMinimum === "0" &&
        proof.indexMaximum === "8" &&
        proof.logicalLength === "9",
    ),
    true,
  );
  assert.deepEqual(
    new Set(localIntervalProofs.map((proof) => proof.step)),
    new Set(["-1", "1"]),
  );
}
if (mode === "stage-g") {
  assert.equal(privateSiteCounts.viewValidationFailures, 11);
  assert.equal(privateSiteCounts.uint64BufferLocalDeclarations, 0);
  assert.equal(privateSiteCounts.viewDataAssignments, 0);
  assert.equal(privateSiteCounts.viewLengthAssignments, 0);
  assert.equal(privateSiteCounts.viewOffsetAdjustments, 0);

  const [directVariant] = directResultVariants;
  assert.equal(
    directVariant.name,
    "sagejs_checked_r0_int64_pari_flx_copy__local_fast_0",
  );
  const directBody = directFunctionText(artifacts.coreSource, directVariant.name);
  assert.doesNotMatch(
    directBody,
    /\bstatus\b|sagejs_tagged_output_|goto fail|sagejs_native_status_set/,
  );
  assert.doesNotMatch(
    directBody,
    /(?:UInt64Buffer (?:view is outside its buffer|index out of range)|sagejs_signed_buffer_index\()/,
  );
  assert.equal(count(directBody, /sagejs_word_add_int64/g), 3);
  assert.equal(
    count(
      directBody,
      /sagejs_uint64_buffer\s+[A-Za-z0-9_]+\s*=\s*\{0\}/g,
    ),
    0,
  );
  assert.match(directBody, /return sagejs_local_tagged_da;/);
  const directCall = new RegExp(
    `= sagejs_direct_${directVariant.name}\\(`,
    "g",
  );
  assert.equal(count(artifacts.coreSource, directCall), 3);
  assert.equal(
    count(
      artifacts.coreSource,
      /SAGEJS_CHECKED_REGION_HOT_INLINE int tagged_sagejs_checked_r0_int64_pari_flx_copy\(/g,
    ),
    2,
  );
  assert.equal(
    count(
      artifacts.coreSource,
      /SAGEJS_CHECKED_REGION_HOT_INLINE int64_t sagejs_direct_sagejs_checked_r0_int64_pari_flx_copy__local_fast_0\(/g,
    ),
    2,
  );
  assert.doesNotMatch(artifacts.coreSource, /__local_fast_1/);
}

const outputDirectory = mkdtempSync(join(tmpdir(), "sagejs-stage-a-catalog-"));
for (const filename of ["index.cjs", "manifest.json"]) {
  copyFileSync(
    join(baselineDirectory, filename),
    join(outputDirectory, filename),
  );
}
// The frozen baseline can outlive the compiler worktree that originally
// supplied `sagejs/native.h`. Keep its library configuration, but also add the
// exact same-tip compiler include directory used to emit this candidate.
const baselineBindingBytes = readFileSync(
  join(baselineDirectory, "binding.gyp"),
);
const binding = JSON.parse(baselineBindingBytes);
const compilerInclude = join(compilerRoot, "packages/flint/include");
for (const target of binding.targets) {
  target.include_dirs ||= [];
  if (!target.include_dirs.includes(compilerInclude)) {
    target.include_dirs.push(compilerInclude);
  }
}
const emittedBindingBytes = Buffer.from(`${JSON.stringify(binding, null, 2)}\n`);
writeFileSync(join(outputDirectory, "binding.gyp"), emittedBindingBytes);
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
assert(fixtures.packets.every(packetSatisfiesGuard));
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

const malformedPackets = [
  ["short-state", (packet) => {
    packet[22] = packet[22].slice(0, 3);
  }],
  ["bad-degree", (packet) => {
    packet[1] = "5";
  }],
  ["short-coefficients", (packet) => {
    packet[0] = packet[0].slice(0, Number(packet[1]));
  }],
  ["short-primes", (packet) => {
    packet[3] = packet[3].slice(0, -1);
  }],
  ["short-word-workspace", (packet) => {
    packet[8] = packet[8].slice(0, 392);
  }],
  ["short-output", (packet) => {
    packet[17] = packet[17].slice(0, -3);
  }],
  ["nonmonic", (packet) => {
    packet[0][Number(packet[1])] = "2";
  }],
  ["invalid-prime", (packet) => {
    packet[3][0] = "1";
  }],
  ["oversized-prime", (packet) => {
    packet[3][0] = "3037000499";
  }],
].map(([name, change]) => {
  const packet = changedPacket(fixtures.packets[0], change);
  const expected = execute(baseline, packet);
  const actual = execute(stageA, packet);
  assert.deepEqual(actual, expected, `malformed mismatch: ${name}`);
  return {
    name,
    entersPrivateGraph: packetSatisfiesGuard(packet),
    outcome: actual.outcome,
  };
});

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
const baselineManifestBytes = readFileSync(
  join(baselineDirectory, "manifest.json"),
);
const stageACore = readFileSync(join(outputDirectory, "kernel_core.c"));
const privateCheckCounts = privateSiteCounts;
const baselineAddon = join(
  baselineDirectory,
  "build/Release/sagejs_native_kernel.node",
);
const stageAAddon = join(
  outputDirectory,
  "build/Release/sagejs_native_kernel.node",
);
const compilerCommit = spawnSync("git", ["rev-parse", "HEAD"], {
  cwd: compilerRoot,
  encoding: "utf8",
});
assert.equal(compilerCommit.status, 0, "cannot identify compiler commit");
const compilerStatus = spawnSync("git", ["status", "--porcelain"], {
  cwd: compilerRoot,
  encoding: "utf8",
});
assert.equal(compilerStatus.status, 0, "cannot inspect compiler worktree");
const result = {
  schema: `sagejs.checked-region/catalog-${mode}-v1`,
  diagnosticOnly: true,
  mode,
  capabilities: CAPABILITIES,
  entry: ENTRY,
  graph: GRAPH,
  edges,
  guard: GUARD,
  relationalGuardPending: false,
  frozenPackets: fixtures.packets.length,
  activeOutputs: 7081,
  privateVariantCount: prepared.variants.length,
  localIntervalProofs,
  directResultVariants: directResultVariants.map((variant) => variant.name),
  directCallSites,
  privateDispatchPresent: true,
  privateCheckCounts,
  malformedPackets,
  inputs: {
    fixturesPath,
    baselineDirectory,
    compilerRoot,
    compilerCommit: compilerCommit.stdout.trim(),
    compilerWorktreeClean: compilerStatus.stdout.length === 0,
  },
  fixtureSha256: sha256(fixturesBytes),
  baselineManifestSha256: sha256(baselineManifestBytes),
  baselineBindingGypSha256: sha256(baselineBindingBytes),
  emittedBindingGypSha256: sha256(emittedBindingBytes),
  baselineCoreSha256: sha256(baselineCore),
  stageACoreSha256: sha256(stageACore),
  baselineCoreBytes: baselineCore.length,
  stageACoreBytes: stageACore.length,
  stageAAdapterBytes: Buffer.byteLength(artifacts.adapterSource),
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
