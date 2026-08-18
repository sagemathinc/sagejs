"""Quotient bases, MaxMin selection, and independent local-order checks.

The complete executable domain covers bounded `p`-regular OM branches,
including nonlinear first residue fields, same-degree representative
optimization, and actual multi-branch MaxMin combination.  Generic MaxMin
selection accepts any certified local numerator tables, so degree-raising
higher-order and FLINT residual-field lanes do not need to replace it.  Outside
the complete domain, `regular_local_basis` returns an explicit
incomplete/unsupported result instead of guessing a basis.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TypeAlias

from sagejs.native import IntegerBuffer, is_compiled, native, uint64

from .local_polygons import _row_hermite
from .maximal_order_contracts import (
    DiscriminantComponent,
    LocalOrderResult,
    OrderBasis,
)
from .om_types import (
    ImmutableOMRecord,
    OMDomainError,
    OMLevel,
    OMTypeTree,
    Polynomial,
    RationalValue,
    build_om_type_tree,
    higher_newton_polygon,
    maclane_integer_valuation,
    maclane_valuation,
    modular_divmod,
    newton_polygon,
    normalize_polynomial,
    phi_quotients,
    polynomial_degree,
    polynomial_multiply,
    polynomial_power,
    representative_from_level,
    validate_type_tree,
)

FiniteValuation: TypeAlias = RationalValue | None


def _canonical_row_hnf(
    rows: list[list[int]],
    degree: int,
    *,
    incremental_fallback: bool = False,
) -> list[list[int]]:
    """Use the packed production HNF with the readable row-HNF as oracle."""
    from .buchmann_lenstra import _packed_row_hnf, packed_row_hnf_in_place

    maximum_bits = max(
        (abs(value).bit_length() for row in rows for value in row),
        default=0,
    )
    packed_word_capacity = max(
        16,
        (maximum_bits + 63) // 64 + 16 * degree * degree,
    )
    packed_allocation_bytes = (
        (len(rows) * degree + 2 * degree) * packed_word_capacity * 8
    )
    if (
        is_compiled(packed_row_hnf_in_place)
        and packed_allocation_bytes <= 64 * 1024 * 1024
    ):
        return _packed_row_hnf(rows)
    if incremental_fallback:
        hermite = [list(row) for row in rows[:degree]]
        for row in rows[degree:]:
            hermite = _row_hermite(hermite + [row], degree)
        return hermite
    return _row_hermite(rows, degree)


@dataclass
class LocalNumeratorTable(ImmutableOMRecord):
    """Extended Okutsu numerators and their values at every local branch.

    `None` denotes the symbolic infinity obtained when a branch approximant
    divides a numerator.  Row `j` must contain a monic polynomial of degree
    `j`, including the final approximant at the branch degree.
    """

    branch_id: str
    numerators: tuple[Polynomial, ...]
    valuations: tuple[tuple[FiniteValuation, ...], ...]

    @property
    def degree(self) -> int:
        return len(self.numerators) - 1


@dataclass
class MaxMinCandidate(ImmutableOMRecord):
    degree: int
    multi_index: tuple[int, ...]
    numerator: Polynomial
    valuations: tuple[FiniteValuation, ...]
    minimum: RationalValue
    selected_branch: int


@dataclass
class MaxMinCertificate(ImmutableOMRecord):
    selection_kind: str
    branch_order: tuple[str, ...]
    candidates: tuple[MaxMinCandidate, ...]
    terminal_multi_index: tuple[int, ...]
    comparison_count: int
    maximality_checked: bool
    maximality_failures: tuple[str, ...]


def _validate_numerator_tables(tables: tuple[LocalNumeratorTable, ...]) -> None:
    if not tables:
        raise OMDomainError("MaxMin needs at least one local numerator table")
    branch_count = len(tables)
    branch_ids = tuple(table.branch_id for table in tables)
    if len(set(branch_ids)) != branch_count:
        raise OMDomainError("MaxMin branch identifiers must be unique")
    for table in tables:
        if len(table.numerators) != len(table.valuations):
            raise OMDomainError("each numerator must have a valuation row")
        if table.numerators[0] != (1,):
            raise OMDomainError("every extended numerator table must start at one")
        for degree, (numerator, values) in enumerate(
            zip(table.numerators, table.valuations, strict=True)
        ):
            if normalize_polynomial(numerator)[-1] != 1:
                raise OMDomainError("Okutsu numerators must be monic")
            if polynomial_degree(numerator) != degree:
                raise OMDomainError("Okutsu numerator row must match its degree")
            if len(values) != branch_count:
                raise OMDomainError("every valuation row must cover every branch")
        own_index = branch_ids.index(table.branch_id)
        if table.valuations[-1][own_index] is not None:
            raise OMDomainError(
                "the final branch approximant must have own value infinity"
            )


def _candidate_for_index(
    tables: tuple[LocalNumeratorTable, ...],
    multi_index: tuple[int, ...],
) -> tuple[Polynomial, tuple[FiniteValuation, ...], RationalValue]:
    numerator: Polynomial = (1,)
    for table_index, index in enumerate(multi_index):
        table = tables[table_index]
        numerator = polynomial_multiply(numerator, table.numerators[index])
    values, minimum = _values_for_index(tables, multi_index)
    return numerator, values, minimum


def _values_for_index(
    tables: tuple[LocalNumeratorTable, ...],
    multi_index: tuple[int, ...],
) -> tuple[tuple[FiniteValuation, ...], RationalValue]:
    """Evaluate one MaxMin multi-index without constructing its numerator."""
    branch_count = len(tables)
    values: list[FiniteValuation] = [RationalValue(0) for _ in range(branch_count)]
    for table_index, index in enumerate(multi_index):
        table = tables[table_index]
        row = table.valuations[index]
        for branch in range(branch_count):
            current = values[branch]
            contribution = row[branch]
            if current is None or contribution is None:
                values[branch] = None
            else:
                values[branch] = current + contribution
    finite = [value for value in values if value is not None]
    if not finite:
        raise ArithmeticError("a proper MaxMin candidate must have a finite value")
    minimum = finite[0]
    for value in finite[1:]:
        if value < minimum:
            minimum = value
    return tuple(values), minimum


@native
def packed_maxmin_valuations_are_maximal(
    workspace: IntegerBuffer,
    table_degrees: IntegerBuffer,
    scaled_values: IntegerBuffer,
    finite_flags: IntegerBuffer,
    selected_minima: IntegerBuffer,
    branch_count: uint64,
    maximum_degree: uint64,
    expected_combinations: uint64,
) -> bool:
    """Exhaustively compare every packed MaxMin valuation combination."""
    row_count = maximum_degree + 1
    packed_length = branch_count * row_count * branch_count
    valid = (
        branch_count > 0
        and len(workspace) == 2 * branch_count
        and len(table_degrees) == branch_count
        and len(scaled_values) == packed_length
        and len(finite_flags) == packed_length
    )
    combinations = 1
    table = 0
    while valid and table < branch_count:
        degree = table_degrees[table]
        if degree < 0 or degree > maximum_degree:
            valid = False
        else:
            combinations *= degree + 1
        table += 1
    if combinations != expected_combinations:
        valid = False
    encoded = 0
    while valid and encoded < combinations:
        branch = 0
        while branch < branch_count:
            workspace[branch] = 0
            workspace[branch_count + branch] = 1
            branch += 1
        remaining = encoded
        candidate_degree = 0
        table = 0
        while table < branch_count:
            radix = table_degrees[table] + 1
            row = remaining % radix
            remaining //= radix
            candidate_degree += row
            offset = (table * row_count + row) * branch_count
            branch = 0
            while branch < branch_count:
                if finite_flags[offset + branch] == 0:
                    workspace[branch_count + branch] = 0
                elif workspace[branch_count + branch] != 0:
                    workspace[branch] += scaled_values[offset + branch]
                branch += 1
            table += 1
        if candidate_degree < len(selected_minima):
            found = False
            minimum = 0
            branch = 0
            while branch < branch_count:
                if workspace[branch_count + branch] != 0:
                    if not found or workspace[branch] < minimum:
                        minimum = workspace[branch]
                        found = True
                branch += 1
            if not found or selected_minima[candidate_degree] < minimum:
                valid = False
        encoded += 1
    return valid


def validate_maxmin_certificate(
    tables: tuple[LocalNumeratorTable, ...],
    certificate: MaxMinCertificate,
    *,
    max_combinations: int = 200_000,
) -> tuple[str, ...]:
    """Exhaustively verify each selected multi-index is valuation-maximal."""
    failures: list[str] = []
    _validate_numerator_tables(tables)
    expected_degree = sum(table.degree for table in tables)
    if len(certificate.candidates) != expected_degree:
        failures.append("candidate count differs from total local degree")
        return tuple(failures)
    combinations = 1
    for table in tables:
        combinations *= len(table.numerators)
        if combinations > max_combinations:
            failures.append("MaxMin exhaustive validation bound exceeded")
            return tuple(failures)
    valuation_scale = 1
    for table in tables:
        for row in table.valuations:
            for value in row:
                if value is None:
                    continue
                left = valuation_scale
                right = value.denominator
                while right:
                    left, right = right, left % right
                valuation_scale *= value.denominator // left
    scaled_tables = tuple(
        tuple(
            tuple(
                None
                if value is None
                else value.numerator * (valuation_scale // value.denominator)
                for value in row
            )
            for row in table.valuations
        )
        for table in tables
    )
    selected_minima: list[int] = []
    for candidate in certificate.candidates:
        numerator, values, minimum = _candidate_for_index(tables, candidate.multi_index)
        if numerator != candidate.numerator:
            failures.append(
                "candidate numerator product differs at degree " + str(candidate.degree)
            )
        if values != candidate.valuations or minimum != candidate.minimum:
            failures.append(
                "candidate valuation differs at degree " + str(candidate.degree)
            )
        if polynomial_degree(numerator) != candidate.degree:
            failures.append(
                "candidate degree differs at degree " + str(candidate.degree)
            )
        selected_minima.append(
            candidate.minimum.numerator
            * (valuation_scale // candidate.minimum.denominator)
        )
    maximum_degree = max(table.degree for table in tables)
    packed_values: list[int] = []
    finite_flags: list[int] = []
    accumulator_bound = 1
    for table, scaled_table in zip(tables, scaled_tables, strict=True):
        table_bound = 0
        for row_index in range(maximum_degree + 1):
            if row_index <= table.degree:
                for value in scaled_table[row_index]:
                    packed_values.append(0 if value is None else value)
                    finite_flags.append(0 if value is None else 1)
                    if value is not None and abs(value) > table_bound:
                        table_bound = abs(value)
            else:
                packed_values.extend([0] * len(tables))
                finite_flags.extend([0] * len(tables))
        accumulator_bound += table_bound
    workspace = [0] * (2 * len(tables))
    workspace[0] = accumulator_bound
    if not packed_maxmin_valuations_are_maximal(
        workspace,
        [table.degree for table in tables],
        packed_values,
        finite_flags,
        selected_minima,
        len(tables),
        maximum_degree,
        combinations,
    ):
        failures.append("candidate is not valuation-maximal")
    return tuple(failures)


def maxmin_select(
    tables: tuple[LocalNumeratorTable, ...],
    *,
    verify_maximality: bool = True,
    max_combinations: int = 200_000,
) -> MaxMinCertificate:
    """Run Stainsby's deterministic MaxMin recurrence in the supplied order."""
    _validate_numerator_tables(tables)
    total_degree = sum(table.degree for table in tables)
    indices = [0] * len(tables)
    candidates: list[MaxMinCandidate] = []
    comparisons = 0
    for degree in range(total_degree):
        multi_index = tuple(indices)
        numerator, values, minimum = _candidate_for_index(tables, multi_index)
        selected = -1
        for branch, value in enumerate(values):
            comparisons += 1
            if value is not None and value == minimum:
                selected = branch
                break
        if selected < 0:
            raise ArithmeticError("MaxMin failed to find a finite minimal branch")
        if indices[selected] >= tables[selected].degree:
            raise ArithmeticError("MaxMin attempted to advance a completed branch")
        candidates.append(
            MaxMinCandidate(
                degree,
                multi_index,
                numerator,
                values,
                minimum,
                selected,
            )
        )
        indices[selected] += 1
    provisional = MaxMinCertificate(
        "stainsby-maxmin",
        tuple(table.branch_id for table in tables),
        tuple(candidates),
        tuple(indices),
        comparisons,
        False,
        (),
    )
    if not verify_maximality:
        return provisional
    failures = validate_maxmin_certificate(
        tables,
        provisional,
        max_combinations=max_combinations,
    )
    return MaxMinCertificate(
        provisional.selection_kind,
        provisional.branch_order,
        provisional.candidates,
        provisional.terminal_multi_index,
        provisional.comparison_count,
        not failures,
        failures,
    )


