"use strict";

const { readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const { pythonExecutable } = require("../tools/python-executable.cjs");

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
if (!precisionCase) throw new Error("missing precision-sensitive corpus case");

const samples = Number(process.env.SAGEJS_BL_PRECISION_SAMPLES ?? "3");
const warmups = Number(process.env.SAGEJS_BL_PRECISION_WARMUPS ?? "1");
const source = String.raw`
import json
import sys
import time

sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})
from sagejs.number_fields.buchmann_lenstra import (
    buchmann_lenstra_overorder,
    check_buchmann_lenstra_general_result,
)
from sagejs.number_fields.discriminant_components import decompose_discriminant
from sagejs.number_fields.maximal_order_contracts import DiscriminantComponent, OrderBasis

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
identity = OrderBasis(
    [[int(row == column) for column in range(12)] for row in range(12)], 1
)
small = DiscriminantComponent(int(components[0]["base"]), str(components[0]["state"]))
starting_basis = buchmann_lenstra_overorder(
    coefficients,
    small,
    basis=identity,
    equation_discriminant=equation_discriminant,
).basis
large = DiscriminantComponent(int(components[1]["base"]), str(components[1]["state"]))

def measure():
    started = time.perf_counter_ns()
    result = buchmann_lenstra_overorder(
        coefficients,
        large,
        basis=starting_basis,
        equation_discriminant=equation_discriminant,
    )
    construction_ns = time.perf_counter_ns() - started
    started = time.perf_counter_ns()
    accepted = check_buchmann_lenstra_general_result(
        coefficients,
        starting_basis,
        result,
        equation_discriminant=equation_discriminant,
    )
    checker_ns = time.perf_counter_ns() - started
    assert accepted and result.state == "complete"
    assert result.discriminant * result.index**2 == equation_discriminant
    return [construction_ns, checker_ns]

for _index in range(${warmups}):
    measure()
measurements = [measure() for _index in range(${samples})]
print(json.dumps({
    "measurements_ns": measurements,
    "state": "complete",
    "component_bits": int(components[1]["base"]).bit_length(),
}, sort_keys=True))
`;

function runRuntime(name, command, args, prefix = "") {
  const started = process.hrtime.bigint();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    input: `${prefix}${source}`,
    timeout: 180_000,
    maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
  });
  if (result.status !== 0) {
    throw new Error(`${name} failed: ${result.stderr || result.stdout}`);
  }
  return {
    name,
    process_wall_ns: Number(process.hrtime.bigint() - started),
    ...JSON.parse(result.stdout.trim()),
  };
}

const report = {
  schema: "sagejs.number-fields/buchmann-lenstra-precision-benchmark-v1",
  case_id: precisionCase.id,
  polynomial_digest: precisionCase.polynomial.digest,
  degree: precisionCase.polynomial.degree,
  coefficient_height_bits: precisionCase.polynomial.coefficientHeightBits,
  warmups,
  samples,
  native_disabled: true,
  runtimes: [
    runRuntime(
      "CPython",
      pythonExecutable(),
      ["-c", `import decimal\n${source}`],
    ),
    runRuntime("Sage.js dynamic", join(root, "bin", "sagejs"), [
      "--python",
      "-",
    ]),
  ],
};
console.log(JSON.stringify(report, null, 2));
