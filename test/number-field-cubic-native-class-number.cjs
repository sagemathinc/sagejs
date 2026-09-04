// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { join, resolve } = require("node:path");
const test = require("node:test");

const { compileKernel } = require("../tools/native-kernel/compiler.cjs");

const root = resolve(__dirname, "..");
const sourcePath = resolve(
  root,
  "src/lib/sagejs/number_fields/cubic_class_number_native.py",
);

function runPython(source, timeout = 180_000, environment = {}) {
  const result = spawnSync(
    process.execPath,
    [resolve(root, "bin/sagejs"), "--python"],
    {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        SAGEJS_NATIVE_REQUIRED: "0",
        ...environment,
      },
      input: source,
      timeout,
    },
  );
  assert.equal(
    result.status,
    0,
    `${result.error?.message || ""}\n${result.stderr}\n${result.stdout}`,
  );
  return result.stdout.trim();
}

function relationLogBatchProgram(expectNative) {
  return String.raw`
from sagejs.ffi.flint import fmpz_matrix
from sagejs.native import kernel_integer_buffer
from sagejs.number_fields.cubic_class_number_native import (
    _cubic_real_log_bounds,
    _cubic_real_log_bounds_batch,
)

assert _cubic_real_log_bounds.nativeAvailable is ${expectNative ? "True" : "False"}
assert _cubic_real_log_bounds_batch.nativeAvailable is ${expectNative ? "True" : "False"}

coefficients = (-55, 9, 0, 1)
elements = (
    (1, 0, 0),
    (2, 0, 0),
    (0, 1, 0),
    (1, 1, 0),
    (1, 0, 1),
    (2, 1, 1),
    (3, -1, 2),
)
count = len(elements)
precision = 128
scale = 1 << precision
relations = fmpz_matrix(count, 3)
batch_numerators = fmpz_matrix(2 * count, 1)
batch_denominators = fmpz_matrix(2 * count, 1)
batch_endpoints = fmpz_matrix(4 * count, 1)
batch_logs = fmpz_matrix(count, 2)
for row, element in enumerate(elements):
    for column, value in enumerate(element):
        relations[row, column] = value

assert _cubic_real_log_bounds_batch(
    batch_numerators,
    batch_denominators,
    batch_endpoints,
    batch_logs,
    kernel_integer_buffer(_cubic_real_log_bounds_batch, coefficients),
    relations,
    count,
    1,
    1,
    0,
    0,
    1,
    0,
    1,
    scale,
    precision,
)

serial_resources = []
for row, element in enumerate(elements):
    numerators = fmpz_matrix(1, 1)
    denominators = fmpz_matrix(1, 1)
    endpoints = fmpz_matrix(2, 1)
    serial_resources.extend((numerators, denominators, endpoints))
    expected = _cubic_real_log_bounds(
        numerators,
        denominators,
        endpoints,
        kernel_integer_buffer(_cubic_real_log_bounds, coefficients),
        1,
        1,
        0,
        0,
        1,
        0,
        1,
        element[0],
        element[1],
        element[2],
        scale,
        precision,
    )
    assert (batch_logs[row, 0], batch_logs[row, 1]) == expected

for resource in (
    *serial_resources,
    batch_logs,
    batch_endpoints,
    batch_denominators,
    batch_numerators,
    relations,
):
    resource.close()
print("cubic-relation-log-batch-ok")
`;
}

test("cubic relation-log batches exactly match serial enclosures", {
  timeout: 240_000,
}, () => {
  assert.equal(
    runPython(relationLogBatchProgram(true)),
    "cubic-relation-log-batch-ok",
  );
  assert.equal(
    runPython(
      relationLogBatchProgram(false),
      180_000,
      { SAGEJS_NATIVE_DISABLE: "1" },
    ),
    "cubic-relation-log-batch-ok",
  );
});

