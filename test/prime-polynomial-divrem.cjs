// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");

function runSage(source, environment = {}) {
  const result = spawnSync(process.execPath, [sagejs, "--python"], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    input: source,
    timeout: 60_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim().split("\n");
}

const witness = String.raw`
from sagejs.kernels.polynomial.packed_flint import flint_packed_prime_field_polynomial_divrem
from sagejs.native import is_compiled
import time

seed = 0x12345678
for prime in [2, 3, 7, 97, 65521]:
    field = GF(prime)
    ring = PolynomialRing(field, "x")
    x = ring.gen()
    for dividend_length, divisor_length in [(0, 1), (1, 2), (9, 1), (17, 5), (61, 23)]:
        dividend = []
        divisor = []
        for _index in range(dividend_length):
            seed = (1664525 * seed + 1013904223) % (2**32)
            dividend.append(seed % prime)
        for _index in range(divisor_length):
            seed = (1664525 * seed + 1013904223) % (2**32)
            divisor.append(seed % prime)
        if divisor_length:
            divisor[-1] = 1 + divisor[-1] % (prime - 1)
        left = ring(dividend)
        right = ring(divisor)
        quotient, remainder = left.quo_rem(right)
        assert quotient * right + remainder == left
        assert remainder == 0 or remainder.degree() < right.degree()
        assert (left // right, left % right) == (quotient, remainder)

ring = PolynomialRing(GF(7), "x")
x = ring.gen()
try:
    (x + 1).quo_rem(ring(0))
except ZeroDivisionError:
    pass
else:
    raise AssertionError("zero polynomial division unexpectedly succeeded")

# NATIVE_BENCH_START
field = GF(65521)
ring = PolynomialRing(field, "u")
for divisor_length, quotient_length, budget in [(301, 1501, 1.5), (1001, 4001, 2.5)]:
    divisor = ring([(7 * index + 3) % 65521 for index in range(divisor_length)])
    expected_quotient = ring(
        [(13 * index + 9) % 65521 for index in range(quotient_length)]
    )
    expected_remainder = ring(
        [(19 * index + 1) % 65521 for index in range(101)]
    )
    dividend = divisor * expected_quotient + expected_remainder
    for _repeat in range(3):
        quotient, remainder = dividend.quo_rem(divisor)
        assert quotient == expected_quotient
        assert remainder == expected_remainder
    samples = []
    for _repeat in range(11):
        started = time.perf_counter()
        quotient, remainder = dividend.quo_rem(divisor)
        samples.append(1000 * (time.perf_counter() - started))
    samples.sort()
    elapsed = samples[len(samples) // 2]
    assert elapsed < budget, (divisor_length, quotient_length, elapsed)
    print(str(divisor_length) + "/" + str(quotient_length) + "=" + str(round(elapsed, 3)))
# NATIVE_BENCH_END

print("compiled=" + str(is_compiled(flint_packed_prime_field_polynomial_divrem)))
print("PRIME_POLYNOMIAL_DIVREM_OK")
`;

test("packed GF(p)[x] divrem is differential, native, and fast", () => {
  const native = runSage(witness, { SAGEJS_NATIVE_REQUIRED: "1" });
  assert.ok(native.includes("compiled=True"), native.join("\n"));
  assert.ok(native.includes("PRIME_POLYNOMIAL_DIVREM_OK"), native.join("\n"));

  const dynamic = runSage(witness.replace(
    /# NATIVE_BENCH_START[\s\S]*?# NATIVE_BENCH_END/,
    "",
  ), { SAGEJS_NATIVE_DISABLE: "1" });
  assert.ok(dynamic.includes("PRIME_POLYNOMIAL_DIVREM_OK"), dynamic.join("\n"));
});

test("generated FLINT divrem has transactional and alias-safe outputs", () => {
  const flint = require("../packages/flint");
  const quotient = new BigUint64Array(3).fill(91n);
  const remainder = new BigUint64Array(2).fill(92n);
  assert.equal(
    flint.ffiNmodPolyDivRem(
      quotient,
      remainder,
      BigUint64Array.from([2n, 3n, 0n, 0n, 1n]),
      BigUint64Array.from([1n, 0n, 1n]),
      3n,
      2n,
      5n,
      3n,
      7n,
    ),
    true,
  );
  assert.deepEqual(Array.from(quotient), [6n, 0n, 1n]);
  assert.deepEqual(Array.from(remainder), [3n, 3n]);

  const rejectedQuotient = BigUint64Array.from([81n, 82n, 83n]);
  const rejectedRemainder = BigUint64Array.from([84n, 85n]);
  assert.throws(
    () => flint.ffiNmodPolyDivRem(
      rejectedQuotient,
      rejectedRemainder,
      BigUint64Array.from([2n, 3n, 0n, 0n, 1n]),
      BigUint64Array.from([0n, 0n, 0n]),
      3n,
      2n,
      5n,
      3n,
      7n,
    ),
    /invalid packed polynomial quotient and remainder/,
  );
  assert.deepEqual(Array.from(rejectedQuotient), [81n, 82n, 83n]);
  assert.deepEqual(Array.from(rejectedRemainder), [84n, 85n]);

  const aliased = BigUint64Array.from([3n, 6n, 2n]);
  assert.equal(
    flint.ffiNmodPolyDivRem(
      aliased,
      new BigUint64Array(0),
      aliased,
      BigUint64Array.from([3n]),
      3n,
      0n,
      3n,
      1n,
      7n,
    ),
    true,
  );
  assert.deepEqual(Array.from(aliased), [1n, 2n, 3n]);
});
