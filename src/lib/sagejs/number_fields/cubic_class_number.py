"""Bounded exact class-number-only certificates for cubic number fields."""

from __future__ import annotations

import hashlib
import json
import time
from typing import Any, Callable

import sagejs as sage
import sagejs.runtime as runtime
from sagejs.number_fields.class_groups import (
    _CUBIC_MINKOWSKI_REPLAY_MAX_BOUND,
    _CUBIC_MINKOWSKI_REPLAY_MAX_MEMORY_BYTES,
    _CUBIC_MINKOWSKI_REPLAY_MAX_PRIME_IDEALS,
    _CUBIC_MINKOWSKI_REPLAY_MAX_RATIONAL_PRIMES,
    DEFAULT_CUBIC_MINKOWSKI_MAX_BOUND,
    DEFAULT_CUBIC_MINKOWSKI_MAX_MEMORY_BYTES,
    DEFAULT_CUBIC_MINKOWSKI_MAX_PRIME_IDEALS,
    DEFAULT_CUBIC_MINKOWSKI_MAX_RATIONAL_PRIMES,
    _canonical_json,
    _content_hash,
    _cubic_minkowski_payload_within_caps,
    _positive_integer,
)

CUBIC_CLASS_NUMBER_CERTIFICATE_SCHEMA = (
    "sagejs.number-fields/cubic-minkowski-class-number-v1"
)
AUTHENTICATED_CUBIC_CLASS_NUMBER_SCHEMA = (
    "sagejs.number-fields/authenticated-cubic-class-number-result-v1"
)
AUTHENTICATED_CUBIC_RELATION_SEED_SCHEMA = (
    "sagejs.number-fields/authenticated-cubic-relation-seed-v1"
)
_AUTHENTICATED_CUBIC_CLASS_NUMBER_TOKEN = object()
_AUTHENTICATED_CUBIC_RELATION_SEED_TOKEN = object()
_LIVE_CUBIC_CERTIFICATE_TOKEN = object()
DEFAULT_CUBIC_CLASS_NUMBER_MAX_RELATION_ATTEMPTS = 64
DEFAULT_CUBIC_CLASS_NUMBER_MAX_RELATIONS = 128
DEFAULT_CUBIC_CLASS_NUMBER_MAX_CANDIDATES_PER_IDEAL = 64
DEFAULT_CUBIC_CLASS_NUMBER_MAX_QUOTIENT_ORDER = 4096
DEFAULT_CUBIC_CLASS_NUMBER_MAX_PROJECTIVE_LINES = 128
DEFAULT_CUBIC_CLASS_NUMBER_MAX_MODULUS = 31
DEFAULT_CUBIC_CLASS_NUMBER_MAX_RESIDUE_STATES = 500_000
_CUBIC_CLASS_NUMBER_REPLAY_MAX_RELATION_ATTEMPTS = 4096
_CUBIC_CLASS_NUMBER_REPLAY_MAX_RELATIONS = 4096
_CUBIC_CLASS_NUMBER_REPLAY_MAX_CANDIDATES_PER_IDEAL = 65536
_CUBIC_CLASS_NUMBER_REPLAY_MAX_QUOTIENT_ORDER = 1_000_000
_CUBIC_CLASS_NUMBER_REPLAY_MAX_PROJECTIVE_LINES = 4096
_CUBIC_CLASS_NUMBER_REPLAY_MAX_MODULUS = 257
_CUBIC_CLASS_NUMBER_REPLAY_MAX_RESIDUE_STATES = 20_000_000
_CUBIC_NORM_FORM_X_SLICE = 8
_CUBIC_RELATION_SIEVE_BOUND = 2
_CUBIC_RELATION_SIEVE_MAX_CANDIDATES = 128
_CUBIC_RELATION_SIEVE_MAX_PRIME_POWERS = 256
_cubic_norm_form_kernel_override: Any = None
_cubic_relation_sieve_kernel_override: Any = None


def _freeze_authentication_value(value: Any) -> Any:
    """Return an exact immutable snapshot of one JSON-safe value."""
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (list, tuple)):
        return tuple(_freeze_authentication_value(item) for item in value)
    if isinstance(value, dict):
        if not all(isinstance(key, str) for key in value):
            raise TypeError("authentication snapshot keys must be strings")
        return tuple(
            (key, _freeze_authentication_value(value[key])) for key in sorted(value)
        )
    raise TypeError("authentication snapshots require JSON-safe values")


def _check_cubic_cancelled(cancelled: Callable[[], bool] | None) -> None:
    runtime.check_interrupt()
    if cancelled is not None and cancelled():
        raise RuntimeError("class/unit computation cancelled")


def _integer_rational(value: Any, name: str) -> int:
    rational = sage.QQ(value)
    if rational._denominator != 1:
        raise ArithmeticError(name + " is not an integer")
    return int(rational._numerator)


def _cubic_norm_form_coefficients(ideal: Any) -> tuple[int, ...]:
    """Return the ten integral coefficients of an ideal's ternary norm form."""
    if not ideal.is_integral() or ideal.is_zero():
        raise ValueError("a cubic norm form requires a nonzero integral ideal")
    basis = tuple(ideal.basis())
    if len(basis) != 3:
        raise ValueError("a cubic ideal must have three basis elements")

    def norm(element: Any) -> int:
        return _integer_rational(element.norm(), "an integral element norm")

    b0, b1, b2 = basis
    c300, c030, c003 = norm(b0), norm(b1), norm(b2)

    def pair(left: Any, right: Any, left_cube: int, right_cube: int) -> tuple[int, int]:
        plus = norm(left + right) - left_cube - right_cube
        minus = norm(left - right) - left_cube + right_cube
        if (plus + minus) % 2 or (plus - minus) % 2:
            raise ArithmeticError("a cubic norm form did not interpolate integrally")
        return (plus - minus) // 2, (plus + minus) // 2

    c210, c120 = pair(b0, b1, c300, c030)
    c201, c102 = pair(b0, b2, c300, c003)
    c021, c012 = pair(b1, b2, c030, c003)
    c111 = norm(b0 + b1 + b2) - (
        c300 + c030 + c003 + c210 + c201 + c120 + c021 + c102 + c012
    )
    return (c300, c030, c003, c210, c201, c120, c021, c102, c012, c111)


def _cubic_norm_form_value(
    coefficients: tuple[int, ...], x: int, y: int, z: int
) -> int:
    c300, c030, c003, c210, c201, c120, c021, c102, c012, c111 = coefficients
    return (
        c300 * x * x * x
        + c030 * y * y * y
        + c003 * z * z * z
        + c210 * x * x * y
        + c201 * x * x * z
        + c120 * x * y * y
        + c021 * y * y * z
        + c102 * x * z * z
        + c012 * y * z * z
        + c111 * x * y * z
    )


