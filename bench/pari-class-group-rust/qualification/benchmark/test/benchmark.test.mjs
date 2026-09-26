import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import {
  alternatingSchedule,
  canonicalJson,
  runBenchmark,
  validateConfig,
} from "../benchmark-lib.mjs";

const adapter = path.resolve(import.meta.dirname, "fake-adapter.mjs");

async function schema(name) {
  return JSON.parse(await readFile(path.resolve(import.meta.dirname, "..", name), "utf8"));
}

const schemaAjv = new Ajv2020({ allErrors: true, strict: true });
schemaAjv.addFormat("date-time", {
  type: "string",
  validate(value) {
    return (
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
      !Number.isNaN(Date.parse(value))
    );
  },
});
const validateConfigSchema = schemaAjv.compile(await schema("config.schema.json"));
const validateReceiptSchema = schemaAjv.compile(await schema("receipt.schema.json"));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function config(mode = "ok") {
  const arm = (id) => ({
    id,
    implementation: `fake-${id}`,
    boundaryLabel: "prepared-field/class-group-complete-v1",
    command: [process.execPath, adapter, id, "{fieldId}", "{round}", mode],
    durationPointer: "/timing/nanoseconds",
    stageTimingsPointer: "/stages",
    peakRssKiBPointer: "/resources/peakRssKiB",
    resultProjection: {
      classNumber: "/answer/classNumber",
      invariantFactors: "/answer/invariantFactors",
    },
  });
  return {
    schema: "sagejs.rust-class-group/benchmark-config-v1",
    benchmarkId: `fake-${mode}`,
    boundary: {
      kind: "prepared-field",
      label: "prepared-field/class-group-complete-v1",
      includedWork: ["validated prepared field through retained class-group state"],
      excludedWork: ["field preparation"],
      proofMode: "test-proof-mode",
      outputPolicy: "class number and invariant factors",
    },
    schedule: "alternating-pairs-v1",
    warmupsPerArm: 1,
    samplesPerArm: 15,
    fields: [{ id: "cyclic" }],
    arms: [arm("a"), arm("b")],
  };
}

test("canonical JSON sorts object keys without changing arrays", () => {
  assert.equal(canonicalJson({ z: [2, 1], a: { y: "x", b: true } }), '{"a":{"b":true,"y":"x"},"z":[2,1]}');
});

test("validation rejects vague and mismatched boundaries", () => {
  const invalid = config();
  invalid.arms[1].boundaryLabel = "some-other-work";
  assert.throws(() => validateConfig(invalid), /does not exactly match/);
  const tooShort = config();
  tooShort.samplesPerArm = 14;
  assert.throws(() => validateConfig(tooShort), /at least 15/);
  const inconsistentProjection = config();
  inconsistentProjection.arms[1].resultProjection.order = "/answer/classNumber";
  assert.throws(() => validateConfig(inconsistentProjection), /same resultProjection names/);
});

test("schedule alternates which arm receives first position", () => {
  const schedule = alternatingSchedule(3);
  assert.deepEqual(schedule.map((item) => item.armIndex), [0, 1, 1, 0, 0, 1]);
});

test("runner retains raw samples and matching exact fingerprints", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sagejs-r0-benchmark-"));
  const result = await runBenchmark(config(), {
    root: directory,
    receiptPath: "receipt.json",
    evidenceDirectory: "evidence",
  });
  assert.equal(result.receipt.status, "passed");
  assert.equal(result.receipt.samples.length, 30);
  assert.equal(result.receipt.summary.cyclic.a.retainedSamples, 15);
  assert.equal(result.receipt.summary.cyclic.a.maximumPeakRssKiB, "1024");
  assert.deepEqual(result.receipt.samples[0].stageTimingsNanoseconds, {
    collection: "700",
    completion: "300",
  });
  assert.deepEqual(
    [...new Set(result.receipt.samples.map((sample) => sample.resultSha256))].length,
    1,
  );
  assert.deepEqual(result.receipt.samples.slice(0, 6).map((sample) => sample.armId), ["a", "b", "b", "a", "a", "b"]);
  const stored = JSON.parse(await readFile(path.join(directory, "receipt.json"), "utf8"));
  assert.equal(stored.samples[0].stdout.sha256.length, 64);
  assert.equal(stored.environment.git.statusSha256.length, 64);
  assert.equal(validateConfigSchema(config()), true, JSON.stringify(validateConfigSchema.errors));
  assert.equal(validateReceiptSchema(stored), true, JSON.stringify(validateReceiptSchema.errors));
});

