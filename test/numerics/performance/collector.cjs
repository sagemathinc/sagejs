// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  parseArguments, parseRecord, callSource, failedBatch, closeSession,
} = require("../../../bench/numerics/performance/run.cjs");

test("performance collection requires explicit valid workloads and sampling options", () => {
  const defaults = parseArguments([]);
  assert.equal(defaults.warmups, 3);
  assert.equal(defaults.samples, 7);
  assert.deepEqual(defaults.levels, ["summary"]);
  assert.deepEqual(parseArguments(["--cases", "root-brent,fft-256"]).cases,
    ["root-brent", "fft-256"]);
  for (const args of [
    ["cases", "root-brent"], ["--cases"], ["--unknown", "1"],
    ["--cases", "root-brent,root-brent"], ["--cases", ""],
    ["--levels", "sometimes"], ["--runtime", "pretend-native"],
    ["--samples", "0"], ["--samples", "Infinity"], ["--samples", "1.5"],
    ["--timeout", "-1"], ["--warmups", "9007199254740992"],
  ]) assert.throws(() => parseArguments(args), undefined, JSON.stringify(args));
});

test("timeouts are censored batches, not fabricated per-call timing samples", () => {
  const error = new Error("time limit reached");
  error.name = "SageSessionTimeoutError";
  const failure = failedBatch(error, { case: "trace-256", timeout_ms: 600000 });
  assert.equal(failure.classification, "censored-batch");
  assert.equal(failure.timeout_ms, 600000);
  assert.equal(failure.median_ms, undefined);
  error.name = "Error";
  error.code = "ETIMEDOUT";
  assert.equal(failedBatch(error, {}).classification, "censored-batch");
  assert.equal(failedBatch(new Error("bad answer"), {}).classification, "failed-batch");
});

test("collector teardown observes a pending replacement worker's readiness", async () => {
  let rejectReady;
  const readiness = new Promise((resolve, reject) => { rejectReady = reject; });
  const calls = [];
  await closeSession({
    ready() { calls.push("ready"); return readiness; },
    async close() { calls.push("close"); rejectReady(new Error("session closed")); },
  });
  assert.deepEqual(calls, ["ready", "close"]);
});

test("performance records cannot silently select one of duplicate outputs", () => {
  const line = '__NUMERICAL_PERF__{"case":"root-brent"}';
  assert.deepEqual(parseRecord(`some ordinary output\n${line}\n`), { case: "root-brent" });
  assert.throws(() => parseRecord("no record"), /exactly one/);
  assert.throws(() => parseRecord(`${line}\n${line}`), /exactly one/);
  assert.throws(() => parseRecord("__NUMERICAL_PERF__invalid"), SyntaxError);
  assert.match(callSource("root-brent", "none", { warmups: 3, samples: 7 }),
    /measure\("root-brent", "none", 3, 7\)/);
});
