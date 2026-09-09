"""Exact, pruned cubic ellipsoid oracle; not a production search or certificate.

The volume policy uses T=478, near PARI 2.17.4's 1500/pi, but deliberately
does not claim identical floating-point bounds, bases, or traversal counters.
Only standard-library rational/integer arithmetic determines membership.
"""

import argparse
import hashlib
import itertools
import json
import math
from fractions import Fraction as Q
from pathlib import Path


def decomposition(g):
    a, b, c, d, e, f = map(Q, g)
    if a <= 0:
        raise ValueError("Gram matrix must be positive definite")
    d1 = d - b * b / a
    if d1 <= 0:
        raise ValueError("Gram matrix must be positive definite")
    m12 = (e - b * c / a) / d1
    d2 = f - c * c / a - d1 * m12 * m12
    if d2 <= 0:
        raise ValueError("Gram matrix must be positive definite")
    return (a, d1, d2), (b / a, c / a, m12)


def quadratic(g, x):
    a, b, c, d, e, f = g
    u, v, w = x
    return (
        a * u * u
        + 2 * b * u * v
        + 2 * c * u * w
        + d * v * v
        + 2 * e * v * w
        + f * w * w
    )


def interval(center, radius_squared):
    """All integers x satisfying (x + center)^2 <= radius_squared."""
    center, radius_squared = Q(center), Q(radius_squared)
    if radius_squared < 0:
        return 1, 0
    p, q = center.numerator, center.denominator
    k = math.isqrt(radius_squared.numerator * q * q // radius_squared.denominator)
    return -((k + p) // q), (k - p) // q


def centered_order(lo, hi, center):
    # Same nearest-integer tie convention as floor(-center + 1/2).
    start = math.floor(-center + Q(1, 2))
    for distance in range(max(abs(lo - start), abs(hi - start)) + 1):
        for value in (
            (start,) if distance == 0 else (start + distance, start - distance)
        ):
            if lo <= value <= hi:
                yield value


def points(g, bound, lower=0, counters=None, node_limit=2_000_000):
    """Each primitive sign-canonical point with lower < Q(x) <= bound once."""
    if lower < 0 or bound < lower:
        raise ValueError("require 0 <= lower <= bound")
    diagonals, mu = decomposition(g)
    counters = {} if counters is None else counters
    counters.update(nodes=0, leaves=0, primitive=0)
    x = [0, 0, 0]

    def visit(level, partial):
        center = (
            (mu[0] * x[1] + mu[1] * x[2])
            if level == 0
            else (mu[2] * x[2] if level == 1 else Q(0))
        )
        lo, hi = interval(center, (bound - partial) / diagonals[level])
        # Choose the positive representative of {x,-x} before visiting leaves.
        if not any(x[level + 1 :]):
            lo = max(lo, 1 if level == 0 else 0)
        if lo > hi:
            return
        for value in centered_order(lo, hi, center):
            counters["nodes"] += 1
            if counters["nodes"] > node_limit:
                raise ValueError("diagnostic node budget exhausted")
            x[level] = value
            total = partial + diagonals[level] * (value + center) ** 2
            if level:
                yield from visit(level - 1, total)
            else:
                counters["leaves"] += 1
                if total > lower and math.gcd(*x) == 1:
                    assert quadratic(g, x) == total <= bound
                    counters["primitive"] += 1
                    yield tuple(x)

    yield from visit(2, Q(0))


def integer_points(g, bound, lower=0, counters=None, node_limit=2_000_000):
    """Equivalent completed-square traversal without rational arithmetic.

    This is a diagnostic generator, not a native resumable implementation.
    Its formulas expose what a compact resident iterator actually needs.
    """
    if not all(isinstance(v, int) for v in (*g, bound, lower)):
        raise ValueError("integer data required")
    if lower < 0 or bound < lower:
        raise ValueError("require 0 <= lower <= bound")
    a, b, c, d, e, f = g
    delta = a * d - b * b
    det = a * d * f + 2 * b * c * e - a * e * e - d * c * c - f * b * b
    if a <= 0 or delta <= 0 or det <= 0:
        raise ValueError("Gram matrix must be positive definite")
    h = a * e - b * c
    counters = {} if counters is None else counters
    counters.update(nodes=0, leaves=0, primitive=0)

    def tick():
        counters["nodes"] += 1
        if counters["nodes"] > node_limit:
            raise ValueError("diagnostic node budget exhausted")

    def ordered(lo, hi, numerator, denominator):
        if lo > hi:
            return
        start = (denominator - 2 * numerator) // (2 * denominator)
        for distance in range(max(abs(lo - start), abs(hi - start)) + 1):
            for value in (
                (start,) if distance == 0 else (start + distance, start - distance)
            ):
                if lo <= value <= hi:
                    yield value

    for z in range(math.isqrt(bound * delta // det) + 1):
        tick()
        numerator = h * z
        k = math.isqrt(a * (bound * delta - det * z * z))
        lo, hi = -((k + numerator) // delta), (k - numerator) // delta
        if z == 0:
            lo = max(lo, 0)
        for y in ordered(lo, hi, numerator, delta):
            tick()
            numerator = b * y + c * z
            square = (
                a * (bound - d * y * y - 2 * e * y * z - f * z * z)
                + numerator * numerator
            )
            assert square >= 0
            k = math.isqrt(square)
            lo, hi = -((k + numerator) // a), (k - numerator) // a
            if y == 0 and z == 0:
                lo = max(lo, 1)
            for x in ordered(lo, hi, numerator, a):
                tick()
                counters["leaves"] += 1
                if math.gcd(x, y, z) == 1 and quadratic(g, (x, y, z)) > lower:
                    counters["primitive"] += 1
                    yield x, y, z


def ceil_root(value, degree):
    value = Q(value)
    if value < 0 or degree < 1:
        raise ValueError("invalid root")
    lo, hi = 0, 1 << ((math.ceil(value).bit_length() + degree - 1) // degree)
    while lo < hi:
        mid = (lo + hi) // 2
        if mid**degree >= value:
            hi = mid
        else:
            lo = mid + 1
    return lo


def volume_bound(g, target=Q(478)):
    d, _ = decomposition(g)
    squared = target * target * d[0] * d[1]
    radius = (
        ceil_root(squared, 2) if squared < d[2] ** 2 else ceil_root(squared * d[2], 3)
    )
    return max(2 * g[3], radius)


def box_points(g, bound, node_limit=2_000_000):
    """Independent exhaustive oracle using inverse-Gram coordinate bounds."""
    a, b, c, d, e, f = g
    det = a * d * f + 2 * b * c * e - a * e * e - d * c * c - f * b * b
    decomposition(g)
    limits = [
        math.isqrt(math.floor(Q(bound * cofactor, det)))
        for cofactor in (d * f - e * e, a * f - c * c, a * d - b * b)
    ]
    if math.prod(2 * n + 1 for n in limits) > node_limit:
        raise ValueError("diagnostic box budget exhausted")
    for x in itertools.product(*(range(-n, n + 1) for n in limits)):
        if (
            next((v for v in reversed(x) if v), 0) > 0
            and math.gcd(*x) == 1
            and 0 < quadratic(g, x) <= bound
        ):
            yield x


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("capture", type=Path)
    args = parser.parse_args()
    raw = args.capture.read_bytes()
    capture = json.loads(raw)
    assert capture["schema"] == "sagejs.diagnostic/raw-cubic-relations-v1"
    results = []
    for record in capture["records"]:
        assert record["analysis"][505] == "901"
        n = int(record["output"][50])
        assert 0 < n <= 12
        plans = []
        for i in range(n):
            p = list(map(int, record["analysis"][128 + 11 * i : 139 + 11 * i]))
            if not p[0]:
                continue
            g, old = p[:6], p[6]
            policies = []
            for name, radius in (
                ("initial", old),
                ("fourfold", 4 * old),
                ("volume-T478", volume_bound(g)),
            ):
                counters = {}
                found = list(points(g, radius, counters=counters))
                integer_counters = {}
                assert (
                    list(integer_points(g, radius, counters=integer_counters)) == found
                )
                assert integer_counters == counters
                assert set(box_points(g, radius)) == set(found)
                policies.append(
                    {
                        "policy": name,
                        "bound": str(radius),
                        "relative_to_initial": float(Q(radius, old)),
                        "counts": counters,
                        "points": found,
                    }
                )
            plans.append(
                {"ideal_index": i, "gram": list(map(str, g)), "policies": policies}
            )
        results.append(
            {
                "name": record["name"],
                "captured_source_sha256": record["sourceSha256"],
                "plans": plans,
            }
        )
    print(
        json.dumps(
            {
                "schema": "sagejs.diagnostic/exact-cubic-fp-v1",
                "production_changed": False,
                "timing_claim": False,
                "independent_class_group_replay": False,
                "capture_sha256": hashlib.sha256(raw).hexdigest(),
                "driver_sha256": hashlib.sha256(
                    Path(__file__).read_bytes()
                ).hexdigest(),
                "records": results,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
