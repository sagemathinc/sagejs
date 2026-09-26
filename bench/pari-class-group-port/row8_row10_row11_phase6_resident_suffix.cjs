"use strict";

// Resident post-HNF suffix shared by the three mixed-quartic qualification
// rows.  Compilation and every backing owner are created by prepare(); run()
// only resets logical state, copies same-invocation checkpoints into those
// owners, and invokes translated mathematical kernels.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const CONFIG = Object.freeze({
  8: Object.freeze({ factorCount: 143, unitColumns: 9, attempts: 3,
    hCapacity: 1,
    columns: Object.freeze([150, 151, 152]), statuses: Object.freeze([5, 5, 0]),
    classNumber: "1", invariants: Object.freeze([]) }),
  10: Object.freeze({ factorCount: 288, unitColumns: 15, attempts: 4,
    hCapacity: 25,
    columns: Object.freeze([295, 299, 300, 303]), statuses: Object.freeze([5, 5, 5, 0]),
    classNumber: "4", invariants: Object.freeze(["2", "2"]) }),
  11: Object.freeze({ factorCount: 421, unitColumns: 9, attempts: 2,
    hCapacity: 9,
    columns: Object.freeze([428, 430]), statuses: Object.freeze([5, 0]),
    classNumber: "4", invariants: Object.freeze(["2", "2"]) }),
});