test("closed native cubic receipts survive declines and authenticate targets", {
  timeout: 240_000,
}, async () => {
  const compiled = await compileKernel({
    sourcePath,
    functions: ["certified_complex_cubic_class_group_v1"],
  });
  const checkerPath = resolve(
    root,
    "src/lib/sagejs/number_fields/field_analysis_resource.py",
  );
  const checkerHash = createHash("sha256")
    .update(readFileSync(checkerPath))
    .digest("hex");
  assert.equal(compiled.ir.version, 36);
  assert.deepEqual(compiled.ir.nativeSourceDependencies, [{
    module: "sagejs.number_fields.field_analysis_resource",
    path: checkerPath,
    sha256: checkerHash,
  }]);
  assert.ok(
    compiled.ir.callGraph._cubic_analysis_fixed_points_are_valid.includes(
      "packed_field_analysis_fixed_points_are_valid",
    ),
  );
  const relationLogBatch = compiled.ir.functions.find(
    (fn) => fn.name === "_cubic_real_log_bounds_batch",
  );
  assert.deepEqual(
    relationLogBatch.dependencies,
    [
      "_cubic_real_embedding_absolute_bounds_from_root_interval",
      "_cubic_real_root_interval",
    ],
  );
  assert.equal(
    relationLogBatch.foreignDependencies.filter((dependency) =>
      dependency.endsWith(":positive_rational_log_balls_resource")
    ).length,
    1,
  );
  assert.equal(
    compiled.ir.functions.find(
      (fn) => fn.name === "packed_field_analysis_fixed_points_are_valid",
    ).provenance.file,
    checkerPath,
  );
  const directModule = require(join(compiled.outputPath, "index.cjs"));
  const directKernel = directModule.certified_complex_cubic_class_group_v1;
  const zeros = (length) => directKernel.createIntegerBuffer(length, 8);
  const directOutput = zeros(64);
  const directModularWorkspace = directKernel.createUInt64Buffer(
    64 * 64 + 64 + 1,
  );
  const directBuffers = [
    zeros(512), zeros(4), zeros(9), zeros(16),
    zeros(16), zeros(144), zeros(48), zeros(109),
  ];
  const directTranscriptBuffers = [zeros(1), zeros(1), zeros(1)];
  const directReceipt = (coefficients) => {
    assert.equal(directKernel(
      directOutput,
      directKernel.packIntegerBuffer(coefficients),
      directModularWorkspace,
      ...directBuffers,
      ...directTranscriptBuffers,
      0,
      1,
      1048576,
      2097152,
    ), true);
    return directOutput.toArray().map(Number);
  };
  const emptyBase = directReceipt([1, 0, -1, 1]);
  assert.deepEqual(emptyBase.slice(0, 3), [2, 1, 0]);
  assert.deepEqual(emptyBase.slice(20, 24), [2, 0, 0, 0]);
  assert.equal(emptyBase[35], 2);
  assert.ok(emptyBase.slice(36, 50).every((value) => value === 0));
  const trivialPresentation = directReceipt([1, 1, -1, 1]);
  assert.deepEqual(trivialPresentation.slice(0, 3), [2, 1, 0]);
  assert.deepEqual(trivialPresentation.slice(20, 24), [2, 1, 1, 4]);
  assert.equal(trivialPresentation[35], 2);
  assert.ok(trivialPresentation.slice(36, 50).every((value) => value === 0));
  const normBoundedPresentation = directReceipt([-1, 2, 0, 1]);
  assert.deepEqual(normBoundedPresentation.slice(0, 3), [2, 1, 0]);
  assert.deepEqual(normBoundedPresentation.slice(20, 24), [3, 1, 1, 3]);
  assert.equal(normBoundedPresentation[35], 2);
  const determinantalPresentation = directReceipt([-2, -2, 0, 1]);
  assert.deepEqual(determinantalPresentation.slice(0, 3), [2, 1, 0]);
  assert.deepEqual(determinantalPresentation.slice(20, 24), [3, 2, 2, 4]);
  assert.equal(determinantalPresentation[35], 2);
  const output = runPython(String.raw`
from sagejs.number_fields.cubic_class_number_native import certified_complex_cubic_class_group_v1
from sagejs.number_fields.cubic_class_number_native import _CUBIC_ARCHIMEDEAN_EXPONENT_LIMIT
from sagejs.number_fields.cubic_class_number_native import _CUBIC_ANALYTIC_REFINED_THRESHOLD
from sagejs.number_fields.cubic_class_number_native import _CUBIC_ANALYTIC_THRESHOLD
from sagejs.number_fields.cubic_class_number_native import _CUBIC_ANALYTIC_MAX_TERMS
from sagejs.number_fields.cubic_class_number_native import _CUBIC_ANALYTIC_MAX_VALUES
from sagejs.number_fields.cubic_class_number_native import _CUBIC_DIRECT_MINKOWSKI_MAX_BOUND
import sagejs.number_fields.cubic_class_number_native_runtime as cubic_runtime
from sagejs.number_fields.cubic_class_number_native_runtime import _checked_native_values, certified_complex_cubic_class_number

assert _CUBIC_DIRECT_MINKOWSKI_MAX_BOUND == 8
assert _CUBIC_ARCHIMEDEAN_EXPONENT_LIMIT == 4096
assert _CUBIC_ANALYTIC_THRESHOLD == 997
assert _CUBIC_ANALYTIC_REFINED_THRESHOLD == 1494
assert _CUBIC_ANALYTIC_MAX_TERMS >= 329
assert _CUBIC_ANALYTIC_MAX_VALUES >= 248
from sagejs.native import is_compiled

assert is_compiled(certified_complex_cubic_class_group_v1)
R = PolynomialRing(QQ, "x")
x = R.gen()

def field(coefficients, name):
    polynomial = R(0)
    for exponent, coefficient in enumerate(coefficients):
        polynomial += coefficient * x**exponent
    return NumberField(polynomial, name)

# A valid field beyond the current Minkowski-bound envelope declines after
# native maximal-order analysis. Every following computation must remain
# independent and safe after its exact arena is released.
declined = field((100000, 1, 0, 1), "declined")
assert certified_complex_cubic_class_number(declined) is None

cases = (
    ((-55, 9, 0, 1), 5, (5,)),
    ((-4, 3, -1, 1), 2, (2,)),
    # LMFDB 3.1.685935.1 has regulator about 358.15. The orientation selected
    # by this native reconstruction has 519-bit integral-basis coordinates,
    # exercising the bounded large-unit regime rather than the former decline.
    ((-644, 243, 0, 1), 2, (2,)),
    # LMFDB 3.1.93074700.2 reaches the exact C42 presentation and fundamental
    # unit at the ordinary boundary, but X=997 leaves the rigorous analytic
    # interval just too wide. The bounded X=1494 retry proves index one.
    ((-5570, 0, 0, 1), 42, (42,)),
)
for index, (coefficients, order, invariants) in enumerate(cases):
    K = field(coefficients, "a" + str(index))
    receipt = certified_complex_cubic_class_number(K)
    assert receipt is not None
    assert receipt.class_number == order
    assert receipt.invariants == invariants
    assert receipt.proof_status == "exact-relations-conditional-grh"
    if coefficients in ((-55, 9, 0, 1), (-644, 243, 0, 1), (-5570, 0, 0, 1)):
        assert receipt.theorem == (
            "belabas-diaz-y-diaz-friedman-generators-plus-"
            "belabas-friedman-index-one"
        )
        assert receipt.assumptions == (
            "GRH: L(s, chi) is nonzero whenever Re(s) > 1/2 for every nontrivial character chi of Cl(K)",
            "GRH: zeta_K(s) and zeta_Q(s) are nonzero whenever Re(s) > 1/2",
        )
    else:
        assert receipt.theorem == "minkowski-generators-plus-belabas-friedman-index-one"
        assert receipt.assumptions == (
            "GRH: zeta_K(s) and zeta_Q(s) are nonzero whenever Re(s) > 1/2",
        )
    assert receipt.matches(K)
    if coefficients == (-644, 243, 0, 1):
        assert max(abs(value).bit_length() for value in receipt.unit_coordinates) == 519
    if coefficients == (-55, 9, 0, 1):
        assert receipt.relation_effort == 5
    if coefficients == (-5570, 0, 0, 1):
        assert receipt.analytic_threshold == _CUBIC_ANALYTIC_REFINED_THRESHOLD
        assert receipt._values[37] == 156
        assert receipt._values[38] == 126
        assert receipt.verify_conditional_grh()
        forged = list(receipt._values)
        forged[36] = _CUBIC_ANALYTIC_REFINED_THRESHOLD + 1
        assert _checked_native_values(coefficients, forged) is None
    else:
        assert receipt.analytic_threshold == _CUBIC_ANALYTIC_THRESHOLD
    assert K.class_number(proof=False) == order
    detached = receipt.to_dict()
    assert detached["schema"] == "sagejs.number-fields/certified-complex-cubic-native-v4"
    assert detached["class_number"] == order
    assert tuple(detached["invariants"]) == invariants
    assert detached["proof_status"] == "exact-relations-conditional-grh"
    assert detached["assumptions"] == list(receipt.assumptions)
    assert detached["polynomial_coefficients"] == list(coefficients)
    assert detached["compound_multiplier_passes"] == receipt.compound_multiplier_passes
    assert 0 <= receipt.compound_multiplier_passes <= 4
    try:
        receipt.class_number = 999
        raise AssertionError("receipt mutation was accepted")
    except AttributeError:
        pass

# Exercise the PARI-shaped bounded collector independently of the ordinary
# adaptive route. Its modular echelon state is scheduling evidence only; the
# resulting receipt must still survive the complete exact replay.
saved_efforts = cubic_runtime._CUBIC_RELATION_EFFORTS
try:
    cubic_runtime._CUBIC_RELATION_EFFORTS = (3,)
    bounded = certified_complex_cubic_class_number(
        field((-55, 9, 0, 1), "bounded_relation_ledger")
    )
finally:
    cubic_runtime._CUBIC_RELATION_EFFORTS = saved_efforts
assert bounded is not None
assert bounded.class_number == 5
assert bounded.invariants == (5,)
assert bounded.relation_effort == 3
assert bounded.verify_conditional_grh()

print("cubic-native-receipts-ok")
`);
  assert.equal(output, "cubic-native-receipts-ok");
});

