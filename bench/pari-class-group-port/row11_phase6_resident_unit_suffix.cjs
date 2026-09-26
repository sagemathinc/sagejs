"use strict";

// Resident row-11 C5/C6 unit suffix.  Every compiler handle and backing owner
// is constructed by prepare(); run() only resets/reloads those owners and
// invokes the ordinary-Python native kernels.  Host-side reshaping and output
// inspection are deliberately outside the accumulated native-call clock.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const KERNEL = 9, PLACES = 3, RANK = 2, PRECISION = 192;

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

function integer(fn, length, words = 64, initial) {
  return fn.createIntegerBuffer(length, words,
    initial === undefined ? undefined : initial.map(BigInt));
}
function int64(fn, length, initial) {
  return fn.createInt64Buffer(initial === undefined ? length : initial.map(BigInt));
}
function float64(fn, length) { return fn.createFloat64Buffer(length); }
function values(owner) { return owner.toArray ? owner.toArray() : Array.from(owner); }

function writeInteger(owner, index, raw) {
  let value = BigInt(raw), negative = value < 0n;
  if (negative) value = -value;
  let words = 0, offset = index * owner.wordCapacity;
  while (value !== 0n) {
    assert(words < owner.wordCapacity, "row-11 unit owner capacity exceeded");
    owner.limbs[offset + words] = BigInt.asUintN(64, value);
    value >>= 64n; words += 1;
  }
  owner.sizes[index] = negative ? -words : words;
}

function loadInteger(owner, input) {
  assert(input.length <= owner.length, "row-11 unit input exceeds owner");
  owner.sizes.fill(0);
  for (let index = 0; index < input.length; index += 1)
    writeInteger(owner, index, input[index]);
}

function reset(owner) {
  if (owner?.sizes instanceof Int32Array) owner.sizes.fill(0);
  else if (ArrayBuffer.isView(owner)) owner.fill(owner instanceof Float64Array ? 0 : 0n);
}

function invoke(compiled, bindings, clock) {
  const args = compiled.names.map(([name]) => {
    assert.notEqual(bindings[name], undefined, `missing ${name}`); return bindings[name];
  });
  const started = process.hrtime.bigint();
  try { return compiled.fn.gmp(...args); } finally {
    clock.nanoseconds += process.hrtime.bigint() - started; clock.calls += 1;
  }
}

function realOwners(compiled) {
  const fn = compiled.fn;
  return { matrix_triples: integer(fn, 18), rows: 3n,
    integers: integer(fn, 6), u2: integer(fn, 4), form: integer(fn, 3),
    basis: integer(fn, 6), transform: integer(fn, 4), gram: integer(fn, 4),
    mu: float64(fn, 4), mu_exponents: integer(fn, 4), r: float64(fn, 4),
    r_exponents: integer(fn, 4), s: float64(fn, 2), s_exponents: integer(fn, 2),
    approximate: float64(fn, 6), float_gram: float64(fn, 4),
    alpha: integer(fn, 2), column: integer(fn, 3),
    column_exponents: integer(fn, 3), normalized: float64(fn, 3),
    temporary: float64(fn, 3), dpe_float_scratch: float64(fn, 3),
    integer_scratch: integer(fn, 3), state: integer(fn, 2) };
}

function resetBindings(bindings, retain = []) {
  const retained = new Set(retain);
  for (const [name, value] of Object.entries(bindings))
    if (!retained.has(name) && typeof value !== "bigint" && typeof value !== "boolean")
      reset(value);
}

function embeddingOwners(prepared) {
  const source = prepared.preparation_embedding.map(BigInt);
  assert.equal(source.length, 48);
  const real = Array(36).fill(0n), imaginary = Array(36).fill(0n);
  for (let basis = 0; basis < 4; basis += 1) for (let place = 0; place < 3; place += 1) {
    const input = 3 * (4 * place + basis), output = 3 * (3 * basis + place);
    real.splice(output, 3, ...source.slice(input, input + 3));
    imaginary.splice(output, 3, ...(place === 2
      ? source.slice(3 * (12 + basis), 3 * (12 + basis) + 3)
      : [0n, -1n, 0n]));
  }
  return { real, imaginary };
}

