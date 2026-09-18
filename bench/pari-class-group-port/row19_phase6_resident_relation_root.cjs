"use strict";

// Largest currently honest resident row-19 aggregate: authenticated prepared
// input is reduced to the factor-base/analytic prefixes before the clock; one
// connected call then owns the 423-column collection, first HNF, seven-column
// continuation, terminal HNF, CUP suffix, and analytic acceptance.  No owner
// is serialized, reread, or recomputed inside runResident().

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const authentication = require("./prepared_nf_authentication.cjs");
const firstHnf = require("./row19_first_hnf_host.cjs");
const terminal = require("./row19_terminal_continuation_host.cjs");

const ROOT = path.resolve(__dirname, "../..");
const PREPARED = new WeakSet();
const LIVE_RESULTS = new WeakMap();
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const hash = value => sha(Buffer.from(JSON.stringify(value)));
const SOURCES = Object.freeze([
  "collected_log_embeddings.py",
  "hnfspec_complete.py",
  "row14_next_pass.py",
  "row14_post806_terminal.py",
  "connected_hnfadd_acceptance.py",
  "row19_hnfadd_cup_suffix.py",
  "post_hnf_acceptance.py",
  "row19_phase6_resident_class_private.py",
  "row19_phase6_resident_kernel_private.py",
  "row19_phase6_resident_unit_private.py",
]);

function runPython(moduleName, prepared) {
  const program = `import runpy,sys\nsys.path.extend(['src/lib','src/baselib','.'])\n` +
    `runpy.run_module(${JSON.stringify(moduleName)},run_name='__main__')`;
  const run = spawnSync("python3", ["-c", program], { cwd: ROOT,
    input: JSON.stringify(prepared), encoding: "utf8", timeout: 600_000,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env,
      PYTHONPYCACHEPREFIX: "/scratch/sagejs-row19-phase6-resident/pycache" } });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}

async function prepareResident(preparedInput) {
  const authority = authentication.authenticatePreparedNf(preparedInput);
  const prepared = structuredClone(preparedInput);
  prepared.authoritySha256 = authority.sha256;
  const prefix = runPython(
    "bench.pari-class-group-port.row19_prepared_prefix_probe", prepared);
  const catalog = runPython(
    "bench.pari-class-group-port.row19_analytic_catalog", prepared);
  // Populate and authenticate native artifacts before any resident-root clock.
  // The underlying hosts still perform cheap cache lookup, which is disclosed
  // by this root and is not claimed as final qualification timing.
  const cacheRoot = process.env.SAGEJS_NATIVE_CACHE_DIR || null;
  let classFn = null, kernelFn = null, unitFn = null;
  for (const source of SOURCES) {
    const built = await compileKernel({ sourcePath: path.join(__dirname, source),
      ...(cacheRoot ? { cacheRoot } : {}) });
    if (source === "row19_phase6_resident_class_private.py") {
      classFn = require(built.modulePath).pari_row19_phase6_resident_class_private;
      assert(classFn?.nativeAvailable);
    } else if (source === "row19_phase6_resident_kernel_private.py") {
      kernelFn = require(built.modulePath).pari_row19_phase6_resident_kernel_private;
      assert(kernelFn?.nativeAvailable);
    } else if (source === "row19_phase6_resident_unit_private.py") {
      unitFn = require(built.modulePath).pari_row19_phase6_resident_unit_private;
      assert(unitFn?.nativeAvailable);
    }
  }
  const context = Object.freeze({ prepared, prefix, catalog,
    cacheRoot, classFn, kernelFn, unitFn,
    preparedAuthoritySha256: authority.sha256,
    prefixSha256: hash(prefix), analyticCatalogSha256: hash(catalog) });
  PREPARED.add(context);
  return context;
}

function projection(first, completed, classPresentation, unitKernel, compactUnit) {
  const exact = completed.exact;
  return {
    schema: "sagejs.pari-class-group/row19-phase6-resident-relation-root-v1",
    panelIndex: 19,
    fieldId: "3.1.1086061775432017340256300.107",
    firstHnf: {
      state: first.exact.state,
      resultSha256: hash(first.exact.result),
      ancestrySha256: hash(first.exact.ancestry),
    },
    terminal: {
      state: exact.state,
      attemptState: exact.attemptState,
      acceptanceState: exact.acceptanceState,
      classNumber: exact.classNumber,
      regulator: exact.regulator,
      relationState: exact.relationState,
      resultSha256: hash(exact.result),
      ancestrySha256: hash(exact.ancestry),
      relationIdentitySha256: hash(exact.relationIdentity),
    },
    classPresentation,
    unitKernel,
    compactUnit,
    nextControl: completed.nextControl,
    ownerBytesUpperBound: completed.ownerBytesUpperBound,
    nativeCoreBytes: completed.nativeCoreBytes,
    residentStages: Object.freeze([
      "first relation collection to 423 columns",
      "first HNF/CUP reduction",
      "next-pass control",
      "terminal relation collection to 430 columns",
      "terminal HNF append and CUP suffix",
      "analytic inverse hR and acceptance",
      "class-group Smith presentation",
      "reverse-HNF saturated raw relation kernel",
      "primitive compact exact unit and inverse",
    ]),
    serializedOwnersInsideRoot: 0,
    subprocessesInsideRoot: 0,
    duplicateFirstHnfExecutions: 0,
    correspondenceComplete: false,
    publicComplete: false,
    qualifiedTiming: false,
  };
}