def _packed_cubic_relation_candidates(
    order: Any,
    factor_base: tuple[Any, ...],
    *,
    maximum_candidates: int,
    cancelled: Callable[[], bool] | None,
) -> tuple[tuple[tuple[int, ...], tuple[int, ...], int], ...] | None:
    """Propose small integral relations through two packed exact kernels.

    The first kernel enumerates a canonical cubic coefficient box and retains
    only elements whose rational norm is supported on factor-base rational
    primes.  The second computes all prime-ideal valuations in one packed
    lattice pass.  These rows are only proposals: the collector independently
    proves generator containment and equal ideal norm before admission.
    """
    if not factor_base or len(factor_base) > 16 or maximum_candidates < 1:
        return None
    _check_cubic_cancelled(cancelled)
    kernel_module = __import__(
        "sagejs.number_fields.bl_composite_kernel", fromlist=["bl_composite_kernel"]
    )
    candidate_kernel = getattr(
        kernel_module, "packed_cubic_norm_smooth_candidates_in_place", None
    )
    row_kernel = getattr(kernel_module, "packed_factor_base_rows_in_place", None)
    if isinstance(_cubic_relation_sieve_kernel_override, tuple):
        candidate_kernel, row_kernel = _cubic_relation_sieve_kernel_override
    elif _cubic_relation_sieve_kernel_override is False:
        return None
    if not callable(candidate_kernel) or not callable(row_kernel):
        return None
    native_module = __import__("sagejs.native", fromlist=["native"])
    ideal_module = __import__(
        "sagejs.number_fields.ideal_arithmetic", fromlist=["ideal_arithmetic"]
    )
    capacity = min(_CUBIC_RELATION_SIEVE_MAX_CANDIDATES, maximum_candidates)
    rational_primes = sorted(
        {int(prime_ideal.rational_prime()) for prime_ideal in factor_base}
    )
    coefficients: tuple[int, ...] | None = None
    coefficient_kernel = getattr(
        kernel_module, "packed_cubic_order_norm_form_coefficients_in_place", None
    )
    if callable(coefficient_kernel):
        try:
            maximal_module = __import__(
                "sagejs.number_fields.maximal_order", fromlist=["maximal_order"]
            )
            table = maximal_module._nf_order_multiplication_table(order)
            packed_table = tuple(
                _integer_rational(
                    table[left][right][coordinate],
                    "an order multiplication-table entry",
                )
                for left in range(3)
                for right in range(3)
                for coordinate in range(3)
            )
            coefficient_output = native_module.kernel_integer_zeros(
                coefficient_kernel, 10, 16
            )
            if coefficient_kernel(
                coefficient_output,
                native_module.kernel_integer_buffer(coefficient_kernel, packed_table),
            ):
                values = tuple(
                    int(value)
                    for value in native_module.integer_buffer_values(coefficient_output)
                )
                if len(values) == 10:
                    coefficients = values
        except (ImportError, OverflowError, RuntimeError, TypeError, ValueError):
            coefficients = None
    if coefficients is None:
        coefficients = _cubic_norm_form_coefficients(order.ideal(1))
    try:
        metadata = native_module.kernel_integer_zeros(candidate_kernel, 4, 1)
        coefficient_output = native_module.kernel_integer_zeros(
            candidate_kernel, 3 * capacity, 16
        )
        norm_output = native_module.kernel_integer_zeros(candidate_kernel, capacity, 16)
        if not candidate_kernel(
            metadata,
            coefficient_output,
            norm_output,
            native_module.kernel_integer_buffer(candidate_kernel, coefficients),
            native_module.kernel_integer_buffer(candidate_kernel, rational_primes),
            _CUBIC_RELATION_SIEVE_BOUND,
            capacity,
        ):
            return None
        metadata_values = tuple(
            int(value) for value in native_module.integer_buffer_values(metadata)
        )
        if (
            len(metadata_values) != 4
            or metadata_values[2] != 0
            or metadata_values[3] != _CUBIC_RELATION_SIEVE_BOUND
        ):
            return None
        candidate_count = runtime.number(metadata_values[0])
        if candidate_count < 1 or candidate_count > capacity:
            return None
        packed_coefficients = tuple(
            int(value)
            for value in native_module.integer_buffer_values(coefficient_output)
        )
        packed_norms = tuple(
            int(value) for value in native_module.integer_buffer_values(norm_output)
        )
        coefficient_vectors = packed_coefficients[: 3 * candidate_count]
        absolute_norms = packed_norms[:candidate_count]
        if any(value <= 1 for value in absolute_norms):
            return None

        factor_norms = tuple(
            _integer_rational(prime_ideal.norm(), "a factor-base norm")
            for prime_ideal in factor_base
        )
        maxima: list[int] = []
        for factor_norm in factor_norms:
            maximum = 0
            for norm in absolute_norms:
                current = norm
                valuation = 0
                while current % factor_norm == 0:
                    current //= factor_norm
                    valuation += 1
                maximum = max(maximum, valuation)
            maxima.append(maximum)
        if sum(maxima) < 1 or sum(maxima) > _CUBIC_RELATION_SIEVE_MAX_PRIME_POWERS:
            return None
        offsets = [0]
        prime_power_numerators: list[int] = []
        prime_power_denominators: list[int] = []
        for prime_ideal, maximum in zip(factor_base, maxima, strict=True):
            powers = prime_ideal._valuation_power_cache
            while len(powers) < maximum:
                powers.append(powers[-1] * prime_ideal)
            for index in range(maximum):
                packed_basis, denominator = ideal_module._packed_ideal_basis(
                    powers[index]
                )
                prime_power_numerators.extend(packed_basis)
                prime_power_denominators.append(int(denominator))
            offsets.append(len(prime_power_denominators))
        unit_numerators, unit_denominator = ideal_module._packed_ideal_basis(
            order.ideal(1)
        )
        row_metadata = native_module.kernel_integer_zeros(row_kernel, 3, 1)
        row_output = native_module.kernel_integer_zeros(
            row_kernel, candidate_count * len(factor_base), 16
        )
        smooth_output = native_module.kernel_integer_zeros(
            row_kernel, candidate_count, 1
        )
        if not row_kernel(
            row_metadata,
            row_output,
            smooth_output,
            native_module.kernel_integer_zeros(row_kernel, 6, 16),
            native_module.kernel_integer_buffer(row_kernel, coefficient_vectors),
            native_module.kernel_integer_buffer(row_kernel, absolute_norms),
            native_module.kernel_integer_buffer(row_kernel, unit_numerators),
            native_module.kernel_integer_buffer(row_kernel, prime_power_numerators),
            native_module.kernel_integer_buffer(row_kernel, prime_power_denominators),
            native_module.kernel_integer_buffer(row_kernel, offsets),
            native_module.kernel_integer_buffer(row_kernel, factor_norms),
            unit_denominator,
            3,
            candidate_count,
            len(factor_base),
            len(prime_power_denominators),
        ):
            return None
        row_values = tuple(
            int(value) for value in native_module.integer_buffer_values(row_output)
        )
        smooth_values = tuple(
            int(value) for value in native_module.integer_buffer_values(smooth_output)
        )
    except (ImportError, OverflowError, RuntimeError, TypeError, ValueError):
        return None

    answer: list[tuple[tuple[int, ...], tuple[int, ...], int]] = []
    for candidate in range(candidate_count):
        _check_cubic_cancelled(cancelled)
        if smooth_values[candidate] != 1:
            continue
        coordinates = coefficient_vectors[3 * candidate : 3 * candidate + 3]
        offset = candidate * len(factor_base)
        row = tuple(row_values[offset : offset + len(factor_base)])
        answer.append((row, tuple(coordinates), absolute_norms[candidate]))
    return tuple(answer)


def _select_cubic_relation_candidates(
    matrix_module: Any,
    initial_rows: tuple[tuple[int, ...], ...],
    candidates: tuple[tuple[tuple[int, ...], tuple[int, ...], int], ...],
    width: int,
) -> tuple[tuple[tuple[int, ...], tuple[int, ...], int], ...] | None:
    """Select original rows supporting the exact HNF lattice basis.

    The provisional packed rows are not proof evidence.  We extract their
    canonical HNF, retain every original row used by its nonzero left-transform
    rows, and recompute the HNF from that subset.  Only when the canonical
    nonzero HNF basis is identical do the selected proposals proceed to the
    independent ideal-containment admission boundary.
    """
    if not candidates:
        return ()
    source_rows = list(initial_rows) + [entry[0] for entry in candidates]
    try:
        basis, source_support = matrix_module.exact_relation_hnf_support(
            source_rows, width
        )
        rank = len(basis)
        if rank < 1:
            return None
        initial_count = len(initial_rows)
        selected_indices = sorted(
            index - initial_count for index in source_support if index >= initial_count
        )
        if any(index < 0 or index >= len(candidates) for index in selected_indices):
            return None
        target_index = (
            abs(matrix_module._determinant_exact(basis)) if rank == width else None
        )
        cursor = 0
        while cursor < len(selected_indices):
            trial_indices = selected_indices[:cursor] + selected_indices[cursor + 1 :]
            trial_rows = list(initial_rows) + [
                candidates[index][0] for index in trial_indices
            ]
            if len(trial_rows) < rank:
                cursor += 1
                continue
            if target_index is not None and len(trial_rows) == width:
                # These rows generate a sublattice of the authenticated full
                # source lattice.  Equal nonzero determinant gives equal
                # index in `Z^width`, hence the same lattice, without another
                # HNF and transform construction for every deletion trial.
                same_lattice = (
                    abs(matrix_module._determinant_exact(trial_rows)) == target_index
                )
            else:
                trial_basis = matrix_module.exact_relation_hnf_basis(trial_rows, width)
                same_lattice = trial_basis == basis
            if same_lattice:
                selected_indices = trial_indices
            else:
                cursor += 1
        # `exact_relation_hnf_support()` has replayed its unimodular left
        # transform.  The HNF basis therefore lies in the lattice of these
        # selected source rows, while those rows are a subset of the original
        # lattice.  The deletion pass keeps that basis identical while
        # removing individually redundant proposals.
        return tuple(candidates[index] for index in selected_indices)
    except (ArithmeticError, TypeError, ValueError):
        return None


