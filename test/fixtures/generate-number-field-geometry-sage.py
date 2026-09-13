"""Independent SageMath oracle; run with Sage's Python, capture JSON stdout."""

import json

from sage.all import NumberField, PolynomialRing, QQ
from sage.version import version

T = PolynomialRing(QQ, "t")
cases = []
for modulus in [[-2, 0, 1], [1, 0, 1], [-2, 0, 0, 1], [-1, -1, 0, 1], [-2, 3, 6]]:
    K = NumberField(T(modulus), "a")
    a = K.gen()

    def scalar(value):
        return [str(c) for c in K(value).list()]

    def polynomial(value):
        return [[scalar(c), list(e)] for e, c in value.dict().items()]

    for order in ["lex", "deglex", "degrevlex"]:
        R = PolynomialRing(K, ["x", "y"], order=order)
        x, y = R.gens()
        for generators in [
            [x**2 - a * y, x * y - 1],
            [(a + 1) * x**2 - y / 3, x * y - a],
            [x * y],
            [x**2 - a * y**2, x * y],
        ]:
            I = R.ideal(generators)
            cases.append(
                {
                    "modulus": modulus,
                    "order": order,
                    "generators": [polynomial(f) for f in generators],
                    "basis": [
                        polynomial(f)
                        for f in I.groebner_basis(algorithm="libsingular:std")
                    ],
                    "dimension": int(I.dimension()),
                }
            )
    U = PolynomialRing(K, "x")
    x = U.gen()
    for f in [K(2) / 3 * (x - a) ** 3 * (x**2 - 3), x**2 + a * x + 1, x**3 - 2]:
        factorization = f.factor()
        cases.append(
            {
                "modulus": modulus,
                "polynomial": [scalar(c) for c in f.list()],
                "unit": scalar(factorization.unit()),
                "factors": [
                    [[scalar(c) for c in g.list()], int(e)] for g, e in factorization
                ],
            }
        )

print(
    json.dumps(
        {
            "schema": "sagejs.number-field-geometry-oracles/v1",
            "oracle": {
                "name": "SageMath",
                "version": version,
                "groebner_algorithm": "libsingular:std",
                "factorization": "Sage default exact number-field factorization",
                "reproduce": "SINGULARPATH=/home/user/upstream/Singular/Singular/LIB /opt/cocalc-webdev-python/bin/python test/fixtures/generate-number-field-geometry-sage.py",
            },
            "cases": cases,
        },
        indent=2,
    )
)
