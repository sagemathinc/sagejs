"""Exact nilpotents, inverse Frobenius, and nonsplit residue fields."""

from sagejs.polynomial_algorithms import zero_dimensional as zd

t = PolynomialRing(GF(3), "t").gen()
for K in [GF(4, "a"), GF(9, "a", modulus=t**2 + 1)]:
    a = K.gen()
    p, q = int(K.characteristic()), int(K.cardinality())
    R = PolynomialRing(K, ["x", "y"])
    x, y = R.gens()
    for iterations in [1, 2]:
        root = a
        for _ in range(iterations):
            root = root ** (q // p)
        fat = R.ideal(x ** (p**iterations) - a, y)
        expected = R.ideal(x - root, y)
        assert fat.radical(proof=True).is_equal(expected)
        assert not fat.is_radical()
        assert len(fat.primary_decomposition(proof=True)) == 1
        assert fat.primary_decomposition(proof=True)[0].is_equal(fat)
        assert fat.associated_primes(proof=True)[0].is_equal(expected)
    left = R.ideal((x - a) ** 2, y)
    right = R.ideal(x - a - 1, y**2)
    product = left.intersection(right)
    components = product.primary_decomposition(proof=True)
    assert len(components) == 2
    assert components[0].intersection(components[1]).is_equal(product)
    assert len(product.variety(proof=True)) == 2
    assert product.radical(proof=True).is_equal(R.ideal((x - a) * (x - a - 1), y))
    nonsplit_factor = x**2 + x + a if p == 2 else x**2 - (a + 1)
    nonsplit = R.ideal(nonsplit_factor * (x - a), y - x)
    split = nonsplit.primary_decomposition(proof=True)
    assert len(split) == 2
    assert split[0].intersection(split[1]).is_equal(nonsplit)
    points = nonsplit.variety(proof=True)
    assert len(points) == 1 and points[0][x] == a and points[0][y] == a
    # Enumeration uses base-q coordinates, not field(integer), which would
    # repeat only the prime subfield's constants.
    candidates = zd._finite_candidates(R.ideal(x**2, y), "auto", True)
    first = [next(candidates) for _ in range(q - 1)]
    assert len({repr(value) for value in first}) == q - 1
    assert all(value.degree() == 0 for value in first)
    assert {repr(value) for value in first} == {repr(R(c)) for c in K if c}

print("finite-extension radicals, primary decomposition, and residue fields passed")
