"use strict";

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const fixture = JSON.parse(
  readFileSync(
    join(
      root,
      "test",
      "fixtures",
      "number-field-buchmann-lenstra-fallback.json",
    ),
    "utf8",
  ),
);

const source = String.raw`
import json
import sys
import time

sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})
from sagejs.number_fields.buchmann_lenstra import (
    buchmann_lenstra_multiplier_cycle,
    buchmann_lenstra_overorder,
    check_buchmann_lenstra_result,
)
from sagejs.number_fields.maximal_order_contracts import (
    DiscriminantComponent,
    OrderBasis,
)

fixtures = json.loads(${JSON.stringify(JSON.stringify(fixture))})
results = {}
for name in (
    "irregular_prime_fixed",
    "irregular_prime_enlarge",
    "tame_prime_trace",
):
    case = fixtures[name]
    coefficients = [int(value) for value in case["coefficients_low_to_high"]]
    basis_data = case["input_basis"]
    basis = OrderBasis(
        [[int(value) for value in row] for row in basis_data["numerator"]],
        int(basis_data["denominator"]),
    )
    component = DiscriminantComponent(
        int(case["prime"]),
        "proven-prime",
        evidence={"oracle": "Sage 10.9.post1"},
    )
    started = time.perf_counter_ns()
    result = buchmann_lenstra_multiplier_cycle(
        coefficients,
        component,
        basis,
        equation_discriminant=int(case["equation_discriminant"]),
    )
    elapsed_ns = time.perf_counter_ns() - started
    assert result.state == "complete"
    assert result.index == int(case["expected_index"])
    assert result.discriminant == int(case["expected_discriminant"])
    assert result.basis is not None
    assert result.basis.numerator == case["expected_basis"]["numerator"]
    assert result.basis.denominator == int(case["expected_basis"]["denominator"])
    assert result.evidence["certificate"] == case["expected_certificate"]
    events = result.evidence["events"]
    enlargements = 0
    for event in events:
        if event["stage"] == "multiplier-ring":
            enlargements += 1
        if event["stage"] == "component-reduction":
            assert (
                event["discriminant"] * event["index"] ** 2
                == int(case["equation_discriminant"])
            )
    assert enlargements == int(case["expected_enlargements"])
    radical_events = [event for event in events if event["stage"] == "q-radical"]
    assert radical_events
    assert radical_events[0]["method"] == case["expected_radical_method"]
    assert check_buchmann_lenstra_result(coefficients, result)
    local = result.to_local_result()
    assert local.state == "complete"
    assert local.algorithm == "buchmann-lenstra"
    replay = buchmann_lenstra_overorder(
        coefficients,
        component,
        basis=basis,
        equation_discriminant=int(case["equation_discriminant"]),
    )
    assert replay.to_dict() == result.to_dict()
    bad_index = result.index
    result.index = bad_index + 1
    assert not check_buchmann_lenstra_result(coefficients, result)
    result.index = bad_index
    results[name] = {
        "state": result.state,
        "basis": result.basis.to_dict(),
        "index": result.index,
        "discriminant": result.discriminant,
        "certificate": result.evidence["certificate"],
        "events": events,
        "elapsed_ns": elapsed_ns,
    }

split_case = fixtures["composite_zero_divisor"]
split_coefficients = [int(value) for value in split_case["coefficients_low_to_high"]]
identity = OrderBasis([[1, 0, 0], [0, 1, 0], [0, 0, 1]], 1)
split_result = buchmann_lenstra_multiplier_cycle(
    split_coefficients,
    DiscriminantComponent(int(split_case["component"]), "composite"),
    identity,
)
assert split_result.state == "split"
assert split_result.split is not None
assert [split_result.split.left, split_result.split.right] == split_case["expected_factors"]
assert split_result.split.evidence["operation"] == split_case["expected_operation"]
assert check_buchmann_lenstra_result(split_coefficients, split_result)
assert split_result.to_local_result().algorithm == "buchmann-lenstra"

print(json.dumps({
    "prime_results": results,
    "split": split_result.split.to_dict(),
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

test("radical/multiplier fallback agrees in CPython and Sage.js", () => {
  const python = run(pythonExecutable(), ["-c", source]);
  const sagejs = run(join(root, "bin", "sagejs"), ["--python", "-"], {
    SAGEJS_NATIVE_DISABLE: "1",
  });
  for (const result of Object.values(python.prime_results)) {
    assert.ok(result.elapsed_ns < 2_000_000_000);
    delete result.elapsed_ns;
  }
  for (const result of Object.values(sagejs.prime_results)) {
    assert.ok(result.elapsed_ns < 10_000_000_000);
    delete result.elapsed_ns;
  }
  assert.deepEqual(sagejs, python);
});
