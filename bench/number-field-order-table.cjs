#!/usr/bin/env node
"use strict";

const { arch, cpus, platform } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const executable = process.env.SAGEJS_TEST_EXECUTABLE || join(root, "bin", "sagejs");
const samples = Number.parseInt(process.env.SAGEJS_BENCH_SAMPLES || "7", 10);
if (!Number.isSafeInteger(samples) || samples < 3 || samples > 25) {
  throw new Error("SAGEJS_BENCH_SAMPLES must be an integer in 3..25");
}

const source = String.raw`
import hashlib
import json
import time

from sagejs.native import execution_mode
from sagejs.number_fields import buchmann_lenstra
from sagejs.number_fields import maximal_order

R = PolynomialRing(QQ, "x")
x = R.gen()
polynomial = x**3 - x**2 - 6*x - 12

def integer_table(table):
    answer = []
    for left in table:
        products = []
        for product in left:
            products.append([int(value) for value in product])
        answer.append(products)
    return answer

def measure(function, order):
    started = time.perf_counter()
    table = function(order)
    return table, time.perf_counter() - started

# Resolve lazy compiler and maximal-order paths outside the samples.
warm = NumberField(polynomial, "warm").maximal_order()
_warm_reference = maximal_order._nf_order_multiplication_table_reference(warm)
_warm_packed = maximal_order._nf_order_multiplication_table_packed(warm)
assert integer_table(_warm_reference) == _warm_packed

readable = []
packed = []
digest = None
for index in range(${samples}):
    readable_order = NumberField(polynomial, "readable" + str(index)).maximal_order()
    reference, readable_seconds = measure(
        maximal_order._nf_order_multiplication_table_reference,
        readable_order,
    )
    packed_order = NumberField(polynomial, "packed" + str(index)).maximal_order()
    accelerated, packed_seconds = measure(
        maximal_order._nf_order_multiplication_table_packed,
        packed_order,
    )
    normalized = integer_table(reference)
    assert accelerated == normalized
    current = hashlib.sha256(
        json.dumps(normalized, separators=(",", ":")).encode()
    ).hexdigest()
    if digest is None:
        digest = current
    assert current == digest
    readable.append(readable_seconds)
    packed.append(packed_seconds)

readable.sort()
packed.sort()
print(json.dumps({
    "execution_mode": execution_mode(
        buchmann_lenstra.packed_order_table_in_place
    ),
    "readable_samples_seconds": readable,
    "readable_median_seconds": readable[len(readable) // 2],
    "packed_samples_seconds": packed,
    "packed_median_seconds": packed[len(packed) // 2],
    "speedup": readable[len(readable) // 2] / packed[len(packed) // 2],
    "table_sha256": digest,
}, separators=(",", ":")))
`;

const result = spawnSync(executable, ["--python", "-"], {
  cwd: root,
  encoding: "utf8",
  input: source,
  timeout: 120_000,
  maxBuffer: 10 * 1024 * 1024,
});
if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

const measured = JSON.parse(result.stdout.trim());
const report = {
  schema: "sagejs.number-fields/order-multiplication-table-benchmark-v1",
  workload:
    "fresh exact maximal-order multiplication tables for x^3-x^2-6*x-12 after lazy warmup",
  sample_policy:
    "fresh isomorphic fields, readable field-arithmetic table followed by the shared packed Buchmann-Lenstra table, median of bounded samples",
  host: {
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model ?? "unknown",
    node: process.version,
  },
  measured,
};
console.log(JSON.stringify(report, null, 2));

if (process.argv.includes("--check")) {
  if (
    measured.table_sha256 !==
      "6873df44d9d21a49055c61e1e06d744ed16ab4eb9b610281ff1d8f875c8cc23d" ||
    !["native", "native-capable", "compiled"].includes(measured.execution_mode)
  ) {
    throw new Error("order-table benchmark did not replay the exact native table");
  }
}
