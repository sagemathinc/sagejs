"""Replay the exact Sage.js side of the Magma genus-3 height oracle.

This intentionally stops at the exact finite Faltings--Hriljac plan.  The
external Magma transcript supplies the canonical-height target.  The current
public Sage.js archimedean adapter needs a larger Abel--Jacobi refinement
budget on this fixture and is therefore reported, not silently weakened.
"""

import sagejs as sage

from sagejs.hyperelliptic_curves.genus3_heights import (
    move_split_mumford_divisor,
    split_mumford_finite_plan,
)
from sagejs.hyperelliptic_curves.model import HyperellipticCurve


ring = sage.PolynomialRing(sage.QQ, "x_magma_genus3_height")
x_value = ring.gen()
f_value = (
    x_value**7
    - 9 * x_value**6
    + 28 * x_value**5
    - 32 * x_value**4
    + x_value**3
    + 17 * x_value**2
    - 6 * x_value
)
curve = HyperellipticCurve(f_value, ring(1))
jacobian = curve.jacobian()
divisor = jacobian([x_value * (x_value - 1) * (x_value - 2), ring(0)])

assert curve.genus() == 3
assert tuple(str(value) for value in divisor.uv()) == (
    "x_magma_genus3_height^3 - 3*x_magma_genus3_height^2 + 2*x_magma_genus3_height",
    "0",
)

move = move_split_mumford_divisor(divisor, moving_x=3)
assert move.to_dict()["split_rational_support"] == (
    ("0", "0"),
    ("1", "0"),
    ("2", "0"),
)
assert move.to_dict()["moving_fibre"] == (("3", "0"), ("3", "-1"))
assert move.negative_class_multiple == 2

plan = split_mumford_finite_plan(move).require_complete()
assert plan.support.primes == (2, 3, 13, 101, 389, 38677)
assert plan.unsupported == ()
assert tuple(
    (pairing.prime, str(pairing.coefficient), pairing.model_certified)
    for pairing in plan.pairings
) == (
    (2, "-3", True),
    (3, "-3", True),
    (13, "0", True),
    (101, "0", True),
    (389, "0", True),
    (38677, "0", True),
)

print("Sage.js genus-3 Magma-oracle finite replay passed")