def _select_cubic_dependency_candidates(
    selected: tuple[tuple[tuple[int, ...], tuple[int, ...], int], ...],
    candidates: tuple[tuple[tuple[int, ...], tuple[int, ...], int], ...],
    maximum: int,
) -> tuple[tuple[tuple[int, ...], tuple[int, ...], int], ...]:
    """Retain bounded duplicate rows that can seed exact unit dependencies.

    Two distinct principal elements with the same factor-base valuation row
    have a unit quotient.  The class-number-only presentation does not need
    such duplicate rows, but a coupled class/unit fallback does.  Keep them
    only after the class-number proof has already failed, and let the ordinary
    exact relation admission boundary authenticate every proposed element.
    """
    limit = max(0, int(maximum))
    if limit == 0 or not selected:
        return ()
    retained_coordinates = [
        (tuple(int(value) for value in row), tuple(int(value) for value in coordinates))
        for row, coordinates, _norm in selected
    ]
    selected_rows = tuple(tuple(int(value) for value in entry[0]) for entry in selected)
    answer: list[tuple[tuple[int, ...], tuple[int, ...], int]] = []
    for selected_row in selected_rows:
        for candidate in candidates:
            row, coordinates, _norm = candidate
            identity = (
                tuple(int(value) for value in row),
                tuple(int(value) for value in coordinates),
            )
            same_row = len(identity[0]) == len(selected_row) and all(
                left == right
                for left, right in zip(identity[0], selected_row, strict=True)
            )
            already_retained = any(
                len(known_row) == len(identity[0])
                and len(known_coordinates) == len(identity[1])
                and all(
                    left == right
                    for left, right in zip(known_row, identity[0], strict=True)
                )
                and all(
                    left == right
                    for left, right in zip(known_coordinates, identity[1], strict=True)
                )
                for known_row, known_coordinates in retained_coordinates
            )
            if not same_row or already_retained:
                continue
            retained_coordinates.append(identity)
            answer.append(candidate)
            break
        if len(answer) >= limit:
            break
    return tuple(answer)


def _readable_cubic_norm_form_represents_targets(
    coefficients: tuple[int, ...],
    modulus: int,
    positive_target: int,
    negative_target: int,
    *,
    cancelled: Callable[[], bool] | None,
) -> bool:
    sequence = 0
    for x in range(modulus):
        for y in range(modulus):
            for z in range(modulus):
                if sequence % 256 == 0:
                    _check_cubic_cancelled(cancelled)
                sequence += 1
                value = _cubic_norm_form_value(coefficients, x, y, z) % modulus
                if value == positive_target or value == negative_target:
                    return True
    return False


def _cubic_norm_form_represents_targets(
    coefficients: tuple[int, ...],
    modulus: int,
    positive_target: int,
    negative_target: int,
    *,
    cancelled: Callable[[], bool] | None,
) -> bool:
    """Use the packed exact kernel, or the same readable exhaustive search."""
    kernel_module = __import__(
        "sagejs.number_fields.bl_composite_kernel", fromlist=["bl_composite_kernel"]
    )
    kernel = (
        kernel_module.packed_cubic_norm_form_target_slice
        if _cubic_norm_form_kernel_override is None
        else _cubic_norm_form_kernel_override
    )
    if kernel is not False:
        try:
            native_module = __import__("sagejs.native", fromlist=["native"])
            packed_coefficients = native_module.kernel_integer_buffer(
                kernel, coefficients
            )
            x_start = 0
            while x_start < modulus:
                _check_cubic_cancelled(cancelled)
                x_stop = min(modulus, x_start + _CUBIC_NORM_FORM_X_SLICE)
                status = int(
                    kernel(
                        packed_coefficients,
                        modulus,
                        x_start,
                        x_stop,
                        positive_target,
                        negative_target,
                    )
                )
                if status == 2:
                    return True
                if status != 1:
                    break
                x_start = x_stop
            if x_start == modulus:
                return False
        except (OverflowError, RuntimeError, TypeError, ValueError):
            pass
    return _readable_cubic_norm_form_represents_targets(
        coefficients,
        modulus,
        positive_target,
        negative_target,
        cancelled=cancelled,
    )


def _prime_divisors_bounded(value: int) -> tuple[int, ...]:
    remaining = _positive_integer(value, "class-number quotient order")
    answer: list[int] = []
    prime = 2
    while prime * prime <= remaining:
        if remaining % prime == 0:
            answer.append(prime)
            while remaining % prime == 0:
                remaining //= prime
        prime = 3 if prime == 2 else prime + 2
    if remaining > 1:
        answer.append(remaining)
    return tuple(answer)


def _projective_line_specs(
    presentation: Any, *, max_lines: int
) -> tuple[dict[str, Any], ...]:
    """Enumerate canonical lines in `Q[p]` for every `p | |Q|`."""
    invariants = tuple(int(value) for value in presentation.invariants)
    order = _positive_integer(presentation.order, "class-number quotient order")
    answer: list[dict[str, Any]] = []
    for prime in _prime_divisors_bounded(order):
        active = tuple(
            index for index, value in enumerate(invariants) if value % prime == 0
        )
        dimension = len(active)
        if dimension == 0:
            raise ArithmeticError("quotient p-torsion has no invariant component")
        line_count = (prime**dimension - 1) // (prime - 1)
        if len(answer) + line_count > max_lines:
            raise ValueError("quotient p-torsion has too many projective lines")
        for pivot in range(dimension):
            tail_count = prime ** (dimension - pivot - 1)
            for tail_number in range(tail_count):
                line = [0] * dimension
                line[pivot] = 1
                cursor = tail_number
                for index in range(dimension - 1, pivot, -1):
                    line[index] = cursor % prime
                    cursor //= prime
                coordinates = [0] * len(invariants)
                for index, component in enumerate(active):
                    coordinates[component] = line[index] * (
                        invariants[component] // prime
                    )
                ambient = presentation.lift_class_coordinates(coordinates)
                answer.append(
                    {
                        "prime": prime,
                        "line": line,
                        "class_coordinates": coordinates,
                        "ambient_row": list(ambient),
                    }
                )
    return tuple(answer)


def _find_cubic_norm_obstruction(
    ideal: Any,
    line: dict[str, Any],
    *,
    max_modulus: int,
    remaining_states: int,
    cancelled: Callable[[], bool] | None,
) -> tuple[dict[str, Any] | None, int]:
    integral = ideal.numerator()
    norm = _integer_rational(integral.norm(), "an integral ideal norm")
    coefficients = _cubic_norm_form_coefficients(integral)
    used = 0
    for modulus in range(2, max_modulus + 1):
        if not sage.is_prime(modulus):
            continue
        states = modulus**3
        if used + states > remaining_states:
            return None, used
        positive_target = norm % modulus
        negative_target = (-norm) % modulus
        represented = _cubic_norm_form_represents_targets(
            coefficients,
            modulus,
            positive_target,
            negative_target,
            cancelled=cancelled,
        )
        used += states
        if not represented:
            return (
                {
                    **line,
                    "integral_ideal": integral.to_dict(),
                    "ideal_norm": norm,
                    "norm_form_coefficients": list(coefficients),
                    "modulus": modulus,
                    "residue_states": states,
                },
                used,
            )
    return None, used


def _verify_cubic_norm_obstruction(
    order: Any,
    factor_base: tuple[Any, ...],
    expected_line: dict[str, Any],
    evidence: dict[str, Any],
    *,
    max_modulus: int,
    cancelled: Callable[[], bool] | None,
) -> bool:
    try:
        if set(evidence) != {
            "prime",
            "line",
            "class_coordinates",
            "ambient_row",
            "integral_ideal",
            "ideal_norm",
            "norm_form_coefficients",
            "modulus",
            "residue_states",
        }:
            return False
        for name in ("prime", "line", "class_coordinates", "ambient_row"):
            if evidence[name] != expected_line[name]:
                return False
        modulus = _positive_integer(evidence["modulus"], "obstruction modulus")
        if modulus > max_modulus or not sage.is_prime(modulus):
            return False
        if evidence["residue_states"] != modulus**3:
            return False
        relations = __import__(
            "sagejs.number_fields.class_group_relations",
            fromlist=["class_group_relations"],
        )
        reconstructed = relations.reconstruct_factor_base_ideal(
            order, factor_base, evidence["ambient_row"]
        ).numerator()
        stored = order.ideal_from_dict(evidence["integral_ideal"])
        if stored != reconstructed or not stored.is_integral():
            return False
        norm = _integer_rational(stored.norm(), "an integral ideal norm")
        coefficients = _cubic_norm_form_coefficients(stored)
        if evidence["ideal_norm"] != norm or evidence["norm_form_coefficients"] != list(
            coefficients
        ):
            return False
        # Detached verification deliberately keeps the readable exhaustive
        # loop independent of the producer's compiled search boundary.
        return not _readable_cubic_norm_form_represents_targets(
            coefficients,
            modulus,
            norm % modulus,
            (-norm) % modulus,
            cancelled=cancelled,
        )
    except (
        ImportError,
        AttributeError,
        TypeError,
        ValueError,
        ArithmeticError,
        KeyError,
    ):
        return False


