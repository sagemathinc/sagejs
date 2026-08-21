#!/usr/bin/env python3
"""Persistent Sage/PARI oracle for number-field class and unit groups."""

from __future__ import annotations

import argparse
import json
import math
import statistics
import time
from pathlib import Path

import sage.version
from sage.all import ComplexBallField, NumberField, PolynomialRing, QQ, ZZ, lcm, matrix
from sage.libs.pari import pari


PROOF_MODES = {
    "conditional_grh": (False, "exact-relations-conditional-grh"),
    "unconditional": (True, "exact-unconditional"),
}


def rational_vector(value) -> dict:
    coefficients = [QQ(entry) for entry in value]
    denominator = lcm([entry.denominator() for entry in coefficients]) or ZZ.one()
    return {
        "numerators": [str(ZZ(entry * denominator)) for entry in coefficients],
        "denominator": str(denominator),
    }


def matrix_rows(value) -> list[list[str]]:
    return [[str(entry) for entry in row] for row in value]


def ideal_hnf(ideal) -> list[list[str]]:
    return matrix_rows(ideal.pari_hnf().sage())


def ideal_record(ideal) -> dict:
    return {
        "norm": str(ideal.norm()),
        "hnf": ideal_hnf(ideal),
    }


def ball_regulator(field, free_units: list, precision: int) -> dict:
    if not free_units:
        return {"precision_bits": precision, "lower": "1", "upper": "1"}

    work_precision = precision + 32
    complex_balls = ComplexBallField(work_precision)
    polynomial = complex_balls["z"](list(field.polynomial()))
    roots = polynomial.roots(multiplicities=False)
    places = []
    for root in roots:
        if root.imag().contains_zero():
            places.append((0, root))
        elif root.imag().lower() > 0:
            places.append((1, root))
    places.sort(
        key=lambda item: (
            item[0],
            item[1].real().center(),
            item[1].imag().center(),
        )
    )
    expected_places = sum(field.signature())
    if len(places) != expected_places:
        raise RuntimeError(
            f"isolated {len(places)} archimedean places, expected {expected_places}"
        )

    def evaluate(unit, root):
        result = complex_balls.zero()
        for coefficient in reversed(list(unit)):
            result = result * root + coefficient
        return result

    rows = []
    for kind, root in places[:-1]:
        weight = 1 if kind == 0 else 2
        rows.append([weight * evaluate(unit, root).abs().log() for unit in free_units])
    regulator = abs(matrix(rows).det())
    return {
        "precision_bits": precision,
        "lower": str(regulator.lower()),
        "upper": str(regulator.upper()),
    }


def group_record(group) -> dict:
    generators = []
    for generator in group.gens():
        ideal = generator.ideal()
        generators.append(
            {
                **ideal_record(ideal),
                "order": str(generator.order()),
            }
        )
    return {
        "invariant_factors": [str(value) for value in group.invariants()],
        "order": str(group.order()),
        "generators": generators,
    }


def unit_record(unit_group) -> dict:
    invariants = [ZZ(value) for value in unit_group.invariants()]
    values = list(unit_group.gens_values())
    torsion_order = invariants[0] if invariants else ZZ(2)
    units = []
    for index, value in enumerate(values):
        units.append(
            {
                "kind": "torsion" if index == 0 else "free",
                "power_basis": rational_vector(value),
                "norm": str(value.norm()),
            }
        )
    return {
        "invariant_factors": [str(value) for value in invariants],
        "torsion_order": str(torsion_order),
        "rank": max(0, len(invariants) - 1),
        "generators": units,
    }


def principal_generator(ideal):
    if not ideal.is_principal():
        return None
    generators = ideal.gens_reduced()
    if len(generators) != 1:
        raise RuntimeError("principal ideal did not reduce to one generator")
    generator = generators[0]
    for coefficient in generator:
        if coefficient != 0:
            if coefficient < 0:
                generator = -generator
            break
    return rational_vector(generator)


