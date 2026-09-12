#!/usr/bin/env python3
"""Generate a fixed source-only quadratic/quintic stress-candidate supplement."""

import argparse
import json
from pathlib import Path

from rank_two_supplement import INTEGER, canonical_json, digest


SCHEMA = "sagejs.stress-supplement.v1"
FAMILIES = (
    "eisenstein2-real-quadratic",
    "eisenstein2-imaginary-quadratic",
    "eisenstein2-three-real-quintic",
)
QUADRATIC_SCALES = (12, 16, 20, 24, 28)
QUINTIC_SCALES = (4, 6, 8, 10)
COUNT_CAP = 36
MAX_EXPORT_BYTES = 1024 * 1024


def policy():
    """Return the complete nonadaptive policy, without selecting any fields."""
    return {
        "schema": "sagejs.stress-supplement-policy.v1",
        "families": list(FAMILIES),
        "quadratic_decimal_scales": list(QUADRATIC_SCALES),
        "quadratic_parameter_indices": [0, 1],
        "quadratic_primary_indices": [0],
        "quadratic_formula": "x^2 +/- 2*(10^k+4*j+1)",
        "quintic_decimal_scales": list(QUINTIC_SCALES),
        "quintic_parameter_indices": [0, 1, 2, 3],
        "quintic_primary_indices": [0, 1],
        "quintic_formula": "x^5 - 2*(10^k+2*j+1)*x + 2*(10^k+4*j+1)",
        "candidate_count_cap": COUNT_CAP,
        "primary_candidate_count": 18,
        "reserve_candidate_count": 18,
        "candidate_order": "listed family, decimal scale, parameter index",
        "selection_rule": "Every listed tuple; queue roles are not corpus assignments",
        "selection_uses_sagejs_results": False,
        "field_distinctness": "pending-maximal-order-and-exact-isomorphism-admission",
        "reference_time_bands": "pending-matched-complete-reference-requests",
        "unconditional_eligibility": "not-established-by-polynomial-certificates",
        "changes_frozen_membership": False,
    }


def coefficient_vector(family, scale, index):
    """Construct one ascending monic vector within the exact fixed grid."""
    if family not in FAMILIES:
        raise ValueError("unknown stress family")
    quadratic = family != FAMILIES[2]
    scales = QUADRATIC_SCALES if quadratic else QUINTIC_SCALES
    if type(scale) is not int or scale not in scales:
        raise ValueError("scale is outside the fixed stress policy")
    if type(index) is not int or not 0 <= index < (2 if quadratic else 4):
        raise ValueError("parameter index is outside the fixed stress policy")
    base = 10**scale
    b = 2 * (base + 4 * index + 1)
    if quadratic:
        values = [-b if family == FAMILIES[0] else b, 0, 1]
    else:
        a = 2 * (base + 2 * index + 1)
        values = [b, -a, 0, 0, 0, 1]
    return [str(value) for value in values]


def elementary_certificate(family, coefficients):
    """Prove irreducibility and signature; make no maximal-order claim."""
    if family not in FAMILIES:
        raise ValueError("unknown stress family")
    degree = 5 if family == FAMILIES[2] else 2
    if (
        type(coefficients) is not list
        or len(coefficients) != degree + 1
        or any(
            type(value) is not str or len(value) > 128 or not INTEGER.fullmatch(value)
            for value in coefficients
        )
        or coefficients[-1] != "1"
    ):
        raise ValueError("expected bounded canonical monic integer-string coefficients")
    values = [int(value) for value in coefficients]
    if any(value % 2 for value in values[:-1]) or values[0] % 4 != 2:
        raise ValueError("Eisenstein-at-2 obligations failed")
    inequality = None
    if degree == 2:
        constant, linear, _ = values
        real = family == FAMILIES[0]
        if linear != 0 or (constant >= 0 if real else constant <= 0):
            raise ValueError("quadratic coefficients do not match the declared sign")
        signature = [2, 0] if real else [0, 1]
        discriminant = -4 * constant
        method = "sign-of-nonzero-radicand"
    else:
        b, negative_a, *tail = values
        a = -negative_a
        if a <= 0 or b <= 0 or tail != [0, 0, 0, 1]:
            raise ValueError("expected x^5-a*x+b with a,b positive")
        left, right = 4**4 * a**5, 5**5 * b**4
        if left <= right:
            raise ValueError("quintic extrema do not certify three real roots")
        inequality = {"left": str(left), "right": str(right), "comparison": ">"}
        signature = [3, 1]
        discriminant = right - left
        method = "two-real-critical-points-with-opposite-extremum-signs"
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
        "signature_method": method,
        "quintic_extrema_inequality": inequality,
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
    primary = index < (1 if degree == 2 else 2)
    return {
        "label": "generated-sha256-" + coefficient_hash,
        "coefficient_sha256": coefficient_hash,
        "family": family,
        "decimal_scale": scale,
        "parameter_index": index,
        "queue_role": "primary-candidate" if primary else "reserve-candidate",
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
        "field_identity": None,
        "class_number": None,
        "class_group": None,
        "regulator": None,
        "used_grh": None,
        "source": {
            "kind": "deterministic-stress-supplement",
            "policy_sha256": digest(policy()),
        },
        "distinctness": "pending-field-discriminant-and-exact-isomorphism",
        "exposure": "source-only-not-assigned",
        "holdout_eligible": None,
        "stress_eligible": None,
        "unconditional_eligible": None,
        "reference_time_band": "pending",
        "final_role": None,
    }


