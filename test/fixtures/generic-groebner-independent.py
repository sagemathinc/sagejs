"""CPython-only independent arithmetic fixtures for the generic v2 engine."""

import sys
from fractions import Fraction
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[2] / "src" / "lib"))

from sagejs.polynomial_algorithms.generic_groebner import (
    GenericGroebnerRing,
    GroebnerBudget,
    GroebnerResourceError,
    basis_with_certificate,
    decode_certificate,
    encode_certificate,
    normal_form,
    verify_certificate,
)
from sagejs.polynomial_algorithms.groebner_contract import (
    GroebnerRing,
    verify_groebner_certificate,
)


class QuadraticField:
    """Tiny pair arithmetic modulo a fixed monic irreducible quadratic.

    Inversion deliberately searches all elements, independent of FLINT and
    of the production field implementation. Only GF(4) and GF(9) are used.
    """

    family = "finite-extension"
    generator = (0, 1)

    def __init__(self, p, constant, linear):
        self.characteristic = p
        self.modulus = (constant, linear, 1)

    def descriptor(self):
        return {
            "characteristic": str(self.characteristic),
            "modulus": list(self.modulus),
        }

    def coerce(self, value):
        if isinstance(value, int):
            return value % self.characteristic, 0
        return tuple(c % self.characteristic for c in value)

    def zero(self):
        return (0, 0)

    def one(self):
        return (1, 0)

    def add(self, left, right):
        return self.coerce(tuple(a + b for a, b in zip(left, right)))

    def negate(self, value):
        return self.coerce(tuple(-c for c in value))

    def multiply(self, left, right):
        a, b = left
        c, d = right
        m, n, _ = self.modulus
        return self.coerce((a * c - b * d * m, a * d + b * c - b * d * n))

    def inverse(self, value):
        for a in range(self.characteristic):
            for b in range(self.characteristic):
                if self.multiply(value, (a, b)) == self.one():
                    return (a, b)
        raise ZeroDivisionError("zero is not invertible")

    def encode(self, value):
        return {"field": self.descriptor(), "coordinates": list(self.coerce(value))}

    def decode(self, value):
        assert value["field"] == self.descriptor()
        return tuple(value["coordinates"])


class RationalField:
    """CPython Fraction oracle, unrelated to Sage.js rational representations."""

    family = "rational"
    characteristic = 0
    generator = Fraction(2)

    def descriptor(self):
        return {"family": "rational"}

    def coerce(self, value):
        return Fraction(value)

    def zero(self):
        return Fraction(0)

    def one(self):
        return Fraction(1)

    def add(self, left, right):
        return left + right

    def negate(self, value):
        return -value

    def multiply(self, left, right):
        return left * right

    def inverse(self, value):
        return 1 / value

    def encode(self, value):
        return [str(value.numerator), str(value.denominator)]

    def decode(self, value):
        return Fraction(int(value[0]), int(value[1]))


def check_field(field):
    a = field.generator
    one = field.one()
    minus_one = field.negate(one)
    minus_a = field.negate(a)
    inverse_a = field.inverse(a)
    minus_inverse_a = field.negate(inverse_a)
    inputs = (
        ((one, (2, 0)), (minus_a, (0, 1))),
        ((one, (1, 1)), (minus_one, (0, 0))),
    )
    for order in ["lex", "deglex", "degrevlex"]:
        ring = GenericGroebnerRing(2, field, order)
        basis, change = basis_with_certificate(inputs, ring)
        if order == "lex":
            expected = (
                ((one, (1, 0)), (minus_a, (0, 2))),
                ((one, (0, 3)), (minus_inverse_a, (0, 0))),
            )
        else:
            expected = (
                inputs[0],
                inputs[1],
                ((one, (0, 2)), (minus_inverse_a, (1, 0))),
            )
        assert basis == expected, (field.descriptor(), order, basis)
        assert verify_certificate(inputs, basis, change, ring).valid
        assert all(not normal_form(f, basis, ring) for f in inputs)
        record = encode_certificate(basis, change, ring)
        assert record["ring"]["abi"] == "sagejs.groebner.sparse/v2"
        assert decode_certificate(record, ring) == (basis, change)
        bad_record = dict(record)
        bad_record["ring"] = {"abi": "sagejs.groebner.sparse/v1"}
        try:
            decode_certificate(bad_record, ring)
        except ValueError:
            pass
        else:
            raise AssertionError("v1 record accepted as generic v2")
        bad = [list(row) for row in change]
        bad[0] = [(), ()]
        assert not verify_certificate(inputs, basis, bad, ring).valid
        # A strict superideal passes input/S-pair reduction but fails G = TF.
        unit = (((one, (0, 0)),),)
        report = verify_certificate(inputs, unit, (((), ()),), ring)
        assert report.reverse_containment and report.buchberger
        assert not report.ideal_containment and not report.valid

    for limits in [
        dict(max_operations=1),
        dict(max_terms=1),
        dict(max_pairs=1),
        dict(max_generators=1),
        dict(max_exponent=1),
        dict(max_output_bytes=1),
    ]:
        ring = GenericGroebnerRing(2, field, budget=GroebnerBudget(**limits))
        try:
            basis_with_certificate(inputs, ring)
        except GroebnerResourceError:
            pass
        else:
            raise AssertionError(("unenforced budget", limits))
    ring = GenericGroebnerRing(2, field)
    assert basis_with_certificate(((), ()), ring) == ((), ())
    unit = ((one, (0, 0)),)
    assert basis_with_certificate((unit, inputs[0]), ring)[0] == (unit,)

    for exponents in [(True, 0), (-1, 0), (1.5, 0), (1,)]:
        try:
            basis_with_certificate(
                (((one, exponents),),), GenericGroebnerRing(2, field)
            )
        except ValueError:
            pass
        else:
            raise AssertionError(("invalid exponent vector accepted", exponents))

    expired = GroebnerBudget(max_seconds=1.0)
    expired.started -= 2.0
    try:
        basis_with_certificate(inputs, GenericGroebnerRing(2, field, budget=expired))
    except GroebnerResourceError:
        pass
    else:
        raise AssertionError("expired computation returned an answer")


for parameters in [(2, 1, 1), (3, 1, 0)]:
    check_field(QuadraticField(*parameters))
check_field(RationalField())

# The shared v1 verifier must reject redundant leading terms, even when all
# four ideal-containment and S-pair checks otherwise succeed.
ring = GroebnerRing(1, "lex", 3)
x = ((1, (1,)),)
x2 = ((1, (2,)),)
one = ((1, (0,)),)
for basis, rows in [((x, x), ((one,), (one,))), ((x, x2), ((one,), (x,)))]:
    report = verify_groebner_certificate((x,), basis, rows, ring)
    assert not report.valid and not report.reduced
    assert report.ideal_containment and report.reverse_containment and report.buchberger
assert not verify_groebner_certificate((x,), ((), x), (((),), (one,)), ring).valid

print("independent generic Gröbner QQ/GF(4)/GF(9) fixtures passed")
