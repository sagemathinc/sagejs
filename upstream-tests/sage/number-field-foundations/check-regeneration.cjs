#!/usr/bin/env node
"use strict";

// Recreate the Sage/PARI fixture in a temporary directory and compare its
// mathematical content digest. Ordinary CI uses the structural checker and
// therefore needs neither Sage nor PARI.

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

const root = join(__dirname, "..", "..", "..");
const sage = process.env.SAGE || "/home/user/sagelite/sage";
const fixturePath = join(root, "test", "fixtures", "number-field-foundations", "corpus.json");
const generator = join(root, "upstream-tests", "sage", "number-field-foundations", "generate.py");
const temporary = mkdtempSync(join(tmpdir(), "sagejs-nf-oracle-"));
const output = join(temporary, "corpus.json");

try {
  const result = spawnSync(sage, [generator, output], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Sage exited with status ${result.status}`);
  const expected = JSON.parse(readFileSync(fixturePath, "utf8"));
  const actual = JSON.parse(readFileSync(output, "utf8"));
  assert.equal(actual.contentSha256, expected.contentSha256);
  console.log(`reproduced ${actual.contentSha256} with one persistent Sage process`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
