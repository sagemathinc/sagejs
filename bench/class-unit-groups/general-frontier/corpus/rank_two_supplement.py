#!/usr/bin/env python3
"""Generate a bounded, predeclared rank-two polynomial candidate supplement."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re


SCHEMA = "sagejs.rank-two-supplement.v1"
SCALES = (4, 6, 8, 10, 12, 16, 20)
FAMILIES = ("eisenstein2-real-cubic", "eisenstein2-mixed-quartic")
SAMPLES_PER_CELL = 8
COUNT_CAP = 200
INTEGER = re.compile(r"(?:0|-?[1-9][0-9]*)\Z")


def canonical_json(value):
    """Serialize exact decimal-string records without platform-dependent whitespace."""
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def digest(value):
    return hashlib.sha256(canonical_json(value).encode("ascii")).hexdigest()


def policy():
    """Return a fresh copy of the complete deterministic generation contract."""
    return {
        "schema": "sagejs.rank-two-supplement-policy.v1",
        "families": list(FAMILIES),
        "decimal_scales": list(SCALES),
        "samples_per_cell": SAMPLES_PER_CELL,
        "candidate_count_cap": COUNT_CAP,
        "parameter_indices": list(range(SAMPLES_PER_CELL)),
        "cubic_formula": "x^3 - 2*(10^k+2*j+1)*x + 2*(10^k+4*j+1)",
        "quartic_formula": "x^4 - 2*(10^k+2*j+1)*x - 2*(10^k+4*j+1)",
        "selection_rule": "Every listed family/scale/index tuple, without outcome filtering",
        "candidate_order": "degree, decimal_scale, parameter_index",
        "selection_uses_sagejs_results": False,
        "distinctness": "pending-field-discriminant-and-exact-isomorphism",
        "reference_time_bands": "pending-matched-complete-PARI-and-Hecke-requests",
        "coverage_targets_per_degree": {"development": 120, "holdout": 80},
        "performance_targets_per_degree": {"development": 24, "holdout": 16},
    }


def coefficient_vector(family, scale, index):
    """Construct one ascending monic coefficient vector using exact integers."""
    if family not in FAMILIES:
        raise ValueError("unknown supplemental family")
    if type(scale) is not int or scale not in SCALES:
        raise ValueError("scale is outside the frozen supplement policy")
    if type(index) is not int or not 0 <= index < SAMPLES_PER_CELL:
        raise ValueError("parameter index is outside the frozen supplement policy")
    base = 10**scale
    a = 2 * (base + 2 * index + 1)
    b = 2 * (base + 4 * index + 1)
    coefficients = [b, -a, 0, 1] if family == FAMILIES[0] else [-b, -a, 0, 0, 1]
    return [str(value) for value in coefficients]


def elementary_certificate(family, coefficients):
    """Check Eisenstein at 2 and exact elementary root-count conditions."""
    if family not in FAMILIES:
        raise ValueError("unknown supplemental family")
    degree = 3 if family == FAMILIES[0] else 4
    if (
        not isinstance(coefficients, list)
        or len(coefficients) != degree + 1
        or any(
            not isinstance(value, str) or not INTEGER.fullmatch(value)
            for value in coefficients
        )
        or coefficients[-1] != "1"
    ):
        raise ValueError("expected canonical monic integer-string coefficients")
    values = [int(value) for value in coefficients]
    if any(value % 2 for value in values[:-1]) or values[0] % 4 != 2:
        raise ValueError("Eisenstein-at-2 obligations failed")
    if degree == 3:
        b, negative_a, zero, _ = values
        a = -negative_a
        if zero != 0 or a <= 0 or b <= 0:
            raise ValueError("expected x^3-a*x+b with a,b positive")
        discriminant = 4 * a**3 - 27 * b**2
        if discriminant <= 0:
            raise ValueError("cubic requires a strictly positive discriminant")
        signature = [3, 0]
        signature_method = "positive-discriminant-of-depressed-cubic"
    else:
        b, a, quadratic, cubic, _ = values
        if quadratic != 0 or cubic != 0 or a >= 0 or b >= 0:
            raise ValueError("expected x^4+a*x+b with a,b negative")
        discriminant = 256 * b**3 - 27 * a**4
        if discriminant >= 0:
            raise ValueError("quartic requires a strictly negative discriminant")
        signature = [2, 1]
        signature_method = "unique-real-critical-point-and-negative-constant"
    return {
        "degree": degree,
        "signature": signature,
        "unit_rank": sum(signature) - 1,
        "irreducibility": {
            "method": "Eisenstein",
            "prime": "2",
            "monic": True,
            "all_nonleading_coefficients_divisible_by_prime": True,
            "constant_not_divisible_by_prime_squared": True,
        },
        "signature_method": signature_method,
        "equation_discriminant": str(discriminant),
        "field_discriminant_certified": False,
    }


def make_record(family, scale, index):
    coefficients = coefficient_vector(family, scale, index)
    certificate = elementary_certificate(family, coefficients)
    degree = certificate["degree"]
    coefficient_hash = digest(
        {
            "schema": "sagejs.monic-polynomial-coefficients.v1",
            "degree": degree,
            "coefficients": coefficients,
        }
    )
    return {
        "label": f"generated-sha256-{coefficient_hash}",
        "coefficient_sha256": coefficient_hash,
        "family": family,
        "decimal_scale": scale,
        "parameter_index": index,
        "degree": degree,
        "coefficients": coefficients,
        "r1": certificate["signature"][0],
        "r2": certificate["signature"][1],
        "signature": certificate["signature"],
        "unit_rank": certificate["unit_rank"],
        "elementary_certificate": certificate,
        "equation_discriminant": certificate["equation_discriminant"],
        "field_discriminant": None,
        "discriminant_absolute": None,
        "equation_order_index": None,
        "class_number": None,
        "class_group": None,
        "regulator": None,
        "used_grh": None,
        "source": {
            "kind": "deterministic-supplement",
            "policy_sha256": digest(policy()),
        },
        "distinctness": "pending-field-discriminant-and-exact-isomorphism",
        "field_identity": None,
        "exposure": "exposure-audit-pending",
        "holdout_eligible": None,
        "reference_time_band": "pending",
        "final_role": None,
    }


def generate():
    """Generate all 112 polynomial candidates, never a claimed field census."""
    if not 1 <= SAMPLES_PER_CELL <= 8:
        raise ValueError("supplement samples-per-cell safety cap exceeded")
    count = len(FAMILIES) * len(SCALES) * SAMPLES_PER_CELL
    if count > COUNT_CAP:
        raise ValueError("supplement candidate-count safety cap exceeded")
    records = [
        make_record(family, scale, index)
        for family in FAMILIES
        for scale in SCALES
        for index in range(SAMPLES_PER_CELL)
    ]
    if len({record["label"] for record in records}) != count:
        raise ValueError("duplicate coefficient identity in supplemental policy")
    result = {
        "schema": SCHEMA,
        "state": "polynomial-candidates-only-distinctness-and-reference-costs-pending",
        "policy": policy(),
        "policy_sha256": digest(policy()),
        "polynomial_candidate_count": count,
        "distinct_field_count": None,
        "records": records,
        "records_sha256": digest(records),
    }
    return {**result, "export_sha256": digest(result)}


def validate(value):
    """Recompute the entire bounded export, including every exact certificate."""
    if not isinstance(value, dict) or value.get("schema") != SCHEMA:
        raise ValueError("unsupported supplemental schema")
    if canonical_json(value) != canonical_json(generate()):
        raise ValueError("supplement differs from its exact frozen generation policy")
    return value


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("plan", "generate", "check"))
    parser.add_argument("--output", type=Path)
    parser.add_argument("--fixture", type=Path)
    args = parser.parse_args(argv)
    if args.command == "plan":
        if args.output or args.fixture:
            parser.error("plan takes no file arguments")
        print(json.dumps(policy(), indent=2))
    elif args.command == "check":
        if not args.fixture or args.output:
            parser.error("check requires --fixture and does not accept --output")
        with args.fixture.open(encoding="utf8") as source:
            result = validate(json.load(source))
        print(
            json.dumps(
                {
                    "valid": True,
                    "polynomial_candidates": result["polynomial_candidate_count"],
                    "distinct_fields": None,
                }
            )
        )
    else:
        if not args.output or args.fixture:
            parser.error("generate requires --output and does not accept --fixture")
        result = generate()
        # Exclusive creation preserves existing evidence; remove only our partial
        # output if writing this newly created file fails.
        descriptor = os.open(args.output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
        try:
            with os.fdopen(descriptor, "w", encoding="utf8", newline="\n") as target:
                target.write(json.dumps(result, indent=2) + "\n")
        except BaseException:
            args.output.unlink()
            raise
        print(
            json.dumps(
                {
                    "output": str(args.output),
                    "polynomial_candidates": result["polynomial_candidate_count"],
                    "export_sha256": result["export_sha256"],
                }
            )
        )


if __name__ == "__main__":
    main()
