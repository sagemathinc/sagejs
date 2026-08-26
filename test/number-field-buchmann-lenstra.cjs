// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");
const { sagejsInvocation } = require("./helpers/sagejs-cli.cjs");

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
import math
import sys
import time

sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})
from sagejs.number_fields.buchmann_lenstra import (
    buchmann_lenstra_general_overorder,
    buchmann_lenstra_overorder,
    check_buchmann_lenstra_general_result,
    check_buchmann_lenstra_result,
    perfect_power_component_split,
    polynomial_gcd_with_split,
)
from sagejs.number_fields.maximal_order_contracts import DiscriminantComponent, OrderBasis

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

general = fixtures["general_multi_enlargement"]
general_coefficients = [int(value) for value in general["coefficients_low_to_high"]]
general_basis = OrderBasis(
    [[int(value) for value in row] for row in general["starting_basis"]["numerator"]],
    int(general["starting_basis"]["denominator"]),
)
general_component = DiscriminantComponent(int(general["component"]), "composite")
general_result = buchmann_lenstra_overorder(
    general_coefficients,
    general_component,
    basis=general_basis,
)
assert general_result.state == "complete"
assert general_result.index == int(general["expected_index"])
assert general_result.discriminant == int(general["expected_discriminant"])
assert general_result.basis is not None
assert general_result.basis.numerator == [
    [int(value) for value in row] for row in general["expected_basis"]["numerator"]
]
assert general_result.basis.denominator == int(general["expected_basis"]["denominator"])
general_events = general_result.evidence["events"]
assert sum(event["stage"] == "multiplier-ring" for event in general_events) == general["expected_enlargements"]
assert [
    (event["from_index"], event["to_index"])
    for event in general_events if event["stage"] == "multiplier-ring"
] == [(35, 1225), (1225, 42875)]
assert check_buchmann_lenstra_general_result(
    general_coefficients, general_basis, general_result
)
assert check_buchmann_lenstra_result(general_coefficients, general_result)
assert general_result.to_local_result().algorithm == "buchmann-lenstra"
saved_to_index = general_events[2]["to_index"]
general_events[2]["to_index"] = saved_to_index + 1
assert not check_buchmann_lenstra_general_result(
    general_coefficients, general_basis, general_result
)
general_events[2]["to_index"] = saved_to_index

trace_split_case = fixtures["general_trace_split"]
trace_coefficients = [int(value) for value in trace_split_case["coefficients_low_to_high"]]
trace_basis = OrderBasis([[1, 0, 0], [0, 1, 0], [0, 0, 1]], 1)
trace_result = buchmann_lenstra_general_overorder(
    trace_coefficients,
    DiscriminantComponent(int(trace_split_case["component"]), "composite"),
    trace_basis,
)
assert trace_result.state == "split"
assert trace_result.split is not None
assert trace_result.split.left == int(trace_split_case["expected_left_factor"])
assert trace_result.split.right == int(trace_split_case["expected_right_factor"])
assert trace_result.evidence["split_stage"] == trace_split_case["expected_stage"]
assert trace_result.split.evidence["operation"] == "composite-modular-elimination"
assert check_buchmann_lenstra_general_result(
    trace_coefficients, trace_basis, trace_result
)

freeness_case = fixtures["general_freeness"]
freeness_coefficients = [int(value) for value in freeness_case["coefficients_low_to_high"]]
freeness_basis = OrderBasis(
    [[int(value) for value in row] for row in freeness_case["starting_basis"]["numerator"]],
    int(freeness_case["starting_basis"]["denominator"]),
)
freeness_result = buchmann_lenstra_general_overorder(
    freeness_coefficients,
    DiscriminantComponent(int(freeness_case["component"]), "composite"),
    freeness_basis,
)
assert freeness_result.state == "resource-error"
assert freeness_result.message == freeness_case["expected_message"]
assert [event["stage"] for event in freeness_result.evidence["events"]] == freeness_case["expected_stages"]
assert freeness_result.evidence["events"][-1]["equal"] is False
assert check_buchmann_lenstra_general_result(
    freeness_coefficients, freeness_basis, freeness_result
)

power_split = perfect_power_component_split(
    DiscriminantComponent(49, "composite"), 2
)
assert power_split is not None
assert power_split.left == 7 and power_split.right == 7
assert power_split.evidence["operation"] == "perfect-power-height"
assert perfect_power_component_split(DiscriminantComponent(50, "composite"), 2) is None

bounded = buchmann_lenstra_general_overorder(
    general_coefficients,
    general_component,
    general_basis,
    max_degree=1,
)
assert bounded.state == "resource-error"
assert "degree bound" in bounded.message

print(json.dumps({
    "state": result.state,
    "index": str(result.index),
    "discriminant": str(result.discriminant),
    "basis": result.basis.to_dict(),
    "split": split.to_dict(),
    "general": general_result.to_dict(),
    "general_trace_split": trace_result.to_dict(),
    "general_freeness": freeness_result.to_dict(),
    "power_split": power_split.to_dict(),
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
  const [sagejsCommand, sagejsArguments] = sagejsInvocation(
    root,
    ["--python", "-"],
  );
  const sagejs = run(sagejsCommand, sagejsArguments, {
    SAGEJS_NATIVE_DISABLE: "1",
  });
  delete python.elapsed_ns;
  delete sagejs.elapsed_ns;
  assert.deepEqual(sagejs, python);
});
