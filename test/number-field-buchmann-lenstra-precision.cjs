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
const corpus = JSON.parse(
  readFileSync(
    join(root, "test", "fixtures", "number-field-maximal-order-corpus.json"),
    "utf8",
  ),
);
const precisionCase = corpus.cases.find(
  (entry) => entry.id === "hecke-precision-degree-12",
);
assert.ok(precisionCase);

const source = String.raw`
import json
import math
import sys
import time

sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})
from sagejs.number_fields.buchmann_lenstra import (
    buchmann_lenstra_overorder,
    check_buchmann_lenstra_general_result,
)
from sagejs.number_fields.discriminant_components import decompose_discriminant
from sagejs.number_fields.maximal_order_contracts import DiscriminantComponent, OrderBasis

if hasattr(sys, "set_int_max_str_digits"):
    sys.set_int_max_str_digits(0)

case = json.loads(${JSON.stringify(JSON.stringify(precisionCase))})
coefficients = [int(value) for value in case["polynomial"]["coefficients"]]
equation_discriminant = int(case["equationDiscriminant"])
components = [
    record
    for record in decompose_discriminant(
        coefficients, equation_discriminant
    )["components"]
    if record["state"] != "proven-prime"
]
assert len(components) == 2
assert int(components[0]["base"]).bit_length() == 68
assert int(components[1]["base"]).bit_length() == 2772

identity = OrderBasis(
    [[int(row == column) for column in range(12)] for row in range(12)], 1
)
small_component = DiscriminantComponent(
    int(components[0]["base"]), str(components[0]["state"])
)
starting_result = buchmann_lenstra_overorder(
    coefficients,
    small_component,
    basis=identity,
    equation_discriminant=equation_discriminant,
)
assert starting_result.state == "complete"
starting_basis = starting_result.basis
assert starting_basis is not None

large_component = DiscriminantComponent(
    int(components[1]["base"]), str(components[1]["state"])
)
started = time.perf_counter_ns()
result = buchmann_lenstra_overorder(
    coefficients,
    large_component,
    basis=starting_basis,
    equation_discriminant=equation_discriminant,
)
construction_ns = time.perf_counter_ns() - started
assert result.state == "complete"
assert result.basis is not None
assert result.discriminant * result.index**2 == equation_discriminant
assert [event["stage"] for event in result.evidence["events"]] == [
    "component-reduction",
    "q-radical",
    "multiplier-ring",
    "component-reduction",
]

started = time.perf_counter_ns()
assert check_buchmann_lenstra_general_result(
    coefficients,
    starting_basis,
    result,
    equation_discriminant=equation_discriminant,
)
checker_ns = time.perf_counter_ns() - started

saved_index = result.index
result.index = saved_index + 1
assert not check_buchmann_lenstra_general_result(
    coefficients,
    starting_basis,
    result,
    equation_discriminant=equation_discriminant,
)
result.index = saved_index

saved_discriminant = result.discriminant
result.discriminant = saved_discriminant + 1
assert not check_buchmann_lenstra_general_result(
    coefficients,
    starting_basis,
    result,
    equation_discriminant=equation_discriminant,
)
result.discriminant = saved_discriminant

saved_q = result.evidence["events"][0]["q"]
result.evidence["events"][0]["q"] = saved_q + 1
assert not check_buchmann_lenstra_general_result(
    coefficients,
    starting_basis,
    result,
    equation_discriminant=equation_discriminant,
)
result.evidence["events"][0]["q"] = saved_q

multiplier_event = next(
    event for event in result.evidence["events"]
    if event["stage"] == "multiplier-ring"
)
saved_kernel_entry = multiplier_event["kernel_rows"][0][0]
multiplier_event["kernel_rows"][0][0] = saved_kernel_entry + 1
assert not check_buchmann_lenstra_general_result(
    coefficients,
    starting_basis,
    result,
    equation_discriminant=equation_discriminant,
)
multiplier_event["kernel_rows"][0][0] = saved_kernel_entry

compact = result.evidence["compact_event_certificate"]
saved_event_count = compact["event_count"]
compact["event_count"] = saved_event_count + 1
assert not check_buchmann_lenstra_general_result(
    coefficients,
    starting_basis,
    result,
    equation_discriminant=equation_discriminant,
)
compact["event_count"] = saved_event_count
assert check_buchmann_lenstra_general_result(
    coefficients,
    starting_basis,
    result,
    equation_discriminant=equation_discriminant,
)

print(json.dumps({
    "state": result.state,
    "index": str(result.index),
    "discriminant": str(result.discriminant),
    "basis": {
        "denominator": str(result.basis.denominator),
        "numerator": [
            [str(value) for value in row] for row in result.basis.numerator
        ],
    },
    "event_stages": [event["stage"] for event in result.evidence["events"]],
    "construction_ns": construction_ns,
    "checker_ns": checker_ns,
    "corruptions_rejected": [
        "index",
        "discriminant",
        "event-q",
        "event-kernel",
        "compact-schema",
    ],
}, sort_keys=True))
`;

function run(command, args, environment = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    input: source,
    timeout: 120_000,
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(
      `failed to run ${JSON.stringify(command)}: ${result.error.message}`,
      { cause: result.error },
    );
  }
  assert.equal(
    result.status,
    0,
    result.stderr || result.stdout ||
      `${JSON.stringify(command)} exited with status ${result.status}`,
  );
  return JSON.parse(result.stdout.trim());
}

test("2772-bit BL construction and independent replay agree exactly", () => {
  const python = run(pythonExecutable(), [
    "-c",
    `import decimal\n${source}`,
  ]);
  const [sagejsCommand, sagejsArguments] = sagejsInvocation(
    root,
    ["--python", "-"],
  );
  const sagejs = run(sagejsCommand, sagejsArguments, {
    SAGEJS_NATIVE_DISABLE: "1",
  });

  assert.ok(python.construction_ns < 5_000_000_000);
  assert.ok(python.checker_ns < 5_000_000_000);
  assert.ok(sagejs.construction_ns < 20_000_000_000);
  assert.ok(sagejs.checker_ns < 20_000_000_000);
  delete python.construction_ns;
  delete python.checker_ns;
  delete sagejs.construction_ns;
  delete sagejs.checker_ns;
  assert.deepEqual(sagejs, python);
});
