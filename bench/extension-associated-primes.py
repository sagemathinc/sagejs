"""Compare equivalent exact associated-prime computations on a thick GF(9) point.

Run with `sagejs bench/extension-associated-primes.py`. Timings include all
verification and preserve default mathematical resource limits. This is a
public-operation benchmark, not a claim about compiled native algorithms.
"""

import time

t = PolynomialRing(GF(3), "t").gen()
K = GF(9, "a", modulus=t**2 + 1)
a = K.gen()
R = PolynomialRing(K, ["x", "y"])
x, y = R.gens()

started = time.perf_counter()
fat = R.ideal(x**9 - a, y)
primes = fat.associated_primes(proof=True)
assert len(primes) == 1 and primes[0].is_equal(R.ideal(x - a, y))
print("associated primes, seconds:", time.perf_counter() - started)

# Reconstruct the old route explicitly, using a fresh ideal so public caches
# from the first computation cannot make its comparison artificially cheap.
started = time.perf_counter()
fresh = R.ideal(x**9 - a, y)
reference = [
    component.radical(proof=True)
    for component in fresh.primary_decomposition(proof=True)
]
assert len(reference) == 1 and reference[0].is_equal(primes[0])
print("primary-then-radical reference, seconds:", time.perf_counter() - started)