function signature(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = fs.readFileSync(source, "utf8")
    .match(new RegExp(`def ${escaped}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `missing native signature ${name}`);
  return match[1].trim().split("\n")
    .map(line => line.trim().replace(/,$/, "").split(": "));
}

async function compile(sourceName, exportName) {
  const source = path.join(__dirname, sourceName);
  const built = await compileKernel({ sourcePath: source });
  const fn = require(built.modulePath)[exportName];
  assert(fn?.nativeAvailable, `${exportName} is not native`);
  return { source, built, fn, names: signature(source, exportName) };
}

function integer(fn, length, words = 16, initial) {
  return fn.createIntegerBuffer(length, words,
    initial === undefined ? undefined : initial.map(BigInt));
}
function int64(fn, length, initial) {
  return fn.createInt64Buffer(initial === undefined ? length : initial.map(BigInt));
}
function float64(fn, length, initial) {
  return fn.createFloat64Buffer(initial === undefined ? length : initial.map(Number));
}
function values(owner) { return owner.toArray ? owner.toArray() : Array.from(owner); }
function packed(owner, start, end) { return values(owner).slice(start, end).map(String); }
function integerAt(owner, index) {
  const signed = owner.sizes[index], count = Math.abs(signed);
  let value = 0n, offset = index * owner.wordCapacity;
  for (let word = count - 1; word >= 0; word -= 1)
    value = (value << 64n) + owner.limbs[offset + word];
  return signed < 0 ? -value : value;
}
function refill(target, owner, start = 0) {
  assert.equal(target.length + start <= owner.length, true);
  for (let i = 0; i < target.length; i += 1)
    target[i] = String(integerAt(owner, start + i));
  return target;
}

function writeInteger(owner, index, raw) {
  let value = BigInt(raw), negative = value < 0n;
  if (negative) value = -value;
  let words = 0, offset = index * owner.wordCapacity;
  while (value !== 0n) {
    assert(words < owner.wordCapacity, "resident suffix owner capacity exceeded");
    owner.limbs[offset + words] = BigInt.asUintN(64, value);
    value >>= 64n; words += 1;
  }
  owner.sizes[index] = negative ? -words : words;
}

function loadInteger(owner, input) {
  assert(input.length <= owner.length, "resident suffix input exceeds owner");
  owner.sizes.fill(0);
  for (let i = 0; i < input.length; i += 1) writeInteger(owner, i, input[i]);
}

function resetOwner(owner) {
  if (owner && owner.sizes instanceof Int32Array) owner.sizes.fill(0);
  else if (ArrayBuffer.isView(owner)) owner.fill(owner instanceof Float64Array ? 0 : 0n);
}

function invoke(compiled, bindings, clock = null) {
  const args = compiled.names.map(([name]) => {
    assert.notEqual(bindings[name], undefined, `missing ${name}`); return bindings[name];
  });
  if (clock === null) return compiled.fn.gmp(...args);
  const started = process.hrtime.bigint();
  try { return compiled.fn.gmp(...args); } finally {
    clock.nanoseconds += process.hrtime.bigint() - started; clock.calls += 1;
  }
}

function materializeInitialRoot(template, resident, prepared, expectedCount) {
  const o = resident.owners, result = template;
  refill(result.rootState, o.root_state);
  const rootState = result.rootState, count = Number(rootState[9]), rows = Number(rootState[3]);
  assert.equal(count, expectedCount); assert.equal(rootState[0], "1");
  const selected = result.selectedIndices;
  refill(result.baseState, o.base_state); refill(result.degreeState, o.degree_state);
  refill(result.kummerState, o.kummer_state); refill(result.rng, o.random_state);
  refill(selected, o.selected_indices);
  for (let i = 0; i < selected.length; i += 1) {
    const index = Number(selected[i]), descriptor = result.selectedDescriptors[i];
    descriptor.p = String(integerAt(o.catalog_primes, index));
    descriptor.e = String(integerAt(o.catalog_e, index));
    descriptor.f = String(integerAt(o.catalog_f, index));
    descriptor.inert = String(integerAt(o.catalog_inert, index));
    refill(descriptor.generator, o.catalog_generators, 4 * index);
    refill(descriptor.tau, o.catalog_tau, 16 * index);
  }
  refill(result.analyticPrimeData.offsets, o.pattern_offsets);
  refill(result.analyticPrimeData.counts, o.pattern_counts);
  refill(result.analyticPrimeData.degrees, o.pattern_degrees);
  refill(result.analyticPrimeData.multiplicities, o.pattern_multiplicities);
  const map = [["rationalPrimes", "initial_primes"], ["groupOffsets", "initial_offsets"],
    ["groupCounts", "initial_counts"], ["groupComplete", "initial_complete"],
    ["relationPrimes", "relation_primes"], ["ramification", "ramification"],
    ["residueDegrees", "residue_degrees"], ["inertFlags", "inert_flags"],
    ["tau", "selected_tau"], ["packetIdeals", "packet_ideals"],
    ["packetNorms", "packet_norms"], ["badFlags", "bad_flags"],
    ["permutation", "permutation"], ["subfactor", "subfactor"], ["minidx", "minidx"]];
  for (const [target, source] of map) refill(result.factor[target], o[source]);
  const relationMap = [["state", "relation_state"], ["denseRecords", "relation_records"],
    ["hashes", "relation_hashes"], ["metadata", "relation_metadata"],
    ["generators", "relation_generators"], ["basis", "relation_basis"]];
  for (const [target, source] of relationMap) refill(result.relations[target], o[source]);
  for (let i = 0; i < rows; i += 1)
    result.handoff.searchIdeals[i] = result.factor.permutation[i];
  result.handoff.searchCount = rows; result.handoff.Nrelid = Number(rootState[12]);
  result.handoff.target = Number(rootState[10]); result.handoff.need = Number(rootState[11]);
  result.handoff.missing = Number(rootState[13]);
  result.capacity.logicalRows = rows;
  result.capacity.logicalRecordCapacity = Number(result.relations.state[1]);
  return result;
}

function runInitial(resident, template, prepared, expectedCount) {
  resident.reset();
  const started = process.hrtime.bigint();
  const count = resident.fn.gmp(...resident.args);
  const kernelNanoseconds = String(process.hrtime.bigint() - started);
  assert.equal(count, BigInt(expectedCount));
  return { kernelNanoseconds,
    root: materializeInitialRoot(template, resident, prepared, expectedCount) };
}

function allocateAnalytic(compiled, root) {
  const count = root.analyticPrimeData.primes.length;
  const fn = compiled.fn;
  return {
    discriminant: BigInt(root.field.discriminant), real_places: 2n,
    complex_places: 1n, roots_of_unity: 2n,
    log_discriminant: float64(fn, 1), primes: integer(fn, count, 1),
    offsets: integer(fn, root.analyticPrimeData.offsets.length, 1),
    counts: integer(fn, root.analyticPrimeData.counts.length, 1),
    degrees: integer(fn, root.analyticPrimeData.degrees.length, 1),
    multiplicities: integer(fn, root.analyticPrimeData.multiplicities.length, 1),
    coefficients: float64(fn, 7),
    table: float64(fn, 31), tail: float64(fn, 1), logarithms: float64(fn, count),
    log_inverse_residue: float64(fn, 1), inverse_residue: integer(fn, 3),
    exp_cache: integer(fn, 3), pi_cache: integer(fn, 3), a: integer(fn, 64),
    b: integer(fn, 64), p: integer(fn, 64), q: integer(fn, 64),
    stack: integer(fn, 128), inverse_hr: integer(fn, 3), state: int64(fn, 2),
  };
}

function allocateAcceptance(compiled, config) {
  const fn = compiled.fn, rows = config.factorCount, columns = config.unitColumns;
  const size = rows * (columns + 1), square = rows * rows;
  const reconstruction = (rows - 1) * columns;
  const maxC = 7 * 3 * Math.max(...config.columns);
  // The authenticated corridor uses 192-bit reals and bounded exact HNF
  // scratch. Four limbs retain that range and fail closed on overflow instead
  // of reserving 1,024 bits for every entry of the row-11 dense matrices.
  const workspace = length => integer(fn, length, rows === 421 ? 4 : 16);
  const result = {
    factor_count: BigInt(rows), h_rows: 0n, b_columns: BigInt(rows), c_columns: 0n,
    places: 3n, degree: 4n, h: workspace(config.hCapacity), c: workspace(maxC),
    inverse_hr: workspace(3), logs: workspace(3 * rows * columns),
    class_number: workspace(1), zeta_factor: workspace(3),
    post_hnf_state: int64(fn, 3), prepared: workspace(3 * size),
    selected: int64(fn, columns + 1), prep_state: int64(fn, 3),
    rank_work: workspace(3 * size), rank_occupied: int64(fn, rows),
    rank_pivots: int64(fn, columns + 1), rank_state: int64(fn, 3),
    integer_input: workspace(size), integer_work: workspace(size),
    integer_occupied: workspace(rows), integer_pivots: workspace(columns + 1),
    integer_best: workspace(columns + 1), integer_state: workspace(10),
    basis: workspace(3 * square), minor: workspace(3 * square),
    det_work: workspace(3 * square), det_result: workspace(3),
    det_pivots: int64(fn, rows), det_state: int64(fn, 5),
    inverse_work: workspace(3 * square), inverse_rhs: workspace(3 * square),
    inverse: workspace(3 * square), inverse_pivots: int64(fn, rows),
    inverse_state: int64(fn, 3), product: workspace(3 * square),
    inverse_slice: workspace(3 * square), multiple: workspace(3),
    coordinates: workspace(3 * reconstruction), multiple_state: int64(fn, 4),
    rational_work: workspace(3 * reconstruction), lattice: workspace(reconstruction),
    hnf_work: workspace(reconstruction), hnf_column: workspace(rows - 1),
    hnf_output: workspace(reconstruction), hnf_state: int64(fn, 15),
    regulator: workspace(3), relations: workspace(reconstruction),
    denominator: workspace(1), reconstruction_state: int64(fn, 4),
    hnf_row_pivots: int64(fn, rows - 1), hnf_heights: int64(fn, columns),
    cache_changed: true, acceptance_state: int64(fn, 3),
  };
  return result;
}

function resetAcceptance(bindings) {
  for (const [name, owner] of Object.entries(bindings)) {
    if (["factor_count", "places", "degree"].includes(name)) continue;
    if (typeof owner !== "bigint" && typeof owner !== "boolean") resetOwner(owner);
  }
}

async function prepare(row, warmRoot) {
  const config = CONFIG[row]; assert(config, `unsupported resident suffix row ${row}`);
  const analytic = await compile("row14_post806_terminal.py", "pari_row14_analytic_inverse_hr");
  const acceptance = await compile("post_hnf_acceptance.py", "pari_post_hnf_acceptance");
  const smith = row === 8 ? null
    : await compile("class_invariant_output.py", "pari_class_invariant_output");
  const analyticOwners = allocateAnalytic(analytic, warmRoot);
  const acceptanceOwners = allocateAcceptance(acceptance, config);
  const smithOwners = smith === null ? null : {
    original: integer(smith.fn, 9), dimension: 3n, work: integer(smith.fn, 9),
    column: integer(smith.fn, 3), invariants: integer(smith.fn, 3),
    class_number: integer(smith.fn, 1), state: int64(smith.fn, 6),
  };
  return Object.freeze({ row, config, analytic, acceptance, smith,
    analyticOwners, acceptanceOwners, smithOwners });
}

function run(resident, root, checkpoints) {
  const { config, analytic, analyticOwners: av, acceptance, acceptanceOwners: tv } = resident;
  assert.equal(checkpoints.length, config.attempts);
  for (const owner of Object.values(av))
    if (typeof owner !== "bigint") resetOwner(owner);
  av.discriminant = BigInt(root.field.discriminant);
  loadInteger(av.primes, root.analyticPrimeData.primes);
  loadInteger(av.offsets, root.analyticPrimeData.offsets);
  loadInteger(av.counts, root.analyticPrimeData.counts);
  loadInteger(av.degrees, root.analyticPrimeData.degrees);
  loadInteger(av.multiplicities, root.analyticPrimeData.multiplicities);
  const clock = { nanoseconds: 0n, calls: 0 };
  assert.equal(invoke(analytic, av, clock), 0n);

  resetAcceptance(tv); loadInteger(tv.inverse_hr, values(av.inverse_hr));
  const statuses = [], regulators = [];
  let oldCache = 0;
  for (let i = 0; i < checkpoints.length; i += 1) {
    const checkpoint = checkpoints[i], state = checkpoint.state.map(Number);
    assert.equal(checkpoint.columns, config.columns[i]);
    tv.h_rows = BigInt(state[0]); tv.b_columns = BigInt(state[2]);
    tv.c_columns = BigInt(checkpoint.columns); tv.cache_changed = checkpoint.columns !== oldCache;
    loadInteger(tv.h, checkpoint.h); loadInteger(tv.c, checkpoint.c);
    tv.multiple_state[1] = 0n;
    const status = Number(invoke(acceptance, tv, clock)); statuses.push(status);
    if (Number(tv.acceptance_state[0]) === 2) oldCache = checkpoint.columns;
    regulators.push(values(tv.regulator).map(String));
  }
  assert.deepEqual(statuses, config.statuses);
  assert.equal(String(values(tv.class_number)[0]), config.classNumber);
  let invariants = config.invariants;
  if (resident.smith !== null) {
    const sv = resident.smithOwners;
    for (const owner of Object.values(sv)) if (typeof owner !== "bigint") resetOwner(owner);
    const last = checkpoints.at(-1); loadInteger(sv.original, last.h);
    sv.dimension = BigInt(last.state[0]);
    assert.equal(invoke(resident.smith, sv, clock), 0n);
    invariants = values(sv.invariants).slice(0, Number(sv.state[1])).map(String);
    assert.deepEqual(invariants, config.invariants);
  }
  return Object.freeze({ statuses: Object.freeze(statuses),
    kernelNanoseconds: String(clock.nanoseconds), kernelNativeCalls: clock.calls,
    inverseHR: Object.freeze(values(av.inverse_hr).map(String)),
    analyticState: Object.freeze(Array.from(av.state, Number)),
    classNumber: config.classNumber, invariantFactors: Object.freeze([...invariants]),
    regulator: Object.freeze(regulators.at(-1)),
    unitRelations: Object.freeze(values(tv.relations)
      .slice(0, 2 * config.unitColumns).map(String)) });
}

module.exports = { CONFIG, materializeInitialRoot, prepare, run, runInitial };
