"use strict";

// Lifecycle for the one-call prepared row-6 class-and-unit graph.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createFloat64Buffer, createInt64Buffer, createIntegerBuffer,
  sha256File, signatureSha256 } = require(
  "../../tools/native-kernel/thin-cache-loader.cjs");
const gateHost = require("./row6_phase6_gate_prefix_host.cjs");
const source = require("./row6_phase6_whole_prepared_source.cjs");
const terminalHost = require("./row6_phase6_resident_terminal_host.cjs");

const SOURCE = path.join(__dirname, "row6_phase6_whole_prepared_root.generated.py");
const EXPORT = source.ROOT;
const CACHE_ROOT = path.join(__dirname, ".sagejs-native-kernels");
const THIN_EXPECTED = Object.freeze({
  sourceHash: "7dc3fb2da25525e835b864d42996deba1a452be8cf1ca7e699695c831c4fdb91",
  cacheKey: "b0d1af238f251d5390718f21275d6464b67b7107537d6df8323150211d7b9e66",
  nativeAbi: 24,
  manifestHash: "c2e78fc25cb87d7c72613cf9496d67bbe2b23c01fdf73a7afd4562cc2409e71b",
  addonHash: "bd0f0b33cd3cc7a466e41f95bee1a2814f96680795c122035f21d9928c9f01e9",
  signatureHash: "7bf37a81115d26e5d33ea398e641fb1b382a186442e676a8e79496bbd2f7973a",
});

function loadAuthenticatedWholeKernel(signature) {
  assert.equal(sha256File(SOURCE), THIN_EXPECTED.sourceHash,
    "whole-prepared source identity changed");
  assert.equal(signatureSha256(signature), THIN_EXPECTED.signatureHash,
    "whole-prepared signature identity changed");
  const index = JSON.parse(fs.readFileSync(path.join(CACHE_ROOT, "index.json"), "utf8"));
  const discovery = index.sources[SOURCE];
  assert(discovery, "whole-prepared source absent from cache index");
  assert.equal(discovery.cacheKey, THIN_EXPECTED.cacheKey,
    "whole-prepared cache identity changed");
  assert.equal(discovery.nativeAbi, THIN_EXPECTED.nativeAbi,
    "whole-prepared native ABI changed");
  assert.equal(discovery.sourceHash, THIN_EXPECTED.sourceHash,
    "whole-prepared cached source changed");
  const outputPath = path.join(CACHE_ROOT, discovery.cacheKey);
  const manifestPath = path.join(outputPath, "manifest.json");
  const addonPath = path.join(outputPath, "build/Release/sagejs_native_kernel.node");
  assert.equal(sha256File(manifestPath), THIN_EXPECTED.manifestHash,
    "whole-prepared manifest identity changed");
  assert.equal(sha256File(addonPath), THIN_EXPECTED.addonHash,
    "whole-prepared addon identity changed");
  const native = require(addonPath)[`${EXPORT}$gmp`];
  assert.equal(typeof native, "function", "whole-prepared native entry missing");
  const invoke = (...args) => native(...args);
  invoke.gmp = invoke;
  invoke.createIntegerBuffer = createIntegerBuffer;
  invoke.createInt64Buffer = createInt64Buffer;
  invoke.createFloat64Buffer = createFloat64Buffer;
  invoke.nativeAvailable = true;
  invoke.executionMode = "row6-authenticated-closed-mapping-cache";
  return { fn: invoke, outputPath };
}

