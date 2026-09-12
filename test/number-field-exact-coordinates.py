# sagejs-test-tier: portable
# DISABLED: full-runtime fixture run by number-field-exact-coordinates.cjs
"""Absolute number-field coefficients have canonical, parent-bound codecs."""

from sagejs.polynomial_algorithms.exact_field import ExactField
from sagejs.polynomial_algorithms.field_capabilities import field_capability


def rejected(action):
    try:
        action()
    except (ValueError, TypeError, NotImplementedError):
        return
    raise AssertionError("invalid number-field coordinate input was accepted")


R = PolynomialRing(QQ, "t")
t = R.gen()
# Independent SageMath 10.9.post1 coefficient witnesses, reproduced by importing
# sage.all under /opt/cocalc-webdev-python/bin/python on 2026-09-12.
# For each defining polynomial f, compute NumberField(f, 'a'), then
# list(1 / (K.gen() + 1)). These are scalar witnesses, not N2/N3 ideal fixtures.
for f, inverse_coordinates in [
    (t**2 - 2, [-1, 1]),
    (t**2 + 1, [QQ(1) / 2, -QQ(1) / 2]),
    (t**3 - 2, [QQ(1) / 3, -QQ(1) / 3, QQ(1) / 3]),
    (t**3 - t - 1, [0, -1, 1]),
    (t**2 + t / 2 - QQ(1) / 3, [3, -6]),
]:
    K = NumberField(f, "a")
    L = NumberField(6 * f / 5, "renamed")
    field = ExactField(K)
    receiving = ExactField(L)
    assert field.family == "number-field"
    assert field.characteristic == 0 and field.cardinality is None
    assert field.descriptor() == receiving.descriptor()
    assert field.presentation()["generator"] == "a"
    assert receiving.presentation()["generator"] == "renamed"
    a, b = K.gen(), L.gen()
    assert (1 / (a + 1)).list() == inverse_coordinates
    for value in [K(0), K(1), a, (a + 1) / 3, 1 / (a + 1), a**7 / 11]:
        coordinates = field.coordinates(value)
        assert len(coordinates) == 2 * K.degree()
        assert field.from_coordinates(coordinates) == value
        encoded = field.encode(value)
        assert all(isinstance(c, str) for c in encoded["coordinates"])
        assert field.decode(encoded).parent() is K
        decoded = receiving.decode(encoded)
        assert decoded.parent() is L
        assert receiving.encode(decoded) == encoded
        assert decoded.list() == value.list()
    assert receiving.decode(field.encode((a + 1) / 3)) == (b + 1) / 3
    rejected(lambda: field.coerce(b))
    rejected(lambda: field.elements(100))
    packet = field.encode(K(1))
    for replacement in ["01", "-0", "1.0", "1" * 4097]:
        bad = dict(packet)
        bad["coordinates"] = list(packet["coordinates"])
        bad["coordinates"][0] = replacement
        rejected(lambda: field.decode(bad))
    for pair in [[2, 2], [1, 0], [-1, -1], [True, 1]]:
        bad_coordinates = pair + [0, 1] * (K.degree() - 1)
        rejected(lambda: field.from_coordinates(bad_coordinates))
    rejected(lambda: field.from_coordinates([1, 1]))
    # Scalar availability must not prematurely promote any public operation.
    for operation in [
        "geometry",
        "ideal",
        "groebner.packed-v1",
        "groebner.generic-v2",
        "univariate.euclidean",
        "univariate.factor",
    ]:
        capability = field_capability(K, operation)
        assert not capability["supported"]
        assert capability["base_field_descriptor"]["family"] == "number-field"

# Isomorphic but differently presented fields are not automatically identified.
left = ExactField(NumberField(t**2 - 2, "a"))
right = ExactField(NumberField(t**2 - 8, "a"))
assert left.descriptor() != right.descriptor()
rejected(lambda: right.decode(left.encode(left.parent.gen())))

# Descriptors return copies, never mutable access to the adapter's identity.
descriptor = left.descriptor()
descriptor["modulus"][0][0] = "999"
assert left.descriptor()["modulus"][0] == ["-2", "1"]
assert ExactField(QQ).encode(QQ(2) / 3)["coordinates"] == ["2", "3"]
assert ExactField(GF(7)).encode(GF(7)(6))["coordinates"] == ["6"]
print("exact number-field coefficient codec passed")
