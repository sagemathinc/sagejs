#!/usr/bin/env python3
"""Persistent Sage/PARI oracle adapter for the analytic-rank corpus.

This is a developer benchmark adapter, not a Sage.js runtime dependency.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import statistics
import time
from pathlib import Path

import sage.version
from sage.all import EllipticCurve
from sage.libs.pari import pari


def median(values: list[float]) -> float:
    return statistics.median(values) if values else 0.0


def select_curves(manifest: dict, tier: str) -> list[dict]:
    if tier == "all":
        return manifest["curves"]
    return [curve for curve in manifest["curves"] if tier in curve["tiers"]]


def decimal(value) -> str:
    # PARI's specialized routine decides its own effective output precision.
    # repr preserves every digit exposed through Sage without inventing digits.
    return repr(value)


def evaluate(curve_data: dict, samples: int, coefficient_cutoff: int) -> dict:
    ainvs = [int(value) for value in curve_data["a_invariants"]]
    construction_times = []
    analytic_times = []
    same_object_times = []
    ranks = []
    derivatives = []

    for _ in range(samples):
        started = time.perf_counter()
        curve = EllipticCurve(ainvs)
        construction_times.append(time.perf_counter() - started)

        started = time.perf_counter()
        rank, derivative = curve.analytic_rank(
            algorithm="pari", leading_coefficient=True
        )
        analytic_times.append(time.perf_counter() - started)
        ranks.append(int(rank))
        derivatives.append(decimal(derivative))

        started = time.perf_counter()
        repeated_rank, repeated_derivative = curve.analytic_rank(
            algorithm="pari", leading_coefficient=True
        )
        same_object_times.append(time.perf_counter() - started)
        if int(repeated_rank) != int(rank):
            raise RuntimeError("same-object Sage/PARI rank changed")
        if decimal(repeated_derivative) != decimal(derivative):
            raise RuntimeError("same-object Sage/PARI derivative changed")

    curve = EllipticCurve(ainvs)
    coefficient_started = time.perf_counter()
    coefficients = [int(value) for value in curve.anlist(coefficient_cutoff)]
    coefficient_time = time.perf_counter() - coefficient_started
    coefficient_text = ",".join(str(value) for value in coefficients).encode()

    zero_sum = []
    for expected in curve_data.get("zero_sum_upper_bounds", []):
        started = time.perf_counter()
        bound = curve.analytic_rank_upper_bound(
            max_Delta=expected["delta"], adaptive=False
        )
        zero_sum.append(
            {
                "delta": expected["delta"],
                "bound": int(bound),
                "seconds": time.perf_counter() - started,
            }
        )

    if len(set(ranks)) != 1 or len(set(derivatives)) != 1:
        raise RuntimeError("fresh Sage/PARI samples were not stable")

    return {
        "id": curve_data["id"],
        "status": "ok",
        "conductor": str(curve.conductor()),
        "root_number": int(curve.root_number()),
        "probable_analytic_rank": ranks[0],
        "leading_derivative": derivatives[0],
        "leading_value_convention": "L^(r)(1)",
        "coefficient_probe": {
            "cutoff": coefficient_cutoff,
            "length": len(coefficients),
            "prefix": coefficients[:16],
            "sha256": hashlib.sha256(coefficient_text).hexdigest(),
            "seconds": coefficient_time,
        },
        "zero_sum_upper_bounds": zero_sum,
        "timing": {
            "samples": samples,
            "curve_construction_median_seconds": median(construction_times),
            "fresh_object_analytic_rank_median_seconds": median(analytic_times),
            "same_object_repeat_median_seconds": median(same_object_times),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--tier", default="core")
    parser.add_argument("--samples", type=int, default=1)
    parser.add_argument("--coefficient-cutoff", type=int, default=64)
    args = parser.parse_args()
    if args.samples < 1:
        parser.error("--samples must be positive")
    if args.coefficient_cutoff < 1:
        parser.error("--coefficient-cutoff must be positive")

    manifest_path = Path(args.manifest).resolve()
    manifest = json.loads(manifest_path.read_text())
    started = time.perf_counter()
    records = [
        evaluate(curve, args.samples, args.coefficient_cutoff)
        for curve in select_curves(manifest, args.tier)
    ]
    output = {
        "schema_version": 1,
        "implementation_family": "Sage/PARI",
        "versions": {
            "sage": sage.version.version,
            "pari": ".".join(str(value) for value in pari.version()),
        },
        "settings": {
            "algorithm": "pari",
            "pari_real_precision_bits": int(pari.get_real_precision_bits()),
            "samples": args.samples,
            "coefficient_cutoff": args.coefficient_cutoff,
            "tier": args.tier,
        },
        "records": records,
        "internal_total_seconds": time.perf_counter() - started,
    }
    print(json.dumps(output, sort_keys=True))


if __name__ == "__main__":
    main()