const LENGTHS = Object.freeze({
  index_ideals: 9, index_ranks: 1, catalog_state: 4,
  log_discriminant: 1, analytic_coefficients: 7, analytic_table: 31,
  analytic_tail: 1, analytic_logarithms: 9196, log_inverse_residue: 1,
  inverse_residue: 3, exp_cache: 3, pi_cache: 3, analytic_a: 64,
  analytic_b: 64, analytic_p: 64, analytic_q: 64, analytic_stack: 128,
  inverse_hr: 3, analytic_state: 2, logs: 63, tentative_class_number: 1,
  zeta_factor: 3, post_hnf_state: 3, prepared: 72, selected: 8,
  prep_state: 3, rank_work: 72, rank_occupied: 3, rank_pivots: 8,
  rank_state: 3, integer_input: 24, integer_work: 24,
  integer_occupied: 3, integer_pivots: 8, integer_best: 8,
  integer_state: 10, basis: 27, minor: 27, det_work: 27, det_result: 3,
  det_pivots: 3, det_state: 5, inverse_work: 27, inverse_rhs: 27,
  inverse: 27, inverse_pivots: 3, inverse_state: 3, product: 27,
  inverse_slice: 27, multiple: 3, coordinates: 42, multiple_state: 4,
  rational_work: 42, lattice: 14, regulator_hnf_work: 14,
  regulator_hnf_column: 2, regulator_hnf_output: 14,
  regulator_hnf_state: 12, regulator: 3, unit_relations: 14,
  denominator: 1, reconstruction_state: 4, hnf_row_pivots: 2,
  hnf_heights: 7, acceptance_state: 3, preparation_state: 8,
  smith_work: 4, smith_column: 2, invariants: 2, class_number: 1,
  smith_state: 6, terminal_state: 10, unit_final_transform: 14,
  unit_bridge_transform: 14, unit_getfu_factor: 4, unit_clean_logs: 18,
  unit_sign_phases: 6, unit_c5_state: 5, unit_c5_trace: 5,
  unit_factor_state: 2, unit_c6_state: 8, unit_state: 8,
  class_factor_map: 9 * 2048, class_state: 12, resident_state: 14,
});

function terminalStorageAccounting() {
  const terminalNames = source.signature(
    "row6_phase6_resident_terminal_root.py", source.TERMINAL)
    .filter(([name]) => !source.TERMINAL_ALIASES[name]);
  let total = 0;
  for (const [name, kind] of terminalNames) {
    if (name === "cache_changed") continue;
    const length = LENGTHS[name];
    assert.notEqual(length, undefined, `missing terminal length ${name}`);
    total += kind === "IntegerBuffer" ? length * (4 + 8 * 16) : length * 8;
  }
  const limit = gateHost.ROW6_PREPARED_LAYOUT.storagePlan.terminalExternalBytes;
  assert(total <= limit, "row-6 terminal owners exceed reviewed storage budget");
  return Object.freeze({ limit, total });
}

function allocateOwned(fn, terminalNames) {
  const owned = {};
  let allocatedBytes = 0;
  const limit = gateHost.ROW6_PREPARED_LAYOUT.storagePlan.terminalExternalBytes;
  const reserve = bytes => {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || allocatedBytes + bytes > limit) {
      const error = new Error("row-6 terminal owners exceed reviewed storage budget");
      error.code = "SAGEJS_ROW6_TERMINAL_EXTERNAL_STORAGE_LIMIT";
      throw error;
    }
    allocatedBytes += bytes;
  };
  for (const [name, kind] of terminalNames) {
    if (name === "cache_changed") owned[name] = true;
    else {
      const length = LENGTHS[name];
      assert.notEqual(length, undefined, `missing terminal length ${name}`);
      if (kind === "Int64Buffer") {
        reserve(length * 8);
        owned[name] = fn.createInt64Buffer(length);
      } else if (kind === "Float64Buffer") {
        reserve(length * 8);
        owned[name] = fn.createFloat64Buffer(length);
      }
      else {
        assert.equal(kind, "IntegerBuffer", `unsupported terminal type ${kind}`);
        reserve(length * (4 + 8 * 16));
        owned[name] = fn.createIntegerBuffer(length, 16);
      }
    }
  }
  return Object.freeze({ allocatedBytes, owned });
}