test("strict schemas reject unknown and counterfeit benchmark evidence", () => {
  const validConfig = config();
  assert.equal(validateConfigSchema(validConfig), true, JSON.stringify(validateConfigSchema.errors));
  assert.equal(validateConfigSchema({ ...validConfig, qualificationPassed: true }), false);
  const configWithUnknownArmField = clone(validConfig);
  configWithUnknownArmField.arms[0].unverifiedTiming = "1";
  assert.equal(validateConfigSchema(configWithUnknownArmField), false);

  const sha256 = "a".repeat(64);
  const armSummary = {
    retainedSamples: 15,
    failedSamples: 0,
    medianAdapterNanoseconds: "100",
    medianWallNanoseconds: "200",
    exactResultFingerprints: [sha256],
    maximumPeakRssKiB: "1024",
  };
  const sample = {
    executionIndex: 0,
    fieldId: "cyclic",
    armId: "a",
    warmup: false,
    round: 0,
    positionInRound: 0,
    command: ["fake-adapter"],
    cwd: "/tmp/qualification",
    seed: "fixed-seed",
    wallNanoseconds: "200",
    process: {
      exitStatus: 0,
      signal: null,
      timedOut: false,
      spawnError: null,
    },
    stdout: { path: "evidence/a.stdout", sha256, bytes: 1 },
    stderr: { path: "evidence/a.stderr", sha256, bytes: 0 },
    status: "ok",
    adapterNanoseconds: "100",
    result: { classNumber: "1", invariantFactors: [] },
    resultCanonicalJson: '{"classNumber":"1","invariantFactors":[]}',
    resultSha256: sha256,
    outputSchema: "test/result-v1",
  };
  const validReceipt = {
    schema: "sagejs.rust-class-group/benchmark-receipt-v1",
    benchmarkId: "strict-fixture",
    configSha256: sha256,
    status: "passed",
    boundary: validConfig.boundary,
    schedule: {
      kind: "alternating-pairs-v1",
      warmupsPerArm: 1,
      samplesPerArm: 15,
    },
    environment: {
      capturedAt: "2026-09-20T00:00:00Z",
      node: { version: "v22.22.2", versions: { node: "22.22.2" } },
      host: {
        platform: "linux",
        architecture: "x64",
        osRelease: "test",
        osType: "Linux",
        cpuCount: 2,
        cpuModel: "test cpu",
        totalMemoryBytes: "1024",
      },
      environment: { RAYON_NUM_THREADS: null },
      git: { commit: "test-commit", statusSha256: sha256 },
      commands: [],
      armExecutableArtifacts: [
        { armId: "a", path: "/tmp/a", bytes: "1", sha256 },
        { armId: "b", path: "/tmp/b", bytes: "1", sha256 },
      ],
    },
    samples: [sample],
    failures: [],
    summary: {
      cyclic: {
        a: armSummary,
        b: armSummary,
        medianRatioArm0OverArm1: 1,
      },
    },
    completedAt: "2026-09-20T00:01:00Z",
  };
  assert.equal(validateReceiptSchema(validReceipt), true, JSON.stringify(validateReceiptSchema.errors));

  const receiptWithUnknownSampleField = clone(validReceipt);
  receiptWithUnknownSampleField.samples[0].qualified = true;
  assert.equal(validateReceiptSchema(receiptWithUnknownSampleField), false);
  const receiptWithForgedProcessStatus = clone(validReceipt);
  receiptWithForgedProcessStatus.samples[0].process.exitStatus = "zero";
  assert.equal(validateReceiptSchema(receiptWithForgedProcessStatus), false);
  const receiptWithUntypedSummary = clone(validReceipt);
  receiptWithUntypedSummary.summary.cyclic.a.retainedSamples = "15";
  assert.equal(validateReceiptSchema(receiptWithUntypedSummary), false);
  const passedReceiptWithFailure = clone(validReceipt);
  passedReceiptWithFailure.failures.push({
    kind: "exact-result-fingerprint-mismatch",
    fieldId: "cyclic",
    fingerprints: [sha256],
  });
  assert.equal(validateReceiptSchema(passedReceiptWithFailure), false);
  const runningReceiptWithSummary = clone(validReceipt);
  runningReceiptWithSummary.status = "running";
  delete runningReceiptWithSummary.completedAt;
  assert.equal(validateReceiptSchema(runningReceiptWithSummary), false);
});

test("runner writes a failed receipt and retains process evidence", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sagejs-r0-benchmark-failure-"));
  const result = await runBenchmark(config("fail"), {
    root: directory,
    receiptPath: "receipt.json",
    evidenceDirectory: "evidence",
  });
  assert.equal(result.receipt.status, "failed");
  const failure = result.receipt.failures.find((item) => item.process?.exitStatus === 17);
  assert.ok(failure);
  assert.match(await readFile(path.resolve(directory, failure.stderr.path), "utf8"), /intentional adapter failure/);
});

test("runner treats an exact-result mismatch as a qualification failure", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "sagejs-r0-benchmark-mismatch-"));
  const result = await runBenchmark(config("mismatch"), {
    root: directory,
    receiptPath: "receipt.json",
    evidenceDirectory: "evidence",
  });
  assert.equal(result.receipt.status, "failed");
  assert.ok(result.receipt.failures.some((item) => item.kind === "exact-result-fingerprint-mismatch"));
});