def prime_ideal_probes(field, class_group, rational_primes: list[int]) -> list[dict]:
    records = []
    for rational_prime in rational_primes:
        factors = []
        for ideal, ramification_index in field.ideal(rational_prime).factor():
            norm = ZZ(ideal.norm())
            residue_degree = 0
            remaining = norm
            while remaining > 1 and remaining % rational_prime == 0:
                remaining //= rational_prime
                residue_degree += 1
            if remaining != 1:
                raise RuntimeError("prime ideal norm is not a rational-prime power")
            ideal_class = class_group(ideal)
            factors.append(
                {
                    "rational_prime": str(rational_prime),
                    "norm": str(norm),
                    "ramification_index": int(ramification_index),
                    "residue_degree": residue_degree,
                    "hnf": ideal_hnf(ideal),
                    "class_log": [str(value) for value in ideal_class.exponents()],
                    "class_order": str(ideal_class.order()),
                    "is_principal": bool(ideal_class.is_principal()),
                    "principal_generator": principal_generator(ideal),
                }
            )
        factors.sort(key=lambda item: (int(item["norm"]), item["hnf"]))
        records.extend(factors)
    return records


def generator_relation_probes(class_group) -> list[dict]:
    records = []
    for index, generator in enumerate(class_group.gens()):
        order = ZZ(generator.order())
        base_ideal = generator.ideal()
        relation_ideal = base_ideal**order
        relation_class = class_group(relation_ideal)
        if not relation_class.is_principal():
            raise RuntimeError("class generator order did not yield a principal ideal")
        records.append(
            {
                "generator_index": index,
                "exponent": str(order),
                "base_ideal": ideal_record(base_ideal),
                "relation_ideal": ideal_record(relation_ideal),
                "relation_class_log": [
                    str(value) for value in relation_class.exponents()
                ],
                "principal_generator": principal_generator(relation_ideal),
            }
        )
    return records


def rational_field_record(case: dict, samples: int, regulator_precisions: list[int]):
    timing = {
        "samples": samples,
        "field_construction_median_seconds": 0.0,
        "maximal_order_median_seconds": 0.0,
        "conditional_grh_context_median_seconds": 0.0,
        "unconditional_context_median_seconds": 0.0,
        "map_probes_seconds": 0.0,
        "regulators_seconds": 0.0,
    }
    unit = {
        "invariant_factors": ["2"],
        "torsion_order": "2",
        "rank": 0,
        "generators": [
            {
                "kind": "torsion",
                "power_basis": {"numerators": ["-1"], "denominator": "1"},
                "norm": "-1",
            }
        ],
    }
    trivial_group = {"invariant_factors": [], "order": "1", "generators": []}
    proof_modes = {}
    for mode, (_, label) in PROOF_MODES.items():
        proof_modes[mode] = {
            "proof_status": label,
            "class_group": trivial_group,
            "unit_group": unit,
        }
    prime_probes = []
    for rational_prime in case["ideal_probe_primes"]:
        prime_probes.append(
            {
                "rational_prime": str(rational_prime),
                "norm": str(rational_prime),
                "ramification_index": 1,
                "residue_degree": 1,
                "hnf": [[str(rational_prime)]],
                "class_log": [],
                "class_order": "1",
                "is_principal": True,
                "principal_generator": {
                    "numerators": [str(rational_prime)],
                    "denominator": "1",
                },
            }
        )
    return {
        "id": case["id"],
        "status": "ok",
        "degree": 1,
        "signature": [1, 0],
        "equation_discriminant": "1",
        "field_discriminant": "1",
        "equation_order_index": "1",
        "maximal_order_basis": [{"numerators": ["1"], "denominator": "1"}],
        "proof_modes": proof_modes,
        "prime_ideal_probes": prime_probes,
        "generator_relation_probes": [],
        "regulators": [
            {"precision_bits": precision, "lower": "1", "upper": "1"}
            for precision in regulator_precisions
        ],
        "timing": timing,
    }


