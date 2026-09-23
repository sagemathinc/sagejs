"use strict";

// sagejs-test-tier: unit
// sagejs-test-portable: true

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const runner = require("../bench/pari-class-group-port/run_class_unit_qualification.cjs");
const reporter = require("../bench/pari-class-group-port/report_class_unit_qualification.cjs");

function clone(value) {
  return structuredClone(value);
}

function receiptsFor(manifestData, completedCount, slowdown, referenceSeconds = 1.1,
  attributedGapFraction = 1) {
  return manifestData.manifest.fields.map((field, index) => runner.syntheticReceipt(field, {
    slowdown,
    status: index < completedCount ? "complete_matched" : "unsupported_branch",
    referenceSecondsPerCall: referenceSeconds,
    attributedGapFraction,
    manifestData,
  }));
}

test("frozen qualification manifest derives exact split without changing the panel", () => {
  const data = runner.validateManifest();
  assert.equal(data.panelSha256,
    "7c6515240940db971cff3bc28819f9e6547adae9305643b0f6274eeafe6ec3a5");
  assert.equal(data.manifest.fields.filter(field => field.role === "sentinel").length, 4);
  assert.equal(data.manifest.fields.filter(field => field.role === "additional-development").length, 12);
  assert.equal(data.manifest.fields.filter(field => field.role === "final-reserve").length, 8);
  assert.equal(data.manifest.developmentExecutionEnabled, true);
  assert.equal(data.manifest.executionEnabled, false);
  assert.equal(data.manifest.reserveOpeningEnabled, false);
  const plan = runner.developmentPlan(data.manifest);
  assert.equal(plan.fields.length, 16);
  assert.equal(plan.executable, true);
  assert.equal(plan.mode, "untimed-sage-correctness-only");
  assert.equal(plan.available.length, 16);
  assert.deepEqual(plan.unavailable, []);
  assert.equal(plan.qualifiedTiming, false);
  assert.equal(plan.freshPreparedExecution, false);
  assert.doesNotThrow(() => runner.assertDevelopmentFields(plan.fields));
  assert.throws(() => runner.assertDevelopmentFields(data.manifest.fields), /reserve field/);
});

test("development dispatch rejects reserves before loading drivers", async () => {
  const data = runner.validateManifest();
  let loads = 0;
  const descriptor = panelIndex => ({
    schema: runner.DEVELOPMENT_DESCRIPTOR_SCHEMA,
    panelIndex,
    driverModule: "explicit-driver.cjs",
    driverExport: "invokeDevelopmentRoot",
    input: { callerSuppliedArtifact: "/not-opened/by-this-test" },
  });
  const options = { manifestData: data, loadModule() { loads += 1; return {}; } };
  await assert.rejects(runner.executeDevelopmentDescriptor(descriptor(2), options),
    /reserve field.*remains sealed/);
  assert.equal(loads, 0);
});

test("diagnostic and final schedules are fixed and label implementations permanently", () => {
  assert.deepEqual(runner.stageDiagnosticSchedule(), ["AB", "BA", "AB", "BA", "AB", "BA", "AB"]);
  assert.deepEqual(runner.finalQualificationSchedule(), [
    "ABBA", "BAAB", "ABBA", "BAAB", "ABBA", "BAAB",
    "ABBA", "BAAB", "ABBA", "BAAB", "ABBA",
  ]);
  assert.equal(runner.implementationForLabel("A"), "sagejs");
  assert.equal(runner.implementationForLabel("B"), "pari");
  assert.throws(() => runner.stageDiagnosticSchedule(6));
  assert.throws(() => runner.finalQualificationSchedule(10));
});

test("timing lock command holds the global lock around a child runner", () => {
  assert.deepEqual(runner.timingLockCommand(["--future-execute", "case.json"]), {
    command: "/usr/bin/flock",
    args: [
      "--nonblock", "--exclusive", "/tmp/sagejs-opt-timing.lock",
      process.execPath,
      path.resolve(__dirname, "../bench/pari-class-group-port/run_class_unit_qualification.cjs"),
      "--lock-held", "--future-execute", "case.json",
    ],
    ownerPath: "/tmp/sagejs-opt-timing.lock.owner.json",
  });
});

