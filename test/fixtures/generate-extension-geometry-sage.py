"""Generate independent small-field scheme/decomposition fixtures with SageMath."""

import json

from sage.all import AffineSpace, GF, PolynomialRing, ProjectiveSpace
from sage.version import version


def coordinates(c, degree):
    values = [int(v) for v in c.polynomial().list()]
    return values + [0] * (degree - len(values))


def polynomial(f, degree):
    return [
        [coordinates(c, degree), list(map(int, monomial.exponents()[0]))]
        for c, monomial in f
    ]


def basis(I, degree):
    return [polynomial(f, degree) for f in I.groebner_basis() if f]


cases = []
for p, modulus in [(2, [1, 1, 1]), (3, [1, 0, 1])]:
    K = GF(p**2, "a", modulus=PolynomialRing(GF(p), "t")(modulus))
    a = K.gen()
    R = PolynomialRing(K, ["x", "y"], order="degrevlex")
    x, y = R.gens()
    fat = R.ideal(x ** (p**2) - a, y)
    left, right = R.ideal((x - a) ** 2, y), R.ideal(x - a - 1, y**2)
    joined = left.intersection(right)
    nonsplit_factor = x**2 + x + a if p == 2 else x**2 - (a + 1)
    nonsplit = R.ideal(nonsplit_factor * (x - a), y - x)
    cases.append(
        {
            "characteristic": p,
            "modulus": modulus,
            "fat_generators": [polynomial(f, 2) for f in fat.gens()],
            "fat_radical": basis(fat.radical(), 2),
            "joined_generators": [polynomial(f, 2) for f in joined.gens()],
            "joined_components": sorted(
                [basis(J, 2) for J in joined.primary_decomposition()], key=json.dumps
            ),
            "nonsplit_generators": [polynomial(f, 2) for f in nonsplit.gens()],
            "nonsplit_components": sorted(
                [basis(J, 2) for J in nonsplit.primary_decomposition()], key=json.dumps
            ),
            "nonsplit_points": sorted(
                [
                    [coordinates(P[x], 2), coordinates(P[y], 2)]
                    for P in nonsplit.variety()
                ],
                key=json.dumps,
            ),
            "affine_plane_points": len(AffineSpace(K, 2).rational_points()),
            "projective_line_points": len(ProjectiveSpace(K, 1).rational_points()),
        }
    )

print(
    json.dumps(
        {
            "schema": "sagejs.extension-geometry-sage-oracles/v1",
            "sage_version": version,
            "cases": cases,
        },
        indent=2,
    )
)
