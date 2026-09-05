# sagejs-test-tier: portable
# DISABLED: full-runtime fixture with injected independent Sage cases
"""Exercise v2 with actual field objects, including detached certificates."""

from sagejs.polynomial_algorithms.exact_field import ExactField
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


def unpack(record, field):
    return tuple(
        (field.from_coordinates([int(c) for c in coefficient]), tuple(exponents))
        for coefficient, exponents in record
    )


for case in _extension_field_cases:
    descriptor = case["field"]
    p = int(descriptor["characteristic"])
    degree = descriptor["degree"]
    modulus = PolynomialRing(GF(p), "t")([int(c) for c in descriptor["modulus"]])
    K = GF(p**degree, "a", modulus=modulus)
    field = ExactField(K)
    ring = GenericGroebnerRing(2, field, case["order"])
    generators = tuple(unpack(f, field) for f in case["generators"])
    expected = tuple(unpack(f, field) for f in case["basis"])
    basis, transformation = basis_with_certificate(generators, ring)
    assert basis == expected, case["id"]
    assert verify_certificate(generators, basis, transformation, ring).valid
    assert all(not normal_form(f, basis, ring) for f in generators)
    record = encode_certificate(basis, transformation, ring)
    assert decode_certificate(record, ring) == (basis, transformation)
    # Identical mathematical presentation, different public parent/name.
    L = GF(p**degree, "b", modulus=modulus)
    renamed = ExactField(L)
    target = GenericGroebnerRing(2, renamed, case["order"])
    copied, copied_transformation = decode_certificate(record, target)
    assert all(c.parent() is L for f in copied for c, e in f)
    renamed_source = tuple(unpack(f, renamed) for f in case["generators"])
    assert verify_certificate(
        renamed_source, copied, copied_transformation, target
    ).valid

K = GF(4, "a")
field = ExactField(K)
a = K.gen()
sample = (
    ((K(1), (2, 0)), (-a, (0, 1))),
    ((K(1), (1, 1)), (K(-1), (0, 0))),
)
for limits in [
    {"max_operations": 1},
    {"max_terms": 1},
    {"max_pairs": 1},
    {"max_generators": 1},
    {"max_exponent": 1},
    {"max_output_bytes": 1},
]:
    limited = GenericGroebnerRing(2, field, budget=GroebnerBudget(**limits))
    try:
        basis_with_certificate(sample, limited)
    except GroebnerResourceError:
        pass
    else:
        raise AssertionError("a resource limit returned a partial answer")

print("generic exact-field Sage fixtures passed")
