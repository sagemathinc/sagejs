// sagejs-test-tier: specialized
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { resolve } = require("node:path");
const test = require("node:test");

const root = resolve(__dirname, "..");

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
}

test("trivial complex cubics close their exact relation quotient online", {
  timeout: 240_000,
}, () => {
  runPython(`
from sagejs.number_fields.cubic_class_number_native_runtime import certified_complex_cubic_class_number

R = PolynomialRing(QQ, "x")
x = R.gen()

def field(coefficients, name):
    polynomial = R(0)
    for exponent, coefficient in enumerate(coefficients):
        polynomial += coefficient * x**exponent
    return NumberField(polynomial, name)

# The first case is LMFDB 3.1.10636.1. Its frozen predecessor transcript
# retained 32 rows after eagerly planning all seven adjacent ideals. The
# online exact row-HNF reaches ZZ^7 at row 11 after planning only two ideals.
trivial_cases = (
    ("target", (-31, 19, -1, 1), 7, (2, 17, 11, 11)),
    # Previously unseen class-number-one records from the frozen holdout
    # corpus, ordered by absolute discriminant.
    ("holdout_10915", (50, -21, -1, 1), 8, (3, 14, 13, 13)),
    ("holdout_14695", (17, 10, -1, 1), 6, (1, 6, 7, 7)),
    ("holdout_17176", (26, -2, -1, 1), 8, (4, 24, 16, 16)),
)
for name, coefficients, factor_count, diagnostics in trivial_cases:
    receipt = certified_complex_cubic_class_number(field(coefficients, name))
    assert receipt is not None
    assert receipt.class_number == 1
    assert receipt.invariants == ()
    assert receipt.factor_base_size == factor_count
    assert receipt.proof_status == "exact-trivial-presentation-conditional-grh"
    assert receipt.verify_conditional_grh()
    actual = tuple(receipt._values[index] for index in range(50, 54))
    assert actual == diagnostics
    planned, enumerated, retained, online_rows = actual
    assert 0 < planned < factor_count
    assert 0 < enumerated
    assert retained == receipt.relation_count
    assert online_rows == retained

target = certified_complex_cubic_class_number(
    field((-31, 19, -1, 1), "target_repeat")
)
assert target is not None
assert target.relation_count == 11
assert target.relation_count < 32

# Nontrivial quotients must continue through unit and analytic certification;
# the online index-one publication diagnostics therefore remain absent.
controls = (
    ("h5", (-55, 9, 0, 1), 5, (5,)),
    ("h2", (-4, 3, -1, 1), 2, (2,)),
)
for name, coefficients, class_number, invariants in controls:
    receipt = certified_complex_cubic_class_number(field(coefficients, name))
    assert receipt is not None
    assert receipt.class_number == class_number
    assert receipt.invariants == invariants
    assert receipt.verify_conditional_grh()
    assert tuple(receipt._values[index] for index in range(50, 54)) == (0, 0, 0, 0)
`);
});