test("schema and semantic validation reject changed schedules, work, host, and subsecond arms", () => {
  const data = runner.validateManifest();
  const receipt = runner.syntheticReceipt(data.manifest.fields[0], { manifestData: data });
  assert.doesNotThrow(() => runner.validateReceipt(receipt, { manifestData: data }));

  const order = clone(receipt);
  order.blocks[0].order = "BAAB";
  assert.throws(() => runner.validateReceipt(order, { manifestData: data }), /Expected values to be strictly equal/);

  const work = clone(receipt);
  work.blocks[1].arms[0].workDigest = "0".repeat(64);
  assert.throws(() => runner.validateReceipt(work, { manifestData: data }), /work digest|workDigest differs/);

  const host = clone(receipt);
  host.host.affinity = "2-3";
  assert.throws(() => runner.validateReceipt(host, { manifestData: data }), /affinity|exactly one requested CPU/);

  const short = clone(receipt);
  short.blocks[0].arms[0].wallNanoseconds = "999999999";
  assert.throws(() => runner.validateReceipt(short, { manifestData: data }), /exceed one second/);

  const favorableFailure = runner.syntheticReceipt(data.manifest.fields[1], {
    status: "unsupported_branch", manifestData: data,
  });
  favorableFailure.summary.fieldSlowdown = 0.1;
  assert.throws(() => runner.validateReceipt(favorableFailure, { manifestData: data }));

  const timeout = clone(receipt);
  timeout.blocks = [{ ...timeout.blocks[0], arms: [{
    ...timeout.blocks[0].arms[0],
    wallNanoseconds: "500000000",
    threadCpuNanoseconds: "1000000",
    exitStatus: null,
    timeout: true,
    outputDigest: null,
    replayDigest: null,
    rngDigest: null,
    workDigest: null,
  }] }];
  timeout.summary = {
    completionStatus: "timeout",
    fieldSlowdown: null,
    referenceSecondsPerCall: null,
    attributedGapFraction: 1,
    firstDivergence: "relation-retry timeout",
    failureClass: 9,
    failureDetail: "synthetic timeout",
  };
  assert.doesNotThrow(() => runner.validateReceipt(timeout, { manifestData: data }));
});

test("append-only journal refuses replacement and reconstructs one validated receipt", () => {
  const data = runner.validateManifest();
  const receipt = runner.syntheticReceipt(data.manifest.fields[0], { manifestData: data });
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-class-unit-journal-"));
  const journal = path.join(directory, "receipt.jsonl");
  const { blocks, summary, ...declaration } = receipt;
  declaration.lock = { ...declaration.lock, releasedAt: null };
  runner.createReceiptJournal(journal, declaration);
  assert.throws(() => runner.createReceiptJournal(journal, declaration), error => error.code === "EEXIST");
  for (const block of blocks) runner.appendReceiptBlock(journal, block);
  runner.finalizeReceiptJournal(journal, summary, receipt.lock.releasedAt);
  const rebuilt = runner.readReceiptJournal(journal, { manifestData: data });
  assert.deepEqual(rebuilt, receipt);
  assert.equal(fs.readFileSync(journal, "utf8").trim().split("\n").length, 13);
});

test("reporter computes immutable thresholds but does not promote loose receipts", () => {
  const data = runner.validateManifest();

  const options = { manifestData: data, requireQualified: false };
  const a = reporter.aggregateReceipts(receiptsFor(data, 24, 1.5), options);
  assert.equal(a.thresholdOutcome, "A");
  assert.equal(a.outcome, "D");
  assert.equal(a.qualificationDecisionEligible, false);
  assert.equal(a.completedMatched, 24);
  assert.equal(a.completionRate, 1);
  assert.equal(a.geometricMeanSlowdown, 1.5);
  assert.equal(a.p95Slowdown, 1.5);

  const b = reporter.aggregateReceipts(receiptsFor(data, 16, 2.5), options);
  assert.equal(b.thresholdOutcome, "B");
  assert.equal(b.outcome, "D");
  assert.equal(b.completedMatched, 16);
  assert.equal(b.failureCounts.unsupported_branch, 8);
  assert.equal(b.timingPopulation, 16);
  assert.equal(b.population, 24);

  const c = reporter.determineThresholdOutcome({
    completed: 1,
    total: 24,
    geometricMeanSlowdown: 4,
    p95Slowdown: 4,
    rankTwoStrata: new Set(["real-cubic"]),
    secondsScaleCount: 1,
    attributedGapFraction: 0.8,
  });
  assert.equal(c, "C");

  const d = reporter.aggregateReceipts(receiptsFor(data, 0, 4, 1.1, 0), options);
  assert.equal(d.outcome, "D");
  assert.equal(d.thresholdOutcome, "D");
  assert.equal(d.geometricMeanSlowdown, null);
  assert.equal(d.p95Slowdown, null);
  assert.equal(d.completionRate, 0);
});

test("full report rejects duplicates, omissions, and nonqualified evidence on request", () => {
  const data = runner.validateManifest();
  const all = receiptsFor(data, 24, 1.5);
  assert.throws(() => reporter.aggregateReceipts(all.slice(0, 23), {
    manifestData: data, requireQualified: false,
  }),
    /exactly 24/);
  assert.throws(() => reporter.aggregateReceipts([...all.slice(0, 23), all[0]], {
    manifestData: data, requireQualified: false,
  }),
    /duplicate/);
  assert.throws(() => reporter.aggregateReceipts(all, {
    manifestData: data,
    requireQualified: true,
  }), /false/);
  const partial = reporter.aggregateReceipts(all.slice(0, 2), {
    manifestData: data,
    requireFullPopulation: false,
    requireQualified: false,
  });
  assert.equal(partial.received, 2);
  assert.equal(partial.population, 24);
});