async function prepare(prepared) {
  // Sequential compilation bounds peak memory and is outside the kernel clock.
  const selection = await compile("unit_lattice_selection.py", "pari_unit_lattice_selection");
  const integerReduction = await compile("unit_lattice_reduction.py",
    "pari_unit_integer_lattice_rank_two");
  const realReduction = await compile("unit_lattice_reduction.py",
    "pari_unit_real_lattice_rank_two");
  const compose = await compile("unit_lattice_reduction.py", "pari_unit_compose_rank_two");
  const logs = await compile("log_matrix_transform.py", "pari_log_matrix_transform");
  const clean = await compile("field3_mixed_unit_suffix.py",
    "pari_cleanarchunit_mixed_quartic");
  const prepareGetfu = await compile("field3_mixed_unit_suffix.py", "pari_field3_prepare_getfu");
  const getfu = await compile("getfu_mixed_quartic.py", "pari_getfu_mixed_quartic");

  const sfn = selection.fn;
  const selectionOwners = { original: integer(sfn, 18), rows: 2n, columns: 9n,
    selected: int64(sfn, 9), state: int64(sfn, 7), gathered: integer(sfn, 18),
    work: integer(sfn, 18), column: integer(sfn, 2), target: integer(sfn, 18),
    previous: integer(sfn, 18), trial: integer(sfn, 18), row_pivots: int64(sfn, 2),
    heights: int64(sfn, 9), hnf_state: int64(sfn, 15) };
  const ifn = integerReduction.fn, square = KERNEL * KERNEL;
  const integerOwners = { original: integer(ifn, 18), columns: 9n,
    u1: integer(ifn, 18), state: integer(ifn, 5), basis: integer(ifn, 18),
    transform: integer(ifn, square), gram: integer(ifn, square),
    mu: float64(ifn, square), mu_exponents: integer(ifn, square),
    r: float64(ifn, square), r_exponents: integer(ifn, square),
    s: float64(ifn, KERNEL), s_exponents: integer(ifn, KERNEL),
    approximate: float64(ifn, 18), float_gram: float64(ifn, square),
    alpha: integer(ifn, KERNEL), column: integer(ifn, KERNEL),
    column_exponents: integer(ifn, KERNEL), normalized: float64(ifn, KERNEL),
    temporary: float64(ifn, KERNEL), dpe_float_scratch: float64(ifn, KERNEL),
    integer_scratch: integer(ifn, KERNEL) };
  const realFirst = realOwners(realReduction), realFactor = realOwners(realReduction);
  const cfn = compose.fn, composeOwners = { u1: integer(cfn, 18), rows: 9n,
    u2: integer(cfn, 4), output: integer(cfn, 18) };
  const lfn = logs.fn, logsOwners = { entries: integer(lfn, 189),
    coefficients: integer(lfn, 18), rows: 3n, inner: 9n, columns: 2n,
    generic: false, output: integer(lfn, 42) };
  const clfn = clean.fn, cleanOwners = { source: integer(clfn, 42),
    expected_regulator: integer(clfn, 3), precision: BigInt(PRECISION),
    pi_cache: integer(clfn, 3), a: integer(clfn, 1024), b: integer(clfn, 1024),
    p: integer(clfn, 1024), q: integer(clfn, 1024), stack: integer(clfn, 2048),
    scratch: integer(clfn, 42), output: integer(clfn, 42), state: int64(clfn, 6) };
  const pfn = prepareGetfu.fn, prepareOwners = { clean: integer(pfn, 42),
    factor: integer(pfn, 4), matep: integer(pfn, 42), arch: integer(pfn, 42),
    factored_clean: integer(pfn, 42), arch_real: integer(pfn, 18),
    arch_imag: integer(pfn, 18), clean_real: integer(pfn, 18),
    clean_imag: integer(pfn, 18) };
  const embedding = embeddingOwners(prepared), gfn = getfu.fn;
  const getfuOwners = { arch_real: integer(gfn, 18), arch_imag: integer(gfn, 18),
    clean_real: integer(gfn, 18), clean_imag: integer(gfn, 18), factor: integer(gfn, 4),
    embedding_real: integer(gfn, 36, 64, embedding.real),
    embedding_imag: integer(gfn, 36, 64, embedding.imag),
    multiplication_basis: integer(gfn, 64, 64, prepared.basis_table),
    precision: BigInt(PRECISION), exponential_real: integer(gfn, 18),
    exponential_imag: integer(gfn, 18), split_matrix: integer(gfn, 48),
    split_rhs: integer(gfn, 24), solve_work: integer(gfn, 48),
    solve_rhs: integer(gfn, 24), solved: integer(gfn, 24), rounded: integer(gfn, 8),
    multiplication: integer(gfn, 16), inverse: integer(gfn, 4),
    candidate_units: integer(gfn, 8), normalized_factor: integer(gfn, 4),
    output_units: integer(gfn, 8), output_logs_real: integer(gfn, 18),
    output_logs_imag: integer(gfn, 18), output_factor: integer(gfn, 4),
    state: int64(gfn, 8), pivots: int64(gfn, 4), exp_cache: integer(gfn, 3),
    pi_cache: integer(gfn, 3), a: integer(gfn, 512), b: integer(gfn, 512),
    p: integer(gfn, 512), q: integer(gfn, 512), stack: integer(gfn, 91) };
  return Object.freeze({ selection, integerReduction, realReduction, compose, logs,
    clean, prepareGetfu, getfu, owners: Object.freeze({ selectionOwners, integerOwners,
      realFirst, realFactor, composeOwners, logsOwners, cleanOwners, prepareOwners,
      getfuOwners }) });
}

function triplesFromPacked(packed) {
  const triples = [];
  for (let row = 0; row < PLACES; row += 1) for (let column = 0; column < RANK; column += 1) {
    const at = 7 * (column * PLACES + row) + 1;
    triples.push(...packed.slice(at, at + 3));
  }
  return triples;
}

