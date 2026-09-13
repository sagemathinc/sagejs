"""Independent binary-packet rejection and parent-binding fixtures."""

import runpy
from pathlib import Path

fixtures = runpy.run_path(
    str(Path(__file__).with_name("generic-groebner-independent.py"))
)

from sagejs.polynomial_algorithms.fq_mpoly_transfer import (
    pack_terms,
    unpack_terms,
    unpack_factorization,
)


class Field(fixtures["QuadraticField"]):
    degree = 2
    constructed = 0

    def coordinates(self, value):
        return list(value)

    def from_coordinates(self, coordinates):
        self.constructed += 1
        return tuple(coordinates)


def packet(words):
    return b"SJFM\x01\x00\x00\x00" + b"".join(
        int(x).to_bytes(8, "little") for x in words
    )


field = Field(3, 1, 0)
other = Field(3, 2, 1)
# p, degree, variables, order, terms, modulus, then two rows: x and a*y.
words = [3, 2, 2, 0, 2, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1]
source = packet(words)
expected = (((1, 0), (1, 0)), ((0, 1), (0, 1)))
assert unpack_terms(source, field, 2, "lex") == expected
assert pack_terms(expected, field, 2, "lex") == ([1, 0, 0, 1, 1, 0, 0, 1], 2)

for bad in [source[:i] for i in range(len(source))] + [source + b"\x00"]:
    before = field.constructed
    try:
        unpack_terms(bad, field, 2, "lex")
    except ValueError:
        pass
    else:
        raise AssertionError("truncated or trailing packet accepted")
    assert field.constructed == before

for index, value in [
    (0, 5),
    (1, 3),
    (2, 3),
    (3, 1),
    (4, 4097),
    (5, 2),
    (13, 3),
    (14, 1048577),
]:
    bad = words.copy()
    bad[index] = value
    before = field.constructed
    try:
        unpack_terms(packet(bad), field, 2, "lex")
    except ValueError:
        pass
    else:
        raise AssertionError(("malformed packet accepted", index))
    assert field.constructed == before

try:
    unpack_terms(source, other, 2, "lex")
except ValueError as error:
    assert "defining polynomial" in str(error)
else:
    raise AssertionError("equal-cardinality field presentations were conflated")
assert other.constructed == 0

# A nontrivial unit and a repeated nonconstant factor. Preflight must cover
# the entire container, not allocate the unit before noticing a bad last row.
unit = packet([3, 2, 2, 0, 1, 1, 0, 1, 0, 1, 0, 0])
framing = b"SJFF\x01\x00\x00\x00"
u64 = lambda x: int(x).to_bytes(8, "little")
factorization = framing + u64(1) + u64(len(unit)) + unit
factorization += u64(3) + u64(len(source)) + source
assert unpack_factorization(factorization, field, 2, "lex") == (
    (0, 1),
    ((expected, 3),),
)
for bad in [factorization[:i] for i in range(len(factorization))] + [
    factorization + b"\x00",
    framing + u64(4097) + factorization[16:],
    framing + u64(1) + u64(len(unit)) + unit + u64(0) + u64(len(source)) + source,
    framing + u64(1) + u64(len(unit)) + unit + u64(2**32) + u64(len(source)) + source,
    framing + u64(1) + u64(len(unit)) + unit + u64(1) + u64(len(unit)) + unit,
]:
    before = field.constructed
    try:
        unpack_factorization(bad, field, 2, "lex")
    except ValueError:
        pass
    else:
        raise AssertionError("malformed factorization packet was accepted")
    assert field.constructed == before
print("independent fq multivariate packet bounds and presentation checks passed")
