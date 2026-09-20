import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  alternatingSchedule,
  canonicalJson,
  runBenchmark,
  validateConfig,
} from "../benchmark-lib.mjs";

const adapter = path.resolve(import.meta.dirname, "fake-adapter.mjs");

function config(mode = "ok") {
  const arm = (id) => ({
    id,
    implementation: `fake-${id}`,
    boundaryLabel: "prepared-field/class-group-complete-v1",
    command: [process.execPath, adapter, id, "{fieldId}", "{round}", mode],
    durationPointer: "/timing/nanoseconds",
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
  assert.deepEqual(
    [...new Set(result.receipt.samples.map((sample) => sample.resultSha256))].length,
    1,
  );
  assert.deepEqual(result.receipt.samples.slice(0, 6).map((sample) => sample.armId), ["a", "b", "b", "a", "a", "b"]);
  const stored = JSON.parse(await readFile(path.join(directory, "receipt.json"), "utf8"));
  assert.equal(stored.samples[0].stdout.sha256.length, 64);
  assert.equal(stored.environment.git.statusSha256.length, 64);
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
