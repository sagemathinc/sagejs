"use strict";

const { readFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const fixtures = JSON.parse(
  readFileSync(
    join(root, "test", "fixtures", "number-field-buchmann-lenstra.json"),
    "utf8",
  ),
);
const corpus = JSON.parse(
  readFileSync(
    join(root, "test", "fixtures", "number-field-maximal-order-corpus.json"),
    "utf8",
  ),
);
const controlIds = [
  "pari-round4-vector-020",
  "pari-round4-vector-022",
  "pari-round4-vector-027",
  "pari-round4-vector-031",
  "pari-round4-vector-051",
];
const controls = controlIds.map((id) => {
  const entry = corpus.cases.find((candidate) => candidate.id === id);
  if (!entry) throw new Error(`missing corpus control ${id}`);
  const factor = entry.localIndexFactors.find(
    (candidate) => candidate.state === "composite-unresolved",
  );
  if (!factor) throw new Error(`missing unresolved component for ${id}`);
  return {
    id,
    coefficients: entry.polynomial.coefficients,
    equation_discriminant: entry.equationDiscriminant,
    component: factor.value,
  };
});
const t8 = fixtures.t8_2pow32;
const cases = [
  {
    id: "T(8,2^32)",
    coefficients: t8.coefficients_low_to_high,
    equation_discriminant: t8.expected_discriminant,
    component: t8.reduced_resultant_component,
    compute_equation_discriminant: true,
  },
  ...controls,
];

const samples = Number(process.env.SAGEJS_BL_FAST_SAMPLES ?? "7");
const warmups = Number(process.env.SAGEJS_BL_FAST_WARMUPS ?? "2");
const source = String.raw`
import json
import sys
import time

sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})
import sagejs.number_fields.buchmann_lenstra as bl
from sagejs.native import execution_mode
from sagejs.number_fields.maximal_order_contracts import DiscriminantComponent

cases = json.loads(${JSON.stringify(JSON.stringify(cases))})

def measure(case):
    coefficients = [int(value) for value in case["coefficients"]]
    modulus = int(case["component"])
    equation_discriminant = (
        bl.polynomial_discriminant(coefficients)
        if case.get("compute_equation_discriminant")
        else int(case["equation_discriminant"])
    )
    component = DiscriminantComponent(modulus, "composite")
    started = time.perf_counter_ns()
    data = bl._composite_dedekind_data(coefficients, modulus)
    data_ns = time.perf_counter_ns() - started
    assert data["status"] == "enlarge"
    degree = len(coefficients) - 1
    generators = [
        [modulus if row == column else 0 for column in range(degree)]
        for row in range(degree)
    ]
    generators.extend(bl._multiplication_rows(data["generator"], coefficients))
    started = time.perf_counter_ns()
    reference_hnf = bl._row_hnf(generators)
    reference_hnf_ns = time.perf_counter_ns() - started
    started = time.perf_counter_ns()
    packed_hnf = bl._packed_row_hnf(generators)
    packed_hnf_ns = time.perf_counter_ns() - started
    assert packed_hnf == reference_hnf
    started = time.perf_counter_ns()
    result = bl.buchmann_lenstra_overorder(
        coefficients,
        component,
        equation_discriminant=equation_discriminant,
    )
    construction_ns = time.perf_counter_ns() - started
    started = time.perf_counter_ns()
    accepted = bl.check_buchmann_lenstra_result(coefficients, result)
    checker_ns = time.perf_counter_ns() - started
    assert accepted and result.state == "complete"
    return [data_ns, reference_hnf_ns, packed_hnf_ns, construction_ns, checker_ns]

for case in cases:
    for _index in range(${warmups}):
        measure(case)

results = []
for case in cases:
    measurements = []
    for _index in range(${samples}):
        measurements.append(measure(case))
    results.append({
        "id": case["id"],
        "degree": len(case["coefficients"]) - 1,
        "component_bits": int(case["component"]).bit_length(),
        "measurements_ns": measurements,
    })

print(json.dumps({
    "execution_mode": execution_mode(bl.packed_row_hnf_in_place),
    "results": results,
}, sort_keys=True))
`;

function runRuntime(name, command, args, environment = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    input: source,
    timeout: 180_000,
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, ...environment },
  });
  if (result.status !== 0) {
    throw new Error(`${name} failed:\n${result.stdout}\n${result.stderr}`);
  }
  const report = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  const labels = [
    "composite_dedekind_data",
    "reference_hnf",
    "packed_hnf",
    "construction",
    "checker",
  ];
  for (const entry of report.results) {
    entry.median_ns = Object.fromEntries(
      labels.map((label, column) => {
        const values = entry.measurements_ns
          .map((row) => row[column])
          .sort((left, right) => left - right);
        return [label, values[Math.floor(values.length / 2)]];
      }),
    );
  }
  return { name, ...report };
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
    "packed_row_hnf_in_place",
  ],
  { cwd: root, encoding: "utf8", timeout: 120_000 },
);
if (compiled.status !== 0) {
  throw new Error(compiled.stderr || compiled.stdout);
}

console.log(
  JSON.stringify(
    {
      schema: "sagejs.number-fields/buchmann-lenstra-fast-benchmark-v1",
      warmups,
      samples,
      controls: controlIds,
      runtimes: [
        runRuntime("CPython", pythonExecutable(), ["-c", source]),
        runRuntime("Sage.js compiled", join(root, "bin", "sagejs"), [
          "--python",
          "-",
        ]),
      ],
    },
    null,
    2,
  ),
);
