// sagejs-test-tier: integration
"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

test("the browser cyclotomic and character corpus agrees with native execution", async (t) => {
  const { characterHeckeCases } = await import("../packages/flint-wasm/test/character-hecke-support.mjs");
  const sage = await createSage();
  t.after(() => sage.close());
  for (const item of characterHeckeCases) {
    const result = await sage.evaluate(item.source, { timeout: 120000 });
    assert.equal(result.repr, item.expected, item.name);
  }
});

test("portable cyclotomic factors agree exactly with native factors", async (t) => {
  const sage = await createSage();
  t.after(() => sage.close());
  const result = await sage.evaluate(`
from sagejs.polynomial_algorithms.cyclotomic_factor import factor_cyclotomic
# Independently generated with SageMath 10.9.post1, 2026-09-06.
last_degrees = {3:[1,1,1,1], 4:[2,2], 5:[1,1,2], 7:[1,1,2],
                8:[2,2], 9:[1,1,2], 12:[2,2]}
checked = 0
for n in [3,4,5,7,8,9,12]:
    K = CyclotomicField(n)
    z = K.gen()
    R = PolynomialRing(K,'x')
    x = R.gen()
    for f in [R(QQ(3)/7), x-z, x^2-2, x^4-1,
              (z/3)*(x-z)^2*(x+1)^3, (x^2-z)*(x^2+z+1)]:
        portable = factor_cyclotomic(f)
        native = f.factor()
        assert R(portable.value()) == f
        assert portable.unit() == native.unit()
        assert len(portable) == len(native), (n,f,portable,native)
        for factor, exponent in portable:
            assert any(factor == g and exponent == e for g,e in native), (n,f,portable,native)
        checked += 1
    assert sorted([g.degree() for g,e in portable]) == last_degrees[n]
    try:
        factor_cyclotomic(R(0))
        raise AssertionError('zero accepted')
    except ArithmeticError:
        pass
checked
`, { timeout: 300000 });
  assert.equal(result.repr, "42");
});
