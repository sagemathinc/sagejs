import assert from "node:assert/strict";
import test from "node:test";

import { createSage } from "../node-kernel.mjs";

test("the no-Singular algebraic-geometry core is exact in Node-Wasm", async () => {
  const sage = await createSage();
  try {
    const result = await sage.evaluate(`
A = AffineSpace(QQ, 2, names=("x", "y"))
x, y = A.gens()
C = Curve(y^2-x^3)
P = C(0, 0)
closure = C.projective_closure("z", proof=True)
R = PolynomialRing(QQ, names=("u", "v"))
u, v = R.gens()
for constant in [QQ(1), QQ(1)/2]:
    quotient = R.ideal(u^2-constant, v).quotient_ring(proof=True)
    minimum = quotient.minimal_polynomial(quotient(u), "test_t")
    assert minimum.parent().base_ring() is QQ
    assert minimum.coefficients() == [-constant, QQ(0), QQ(1)]
ideal = R.ideal((u-1)^2*(u+1), v)
components = ideal.primary_decomposition(proof=True)
primes = ideal.associated_primes(proof=True)
assert len(primes) == 2
assert primes[0].intersection(primes[1], proof=True).is_equal(ideal.radical(proof=True), proof=True)
print(A.dimension(), C.is_smooth(P), closure.degree(proof=True))
print(len(components), ideal.radical(proof=True).vector_space_dimension(proof=True))
print(components[0].intersection(components[1], proof=True).is_equal(ideal, proof=True))
`);
    assert.equal(result.stdout, "2 False 3\n2 2\nTrue\n");

    for (let iteration = 0; iteration < 3; iteration += 1) {
      // Each evaluate() call is an isolated program over the persistent
      // kernel resources, so recreate ordinary Python bindings explicitly.
      const repeated = await sage.evaluate(`
R = PolynomialRing(QQ, names=("u", "v"))
u, v = R.gens()
sample_ideal = R.ideal((u-1)^2*(u+1), v)
[sorted(repr(g) for g in Q.groebner_basis(proof=True)) for Q in sample_ideal.primary_decomposition(proof=True)]
`);
      assert.equal(
        repeated.repr,
        "[['u + 1', 'v'], ['u^2 - 2*u + 1', 'v']]",
      );
    }

    assert.equal((await sage.evaluate(
      "len(AffineSpace(GF(4, 'a'), 2).rational_points())",
    )).repr, "16");
  } finally {
    await sage.close();
  }
});
