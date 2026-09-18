"use strict";

// Host lifecycle for the connected prepared prefix through first genuine HNF.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadThinCachedKernel } = require(
  "../../tools/native-kernel/thin-cache-loader.cjs");
const prefixHost = require("./row6_phase6_prepared_prefix_host.cjs");
const source = require("./row6_phase6_gate_prefix_source.cjs");
const gateHost = require("./row6_prepared_gate_c_host.cjs");

const SOURCE = path.join(__dirname, "row6_phase6_gate_prefix_root.generated.py");
const EXPORT = source.ROOT;
const CACHE_ROOT = path.join(__dirname, ".sagejs-native-kernels");
const THIN_EXPECTED = Object.freeze({
  sourceHash: "9dca38ac0a399346d018f9835db45840339e2e23055a68f0f17a8731c75e127d",
  cacheKey: "6144d514d088328356dce8ef97423379fd68fabd1cdaeb86772368050f4cbf14",
  nativeAbi: 24,
  manifestHash: "31390d16b41a6b2d2cbf43a4ed64c77cabe82d3b815ee5c15ca0a4c2e2419edd",
  addonHash: "8ea772855fccf1640acefebba004027f7e75174fc8d14bb058c48deaa02680e9",
  signatureHash: "e219a4998e8690157b38cf276856534091b938a160e61dc686948d32b813d33e",
});
const ROW6_CAPACITY_LEDGER = Object.freeze({
  "hnf.transform": Object.freeze({ highWater: 1, capacity: 16 }),
  "hnf.hnf_transform": Object.freeze({ highWater: 1, capacity: 16 }),
  "hnf.lam": Object.freeze({ highWater: 11, capacity: 16 }),
  "hnf.d": Object.freeze({ highWater: 11, capacity: 16 }),
  "hnf.full_h": Object.freeze({ highWater: 1, capacity: 16 }),
  "hnf.full_dep": Object.freeze({ highWater: 0, capacity: 16 }),
  "hnf.work_b": Object.freeze({ highWater: 1, capacity: 16 }),
  "hnf.transformed_logs": Object.freeze({ highWater: 6, capacity: 8 }),
  "hnf.work_c": Object.freeze({ highWater: 6, capacity: 8 }),
  "hnf.result_c": Object.freeze({ highWater: 6, capacity: 8 }),
  "ancestry.current": Object.freeze({ highWater: 1, capacity: 64 }),
  "ancestry.old": Object.freeze({ highWater: 1, capacity: 64 }),
  "ancestry.joined": Object.freeze({ highWater: 2, capacity: 64 }),
  "ancestry.work": Object.freeze({ highWater: 1, capacity: 64 }),
  "ancestry.trailing_work": Object.freeze({ highWater: 1, capacity: 32 }),
  "ancestry.raw_to_all": Object.freeze({ highWater: 2, capacity: 64 }),
  "ancestry.accepted_arch": Object.freeze({ highWater: 5, capacity: 16 }),
  "ancestry.phase_pi": Object.freeze({ highWater: 5, capacity: 16 }),
});

function signature(file, name) { return source.signature(file, name); }

function words(values, minimum = 1) {
  let result = minimum;
  for (const raw of values || []) {
    const value = BigInt(raw), absolute = value < 0n ? -value : value;
    result = Math.max(result,
      Math.ceil(Math.max(1, absolute.toString(2).length) / 64));
  }
  return result;
}

function allocate(fn, names, input, lengths, options = {}) {
  const compact = options.compact || new Set(), wide = options.wide || new Set();
  const capacities = options.capacities || {};
  const output = {};
  let allocatedBytes = 0;
  for (const [name, kind] of names) {
    const supplied = input[name];
    if (!kind.endsWith("Buffer")) {
      assert.notEqual(supplied, undefined, `missing scalar ${name}`);
      output[name] = kind === "float" ? Number(supplied) : BigInt(supplied);
      continue;
    }
    const length = supplied === undefined ? lengths[name] : supplied.length;
    assert.notEqual(length, undefined, `missing length ${name}`);
    if (kind === "Float64Buffer") {
      output[name] = fn.createFloat64Buffer(
        supplied === undefined ? length : supplied.map(Number));
      allocatedBytes += length * 8;
    } else if (kind === "Int64Buffer") {
      output[name] = fn.createInt64Buffer(
        supplied === undefined ? length : supplied.map(BigInt));
      allocatedBytes += length * 8;
    } else {
      const capacity = words(supplied, capacities[name] ?? (compact.has(name) ? 1 :
        wide.has(name) ? 16 : (options.minimumWords || 8)));
      try {
        output[name] = fn.createIntegerBuffer(length, capacity,
          supplied === undefined ? undefined : supplied.map(BigInt));
      } catch (error) {
        const status = fs.readFileSync("/proc/self/status", "utf8");
        const virtual = status.match(/^VmSize:\s+.*$/m)?.[0] || "VmSize: unknown";
        error.message += ` while allocating ${name}[${length}]x${capacity}; ` +
          `familyBytes=${allocatedBytes}; ${virtual}`;
        throw error;
      }
      allocatedBytes += length * (4 + 8 * capacity);
    }
  }
  return output;
}

