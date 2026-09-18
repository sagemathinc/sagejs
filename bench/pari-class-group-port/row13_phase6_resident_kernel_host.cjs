"use strict";

// One resident, serialization-free prepared-field kernel for development row
// 13.  Authentication, compilation, replay and publication belong to the
// caller; the inclusive clock below contains only the mathematical graph.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
const authentication = require("./prepared_nf_authentication.cjs");
const initial = require("./row13_prepared_initial_owner.cjs");
const gate = require("./row13_prepared_gate_c_host.cjs");
const complete = require("./row13_terminal_transaction_host.cjs");
const post = require("./row13_post1006_terminal_host.cjs");
const { runUnitSuffix } = require("./row14_matched_kernel_clock_host.cjs");

const EXPECTED_AUTHORITY =
  "21e60a11663b021554ca5afcb249e5ca5e7c4b28641ed7e50ed281a7d30254b9";
const FIELD_ID =
  "generated-sha256-353468f1887e96f5a2f66e3121564636ed8cdbd75bde6571609627bbe8586e33";
const ROWS = 999, DEGREE = 4, PLACES = 3, COLUMNS = 1006;

function signature(source, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = fs.readFileSync(source, "utf8")
    .match(new RegExp(`def ${escaped}\\(([\\s\\S]*?)\\n\\)`));
  assert(match, `missing native signature ${name}`);
  return match[1].trim().split("\n")
    .map(line => line.trim().replace(/,$/, "").split(": "));
}

async function compile(sourceName, exportName, cacheRoot = undefined) {
  const source = path.join(__dirname, sourceName);
  const built = await compileKernel({ sourcePath: source, cacheRoot });
  const fn = require(built.modulePath)[exportName];
  assert(fn?.nativeAvailable, `${exportName} is not native`);
  return { built, fn, names: signature(source, exportName) };
}

async function prepareResident(prepared) {
  const authority = authentication.authenticatePreparedNf(prepared);
  assert.equal(authority.sha256, EXPECTED_AUTHORITY);
  const preparedEnvelope = { authoritySha256: authority.sha256,
    data: structuredClone(prepared) };
  const cacheRoot = process.env.SAGEJS_PHASE6_NATIVE_CACHE_ROOT || undefined;
  const rootBuilt = await compileKernel({ sourcePath: initial.SOURCE,
    cacheRoot });
  const gateKernels = await gate.warmPreparedGateC({ cacheRoot });
  const postCatalog = await compile("prime_degree_catalog.py",
    "pari_prime_degree_catalog", cacheRoot);
  const postTerminal = await compile("row14_post806_terminal.py",
    "pari_row14_post806_terminal", cacheRoot);
  const transformAuth = await compile("row13_phase6_transform_auth.py",
    "pari_row13_phase6_transform_auth", cacheRoot);
  const units = {
    selection: await compile("unit_lattice_selection.py",
      "pari_unit_lattice_selection", cacheRoot),
    integer: await compile("unit_lattice_reduction.py",
      "pari_unit_integer_lattice_rank_two", cacheRoot),
    real: await compile("unit_lattice_reduction.py",
      "pari_unit_real_lattice_rank_two", cacheRoot),
    compose: await compile("unit_lattice_reduction.py",
      "pari_unit_compose_rank_two", cacheRoot),
    logs: await compile("log_matrix_transform.py", "pari_log_matrix_transform", cacheRoot),
    clean: await compile("field3_mixed_unit_suffix.py",
      "pari_cleanarchunit_mixed_quartic", cacheRoot),
    prepare: await compile("field3_mixed_unit_suffix.py",
      "pari_field3_prepare_getfu", cacheRoot),
    getfu: await compile("getfu_mixed_quartic.py", "pari_getfu_mixed_quartic", cacheRoot),
  };
  return Object.freeze({ preparedEnvelope, rootBuilt, gateKernels,
    postCatalog, postTerminal, transformAuth, units });
}

function acceptedState(preparedEnvelope, root, live, metadata) {
  return {
    schema: "sagejs.pari-class-group/row13-accepted-relation-owner-v1",
    field: { polynomial: preparedEnvelope.data.prep_polynomial,
      degree: DEGREE, signature: [2, 1],
      precision: Number(preparedEnvelope.data.precision) },
    ancestry: { preparedAuthoritySha256: preparedEnvelope.authoritySha256,
      preparedRootSha256: complete.semanticRootAuthority(root).sha256,
      factorMetadataSha256: metadata.metadataSha256 },
    acceptanceBoundary: { rows: ROWS, hRows: 1, bColumns: 998,
      totalColumns: COLUMNS, places: PLACES, degree: DEGREE,
      previousAcceptanceColumns: 0, cacheChanged: true },
    final: { hnfState: live.resident.state.map(Number),
      h: live.resident.h.map(String), dep: live.resident.dep.map(String),
      b: live.resident.b.map(String), c: live.resident.c.map(String),
      perm: live.resident.perm.map(String) },
  };
}