function run(resident, packedLogs, lattice, regulator) {
  assert.equal(packedLogs.length, 189); assert.equal(lattice.length, 18);
  assert.equal(regulator.length, 3);
  const o = resident.owners, clock = { nanoseconds: 0n, calls: 0 };
  resetBindings(o.selectionOwners, ["rows", "columns"]);
  loadInteger(o.selectionOwners.original, lattice);
  assert.equal(invoke(resident.selection, o.selectionOwners, clock), 0n);

  resetBindings(o.integerOwners, ["columns"]);
  loadInteger(o.integerOwners.original, lattice);
  assert.equal(invoke(resident.integerReduction, o.integerOwners, clock), 0n);

  resetBindings(o.logsOwners, ["rows", "inner", "columns", "generic"]);
  loadInteger(o.logsOwners.entries, packedLogs);
  loadInteger(o.logsOwners.coefficients, values(o.integerOwners.u1));
  assert.equal(invoke(resident.logs, o.logsOwners, clock), 0n);

  resetBindings(o.realFirst, ["rows"]);
  loadInteger(o.realFirst.matrix_triples, triplesFromPacked(values(o.logsOwners.output)));
  assert.equal(invoke(resident.realReduction, o.realFirst, clock), 0n);
  const u2 = values(o.realFirst.u2), determinant = u2[0] * u2[3] - u2[1] * u2[2];
  assert(determinant === 1n || determinant === -1n);

  resetBindings(o.composeOwners, ["rows"]);
  loadInteger(o.composeOwners.u1, values(o.integerOwners.u1));
  loadInteger(o.composeOwners.u2, u2);
  assert.equal(invoke(resident.compose, o.composeOwners, clock), 0n);

  resetBindings(o.logsOwners, ["rows", "inner", "columns", "generic"]);
  loadInteger(o.logsOwners.entries, packedLogs);
  loadInteger(o.logsOwners.coefficients, values(o.composeOwners.output));
  assert.equal(invoke(resident.logs, o.logsOwners, clock), 0n);

  resetBindings(o.cleanOwners, ["precision"]);
  loadInteger(o.cleanOwners.source, values(o.logsOwners.output));
  loadInteger(o.cleanOwners.expected_regulator, regulator);
  assert.equal(invoke(resident.clean, o.cleanOwners, clock), 0n);

  resetBindings(o.prepareOwners);
  loadInteger(o.prepareOwners.clean, values(o.cleanOwners.output));
  loadInteger(o.prepareOwners.factor, [1n, 0n, 0n, 1n]);
  assert.equal(invoke(resident.prepareGetfu, o.prepareOwners, clock), 0n);

  resetBindings(o.realFactor, ["rows"]);
  loadInteger(o.realFactor.matrix_triples, triplesFromPacked(values(o.prepareOwners.matep)));
  assert.equal(invoke(resident.realReduction, o.realFactor, clock), 0n);
  const factor = values(o.realFactor.u2);
  [factor[1], factor[2]] = [factor[2], factor[1]];
  const factorDeterminant = factor[0] * factor[3] - factor[1] * factor[2];
  assert(factorDeterminant === 1n || factorDeterminant === -1n);

  resetBindings(o.prepareOwners);
  loadInteger(o.prepareOwners.clean, values(o.cleanOwners.output));
  loadInteger(o.prepareOwners.factor, factor);
  assert.equal(invoke(resident.prepareGetfu, o.prepareOwners, clock), 0n);

  resetBindings(o.getfuOwners, ["embedding_real", "embedding_imag",
    "multiplication_basis", "precision"]);
  loadInteger(o.getfuOwners.arch_real, values(o.prepareOwners.arch_real));
  loadInteger(o.getfuOwners.arch_imag, values(o.prepareOwners.arch_imag));
  loadInteger(o.getfuOwners.clean_real, values(o.prepareOwners.clean_real));
  loadInteger(o.getfuOwners.clean_imag, values(o.prepareOwners.clean_imag));
  loadInteger(o.getfuOwners.factor, factor);
  // Poisoned outputs make flag-zero fail closed: this row must return LARGE.
  for (const owner of [o.getfuOwners.output_units, o.getfuOwners.output_logs_real,
    o.getfuOwners.output_logs_imag, o.getfuOwners.output_factor])
    loadInteger(owner, Array(owner.length).fill(31337n));
  const status = Number(invoke(resident.getfu, o.getfuOwners, clock));
  assert.equal(status, 2); assert.equal(Number(o.getfuOwners.state[0]), 2);
  assert.deepEqual(Array.from(o.getfuOwners.state, Number),
    [2, 21, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(values(o.getfuOwners.output_units), Array(8).fill(31337n));

  return Object.freeze({ kernelNanoseconds: String(clock.nanoseconds),
    kernelNativeCalls: clock.calls, status, reason: "LARGE",
    state: Object.freeze(Array.from(o.getfuOwners.state, Number)),
    transform: Object.freeze(values(o.composeOwners.output).map(String)),
    archimedeanUnits: Object.freeze(values(o.cleanOwners.output).map(String)),
    candidate: Object.freeze(values(o.prepareOwners.factored_clean).map(String)),
    factor: Object.freeze(factor.map(String)) });
}

module.exports = { prepare, run };
