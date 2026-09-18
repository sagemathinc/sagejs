"use strict";

// Resident, serialization-free row-14 prepared-nf timing boundary.  The
// public checker authenticates the neutral prepared input before constructing
// this runner and performs all replay, hashing, differential checks and JSON
// publication after run() has stopped its clock.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const initial = require("./check_row14_prepared_initial_root.cjs");
const gate = require("./row14_prepared_gate_c_host.cjs");
const complete = require("./row14_prepared_complete_host.cjs");
const post = require("./row14_post806_terminal_host.cjs");
const { ALL_STAGES, ExclusiveStageTimer } = require("./h1_exclusive_stage_timing.cjs");

const ROWS = 799, DEGREE = 4, PLACES = 3, UNIT_COLUMNS = 7;

function bindExclusiveRoot(kernelStart, kernelEnd, exclusiveStart, exclusiveTiming) {
  for (const [label, value] of Object.entries({ kernelStart, kernelEnd, exclusiveStart }))
    assert.equal(typeof value, "bigint", `${label} must be a bigint timestamp`);
  assert(kernelEnd >= kernelStart, "legacy kernel clock moved backwards");
  assert(exclusiveStart >= kernelStart, "exclusive clock started before kernel clock");
  const root = BigInt(exclusiveTiming.rootNanoseconds);
  const exclusiveEnd = exclusiveStart + root;
  assert(exclusiveEnd >= kernelEnd, "exclusive clock ended before kernel clock");
  const startOffsetNanoseconds = exclusiveStart - kernelStart;
  const endOffsetNanoseconds = exclusiveEnd - kernelEnd;
  const kernelNanoseconds = kernelEnd - kernelStart;
  assert.equal(root, kernelNanoseconds - startOffsetNanoseconds + endOffsetNanoseconds);
  return {
    relationship: "exclusive = kernel - startOffset + endOffset",
    startOffsetNanoseconds: String(startOffsetNanoseconds),
    endOffsetNanoseconds: String(endOffsetNanoseconds),
  };
}

