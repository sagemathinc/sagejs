#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");

const differentialSource = String.raw`
from sagejs.native import execution_mode
import sagejs.number_fields.discriminant_components as dc
from sagejs.number_fields.discriminant_prefactor_kernel import (
    PREFACTOR_INVALID,
    packed_composite_polynomial_split_hint_in_place,
)

packed = packed_composite_polynomial_split_hint_in_place
dynamic = getattr(packed, "__sagejs_native_source__", packed)
cases = [
    # The derivative-style right input exposes the proper factor 2 of 6.
    ([1, 0, 1], [1, 2], 6),
    # Unit pivots complete without a modulus split.
    ([1, 0, 1], [1, 1], 15),
    # Both zero polynomials modulo q retain the oracle's unresolved state.
    ([21], [42], 21),
    # Negative and oversized coefficients are reduced exactly on ingress.
    ([-91, 0, 1], [143, -14], 35),
    # Several Euclidean iterations with no split.
    ([7, -11, 5, 0, 1], [3, 8, -2, 1], 77),
]

def outcome(result):
    if result["status"] == "split":
        divisor = int(result["divisor"])
        return ("split", divisor)
    if result["status"] == "unresolved":
        return ("unresolved", 0)
    return ("gcd", 0)

for left, right, modulus in cases:
    expected = outcome(dc.polynomial_gcd_mod_composite(left, right, modulus))
    dynamic_result = dc._packed_polynomial_split_hint(
        left, right, modulus, kernel=dynamic
    )
    assert dynamic_result is not None
    assert outcome(dynamic_result) == expected
    packed_result = dc._packed_polynomial_split_hint(
        left, right, modulus, kernel=packed
    )
    assert packed_result is not None
    assert outcome(packed_result) == expected

# Invalid storage is transactional in both execution modes and never publishes
# an outcome.  The compiled adapter needs its own caller-owned packed buffers.
for candidate in (dynamic, packed):
    control = dc.kernel_integer_zeros(candidate, 2, 4)
    workspace = dc.kernel_integer_zeros(candidate, 2, 4)
    left = dc.kernel_integer_buffer(candidate, [1, 1])
    right = dc.kernel_integer_buffer(candidate, [1])
    assert not candidate(control, workspace, left, right, 6, 2, 1, 2)
    assert list(dc.integer_buffer_values(control)) == [PREFACTOR_INVALID, 0]

# Even a successful-looking corrupt result cannot cross host validation.
def corrupt(control, workspace, left, right, modulus, left_length, right_length, capacity):
    control[0] = 2
    control[1] = 4
    return True
assert dc._packed_polynomial_split_hint([1, 0, 1], [1, 2], 6, kernel=corrupt) is None

# Uncompiled or inapplicable selection calls the exact readable oracle.
saved_compiled = dc.is_compiled
saved_oracle = dc.polynomial_gcd_mod_composite
calls = []
def counted(left, right, modulus):
    calls.append(modulus)
    return saved_oracle(left, right, modulus)
dc.is_compiled = lambda function: False
dc.polynomial_gcd_mod_composite = counted
try:
    selected = dc._prefactorization_gcd_outcome([1, 0, 1], [1, 2], 6)
finally:
    dc.is_compiled = saved_compiled
    dc.polynomial_gcd_mod_composite = saved_oracle
assert outcome(selected) == ("split", 2)
assert calls == [6]
`;

test("CPython split-hint source matches the exact readable oracle", () => {
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

test("compiled split hint matches dynamic and rejects corrupt outcomes", async () => {
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
