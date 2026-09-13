"""Generate independent fixtures using SageMath, not the Sage.js runtime.

Run with `sage -python` and capture stdout as JSON. The caller supplies the
verified upstream revision; the package build/digest should additionally be
recorded beside the resulting fixture when using a downstream distribution.
"""

import argparse
import json

from sage.all import GF, PolynomialRing
from sage.version import version

parser = argparse.ArgumentParser()
parser.add_argument("--upstream-commit", required=True)
parser.add_argument("--package", default=None)
parser.add_argument("--package-sha256", default=None)
args = parser.parse_args()
if len(args.upstream_commit) != 40 or any(
    c not in "0123456789abcdef" for c in args.upstream_commit
):
    raise ValueError("upstream revision must be a full hexadecimal Git commit")

fields = [
    (2, [1, 1, 1]),
    (2, [1, 1, 0, 1]),
    (3, [1, 0, 1]),
    (3, [1, 2, 0, 1]),
    (5, [2, 0, 1]),
    (65519, [1, 0, 1]),
]
cases = []
for p, modulus in fields:
    degree = len(modulus) - 1
    prime_ring = PolynomialRing(GF(p), "t")
    field = GF(p**degree, "a", modulus=prime_ring(modulus))
    a = field.gen()

    def coefficient_record(value):
        digits = [str(int(c)) for c in field(value).polynomial().list()]
        return digits + ["0"] * (degree - len(digits))

    def polynomial_record(value):
        return [
            [coefficient_record(c), [int(e) for e in exponent]]
            for c, exponent in zip(value.coefficients(), value.exponents())
        ]

    for order in ["lex", "deglex", "degrevlex"]:
        ring = PolynomialRing(field, names=("x", "y"), order=order)
        x, y = ring.gens()
        workloads = [
            ("zero", []),
            ("unit", [ring(1), x]),
            ("positive-dimensional", [x * y]),
            ("order-sensitive", [x**2 - a * y, x * y - 1]),
            ("homogeneous", [x**2 - a * y**2, x * y]),
            ("nonradical", [(x - a) ** 2, (y - a**2) ** 3]),
        ]
        for name, generators in workloads:
            ideal = ring.ideal(generators)
            # The storage-neutral ABI uses an empty basis for the zero ideal.
            basis = [f for f in ideal.groebner_basis() if f != 0]
            dimension = int(ideal.dimension())
            record = {
                "id": "gf-" + str(p**degree) + "-" + order + "-" + name,
                "field": {
                    "characteristic": str(p),
                    "degree": degree,
                    "modulus": [str(c) for c in modulus],
                },
                "variables": ["x", "y"],
                "order": order,
                "generators": [polynomial_record(f) for f in generators],
                "basis": [polynomial_record(f) for f in basis],
                "dimension": dimension,
            }
            if dimension == 0:
                normal_basis = list(ideal.normal_basis())
                record["quotient_dimension"] = len(normal_basis)
                record["normal_basis_exponents"] = sorted(
                    [int(e) for e in f.exponents()[0]] for f in normal_basis
                )
            elif dimension == -1:
                record["quotient_dimension"] = 0
                record["normal_basis_exponents"] = []
            cases.append(record)

print(
    json.dumps(
        {
            "schema": "sagejs.extension-fields.sage-oracles/v1",
            "oracle": {
                "name": "SageMath",
                "version": version,
                "upstream_commit": args.upstream_commit,
                "distribution_package": args.package,
                "distribution_package_sha256": args.package_sha256,
                "algorithms": "Sage default exact ideal algorithms",
            },
            "cases": cases,
        },
        indent=2,
        sort_keys=True,
    )
)
