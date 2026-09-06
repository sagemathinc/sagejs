#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { compile } = require("@sagemath/sagejs/native");

const root = resolve(__dirname, "..");
const packagePath = join(root, "packages", "flint");
const witnessPath = join(
  root,
  "tools",
  "native-kernel",
  "test",
  "positive-rational-log-resource-witness.py",
);

function matrix(flint, rows, values) {
  const result = flint.ffiFmpzMatrixCreate(BigInt(rows), 1n);
  try {
    for (let index = 0; index < values.length; index += 1) {
      assert.equal(
        flint.ffiFmpzMatrixSetEntry(
          result,
          BigInt(index),
          0n,
          BigInt(values[index]),
        ),
        true,
      );
    }
    return result;
  } catch (error) {
    flint.ffiFmpzMatrixClose(result);
    throw error;
  }
}

function entries(flint, resource) {
  const rows = Number(flint.ffiFmpzMatrixNrows(resource));
  return Array.from(
    { length: rows },
    (_, row) => flint.ffiFmpzMatrixEntry(resource, BigInt(row), 0n),
  );
}

test("rational-log resource rejects aliases and accounts partial failure", () => {
  const manifest = require(join(packagePath, "build/generated-ffi/manifest.json"));
  const flint = require(join(
    packagePath,
    "build/generated-ffi",
    manifest.addon,
  ));
  const accounted = flint.__sagejsFfiResourceExternalMemory;
  const output = matrix(flint, 8, Array(8).fill(0n));
  const numerators = matrix(flint, 8, [
    1n,
    2n,
    1n,
    (1n << 521n) + 17n,
    31n,
    37n,
    41n,
    43n,
  ]);
  const denominators = matrix(flint, 8, [
    1n,
    1n,
    3n,
    37n,
    47n,
    53n,
    59n,
    61n,
  ]);
  const failingOutput = matrix(flint, 4, [0n, 0n, 0n, 0n]);
  const failingNumerators = matrix(flint, 2, [1n << 20_000n, 0n]);
  const failingDenominators = matrix(flint, 2, [1n, 1n]);
  const resources = [
    output,
    numerators,
    denominators,
    failingOutput,
    failingNumerators,
    failingDenominators,
  ];
  try {
    assert.equal(
      flint.ffiPositiveRationalLogBallsResource(
        output,
        numerators,
        denominators,
        4n,
        96n,
      ),
      true,
    );
    const logarithms = entries(flint, output);
    assert.deepEqual(logarithms.slice(0, 2), [0n, 0n]);
    assert.ok(logarithms[2] > 0n && logarithms[2] <= logarithms[3]);
    assert.ok(logarithms[4] <= logarithms[5] && logarithms[5] < 0n);
    assert.ok(logarithms[6] <= logarithms[7]);

    const originalNumerators = entries(flint, numerators);
    const originalDenominators = entries(flint, denominators);
    assert.throws(
      () => flint.ffiPositiveRationalLogBallsResource(
        numerators,
        numerators,
        denominators,
        4n,
        96n,
      ),
      /aliases/,
    );
    assert.throws(
      () => flint.ffiPositiveRationalLogBallsResource(
        denominators,
        numerators,
        denominators,
        4n,
        96n,
      ),
      /aliases/,
    );
    assert.deepEqual(entries(flint, numerators), originalNumerators);
    assert.deepEqual(entries(flint, denominators), originalDenominators);

    const accountedBeforeFailure = accounted(failingOutput);
    assert.throws(
      () => flint.ffiPositiveRationalLogBallsResource(
        failingOutput,
        failingNumerators,
        failingDenominators,
        2n,
        4096n,
      ),
      /entries/,
    );
    assert.ok(accounted(failingOutput) > accountedBeforeFailure);
  } finally {
    for (const resource of resources.reverse()) {
      flint.ffiFmpzMatrixClose(resource);
      assert.equal(accounted(resource), 0n);
      flint.ffiFmpzMatrixClose(resource);
    }
  }
});

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 180_000,
    ...options,
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function program(expectNative) {
  return String.raw`
from positive_rational_log_resource_witness import positive_rational_log_batch
from sagejs.ffi.flint import fmpz_matrix


def exact_atanh_bounds(numerator, denominator, scale):
    lower = 0
    upper = 0
    numerator_power = numerator
    denominator_power = denominator
    numerator_square = numerator * numerator
    denominator_square = denominator * denominator
    index = 0
    while index < 20000:
        odd = 2 * index + 1
        term_denominator = odd * denominator_power
        term_lower = (2 * scale * numerator_power) // term_denominator
        lower += term_lower
        upper += term_lower + 1
        next_numerator_power = numerator_power * numerator_square
        next_denominator_power = denominator_power * denominator_square
        tail_numerator = 2 * scale * next_numerator_power * denominator_square
        tail_denominator = (
            (odd + 2)
            * next_denominator_power
            * (denominator_square - numerator_square)
        )
        if tail_numerator < tail_denominator:
            return lower, upper + 1
        numerator_power = next_numerator_power
        denominator_power = next_denominator_power
        index += 1
    raise AssertionError("exact logarithm oracle did not converge")


def exact_log_bounds(numerator, denominator, scale):
    if numerator == denominator:
        return 0, 0
    exponent = 0
    normalized_numerator = numerator
    normalized_denominator = denominator
    while normalized_numerator >= 2 * normalized_denominator:
        normalized_denominator *= 2
        exponent += 1
    while normalized_numerator < normalized_denominator:
        normalized_numerator *= 2
        exponent -= 1
    lower, upper = exact_atanh_bounds(
        normalized_numerator - normalized_denominator,
        normalized_numerator + normalized_denominator,
        scale,
    )
    log_two_lower, log_two_upper = exact_atanh_bounds(1, 3, scale)
    if exponent >= 0:
        return (
            lower + exponent * log_two_lower,
            upper + exponent * log_two_upper,
        )
    return (
        lower + exponent * log_two_upper,
        upper + exponent * log_two_lower,
    )


pairs = [(1, 1), (2, 1), (1, 3), (2**521 + 17, 37)]
precision = 96
reference_extra = 64
count = len(pairs)
numerators = fmpz_matrix(count, 1)
denominators = fmpz_matrix(count, 1)
output = fmpz_matrix(2 * count, 1)
for index, pair in enumerate(pairs):
    numerators[index, 0] = pair[0]
    denominators[index, 0] = pair[1]

assert positive_rational_log_batch.nativeAvailable is ${expectNative ? "True" : "False"}
assert positive_rational_log_batch(
    output, numerators, denominators, count, precision
)
for index, pair in enumerate(pairs):
    lower = output[2 * index, 0]
    upper = output[2 * index + 1, 0]
    reference_lower, reference_upper = exact_log_bounds(
        pair[0], pair[1], 1 << (precision + reference_extra)
    )
    assert lower <= upper
    assert lower << reference_extra <= reference_lower
    assert reference_upper <= upper << reference_extra

for aliased in (numerators, denominators):
    try:
        positive_rational_log_batch(
            aliased, numerators, denominators, count, precision
        )
        raise AssertionError("aliased rational-log output succeeded")
    except ValueError:
        pass

bad_numerators = fmpz_matrix(2, 1)
bad_denominators = fmpz_matrix(2, 1)
bad_output = fmpz_matrix(4, 1)
bad_numerators[0, 0] = 1 << 20000
bad_numerators[1, 0] = 0
bad_denominators[0, 0] = 1
bad_denominators[1, 0] = 1
try:
    positive_rational_log_batch(
        bad_output, bad_numerators, bad_denominators, 2, 4096
    )
    raise AssertionError("invalid later rational-log entry succeeded")
except ValueError:
    pass

for resource in (
    bad_output,
    bad_denominators,
    bad_numerators,
    output,
    denominators,
    numerators,
):
    resource.close()
print("positive-rational-log-resource-ok")
`;
}

