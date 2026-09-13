// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSage } = require("../dist/tools/kernel.js");

test("analytic special functions load lazily and preserve public batch semantics", async (t) => {
  const sage = await createSage();
  t.after(() => sage.close());
  const result = await sage.evaluate(`
import sys
assert 'sagejs.special_functions' not in sys.modules
assert abs(zeta(2) - 1.6449340668482264) < 1e-14
assert 'sagejs.special_functions' in sys.modules
host = sys.modules['sagejs.special_functions']
K = ComplexField(100)
points = [K(1), K(2), K(3), K(4)]
batch = complex_gamma_values(points, prec=100)
assert len(batch) == 4
for value, expected in zip(batch, [1, 1, 2, 6]):
    assert abs(value - expected) < 1e-25
assert complex_gamma(K(4), prec=100) == batch[3]
RZ = RiemannZeta(100)
assert abs(zeta(2, prec=100) - RZ(2)) < 1e-25
assert abs(zeta(2, derivative=1, prec=100) - RZ.derivative(2)) < 1e-25
xi = riemann_xi_values([K(2), K(3)], prec=100)
assert xi[0] == riemann_xi(K(2), prec=100)
assert abs(xi[0] - RZ.xi(2)) < 1e-25
assert abs(xi[0] - 1.0471975511965977462) < 1e-14
for function in [complex_gamma_values, riemann_xi_values]:
    for args, keywords in [([], {}), ([K(2)], {'prec': 8})]:
        try:
            function(args, **keywords)
        except ValueError:
            pass
        else:
            raise AssertionError('invalid batch accepted')
assert sys.modules['sagejs.special_functions'] is host
assert kronecker_character(5).conductor() == 5
print('lazy-special-functions-ok')
`);
  assert.equal(result.stdout.trim(), "lazy-special-functions-ok");
});
