// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const test = require("node:test");

const { compileKernel } = require("../tools/native-kernel/compiler.cjs");

const root = resolve(__dirname, "..");
const sourcePath = resolve(
  root,
  "src/lib/sagejs/number_fields/cubic_class_number_native.py",
);

function runPython(source, timeout = 180_000) {
  const result = spawnSync(
    process.execPath,
    [resolve(root, "bin/sagejs"), "--python"],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, SAGEJS_NATIVE_REQUIRED: "0" },
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
  assert.equal(
    compiled.ir.functions.find(
      (fn) => fn.name === "packed_field_analysis_fixed_points_are_valid",
    ).provenance.file,
    checkerPath,
  );
  const output = runPython(String.raw`
from sagejs.number_fields.cubic_class_number_native import certified_complex_cubic_class_group_v1
from sagejs.number_fields.cubic_class_number_native_runtime import certified_complex_cubic_class_number
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
)
for index, (coefficients, order, invariants) in enumerate(cases):
    K = field(coefficients, "a" + str(index))
    receipt = certified_complex_cubic_class_number(K)
    assert receipt is not None
    assert receipt.class_number == order
    assert receipt.invariants == invariants
    assert receipt.proof_status == "exact-relations-conditional-grh"
    assert receipt.theorem == (
        "belabas-diaz-y-diaz-friedman-generators-plus-"
        "belabas-friedman-index-one"
    )
    assert receipt.assumptions == (
        "GRH: zeta_K(s) and zeta_Q(s) are nonzero whenever Re(s) > 1/2",
    )
    assert receipt.matches(K)
    assert K.class_number(proof=False) == order
    detached = receipt.to_dict()
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
    assert receipt.verify()
print("cubic-native-independent-replay-ok")
`, 240_000);
  assert.equal(output, "cubic-native-independent-replay-ok");
});

test("native cubic receipts agree with the pinned nontrivial LMFDB corpus", {
  timeout: 240_000,
}, () => {
  const output = runPython(String.raw`
from sagejs.number_fields.cubic_class_number_native_runtime import certified_complex_cubic_class_number

R = PolynomialRing(QQ, "x")
x = R.gen()
cases = (
    ("3.1.23.1", (1, 0, -1, 1), 1, (), 0),
    ("3.1.431.1", (-8, -1, 0, 1), 1, (), 0),
    ("3.1.1083.1", (-12, -6, -1, 1), 3, (3,), 0),
    ("3.1.1371.1", (6, 3, -1, 1), 4, (4,), 0),
    ("3.1.1563.1", (-6, 7, -1, 1), 5, (5,), 0),
    ("3.1.2856.1", (-21, 9, -1, 1), 7, (7,), 0),
    ("3.1.4027.2", (8, 7, -1, 1), 6, (6,), 0),
    ("3.1.5448.1", (30, -14, -1, 1), 8, (8,), 0),
    # This field needs PARI's next small_norm regime: a reduced shell in
    # compound prime ideals exposes the rank-one unit dependency.
    ("3.1.49096.1", (-126, -6, -1, 1), 9, (9,), 1),
    # The base relation lattice finds a non-fundamental unit.  One multiplier
    # pass shrinks its certified regulator and proves unit index one.
    ("3.1.108115.1", (-383, -68, 0, 1), 10, (10,), 1),
    # The defining order has index 4 and a prime discriminant component above
    # one million.  The proof binder must use its deterministic word-prime
    # certificate rather than an arbitrary trial-division cutoff.
    ("3.1.1181183.1", (-796, 92, -1, 1), 8, (2, 2, 2), 1),
    # PARI's narrower first small_norm batch needs one multiplier pass here;
    # the source-transparent all-ideal adjacent batch already certifies it.
    # This also exercises a 17-ideal resident factor base.
    ("3.1.1737311.1", (289, -42, -1, 1), 8, (2, 2, 2), 0),
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
    assert receipt.matches(K), label
print("cubic-native-lmfdb-corpus-ok")
`);
  assert.equal(output, "cubic-native-lmfdb-corpus-ok");
});