test("native cubic receipts replay through the independent exact engine", {
  timeout: 240_000,
}, () => {
  const output = runPython(String.raw`
from sagejs.number_fields.cubic_class_number_native_runtime import certified_complex_cubic_class_number

R = PolynomialRing(QQ, "x")
x = R.gen()
for index, coefficients in enumerate(((1, 0, -1, 1), (-8, -1, 0, 1), (-55, 9, 0, 1), (-4, 3, -1, 1))):
    polynomial = R(0)
    for exponent, coefficient in enumerate(coefficients):
        polynomial += coefficient * x**exponent
    K = NumberField(polynomial, "v" + str(index))
    receipt = certified_complex_cubic_class_number(K)
    assert receipt is not None
    assert receipt.verify_conditional_grh()
    assert receipt.verify()

# LMFDB 3.1.91099.1 is a boundary case for the deliberately small native
# rational enclosures in the BDF cutoff proof. The native program safely
# certifies 16 while the ordinary exact planner proves the sharper cutoff 15.
# Both cutoffs give exactly the same complete factor base, so the exact factor
# bijection and relation replay remain authoritative.
K = NumberField(x**3 - x**2 + x + 174, "conservative_bdf")
receipt = certified_complex_cubic_class_number(K)
assert receipt is not None
assert receipt.class_number == 14
assert receipt.invariants == (14,)
assert receipt.generator_bound == 16
factor_module = __import__(
    "sagejs.number_fields.class_group_factor_base",
    fromlist=["class_group_factor_base"],
)
ordinary_plan = factor_module.factor_base_plan(
    K.maximal_order(), proof=False, theorem="bdf", max_bound=256
)
assert int(ordinary_plan.bound) == 15
assert len(factor_module.build_factor_base(ordinary_plan)) == receipt.factor_base_size == 9
assert receipt.verify_conditional_grh()

# LMFDB 3.1.2827276.3 has 21 factor ideals. Its last factor fingerprint begins
# inside the workspace region later reused by the analytic phase, so audit
# publication must preserve every factor lattice before that phase transition.
K = NumberField(x**3 - x**2 - 187*x + 1101, "wide_factor_transcript")
receipt = certified_complex_cubic_class_number(K)
assert receipt is not None
assert receipt.class_number == 30
assert receipt.invariants == (30,)
assert receipt.factor_base_size == 21
assert receipt.verify_conditional_grh()
assert len(
    receipt.to_dict()["relation_transcript"][
        "factor_ideal_hnf_order_coordinates"
    ]
) == 21

# LMFDB 3.1.47391719.2 has equation-order index 37.  The factor-base pass
# already retains its exact split signature, so the analytic Euler phase must
# reuse it instead of declining at an unrelated small-prime envelope.
K = NumberField(x**3 - x**2 - 272*x + 49141, "index_prime_37")
receipt = certified_complex_cubic_class_number(K)
assert receipt is not None
assert receipt.class_number == 36
assert receipt.invariants == (6, 6)
assert receipt.factor_base_size == 30
assert receipt.verify_conditional_grh()

# A BDF-trivial receipt publishes the finite relation proof used by the
# native finder. Once detached, ordinary replay must neither invoke that
# finder again nor trust any factor lattice, row, or principal element.
K = NumberField(x**3 - x**2 + 2*x - 6, "transcript")
receipt = certified_complex_cubic_class_number(K)
assert receipt is not None
assert receipt.proof_status == "exact-trivial-presentation-conditional-grh"
detached = receipt.to_dict()
transcript = detached["relation_transcript"]
assert transcript["schema"] == (
    "sagejs.number-fields/complex-cubic-relation-transcript-v1"
)
assert len(transcript["factor_ideal_hnf_order_coordinates"]) == receipt.factor_base_size
assert len(transcript["relation_rows"]) == receipt.relation_count
native_runtime = __import__(
    "sagejs.number_fields.cubic_class_number_native_runtime",
    fromlist=["cubic_class_number_native_runtime"],
)
original_kernel = native_runtime.certified_complex_cubic_class_group_v1
def forbidden_finder(*args):
    raise AssertionError("ordinary transcript replay called the closed cubic finder")
native_runtime.certified_complex_cubic_class_group_v1 = forbidden_finder
try:
    assert receipt.verify_conditional_grh()
finally:
    native_runtime.certified_complex_cubic_class_group_v1 = original_kernel

original_transcript = receipt._relation_transcript

def bind_transcript(value):
    receipt.__dict__["_relation_transcript"] = value
    receipt.__dict__["_snapshot"] = receipt._authentication_snapshot()

factor_rows, relation_rows, relation_elements = original_transcript
bad_elements = tuple(
    (row[0] + 1, row[1], row[2]) for row in relation_elements
)
bind_transcript((factor_rows, relation_rows, bad_elements))
assert not receipt.verify_conditional_grh()

bad_factor = list(factor_rows[0])
bad_factor[0] += 1
bind_transcript(((tuple(bad_factor),) + factor_rows[1:], relation_rows, relation_elements))
assert not receipt.verify_conditional_grh()

bad_rows = tuple((row[0] + 1,) + row[1:] for row in relation_rows)
bind_transcript((factor_rows, bad_rows, relation_elements))
assert not receipt.verify_conditional_grh()

bind_transcript(original_transcript)
assert receipt.verify_conditional_grh()

# Before extraction, the native program may find evidence but has no replay
# authority. If that evidence-finding rerun is unavailable, verification must
# decline rather than silently falling back to the original native scalar.
K = NumberField(x**3 - x**2 + 2*x - 6, "unextracted")
unextracted = certified_complex_cubic_class_number(K)
assert unextracted is not None
native_runtime.certified_complex_cubic_class_group_v1 = forbidden_finder
try:
    assert not unextracted.verify_conditional_grh()
finally:
    native_runtime.certified_complex_cubic_class_group_v1 = original_kernel

# This was the first out-of-sample census failure: the ordinary relation
# search stops at tentative C2 x C2, while the native transcript presents C2.
# The verifier now authenticates that exact nontrivial presentation and closes
# the class/unit index independently through the analytic formula.
K = NumberField(x**3 + 18*x - 1016, "rank7")
receipt = certified_complex_cubic_class_number(K)
assert receipt is not None
assert receipt.class_number == 2
assert receipt.invariants == (2,)
assert receipt.proof_status == "exact-relations-conditional-grh"
detached = receipt.to_dict()
assert detached["relation_transcript"] is not None
assert detached["relation_transcript"]["schema"] == (
    "sagejs.number-fields/complex-cubic-relation-transcript-v1"
)
native_runtime.certified_complex_cubic_class_group_v1 = forbidden_finder
try:
    assert receipt.verify_conditional_grh()
finally:
    native_runtime.certified_complex_cubic_class_group_v1 = original_kernel

rank7_transcript = receipt._relation_transcript
factor_rows, relation_rows, relation_elements = rank7_transcript
bad_elements = tuple(
    (row[0] + 1, row[1], row[2]) for row in relation_elements
)
receipt.__dict__["_relation_transcript"] = (
    factor_rows,
    relation_rows,
    bad_elements,
)
receipt.__dict__["_snapshot"] = receipt._authentication_snapshot()
assert not receipt.verify_conditional_grh()

# A hostile same-order mutation must not pass replay merely because C4 and
# C2 x C2 both have order four. This bypasses the public immutability guard to
# exercise the verifier's semantic binding, not a supported mutation path.
K = NumberField(x**3 - x**2 + 3*x + 6, "forged")
receipt = certified_complex_cubic_class_number(K)
assert receipt is not None
assert receipt.invariants == (4,)
values = list(receipt._values)
values[2:5] = [2, 2, 2]
receipt.__dict__["_values"] = tuple(values)
receipt.__dict__["_snapshot"] = receipt._authentication_snapshot()
assert receipt.matches(K)
assert receipt.class_number == 4
assert receipt.invariants == (2, 2)
assert not receipt.verify_conditional_grh()
assert not receipt.verify()
print("cubic-native-independent-replay-ok")
`, 240_000);
  assert.equal(output, "cubic-native-independent-replay-ok");
});

