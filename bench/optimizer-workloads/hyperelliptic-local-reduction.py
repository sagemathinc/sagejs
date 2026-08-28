"""Warm-profile entry for public semistable hyperelliptic local reduction."""

PRIMES = (5_003, 10_009, 20_011)
EXPECTED_EULER_FACTORS = (
    (1, -1, 5_003, -5_003),
    (1, -183, 10_191, -10_009),
    (1, 111, 19_899, -20_011),
)

_CURVES = None


def __profile_prepare__():
    """Construct the public curves before sampling begins."""
    global _CURVES
    ring = PolynomialRing(QQ, "x")
    x = ring.gen()
    _CURVES = tuple(HyperellipticCurve(x**5 + x**2 + prime) for prime in PRIMES)
    return (len(_CURVES), PRIMES)


def _production_once():
    if _CURVES is None:
        raise RuntimeError("call __profile_prepare__ before the production entry")
    return tuple(curve.local_reduction(prime) for curve, prime in zip(_CURVES, PRIMES))


def _exact_output(results):
    factors = tuple(
        tuple(int(value) for value in result.coefficients) for result in results
    )
    assert factors == EXPECTED_EULER_FACTORS
    assert all(result.certified for result in results)
    return tuple(
        (
            int(result.prime),
            factor,
            result.reduction_type,
            int(result.conductor_exponent),
            int(result.toric_rank),
        )
        for result, factor in zip(results, factors)
    )


def __profile_run__():
    """Run all measured public reductions and return stable exact evidence."""
    return _exact_output(_production_once())
