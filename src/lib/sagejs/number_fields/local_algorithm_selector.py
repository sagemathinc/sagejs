"""Inspectable cost selection for proven-prime maximal-order components.

The selector consumes only mathematical features and complete first-order
polygon evidence.  It never sees a corpus label or polynomial digest.  A
forced algorithm remains available for differential tests, while `auto`
chooses only a path whose preconditions are established by the supplied
evidence and runtime capabilities.
"""

from __future__ import annotations

from typing import Any

from sagejs.number_fields.local_polygons import (
    LocalPolygonResult,
    analyze_local_polygons,
)

_ALGORITHMS = ("dedekind", "polygon", "round2", "round4", "om-maxmin")


def _factor_features(trace: dict[str, Any]) -> tuple[list[int], list[int]]:
    factors = trace["dedekind"]["modular_factors"]
    return (
        [int(item["degree"]) for item in factors],
        [int(item["multiplicity"]) for item in factors],
    )


def _costs(
    degree: int,
    discriminant_valuation: int,
    factor_degrees: list[int],
    multiplicities: list[int],
    predicted_index: int,
    regular: bool,
) -> dict[str, int]:
    repeated_weight = sum(
        factor_degree * max(0, multiplicity - 1)
        for factor_degree, multiplicity in zip(
            factor_degrees, multiplicities, strict=True
        )
    )
    branch_count = sum(1 for value in multiplicities if value > 1)
    remaining = max(0, discriminant_valuation - 2 * predicted_index)
    return {
        "dedekind": degree * degree + repeated_weight * degree,
        "polygon": (
            degree * degree
            + degree * repeated_weight
            + degree * max(1, predicted_index)
            if regular
            else 1 << 60
        ),
        "round2": degree * degree * degree * max(1, remaining + branch_count),
        "round4": degree * degree * max(1, discriminant_valuation + repeated_weight),
        "om-maxmin": degree
        * degree
        * max(1, branch_count)
        * max(2, 1 + discriminant_valuation // max(1, degree)),
    }


def select_local_algorithm_from_polygon(
    evidence: LocalPolygonResult | dict[str, Any],
    *,
    native_round2_available: bool,
    om_available: bool,
    algorithm: str = "auto",
) -> dict[str, Any]:
    """Select one local algorithm from already computed exact evidence."""
    if algorithm != "auto" and algorithm not in _ALGORITHMS:
        raise ValueError("unknown local maximal-order algorithm")
    trace = (
        evidence.to_trace() if isinstance(evidence, LocalPolygonResult) else evidence
    )
    degree = int(trace["degree"])
    prime = int(trace["prime"])
    factor_degrees, multiplicities = _factor_features(trace)
    discriminant_valuation = trace.get("discriminant_valuation")
    if discriminant_valuation is None:
        discriminant_valuation = 2 * int(trace["predicted_index_exponent"])
    discriminant_valuation = int(discriminant_valuation)
    predicted_index = int(trace["predicted_index_exponent"])
    regular = bool(trace["regular"])
    p_maximal = bool(trace["dedekind"]["p_maximal"])
    costs = _costs(
        degree,
        discriminant_valuation,
        factor_degrees,
        multiplicities,
        predicted_index,
        regular,
    )

    applicable = {
        "dedekind": p_maximal,
        "polygon": regular and not p_maximal,
        "round2": native_round2_available,
        "round4": True,
        "om-maxmin": om_available,
    }
    if algorithm != "auto":
        selected = algorithm if applicable[algorithm] else None
        reason = (
            "forced algorithm is applicable"
            if selected is not None
            else "forced algorithm preconditions are not established"
        )
    elif p_maximal:
        selected = "dedekind"
        reason = "Dedekind evidence proves the equation order is p-maximal"
    elif regular:
        selected = "polygon"
        reason = "regular first-order residual factors certify the full polygon index"
    elif native_round2_available:
        selected = "round2"
        reason = (
            "irregular polygon evidence requires a complete native multiplier cycle"
        )
    else:
        candidates = ["round4"]
        if om_available:
            candidates.append("om-maxmin")
        selected = min(candidates, key=lambda name: costs[name])
        reason = "native Round 2 is unavailable; selected the lower predicted complete fallback"

    suppressed = []
    for name in _ALGORITHMS:
        if name == selected:
            continue
        if not applicable[name]:
            suppressed.append(
                {"algorithm": name, "reason": "preconditions unavailable"}
            )
        else:
            suppressed.append(
                {
                    "algorithm": name,
                    "reason": "higher-priority proved path or predicted cost",
                    "predicted_work": costs[name],
                }
            )

    return {
        "schema": "sagejs.number-fields/local-algorithm-selection/v1",
        "algorithm": selected,
        "forced": algorithm != "auto",
        "reason": reason,
        "features": {
            "degree": degree,
            "prime": prime,
            "word_prime": prime < 1 << 64,
            "discriminant_valuation": discriminant_valuation,
            "factor_degrees": factor_degrees,
            "factor_multiplicities": multiplicities,
            "obstruction_degree": int(trace["dedekind"]["obstruction_degree"]),
            "polygon_regular": regular,
            "predicted_index_valuation": predicted_index,
            "remaining_discriminant_valuation": max(
                0, discriminant_valuation - 2 * predicted_index
            ),
            "native_round2_available": bool(native_round2_available),
            "om_available": bool(om_available),
        },
        "predicted_work": costs,
        "suppressed": suppressed,
    }


def select_local_algorithm(
    coefficients: list[int],
    prime: int,
    discriminant_valuation: int,
    *,
    native_round2_available: bool,
    om_available: bool,
    algorithm: str = "auto",
) -> dict[str, Any]:
    """Analyze and select one local component without fixture-derived inputs."""
    evidence = analyze_local_polygons(coefficients, prime, discriminant_valuation)
    return select_local_algorithm_from_polygon(
        evidence,
        native_round2_available=native_round2_available,
        om_available=om_available,
        algorithm=algorithm,
    )


__all__ = [
    "select_local_algorithm",
    "select_local_algorithm_from_polygon",
]
