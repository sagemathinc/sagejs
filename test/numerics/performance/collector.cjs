// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  parseArguments, parseRecord, callSource,
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

test("performance records cannot silently select one of duplicate outputs", () => {
  const line = '__NUMERICAL_PERF__{"case":"root-brent"}';
  assert.deepEqual(parseRecord(`some ordinary output\n${line}\n`), { case: "root-brent" });
  assert.throws(() => parseRecord("no record"), /exactly one/);
  assert.throws(() => parseRecord(`${line}\n${line}`), /exactly one/);
  assert.throws(() => parseRecord("__NUMERICAL_PERF__invalid"), SyntaxError);
  assert.match(callSource("root-brent", "none", { warmups: 3, samples: 7 }),
    /measure\("root-brent", "none", 3, 7\)/);
});
