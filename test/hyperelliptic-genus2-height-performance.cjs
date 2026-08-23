"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const setup = String.raw`
from sagejs.hyperelliptic_curves.genus2_heights import (
    HeightContext,
    canonical_height,
    height_pairing,
    regulator,
)
from sagejs.hyperelliptic_curves.genus2_kummer_height_kernel import (
    dyadic_kummer_height_recurrence,
)
from sagejs.native import (
    integer_buffer_values,
    is_compiled,
    kernel_integer_buffer,
    kernel_integer_zeros,
    kernel_uint64_buffer,
)
from sagejs.number_fields.class_unit_analytic import RealBall
import sagejs.runtime as runtime

R = PolynomialRing(QQ, "x")
x = R.gen()
C = HyperellipticCurve(x**5 - x + 1)
J = C.jacobian()
P = J([x, 1])
Q = J([x - 1, 1])
`;

test("native dyadic recurrence is identical to its ordinary interval fallback", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${setup}
context = HeightContext(J)
precision = 96
steps = 8
scale = 2**precision
integer_coordinates = context.kummer(P).coordinates()
initial_scale = max(abs(value) for value in integer_coordinates)
state = []
for value in integer_coordinates:
    state.extend(((value*scale)//initial_scale, -((-value*scale)//initial_scale)))
terms = []
counts = []
for table in context._classical_duplication_terms:
    counts.append(len(table))
    for term in table:
        terms.extend(term)
fallback_state = list(state)
fallback_output = [0 for _ in range(10*steps)]
fallback_scratch = [0 for _ in range(48)]
fallback = getattr(
    dyadic_kummer_height_recurrence,
    "__wrapped__",
    dyadic_kummer_height_recurrence,
)
fallback_status = fallback(
    fallback_output,
    fallback_state,
    terms,
    counts,
    fallback_scratch,
    scale,
    steps,
)
assert fallback_status == steps
native_match = True
if is_compiled(dyadic_kummer_height_recurrence):
    packed_state = kernel_integer_buffer(dyadic_kummer_height_recurrence, state)
    packed_terms = kernel_integer_buffer(dyadic_kummer_height_recurrence, terms)
    packed_counts = kernel_uint64_buffer(dyadic_kummer_height_recurrence, counts)
    packed_scratch = kernel_integer_zeros(
        dyadic_kummer_height_recurrence, runtime.number(48), runtime.number(8)
    )
    packed_output = kernel_integer_zeros(
        dyadic_kummer_height_recurrence,
        runtime.number(10*steps),
        runtime.number(8),
    )
    native_status = dyadic_kummer_height_recurrence(
        packed_output,
        packed_state,
        packed_terms,
        packed_counts,
        packed_scratch,
        scale,
        steps,
    )
    native_match = (
        native_status == fallback_status
        and integer_buffer_values(packed_output) == fallback_output
        and integer_buffer_values(packed_state) == fallback_state
    )
assert native_match
[is_compiled(dyadic_kummer_height_recurrence), native_match]
`,
      { timeout: 120_000 },
    );
    assert.match(result.repr, /^\[(?:True|False), True\]$/);
  } finally {
    await session.close();
  }
});

test("modular/local height agrees with the exact oracle without large exact state", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${setup}
context = HeightContext(J, max_exact_coordinate_bits=1024)
local = canonical_height(P, steps=8, precision=100, algorithm="local", context=context)
exact = canonical_height(P, steps=8, precision=100, algorithm="exact")
assert local.rigorous and exact.rigorous
assert local.ball.intersection(exact.ball)
assert local.diagnostics["selected_algorithm"] == "local"
assert local.diagnostics["exact_small_step_oracle"]["status"] == "passed"
assert local.diagnostics["asymptotic_state"] == (
    "polynomial-size modular finite state and four bounded real balls"
)
diagnostics = context.diagnostics()
assert diagnostics["direct_kummer_quartic_doublings"] == 2
assert diagnostics["finite_correction_cache_entries"] == 1
assert diagnostics["archimedean_correction_cache_entries"] == 1
[
    local.ball.contains("0.55175981952139493925311708933354526634108654109670"),
    local.diagnostics["enclosure_width_bits"] >= 9,
    diagnostics["direct_kummer_quartic_doublings"],
]
`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "[True, True, 2]");
  } finally {
    await session.close();
  }
});

test("target-bit planning, warm caches, pairings, and regulators remain certified", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${setup}
context = HeightContext(J)
height = canonical_height(P, precision=80, target_bits=16, context=context)
height_again = canonical_height(P, precision=80, target_bits=16, context=context)
assert height.rigorous
assert height.ball.lower == height_again.ball.lower
assert height.ball.upper == height_again.ball.upper
assert height.diagnostics["achieved_enclosure_width_bits"] >= 16
pairing = height_pairing(
    [P, Q], steps=6, precision=80, algorithm="local", context=context
)
reg = regulator(
    [P, Q], steps=6, precision=80, algorithm="local", context=context
)
assert pairing.rigorous
assert reg.rigorous and reg.status == "certified-positive"
diagnostics = context.diagnostics()
assert diagnostics["finite_correction_cache_hits"] > 0
assert diagnostics["archimedean_correction_cache_hits"] > 0
[
    height.steps,
    height.diagnostics["achieved_enclosure_width_bits"] >= 16,
    pairing.rigorous,
    reg.status,
    diagnostics["finite_correction_cache_hits"] > 0,
]
`,
      { timeout: 180_000 },
    );
    assert.match(
      result.repr,
      /^\[\d+, True, True, 'certified-positive', True\]$/,
    );
  } finally {
    await session.close();
  }
});

test("high-precision local tails retain the declared Magma oracle accuracy", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${setup}
context = HeightContext(J)
height = canonical_height(
    P, precision=128, target_bits=128, algorithm="local", context=context
)
# Magma 2.18-5 prints more digits than remain stable as its Precision parameter
# varies.  The first 96 bits are independently stable; do not promote the
# displayed tail to a false 128-bit oracle.
oracle = RealBall(
    "0.55175981952139493925311708933354526634108654109670",
    precision_bits=192,
)
radius = RealBall(1, precision_bits=192) / RealBall(2**96, precision_bits=192)
oracle96 = RealBall(
    oracle.lower - radius.upper,
    oracle.upper + radius.upper,
    precision_bits=192,
)
assert height.ball.intersection(oracle96)
arch = height.diagnostics["archimedean_correction"]["diagnostics"]
assert height.diagnostics["achieved_enclosure_width_bits"] >= 128
assert arch["specialized_quartic_term_counts"] == (12, 15, 16, 14)
assert arch["scale_logarithm_block_size"] == 4
[
    height.steps,
    height.diagnostics["achieved_enclosure_width_bits"],
    arch["scale_logarithm_evaluations"],
]
`,
      { timeout: 120_000 },
    );
    assert.match(result.repr, /^\[\d+, 1\d\d, \d+\]$/);
  } finally {
    await session.close();
  }
});
