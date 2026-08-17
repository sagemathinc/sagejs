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

from .maximal_order_contracts import (
    DiscriminantComponent,
    LocalOrderResult,
    OrderBasis,
)
from .om_types import (
    ImmutableOMRecord,
    OMDomainError,
    OMTypeTree,
    Polynomial,
    RationalValue,
    augmented_valuation,
    build_om_type_tree,
    modular_divmod,
    normalize_polynomial,
    phi_quotients,
    polynomial_degree,
    polynomial_divmod_monic,
    polynomial_multiply,
    representative_from_level,
    validate_type_tree,
)

FiniteValuation: TypeAlias = RationalValue | None


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
    branch_count = len(tables)
    numerator: Polynomial = (1,)
    values: list[FiniteValuation] = [RationalValue(0) for _ in range(branch_count)]
    for table_index, index in enumerate(multi_index):
        table = tables[table_index]
        numerator = polynomial_multiply(numerator, table.numerators[index])
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
    return numerator, tuple(values), minimum


def _enumerate_degree_indices(
    tables: tuple[LocalNumeratorTable, ...],
    degree: int,
    *,
    max_combinations: int,
) -> tuple[tuple[int, ...], ...]:
    answer: list[tuple[int, ...]] = []
    current = [0] * len(tables)

    def visit(position: int, remaining: int) -> None:
        if len(answer) > max_combinations:
            raise OMDomainError("MaxMin exhaustive validation bound exceeded")
        if position == len(tables):
            if remaining == 0:
                answer.append(tuple(current))
            return
        maximum = min(tables[position].degree, remaining)
        for index in range(maximum + 1):
            current[position] = index
            visit(position + 1, remaining - index)

    visit(0, degree)
    if len(answer) > max_combinations:
        raise OMDomainError("MaxMin exhaustive validation bound exceeded")
    return tuple(answer)


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
        for other_index in _enumerate_degree_indices(
            tables,
            candidate.degree,
            max_combinations=max_combinations,
        ):
            _other_numerator, _other_values, other_minimum = _candidate_for_index(
                tables, other_index
            )
            if candidate.minimum < other_minimum:
                failures.append(
                    "candidate is not valuation-maximal at degree "
                    + str(candidate.degree)
                )
                break
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
    """Compute deterministic, input-derived selector evidence.

    Auto-selection is intentionally disabled unless the caller attests that a
    differential corpus has passed for the exact integrated backend.
    """
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
    auto_selectable = (
        differential_evidence
        and tree.complete
        and recommendation == "om-maxmin-candidate"
    )
    if recommendation == "om-maxmin-candidate" and not differential_evidence:
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
    if triangular:
        for left in basis:
            for right in basis:
                product = polynomial_multiply(left.numerator, right.numerator)
                _quotient, remainder = polynomial_divmod_monic(product, polynomial)
                if not _basis_coordinates_are_integral(
                    remainder,
                    left.denominator * right.denominator,
                    basis,
                ):
                    multiplication_closed = False
                    failures.append(
                        "basis product is nonintegral at degrees "
                        + str(left.degree)
                        + ","
                        + str(right.degree)
                    )
                    break
            if not multiplication_closed:
                break
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
    if branch.levels:
        approximant = representative_from_level(branch.levels[-1], tree.prime)
    else:
        approximant = branch.initial_factor
    if polynomial_degree(approximant) != branch.branch_degree or approximant[-1] != 1:
        raise OMDomainError(
            "the bounded branch representative does not have its certified degree"
        )
    return approximant


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
                other_level = other.levels[-1]
                value = augmented_valuation(
                    numerator,
                    tree.prime,
                    other_level.key_polynomial,
                    other_level.key_value,
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
        tables = tuple(
            _bounded_branch_table(tree, branch_index)
            for branch_index in range(len(tree.types))
        )
        maxmin = maxmin_select(tables)
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
        "certified-triangular-p-integral",
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
            "contains_one": validation.contains_one,
            "contains_equation_order": validation.contains_equation_order,
            "multiplication_closed": validation.multiplication_closed,
            "locally_maximal": validation.locally_maximal,
            "maxmin_maximality_checked": maxmin.maximality_checked,
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
