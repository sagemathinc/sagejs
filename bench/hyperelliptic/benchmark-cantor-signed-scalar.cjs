#!/usr/bin/env node

"use strict";

const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { isAbsolute, join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

const defaultRoot = join(__dirname, "..", "..");
const requestedRoot = argument("--root", defaultRoot);
const root = isAbsolute(requestedRoot)
  ? resolve(requestedRoot)
  : resolve(process.cwd(), requestedRoot);
const items = Number(argument("--items", "64"));
const samples = Number(argument("--samples", "7"));
const warmups = Number(argument("--warmups", "2"));
const referenceSamples = Number(argument("--reference-samples", "3"));
const expected = argument("--expect", "none");
if (!Number.isSafeInteger(items) || items < 1 || items > 4096) {
  throw new Error("--items must be an integer in [1, 4096]");
}
if (!Number.isSafeInteger(samples) || samples < 1 || samples > 101) {
  throw new Error("--samples must be an integer in [1, 101]");
}
if (!Number.isSafeInteger(warmups) || warmups < 0 || warmups > 100) {
  throw new Error("--warmups must be an integer in [0, 100]");
}
if (
  !Number.isSafeInteger(referenceSamples) ||
  referenceSamples < 1 ||
  referenceSamples > 21
) {
  throw new Error("--reference-samples must be an integer in [1, 21]");
}
if (!["none", "binary", "signed"].includes(expected)) {
  throw new Error("--expect must be none, binary, or signed");
}

const sagejs = join(root, "bin", "sagejs");
const source = join(
  root,
  "src",
  "lib",
  "sagejs",
  "hyperelliptic_curves",
  "jacobian_kernels.py",
);
const temporary = mkdtempSync(join(tmpdir(), "sagejs-cantor-signed-scalar-"));
const cache = join(temporary, "cache");
const program = join(temporary, "benchmark.py");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 600_000,
    ...options,
    env: {
      ...process.env,
      SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY: "off",
      ...options.env,
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  return result.stdout.trim();
}

const witness = String.raw`
import json
import time
from statistics import median
from sagejs.native import is_compiled
from sagejs.hyperelliptic_curves.jacobian_kernels import packed_cantor_scalar_batch


ITEMS = ${items}
SAMPLES = ${samples}
WARMUPS = ${warmups}
REFERENCE_SAMPLES = ${referenceSamples}
EXPECTED = ${JSON.stringify(expected)}


def binary_operations(value):
    magnitude = abs(value)
    bits = 0
    ones = 0
    while magnitude:
        bits += 1
        ones += magnitude % 2
        magnitude //= 2
    return ones + max(0, bits - 1)


def signed_operations(value):
    magnitude = abs(value)
    operations = 0
    started = False
    while magnitude:
        if magnitude % 2:
            digit = 1 if magnitude == 1 else 2 - magnitude % 4
            magnitude -= digit
            if started:
                operations += 1
            else:
                started = True
        magnitude //= 2
        if magnitude:
            operations += 1
    return operations


assert is_compiled(packed_cantor_scalar_batch)
R = PolynomialRing(GF(1009), "x")
x = R.gen()
rows = []
for genus, curve in (
    (2, HyperellipticCurve(x**5 + x + 1)),
    (3, HyperellipticCurve(x**7 + 2*x + 1)),
):
    J = curve.jacobian()
    context = J.prepared_arithmetic(algorithm="native", max_batch_items=ITEMS)
    point = context.unpack((1, 0, 1, 0, 0, 1, 0, 0))
    points = (point,) * ITEMS
    cases = (
        ("sparse", 2**255 + 1),
        ("dense", int("fedcba9876543210" * 4, 16) | 1),
        ("all_ones", 2**256 - 1),
    )
    for name, scalar in cases:
        scalars = (scalar,) * ITEMS
        for _index in range(WARMUPS):
            context.scalar_batch(points, scalars, algorithm="native")
        timings = []
        result = None
        for _index in range(SAMPLES):
            started = time.perf_counter_ns()
            result = context.scalar_batch(points, scalars, algorithm="native")
            timings.append(time.perf_counter_ns() - started)
        # Observation and reference replay are deliberately outside timing.
        first = result[0]
        point.scalar_multiple(scalar, algorithm="reference")
        reference_timings = []
        reference = None
        for _index in range(REFERENCE_SAMPLES):
            started = time.perf_counter_ns()
            reference = point.scalar_multiple(scalar, algorithm="reference")
            reference_timings.append(time.perf_counter_ns() - started)
        assert first == reference
        assert result.published_count == 1
        _single, diagnostics = context.scalar_batch(
            (point,), (scalar,), algorithm="native", diagnostics=True
        )
        status = diagnostics.statuses[0]
        binary = binary_operations(scalar)
        signed = signed_operations(scalar)
        if EXPECTED == "binary":
            assert status == binary + 1
        if EXPECTED == "signed":
            assert status == signed + 1
        rows.append(
            {
                "genus": genus,
                "case": name,
                "scalar_bits": scalar.bit_length(),
                "items": ITEMS,
                "median_ns": median(timings),
                "per_item_ns": median(timings) / ITEMS,
                "reference_median_ns": median(reference_timings),
                "kernel_status": status,
                "binary_group_operations": binary,
                "signed_group_operations": signed,
                "operation_ratio": signed / binary,
                "exact": True,
            }
        )
print(json.dumps(rows, sort_keys=True))
`;

try {
  writeFileSync(program, witness);
  run(process.execPath, [sagejs, "native", "compile", source, "--cache-root", cache]);
  const stdout = run(process.execPath, [sagejs, "--python", program], {
    env: { SAGEJS_NATIVE_CACHE_DIR: cache },
  });
  const rows = JSON.parse(stdout.split("\n").at(-1));
  const revision = run("git", ["rev-parse", "HEAD"]);
  const status = run("git", ["status", "--porcelain"]);
  const report = {
    schema: "sagejs.hyperelliptic.cantor-signed-scalar-benchmark/v1",
    revision,
    clean: status.length === 0,
    node: process.version,
    source_sha256: createHash("sha256")
      .update(readFileSync(source))
      .digest("hex"),
    items,
    samples,
    warmups,
    reference_samples: referenceSamples,
    expected,
    rows,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
