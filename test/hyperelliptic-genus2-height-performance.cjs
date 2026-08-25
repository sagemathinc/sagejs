"use strict";

const { execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");
const { resolve } = require("node:path");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

const root = resolve(__dirname, "..");
const kernelSource =
  "src/lib/sagejs/hyperelliptic_curves/genus2_kummer_height_kernel.py";

// Provision the focused development artifact before the public consumer is
// imported. Production builds get the same source-hash-matched functions from
// architecture/native-kernels.json; this call also keeps a standalone test
// from silently exercising only the dynamic fallback.
execFileSync(
  resolve(root, "bin/sagejs"),
  [
    "native",
    "compile",
    kernelSource,
    "--functions",
    "modular_kummer_height_recurrence,modular_kummer_height_recurrence_batch,dyadic_kummer_height_recurrence,dyadic_kummer_height_recurrence_batch,exact_kummer_small_step_batch,dyadic_log_interval_batch",
  ],
  { cwd: root, stdio: "ignore" },
);

const setup = String.raw`
from sagejs.hyperelliptic_curves.genus2_heights import (
    Genus2HeightCapabilityError,
    HeightContext,
    canonical_height,
    height_pairing,
    regulator,
)
from sagejs.hyperelliptic_curves.genus2_kummer_height_kernel import (
    dyadic_log_interval_batch,
    dyadic_kummer_height_recurrence,
    dyadic_kummer_height_recurrence_batch,
    exact_kummer_small_step_batch,
    modular_kummer_height_recurrence,
    modular_kummer_height_recurrence_batch,
)
from sagejs.hyperelliptic_curves.genus2_kummer import Genus2KummerCapabilityError
from sagejs.native import (
    integer_buffer_values,
    is_compiled,
    kernel_integer_buffer,
    kernel_integer_zeros,
    kernel_uint64_buffer,
)
from sagejs.number_fields.class_unit_analytic import IntervalBallField, RealBall
import sagejs.hyperelliptic_curves.genus2_heights as height_module
import sagejs.hyperelliptic_curves.genus2_kummer as kummer_module
import sagejs.runtime as runtime

R = PolynomialRing(QQ, "x")
x = R.gen()
C = HyperellipticCurve(x**5 - x + 1)
J = C.jacobian()
P = J([x, 1])
Q = J([x - 1, 1])
`;

test("normal public import selects native height recurrences and exact fallbacks agree", async () => {
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
coefficients = []
exponents = []
counts = []
for table in context._classical_duplication_terms:
    counts.append(len(table))
    for term in table:
        coefficients.append(term[0])
        exponents.extend(term[1:])
fallback_state = list(state)
fallback_output = [0 for _ in range(10*steps)]
fallback = getattr(
    dyadic_kummer_height_recurrence,
    "__wrapped__",
    dyadic_kummer_height_recurrence,
)
fallback_status = fallback(
    fallback_output,
    fallback_state,
    coefficients,
    exponents,
    counts,
    6144,
    scale,
    steps,
)
assert fallback_status == steps
bounded_state = list(state)
bounded_output = [0 for _ in range(10*steps)]
try:
    fallback(
        bounded_output,
        bounded_state,
        coefficients,
        exponents,
        counts,
        1535,
        scale,
        steps,
    )
except MemoryError:
    pass
else:
    raise AssertionError("undersized exact workspace did not fail closed")
assert bounded_state == state
assert bounded_output == [0 for _ in range(10*steps)]
native_match = True
if is_compiled(dyadic_kummer_height_recurrence):
    packed_state = kernel_integer_buffer(dyadic_kummer_height_recurrence, state)
    packed_coefficients = kernel_integer_buffer(
        dyadic_kummer_height_recurrence, coefficients
    )
    packed_exponents = kernel_uint64_buffer(
        dyadic_kummer_height_recurrence, exponents
    )
    packed_counts = kernel_uint64_buffer(dyadic_kummer_height_recurrence, counts)
    packed_output = kernel_integer_zeros(
        dyadic_kummer_height_recurrence,
        runtime.number(10*steps),
        runtime.number(8),
    )
    native_status = dyadic_kummer_height_recurrence(
        packed_output,
        packed_state,
        packed_coefficients,
        packed_exponents,
        packed_counts,
        runtime.number(6144),
        scale,
        steps,
    )
    native_match = (
        native_status == fallback_status
        and integer_buffer_values(packed_output) == fallback_output
        and integer_buffer_values(packed_state) == fallback_state
    )
    bounded_packed_state = kernel_integer_buffer(
        dyadic_kummer_height_recurrence, state
    )
    bounded_packed_output = kernel_integer_zeros(
        dyadic_kummer_height_recurrence,
        runtime.number(10*steps),
        runtime.number(8),
    )
    try:
        dyadic_kummer_height_recurrence(
            bounded_packed_output,
            bounded_packed_state,
            packed_coefficients,
            packed_exponents,
            packed_counts,
            runtime.number(1535),
            scale,
            steps,
        )
    except MemoryError:
        pass
    else:
        raise AssertionError("native undersized exact workspace did not fail closed")
    assert integer_buffer_values(bounded_packed_state) == state
    assert integer_buffer_values(bounded_packed_output) == [0 for _ in range(10*steps)]
assert native_match

finite_coordinates = context.kummer(P).coordinates()
discriminant_bound = 16*abs(int(str(J.f().discriminant())))
modulus = discriminant_bound**(steps+2)
finite_fallback_output = [0 for _ in range(steps)]
finite_fallback = getattr(
    modular_kummer_height_recurrence,
    "__wrapped__",
    modular_kummer_height_recurrence,
)
finite_fallback_status = finite_fallback(
    finite_fallback_output,
    coefficients,
    exponents,
    counts,
    finite_coordinates[0],
    finite_coordinates[1],
    finite_coordinates[2],
    finite_coordinates[3],
    discriminant_bound,
    modulus,
    steps,
)
assert finite_fallback_status == steps
finite_native_match = True
if is_compiled(modular_kummer_height_recurrence):
    finite_packed_coefficients = kernel_integer_buffer(
        modular_kummer_height_recurrence, coefficients
    )
    finite_packed_exponents = kernel_uint64_buffer(
        modular_kummer_height_recurrence, exponents
    )
    finite_packed_counts = kernel_uint64_buffer(
        modular_kummer_height_recurrence, counts
    )
    finite_packed_output = kernel_integer_zeros(
        modular_kummer_height_recurrence,
        runtime.number(steps),
        runtime.number(4),
    )
    finite_native_status = modular_kummer_height_recurrence(
        finite_packed_output,
        finite_packed_coefficients,
        finite_packed_exponents,
        finite_packed_counts,
        finite_coordinates[0],
        finite_coordinates[1],
        finite_coordinates[2],
        finite_coordinates[3],
        discriminant_bound,
        modulus,
        steps,
    )
    finite_native_match = (
        finite_native_status == finite_fallback_status
        and integer_buffer_values(finite_packed_output) == finite_fallback_output
    )
assert finite_native_match
assert is_compiled(dyadic_kummer_height_recurrence)
assert is_compiled(modular_kummer_height_recurrence)
assert dyadic_kummer_height_recurrence is __import__(
    "sagejs.hyperelliptic_curves.genus2_heights",
    fromlist=("dyadic_kummer_height_recurrence",),
).dyadic_kummer_height_recurrence
[
    is_compiled(dyadic_kummer_height_recurrence),
    native_match,
    is_compiled(modular_kummer_height_recurrence),
    finite_native_match,
]
`,
      { timeout: 120_000 },
    );
    assert.match(
      result.repr,
      /^\[True, True, True, True\]$/,
    );
  } finally {
    await session.close();
  }
});

test("batched Kummer recurrences and exact outward logarithms match scalar proof oracles", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${setup}
batch_context = HeightContext(J)
batch_points = (P, Q, P+Q)
batch_coordinates = tuple(batch_context.kummer(value).coordinates() for value in batch_points)
batch_coefficients = []
batch_exponents = []
batch_counts = []
for table in batch_context._classical_duplication_terms:
    batch_counts.append(len(table))
    for term in table:
        batch_coefficients.append(term[0])
        batch_exponents.extend(term[1:])
batch_steps = 4
batch_count = len(batch_points)
batch_D = 16*abs(int(str(J.f().discriminant())))
batch_modulus = batch_D**(batch_steps+2)

modular_fallback = getattr(
    modular_kummer_height_recurrence_batch,
    "__wrapped__",
    modular_kummer_height_recurrence_batch,
)
modular_dynamic_output = [0 for _ in range(batch_count*batch_steps)]
modular_dynamic_statuses = [0 for _ in range(batch_count)]
modular_dynamic_status = modular_fallback(
    modular_dynamic_output,
    [entry for row in batch_coordinates for entry in row],
    batch_coefficients,
    batch_exponents,
    batch_counts,
    modular_dynamic_statuses,
    batch_D,
    batch_modulus,
    batch_count,
    batch_steps,
)
modular_native_output = kernel_integer_zeros(
    modular_kummer_height_recurrence_batch,
    runtime.number(batch_count*batch_steps),
    runtime.number(8),
)
modular_native_statuses = kernel_uint64_buffer(
    modular_kummer_height_recurrence_batch, [0 for _ in range(batch_count)]
)
modular_native_status = modular_kummer_height_recurrence_batch(
    modular_native_output,
    kernel_integer_buffer(
        modular_kummer_height_recurrence_batch,
        [entry for row in batch_coordinates for entry in row],
    ),
    kernel_integer_buffer(modular_kummer_height_recurrence_batch, batch_coefficients),
    kernel_uint64_buffer(modular_kummer_height_recurrence_batch, batch_exponents),
    kernel_uint64_buffer(modular_kummer_height_recurrence_batch, batch_counts),
    modular_native_statuses,
    batch_D,
    batch_modulus,
    batch_count,
    batch_steps,
)
assert modular_dynamic_status == modular_native_status == batch_count
assert modular_dynamic_statuses == [1,1,1]
assert integer_buffer_values(modular_native_output) == modular_dynamic_output

batch_precision = 96
batch_scale = 2**batch_precision
dyadic_initial = []
for row in batch_coordinates:
    row_scale = max(abs(entry) for entry in row)
    for entry in row:
        dyadic_initial.extend(((entry*batch_scale)//row_scale, -((-entry*batch_scale)//row_scale)))
dyadic_fallback = getattr(
    dyadic_kummer_height_recurrence_batch,
    "__wrapped__",
    dyadic_kummer_height_recurrence_batch,
)
dyadic_dynamic_state = list(dyadic_initial)
dyadic_dynamic_output = [0 for _ in range(10*batch_count*batch_steps)]
dyadic_dynamic_statuses = [0 for _ in range(batch_count)]
dyadic_dynamic_status = dyadic_fallback(
    dyadic_dynamic_output,
    dyadic_dynamic_state,
    batch_coefficients,
    batch_exponents,
    batch_counts,
    dyadic_dynamic_statuses,
    7680,
    batch_scale,
    batch_count,
    batch_steps,
)
dyadic_native_state = kernel_integer_buffer(
    dyadic_kummer_height_recurrence_batch, dyadic_initial
)
dyadic_native_output = kernel_integer_zeros(
    dyadic_kummer_height_recurrence_batch,
    runtime.number(10*batch_count*batch_steps),
    runtime.number(12),
)
dyadic_native_statuses = kernel_uint64_buffer(
    dyadic_kummer_height_recurrence_batch, [0 for _ in range(batch_count)]
)
dyadic_native_status = dyadic_kummer_height_recurrence_batch(
    dyadic_native_output,
    dyadic_native_state,
    kernel_integer_buffer(dyadic_kummer_height_recurrence_batch, batch_coefficients),
    kernel_uint64_buffer(dyadic_kummer_height_recurrence_batch, batch_exponents),
    kernel_uint64_buffer(dyadic_kummer_height_recurrence_batch, batch_counts),
    dyadic_native_statuses,
    runtime.number(7680),
    batch_scale,
    batch_count,
    batch_steps,
)
assert dyadic_dynamic_status == dyadic_native_status == batch_count
assert dyadic_dynamic_statuses == [1,1,1]
assert integer_buffer_values(dyadic_native_output) == dyadic_dynamic_output
assert integer_buffer_values(dyadic_native_state) == dyadic_dynamic_state

exact_fallback = getattr(
    exact_kummer_small_step_batch,
    "__wrapped__",
    exact_kummer_small_step_batch,
)
exact_dynamic_state = [entry for row in batch_coordinates for entry in row]
exact_dynamic_output = [0 for _ in range(14*batch_count)]
exact_dynamic_statuses = [0 for _ in range(batch_count)]
exact_dynamic_status = exact_fallback(
    exact_dynamic_output,
    exact_dynamic_state,
    batch_coefficients,
    batch_exponents,
    batch_counts,
    exact_dynamic_statuses,
    batch_count,
    2,
)
exact_native_state = kernel_integer_buffer(
    exact_kummer_small_step_batch,
    [entry for row in batch_coordinates for entry in row],
)
exact_native_output = kernel_integer_zeros(
    exact_kummer_small_step_batch,
    runtime.number(14*batch_count),
    runtime.number(32),
)
exact_native_statuses = kernel_uint64_buffer(
    exact_kummer_small_step_batch, [0 for _ in range(batch_count)]
)
exact_native_status = exact_kummer_small_step_batch(
    exact_native_output,
    exact_native_state,
    kernel_integer_buffer(exact_kummer_small_step_batch, batch_coefficients),
    kernel_uint64_buffer(exact_kummer_small_step_batch, batch_exponents),
    kernel_uint64_buffer(exact_kummer_small_step_batch, batch_counts),
    exact_native_statuses,
    batch_count,
    2,
)
assert exact_dynamic_status == exact_native_status == batch_count
assert exact_dynamic_statuses == [1,1,1]
assert integer_buffer_values(exact_native_output) == exact_dynamic_output
assert integer_buffer_values(exact_native_state) == exact_dynamic_state

log_checks = []
log_fallback = getattr(
    dyadic_log_interval_batch,
    "__wrapped__",
    dyadic_log_interval_batch,
)
for output_precision in (64,128,256):
    input_precision = output_precision + 320
    input_scale = 2**input_precision
    hostile_endpoints = [
        input_scale, input_scale,
        3*input_scale//2-1, 3*input_scale//2+1,
        input_scale*2**257+123456789, input_scale*2**257+123456999,
        input_scale//2**257-1, input_scale//2**257+1,
    ]
    log_dynamic_output = [0 for _ in hostile_endpoints]
    assert log_fallback(
        log_dynamic_output,
        hostile_endpoints,
        input_precision,
        output_precision,
    )
    log_native_output = kernel_integer_zeros(
        dyadic_log_interval_batch,
        runtime.number(len(hostile_endpoints)),
        runtime.number((output_precision+1023)//64),
    )
    assert dyadic_log_interval_batch(
        log_native_output,
        kernel_integer_buffer(dyadic_log_interval_batch, hostile_endpoints),
        input_precision,
        output_precision,
    )
    native_log_values = integer_buffer_values(log_native_output)
    assert native_log_values == log_dynamic_output
    reference_field = IntervalBallField(output_precision+96)
    for interval_index in range(len(hostile_endpoints)//2):
        input_ball = RealBall.dyadic_endpoints(
            hostile_endpoints[2*interval_index],
            -input_precision,
            hostile_endpoints[2*interval_index+1],
            -input_precision,
            precision_bits=output_precision+96,
        )
        reference_log = reference_field.log(input_ball)
        exact_log = RealBall.dyadic_endpoints(
            native_log_values[2*interval_index],
            -output_precision,
            native_log_values[2*interval_index+1],
            -output_precision,
            precision_bits=output_precision+96,
        )
        assert exact_log.lower <= reference_log.lower
        assert exact_log.upper >= reference_log.upper
    log_checks.append(True)

hostile_R = PolynomialRing(QQ, "z")
z = hostile_R.gen()
hostile_J = HyperellipticCurve(
    z**5 + (2**80+17)*z**4 + 2*z + 1
).jacobian()
hostile_P = hostile_J([z,1])
hostile_context = HeightContext(hostile_J)
hostile_coordinates = hostile_context.kummer(hostile_P).coordinates()
hostile_coefficients = []
hostile_exponents = []
hostile_counts = []
for table in hostile_context._classical_duplication_terms:
    hostile_counts.append(len(table))
    for term in table:
        hostile_coefficients.append(term[0])
        hostile_exponents.extend(term[1:])
hostile_dynamic_output = [0 for _ in range(7)]
hostile_dynamic_state = list(hostile_coordinates)
hostile_dynamic_statuses = [0]
assert exact_fallback(
    hostile_dynamic_output,
    hostile_dynamic_state,
    hostile_coefficients,
    hostile_exponents,
    hostile_counts,
    hostile_dynamic_statuses,
    1,
    1,
) == 1
hostile_native_output = kernel_integer_zeros(
    exact_kummer_small_step_batch, runtime.number(7), runtime.number(64)
)
hostile_native_state = kernel_integer_buffer(
    exact_kummer_small_step_batch, hostile_coordinates
)
assert exact_kummer_small_step_batch(
    hostile_native_output,
    hostile_native_state,
    kernel_integer_buffer(exact_kummer_small_step_batch, hostile_coefficients),
    kernel_uint64_buffer(exact_kummer_small_step_batch, hostile_exponents),
    kernel_uint64_buffer(exact_kummer_small_step_batch, hostile_counts),
    kernel_uint64_buffer(exact_kummer_small_step_batch, [0]),
    1,
    1,
) == 1
assert integer_buffer_values(hostile_native_output) == hostile_dynamic_output
assert integer_buffer_values(hostile_native_state) == hostile_dynamic_state

assert all(is_compiled(function) for function in (
    modular_kummer_height_recurrence_batch,
    dyadic_kummer_height_recurrence_batch,
    exact_kummer_small_step_batch,
    dyadic_log_interval_batch,
))
[modular_native_status,dyadic_native_status,exact_native_status,log_checks,True]
`,
      { timeout: 180_000 },
    );
    assert.equal(result.repr, "[3, 3, 3, [True, True, True], True]");
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
assert local.diagnostics["finite_correction"]["diagnostics"][
    "recurrence_backend"
] == "native-packed-batch-live-exact-dyadic"
assert local.diagnostics["archimedean_correction"]["diagnostics"][
    "recurrence_backend"
] == "native-packed-batch-live-exact-dyadic"
assert local.diagnostics["asymptotic_state"] == (
    "point-major polynomial-size modular state and bounded dyadic balls"
)
diagnostics = context.diagnostics()
assert diagnostics["direct_kummer_quartic_doublings"] == 0
assert diagnostics["finite_correction_cache_entries"] == 0
assert diagnostics["archimedean_correction_cache_entries"] == 0
[
    local.ball.contains("0.55175981952139493925311708933354526634108654109670"),
    local.diagnostics["enclosure_width_bits"] >= 9,
    diagnostics["direct_kummer_quartic_doublings"],
]
`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "[True, True, 0]");
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
equal_P = J([x, 1])
height_equal_point = canonical_height(
    equal_P, precision=80, target_bits=16, context=context
)
assert height.rigorous
assert height.ball.lower == height_again.ball.lower
assert height.ball.upper == height_again.ball.upper
assert height.ball.lower == height_equal_point.ball.lower
assert height.ball.upper == height_equal_point.ball.upper
assert height.diagnostics["achieved_enclosure_width_bits"] >= 16
height_cache_diagnostics = context.diagnostics()
assert height_cache_diagnostics["canonical_height_cache_hits"] == 2
assert height_cache_diagnostics["canonical_height_cache_entries"] == 1
import sagejs.hyperelliptic_curves.genus2_heights as height_module
assert not hasattr(height_module, "_CanonicalHeightCacheEntry")
assert not hasattr(height_module, "_HeightPairingCacheEntry")
assert not hasattr(height_module, "_CANONICAL_HEIGHT_CACHE_PROOF")
assert not hasattr(height_module, "_HEIGHT_PAIRING_CACHE_PROOF")
assert not hasattr(height_module, "_AUTOMATIC_HEIGHT_BOUND_PROOF")
assert not hasattr(height_module, "_automatic_height_bound_is_certified")
assert not hasattr(height_module, "_copy_automatic_height_bound")
assert not hasattr(height_module, "_canonical_heights_uncached_local_batch")
height_lower = height.ball.lower
height_upper = height.ball.upper
fake_height = type(height)(
    RealBall(999, precision_bits=80),
    status="certified-enclosure",
    steps=6,
    provenance=height.provenance,
    bounds=height.bounds,
    diagnostics=height.diagnostics,
)
# A caller may attach familiar-looking attributes to the context, but the
# authenticated cache itself lives only in an inaccessible closure.
context._canonical_heights = {(P, 6, 80, 16, "auto"): fake_height}
height_after_injection = canonical_height(
    P, precision=80, target_bits=16, context=context
)
assert height_after_injection.ball.lower == height_lower
assert height_after_injection.ball.upper == height_upper
# Even bypassing the public seal on an egress object cannot poison the hidden
# detached payload used to reconstruct the next result.
object.__setattr__(height_after_injection, "_ball_data", fake_height._ball_data)
height_after_egress_poison = canonical_height(
    P, precision=80, target_bits=16, context=context
)
assert height_after_egress_poison.ball.lower == height_lower
assert height_after_egress_poison.ball.upper == height_upper
# RationalEndpoint is mutable, so the hidden payload must never retain an
# endpoint object reachable through a public result.
poisoned_height_ball = height_after_egress_poison.ball
poisoned_height_ball.lower.numerator = 777
poisoned_height_ball.lower.denominator = 1
poisoned_height_ball.upper.numerator = 777
poisoned_height_ball.upper.denominator = 1
height_after_endpoint_poison = canonical_height(
    P, precision=80, target_bits=16, context=context
)
assert height_after_endpoint_poison.ball.lower == height_lower
assert height_after_endpoint_poison.ball.upper == height_upper
parameter_misses = context.diagnostics()["canonical_height_cache_misses"]
parameter_height = canonical_height(
    P, steps=7, precision=96, target_bits=32, algorithm="local", context=context
)
assert parameter_height.diagnostics["achieved_enclosure_width_bits"] >= 32
assert context.diagnostics()["canonical_height_cache_misses"] == parameter_misses + 1
original_height_f = J._f
J._f = original_height_f + x**6
height_model_alias_rejected = False
try:
    canonical_height(P, precision=80, target_bits=16, context=context)
except (Genus2HeightCapabilityError, Genus2KummerCapabilityError):
    height_model_alias_rejected = True
finally:
    J._f = original_height_f
assert height_model_alias_rejected
original_height_v = P._v
P._v = R(0)
height_point_alias_rejected = False
try:
    canonical_height(P, precision=80, target_bits=16, context=context)
except (Genus2HeightCapabilityError, Genus2KummerCapabilityError):
    height_point_alias_rejected = True
finally:
    P._v = original_height_v
assert height_point_alias_rejected
automatic = context.automatic_bounds(80)
fake_automatic = type(automatic)(
    RealBall(100, precision_bits=80),
    RealBall(100, precision_bits=80),
    automatic.diagnostics,
)
forged_bound_rejected = False
try:
    context.archimedean_correction(
        P, precision=80, steps=6, bounds=fake_automatic, target_bits=16
    )
except (Genus2HeightCapabilityError, Genus2KummerCapabilityError):
    forged_bound_rejected = True
assert forged_bound_rejected
original_cached_automatic = context._automatic_bounds[80]
context._automatic_bounds[80] = fake_automatic
injected_bound = context.automatic_bounds(80)
injected_bound_rejected = False
try:
    context.archimedean_correction(
        P, precision=80, steps=6, bounds=injected_bound, target_bits=16
    )
except (Genus2HeightCapabilityError, Genus2KummerCapabilityError):
    injected_bound_rejected = True
finally:
    context._automatic_bounds[80] = original_cached_automatic
assert injected_bound_rejected
# A module-global name, including one injected through a function globals
# dictionary, is not an authentication boundary.  The rigorous entry path
# must ignore this familiar-looking replacement.
height_module._automatic_height_bound_is_certified = lambda bound, jacobian: True
canonical_globals = getattr(canonical_height, "__globals__", {})
canonical_globals["_automatic_height_bound_is_certified"] = (
    lambda bound, jacobian: True
)
context._automatic_bounds[80] = fake_automatic
rebound_verifier_rejected = False
exact_bound_injection_rejected = False
try:
    canonical_height(
        Q,
        steps=7,
        precision=80,
        target_bits=17,
        algorithm="local",
        context=context,
    )
except (Genus2HeightCapabilityError, Genus2KummerCapabilityError):
    rebound_verifier_rejected = True
try:
    canonical_height(
        Q,
        steps=4,
        precision=80,
        algorithm="exact",
        context=context,
    )
except (Genus2HeightCapabilityError, Genus2KummerCapabilityError):
    exact_bound_injection_rejected = True
finally:
    context._automatic_bounds[80] = original_cached_automatic
assert rebound_verifier_rejected
assert exact_bound_injection_rejected
object.__setattr__(
    automatic, "_correction_lower_data", fake_automatic._correction_lower_data
)
poisoned_bound_rejected = False
try:
    context.archimedean_correction(
        P, precision=80, steps=6, bounds=automatic, target_bits=16
    )
except (Genus2HeightCapabilityError, Genus2KummerCapabilityError):
    poisoned_bound_rejected = True
assert poisoned_bound_rejected
# Mutating endpoints obtained from a valid public copy must not mutate either
# the context source or the closed theorem-source payload.
safe_automatic = context.automatic_bounds(80)
safe_lower = safe_automatic.correction_lower
safe_upper = safe_automatic.correction_upper
safe_lower.lower.numerator = -100
safe_lower.lower.denominator = 1
safe_lower.upper.numerator = -100
safe_lower.upper.denominator = 1
safe_upper.lower.numerator = -100
safe_upper.lower.denominator = 1
safe_upper.upper.numerator = -100
safe_upper.upper.denominator = 1
height_after_bound_endpoint_poison = canonical_height(
    P, steps=7, precision=80, target_bits=18, algorithm="local", context=context
)
assert height_after_bound_endpoint_poison.rigorous
assert height_after_bound_endpoint_poison.ball.contains(
    "0.55175981952139493925311708933354526634108654109670"
)
# Public egress copies never consume source-proof capacity.  Repeating well
# beyond the bounded registry capacity must leave both memory and proof
# liveness unchanged.
automatic_entries_before = len(context._automatic_bounds)
for _index in range(600):
    repeated_bounds = context.automatic_bounds(80)
assert len(context._automatic_bounds) == automatic_entries_before
assert context.diagnostics()["automatic_bound_proof_source_capacity"] == 512
assert not context.diagnostics()["automatic_bound_egress_registers_source"]
height_after_many_bound_copies = canonical_height(
    Q, steps=7, precision=80, target_bits=19, algorithm="local", context=context
)
assert repeated_bounds.diagnostics["automatic_bound"] == "certified"
assert height_after_many_bound_copies.rigorous
pairing = height_pairing(
    [P, Q], steps=6, precision=80, target_bits=32, algorithm="local", context=context
)
reg = regulator(
    [P, Q], steps=6, precision=80, target_bits=32, algorithm="local", context=context
)
assert pairing.rigorous
assert reg.rigorous and reg.status == "certified-positive"
diagnostics = context.diagnostics()
assert diagnostics["canonical_height_cache_hits"] >= 4
assert diagnostics["height_pairing_cache_hits"] == 1
pairing_matrix = pairing.matrix
fake_pairing = type(pairing)(
    (
        (RealBall(999, precision_bits=80), RealBall(0, precision_bits=80)),
        (RealBall(0, precision_bits=80), RealBall(999, precision_bits=80)),
    ),
    pairing.height_results,
    pairing.diagnostics,
)
context._height_pairings = {
    (tuple([P, Q]), 6, 80, 32, "local"): fake_pairing
}
pairing_after_injection = height_pairing(
    [P, Q],
    steps=6,
    precision=80,
    target_bits=32,
    algorithm="local",
    context=context,
)
assert pairing_after_injection.matrix[0][0].lower == pairing_matrix[0][0].lower
object.__setattr__(
    pairing_after_injection, "_matrix_data", fake_pairing._matrix_data
)
pairing_after_egress_poison = height_pairing(
    [P, Q],
    steps=6,
    precision=80,
    target_bits=32,
    algorithm="local",
    context=context,
)
assert pairing_after_egress_poison.matrix[0][0].lower == pairing_matrix[0][0].lower
poisoned_pairing_entry = pairing_after_egress_poison.matrix[0][0]
poisoned_pairing_entry.lower.numerator = 999
poisoned_pairing_entry.lower.denominator = 1
poisoned_pairing_entry.upper.numerator = 999
poisoned_pairing_entry.upper.denominator = 1
pairing_after_endpoint_poison = height_pairing(
    [P, Q],
    steps=6,
    precision=80,
    target_bits=32,
    algorithm="local",
    context=context,
)
regulator_after_endpoint_poison = regulator(
    [P, Q],
    steps=6,
    precision=80,
    target_bits=32,
    algorithm="local",
    context=context,
)
assert pairing_after_endpoint_poison.matrix[0][0].lower == pairing_matrix[0][0].lower
assert regulator_after_endpoint_poison.rigorous
assert regulator_after_endpoint_poison.status == "certified-positive"
# Public record accessors close over the reviewed primitive decoder.  Rebinding
# the familiar module-private helper after a genuine cache fill must not alter
# any newly reconstructed rigorous capsule.
original_ball_decoder = height_module._ball_from_data
original_ball_encoder = height_module._ball_data
original_data_decoder = height_module._decode_data
original_data_encoder = height_module._encode_data
decoder_alias_ignored = False
try:
    height_module._ball_from_data = (
        lambda data: RealBall(999, precision_bits=80, rigorous=True)
    )
    height_module._ball_data = lambda value: fake_height._ball_data
    height_module._decode_data = lambda data: "poisoned-source"
    height_module._encode_data = lambda data: ("scalar", "poisoned-source")
    decoder_height = canonical_height(
        P, precision=80, target_bits=16, context=context
    )
    decoder_bounds = context.automatic_bounds(80)
    decoder_pairing = height_pairing(
        [P, Q],
        steps=6,
        precision=80,
        target_bits=32,
        algorithm="local",
        context=context,
    )
    decoder_regulator = regulator(
        [P, Q],
        steps=6,
        precision=80,
        target_bits=32,
        algorithm="local",
        context=context,
    )
    decoder_finite = context.finite_correction(P, precision=80, steps=2)
    decoder_arch = context.archimedean_correction(
        P,
        precision=80,
        steps=2,
        bounds=decoder_bounds,
        target_bits=None,
    )
    decoder_alias_ignored = (
        decoder_height.ball.lower == height_lower
        and decoder_bounds.correction_lower.lower != RealBall(999).lower
        and decoder_pairing.matrix[0][0].lower == pairing_matrix[0][0].lower
        and decoder_pairing[0][0].lower == pairing_matrix[0][0].lower
        and decoder_regulator.ball.lower == reg.ball.lower
        and decoder_finite.ball.lower != RealBall(999).lower
        and decoder_arch.ball.lower != RealBall(999).lower
    )
finally:
    height_module._ball_from_data = original_ball_decoder
    height_module._ball_data = original_ball_encoder
    height_module._decode_data = original_data_decoder
    height_module._encode_data = original_data_encoder
assert decoder_alias_ignored
pairing_parameter_misses = context.diagnostics()["height_pairing_cache_misses"]
pairing_parameter = height_pairing(
    [P, Q],
    steps=7,
    precision=96,
    target_bits=16,
    algorithm="local",
    context=context,
)
assert pairing_parameter.rigorous
assert (
    context.diagnostics()["height_pairing_cache_misses"]
    == pairing_parameter_misses + 1
)
original_f = J._f
J._f = x**5 + x**2 - 2*x + 1
mutated_model_alias_rejected = False
try:
    height_pairing(
        [P, Q],
        steps=6,
        precision=80,
        target_bits=32,
        algorithm="local",
        context=context,
    )
except (Genus2HeightCapabilityError, Genus2KummerCapabilityError):
    mutated_model_alias_rejected = True
finally:
    J._f = original_f
assert mutated_model_alias_rejected
J._f = original_f + x**6
unsupported_f_degree_alias_rejected = False
try:
    height_pairing(
        [P, Q],
        steps=6,
        precision=80,
        target_bits=32,
        algorithm="local",
        context=context,
    )
except (Genus2HeightCapabilityError, Genus2KummerCapabilityError):
    unsupported_f_degree_alias_rejected = True
finally:
    J._f = original_f
assert unsupported_f_degree_alias_rejected
original_h = J._h
J._h = x**4
unsupported_h_degree_alias_rejected = False
try:
    height_pairing(
        [P, Q],
        steps=6,
        precision=80,
        target_bits=32,
        algorithm="local",
        context=context,
    )
except (Genus2HeightCapabilityError, Genus2KummerCapabilityError):
    unsupported_h_degree_alias_rejected = True
finally:
    J._h = original_h
assert unsupported_h_degree_alias_rejected
original_v = Q._v
Q._v = R(0)
mutated_point_alias_rejected = False
try:
    height_pairing(
        [P, Q],
        steps=6,
        precision=80,
        target_bits=32,
        algorithm="local",
        context=context,
    )
except (Genus2HeightCapabilityError, Genus2KummerCapabilityError):
    mutated_point_alias_rejected = True
finally:
    Q._v = original_v
assert mutated_point_alias_rejected
original_tables = context._classical_duplication_terms
context._classical_duplication_terms = ()
context._trusted_classical_duplication_terms = ()
pairing_cache_tamper_rejected = False
try:
    height_pairing(
        [P, Q],
        steps=6,
        precision=80,
        target_bits=32,
        algorithm="local",
        context=context,
    )
except Genus2HeightCapabilityError:
    pairing_cache_tamper_rejected = True
finally:
    context._classical_duplication_terms = original_tables
assert pairing_cache_tamper_rejected
[
    height.steps,
    height.diagnostics["achieved_enclosure_width_bits"] >= 16,
    pairing.rigorous,
    reg.status,
    diagnostics["canonical_height_cache_entries"] > 0,
    diagnostics["height_pairing_cache_hits"],
    diagnostics["canonical_height_cache_hits"],
    height_after_egress_poison.rigorous,
    height_after_endpoint_poison.rigorous,
    parameter_height.rigorous,
    height_model_alias_rejected,
    height_point_alias_rejected,
    forged_bound_rejected,
    injected_bound_rejected,
    rebound_verifier_rejected,
    exact_bound_injection_rejected,
    poisoned_bound_rejected,
    height_after_bound_endpoint_poison.rigorous,
    height_after_many_bound_copies.rigorous,
    pairing_after_egress_poison.rigorous,
    pairing_after_endpoint_poison.rigorous,
    regulator_after_endpoint_poison.rigorous,
    decoder_alias_ignored,
    pairing_parameter.rigorous,
    mutated_model_alias_rejected,
    unsupported_f_degree_alias_rejected,
    unsupported_h_degree_alias_rejected,
    mutated_point_alias_rejected,
    pairing_cache_tamper_rejected,
]
`,
      { timeout: 180_000 },
    );
    assert.match(
      result.repr,
      /^\[\d+, True, True, 'certified-positive', True, \d+, \d+, True, True, True, True, True, True, True, True, True, True, True, True, True, True, True, True, True, True, True, True, True, True\]$/,
    );
  } finally {
    await session.close();
  }
});

