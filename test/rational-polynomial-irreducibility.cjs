// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const {spawnSync} = require("node:child_process");
const {resolve} = require("node:path");
const test = require("node:test");
const root = resolve(__dirname, "..");
function run(source, environment = {}) {
  const result = spawnSync(process.execPath, ["bin/sagejs", "--python"], {
    cwd: root, input: source, encoding: "utf8", timeout: 120_000,
    env: {...process.env, SAGEJS_FORBID_POLYNOMIAL_NAPI: "1", ...environment},
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result.stdout;
}
const mathematics = String.raw`
R = PolynomialRing(QQ, "x")
x = R.gen()
assert not R(0).is_irreducible()
assert not R(1).is_irreducible()
assert not R(QQ(-7)/13).is_irreducible()
assert (3*x + QQ(5)/7).is_irreducible()
assert (x*x + QQ(1)/3).is_irreducible()
assert (x**3 + QQ(2)/3).is_irreducible()
assert not ((x - QQ(1)/2)*(x*x + QQ(1)/3)).is_irreducible()
for degree in range(2, 10):
    # Eisenstein at 2; no reference CAS needed for this family.
    p = x**degree + 2*x + 2
    for scale in [QQ(1), QQ(-7)/13, QQ(2**130 + 1)/17]:
        q = scale * p
        before = q.coefficients()
        assert q.is_irreducible()
        assert not (q*q).is_irreducible()
        assert not (q*(x-3)).is_irreducible()
        assert q.coefficients() == before
        assert not q._exact_polynomial_resource().closed
assert ((x + 2**130)**3 + 2*(x + 2**130) + 2).is_irreducible()

# A monic cubic over Q is reducible iff it has an integer root dividing c.
for index in range(150):
    a = index % 7 - 3
    b = (index * 13) % 31 - 15
    c = (index * 17) % 41 - 20
    reducible = c == 0
    if c != 0:
        for root in range(-abs(c), abs(c)+1):
            if root != 0 and c % root == 0:
                if root**3 + a*root**2 + b*root + c == 0:
                    reducible = True
    p = R([c, b, a, 1])
    assert p.is_irreducible() == (not reducible)
    assert ((QQ(-11)/19)*p).is_irreducible() == (not reducible)
print("RATIONAL_IRREDUCIBILITY_MATH_OK")
`;
test("rational irreducibility agrees with independent exact families and root tests", () => {
  assert.match(run(mathematics), /RATIONAL_IRREDUCIBILITY_MATH_OK/);
  assert.match(run(mathematics, {SAGEJS_NATIVE_DISABLE: "1"}), /RATIONAL_IRREDUCIBILITY_MATH_OK/);
});

test("factor resources close after success, rejection and accessor errors", () => {
  assert.match(run(String.raw`
from sagejs.ffi import flint as ffi
R = PolynomialRing(QQ, "x")
x = R.gen()
p = x**3 + 2*x + 2
reducible = p*(x-3)
borrowed_source = p._exact_polynomial_resource()
original_factor = ffi.fmpq_polynomial_factor_resource
original_count = ffi.exact_polynomial_factorization_count
original_exponent = ffi.exact_polynomial_factorization_exponent
created = []
def tracked_factor(source):
    result = original_factor(source)
    created.append(result)
    return result
def fail_accessor(*args):
    raise ValueError("injected metadata failure")
ffi.fmpq_polynomial_factor_resource = tracked_factor
try:
    assert p.is_irreducible()
    assert len(created) == 1 and created[-1].closed
    assert not reducible.is_irreducible()
    assert len(created) == 2 and created[-1].closed
    ffi.exact_polynomial_factorization_count = fail_accessor
    try:
        p.is_irreducible()
    except ValueError as error:
        assert str(error) == "injected metadata failure"
    else:
        raise AssertionError("count error was swallowed")
    assert created[-1].closed
    ffi.exact_polynomial_factorization_count = original_count
    ffi.exact_polynomial_factorization_exponent = fail_accessor
    assert not reducible.is_irreducible()
    assert created[-1].closed
    try:
        p.is_irreducible()
    except ValueError as error:
        assert str(error) == "injected metadata failure"
    else:
        raise AssertionError("exponent error was swallowed")
    assert created[-1].closed
finally:
    ffi.fmpq_polynomial_factor_resource = original_factor
    ffi.exact_polynomial_factorization_count = original_count
    ffi.exact_polynomial_factorization_exponent = original_exponent
assert not borrowed_source.closed
assert p.is_irreducible() and p(0) == 2
print("RATIONAL_IRREDUCIBILITY_OWNERSHIP_OK")
`), /RATIONAL_IRREDUCIBILITY_OWNERSHIP_OK/);
});

test("the no-resource branch retains factorization reconstruction", () => {
  assert.match(run(String.raw`
from sagejs.polynomial_algorithms.public_structural import rational_is_irreducible
class Factors(list):
    def unit(self):
        return 1
class Portable:
    def degree(self):
        return 3
    def _has_fmpq_polynomial_resource(self):
        return False
    def factor(self):
        self.calls += 1
        return self.factors
class Factor:
    def __mul__(self, unit):
        assert unit == 1
        return owner
owner = Portable()
owner.calls = 0
owner.factors = Factors([[Factor(), 1]])
assert rational_is_irreducible(owner)
owner.factors = Factors([[Factor(), 2]])
assert not rational_is_irreducible(owner)
owner.factors = Factors([[Factor(), 1], [Factor(), 1]])
assert not rational_is_irreducible(owner)
assert owner.calls == 3
print("RATIONAL_IRREDUCIBILITY_FALLBACK_OK")
`), /RATIONAL_IRREDUCIBILITY_FALLBACK_OK/);
});
