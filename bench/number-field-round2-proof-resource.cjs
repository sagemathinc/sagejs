#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { cpus, platform, arch } = require("node:os");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const fixturePath = join(
  root,
  "test/fixtures/number-field-maximal-order-corpus.json",
);
const corpus = JSON.parse(readFileSync(fixturePath, "utf8"));
const vector = corpus.cases.find(
  (entry) => entry.id === "pari-round4-vector-429",
);
assert(vector, "missing vector429 maximal-order fixture");

const samplesArgument = process.argv.find((argument) =>
  argument.startsWith("--samples="),
);
const samples = samplesArgument ? Number(samplesArgument.split("=")[1]) : 1;
assert(Number.isInteger(samples) && samples > 0 && samples <= 5);
const assertTarget = process.argv.includes("--assert-target");

const program = String.raw`
import json
from time import perf_counter_ns

program_started = perf_counter_ns()

from sagejs.number_fields.field_analysis_resource import (
    authenticated_round2_order_proof_matches,
)
from sagejs.number_fields.maximal_order import integral_equation_polynomial
from sagejs.number_fields.order_resource import (
    _native_order_with_round2_proof_from_polynomial_resource_bound,
)

case = json.loads(r'''${JSON.stringify(vector)}''')
coefficients = [int(value) for value in case["polynomial"]["coefficients"]]
R = PolynomialRing(ZZ, "x")
K = NumberField(R(coefficients), "a")
polynomial = integral_equation_polynomial(K)
resource = polynomial._exact_polynomial_resource()
startup_and_setup_ns = perf_counter_ns() - program_started

flint = __import__("sagejs.ffi.flint", fromlist=["flint"])
raw_order_ns = []
proof_producer_ns = []
proof_direct_auth_ns = []
original_raw_order = flint.number_field_order_from_polynomial_resource
original_proof_producer = flint.number_field_round2_proof_resource
order_module = __import__(
    "sagejs.number_fields.order_resource",
    fromlist=["order_resource"],
)
original_direct_auth = order_module.native_round2_order_proof_from_resources

def timed_raw_order(*args, **kwargs):
    started = perf_counter_ns()
    answer = original_raw_order(*args, **kwargs)
    raw_order_ns.append(perf_counter_ns() - started)
    return answer

def timed_proof_producer(*args, **kwargs):
    started = perf_counter_ns()
    answer = original_proof_producer(*args, **kwargs)
    proof_producer_ns.append(perf_counter_ns() - started)
    return answer

def timed_direct_auth(*args, **kwargs):
    started = perf_counter_ns()
    answer = original_direct_auth(*args, **kwargs)
    proof_direct_auth_ns.append(perf_counter_ns() - started)
    return answer

flint.number_field_order_from_polynomial_resource = timed_raw_order
flint.number_field_round2_proof_resource = timed_proof_producer
order_module.native_round2_order_proof_from_resources = timed_direct_auth
elapsed = []
byte_sizes = []
certified_primes = [
    2, 3, 5, 37, 59, 277, 311, 613, 719, 1319, 2894951, 6222169
]
for unused in range(${samples}):
    started = perf_counter_ns()
    order, proof = _native_order_with_round2_proof_from_polynomial_resource_bound(
        resource,
        coefficients,
        certified_primes,
    )
    elapsed.append(perf_counter_ns() - started)
    if not order.complete or proof is None or not proof.certified:
        raise AssertionError("vector429 full native proof did not certify")
    rows = [list(row) for row in order.basis.numerator]
    if not authenticated_round2_order_proof_matches(
        proof,
        polynomial=coefficients,
        certified_primes=certified_primes,
        basis_numerator=rows,
        basis_denominator=order.basis.denominator,
        index=order.index,
        equation_discriminant=order.equation_discriminant,
        order_discriminant=order.order_discriminant,
    ):
        raise AssertionError("vector429 full native proof lost its exact source binding")
    byte_sizes.append(
        len(coefficients)
        + len(proof.certified_primes)
        + sum(len(row) for row in proof.basis_numerator)
    )

print(json.dumps({
    "schema": "sagejs.benchmark/number-field-round2-proof-resource-v1",
    "case_id": case["id"],
    "degree": len(coefficients) - 1,
    "primes": certified_primes,
    "sample_count": len(elapsed),
    "startup_and_setup_ns": startup_and_setup_ns,
    "raw_native_order_ns": raw_order_ns,
    "proof_native_independent_check_ns": proof_producer_ns,
    "proof_direct_auth_total_ns": proof_direct_auth_ns,
    "proof_projection_decode_snapshot_ns": [
        total - native
        for total, native in zip(proof_direct_auth_ns, proof_producer_ns)
    ],
    "combined_order_and_proof_ns": elapsed,
    "authenticated_projection_integer_count": byte_sizes,
    "exact": True,
    "round2_replays_during_proof": 0,
}))
`;

const result = spawnSync(
  process.execPath,
  [join(root, "bin/sagejs"), "--python"],
  {
    cwd: root,
    encoding: "utf8",
    input: program,
    timeout: 60_000 * samples,
    maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, SAGEJS_NATIVE_REQUIRED: "1" },
  },
);
if (result.error) throw result.error;
assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
const report = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
const ordered = [...report.combined_order_and_proof_ns].sort(
  (left, right) => left - right,
);
report.statistics = {
  combined_median_ms: ordered[Math.floor(ordered.length / 2)] / 1e6,
  startup_and_setup_ms: report.startup_and_setup_ns / 1e6,
  raw_native_order_ms: report.raw_native_order_ns[0] / 1e6,
  proof_native_independent_check_ms:
    report.proof_native_independent_check_ns[0] / 1e6,
  proof_direct_auth_total_ms: report.proof_direct_auth_total_ns[0] / 1e6,
  proof_projection_decode_snapshot_ms:
    report.proof_projection_decode_snapshot_ns[0] / 1e6,
  target_ms: 5000,
  target_met: ordered[Math.floor(ordered.length / 2)] < 5e9,
};
report.identity = {
  fixture_sha256: createHash("sha256")
    .update(readFileSync(fixturePath))
    .digest("hex"),
  proof_source_sha256: createHash("sha256")
    .update(
      readFileSync(
        join(
          root,
          "src/lib/sagejs/number_fields/field_analysis_resource.py",
        ),
      ),
    )
    .digest("hex"),
  node: process.version,
};
report.host = {
  platform: platform(),
  architecture: arch(),
  cpu: cpus()[0]?.model || "unknown",
};
if (assertTarget) {
  assert(report.statistics.target_met, JSON.stringify(report.statistics));
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
