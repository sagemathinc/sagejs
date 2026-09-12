"""Independent coefficient arithmetic witnesses for sparse storage."""

import runpy
from pathlib import Path

fields = runpy.run_path(
    str(Path(__file__).with_name("generic-groebner-independent.py"))
)

from sagejs.polynomial_algorithms.generic_sparse_mpoly import SparseContext

for field in [
    fields["QuadraticField"](2, 1, 1),
    fields["QuadraticField"](3, 1, 0),
    fields["RationalField"](),
]:
    for order in ["lex", "deglex", "degrevlex"]:
        context = SparseContext(field, 2, order)
        x, y = context.generator(0), context.generator(1)
        one = context.constant(field.one())
        f = x.add(y).add(one)
        g = x.subtract(y)
        product = f.multiply(g)
        quotient, remainder = product.divide(f)
        assert quotient.equal(g) and not remainder.terms()
        assert f.power(0).equal(one) and f.power(3).equal(f.multiply(f).multiply(f))
        assert x.derivative(0).equal(one) and not y.derivative(0).terms()
        assert x.negate().add(x).terms() == ()
        assert product.degree() == 2
        for a in range(3):
            for b in range(3):
                assert product.evaluate([a, b]) == field.multiply(
                    f.evaluate([a, b]), g.evaluate([a, b])
                )
        clone = SparseContext(field, 2, order)
        try:
            f.add(clone.generator(0))
        except TypeError:
            pass
        else:
            raise AssertionError("cross-context arithmetic was accepted")
        try:
            f.divide(context.constant(field.zero()))
        except ZeroDivisionError:
            pass
        else:
            raise AssertionError("division by zero was accepted")

print("independent sparse polynomial QQ/GF(4)/GF(9) arithmetic passed")
