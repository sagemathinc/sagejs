// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const RUNNER = path.join(
  ROOT,
  "bench",
  "hyperelliptic",
  "cross-platform",
  "run-domain-corpus.cjs",
);
const CORPUS = path.join(
  ROOT,
  "bench",
  "hyperelliptic",
  "cross-platform",
  "domain-corpus-v1.json",
);

test("the odd-prime Cantor domain corpus stays branch-covering and bounded", () => {
  const result = spawnSync(process.execPath, [RUNNER, "--check"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(result.stdout.trim(), "verified 20 branch-covering cases");

  const corpus = JSON.parse(readFileSync(CORPUS, "utf8"));
  assert.deepEqual(corpus.domain.constraints.genus, [2, 3]);
  assert.deepEqual(corpus.domain.constraints.h_kind, ["zero", "nonzero"]);
  assert.deepEqual(
    [...new Set(corpus.cases.map((entry) => entry.prime))],
    [5, 13, 101, 1009, 65521],
  );
  assert.equal(corpus.envelopes.add.batch_items_max, 1000);
  assert.equal(corpus.envelopes.scalar.scalar_bits_max, 256);
  assert.equal(corpus.envelopes.progression.batch_items_max, 1000);
});