function signature(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = fs.readFileSync(source, "utf8")
    .match(new RegExp(`def ${escaped}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `missing native signature ${name}`);
  return match[1].trim().split("\n")
    .map(line => line.trim().replace(/,$/, "").split(": "));
}

async function compile(name, exported) {
  const source = path.join(__dirname, name);
  const built = await compileKernel({ sourcePath: source });
  const fn = require(built.modulePath)[exported];
  assert(fn?.nativeAvailable, `${exported} is not native`);
  return { built, fn, names: signature(source, exported) };
}

function integer(fn, valuesOrLength, capacity = 64) {
  if (Array.isArray(valuesOrLength)) {
    return fn.createIntegerBuffer(valuesOrLength.length, capacity,
      valuesOrLength.map(BigInt));
  }
  return fn.createIntegerBuffer(valuesOrLength, capacity);
}

function int64(fn, valuesOrLength) {
  return fn.createInt64Buffer(Array.isArray(valuesOrLength)
    ? valuesOrLength.map(BigInt) : valuesOrLength);
}

function float64(fn, length) { return fn.createFloat64Buffer(length); }
function values(owner) { return owner.toArray ? owner.toArray() : Array.from(owner); }

function invoke(compiled, bindings) {
  return compiled.fn.gmp(...compiled.names.map(([name]) => {
    assert.notEqual(bindings[name], undefined, `missing native argument ${name}`);
    return bindings[name];
  }));
}

function realReduction(kernels, triples) {
  const c = kernels.real;
  const b = {
    matrix_triples: integer(c.fn, triples), rows: 3n,
    integers: integer(c.fn, 6), u2: integer(c.fn, 4), form: integer(c.fn, 3),
    basis: integer(c.fn, 6), transform: integer(c.fn, 4), gram: integer(c.fn, 4),
    mu: float64(c.fn, 4), mu_exponents: integer(c.fn, 4),
    r: float64(c.fn, 4), r_exponents: integer(c.fn, 4),
    s: float64(c.fn, 2), s_exponents: integer(c.fn, 2),
    approximate: float64(c.fn, 6), float_gram: float64(c.fn, 4),
    alpha: integer(c.fn, 2), column: integer(c.fn, 3),
    column_exponents: integer(c.fn, 3), normalized: float64(c.fn, 3),
    temporary: float64(c.fn, 3), dpe_float_scratch: float64(c.fn, 3),
    integer_scratch: integer(c.fn, 3), state: integer(c.fn, 2),
  };
  assert.equal(invoke(c, b), 0n);
  return values(b.u2);
}

function transformLogs(kernels, entries, coefficients, inner) {
  const c = kernels.logs;
  const output = integer(c.fn, 42);
  assert.equal(invoke(c, { entries: integer(c.fn, entries),
    coefficients: integer(c.fn, coefficients), rows: 3n, inner: BigInt(inner),
    columns: 2n, generic: false, output }), 0n);
  return values(output);
}

function runUnitSuffix(kernels, accepted, post806, prepared, precision = 192,
  expectedGetfuHeight = 38) {
  const lattice = post806.unitRelations.map(BigInt);
  const packed = accepted.final.c.slice(0, 147).map(BigInt);

  const selection = kernels.selection, selected = int64(selection.fn, 7);
  const selectionState = int64(selection.fn, 7);
  assert.equal(invoke(selection, { original: integer(selection.fn, lattice), rows: 2n,
    columns: 7n, selected, state: selectionState, gathered: integer(selection.fn, 14),
    work: integer(selection.fn, 14), column: integer(selection.fn, 2),
    target: integer(selection.fn, 14), previous: integer(selection.fn, 14),
    trial: integer(selection.fn, 14), row_pivots: int64(selection.fn, 2),
    heights: int64(selection.fn, 7), hnf_state: int64(selection.fn, 15) }), 0n);

  const reduction = kernels.integer, u1 = integer(reduction.fn, 14);
  assert.equal(invoke(reduction, { original: integer(reduction.fn, lattice), columns: 7n,
    u1, state: integer(reduction.fn, 5), basis: integer(reduction.fn, 14),
    transform: integer(reduction.fn, 49), gram: integer(reduction.fn, 49),
    mu: float64(reduction.fn, 49), mu_exponents: integer(reduction.fn, 49),
    r: float64(reduction.fn, 49), r_exponents: integer(reduction.fn, 49),
    s: float64(reduction.fn, 7), s_exponents: integer(reduction.fn, 7),
    approximate: float64(reduction.fn, 14), float_gram: float64(reduction.fn, 49),
    alpha: integer(reduction.fn, 7), column: integer(reduction.fn, 7),
    column_exponents: integer(reduction.fn, 7), normalized: float64(reduction.fn, 7),
    temporary: float64(reduction.fn, 7), dpe_float_scratch: float64(reduction.fn, 7),
    integer_scratch: integer(reduction.fn, 7) }), 0n);
  const transformed = transformLogs(kernels, packed, values(u1), 7);
  const triples = [];
  for (let row = 0; row < 3; row++) for (let column = 0; column < 2; column++) {
    const at = 7 * (column * 3 + row) + 1;
    triples.push(...transformed.slice(at, at + 3));
  }
  const u2 = realReduction(kernels, triples);
  assert.equal(u2[0] * u2[3] - u2[1] * u2[2] === 1n ||
    u2[0] * u2[3] - u2[1] * u2[2] === -1n, true);
  const compose = kernels.compose, unitTransform = integer(compose.fn, 14);
  assert.equal(invoke(compose, { u1: integer(compose.fn, values(u1)), rows: 7n,
    u2: integer(compose.fn, u2), output: unitTransform }), 0n);
  const arch = transformLogs(kernels, packed, values(unitTransform), 7);

  const cleanKernel = kernels.clean, clean = integer(cleanKernel.fn, 42);
  const cleanState = int64(cleanKernel.fn, 6);
  assert.equal(invoke(cleanKernel, { source: integer(cleanKernel.fn, arch),
    expected_regulator: integer(cleanKernel.fn, post806.regulator.map(BigInt)),
    precision: BigInt(precision), pi_cache: integer(cleanKernel.fn, 3),
    a: integer(cleanKernel.fn, 1024), b: integer(cleanKernel.fn, 1024),
    p: integer(cleanKernel.fn, 1024), q: integer(cleanKernel.fn, 1024),
    stack: integer(cleanKernel.fn, 2048), scratch: integer(cleanKernel.fn, 42),
    output: clean, state: cleanState }), 0n);

  const prep = kernels.prepare, matep = integer(prep.fn, 42);
  const preparedArch = integer(prep.fn, 42), candidate = integer(prep.fn, 42);
  const zeros18 = () => integer(prep.fn, 18);
  assert.equal(invoke(prep, { clean: integer(prep.fn, values(clean)),
    factor: integer(prep.fn, [1n, 0n, 0n, 1n]), matep, arch: preparedArch,
    factored_clean: candidate, arch_real: zeros18(), arch_imag: zeros18(),
    clean_real: zeros18(), clean_imag: zeros18() }), 0n);
  const factor = realReduction(kernels, (() => {
    const m = values(matep), t = [];
    for (let row = 0; row < 3; row++) for (let column = 0; column < 2; column++) {
      const at = 7 * (column * 3 + row) + 1; t.push(...m.slice(at, at + 3));
    }
    return t;
  })());
  [factor[1], factor[2]] = [factor[2], factor[1]];
  const finalMatep = integer(prep.fn, 42), finalArch = integer(prep.fn, 42);
  const finalCandidate = integer(prep.fn, 42);
  const archReal = integer(prep.fn, 18), archImag = integer(prep.fn, 18);
  const cleanReal = integer(prep.fn, 18), cleanImag = integer(prep.fn, 18);
  assert.equal(invoke(prep, { clean: integer(prep.fn, values(clean)),
    factor: integer(prep.fn, factor), matep: finalMatep, arch: finalArch,
    factored_clean: finalCandidate, arch_real: archReal, arch_imag: archImag,
    clean_real: cleanReal, clean_imag: cleanImag }), 0n);

  const embeddingReal = Array(36).fill(0n), embeddingImag = Array(36).fill(0n);
  const embedding = prepared.preparation_embedding.map(BigInt);
  for (let basis = 0; basis < 4; basis++) for (let place = 0; place < 3; place++) {
    const source = 3 * (4 * place + basis), target = 3 * (4 * basis + place);
    embeddingReal.splice(target, 3, ...embedding.slice(source, source + 3));
    embeddingImag.splice(target, 3, ...(place === 2
      ? embedding.slice(3 * (12 + basis), 3 * (12 + basis) + 3)
      : [0n, -1n, 0n]));
  }
  const getfu = kernels.getfu, state = int64(getfu.fn, 8);
  const poison = 31337n;
  const outputUnits = integer(getfu.fn, Array(8).fill(poison));
  const outputLogsReal = integer(getfu.fn, Array(18).fill(poison));
  const outputLogsImag = integer(getfu.fn, Array(18).fill(poison));
  const outputFactor = integer(getfu.fn, Array(4).fill(poison));
  const getfuStatus = invoke(getfu, { arch_real: integer(getfu.fn, values(archReal)),
    arch_imag: integer(getfu.fn, values(archImag)),
    clean_real: integer(getfu.fn, values(cleanReal)),
    clean_imag: integer(getfu.fn, values(cleanImag)), factor: integer(getfu.fn, factor),
    embedding_real: integer(getfu.fn, embeddingReal),
    embedding_imag: integer(getfu.fn, embeddingImag),
    multiplication_basis: integer(getfu.fn, prepared.basis_table.map(BigInt)),
    precision: BigInt(precision), exponential_real: integer(getfu.fn, 18),
    exponential_imag: integer(getfu.fn, 18), split_matrix: integer(getfu.fn, 48),
    split_rhs: integer(getfu.fn, 24), solve_work: integer(getfu.fn, 48),
    solve_rhs: integer(getfu.fn, 24), solved: integer(getfu.fn, 24),
    rounded: integer(getfu.fn, 8), multiplication: integer(getfu.fn, 16),
    inverse: integer(getfu.fn, 4), candidate_units: integer(getfu.fn, 8),
    normalized_factor: integer(getfu.fn, 4), output_units: outputUnits,
    output_logs_real: outputLogsReal, output_logs_imag: outputLogsImag,
    output_factor: outputFactor, state, pivots: int64(getfu.fn, 4),
    exp_cache: integer(getfu.fn, 3), pi_cache: integer(getfu.fn, 3),
    a: integer(getfu.fn, 512), b: integer(getfu.fn, 512),
    p: integer(getfu.fn, 512), q: integer(getfu.fn, 512),
    stack: integer(getfu.fn, 91) });
  assert.equal(getfuStatus, 2n);
  assert.deepEqual(Array.from(state, Number),
    [2, expectedGetfuHeight, 0, 0, 0, 0, 0, 1]);
  return { archimedeanUnits: values(clean), candidate: values(finalCandidate),
    factor, lattice, regulator: post806.regulator.map(BigInt),
    transform: values(unitTransform), getfuState: Array.from(state, Number) };
}

// This is the established allocator from check_quartic_direct_composition.cjs,
// used here with live terminal H/C, live active factor ideals and authenticated
// prepared-nf matrices rather than an oracle fixture.
function allocateClassAssembly(fn, fixture) {
  const exact = (source, cap = 1536) =>
    fn.createIntegerBuffer(source.length, cap, source.map(BigInt));
  const z = (n, value = 0n, cap = 1536) => exact(Array(n).fill(value), cap);
  const i64 = n => fn.createInt64Buffer(n);
  const f64 = n => fn.createFloat64Buffer(n);
  const n = 3, active = 2;
  const published = { generators: z(32, 77n), offsets: z(3, 77n),
    kinds: z(20, 77n), factorValues: z(100, 77n), exponents: z(20, 77n),
    invariants: z(n, 77n), classNumber: z(1, 77n), Ga: z(21*active, 77n),
    GD: z(21*active, 77n), ga: z(21*n, 77n) };
  const smith = Array.from({ length: 10 }, () => z(n*n));
  const t2 = [z(16),z(4),z(4),z(52),z(20),z(4),z(16),z(16),z(16),z(16),
    z(5),z(4),z(16),z(16),z(16),z(16),z(16),z(16),z(16),z(16),z(48),z(48),
    z(48),z(12),z(12),z(12),z(4),z(7),z(12),z(12),z(12),z(4),z(4),z(4),
    z(4),z(12),z(12),z(12),z(12),z(4),f64(16),f64(16),f64(4),f64(16),z(4),
    f64(16),z(16),z(16),z(16),z(4),z(4),z(4),f64(4),f64(1),z(4)];
  const args = [...fixture.matrix.map(source => exact(source)),
    exact(fixture.W), exact(fixture.C),
    ...fixture.primes.map(source => exact(source)),
    exact(fixture.table), exact(fixture.roundedT2),
    3n,2n,192n,published.generators,published.offsets,published.kinds,
    published.factorValues,published.exponents,published.invariants,
    published.classNumber,published.Ga,published.GD,published.ga,...smith,z(n),z(1),
    z(16),z(16),z(3),z(20),z(100),z(20),z(1),z(20),z(100),z(20),z(1),z(64),
    z(32),z(52),z(20),z(4),z(16),z(16),z(16),z(16),...t2,z(2),z(16),z(16),
    z(4),z(1),z(52),z(20),z(4),z(21*active),z(21*active),z(21*n),z(n),z(n*n),
    z(2*n*n),...Array.from({length:4},()=>i64(7)),i64(9),z(9),z(4),z(21),z(21),
    ...Array.from({length:6},()=>z(64)),z(128),z(21*n),z(21*active),z(21*active),
    z(21*n),z(21*n),z(21*active),z(21*n),i64(8),i64(8)];
  assert.equal(args.length, 149);
  return { args, published };
}

function runClassAssembly(kernel, accepted, metadata) {
  const active = accepted.final.perm.slice(0, 3).map(value => Number(value)-1);
  const ideals = active.map(row => metadata.factor.packetIdeals
    .slice(16*row, 16*(row+1)).map(BigInt));
  const fixture = { matrix: [metadata.prepared.admission_matrix_m,
      metadata.prepared.admission_matrix_p, metadata.prepared.admission_matrix_e],
    W: accepted.final.h, C: accepted.final.c.slice(7*21, 10*21), primes: ideals,
    table: metadata.prepared.basis_table,
    roundedT2: metadata.prepared.preparation_rounded_embedding };
  const allocated = allocateClassAssembly(kernel.fn, fixture);
  assert.equal(kernel.fn.gmp(...allocated.args), 0n);
  return { generators: values(allocated.published.generators),
    invariants: values(allocated.published.invariants).slice(0, 2),
    classNumber: values(allocated.published.classNumber)[0],
    logarithms: values(allocated.published.Ga) };
}

function liveAcceptedState(preparedEnvelope, root, live, metadata) {
  const cv = live.collectorValues;
  return {
    schema: "sagejs.pari-class-group/row14-accepted-relation-owner-v1",
    field: { polynomial: preparedEnvelope.data.prep_polynomial, degree: DEGREE },
    ancestry: { capsuleSha256: metadata.metadata.authority.capsuleSha256,
      factorMetadataSha256: metadata.metadataSha256 },
    acceptanceBoundary: { rows: ROWS, hRows: 3, bColumns: 796,
      totalColumns: 806, places: PLACES, degree: DEGREE,
      previousAcceptanceColumns: 0, cacheChanged: true },
    final: {
      relationState: cv.relation_state.toArray(),
      hnfState: live.resident.state,
      h: live.resident.h, dep: live.resident.dep, b: live.resident.b,
      c: live.resident.c, perm: live.resident.perm,
    },
    // Only detached certification needs the raw principal/relation owners.
    timingExclusions: ["raw relation replay", "owner hashing", "publication"],
  };
}

async function prepareResident(preparedEnvelope) {
  const rootBuilt = await compileKernel({ sourcePath: initial.SOURCE });
  const gateKernels = await gate.warmPreparedGateC();
  // Compile sequentially: several roots share very large dependency graphs,
  // and concurrent node-gyp jobs needlessly multiply peak memory.
  const classAssembly = await compile("quartic_direct_composition.py",
    "pari_quartic_direct_class_group_assembly");
  const postCatalog = await compile("prime_degree_catalog.py", "pari_prime_degree_catalog");
  const postTerminal = await compile("row14_post806_terminal.py",
    "pari_row14_post806_terminal");
  const selection = await compile("unit_lattice_selection.py",
    "pari_unit_lattice_selection");
  const integerReduction = await compile("unit_lattice_reduction.py",
    "pari_unit_integer_lattice_rank_two");
  const realReductionKernel = await compile("unit_lattice_reduction.py",
    "pari_unit_real_lattice_rank_two");
  const compose = await compile("unit_lattice_reduction.py",
    "pari_unit_compose_rank_two");
  const logs = await compile("log_matrix_transform.py", "pari_log_matrix_transform");
  const clean = await compile("field3_mixed_unit_suffix.py",
    "pari_cleanarchunit_mixed_quartic");
  const prepare = await compile("field3_mixed_unit_suffix.py",
    "pari_field3_prepare_getfu");
  const getfu = await compile("getfu_mixed_quartic.py", "pari_getfu_mixed_quartic");
  return { preparedEnvelope, rootBuilt, gateKernels, classAssembly, postCatalog, postTerminal,
    units: { selection, integer: integerReduction, real: realReductionKernel,
      compose, logs, clean, prepare, getfu } };
}

async function runResident(resident) {
  const payload = { outputDirectory: "unused", prepared: resident.preparedEnvelope.data,
    preparedAuthoritySha256: resident.preparedEnvelope.authoritySha256 };
  const started = process.hrtime.bigint();
  let previous = started;
  const stages = {};
  let exclusiveStarted;
  const exclusive = new ExclusiveStageTimer(() => {
    const now = process.hrtime.bigint();
    if (exclusiveStarted === undefined) exclusiveStarted = now;
    return now;
  });
  exclusive.begin();
  const mark = name => {
    const now = process.hrtime.bigint();
    stages[name] = String(now - previous); previous = now;
  };
  const rootResult = await initial.computePreparedInitialRoot(payload,
    { built: resident.rootBuilt,
      beforeNative: () => exclusive.switchStage("relation-retry"),
      afterNative: () => exclusive.switchStage("unattributed-remainder") });
  mark("initialRootAndLiveState");
  const root = rootResult.owner;
  const metadata = complete.synthesizeMetadata(resident.preparedEnvelope, root,
    { verifyDigest: false });
  mark("factorMetadataProjection");
  const live = await gate.runPreparedGateC(resident.preparedEnvelope, root,
    { kernels: resident.gateKernels,
      switchStage: stage => exclusive.switchStage(stage) });
  assert.equal(live.executionBoundary.compilationInsideRun, false);
  assert.equal(live.executionBoundary.residentHandleCount, 4);
  mark("relationCollectionAndHnf");
  exclusive.switchStage("unattributed-remainder");
  const accepted = liveAcceptedState(resident.preparedEnvelope, root, live, metadata);
  mark("acceptedLiveStateProjection");
  const post806 = await post.runRow14Post806TerminalFromOwners(accepted, metadata,
    { verifyDigests: false, catalog: resident.postCatalog,
      terminal: resident.postTerminal });
  mark("analyticAcceptanceAndTerminalLattice");
  // The post-806 root mixes regulator acceptance and Smith output.  Until that
  // native root has an audited internal cut, conservatively leave all of it in
  // the explicit residual rather than assigning a favorable semantic stage.
  exclusive.switchStage("unit-regulator");
  const units = runUnitSuffix(resident.units, accepted, post806, metadata.metadata.prepared);
  mark("unitLatticeAndGetfu");
  // Class assembly begins with a full Smith transform before constructing the
  // final generators.  Its one native root therefore has no exclusive
  // honesty/generator ownership and remains residual until an internal cut is
  // available.
  exclusive.switchStage("unattributed-remainder");
  const klass = runClassAssembly(resident.classAssembly, accepted, metadata.metadata);
  mark("classGroupGen");
  const exclusiveStageTiming = exclusive.finish();
  assert.deepEqual(Object.keys(exclusiveStageTiming.stageTotalsNanoseconds), ALL_STAGES);
  assert.equal(Object.values(exclusiveStageTiming.stageTotalsNanoseconds)
    .reduce((sum, value) => sum + BigInt(value), 0n),
  BigInt(exclusiveStageTiming.rootNanoseconds));
  // `mark` captured the first instant after the final mathematical output.
  // Do not include result-object construction or resource inspection.
  const kernelNanoseconds = String(previous - started);
  const exclusiveRootBoundary = bindExclusiveRoot(
    started, previous, exclusiveStarted, exclusiveStageTiming);
  return { kernelNanoseconds, root, live, accepted, post806, units, klass,
    executionBoundary: live.executionBoundary,
    stageNanoseconds: stages, exclusiveStageTiming, exclusiveRootBoundary,
    maxRssKiB: process.resourceUsage().maxRSS };
}

module.exports = { bindExclusiveRoot, prepareResident, runResident, runUnitSuffix };
