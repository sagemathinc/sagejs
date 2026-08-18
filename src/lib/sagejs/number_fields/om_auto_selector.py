"""Measured production crossover for complete OM/MaxMin local orders.

This module deliberately separates a cheap input-only prefilter from the
complete OM construction.  The prefilter cannot claim success: it only avoids
building an OM type tree outside the measured region.  Selection occurs after
`regular_local_basis` has produced complete type, quotient/MaxMin, exact local
lattice, and native proof evidence.

The crossover constants are operation-count and resource bounds from
`bench/number-field-om-auto-selector.cjs`.  They are independent of corpus
identifiers and polynomial digests.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sagejs.number_fields.om_types import ImmutableOMRecord

AUTO_SELECTOR_SCHEMA = "sagejs.number-fields/om-auto-selection-v1"
AUTO_SELECTOR_BENCHMARK = "bench/number-field-om-auto-selector.cjs:v1"
DEFAULT_OM_MEMORY_BUDGET = 64 * 1024 * 1024
MAX_WORD_PRIME = (1 << 63) - 1


@dataclass
class OMAutoShapePrefilter(ImmutableOMRecord):
    eligible: bool
    reason: str
    degree: int
    prime: int
    local_discriminant_valuation: int
    coefficient_bits: int
    estimated_output_bytes: int
    memory_budget_bytes: int
    native_capable: bool

    def as_dict(self) -> dict[str, object]:
        return {
            "schema": AUTO_SELECTOR_SCHEMA,
            "stage": "shape-prefilter",
            "eligible": self.eligible,
            "reason": self.reason,
            "degree": self.degree,
            "prime": self.prime,
            "local_discriminant_valuation": self.local_discriminant_valuation,
            "coefficient_bits": self.coefficient_bits,
            "estimated_output_bytes": self.estimated_output_bytes,
            "memory_budget_bytes": self.memory_budget_bytes,
            "native_capable": self.native_capable,
            "benchmark": AUTO_SELECTOR_BENCHMARK,
        }


@dataclass
class OMAutoPrefilter(ImmutableOMRecord):
    eligible: bool
    reason: str
    degree: int
    prime: int
    local_discriminant_valuation: int
    coefficient_bits: int
    factor_degrees: tuple[int, ...]
    factor_multiplicities: tuple[int, ...]
    predicted_round2_work: int
    predicted_round4_work: int
    predicted_om_work: int
    predicted_competitor_work: int
    estimated_output_bytes: int
    memory_budget_bytes: int
    native_capable: bool

    def as_dict(self) -> dict[str, object]:
        return {
            "schema": AUTO_SELECTOR_SCHEMA,
            "stage": "input-prefilter",
            "eligible": self.eligible,
            "reason": self.reason,
            "degree": self.degree,
            "prime": self.prime,
            "local_discriminant_valuation": self.local_discriminant_valuation,
            "coefficient_bits": self.coefficient_bits,
            "factor_degrees": list(self.factor_degrees),
            "factor_multiplicities": list(self.factor_multiplicities),
            "predicted_work": {
                "round2": self.predicted_round2_work,
                "round4": self.predicted_round4_work,
                "om-maxmin": self.predicted_om_work,
                "best_competitor": self.predicted_competitor_work,
            },
            "estimated_output_bytes": self.estimated_output_bytes,
            "memory_budget_bytes": self.memory_budget_bytes,
            "native_capable": self.native_capable,
            "benchmark": AUTO_SELECTOR_BENCHMARK,
        }


@dataclass
class OMAutoSelection(ImmutableOMRecord):
    selected: bool
    reason: str
    prefilter: OMAutoPrefilter
    result: Any | None

    def as_dict(self) -> dict[str, object]:
        evidence = self.prefilter.as_dict()
        evidence["stage"] = "terminal-selection"
        evidence["selected"] = self.selected
        evidence["selection_reason"] = self.reason
        evidence["algorithm"] = "om-maxmin" if self.selected else "fallback"
        if self.result is None:
            evidence["om_status"] = "not-run"
            evidence["suppressed_alternatives"] = []
            return evidence
        metrics = self.result.selector
        evidence.update(
            {
                "om_status": self.result.status,
                "complete": self.result.type_tree.complete,
                "certificate_id": self.result.type_tree.certificate_id,
                "type_count": metrics.type_count,
                "maximum_type_depth": metrics.maximum_type_depth,
                "residual_degrees": [
                    level.residue_degree
                    for branch in self.result.type_tree.types
                    for level in branch.levels
                    if not level.optimized_away
                ],
                "ramification_degrees": [
                    level.ramification_index
                    for branch in self.result.type_tree.types
                    for level in branch.levels
                    if not level.optimized_away
                ],
                "representative_precisions": [
                    level.representative_precision
                    for branch in self.result.type_tree.types
                    for level in branch.levels
                    if not level.optimized_away
                ],
                "expected_index_valuation": metrics.expected_index_valuation,
                "expected_combinations": metrics.expected_combinations,
                "estimated_memory_bytes": metrics.estimated_memory_bytes,
                "measured_crossover_region": metrics.measured_crossover_region,
                "suppressed_alternatives": list(metrics.suppressed_alternatives),
                "local_validation": (
                    {
                        "contains_one": self.result.certificate.validation.contains_one,
                        "contains_equation_order": self.result.certificate.validation.contains_equation_order,
                        "multiplication_closed": self.result.certificate.validation.multiplication_closed,
                        "locally_maximal": self.result.certificate.validation.locally_maximal,
                        "maxmin_maximality_checked": self.result.certificate.maxmin.maximality_checked,
                    }
                    if self.result.certificate is not None
                    else None
                ),
            }
        )
        return evidence


def _proof_kernels_available() -> bool:
    from sagejs.native import is_compiled
    from sagejs.number_fields.om_maxmin import (
        packed_maxmin_valuations_are_maximal,
        packed_triangular_basis_is_closed,
    )

    return is_compiled(packed_maxmin_valuations_are_maximal) and is_compiled(
        packed_triangular_basis_is_closed
    )


def om_auto_shape_prefilter(
    polynomial: tuple[int, ...] | list[int],
    prime: int,
    *,
    local_discriminant_valuation: int,
    memory_budget_bytes: int = DEFAULT_OM_MEMORY_BUDGET,
    native_capable: bool | None = None,
) -> OMAutoShapePrefilter:
    """Reject unmeasured shapes before finite-field factorization or OM work."""
    coefficients = tuple(int(value) for value in polynomial)
    characteristic = int(prime)
    valuation = int(local_discriminant_valuation)
    budget = int(memory_budget_bytes)
    degree = len(coefficients) - 1
    coefficient_bits = max(
        (abs(value).bit_length() for value in coefficients), default=0
    )
    capability = False if native_capable is None else bool(native_capable)
    output_entries = max(0, degree * (degree + 1) // 2)
    entry_bits = max(
        8,
        coefficient_bits + max(0, valuation) * max(1, characteristic.bit_length()),
    )
    estimated_output_bytes = output_entries * ((entry_bits + 7) // 8 + 16)
    if degree <= 0 or not coefficients or coefficients[-1] != 1:
        eligible = False
        reason = "OM auto-selection requires a positive-degree monic polynomial"
    elif characteristic < 7 or characteristic > MAX_WORD_PRIME:
        eligible = False
        reason = "the measured residual-characteristic crossover starts at p=7"
    elif budget <= 0 or estimated_output_bytes > budget:
        eligible = False
        reason = "the predicted exact basis exceeds the local memory budget"
    elif coefficient_bits > 256:
        eligible = False
        reason = "coefficient growth exceeds the measured OM crossover envelope"
    elif degree < 48 or valuation < 8 * degree:
        eligible = False
        reason = "degree and local valuation remain below the measured OM crossover"
    else:
        if native_capable is None:
            capability = _proof_kernels_available()
        if capability:
            eligible = True
            reason = "shape justifies finite-field factor and complete OM cost analysis"
        else:
            eligible = False
            reason = "the measured crossover requires both production OM proof kernels"
    return OMAutoShapePrefilter(
        eligible,
        reason,
        degree,
        characteristic,
        valuation,
        coefficient_bits,
        estimated_output_bytes,
        budget,
        capability,
    )


def om_auto_prefilter(
    polynomial: tuple[int, ...] | list[int],
    prime: int,
    *,
    local_discriminant_valuation: int,
    factor_degrees: tuple[int, ...] | list[int],
    factor_multiplicities: tuple[int, ...] | list[int],
    memory_budget_bytes: int = DEFAULT_OM_MEMORY_BUDGET,
    native_capable: bool | None = None,
) -> OMAutoPrefilter:
    """Return the cheap, input-derived OM crossover prefilter.

    An eligible result means only that complete OM construction is worth
    attempting.  It never proves that OM is available or mathematically
    complete.
    """
    coefficients = tuple(int(value) for value in polynomial)
    characteristic = int(prime)
    valuation = int(local_discriminant_valuation)
    degrees = tuple(int(value) for value in factor_degrees)
    multiplicities = tuple(int(value) for value in factor_multiplicities)
    budget = int(memory_budget_bytes)
    shape = om_auto_shape_prefilter(
        coefficients,
        characteristic,
        local_discriminant_valuation=valuation,
        memory_budget_bytes=budget,
        native_capable=native_capable,
    )
    degree = len(coefficients) - 1
    coefficient_bits = max(
        (abs(value).bit_length() for value in coefficients), default=0
    )
    capability = shape.native_capable
    repeated_degree = sum(
        factor_degree * max(0, multiplicity - 1)
        for factor_degree, multiplicity in zip(degrees, multiplicities, strict=False)
    )
    output_entries = max(0, degree * (degree + 1) // 2)
    entry_bits = max(
        8, coefficient_bits + max(0, valuation) * max(1, characteristic.bit_length())
    )
    estimated_output_bytes = output_entries * ((entry_bits + 7) // 8 + 16)
    factor_count = len(degrees)
    round2_work = (
        max(0, degree) ** 3 * max(1, valuation // 2) * max(1, coefficient_bits + 1)
    )
    round4_work = max(0, degree) ** 3 * max(1, valuation + 1) * max(
        1, coefficient_bits + 1
    ) + sum(value * value for value in degrees)
    om_work = (
        max(0, degree) ** 2 * max(1, degree + valuation + 1) * max(1, factor_count + 1)
    )
    competitor_work = min(round2_work, round4_work)

    malformed = (
        degree <= 0
        or len(degrees) != len(multiplicities)
        or any(value <= 0 for value in degrees)
        or any(value <= 0 for value in multiplicities)
        or sum(
            factor_degree * multiplicity
            for factor_degree, multiplicity in zip(
                degrees, multiplicities, strict=False
            )
        )
        != degree
    )
    if not shape.eligible:
        eligible = False
        reason = shape.reason
    elif malformed:
        eligible = False
        reason = "finite-field factor evidence is malformed or has the wrong degree"
    elif factor_count > 8 or repeated_degree < degree // 2:
        eligible = False
        reason = "the repeated-factor pattern is outside the measured deep-index region"
    elif om_work * 4 >= competitor_work:
        eligible = False
        reason = (
            "the conservative OM cost prediction does not beat a complete competitor"
        )
    else:
        eligible = True
        reason = "input costs justify one complete OM construction attempt"

    return OMAutoPrefilter(
        eligible,
        reason,
        degree,
        characteristic,
        valuation,
        coefficient_bits,
        degrees,
        multiplicities,
        round2_work,
        round4_work,
        om_work,
        competitor_work,
        estimated_output_bytes,
        budget,
        capability,
    )


def select_om_local_basis(
    polynomial: tuple[int, ...] | list[int],
    prime: int,
    *,
    local_discriminant_valuation: int,
    factor_degrees: tuple[int, ...] | list[int],
    factor_multiplicities: tuple[int, ...] | list[int],
    memory_budget_bytes: int = DEFAULT_OM_MEMORY_BUDGET,
    native_capable: bool | None = None,
) -> OMAutoSelection:
    """Build and select OM exactly once inside the measured complete region."""
    prefilter = om_auto_prefilter(
        polynomial,
        prime,
        local_discriminant_valuation=local_discriminant_valuation,
        factor_degrees=factor_degrees,
        factor_multiplicities=factor_multiplicities,
        memory_budget_bytes=memory_budget_bytes,
        native_capable=native_capable,
    )
    if not prefilter.eligible:
        return OMAutoSelection(False, prefilter.reason, prefilter, None)
    from sagejs.number_fields.om_maxmin import regular_local_basis

    try:
        result = regular_local_basis(
            tuple(int(value) for value in polynomial),
            int(prime),
            local_discriminant_valuation=int(local_discriminant_valuation),
            differential_evidence=True,
        )
    except (ArithmeticError, RuntimeError, ValueError) as error:
        return OMAutoSelection(
            False,
            "complete OM construction was unavailable: " + str(error),
            prefilter,
            None,
        )
    certificate = result.certificate
    selected = (
        result.status == "complete"
        and result.order_basis is not None
        and result.local_result.state == "complete"
        and result.type_tree.complete
        and result.selector.auto_selectable
        and certificate is not None
        and certificate.validation.valid
        and certificate.maxmin.maximality_checked
        and result.selector.estimated_memory_bytes <= prefilter.memory_budget_bytes
    )
    if selected:
        reason = (
            "complete OM type, quotient/MaxMin, lattice, native proof, cost, and "
            "memory gates passed"
        )
    else:
        reason = "OM attempt did not produce every required terminal selection proof"
        if result.reason:
            reason += ": " + result.reason
    return OMAutoSelection(selected, reason, prefilter, result)


__all__ = [
    "AUTO_SELECTOR_BENCHMARK",
    "AUTO_SELECTOR_SCHEMA",
    "DEFAULT_OM_MEMORY_BUDGET",
    "OMAutoPrefilter",
    "OMAutoShapePrefilter",
    "OMAutoSelection",
    "om_auto_prefilter",
    "om_auto_shape_prefilter",
    "select_om_local_basis",
]
