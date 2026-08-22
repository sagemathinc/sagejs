"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const fixture = require("./fixtures/number-field-lmfdb-cubic-class-numbers.json");
const downloader = require("../bench/class-unit-groups/download-lmfdb-number-fields.cjs");
const benchmark = require("../bench/class-unit-groups/compare-lmfdb-class-numbers.cjs");

test("pinned LMFDB cubic class-number records are canonical", () => {
  assert.equal(downloader.validateCorpus(fixture), fixture);
  const byLabel = new Map(fixture.records.map((record) => [record.label, record]));
  assert.deepEqual(byLabel.get("3.1.59.1").class_group, []);
  assert.equal(byLabel.get("3.1.59.1").class_number, "1");
  assert.deepEqual(byLabel.get("3.1.1083.1").coefficients, ["-12", "-6", "-1", "1"]);
  assert.deepEqual(byLabel.get("3.1.1083.1").class_group, ["3"]);
  assert.equal(byLabel.get("3.1.1083.1").used_grh, false);
});

test("LMFDB mirror query is bounded and rejects injected limits", () => {
  const query = downloader.downloadQuery({ degree: 3, discMax: 100000, limit: 1000 });
  assert.match(query, /degree = 3 AND disc_abs <= 100000/);
  assert.match(query, /LIMIT 1000/);
  assert.throws(
    () => downloader.downloadQuery({ degree: "3; DROP TABLE nf_fields", discMax: 1, limit: 1 }),
    /positive decimal integer/,
  );
});

test("offline LMFDB corpus check needs no database connection", () => {
  const run = childProcess.spawnSync(
    process.execPath,
    [path.join(root, "bench/class-unit-groups/download-lmfdb-number-fields.cjs"), "--check"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(run.status, 0, run.stderr || run.stdout);
  assert.match(run.stdout, /valid \(10 records\)/);
});

test("LMFDB comparison statistics expose the P7 ratio gates", () => {
  assert.deepEqual(benchmark.modesFor("both"), [false, true]);
  assert.equal(benchmark.median([9, 1, 4]), 4);
  assert.equal(benchmark.percentile([1, 2, 3, 4, 5], 0.9), 5);
  const aggregate = benchmark.aggregateRatios([
    { ratio: 4 }, { ratio: 9 }, { ratio: null },
  ]);
  assert.equal(aggregate.count, 2);
  assert.equal(aggregate.geometric_mean, 6);
  assert.equal(aggregate.worst, 9);
  const plan = childProcess.spawnSync(
    process.execPath,
    [
      path.join(root, "bench/class-unit-groups/compare-lmfdb-class-numbers.cjs"),
      "--dry-run", "--limit", "2", "--samples", "5", "--proof", "both",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(plan.status, 0, plan.stderr || plan.stdout);
  const payload = JSON.parse(plan.stdout);
  assert.deepEqual(payload.records, ["3.1.23.1", "3.1.59.1"]);
  assert.deepEqual(payload.proof_modes, [false, true]);
  assert.equal(payload.samples, 5);
});