def evaluate_case(case: dict, samples: int, regulator_precisions: list[int]):
    if case["kind"] == "rational":
        return rational_field_record(case, samples, regulator_precisions)

    polynomial_ring = PolynomialRing(QQ, "x")
    polynomial = polynomial_ring([ZZ(value) for value in case["polynomial"]])
    if not polynomial.is_irreducible():
        raise ValueError(f"{case['id']}: defining polynomial is reducible")

    stage_samples = {
        "field_construction": [],
        "maximal_order": [],
        "conditional_grh_context": [],
        "unconditional_context": [],
    }
    chosen = {}
    for mode, (proof, _) in PROOF_MODES.items():
        for _ in range(samples):
            started = time.perf_counter()
            field = NumberField(polynomial, "a")
            stage_samples["field_construction"].append(time.perf_counter() - started)

            started = time.perf_counter()
            maximal_order = field.maximal_order()
            stage_samples["maximal_order"].append(time.perf_counter() - started)

            started = time.perf_counter()
            class_group = field.class_group(proof=proof)
            unit_group = field.unit_group(proof=proof)
            stage_samples[f"{mode}_context"].append(time.perf_counter() - started)
            chosen[mode] = (field, maximal_order, class_group, unit_group)

    proof_modes = {}
    for mode, (_, label) in PROOF_MODES.items():
        _, _, class_group, unit_group = chosen[mode]
        proof_modes[mode] = {
            "proof_status": label,
            "class_group": group_record(class_group),
            "unit_group": unit_record(unit_group),
        }

    field, maximal_order, class_group, unit_group = chosen["unconditional"]
    equation_discriminant = ZZ(polynomial.discriminant())
    field_discriminant = ZZ(field.discriminant())
    quotient = abs(equation_discriminant // field_discriminant)
    equation_order_index = ZZ(math.isqrt(int(quotient)))

    map_started = time.perf_counter()
    prime_probes = prime_ideal_probes(
        field, class_group, [int(value) for value in case["ideal_probe_primes"]]
    )
    relation_probes = generator_relation_probes(class_group)
    map_seconds = time.perf_counter() - map_started

    unit_values = list(unit_group.gens_values())
    free_units = unit_values[1:] if unit_values else []
    regulator_started = time.perf_counter()
    regulators = [
        ball_regulator(field, free_units, precision)
        for precision in regulator_precisions
    ]
    regulator_seconds = time.perf_counter() - regulator_started

    return {
        "id": case["id"],
        "status": "ok",
        "degree": int(field.degree()),
        "signature": [int(value) for value in field.signature()],
        "equation_discriminant": str(equation_discriminant),
        "field_discriminant": str(field_discriminant),
        "equation_order_index": str(equation_order_index),
        "maximal_order_basis": [
            rational_vector(value) for value in maximal_order.basis()
        ],
        "proof_modes": proof_modes,
        "prime_ideal_probes": prime_probes,
        "generator_relation_probes": relation_probes,
        "regulators": regulators,
        "timing": {
            "samples": samples,
            "field_construction_median_seconds": statistics.median(
                stage_samples["field_construction"]
            ),
            "maximal_order_median_seconds": statistics.median(
                stage_samples["maximal_order"]
            ),
            "conditional_grh_context_median_seconds": statistics.median(
                stage_samples["conditional_grh_context"]
            ),
            "unconditional_context_median_seconds": statistics.median(
                stage_samples["unconditional_context"]
            ),
            "map_probes_seconds": map_seconds,
            "regulators_seconds": regulator_seconds,
        },
    }


def selected_cases(fixture: dict, tier: str) -> list[dict]:
    if tier == "all":
        return fixture["cases"]
    return [case for case in fixture["cases"] if tier in case["tiers"]]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", required=True)
    parser.add_argument("--tier", default="core")
    parser.add_argument("--samples", type=int, default=1)
    args = parser.parse_args()
    if args.samples < 1:
        parser.error("--samples must be positive")

    fixture = json.loads(Path(args.fixture).read_text())
    started = time.perf_counter()
    records = [
        evaluate_case(case, args.samples, fixture["regulator_precisions_bits"])
        for case in selected_cases(fixture, args.tier)
    ]
    polynomial_ring = PolynomialRing(QQ, "x")
    invalid_inputs = []
    for entry in fixture.get("invalid_inputs", []):
        polynomial = polynomial_ring([ZZ(value) for value in entry["polynomial"]])
        if not polynomial.is_monic():
            status = "rejected-not-monic-integral"
        elif not polynomial.is_irreducible():
            status = "rejected-not-irreducible"
        else:
            status = "unexpectedly-valid"
        invalid_inputs.append({"id": entry["id"], "status": status})
    result = {
        "schema_version": 1,
        "implementation_family": "Sage/PARI",
        "versions": {
            "sage": sage.version.version,
            "pari": ".".join(str(value) for value in pari.version()),
        },
        "settings": {
            "tier": args.tier,
            "samples": args.samples,
            "proof_false_semantics": "exact-relations-conditional-grh",
            "proof_true_semantics": "exact-unconditional",
            "regulator_backend": "Arb root balls and logarithmic determinant",
        },
        "records": records,
        "invalid_inputs": invalid_inputs,
        "internal_total_seconds": time.perf_counter() - started,
    }
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
