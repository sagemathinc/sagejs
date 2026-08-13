"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  CODE_CACHE_REJECTION,
  formatReport,
  median,
  parseArguments,
  percentile,
  positiveOddInteger,
  summarize,
} = require("../scripts/release-startup-measure.cjs");

test("release startup samples use observed medians and conservative p90", () => {
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(percentile([9, 1, 5, 3, 7], 0.9), 9);
  assert.deepEqual(summarize([3.14159, 1, 2]), {
    median_ms: 2,
    p90_ms: 3.142,
    samples_ms: [3.142, 1, 2],
  });
});

test("release startup sample counts are positive and odd", () => {
  assert.equal(positiveOddInteger(undefined, "samples", 11), 11);
  assert.equal(positiveOddInteger("7", "samples", 11), 7);
  assert.throws(() => positiveOddInteger("0", "samples", 11), /positive odd/);
  assert.throws(() => positiveOddInteger("4", "samples", 11), /positive odd/);
});

test("release startup arguments infer Sage and Python executable modes", () => {
  assert.equal(
    parseArguments(["--executable", process.execPath]).mode,
    "sage",
  );
  assert.equal(
    parseArguments(["--executable", process.execPath, "--mode", "python"]).mode,
    "python",
  );
  assert.throws(
    () => parseArguments(["--executable", process.execPath, "--mode", "other"]),
    /sage or python/,
  );
  const historical = parseArguments([
    "--executable",
    process.execPath,
    "--no-capabilities",
    "--no-lazy",
  ]);
  assert.equal(historical.capabilities, false);
  assert.equal(historical.lazy, false);
});

test("release startup rejects every spelling of V8 code-cache rejection", () => {
  assert.match("Code cache data rejected.", CODE_CACHE_REJECTION);
  assert.match("code cache rejected", CODE_CACHE_REJECTION);
});

test("release startup human report keeps components distinct", () => {
  const report = {
    target: { platform: "linux", arch: "x64", mode: "sage" },
    components: {
      node_launch: { median_ms: 20, p90_ms: 25 },
      sea_entry: { median_ms: 50, p90_ms: 55 },
      repl_empty: { median_ms: 200, p90_ms: 210 },
      evaluate_power: { median_ms: 300, p90_ms: 320 },
    },
    derived: {
      sea_entry_over_node_ms: 30,
      compiler_repl_over_entry_ms: 150,
      parse_runtime_evaluate_over_empty_ms: 100,
    },
  };
  const text = formatReport(report);
  assert.match(text, /SEA entry over Node:\s+30\.0 ms/);
  assert.match(text, /compiler\/REPL over SEA entry:\s+150\.0 ms/);
  assert.match(text, /parser\/runtime\/eval over empty:\s+100\.0 ms/);
});