test("uncached pairings publish one atomic batch and cancellation publishes nothing", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${setup}
scalar_P = canonical_height(
    P, precision=64, target_bits=64, algorithm="local", context=HeightContext(J)
)
scalar_Q = canonical_height(
    Q, precision=64, target_bits=64, algorithm="local", context=HeightContext(J)
)
scalar_sum = canonical_height(
    P+Q, precision=64, target_bits=64, algorithm="local", context=HeightContext(J)
)
batch_context = HeightContext(J)
batch_pairing = height_pairing(
    [P,Q],
    precision=64,
    target_bits=64,
    algorithm="local",
    context=batch_context,
)
assert batch_pairing.rigorous
assert batch_pairing.height_results[0].ball.intersection(scalar_P.ball) is not None
assert batch_pairing.height_results[1].ball.intersection(scalar_Q.ball) is not None
expected_entry = (
    scalar_sum.ball - scalar_P.ball - scalar_Q.ball
) / RealBall(2, precision_bits=64)
assert batch_pairing.matrix[0][1].intersection(expected_entry) is not None
batch_data = batch_pairing.height_results[0].diagnostics["batch"]
assert batch_data["point_count"] == 3
assert batch_data["shared_model_specialization"]
assert batch_data["atomic_publication"]
assert set(batch_data["stage_milliseconds"]) == {
    "shared_preparation",
    "modular_recurrence",
    "dyadic_recurrence",
    "exact_outward_logarithms",
    "exact_small_step_oracle",
}
pairing_diagnostics = batch_pairing.diagnostics
assert set(pairing_diagnostics["cold_proof_stages_ms"]) == {
    "pairwise_divisor_sums",
    "authenticated_missing_scan",
    "automatic_bound_authentication",
    "certified_local_height_batch",
    "authenticated_record_assembly",
    "direct_primitive_polarization",
}
off_diagonal = pairing_diagnostics["off_diagonal_height_data"]
assert len(off_diagonal) == 1
assert off_diagonal[0]["left"] == 0 and off_diagonal[0]["right"] == 1
off_diagonal_ball = off_diagonal[0]["sum_height"]["enclosure"]
assert RealBall(
    off_diagonal_ball["lower"],
    off_diagonal_ball["upper"],
    precision_bits=64,
).intersection(scalar_sum.ball) is not None
assert batch_pairing.to_dict()["diagnostics"] == pairing_diagnostics
# Public lazy-diagnostic egress is detached: neither a returned dictionary nor
# an object.__setattr__ attack on this capsule can poison the hidden primitive
# record used by the next authenticated cache hit.
pairing_diagnostics["algorithm"] = "poisoned"
object.__setattr__(batch_pairing.height_results[0], "_diagnostics", {})
batch_diagnostics = batch_context.diagnostics()
assert batch_diagnostics["canonical_height_cache_entries"] == 3
assert batch_diagnostics["canonical_height_cache_hits"] == 0
assert batch_diagnostics["canonical_height_cache_misses"] == 3
assert batch_diagnostics["height_pairing_cache_entries"] == 1
assert batch_diagnostics["height_pairing_cache_misses"] == 1
pair_hits_before = batch_diagnostics["height_pairing_cache_hits"]
warm_pairing = height_pairing(
    [P,Q],
    precision=64,
    target_bits=64,
    algorithm="local",
    context=batch_context,
)
assert warm_pairing.matrix[0][1].lower == batch_pairing.matrix[0][1].lower
assert warm_pairing.diagnostics["algorithm"] == "quadratic-height-polarization"
assert warm_pairing.height_results[0].diagnostics["batch"]["point_count"] == 3
assert batch_context.diagnostics()["height_pairing_cache_hits"] == pair_hits_before+1

partial_context = HeightContext(J)
partial_P = canonical_height(
    P, precision=64, target_bits=64, algorithm="local", context=partial_context
)
partial_pairing = height_pairing(
    [P,Q],
    precision=64,
    target_bits=64,
    algorithm="local",
    context=partial_context,
)
assert partial_pairing.rigorous and partial_P.rigorous
assert partial_pairing.height_results[1].diagnostics["batch"]["point_count"] == 2
partial_diagnostics = partial_context.diagnostics()
assert partial_diagnostics["canonical_height_cache_entries"] == 3
assert partial_diagnostics["canonical_height_cache_hits"] == 1
assert partial_diagnostics["canonical_height_cache_misses"] == 3
assert partial_diagnostics["height_pairing_cache_entries"] == 1
assert partial_diagnostics["height_pairing_cache_misses"] == 1

cache_keys = (
    "canonical_height_cache_entries",
    "canonical_height_cache_hits",
    "canonical_height_cache_misses",
    "height_pairing_cache_entries",
    "height_pairing_cache_hits",
    "height_pairing_cache_misses",
)
def cache_state(cache_context):
    cache_diagnostics = cache_context.diagnostics()
    return tuple(cache_diagnostics[key] for key in cache_keys)

# First measure every cancellation callback boundary without cancelling.  Each
# threshold below is then replayed in a new context, alternately through the
# pairing and regulator entry points.  Even the callback immediately before
# the joint proof-cache commit must leave cache contents and counters exactly
# as they were before the call.
probe_context = HeightContext(J)
probe_calls = [0]
def never_cancel():
    probe_calls[0] += 1
    return False
height_pairing(
    [P,Q],
    precision=64,
    target_bits=64,
    algorithm="local",
    context=probe_context,
    cancel=never_cancel,
)
assert probe_calls[0] >= 8
cancelled = True
late_cancel_contexts = []
for use_regulator in (False, True):
    for threshold in range(1, probe_calls[0]+1):
        cancel_context = HeightContext(J)
        before_cancel = cache_state(cancel_context)
        cancel_calls = [0]
        def cancel_batch():
            cancel_calls[0] += 1
            return cancel_calls[0] >= threshold
        threshold_cancelled = False
        try:
            if use_regulator:
                regulator(
                    [P,Q],
                    precision=64,
                    target_bits=64,
                    algorithm="local",
                    context=cancel_context,
                    cancel=cancel_batch,
                )
            else:
                height_pairing(
                    [P,Q],
                    precision=64,
                    target_bits=64,
                    algorithm="local",
                    context=cancel_context,
                    cancel=cancel_batch,
                )
        except Exception as error:
            threshold_cancelled = "cancelled" in str(error)
        cancelled = cancelled and threshold_cancelled
        assert threshold_cancelled
        assert cache_state(cancel_context) == before_cancel
        if threshold == probe_calls[0]:
            late_cancel_contexts.append(cancel_context)

# A context canceled at the last boundary must behave like a truly empty
# context on its next call: no hidden record may survive behind zero counters.
for cancel_context in late_cancel_contexts:
    replay = height_pairing(
        [P,Q],
        precision=64,
        target_bits=64,
        algorithm="local",
        context=cancel_context,
    )
    assert replay.rigorous
    assert cache_state(cancel_context) == (3, 0, 3, 1, 0, 1)

# User cancellation code may do unrelated work on another context, but must
# never reenter proof state on the active context.  Otherwise a nested commit
# could survive the outer rollback behind restored zero counters.
for nested_kind in ("pairing", "regulator", "canonical"):
    reentrant_context = HeightContext(J)
    before_reentrant = cache_state(reentrant_context)
    reentrant_calls = [0]
    nested_rejected = [False]
    def reentrant_cancel():
        reentrant_calls[0] += 1
        if reentrant_calls[0] == 2:
            try:
                if nested_kind == "pairing":
                    height_pairing(
                        [P,Q], precision=64, target_bits=64,
                        algorithm="local", context=reentrant_context,
                    )
                elif nested_kind == "regulator":
                    regulator(
                        [P,Q], precision=64, target_bits=64,
                        algorithm="local", context=reentrant_context,
                    )
                else:
                    canonical_height(
                        P, precision=64, target_bits=64,
                        algorithm="local", context=reentrant_context,
                    )
            except Genus2HeightCapabilityError as error:
                nested_rejected[0] = "reenter" in str(error)
        return reentrant_calls[0] >= 2
    reentrant_cancelled = False
    try:
        height_pairing(
            [P,Q], precision=64, target_bits=64,
            algorithm="local", context=reentrant_context,
            cancel=reentrant_cancel,
        )
    except Exception as error:
        reentrant_cancelled = "cancelled" in str(error)
    assert nested_rejected[0] and reentrant_cancelled
    assert cache_state(reentrant_context) == before_reentrant

different_outer = HeightContext(J)
different_inner = HeightContext(J)
different_calls = [0]
def different_context_cancel():
    different_calls[0] += 1
    if different_calls[0] == 2:
        nested_different = height_pairing(
            [P,Q], precision=64, target_bits=64,
            algorithm="local", context=different_inner,
        )
        assert nested_different.rigorous
    return different_calls[0] >= 2
different_cancelled = False
try:
    height_pairing(
        [P,Q], precision=64, target_bits=64,
        algorithm="local", context=different_outer,
        cancel=different_context_cancel,
    )
except Exception as error:
    different_cancelled = "cancelled" in str(error)
assert different_cancelled
assert cache_state(different_outer) == (0, 0, 0, 0, 0, 0)
assert cache_state(different_inner) == (3, 0, 3, 1, 0, 1)

exception_context = HeightContext(J)
exception_calls = [0]
def exceptional_cancel():
    exception_calls[0] += 1
    if exception_calls[0] == 2:
        raise RuntimeError("deliberate cancellation callback failure")
    return False
callback_exception = False
try:
    height_pairing(
        [P,Q], precision=64, target_bits=64,
        algorithm="local", context=exception_context,
        cancel=exceptional_cancel,
    )
except RuntimeError as error:
    callback_exception = "deliberate" in str(error)
assert callback_exception
assert cache_state(exception_context) == (0, 0, 0, 0, 0, 0)

counter_names = (
    "_canonical_height_entries", "_canonical_height_hits",
    "_canonical_height_misses", "_height_pairing_entries",
    "_height_pairing_hits", "_height_pairing_misses",
)
class HostileHeightContext(HeightContext):
    _armed = False
    def __setattr__(self, name, value):
        if name in counter_names and self._armed:
            raise RuntimeError("hostile counter write")
        self.__dict__[name] = value
    def __hash__(self):
        raise RuntimeError("hostile context hash")
    def __eq__(self, other):
        raise RuntimeError("hostile context equality")

hostile_context = HostileHeightContext(J)
hostile_context._armed = True
hostile_before = tuple(hostile_context.__dict__[name] for name in counter_names)
hostile_rejections = []
for hostile_kind in ("pairing", "regulator", "canonical"):
    try:
        if hostile_kind == "pairing":
            height_pairing(
                [P,Q], precision=64, target_bits=64,
                algorithm="local", context=hostile_context,
            )
        elif hostile_kind == "regulator":
            regulator(
                [P,Q], precision=64, target_bits=64,
                algorithm="local", context=hostile_context,
            )
        else:
            canonical_height(
                P, precision=64, target_bits=64,
                algorithm="local", context=hostile_context,
            )
    except Genus2HeightCapabilityError as error:
        hostile_rejections.append("exact HeightContext" in str(error))
assert hostile_rejections == [True, True, True]
hostile_context._armed = False
assert tuple(hostile_context.__dict__[name] for name in counter_names) == hostile_before

hostile_getattribute_calls = [0]
class HostileGetattributeContext(HeightContext):
    def __getattribute__(self, name):
        hostile_getattribute_calls[0] += 1
        raise RuntimeError("hostile counter read")

hostile_getattribute_context = HostileGetattributeContext(J)
hostile_getattribute_rejected = False
try:
    height_pairing(
        [P,Q], precision=64, target_bits=64,
        algorithm="local", context=hostile_getattribute_context,
    )
except Genus2HeightCapabilityError as error:
    hostile_getattribute_rejected = "exact HeightContext" in str(error)
assert hostile_getattribute_rejected
assert hostile_getattribute_calls[0] == 0

# Familiar-looking module helpers are not an authentication or transaction
# boundary; adding/rebinding them cannot redirect the lexically captured base
# object operations used by the exact context.
height_module._height_proof_counter_value = lambda context, name: 999
height_module._height_proof_set_counter = lambda context, name, value: None
rebound_counter_context = HeightContext(J)
rebound_counter_pairing = height_pairing(
    [P,Q], precision=64, target_bits=64,
    algorithm="local", context=rebound_counter_context,
)
assert rebound_counter_pairing.rigorous
assert cache_state(rebound_counter_context) == (3, 0, 3, 1, 0, 1)

class FakeField:
    def __init__(self, precision_bits):
        self.precision_bits = precision_bits
    def log_integer(self, value):
        return RealBall(100, precision_bits=self.precision_bits, rigorous=True)

poison_context = HeightContext(J)
fake_field = FakeField(96)
poison_context.field = lambda precision: fake_field
poison_context._fields = {64: fake_field, 96: fake_field, 128: fake_field}
def poisoned_context_method(*args, **kwds):
    raise RuntimeError("poisoned height-context method")
poison_context.kummer = poisoned_context_method
poison_context.finite_correction = poisoned_context_method
poison_context.archimedean_correction = poisoned_context_method
poison_context._max_exact_coordinate_bits = 1
poison_height = canonical_height(
    P, precision=64, target_bits=32,
    algorithm="local", context=poison_context,
)
poison_pairing = height_pairing(
    [P,Q], precision=64, target_bits=32,
    algorithm="local", context=poison_context,
)
poison_regulator = regulator(
    [P,Q], precision=64, target_bits=32,
    algorithm="local", context=poison_context,
)
known_height = "0.55175981952139493925311708933354526634108654109670"
assert poison_height.rigorous and poison_height.ball.contains(known_height)
assert poison_pairing.rigorous
assert poison_pairing.height_results[0].ball.contains(known_height)
assert poison_regulator.rigorous and poison_regulator.status == "certified-positive"

saved_bound_class = height_module.AutomaticHeightBounds
saved_bound_zero = height_module._zero_ball
saved_bound_integer_coefficients = height_module._integer_coefficients
saved_bound_field_class = height_module.IntervalBallField
def fake_bound_class(lower, upper, diagnostics):
    return saved_bound_class(
        RealBall(100, precision_bits=64),
        RealBall(100, precision_bits=64),
        diagnostics,
    )
height_module.AutomaticHeightBounds = fake_bound_class
height_module._zero_ball = lambda precision: RealBall(100, precision_bits=precision)
height_module._integer_coefficients = lambda value, length: (1, 0, 0, 0, 0, 1)
height_module.IntervalBallField = FakeField
theorem_rebindings_rejected = []
try:
    for rebound_kind in ("canonical", "pairing", "regulator"):
        rebound_context = HeightContext(J)
        try:
            if rebound_kind == "canonical":
                canonical_height(
                    P, precision=64, target_bits=32,
                    algorithm="local", context=rebound_context,
                )
            elif rebound_kind == "pairing":
                height_pairing(
                    [P,Q], precision=64, target_bits=32,
                    algorithm="local", context=rebound_context,
                )
            else:
                regulator(
                    [P,Q], precision=64, target_bits=32,
                    algorithm="local", context=rebound_context,
                )
        except Genus2HeightCapabilityError as error:
            theorem_rebindings_rejected.append("dependencies" in str(error))
finally:
    height_module.AutomaticHeightBounds = saved_bound_class
    height_module._zero_ball = saved_bound_zero
    height_module._integer_coefficients = saved_bound_integer_coefficients
    height_module.IntervalBallField = saved_bound_field_class
assert theorem_rebindings_rejected == [True, True, True]

flynn_names = (
    "_CLASSICAL_DELTA_1",
    "_CLASSICAL_DELTA_2",
    "_CLASSICAL_DELTA_3",
    "_CLASSICAL_DELTA_4",
)
saved_flynn_tables = tuple(getattr(kummer_module, name) for name in flynn_names)
fake_flynn_tables = (
    ((1,4,0,0,0,0,0,0,0,0,0),),
    ((1,0,4,0,0,0,0,0,0,0,0),),
    ((1,0,0,4,0,0,0,0,0,0,0),),
    ((1,0,0,0,4,0,0,0,0,0,0),),
)
for name, table in zip(flynn_names, fake_flynn_tables):
    setattr(kummer_module, name, table)
flynn_rebindings_rejected = []
try:
    for rebound_context, rebound_kind in (
        (HeightContext(J), "canonical-fresh"),
        (HeightContext(J), "pairing-fresh"),
        (HeightContext(J), "regulator-fresh"),
        (poison_context, "canonical-cached"),
        (poison_context, "pairing-cached"),
        (poison_context, "regulator-cached"),
    ):
        try:
            if rebound_kind.startswith("canonical"):
                canonical_height(
                    P, precision=64, target_bits=32,
                    algorithm="local", context=rebound_context,
                )
            elif rebound_kind.startswith("pairing"):
                height_pairing(
                    [P,Q], precision=64, target_bits=32,
                    algorithm="local", context=rebound_context,
                )
            else:
                regulator(
                    [P,Q], precision=64, target_bits=32,
                    algorithm="local", context=rebound_context,
                )
        except Genus2HeightCapabilityError as error:
            flynn_rebindings_rejected.append("Flynn" in str(error))
finally:
    for name, table in zip(flynn_names, saved_flynn_tables):
        setattr(kummer_module, name, table)
assert flynn_rebindings_rejected == [True, True, True, True, True, True]

# A transitive public helper used by the convenience L1 routine is not a
# theorem dependency.  Even if it is replaced only while an automatic source
# is first cached, the proof closure derives the L1 norm from its independent
# frozen specialization.
expected_duplication_l1 = kummer_module.classical_duplication_l1_bound(J)
saved_kummer_rational_pair = kummer_module._rational_pair
saved_kummer_polynomial_coefficients = kummer_module._polynomial_coefficients
try:
    kummer_module._rational_pair = lambda value: (0, 1)
    kummer_module._polynomial_coefficients = (
        lambda polynomial, length: ((0,)*length if length == 6 else saved_kummer_polynomial_coefficients(polynomial, length))
    )
    transient_bound = height_module.automatic_height_bounds(J, precision=160)
finally:
    kummer_module._rational_pair = saved_kummer_rational_pair
    kummer_module._polynomial_coefficients = saved_kummer_polynomial_coefficients
assert int(transient_bound.diagnostics["duplication_l1_bound"]) == expected_duplication_l1
transient_context = HeightContext(J)
transient_height = canonical_height(
    P, precision=128, target_bits=128,
    algorithm="local", context=transient_context,
)
transient_height_cached = canonical_height(
    P, precision=128, target_bits=128,
    algorithm="local", context=transient_context,
)
transient_pairing = height_pairing(
    [P,Q], precision=128, target_bits=128,
    algorithm="local", context=transient_context,
)
transient_pairing_cached = height_pairing(
    [P,Q], precision=128, target_bits=128,
    algorithm="local", context=transient_context,
)
transient_regulator = regulator(
    [P,Q], precision=128, target_bits=128,
    algorithm="local", context=transient_context,
)
independent_height_128 = "0.5517598195213949392531170893335438275950"
assert transient_height.ball.contains(independent_height_128)
assert transient_height_cached.ball.contains(independent_height_128)
assert transient_pairing.height_results[0].ball.contains(independent_height_128)
assert transient_pairing_cached.height_results[0].ball.contains(independent_height_128)
assert transient_regulator.rigorous and transient_regulator.status == "certified-positive"

restored_context = HeightContext(J)
restored_height = canonical_height(
    P, precision=64, target_bits=32,
    algorithm="local", context=restored_context,
)
restored_pairing = height_pairing(
    [P,Q], precision=64, target_bits=32,
    algorithm="local", context=restored_context,
)
restored_regulator = regulator(
    [P,Q], precision=64, target_bits=32,
    algorithm="local", context=restored_context,
)
assert restored_height.ball.contains(known_height)
assert restored_pairing.height_results[0].ball.contains(known_height)
assert restored_regulator.rigorous and restored_regulator.status == "certified-positive"
[
    batch_data["point_count"],
    partial_pairing.height_results[1].diagnostics["batch"]["point_count"],
    cancelled and different_cancelled and callback_exception,
]
`,
      { timeout: 180_000 },
    );
    assert.equal(result.repr, "[3, 2, True]");
  } finally {
    await session.close();
  }
});

test("rank-four pairing batches reuse an authenticated bounded context", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate(
      `${setup}
context = HeightContext(J)
rank4_basis = [P, Q, P + Q, P - Q]
pairing = height_pairing(
    rank4_basis,
    precision=64,
    target_bits=16,
    algorithm="local",
    context=context,
)
hits_before = context.diagnostics()["height_pairing_cache_hits"]
pairing_again = height_pairing(
    rank4_basis,
    precision=64,
    target_bits=16,
    algorithm="local",
    context=context,
)
diagnostics = context.diagnostics()
assert pairing.rigorous and pairing_again.rigorous
assert len(pairing.matrix) == 4
assert all(len(row) == 4 for row in pairing.matrix)
assert diagnostics["height_pairing_cache_hits"] == hits_before + 1
# The dependent fixture has eight distinct height arguments among four
# diagonals and six polarized sums; exact-equal divisors must hit the
# authenticated canonical-height cache rather than duplicate work.
assert diagnostics["canonical_height_cache_entries"] == 8
[
    len(pairing.matrix),
    diagnostics["canonical_height_cache_entries"],
    diagnostics["height_pairing_cache_hits"],
]
`,
      { timeout: 120_000 },
    );
    assert.equal(result.repr, "[4, 8, 1]");
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
