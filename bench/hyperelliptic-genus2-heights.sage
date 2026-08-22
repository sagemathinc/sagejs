"""Benchmark certified direct-Kummer genus-2 heights.

Run this in a Sage.js shell after a normal build. It measures cold and cached
Flynn-quartic iteration plus the factorization-free finite correction.
"""

import time

from sagejs.hyperelliptic_curves.genus2_heights import (
    HeightContext,
    canonical_height,
    factorization_free_finite_correction,
    height_pairing,
)


def benchmark(label, repetitions, operation):
    witness = operation()
    started = time.perf_counter()
    for _index in range(repetitions):
        result = operation()
    elapsed = time.perf_counter() - started
    assert result.ball.lower == witness.ball.lower
    assert result.ball.upper == witness.ball.upper
    print(label, "seconds/op:", elapsed / repetitions, "witness:", witness.ball)


R = PolynomialRing(QQ, "x")
x = R.gen()
C = HyperellipticCurve(x**5 - x + 1)
J = C.jacobian()
P = J([x, 1])
Q = J([x - 1, 1])
context = HeightContext(J)

started = time.perf_counter()
cold = canonical_height(P, steps=6, precision=100, context=context)
print("cold certified height seconds:", time.perf_counter() - started)
print("cold enclosure:", cold.ball, "width:", cold.ball.width())

benchmark(
    "warm cached certified height",
    50,
    lambda: canonical_height(P, steps=6, precision=100, context=context),
)

pairing = height_pairing([P, Q], steps=6, precision=100, context=context)
started = time.perf_counter()
for _index in range(20):
    warm_pairing = height_pairing([P, Q], steps=6, precision=100, context=context)
elapsed = time.perf_counter() - started
assert warm_pairing[0][0].lower == pairing[0][0].lower
assert warm_pairing[1][1].upper == pairing[1][1].upper
print("warm cached rank-2 pairing seconds/op:", elapsed / 20)

started = time.perf_counter()
finite = factorization_free_finite_correction(P, precision=100)
print("factorization-free finite correction seconds:", time.perf_counter() - started)
print("finite correction steps:", finite.steps, "enclosure:", finite.ball)
print("context diagnostics:", context.diagnostics())
