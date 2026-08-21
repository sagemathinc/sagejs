"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const repositoryRoot = join(__dirname, "../../..");

test("browser fast-math public modules are receipt-bound lazy roots", () => {
  const config = JSON.parse(
    readFileSync(
      join(repositoryRoot, "scripts/precompiled-python-packages.json"),
      "utf8",
    ),
  );
  const roots = new Set(config.imports);
  for (const name of [
    "sagejs.kernels.arithmetic.moebius",
    "sagejs.kernels.matrix.combinatorial",
    "sagejs.linear_algebra.combinatorial",
  ]) {
    assert.equal(roots.has(name), true, `${name} must be a lazy-module root`);
  }
});
