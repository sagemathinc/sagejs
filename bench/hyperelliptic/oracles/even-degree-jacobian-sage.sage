# SageMath oracle generator for split even-degree Jacobian arithmetic.
#
# This script targets SageMath develop at or after merge commit 3f60901 from
# https://github.com/sagemath/sage/pull/42373.  Run it with
#
#   sage bench/hyperelliptic/oracles/even-degree-jacobian-sage.sage
#
# and compare the emitted JSON with the checked corpus beside this file.

import json


def record(name, divisor):
    return {
        "name": name,
        "repr": repr(divisor),
        "is_zero": bool(divisor.is_zero()),
    }


rows = []

R.<x> = GF(101)[]
H101 = HyperellipticCurve(x^8 + x + 1)
J101 = Jacobian(H101)
P101 = H101([3, 0])
rows.append(record("sage-pr-42373-point-minus-itself", J101(P101, P101)))

R.<x> = GF(13)[]
H13 = HyperellipticCurve(x^8 + x + 1)
J13 = Jacobian(H13)
P13 = H13([1, 4])
Q13 = H13([2, 5])
rows.extend(
    [
        record("genus3-point-P", J13(P13)),
        record("genus3-point-Q", J13(Q13)),
        record("genus3-point-difference", J13(P13, Q13)),
    ]
)

R.<x> = GF(7)[]
Hg = HyperellipticCurve(x^5 - x^4 + x^2 - x, x^3 + 1)
Jg = Jacobian(Hg)
generalized_sum = Jg(x^2 + x, 0) + Jg(x^2, -x)
rows.extend(
    [
        record("genus2-generalized-sum", generalized_sum),
        record("genus2-generalized-negation", -generalized_sum),
    ]
)

Hs = HyperellipticCurve(x^8 + 3*x + 2)
Js = Jacobian(Hs)
A = Js(x^2 + 4*x + 3, 2*x + 2, 1)
B = Js(x^3 + 6*x^2 + 6*x, 6*x^2 + 6*x + 3, 0)
rows.append(record("genus3-balanced-addition", A + B))

R.<x> = GF(3)[]
J3 = Jacobian(HyperellipticCurve(x^6 + x + 2))
R.<x> = GF(5)[]
J5 = Jacobian(HyperellipticCurve(x^8 + x + 1))

print(
    json.dumps(
        {
            "schema": "sagejs.hyperelliptic-even-degree-sage-oracle.v1",
            "sage_version": SAGE_VERSION,
            "upstream_merge_commit": "3f60901",
            "rows": rows,
            "orders": {"genus2-gf3": int(J3.cardinality()), "genus3-gf5": int(J5.cardinality())},
        },
        sort_keys=True,
        indent=2,
    )
)
