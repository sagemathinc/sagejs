#!/usr/bin/env node
"use strict";

const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const sources = [
  join(
    root,
    "src",
    "lib",
    "sagejs",
    "polynomial_algorithms",
    "packed_prime_xgcd.py",
  ),
  ...["packed_prime_field.py", "packed_flint.py"].map((name) =>
    join(root, "src", "lib", "sagejs", "kernels", "polynomial", name)
  ),
];

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    ...options,
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}

const witness = String.raw`
import sagejs.runtime as runtime
from sagejs.polynomial_algorithms.packed_prime_xgcd import packed_prime_field_polynomial_xgcd
import time


def kernel_xgcd(left, right, prime):
    capacity = max(1, left._coefficient_length(), right._coefficient_length())
    gcd_output = runtime.uint64_buffer(capacity)
    left_output = runtime.uint64_buffer(capacity)
    right_output = runtime.uint64_buffer(capacity)
    lengths = runtime.uint64_buffer(3)
    workspace = runtime.uint64_buffer(7 * capacity)
    assert packed_prime_field_polynomial_xgcd(
        gcd_output,
        left_output,
        right_output,
        lengths,
        left._storage,
        right._storage,
        workspace,
        prime,
    )
    return (
        left._new(
            runtime.uint64_buffer_prefix(gcd_output, runtime.number(lengths[0]))
        ),
        left._new(
            runtime.uint64_buffer_prefix(left_output, runtime.number(lengths[1]))
        ),
        left._new(
            runtime.uint64_buffer_prefix(right_output, runtime.number(lengths[2]))
        ),
    )


def public_divrem_xgcd(left, right):
    ring = left.parent()
    old_remainder = left
    remainder = right
    old_left = ring(1)
    left_coefficient = ring(0)
    old_right = ring(0)
    right_coefficient = ring(1)
    while remainder:
        quotient, next_remainder = old_remainder.quo_rem(remainder)
        old_remainder, remainder = remainder, next_remainder
        old_left, left_coefficient = (
            left_coefficient,
            old_left - quotient * left_coefficient,
        )
        old_right, right_coefficient = (
            right_coefficient,
            old_right - quotient * right_coefficient,
        )
    if not old_remainder:
        return old_remainder, old_left, old_right
    scale = old_remainder.parent().base_ring()(1) / old_remainder[
        old_remainder.degree()
    ]
    return old_remainder * scale, old_left * scale, old_right * scale


field = GF(65521)
ring = PolynomialRing(field, "x")
seed = 0x12345678
print("degree,kernel_ms,repeated_public_divrem_ms,speedup")
for degree in [16, 32, 64, 128]:
    left_values = []
    right_values = []
    for _index in range(degree + 1):
        seed = (1664525 * seed + 1013904223) % (2**32)
        left_values.append(seed % 65521)
    for _index in range(degree):
        seed = (1664525 * seed + 1013904223) % (2**32)
        right_values.append(seed % 65521)
    left_values[-1] = 1
    right_values[-1] = 1
    left = ring(left_values)
    right = ring(right_values)
    expected = public_divrem_xgcd(left, right)
    actual = kernel_xgcd(left, right, field._modulus)
    assert actual == expected
    assert actual[1] * left + actual[2] * right == actual[0]
    for _repeat in range(3):
        kernel_xgcd(left, right, field._modulus)
        public_divrem_xgcd(left, right)
    kernel_samples = []
    public_samples = []
    for _repeat in range(9):
        started = time.perf_counter()
        kernel_xgcd(left, right, field._modulus)
        kernel_samples.append(1000 * (time.perf_counter() - started))
        started = time.perf_counter()
        public_divrem_xgcd(left, right)
        public_samples.append(1000 * (time.perf_counter() - started))
    kernel_samples.sort()
    public_samples.sort()
    kernel_ms = kernel_samples[4]
    public_ms = public_samples[4]
    print(
        str(degree)
        + ","
        + str(round(kernel_ms, 4))
        + ","
        + str(round(public_ms, 4))
        + ","
        + str(round(public_ms / kernel_ms, 2))
    )
`;

const temporary = mkdtempSync(join(tmpdir(), "sagejs-prime-poly-xgcd-bench-"));
const cache = join(temporary, "cache");
const witnessPath = join(temporary, "witness.py");
try {
  writeFileSync(witnessPath, witness);
  for (const source of sources) {
    run(sagejs, ["native", "compile", source, "--cache-root", cache]);
  }
  process.stdout.write(run(sagejs, [witnessPath], {
    env: {
      SAGEJS_NATIVE_CACHE_DIR: cache,
      SAGEJS_NATIVE_REQUIRED: "1",
    },
  }));
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
