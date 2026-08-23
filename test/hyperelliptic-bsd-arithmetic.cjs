"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");

function runFixture(name) {
  return execFileSync(
    process.execPath,
    [sagejs, join(root, "src", "lib", "sagejs", "hyperelliptic_curves", name)],
    { cwd: root, encoding: "utf8", env: process.env },
  );
}

test("BSD quotient normalization and serialization fixture passes", () => {
  const output = runFixture("_test_bsd.py");
  assert.match(output, /'rank_normalization_checks': 4/);
  assert.match(output, /'serialization_round_trips': 2/);
  assert.match(output, /'ok': True/);
});

test("deficiency and Poonen--Stoll parity fixture passes", () => {
  const output = runFixture("_test_deficiency.py");
  assert.match(output, /'fixture_checks': 14/);
  assert.match(output, /'global_checks': 11/);
  assert.match(output, /'ok': True/);
});
