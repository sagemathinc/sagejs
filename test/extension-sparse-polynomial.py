"""Exact sparse substrate checks using the actual Sage.js field parents."""

from sagejs.polynomial_algorithms.exact_field import ExactField
from sagejs.polynomial_algorithms.generic_sparse_mpoly import SparseContext
from sagejs.polynomial_algorithms.fq_mpoly_transfer import pack_terms, unpack_terms


def packet(words):
    return b"SJFM\x01\x00\x00\x00" + b"".join(
        int(word).to_bytes(8, "little") for word in words
    )


for K in [QQ, GF(5), GF(4, "a"), GF(9, "b"), GF(25, "c")]:
    field = ExactField(K)
    a = K.gen() if field.family == "finite-extension" else K(2)
    for order in ["lex", "deglex", "degrevlex"]:
        context = SparseContext(field, 2, order)
        x, y = context.generator(0), context.generator(1)
        f = x.add(y).add(context.constant(a))
        g = x.subtract(y).add(context.constant(1))
        quotient, remainder = f.multiply(g).divide(f)
        assert quotient.equal(g) and not remainder.terms()
        assert f.power(3).equal(f.multiply(f).multiply(f))
        assert f.derivative(0).equal(context.constant(1))
        assert f.evaluate([a, 1]) == a + 1 + a
        assert x.negate().add(x).terms() == ()
        assert f.degree() == 1 and context.constant(0).degree() == -1
        if field.family == "finite-extension":
            words, count = pack_terms(f.terms(), field, 2, order)
            header = [
                field.characteristic,
                field.degree,
                2,
                ["lex", "deglex", "degrevlex"].index(order),
                count,
            ]
            header += [int(c) for c in field.descriptor()["modulus"]]
            rows = []
            for i in range(count):
                rows.extend(words[i * field.degree : (i + 1) * field.degree])
                start = count * field.degree + i * 2
                rows.extend(words[start : start + 2])
            decoded = unpack_terms(packet(header + rows), field, 2, order)
            assert context.polynomial(decoded).equal(f)
            assert all(c.parent() is K for c, _ in decoded)

print("exact sparse polynomial arithmetic and coordinate packets passed")