test("native cubic receipts agree with the pinned nontrivial LMFDB corpus", {
  timeout: 240_000,
}, () => {
const output = runPython(String.raw`
from sagejs.number_fields.cubic_class_number_native_runtime import certified_complex_cubic_class_number
from sagejs.number_fields.class_group_factor_base import build_factor_base, factor_base_plan

R = PolynomialRing(QQ, "x")
x = R.gen()
cases = (
    ("3.1.23.1", (1, 0, -1, 1), 1, (), 0),
    ("3.1.44.1", (1, 1, -1, 1), 1, (), 0),
    ("3.1.59.1", (-1, 2, 0, 1), 1, (), 0),
    ("3.1.76.1", (-2, -2, 0, 1), 1, (), 0),
    ("3.1.431.1", (-8, -1, 0, 1), 1, (), 0),
    # Bound 8 is retained unconditionally without paying for a redundant GRH
    # generator calculation. The nontrivial class number still receives the
    # independent conditional analytic index-one proof below.
    ("3.1.588.1", (1, 5, -1, 1), 3, (3,), 0),
    # Bound 9 is outside the direct-Minkowski cutoff. Here the rigorous GRH
    # calculation genuinely improves it to 8, so this guards the boundary.
    ("3.1.808.1", (-6, 2, -1, 1), 1, (), 0),
    ("3.1.1083.1", (-12, -6, -1, 1), 3, (3,), 0),
    ("3.1.1371.1", (6, 3, -1, 1), 4, (4,), 0),
    ("3.1.1563.1", (-6, 7, -1, 1), 5, (5,), 0),
    ("3.1.2856.1", (-21, 9, -1, 1), 7, (7,), 0),
    ("3.1.4027.2", (8, 7, -1, 1), 6, (6,), 0),
    ("3.1.5448.1", (30, -14, -1, 1), 8, (8,), 0),
    # The bounded PARI-shaped adjacent search finds the middle generator above
    # 29 without authorizing a compound multiplier.
    ("3.1.12763.1", (-22, 1, -1, 1), 8, (2, 4), 0),
    # The fundamental unit lies beyond the opportunistic score-9 coordinate
    # shells. Exact relation dependencies recover it without broadening the
    # speculative unit search; this pure cubic has class group C3 x C3.
    ("3.1.24843.1", (-91, 0, 0, 1), 9, (3, 3), 0),
    # Exact dependency recovery finds the fundamental unit without authorizing
    # a compound multiplier retry.
    ("3.1.49096.1", (-126, -6, -1, 1), 9, (9,), 0),
    # The sharper elementary Euler-constant enclosure proves PARI's GRH
    # generator cutoff 16.  The exact reduced ellipsoid in the complementary
    # norm-9 ideal then supplies the decisive relation without a restart.
    ("3.1.108115.1", (-383, -68, 0, 1), 10, (10,), 0),
    # PARI's successful small_norm path uses four adjacent ideals. The bounded
    # native schedule likewise obtains its 17-row presentation of C10 without
    # searching the whole factor base.
    ("3.1.104072.1", (434, 2, -1, 1), 10, (10,), 0),
    # PARI's norm-sorted sub-factor-base permutation is [2,4,5,1,3,6],
    # traversed backward as [6,3,1,5,...]. Checked ellipsoids on those first
    # four ideals certify C9.
    ("3.1.26412.1", (-159, 9, -1, 1), 9, (9,), 0),
    # PARI admits its decisive relation after the fifth ideal in the same
    # reverse permutation. The bounded stage certifies C6 without constructing
    # the complete nine-ideal reduced batch.
    ("3.1.27116.3", (49, 19, -1, 1), 6, (6,), 0),
    # The defining order has index 4 and a prime discriminant component above
    # one million.  The proof binder must use its deterministic word-prime
    # certificate rather than an arbitrary trial-division cutoff.
    ("3.1.1181183.1", (-796, 92, -1, 1), 8, (2, 2, 2), 0),
    # PARI's narrower first small_norm batch needs one multiplier pass here;
    # the source-transparent all-ideal adjacent batch already certifies it.
    # This also exercises a 17-ideal resident factor base.
    ("3.1.1737311.1", (289, -42, -1, 1), 8, (2, 2, 2), 0),
    # The bounded adjacent effort certifies this 16-ideal C2-cubed
    # presentation without a compound multiplier pass.
    ("3.1.1802479.1", (-149, 67, 0, 1), 8, (2, 2, 2), 0),
    # The native BDF enclosure conservatively reaches 47 while the independent
    # sharp proof stops at 46.  Replay authenticates the complete 19-ideal
    # superset, whose first 18 ideals already generate by the theorem.
    ("3.1.23018700.1", (-13850, 0, 0, 1), 21, (21,), 0),
    # A strongly anisotropic reduced ideal has exact ellipsoid-coordinate
    # limits 41-by-2-by-2, within the general 64-coordinate native tier.
    ("3.1.99084027.1", (-40229, 0, 0, 1), 3, (3,), 0),
    # Residual perfect-power normalization proves the discriminant factor
    # 1229^2 without increasing the bounded trial-division policy.
    ("3.1.40781907.1", (-1229, 0, 0, 1), 2, (2,), 0),
    # The cheap trial pass leaves 1277*1699.  Bounded word-residual
    # decomposition proves both factors and reaches the existing native C2xC4
    # class-group regime without moving the caller's trial cutoff.
    ("3.1.2169623.1", (-4269, 94, -1, 1), 8, (2, 4), 0),
    # Likewise, the residual 1153*2927 is decomposed before the order and
    # relation phases; the unchanged resident algorithm then proves C52.
    ("3.1.3374831.1", (256, 376, -1, 1), 52, (52,), 0),
)
for index, (label, coefficients, expected_order, expected_invariants, expected_passes) in enumerate(cases):
    polynomial = R(0)
    for exponent, coefficient in enumerate(coefficients):
        polynomial += coefficient * x**exponent
    K = NumberField(polynomial, "c" + str(index))
    receipt = certified_complex_cubic_class_number(K)
    assert receipt is not None, label
    assert receipt.class_number == expected_order, label
    assert receipt.invariants == expected_invariants, label
    assert receipt.compound_multiplier_passes == expected_passes, label
    if label == "3.1.108115.1":
        assert receipt.generator_bound == 16, label
        assert receipt.factor_base_size == 9, label
    if label == "3.1.104072.1":
        assert receipt.generator_bound == 18, label
        assert receipt.factor_base_size == 11, label
        assert receipt.relation_count == 17, label
    if label == "3.1.26412.1":
        assert receipt.generator_bound == 15, label
        assert receipt.factor_base_size == 6, label
        assert receipt.relation_count == 13, label
    if label == "3.1.27116.3":
        assert receipt.generator_bound == 20, label
        assert receipt.factor_base_size == 9, label
        assert receipt.relation_count == 15, label
    if label == "3.1.1181183.1":
        assert receipt.generator_bound == 30, label
        assert receipt.factor_base_size == 11, label
        assert receipt.relation_count == 18, label
    if label == "3.1.23.1":
        assert receipt.generator_bound == 2, label
        assert receipt.factor_base_size == 0, label
        assert receipt.relation_count == 0, label
        assert receipt.proof_status == "exact-empty-generator-base-unconditional", label
        assert receipt.assumptions == (), label
        assert receipt.theorem == "minkowski-generators-plus-empty-factor-base", label
    if label == "3.1.44.1":
        assert receipt.generator_bound == 2, label
        assert receipt.factor_base_size == 1, label
        assert receipt.relation_count == 8, label
        assert receipt.proof_status == "exact-trivial-presentation-unconditional", label
        assert receipt.assumptions == (), label
        assert receipt.theorem == "minkowski-generators-plus-trivial-relation-presentation", label
    if label == "3.1.59.1":
        assert receipt.generator_bound == 3, label
        assert receipt.factor_base_size == 1, label
        assert receipt.relation_count == 7, label
        assert receipt.proof_status == "exact-trivial-presentation-unconditional", label
        assert receipt.assumptions == (), label
    if label == "3.1.76.1":
        assert receipt.generator_bound == 3, label
        assert receipt.factor_base_size == 2, label
        assert receipt.relation_count == 11, label
        assert receipt.proof_status == "exact-trivial-presentation-unconditional", label
    if label == "3.1.588.1":
        assert receipt.generator_bound == 8, label
        assert receipt.factor_base_size == 5, label
        assert receipt.relation_count == 12, label
        assert receipt.proof_status == "exact-relations-conditional-grh", label
        assert receipt.assumptions == (
            "GRH: zeta_K(s) and zeta_Q(s) are nonzero whenever Re(s) > 1/2",
        ), label
        assert receipt.theorem == "minkowski-generators-plus-belabas-friedman-index-one", label
    if label == "3.1.808.1":
        assert receipt.generator_bound == 8, label
        assert receipt.factor_base_size == 4, label
        assert receipt.relation_count == 21, label
        assert receipt.proof_status == "exact-trivial-presentation-conditional-grh", label
        assert receipt.assumptions == (
            "GRH: L(s, chi) is nonzero whenever Re(s) > 1/2 for every nontrivial character chi of Cl(K)",
        ), label
    if label == "3.1.24843.1":
        assert receipt.generator_bound == 13, label
        assert receipt.factor_base_size == 8, label
        assert receipt.relation_count == 16, label
    if label == "3.1.49096.1":
        assert receipt.relation_count == 16, label
    if label == "3.1.1802479.1":
        assert receipt.generator_bound == 41, label
        assert receipt.factor_base_size == 16, label
        assert receipt.relation_count == 24, label
    if label == "3.1.23018700.1":
        assert receipt.generator_bound == 47, label
        assert receipt.factor_base_size == 19, label
        sharp_plan = factor_base_plan(
            K.maximal_order(), proof=False, theorem="bdf", max_bound=10000
        )
        assert sharp_plan.bound == 46, label
        assert len(build_factor_base(sharp_plan)) == 18, label
    if label == "3.1.99084027.1":
        assert receipt.generator_bound == 62, label
        assert receipt.factor_base_size == 18, label
    if label == "3.1.40781907.1":
        assert receipt.generator_bound == 78, label
        assert receipt.factor_base_size == 20, label
    if label == "3.1.2169623.1":
        assert receipt.generator_bound == 38, label
        assert receipt.factor_base_size == 12, label
        assert receipt.relation_count == 19, label
    if label == "3.1.3374831.1":
        assert receipt.generator_bound == 49, label
        assert receipt.factor_base_size == 12, label
        assert receipt.relation_count == 19, label
    if label in (
        "3.1.23018700.1",
        "3.1.99084027.1",
        "3.1.40781907.1",
        "3.1.2169623.1",
        "3.1.3374831.1",
    ):
        assert receipt.verify_conditional_grh(), label
    assert receipt.matches(K), label
print("cubic-native-lmfdb-corpus-ok")
`);
  assert.equal(output, "cubic-native-lmfdb-corpus-ok");
});