def generate():
    """Emit all 36 polynomial candidates, not a selected or qualified stress set."""
    count = 2 * len(QUADRATIC_SCALES) * 2 + len(QUINTIC_SCALES) * 4
    if count != 36 or count > COUNT_CAP:
        raise ValueError("stress candidate-count policy exceeded")
    records = [
        make_record(family, scale, index)
        for family in FAMILIES
        for scale in (QUINTIC_SCALES if family == FAMILIES[2] else QUADRATIC_SCALES)
        for index in range(4 if family == FAMILIES[2] else 2)
    ]
    if len(records) != count or len({row["label"] for row in records}) != count:
        raise ValueError("stress polynomial identity/count differs")
    if sum(row["queue_role"] == "primary-candidate" for row in records) != 18:
        raise ValueError("stress queue role counts differ")
    body = {
        "schema": SCHEMA,
        "state": "polynomial-candidates-only-distinctness-and-reference-costs-pending",
        "policy": policy(),
        "policy_sha256": digest(policy()),
        "polynomial_candidate_count": count,
        "primary_candidate_count": 18,
        "reserve_candidate_count": 18,
        "distinct_field_count": None,
        "stress_selection_frozen": False,
        "qualification_evidence": False,
        "records": records,
        "records_sha256": digest(records),
    }
    return {**body, "export_sha256": digest(body)}


def validate(value):
    """Regenerate every field, rejecting invented metadata even after rehashing."""
    if type(value) is not dict or value.get("schema") != SCHEMA:
        raise ValueError("unsupported stress supplemental schema")
    if canonical_json(value) != canonical_json(generate()):
        raise ValueError("stress supplement differs from its exact fixed policy")
    return value


def _unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("duplicate stress JSON key")
        result[key] = value
    return result


def read_fixture(path):
    """Bound file reads before decoding an externally supplied export."""
    with path.open("rb") as source:
        data = source.read(MAX_EXPORT_BYTES + 1)
    if len(data) > MAX_EXPORT_BYTES:
        raise ValueError("stress export exceeds its byte limit")
    return validate(json.loads(data, object_pairs_hook=_unique_object))


def write_export(path, value):
    """Create exclusively; remove only this attempt's new partial output on error."""
    validate(value)
    created = False
    try:
        with path.open("x", encoding="utf8", newline="\n") as target:
            created = True
            json.dump(value, target, indent=2)
            target.write("\n")
    except BaseException:
        if created:
            path.unlink()
        raise


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
        return
    if args.command == "check":
        if not args.fixture or args.output:
            parser.error("check requires --fixture only")
        value = read_fixture(args.fixture)
    else:
        if not args.output or args.fixture:
            parser.error("generate requires --output only")
        value = generate()
        write_export(args.output, value)
    print(
        json.dumps(
            {
                "valid": True,
                "polynomial_candidates": value["polynomial_candidate_count"],
                "primary_candidates": 18,
                "reserve_candidates": 18,
                "distinct_fields": None,
                "qualification_evidence": False,
                "export_sha256": value["export_sha256"],
            }
        )
    )


if __name__ == "__main__":
    main()
