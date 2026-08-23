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
import sagejs.number_fields.bl_composite_kernel as kernels
from sagejs.native import (
    execution_mode,
    integer_buffer_values,
    kernel_integer_buffer,
    kernel_integer_zeros,
)
from sagejs.number_fields.maximal_order_contracts import DiscriminantComponent

cases = json.loads(${JSON.stringify(JSON.stringify(cases))})

power_case = json.loads(${JSON.stringify(JSON.stringify({
  degree: 3,
  tensor: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 1, 12, 6, 1, 0, 0, 1, 12, 6, 1, 12, 18, 7],
  bases: [
    [2, 0, 2, 0, 1, 1, 0, 0, 4],
    [2, 0, 4, 0, 1, 5, 0, 0, 6],
    [6, 0, 0, 0, 1, 1, 0, 0, 2],
    [2, 0, 0, 0, 1, 0, 0, 0, 1],
    [2, 0, 2, 0, 1, 7, 0, 0, 10],
  ],
  maxima: [8, 3, 3, 4, 2],
}))})

def measure_power_chain():
    degree = int(power_case["degree"])
    square = degree * degree
    product_entries = square * degree
    tensor = [int(value) for value in power_case["tensor"]]
    product = kernels.packed_ideal_product_hnf_in_place
    chain = kernels.packed_ideal_power_chain_hnf_in_place
    started = time.perf_counter_ns()
    readable = []
    for basis, maximum in zip(power_case["bases"], power_case["maxima"]):
        current = [int(value) for value in basis]
        result = [tuple(current)]
        for _exponent in range(1, maximum):
            output = kernel_integer_zeros(product, product_entries, 32)
            assert product(
                output,
                kernel_integer_zeros(product, product_entries, 32),
                kernel_integer_zeros(product, 2 * degree, 32),
                kernel_integer_buffer(product, current),
                kernel_integer_buffer(product, basis),
                kernel_integer_buffer(product, tensor),
                degree,
            )
            current = [
                int(value)
                for value in integer_buffer_values(output)[:square]
            ]
            result.append(tuple(current))
        readable.append(tuple(result))
    readable_ns = time.perf_counter_ns() - started
    started = time.perf_counter_ns()
    packed = []
    for basis, maximum in zip(power_case["bases"], power_case["maxima"]):
        output = kernel_integer_zeros(chain, maximum * square, 32)
        assert chain(
            output,
            kernel_integer_zeros(chain, product_entries, 32),
            kernel_integer_zeros(chain, product_entries, 32),
            kernel_integer_zeros(chain, 2 * degree, 32),
            kernel_integer_buffer(chain, basis),
            kernel_integer_buffer(chain, tensor),
            degree,
            maximum,
        )
        values = [int(value) for value in integer_buffer_values(output)]
        packed.append(
            tuple(
                tuple(values[offset : offset + square])
                for offset in range(0, maximum * square, square)
            )
        )
    packed_ns = time.perf_counter_ns() - started
    assert tuple(packed) == tuple(readable)
    return [readable_ns, packed_ns]

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
    reference_data = bl._composite_dedekind_data_reference(coefficients, modulus)
    reference_data_ns = time.perf_counter_ns() - started
    started = time.perf_counter_ns()
    data = bl._composite_dedekind_data(coefficients, modulus)
    fused_data_hnf_ns = time.perf_counter_ns() - started
    assert data["status"] == "enlarge"
    for key in (
        "repeated_gcd",
        "squarefree_quotient",
        "correction",
        "obstruction",
        "generator",
    ):
        assert data[key] == reference_data[key]
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
    assert data["packed_hnf"] == reference_hnf
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
    return [
        reference_data_ns,
        fused_data_hnf_ns,
        reference_hnf_ns,
        packed_hnf_ns,
        construction_ns,
        checker_ns,
    ]

for case in cases:
    for _index in range(${warmups}):
        measure(case)
for _index in range(${warmups}):
    measure_power_chain()

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

power_measurements = [measure_power_chain() for _index in range(${samples})]

print(json.dumps({
    "execution_mode": execution_mode(bl.packed_row_hnf_in_place),
    "fused_execution_mode": execution_mode(
        bl.packed_composite_dedekind_basis_in_place
    ),
    "ideal_power_chain_execution_mode": execution_mode(
        kernels.packed_ideal_power_chain_hnf_in_place
    ),
    "ideal_power_chain_measurements_ns": power_measurements,
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
    "reference_composite_dedekind_data",
    "fused_composite_data_and_hnf",
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
  const readablePowerTimes = report.ideal_power_chain_measurements_ns
    .map((row) => row[0])
    .sort((left, right) => left - right);
  const packedPowerTimes = report.ideal_power_chain_measurements_ns
    .map((row) => row[1])
    .sort((left, right) => left - right);
  report.ideal_power_chain_median_ns = {
    repeated_product: readablePowerTimes[Math.floor(readablePowerTimes.length / 2)],
    packed: packedPowerTimes[Math.floor(packedPowerTimes.length / 2)],
  };
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
    [
      "packed_row_hnf_in_place",
      "packed_composite_dedekind_basis_in_place",
      "packed_order_table_in_place",
      "packed_ideal_power_chain_hnf_in_place",
    ].join(","),
  ],
  { cwd: root, encoding: "utf8", timeout: 120_000 },
);
if (compiled.status !== 0) {
  throw new Error(compiled.stderr || compiled.stdout);
}

console.log(
  JSON.stringify(
    {
      schema: "sagejs.number-fields/buchmann-lenstra-fast-benchmark-v3",
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
