"""Slow end-to-end comparison with the Magma genus-3 height oracle.

This is an opt-in development oracle, not a normal fast test.  It exercises
the public one-call height API with explicit bounded Abel--Jacobi and theta
refinement controls.
"""

import sagejs as sage
from mpmath import mp

from sagejs.hyperelliptic_curves.model import HyperellipticCurve


PRECISION_BITS = 64
ABEL_MAX_REFINEMENTS = 6
THETA_RADIUS = 6
MAGMA_HEIGHT = (
    "2.140344148274058861323964793585361420925496626366201001308229370095855"
    "452111046427960090404459654664891147583303833777382034516531210481375968"
    "121563629849298547"
)

ring = sage.PolynomialRing(sage.QQ, "x_magma_genus3_radius6")
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
height = divisor.canonical_height(
    moving_x=3,
    prec=PRECISION_BITS,
    abel_max_refinements=ABEL_MAX_REFINEMENTS,
    theta_radius=THETA_RADIUS,
)
finite_plan = height.finite_plan.require_complete()
archimedean_value = height.pairing.archimedean.value

with mp.workprec(192):
    absolute_error = abs(mp.mpf(height.value) - mp.mpf(MAGMA_HEIGHT))

print("sagejs_precision_bits=" + str(PRECISION_BITS))
print("abel_max_refinements=" + str(ABEL_MAX_REFINEMENTS))
print("theta_radius=" + str(THETA_RADIUS))
print("candidate_primes=" + ",".join(str(p) for p in finite_plan.support.primes))
print(
    "finite_coefficients="
    + ",".join(str(pairing.coefficient) for pairing in finite_plan.pairings)
)
print("archimedean=" + mp.nstr(archimedean_value, 50))
print("finite=" + mp.nstr(height.pairing.finite_value, 50))
print("sagejs_height=" + mp.nstr(height.value, 50))
print("magma_height=" + MAGMA_HEIGHT)
print("absolute_error=" + mp.nstr(absolute_error, 30))
print("theta_refinement_stable=" + str(height.archimedean_refinement_stable).lower())
print("finite_plan_complete=" + str(finite_plan.complete).lower())
print("finite_exact=" + str(height.finite_exact).lower())
print("rigorous=" + str(height.rigorous).lower())
