#!/usr/bin/env python3
"""Emit Sage reference data for the checked-in hyperelliptic cases.

Run this with Sage, not ordinary CPython.  The script writes JSON to stdout so
the Node orchestrator can compare it without depending on presentation text.
"""

import argparse
import json
import platform
import sys
import time

from sage.all import GF, HyperellipticCurve, PolynomialRing, set_random_seed
from sage.env import SAGE_VERSION


def integer_strings(values):
    return [str(value) for value in values]


def make_polynomial(ring, coefficients):
    return ring([ring.base_ring()(coefficient) for coefficient in coefficients])


def raw_hasse_witt(curve, genus, prime):
    f, h = curve.hyperelliptic_polynomials()
    if prime == 2 or h != 0 or f.degree() % 2 == 0:
        return None
    matrix = curve._Cartier_matrix_cached()[0]
    characteristic = list(matrix.charpoly())
    return {
        "modulus": str(prime),
        "rows": [[str(int(entry)) for entry in row] for row in matrix.rows()],
        "characteristic_polynomial_mod_p": integer_strings(
            [int(entry) % prime for entry in reversed(characteristic)]
        ),
    }


def case_result(case, include_group=True):
    prime = int(case["prime"])
    field = GF(prime)
    ring = PolynomialRing(field, "x")
    f = make_polynomial(ring, case["f"])
    h = make_polynomial(ring, case["h"])
    result = {"id": case["id"]}
    try:
        curve = HyperellipticCurve(f, h)
        if not curve.is_smooth():
            raise ValueError("singular reduction")
    except (ArithmeticError, TypeError, ValueError) as error:
        result.update(
            {
                "good": False,
                "reason": f"{type(error).__name__}: {error}",
            }
        )
        return result

    genus = int(case["genus"])
    frobenius = curve.frobenius_polynomial()
    lpolynomial = integer_strings(reversed(list(frobenius)))
    point_counts = integer_strings(
        curve.cardinality(extension_degree=degree) for degree in range(1, genus + 1)
    )
    jacobian_order = str(curve.jacobian().cardinality())

    invariants = None
    if include_group:
        try:
            invariants = integer_strings(curve.jacobian().abelian_group().invariants())
        except (
            ArithmeticError,
            NotImplementedError,
            RuntimeError,
            TypeError,
            ValueError,
        ):
            invariants = None

    tags = []
    p_rank = None
    if prime != 2 and h == 0 and f.degree() % 2 == 1:
        p_rank = int(curve.p_rank())
        tags.append(f"p-rank-{p_rank}")
        if p_rank == genus:
            tags.append("ordinary")

    result.update(
        {
            "good": True,
            "reason": None,
            "lpolynomial_coefficients_ascending": lpolynomial,
            "extension_point_counts": point_counts,
            "jacobian_order": jacobian_order,
            "jacobian_invariants": invariants,
            "hasse_witt": raw_hasse_witt(curve, genus, prime),
            "p_rank": None if p_rank is None else str(p_rank),
            "derived_tags": tags,
        }
    )
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("cases")
    parser.add_argument("--repeat", type=int, default=1)
    parser.add_argument("--benchmark-core", action="store_true")
    arguments = parser.parse_args()
    with open(arguments.cases, encoding="utf-8") as stream:
        cases = json.load(stream)

    set_random_seed(20260818)
    if arguments.repeat < 1:
        parser.error("--repeat must be positive")
    timings = []
    rows = None
    for _ in range(arguments.repeat):
        started = time.perf_counter()
        rows = [
            case_result(case, include_group=not arguments.benchmark_core)
            for case in cases["cases"]
        ]
        timings.append((time.perf_counter() - started) * 1000)
    output = {
        "oracle": {
            "name": "sage",
            "version": SAGE_VERSION,
            "python": platform.python_version(),
        },
        "timings_ms": timings,
        "rows": rows,
    }
    json.dump(output, sys.stdout, sort_keys=True, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
