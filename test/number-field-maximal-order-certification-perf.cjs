// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { spawnSagejsSync } = require("./helpers/sagejs-cli.cjs");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const manifest = JSON.parse(
  readFileSync(
    join(root, "test", "fixtures", "number-field-maximal-order-corpus.json"),
    "utf8",
  ),
);
const identifiers = [
  "pari-round4-vector-002",
  "pari-round4-vector-007",
  "pari-round4-vector-008",
];
const cases = identifiers.map((identifier) => {
  const entry = manifest.cases.find((item) => item.id === identifier);
  assert(entry, `missing corpus entry ${identifier}`);
  return {
    id: identifier,
    polynomial: entry.polynomial.coefficients,
    numerator: entry.basis.numerator,
    denominator: entry.basis.denominator,
  };
});

const source = String.raw`
import sys
sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})
from sagejs.number_fields.maximal_order_certification import check_order_lattice

cases = ${JSON.stringify(cases)}
for case in cases:
    polynomial = [int(value) for value in case["polynomial"]]
    numerator = [[int(value) for value in row] for row in case["numerator"]]
    denominator = int(case["denominator"])
    assert check_order_lattice(polynomial, numerator, denominator)["valid"]
    # This changes the lattice without changing its shape or denominator.
    # A checker that trusts only HNF metadata would miss the corruption.
    numerator[-1][0] += 1
    corrupt = check_order_lattice(polynomial, numerator, denominator)
    assert not corrupt["valid"]
    assert corrupt["reason"] == "not-multiplicatively-closed"

# Exercise the general fraction-free path with a nontriangular presentation
# of Z[(1+sqrt(5))/2], and reject a nearby non-order.
assert check_order_lattice([-5, 0, 1], [[1, 1], [2, 0]], 2)["valid"]
assert not check_order_lattice([-5, 0, 1], [[1, 1], [2, 1]], 2)["valid"]

# Even the equation-basis proof shortcut must independently check monicity.
assert not check_order_lattice([1, 0, 2], [[1, 0], [0, 1]], 1)["valid"]
print("maximal-order-certification-perf-ok")
`;

function run(command, args, environment = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    input: source,
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  checkResult(result);
}

function runSagejs(environment = {}) {
  const result = spawnSagejsSync(root, ["--python", "-"], {
    cwd: root,
    encoding: "utf8",
    env: environment,
    input: source,
    timeout: 60_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  checkResult(result);
}

function checkResult(result) {
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /maximal-order-certification-perf-ok/);
}

test("fraction-free maximal-order certification rejects corruptions", () => {
  run(pythonExecutable(), ["-c", source]);
  runSagejs({
    SAGEJS_NATIVE_DISABLE: "1",
  });
});
