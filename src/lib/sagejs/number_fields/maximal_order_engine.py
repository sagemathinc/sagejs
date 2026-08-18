"""Certified public maximal-order orchestration for simple number fields.

This module is the only path from `NumberField.maximal_order()` to the local
algorithms.  It never completely factors the equation discriminant.  Instead
it refines pairwise-coprime components, handles unresolved square support with
the composite Buchmann--Lenstra step, and sends only independently proven
primes to prime-field algorithms.

The public cache receives a result only after the representation-neutral
certificate checker has recomputed lattice containment, multiplication
closure, the discriminant/index identity, component coverage, and local
maximality evidence.
"""

from __future__ import annotations

import time
from typing import Any

import sagejs as sage
import sagejs.number_fields.composite_field_analysis as composite_field_analysis
import sagejs.number_fields.field_analysis_resource as field_analysis_resource
import sagejs.runtime as runtime
from sagejs.native import is_compiled, kernel_integer_buffer, kernel_integer_zeros
from sagejs.number_fields.bl_composite_kernel import (
    packed_order_contains_vectors_in_place,
)
from sagejs.number_fields.buchmann_lenstra import (
    BuchmannLenstraResult,
    _packed_row_hnf,
    buchmann_lenstra_multiplier_cycle,
    check_buchmann_lenstra_general_result,
    check_buchmann_lenstra_result,
)
from sagejs.number_fields.composite_local_merge import (
    certified_composite_overorder_from_equation,
    merge_certified_coprime_composite_order,
)
from sagejs.number_fields.discriminant_components import (
    certify_decomposition_component,
    check_decomposition_certificate,
    check_prime_proof_state,
    decompose_discriminant,
    primality_status,
    prime_proof_budget,
    prove_prime_resumable,
    split_decomposition_component,
)
from sagejs.number_fields.local_parallel import (
    JobPayload,
    LocalCertificationError,
    LocalWorkerError,
    local_job_component,
    local_job_key,
    local_result_contract,
    make_local_job,
    make_local_result,
    make_schedule,
    run_local_jobs,
)
from sagejs.number_fields.local_parallel_worker import (
    public_worker_decision,
    run_public_local_jobs,
)
from sagejs.number_fields.maximal_order_certification import (
    _scaled_integral_inverse,
    certify_global_order,
    check_discriminant_coprime_component_witness,
    make_composite_local_maximality_witness,
    make_local_maximality_witness,
)
from sagejs.number_fields.maximal_order_contracts import (
    DiscriminantComponent,
    MaximalOrderTrace,
    OrderBasis,
    SelectionDecision,
)
from sagejs.number_fields.order_resource import native_order_from_polynomial

_nf_module = __import__("sagejs._baselib.number_fields", fromlist=["number_fields"])
NumberFieldOrder = _nf_module.NumberFieldOrder
_nf_lcm = _nf_module._nf_lcm
_untyped = _nf_module._untyped

_MAX_WORD_PRIME = 0xFFFFFFFFFFFFFFFF
_FIELD_ANALYSIS_TRIAL_BOUND = 1000
_FIELD_ANALYSIS_AUTO_MEMORY_BUDGET = 32 * 1024 * 1024
_FIELD_ANALYSIS_AUTO_WORK_BUDGET = 4_000_000


def _maximal_order_module() -> Any:
    return __import__(
        "sagejs.number_fields.maximal_order",
        fromlist=["maximal_order"],
    )


def _exact_integer(value: Any) -> int:
    """Return an exact host integer without passing through a JS number."""
    return runtime.integer_bigint(value)


