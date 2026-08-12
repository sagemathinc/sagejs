#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const helper = readFileSync(
  join(
    root,
    "src/lib/sagejs/polynomial_algorithms/extension_resource_contract.py",
  ),
  "utf8",
);
const workload = String.raw`
import json
import time

def median_ms(operation, samples=5):
    for _repeat in range(2):
        operation()
    measurements = []
    for _repeat in range(samples):
        started = time.perf_counter()
        operation()
        measurements.append(1000*(time.perf_counter() - started))
    measurements.sort()
    return measurements[len(measurements)//2]

prime = 3
degree = 2
coefficient_count = 1000
prime_field = GF(prime)
modulus_ring = PolynomialRing(prime_field, "u")
u = modulus_ring.gen()
field = GF(9, "a", modulus=u**2 + 1)
a = field.gen()
ring = PolynomialRing(field, "x")

# This is the current public scalar path.  Each coefficient is already a field
# element, so the measured constructor excludes coefficient generation.
coefficients = [
    field((index*2 + 1) % prime)
    + field((index*7 + 2) % prime)*a
    for index in range(coefficient_count)
]
value = ring(coefficients)
packet = dumps(value)
assert loads(packet) == value

# This is protocol overhead only, not a fake FqPolynomial implementation.  The
# callback is a sentinel for the future generated adapter and proves that the
# entire coordinate table crosses one boundary instead of one coefficient at
# a time.
coordinates = []
for index in range(coefficient_count):
    coordinates.append((index*2 + 1) % prime)
    coordinates.append((index*7 + 2) % prime)
context = object()
boundary_calls = []

def bulk_constructor(actual_context, storage, logical_count):
    boundary_calls.append((actual_context, len(storage), logical_count))
    return logical_count

def bulk_operation():
    return construct_extension_polynomial(
        context,
        prime,
        degree,
        coordinates,
        coefficient_count,
        bulk_constructor,
    )

boundary_calls.clear()
assert bulk_operation() == coefficient_count
assert boundary_calls == [(context, degree*coefficient_count, coefficient_count)]
boundary_calls.clear()

measurements = {
    "publicScalarIngress": median_ms(lambda: ring(coefficients)),
    "publicSagePackDump": median_ms(lambda: dumps(value)),
    "publicSagePackLoad": median_ms(lambda: loads(packet)),
    "bulkContractValidationAndCallback": median_ms(bulk_operation),
}
assert len(boundary_calls) == 7
print(json.dumps({
    "coefficientCount": coefficient_count,
    "extensionDegree": degree,
    "flatCoordinateCount": len(coordinates),
    "bulkBoundaryCallsPerConstruction": 1,
    "bulkMeasurementScope": "host validation plus one callback; no FFI resource implemented",
    "milliseconds": measurements,
}))
`;

function execute(label, command, args, prelude = "") {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-extension-resource-bench-"));
  const filename = join(directory, "workload.py");
  try {
    writeFileSync(filename, `${helper}\n${prelude}${workload}\n`);
    const result = spawnSync(command, [...args, filename], {
      cwd: root,
      encoding: "utf8",
      timeout: 180_000,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const lines = result.stdout.trim().split(/\r?\n/);
    return {
      label,
      command: basename(command),
      ...JSON.parse(lines.at(-1)),
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const runtimes = [
  execute("Sage.js", process.execPath, [join(root, "bin/sagejs")]),
];
const sage = process.env.SAGE_BIN || "/home/user/sagelite/sage";
if (existsSync(sage) && process.env.SAGEJS_EXTENSION_RESOURCE_SAGE !== "0") {
  // Sage's command accepts a source filename directly, just like Sage.js.
  runtimes.push(execute("SageMath", sage, [], "from sage.all import *\n"));
}

console.log(
  JSON.stringify(
    {
      schema: "sagejs.benchmark/extension-polynomial-resource-contract-v1",
      representation: {
        coefficientOrder: "constant-to-leading",
        basisOrder: "1,a,...,a^(n-1)",
        physicalForm: "flat row-major canonical residues",
        productionBoundary: "one generated bulk construction call",
      },
      timingPolicy: "two warmups and median of five samples",
      runtimes,
    },
    null,
    2,
  ),
);
