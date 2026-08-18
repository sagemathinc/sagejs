#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");

const differentialSource = String.raw`
import sagejs.number_fields.discriminant_perfect_power_kernel as packed_power
from sagejs.native import execution_mode
from sagejs.number_fields.discriminant_components import perfect_power_data

packed = packed_power.packed_perfect_power_data_in_place
dynamic = getattr(packed, "__sagejs_native_source__", packed)
cases = [
    -1,
    0,
    1,
    2,
    -2,
    64,
    -64,
    4096,
    -(2**45),
    6**30,
    17**35,
    -(19**21),
    18446744073709551629,
    170141183460469231731687303715884105727,
]
for number in cases:
    expected = perfect_power_data(number)
    dynamic_result = packed_power.validated_perfect_power_data(
        number, perfect_power_data, kernel=dynamic
    )
    packed_result = packed_power.validated_perfect_power_data(
        number, perfect_power_data, kernel=packed
    )
    assert dynamic_result == expected
    assert packed_result == expected

# A genuine power runs one primitive-base maximality control.
checks = []
def counted_readable(number):
    checks.append(number)
    return perfect_power_data(number)
assert packed_power.validated_perfect_power_data(
    6**30, counted_readable, kernel=packed
) == (6, 30)
assert checks == [6]

# Nonpowers do not repeat the expensive readable scan.
checks = []
assert packed_power.validated_perfect_power_data(
    18446744073709551629, counted_readable, kernel=packed
) == (18446744073709551629, 1)
assert checks == []

# Invalid storage is transactional in dynamic and compiled execution.
for candidate in (dynamic, packed):
    output = packed_power.kernel_integer_zeros(candidate, 2, 4)
    primes = packed_power.kernel_uint64_buffer(candidate, [2, 3])
    assert not candidate(output, primes, 64, 7, 3)
    assert list(packed_power.integer_buffer_values(output)) == [0, 0]

# Equality alone is insufficient: reject a nonmaximal but exact pair.
def nonmaximal(output, primes, number, number_bits, prime_count):
    output[0] = 8
    output[1] = 2
    return True
assert packed_power.validated_perfect_power_data(
    64, perfect_power_data, kernel=nonmaximal
) is None

# Corrupt sign, exponent, and identity data all request readable fallback.
def corrupt(output, primes, number, number_bits, prime_count):
    output[0] = -2
    output[1] = 6
    return True
assert packed_power.validated_perfect_power_data(
    64, perfect_power_data, kernel=corrupt
) is None

# Uncompiled platforms, including native Windows fallback, stay readable.
saved_is_compiled = packed_power.is_compiled
packed_power.is_compiled = lambda function: False
checks = []
try:
    assert packed_power.compiled_perfect_power_data(
        64, counted_readable
    ) is None
finally:
    packed_power.is_compiled = saved_is_compiled
assert checks == []
`;

test("CPython packed perfect powers match maximal readable semantics", () => {
  const source = String.raw`
import sys
sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})
${differentialSource}
assert execution_mode(packed) == "dynamic"
`;
  const result = spawnSync(pythonExecutable(), ["-c", source], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("compiled perfect powers match dynamic and reject corruption", async () => {
  const { createSage } = require("../dist/tools/kernel.js");
  const session = await createSage();
  try {
    const result = await session.evaluate(String.raw`
${differentialSource}
execution_mode(packed)
`);
    assert.equal(result.stderr ?? "", "");
    assert.match(result.repr, /^(?:'native-capable'|'compiled'|'native')$/);
  } finally {
    await session.close();
  }
});