class CubicMinkowskiClassNumberCertificate:
    """Detached exact cubic class-number proof from relations and norm obstructions."""

    def __init__(
        self,
        field: Any,
        *,
        plan: dict[str, Any],
        factor_base: list[dict[str, Any]],
        relations: list[dict[str, Any]],
        presentation: dict[str, Any],
        obstructions: list[dict[str, Any]],
        caps: dict[str, Any],
        _live_presentation: Any = None,
        _live_token: object | None = None,
    ) -> None:
        if int(field.degree()) != 3:
            raise ValueError("the Minkowski class-number certificate requires a cubic")
        tree = {
            "plan": plan,
            "factor_base": factor_base,
            "relations": relations,
            "presentation": presentation,
            "obstructions": obstructions,
            "caps": caps,
        }
        # Detached callers must pass the immutable verifier preflight before
        # any canonicalization or matrix replay.  The private live producer
        # reaches this constructor only after enforcing the same factor-base,
        # relation, quotient, projective-line, modulus, residue-work, and
        # memory caps at their individual construction boundaries.
        if (
            _live_token is not _LIVE_CUBIC_CERTIFICATE_TOKEN
            and not _cubic_minkowski_payload_within_caps(tree)
        ):
            raise ValueError("cubic class-number evidence exceeds replay limits")
        self.field = field
        self._plan_json = _canonical_json(plan)
        self._factor_base_json = _canonical_json(factor_base)
        self._relations_json = _canonical_json(relations)
        self._presentation_json = _canonical_json(presentation)
        self._obstructions_json = _canonical_json(obstructions)
        self._caps_json = _canonical_json(caps)
        self.proof_status = "exact-unconditional"
        self.source = "exact Minkowski relations with modular cubic norm obstructions"
        # Keep one canonical immutable body instead of reparsing all six
        # component strings and serializing the resulting tree again whenever
        # the certificate is hashed or exported.  The explicit key order below
        # is the lexicographic order used by `_canonical_json`, so this remains
        # byte-for-byte compatible with the detached certificate format.
        self._body_json = (
            '{"caps":'
            + self._caps_json
            + ',"factor_base":'
            + self._factor_base_json
            + ',"obstructions":'
            + self._obstructions_json
            + ',"plan":'
            + self._plan_json
            + ',"presentation":'
            + self._presentation_json
            + ',"proof_status":'
            + _canonical_json(self.proof_status)
            + ',"relations":'
            + self._relations_json
            + ',"schema":'
            + _canonical_json(CUBIC_CLASS_NUMBER_CERTIFICATE_SCHEMA)
            + "}"
        )
        self._content_sha256 = hashlib.sha256(
            self._body_json.encode("utf-8")
        ).hexdigest()
        if _live_token is _LIVE_CUBIC_CERTIFICATE_TOKEN:
            serializer = getattr(_live_presentation, "to_dict", None)
            if (
                not callable(serializer)
                or serializer() != presentation
                or getattr(_live_presentation, "order", None) is None
            ):
                raise ValueError(
                    "live cubic presentation authority does not match its payload"
                )
            self._class_number = int(_live_presentation.order)
        else:
            matrix_module = __import__(
                "sagejs.number_fields.class_group_matrix",
                fromlist=["class_group_matrix"],
            )
            presentation_replay = matrix_module.RelationPresentation.from_dict(
                presentation
            )
            if presentation_replay.order is None:
                raise ValueError(
                    "a cubic class-number certificate must have finite order"
                )
            self._class_number = int(presentation_replay.order)
        runtime.object.freeze(self)

    @property
    def plan(self) -> dict[str, Any]:
        return json.loads(self._plan_json)

    @property
    def factor_base(self) -> list[dict[str, Any]]:
        return json.loads(self._factor_base_json)

    @property
    def relations(self) -> list[dict[str, Any]]:
        return json.loads(self._relations_json)

    @property
    def presentation(self) -> dict[str, Any]:
        return json.loads(self._presentation_json)

    @property
    def obstructions(self) -> list[dict[str, Any]]:
        return json.loads(self._obstructions_json)

    @property
    def caps(self) -> dict[str, Any]:
        return json.loads(self._caps_json)

    @property
    def class_number(self) -> int:
        return self._class_number

    def _body_dict(self) -> dict[str, Any]:
        return json.loads(self._body_json)

    def to_dict(self) -> dict[str, Any]:
        body = self._body_dict()
        body["content_sha256"] = self._content_sha256
        return body

    def stable_hash(self) -> str:
        return self._content_sha256

    def verify(self, *, cancelled: Callable[[], bool] | None = None) -> bool:
        try:
            if (
                hashlib.sha256(self._body_json.encode("utf-8")).hexdigest()
                != self._content_sha256
            ):
                return False
            caps = self.caps
            replay_limits = {
                "max_relation_attempts": _CUBIC_CLASS_NUMBER_REPLAY_MAX_RELATION_ATTEMPTS,
                "max_relations": _CUBIC_CLASS_NUMBER_REPLAY_MAX_RELATIONS,
                "max_candidates_per_ideal": _CUBIC_CLASS_NUMBER_REPLAY_MAX_CANDIDATES_PER_IDEAL,
                "max_quotient_order": _CUBIC_CLASS_NUMBER_REPLAY_MAX_QUOTIENT_ORDER,
                "max_projective_lines": _CUBIC_CLASS_NUMBER_REPLAY_MAX_PROJECTIVE_LINES,
                "max_modulus": _CUBIC_CLASS_NUMBER_REPLAY_MAX_MODULUS,
                "max_residue_states": _CUBIC_CLASS_NUMBER_REPLAY_MAX_RESIDUE_STATES,
            }
            for name, limit in replay_limits.items():
                if _positive_integer(caps[name], name.replace("_", " ")) > limit:
                    return False
            factor_base_module = __import__(
                "sagejs.number_fields.class_group_factor_base",
                fromlist=["class_group_factor_base"],
            )
            stored_plan = self.plan
            plan_caps = stored_plan["caps"]
            for name, limit in (
                ("max_bound", _CUBIC_MINKOWSKI_REPLAY_MAX_BOUND),
                (
                    "max_rational_primes",
                    _CUBIC_MINKOWSKI_REPLAY_MAX_RATIONAL_PRIMES,
                ),
                ("max_prime_ideals", _CUBIC_MINKOWSKI_REPLAY_MAX_PRIME_IDEALS),
                ("max_memory_bytes", _CUBIC_MINKOWSKI_REPLAY_MAX_MEMORY_BYTES),
            ):
                if _positive_integer(plan_caps[name], name.replace("_", " ")) > limit:
                    return False
            plan = factor_base_module.factor_base_plan(
                self.field.maximal_order(),
                proof=True,
                theorem="minkowski",
                max_bound=_positive_integer(plan_caps["max_bound"], "maximum bound"),
                max_rational_primes=_positive_integer(
                    plan_caps["max_rational_primes"], "maximum rational primes"
                ),
                max_prime_ideals=_positive_integer(
                    plan_caps["max_prime_ideals"], "maximum prime ideals"
                ),
                max_memory_bytes=_positive_integer(
                    plan_caps["max_memory_bytes"], "maximum memory bytes"
                ),
            )
            if plan.to_dict() != stored_plan or tuple(plan.assumptions):
                return False
            factor_records = factor_base_module.build_factor_base(plan)
            if [record.to_dict() for record in factor_records] != self.factor_base:
                return False
            factor_base = tuple(record.prime_ideal for record in factor_records)
            relation_module = __import__(
                "sagejs.number_fields.class_group_relations",
                fromlist=["class_group_relations"],
            )
            relation_payloads = self.relations
            if len(relation_payloads) > int(caps["max_relations"]):
                return False
            relation_records = tuple(
                relation_module.RelationRecord.from_dict(payload)
                for payload in relation_payloads
            )
            order = self.field.maximal_order()
            reconstructor = relation_module.FactorBaseIdealReconstructor(
                order, factor_base
            )
            for sequence, record in enumerate(relation_records):
                if sequence % 4 == 0:
                    _check_cubic_cancelled(cancelled)
                if (
                    record.verify(order, factor_base, reconstructor=reconstructor)[
                        "certified"
                    ]
                    is not True
                ):
                    return False
            matrix_module = __import__(
                "sagejs.number_fields.class_group_matrix",
                fromlist=["class_group_matrix"],
            )
            presentation = matrix_module.RelationPresentation.from_dict(
                self.presentation
            )
            if (
                not presentation.verify()
                or presentation.column_count != len(factor_base)
                or presentation.rank != len(factor_base)
                or [row.dense() for row in presentation.relation_rows]
                != [list(record.row) for record in relation_records]
                or presentation.order is None
                or int(presentation.order) > int(caps["max_quotient_order"])
            ):
                return False
            expected_lines = _projective_line_specs(
                presentation, max_lines=int(caps["max_projective_lines"])
            )
            if len(expected_lines) > int(caps["max_projective_lines"]) or len(
                expected_lines
            ) != len(self.obstructions):
                return False
            used_states = 0
            for expected, evidence in zip(
                expected_lines, self.obstructions, strict=True
            ):
                used_states += _positive_integer(
                    evidence["residue_states"], "residue states"
                )
                if used_states > int(caps["max_residue_states"]):
                    return False
                if not _verify_cubic_norm_obstruction(
                    order,
                    factor_base,
                    expected,
                    evidence,
                    max_modulus=int(caps["max_modulus"]),
                    cancelled=cancelled,
                ):
                    return False
            return True
        except RuntimeError as error:
            if str(error) == "class/unit computation cancelled":
                raise
            return False
        except (
            ImportError,
            AttributeError,
            TypeError,
            ValueError,
            ArithmeticError,
            KeyError,
        ):
            return False

    @classmethod
    def from_dict(
        cls,
        field: Any,
        payload: dict[str, Any],
        *,
        cancelled: Callable[[], bool] | None = None,
    ) -> CubicMinkowskiClassNumberCertificate:
        if not isinstance(payload, dict):
            raise TypeError("a cubic class-number certificate must be a dictionary")
        if not _cubic_minkowski_payload_within_caps(payload):
            raise ValueError("cubic class-number evidence exceeds replay limits")
        expected = {
            "schema",
            "plan",
            "factor_base",
            "relations",
            "presentation",
            "obstructions",
            "caps",
            "proof_status",
            "content_sha256",
        }
        if set(payload) != expected:
            raise ValueError("a cubic class-number certificate has unexpected fields")
        if payload.get("schema") != CUBIC_CLASS_NUMBER_CERTIFICATE_SCHEMA:
            raise ValueError("unsupported cubic class-number certificate schema")
        if payload.get("proof_status") != "exact-unconditional":
            raise ValueError(
                "a cubic class-number certificate has the wrong proof status"
            )
        content_hash = payload.get("content_sha256")
        if (
            not isinstance(content_hash, str)
            or len(content_hash) != 64
            or any(character not in "0123456789abcdef" for character in content_hash)
        ):
            raise ValueError("a cubic class-number certificate has an invalid hash")
        body = dict(payload)
        del body["content_sha256"]
        if _content_hash(body) != content_hash:
            raise ValueError("cubic class-number certificate content hash mismatch")
        answer = cls(
            field,
            plan=payload["plan"],
            factor_base=payload["factor_base"],
            relations=payload["relations"],
            presentation=payload["presentation"],
            obstructions=payload["obstructions"],
            caps=payload["caps"],
        )
        if answer.to_dict() != payload or not answer.verify(cancelled=cancelled):
            raise ValueError("cubic class-number certificate exact replay failed")
        return answer