@dataclass
class TriangularBasisElement(ImmutableOMRecord):
    degree: int
    numerator: Polynomial
    denominator_exponent: int
    denominator: int
    certified_valuation: RationalValue


@dataclass
class BasisValidation(ImmutableOMRecord):
    valid: bool
    contains_one: bool
    contains_equation_order: bool
    multiplication_closed: bool
    local_index_matches: bool
    locally_maximal: bool
    failures: tuple[str, ...]


@dataclass
class TriangularBasisCertificate(ImmutableOMRecord):
    polynomial: Polynomial
    prime: int
    type_tree: OMTypeTree
    numerator_tables: tuple[LocalNumeratorTable, ...]
    maxmin: MaxMinCertificate
    basis: tuple[TriangularBasisElement, ...]
    local_index_valuation: int
    expected_index_valuation: int
    common_denominator: int
    common_denominator_numerators: tuple[tuple[int, ...], ...]
    basis_kind: str
    validation: BasisValidation


@dataclass
class OMSelectorMetrics(ImmutableOMRecord):
    degree: int
    prime: int
    local_discriminant_valuation: int
    factor_degrees: tuple[int, ...]
    factor_multiplicities: tuple[int, ...]
    type_count: int
    maximum_type_depth: int
    expected_index_valuation: int
    expected_output_entries: int
    coefficient_bits: int
    predicted_round4_work: int
    predicted_om_work: int
    recommendation: str
    auto_selectable: bool
    reason: str
    expected_combinations: int
    estimated_memory_bytes: int
    native_capable: bool
    measured_crossover_region: str
    suppressed_alternatives: tuple[str, ...]


@dataclass
class LocalBasisResult(ImmutableOMRecord):
    status: str
    reason: str
    type_tree: OMTypeTree
    selector: OMSelectorMetrics
    certificate: TriangularBasisCertificate | None
    order_basis: OrderBasis | None
    local_result: LocalOrderResult


