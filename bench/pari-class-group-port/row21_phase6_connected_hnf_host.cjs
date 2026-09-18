"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const source = require("./row21_phase6_connected_source.cjs");
const prefixHost = require("./row21_phase6_factor_base_host.cjs");
const firstHnfHost = require("./row21_first_hnf_host.cjs");

function words(values, minimum = 1) {
  let result = minimum;
  for (const raw of values || []) {
    const value = BigInt(raw), absolute = value < 0n ? -value : value;
    result = Math.max(result,
      Math.ceil(Math.max(1, absolute.toString(2).length) / 64));
  }
  return result;
}
function save(owner) {
  if (owner.sizes && owner.limbs) {
    const sizes = owner.sizes.slice(), limbs = owner.limbs.slice();
    return () => { owner.sizes.set(sizes); owner.limbs.set(limbs); };
  }
  const values = owner.slice();
  return () => owner.set(values);
}
function view(owner, length = owner.length) {
  return (owner.toArray ? owner.toArray() : Array.from(owner))
    .slice(0, length).map(String);
}

const scalars = Object.freeze({
  n: 5, precision: 192, track_small: 1, admission_real_count: 3,
  admission_mode: 2, admission_factorlimit: 1048576,
  admission_prime_limit: 65537, nrelid: 4, track_fact: 1, jid0: 0, e0: 0,
  extra_count: -1, search_count: 24, construct_primes: 0, outer_mode: 0,
  outer_ru: 4, log_precision: 192, initial_additional: 8,
  initial_target: 32, hnf_k0: 4,
});
const explicitLengths = Object.freeze({
  admission_group_tau: 600, admission_group_e: 24, admission_group_f: 24,
  admission_group_inert: 24, subfactor: 4, extra: 4, relation_primes: 24,
  ramification: 24, search_ideals: 24, packet_ids: 24, packet_primes: 24,
  packet_generators: 120, packet_inert: 24, outer_state: 20,
  outer_minidx: 24, outer_present: 24, outer_live: 24, outer_perm: 24,
  outer_multiplier: 24, hnf_perm: 24,
});