class CubicClassNumberResult:
    """A bounded cubic class-number result with retained exact seed artifacts."""

    def __init__(
        self,
        field: Any,
        complete: bool,
        reason: str,
        minkowski_bound: int,
        *,
        certificate: CubicMinkowskiClassNumberCertificate | None = None,
        factor_base: tuple[Any, ...] = (),
        relation_records: tuple[Any, ...] = (),
        presentation: Any = None,
        diagnostics: dict[str, Any] | None = None,
    ) -> None:
        if complete and certificate is None:
            raise ValueError("a complete cubic class number needs a certificate")
        self.field = field
        self.complete = bool(complete)
        self.reason = str(reason)
        self.minkowski_bound = int(minkowski_bound)
        self.certificate = certificate
        self.factor_base = tuple(factor_base)
        self.relation_records = tuple(relation_records)
        self.presentation = presentation
        self.diagnostics = dict({} if diagnostics is None else diagnostics)
        self.proof_status = "exact-unconditional" if complete else "incomplete"

    def order(self) -> int:
        if not self.complete or self.certificate is None:
            raise ValueError("an incomplete cubic class-number search has no order")
        return int(self.certificate.class_number)

    def __repr__(self) -> str:
        if self.complete:
            return "Certified cubic class number " + str(self.order())
        return "Incomplete cubic class-number search (" + self.reason + ")"


def _cubic_relation_seed_snapshot(seed: Any) -> Any:
    """Snapshot every proof-bearing object in one live relation prefix."""
    result = seed._source_result
    return _freeze_authentication_value(
        {
            "schema": AUTHENTICATED_CUBIC_RELATION_SEED_SCHEMA,
            "result": {
                "complete": result.complete,
                "reason": result.reason,
                "minkowski_bound": result.minkowski_bound,
                "proof_status": result.proof_status,
                "diagnostics": result.diagnostics,
            },
            "plan": seed.plan.to_dict(),
            "factor_records": [record.to_dict() for record in seed.factor_records],
            "factor_base": [ideal.to_dict() for ideal in result.factor_base],
            "relations": [record.to_dict() for record in result.relation_records],
            "presentation": result.presentation.to_dict(),
            "search_state": seed.search_state.to_dict(),
        }
    )


class _AuthenticatedCubicRelationSeed:
    """Producer-issued live relation prefix for the coupled engine."""

    def __init__(
        self,
        token: object,
        result: CubicClassNumberResult,
        plan: Any,
        factor_records: tuple[Any, ...],
        collector: Any,
        presentation: Any,
        search_state: Any,
    ) -> None:
        if token is not _AUTHENTICATED_CUBIC_RELATION_SEED_TOKEN:
            raise TypeError("cubic relation seeds are module-issued")
        if type(result) is not CubicClassNumberResult or result.complete:
            raise ValueError("a cubic relation seed needs an incomplete result")
        self.schema = AUTHENTICATED_CUBIC_RELATION_SEED_SCHEMA
        self._source_result = result
        self.field = result.field
        self.plan = plan
        self.factor_records = tuple(factor_records)
        self.factor_base = tuple(result.factor_base)
        self.collector = collector
        self.presentation = presentation
        self.search_state = search_state
        self._snapshot = _cubic_relation_seed_snapshot(self)
        self.__dict__["_frozen"] = True

    def __setattr__(self, name: str, value: Any) -> None:
        if self.__dict__.get("_frozen", False):
            raise AttributeError("authenticated cubic relation seeds are immutable")
        self.__dict__[name] = value

    @property
    def certified(self) -> bool:
        try:
            result = self._source_result
            order = self.field.maximal_order()
            return bool(
                type(result) is CubicClassNumberResult
                and result.field is self.field
                and not result.complete
                and self.plan.order is order
                and not tuple(self.plan.assumptions)
                and "Minkowski" in str(self.plan.theorem)
                and tuple(result.factor_base) == self.factor_base
                and len(self.factor_records) == len(self.factor_base)
                and all(
                    record.prime_ideal is ideal
                    for record, ideal in zip(
                        self.factor_records, self.factor_base, strict=True
                    )
                )
                and self.collector.order is order
                and len(self.collector.factor_base) == len(self.factor_base)
                and all(
                    retained is supplied
                    for retained, supplied in zip(
                        self.collector.factor_base, self.factor_base, strict=True
                    )
                )
                and len(self.collector.records) == len(result.relation_records)
                and all(
                    retained is supplied
                    for retained, supplied in zip(
                        self.collector.records,
                        result.relation_records,
                        strict=True,
                    )
                )
                and result.presentation is self.presentation
                and self._snapshot == _cubic_relation_seed_snapshot(self)
            )
        except (AttributeError, TypeError, ValueError, ArithmeticError):
            return False


