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
const {
  assertProductionImaginaryMapKernel, parseArguments, median, expectedSage,
  scalarPariMethod,
} = require(runner);
// These receipts were recorded by the runner at 28ce31583, before it gained
// later diagnostics. The hash below matches that committed source exactly.
// A measurement's runner identity is historical; changing its hash to match
// today's source would misrepresent the code that actually produced it.
const recordedRunnerSha256 =
  "904d79cef6d31c772e1d13a590888f72ab2b60a9581d878577e1274612926896";
// Scalar diagnostics were recorded after that revision, but still before the
// group benchmark began requiring the production imaginary-map verifier.
const scalarRecordedRunnerSha256 =
  "7c3c58fb419f9d6a56274251ebf5bce76c03a15d434e75fe533c15c7f552935c";
// These map-free receipts also predate the certified-PARI option. Bind them
// to their actual producer rather than changing their historical identity.
const mapFreeRecordedRunnerSha256 =
  "375b73400e0ed875ac38dbaeb5757951a6a1b878d7f211507c3d81f95df1dc82";

function sha256(filename) {
  return createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
}

test("public Sage.js/PARI diagnostic rejects unfrozen inputs and unsafe receipt paths", () => {
  assert.deepEqual(parseArguments([]), {
    samples: 15, fieldId: undefined, boundary: "polynomial",
    operation: "group", pariProof: "conditional", receipt: undefined,
  });
  assert.equal(parseArguments(["--field", panel.fields[0].id]).fieldId, panel.fields[0].id);
  assert.equal(parseArguments(["--boundary", "prepared"]).boundary, "prepared");
  assert.equal(parseArguments(["--operation", "class-number"]).operation, "class-number");
  assert.equal(parseArguments(["--pari-proof", "certified"]).pariProof, "certified");
  for (const args of [
    ["--samples", "0"], ["--samples", "101"], ["--samples", "1.5"],
    ["--field", "unlisted"], ["--boundary", "other"], ["--operation", "other"],
    ["--pari-proof", "unknown"],
    ["--operation", "class-number", "--pari-proof", "certified"],
    ["--receipt", "../escape.json"], ["--receipt", "other.txt"],
  ]) {
    assert.throws(() => parseArguments(args));
  }
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median([9, 1, 5, 3]), 4);
  assert.equal(expectedSage(panel.fields[0]), "[-3, 1, (), 'exact-unconditional', 'rust']");
  assert.equal(expectedSage(panel.fields[0], "class-number"), "1");
  assert.equal(scalarPariMethod(panel.fields[0]), "qfbclassno-unconditional");
  assert.equal(scalarPariMethod(panel.fields.find(
    (field) => Math.abs(field.expected.discriminant) >= 2e10,
  )), "bnfinit-conditional");
});

test("group comparison requires the loaded production imaginary-map verifier", async () => {
  const sources = [];
  const sage = {
    async evaluate(source) {
      sources.push(source);
      return { repr: "True" };
    },
  };
  await assertProductionImaginaryMapKernel(sage);
  assert.match(sources[0], /verify_packed_imaginary_map/);
  assert.match(sources[0], /packExactInt64Buffer/);
  sage.evaluate = async () => ({ repr: "False" });
  await assert.rejects(assertProductionImaginaryMapKernel(sage),
    /build the production native-kernel pack/);
});

