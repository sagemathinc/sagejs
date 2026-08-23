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
  process.execPath,
  [
    resolve(root, "bin/sagejs"),
    "native",
    "compile",
    kernelSource,
    "--functions",
    "modular_kummer_height_recurrence,dyadic_kummer_height_recurrence",
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
    dyadic_kummer_height_recurrence,
    modular_kummer_height_recurrence,
)
from sagejs.hyperelliptic_curves.genus2_kummer import Genus2KummerCapabilityError
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
fallback_scratch = [0 for _ in range(48)]
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
    fallback_scratch,
    scale,
    steps,
)
assert fallback_status == steps
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
        packed_coefficients,
        packed_exponents,
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
] == "native-integer-buffer"
assert local.diagnostics["archimedean_correction"]["diagnostics"][
    "recurrence_backend"
] == "native-integer-buffer"
assert local.diagnostics["asymptotic_state"] == (
    "polynomial-size modular finite state and four bounded real balls"
)
diagnostics = context.diagnostics()
assert diagnostics["direct_kummer_quartic_doublings"] == 0
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
    parameter_height.rigorous,
    height_model_alias_rejected,
    height_point_alias_rejected,
    forged_bound_rejected,
    injected_bound_rejected,
    poisoned_bound_rejected,
    pairing_after_egress_poison.rigorous,
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
      /^\[\d+, True, True, 'certified-positive', True, 1, \d+, True, True, True, True, True, True, True, True, True, True, True, True, True, True\]$/,
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