test("large-regulator cubic receipts publish exact units across the survey regime", {
  timeout: 240_000,
}, () => {
  const output = runPython(String.raw`
from sagejs.number_fields.cubic_class_number_native_runtime import certified_complex_cubic_class_number

R = PolynomialRing(QQ, "x")
x = R.gen()
cases = (
    ("3.1.685935.1", (-644, 243, 0, 1), 2, (2,)),
    ("3.1.883855.1", (-1120, -180, -1, 1), 2, (2,)),
    ("3.1.1651783.1", (-700, 156, -1, 1), 2, (2,)),
    ("3.1.2180292.1", (138, 72, -1, 1), 2, (2,)),
    ("3.1.2260440.1", (-2350, -285, 0, 1), 2, (2,)),
    ("3.1.2570180.3", (-3084, 38, 0, 1), 3, (3,)),
    ("3.1.2844435.1", (16, 89, -1, 1), 2, (2,)),
    ("3.1.2950084.1", (-1654, 4, -1, 1), 2, (2,)),
    ("3.1.3047300.1", (-690, -55, 0, 1), 2, (2,)),
    ("3.1.3305512.1", (-3782, 151, 0, 1), 2, (2,)),
    ("3.1.4689300.1", (-1890, 525, 0, 1), 3, (3,)),
    ("3.1.9411631.1", (-5510, -551, 0, 1), 3, (3,)),
    ("3.1.10851423.3", (-1508, 435, 0, 1), 3, (3,)),
    ("3.1.11031020.1", (-1913, -85, -1, 1), 3, (3,)),
    ("3.1.11754639.6", (-1830, 549, 0, 1), 3, (3,)),
    ("3.1.11838596.2", (12160, -912, -1, 1), 3, (3,)),
    ("3.1.11856684.1", (-19836, 228, 0, 1), 3, (3,)),
    ("3.1.12104235.3", (-13013, -858, 0, 1), 3, (3,)),
    ("3.1.12876435.1", (-2311, -192, 0, 1), 2, (2,)),
    ("3.1.13374423.1", (-21112, 87, 0, 1), 6, (6,)),
    ("3.1.13525380.3", (-3762, 297, 0, 1), 3, (3,)),
    # This field's fundamental unit has 8615-bit integral-basis coordinates.
    # Only the small result record uses the wider bounded publication tier;
    # relation-transcript entries remain in their compact tier.
    ("3.1.69305231.3", (48016, 134, -1, 1), 3, (3,)),
)
for label, coefficients, class_number, invariants in cases:
    polynomial = sum(coefficient * x**exponent for exponent, coefficient in enumerate(coefficients))
    K = NumberField(polynomial, "large_" + label.replace(".", "_"))
    receipt = certified_complex_cubic_class_number(K)
    assert receipt is not None
    assert receipt.class_number == class_number
    assert receipt.invariants == invariants
    basis = K.maximal_order().basis()
    unit = sum(coordinate * element for coordinate, element in zip(receipt.unit_coordinates, basis))
    assert abs(unit.norm()) == 1
    if label == "3.1.69305231.3":
        assert max(abs(value).bit_length() for value in receipt.unit_coordinates) == 8615
        assert receipt.verify_conditional_grh()
print("cubic-native-large-regulator-survey-ok")
`, 240_000);
  assert.equal(output, "cubic-native-large-regulator-survey-ok");
});
