#!/usr/bin/env node
"use strict";

const { execFileSync, spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const { tmpdir } = os;
const { join } = require("node:path");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const sourceKernel = join(
  root,
  "src",
  "lib",
  "sagejs",
  "polynomial_algorithms",
  "packed_prime_xgcd.py",
);
const flintKernel = join(
  root,
  "src",
  "lib",
  "sagejs",
  "kernels",
  "polynomial",
  "packed_flint.py",
);
const primeKernel = join(
  root,
  "src",
  "lib",
  "sagejs",
  "kernels",
  "polynomial",
  "packed_prime_field.py",
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 240_000,
    ...options,
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stdout + result.stderr);
  return result.stdout;
}

const witness = String.raw`
import sagejs.runtime as runtime
from sagejs.kernels.polynomial.packed_flint import flint_packed_prime_field_polynomial_xgcd
from sagejs.native import is_compiled
from sagejs.polynomial_algorithms.packed_prime_xgcd import packed_prime_field_polynomial_xgcd
import time


source_compiled = is_compiled(packed_prime_field_polynomial_xgcd)
flint_compiled = is_compiled(flint_packed_prime_field_polynomial_xgcd)


def source_call(left, right, prime):
    capacity = max(1, left._coefficient_length(), right._coefficient_length())
    if source_compiled:
        output = runtime.uint64_buffer(3 * capacity + 3)
        left_input = left._storage
        right_input = right._storage
        modulus = runtime.bigint(prime)
    else:
        output = [0] * (3 * capacity + 3)
        left_input = [int(value) for value in left._storage]
        right_input = [int(value) for value in right._storage]
        modulus = prime
    assert packed_prime_field_polynomial_xgcd(
        output, left_input, right_input, modulus
    )
    return output


def decode_source(output, capacity):
    lengths_offset = 3 * capacity
    gcd_length = int(output[lengths_offset])
    left_length = int(output[lengths_offset + 1])
    right_length = int(output[lengths_offset + 2])
    return (
        [int(output[index]) for index in range(gcd_length)],
        [int(output[capacity + index]) for index in range(left_length)],
        [int(output[2 * capacity + index]) for index in range(right_length)],
    )


def trim(values):
    output = [int(value) for value in values]
    while output and output[-1] == 0:
        output.pop()
    return output


def direct_flint_call(left, right, prime):
    capacity = max(1, left._coefficient_length(), right._coefficient_length())
    gcd_output = runtime.uint64_buffer(capacity)
    left_output = runtime.uint64_buffer(capacity)
    right_output = runtime.uint64_buffer(capacity)
    assert flint_packed_prime_field_polynomial_xgcd(
        gcd_output,
        left_output,
        right_output,
        left._storage,
        right._storage,
        capacity,
        left._coefficient_length(),
        right._coefficient_length(),
        prime,
    )
    return trim(gcd_output), trim(left_output), trim(right_output)


def median_milliseconds(function):
    for _repeat in range(5):
        function()
    samples = []
    for _repeat in range(11):
        started = time.perf_counter()
        function()
        samples.append(1000 * (time.perf_counter() - started))
    samples.sort()
    return samples[5]


field = GF(65521)
ring = PolynomialRing(field, "x")
seed = 0x12345678
mode = "compiled" if source_compiled else "dynamic"
print("mode,source_compiled,flint_compiled,degree,source_ms,direct_flint_ms,public_flint_ms")
for degree in [8, 16, 32, 64, 128, 256]:
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
    capacity = max(1, len(left_values), len(right_values))

    public_value = left.xgcd(right)
    source_value = decode_source(source_call(left, right, 65521), capacity)
    direct_value = direct_flint_call(left, right, 65521)
    source_polynomials = [ring(values) for values in source_value]
    direct_polynomials = [ring(values) for values in direct_value]
    public_gcd = [int(value.lift()) for value in public_value[0].coefficients()]
    assert source_value[0] == public_gcd
    assert direct_value[0] == public_gcd
    assert (
        source_polynomials[1] * left
        + source_polynomials[2] * right
        - source_polynomials[0]
    ).is_zero()
    assert (
        direct_polynomials[1] * left
        + direct_polynomials[2] * right
        - direct_polynomials[0]
    ).is_zero()

    source_ms = median_milliseconds(
        lambda: source_call(left, right, 65521)
    )
    direct_ms = median_milliseconds(
        lambda: direct_flint_call(left, right, 65521)
    )
    public_ms = median_milliseconds(lambda: left.xgcd(right))
    print(
        mode
        + ","
        + str(source_compiled)
        + ","
        + str(flint_compiled)
        + ","
        + str(degree)
        + ","
        + str(round(source_ms, 6))
        + ","
        + str(round(direct_ms, 6))
        + ","
        + str(round(public_ms, 6))
    )
`;

const temporary = mkdtempSync(join(tmpdir(), "sagejs-prime-poly-xgcd-bench-"));
const cache = join(temporary, "cache");
const witnessPath = join(temporary, "witness.py");
try {
  writeFileSync(witnessPath, witness);
  run(sagejs, ["native", "compile", sourceKernel, "--cache-root", cache]);
  run(sagejs, ["native", "compile", flintKernel, "--cache-root", cache]);
  run(sagejs, ["native", "compile", primeKernel, "--cache-root", cache]);

  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const cpu = os.cpus()[0]?.model || "unknown";
  console.log(`# revision=${revision}`);
  console.log(
    `# host=${os.hostname()} platform=${process.platform}-${process.arch} ` +
      `node=${process.version} cpu=${cpu}`,
  );
  console.log("# prime=65521 warmup=5 samples=11 statistic=median");

  process.stdout.write(
    run(sagejs, [witnessPath], {
      env: {
        SAGEJS_NATIVE_CACHE_DIR: cache,
        SAGEJS_NATIVE_REQUIRED: "1",
      },
    }),
  );
  process.stdout.write(
    run(sagejs, [witnessPath], {
      env: {
        SAGEJS_NATIVE_CACHE_DIR: cache,
        SAGEJS_NATIVE_DISABLE: "1",
      },
    }),
  );
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
