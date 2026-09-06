"""Small exact GF(4) decomposition benchmark, shared by native and Wasm.

Run with `sagejs bench/extension-groebner-components.py` or the corresponding
production Wasm evaluator. Resource and proof defaults are not overridden.
"""

from time import monotonic

K = GF(4, "a")
a = K.gen()
R = PolynomialRing(K, ["x", "y"])
x, y = R.gens()
left = R.ideal((x - a) ** 2, y)
right = R.ideal(x - a - 1, y**2)
started = monotonic()
product = left.intersection(right)
print("intersection seconds:", monotonic() - started)
started = monotonic()
components = product.primary_decomposition(proof=True)
print("primary decomposition seconds:", monotonic() - started)
assert len(components) == 2
started = monotonic()
assert components[0].intersection(components[1]).is_equal(product)
print("exact recomposition seconds:", monotonic() - started)
