# DISABLED: injected independent fixtures, run by extension-ideals.cjs
"""Public resident polynomials and ideals against independent Sage bases."""

from sagejs.polynomial_algorithms.exact_field import ExactField


def unpack(record, ring, field):
    return ring._from_sparse_terms(
        [
            (field.from_coordinates([int(c) for c in coefficient]), tuple(exponents))
            for coefficient, exponents in record
        ]
    )


for case in _extension_field_cases:
    descriptor = case["field"]
    p = int(descriptor["characteristic"])
    modulus = PolynomialRing(GF(p), "t")([int(c) for c in descriptor["modulus"]])
    K = GF(p ** descriptor["degree"], "a", modulus=modulus)
    field = ExactField(K)
    R = PolynomialRing(K, ["x", "y"], order=case["order"])
    generators = [unpack(f, R, field) for f in case["generators"]]
    expected = [unpack(f, R, field) for f in case["basis"]]
    I = R.ideal(generators)
    assert list(I.groebner_basis(proof=True)) == expected, case["id"]
    assert all(I.normal_form(f, proof=True) == 0 for f in generators), case["id"]
    assert I.is_equal(R.ideal(expected), proof=True), case["id"]

print("public extension ideals match independent Sage fixtures")
