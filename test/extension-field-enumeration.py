# sagejs-test-tier: portable
# DISABLED: full-runtime fixture run by extension-field-enumeration.cjs
"""Canonical finite-field enumeration, including nonprimitive generators."""

T = PolynomialRing(GF(3), "t")
t = T.gen()
nonprimitive = GF(9, "a", modulus=t**2 + 1)
a = nonprimitive.gen()
assert a**4 == 1
assert a**2 != 1
values = list(nonprimitive)
assert len(values) == 9
assert len(set(str(value) for value in values)) == 9
assert values == [
    nonprimitive(0),
    nonprimitive(1),
    nonprimitive(2),
    a,
    a + 1,
    a + 2,
    2 * a,
    2 * a + 1,
    2 * a + 2,
]

for order in [4, 8, 9, 16, 25, 27, 125]:
    K = GF(order, "b")
    b = K.gen()
    p = int(K.characteristic())
    actual = list(K)
    assert len(actual) == order
    assert len(set(str(value) for value in actual)) == order
    for encoded, value in enumerate(actual):
        remaining = encoded
        expected = K(0)
        power = K(1)
        for index in range(K.degree()):
            expected += K(remaining % p) * power
            remaining //= p
            power *= b
        assert value == expected
        assert value.parent() is K
        assert value**order == value

# Iterators are independent and yield immutable snapshots across carry steps.
left = iter(nonprimitive)
right = iter(nonprimitive)
assert next(left) == 0
assert next(left) == 1
assert next(right) == 0
snapshot = next(left)
assert snapshot == 2
assert next(left) == a
assert snapshot == 2
assert list(GF(3)) == [GF(3)(0), GF(3)(1), GF(3)(2)]

# Construction and the first few elements do not materialize the field.
large = GF(1009**2, "c")
iterator = iter(large)
assert [next(iterator) for _ in range(5)] == [large(i) for i in range(5)]