async function prepare(preparedEnvelope) {
  assert.equal(arguments.length, 1,
    "factor/relation owners are forbidden at the prepared-only boundary");
  const names = source.signature("row6_phase6_whole_prepared_root.generated.py", EXPORT);
  const loaded = loadAuthenticatedWholeKernel(names), fn = loaded.fn;
  assert.equal(fn?.nativeAvailable, true);
  const outputPath = loaded.outputPath;
  const built = Object.freeze({ cacheKey: THIN_EXPECTED.cacheKey,
    coreSourcePath: path.join(outputPath, "kernel_core.c"),
    modulePath: path.join(outputPath, "index.cjs"), outputPath });
  return prepareWithKernel(preparedEnvelope, built, fn);
}

function prepareWithKernel(preparedEnvelope, built, fn) {
  const gate = gateHost.prepareWithKernel(preparedEnvelope, built, fn);
  const names = source.signature("row6_phase6_whole_prepared_root.generated.py", EXPORT);
  assert.equal(fn?.nativeAvailable, true);
  const gateNames = source.signature(
    "row6_phase6_gate_prefix_root.generated.py", source.GATE);
  const terminalNames = source.signature(
    "row6_phase6_resident_terminal_root.py", source.TERMINAL)
    .filter(([name]) => !source.TERMINAL_ALIASES[name]);
  const terminalAllocation = allocateOwned(fn, terminalNames);
  const owned = terminalAllocation.owned;
  const pool = { ...gate.inputs };
  for (const [name] of terminalNames) pool[`terminal_${name}`] = owned[name];
  const inputs = Object.fromEntries(names.map(([name]) => {
    assert.notEqual(pool[name], undefined, `missing whole-prepared input ${name}`);
    return [name, pool[name]];
  }));
  return Object.freeze({ built, fn, gate, inputs,
    terminalAllocatedBytes: terminalAllocation.allocatedBytes,
    names: Object.freeze(names.map(Object.freeze)), owned });
}

function run(resident) {
  const status = resident.fn.gmp(...resident.names.map(([name]) => resident.inputs[name]));
  assert.equal(status, 0n);
  const gate = resident.gate, owned = resident.owned;
  const gateProjection = Object.freeze({
    factor: gate.prefix.factor.root_state.toArray().slice(0, 14).map(String),
    initial: gate.prefix.initial.root_state.toArray().slice(0, 12).map(String),
    relation: gate.prefix.initial.relation_state.toArray().slice(0, 6).map(String),
    hnf: Array.from(gate.hnf.state).slice(0, 9).map(String),
    final: Array.from(gate.append2.state).slice(0, 9).map(String),
    ancestry: Array.from(gate.ancestry.state).map(String),
  });
  assert.deepEqual(gateProjection.relation,
    ["1137", "11420", "0", "0", "1137", "1137"]);
  assert.deepEqual(gateProjection.final,
    ["2", "9", "1128", "0", "7", "1", "0", "1137", "0"]);
  assert.deepEqual(gateProjection.ancestry, ["9", "7", "2"]);
  const terminalInput = { ...owned,
    class_active_rows: gate.ancestry.active_rows };
  const terminalProjection = terminalHost.projection({ input: terminalInput });
  return Object.freeze({ status, gateProjection, terminalProjection,
    timingEligible: false });
}

function createProcessCoordinatorAdapter(preparedEnvelope) {
  assert.equal(arguments.length, 1,
    "factor/relation owners are forbidden at the prepared-only boundary");
  return Object.freeze({ timingEligible: false,
    prepareSample: () => prepare(preparedEnvelope),
    runCorrectness: resident => run(resident),
    runSample: () => {
      const error = new Error("row 6 whole-prepared root is not yet qualified");
      error.code = "SAGEJS_PHASE6_UNQUALIFIED_WHOLE_PREPARED";
      throw error;
    },
    commonProjection: sample => sample.terminalProjection,
  });
}

module.exports = { EXPORT, LENGTHS,
  ROW6_PREPARED_LAYOUT: gateHost.ROW6_PREPARED_LAYOUT, SOURCE,
  createProcessCoordinatorAdapter, prepare, prepareWithKernel, run,
  terminalStorageAccounting };
