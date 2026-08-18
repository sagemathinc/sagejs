#!/usr/bin/env python3
"""Emit PARI `hyperellcharpoly` results through Sage's in-process binding."""

import argparse
import json
import sys

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
    arguments = parser.parse_args()
    with open(arguments.cases, encoding="utf-8") as stream:
        cases = json.load(stream)
    output = {
        "oracle": {
            "name": "pari-hyperellcharpoly",
            "version": ".".join(str(part) for part in pari.version()),
            "host_sage_version": SAGE_VERSION,
        },
        "rows": [case_result(case) for case in cases["cases"]],
    }
    json.dump(output, sys.stdout, sort_keys=True, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
