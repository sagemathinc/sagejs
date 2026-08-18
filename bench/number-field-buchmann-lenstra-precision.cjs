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
const profile = process.env.SAGEJS_BL_PRECISION_PROFILE === "1";
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
import sagejs.number_fields.buchmann_lenstra as bl

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

profile_totals = {}
if ${profile ? "True" : "False"}:
    for profile_name in (
        "_basis_defines_order",
        "_order_multiplication_table",
        "_q_radical_by_trace",
        "_multiplier_ring_step",
        "_enlarge_order_basis",
    ):
        original = getattr(bl, profile_name)
        def timed(*args, __name=profile_name, __original=original, **kwds):
            started = time.perf_counter_ns()
            try:
                return __original(*args, **kwds)
            finally:
                profile_totals[__name] = (
                    profile_totals.get(__name, 0) + time.perf_counter_ns() - started
                )
        setattr(bl, profile_name, timed)

def measure():
    profile_totals.clear()
    started = time.perf_counter_ns()
    result = buchmann_lenstra_overorder(
        coefficients,
        large,
        basis=starting_basis,
        equation_discriminant=equation_discriminant,
    )
    construction_ns = time.perf_counter_ns() - started
    construction_profile = dict(profile_totals)
    profile_totals.clear()
    started = time.perf_counter_ns()
    accepted = check_buchmann_lenstra_general_result(
        coefficients,
        starting_basis,
        result,
        equation_discriminant=equation_discriminant,
    )
    checker_ns = time.perf_counter_ns() - started
    checker_profile = dict(profile_totals)
    assert accepted and result.state == "complete"
    assert result.discriminant * result.index**2 == equation_discriminant
    return {
        "construction_ns": construction_ns,
        "checker_ns": checker_ns,
        "construction_profile_ns": construction_profile,
        "checker_profile_ns": checker_profile,
    }

for _index in range(${warmups}):
    measure()
measurements = [measure() for _index in range(${samples})]
print(json.dumps({
    "measurements_ns": measurements,
    "state": "complete",
    "component_bits": int(components[1]["base"]).bit_length(),
}, sort_keys=True))
`;

function runRuntime(name, command, args, prefix = "", environment = {}) {
  const started = process.hrtime.bigint();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    input: `${prefix}${source}`,
    timeout: 180_000,
    maxBuffer: 50 * 1024 * 1024,
    env: { ...process.env, ...environment },
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

const kernelPath = join(
  root,
  "src",
  "lib",
  "sagejs",
  "number_fields",
  "bl_composite_kernel.py",
);
const compiled = spawnSync(
  join(root, "bin", "sagejs"),
  [
    "native",
    "compile",
    kernelPath,
    "--functions",
    "packed_order_table_in_place",
  ],
  { cwd: root, encoding: "utf8", timeout: 120_000 },
);
if (compiled.status !== 0) {
  throw new Error(compiled.stderr || compiled.stdout);
}

const report = {
  schema: "sagejs.number-fields/buchmann-lenstra-precision-benchmark-v2",
  case_id: precisionCase.id,
  polynomial_digest: precisionCase.polynomial.digest,
  degree: precisionCase.polynomial.degree,
  coefficient_height_bits: precisionCase.polynomial.coefficientHeightBits,
  warmups,
  samples,
  profile,
  runtimes: [
    runRuntime(
      "CPython",
      pythonExecutable(),
      ["-c", `import decimal\n${source}`],
      "",
      { SAGEJS_NATIVE_DISABLE: "1" },
    ),
    runRuntime(
      "Sage.js dynamic",
      join(root, "bin", "sagejs"),
      ["--python", "-"],
      "",
      { SAGEJS_NATIVE_DISABLE: "1" },
    ),
    runRuntime("Sage.js compiled", join(root, "bin", "sagejs"), [
      "--python",
      "-",
    ]),
  ],
};
console.log(JSON.stringify(report, null, 2));
