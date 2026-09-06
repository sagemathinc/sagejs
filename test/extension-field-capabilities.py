# sagejs-test-tier: portable
"""Keep scalar availability separate from public geometry and packed ABIs."""

from sagejs.polynomial_algorithms.field_capabilities import (
    field_capability,
    packed_v1_characteristic,
    require_field_operation,
)
from sagejs.polynomial_algorithms.ideal import (
    _groebner_contract_ring,
    _pack_groebner_polynomial,
    groebner_basis,
)
from sagejs.polynomial_algorithms.univariate_field import monic_gcd, monic_xgcd


def rejected(action):
    try:
        action()
    except NotImplementedError as error:
        message = str(error)
        assert "field=" in message
        assert "target=" in message
        assert "proof=" in message
        assert "fallback=" in message
    else:
        raise AssertionError("unsupported coefficient domain was accepted")


for K in [QQ, GF(5)]:
    assert require_field_operation(K, "geometry") is K
    assert require_field_operation(K, "ideal", "lex") is K
    assert packed_v1_characteristic(K, "lex") == (0 if K is QQ else K.characteristic())
    assert AffineSpace(K, 2).base_ring() is K

for K in [GF(4, "a"), GF(9, "b")]:
    record = field_capability(K, "groebner.generic-v2", "lex")
    assert record["supported"]
    assert record["base_field_descriptor"]["family"] == "finite-extension"
    assert field_capability(K, "ideal", "lex")["supported"]
    assert require_field_operation(K, "geometry") is K
    assert AffineSpace(K, 2).base_ring() is K
    rejected(lambda: packed_v1_characteristic(K, "lex"))

    class GuardedRing:
        _order = "lex"

        def base_ring(self):
            return K

        def ngens(self):
            return 2

    ring = GuardedRing()

    class GuardedPolynomial:
        def parent(self):
            return ring

        def terms(self):
            return [(K.gen(), (1, 0))]

    assert (
        _groebner_contract_ring(ring).descriptor()["abi"] == "sagejs.groebner.sparse/v2"
    )
    assert _pack_groebner_polynomial(GuardedPolynomial())[0][0].parent() is K

    # Scalar, univariate, ideal, and geometry capabilities remain distinct.
    assert field_capability(K, "univariate.euclidean")["supported"]
    assert field_capability(K, "univariate.factor")["supported"]
    R = PolynomialRing(K, "t")
    t = R.gen()
    a = K.gen()
    f = (t - a) ** K.characteristic() * (t + 1) ** 2
    quotient, remainder = f.quo_rem(t - a)
    assert not remainder and quotient * (t - a) == f
    assert f % f.gcd(f.derivative()) == 0
    assert (t - a).resultant(t + 1) == a + 1
    factors = list(f.factor())
    assert len(factors) == 2
    assert any(g == t - a and e == K.characteristic() for g, e in factors)
    assert any(g == t + 1 and e == 2 for g, e in factors)
    product = R(1)
    for factor, multiplicity in factors:
        product *= factor**multiplicity
    assert product == f

    first = a * (t - a) ** 2 * (t - 1)
    second = (a + 1) * (t - a) * (t - 1) ** 2
    expected_gcd = (t - a) * (t - 1)
    assert first.gcd(second) == expected_gcd
    assert monic_gcd(first, second) == expected_gcd
    gcd, bezout_left, bezout_right = first.xgcd(second)
    assert gcd == expected_gcd
    assert bezout_left * first + bezout_right * second == gcd
    assert gcd.parent() is R and bezout_left.parent() is R
    assert monic_gcd(R(0), R(0)) == R(0)
    assert monic_xgcd(R(0), R(0)) == (R(0), R(0), R(0))
    assert monic_gcd(a * (t - a), R(0)) == t - a
    assert monic_gcd(R(0), a * (t - a)) == t - a
    assert monic_gcd(R(a), R(a + 1)) == R(1)
    constant_gcd, constant_left, constant_right = monic_xgcd(R(a), R(a + 1))
    assert constant_gcd == R(1)
    assert constant_left * R(a) + constant_right * R(a + 1) == R(1)
    try:
        monic_gcd(t**4097, R(1))
    except ValueError as error:
        assert "degree <= 4096" in str(error)
    else:
        raise AssertionError("Euclidean fallback degree limit was bypassed")


class PretendPrimeField:
    def is_field(self):
        return True

    def is_prime_field(self):
        return True


rejected(lambda: require_field_operation(PretendPrimeField(), "geometry"))

previous = proof.polynomial()
try:
    proof.polynomial(False)
    assert not field_capability(QQ, "ideal")["proof_requested"]
    assert field_capability(QQ, "ideal", proof=True)["proof_requested"]
finally:
    proof.polynomial(previous)

print("extension-field capability boundaries passed")