async function prepare(preparedEnvelope, factorOwner, initialOwner) {
  gateHost.validateBoundary(preparedEnvelope, factorOwner, initialOwner);
  const aggregateNames = signature(
    "row6_phase6_gate_prefix_root.generated.py", EXPORT);
  const fn = loadThinCachedKernel({ sourcePath: SOURCE, cacheRoot: CACHE_ROOT,
    entry: EXPORT, signature: aggregateNames, expected: THIN_EXPECTED });
  const outputPath = path.join(CACHE_ROOT, THIN_EXPECTED.cacheKey);
  const built = Object.freeze({ cacheKey: THIN_EXPECTED.cacheKey,
    coreSourcePath: path.join(outputPath, "kernel_core.c"),
    modulePath: path.join(outputPath, "index.cjs"), outputPath });
  assert.equal(fn?.nativeAvailable, true);
  const prefix = prefixHost.prepareWithKernel(preparedEnvelope.data, built, fn);
  const lengths = gateHost.zeroLengths();
  const collectorInput = gateHost.collectorInput(
    preparedEnvelope, factorOwner, initialOwner, { dense: false });
  const collectorNames = signature(
    "collected_log_embeddings.py", "pari_collect_and_log_relations");
  const collectorAliases = source.COLLECTOR_ALIASES;
  const collectorOwnedNames = collectorNames.filter(([name]) => !collectorAliases[name]);
  const collector = allocate(fn, collectorOwnedNames, collectorInput, lengths, {
    compact: new Set(["relation_records", "relation_hashes", "relation_metadata",
      "relation", "relation_scratch"]),
  });
  // These are live-derived in the native root rather than copied from the
  // frozen factor owner used only to establish shapes and an oracle.
  collector.admission_prime_offsets = fn.createIntegerBuffer(9197, 2);
  collector.admission_prime_counts = fn.createIntegerBuffer(9197, 2);
  collector.packet_ids = fn.createIntegerBuffer(1130, 2);
  collector.packet_generators = fn.createIntegerBuffer(3390, 16);
  collector.outer_perm = fn.createIntegerBuffer(1130, 2);
  // The aggregate root produces and aliases the dense prefix relation owners
  // internally.  Once the non-aliased collector buffers are initialized, the
  // serialized oracle owners are no longer part of the resident lifecycle.
  factorOwner = null;
  initialOwner = null;
  if (global.gc) global.gc();

  const hnfNames = signature("hnfspec_complete.py", "pari_hnfspec_complete");
  const hnfLengths = Object.fromEntries(hnfNames.map(([name]) => [name,
    lengths[name === "pivots" ? "hnf_rank_pivots" : `hnf_${name}`]]));
  const hnfInput = { rows: 1130, columns: 1133, k0: 4, log_rows: 3 };
  const hnfOwnedNames = hnfNames.filter(([name]) => !source.HNF_ALIASES[name]);
  const hnf = allocate(fn, hnfOwnedNames, hnfInput, hnfLengths, {
    minimumWords: 6,
    compact: new Set(["cup_arena", "cup_frames"]),
    capacities: { transformed_logs: 8, work_c: 8, result_c: 8 },
    wide: new Set(["transform", "full_h", "hnf_transform", "lam", "d",
      "full_dep", "work_b"]),
  });
  hnf.original = fn.createInt64Buffer(1130 * 1133);
  hnf.perm = fn.createInt64Buffer(1130);

  const inputs = { ...prefix.inputs };
  for (const [name] of collectorOwnedNames) inputs[`gate_${name}`] = collector[name];
  for (const [name] of hnfOwnedNames) inputs[`gate_initial_hnf_${name}`] = hnf[name];
  // Aliased HNF operands still appear as explicit root parameters.
  inputs.gate_initial_hnf_original = hnf.original;
  inputs.gate_initial_hnf_rows = 1130n;
  inputs.gate_initial_hnf_columns = 1133n;
  inputs.gate_initial_hnf_perm = hnf.perm;
  inputs.gate_initial_hnf_k0 = 4n;
  inputs.gate_initial_hnf_log_rows = 3n;
  const appendNames = signature("hnfadd.py", "pari_hnfadd");
  const appendBorrowed = new Set(["h", "dep", "b", "logs", "perm", "new_logs"]);
  const appendSizes = (hRows, bColumns, oldColumns, newColumns) => {
    const lig = 1130 - bColumns, width = hRows + newColumns;
    const cWidth = width + bColumns;
    return { new_relations: 1130 * newColumns,
      top: lig*newColumns, exact_product: lig*newColumns,
      log_product: 21*newColumns, adjusted_logs: 21*newColumns,
      joined: lig*width, joined_logs: 21*cWidth, rank_matrix: lig*width,
      occupied: width, pivots: lig, best: lig, profile: lig, rank_state: 10,
      perm_work: 1130, matb: lig*width, new_dep: lig*width,
      permuted_b: lig*bColumns, full_h: lig*width, transform: width*width,
      lam: width*width, d: width+1, hnf_state: 11,
      full_dep: lig*width, work_b: lig*bColumns, work_c: 21*cWidth,
      diagonal: lig, final_c: 21*cWidth, result_h: lig*lig,
      result_dep: lig*lig, result_b: lig*(bColumns+lig),
      result_c: 21*(oldColumns+newColumns), final_state: 7, state: 9 };
  };
  const appendOwned = appendNames.filter(([name, kind]) =>
    kind.endsWith("Buffer") && !appendBorrowed.has(name));
  const append1 = allocate(fn, appendOwned, {}, appendSizes(2, 1124, 1133, 3),
    { minimumWords: 16 });
  const append2 = allocate(fn, appendOwned, {}, appendSizes(2, 1127, 1136, 1),
    { minimumWords: 16 });
  for (const [name] of appendOwned) {
    inputs[`gate_append1_${name}`] = append1[name];
    inputs[`gate_append2_${name}`] = append2[name];
  }
  inputs.gate_next_control = fn.createInt64Buffer(3);
  const ancestry = {
    perm1: fn.createInt64Buffer(1130), perm2: fn.createInt64Buffer(1130),
    current: fn.createIntegerBuffer(1137, 64),
    old: fn.createIntegerBuffer(1137, 64),
    joined: fn.createIntegerBuffer(1137, 64),
    work: fn.createIntegerBuffer(1137, 64),
    trailing_work: fn.createIntegerBuffer(151 * 979, 32),
    raw_to_all: fn.createIntegerBuffer(9 * 1137, 64),
    accepted_arch: fn.createIntegerBuffer(147, 16),
    accepted_signs: fn.createInt64Buffer(21),
    phase_pi: fn.createIntegerBuffer(3, 16),
    active_rows: fn.createInt64Buffer(2), state: fn.createInt64Buffer(3),
  };
  for (const [name, value] of Object.entries(ancestry))
    inputs[`gate_ancestry_${name}`] = value;
  const names = aggregateNames;
  return Object.freeze({ ancestry, append1, append2, built, collector, fn, hnf,
    inputs, names: Object.freeze(names.map(Object.freeze)), prefix });
}