async function prepareResident(inputPath = prefixHost.DEFAULT_INPUT) {
  source.materialize();
  const prefix = await prefixHost.prepareResident(inputPath);
  const built = await compileKernel({ sourcePath: source.OUTPUT });
  const fn = require(built.modulePath)[source.EXPORT];
  assert.equal(fn?.nativeAvailable, true);
  const connectedSignature = source.signature(source.CONNECTED,
    "pari_connected_relation_hnf");
  const direct = new Set(["admission_matrix_m", "admission_matrix_p",
    "admission_matrix_e", "admission_factor_product", "admission_prime_offsets",
    "admission_prime_counts", "basis_table", "packet_ideals", "packet_norms",
    "initial_primes", "initial_offsets", "initial_counts", "initial_complete"]);
  const lengths = firstHnfHost.zeroLengths();
  const prepared = prefix.prepared;
  let ball = 2; for (let d = 5; d > 1; d -= 2) ball *= 2 * Math.PI / d;
  const initial = {
    scale: 2000 / ball,
    admission_primes: prepared.admission_primes,
    admission_products: prepared.admission_products,
    preparation_rounded_embedding: prepared.preparation_rounded_embedding,
    preparation_embedding: prepared.preparation_embedding,
    outer_state: [27, 4, 0, 0, 25, ...Array(14).fill(0)],
    outer_minidx: Array.from({ length: 24 }, (_, i) => i + 1),
  };
  const h = {};
  const I = (length, capacity = 8, values) => fn.createIntegerBuffer(length,
    Math.max(capacity, words(values)), values === undefined ? undefined : values.map(BigInt));
  for (const { name, kind } of connectedSignature) {
    if (direct.has(name)) continue;
    if (kind === "int" || kind === "float" || kind === "bool") {
      const raw = Object.hasOwn(initial, name) ? initial[name] : scalars[name];
      assert.notEqual(raw, undefined, `missing row21 connected scalar ${name}`);
      h[name] = kind === "int" ? BigInt(raw) : kind === "float" ? Number(raw) : Boolean(raw);
      continue;
    }
    const supplied = initial[name];
    const length = supplied?.length ?? lengths[name] ?? explicitLengths[name];
    assert.notEqual(length, undefined, `missing row21 connected owner ${name}`);
    if (kind === "Float64Buffer")
      h[name] = fn.createFloat64Buffer(supplied === undefined ? length : supplied.map(Number));
    else if (kind === "Int64Buffer")
      h[name] = fn.createInt64Buffer(supplied === undefined ? length : supplied.map(BigInt));
    else {
      let capacity = name.startsWith("hnf_") ? 16 : 8;
      if (["relation_records", "relation_basis", "relation_hashes",
        "relation_metadata", "relation", "relation_scratch", "generators",
        "hnf_cup_arena", "hnf_cup_frames"].includes(name)) capacity = 1;
      h[name] = I(length, capacity, supplied);
    }
  }
  const connectedState = I(5, 4);
  const generatedSignature = source.signature(source.OUTPUT, source.EXPORT);
  const argumentsByName = {};
  for (const [name, value] of Object.entries(prefix.owners))
    argumentsByName[`fb_${name}`] = value;
  for (const [name, value] of Object.entries(h)) argumentsByName[`h_${name}`] = value;
  argumentsByName.connected_state = connectedState;
  assert.deepEqual(generatedSignature.map(({ name }) => name), Object.keys(argumentsByName));
  const reset = [...prefix.reset, ...Object.values(h)
    .filter(value => typeof value === "object").map(save), save(connectedState)];
  return Object.freeze({ built, fn, prefix, h, generatedSignature,
    connectedState, argumentsByName, reset });
}

function projection(resident) {
  const h = resident.h;
  const state = view(resident.connectedState, 5);
  assert.deepEqual(state, ["0", "0", "3", "8", "32"]);
  assert.deepEqual(view(h.relation_state, 6), ["32", "370", "0", "0", "0", "32"]);
  assert.deepEqual(view(h.chain_state, 4), ["3", "0", "5", "32"]);
  assert.deepEqual(view(h.hnf_state, 9), ["0", "8", "24", "0", "8", "5", "0", "32", "0"]);
  return Object.freeze({
    schema: "sagejs.pari-class-group/row21-phase6-connected-hnf-projection-v1",
    connectedState: Object.freeze(state),
    relationState: Object.freeze(view(h.relation_state, 6)),
    chainState: Object.freeze(view(h.chain_state, 4)),
    hnfState: Object.freeze(view(h.hnf_state, 9)),
    hnfResultC: Object.freeze(view(h.hnf_result_c, 7 * 4 * 32)),
    hnfPermutation: Object.freeze(view(h.hnf_perm, 24)),
    relationRecords: Object.freeze(view(h.relation_records, 24 * 32)),
    relationGenerators: Object.freeze(view(h.generators, 5 * 32)),
    relationMetadata: Object.freeze(view(h.relation_metadata, 3 * 32)),
  });
}

function runInvocation(resident) {
  resident.reset.forEach(reset => reset());
  const started = process.hrtime.bigint();
  const status = resident.fn.gmp(...resident.generatedSignature.map(
    ({ name }) => resident.argumentsByName[name]));
  const stopped = process.hrtime.bigint();
  assert.equal(status, 0n);
  return Object.freeze({ kernelNanoseconds: String(stopped - started),
    projection: projection(resident), boundary: Object.freeze({
      nativeCallsInsideClock: 1, filesystemInsideClock: false,
      subprocessesInsideClock: false, serializationInsideClock: false,
      allocationInsideClock: false, resetInsideClock: false,
    }) });
}

module.exports = { prepareResident, projection, runInvocation };
