#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { cpus, platform, arch } = require("node:os");
const { existsSync, readFileSync } = require("node:fs");
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

case = json.loads(r'''${JSON.stringify(vector)}''')
coefficients = [int(value) for value in case["polynomial"]["coefficients"]]
R = PolynomialRing(ZZ, "x")
K = NumberField(R(coefficients), "a")
polynomial = integral_equation_polynomial(K)
resource = polynomial._exact_polynomial_resource()
startup_and_setup_ns = perf_counter_ns() - program_started

flint = __import__("sagejs.ffi.flint", fromlist=["flint"])
analysis_module = __import__(
    "sagejs.number_fields.field_analysis_resource",
    fromlist=["field_analysis_resource"],
)
certified_primes = [
    2, 3, 5, 37, 59, 277, 311, 613, 719, 1319, 2894951, 6222169
]
hints = flint.fmpz_matrix(len(certified_primes), 1)
for row, prime in enumerate(certified_primes):
    flint.fmpz_matrix_set_entry(hints, row, 0, prime)

raw_order_ns = []
carried_native_ns = []
carried_decode_ns = []
original_raw_order = flint.number_field_order_from_polynomial_resource
original_carried = flint.number_field_order_with_round2_proof_resource
original_decode = analysis_module._decode_current_carried_round2_order_resource

def timed_carried(*args, **kwargs):
    started = perf_counter_ns()
    answer = original_carried(*args, **kwargs)
    carried_native_ns.append(perf_counter_ns() - started)
    return answer

def timed_decode(*args, **kwargs):
    started = perf_counter_ns()
    answer = original_decode(*args, **kwargs)
    carried_decode_ns.append(perf_counter_ns() - started)
    return answer

flint.number_field_order_with_round2_proof_resource = timed_carried
analysis_module._decode_current_carried_round2_order_resource = timed_decode
carried_total_ns = []
byte_sizes = []
for unused in range(${samples}):
    started = perf_counter_ns()
    raw = original_raw_order(resource, hints)
    raw_order_ns.append(perf_counter_ns() - started)
    raw.close()
    started = perf_counter_ns()
    order, proof = analysis_module.native_carried_round2_order_from_resources(
        resource,
        hints,
        coefficients_low_to_high=coefficients,
        certified_primes=certified_primes,
    )
    carried_total_ns.append(perf_counter_ns() - started)
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
    "schema": "sagejs.benchmark/number-field-round2-carried-proof-resource-v1",
    "case_id": case["id"],
    "degree": len(coefficients) - 1,
    "primes": certified_primes,
    "sample_count": len(carried_total_ns),
    "startup_and_setup_ns": startup_and_setup_ns,
    "raw_native_order_ns": raw_order_ns,
    "carried_native_construction_ns": carried_native_ns,
    "carried_terminal_proof_delta_ns": [
        carried - raw
        for carried, raw in zip(carried_native_ns, raw_order_ns)
    ],
    "carried_projection_decode_snapshot_ns": carried_decode_ns,
    "carried_order_and_proof_total_ns": carried_total_ns,
    "authenticated_projection_integer_count": byte_sizes,
    "exact": True,
    "post_construction_round2_replays": 0,
}))
hints.close()
`;

const rssWrapper = String.raw`
import os
import subprocess
import sys
import threading
import time

source = sys.stdin.buffer.read()
process = subprocess.Popen(
    sys.argv[1:],
    stdin=subprocess.PIPE,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    start_new_session=True,
)
result = {}

def communicate():
    result["stdout"], result["stderr"] = process.communicate(source)

worker = threading.Thread(target=communicate)
worker.start()
peak = 0
while worker.is_alive():
    total = 0
    for name in os.listdir("/proc"):
        if not name.isdigit():
            continue
        try:
            stat = open("/proc/" + name + "/stat", encoding="ascii").read()
            close = stat.rfind(")")
            fields = stat[close + 2:].split()
            if int(fields[2]) != process.pid:
                continue
            status = open("/proc/" + name + "/status", encoding="ascii").read()
            for line in status.splitlines():
                if line.startswith("VmRSS:"):
                    total += int(line.split()[1])
                    break
        except (FileNotFoundError, PermissionError, ProcessLookupError, ValueError):
            pass
    peak = max(peak, total)
    time.sleep(0.05)
worker.join()
sys.stdout.buffer.write(result["stdout"])
sys.stderr.buffer.write(result["stderr"])
sys.stderr.write("__SAGEJS_MAX_RSS_KIB__=" + str(peak) + "\n")
raise SystemExit(process.returncode)
`;
const sampleRss = process.platform === "linux";
const result = spawnSync(
  sampleRss ? "python3" : process.execPath,
  sampleRss
    ? [
        "-c",
        rssWrapper,
        process.execPath,
        join(root, "bin/sagejs"),
        "--python",
      ]
    : [join(root, "bin/sagejs"), "--python"],
  {
    cwd: root,
    encoding: "utf8",
    input: program,
    timeout: 60_000 * samples,
    maxBuffer: 32 * 1024 * 1024,
    env: process.env,
  },
);
if (result.error) throw result.error;
assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
const report = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
const peakMatch = result.stderr.match(/__SAGEJS_MAX_RSS_KIB__=(\d+)/);
report.peak_rss_kib = peakMatch ? Number(peakMatch[1]) : null;
const sha256 = (path) =>
  existsSync(path)
    ? createHash("sha256").update(readFileSync(path)).digest("hex")
    : null;
const ordered = [...report.carried_order_and_proof_total_ns].sort(
  (left, right) => left - right,
);
report.statistics = {
  combined_median_ms: ordered[Math.floor(ordered.length / 2)] / 1e6,
  startup_and_setup_ms: report.startup_and_setup_ns / 1e6,
  raw_native_order_ms: report.raw_native_order_ns[0] / 1e6,
  carried_native_construction_ms:
    report.carried_native_construction_ns[0] / 1e6,
  carried_terminal_proof_delta_ms:
    report.carried_terminal_proof_delta_ns[0] / 1e6,
  carried_projection_decode_snapshot_ms:
    report.carried_projection_decode_snapshot_ns[0] / 1e6,
  target_ms: 5000,
  target_met: ordered[Math.floor(ordered.length / 2)] < 5e9,
};
report.identity = {
  fixture_sha256: sha256(fixturePath),
  order_kernel_sha256: sha256(
    join(root, "packages/flint/include/sagejs/number_field_order_ffi.h"),
  ),
  proof_source_sha256: sha256(
    join(root, "src/lib/sagejs/number_fields/field_analysis_resource.py"),
  ),
  native_header_sha256: sha256(
    join(
      root,
      "packages/flint/include/sagejs/number_field_analysis_resource_ffi.h",
    ),
  ),
  ffi_declaration_sha256: sha256(join(root, "ffi/flint.ffi.json")),
  generated_addon_sha256: sha256(
    join(root, "packages/flint/build/generated-ffi/sagejs_flint_ffi.node"),
  ),
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
