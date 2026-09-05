# sagejs-test-tier: portable
# DISABLED: full-runtime fixture run by exact-field-contract.cjs
"""Field identity, arithmetic, bounded enumeration, and canonical codecs."""

from sagejs.polynomial_algorithms.exact_field import ExactField


def rejects(operation, exception=ValueError):
    try:
        operation()
    except exception:
        return
    raise AssertionError("invalid operation was accepted")


for K in [QQ, GF(3), GF(101), GF(9, "a"), GF(32, "b")]:
    field = ExactField(K)
    changed_descriptor = field.descriptor()
    changed_descriptor["modulus"].append("not a coefficient")
    assert changed_descriptor != field.descriptor()
    assert field.zero() is field.zero()
    assert field.one() is field.one()
    values = [K(0), K(1), K(-1), K(2)]
    if field.family == "rational":
        values += [QQ(1) / 3, QQ(-5) / 7]
    elif field.family == "finite-extension":
        values += [K.gen(), K.gen() ** 3 + K.gen() + 2]
    for value in values:
        record = field.encode(value)
        restored = field.decode(record)
        assert restored == value
        assert restored.parent() is K
        assert field.encode(restored) == record
        assert field.subtract(field.add(value, field.one()), field.one()) == value
        assert field.add(value, field.negate(value)) == field.zero()
        if value != 0:
            assert field.multiply(value, field.inverse(value)) == field.one()
    rejects(lambda: field.inverse(field.zero()), ZeroDivisionError)
    rejects(lambda: field.from_coordinates([1.5]))
    rejects(lambda: field.from_coordinates([True]))
    if field.cardinality is not None:
        assert len(list(field.elements(field.cardinality))) == field.cardinality
        rejects(lambda: field.elements(field.cardinality - 1))

T = PolynomialRing(GF(3), "t")
t = T.gen()
K = GF(9, "a", modulus=t**2 + 1)
L = GF(9, "b", modulus=t**2 + 1)
M = GF(9, "c", modulus=t**2 + t + 2)
left, renamed, different = ExactField(K), ExactField(L), ExactField(M)
assert left.descriptor() == renamed.descriptor()
assert left.presentation() != renamed.presentation()
assert left.descriptor() != different.descriptor()
record = left.encode(2 * K.gen() + 1)
assert renamed.decode(record) == 2 * L.gen() + 1
assert renamed.decode(record).parent() is L
rejects(lambda: different.decode(record))
assert left.coordinates(K(0)) == [0, 0]
assert left.coordinates(K(2)) == [2, 0]

for coordinates in [
    ["-1", "0"],
    ["3", "0"],
    ["01", "0"],
    ["-0", "0"],
    ["+1", "0"],
    ["1.0", "0"],
    ["1e0", "0"],
    ["1", "0", "0"],
    [1, "0"],
    ["9" * 4097, "0"],
]:
    bad = dict(record)
    bad["coordinates"] = coordinates
    rejects(lambda: left.decode(bad))

rational = ExactField(QQ)
for coordinates in [[0, 2], [2, 4], [1, 0], [1, -2]]:
    rejects(lambda: rational.from_coordinates(coordinates))
rejects(lambda: rational.elements(100), NotImplementedError)
rejects(lambda: ExactField(ZZ), NotImplementedError)
rejects(lambda: ExactField(Zmod(9)), NotImplementedError)
