"""Compare prepared public FLINT products with the exact sparse reference.

Run with `SAGEJS_NATIVE_DISABLE=1 node bin/sagejs bench/extension-mpoly-residency.py`.
This measures repeated bounded products, not Groebner or factorization speed.
Construction, initial decoding, and validation are outside the timed regions.
The public path includes its normal bounded-cache eviction and serialization.
"""

import json
import platform
import time

from sagejs.polynomial_algorithms.extension_mpoly_backend import cache_status


def measure(operation):
    samples = []
    result = None
    for sample in range(6):
        started = time.perf_counter()
        for _ in range(100):
            result = operation()
        elapsed = time.perf_counter() - started
        if sample:
            samples.append(elapsed)
    return result, sorted(samples)[len(samples) // 2]


K = GF(9, "a")
R = PolynomialRing(K, ["x", "y"], order="degrevlex")
x, y = R.gens()
f, g = (x + K.gen()) ** 2 + y, x + y + K.gen()
left, right = f._native.reference(), g._native.reference()
reference, sparse_seconds = measure(lambda: left.multiply(right))
public, public_seconds = measure(lambda: f * g)
assert public.terms() == list(reference.terms())
print(
    json.dumps(
        {
            "schema": "sagejs.extension-mpoly-residency-benchmark/v1",
            "platform": platform.platform(),
            "field": "GF(9)",
            "order": "degrevlex",
            "variables": 2,
            "products_per_sample": 100,
            "warmup_samples": 1,
            "retained_samples": 5,
            "input_terms": [len(f.terms()), len(g.terms())],
            "output_terms": len(public.terms()),
            "public_seconds": public_seconds,
            "generic_sparse_seconds": sparse_seconds,
            "resident_cache": cache_status(),
            "equivalent": True,
        }
    )
)