def _issue_cubic_relation_seed(
    result: CubicClassNumberResult,
    plan: Any,
    factor_records: tuple[Any, ...],
    collector: Any,
    presentation: Any,
    search_state: Any,
) -> CubicClassNumberResult:
    seed = _AuthenticatedCubicRelationSeed(
        _AUTHENTICATED_CUBIC_RELATION_SEED_TOKEN,
        result,
        plan,
        factor_records,
        collector,
        presentation,
        search_state,
    )
    if not seed.certified:
        raise ArithmeticError("failed to seal a cubic relation prefix")
    result.__dict__["_live_relation_seed"] = seed
    return result


def authenticated_cubic_relation_seed(result: Any, field: Any) -> Any:
    """Return a valid live relation prefix, or `None` for detached evidence."""
    if type(result) is not CubicClassNumberResult or result.field is not field:
        return None
    seed = result.__dict__.get("_live_relation_seed")
    if (
        type(seed) is _AuthenticatedCubicRelationSeed
        and seed._source_result is result
        and seed.field is field
        and seed.certified
    ):
        return seed
    return None


def _cubic_class_number_result_snapshot(result: CubicClassNumberResult) -> Any:
    """Snapshot every mutable proof-bearing field of one live result."""
    certificate = result.certificate
    if type(certificate) is not CubicMinkowskiClassNumberCertificate:
        raise TypeError("a live cubic class-number result needs the exact certificate")
    factor_base = []
    for ideal in result.factor_base:
        serializer = getattr(ideal, "to_dict", None)
        if not callable(serializer):
            raise TypeError("a live cubic factor-base ideal is not serializable")
        factor_base.append(serializer())
    relations = []
    for record in result.relation_records:
        serializer = getattr(record, "to_dict", None)
        if not callable(serializer):
            raise TypeError("a live cubic relation record is not serializable")
        relations.append(serializer())
    presentation = result.presentation
    presentation_serializer = getattr(presentation, "to_dict", None)
    if not callable(presentation_serializer):
        raise TypeError("a live cubic presentation is not serializable")
    return _freeze_authentication_value(
        {
            "complete": result.complete,
            "reason": result.reason,
            "minkowski_bound": result.minkowski_bound,
            "proof_status": result.proof_status,
            # These strings are the certificate's canonical immutable source.
            # Snapshotting them avoids reparsing the potentially large exact
            # witness payload merely to compare it with itself.
            "certificate": {
                "plan_json": certificate._plan_json,
                "factor_base_json": certificate._factor_base_json,
                "relations_json": certificate._relations_json,
                "presentation_json": certificate._presentation_json,
                "obstructions_json": certificate._obstructions_json,
                "caps_json": certificate._caps_json,
                "body_json": certificate._body_json,
                "class_number": certificate._class_number,
                "proof_status": certificate.proof_status,
                "source": certificate.source,
                "content_sha256": certificate._content_sha256,
            },
            "factor_base": factor_base,
            "relations": relations,
            "presentation": presentation_serializer(),
            "diagnostics": result.diagnostics,
        }
    )


class _AuthenticatedCubicClassNumberResult:
    """Immutable producer-issued seal for one live exact cubic result."""

    def __init__(self, token: object, result: CubicClassNumberResult) -> None:
        if token is not _AUTHENTICATED_CUBIC_CLASS_NUMBER_TOKEN:
            raise TypeError("authenticated cubic class-number seals are module-issued")
        if type(result) is not CubicClassNumberResult or not result.complete:
            raise ValueError(
                "an authenticated cubic class-number result must be complete"
            )
        certificate = result.certificate
        if type(certificate) is not CubicMinkowskiClassNumberCertificate:
            raise TypeError("an authenticated cubic result needs the exact certificate")
        if (
            result.proof_status != "exact-unconditional"
            or certificate.proof_status != "exact-unconditional"
            or certificate.field is not result.field
        ):
            raise ValueError("an authenticated cubic result has inconsistent authority")
        self.schema = AUTHENTICATED_CUBIC_CLASS_NUMBER_SCHEMA
        self.class_number = int(certificate.class_number)
        self.minkowski_bound = int(result.minkowski_bound)
        self.proof_status = str(result.proof_status)
        self.certificate_sha256 = str(certificate.stable_hash())
        self.factor_base_size = len(result.factor_base)
        self.relation_count = len(result.relation_records)
        self.__dict__["_source_field"] = result.field
        self.__dict__["_source_result"] = result
        self.__dict__["_source_snapshot"] = _cubic_class_number_result_snapshot(result)
        self.__dict__["_frozen"] = True

    def __setattr__(self, name: str, value: Any) -> None:
        if self.__dict__.get("_frozen", False):
            raise AttributeError("authenticated cubic class-number seals are immutable")
        self.__dict__[name] = value

    @property
    def certified(self) -> bool:
        try:
            source = self.__dict__.get("_source_result")
            return (
                type(source) is CubicClassNumberResult
                and source.field is self.__dict__.get("_source_field")
                and source.complete
                and self.proof_status == "exact-unconditional"
                and self.__dict__.get("_authentication_snapshot")
                == _authenticated_cubic_class_number_snapshot(self)
                and self.__dict__.get("_source_snapshot")
                == _cubic_class_number_result_snapshot(source)
            )
        except (AttributeError, TypeError, ValueError):
            return False


def _authenticated_cubic_class_number_snapshot(
    authentication: _AuthenticatedCubicClassNumberResult,
) -> tuple[Any, ...]:
    return (
        AUTHENTICATED_CUBIC_CLASS_NUMBER_SCHEMA,
        authentication.schema,
        authentication.class_number,
        authentication.minkowski_bound,
        authentication.proof_status,
        authentication.certificate_sha256,
        authentication.factor_base_size,
        authentication.relation_count,
    )


def _issue_cubic_class_number_result(
    result: CubicClassNumberResult,
) -> CubicClassNumberResult:
    """Attach a cheap live seal at the exact producer boundary."""
    authentication = _AuthenticatedCubicClassNumberResult(
        _AUTHENTICATED_CUBIC_CLASS_NUMBER_TOKEN, result
    )
    authentication.__dict__["_authentication_snapshot"] = (
        _authenticated_cubic_class_number_snapshot(authentication)
    )
    # Construction above validates the source result and takes its immutable
    # snapshot synchronously.  The first public consumer performs the
    # mutation-sensitive comparison; repeating it here only serialized the
    # entire proof-bearing result twice before returning it.
    result.__dict__["_live_authentication"] = authentication
    return result


def authenticated_cubic_class_number_result_matches(result: Any, field: Any) -> bool:
    """Check a producer-issued live result without detached arithmetic replay."""
    if type(result) is not CubicClassNumberResult or result.field is not field:
        return False
    try:
        authentication = result.__dict__.get("_live_authentication")
        certificate = result.certificate
        return (
            type(authentication) is _AuthenticatedCubicClassNumberResult
            and type(certificate) is CubicMinkowskiClassNumberCertificate
            and authentication.__dict__.get("_source_result") is result
            and authentication.__dict__.get("_source_field") is field
            and authentication.certified
            and authentication.class_number == result.order()
            and authentication.certificate_sha256 == certificate.stable_hash()
        )
    except (AttributeError, TypeError, ValueError):
        return False


