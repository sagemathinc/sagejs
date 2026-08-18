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
import sagejs.runtime as runtime
from sagejs.number_fields.buchmann_lenstra import (
    BuchmannLenstraResult,
    buchmann_lenstra_multiplier_cycle,
    buchmann_lenstra_overorder,
    check_buchmann_lenstra_general_result,
    check_buchmann_lenstra_result,
)
from sagejs.number_fields.discriminant_components import (
    certify_decomposition_component,
    check_decomposition_certificate,
    check_prime_proof_state,
    decompose_discriminant,
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


def _maximal_order_module() -> Any:
    return __import__(
        "sagejs.number_fields.maximal_order",
        fromlist=["maximal_order"],
    )


def _exact_integer(value: Any) -> int:
    """Return an exact host integer without passing through a JS number."""
    return runtime.integer_bigint(value)


def _integral_polynomial_data(field: Any) -> tuple[list[int], int]:
    polynomial = _maximal_order_module().integral_equation_polynomial(field)
    coefficients = [_exact_integer(value) for value in polynomial.list()]
    degree = field.degree()
    while len(coefficients) < degree + 1:
        coefficients.append(0)
    if len(coefficients) != degree + 1 or coefficients[-1] != 1:
        raise ArithmeticError("the integral equation polynomial is not monic")
    scale = 1
    for coefficient in field._defining_coefficients:
        scale = _exact_integer(_nf_lcm(scale, coefficient._denominator))
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


def _basis_from_order(order: Any, scale: int) -> OrderBasis:
    """Describe a public order in the integral equation generator basis."""
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
                "eligible": False,
                "reason": (
                    "extended OM types require differential evidence and do not yet "
                    "advertise auto_selectable"
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
            "the measured local fallback favors Round 2; OM/MaxMin remains "
            "forceable but is not auto-selectable"
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


class _CertificateAdapter:
    """Independent checker adapter closed over one candidate and its evidence."""

    def __init__(
        self,
        coefficients: list[int],
        scale: int,
        equation_discriminant: int,
        composite_results: dict[int, BuchmannLenstraResult],
        replay_primes: list[int],
    ) -> None:
        self.coefficients = list(coefficients)
        self.scale = scale
        self.equation_disc = equation_discriminant
        self.composite_results = composite_results
        self.replay_primes = list(replay_primes)
        self._native_replay: Any = None
        self._native_replay_loaded = False
        self._candidate: Any = None

    def defining_polynomial(self, candidate: Any) -> list[int]:
        return list(self.coefficients)

    def basis_data(self, candidate: Any) -> tuple[list[list[int]], int]:
        basis = _basis_from_order(candidate, self.scale)
        return [list(row) for row in basis.numerator], basis.denominator

    def equation_discriminant(self, candidate: Any) -> int:
        return self.equation_disc

    def order_discriminant(self, candidate: Any) -> int:
        return _exact_integer(candidate.discriminant())

    def index(self, candidate: Any) -> int:
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
    composite_witnesses: list[dict[str, Any]] = []

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
            starting_basis = current_basis
            identity_basis = _identity_basis(field.degree())
            if current_basis.canonical_key() == identity_basis.canonical_key():
                result = buchmann_lenstra_overorder(
                    coefficients,
                    component,
                    basis=current_basis,
                    equation_discriminant=equation_discriminant,
                )
            else:
                result = buchmann_lenstra_multiplier_cycle(
                    coefficients,
                    component,
                    current_basis,
                    equation_discriminant=equation_discriminant,
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

            if result.state == "enlarged" and result.basis is not None:
                # The equation-order Dedekind step is only the first
                # enlargement.  Restart the same component at the new lattice
                # and let the bounded q-radical/multiplier cycle finish it.
                current_basis = result.basis
                if result.discriminant is None:
                    raise ArithmeticError(
                        "Buchmann--Lenstra enlargement omitted its discriminant"
                    )
                order = _order_from_basis(
                    field,
                    current_basis,
                    scale,
                    int(result.discriminant),
                )
                general_start = current_basis
                result = buchmann_lenstra_multiplier_cycle(
                    coefficients,
                    component,
                    general_start,
                    equation_discriminant=equation_discriminant,
                )
                if not check_buchmann_lenstra_general_result(
                    coefficients,
                    general_start,
                    result,
                    equation_discriminant=equation_discriminant,
                ):
                    raise ArithmeticError(
                        "general Buchmann--Lenstra replay rejected its result"
                    )
            trace.end(token, result.state, {"index": result.index})
            if result.state == "split":
                replacements = _replace_component_by_certified_split(
                    decomposition,
                    record,
                    result,
                    trace,
                )
                pending_composites = sorted(
                    [
                        child
                        for child in replacements
                        if child["state"] != "proven-prime"
                    ]
                    + pending_composites,
                    key=lambda child: int(child["value"]),
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
            current_basis = result.basis
            order = _order_from_basis(
                field,
                current_basis,
                scale,
                int(result.discriminant),
            )
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
    native_fallback_for_parallel = False
    if len(relevant_primes) and algorithm in ("auto", "native"):
        # The native resource is complete for a batch of certified word
        # primes, while an arbitrary prime has a separate exact polygon path.
        # Partitioning at this capability boundary lets the native theorem
        # discharge every word-prime branch even when a larger component is
        # present; sending the mixed batch would discard that complete work
        # and force every word prime back through local selector estimates.
        native_batch_primes = [
            prime for prime in relevant_primes if prime <= _MAX_WORD_PRIME
        ]
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
                native = native_order_from_polynomial(coefficients, native_batch_primes)
                if native.complete:
                    prime_order = _order_from_basis(
                        field,
                        native.basis,
                        scale,
                        native.order_discriminant,
                    )
                    if (
                        current_basis.canonical_key()
                        == _identity_basis(field.degree()).canonical_key()
                    ):
                        order = prime_order
                    else:
                        # Local overorders at coprime supports merge as the order
                        # generated by their two lattices.  Coprimality makes the
                        # sum a ring; the global certificate independently checks
                        # closure from the resulting canonical basis.
                        order = _merge_orders(field, order, prime_order)
                    current_basis = _basis_from_order(order, scale)
                    _cache_discriminant_from_basis(
                        order,
                        current_basis,
                        equation_discriminant,
                    )
                    native_handled_primes = list(native_batch_primes)
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
    for record in decomposition["components"]:
        if record["state"] != "proven-prime":
            continue
        prime = int(record["base"])
        if _valuation(equation_discriminant, prime) < 2:
            continue
        prime_witnesses.append(
            make_local_maximality_witness(
                prime,
                "round2",
                _valuation(equation_discriminant, prime),
                _valuation(order_discriminant, prime),
                _valuation(index, prime),
                {"check": "independent-round2-fixed-point"},
            )
        )

    certification_token = trace.begin("global-certification")
    adapter = _CertificateAdapter(
        coefficients,
        scale,
        equation_discriminant,
        composite_results,
        relevant_primes,
    )
    adapter.bind_candidate(order)
    certificate = certify_global_order(
        adapter,
        order,
        decomposition,
        composite_witnesses + prime_witnesses,
    )
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
