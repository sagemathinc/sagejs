#!/usr/bin/env python3
"""Emit PARI `hyperellcharpoly` results through Sage's in-process binding."""

import argparse
import json
import sys
import time

from sage.all import GF, ZZ, PolynomialRing
from sage.env import SAGE_VERSION
from sage.libs.pari import pari


def polynomial(ring, coefficients):
    return ring([ring.base_ring()(coefficient) for coefficient in coefficients])


def case_result(case):
    if case.get("expect_bad", False):
        return {"id": case["id"], "status": "bad-reduction"}
    field = GF(int(case["prime"]))
    ring = PolynomialRing(field, "x")
    f = polynomial(ring, case["f"])
    h = polynomial(ring, case["h"])
    try:
        frobenius = ZZ["x"](pari([f, h]).hyperellcharpoly())
    except Exception as error:  # PARI errors vary across cypari2 releases.
        return {
            "id": case["id"],
            "status": "unsupported",
            "reason": f"{type(error).__name__}: {error}",
        }
    return {
        "id": case["id"],
        "status": "ok",
        "lpolynomial_coefficients_ascending": [
            str(coefficient) for coefficient in reversed(list(frobenius))
        ],
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("cases")
    parser.add_argument("--repeat", type=int, default=1)
    arguments = parser.parse_args()
    with open(arguments.cases, encoding="utf-8") as stream:
        cases = json.load(stream)
    if arguments.repeat < 1:
        parser.error("--repeat must be positive")
    timings = []
    rows = None
    for _ in range(arguments.repeat):
        started = time.perf_counter()
        rows = [case_result(case) for case in cases["cases"]]
        timings.append((time.perf_counter() - started) * 1000)
    output = {
        "oracle": {
            "name": "pari-hyperellcharpoly",
            "version": ".".join(str(part) for part in pari.version()),
            "host_sage_version": SAGE_VERSION,
        },
        "timings_ms": timings,
        "rows": rows,
    }
    json.dump(output, sys.stdout, sort_keys=True, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