def bounded_cubic_minkowski_class_number(
    field: Any,
    *,
    max_bound: int = DEFAULT_CUBIC_MINKOWSKI_MAX_BOUND,
    max_rational_primes: int = DEFAULT_CUBIC_MINKOWSKI_MAX_RATIONAL_PRIMES,
    max_prime_ideals: int = DEFAULT_CUBIC_MINKOWSKI_MAX_PRIME_IDEALS,
    max_memory_bytes: int = DEFAULT_CUBIC_MINKOWSKI_MAX_MEMORY_BYTES,
    max_relation_attempts: int = DEFAULT_CUBIC_CLASS_NUMBER_MAX_RELATION_ATTEMPTS,
    max_relations: int = DEFAULT_CUBIC_CLASS_NUMBER_MAX_RELATIONS,
    max_candidates_per_ideal: int = DEFAULT_CUBIC_CLASS_NUMBER_MAX_CANDIDATES_PER_IDEAL,
    max_quotient_order: int = DEFAULT_CUBIC_CLASS_NUMBER_MAX_QUOTIENT_ORDER,
    max_projective_lines: int = DEFAULT_CUBIC_CLASS_NUMBER_MAX_PROJECTIVE_LINES,
    max_modulus: int = DEFAULT_CUBIC_CLASS_NUMBER_MAX_MODULUS,
    max_residue_states: int = DEFAULT_CUBIC_CLASS_NUMBER_MAX_RESIDUE_STATES,
    cancelled: Callable[[], bool] | None = None,
) -> CubicClassNumberResult:
    """Prove a cubic class number without computing units or a regulator.

    The exact Minkowski factor base generates the class group.  Exact principal
    relations give a finite quotient `Q` surjecting onto it.  For every prime
    `p | |Q|`, this producer proves that each projective line of `Q[p]` remains
    nonzero by an exhaustive modular obstruction for the associated ternary
    ideal norm form.  Therefore the surjection has trivial kernel.

    Every search is explicitly bounded.  Exhaustion returns an incomplete
    artifact whose factor base and relations may seed a later coupled engine;
    it never changes the class-number answer by itself.
    """
    if int(field.degree()) != 3:
        raise ValueError("the bounded Minkowski class-number path requires a cubic")
    checked_caps = {
        "max_relation_attempts": _positive_integer(
            max_relation_attempts, "maximum relation attempts"
        ),
        "max_relations": _positive_integer(max_relations, "maximum relations"),
        "max_candidates_per_ideal": _positive_integer(
            max_candidates_per_ideal, "maximum candidates per ideal"
        ),
        "max_quotient_order": _positive_integer(
            max_quotient_order, "maximum quotient order"
        ),
        "max_projective_lines": _positive_integer(
            max_projective_lines, "maximum projective lines"
        ),
        "max_modulus": _positive_integer(max_modulus, "maximum modulus"),
        "max_residue_states": _positive_integer(
            max_residue_states, "maximum residue states"
        ),
    }
    if checked_caps["max_modulus"] < 2:
        raise ValueError("maximum modulus must be at least two")
    phase_timings: dict[str, float] = {}
    relation_metrics: dict[str, int] = {}
    live_factor_records: tuple[Any, ...] = ()
    live_collector: Any = None
    live_search_state: Any = None
    live_has_partials = False
    total_started = time.perf_counter()
    factor_base_module = __import__(
        "sagejs.number_fields.class_group_factor_base",
        fromlist=["class_group_factor_base"],
    )
    factor_started = time.perf_counter()
    plan = factor_base_module.factor_base_plan(
        field.maximal_order(),
        proof=True,
        theorem="minkowski",
        max_bound=_positive_integer(max_bound, "maximum factor-base bound"),
        max_rational_primes=_positive_integer(
            max_rational_primes, "maximum rational primes"
        ),
        max_prime_ideals=_positive_integer(max_prime_ideals, "maximum prime ideals"),
        max_memory_bytes=_positive_integer(max_memory_bytes, "maximum memory bytes"),
    )

    def incomplete(
        reason: str,
        *,
        factor_base: tuple[Any, ...] = (),
        relation_records: tuple[Any, ...] = (),
        presentation: Any = None,
        residue_states: int = 0,
    ) -> CubicClassNumberResult:
        phase_timings["total"] = time.perf_counter() - total_started
        result = CubicClassNumberResult(
            field,
            False,
            reason,
            int(plan.bound),
            factor_base=factor_base,
            relation_records=relation_records,
            presentation=presentation,
            diagnostics={
                "algorithm": "bounded-cubic-minkowski-p-lines",
                "phase_timings": dict(phase_timings),
                "factor_base_size": len(factor_base),
                "relations": len(relation_records),
                "presentation_rank": int(getattr(presentation, "rank", 0)),
                "quotient_order": getattr(presentation, "order", None),
                "residue_states": int(residue_states),
                "relation_search": dict(relation_metrics),
                "caps": dict(checked_caps),
            },
        )
        if (
            live_collector is not None
            and presentation is not None
            and live_search_state is not None
            and not live_has_partials
        ):
            return _issue_cubic_relation_seed(
                result,
                plan,
                live_factor_records,
                live_collector,
                presentation,
                live_search_state,
            )
        return result

    try:
        _check_cubic_cancelled(cancelled)
        plan.require_feasible()
        factor_records = factor_base_module.build_factor_base(plan)
    except RuntimeError:
        raise
    except ValueError as error:
        phase_timings["factor_base"] = time.perf_counter() - factor_started
        return incomplete(
            "bounded cubic Minkowski factor base is unavailable: " + str(error)
        )
    phase_timings["factor_base"] = time.perf_counter() - factor_started
    factor_base = tuple(record.prime_ideal for record in factor_records)

    relation_module = __import__(
        "sagejs.number_fields.class_group_relations",
        fromlist=["class_group_relations"],
    )
    matrix_module = __import__(
        "sagejs.number_fields.class_group_matrix", fromlist=["class_group_matrix"]
    )
    engine_module = __import__(
        "sagejs.number_fields.class_unit_groups", fromlist=["class_unit_groups"]
    )

    class _NoAnalyticComponents:
        def __init__(self) -> None:
            self.factor_base: Any = None
            self.relations: Any = None
            self.matrix: Any = None
            self.analytic: Any = None
            self.context: Any = None
            self.factored: Any = None

    components = _NoAnalyticComponents()
    components.factor_base = factor_base_module
    components.relations = relation_module
    components.matrix = matrix_module
    components.analytic = _NoAnalyticComponents()
    components.context = None
    components.factored = None
    limits = engine_module.ClassUnitEngineLimits(
        max_factor_base_bound=_positive_integer(max_bound, "maximum factor-base bound"),
        max_factor_base_size=_positive_integer(
            max_prime_ideals, "maximum prime ideals"
        ),
        max_relation_attempts=checked_caps["max_relation_attempts"],
        max_relations=checked_caps["max_relations"],
        max_candidates_per_ideal=checked_caps["max_candidates_per_ideal"],
        max_random_terms=5,
        max_coefficient_bound=3,
        max_partial_relations=checked_caps["max_relations"],
        max_memory_bytes=_positive_integer(max_memory_bytes, "maximum memory bytes"),
    )
    relation_started = time.perf_counter()
    engine = engine_module.ClassUnitGroupEngine(
        field,
        proof=True,
        algorithm="minkowski",
        limits=limits,
        cancelled=cancelled,
        components=components,
    )
    collector = relation_module.ExactRelationCollector(engine.order, factor_base)
    relation_module.initial_rational_prime_relations(collector)
    sieve_capacity = checked_caps["max_relations"] - len(collector.records)
    sieve_candidates: Any = None
    if sieve_capacity > 0:
        sieve_candidates = _packed_cubic_relation_candidates(
            engine.order,
            factor_base,
            maximum_candidates=sieve_capacity,
            cancelled=cancelled,
        )
    raw_sieve_count = 0 if sieve_candidates is None else len(sieve_candidates)
    selected_sieve_candidates: Any = None
    if sieve_candidates is not None:
        selected_sieve_candidates = _select_cubic_relation_candidates(
            matrix_module,
            tuple(record.row for record in collector.records),
            sieve_candidates,
            len(factor_base),
        )
    sieve_admitted = 0
    if selected_sieve_candidates is not None:
        try:
            for row, coordinates, _expected_norm in selected_sieve_candidates:
                # The packed norm only selected this proposal.  Integral
                # admission independently recomputes the exact element norm,
                # matches it to the complete factor-base row, and checks every
                # required prime-power containment; do not repeat that norm
                # computation here.
                collector.admit_integral_order_basis_row(
                    coordinates,
                    row,
                    provenance={
                        "algorithm": "packed-cubic-integral-relation-sieve",
                        "coefficient_bound": _CUBIC_RELATION_SIEVE_BOUND,
                        "order_basis_coordinates": list(coordinates),
                    },
                )
                sieve_admitted += 1
        except (ArithmeticError, TypeError, ValueError):
            # A packed proposal is never proof evidence by itself.  Discard
            # every proposed row if its independent containment replay fails;
            # the unchanged LLL relation search below remains authoritative.
            collector = relation_module.ExactRelationCollector(
                engine.order, factor_base
            )
            relation_module.initial_rational_prime_relations(collector)
            selected_sieve_candidates = None
            sieve_admitted = 0
    relation_metrics["integral_sieve_candidates"] = raw_sieve_count
    relation_metrics["integral_sieve_selected"] = (
        0 if selected_sieve_candidates is None else len(selected_sieve_candidates)
    )
    relation_metrics["integral_sieve_relations"] = sieve_admitted
    relation_metrics["integral_sieve_fallback"] = int(selected_sieve_candidates is None)
    relation_metrics["integral_sieve_dependency_candidates"] = 0
    relation_metrics["integral_sieve_dependency_relations"] = 0
    relation_metrics["relation_prefix_finalized_without_search"] = 0
    try:
        # This class-number-only quotient needs full factor-base rank but no
        # logarithmic unit dependencies.  One exact row per searched ideal is
        # sufficient; the loop continues until the exact presentation reaches
        # full rank, and the detached certificate replays every retained row.
        presentation = matrix_module.extract_relation_presentation(
            tuple(record.row for record in collector.records),
            len(factor_base),
            require_full_rank=False,
        )
        if presentation.rank == len(factor_base):
            # The packed rows already give an exact full-rank quotient.  A
            # zero-attempt search state is the canonical continuation cursor:
            # the later coupled class/unit engine rebuilds its accumulator
            # from this authenticated prefix and resumes ordinary relation
            # search only when logarithmic unit dependencies are required.
            engine._relation_search_state = relation_module.RelationSearchState(
                engine.seed
            )
            relation_metrics["relation_prefix_finalized_without_search"] = 1
            relation_metrics["presentation_extractions"] = 1
        else:
            collector, presentation = engine._relations(
                factor_base,
                0,
                collector=collector,
                presentation=presentation,
                relations_per_ideal=1,
                independent_relations_per_ideal=True,
                target_missing_pivots=True,
            )
    except RuntimeError:
        raise
    except ValueError as error:
        if "max_relations" not in str(error) and "resource" not in str(error):
            raise
        phase_timings["relations"] = time.perf_counter() - relation_started
        return incomplete(
            "bounded exact relation search exhausted: " + str(error),
            factor_base=factor_base,
        )
    phase_timings["relations"] = time.perf_counter() - relation_started
    relation_records = tuple(collector.records)
    live_factor_records = tuple(factor_records)
    live_collector = collector
    live_search_state = engine._relation_search_state
    live_has_partials = bool(engine._partials)
    engine_diagnostics = engine._diagnostics()
    engine_resources = engine_diagnostics.get("resources", {})
    for name in (
        "relation_attempts",
        "relation_candidates",
        "ideals_tested",
        "presentation_extractions",
    ):
        value = engine_resources.get(name)
        if (
            isinstance(value, int)
            and not isinstance(value, bool)
            and name not in relation_metrics
        ):
            relation_metrics[name] = int(value)

    dependency_seed_enriched = False

    def enrich_incomplete_unit_seed() -> None:
        """Add exact duplicate rows only for a coupled class/unit fallback."""
        nonlocal dependency_seed_enriched, presentation, relation_records
        if dependency_seed_enriched:
            return
        dependency_seed_enriched = True
        if selected_sieve_candidates is None or sieve_candidates is None:
            return
        remaining = checked_caps["max_relations"] - len(collector.records)
        if remaining <= 0:
            return
        # A cubic has unit rank one or two according to the sign of its exact
        # discriminant.  Duplicate principal rows supply at most that many
        # cheap unit dependencies; the coupled engine independently checks
        # their logarithmic rank and continues its ordinary search if needed.
        unit_rank_bound = 1 if int(engine.order.discriminant()) < 0 else 2
        dependency_candidates = _select_cubic_dependency_candidates(
            selected_sieve_candidates,
            sieve_candidates,
            min(remaining, unit_rank_bound),
        )
        relation_metrics["integral_sieve_dependency_candidates"] = len(
            dependency_candidates
        )
        if not dependency_candidates:
            return
        started = time.perf_counter()
        admitted = 0
        for row, coordinates, _expected_norm in dependency_candidates:
            _check_cubic_cancelled(cancelled)
            try:
                collector.admit_integral_order_basis_row(
                    coordinates,
                    row,
                    provenance={
                        "algorithm": "packed-cubic-unit-dependency-seed",
                        "coefficient_bound": _CUBIC_RELATION_SIEVE_BOUND,
                        "order_basis_coordinates": list(coordinates),
                    },
                )
                admitted += 1
            except (ArithmeticError, TypeError, ValueError):
                # A rejected packed proposal is never evidence.  Successfully
                # admitted earlier rows remain independently authenticated.
                continue
        relation_metrics["integral_sieve_dependency_relations"] = admitted
        if admitted:
            relation_records = tuple(collector.records)
            presentation = matrix_module.extract_relation_presentation(
                tuple(record.row for record in relation_records),
                len(factor_base),
                require_full_rank=True,
            )
        phase_timings["fallback-unit-seed"] = time.perf_counter() - started

    if presentation.rank != len(factor_base) or presentation.order is None:
        return incomplete(
            "bounded exact relation search did not reach full rank",
            factor_base=factor_base,
            relation_records=relation_records,
            presentation=presentation,
        )
    quotient_order = int(presentation.order)
    if quotient_order > checked_caps["max_quotient_order"]:
        enrich_incomplete_unit_seed()
        return incomplete(
            "relation quotient order exceeds the bounded proof cap",
            factor_base=factor_base,
            relation_records=relation_records,
            presentation=presentation,
        )
    try:
        line_specs = _projective_line_specs(
            presentation, max_lines=checked_caps["max_projective_lines"]
        )
    except ValueError:
        enrich_incomplete_unit_seed()
        return incomplete(
            "quotient p-torsion has too many projective lines",
            factor_base=factor_base,
            relation_records=relation_records,
            presentation=presentation,
        )
    obstruction_started = time.perf_counter()
    obstructions: list[dict[str, Any]] = []
    residue_states = 0
    for line in line_specs:
        _check_cubic_cancelled(cancelled)
        representative = relation_module.reconstruct_factor_base_ideal(
            field.maximal_order(), factor_base, line["ambient_row"]
        )
        obstruction, used = _find_cubic_norm_obstruction(
            representative,
            line,
            max_modulus=checked_caps["max_modulus"],
            remaining_states=checked_caps["max_residue_states"] - residue_states,
            cancelled=cancelled,
        )
        residue_states += used
        if obstruction is None:
            phase_timings["norm_obstructions"] = (
                time.perf_counter() - obstruction_started
            )
            enrich_incomplete_unit_seed()
            return incomplete(
                "bounded modular norm-form search found no obstruction for a p-line",
                factor_base=factor_base,
                relation_records=relation_records,
                presentation=presentation,
                residue_states=residue_states,
            )
        obstructions.append(obstruction)
    phase_timings["norm_obstructions"] = time.perf_counter() - obstruction_started
    encoding_started = time.perf_counter()
    certificate = CubicMinkowskiClassNumberCertificate(
        field,
        plan=plan.to_dict(),
        factor_base=[record.to_dict() for record in factor_records],
        relations=[record.to_dict() for record in relation_records],
        presentation=presentation.to_dict(),
        obstructions=obstructions,
        caps=checked_caps,
        _live_presentation=presentation,
        _live_token=_LIVE_CUBIC_CERTIFICATE_TOKEN,
    )
    if certificate.class_number != quotient_order:
        raise ArithmeticError("cubic class-number evidence changed during encoding")
    phase_timings["certificate_encoding"] = time.perf_counter() - encoding_started
    phase_timings["total"] = time.perf_counter() - total_started
    return _issue_cubic_class_number_result(
        CubicClassNumberResult(
            field,
            True,
            certificate.source,
            int(plan.bound),
            certificate=certificate,
            factor_base=factor_base,
            relation_records=relation_records,
            presentation=presentation,
            diagnostics={
                "algorithm": "bounded-cubic-minkowski-p-lines",
                "phase_timings": dict(phase_timings),
                "factor_base_size": len(factor_base),
                "relations": len(relation_records),
                "presentation_rank": int(presentation.rank),
                "quotient_order": quotient_order,
                "projective_lines": len(line_specs),
                "residue_states": residue_states,
                "relation_search": dict(relation_metrics),
                "caps": dict(checked_caps),
            },
        )
    )


__all__ = [
    "CUBIC_CLASS_NUMBER_CERTIFICATE_SCHEMA",
    "CubicClassNumberResult",
    "CubicMinkowskiClassNumberCertificate",
    "authenticated_cubic_class_number_result_matches",
    "authenticated_cubic_relation_seed",
    "bounded_cubic_minkowski_class_number",
]
