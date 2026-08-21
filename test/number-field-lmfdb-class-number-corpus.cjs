"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const fixture = require("./fixtures/number-field-lmfdb-cubic-class-numbers.json");
const downloader = require("../bench/class-unit-groups/download-lmfdb-number-fields.cjs");

test("pinned LMFDB cubic class-number records are canonical", () => {
  assert.equal(downloader.validateCorpus(fixture), fixture);
  const byLabel = new Map(fixture.records.map((record) => [record.label, record]));
  assert.deepEqual(byLabel.get("3.1.59.1").class_group, []);
  assert.equal(byLabel.get("3.1.59.1").class_number, "1");
  assert.deepEqual(byLabel.get("3.1.1083.1").coefficients, ["-12", "-6", "-1", "1"]);
  assert.deepEqual(byLabel.get("3.1.1083.1").class_group, [3]);
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
