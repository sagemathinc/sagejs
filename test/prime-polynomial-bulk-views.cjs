"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");

function runSage(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-prime-poly-views-"));
  try {
    const script = join(directory, "witness.py");
    writeFileSync(script, source);
    const result = spawnSync(sagejs, [script], {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
    });
    if (result.error) throw result.error;
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim().split("\n");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const witness = String.raw`
import sagejs.runtime as runtime


def expect_failure(function, fragment):
    try:
        function()
    except Exception as error:
        assert fragment in str(error)
        return
    raise AssertionError("operation unexpectedly succeeded")


def median_time(function):
    samples = []
    for _repeat in range(7):
        started = runtime.wall_time()
        function()
        samples.append(1000 * (runtime.wall_time() - started))
    samples.sort()
    return samples[len(samples) // 2]


F = GF(97)
packed = runtime.uint64_buffer([0, 1, 96])
values = runtime.uint64_residue_elements(packed, F, F._elementType)
assert len(values) == 3
assert [int(value.lift()) for value in values] == [0, 1, 96]
assert all(value.parent() is F for value in values)
assert all(runtime.object.isFrozen(value) for value in values)
assert runtime.uint64_polynomial_format(packed, "z") == "96*z^2 + z"
assert runtime.uint64_polynomial_format(runtime.uint64_buffer([]), "z") == "0"
expect_failure(
    lambda: runtime.uint64_residue_elements(
        runtime.uint64_buffer([97]), F, F._elementType
    ),
    "noncanonical",
)
expect_failure(
    lambda: runtime.uint64_residue_elements(packed, F, type(F)),
    "element type",
)
expect_failure(
    lambda: runtime.uint64_polynomial_format([0, 1], "z"),
    "BigUint64Array",
)
expect_failure(
    lambda: runtime.uint64_polynomial_format(packed, 17),
    "variable",
)

R = PolynomialRing(F, "theta")
zero = R([])
one = R([1])
polynomial = R([17, 1, 0, 96, 2])
assert repr(zero) == "0"
assert repr(one) == "1"
assert repr(polynomial) == "2*theta^4 + 96*theta^3 + theta + 17"
coefficients = polynomial.coefficients()
assert [int(value.lift()) for value in coefficients] == [17, 1, 0, 96, 2]
assert all(value.parent() is F for value in coefficients)
assert coefficients is not polynomial.coefficients()
assert coefficients[0] is not polynomial.coefficients()[0]
coefficients.append(F(3))
assert [int(value.lift()) for value in coefficients[-2:]] == [2, 3]
assert len(polynomial.coefficients()) == 5

# Public formatting consumes canonical packed storage directly. It must not
# construct the scalar coefficient list as an accidental intermediate.
element_type = type(polynomial)
original_coefficients = element_type.coefficients
def forbidden_coefficients(self):
    raise AssertionError("repr materialized scalar coefficients")
element_type.coefficients = forbidden_coefficients
try:
    assert repr(polynomial) == "2*theta^4 + 96*theta^3 + theta + 17"
finally:
    element_type.coefficients = original_coefficients

large_prime = 4294967291
L = GF(large_prime)
S = PolynomialRing(L, "u")
large = S([large_prime - 1, 0, 1, large_prime - 2])
assert repr(large) == (
    "4294967289*u^3 + u^2 + 4294967290"
)
assert [int(value.lift()) for value in large.coefficients()] == [
    large_prime - 1, 0, 1, large_prime - 2
]

H = PolynomialRing(GF(65521), "x")(
    [(37 * index + 11) % 65521 for index in range(20000)]
)
assert len(H.coefficients()) == 20000
assert repr(H).startswith("19243*x^19999 + 19206*x^19998")
coefficient_ms = median_time(H.coefficients)
repr_ms = median_time(lambda: repr(H))
assert coefficient_ms < 40, coefficient_ms
assert repr_ms < 40, repr_ms
print("PRIME_POLYNOMIAL_BULK_VIEWS_OK")
print("coefficients_20000_ms=" + str(round(coefficient_ms, 3)))
print("repr_20000_ms=" + str(round(repr_ms, 3)))
`;

test("packed prime polynomial public views are bulk and Sage-compatible", () => {
  const output = runSage(witness);
  assert.ok(output.includes("PRIME_POLYNOMIAL_BULK_VIEWS_OK"), output.join("\n"));
  assert.ok(
    output.some((line) => /^coefficients_20000_ms=[0-9.]+$/.test(line)),
    output.join("\n"),
  );
  assert.ok(
    output.some((line) => /^repr_20000_ms=[0-9.]+$/.test(line)),
    output.join("\n"),
  );
});
