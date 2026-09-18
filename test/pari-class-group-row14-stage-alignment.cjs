"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const timing = require(path.join(ROOT,
  "bench/pari-class-group-port/h1_exclusive_stage_timing.cjs"));
const derivative = require(path.join(ROOT,
  "bench/pari-class-group-port/pari_stage_clock_derivative.cjs"));
const instrumenter = require(path.join(ROOT,
  "bench/pari-class-group-port/pari-stage-clock/instrument-buch2.cjs"));
const derivativeRunner = require(path.join(ROOT,
  "bench/pari-class-group-port/pari-stage-clock/run-derivative.cjs"));
const initialRoot = require(path.join(ROOT,
  "bench/pari-class-group-port/check_row14_prepared_initial_root.cjs"));
const gate = require(path.join(ROOT,
  "bench/pari-class-group-port/row14_prepared_gate_c_host.cjs"));
const matchedClock = require(path.join(ROOT,
  "bench/pari-class-group-port/row14_matched_kernel_clock_host.cjs"));

function source(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

test("initial-root callbacks bracket only the native call", () => {
  const events = [];
  const ticks = [11n, 29n];
  const invocation = initialRoot.invokePreparedInitialNative(
    { gmp: (...args) => { events.push(["gmp", ...args]); return 42n; } },
    ["owner-a", "owner-b"],
    {
      beforeNative: () => events.push(["before"]),
      afterNative: () => events.push(["after"]),
      clock: () => { events.push(["clock"]); return ticks.shift(); },
    },
  );
  assert.deepEqual(invocation, { count: 42n, elapsedNs: 18n });
  assert.deepEqual(events, [
    ["before"], ["clock"], ["gmp", "owner-a", "owner-b"], ["clock"], ["after"],
  ]);
});

test("initial-root after callback runs when the native call throws", () => {
  const events = [];
  const failure = new Error("native failure");
  assert.throws(() => initialRoot.invokePreparedInitialNative(
    { gmp: () => { events.push("gmp"); throw failure; } }, [],
    {
      beforeNative: () => events.push("before"),
      afterNative: () => events.push("after"),
      clock: () => { events.push("clock"); return 0n; },
    },
  ), error => error === failure);
  assert.deepEqual(events, ["before", "clock", "gmp", "clock", "after"]);
  assert.throws(() => initialRoot.invokePreparedInitialNative({ gmp() {} }, [], {
    beforeNative: 1,
  }), /beforeNative must be callable/);
});

test("every Gate-C native stage restores residual on success and exception", () => {
  const events = [];
  const switchStage = stage => events.push(stage);
  assert.equal(gate.runExclusiveNativeStage(switchStage, "relation-retry", () => 7), 7);
  assert.deepEqual(events, ["relation-retry", "unattributed-remainder"]);
  events.length = 0;
  const failure = new Error("native failure");
  assert.throws(() => gate.runExclusiveNativeStage(
    switchStage, "sparse-hnf-snf-transform", () => { throw failure; }),
  error => error === failure);
  assert.deepEqual(events, ["sparse-hnf-snf-transform", "unattributed-remainder"]);
});

test("exclusive root documents its few-read delta from the legacy kernel clock", () => {
  const boundary = matchedClock.bindExclusiveRoot(100n, 200n, 103n, {
    rootNanoseconds: "102",
  });
  assert.deepEqual(boundary, {
    relationship: "exclusive = kernel - startOffset + endOffset",
    startOffsetNanoseconds: "3",
    endOffsetNanoseconds: "5",
  });
  assert.throws(() => matchedClock.bindExclusiveRoot(100n, 200n, 103n, {
    rootNanoseconds: "96",
  }), /ended before kernel clock/);
});

test("row 14 Gate C exposes source-aligned relation and HNF switches", () => {
  const gateSource = source("bench/pari-class-group-port/row14_prepared_gate_c_host.cjs");
  assert.match(gateSource,
    /runExclusiveNativeStage\(switchStage, "relation-retry", \(\) =>\s*timed\(profile, "initial\.collector"/);
  assert.match(gateSource,
    /runExclusiveNativeStage\(switchStage, "sparse-hnf-snf-transform", \(\) =>\s*timed\(profile, "initial\.hnfspec"/);
  const loop = gateSource.indexOf("while (checkpointIndex < expected.length)");
  const next = gateSource.indexOf(
    'runExclusiveNativeStage(switchStage, "relation-retry"', loop);
  const controlRecord = gateSource.indexOf("control-and-setup", next);
  const controlProjection = gateSource.indexOf("Array.from(control)", controlRecord);
  const collector = gateSource.indexOf(
    'runExclusiveNativeStage(switchStage, "relation-retry"', controlProjection);
  const resultProjection = gateSource.indexOf("cv.relation_state.toArray()", collector);
  const hnfadd = gateSource.indexOf(
    'runExclusiveNativeStage(switchStage, "sparse-hnf-snf-transform"', resultProjection);
  assert(loop >= 0 && loop < next && next < controlRecord && controlRecord < controlProjection &&
    controlProjection < collector && collector < resultProjection && resultProjection < hnfadd);
  assert.match(gateSource,
    /exclusive Gate-C stage timing requires precompiled resident kernels/);
});

test("row 14 resident clock leaves both mixed native roots residual", () => {
  const host = source("bench/pari-class-group-port/row14_matched_kernel_clock_host.cjs");
  const post = host.indexOf("runRow14Post806TerminalFromOwners");
  const unit = host.indexOf('exclusive.switchStage("unit-regulator")', post);
  const residual = host.indexOf('exclusive.switchStage("unattributed-remainder")', unit);
  const klass = host.indexOf("runClassAssembly", residual);
  assert(post >= 0 && unit > post && residual > unit && klass > residual);
  assert.doesNotMatch(host.slice(post, unit), /exclusive\.switchStage\("unit-regulator"\)/);
  assert.match(host.slice(post, unit), /conservatively leave all of it in[\s\S]*explicit residual/);
  assert.doesNotMatch(host.slice(unit, klass), /honesty-generators-final/);
  assert.match(host.slice(unit, klass), /full Smith transform[\s\S]*remains residual/);
});

test("exclusive row 14 segments conserve the root and mutations fail", () => {
  let now = 0n;
  const timer = new timing.ExclusiveStageTimer(() => (now += 10n));
  timer.begin();
  for (const stage of timing.NAMED_STAGES) timer.switchStage(stage);
  timer.switchStage(timing.RESIDUAL_STAGE);
  const measured = timer.finish();
  const arm = {
    ...measured,
    implementation: "sagejs",
    label: "A",
    repetitions: "1",
    timerReadOverheadNanoseconds: "0",
  };
  timing.validateArm(arm);
  const bad = structuredClone(arm);
  bad.stageTotalsNanoseconds["relation-retry"] = String(
    BigInt(bad.stageTotalsNanoseconds["relation-retry"]) + 1n,
  );
  assert.throws(() => timing.validateArm(bad), /does not match segments/);
});

test("the authenticated PARI derivative has a bounded row 14 variant", () => {
  const configuration = derivative.VARIANTS.row14;
  assert(configuration);
  assert.equal(path.basename(configuration.authorityDriver),
    "row14_pari_prepared_timing_adapter.c");
  assert.deepEqual(configuration.compileDefinitions, [
    '-DSAGEJS_STAGE_AUTHORITY_ADAPTER="../row14_pari_prepared_timing_adapter.c"',
    '-DSAGEJS_STAGE_POLYNOMIAL="x^4-200000002*x-200000002"',
    "-DSAGEJS_STAGE_STACK_BYTES=1200000000",
    "-DSAGEJS_STAGE_MT_NBTHREADS=1",
  ]);
  assert.deepEqual(derivative.VARIANTS.h1.compileDefinitions, []);
  const pristineRoot = path.resolve(
    process.env.SAGEJS_PARI_ROOT || "/home/user/upstream/pari-2.17.4",
  );
  const pristine = fs.readFileSync(
    path.join(pristineRoot, "src/basemath/buch2.c"), "utf8");
  assert.equal(instrumenter.sha256(pristine), instrumenter.PRISTINE_SHA256);
  const instrumented = instrumenter.instrument(pristine);
  for (const marker of [
    "SAGEJS_BUCHALL_RELATION_RETRY",
    "SAGEJS_BUCHALL_HNF_SNF_TRANSFORM",
    "SAGEJS_BUCHALL_UNIT_REGULATOR",
    "SAGEJS_BUCHALL_HONESTY_GENERATORS_FINAL",
    "SAGEJS_BUCHALL_UNATTRIBUTED_REMAINDER",
  ]) assert(instrumented.includes(marker), `${marker} missing`);
  const driver = source(
    "bench/pari-class-group-port/pari-stage-clock/pari_stage_clock_driver.c");
  assert.match(driver, /#include SAGEJS_STAGE_AUTHORITY_ADAPTER/);
  assert.match(driver, /gp_read_str\(SAGEJS_STAGE_POLYNOMIAL\)/);
  assert.match(driver,
    /#ifdef SAGEJS_STAGE_MT_NBTHREADS\s+pari_mt_nbthreads = SAGEJS_STAGE_MT_NBTHREADS;\s+#endif/);
});

test("row 14 active/inactive identity excludes clocks but not mathematics", () => {
  const record = {
    schema: "sagejs.pari-class-group/row14-pari-prepared-sample-v1",
    kernelNanoseconds: "10",
    cpuNanoseconds: "9",
    processMaxRssKiB: "8",
    result: { value: "result" },
    work: { value: "work" },
    rng: { value: "rng" },
  };
  const comparable = derivativeRunner.comparableAuthorityRecord(record, "row14");
  const changedClocks = structuredClone(record);
  changedClocks.kernelNanoseconds = "99";
  changedClocks.cpuNanoseconds = "98";
  changedClocks.processMaxRssKiB = "97";
  assert.deepEqual(
    derivativeRunner.comparableAuthorityRecord(changedClocks, "row14"), comparable);
  for (const key of ["result", "work", "rng"]) {
    const changed = structuredClone(record);
    changed[key].value = "changed";
    assert.notDeepEqual(
      derivativeRunner.comparableAuthorityRecord(changed, "row14"), comparable);
  }
  assert.throws(() => derivativeRunner.comparableAuthorityRecord(record, "unknown"),
    /unknown derivative variant/);
});