def _integral_polynomial_data(field: Any) -> tuple[list[int], int]:
    # Ensure the field-owned sealed `ZZ` polynomial resource exists, but avoid
    # projecting its coefficients back through a Python object list.  The
    # immutable defining coefficients and cached scale determine exactly the
    # same transformed polynomial.
    polynomial = field._integral_equation_polynomial_cache
    if polynomial is None:
        polynomial = _maximal_order_module().integral_equation_polynomial(field)
    degree = field.degree()
    scale = _exact_integer(field._integral_equation_scale_cache)
    coefficients = []
    for index, coefficient in enumerate(field._defining_coefficients):
        numerator = _exact_integer(coefficient._numerator) * scale ** (degree - index)
        denominator = _exact_integer(coefficient._denominator)
        if numerator % denominator != 0:
            raise ArithmeticError("failed to reconstruct the integral polynomial")
        coefficients.append(numerator // denominator)
    if len(coefficients) != degree + 1 or coefficients[-1] != 1:
        raise ArithmeticError("the integral equation polynomial is not monic")
    return coefficients, scale


def _order_from_basis(
    field: Any,
    basis: OrderBasis,
    scale: int,
    discriminant: int,
) -> Any:
    """Materialize a basis in powers of `scale*a` in the public generator."""
    rows = []
    for numerator_row in basis.numerator:
        row = []
        power = 1
        for numerator in numerator_row:
            row.append(_untyped(sage.QQ)(numerator * power, basis.denominator))
            power *= scale
        rows.append(row)
    order = NumberFieldOrder(field, rows, False, False)
    order._discriminant_cache = runtime.normalize_integer(discriminant)
    return order


def _authenticated_order_from_basis(
    field: Any,
    basis: Any,
    scale: int,
    discriminant: int,
) -> Any:
    """Install rows already authenticated in packed canonical storage.

    The public order owns an immutable snapshot and lazily projects rational
    rows on first use.  This helper is private because bypassing another HNF is
    justified only after an independent packed proof has authenticated the
    exact numerator, denominator, and generator scale.
    """
    if isinstance(basis, OrderBasis):
        basis_numerator = basis.numerator
        basis_denominator = basis.denominator
    else:
        basis_numerator, basis_denominator = basis
    flat_numerator = tuple(value for row in basis_numerator for value in row)
    order = NumberFieldOrder(
        field,
        [],
        False,
        False,
        (flat_numerator, basis_denominator, scale),
    )
    order._discriminant_cache = runtime.normalize_integer(discriminant)
    return order


def _basis_from_order(order: Any, scale: int) -> OrderBasis:
    """Describe a public order in the integral equation generator basis."""
    projection = order._authenticated_basis_projection
    if projection is not None and int(projection[2]) == int(scale):
        flat = projection[0]
        degree = order.degree()
        return OrderBasis(
            [
                [int(flat[row * degree + column]) for column in range(degree)]
                for row in range(degree)
            ],
            int(projection[1]),
            canonical=True,
        )
    if order._basis_rows == order.number_field().equation_order()._basis_rows:
        return _identity_basis(order.degree())
    rational_rows = []
    common_denominator = 1
    for source_row in order._basis_rows:
        row = []
        power = 1
        for value in source_row:
            coordinate = sage.QQ(value) / power
            row.append(coordinate)
            common_denominator = _exact_integer(
                _nf_lcm(common_denominator, coordinate._denominator)
            )
            power *= scale
        rational_rows.append(row)
    numerator = []
    for row in rational_rows:
        numerator.append(
            [
                _exact_integer(value._numerator)
                * (common_denominator // _exact_integer(value._denominator))
                for value in row
            ]
        )
    return OrderBasis(numerator, common_denominator, canonical=False)


def _integer_square_root(value: int) -> int:
    number = int(value)
    if number < 0:
        raise ValueError("an integer square root needs a nonnegative value")
    if number < 2:
        return number
    current = number
    following = (current + 1) // 2
    while following < current:
        current = following
        following = (current + number // current) // 2
    return current


def _index_from_discriminants(equation: int, order: int) -> int:
    if order == 0 or equation % order != 0:
        raise ArithmeticError(
            "order discriminant does not divide equation discriminant"
        )
    square = equation // order
    if square < 1:
        raise ArithmeticError(
            "order and equation discriminants have incompatible signs"
        )
    index = _integer_square_root(square)
    if index * index != square:
        raise ArithmeticError("order discriminant quotient is not an index square")
    return index


def _valuation(value: int, prime: int) -> int:
    remaining = abs(int(value))
    answer = 0
    while remaining and remaining % prime == 0:
        remaining //= prime
        answer += 1
    return answer


def _gcd(left: int, right: int) -> int:
    first = abs(int(left))
    second = abs(int(right))
    while second:
        first, second = second, first % second
    return first


def _identity_basis(degree: int) -> OrderBasis:
    return OrderBasis(
        [
            [1 if row == column else 0 for column in range(degree)]
            for row in range(degree)
        ],
        1,
    )


def _same_order(left: Any, right: Any) -> bool:
    return left._basis_rows == right._basis_rows


def _merge_orders(field: Any, left: Any, right: Any) -> Any:
    if left._basis_rows == field.equation_order()._basis_rows:
        return right
    if right._basis_rows == field.equation_order()._basis_rows:
        return left
    return NumberFieldOrder(
        field,
        list(left._basis_rows) + list(right._basis_rows),
        False,
        False,
    )


def _merge_coprime_order_bases(
    field: Any,
    left: OrderBasis,
    right: OrderBasis,
    scale: int,
    equation_discriminant: int,
) -> tuple[Any, OrderBasis]:
    """Merge exact coprime local bases through one packed integer HNF."""
    if _gcd(left.denominator, right.denominator) != 1:
        raise ValueError("a coprime local merge requires coprime denominators")
    denominator = int(_nf_lcm(left.denominator, right.denominator))
    generators = [
        [value * (denominator // left.denominator) for value in row]
        for row in left.numerator
    ] + [
        [value * (denominator // right.denominator) for value in row]
        for row in right.numerator
    ]
    merged = OrderBasis(_packed_row_hnf(generators), denominator, canonical=True)
    determinant = abs(merged.determinant_numerator)
    denominator_power = merged.denominator**merged.degree
    if determinant == 0 or denominator_power % determinant != 0:
        raise ArithmeticError("a packed local merge has nonintegral index")
    index = denominator_power // determinant
    if equation_discriminant % (index * index) != 0:
        raise ArithmeticError("a packed local merge has incompatible discriminant")
    order = _authenticated_order_from_basis(
        field,
        merged,
        scale,
        equation_discriminant // (index * index),
    )
    return order, merged


def _cache_discriminant_from_basis(
    order: Any,
    basis: OrderBasis,
    equation_discriminant: int,
) -> int:
    """Cache the discriminant forced by an exact equation-order index."""
    determinant = abs(basis.determinant_numerator)
    denominator_power = basis.denominator**basis.degree
    if determinant == 0 or denominator_power % determinant != 0:
        raise ArithmeticError("an overorder basis does not have an integral index")
    index = denominator_power // determinant
    square = index * index
    if equation_discriminant % square != 0:
        raise ArithmeticError("an overorder index square does not divide discriminant")
    discriminant = equation_discriminant // square
    order._discriminant_cache = runtime.normalize_integer(discriminant)
    return discriminant


def _simple_bl_complete_uses_global_theorem(
    result: BuchmannLenstraResult,
    starting_basis: OrderBasis,
    identity_basis: OrderBasis,
) -> bool:
    """Test the exact BL shape subsumed by global closure and coprimality."""
    return (
        starting_basis.canonical_key() == identity_basis.canonical_key()
        and result.state == "complete"
        and result.basis is not None
        and result.discriminant is not None
        and result.evidence.get("stage") == "composite-dedekind"
        and result.evidence.get("certificate")
        == "component-coprime-to-order-discriminant"
        and result.evidence.get("locally_maximal") is True
    )


# These scale factors are intentionally conservative calibration constants,
# not mathematical cutoffs.  They convert the stable operation-count models
# below into scheduling microseconds.  The selector benchmark records both
# the raw counts and measured wall times so a future tuning change is an
# inspectable data change rather than a change in mathematical behavior.
_SELECTOR_SCHEMA = "sagejs.number-fields/maximal-order-selection-v1"
_SELECTOR_BENCHMARK = "bench/number-field-maximal-order-selector.cjs:v1"
_LOCAL_SETUP_MICROS = 100_000
_ROUND2_MICROS_PER_UNIT = 500
_POLYGON_MICROS_PER_UNIT = 500
_ROUND4_MICROS_PER_UNIT = 500
_OM_MICROS_PER_UNIT = 500
_PUBLIC_CORPUS_EVIDENCE = {
    "successful_median_micros": 376_000,
    "successful_p90_micros": 1_583_000,
    "stage_total_micros": {
        "certification": 77_840_000,
        "decomposition": 27_820_000,
        "native_local": 15_440_000,
        "composite": 6_440_000,
    },
    "certification_dominates": True,
    "end_to_end_parallel_crossover_measured": True,
    "parallel_scope": "after-native-fallback-only",
    "parallel_vector001_fresh_samples": 3,
    "parallel_vector001_median_micros": {
        "sequential": 55_214_067,
        "parallel": 36_545_808,
    },
    "parallel_vector001_median_peak_rss_bytes": {
        "sequential": 596_627_456,
        "parallel": 1_427_484_672,
    },
}


def _coefficient_bits(coefficients: list[int]) -> int:
    return max((abs(int(value)).bit_length() for value in coefficients), default=0)


def _default_field_analysis_applicability(
    coefficients: list[int],
) -> dict[str, Any]:
    """Bound automatic fused analysis from immutable input dimensions.

    The fused resource owns several cubic exact and word tensors before it can
    expose useful local information.  This conservative estimate mirrors the
    native Round-2 worker accounting and keeps high-degree inputs in the local
    portfolio whose independently measured memory/cost bounds are tighter.
    """
    degree = max(0, len(coefficients) - 1)
    coefficient_bits = _coefficient_bits(coefficients)
    coefficient_limbs = max(1, (coefficient_bits + 63) // 64)
    square = degree * degree
    cube = square * degree
    estimated_bytes = (
        128 * cube + 512 * square + (degree + 1) * coefficient_limbs * 8 + 1024 * 1024
    )
    estimated_work = cube * coefficient_limbs
    selected = bool(
        degree > 0
        and estimated_bytes <= _FIELD_ANALYSIS_AUTO_MEMORY_BUDGET
        and estimated_work <= _FIELD_ANALYSIS_AUTO_WORK_BUDGET
    )
    return {
        "selected": selected,
        "degree": degree,
        "coefficient_bits": coefficient_bits,
        "coefficient_limbs": coefficient_limbs,
        "estimated_bytes": estimated_bytes,
        "estimated_work": estimated_work,
        "memory_budget_bytes": _FIELD_ANALYSIS_AUTO_MEMORY_BUDGET,
        "work_budget": _FIELD_ANALYSIS_AUTO_WORK_BUDGET,
        "reason": (
            "bounded-fused-analysis"
            if selected
            else "local-portfolio-has-lower-bounded-cost"
        ),
    }


def _expected_basis_bytes(
    degree: int, coefficient_bits: int, prime: int, local_valuation: int
) -> int:
    entry_bits = max(8, coefficient_bits + local_valuation * prime.bit_length())
    return degree * (degree + 1) // 2 * ((entry_bits + 7) // 8 + 8)


def _local_selection_decision(
    coefficients: list[int],
    equation_discriminant: int,
    prime: int,
    *,
    forced_algorithm: str | None = None,
) -> tuple[SelectionDecision, tuple[int, ...]]:
    """Select one local solver from deterministic input-derived metrics.

    Factorization here is over the finite field only; it does not factor the
    integer discriminant.  The current portfolio keeps auto dispatch quite
    conservative because the native global path wins every measured public
    case.  The richer choices therefore matter on native fallback and remain
    forceable for differential testing.
    """
    # The native boundary accepts only word-sized local characteristics.  A
    # larger certified prime therefore has exactly one available implementation:
    # the arbitrary-integer polygon path in `_arbitrary_prime_local_order`.
    # Factoring `f mod p` here cannot affect that choice and the exact polygon
    # constructor will compute the factorization it needs under its own
    # certificate.  In particular, this capability branch must not turn a
    # selector estimate into a second, potentially dominant local computation.
    arbitrary_prime = prime > _MAX_WORD_PRIME
    if arbitrary_prime:
        factors: list[dict[str, Any]] = []
    else:
        polygon_module = __import__(
            "sagejs.number_fields.local_polygons",
            fromlist=["local_polygons"],
        )
        factors = polygon_module.factor_mod_prime(coefficients, prime)
    factor_degrees = [int(record["degree"]) for record in factors]
    factor_multiplicities = [int(record["multiplicity"]) for record in factors]
    degree = len(coefficients) - 1
    local_valuation = _valuation(equation_discriminant, prime)
    height = _coefficient_bits(coefficients)
    factor_count = len(factors)
    repeated_degree = sum(
        factor_degree * max(0, multiplicity - 1)
        for factor_degree, multiplicity in zip(
            factor_degrees, factor_multiplicities, strict=True
        )
    )
    output_bytes = _expected_basis_bytes(degree, height, prime, local_valuation)
    round2_units = degree**3 * max(1, local_valuation // 2) * max(1, height)
    polygon_units = (
        degree * degree * (factor_count + repeated_degree + 1) * max(1, min(height, 64))
    )
    round4_units = degree * degree * (local_valuation + 1) * max(
        1, min(height, 128)
    ) + sum(value * value for value in factor_degrees)
    om_units = degree * degree * (degree + local_valuation + 1) * (factor_count + 1)
    round4_module = __import__(
        "sagejs.number_fields.round4",
        fromlist=["round4"],
    )
    round4_precision = round4_module.round4_required_precision(local_valuation)
    round4_selector = round4_module.round4_selector_metrics(
        coefficients,
        local_valuation,
        factor_degrees,
        factor_multiplicities,
        round4_precision,
    )
    om_module = __import__(
        "sagejs.number_fields.om_auto_selector",
        fromlist=["om_auto_selector"],
    )
    om_prefilter = (
        None
        if arbitrary_prime
        else om_module.om_auto_prefilter(
            tuple(coefficients),
            prime,
            local_discriminant_valuation=local_valuation,
            factor_degrees=tuple(factor_degrees),
            factor_multiplicities=tuple(factor_multiplicities),
        )
    )
    predicted_micros = {
        "round2": _LOCAL_SETUP_MICROS + round2_units * _ROUND2_MICROS_PER_UNIT,
        "polygon": _LOCAL_SETUP_MICROS + polygon_units * _POLYGON_MICROS_PER_UNIT,
        "round4": _LOCAL_SETUP_MICROS + round4_units * _ROUND4_MICROS_PER_UNIT,
        "om-maxmin": _LOCAL_SETUP_MICROS + om_units * _OM_MICROS_PER_UNIT,
    }
    metrics: dict[str, Any] = {
        "degree": degree,
        "coefficient_bits": height,
        "prime": prime,
        "prime_bits": prime.bit_length(),
        "local_discriminant_valuation": local_valuation,
        "factor_degrees": factor_degrees,
        "factor_multiplicities": factor_multiplicities,
        "factor_count": factor_count,
        "repeated_degree": repeated_degree,
        "finite_field_factorization": {
            "performed": not arbitrary_prime,
            "reason": (
                "required for word-prime algorithm selection"
                if not arbitrary_prime
                else "arbitrary-prime capability forces the exact polygon path"
            ),
        },
        "expected_output_entries": degree * (degree + 1) // 2,
        "expected_output_bytes": output_bytes,
        "predicted_micros": predicted_micros,
        "round4_selector": round4_selector.as_dict(),
        "om_prefilter": (None if om_prefilter is None else om_prefilter.as_dict()),
        "auto_eligibility": {
            "round2": {"eligible": True, "reason": "certified dynamic baseline"},
            "polygon": {
                "eligible": True,
                "reason": "certified on regular first-order polygon evidence",
            },
            "round4": {
                "eligible": True,
                "reason": "certified within the Round-4 selector domain",
            },
            "om-maxmin": {
                "eligible": bool(om_prefilter is not None and om_prefilter.eligible),
                "reason": (
                    "terminal complete OM evidence is checked immediately before "
                    "the native batch"
                    if om_prefilter is not None and om_prefilter.eligible
                    else om_prefilter.reason
                    if om_prefilter is not None
                    else "the current OM host adapter requires a word prime"
                ),
            },
        },
        "benchmark": _SELECTOR_BENCHMARK,
    }
    if arbitrary_prime:
        metrics["auto_eligibility"] = {
            "round2": {
                "eligible": False,
                "reason": "the native Round-2 boundary requires a word prime",
            },
            "polygon": {
                "eligible": True,
                "reason": "exact arbitrary-integer prime-field arithmetic",
            },
            "round4": {
                "eligible": False,
                "reason": "the modified Round-4 host adapter requires a word prime",
            },
            "om-maxmin": {
                "eligible": False,
                "reason": "the current OM/MaxMin host adapter requires a word prime",
            },
        }
        return (
            SelectionDecision(
                "polygon",
                (
                    "the certified prime exceeds the native word boundary; "
                    "the exact arbitrary-integer polygon path is mandatory"
                ),
                metrics,
                forced=forced_algorithm is not None,
            ),
            tuple(int(value) for value in coefficients),
        )
    if forced_algorithm is not None:
        return (
            SelectionDecision(
                forced_algorithm,
                "the caller forced this local algorithm for differential testing",
                metrics,
                forced=True,
            ),
            tuple(int(value) for value in coefficients),
        )
    if degree <= 4 and local_valuation <= 8:
        selected = "round2"
        reason = "tiny degree keeps Round-2 setup and certification cheapest"
    elif (
        factor_count > 1
        and repeated_degree <= degree // 2
        and local_valuation <= 8
        and height < 128
        and polygon_units < round2_units
    ):
        selected = "polygon"
        reason = "a regular-looking split factor pattern favors Newton polygons"
    elif round4_selector.recommendation == "round4":
        selected = "round4"
        reason = round4_selector.reason
    else:
        selected = "round2"
        reason = (
            "the measured local fallback favors Round 2 after any complete "
            "pre-native OM opportunity has been exhausted"
        )
    return (
        SelectionDecision(selected, reason, metrics),
        tuple(int(value) for value in coefficients),
    )


def _local_selection_plan(
    coefficients: list[int],
    equation_discriminant: int,
    primes: list[int],
    algorithm: str,
    *,
    worker_capability: bool,
    cpu_count: int | None = None,
) -> tuple[list[JobPayload], dict[tuple[Any, ...], dict[str, Any]], tuple[Any, ...]]:
    jobs: list[JobPayload] = []
    decisions: dict[tuple[Any, ...], dict[str, Any]] = {}
    forced = (
        None
        if algorithm == "auto"
        else "round2"
        if algorithm == "native"
        else algorithm
    )
    for ordinal, prime in enumerate(sorted(primes)):
        decision, factor = _local_selection_decision(
            coefficients,
            equation_discriminant,
            prime,
            forced_algorithm=forced,
        )
        metrics = decision.metrics
        predicted = metrics["predicted_micros"]
        job = make_local_job(
            coefficients,
            prime,
            ordinal,
            factor,
            metrics["local_discriminant_valuation"],
            predicted[decision.algorithm],
            metrics["expected_output_bytes"],
            algorithm=decision.algorithm,
        )
        jobs.append(job)
        decisions[local_job_key(job)] = decision.to_dict()
    schedule = make_schedule(
        jobs,
        cpu_count=cpu_count,
        worker_capability=worker_capability,
    )
    return jobs, decisions, schedule


def inspect_maximal_order_selection(
    polynomial_coefficients: list[int],
    equation_discriminant: int,
    primes: list[int],
    *,
    algorithm: str = "auto",
    worker_capability: bool = False,
    cpu_count: int | None = None,
    memory_budget_bytes: int | None = None,
) -> dict[str, Any]:
    """Return the deterministic public selector and scheduler evidence.

    `worker_capability=False` inspects the native-first public boundary.
    Passing `True` inspects the measured fallback crossover as if the native
    batch had been unavailable; it never changes mathematical decisions.
    Supply `memory_budget_bytes` when the scheduler evidence itself must be
    reproducible instead of reflecting live platform/container availability.
    """
    coefficients = [int(value) for value in polynomial_coefficients]
    if len(coefficients) < 2 or coefficients[-1] != 1:
        raise ValueError("a maximal-order selector requires a monic polynomial")
    if algorithm not in (
        "auto",
        "round2",
        "native",
        "polygon",
        "round4",
        "om-maxmin",
    ):
        raise ValueError("unknown maximal-order algorithm")
    local_primes = sorted({int(value) for value in primes})
    jobs, decisions, _schedule = _local_selection_plan(
        coefficients,
        int(equation_discriminant),
        local_primes,
        algorithm,
        worker_capability=worker_capability,
        cpu_count=cpu_count,
    )
    parallel_decision = public_worker_decision(
        jobs,
        after_native_fallback=bool(worker_capability),
        cpu_count=cpu_count,
        memory_budget_bytes=memory_budget_bytes,
        worker_capability=worker_capability,
    )
    schedule = make_schedule(
        jobs,
        cpu_count=cpu_count,
        worker_capability=bool(parallel_decision["selected"]),
    )
    if algorithm == "auto" and local_primes:
        primary = "native"
        primary_reason = (
            "the native global Round-2 resource wins the measured public corpus"
        )
    elif algorithm == "native":
        primary = "native"
        primary_reason = "the caller forced the native global algorithm"
    elif local_primes:
        primary = "local"
        primary_reason = "the caller selected independently certified local work"
    else:
        primary = "none"
        primary_reason = "no proven prime has square support in the discriminant"
    ordered_decisions = [decisions[local_job_key(job)] for job in jobs]
    return {
        "schema": _SELECTOR_SCHEMA,
        "primary": primary,
        "primary_reason": primary_reason,
        "forced": algorithm != "auto",
        "local_decisions": ordered_decisions,
        "schedule": schedule,
        "parallel_arithmetic_capability": bool(worker_capability),
        "parallel_gate": parallel_decision,
        "parallel_corpus_evidence": dict(_PUBLIC_CORPUS_EVIDENCE),
        "sequential_canonical": True,
        "benchmark": _SELECTOR_BENCHMARK,
    }


def _forced_local_order(
    field: Any,
    coefficients: list[int],
    scale: int,
    equation_order: Any,
    equation_discriminant: int,
    prime: int,
    algorithm: str,
) -> tuple[Any, str, dict[str, Any]]:
    """Run one inspectable local algorithm with a certified Round-2 fallback."""
    local_valuation = _valuation(equation_discriminant, prime)

    def round2_after_error(
        selection: str, error: Exception
    ) -> tuple[Any, str, dict[str, Any]]:
        return (
            _maximal_order_module().p_maximal_overorder_dynamic(equation_order, prime),
            "round2",
            {
                "selection": selection,
                "fallback": True,
                "reason": str(error),
                "exception_type": type(error).__name__,
            },
        )

    if algorithm == "round2":
        return (
            _maximal_order_module().p_maximal_overorder_dynamic(equation_order, prime),
            "round2",
            {"selection": "forced"},
        )
    if algorithm == "round4":
        module = __import__("sagejs.number_fields.round4", fromlist=["round4"])
        try:
            result = module.modified_round4_local_order(
                equation_order,
                prime,
                "dynamic-round2",
                False,
            )
        except Exception as error:
            return round2_after_error("forced-round4", error)
        return (
            result.order,
            result.certificate.algorithm,
            {
                "selection": "forced",
                "fallback_reason": result.certificate.fallback_reason,
                "local_index_valuation": result.certificate.local_index_valuation,
            },
        )
    component = DiscriminantComponent(
        prime,
        "proven-prime",
        evidence={"source": "certified public decomposition"},
    )
    if algorithm == "polygon":
        module = __import__(
            "sagejs.number_fields.local_polygons",
            fromlist=["local_polygons"],
        )
        try:
            result = module.analyze_local_component(
                coefficients,
                component,
                local_valuation,
                equation_discriminant,
            )
        except Exception as error:
            return round2_after_error("forced-polygon", error)
        if result.state == "complete" and result.basis is not None:
            discriminant = (
                equation_discriminant // (result.index * result.index)
                if result.discriminant is None
                else int(result.discriminant)
            )
            return (
                _order_from_basis(field, result.basis, scale, discriminant),
                "polygon",
                {"selection": "forced", "fallback": False},
            )
        return (
            _maximal_order_module().p_maximal_overorder_dynamic(equation_order, prime),
            "round2",
            {
                "selection": "forced-polygon",
                "fallback": True,
                "reason": result.message,
            },
        )
    if algorithm == "om-maxmin":
        module = __import__(
            "sagejs.number_fields.om_maxmin",
            fromlist=["om_maxmin"],
        )
        try:
            result = module.regular_local_basis(
                tuple(coefficients),
                prime,
                local_discriminant_valuation=local_valuation,
                differential_evidence=True,
            )
        except Exception as error:
            return round2_after_error("forced-om-maxmin", error)
        if result.status == "complete" and result.order_basis is not None:
            discriminant = equation_discriminant // (
                result.local_result.index * result.local_result.index
            )
            return (
                _order_from_basis(field, result.order_basis, scale, discriminant),
                "om-maxmin",
                {
                    "selection": "forced",
                    "certificate_id": result.type_tree.certificate_id,
                },
            )
        return (
            _maximal_order_module().p_maximal_overorder_dynamic(equation_order, prime),
            "round2",
            {
                "selection": "forced-om-maxmin",
                "fallback": True,
                "reason": result.reason,
            },
        )
    raise ValueError("unknown forced local algorithm")


def _auto_om_shape_gate(
    coefficients: list[int],
    equation_discriminant: int,
    prime: int,
) -> dict[str, Any]:
    """Return the input-derived gate shared by parent and proof workers."""
    degree = len(coefficients) - 1
    local_valuation = _valuation(equation_discriminant, prime)
    coefficient_bits = _coefficient_bits(coefficients)
    output_entries = degree * (degree + 1) // 2
    entry_bits = max(
        8,
        coefficient_bits + local_valuation * max(1, prime.bit_length()),
    )
    output_bytes = output_entries * ((entry_bits + 7) // 8 + 16)
    cheap_reason = None
    if prime < 7 or prime > _MAX_WORD_PRIME:
        cheap_reason = "the measured residual-characteristic crossover starts at p=7"
    elif coefficient_bits > 256:
        cheap_reason = "coefficient growth exceeds the measured OM crossover envelope"
    elif degree < 48 or local_valuation < 8 * degree:
        cheap_reason = (
            "degree and local valuation remain below the measured OM crossover"
        )
    elif output_bytes > 64 * 1024 * 1024:
        cheap_reason = "the predicted exact basis exceeds the local memory budget"
    if cheap_reason is not None:
        return {
            "schema": "sagejs.number-fields/om-auto-selection-v1",
            "stage": "shape-prefilter",
            "eligible": False,
            "reason": cheap_reason,
            "degree": degree,
            "prime": prime,
            "local_discriminant_valuation": local_valuation,
            "coefficient_bits": coefficient_bits,
            "estimated_output_bytes": output_bytes,
            "memory_budget_bytes": 64 * 1024 * 1024,
            "benchmark": "bench/number-field-om-auto-selector.cjs:v1",
        }
    return {
        "schema": "sagejs.number-fields/om-auto-selection-v1",
        "stage": "shape-prefilter",
        "eligible": True,
        "reason": "input lies inside the measured OM crossover envelope",
        "degree": degree,
        "prime": prime,
        "local_discriminant_valuation": local_valuation,
        "coefficient_bits": coefficient_bits,
        "estimated_output_bytes": output_bytes,
        "memory_budget_bytes": 64 * 1024 * 1024,
        "benchmark": "bench/number-field-om-auto-selector.cjs:v1",
    }


def _auto_om_local_order_with_proof(
    field: Any,
    coefficients: list[int],
    scale: int,
    equation_discriminant: int,
    prime: int,
) -> tuple[Any | None, dict[str, Any], Any | None]:
    """Attempt OM and retain its immutable authenticated selection envelope."""
    gate = _auto_om_shape_gate(coefficients, equation_discriminant, prime)
    if not gate["eligible"]:
        return None, gate, None
    local_valuation = int(gate["local_discriminant_valuation"])
    module = __import__(
        "sagejs.number_fields.om_auto_selector",
        fromlist=["om_auto_selector"],
    )
    shape = module.om_auto_shape_prefilter(
        tuple(coefficients),
        prime,
        local_discriminant_valuation=local_valuation,
    )
    if not shape.eligible:
        return None, shape.as_dict(), None
    polygon_module = __import__(
        "sagejs.number_fields.local_polygons",
        fromlist=["local_polygons"],
    )
    factors = polygon_module.factor_mod_prime(coefficients, prime)
    selection = module.select_om_local_basis(
        tuple(coefficients),
        prime,
        local_discriminant_valuation=local_valuation,
        factor_degrees=tuple(int(record["degree"]) for record in factors),
        factor_multiplicities=tuple(int(record["multiplicity"]) for record in factors),
    )
    evidence = selection.as_dict()
    if (
        not selection.selected
        or selection.result is None
        or selection.result.order_basis is None
    ):
        return None, evidence, selection
    local_index = selection.result.local_result.index
    discriminant = equation_discriminant // (local_index * local_index)
    canonical_basis = OrderBasis(
        _packed_row_hnf(selection.result.order_basis.numerator),
        selection.result.order_basis.denominator,
        canonical=True,
    )
    return (
        _authenticated_order_from_basis(
            field,
            canonical_basis,
            scale,
            discriminant,
        ),
        evidence,
        selection,
    )


def _arbitrary_prime_local_order(
    field: Any,
    coefficients: list[int],
    scale: int,
    equation_discriminant: int,
    prime: int,
) -> tuple[Any, str, dict[str, Any]]:
    """Use exact integer polynomial arithmetic beyond FLINT word matrices."""
    component = DiscriminantComponent(
        prime,
        "proven-prime",
        evidence={"source": "resumable deterministic prime proof"},
    )
    polygon_module = __import__(
        "sagejs.number_fields.local_polygons",
        fromlist=["local_polygons"],
    )
    result = polygon_module.analyze_local_component(
        coefficients,
        component,
        _valuation(equation_discriminant, prime),
        equation_discriminant,
    )
    if result.state == "complete" and result.basis is not None:
        discriminant = (
            equation_discriminant // (result.index * result.index)
            if result.discriminant is None
            else int(result.discriminant)
        )
        return (
            _order_from_basis(field, result.basis, scale, discriminant),
            "polygon",
            {
                "selection": "arbitrary-prime-exact-fallback",
                "word_prime_cap": _MAX_WORD_PRIME,
                "local_index": result.index,
                "polygon_state": result.state,
                "fallback": False,
            },
        )

    # First-order irregularity is not a mathematical failure.  Continue from
    # the equation order, whose ring property is unconditional, with the exact
    # integer p-radical/ring-of-multipliers cycle.  Starting from the polygon
    # lattice here would make an unproved partial enlargement part of the
    # trusted boundary.  The general cycle is bounded and returns typed
    # resource/split/certification states, none of which are promoted.
    starting_basis = _identity_basis(field.degree())
    fallback = buchmann_lenstra_multiplier_cycle(
        coefficients,
        component,
        starting_basis,
        equation_discriminant=equation_discriminant,
    )
    if (
        fallback.state != "complete"
        or fallback.basis is None
        or fallback.discriminant is None
    ):
        raise ArithmeticError(
            "arbitrary-prime multiplier fallback did not certify a complete local order"
        )
    if not check_buchmann_lenstra_general_result(
        coefficients,
        starting_basis,
        fallback,
        equation_discriminant=equation_discriminant,
    ):
        raise ArithmeticError("arbitrary-prime multiplier evidence failed replay")
    return (
        _order_from_basis(
            field,
            fallback.basis,
            scale,
            int(fallback.discriminant),
        ),
        "buchmann-lenstra",
        {
            "selection": "arbitrary-prime-exact-fallback",
            "word_prime_cap": _MAX_WORD_PRIME,
            "local_index": fallback.index,
            "polygon_state": result.evidence.get("status", result.state),
            "polygon_result_state": result.state,
            "polygon_message": result.message,
            "fallback": True,
            "fallback_algorithm": "p-radical-multiplier-ring",
            "fallback_certificate": fallback.evidence.get("certificate"),
            "fallback_events": fallback.evidence.get("events", []),
        },
    )


def _portfolio_basis_key(
    numerator: Any, denominator: int
) -> tuple[int, tuple[tuple[int, ...], ...]]:
    return (
        int(denominator),
        tuple(tuple(int(value) for value in row) for row in numerator),
    )


def _portfolio_basis_contains(
    container: tuple[int, tuple[tuple[int, ...], ...]],
    source: tuple[int, tuple[tuple[int, ...], ...]],
    scaled_inverse: Any = None,
) -> bool:
    """Check exact row-lattice containment with one fraction-free inverse."""
    denominator, rows = container
    source_denominator, source_rows = source
    inverse = scaled_inverse
    if inverse is None:
        inverse = _scaled_integral_inverse([list(row) for row in rows], denominator)
    if inverse is None or len(source_rows) != len(rows):
        return False
    degree = len(rows)
    for row in source_rows:
        if len(row) != degree:
            return False
        for column in range(degree):
            coordinate = sum(
                row[index] * inverse[index][column] for index in range(degree)
            )
            if coordinate % source_denominator != 0:
                return False
    return True


def _portfolio_bases_contained(
    container: tuple[int, tuple[tuple[int, ...], ...]],
    sources: list[tuple[int, tuple[tuple[int, ...], ...]]],
) -> bool:
    """Check every local basis against one final HNF with one packed inverse."""
    denominator, rows = container
    degree = len(rows)
    if degree < 1 or len(sources) < 1 or any(len(row) != degree for row in rows):
        return False
    vectors: list[int] = []
    vector_denominators: list[int] = []
    magnitude_bits = max(
        [abs(int(denominator)).bit_length()]
        + [abs(int(value)).bit_length() for row in rows for value in row]
    )
    for source_denominator, source_rows in sources:
        if (
            source_denominator < 1
            or len(source_rows) != degree
            or any(len(row) != degree for row in source_rows)
        ):
            return False
        for row in source_rows:
            vectors.extend(int(value) for value in row)
            vector_denominators.append(int(source_denominator))
            for value in row:
                magnitude_bits = max(magnitude_bits, abs(int(value)).bit_length())
        magnitude_bits = max(magnitude_bits, abs(int(source_denominator)).bit_length())
    word_capacity = max(16, (2 * magnitude_bits + 63) // 64 + 4 * degree + 8)
    try:
        return bool(
            packed_order_contains_vectors_in_place(
                kernel_integer_zeros(
                    packed_order_contains_vectors_in_place,
                    degree * degree,
                    word_capacity,
                ),
                kernel_integer_buffer(
                    packed_order_contains_vectors_in_place,
                    [int(value) for row in rows for value in row],
                ),
                kernel_integer_buffer(packed_order_contains_vectors_in_place, vectors),
                kernel_integer_buffer(
                    packed_order_contains_vectors_in_place, vector_denominators
                ),
                denominator,
                degree,
                len(vector_denominators),
            )
        )
    except OverflowError:
        inverse = _scaled_integral_inverse([list(row) for row in rows], denominator)
        return inverse is not None and all(
            _portfolio_basis_contains(container, source, inverse) for source in sources
        )


def _portfolio_remove_support(value: int, support: int) -> int:
    """Remove every prime factor shared with one unfactored exact support."""
    remainder = abs(int(value))
    modulus = abs(int(support))
    if remainder < 1 or modulus < 2:
        return remainder
    common = _gcd(remainder, modulus)
    while common != 1:
        remainder //= common
        common = _gcd(remainder, modulus)
    return remainder


def _portfolio_index_support_identity(
    components: list[tuple[str, int, int]], final_index: int
) -> bool:
    """Check an exact pairwise-coprime local-index product without factoring."""
    product = 1
    for position, (_kind, support, local_index) in enumerate(components):
        support = abs(int(support))
        local_index = abs(int(local_index))
        if (
            support < 2
            or local_index < 1
            or _portfolio_remove_support(local_index, support) != 1
        ):
            return False
        for _previous_kind, previous_support, previous_index in components[:position]:
            if (
                _gcd(support, previous_support) != 1
                or _gcd(local_index, previous_index) != 1
            ):
                return False
        product *= local_index
    return product == abs(int(final_index))


class _AuthenticatedLocalPortfolio:
    """Immutable binding of independently proved coprime local orders."""

    def __init__(
        self,
        coefficients: list[int],
        scale: int,
        equation_discriminant: int,
        expected_native_primes: list[int],
        expected_om_primes: list[int],
        expected_composite_components: list[tuple[int, int]],
        native_proof: Any,
        om_entries: list[tuple[int, Any, Any, OrderBasis, int]],
        composite_entries: list[tuple[int, Any, OrderBasis, int]],
        final_basis: OrderBasis,
        final_index: int,
        final_order_discriminant: int,
    ) -> None:
        self.coefficients = tuple(int(value) for value in coefficients)
        self.scale = int(scale)
        self.equation_discriminant = int(equation_discriminant)
        self.expected_native_primes = tuple(
            sorted(int(prime) for prime in expected_native_primes)
        )
        self.expected_om_primes = tuple(
            sorted(int(prime) for prime in expected_om_primes)
        )
        self.expected_composite_components = tuple(
            sorted(
                (int(component_value), int(support))
                for component_value, support in expected_composite_components
            )
        )
        self.native_proof = native_proof
        self.om_entries = tuple(
            (
                int(prime),
                selection,
                projection,
                basis.canonical_key(),
                int(local_order_discriminant),
            )
            for prime, selection, projection, basis, local_order_discriminant in om_entries
        )
        self.composite_entries = tuple(
            (
                int(component_value),
                projection,
                basis.canonical_key(),
                int(local_order_discriminant),
            )
            for component_value, projection, basis, local_order_discriminant in composite_entries
        )
        self.final_basis = final_basis.canonical_key()
        self.final_index = int(final_index)
        self.final_order_discriminant = int(final_order_discriminant)
        runtime.object.freeze(self)

    def _native_matches(self) -> bool:
        proof = self.native_proof
        if proof is None:
            return False
        return bool(
            tuple(sorted(int(prime) for prime in proof.certified_primes))
            == self.expected_native_primes
            and field_analysis_resource.authenticated_round2_order_proof_matches(
                proof,
                polynomial=list(self.coefficients),
                certified_primes=list(self.expected_native_primes),
                basis_numerator=[list(row) for row in proof.basis_numerator],
                basis_denominator=int(proof.basis_denominator),
                index=int(proof.index),
                equation_discriminant=self.equation_discriminant,
                order_discriminant=int(proof.order_discriminant),
            )
        )

    def _om_entry_matches(
        self,
        prime: int,
        selection: Any,
        projection: Any,
        basis_key: tuple[int, tuple[tuple[int, ...], ...]],
        local_order_discriminant: int,
    ) -> bool:
        module = __import__(
            "sagejs.number_fields.om_auto_selector",
            fromlist=["om_auto_selector"],
        )
        if type(selection) is not module.OMAutoSelection or not selection.selected:
            return False
        result = selection.result
        if result is None or result.order_basis is None or result.certificate is None:
            return False
        certificate = result.certificate
        local_index = int(result.local_result.index)
        denominator_remainder = int(basis_key[0])
        while denominator_remainder % prime == 0:
            denominator_remainder //= prime
        projection_module = __import__(
            "sagejs.number_fields.om_authenticated_projection",
            fromlist=["authenticated_om_tree_projection_matches"],
        )
        return bool(
            tuple(int(value) for value in certificate.polynomial) == self.coefficients
            and int(certificate.prime) == prime
            and result.status == "complete"
            and result.local_result.state == "complete"
            and result.type_tree.complete
            and certificate.validation.valid
            and certificate.validation.locally_maximal
            and certificate.maxmin.maximality_checked
            and projection_module.authenticated_om_tree_projection_matches(
                projection,
                tree=result.type_tree,
                polynomial=tuple(self.coefficients),
                prime=prime,
                expected_index_valuation=int(result.type_tree.expected_index_valuation),
            )
            and local_index > 0
            and local_order_discriminant * local_index * local_index
            == self.equation_discriminant
            and _valuation(local_index, prime) > 0
            and local_index == prime ** _valuation(local_index, prime)
            and _valuation(local_order_discriminant, prime)
            == _valuation(self.final_order_discriminant, prime)
            and basis_key == result.order_basis.canonical_key()
            and denominator_remainder == 1
        )

    def _composite_entry_matches(
        self,
        component_value: int,
        projection: Any,
        basis_key: tuple[int, tuple[tuple[int, ...], ...]],
        local_order_discriminant: int,
    ) -> bool:
        module = __import__(
            "sagejs.number_fields.buchmann_lenstra",
            fromlist=["authenticated_buchmann_lenstra_projection_matches"],
        )
        matcher = getattr(
            module, "authenticated_buchmann_lenstra_projection_matches", None
        )
        if matcher is None:
            return False
        try:
            support = int(projection.support)
            local_index = int(projection.index)
            return bool(
                projection.certified
                and int(projection.source_component_value) == component_value
                and int(projection.order_discriminant) == local_order_discriminant
                and local_order_discriminant * local_index * local_index
                == self.equation_discriminant
                and _portfolio_remove_support(local_index, support) == 1
                and _portfolio_remove_support(basis_key[0], support) == 1
                and matcher(
                    projection,
                    polynomial=list(self.coefficients),
                    support=support,
                    source_component_value=component_value,
                    component_state=str(projection.component_state),
                    basis_numerator=[list(row) for row in basis_key[1]],
                    basis_denominator=basis_key[0],
                    index=local_index,
                    equation_discriminant=self.equation_discriminant,
                    order_discriminant=local_order_discriminant,
                )
            )
        except (AttributeError, TypeError, ValueError):
            return False

    def verify_local_witness(
        self, witness: dict[str, Any], certificate: dict[str, Any]
    ) -> bool:
        if (
            certificate.get("defining_polynomial") != list(self.coefficients)
            or int(certificate.get("equation_discriminant", 0))
            != self.equation_discriminant
            or int(certificate.get("order_discriminant", 0))
            != self.final_order_discriminant
        ):
            return False
        witness_proof = witness.get("proof", {})
        if not isinstance(witness_proof, dict):
            return False
        if "component_value" in witness:
            component_value = abs(int(witness.get("component_value", 0)))
            for entry in self.composite_entries:
                if entry[0] != component_value:
                    continue
                projection = entry[1]
                support = int(projection.support)
                local_index = int(projection.index)
                local_discriminant = int(entry[3])
                return bool(
                    witness.get("method") == "buchmann-lenstra"
                    and witness.get("assumes_prime") is False
                    and int(witness_proof.get("support", 0)) == support
                    and int(witness_proof.get("index", 0)) == local_index
                    and int(witness_proof.get("discriminant", 0)) == local_discriminant
                    and witness_proof.get("theorem")
                    == "order-discriminant-coprime-component"
                    and self._composite_entry_matches(*entry)
                )
            return False
        prime = int(witness.get("prime", 0))
        if (
            prime < 2
            or int(witness.get("equation_valuation", -1))
            != _valuation(self.equation_discriminant, prime)
            or int(witness.get("order_valuation", -1))
            != _valuation(self.final_order_discriminant, prime)
            or int(witness.get("local_index_valuation", -1))
            != _valuation(self.final_index, prime)
        ):
            return False
        proof = self.native_proof
        if self._native_matches() and prime in proof.certified_primes:
            return bool(
                witness.get("method") == "round2"
                and witness_proof.get("check") == "authenticated-round2-fixed-point"
                and _valuation(proof.order_discriminant, prime)
                == _valuation(self.final_order_discriminant, prime)
            )
        for entry in self.om_entries:
            if entry[0] == prime:
                return bool(
                    witness.get("method") == "om-maxmin"
                    and witness_proof.get("check")
                    == "authenticated-om-maxmin-local-basis"
                    and witness_proof.get("certificate_id")
                    == str(entry[1].result.type_tree.certificate_id)
                    and self._om_entry_matches(*entry)
                )
        return False

    def matches_certificate(self, certificate: dict[str, Any]) -> bool:
        certificate_basis = _portfolio_basis_key(
            certificate.get("basis_numerator", []),
            int(certificate.get("basis_denominator", 0)),
        )
        if (
            certificate.get("defining_polynomial") != list(self.coefficients)
            or int(certificate.get("equation_discriminant", 0))
            != self.equation_discriminant
            or int(certificate.get("order_discriminant", 0))
            != self.final_order_discriminant
            or int(certificate.get("index", 0)) != self.final_index
            or certificate_basis != self.final_basis
            or self.final_order_discriminant * self.final_index * self.final_index
            != self.equation_discriminant
            or not self._native_matches()
            or tuple(sorted(entry[0] for entry in self.om_entries))
            != self.expected_om_primes
            or tuple(
                sorted(
                    (entry[0], int(entry[1].support))
                    for entry in self.composite_entries
                )
            )
            != self.expected_composite_components
        ):
            return False
        proof = self.native_proof
        native_basis = _portfolio_basis_key(
            proof.basis_numerator, proof.basis_denominator
        )
        source_bases = [native_basis]
        native_remainder = int(proof.index)
        for prime in proof.certified_primes:
            while native_remainder % prime == 0:
                native_remainder //= prime
        denominator_remainder = int(proof.basis_denominator)
        for prime in proof.certified_primes:
            while denominator_remainder % prime == 0:
                denominator_remainder //= prime
        if native_remainder != 1 or denominator_remainder != 1:
            return False
        native_support = 1
        for prime in proof.certified_primes:
            native_support *= int(prime)
        local_supports = [("native", native_support, int(proof.index))]
        covered_primes = list(proof.certified_primes)
        for entry in self.om_entries:
            prime, selection, _projection, basis_key, _local_discriminant = entry
            if prime in covered_primes or not self._om_entry_matches(*entry):
                return False
            covered_primes.append(prime)
            source_bases.append(basis_key)
            local_supports.append(
                ("om-maxmin", prime, int(selection.result.local_result.index))
            )
        for entry in self.composite_entries:
            if not self._composite_entry_matches(*entry):
                return False
            projection = entry[1]
            support = int(projection.support)
            if any(_gcd(support, previous[1]) != 1 for previous in local_supports):
                return False
            local_index = int(projection.index)
            local_supports.append(("buchmann-lenstra", support, local_index))
            source_bases.append(entry[2])
        if not _portfolio_bases_contained(self.final_basis, source_bases):
            return False
        if not _portfolio_index_support_identity(local_supports, self.final_index):
            return False
        final_denominator_remainder = self.final_basis[0]
        for _kind, support, _local_index in local_supports:
            final_denominator_remainder = _portfolio_remove_support(
                final_denominator_remainder, support
            )
        if final_denominator_remainder != 1:
            return False
        # Since C contains every locally proved order and their indices are
        # pairwise coprime with product [C:Z[theta]], its relative index over
        # each one is supported only at the other primes.  Thus every local
        # fixed point persists, and the coprime sum of the proved orders is a
        # closed order rather than merely a constructed lattice.
        for _kind, support, local_index in local_supports:
            relative_index = self.final_index // local_index
            if _gcd(relative_index, support) != 1:
                return False
        return True


class _CertificateAdapter:
    """Independent checker adapter closed over one candidate and its evidence."""

    def __init__(
        self,
        coefficients: list[int],
        scale: int,
        equation_discriminant: int,
        composite_results: dict[int, BuchmannLenstraResult],
        replay_primes: list[int],
        authenticated_analysis: Any = None,
        authenticated_composite_analysis: Any = None,
        authenticated_local_portfolio: Any = None,
    ) -> None:
        self.coefficients = list(coefficients)
        self.scale = scale
        self.equation_disc = equation_discriminant
        self.composite_results = composite_results
        self.replay_primes = list(replay_primes)
        self.authenticated_analysis = authenticated_analysis
        self.authenticated_composite_analysis = authenticated_composite_analysis
        self.authenticated_local_portfolio = authenticated_local_portfolio
        self._native_replay: Any = None
        self._native_replay_loaded = False
        self._candidate: Any = None

    def defining_polynomial(self, candidate: Any) -> list[int]:
        return list(self.coefficients)

    def basis_data(self, candidate: Any) -> tuple[list[list[int]], int]:
        analysis = self.authenticated_analysis
        if analysis is None:
            analysis = self.authenticated_composite_analysis
        if analysis is not None and candidate is self._candidate:
            return (
                [list(row) for row in analysis.basis_numerator],
                int(analysis.basis_denominator),
            )
        basis = _basis_from_order(candidate, self.scale)
        return [list(row) for row in basis.numerator], basis.denominator

    def equation_discriminant(self, candidate: Any) -> int:
        return self.equation_disc

    def order_discriminant(self, candidate: Any) -> int:
        analysis = self.authenticated_composite_analysis
        if analysis is not None and candidate is self._candidate:
            return int(analysis.order_discriminant)
        return _exact_integer(candidate.discriminant())

    def index(self, candidate: Any) -> int:
        analysis = self.authenticated_composite_analysis
        if analysis is not None and candidate is self._candidate:
            return int(analysis.index)
        return _index_from_discriminants(
            self.equation_disc,
            _exact_integer(candidate.discriminant()),
        )

    def verify_local_witness(
        self, witness: dict[str, Any], certificate: dict[str, Any]
    ) -> bool:
        candidate = certificate.get("_candidate")
        if candidate is None:
            # `certify_global_order` deliberately serializes the certificate.
            # The candidate is therefore supplied by the short-lived adapter.
            candidate = self._candidate
        portfolio = self.authenticated_local_portfolio
        if portfolio is not None and candidate is self._candidate:
            try:
                if portfolio.verify_local_witness(witness, certificate):
                    return True
            except Exception:
                # A stale compact proof is only an optimization failure.  The
                # existing independent replay below remains authoritative.
                pass
        composite_analysis = self.authenticated_composite_analysis
        if composite_analysis is not None and candidate is self._candidate:
            authenticated = (
                composite_field_analysis.authenticated_composite_field_analysis_matches(
                    composite_analysis,
                    polynomial=list(certificate.get("defining_polynomial", [])),
                    scale=self.scale,
                    equation_discriminant=int(
                        certificate.get("equation_discriminant", 0)
                    ),
                    basis_numerator=[
                        list(row) for row in certificate.get("basis_numerator", [])
                    ],
                    basis_denominator=int(certificate.get("basis_denominator", 0)),
                    index=int(certificate.get("index", 0)),
                    order_discriminant=int(certificate.get("order_discriminant", 0)),
                )
            )
            if authenticated:
                if "component_value" in witness:
                    proof = witness.get("proof", {})
                    return bool(
                        abs(int(witness.get("component_value", 0)))
                        == composite_analysis.square_support**2
                        and proof.get("theorem")
                        == "order-discriminant-coprime-component"
                        and abs(int(proof.get("support", 0)))
                        == composite_analysis.square_support
                    )
                proof = witness.get("proof", {})
                return bool(
                    int(witness.get("prime", 0)) == composite_analysis.residual_prime
                    and proof.get("check") == "monomial-dedekind-p-maximal"
                )
        if "component_value" in witness:
            component_value = abs(int(witness.get("component_value", 0)))
            result = self.composite_results.get(component_value)
            if result is None or result.state != "complete":
                return False
            proof = witness.get("proof", {})
            if int(proof.get("support", 0)) != result.component.value:
                return False
            if int(proof.get("index", 0)) != result.index:
                return False
            if (
                result.evidence.get("certificate")
                == "composite-dedekind-obstruction-one"
            ):
                if not check_buchmann_lenstra_result(self.coefficients, result):
                    return False
                final_index = _index_from_discriminants(
                    self.equation_disc,
                    _exact_integer(candidate.discriminant()),
                )
                return _gcd(final_index, result.component.value) == 1
            matching_components = [
                component
                for component in certificate.get("component_certificate", {}).get(
                    "components", []
                )
                if abs(int(component.get("value", 0))) == component_value
            ]
            return len(matching_components) == 1 and (
                check_discriminant_coprime_component_witness(
                    _exact_integer(candidate.discriminant()),
                    matching_components[0],
                    witness,
                )
            )

        prime = int(witness.get("prime", 0))
        if prime < 2:
            return False
        order_discriminant = _exact_integer(candidate.discriminant())
        if _valuation(order_discriminant, prime) <= 1:
            return True
        analysis = self.authenticated_analysis
        if analysis is not None:
            analysis_basis = [list(row) for row in analysis.basis_numerator]
            if (
                list(analysis.polynomial) == self.coefficients
                and int(analysis.scale) == self.scale
                and int(analysis.equation_discriminant) == self.equation_disc
                and int(analysis.order_discriminant) == order_discriminant
                and certificate.get("defining_polynomial") == self.coefficients
                and certificate.get("basis_numerator") == analysis_basis
                and int(certificate.get("basis_denominator", 0))
                == int(analysis.basis_denominator)
                and int(certificate.get("equation_discriminant", 0))
                == self.equation_disc
                and int(certificate.get("order_discriminant", 0)) == order_discriminant
                and prime in analysis.locally_certified_primes
            ):
                return True
        if prime > _MAX_WORD_PRIME:
            # The construction result is deliberately not trusted here.  A
            # fresh identity-start exact cycle is replayed, then only its
            # p-local discriminant valuation is compared because the global
            # candidate may also contain overorders at coprime primes.
            component = DiscriminantComponent(
                prime,
                "proven-prime",
                evidence={"source": "global-certificate-replay"},
            )
            starting_basis = _identity_basis(len(self.coefficients) - 1)
            try:
                replay = buchmann_lenstra_multiplier_cycle(
                    self.coefficients,
                    component,
                    starting_basis,
                    equation_discriminant=self.equation_disc,
                )
                replay_valid = check_buchmann_lenstra_general_result(
                    self.coefficients,
                    starting_basis,
                    replay,
                    equation_discriminant=self.equation_disc,
                )
            except Exception:
                return False
            return bool(
                replay_valid
                and replay.state == "complete"
                and replay.discriminant is not None
                and _valuation(int(replay.discriminant), prime)
                == _valuation(order_discriminant, prime)
            )
        if prime in self.replay_primes:
            if not self._native_replay_loaded:
                word_primes = [
                    value for value in self.replay_primes if value <= _MAX_WORD_PRIME
                ]
                try:
                    self._native_replay = (
                        native_order_from_polynomial(self.coefficients, word_primes)
                        if word_primes
                        else None
                    )
                except Exception:
                    self._native_replay = None
                self._native_replay_loaded = True
            replay = self._native_replay
            if (
                replay is not None
                and replay.complete
                and replay.equation_discriminant == self.equation_disc
                and _valuation(replay.order_discriminant, prime)
                == _valuation(order_discriminant, prime)
            ):
                return True
        field = candidate.number_field()
        if candidate._basis_rows == field.equation_order()._basis_rows:
            return bool(
                _maximal_order_module().equation_order_is_p_maximal(field, prime)
            )
        checked = _maximal_order_module().p_maximal_overorder_dynamic(candidate, prime)
        return _same_order(checked, candidate)

    def bind_candidate(self, candidate: Any) -> None:
        self._candidate = candidate

    def authenticated_proof(self, candidate: Any, certificate: dict[str, Any]) -> bool:
        """Bind one live packed proof envelope to its serialized certificate."""
        portfolio = self.authenticated_local_portfolio
        if portfolio is not None and candidate is self._candidate:
            return portfolio.matches_certificate(certificate)
        composite_analysis = self.authenticated_composite_analysis
        if composite_analysis is not None and candidate is self._candidate:
            return (
                composite_field_analysis.authenticated_composite_field_analysis_matches(
                    composite_analysis,
                    polynomial=list(certificate.get("defining_polynomial", [])),
                    scale=self.scale,
                    equation_discriminant=int(
                        certificate.get("equation_discriminant", 0)
                    ),
                    basis_numerator=[
                        list(row) for row in certificate.get("basis_numerator", [])
                    ],
                    basis_denominator=int(certificate.get("basis_denominator", 0)),
                    index=int(certificate.get("index", 0)),
                    order_discriminant=int(certificate.get("order_discriminant", 0)),
                )
            )
        analysis = self.authenticated_analysis
        if analysis is None or candidate is not self._candidate:
            return False
        if (
            type(analysis)
            is field_analysis_resource.AuthenticatedFieldAnalysisProjection
        ):
            return (
                field_analysis_resource.authenticated_field_analysis_projection_matches(
                    analysis,
                    polynomial=list(certificate.get("defining_polynomial", [])),
                    scale=self.scale,
                    trial_bound=_FIELD_ANALYSIS_TRIAL_BOUND,
                    equation_discriminant=int(
                        certificate.get("equation_discriminant", 0)
                    ),
                    basis_numerator=[
                        list(row) for row in certificate.get("basis_numerator", [])
                    ],
                    basis_denominator=int(certificate.get("basis_denominator", 0)),
                    index=int(certificate.get("index", 0)),
                    order_discriminant=int(certificate.get("order_discriminant", 0)),
                )
            )
        return field_analysis_resource.authenticated_field_analysis_matches(
            analysis,
            polynomial=list(certificate.get("defining_polynomial", [])),
            scale=self.scale,
            trial_bound=_FIELD_ANALYSIS_TRIAL_BOUND,
            equation_discriminant=int(certificate.get("equation_discriminant", 0)),
            basis_numerator=[
                list(row) for row in certificate.get("basis_numerator", [])
            ],
            basis_denominator=int(certificate.get("basis_denominator", 0)),
            index=int(certificate.get("index", 0)),
            order_discriminant=int(certificate.get("order_discriminant", 0)),
        )


def _proven_decomposition_from_field_analysis(
    analysis: Any, equation_discriminant: int
) -> dict[str, Any]:
    """Translate authenticated word-prime components to the public schema."""
    components = []
    events = []
    for component in analysis.components:
        prime = int(component.value)
        exponent = int(component.exponent)
        state, evidence = primality_status(prime)
        if state != "proven-prime":
            raise ArithmeticError("field analysis exposed an unproved component")
        components.append(
            {
                "value": prime**exponent,
                "state": state,
                "base": prime,
                "exponent": exponent,
                "evidence": evidence,
            }
        )
        if prime <= _FIELD_ANALYSIS_TRIAL_BOUND:
            events.append({"kind": "small-prime", "prime": prime, "exponent": exponent})

    def component_value(component: dict[str, Any]) -> int:
        return int(component["value"])

    components.sort(key=component_value)
    decomposition: dict[str, Any] = {
        "version": 1,
        "original": abs(int(equation_discriminant)),
        "components": components,
        "events": events,
        "certified": True,
    }
    if not check_decomposition_certificate(decomposition, require_proven=True):
        raise ArithmeticError("field-analysis decomposition failed public replay")
    return decomposition


def _authenticated_default_field_analysis(
    field: Any, coefficients: list[int], scale: int
) -> Any | None:
    """Return one compact authenticated projection, or defer fail-closed."""
    if not _default_field_analysis_applicability(coefficients)["selected"]:
        return None
    if not is_compiled(
        field_analysis_resource.packed_field_analysis_authenticate_projection
    ):
        return None
    try:
        polynomial = field._integral_equation_polynomial_cache
        if polynomial is None:
            return None
        resource = polynomial._exact_polynomial_resource()
        analysis = field_analysis_resource._native_field_analysis_projection_from_polynomial_bound(
            resource,
            coefficients,
            scale,
            _FIELD_ANALYSIS_TRIAL_BOUND,
        )
    except Exception:
        # Native availability and resource decoding are an optional boundary.
        return None
    try:
        if not field_analysis_resource.authenticated_field_analysis_projection_matches(
            analysis,
            polynomial=coefficients,
            scale=scale,
            trial_bound=_FIELD_ANALYSIS_TRIAL_BOUND,
        ):
            return None
    except (ArithmeticError, AttributeError, OverflowError, TypeError, ValueError):
        return None
    return analysis


def _authenticated_composite_square_support(
    coefficients: list[int], scale: int
) -> tuple[Any, dict[str, Any], list[dict[str, Any]]] | None:
    """Return one independently proved square-support candidate, if eligible."""
    # The structural path pays several native resource setups. Restrict its
    # automatic probe to coefficient sizes that amortize those crossings and
    # leave ordinary public microcases on the fused field-analysis boundary.
    if _coefficient_bits(coefficients) < 128:
        return None
    analysis = composite_field_analysis.construct_composite_field_analysis(
        coefficients, scale
    )
    if not composite_field_analysis.authenticated_composite_field_analysis_matches(
        analysis,
        polynomial=coefficients,
        scale=scale,
    ):
        return None
    prime = int(analysis.residual_prime)
    exponent = int(analysis.residual_exponent)
    support = int(analysis.square_support)
    prime_state, prime_evidence = primality_status(prime)
    if prime_state != "proven-prime":
        return None
    components: list[dict[str, Any]] = [
        {
            "value": prime**exponent,
            "state": prime_state,
            "base": prime,
            "exponent": exponent,
            "evidence": prime_evidence,
        },
        {
            "value": support * support,
            "state": "unresolved-coprime-component",
            "base": support,
            "exponent": 2,
            "evidence": {
                "kind": "exact-square-support",
                "root": support,
            },
        },
    ]
    components.sort(key=lambda component: int(component["value"]))
    decomposition: dict[str, Any] = {
        "version": 1,
        "original": abs(int(analysis.equation_discriminant)),
        "components": components,
        "events": [
            {
                "kind": "exact-square-support",
                "residual_prime": prime,
                "residual_exponent": exponent,
                "support_bits": support.bit_length(),
            }
        ],
        "certified": False,
    }
    if not check_decomposition_certificate(decomposition, require_proven=False):
        return None
    local_witnesses = [
        make_local_maximality_witness(
            prime,
            "dedekind",
            _valuation(int(analysis.equation_discriminant), prime),
            _valuation(int(analysis.order_discriminant), prime),
            _valuation(int(analysis.index), prime),
            {"check": "monomial-dedekind-p-maximal"},
        ),
        make_composite_local_maximality_witness(
            support * support,
            "composite-square-support",
            {
                "support": support,
                "index": int(analysis.index),
                "discriminant": int(analysis.order_discriminant),
                "theorem": "order-discriminant-coprime-component",
            },
        ),
    ]
    return analysis, decomposition, local_witnesses


def _proven_prime_components(
    decomposition: dict[str, Any], requested: list[int] | None
) -> list[int]:
    if requested is not None:
        return list(requested)
    answer = []
    for record in decomposition["components"]:
        if record["state"] == "proven-prime" and int(record["exponent"]) >= 2:
            answer.append(int(record["base"]))
    return answer


def _validate_requested_primes(primes: list[int]) -> None:
    for prime in primes:
        proof = decompose_discriminant(None, prime, small_prime_bound=1000)
        components = proof["components"]
        if (
            len(components) != 1
            or components[0]["state"] != "proven-prime"
            or int(components[0]["base"]) != prime
            or int(components[0]["exponent"]) != 1
        ):
            raise ValueError(str(prime) + " is not a certified prime")


def _normalize_requested_primes(value: Any) -> list[int] | None:
    if value is None:
        return None
    raw = list(value) if runtime.array.isArray(value) else [value]
    primes = sorted({_exact_integer(item) for item in raw})
    if any(prime < 2 for prime in primes):
        raise ValueError("local maximal-order primes must be at least two")
    _validate_requested_primes(primes)
    return primes


def _replace_composite_by_certified_primes(
    decomposition: dict[str, Any],
    record: dict[str, Any],
    trace: MaximalOrderTrace,
) -> None:
    """Factor only a lazy component after composite local work cannot finish.

    This deliberately is not the entry path: prefactorization and collective
    Buchmann--Lenstra work already had the opportunity to avoid factorization.
    It is the completeness fallback for the remaining supported exact input.
    """
    support = int(record["base"])
    outer_exponent = int(record["exponent"])
    token = trace.begin(
        "component-factorization-fallback",
        {"component_bits": support.bit_length()},
    )
    factors: list[tuple[int, int]] = []
    for prime_value, multiplicity_value in sage.factor(support):
        prime = _exact_integer(prime_value)
        multiplicity = int(multiplicity_value)
        factors.append((prime, multiplicity))
    if not factors:
        raise ArithmeticError("fallback component factorization was empty")

    # Install every known factor by splitting only the affected residual
    # branch.  Previously completed siblings and their evidence stay intact.
    for prime, _multiplicity in factors[:-1]:
        targets = [
            component
            for component in decomposition["components"]
            if int(component["value"]) % prime == 0 and int(component["value"]) != prime
        ]
        if len(targets) != 1:
            raise ArithmeticError("fallback factor has no unique residual branch")
        split = split_decomposition_component(
            decomposition,
            int(targets[0]["value"]),
            prime,
            reason="component-factorization-fallback",
        )
        updated = split["decomposition"]
        decomposition.clear()
        decomposition.update(updated)

    proof_budget = prime_proof_budget(
        trial_divisions=30_000,
        rho_steps=100_000,
        witness_trials=1_024,
        max_recursion_depth=64,
        rho_bit_limit=256,
    )
    for prime, multiplicity in factors:
        proof_state = None
        for _resume in range(32):
            proof_state = prove_prime_resumable(
                prime,
                proof_budget,
                proof_state,
            )
            if not check_prime_proof_state(proof_state):
                raise ArithmeticError("resumable prime proof checkpoint is invalid")
            if proof_state["status"] == "complete":
                break
            if proof_state["status"] == "composite":
                raise ArithmeticError("fallback factorization returned a composite")
        if proof_state is None or proof_state["status"] != "complete":
            raise ArithmeticError("fallback prime proof exhausted its resume bound")
        expected_exponent = multiplicity * outer_exponent
        matches = [
            component
            for component in decomposition["components"]
            if int(component["base"]) == prime
            and int(component["exponent"]) == expected_exponent
        ]
        if len(matches) != 1:
            raise ArithmeticError("fallback prime branch has the wrong multiplicity")
        updated = certify_decomposition_component(
            decomposition,
            int(matches[0]["value"]),
            proof_state["certificate"],
        )
        decomposition.clear()
        decomposition.update(updated)

    if not check_decomposition_certificate(decomposition, require_proven=False):
        raise ArithmeticError("fallback component refinement failed certification")
    trace.end(
        token,
        "complete",
        {"prime_count": len(factors), "proof_mode": "resumable-deterministic"},
    )


def _replace_component_by_certified_split(
    decomposition: dict[str, Any],
    record: dict[str, Any],
    result: BuchmannLenstraResult,
    trace: MaximalOrderTrace,
) -> list[dict[str, Any]]:
    """Replace one BL-split branch without factoring the parent component."""
    if result.state != "split" or result.split is None:
        raise ArithmeticError(
            "a branch-local restart requires certified split evidence"
        )
    split = result.split
    support = int(record["base"])
    if split.source != support or split.left * split.right != support:
        raise ArithmeticError("Buchmann--Lenstra split evidence has the wrong source")
    # A zero divisor gives an exact factorization of the working modulus, but
    # the two factors need not be coprime.  In particular, one side can carry
    # every prime in the support while the other still isolates a proper
    # support branch.  Select a side only after the exact component splitter
    # proves that it yields two coprime-support children; never infer this from
    # factor size or from the construction path's zero-divisor evidence.
    if not check_decomposition_certificate(decomposition, require_proven=False):
        raise ValueError("cannot split an invalid discriminant decomposition")
    selected_divisor = None
    selected_side = None
    refinement = None
    for side, divisor in (("left", split.left), ("right", split.right)):
        if selected_divisor is not None or (
            side == "right" and split.right == split.left
        ):
            continue
        try:
            candidate = split_decomposition_component(
                decomposition,
                int(record["value"]),
                divisor,
                reason="buchmann-lenstra-component-split",
            )
        except ValueError:
            # The decomposition was independently checked above, so the only
            # remaining ValueError is that this exact factor carries the full
            # prime support rather than separating a proper support branch.
            continue
        else:
            selected_divisor = divisor
            selected_side = side
            refinement = candidate
    if selected_divisor is None:
        raise ArithmeticError(
            "Buchmann--Lenstra factors do not separate this component support"
        )
    token = trace.begin(
        "component-split-restart",
        {"component_bits": support.bit_length()},
    )
    if refinement is None:
        raise ArithmeticError("Buchmann--Lenstra split refinement is missing")
    updated = refinement["decomposition"]
    decomposition.clear()
    decomposition.update(updated)
    children = refinement["restart"]["children"]
    trace.end(
        token,
        "complete",
        {
            "branch_count": len(children),
            "retired": refinement["restart"]["retired"],
            "preserved": refinement["restart"]["preserved"],
            "selected_factor_side": selected_side,
        },
    )
    return children


def compute_maximal_order(
    field: Any,
    *,
    requested_primes: Any = None,
    algorithm: str = "auto",
    trace_enabled: bool = False,
) -> Any:
    """Compute and certify a global or explicitly local maximal order."""
    if algorithm not in (
        "auto",
        "round2",
        "native",
        "polygon",
        "round4",
        "om-maxmin",
    ):
        raise ValueError(
            "algorithm must be 'auto', 'native', 'round2', 'polygon', "
            "'round4', or 'om-maxmin'"
        )
    requested = _normalize_requested_primes(requested_primes)
    trace = MaximalOrderTrace(trace_enabled)
    coefficients, scale = _integral_polynomial_data(field)

    if requested is None and algorithm == "auto" and not trace_enabled:
        try:
            composite_authenticated = _authenticated_composite_square_support(
                coefficients, scale
            )
        except (ArithmeticError, AttributeError, OverflowError, TypeError, ValueError):
            # The packed envelope is an optional acceleration.  A malformed,
            # stale, or unavailable result must retain the complete generic
            # path and must never reach the public cache.
            composite_authenticated = None
        if composite_authenticated is not None:
            analysis, decomposition, local_witnesses = composite_authenticated
            order = _authenticated_order_from_basis(
                field,
                (analysis.basis_numerator, int(analysis.basis_denominator)),
                scale,
                int(analysis.order_discriminant),
            )

            def certificate_factory() -> dict[str, Any]:
                adapter = _CertificateAdapter(
                    coefficients,
                    scale,
                    int(analysis.equation_discriminant),
                    {},
                    [],
                    authenticated_composite_analysis=analysis,
                )
                adapter.bind_candidate(order)
                return certify_global_order(
                    adapter,
                    order,
                    decomposition,
                    local_witnesses,
                )

            order._install_authenticated_maximal_order_certificate(certificate_factory)
            order._maximal_order_local_evidence = runtime.undefined
            public_trace = trace.to_dict()
            public_trace["analysis_trace"] = dict(analysis.trace)
            order._maximal_order_trace = public_trace
            return order

        authenticated = _authenticated_default_field_analysis(
            field, coefficients, scale
        )
        if authenticated is not None:
            analysis = authenticated
            equation_discriminant = int(analysis.equation_discriminant)
            order = NumberFieldOrder(
                field,
                [],
                False,
                False,
                (analysis.basis_flat, analysis.basis_denominator, scale),
            )
            order_discriminant = int(analysis.order_discriminant)
            order._discriminant_cache = runtime.normalize_integer(order_discriminant)

            def materialize_certificate() -> dict[str, Any]:
                decomposition = _proven_decomposition_from_field_analysis(
                    analysis, equation_discriminant
                )
                relevant_primes = [
                    int(record["base"])
                    for record in decomposition["components"]
                    if int(record["exponent"]) >= 2
                ]
                index = int(analysis.index)
                prime_witnesses = [
                    make_local_maximality_witness(
                        prime,
                        "round2",
                        _valuation(equation_discriminant, prime),
                        _valuation(order_discriminant, prime),
                        _valuation(index, prime),
                        {"check": "independent-round2-fixed-point"},
                    )
                    for prime in relevant_primes
                ]
                adapter = _CertificateAdapter(
                    coefficients,
                    scale,
                    equation_discriminant,
                    {},
                    relevant_primes,
                    authenticated_analysis=analysis,
                )
                adapter.bind_candidate(order)
                return certify_global_order(
                    adapter,
                    order,
                    decomposition,
                    prime_witnesses,
                )

            order._install_authenticated_maximal_order_certificate(
                materialize_certificate
            )
            order._maximal_order_local_evidence = runtime.undefined
            order._maximal_order_trace = trace.to_dict()
            return order

    equation_order = field.equation_order()
    equation_discriminant = _exact_integer(equation_order.discriminant())

    decomposition_token = trace.begin(
        "discriminant-decomposition",
        {"bits": abs(equation_discriminant).bit_length()},
    )
    decomposition = decompose_discriminant(
        coefficients,
        equation_discriminant,
        hints=requested,
    )
    trace.end(
        decomposition_token,
        details={"component_count": len(decomposition["components"])},
    )

    order = equation_order
    current_basis = _identity_basis(field.degree())
    composite_results: dict[int, BuchmannLenstraResult] = {}
    authenticated_composite_projections: dict[int, Any] = {}
    composite_witnesses: list[dict[str, Any]] = []
    processed_composite_supports: tuple[int, ...] = ()

    if requested is None:
        pending_composites = [
            record
            for record in decomposition["components"]
            if record["state"] != "proven-prime"
        ]
        while pending_composites:
            record = pending_composites.pop(0)
            component_value = int(record["value"])
            support = int(record["base"])
            component = DiscriminantComponent(
                support,
                str(record["state"]),
                evidence={"source_component": component_value},
            )
            token = trace.begin(
                "composite-local-order",
                {"component_bits": support.bit_length()},
            )
            identity_basis = _identity_basis(field.degree())
            starting_basis = identity_basis
            result = certified_composite_overorder_from_equation(
                coefficients,
                component,
                equation_discriminant,
            )
            if result.evidence.get("stage") == "q-radical-multiplier-cycle":
                if not check_buchmann_lenstra_general_result(
                    coefficients,
                    starting_basis,
                    result,
                    equation_discriminant=equation_discriminant,
                ):
                    raise ArithmeticError(
                        "general Buchmann--Lenstra replay rejected its result"
                    )
            elif not _simple_bl_complete_uses_global_theorem(
                result,
                starting_basis,
                identity_basis,
            ) and not check_buchmann_lenstra_result(coefficients, result):
                raise ArithmeticError("Buchmann--Lenstra evidence failed replay")

            trace.end(token, result.state, {"index": result.index})
            if result.state == "split":
                replacements = _replace_component_by_certified_split(
                    decomposition,
                    record,
                    result,
                    trace,
                )

                def split_component_value(child: dict[str, Any]) -> int:
                    return int(child["value"])

                pending_composites = sorted(
                    [
                        child
                        for child in replacements
                        if child["state"] != "proven-prime"
                    ]
                    + pending_composites,
                    key=split_component_value,
                )
                continue
            if result.state != "complete" or result.basis is None:
                # Whole-component factorization is the final completeness
                # fallback only after the bounded general cycle cannot finish.
                _replace_composite_by_certified_primes(
                    decomposition,
                    record,
                    trace,
                )
                continue
            if result.discriminant is None:
                raise ArithmeticError(
                    "composite local-order result omitted discriminant"
                )
            bl_module = __import__(
                "sagejs.number_fields.buchmann_lenstra",
                fromlist=["authenticate_buchmann_lenstra_result"],
            )
            authenticate_bl = getattr(
                bl_module, "authenticate_buchmann_lenstra_result", None
            )
            if authenticate_bl is not None:
                projection = authenticate_bl(
                    coefficients,
                    result,
                    equation_discriminant=equation_discriminant,
                )
                if projection is not None:
                    authenticated_composite_projections[component_value] = projection

            def materialize_composite_order(
                basis: OrderBasis, discriminant: int
            ) -> Any:
                return _authenticated_order_from_basis(
                    field,
                    basis,
                    scale,
                    discriminant,
                )

            def merge_composite_orders(left: Any, right: Any) -> Any:
                left_basis = _basis_from_order(left, scale)
                right_basis = _basis_from_order(right, scale)
                try:
                    merged_order, _merged_basis = _merge_coprime_order_bases(
                        field,
                        left_basis,
                        right_basis,
                        scale,
                        equation_discriminant,
                    )
                    return merged_order
                except (ArithmeticError, OverflowError, TypeError, ValueError):
                    return _merge_orders(field, left, right)

            order, processed_composite_supports = (
                merge_certified_coprime_composite_order(
                    order,
                    processed_composite_supports,
                    result,
                    materialize_local_order=materialize_composite_order,
                    merge_orders=merge_composite_orders,
                )
            )
            current_basis = _basis_from_order(order, scale)
            composite_results[component_value] = result
            composite_witnesses.append(
                make_composite_local_maximality_witness(
                    component_value,
                    "buchmann-lenstra",
                    {
                        "support": support,
                        "index": result.index,
                        "discriminant": result.discriminant,
                        "theorem": "order-discriminant-coprime-component",
                    },
                )
            )

    primes = _proven_prime_components(decomposition, requested)
    relevant_primes = [
        prime for prime in primes if _valuation(equation_discriminant, prime) >= 2
    ]
    primary_selection = {
        "schema": _SELECTOR_SCHEMA,
        "primary": (
            "native"
            if relevant_primes and algorithm in ("auto", "native")
            else "local"
            if relevant_primes
            else "none"
        ),
        "reason": (
            "the native global Round-2 resource wins the measured public corpus"
            if relevant_primes and algorithm == "auto"
            else "the caller forced the native global algorithm"
            if relevant_primes and algorithm == "native"
            else "the caller selected independently certified local work"
            if relevant_primes
            else "no proven prime has square support in the discriminant"
        ),
        "forced": algorithm != "auto",
        "degree": field.degree(),
        "coefficient_bits": _coefficient_bits(coefficients),
        "prime_count": len(relevant_primes),
        "expected_output_bytes": sum(
            _expected_basis_bytes(
                field.degree(),
                _coefficient_bits(coefficients),
                prime,
                _valuation(equation_discriminant, prime),
            )
            for prime in relevant_primes
        ),
        "public_corpus_evidence": dict(_PUBLIC_CORPUS_EVIDENCE),
        "benchmark": _SELECTOR_BENCHMARK,
    }
    native_handled_primes: list[int] = []
    completed_local_primes: set[int] = set()
    om_auto_evidence: list[dict[str, Any]] = []
    verified_om_entries: list[tuple[int, Any, Any, OrderBasis, int]] = []
    authenticated_native_proof: Any = None
    native_batch_primes: list[int] = []
    if relevant_primes and algorithm == "auto":
        for prime in relevant_primes:
            if prime > _MAX_WORD_PRIME:
                continue
            started = time.perf_counter_ns()
            try:
                om_order, evidence, om_selection = _auto_om_local_order_with_proof(
                    field,
                    coefficients,
                    scale,
                    equation_discriminant,
                    prime,
                )
                om_basis = (
                    None
                    if om_selection is None
                    or om_selection.result is None
                    or om_selection.result.order_basis is None
                    else om_selection.result.order_basis
                )
            except Exception as error:
                evidence = {
                    "schema": "sagejs.number-fields/om-auto-selection-v1",
                    "stage": "terminal-selection",
                    "selected": False,
                    "algorithm": "fallback",
                    "reason": "OM auto-selection was unavailable",
                    "exception_type": type(error).__name__,
                    "message": str(error),
                    "prime": prime,
                }
                om_order = None
                om_selection = None
                om_basis = None
            evidence = dict(evidence)
            evidence["prime"] = prime
            om_auto_evidence.append(evidence)
            if om_order is None:
                if evidence.get("stage") == "terminal-selection":
                    trace.emit(
                        "om-auto-local-order",
                        "fallback",
                        evidence,
                        duration_ns=time.perf_counter_ns() - started,
                    )
                continue
            completed_local_primes.add(prime)
            if om_basis is None or om_selection is None or om_selection.result is None:
                raise ArithmeticError("a complete OM result omitted its proof or basis")
            om_projection = om_selection.result.authenticated_tree
            if om_projection is None:
                raise ArithmeticError(
                    "a complete OM result omitted its authenticated type-tree seal"
                )
            om_local_index = int(om_selection.result.local_result.index)
            verified_om_entries.append(
                (
                    prime,
                    om_selection,
                    om_projection,
                    om_basis,
                    equation_discriminant // (om_local_index * om_local_index),
                )
            )
            if (
                current_basis.canonical_key()
                == _identity_basis(field.degree()).canonical_key()
            ):
                order = om_order
            else:
                try:
                    order, current_basis = _merge_coprime_order_bases(
                        field,
                        current_basis,
                        OrderBasis(
                            _packed_row_hnf(om_basis.numerator),
                            om_basis.denominator,
                            canonical=True,
                        ),
                        scale,
                        equation_discriminant,
                    )
                except (ArithmeticError, OverflowError, TypeError, ValueError):
                    order = _merge_orders(field, order, om_order)
            current_basis = _basis_from_order(order, scale)
            _cache_discriminant_from_basis(
                order,
                current_basis,
                equation_discriminant,
            )
            native_handled_primes.append(prime)
            trace.emit(
                "om-auto-local-order",
                "complete",
                evidence,
                duration_ns=time.perf_counter_ns() - started,
            )
        if native_handled_primes:
            primary_selection["primary"] = "om-maxmin+native"
            primary_selection["reason"] = (
                "a complete measured OM region was resolved before the native "
                "batch; remaining primes retain the native-first fallback"
            )
            primary_selection["om_auto_primes"] = list(native_handled_primes)
            primary_selection["om_auto_evidence"] = list(om_auto_evidence)
    native_fallback_for_parallel = False
    if len(relevant_primes) and algorithm in ("auto", "native"):
        # The native resource is complete for a batch of certified word
        # primes, while an arbitrary prime has a separate exact polygon path.
        # Partitioning at this capability boundary lets the native theorem
        # discharge every word-prime branch even when a larger component is
        # present; sending the mixed batch would discard that complete work
        # and force every word prime back through local selector estimates.
        native_batch_primes = sorted(
            prime
            for prime in relevant_primes
            if prime <= _MAX_WORD_PRIME and prime not in native_handled_primes
        )
        deferred_arbitrary_primes = [
            prime for prime in relevant_primes if prime > _MAX_WORD_PRIME
        ]
        token = trace.begin(
            "native-local-orders",
            {
                "prime_count": len(native_batch_primes),
                "deferred_arbitrary_prime_count": len(deferred_arbitrary_primes),
                "capability_partitioned": len(deferred_arbitrary_primes) > 0,
                "selection": primary_selection,
            },
        )
        if native_batch_primes:
            try:
                if _default_field_analysis_applicability(coefficients)["selected"]:
                    native = native_order_from_polynomial(
                        coefficients, native_batch_primes
                    )
                else:
                    polynomial = field._integral_equation_polynomial_cache
                    if polynomial is None:
                        raise ArithmeticError(
                            "field-owned integral polynomial resource is unavailable"
                        )
                    flint = __import__("sagejs.ffi.flint", fromlist=["flint"])
                    prime_hints = flint.fmpz_matrix(len(native_batch_primes), 1)
                    try:
                        for row, prime in enumerate(native_batch_primes):
                            flint.fmpz_matrix_set_entry(prime_hints, row, 0, prime)
                        native, authenticated_native_proof = (
                            field_analysis_resource.native_carried_round2_order_from_resources(
                                polynomial._exact_polynomial_resource(),
                                prime_hints,
                                coefficients_low_to_high=coefficients,
                                certified_primes=native_batch_primes,
                            )
                        )
                    finally:
                        prime_hints.close()
                if native.complete:
                    if native.equation_discriminant != equation_discriminant:
                        raise ArithmeticError(
                            "native local result does not match the equation order"
                        )
                    completed_local_primes.update(native_batch_primes)
                    packed_coprime_merge = False
                    if (
                        current_basis.canonical_key()
                        == _identity_basis(field.degree()).canonical_key()
                    ):
                        order = (
                            _authenticated_order_from_basis(
                                field,
                                native.basis,
                                scale,
                                native.order_discriminant,
                            )
                            if authenticated_native_proof is not None
                            else _order_from_basis(
                                field,
                                native.basis,
                                scale,
                                native.order_discriminant,
                            )
                        )
                    elif authenticated_native_proof is not None:
                        order, current_basis = _merge_coprime_order_bases(
                            field,
                            current_basis,
                            native.basis,
                            scale,
                            equation_discriminant,
                        )
                        packed_coprime_merge = True
                    else:
                        # Local overorders at coprime supports merge as the order
                        # generated by their two lattices.  Coprimality makes the
                        # sum a ring; the global certificate independently checks
                        # closure from the resulting canonical basis.
                        order = _merge_orders(
                            field,
                            order,
                            _order_from_basis(
                                field,
                                native.basis,
                                scale,
                                native.order_discriminant,
                            ),
                        )
                    if not packed_coprime_merge:
                        current_basis = _basis_from_order(order, scale)
                    _cache_discriminant_from_basis(
                        order,
                        current_basis,
                        equation_discriminant,
                    )
                    native_handled_primes.extend(native_batch_primes)
                    trace.end(
                        token,
                        "complete",
                        {
                            "index": native.index,
                            "resolved_prime_count": len(native_handled_primes),
                            "deferred_arbitrary_prime_count": len(
                                deferred_arbitrary_primes
                            ),
                            "capability_partitioned": len(deferred_arbitrary_primes)
                            > 0,
                            "merged_composite_lattice": len(composite_results) > 0,
                            "authenticated_round2_proof": (
                                authenticated_native_proof is not None
                            ),
                            "proof_schema": (
                                authenticated_native_proof.proof_schema
                                if authenticated_native_proof is not None
                                else None
                            ),
                            "packed_coprime_merge": packed_coprime_merge,
                        },
                    )
                else:
                    if algorithm == "auto":
                        native_fallback_for_parallel = True
                    trace.end(
                        token,
                        "fallback",
                        {
                            "status": native.status,
                            "fallback_prime": native.fallback_prime,
                            "deferred_arbitrary_prime_count": len(
                                deferred_arbitrary_primes
                            ),
                        },
                    )
            except Exception as error:
                trace.end(token, "unavailable", {"message": str(error)})
                if algorithm == "native":
                    raise
                native_fallback_for_parallel = True
        else:
            # This is a capability deferral, not a failed native computation:
            # there is no word-prime batch to submit to the resource.
            trace.end(
                token,
                "deferred",
                {
                    "resolved_prime_count": 0,
                    "deferred_arbitrary_prime_count": len(deferred_arbitrary_primes),
                    "capability_partitioned": True,
                },
            )
            if algorithm == "auto":
                native_fallback_for_parallel = True

    remaining_primes = [
        prime for prime in relevant_primes if prime not in native_handled_primes
    ]
    if remaining_primes:
        if algorithm in ("auto", "native") and native_handled_primes:
            trace.emit(
                "local-capability-partition",
                "complete",
                {
                    "native_word_primes": list(native_handled_primes),
                    "exact_fallback_primes": list(remaining_primes),
                },
            )
        # The immutable scheduler owns canonical ordering, payload validation,
        # resource evidence, and the merge plan.  Public workers are considered
        # only after the native batch is unavailable or incomplete; every
        # worker reconstructs its field and host resources from exact wire data.
        jobs, decisions, selected_schedule = _local_selection_plan(
            coefficients,
            equation_discriminant,
            remaining_primes,
            algorithm,
            worker_capability=False,
        )
        parallel_decision = public_worker_decision(
            jobs,
            after_native_fallback=(
                algorithm == "auto" and native_fallback_for_parallel
            ),
        )
        use_public_workers = bool(parallel_decision["selected"])
        selected_schedule = make_schedule(
            jobs,
            worker_capability=use_public_workers,
        )
        worker_details: dict[tuple[Any, ...], dict[str, Any]] = {}

        def run_local_job(job: JobPayload) -> tuple[Any, ...]:
            started = time.perf_counter_ns()
            component = local_job_component(job)
            prime = component.base
            if prime > _MAX_WORD_PRIME:
                local_order, used_algorithm, details = _arbitrary_prime_local_order(
                    field,
                    coefficients,
                    scale,
                    equation_discriminant,
                    prime,
                )
            else:
                local_order, used_algorithm, details = _forced_local_order(
                    field,
                    coefficients,
                    scale,
                    equation_order,
                    equation_discriminant,
                    prime,
                    str(job[6]),
                )
            basis = _basis_from_order(local_order, scale)
            local_discriminant = _cache_discriminant_from_basis(
                local_order,
                basis,
                equation_discriminant,
            )
            local_index = _index_from_discriminants(
                equation_discriminant,
                local_discriminant,
            )
            elapsed_micros = max(0, (time.perf_counter_ns() - started) // 1000)
            key = local_job_key(job)
            selected = decisions[key]
            details = dict(details)
            details["used_algorithm"] = used_algorithm
            details["selection_decision"] = selected
            details["local_order_discriminant"] = local_discriminant
            details["local_index"] = local_index
            details["elapsed_micros"] = elapsed_micros
            worker_details[key] = details
            return make_local_result(
                job,
                basis.numerator,
                basis.denominator,
                local_index,
                prime ** _valuation(equation_discriminant, prime),
                (
                    ("used-algorithm", used_algorithm),
                    ("local-index", local_index),
                    ("prime", prime),
                ),
                peak_bytes=int(job[5]),
                elapsed_micros=elapsed_micros,
            )

        if use_public_workers:
            try:
                local_run = run_public_local_jobs(
                    jobs,
                    worker_capability=True,
                )
                for payload in local_run[2]:
                    contract = local_result_contract(payload)
                    key = payload[1]
                    details = dict(contract.evidence)
                    details["selection_decision"] = decisions[key]
                    details["elapsed_micros"] = int(payload[9])
                    worker_details[key] = details
            except (LocalCertificationError, LocalWorkerError) as error:
                # Capability can become stale between selection and pool
                # construction.  Auto mode preserves completeness by returning
                # to the canonical in-process path after the pool has cancelled.
                parallel_decision = dict(parallel_decision)
                parallel_decision["selected"] = False
                parallel_decision["reason"] = "worker-runtime-fallback"
                parallel_decision["worker_error"] = str(error)
                local_run = run_local_jobs(
                    jobs,
                    run_local_job,
                    worker_capability=False,
                )
                selected_schedule = local_run[1]
        else:
            local_run = run_local_jobs(
                jobs,
                run_local_job,
                worker_capability=False,
            )
        if local_run[1] != selected_schedule:
            raise ArithmeticError("local scheduler selection changed during execution")
        for payload in local_run[2]:
            contract = local_result_contract(payload)
            if contract.basis is None:
                raise ArithmeticError("a completed local branch omitted its basis")
            local_discriminant = equation_discriminant // (
                contract.index * contract.index
            )
            local_order = _order_from_basis(
                field,
                contract.basis,
                scale,
                local_discriminant,
            )
            order = _merge_orders(field, order, local_order)
            current_basis = _basis_from_order(order, scale)
            _cache_discriminant_from_basis(
                order,
                current_basis,
                equation_discriminant,
            )
            key = payload[1]
            prime = int(key[1])
            details = dict(worker_details[key])
            details["order_discriminant"] = _exact_integer(order.discriminant())
            if prime > _MAX_WORD_PRIME:
                event_stage = "arbitrary-prime-local-order"
            elif algorithm in ("auto", "native", "round2"):
                event_stage = "round2-local-order"
            else:
                event_stage = "selected-local-order"
            trace.emit(
                event_stage,
                "complete",
                {"prime": prime, "requested_algorithm": algorithm, **details},
                duration_ns=int(payload[9]) * 1000,
            )
        trace.emit(
            "local-schedule",
            "complete",
            {
                "selection": primary_selection,
                "schedule": local_run[1],
                "merge_plan": local_run[3],
                "resources": local_run[4],
                "arithmetic_worker_capability": bool(
                    parallel_decision["worker_capability"]
                ),
                "parallel_decision": parallel_decision,
                "parallel_boundary": (
                    "native-first; immutable pointer-free jobs only after measured "
                    "native fallback crossover; parent merge and independent global "
                    "certification remain sequential"
                ),
            },
        )

    order_discriminant = _exact_integer(order.discriminant())
    index = _index_from_discriminants(equation_discriminant, order_discriminant)
    if requested is not None:
        order._maximal_order_certificate = runtime.undefined
        order._maximal_order_local_evidence = {
            "schema": "sagejs.number-fields/local-maximal-order-v1",
            "requested_primes": list(requested),
            "equation_discriminant": equation_discriminant,
            "order_discriminant": order_discriminant,
            "index": index,
            "certified": True,
        }
        order._maximal_order_trace = trace.to_dict()
        return order

    prime_witnesses = []
    om_selection_by_prime = {entry[0]: entry[1] for entry in verified_om_entries}
    for record in decomposition["components"]:
        if record["state"] != "proven-prime":
            continue
        prime = int(record["base"])
        if _valuation(equation_discriminant, prime) < 2:
            continue
        om_selection = om_selection_by_prime.get(prime)
        if om_selection is not None:
            witness_method = "om-maxmin"
            witness_proof = {
                "check": "authenticated-om-maxmin-local-basis",
                "certificate_id": om_selection.result.type_tree.certificate_id,
            }
        elif (
            authenticated_native_proof is not None
            and prime in authenticated_native_proof.certified_primes
        ):
            witness_method = "round2"
            witness_proof = {"check": "authenticated-round2-fixed-point"}
        else:
            witness_method = "round2"
            witness_proof = {"check": "independent-round2-fixed-point"}
        prime_witnesses.append(
            make_local_maximality_witness(
                prime,
                witness_method,
                _valuation(equation_discriminant, prime),
                _valuation(order_discriminant, prime),
                _valuation(index, prime),
                witness_proof,
            )
        )

    authenticated_local_portfolio = None
    authenticated_composite_entries = [
        (
            component_value,
            authenticated_composite_projections[component_value],
            result.basis,
            int(result.discriminant),
        )
        for component_value, result in composite_results.items()
        if component_value in authenticated_composite_projections
        and result.basis is not None
        and result.discriminant is not None
    ]
    if (
        authenticated_native_proof is not None
        and len(authenticated_composite_entries) == len(composite_results)
        and relevant_primes
        and sorted(
            list(authenticated_native_proof.certified_primes)
            + [entry[0] for entry in verified_om_entries]
        )
        == sorted(relevant_primes)
    ):
        authenticated_local_portfolio = _AuthenticatedLocalPortfolio(
            coefficients,
            scale,
            equation_discriminant,
            native_batch_primes,
            [entry[0] for entry in verified_om_entries],
            [
                (component_value, int(result.component.value))
                for component_value, result in composite_results.items()
            ],
            authenticated_native_proof,
            verified_om_entries,
            authenticated_composite_entries,
            current_basis,
            index,
            order_discriminant,
        )

    adapter = _CertificateAdapter(
        coefficients,
        scale,
        equation_discriminant,
        composite_results,
        relevant_primes,
        authenticated_local_portfolio=authenticated_local_portfolio,
    )
    adapter.bind_candidate(order)

    def materialize_certificate() -> dict[str, Any]:
        return certify_global_order(
            adapter,
            order,
            decomposition,
            composite_witnesses + prime_witnesses,
        )

    defer_certificate = bool(
        not trace_enabled
        and not composite_results
        and relevant_primes
        and all(prime in completed_local_primes for prime in relevant_primes)
    )
    if (
        authenticated_local_portfolio is not None
        and authenticated_native_proof is not None
    ):
        certification_token = trace.begin("global-certification")
        certificate = materialize_certificate()
        trace.end(
            certification_token,
            "authenticated-local-portfolio",
            {
                "index": index,
                "order_discriminant": order_discriminant,
                "native_primes": list(authenticated_native_proof.certified_primes),
                "om_primes": [entry[0] for entry in verified_om_entries],
            },
        )
        order._maximal_order_certificate = certificate
    elif defer_certificate:
        trace.emit(
            "global-certification",
            "deferred-complete-local-results",
            {
                "index": index,
                "order_discriminant": order_discriminant,
                "completed_local_primes": sorted(completed_local_primes),
            },
        )
        order._install_pending_maximal_order_certificate(materialize_certificate)
    else:
        certification_token = trace.begin("global-certification")
        certificate = materialize_certificate()
        trace.end(
            certification_token,
            "certified",
            {"index": index, "order_discriminant": order_discriminant},
        )
        order._maximal_order_certificate = certificate
    order._maximal_order_local_evidence = runtime.undefined
    order._maximal_order_trace = trace.to_dict()
    return order


__all__ = ["compute_maximal_order", "inspect_maximal_order_selection"]
