"""Cold/refined and cached genus-2/3 real-period benchmarks.

Run after building Sage.js with:

```sh
./bin/sagejs --python bench/hyperelliptic-periods.sage
```

The checksum records the real component count and a decimal prefix of the
model period, so a timing cannot silently benchmark a failed/empty result.
"""

import time

from sagejs.hyperelliptic_curves.periods import clear_period_cache, real_period


def measure(label, curve, precision):
    clear_period_cache()
    started = time.perf_counter()
    cold = real_period(curve, prec=precision)
    cold_elapsed = time.perf_counter() - started
    started = time.perf_counter()
    warm = real_period(curve, prec=precision)
    warm_elapsed = time.perf_counter() - started
    assert warm.cache_hit and cold.verify()["verified"] and warm.verify()["verified"]
    checksum = (cold.real_components(), str(cold.model_period())[:18])
    print(
        "RESULT",
        label,
        precision,
        "cold_seconds",
        float(cold_elapsed),
        "cached_seconds",
        float(warm_elapsed),
        "checksum",
        checksum,
    )


R = PolynomialRing(QQ, "x")
x = R.gen()
measure("genus2-all-real", HyperellipticCurve((x+3)*(x+2)*(x+1)*(x-1)*(x-2)), 96)
measure("genus2-mixed", HyperellipticCurve(x**5-x+1), 96)
measure("genus3-generalized", HyperellipticCurve(x**7-x+1, x**2), 96)