function run(resident) {
  const args = resident.names.map(([name]) => {
    const value = resident.inputs[name];
    assert.notEqual(value, undefined, `missing aggregate input ${name}`);
    return value;
  });
  const status = resident.fn.gmp(...args);
  assert.equal(status, 0n);
  const projection = Object.freeze({
    factor: resident.prefix.factor.root_state.toArray().slice(0, 14).map(String),
    initial: resident.prefix.initial.root_state.toArray().slice(0, 12).map(String),
    relation: resident.prefix.initial.relation_state.toArray().slice(0, 6).map(String),
    hnf: Array.from(resident.hnf.state).slice(0, 9).map(String),
    final: Array.from(resident.append2.state).slice(0, 9).map(String),
    assembly: Array.from(resident.hnf.assembly_state).slice(0, 6).map(String),
    ancestry: Array.from(resident.ancestry.state).map(String),
  });
  assert.deepEqual(projection.relation, ["1137", "11420", "0", "0", "1137", "1137"]);
  assert.deepEqual(projection.hnf, ["2", "9", "1124", "4", "7", "145", "0", "1133", "0"]);
  assert.deepEqual(projection.final, ["2", "9", "1128", "0", "7", "1", "0", "1137", "0"]);
  assert.deepEqual(projection.ancestry, ["9", "7", "2"]);
  return Object.freeze({ status, projection });
}

function createProcessCoordinatorAdapter(preparedEnvelope, factorOwner, initialOwner) {
  return Object.freeze({
    timingEligible: false,
    prepareSample: () => prepare(preparedEnvelope, factorOwner, initialOwner),
    runCorrectness: resident => run(resident),
    runSample: () => {
      const error = new Error("row 6 resident Gate-C root is not the whole prepared kernel");
      error.code = "SAGEJS_PHASE6_INCOMPLETE_RESIDENT_CUT";
      throw error;
    },
    commonProjection: sample => sample.projection,
  });
}

module.exports = { EXPORT, ROW6_CAPACITY_LEDGER, SOURCE,
  createProcessCoordinatorAdapter, prepare, run };