def _selector_evidence(metrics: OMSelectorMetrics) -> dict[str, object]:
    return {
        "degree": metrics.degree,
        "prime": metrics.prime,
        "local_discriminant_valuation": metrics.local_discriminant_valuation,
        "factor_degrees": list(metrics.factor_degrees),
        "factor_multiplicities": list(metrics.factor_multiplicities),
        "type_count": metrics.type_count,
        "maximum_type_depth": metrics.maximum_type_depth,
        "expected_index_valuation": metrics.expected_index_valuation,
        "expected_output_entries": metrics.expected_output_entries,
        "coefficient_bits": metrics.coefficient_bits,
        "predicted_round4_work": metrics.predicted_round4_work,
        "predicted_om_work": metrics.predicted_om_work,
        "recommendation": metrics.recommendation,
        "auto_selectable": metrics.auto_selectable,
        "reason": metrics.reason,
        "expected_combinations": metrics.expected_combinations,
        "estimated_memory_bytes": metrics.estimated_memory_bytes,
        "native_capable": metrics.native_capable,
        "measured_crossover_region": metrics.measured_crossover_region,
        "suppressed_alternatives": list(metrics.suppressed_alternatives),
    }


def _type_tree_trace(tree: OMTypeTree) -> list[dict[str, object]]:
    trace: list[dict[str, object]] = []
    for branch in tree.types:
        trace.append(
            {
                "stage": "om-type",
                "branch_id": branch.branch_id,
                "parent_id": branch.parent_id,
                "branch_degree": branch.branch_degree,
                "complete": branch.complete,
                "refinement_state": branch.refinement_state,
                "levels": [
                    {
                        "order": level.order,
                        "key_polynomial": list(level.key_polynomial),
                        "slope": list(level.slope.to_pair()),
                        "key_value": list(level.key_value.to_pair()),
                        "residual_field_modulus": list(level.residual_field_modulus),
                        "residual_polynomial": [
                            list(coefficient)
                            for coefficient in level.residual_polynomial
                        ],
                        "residual_factor": [
                            list(coefficient) for coefficient in level.residual_factor
                        ],
                        "ramification_index": level.ramification_index,
                        "residue_degree": level.residue_degree,
                        "multiplicity": level.multiplicity,
                        "index_contribution": level.index_contribution,
                        "representative_precision": level.representative_precision,
                        "representative_step": level.representative_step,
                        "optimized_away": level.optimized_away,
                        "index_evidence": level.index_evidence,
                    }
                    for level in branch.levels
                ],
            }
        )
    return trace


def _not_applicable_result(
    tree: OMTypeTree,
    metrics: OMSelectorMetrics,
    message: str,
) -> LocalOrderResult:
    return LocalOrderResult(
        "not-applicable",
        "om-maxmin",
        DiscriminantComponent(
            tree.prime,
            "proven-prime",
            evidence={"proof": "deterministic trial division"},
        ),
        evidence={
            "certificate_id": tree.certificate_id,
            "complete": tree.complete,
            "expected_index_valuation": tree.expected_index_valuation,
            "max_enumerated_candidates": tree.max_enumerated_candidates,
            "max_representative_refinements": tree.max_representative_refinements,
            "max_type_depth": tree.max_type_depth,
            "selector": _selector_evidence(metrics),
        },
        trace=_type_tree_trace(tree),
        message=message,
    )


