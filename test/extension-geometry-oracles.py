# DISABLED: injected independent fixtures, run by extension-geometry.cjs
"""Compare exact extension geometry with independent SageMath results."""

from sagejs.polynomial_algorithms.exact_field import ExactField


def unpack(record, ring, field):
    return ring._from_sparse_terms(
        [
            (field.from_coordinates([int(c) for c in coefficient]), tuple(exponents))
            for coefficient, exponents in record
        ]
    )


def check_components(ideal, records, ring, field):
    actual = ideal.primary_decomposition(proof=True)
    expected = [
        ring.ideal([unpack(f, ring, field) for f in basis]) for basis in records
    ]
    assert len(actual) == len(expected)
    assert all(any(J.is_equal(K, proof=True) for K in expected) for J in actual)
    recomposed = actual[0]
    for component in actual[1:]:
        recomposed = recomposed.intersection(component, proof=True)
    assert recomposed.is_equal(ideal, proof=True)


for case in _extension_geometry_cases:
    p = int(case["characteristic"])
    modulus = PolynomialRing(GF(p), "t")([int(c) for c in case["modulus"]])
    K = GF(p**2, "a", modulus=modulus)
    field = ExactField(K)
    R = PolynomialRing(K, ["x", "y"], order="degrevlex")
    x, y = R.gens()
    fat = R.ideal([unpack(f, R, field) for f in case["fat_generators"]])
    radical = R.ideal([unpack(f, R, field) for f in case["fat_radical"]])
    assert fat.radical(proof=True).is_equal(radical, proof=True)
    joined = R.ideal([unpack(f, R, field) for f in case["joined_generators"]])
    check_components(joined, case["joined_components"], R, field)
    nonsplit = R.ideal([unpack(f, R, field) for f in case["nonsplit_generators"]])
    check_components(nonsplit, case["nonsplit_components"], R, field)
    expected_points = [
        tuple(field.from_coordinates(c) for c in point)
        for point in case["nonsplit_points"]
    ]
    actual_points = [
        tuple(point[v] for v in [x, y]) for point in nonsplit.variety(proof=True)
    ]
    assert len(actual_points) == len(expected_points)
    assert all(point in expected_points for point in actual_points)
    assert len(AffineSpace(K, 2).rational_points()) == case["affine_plane_points"]
    assert (
        len(ProjectiveSpace(K, 1).rational_points()) == case["projective_line_points"]
    )

print("finite-extension geometry matches independent Sage fixtures passed")