function authenticateTransforms(kernel, live) {
  const coordinates = gate.terminalCoordinates(live.resident.state,
    live.resident.perm);
  assert.deepEqual(live.terminalCoordinates, coordinates);
  const transforms = [...live.rawToUnitKernel, ...live.rawToPresentation]
    .map(BigInt);
  const selectedColumns = coordinates.zeroColumns.length +
    coordinates.presentationColumns.length;
  assert.equal(transforms.length, selectedColumns * COLUMNS);
  const products = kernel.fn.createIntegerBuffer(selectedColumns * ROWS, 64);
  const transformOwner = kernel.fn.createIntegerBuffer(transforms.length, 64,
    transforms);
  assert.equal(kernel.fn.gmp(live.collectorValues.relation_records,
    BigInt(ROWS), BigInt(COLUMNS), transformOwner,
    BigInt(selectedColumns), products), 0n);
  const values = products.toArray();
  const unitCells = coordinates.zeroColumns.length * ROWS;
  for (let index = 0; index < unitCells; index += 1)
    assert.equal(values[index], 0n);
  assert.equal(coordinates.presentationColumns.length, 1);
  const classProduct = values.slice(unitCells, unitCells + ROWS);
  const expected = gate.publishedHColumn(live.resident, 0);
  assert.deepEqual(classProduct, expected,
    "row-13 live class transform does not reproduce the live H column");
  assert(coordinates.zeroColumns.length > 0);
  assert.notDeepEqual(values.slice(unitCells - ROWS, unitCells), expected,
    "row-13 swapped terminal kernel/presentation coordinate was accepted");
  return { activeFactorRow: coordinates.activeFactorRows[0],
    coordinates, products };
}

function classState(live, metadata, transformAuthentication) {
  const activeFactorRow = transformAuthentication.activeFactorRow;
  assert(activeFactorRow >= 0 && activeFactorRow < ROWS);
  const generatorIdeal = metadata.factor.packetIdeals.slice(
    16 * activeFactorRow, 16 * (activeFactorRow + 1));
  assert.equal(generatorIdeal.length, 16);
  assert.deepEqual(live.resident.h.map(String), ["2"]);
  return { classNumber: "2", invariantFactors: ["2"], activeFactorRow,
    generatorIdeals: [generatorIdeal.map(String)],
    rawToPresentation: live.rawToPresentation };
}

async function runResident(resident) {
  const started = process.hrtime.bigint();
  let previous = started;
  const stageNanoseconds = {};
  let unitNativeMathematicalCalls = 0;
  const mark = name => { const now = process.hrtime.bigint();
    stageNanoseconds[name] = String(now - previous); previous = now; };
  const rootResult = await initial.computePreparedInitialOwner({
    prepared: resident.preparedEnvelope.data,
    preparedAuthoritySha256: resident.preparedEnvelope.authoritySha256,
  }, { built: resident.rootBuilt });
  const root = rootResult.owner;
  mark("initialRootAndLiveState");
  const metadataReceipt = complete.synthesizeMetadata(
    resident.preparedEnvelope, root);
  mark("factorMetadataProjection");
  const live = await gate.runPreparedGateC(resident.preparedEnvelope, root,
    { kernels: resident.gateKernels });
  assert.equal(live.executionBoundary.compilationInsideRun, false);
  assert.equal(live.executionBoundary.residentHandleCount, 4);
  mark("relationCollectionHnfAndTransforms");
  const transformAuthentication = authenticateTransforms(
    resident.transformAuth, live);
  mark("exactTransformAuthentication");
  const accepted = acceptedState(resident.preparedEnvelope, root, live,
    metadataReceipt);
  mark("acceptedLiveStateProjection");
  const post1006 = await post.runRow13Post1006Terminal(accepted,
    metadataReceipt, { catalog: resident.postCatalog,
      terminal: resident.postTerminal });
  mark("analyticAcceptanceAndTerminalLattice");
  const countedUnits = Object.fromEntries(Object.entries(resident.units).map(
    ([name, kernel]) => [name, { ...kernel, fn: new Proxy(kernel.fn, {
      get(target, property, receiver) {
        if (property !== "gmp") return Reflect.get(target, property, receiver);
        return (...args) => { unitNativeMathematicalCalls += 1;
          return target.gmp(...args); };
      },
    }) }],
  ));
  const units = runUnitSuffix(countedUnits, accepted, post1006,
    metadataReceipt.metadata.prepared, 256, 32);
  mark("unitLatticeAndGetfu");
  const klass = classState(live, metadataReceipt.metadata,
    transformAuthentication);
  mark("classGroupGeneratorAssembly");
  assert.equal(unitNativeMathematicalCalls, 11,
    "row-13 unit suffix native invocation count changed");
  const nativeMathematicalCalls = rootResult.telemetry.nativeMathematicalCalls +
    live.executionBoundary.nativeMathematicalCalls + 1 +
    post1006.nativeMathematicalCalls + unitNativeMathematicalCalls;
  assert.equal(nativeMathematicalCalls, 43,
    "row-13 reviewed top-level native invocation count changed");
  const kernelNanoseconds = String(previous - started);
  return { schema: "sagejs.pari-class-group/row13-phase6-resident-sample-v1",
    kernelNanoseconds, stageNanoseconds, root, metadataReceipt, live, accepted,
    post1006, units, klass,
    projection: { schema:
      "sagejs.pari-class-group/row13-phase6-common-projection-v1",
      field: { id: FIELD_ID,
        polynomialAscending: resident.preparedEnvelope.data.prep_polynomial.map(String) },
      classGroup: { classNumber: klass.classNumber,
        invariantFactors: klass.invariantFactors,
        generatorIdeals: klass.generatorIdeals },
      unitGroup: { rank: "2", regulator: units.regulator.map(String),
        torsionOrder: "2", materialization: "not_given(LARGE)" },
      work: { degree: "4", relationRows: String(ROWS),
        relationColumns: String(COLUMNS) },
      completionMode: "flag-zero-class-and-unit-result" },
    executionBoundary: { residentProcess: true,
      compilationInsideClock: false, preparedAuthenticationInsideClock: false,
      subprocessesInsideClock: false, filesystemInsideClock: false,
      replayInsideClock: false, publicationInsideClock: false,
      nativeHandleCount: 18,
      nativeMathematicalCalls },
    maxRssKiB: process.resourceUsage().maxRSS };
}

module.exports = { EXPECTED_AUTHORITY, FIELD_ID, acceptedState,
  authenticateTransforms, classState, prepareResident, runResident };