def selector_metrics(
    tree: OMTypeTree,
    *,
    local_discriminant_valuation: int,
    differential_evidence: bool = False,
) -> OMSelectorMetrics:
    """Compute deterministic, input-derived selector and crossover evidence."""
    if local_discriminant_valuation < 0:
        raise ValueError("a discriminant valuation must be nonnegative")
    degree = polynomial_degree(tree.polynomial)
    coefficient_bits = max(abs(value).bit_length() for value in tree.polynomial)
    factor_degrees = tuple(
        polynomial_degree(factor.polynomial) for factor in tree.initial_factors
    )
    factor_multiplicities = tuple(
        factor.multiplicity for factor in tree.initial_factors
    )
    maximum_depth = max((len(branch.levels) for branch in tree.types), default=0)
    output_entries = degree * (degree + 1) // 2
    round4_work = (
        degree**3 * (local_discriminant_valuation + 1) * (coefficient_bits + 1)
    )
    om_work = (
        degree
        * degree
        * (tree.expected_index_valuation + degree + 1)
        * (len(tree.types) + maximum_depth + 1)
    )
    expected_combinations = 1
    for branch in tree.types:
        expected_combinations *= branch.branch_degree + 1
    entry_bits = max(
        8,
        coefficient_bits
        + local_discriminant_valuation * max(1, tree.prime.bit_length()),
    )
    estimated_memory_bytes = output_entries * ((entry_bits + 7) // 8 + 16)
    if not tree.complete:
        recommendation = "fallback"
        reason = "OM type tree is incomplete: " + ", ".join(tree.incomplete_states())
    elif degree >= 24 or local_discriminant_valuation >= 2 * degree:
        recommendation = "om-maxmin-candidate"
        reason = "degree/local depth predicts lower OM work"
    elif tree.expected_index_valuation >= degree:
        recommendation = "om-maxmin-candidate"
        reason = "predicted output index justifies quotient construction"
    else:
        recommendation = "round2-or-round4"
        reason = "bounded input is too small to justify OM dispatch overhead"
    higher_keys = tuple(
        branch.levels[-1].key_polynomial
        for branch in tree.types
        if len(branch.levels) > 1
    )
    has_branched_higher_quotients = False
    for left_index, key in enumerate(higher_keys):
        for other in higher_keys[left_index + 1 :]:
            if key == other:
                has_branched_higher_quotients = True
                break
        if has_branched_higher_quotients:
            break
    native_capable = is_compiled(packed_maxmin_valuations_are_maximal) and is_compiled(
        packed_triangular_basis_is_closed
    )
    measured_crossover_region = ""
    if (
        tree.prime >= 7
        and degree >= 48
        and local_discriminant_valuation >= 8 * degree
        and tree.expected_index_valuation >= 4 * degree
        and maximum_depth == 1
        and len(tree.types) <= 8
        and expected_combinations <= 200_000
        and coefficient_bits <= 256
        and estimated_memory_bytes <= 64 * 1024 * 1024
    ):
        measured_crossover_region = "deep-index-shallow-types-v1"
    suppressed_alternatives: list[str] = []
    if measured_crossover_region:
        suppressed_alternatives.extend(
            (
                "round2: measured multiplier cycles exceed the OM local boundary",
                "round4: measured refinement exceeds the OM local boundary",
            )
        )
    auto_selectable = (
        differential_evidence
        and tree.complete
        and recommendation == "om-maxmin-candidate"
        and not has_branched_higher_quotients
        and bool(measured_crossover_region)
        and native_capable
    )
    if has_branched_higher_quotients:
        reason += "; branched higher quotients await crossover evidence"
    elif recommendation == "om-maxmin-candidate" and not measured_crossover_region:
        reason += "; no measured end-to-end OM crossover covers these inputs"
    elif recommendation == "om-maxmin-candidate" and not native_capable:
        reason += "; measured crossover requires packed native proof kernels"
    elif recommendation == "om-maxmin-candidate" and not differential_evidence:
        reason += "; auto-selection awaits integrated differential evidence"
    return OMSelectorMetrics(
        degree,
        tree.prime,
        local_discriminant_valuation,
        factor_degrees,
        factor_multiplicities,
        len(tree.types),
        maximum_depth,
        tree.expected_index_valuation,
        output_entries,
        coefficient_bits,
        round4_work,
        om_work,
        recommendation,
        auto_selectable,
        reason,
        expected_combinations,
        estimated_memory_bytes,
        native_capable,
        measured_crossover_region,
        tuple(suppressed_alternatives),
    )


def _basis_coordinates_are_integral(
    value_numerator: Polynomial,
    value_denominator: int,
    basis: tuple[TriangularBasisElement, ...],
) -> bool:
    """Test triangular coordinates with one shared integer denominator.

    During descending elimination, if the current leading numerator is `a`
    and the basis element is monic `g/d`, its coordinate is `a*d/D`.
    Subtracting that coordinate times `g/d` changes the shared numerator by
    exactly `a*g`.  This avoids allocating quadratic numbers of temporary
    `RationalValue` objects in the independent multiplication check.
    """
    if value_denominator <= 0:
        raise ValueError("a coordinate denominator must be positive")
    degree = len(basis)
    values = [0] * degree
    for index, coefficient in enumerate(value_numerator):
        if index < degree:
            values[index] = coefficient
        elif coefficient:
            raise ArithmeticError("reduced field element exceeds the field degree")
    for index in range(degree - 1, -1, -1):
        element = basis[index]
        leading = values[index]
        if leading * element.denominator % value_denominator != 0:
            return False
        for exponent, coefficient in enumerate(element.numerator):
            values[exponent] -= leading * coefficient
    if any(values):
        raise ArithmeticError("triangular coordinate elimination left a remainder")
    return True


@native
def packed_triangular_basis_is_closed(
    workspace: IntegerBuffer,
    basis_numerators: IntegerBuffer,
    basis_denominators: IntegerBuffer,
    polynomial: IntegerBuffer,
    degree: uint64,
) -> bool:
    """Check every basis product in one exact packed-integer kernel.

    Basis numerator rows are dense, row-major, and monic triangular. The
    defining polynomial is monic with `degree + 1` coefficients. CPython and
    an uncompiled Sage.js runtime execute this same loop as the dynamic
    fallback; a compiled artifact keeps all products, reductions, and
    coordinate eliminations inside one isolated GMP-backed core.
    """
    valid = (
        degree > 0
        and len(workspace) == degree * 2 - 1
        and len(basis_numerators) == degree * degree
        and len(basis_denominators) == degree
        and len(polynomial) == degree + 1
        and polynomial[degree] == 1
    )
    if valid:
        for row in range(degree):
            if basis_denominators[row] <= 0:
                valid = False
            if basis_numerators[row * degree + row] != 1:
                valid = False
            for column in range(row + 1, degree):
                if basis_numerators[row * degree + column] != 0:
                    valid = False
    left = 0
    while valid and left < degree:
        right = left
        while valid and right < degree:
            if basis_denominators[left] != 1 or basis_denominators[right] != 1:
                for index in range(len(workspace)):
                    workspace[index] = 0
                for left_index in range(left + 1):
                    left_value = basis_numerators[left * degree + left_index]
                    if left_value != 0:
                        for right_index in range(right + 1):
                            right_value = basis_numerators[right * degree + right_index]
                            if right_value != 0:
                                workspace[left_index + right_index] += (
                                    left_value * right_value
                                )
                reduction_offset = 0
                while reduction_offset < degree - 1:
                    exponent = len(workspace) - 1 - reduction_offset
                    leading = workspace[exponent]
                    if leading != 0:
                        shift = exponent - degree
                        for index in range(degree + 1):
                            workspace[shift + index] -= leading * polynomial[index]
                    reduction_offset += 1
                value_denominator = basis_denominators[left] * basis_denominators[right]
                coordinate_offset = 0
                while valid and coordinate_offset < degree:
                    coordinate = degree - 1 - coordinate_offset
                    leading = workspace[coordinate]
                    if (
                        leading * basis_denominators[coordinate]
                    ) % value_denominator != 0:
                        valid = False
                    else:
                        for index in range(coordinate + 1):
                            workspace[index] -= (
                                leading * basis_numerators[coordinate * degree + index]
                            )
                    coordinate_offset += 1
            right += 1
        left += 1
    return valid


def validate_triangular_basis(
    polynomial: Polynomial,
    prime: int,
    tree: OMTypeTree,
    basis: tuple[TriangularBasisElement, ...],
    expected_index_valuation: int,
) -> BasisValidation:
    """Check containment, multiplication closure, index, and OM maximality."""
    failures: list[str] = []
    degree = polynomial_degree(polynomial)
    contains_one = (
        bool(basis) and basis[0].numerator == (1,) and basis[0].denominator == 1
    )
    if not contains_one:
        failures.append("basis does not begin with one")
    triangular = len(basis) == degree
    if not triangular:
        failures.append("basis rank differs from polynomial degree")
    else:
        for index, element in enumerate(basis):
            if (
                polynomial_degree(element.numerator) != index
                or element.numerator[-1] != 1
            ):
                triangular = False
                failures.append("basis is not monic triangular at degree " + str(index))
                break
            if element.denominator != prime**element.denominator_exponent:
                failures.append("basis denominator is not its certified prime power")
                triangular = False
                break
    contains_equation_order = triangular
    if triangular:
        for exponent in range(degree):
            monomial = (0,) * exponent + (1,)
            if not _basis_coordinates_are_integral(monomial, 1, basis):
                contains_equation_order = False
                failures.append("equation-order monomial is not contained")
                break
    multiplication_closed = triangular
    if triangular and any(element.denominator != 1 for element in basis):
        packed_numerators: list[int] = []
        coefficient_bound = 1
        for coefficient in polynomial:
            if abs(coefficient) > coefficient_bound:
                coefficient_bound = abs(coefficient)
        for element in basis:
            packed_numerators.extend(element.numerator)
            packed_numerators.extend([0] * (degree - len(element.numerator)))
            for coefficient in element.numerator:
                if abs(coefficient) > coefficient_bound:
                    coefficient_bound = abs(coefficient)
        capacity_seed = (coefficient_bound + 1) ** (2 * degree + 2)
        workspace = [0] * (degree * 2 - 1)
        workspace[0] = capacity_seed
        multiplication_closed = packed_triangular_basis_is_closed(
            workspace,
            packed_numerators,
            [element.denominator for element in basis],
            list(polynomial),
            degree,
        )
        if not multiplication_closed:
            failures.append("basis multiplication is not integral")
    local_index = sum(element.denominator_exponent for element in basis)
    index_matches = local_index == expected_index_valuation
    if not index_matches:
        failures.append("basis denominator index differs from Ore polygon index")
    tree_validation = validate_type_tree(tree)
    if not tree_validation.valid:
        failures.extend(tree_validation.failures)
    locally_maximal = (
        tree_validation.valid
        and tree_validation.complete
        and index_matches
        and contains_equation_order
        and multiplication_closed
    )
    return BasisValidation(
        not failures and locally_maximal,
        contains_one,
        contains_equation_order,
        multiplication_closed,
        index_matches,
        locally_maximal,
        tuple(failures),
    )


def _unramified_branch_valuation(
    polynomial: Polynomial,
    key: Polynomial,
    prime: int,
) -> RationalValue:
    """Return the order of an initial squarefree key in reduction modulo `p`."""
    remaining = polynomial
    valuation = 0
    while polynomial_degree(remaining) >= polynomial_degree(key):
        quotient, remainder = modular_divmod(remaining, key, prime)
        if remainder != (0,):
            break
        valuation += 1
        remaining = quotient
    return RationalValue(valuation)


def _branch_approximant(tree: OMTypeTree, branch_index: int) -> Polynomial:
    branch = tree.types[branch_index]
    active = tuple(level for level in branch.levels if not level.optimized_away)
    if active and polynomial_degree(active[-1].key_polynomial) == branch.branch_degree:
        approximant = active[-1].key_polynomial
    elif len(active) == 2 and [level.order for level in active] == [1, 2]:
        from .om_higher_residue import order_two_representative

        approximant = order_two_representative(tree.prime, active[0], active[1])
    elif active:
        approximant = representative_from_level(active[-1], tree.prime)
    else:
        approximant = branch.initial_factor
    if polynomial_degree(approximant) != branch.branch_degree or approximant[-1] != 1:
        raise OMDomainError(
            "the bounded branch representative does not have its certified degree"
        )
    return approximant


def _mixed_radix_branch_table(
    tree: OMTypeTree,
    branch_index: int,
) -> LocalNumeratorTable:
    """Build one extended Okutsu table from its increasing key degrees."""
    branch = tree.types[branch_index]
    active = tuple(level for level in branch.levels if not level.optimized_away)
    keys = tuple(
        level.key_polynomial
        for level in active
        if polynomial_degree(level.key_polynomial) < branch.branch_degree
    )
    key_degrees = tuple(polynomial_degree(key) for key in keys)
    if not keys or key_degrees[0] <= 0:
        raise OMDomainError("mixed-radix numerators require positive key degrees")
    if (
        any(
            right % left
            for left, right in zip(key_degrees, key_degrees[1:], strict=False)
        )
        or branch.branch_degree % key_degrees[-1]
    ):
        raise OMDomainError("mixed-radix key degrees are not nested")
    numerators: list[Polynomial] = []
    for candidate_degree in range(branch.branch_degree):
        remaining = candidate_degree
        numerator: Polynomial = (1,)
        for key, key_degree in reversed(tuple(zip(keys, key_degrees, strict=True))):
            digit, remaining = divmod(remaining, key_degree)
            if digit:
                numerator = polynomial_multiply(
                    numerator,
                    polynomial_power(key, digit),
                )
        if remaining or polynomial_degree(numerator) != candidate_degree:
            raise OMDomainError("a mixed-radix numerator has the wrong degree")
        numerators.append(numerator)
    numerators.append(_branch_approximant(tree, branch_index))
    valuations: list[tuple[FiniteValuation, ...]] = []
    for numerator_index, numerator in enumerate(numerators):
        row: list[FiniteValuation] = []
        for other_index, other in enumerate(tree.types):
            if numerator_index == branch.branch_degree and branch_index == other_index:
                row.append(None)
            else:
                value = maclane_valuation(numerator, tree.prime, other.levels)
                if value is None:
                    raise ArithmeticError(
                        "a proper mixed-radix numerator has infinite value"
                    )
                row.append(value)
        valuations.append(tuple(row))
    return LocalNumeratorTable(
        branch.branch_id,
        tuple(numerators),
        tuple(valuations),
    )


def _bounded_branch_table(
    tree: OMTypeTree,
    branch_index: int,
) -> LocalNumeratorTable:
    branch = tree.types[branch_index]
    degree = branch.branch_degree
    approximant = _branch_approximant(tree, branch_index)
    quotient_source = tree.polynomial if len(tree.types) == 1 else approximant
    level = branch.levels[-1] if branch.levels else None
    key = level.key_polynomial if level is not None else branch.initial_factor
    key_degree = polynomial_degree(key)
    quotients = phi_quotients(quotient_source, key)
    numerators: list[Polynomial] = [(1,)]
    for candidate_degree in range(1, degree):
        quotient_degree, residue_degree = divmod(candidate_degree, key_degree)
        residue_monomial = (0,) * residue_degree + (1,)
        if quotient_degree == 0:
            candidate = residue_monomial
        else:
            quotient_number = degree // key_degree - quotient_degree - 1
            if quotient_number < 0 or quotient_number >= len(quotients):
                raise OMDomainError("quotient numerator degree is unavailable")
            candidate = polynomial_multiply(
                quotients[quotient_number], residue_monomial
            )
        if polynomial_degree(candidate) != candidate_degree or candidate[-1] != 1:
            raise OMDomainError("quotient numerator is not monic triangular")
        numerators.append(candidate)
    numerators.append(quotient_source)
    valuations: list[tuple[FiniteValuation, ...]] = []
    for numerator_index, numerator in enumerate(numerators):
        row: list[FiniteValuation] = []
        for other_index, other in enumerate(tree.types):
            if numerator_index == degree and branch_index == other_index:
                row.append(None)
            elif other.levels:
                value = maclane_valuation(
                    numerator,
                    tree.prime,
                    other.levels,
                )
                if value is None:
                    raise ArithmeticError(
                        "a proper cross-branch numerator has infinite value"
                    )
                row.append(value)
            else:
                row.append(
                    _unramified_branch_valuation(
                        numerator,
                        other.initial_factor,
                        tree.prime,
                    )
                )
        valuations.append(tuple(row))
    return LocalNumeratorTable(branch.branch_id, tuple(numerators), tuple(valuations))


def _reduce_power_numerator(
    polynomial: Polynomial,
    defining_polynomial: Polynomial,
) -> Polynomial:
    degree = polynomial_degree(defining_polynomial)
    values = list(polynomial)
    while len(values) - 1 >= degree:
        leading = values[-1]
        shift = len(values) - 1 - degree
        if leading:
            for index, coefficient in enumerate(defining_polynomial):
                values[shift + index] -= leading * coefficient
        while len(values) > 1 and values[-1] == 0:
            values.pop()
    return normalize_polynomial(tuple(values))


def _order_two_quotient_hnf_selection(
    tree: OMTypeTree,
) -> MaxMinCertificate | None:
    """Build the exact GMN quotient basis for bounded order-two terminal sides."""
    if len(tree.initial_factors) != 1 or not tree.types:
        return None
    if any(
        len(branch.levels) != 2
        or any(level.optimized_away for level in branch.levels)
        or branch.levels[-1].order != 2
        for branch in tree.types
    ):
        return None
    groups: list[tuple[OMLevel, OMLevel]] = []
    signatures = []
    for branch in tree.types:
        first, higher = branch.levels
        signature = (
            first.key_polynomial,
            first.slope,
            first.residual_factor,
            higher.key_polynomial,
            higher.slope,
        )
        if signature not in signatures:
            signatures.append(signature)
            groups.append((first, higher))
    polynomial = tree.polynomial
    prime = tree.prime
    degree = polynomial_degree(polynomial)
    initial_degree = polynomial_degree(tree.initial_factors[0].polynomial)
    if initial_degree <= 1:
        return None
    elements: list[tuple[Polynomial, int]] = []
    expected_degrees = 0
    for first_object, higher_object in groups:
        first = first_object
        higher = higher_object
        first_sides = tuple(
            side
            for side in newton_polygon(polynomial, prime, first.key_polynomial)
            if side.slope == first.slope
        )
        higher_sides = tuple(
            side
            for side in higher_newton_polygon(
                polynomial,
                prime,
                higher.key_polynomial,
                (first,),
            )
            if side.slope == higher.slope
        )
        if len(first_sides) != 1 or len(higher_sides) != 1:
            return None
        first_side = first_sides[0]
        higher_side = higher_sides[0]
        first_count = first.ramification_index * first.residue_degree
        terminal_count = higher_side.right.abscissa - higher_side.left.abscissa
        if first_count <= 0 or terminal_count <= 0:
            return None
        expected_degrees += initial_degree * first_count * terminal_count
        first_quotients = phi_quotients(polynomial, first.key_polynomial)
        higher_quotients = phi_quotients(polynomial, higher.key_polynomial)
        first_value = maclane_integer_valuation(first.key_polynomial, prime, ())
        higher_value = maclane_integer_valuation(
            higher.key_polynomial,
            prime,
            (first,),
        )
        if first_value is None or higher_value is None:
            return None
        for first_index in range(first_count):
            first_number = first_side.right.abscissa - first_index
            if first_number <= 0 or first_number > len(first_quotients):
                return None
            first_height = first_side.ordinate_at(first_number) - (
                first_number * first_value
            )
            first_quotient = first_quotients[first_number - 1]
            for terminal_index in range(terminal_count):
                higher_number = higher_side.right.abscissa - terminal_index
                if higher_number <= 0 or higher_number > len(higher_quotients):
                    return None
                higher_height = (
                    higher_side.ordinate_at(higher_number)
                    - higher_number * higher_value
                ) / first.ramification_index
                denominator_exponent = (first_height + higher_height).floor()
                if denominator_exponent < 0:
                    raise ArithmeticError("a quotient basis denominator is negative")
                product = _reduce_power_numerator(
                    polynomial_multiply(
                        first_quotient,
                        higher_quotients[higher_number - 1],
                    ),
                    polynomial,
                )
                for initial_index in range(initial_degree):
                    numerator = _reduce_power_numerator(
                        polynomial_multiply(
                            product,
                            (0,) * initial_index + (1,),
                        ),
                        polynomial,
                    )
                    elements.append((numerator, denominator_exponent))
    if expected_degrees != degree or len(elements) != degree:
        return None
    common_exponent = max((exponent for _numerator, exponent in elements), default=0)
    common_denominator = prime**common_exponent
    rows = []
    for numerator, exponent in elements:
        scale = prime ** (common_exponent - exponent)
        rows.append(
            [
                (numerator[index] if index < len(numerator) else 0)
                * scale
                % common_denominator
                for index in range(degree)
            ]
        )
    rows.extend(
        [
            [common_denominator if row == column else 0 for column in range(degree)]
            for row in range(degree)
        ]
    )
    hermite = _canonical_row_hnf(rows, degree)
    candidates: list[MaxMinCandidate] = []
    local_index = 0
    for candidate_degree, row in enumerate(hermite):
        diagonal = row[candidate_degree]
        if (
            diagonal <= 0
            or common_denominator % diagonal
            or any(row[index] for index in range(candidate_degree + 1, degree))
            or any(row[index] % diagonal for index in range(candidate_degree + 1))
        ):
            raise ArithmeticError("quotient HNF is not monic triangular")
        denominator = common_denominator // diagonal
        denominator_exponent = 0
        remaining = denominator
        while remaining % prime == 0:
            denominator_exponent += 1
            remaining //= prime
        if remaining != 1:
            raise ArithmeticError("quotient HNF denominator is not a prime power")
        local_index += denominator_exponent
        numerator = normalize_polynomial(
            tuple(row[index] // diagonal for index in range(candidate_degree + 1))
        )
        value = RationalValue(denominator_exponent)
        candidates.append(
            MaxMinCandidate(
                candidate_degree,
                (),
                numerator,
                tuple(value for _branch in tree.types),
                value,
                0,
            )
        )
    if local_index != tree.expected_index_valuation:
        raise ArithmeticError("quotient HNF index differs from the OM polygon index")
    return MaxMinCertificate(
        "gmn-order-two-quotient-hnf",
        tuple(branch.branch_id for branch in tree.types),
        tuple(candidates),
        (),
        len(elements),
        True,
        (),
    )


def _mixed_quotient_hnf_selection(tree: OMTypeTree) -> MaxMinCertificate | None:
    """Build terminal-side quotient products for a bounded depth-three tree."""
    if not any(
        any(level.order == 3 for level in branch.levels) for branch in tree.types
    ):
        return None
    groups: list[tuple[tuple[OMLevel, ...], list[int]]] = []
    signatures = []
    for branch_index, branch in enumerate(tree.types):
        active = tuple(level for level in branch.levels if not level.optimized_away)
        if not active or active[-1].multiplicity != 1:
            return None
        signature = tuple(
            (
                level.order,
                level.key_polynomial,
                level.slope,
                level.residual_factor if level is not active[-1] else (),
            )
            for level in active
        )
        if signature in signatures:
            groups[signatures.index(signature)][1].append(branch_index)
        else:
            signatures.append(signature)
            groups.append((active, [branch_index]))
    polynomial = tree.polynomial
    prime = tree.prime
    degree = polynomial_degree(polynomial)
    initial_degree = polynomial_degree(tree.initial_factors[0].polynomial)
    elements: list[tuple[Polynomial, int]] = []
    for levels, branch_indices in groups:
        products: list[tuple[Polynomial, RationalValue]] = [((1,), RationalValue(0))]
        prior: tuple[OMLevel, ...] = ()
        previous_ramification = 1
        for level_index, level in enumerate(levels):
            if level_index == 0:
                sides = tuple(
                    side
                    for side in newton_polygon(polynomial, prime, level.key_polynomial)
                    if side.slope == level.slope
                )
            else:
                sides = tuple(
                    side
                    for side in higher_newton_polygon(
                        polynomial,
                        prime,
                        level.key_polynomial,
                        prior,
                    )
                    if side.slope == level.slope
                )
            if len(sides) != 1:
                return None
            side = sides[0]
            if level_index == len(levels) - 1:
                digit_count = sum(
                    tree.types[index].levels[-1].ramification_index
                    * tree.types[index].levels[-1].residue_degree
                    for index in branch_indices
                )
            else:
                digit_count = level.ramification_index * level.residue_degree
            quotients = phi_quotients(polynomial, level.key_polynomial)
            key_value = maclane_integer_valuation(
                level.key_polynomial,
                prime,
                prior,
            )
            if key_value is None:
                return None
            choices: list[tuple[Polynomial, RationalValue]] = []
            for digit in range(digit_count):
                quotient_number = side.right.abscissa - digit
                if quotient_number <= 0 or quotient_number > len(quotients):
                    return None
                height = (
                    side.ordinate_at(quotient_number) - quotient_number * key_value
                ) / previous_ramification
                choices.append((quotients[quotient_number - 1], height))
            expanded: list[tuple[Polynomial, RationalValue]] = []
            for product, product_height in products:
                for quotient, quotient_height in choices:
                    expanded.append(
                        (
                            _reduce_power_numerator(
                                polynomial_multiply(product, quotient),
                                polynomial,
                            ),
                            product_height + quotient_height,
                        )
                    )
            products = expanded
            prior += (level,)
            previous_ramification *= level.ramification_index
        for product, height in products:
            for initial_index in range(initial_degree):
                numerator = _reduce_power_numerator(
                    polynomial_multiply(
                        product,
                        (0,) * initial_index + (1,),
                    ),
                    polynomial,
                )
                exponent = height.floor()
                if exponent < 0:
                    raise ArithmeticError("a mixed quotient denominator is negative")
                elements.append((numerator, exponent))
    if len(elements) != degree:
        return None
    normalized_elements: list[tuple[Polynomial, int]] = []
    for numerator, exponent in elements:
        content_exponent = exponent
        for coefficient in numerator:
            if coefficient == 0:
                continue
            coefficient_exponent = 0
            remaining = abs(coefficient)
            while remaining % prime == 0:
                coefficient_exponent += 1
                remaining //= prime
            content_exponent = min(content_exponent, coefficient_exponent)
        if content_exponent:
            divisor = prime**content_exponent
            numerator = tuple(coefficient // divisor for coefficient in numerator)
            exponent -= content_exponent
        normalized_elements.append((numerator, exponent))
    elements = normalized_elements
    common_exponent = max((exponent for _numerator, exponent in elements), default=0)
    common_denominator = prime**common_exponent
    rows = [
        [
            (numerator[index] if index < len(numerator) else 0)
            * prime ** (common_exponent - exponent)
            % common_denominator
            for index in range(degree)
        ]
        for numerator, exponent in elements
    ]
    identity = [
        [common_denominator if row == column else 0 for column in range(degree)]
        for row in range(degree)
    ]
    hermite = _canonical_row_hnf(
        identity + rows,
        degree,
        incremental_fallback=True,
    )
    candidates: list[MaxMinCandidate] = []
    local_index = 0
    for candidate_degree, row in enumerate(hermite):
        diagonal = row[candidate_degree]
        if (
            diagonal <= 0
            or common_denominator % diagonal
            or any(row[index] for index in range(candidate_degree + 1, degree))
            or any(row[index] % diagonal for index in range(candidate_degree + 1))
        ):
            raise ArithmeticError("mixed quotient HNF is not monic triangular")
        denominator = common_denominator // diagonal
        denominator_exponent = 0
        remaining = denominator
        while remaining % prime == 0:
            denominator_exponent += 1
            remaining //= prime
        if remaining != 1:
            raise ArithmeticError("mixed quotient denominator is not a prime power")
        local_index += denominator_exponent
        numerator = normalize_polynomial(
            tuple(row[index] // diagonal for index in range(candidate_degree + 1))
        )
        value = RationalValue(denominator_exponent)
        candidates.append(
            MaxMinCandidate(
                candidate_degree,
                (),
                numerator,
                tuple(value for _branch in tree.types),
                value,
                0,
            )
        )
    if local_index != tree.expected_index_valuation:
        raise ArithmeticError("mixed quotient HNF index differs from the OM tree")
    return MaxMinCertificate(
        "gmn-mixed-radix-quotient-hnf",
        tuple(branch.branch_id for branch in tree.types),
        tuple(candidates),
        (),
        len(elements),
        True,
        (),
    )


def _higher_terminal_quotient_selection(
    tree: OMTypeTree,
) -> MaxMinCertificate | None:
    """Select GMN terminal-side quotients for one branched binary type.

    This is the bounded quotient-basis construction of GMN Section 5.5.  It
    applies when a linear initial type has both terminal first-order branches
    and at least two terminal second-order sides sharing one degree-raising
    representative.  The theorem's certified valuation bound is attached to
    every candidate, the maximal candidate of each triangular degree is
    selected deterministically, and the resulting lattice is then checked
    independently for containment, multiplication closure, and exact index.
    """
    if (
        len(tree.initial_factors) != 1
        or polynomial_degree(tree.initial_factors[0].polynomial) != 1
    ):
        return None
    higher = tuple(branch for branch in tree.types if len(branch.levels) == 2)
    direct = tuple(branch for branch in tree.types if len(branch.levels) == 1)
    if len(higher) < 2 or not direct:
        return None
    higher_key = higher[0].levels[-1].key_polynomial
    prior_levels = higher[0].levels[:-1]
    if any(
        branch.levels[-1].key_polynomial != higher_key
        or tuple(
            (level.key_polynomial, level.slope, level.residual_factor)
            for level in branch.levels[:-1]
        )
        != tuple(
            (level.key_polynomial, level.slope, level.residual_factor)
            for level in prior_levels
        )
        for branch in higher
    ):
        return None
    first_key = prior_levels[-1].key_polynomial
    if polynomial_degree(first_key) != 1:
        return None
    sides = higher_newton_polygon(
        tree.polynomial,
        tree.prime,
        higher_key,
        prior_levels,
    )
    if len(sides) != len(higher):
        return None
    higher_slopes = tuple(branch.levels[-1].slope for branch in higher)
    if tuple(side.slope for side in sides) != higher_slopes:
        return None
    degree = polynomial_degree(tree.polynomial)
    first_quotients = phi_quotients(tree.polynomial, first_key)
    higher_quotients = phi_quotients(tree.polynomial, higher_key)
    pools: list[list[tuple[Polynomial, RationalValue]]] = [
        [] for _index in range(degree)
    ]
    first_sides = newton_polygon(tree.polynomial, tree.prime, first_key)
    if not first_sides:
        return None
    first_key_value = maclane_integer_valuation(first_key, tree.prime, ())
    if first_key_value is None:
        return None
    direct_degree = sum(branch.branch_degree for branch in direct)
    for candidate_degree in range(direct_degree):
        divisions = degree - candidate_degree
        quotient_index = divisions - 1
        if quotient_index < 0 or quotient_index >= len(first_quotients):
            return None
        containing = tuple(
            side
            for side in first_sides
            if side.left.abscissa <= divisions <= side.right.abscissa
        )
        if len(containing) != 1:
            return None
        ordinate = containing[0].ordinate_at(divisions)
        bound = ordinate - divisions * first_key_value
        pools[candidate_degree].append((first_quotients[quotient_index], bound))
    base_degree = polynomial_degree(higher_key)
    base_numerators = tuple(
        polynomial_power(first_key, exponent) for exponent in range(base_degree)
    )
    previous_value = maclane_integer_valuation(
        higher_key,
        tree.prime,
        prior_levels,
    )
    if previous_value is None:
        return None
    previous_ramification = 1
    for level in prior_levels:
        if not level.optimized_away:
            previous_ramification *= level.ramification_index
    for side in sides:
        for quotient_number in range(
            side.left.abscissa + 1,
            side.right.abscissa + 1,
        ):
            quotient_index = quotient_number - 1
            if quotient_index < 0 or quotient_index >= len(higher_quotients):
                return None
            quotient = higher_quotients[quotient_index]
            for base in base_numerators:
                candidate = polynomial_multiply(quotient, base)
                candidate_degree = polynomial_degree(candidate)
                if candidate_degree < 0 or candidate_degree >= degree:
                    return None
                base_value = maclane_valuation(base, tree.prime, prior_levels)
                if base_value is None:
                    return None
                ordinate = side.ordinate_at(quotient_number)
                quotient_bound = (
                    ordinate - quotient_number * previous_value
                ) / previous_ramification
                pools[candidate_degree].append((candidate, quotient_bound + base_value))
    candidates: list[MaxMinCandidate] = []
    comparisons = 0
    for candidate_degree, pool in enumerate(pools):
        unique_values: list[tuple[Polynomial, RationalValue]] = []
        for item in pool:
            if item not in unique_values:
                unique_values.append(item)
        unique = tuple(unique_values)
        if not unique:
            return None
        best: MaxMinCandidate | None = None
        for source_index, (numerator, certified_bound) in enumerate(unique):
            if polynomial_degree(numerator) != candidate_degree:
                return None
            values = [certified_bound for _branch in tree.types]
            minimum = certified_bound
            selected_branch = 0
            candidate = MaxMinCandidate(
                candidate_degree,
                (source_index,),
                numerator,
                tuple(values),
                minimum,
                selected_branch,
            )
            comparisons += 1
            if (
                best is None
                or best.minimum < candidate.minimum
                or (
                    best.minimum == candidate.minimum
                    and candidate.numerator < best.numerator
                )
            ):
                best = candidate
        if best is None:
            return None
        candidates.append(best)
    return MaxMinCertificate(
        "gmn-terminal-quotients",
        tuple(branch.branch_id for branch in tree.types),
        tuple(candidates),
        (),
        comparisons,
        True,
        (),
    )


def regular_local_basis(
    polynomial: Polynomial,
    prime: int,
    *,
    local_discriminant_valuation: int,
    differential_evidence: bool = False,
) -> LocalBasisResult:
    """Return a certified triangular basis in the bounded complete domain."""
    polynomial = normalize_polynomial(polynomial)
    tree = build_om_type_tree(polynomial, prime)
    metrics = selector_metrics(
        tree,
        local_discriminant_valuation=local_discriminant_valuation,
        differential_evidence=differential_evidence,
    )
    if not tree.complete:
        message = "higher OM refinement is required: " + ", ".join(
            tree.incomplete_states()
        )
        return LocalBasisResult(
            "incomplete",
            message,
            tree,
            metrics,
            None,
            None,
            _not_applicable_result(tree, metrics, message),
        )
    if sum(branch.branch_degree for branch in tree.types) != polynomial_degree(
        polynomial
    ):
        message = "bounded quotient construction requires the complete local degree"
        return LocalBasisResult(
            "unsupported",
            message,
            tree,
            metrics,
            None,
            None,
            _not_applicable_result(tree, metrics, message),
        )
    try:
        terminal_selection = _mixed_quotient_hnf_selection(tree)
        if terminal_selection is None:
            terminal_selection = _higher_terminal_quotient_selection(tree)
        if terminal_selection is None:
            terminal_selection = _order_two_quotient_hnf_selection(tree)
        if terminal_selection is None:
            has_order_three = any(
                any(level.order == 3 for level in branch.levels)
                for branch in tree.types
            )
            tables = tuple(
                (
                    _mixed_radix_branch_table(tree, branch_index)
                    if has_order_three
                    else _bounded_branch_table(tree, branch_index)
                )
                for branch_index in range(len(tree.types))
            )
            maxmin = maxmin_select(tables)
        else:
            tables = ()
            maxmin = terminal_selection
    except (OMDomainError, ArithmeticError) as error:
        message = "bounded quotient/MaxMin construction stopped: " + str(error)
        return LocalBasisResult(
            "unsupported",
            message,
            tree,
            metrics,
            None,
            None,
            _not_applicable_result(tree, metrics, message),
        )
    basis = tuple(
        TriangularBasisElement(
            candidate.degree,
            candidate.numerator,
            candidate.minimum.floor(),
            prime ** candidate.minimum.floor(),
            candidate.minimum,
        )
        for candidate in maxmin.candidates
    )
    local_index = sum(element.denominator_exponent for element in basis)
    common_exponent = max(
        (element.denominator_exponent for element in basis), default=0
    )
    common_denominator = prime**common_exponent
    common_rows = []
    degree = polynomial_degree(polynomial)
    for element in basis:
        scale = common_denominator // element.denominator
        row = [0] * degree
        for index, coefficient in enumerate(element.numerator):
            row[index] = coefficient * scale
        common_rows.append(tuple(row))
    validation = validate_triangular_basis(
        polynomial,
        prime,
        tree,
        basis,
        tree.expected_index_valuation,
    )
    certificate = TriangularBasisCertificate(
        polynomial,
        prime,
        tree,
        tables,
        maxmin,
        basis,
        local_index,
        tree.expected_index_valuation,
        common_denominator,
        tuple(common_rows),
        (
            "certified-higher-terminal-quotients"
            if maxmin.selection_kind == "gmn-terminal-quotients"
            else "certified-triangular-p-integral"
        ),
        validation,
    )
    if not validation.valid:
        message = "independent basis validation failed: " + "; ".join(
            validation.failures
        )
        local_result = LocalOrderResult(
            "certification-error",
            "om-maxmin",
            DiscriminantComponent(
                prime,
                "proven-prime",
                evidence={"proof": "deterministic trial division"},
            ),
            evidence={
                "certificate_id": tree.certificate_id,
                "expected_index_valuation": tree.expected_index_valuation,
                "computed_index_valuation": local_index,
                "failures": list(validation.failures),
                "selector": _selector_evidence(metrics),
            },
            trace=_type_tree_trace(tree),
            message=message,
        )
        return LocalBasisResult(
            "rejected",
            message,
            tree,
            metrics,
            certificate,
            None,
            local_result,
        )
    if not maxmin.maximality_checked:
        message = (
            "independent lattice checks passed, but exhaustive MaxMin evidence "
            "is incomplete: " + "; ".join(maxmin.maximality_failures)
        )
        return LocalBasisResult(
            "incomplete",
            message,
            tree,
            metrics,
            certificate,
            None,
            _not_applicable_result(tree, metrics, message),
        )
    order_basis = OrderBasis(
        [list(row) for row in common_rows],
        common_denominator,
        canonical=False,
    )
    local_result = LocalOrderResult(
        "complete",
        "om-maxmin",
        DiscriminantComponent(
            prime,
            "proven-prime",
            evidence={"proof": "deterministic trial division"},
        ),
        basis=order_basis,
        index=prime**local_index,
        evidence={
            "certificate_id": tree.certificate_id,
            "basis_kind": certificate.basis_kind,
            "local_index_valuation": local_index,
            "expected_index_valuation": tree.expected_index_valuation,
            "max_enumerated_candidates": tree.max_enumerated_candidates,
            "max_representative_refinements": tree.max_representative_refinements,
            "max_type_depth": tree.max_type_depth,
            "contains_one": validation.contains_one,
            "contains_equation_order": validation.contains_equation_order,
            "multiplication_closed": validation.multiplication_closed,
            "locally_maximal": validation.locally_maximal,
            "maxmin_maximality_checked": maxmin.maximality_checked,
            "maxmin_selection_kind": maxmin.selection_kind,
            "maxmin_branch_count": len(maxmin.branch_order),
            "maxmin_comparison_count": maxmin.comparison_count,
            "selector": _selector_evidence(metrics),
        },
        trace=_type_tree_trace(tree),
        message="certified p-maximal triangular basis",
    )
    return LocalBasisResult(
        "complete",
        "certified p-maximal triangular basis",
        tree,
        metrics,
        certificate,
        order_basis,
        local_result,
    )


__all__ = [
    "BasisValidation",
    "FiniteValuation",
    "LocalBasisResult",
    "LocalNumeratorTable",
    "MaxMinCandidate",
    "MaxMinCertificate",
    "OMSelectorMetrics",
    "TriangularBasisCertificate",
    "TriangularBasisElement",
    "maxmin_select",
    "regular_local_basis",
    "selector_metrics",
    "validate_maxmin_certificate",
    "validate_triangular_basis",
]
