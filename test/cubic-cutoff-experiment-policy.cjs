// sagejs-test-tier: unit
"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {parseArguments, sourceAtCutoff} = require("../bench/class-unit-groups/diagnose-cubic-cutoff-build.cjs");

test("explicit analytic cutoff stays inside the existing theorem/resource envelope", () => {
  assert.equal(parseArguments([".", "."]).cutoff, 768);
  for (const cutoff of [69, 768, 996, 998, 1493]) {
    assert.equal(parseArguments([".", ".", "--cutoff", String(cutoff)]).cutoff, cutoff);
  }
  for (const cutoff of ["0", "68", "997", "1494", "9007199254740993", "NaN", "1e3", "0x300", "768.5", "-768", "768junk"]) {
    assert.throws(() => parseArguments([".", ".", "--cutoff", cutoff]));
  }
  for (const args of [[], ["."], [".", ".", "--cutoff"], [".", ".", "--pari", "768"], [".", ".", "--cutoff", "768", "extra"]]) {
    assert.throws(() => parseArguments(args));
  }
});

test("experimental source differs only in the initial threshold declaration", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../src/lib/sagejs/number_fields/cubic_class_number_native.py"), "utf8");
  for (const cutoff of [69, 768, 1493]) {
    const candidate = sourceAtCutoff(source, cutoff);
    assert.equal(candidate.replace(`_CUBIC_ANALYTIC_THRESHOLD = ${cutoff}`, "_CUBIC_ANALYTIC_THRESHOLD = 997"), source);
  }
  assert.throws(() => sourceAtCutoff(source.replace("_CUBIC_ANALYTIC_THRESHOLD = 997", "_CUBIC_ANALYTIC_THRESHOLD = 998"), 768));
  assert.throws(() => sourceAtCutoff(source.replace("_CUBIC_ANALYTIC_THRESHOLD = 997", "_CUBIC_ANALYTIC_THRESHOLD = 9970"), 768));
  assert.throws(() => sourceAtCutoff(source.replace("_CUBIC_ANALYTIC_REFINED_THRESHOLD = 1494", "_CUBIC_ANALYTIC_REFINED_THRESHOLD = 1495"), 768));
  assert.throws(() => sourceAtCutoff(source, 1494));
});
