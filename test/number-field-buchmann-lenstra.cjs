"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const fixturePath = join(
  root,
  "test",
  "fixtures",
  "number-field-buchmann-lenstra.json",
);
const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

const source = String.raw`
import json
import sys
import time

sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})
from sagejs.number_fields.buchmann_lenstra import (
    buchmann_lenstra_overorder,
    check_buchmann_lenstra_result,
    polynomial_gcd_with_split,
)
from sagejs.number_fields.maximal_order_contracts import DiscriminantComponent

fixtures = json.loads(${JSON.stringify(JSON.stringify(fixture))})
case = fixtures["t8_2pow32"]
coefficients = [int(value) for value in case["coefficients_low_to_high"]]
component_value = int(case["reduced_resultant_component"])
component = DiscriminantComponent(
    component_value,
    "unresolved-coprime-component",
    evidence={"source": "reduced-resultant-prefactorization"},
)
started = time.perf_counter_ns()
result = buchmann_lenstra_overorder(coefficients, component)
elapsed_ns = time.perf_counter_ns() - started
assert result.state == case["expected_state"]
assert result.index == int(case["expected_index"])
assert result.discriminant == int(case["expected_discriminant"])
assert result.basis is not None
assert result.basis.denominator == component_value
assert result.basis.numerator[0] == [
    int(value) for value in case["expected_basis_first_row"]
]
for index in range(1, 8):
    assert result.basis.numerator[index] == [
        component_value if index == column else 0 for column in range(8)
    ]
assert len(result.evidence["obstruction"]) - 1 == case["expected_obstruction_degree"]
assert len(result.evidence["overorder_generator"]) - 1 == case["expected_generator_degree"]
assert result.evidence["remaining_component_gcd"] == 1
assert result.evidence["locally_maximal"] is True
assert check_buchmann_lenstra_result(coefficients, result)
local = result.to_local_result()
assert local.state == "complete"
assert local.evidence["certificate"] == "component-coprime-to-order-discriminant"

bad_discriminant = result.discriminant
result.discriminant = bad_discriminant + 1
assert not check_buchmann_lenstra_result(coefficients, result)
result.discriminant = bad_discriminant

split_case = fixtures["zero_divisor"]
split_result = polynomial_gcd_with_split(
    [int(value) for value in split_case["left"]],
    [int(value) for value in split_case["right"]],
    int(split_case["modulus"]),
)
assert split_result["status"] == "split"
split = split_result["split"]
assert split.left == int(split_case["expected_left_factor"])
assert split.right == int(split_case["expected_right_factor"])
assert split.evidence["euclidean_step"] == split_case["expected_step"]
assert split.evidence["gcd"] == split.left

refused = buchmann_lenstra_overorder(
    coefficients,
    DiscriminantComponent(7, "proven-prime", evidence={"proof": "trial"}),
)
assert refused.state == "certification-error"
assert "requires a composite component" in refused.message

print(json.dumps({
    "state": result.state,
    "index": str(result.index),
    "discriminant": str(result.discriminant),
    "basis": result.basis.to_dict(),
    "split": split.to_dict(),
    "elapsed_ns": elapsed_ns,
}, sort_keys=True))
`;

function run(command, args, environment = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    input: source,
    timeout: 120_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim());
}

test("Buchmann--Lenstra composite steps agree in CPython and Sage.js", () => {
  const python = run(pythonExecutable(), ["-c", source]);
  const sagejs = run(join(root, "bin", "sagejs"), ["--python", "-"], {
    SAGEJS_NATIVE_DISABLE: "1",
  });
  delete python.elapsed_ns;
  delete sagejs.elapsed_ns;
  assert.deepEqual(sagejs, python);
});