test("rational-log resource agrees with an exact oracle natively and dynamically", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-rational-log-resource-"));
  const cacheRoot = join(temporary, "cache");
  const temporaryWitness = join(
    temporary,
    "positive_rational_log_resource_witness.py",
  );
  const executableSource = join(temporary, "positive-rational-log-resource.py");
  try {
    writeFileSync(temporaryWitness, readFileSync(witnessPath, "utf8"));
    const compiled = await compile({ sourcePath: temporaryWitness, cacheRoot });
    assert.match(
      readFileSync(compiled.coreSourcePath, "utf8"),
      /sagejs_flint_positive_rational_log_balls_resource/,
    );
    writeFileSync(executableSource, program(true));
    assert.match(
      run(process.execPath, [join(root, "bin", "sagejs"), executableSource], {
        env: {
          SAGEJS_NATIVE_CACHE_DIR: cacheRoot,
          SAGEJS_NATIVE_REQUIRED: "1",
        },
      }),
      /positive-rational-log-resource-ok/,
    );
    writeFileSync(executableSource, program(false));
    assert.match(
      run(process.execPath, [join(root, "bin", "sagejs"), executableSource], {
        env: {
          SAGEJS_NATIVE_CACHE_DIR: cacheRoot,
          SAGEJS_NATIVE_DISABLE: "1",
        },
      }),
      /positive-rational-log-resource-ok/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
