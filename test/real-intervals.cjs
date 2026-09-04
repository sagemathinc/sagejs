// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createSage } = require("../dist/tools/kernel.js");

test(
  "directed RealField rounding and certified real/complex intervals",
  { timeout: 120_000 },
  async () => {
    const session = await createSage();
    try {
      const result = await session.evaluate(String.raw`
q = 1/9
nearest = RealField(3, rnd="RNDN")
up = RealField(3, rnd="RNDU")
down = RealField(3, rnd="RNDD")
zero = RealField(3, rnd="RNDZ")
away = RealField(3, rnd="RNDA")

assert nearest(q).exact_rational() == 7/64
assert up(q).exact_rational() == 1/8
assert down(q).exact_rational() == 7/64
assert zero(-q).exact_rational() == -7/64
assert away(-q).exact_rational() == -1/8
assert up(q).sign_mantissa_exponent() == (1, 4, -5)
assert up(q).str(base=2) == "0.00100"
assert repr(up(q)) == "0.13" and repr(down(q)) == "0.10"
assert nearest(q).nextbelow() < nearest(q) < nearest(q).nextabove()
try:
    RealField(53, rnd="not-a-rounding-mode")
    raise AssertionError("invalid rounding mode was accepted")
except ValueError:
    pass

R = RealIntervalField(10)
a = R(q)
assert R is RealIntervalField(10)
assert RIF is RealIntervalField(53)
assert a.precision() == 10
assert repr(a) == "0.112?"
assert a.str(style="brackets") == "[0.11108 .. 0.11121]"
assert q in a
assert a.lower() <= q and a.upper() >= q
assert a.absolute_diameter() >= 0
assert a.relative_diameter() >= 0
assert repr(R(1) / a) == "9.0?"
assert repr(a.sqrt()) == "0.334?"
assert repr(a.exp()) == "1.12?"
assert repr(a.log()) == "-2.20?"
assert repr(a.sin()) == "0.111?"
assert repr(a.cos()) == "0.994?"
assert repr(a.tan()) == "0.112?"

b = R(1/10, 1/8)
assert a.overlaps(b)
assert q in a.intersection(b)
assert q in a.union(b)
try:
    R(0, 1).union(R(2, 3))
    raise AssertionError("a disconnected interval union was accepted")
except ValueError:
    pass

# Deterministic exact-rational differential checks: every mathematically exact
# result remains enclosed after each outward-rounded operation.
samples = [(1, 3), (-5, 7), (11, 13), (29, 17), (-31, 19)]
for n1, d1 in samples:
    for n2, d2 in samples:
        x = n1/d1
        y = n2/d2
        ix = R(x)
        iy = R(y)
        assert x in ix and y in iy
        assert R(x + y) in ix + iy
        assert R(x - y) in ix - iy
        assert R(x * y) in ix * iy
        assert R(x / y) in ix / iy
        assert R(x**3) in ix**3

C = ComplexIntervalField(10)
z = C(a, a)
assert C is ComplexIntervalField(10)
assert CIF is ComplexIntervalField(53)
assert z.precision() == 10
assert repr(z) == "0.112? + 0.112?*I"
assert z.str(style="brackets") == (
    "[0.11108 .. 0.11121] + [0.11108 .. 0.11121]*I"
)
assert z.real() == a and z.imag() == a
assert C(q, q) in z
assert C(q, q)**2 in z*z
assert z.overlaps(C(q, q))
assert "*I" in repr(z.sqrt())
assert "*I" in repr(z.exp())
assert "*I" in repr(z.log())

True
`);
      assert.equal(result.repr, "True");
    } finally {
      await session.close();
    }
  },
);
