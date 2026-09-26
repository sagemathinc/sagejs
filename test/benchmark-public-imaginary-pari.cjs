// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const directory = path.resolve(__dirname,
  "../bench/pari-class-group-rust/qualification/public-quadratic-boundary/benchmark");
const runner = path.join(directory, "run-public-sagejs-pari.cjs");
const panelPath = path.join(directory, "panel-v2.json");
const panel = require(panelPath);
const pin = require("../bench/pari-class-group-rust/qualification/pari-control/pinned-identity.json");
const { parseArguments, median, expectedSage } = require(runner);

function sha256(filename) {
  return createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

test("public Sage.js/PARI diagnostic rejects unfrozen inputs and unsafe receipt paths", () => {
  assert.deepEqual(parseArguments([]), {
    samples: 15, fieldId: undefined, boundary: "polynomial", receipt: undefined,
  });
  assert.equal(parseArguments(["--field", panel.fields[0].id]).fieldId, panel.fields[0].id);
  assert.equal(parseArguments(["--boundary", "prepared"]).boundary, "prepared");
  for (const args of [
    ["--samples", "0"], ["--samples", "101"], ["--samples", "1.5"],
    ["--field", "unlisted"], ["--boundary", "other"],
    ["--receipt", "../escape.json"], ["--receipt", "other.txt"],
  ]) {
    assert.throws(() => parseArguments(args));
  }
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median([9, 1, 5, 3]), 4);
  assert.equal(expectedSage(panel.fields[0]), "[-3, 1, (), 'exact-unconditional', 'rust']");
});

test("both recorded 15-pair public diagnostics bind the frozen panel and runner", () => {
  for (const boundary of ["polynomial", "prepared"]) {
    const receipt = require(path.join(directory, `public-api-${boundary}-diagnostic.json`));
    assert.equal(receipt.promotedPerformanceReceipt, false);
    assert.equal(receipt.panelSchema, panel.schema);
    assert.equal(receipt.panelSha256, sha256(panelPath));
    assert.equal(receipt.runnerSha256, sha256(runner));
    assert.equal(receipt.samplesPerArmPerField, 15);
    assert.equal(receipt.pariPrecisionBits, 192);
    assert.equal(receipt.pariThreads, 1);
    assert.equal(receipt.pariGpSha256, pin.files["Olinux-x86_64/gp-dyn"]);
    assert.equal(receipt.pariLibrarySha256, pin.files["Olinux-x86_64/libpari-gmp-tls.so.9"]);
    assert.deepEqual(receipt.results.map((field) => field.fieldId),
      panel.fields.map((field) => field.id));
    for (let index = 0; index < panel.fields.length; index += 1) {
      const field = receipt.results[index];
      assert.deepEqual(field.expected, panel.fields[index].expected);
      assert.equal(field.sageNanoseconds.length, 15);
      assert.equal(field.pariNanoseconds.length, 15);
      assert.ok(field.sageNanoseconds.every((value) => Number.isSafeInteger(value) && value > 0));
      assert.ok(field.pariNanoseconds.every((value) => Number.isSafeInteger(value) && value > 0));
      assert.equal(field.sageMedianNanoseconds, median(field.sageNanoseconds));
      assert.equal(field.pariMedianNanoseconds, median(field.pariNanoseconds));
      assert.equal(field.sageOverPariMedianRatio,
        field.sageMedianNanoseconds / field.pariMedianNanoseconds);
    }
  }
});