async function runResident(context) {
  assert(PREPARED.has(context), "unbranded row-19 resident context");
  const options = context.cacheRoot ? { cacheRoot: context.cacheRoot } : {};
  const first = await firstHnf.runFirstHnf(context.prepared, context.prefix, options);
  const completed = await terminal.runTerminalContinuationLive(
    context.prepared, context.prefix, context.catalog, first, null, null, options);
  assert.equal(completed.firstOwnerSha256, null);
  assert(completed.ownerBytesUpperBound < 4 * 1024 ** 3);
  const classInvariants = context.classFn.createIntegerBuffer(9, 16);
  const classNumber = context.classFn.createIntegerBuffer(1, 16);
  const classState = context.classFn.createInt64Buffer(12);
  const classStatus = context.classFn.gmp({ factor_count: 424n,
    relation_count: 430n, class_dimension: 9n },
  completed.resident.terminal.result_h, classInvariants, classNumber, classState);
  assert.equal(classStatus, 0n);
  const classPresentation = Object.freeze({
    status: String(classStatus),
    invariants: classInvariants.toArray().map(String),
    classNumber: String(classNumber.toArray()[0]),
    state: Array.from(classState).map(Number),
  });
  const kernelWorkspace = context.kernelFn.createIntegerBuffer(70368, 16);
  const kernelOutput = context.kernelFn.createIntegerBuffer(2580, 16);
  const kernelState = context.kernelFn.createInt64Buffer(12);
  const fv = first.values, tv = completed.resident.terminal;
  const kernelStatus = context.kernelFn.gmp({ factor_count: 424n,
    first_columns: 423n, relation_count: 430n, kernel_rank: 6n },
  completed.resident.collector.relation_records,
  fv.transform, fv.hnf_transform, fv.full_h, fv.full_dep, fv.b, fv.diagonal,
  tv.transform, tv.full_h, tv.full_dep, tv.permuted_b, tv.diagonal, tv.perm,
  kernelWorkspace, kernelOutput, kernelState);
  assert.equal(kernelStatus, 0n);
  const kernelValues = kernelOutput.toArray().map(String);
  const unitKernel = Object.freeze({ status: String(kernelStatus),
    sha256: hash(kernelValues), state: Array.from(kernelState).map(Number),
    columns: 6, relationCount: 430 });
  const dependency = context.unitFn.createIntegerBuffer(430, 16);
  const inverse = context.unitFn.createIntegerBuffer(430, 16);
  const multiples = context.unitFn.createInt64Buffer(6);
  const unitState = context.unitFn.createInt64Buffer(10);
  const unitStatus = context.unitFn.gmp({ relation_count: 430n,
    kernel_rank: 6n, log_stride: 14n, degree: 3n }, kernelOutput,
  completed.resident.collector.log_embeddings, tv.accept_regulator,
  completed.resident.collector.generators, dependency, inverse, multiples, unitState);
  assert.equal(unitStatus, 0n);
  const dependencyValues = dependency.toArray().map(String);
  const inverseValues = inverse.toArray().map(String);
  const compactUnit = Object.freeze({ status: String(unitStatus),
    relationExponentsSha256: hash(dependencyValues),
    inverseRelationExponentsSha256: hash(inverseValues),
    regulatorMultiples: Array.from(multiples).map(Number),
    state: Array.from(unitState).map(Number), expanded: false });
  const result = Object.freeze({
    ...projection(first, completed, classPresentation, unitKernel, compactUnit),
    preparedAuthoritySha256: context.preparedAuthoritySha256,
    prefixSha256: context.prefixSha256,
    analyticCatalogSha256: context.analyticCatalogSha256,
  });
  LIVE_RESULTS.set(result, Object.freeze({ first, completed }));
  return result;
}

function liveOwners(result) {
  const owners = LIVE_RESULTS.get(result);
  assert(owners, "unbranded row-19 resident result");
  return owners;
}

module.exports = { SOURCES, liveOwners, prepareResident, runResident };
