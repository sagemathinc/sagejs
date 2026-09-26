#!/usr/bin/env python3
"""Derive the generic factor-catalog workload from neutral row-6 input."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path


POLYNOMIAL_ASCENDING = [2_000_000_000_018, -2_000_000_000_010, 0, 1]


def primes_through(limit: int) -> list[int]:
    prime = bytearray(b"\x01") * (limit + 1)
    prime[:2] = b"\x00\x00"
    for value in range(2, math.isqrt(limit) + 1):
        if prime[value]:
            count = (limit - value * value) // value + 1
            prime[value * value :: value] = b"\x00" * count
    return [value for value in range(2, limit + 1) if prime[value]]


def main() -> None:
    constant, linear, quadratic, leading = POLYNOMIAL_ASCENDING
    assert quadratic == 0 and leading == 1
    equation_discriminant = -4 * linear**3 - 27 * constant**2
    log_discriminant = math.log(abs(equation_discriminant))
    analytic_maximum = int(4.0 * log_discriminant * log_discriminant)
    catalog_limit = max(64, 2 * analytic_maximum)
    primes = primes_through(catalog_limit)
    # `factor_cubic` tries roots in `0..prime`. The generic constructor calls
    # it once for the catalog and again while publishing factor-base ideals.
    one_pass_root_candidates = sum(primes)
    source = Path(__file__).resolve().parents[2] / "src/factor_base.rs"
    receipt = {
        "schema": "sagejs.rust-class-group/row6-factor-catalog-work-v1",
        "qualificationStatus": "diagnostic-candidate-only",
        "usesOracleAsInput": False,
        "polynomialAscending": [str(value) for value in POLYNOMIAL_ASCENDING],
        "equationOrderDiscriminant": str(equation_discriminant),
        "logAbsoluteDiscriminantF64": log_discriminant,
        "maximumGrhBoundPreallocation": analytic_maximum,
        "catalogPrimeLimit": catalog_limit,
        "catalogPrimeCount": len(primes),
        "largestCatalogPrime": primes[-1],
        "oneFactorizationPassRootCandidates": one_pass_root_candidates,
        "twoPassUpperPathRootCandidates": 2 * one_pass_root_candidates,
        "implementationSourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "interpretation": "the generic constructor linearly scans every residue for each cubic and repeats factor_cubic during publication; this precedes coefficient-box enumeration",
    }
    output = Path(__file__).resolve().parent / "results/catalog-work.json"
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, indent=2))


if __name__ == "__main__":
    main()