test("recorded 15-pair public diagnostics bind the frozen panel and runner", () => {
  for (const [boundary, filename] of [
    ["polynomial", "public-api-polynomial-diagnostic.json"],
    ["prepared", "public-api-prepared-diagnostic.json"],
    ["prepared", "public-api-prepared-transport-diagnostic.json"],
    ["prepared", "public-api-prepared-frozen-map-diagnostic.json"],
    ["prepared", "public-api-prepared-capability-diagnostic.json"],
    ["prepared", "public-api-prepared-core-diagnostic.json"],
    ["prepared", "public-api-prepared-direct-core-diagnostic.json"],
    ["prepared", "public-api-prepared-inplace-conversion-diagnostic.json"],
    ["prepared", "public-api-prepared-wordpack-diagnostic.json"],
  ]) {
    const receipt = require(path.join(directory, filename));
    assert.equal(receipt.promotedPerformanceReceipt, false);
    assert.ok(receipt.boundary.includes(boundary));
    assert.equal(receipt.panelSchema, panel.schema);
    assert.equal(receipt.panelSha256, sha256(panelPath));
    assert.equal(receipt.runnerSha256, recordedRunnerSha256);
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

test("current map-free public diagnostics bind the panel and exact PARI control", () => {
  for (const boundary of ["polynomial", "prepared"]) {
    const receipt = require(path.join(directory,
      `public-api-${boundary}-mapfree-current-diagnostic.json`));
    assert.equal(receipt.schema, "sagejs.public-quadratic/public-sagejs-pari-diagnostic-v1");
    assert.equal(receipt.promotedPerformanceReceipt, false);
    assert.equal(receipt.operation, "group");
    assert.equal(receipt.boundary,
      `warm-resident-${boundary}-to-public-class-group-and-projection-v1`);
    assert.equal(receipt.panelSchema, panel.schema);
    assert.equal(receipt.panelSha256, sha256(panelPath));
    assert.equal(receipt.runnerSha256, mapFreeRecordedRunnerSha256);
    assert.equal(receipt.samplesPerArmPerField, 15);
    assert.match(receipt.serviceSha256, /^[0-9a-f]{64}$/);
    assert.equal(receipt.pariGpSha256, pin.files["Olinux-x86_64/gp-dyn"]);
    assert.equal(receipt.pariLibrarySha256, pin.files["Olinux-x86_64/libpari-gmp-tls.so.9"]);
    assert.deepEqual(receipt.results.map((row) => row.fieldId),
      panel.fields.map((field) => field.id));
    receipt.results.forEach((row, index) => {
      assert.deepEqual(row.expected, panel.fields[index].expected);
      assert.equal(row.sageNanoseconds.length, 15);
      assert.equal(row.pariNanoseconds.length, 15);
      assert.ok(row.sageNanoseconds.every((value) => Number.isSafeInteger(value) && value > 0));
      assert.ok(row.pariNanoseconds.every((value) => Number.isSafeInteger(value) && value > 0));
      assert.equal(row.sageMedianNanoseconds, median(row.sageNanoseconds));
      assert.equal(row.pariMedianNanoseconds, median(row.pariNanoseconds));
      assert.equal(row.sageOverPariMedianRatio,
        row.sageMedianNanoseconds / row.pariMedianNanoseconds);
    });
  }
});

test("certified PARI diagnostics bind the current runner and frozen panel", () => {
  for (const boundary of ["polynomial", "prepared"]) {
    const receipt = require(path.join(directory,
      `opt-head7a4-certified-${boundary}.json`));
    assert.equal(receipt.promotedPerformanceReceipt, false);
    assert.equal(receipt.operation, "group");
    assert.equal(receipt.pariProof, "certified");
    assert.match(receipt.caveat, /bnfcertify\(b\)/);
    assert.equal(receipt.panelSchema, panel.schema);
    assert.equal(receipt.panelSha256, sha256(panelPath));
    assert.equal(receipt.runnerSha256, sha256(runner));
    assert.equal(receipt.samplesPerArmPerField, 15);
    assert.equal(receipt.pariGpSha256, pin.files["Olinux-x86_64/gp-dyn"]);
    assert.equal(receipt.pariLibrarySha256, pin.files["Olinux-x86_64/libpari-gmp-tls.so.9"]);
    assert.deepEqual(receipt.results.map((row) => row.fieldId),
      panel.fields.map((field) => field.id));
    receipt.results.forEach((row, index) => {
      assert.deepEqual(row.expected, panel.fields[index].expected);
      assert.equal(row.sageNanoseconds.length, 15);
      assert.equal(row.pariNanoseconds.length, 15);
      assert.equal(row.sageMedianNanoseconds, median(row.sageNanoseconds));
      assert.equal(row.pariMedianNanoseconds, median(row.pariNanoseconds));
      assert.equal(row.sageOverPariMedianRatio,
        row.sageMedianNanoseconds / row.pariMedianNanoseconds);
    });
  }
});

test("presentation public diagnostics retain every matched sample", () => {
  for (const revision of ["f1ace", "897"]) {
    const receipts = ["polynomial", "prepared"].map((boundary) => {
      const receipt = require(path.join(directory,
        `opt-head${revision}-matched-${boundary}.json`));
      assert.equal(receipt.promotedPerformanceReceipt, false);
      assert.equal(receipt.operation, "group");
      assert.equal(receipt.pariProof, "conditional");
      assert.equal(receipt.boundary,
        `warm-resident-${boundary}-to-public-class-group-and-projection-v1`);
      assert.equal(receipt.panelSha256, sha256(panelPath));
      assert.equal(receipt.runnerSha256, sha256(runner));
      assert.equal(receipt.samplesPerArmPerField, 15);
      assert.equal(receipt.pariGpSha256, pin.files["Olinux-x86_64/gp-dyn"]);
      assert.equal(receipt.pariLibrarySha256, pin.files["Olinux-x86_64/libpari-gmp-tls.so.9"]);
      assert.deepEqual(receipt.results.map((row) => row.fieldId),
        panel.fields.map((field) => field.id));
      receipt.results.forEach((row, index) => {
        assert.deepEqual(row.expected, panel.fields[index].expected);
        assert.equal(row.sageNanoseconds.length, 15);
        assert.equal(row.pariNanoseconds.length, 15);
        assert.equal(row.sageMedianNanoseconds, median(row.sageNanoseconds));
        assert.equal(row.pariMedianNanoseconds, median(row.pariNanoseconds));
        assert.equal(row.sageOverPariMedianRatio,
          row.sageMedianNanoseconds / row.pariMedianNanoseconds);
      });
      return receipt;
    });
    assert.equal(receipts[0].serviceSha256, receipts[1].serviceSha256);
    assert.equal(receipts[0].sageBuildReceiptSha256,
      receipts[1].sageBuildReceiptSha256);
  }
});

test("current native qualification is a clean source-frozen evidence step", () => {
  const receipt = require(path.join(directory, "receipt-v2-current-2026-09-28.json"));
  assert.equal(receipt.promotionEligible, true);
  assert.equal(receipt.evidenceStatus, "promotion-candidate-clean-frozen-source");
  assert.equal(receipt.identity.gitCommit, "2ce9e552e4a7811c6c18c6dcefbae531147d61bf");
  assert.equal(receipt.identity.gitDirty, false);
  assert.equal(receipt.identity.sourceClosure.containsDirtyReachableSources, false);
  assert.equal(receipt.identity.sourceClosure.reachableSourceStatusPorcelain, "");
  assert.equal(receipt.identity.independentCleanTargetBinaryHashesMatch, true);
  assert.equal(receipt.panelSha256, sha256(panelPath));
  assert.deepEqual(receipt.fields.map((row) => row.fieldId),
    panel.fields.map((field) => field.id));
  assert.equal(receipt.samples.length, panel.fields.length * 15 * 2);
  assert.ok(receipt.samples.every((sample) => sample.exactOutputChecked));
  assert.equal(receipt.aggregate.nativeTargetPass, true);
  assert.equal(receipt.aggregate.tinyFieldTargetPass, true);
});

test("scalar public diagnostics bind exact answers, method, panel, and recorded runner", () => {
  for (const [boundary, phase] of [
    ["polynomial", "exact-backend"],
    ["prepared", "exact-backend"],
    ["polynomial", "scalar-only-discriminant"],
    ["prepared", "scalar-only-discriminant"],
  ]) {
    const receipt = require(path.join(directory,
      `public-api-${boundary}-class-number-${phase}-diagnostic.json`));
    assert.equal(receipt.schema,
      "sagejs.public-quadratic/public-sagejs-pari-scalar-diagnostic-v1");
    assert.equal(receipt.promotedPerformanceReceipt, false);
    assert.equal(receipt.operation, "class-number");
    assert.equal(receipt.boundary,
      `warm-resident-${boundary}-to-public-class-number-v1`);
    assert.equal(receipt.panelSchema, panel.schema);
    assert.equal(receipt.panelSha256, sha256(panelPath));
    assert.equal(receipt.runnerSha256, scalarRecordedRunnerSha256);
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
      assert.equal(field.pariMethod, scalarPariMethod(panel.fields[index]));
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

test("development-Wasm scalar diagnostics stay labeled and bound to their runner", () => {
  const wasmRunner = path.join(directory, "run-development-wasm-pari.mjs");
  for (const boundary of ["polynomial", "prepared"]) {
    const receipt = require(path.join(directory,
      `public-api-${boundary}-development-wasm-class-number-diagnostic.json`));
    assert.equal(receipt.schema,
      "sagejs.public-quadratic/development-wasm-pari-scalar-diagnostic-v1");
    assert.equal(receipt.promotedPerformanceReceipt, false);
    assert.equal(receipt.developmentOnly, true);
    assert.equal(receipt.operation, "class-number");
    assert.equal(receipt.boundary,
      `warm-resident-${boundary}-to-development-wasm-evaluator-class-number-v1`);
    assert.equal(receipt.panelSchema, panel.schema);
    assert.equal(receipt.panelSha256, sha256(panelPath));
    assert.equal(receipt.runnerSha256, sha256(wasmRunner));
    assert.equal(receipt.samplesPerArmPerField, 15);
    assert.match(receipt.reactorSha256, /^[0-9a-f]{64}$/);
    assert.ok(Number.isSafeInteger(receipt.reactorBytes) && receipt.reactorBytes > 0);
    assert.equal(receipt.pariGpSha256, pin.files["Olinux-x86_64/gp-dyn"]);
    assert.equal(receipt.pariLibrarySha256, pin.files["Olinux-x86_64/libpari-gmp-tls.so.9"]);
    assert.deepEqual(receipt.results.map((field) => field.fieldId),
      panel.fields.map((field) => field.id));
    for (let index = 0; index < panel.fields.length; index += 1) {
      const field = receipt.results[index];
      assert.deepEqual(field.expected, panel.fields[index].expected);
      assert.equal(field.pariMethod, scalarPariMethod(panel.fields[index]));
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
