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
_CUBIC_RELATION_DEPENDENCY_SIEVE_BOUND = 4
_CUBIC_RELATION_SIEVE_MAX_CANDIDATES = 128
_CUBIC_RELATION_SIEVE_MAX_PRIME_POWERS = 256
_CUBIC_PACKED_PREMATERIALIZATION_BOUND = 12
_CUBIC_NORM_FORM_INTERPOLATION_POINTS = (
    (1, 0, 0),
    (0, 1, 0),
    (0, 0, 1),
    (1, 1, 0),
    (1, -1, 0),
    (1, 0, 1),
    (1, 0, -1),
    (0, 1, 1),
    (0, 1, -1),
    (1, 1, 1),
)
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


def _cubic_lcm(left: int, right: int) -> int:
    a = abs(int(left))
    b = abs(int(right))
    product = a * b
    while b:
        a, b = b, a % b
    return 0 if product == 0 else product // a


class PackedCubicFactorRecord:
    """One exact factor-base prime retained as HNF integers, not an ideal."""

    def __init__(
        self,
        order: Any,
        index: int,
        prime: int,
        ramification: int,
        residue_degree: int,
        rows: list[list[Any]],
        subspace: list[list[int]],
        presentation: dict[str, Any],
        second_generator: Any,
        table: list[list[list[int]]],
        one_coordinates: list[int],
        dedekind_kummer: bool,
    ) -> None:
        self.order = order
        self.index = int(index)
        self.prime = int(prime)
        self.ramification = int(ramification)
        self.residue_degree = int(residue_degree)
        self.norm_value = self.prime**self.residue_degree
        self.rows = tuple(tuple(value for value in row) for row in rows)
        self.subspace = tuple(tuple(int(value) for value in row) for row in subspace)
        self.presentation = {
            key: list(value) if isinstance(value, (list, tuple)) else value
            for key, value in presentation.items()
        }
        denominator = 1
        for row in self.rows:
            for value in row:
                denominator = _cubic_lcm(denominator, int(value._denominator))
        numerators: list[int] = []
        for row in self.rows:
            for value in row:
                scaled = value * denominator
                if scaled._denominator != 1:
                    raise ArithmeticError("a packed cubic HNF did not clear exactly")
                numerators.append(int(scaled._numerator))
        self.basis_numerators = tuple(numerators)
        self.basis_denominator = denominator
        witness = second_generator
        if witness is None:
            prime_module = __import__(
                "sagejs.number_fields.prime_ideals", fromlist=["prime_ideals"]
            )
            field = order.number_field()
            target = [list(row) for row in self.subspace]
            inverse_rows = order._basis_inverse_matrix().rows()
            for row in self.rows:
                # The packed candidate already carries power-basis rows.  Map
                # all three coordinates directly through the order's retained
                # inverse instead of constructing a field element and asking
                # the generic coordinate converter to rebuild the same row.
                coordinate_values: list[Any] = []
                for target_index in range(3):
                    coordinate: Any = sage.QQ(0)
                    for source in range(3):
                        coordinate += row[source] * inverse_rows[source][target_index]
                    coordinate_values.append(coordinate)
                exact_coordinates = tuple(coordinate_values)
                if any(value._denominator != 1 for value in exact_coordinates):
                    continue
                modular = [
                    int(value._numerator) % self.prime for value in exact_coordinates
                ]
                if (
                    prime_module._subspace_ideal_generated_by(
                        [modular], 3, table, self.prime
                    )
                    == target
                ):
                    witness = prime_module._nf_element_from_row(field, list(row))
                    break
        self.second_generator = witness
        self.modular_table = tuple(
            tuple(tuple(int(value) for value in product) for product in left)
            for left in table
        )
        self.modular_one = tuple(int(value) for value in one_coordinates)
        self.dedekind_kummer = bool(dedekind_kummer)
        self._power_cache: tuple[tuple[tuple[int, ...], int], ...] = ()

    def rational_prime(self) -> int:
        return self.prime

    def ring(self) -> Any:
        return self.order

    def basis_matrix(self) -> Any:
        prime_module = __import__(
            "sagejs.number_fields.prime_ideals", fromlist=["prime_ideals"]
        )
        return prime_module._nf_global("matrix")(
            sage.QQ, [list(row) for row in self.rows]
        )

    def ramification_index(self) -> int:
        return self.ramification

    def residue_class_degree(self) -> int:
        return self.residue_degree

    def norm(self) -> int:
        return self.norm_value

    def packed_power_bases(
        self, maximum: int
    ) -> tuple[tuple[tuple[int, ...], int], ...]:
        count = int(maximum)
        if len(self._power_cache) < count:
            ideal_module = __import__(
                "sagejs.number_fields.ideal_arithmetic",
                fromlist=["ideal_arithmetic"],
            )
            powers = ideal_module.packed_ideal_power_bases_from_basis(
                self.order.number_field(),
                self.basis_numerators,
                self.basis_denominator,
                count,
            )
            if powers is None:
                raise ArithmeticError("packed cubic prime powers are unavailable")
            self._power_cache = powers
        return self._power_cache[:count]

    def to_dict(self) -> dict[str, Any]:
        second_generator = self.second_generator
        encoded_generator = None
        if second_generator is not None:
            encoded_generator = {
                "rational_prime": self.prime,
                "second_generator": [
                    [int(value._numerator), int(value._denominator)]
                    for value in second_generator.list()
                ],
            }
        return {
            "schema": "sagejs.number-fields/factor-base-prime-v1",
            "index": self.index,
            "prime": self.prime,
            "norm": self.norm_value,
            "e": self.ramification,
            "f": self.residue_degree,
            "hnf_fingerprint": [
                [[int(value._numerator), int(value._denominator)] for value in row]
                for row in self.rows
            ],
            "two_generator": encoded_generator,
            "valuation_metadata": {
                "rational_prime_valuation": self.ramification,
                "ideal_norm_exponent": self.residue_degree,
                "residue_modulus_degree": self.residue_degree,
            },
            "residue_modulus": list(self.presentation["modulus"]),
            "automorphism_orbit": None,
        }


def packed_cubic_factor_records(
    plan: Any,
) -> tuple[PackedCubicFactorRecord, ...] | None:
    """Build the exact Minkowski factor base without ordinary ideal objects."""
    order = plan.order
    if int(order.degree()) != 3 or int(plan.bound) < 2:
        return ()
    prime_module = __import__(
        "sagejs.number_fields.prime_ideals", fromlist=["prime_ideals"]
    )
    candidates: list[tuple[int, int, int, int, dict[str, Any]]] = []
    rational_primes = tuple(
        int(value)
        for value in prime_module._nf_global("prime_range")(2, int(plan.bound) + 1)
    )
    if len(rational_primes) > int(plan.max_rational_primes):
        raise ValueError("exact factor-base rational primes exceed the plan cap")
    equation_polynomial = prime_module._maximal.integral_equation_polynomial(
        order.number_field()
    )
    equation_coefficients = tuple(int(value) for value in equation_polynomial.list())
    one_coordinates = prime_module._order_one_coordinates(order)
    for prime in rational_primes:
        requested = {
            residue_degree
            for residue_degree in range(1, 4)
            if prime**residue_degree <= int(plan.bound)
        }
        modular_factors = prime_module._om.factor_cubic_mod_prime(
            equation_coefficients, prime
        )
        p_maximal = prime_module._equation_order_is_p_maximal_from_factors(
            equation_coefficients, prime, modular_factors
        )
        if p_maximal and not any(
            len(factor.polynomial) - 1 in requested for factor in modular_factors
        ):
            continue
        modular_table = prime_module._modular_table(order, prime)
        modular_one = [value % prime for value in one_coordinates]
        local = (
            prime_module.packed_dedekind_kummer_candidates(
                order,
                prime,
                requested,
                modular_factors=modular_factors,
                p_maximal=True,
                modular_table=modular_table,
                one_coordinates=modular_one,
            )
            if p_maximal
            else None
        )
        if local is None:
            local = prime_module.packed_finite_algebra_candidates(
                order,
                prime,
                prime_module.DEFAULT_MAX_PRIMITIVE_CANDIDATES,
                requested,
                modular_table=modular_table,
                one_coordinates=modular_one,
            )
        if local is None:
            return None
        for record in local:
            record["dedekind_kummer"] = p_maximal
        occurrences: dict[int, int] = {}
        for record in local:
            residue_degree = int(record["f"])
            occurrence = occurrences.get(residue_degree, 0)
            occurrences[residue_degree] = occurrence + 1
            norm = prime**residue_degree
            if norm <= int(plan.bound):
                candidates.append((norm, prime, residue_degree, occurrence, record))
    candidates.sort(key=lambda entry: entry[:4])
    if len(candidates) > int(plan.max_prime_ideals):
        raise ValueError("exact factor-base size exceeds max_prime_ideals")
    answer = tuple(
        PackedCubicFactorRecord(
            order,
            index,
            prime,
            record["e"],
            residue_degree,
            record["rows"],
            record["subspace"],
            record["presentation"],
            record["second_generator"],
            record["table"],
            record["one"],
            record["dedekind_kummer"],
        )
        for index, (_norm, prime, residue_degree, _occurrence, record) in enumerate(
            candidates
        )
    )
    return answer


def _materialize_packed_cubic_factor_records(
    factor_records: tuple[Any, ...],
) -> tuple[tuple[Any, ...], tuple[Any, ...]]:
    if not factor_records or not isinstance(factor_records[0], PackedCubicFactorRecord):
        records = factor_records
        return records, tuple(record.prime_ideal for record in records)
    prime_module = __import__(
        "sagejs.number_fields.prime_ideals", fromlist=["prime_ideals"]
    )
    factor_module = __import__(
        "sagejs.number_fields.class_group_factor_base",
        fromlist=["class_group_factor_base"],
    )
    restored: list[Any] = []
    for packed in factor_records:
        if not isinstance(packed, PackedCubicFactorRecord):
            raise TypeError("a packed factor base mixed record representations")
        # These rows and the residue presentation were produced together from
        # the exact modular ideal.  Rebuild the canonical HNF once from that
        # subspace through the same source-transparent candidate boundary,
        # then require byte-for-byte equality with the retained relation
        # lattice.  Refactoring the rational prime or replaying generic ideal
        # closure for every factor merely rediscovers these same rows and used
        # to dominate every coupled cubic fallback.
        prime_ideal = prime_module._prime_candidate_from_modular_subspace(
            packed.order,
            [list(row) for row in packed.subspace],
            packed.prime,
            packed.ramification,
            packed.residue_degree,
            dict(packed.presentation),
            use_packed=True,
        )
        if tuple(tuple(value for value in row) for row in prime_ideal._basis_rows) != (
            packed.rows
        ):
            raise ArithmeticError("packed factor-base materialization changed its HNF")
        record = factor_module.FactorBasePrimeRecord(
            packed.index,
            prime_ideal,
            second_generator=packed.second_generator,
        )
        if record.to_dict() != packed.to_dict():
            raise ArithmeticError("packed factor-base materialization changed evidence")
        restored.append(record)
    records = tuple(restored)
    factors = tuple(record.prime_ideal for record in records)
    return records, factors


def materialize_verified_packed_cubic_factor_records(
    factor_records: tuple[Any, ...],
) -> tuple[tuple[Any, ...], tuple[Any, ...]] | None:
    """Materialize a live packed Dedekind--Kummer base with exact checks.

    The generic class/unit engine needs ordinary prime-ideal objects before
    relation collection.  For a cubic `p`-maximal equation order, the packed
    producer already retains the exact modular factor, HNF lattice, quotient
    presentation, and second generator.  Replay the same independent checks
    as `_dedekind_kummer_prime_candidate(..., verify_candidate=True)` after
    materialization.  Index-prime finite-algebra factors deliberately return
    `None`; their complete product/comaximality replay remains authoritative.
    """
    if not factor_records or any(
        not isinstance(record, PackedCubicFactorRecord)
        or not record.dedekind_kummer
        or record.second_generator is None
        for record in factor_records
    ):
        return None
    records, factors = _materialize_packed_cubic_factor_records(factor_records)
    prime_module = __import__(
        "sagejs.number_fields.prime_ideals", fromlist=["prime_ideals"]
    )
    order = factor_records[0].order
    rational_prime_bases: dict[int, tuple[Any, ...]] = {}
    for packed, prime_ideal in zip(factor_records, factors, strict=True):
        rational_prime = packed.prime
        p_basis = rational_prime_bases.get(rational_prime)
        if p_basis is None:
            p_basis = tuple(order.ideal(rational_prime).basis())
            rational_prime_bases[rational_prime] = p_basis
        if not prime_module._ideal_arithmetic.ideal_contains_elements(
            prime_ideal, p_basis + (packed.second_generator,)
        ):
            raise ArithmeticError(
                "a packed Dedekind--Kummer ideal omits p*O or its generator"
            )
        if prime_ideal.norm() != rational_prime**packed.residue_degree:
            raise ArithmeticError(
                "a packed Dedekind--Kummer ideal has the wrong exact norm"
            )
        if not prime_module._presentation_modulus_is_irreducible(
            packed.presentation, rational_prime, packed.residue_degree
        ):
            raise ArithmeticError(
                "a packed Dedekind--Kummer ideal quotient is not a field"
            )
        prime_ideal._packed_candidate_pending_replay = False
        prime_ideal._verified_modular_algebra = (
            rational_prime,
            [[list(product) for product in left] for left in packed.modular_table],
            list(packed.modular_one),
        )
    return records, factors


def _interpolate_cubic_norm_form(values: tuple[int, ...]) -> tuple[int, ...]:
    """Recover ternary-cubic coefficients from the canonical ten values."""
    if len(values) != 10:
        raise ValueError("a cubic norm-form interpolation needs ten values")
    c300, c030, c003 = values[:3]
    plus01 = values[3] - c300 - c030
    minus01 = values[4] - c300 + c030
    plus02 = values[5] - c300 - c003
    minus02 = values[6] - c300 + c003
    plus12 = values[7] - c030 - c003
    minus12 = values[8] - c030 + c003
    if any(
        value % 2
        for value in (
            plus01 + minus01,
            plus01 - minus01,
            plus02 + minus02,
            plus02 - minus02,
            plus12 + minus12,
            plus12 - minus12,
        )
    ):
        raise ArithmeticError("a cubic norm form did not interpolate integrally")
    c210, c120 = (plus01 - minus01) // 2, (plus01 + minus01) // 2
    c201, c102 = (plus02 - minus02) // 2, (plus02 + minus02) // 2
    c021, c012 = (plus12 - minus12) // 2, (plus12 + minus12) // 2
    c111 = values[9] - (c300 + c030 + c003 + c210 + c201 + c120 + c021 + c102 + c012)
    return (c300, c030, c003, c210, c201, c120, c021, c102, c012, c111)


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
    return _interpolate_cubic_norm_form(
        (
            norm(b0),
            norm(b1),
            norm(b2),
            norm(b0 + b1),
            norm(b0 - b1),
            norm(b0 + b2),
            norm(b0 - b2),
            norm(b1 + b2),
            norm(b1 - b2),
            norm(b0 + b1 + b2),
        )
    )


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


def _order_cubic_norm_form_coefficients(order: Any) -> tuple[int, ...]:
    """Return one immutable exact cubic norm form for an order basis."""
    try:
        cached = order._cubic_norm_form_coefficients_cache
    except AttributeError:
        cached = runtime.undefined
    if isinstance(cached, tuple) and len(cached) == 10:
        return tuple(int(value) for value in cached)

    coefficients: tuple[int, ...] | None = None
    try:
        kernel_module = __import__(
            "sagejs.number_fields.bl_composite_kernel",
            fromlist=["bl_composite_kernel"],
        )
        coefficient_kernel = getattr(
            kernel_module, "packed_cubic_order_norm_form_coefficients_in_place", None
        )
        if callable(coefficient_kernel):
            maximal_module = __import__(
                "sagejs.number_fields.maximal_order", fromlist=["maximal_order"]
            )
            native_module = __import__("sagejs.native", fromlist=["native"])
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
            output = native_module.kernel_integer_zeros(coefficient_kernel, 10, 16)
            if coefficient_kernel(
                output,
                native_module.kernel_integer_buffer(coefficient_kernel, packed_table),
            ):
                values = tuple(
                    int(value) for value in native_module.integer_buffer_values(output)
                )
                if len(values) == 10:
                    coefficients = values
    except (ImportError, OverflowError, RuntimeError, TypeError, ValueError):
        coefficients = None
    if coefficients is None:
        coefficients = _cubic_norm_form_coefficients(order.ideal(1))
    order._cubic_norm_form_coefficients_cache = tuple(coefficients)
    return tuple(coefficients)


def _cubic_norm_form_coefficients_from_order(ideal: Any) -> tuple[int, ...] | None:
    """Transform the cached order norm form to one integral ideal basis."""
    if ideal.is_zero() or not ideal.is_integral() or ideal.ring().degree() != 3:
        return None
    order = ideal.ring()
    relative_basis_method = getattr(ideal, "_relative_basis_matrix", None)
    relative_basis: Any = (
        relative_basis_method()
        if callable(relative_basis_method)
        else ideal.basis_matrix() * order._basis_inverse_matrix()
    )
    rows = relative_basis.rows()
    if len(rows) != 3 or any(
        len(row) != 3 or any(value._denominator != 1 for value in row) for row in rows
    ):
        return None
    coordinates = tuple(tuple(int(value._numerator) for value in row) for row in rows)
    order_coefficients = _order_cubic_norm_form_coefficients(order)
    values: list[int] = []
    for x, y, z in _CUBIC_NORM_FORM_INTERPOLATION_POINTS:
        transformed = tuple(
            x * coordinates[0][index]
            + y * coordinates[1][index]
            + z * coordinates[2][index]
            for index in range(3)
        )
        values.append(_cubic_norm_form_value(order_coefficients, *transformed))
    return _interpolate_cubic_norm_form(tuple(values))


def _cubic_relative_basis_rows(
    order: Any, rows: tuple[tuple[Any, ...], ...]
) -> tuple[tuple[int, ...], ...] | None:
    if len(rows) != 3 or any(len(row) != 3 for row in rows):
        return None
    inverse = order._basis_inverse_matrix()
    prime_module = __import__(
        "sagejs.number_fields.prime_ideals", fromlist=["prime_ideals"]
    )
    answer: list[tuple[int, ...]] = []
    for row in rows:
        coordinates = list(
            prime_module._nf_global("vector")(sage.QQ, list(row)) * inverse
        )
        if any(value._denominator != 1 for value in coordinates):
            return None
        answer.append(tuple(int(value._numerator) for value in coordinates))
    return tuple(answer)


def _cubic_norm_form_coefficients_from_relative_rows(
    order: Any, coordinates: tuple[tuple[int, ...], ...]
) -> tuple[int, ...]:
    """Transform the cached order norm form from precomputed integral rows."""
    order_coefficients = _order_cubic_norm_form_coefficients(order)
    values: list[int] = []
    for x, y, z in _CUBIC_NORM_FORM_INTERPOLATION_POINTS:
        transformed = tuple(
            x * coordinates[0][index]
            + y * coordinates[1][index]
            + z * coordinates[2][index]
            for index in range(3)
        )
        values.append(_cubic_norm_form_value(order_coefficients, *transformed))
    return _interpolate_cubic_norm_form(tuple(values))


def _packed_cubic_integral_ideal_payload(
    order: Any, rows: tuple[tuple[Any, ...], ...]
) -> dict[str, Any]:
    prime_module = __import__(
        "sagejs.number_fields.prime_ideals", fromlist=["prime_ideals"]
    )
    ideal_module = __import__(
        "sagejs.number_fields.ideal_arithmetic", fromlist=["ideal_arithmetic"]
    )
    return {
        "schema": ideal_module.SERIALIZATION_SCHEMA,
        "field_instance": prime_module._identity_token(order.number_field()),
        "order_instance": prime_module._identity_token(order),
        "field_order_fingerprint": prime_module._field_order_fingerprint(order),
        "basis": [
            [[int(value._numerator), int(value._denominator)] for value in row]
            for row in rows
        ],
    }


def _packed_cubic_integral_basis_for_ambient_row(
    factor_base: tuple[Any, ...], row: tuple[int, ...]
) -> tuple[tuple[tuple[Any, ...], ...], int] | None:
    """Clear rational denominators and multiply one packed ambient row."""
    if len(row) != len(factor_base) or not row:
        return None
    factors = tuple(factor_base)
    if any(not isinstance(factor, PackedCubicFactorRecord) for factor in factors):
        return None
    adjusted = [int(value) for value in row]
    order = factors[0].order
    degree = int(order.degree())
    if degree != 3 or any(factor.order is not order for factor in factors):
        return None
    for index, exponent in enumerate(tuple(adjusted)):
        if exponent >= 0:
            continue
        prime = factors[index].prime
        local_indices = tuple(
            position for position, factor in enumerate(factors) if factor.prime == prime
        )
        if (
            sum(
                factors[position].ramification * factors[position].residue_degree
                for position in local_indices
            )
            != degree
        ):
            return None
        multiplier = max(
            (-adjusted[position] + factors[position].ramification - 1)
            // factors[position].ramification
            for position in local_indices
        )
        for position in local_indices:
            adjusted[position] += multiplier * factors[position].ramification
    if any(value < 0 for value in adjusted) or not any(adjusted):
        return None
    ideal_module = __import__(
        "sagejs.number_fields.ideal_arithmetic", fromlist=["ideal_arithmetic"]
    )
    packed_product: tuple[tuple[int, ...], int] | None = None
    expected_norm = 1
    for factor, exponent in zip(factors, adjusted, strict=True):
        if exponent == 0:
            continue
        packed_powers = factor.packed_power_bases(exponent)
        if len(packed_powers) != exponent:
            return None
        current = packed_powers[exponent - 1]
        expected_norm *= factor.norm_value**exponent
        if packed_product is None:
            packed_product = current
        else:
            packed_product = ideal_module.packed_ideal_product_basis_from_bases(
                order.number_field(),
                packed_product[0],
                packed_product[1],
                current[0],
                current[1],
            )
            if packed_product is None:
                return None
    if packed_product is None:
        return None
    numerators, denominator = packed_product
    if len(numerators) != degree * degree or denominator <= 0:
        return None
    rows = tuple(
        tuple(
            sage.QQ(numerators[source * degree + target]) / sage.QQ(denominator)
            for target in range(degree)
        )
        for source in range(degree)
    )
    return rows, expected_norm


def _find_packed_cubic_norm_obstruction(
    factor_base: tuple[Any, ...],
    line: dict[str, Any],
    *,
    max_modulus: int,
    remaining_states: int,
    cancelled: Callable[[], bool] | None,
) -> tuple[dict[str, Any] | None, int] | None:
    """Prove one p-line directly from a packed integral ambient-row HNF.

    Negative entries are cleared only by complete rational-prime
    decomposition rows, so the resulting integral ideal remains in the same
    class.  The packed product kernel then handles arbitrary positive products
    without constructing an ordinary ideal object.
    """
    row = tuple(int(value) for value in line["ambient_row"])
    packed_basis = _packed_cubic_integral_basis_for_ambient_row(factor_base, row)
    if packed_basis is None:
        return None
    rows, expected_norm = packed_basis
    order = factor_base[0].order
    coordinates = _cubic_relative_basis_rows(order, rows)
    if coordinates is None:
        return None
    coefficients = _cubic_norm_form_coefficients_from_relative_rows(order, coordinates)
    prime_module = __import__(
        "sagejs.number_fields.prime_ideals", fromlist=["prime_ideals"]
    )
    determinant = prime_module._nf_global("matrix")(
        sage.ZZ, [list(basis_row) for basis_row in coordinates]
    ).determinant()
    norm = abs(int(determinant))
    if norm != expected_norm:
        raise ArithmeticError("a packed factor-base product has the wrong exact norm")
    if cancelled is None and _cubic_norm_form_kernel_override is None:
        try:
            kernel_module = __import__(
                "sagejs.number_fields.bl_composite_kernel",
                fromlist=["bl_composite_kernel"],
            )
            native_module = __import__("sagejs.native", fromlist=["native"])
            kernel = kernel_module.packed_cubic_norm_form_first_obstruction_in_place
            metadata = native_module.kernel_integer_zeros(kernel, 4, 16)
            if kernel(
                metadata,
                native_module.kernel_integer_buffer(kernel, coefficients),
                norm,
                max_modulus,
                remaining_states,
            ):
                values = tuple(
                    int(value)
                    for value in native_module.integer_buffer_values(metadata)
                )
                used, modulus, states, complete = values
                valid = bool(
                    len(values) == 4
                    and 0 <= used <= remaining_states
                    and complete in (0, 1)
                    and (
                        (modulus == 0 and states == 0)
                        or (
                            complete == 1
                            and 2 <= modulus <= max_modulus
                            and sage.is_prime(modulus)
                            and states == modulus**3
                            and states <= used
                        )
                    )
                )
                if valid and modulus:
                    return (
                        {
                            **line,
                            "integral_ideal": _packed_cubic_integral_ideal_payload(
                                order, rows
                            ),
                            "ideal_norm": norm,
                            "norm_form_coefficients": list(coefficients),
                            "modulus": modulus,
                            "residue_states": states,
                        },
                        used,
                    )
                if valid and (complete == 1 or used < remaining_states):
                    return (None, used)
        except (ImportError, OverflowError, RuntimeError, TypeError, ValueError):
            pass
    used = 0
    for modulus in range(2, max_modulus + 1):
        if not sage.is_prime(modulus):
            continue
        states = modulus**3
        if used + states > remaining_states:
            return (None, used)
        represented = _cubic_norm_form_represents_targets(
            coefficients,
            modulus,
            norm % modulus,
            (-norm) % modulus,
            cancelled=cancelled,
        )
        used += states
        if not represented:
            return (
                {
                    **line,
                    "integral_ideal": _packed_cubic_integral_ideal_payload(order, rows),
                    "ideal_norm": norm,
                    "norm_form_coefficients": list(coefficients),
                    "modulus": modulus,
                    "residue_states": states,
                },
                used,
            )
    return (None, used)


def _packed_cubic_relation_candidates(
    order: Any,
    factor_base: tuple[Any, ...],
    *,
    maximum_candidates: int,
    coefficient_bound: int = _CUBIC_RELATION_SIEVE_BOUND,
    cancelled: Callable[[], bool] | None,
) -> tuple[tuple[tuple[int, ...], tuple[int, ...], int], ...] | None:
    """Propose small integral relations through two packed exact kernels.

    The first kernel enumerates a canonical cubic coefficient box and retains
    only elements whose rational norm is supported on factor-base rational
    primes.  The second computes all prime-ideal valuations in one packed
    lattice pass.  These rows are only proposals: the collector independently
    proves generator containment and equal ideal norm before admission.
    """
    coefficient_bound = int(coefficient_bound)
    if (
        not factor_base
        or len(factor_base) > 16
        or maximum_candidates < 1
        or coefficient_bound < 1
        or coefficient_bound > _CUBIC_RELATION_DEPENDENCY_SIEVE_BOUND
    ):
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
    coefficients = _order_cubic_norm_form_coefficients(order)
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
            coefficient_bound,
            capacity,
        ):
            return None
        metadata_values = tuple(
            int(value) for value in native_module.integer_buffer_values(metadata)
        )
        if (
            len(metadata_values) != 4
            or metadata_values[2] != 0
            or metadata_values[3] != coefficient_bound
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
            packed_power_method = getattr(prime_ideal, "packed_power_bases", None)
            packed_powers: Any = (
                packed_power_method(maximum)
                if callable(packed_power_method)
                else ideal_module.packed_valuation_power_bases(prime_ideal, maximum)
            )
            for packed_basis, denominator in packed_powers:
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
    exact relation admission boundary authenticate every proposed element.  A
    duplicate of an already-selected row costs one new relation; otherwise
    retain a pair of new generators with the same row.
    """
    limit = max(0, int(maximum))
    if limit == 0 or not selected:
        return ()
    selected_rows = tuple(tuple(int(value) for value in entry[0]) for entry in selected)
    retained_coordinates_by_row: dict[tuple[int, ...], dict[tuple[int, ...], bool]] = {}
    for row, coordinates, _norm in selected:
        normalized_row = tuple(int(value) for value in row)
        normalized_coordinates = tuple(int(value) for value in coordinates)
        retained_coordinates_by_row.setdefault(normalized_row, {})[
            normalized_coordinates
        ] = True
    candidates_by_row: dict[
        tuple[int, ...],
        list[
            tuple[
                tuple[int, ...],
                tuple[tuple[int, ...], tuple[int, ...], int],
            ]
        ],
    ] = {}
    indexed_coordinates_by_row: dict[tuple[int, ...], dict[tuple[int, ...], bool]] = {}
    for candidate in candidates:
        row, coordinates, _norm = candidate
        normalized_row = tuple(int(value) for value in row)
        normalized_coordinates = tuple(int(value) for value in coordinates)
        indexed_coordinates = indexed_coordinates_by_row.setdefault(normalized_row, {})
        if indexed_coordinates.get(normalized_coordinates, False):
            continue
        indexed_coordinates[normalized_coordinates] = True
        candidates_by_row.setdefault(normalized_row, []).append(
            (normalized_coordinates, candidate)
        )

    answer: list[tuple[tuple[int, ...], tuple[int, ...], int]] = []
    for selected_row in selected_rows:
        retained_coordinates = retained_coordinates_by_row.setdefault(selected_row, {})
        for coordinates, candidate in candidates_by_row.get(selected_row, ()):
            if retained_coordinates.get(coordinates, False):
                continue
            retained_coordinates[coordinates] = True
            answer.append(candidate)
            break
        if len(answer) >= limit:
            break
    dependencies = len(answer)
    if dependencies >= limit:
        return tuple(answer)

    # A wider fallback box can expose a useful duplicate row that was not part
    # of the minimal class-presentation support.  Retain both generators of
    # such a pair.  Their exact rows may enlarge the presentation lattice, but
    # every row is independently admitted before the incomplete seed is
    # issued, and the coupled engine recomputes the presentation from the
    # resulting authenticated prefix.
    grouped: dict[
        tuple[int, ...],
        list[tuple[tuple[int, ...], tuple[int, ...], int]],
    ] = {}
    selected_row_set = {row: True for row in selected_rows}
    for row, indexed_candidates in candidates_by_row.items():
        if selected_row_set.get(row, False):
            continue
        for _coordinates, candidate in indexed_candidates:
            grouped.setdefault(row, []).append(candidate)
    for duplicate_candidates in grouped.values():
        if len(duplicate_candidates) < 2:
            continue
        answer.extend(duplicate_candidates[:2])
        dependencies += 1
        if dependencies >= limit:
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
    coefficients = _cubic_norm_form_coefficients_from_order(integral)
    if coefficients is None:
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
        _packed_factor_records: tuple[PackedCubicFactorRecord, ...] = (),
    ) -> None:
        if complete and certificate is None:
            raise ValueError("a complete cubic class number needs a certificate")
        self.field = field
        self.complete = bool(complete)
        self.reason = str(reason)
        self.minkowski_bound = int(minkowski_bound)
        self.certificate = certificate
        self._factor_base = tuple(factor_base)
        self._packed_factor_records = tuple(_packed_factor_records)
        if self._factor_base and self._packed_factor_records:
            raise ValueError("a cubic result has two factor-base representations")
        self.relation_records = tuple(relation_records)
        self.presentation = presentation
        self.diagnostics = dict({} if diagnostics is None else diagnostics)
        self.proof_status = "exact-unconditional" if complete else "incomplete"

    @property
    def factor_base(self) -> tuple[Any, ...]:
        if not self._factor_base and self._packed_factor_records:
            _records, factors = _materialize_packed_cubic_factor_records(
                self._packed_factor_records
            )
            self._factor_base = factors
            self._packed_factor_records = ()
        return self._factor_base

    def _factor_base_size(self) -> int:
        return len(self._factor_base) + len(self._packed_factor_records)

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
    plan = seed.plan
    bound = plan.bound_result
    presentation = result.presentation
    search_state = seed.search_state
    diagnostics = result.diagnostics

    factor_records = []
    for record in seed.factor_records:
        prime_ideal = record.prime_ideal
        current_basis = tuple(
            tuple((int(value._numerator), int(value._denominator)) for value in row)
            for row in prime_ideal._basis_rows
        )
        factor_records.append(
            (
                id(record),
                id(prime_ideal),
                int(record.index),
                int(record.rational_prime),
                int(record.norm),
                int(record.ramification_index),
                int(record.residue_degree),
                tuple(record.hnf_fingerprint),
                current_basis,
                int(prime_ideal.rational_prime()),
                int(prime_ideal.ramification_index()),
                int(prime_ideal.residue_class_degree()),
                _freeze_authentication_value(record.two_generator),
                _freeze_authentication_value(record.valuation_metadata),
                tuple(record.residue_modulus),
                _freeze_authentication_value(record.automorphism_orbit),
                _freeze_authentication_value(prime_ideal._residue_presentation),
            )
        )

    relations = tuple(
        (
            id(record),
            tuple(record.row),
            tuple(record.quotient_row),
            tuple(record.source_row),
            _freeze_authentication_value(record.witness),
            _freeze_authentication_value(record.norm_smoothness),
            _freeze_authentication_value(record.archimedean_logs),
            int(record.log_precision),
            _freeze_authentication_value(record.provenance),
        )
        for record in result.relation_records
    )
    presentation_snapshot = (
        id(presentation),
        int(presentation.column_count),
        tuple(row.dense() for row in presentation.relation_rows),
        tuple(presentation.hnf),
        tuple(presentation.hnf_left_transform),
        tuple(presentation.smith),
        tuple(presentation.smith_left_transform),
        tuple(presentation.smith_right_transform),
        tuple(presentation.smith_right_inverse),
        str(presentation.backend),
        int(presentation.rank),
        tuple(presentation.invariants),
        presentation.order,
    )
    proof_diagnostics = (
        diagnostics.get("algorithm"),
        diagnostics.get("factor_base_size"),
        diagnostics.get("relations"),
        diagnostics.get("presentation_rank"),
        diagnostics.get("quotient_order"),
        diagnostics.get("residue_states"),
        _freeze_authentication_value(diagnostics.get("relation_search")),
        _freeze_authentication_value(diagnostics.get("caps")),
        diagnostics.get("factor_base_materialized"),
        diagnostics.get("relation_seed_size_policy_exceeded"),
    )
    return (
        AUTHENTICATED_CUBIC_RELATION_SEED_SCHEMA,
        id(result),
        bool(result.complete),
        str(result.reason),
        int(result.minkowski_bound),
        str(result.proof_status),
        proof_diagnostics,
        id(plan),
        id(plan.order),
        str(bound.theorem),
        tuple(bound.assumptions),
        int(bound.bound),
        int(bound.degree),
        tuple(bound.signature),
        int(bound.discriminant),
        int(bound.precision_bits),
        _freeze_authentication_value(bound.to_dict()["interval"]),
        _freeze_authentication_value(bound.details),
        int(plan.max_bound),
        int(plan.max_rational_primes),
        int(plan.max_prime_ideals),
        int(plan.max_memory_bytes),
        tuple(plan.degree_filters),
        bool(plan.fits_caps),
        tuple(plan.cap_failures),
        tuple(factor_records),
        relations,
        presentation_snapshot,
        id(search_state),
        int(search_state.seed),
        int(search_state.random_state),
        int(search_state.candidates_tested),
        int(search_state.ideals_tested),
        int(search_state.relations_admitted),
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
    # The private constructor has just captured every proof-bearing object in
    # one synchronous call; user code cannot interpose between construction
    # and attachment.  Recomputing the complete snapshot here used to be the
    # first of several identical serializations.  Every later cache read still
    # calls `seed.certified` and rejects any intervening mutation.
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
        self.factor_base_size = result._factor_base_size()
        self.relation_count = len(result.relation_records)
        self.__dict__["_source_field"] = result.field
        self.__dict__["_source_result"] = result
        self.__dict__["_source_certificate"] = certificate
        # The complete result is checked once, synchronously, at the exact
        # producer boundary.  Public scalar class-number reads subsequently
        # consume this module-issued seal, not the mutable diagnostic/result
        # wrapper.  Detached certificates still take the full replay path.
        self.__dict__["_frozen"] = True

    def __setattr__(self, name: str, value: Any) -> None:
        if self.__dict__.get("_frozen", False):
            raise AttributeError("authenticated cubic class-number seals are immutable")
        self.__dict__[name] = value

    @property
    def certified(self) -> bool:
        try:
            source = self.__dict__.get("_source_result")
            certificate = self.__dict__.get("_source_certificate")
            return (
                type(source) is CubicClassNumberResult
                and source.field is self.__dict__.get("_source_field")
                and source.__dict__.get("_live_authentication") is self
                and source.certificate is certificate
                and type(certificate) is CubicMinkowskiClassNumberCertificate
                and certificate.field is self.__dict__.get("_source_field")
                and certificate.stable_hash() == self.certificate_sha256
                and self.proof_status == "exact-unconditional"
                and self.__dict__.get("_authentication_snapshot")
                == _authenticated_cubic_class_number_snapshot(self)
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
    # Construction binds the exact certificate, source field/result identities,
    # and certified scalar synchronously.  Public scalar consumers need only
    # validate this constant-size seal; they never trust the diagnostic wrapper.
    result.__dict__["_live_authentication"] = authentication
    return result


def authenticated_cubic_class_number_result_matches(result: Any, field: Any) -> bool:
    """Check a producer-issued live result without detached arithmetic replay."""
    return authenticated_cubic_class_number(result, field) is not None


def authenticated_cubic_class_number(result: Any, field: Any) -> int | None:
    """Return the sealed live class number, or `None` without exact authority."""
    if type(result) is not CubicClassNumberResult or result.field is not field:
        return None
    try:
        authentication = result.__dict__.get("_live_authentication")
        if (
            type(authentication) is _AuthenticatedCubicClassNumberResult
            and authentication.__dict__.get("_source_result") is result
            and authentication.__dict__.get("_source_field") is field
            and authentication.certified
        ):
            return int(authentication.class_number)
    except (AttributeError, TypeError, ValueError):
        pass
    return None


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
    max_relation_seed_prime_ideals: int | None = None,
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
    relation_seed_prime_ideal_cap = (
        None
        if max_relation_seed_prime_ideals is None
        else _positive_integer(
            max_relation_seed_prime_ideals,
            "maximum relation-seed prime ideals",
        )
    )
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
    order = field.maximal_order()
    plan = factor_base_module.factor_base_plan(
        order,
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
        output_factor_base = tuple(factor_base)
        seed_factor_records = tuple(live_factor_records)
        seed_collector = live_collector
        if output_factor_base and isinstance(
            output_factor_base[0], PackedCubicFactorRecord
        ):
            source_records = (
                seed_factor_records if seed_factor_records else output_factor_base
            )
            seed_factor_records, output_factor_base = (
                _materialize_packed_cubic_factor_records(source_records)
            )
            if live_collector is not None:
                relation_replay_module = __import__(
                    "sagejs.number_fields.class_group_relations",
                    fromlist=["class_group_relations"],
                )
                seed_collector = relation_replay_module.ExactRelationCollector(
                    order, output_factor_base
                )
                for retained_record in relation_records:
                    # The packed producer proved containment in precisely the
                    # same HNF lattices.  Materialization above requires every
                    # canonical factor payload to remain byte-for-byte equal,
                    # so transferring these module-issued records preserves
                    # the exact admission boundary without a detached replay.
                    seed_collector._store_verified(retained_record)
        phase_timings["total"] = time.perf_counter() - total_started
        result = CubicClassNumberResult(
            field,
            False,
            reason,
            int(plan.bound),
            factor_base=output_factor_base,
            relation_records=relation_records,
            presentation=presentation,
            diagnostics={
                "algorithm": "bounded-cubic-minkowski-p-lines",
                "phase_timings": dict(phase_timings),
                "factor_base_size": len(output_factor_base),
                "relations": len(relation_records),
                "presentation_rank": int(getattr(presentation, "rank", 0)),
                "quotient_order": getattr(presentation, "order", None),
                "residue_states": int(residue_states),
                "relation_search": dict(relation_metrics),
                "caps": dict(checked_caps),
            },
        )
        if (
            seed_collector is not None
            and presentation is not None
            and live_search_state is not None
            and not live_has_partials
        ):
            return _issue_cubic_relation_seed(
                result,
                plan,
                seed_factor_records,
                seed_collector,
                presentation,
                live_search_state,
            )
        return result

    try:
        _check_cubic_cancelled(cancelled)
        plan.require_feasible()
        descriptor_scan = getattr(factor_base_module, "_eligible_descriptors", None)
        if (
            relation_seed_prime_ideal_cap is not None
            and int(plan.bound) > _CUBIC_PACKED_PREMATERIALIZATION_BOUND
            and callable(descriptor_scan)
        ):
            descriptors: Any = descriptor_scan(plan)
            if len(descriptors) > relation_seed_prime_ideal_cap:
                phase_timings["factor_base"] = time.perf_counter() - factor_started
                result = incomplete(
                    "the exact Minkowski factor base exceeds the relation-seed size policy"
                )
                result.diagnostics["factor_base_size"] = len(descriptors)
                result.diagnostics["factor_base_materialized"] = False
                result.diagnostics["relation_seed_size_policy_exceeded"] = True
                return result
        # Keep cubic factors in the packed producer representation even for a
        # one-prime Minkowski base.  The fused factorization/materialization
        # path is now cheaper than constructing and fingerprinting the generic
        # ideal record, and the collector can retain the authenticated snapshot
        # without changing the detached certificate boundary.
        packed_factor_records = packed_cubic_factor_records(plan)
        factor_records = (
            factor_base_module.build_factor_base(plan)
            if packed_factor_records is None
            else packed_factor_records
        )
    except RuntimeError:
        raise
    except ValueError as error:
        phase_timings["factor_base"] = time.perf_counter() - factor_started
        return incomplete(
            "bounded cubic Minkowski factor base is unavailable: " + str(error)
        )
    phase_timings["factor_base"] = time.perf_counter() - factor_started
    factor_base = tuple(
        record if isinstance(record, PackedCubicFactorRecord) else record.prime_ideal
        for record in factor_records
    )
    if (
        relation_seed_prime_ideal_cap is not None
        and len(factor_base) > relation_seed_prime_ideal_cap
    ):
        result = incomplete(
            "the exact Minkowski factor base exceeds the relation-seed size policy",
            factor_base=factor_base,
        )
        result.diagnostics["factor_base_materialized"] = True
        result.diagnostics["relation_seed_size_policy_exceeded"] = True
        return result

    relation_module = __import__(
        "sagejs.number_fields.class_group_relations",
        fromlist=["class_group_relations"],
    )
    matrix_module = __import__(
        "sagejs.number_fields.class_group_matrix", fromlist=["class_group_matrix"]
    )
    relation_started = time.perf_counter()
    engine: Any = None
    collector = relation_module.ExactRelationCollector(
        order,
        factor_base,
        _validated_token=(
            relation_module._VALIDATED_FACTOR_BASE_TOKEN
            if factor_base and isinstance(factor_base[0], PackedCubicFactorRecord)
            else None
        ),
    )
    prime_module = __import__(
        "sagejs.number_fields.prime_ideals", fromlist=["prime_ideals"]
    )
    one_coordinates = tuple(prime_module._order_one_coordinates(order))
    initial_proposals: list[
        tuple[tuple[int, ...], tuple[int, ...], dict[str, Any]]
    ] = []
    for sequence, rational_prime in enumerate(
        sorted({int(ideal.rational_prime()) for ideal in factor_base})
    ):
        row = [0] * len(factor_base)
        local_degree = 0
        for index, prime_ideal in enumerate(factor_base):
            if int(prime_ideal.rational_prime()) != rational_prime:
                continue
            exponent = int(prime_ideal.ramification_index())
            residue_degree = int(prime_ideal.residue_class_degree())
            row[index] = exponent
            local_degree += exponent * residue_degree
        if local_degree == int(order.degree()):
            initial_proposals.append(
                (
                    tuple(rational_prime * value for value in one_coordinates),
                    tuple(row),
                    {
                        "algorithm": "rational-prime-decomposition",
                        "rational_prime": rational_prime,
                        "sequence": sequence,
                    },
                )
            )
    sieve_capacity = checked_caps["max_relations"] - len(initial_proposals)
    sieve_candidates: Any = None
    if sieve_capacity > 0:
        sieve_candidates = _packed_cubic_relation_candidates(
            order,
            factor_base,
            maximum_candidates=sieve_capacity,
            cancelled=cancelled,
        )
    raw_sieve_count = 0 if sieve_candidates is None else len(sieve_candidates)
    selected_sieve_candidates: Any = None
    if sieve_candidates is not None:
        selected_sieve_candidates = _select_cubic_relation_candidates(
            matrix_module,
            tuple(proposal[1] for proposal in initial_proposals),
            sieve_candidates,
            len(factor_base),
        )
    sieve_admitted = 0
    if selected_sieve_candidates is not None:
        try:
            proposals = tuple(
                (
                    coordinates,
                    row,
                    {
                        "algorithm": "packed-cubic-integral-relation-sieve",
                        "coefficient_bound": _CUBIC_RELATION_SIEVE_BOUND,
                        "order_basis_coordinates": list(coordinates),
                    },
                )
                for row, coordinates, _expected_norm in selected_sieve_candidates
            )
            batch_admit = getattr(collector, "admit_integral_order_basis_rows", None)
            batch: Any = (
                batch_admit(tuple(initial_proposals) + proposals)
                if callable(batch_admit)
                else None
            )
            if batch is None:
                relation_module.initial_rational_prime_relations(collector)
                for coordinates, row, provenance in proposals:
                    # The packed norm only selected this proposal.  Integral
                    # admission independently recomputes the exact element
                    # norm and every required prime-power containment.
                    collector.admit_integral_order_basis_row(
                        coordinates,
                        row,
                        provenance=provenance,
                    )
                    sieve_admitted += 1
            else:
                if len(batch) != len(initial_proposals) + len(proposals):
                    raise ArithmeticError(
                        "a packed cubic relation batch returned the wrong row count"
                    )
                sieve_admitted = len(proposals)
        except (ArithmeticError, TypeError, ValueError):
            # A packed proposal is never proof evidence by itself.  Discard
            # every proposed row if its independent containment replay fails;
            # the unchanged LLL relation search below remains authoritative.
            collector = relation_module.ExactRelationCollector(order, factor_base)
            relation_module.initial_rational_prime_relations(collector)
            selected_sieve_candidates = None
            sieve_admitted = 0
    if not collector.records:
        initial_batch_method = getattr(
            collector, "admit_integral_order_basis_rows", None
        )
        initial_batch: Any = (
            initial_batch_method(tuple(initial_proposals))
            if callable(initial_batch_method) and initial_proposals
            else None
        )
        if initial_batch is None:
            if factor_base and isinstance(factor_base[0], PackedCubicFactorRecord):
                factor_records, factor_base = _materialize_packed_cubic_factor_records(
                    tuple(factor_records)
                )
                collector = relation_module.ExactRelationCollector(order, factor_base)
            relation_module.initial_rational_prime_relations(collector)
    relation_metrics["integral_sieve_candidates"] = raw_sieve_count
    relation_metrics["integral_sieve_selected"] = (
        0 if selected_sieve_candidates is None else len(selected_sieve_candidates)
    )
    relation_metrics["integral_sieve_relations"] = sieve_admitted
    relation_metrics["integral_sieve_fallback"] = int(selected_sieve_candidates is None)
    relation_metrics["integral_sieve_dependency_candidates"] = 0
    relation_metrics["integral_sieve_dependency_relations"] = 0
    relation_metrics["relation_prefix_finalized_without_search"] = 0
    relation_search_state: Any = None
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
            relation_search_state = relation_module.RelationSearchState(0)
            relation_metrics["relation_prefix_finalized_without_search"] = 1
            relation_metrics["presentation_extractions"] = 1
        else:
            if factor_base and isinstance(factor_base[0], PackedCubicFactorRecord):
                factor_records, factor_base = _materialize_packed_cubic_factor_records(
                    tuple(factor_records)
                )
                ordinary_collector = relation_module.ExactRelationCollector(
                    order, factor_base
                )
                for retained_record in collector.records:
                    ordinary_collector._store_verified(retained_record)
                collector = ordinary_collector
            engine_module = __import__(
                "sagejs.number_fields.class_unit_groups",
                fromlist=["class_unit_groups"],
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
                max_factor_base_bound=_positive_integer(
                    max_bound, "maximum factor-base bound"
                ),
                max_factor_base_size=_positive_integer(
                    max_prime_ideals, "maximum prime ideals"
                ),
                max_relation_attempts=checked_caps["max_relation_attempts"],
                max_relations=checked_caps["max_relations"],
                max_candidates_per_ideal=checked_caps["max_candidates_per_ideal"],
                max_random_terms=5,
                max_coefficient_bound=3,
                max_partial_relations=checked_caps["max_relations"],
                max_memory_bytes=_positive_integer(
                    max_memory_bytes, "maximum memory bytes"
                ),
            )
            engine = engine_module.ClassUnitGroupEngine(
                field,
                proof=True,
                algorithm="minkowski",
                limits=limits,
                cancelled=cancelled,
                components=components,
            )
            collector, presentation = engine._relations(
                factor_base,
                0,
                collector=collector,
                presentation=presentation,
                relations_per_ideal=1,
                independent_relations_per_ideal=True,
                target_missing_pivots=True,
            )
            relation_search_state = engine._relation_search_state
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
    live_search_state = relation_search_state
    live_has_partials = bool(engine is not None and engine._partials)
    engine_resources = (
        {} if engine is None else engine._diagnostics().get("resources", {})
    )
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
    for name in ("relation_attempts", "relation_candidates", "ideals_tested"):
        relation_metrics.setdefault(name, 0)

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
        unit_rank_bound = 1 if int(order.discriminant()) < 0 else 2
        dependency_sieve_bound = _CUBIC_RELATION_SIEVE_BOUND
        dependency_candidates = _select_cubic_dependency_candidates(
            selected_sieve_candidates,
            sieve_candidates,
            min(remaining, unit_rank_bound),
        )
        if not dependency_candidates:
            # Keep the class-number producer's small canonical coefficient
            # box unchanged.  Only after its proof has failed, widen the
            # packed enumeration once to look for a duplicate valuation row.
            # Two independently admitted generators with that same row have
            # a unit quotient.  For the small complex cubics this frequently
            # exposes the fundamental unit directly and avoids a later LLL
            # relation/saturation round, while successful class-number-only
            # computations never pay for or serialize this fallback search.
            widened_candidates = _packed_cubic_relation_candidates(
                order,
                factor_base,
                maximum_candidates=sieve_capacity,
                coefficient_bound=_CUBIC_RELATION_DEPENDENCY_SIEVE_BOUND,
                cancelled=cancelled,
            )
            if widened_candidates is not None:
                dependency_candidates = _select_cubic_dependency_candidates(
                    selected_sieve_candidates,
                    widened_candidates,
                    min(remaining, unit_rank_bound),
                )
                if dependency_candidates:
                    dependency_sieve_bound = _CUBIC_RELATION_DEPENDENCY_SIEVE_BOUND
        relation_metrics["integral_sieve_dependency_candidates"] = len(
            dependency_candidates
        )
        if dependency_candidates:
            relation_metrics["integral_sieve_dependency_coefficient_bound"] = (
                dependency_sieve_bound
            )
        if not dependency_candidates:
            return
        started = time.perf_counter()
        admitted = 0
        dependency_proposals = tuple(
            (
                coordinates,
                row,
                {
                    "algorithm": "packed-cubic-unit-dependency-seed",
                    "coefficient_bound": dependency_sieve_bound,
                    "order_basis_coordinates": list(coordinates),
                },
            )
            for row, coordinates, _expected_norm in dependency_candidates
        )
        batch_admit = getattr(collector, "admit_integral_order_basis_rows", None)
        batch: Any = None
        if callable(batch_admit):
            try:
                batch = batch_admit(dependency_proposals)
            except (ArithmeticError, TypeError, ValueError):
                batch = None
        if batch is not None:
            admitted = len(batch)
        else:
            for coordinates, row, provenance in dependency_proposals:
                _check_cubic_cancelled(cancelled)
                try:
                    collector.admit_integral_order_basis_row(
                        coordinates,
                        row,
                        provenance=provenance,
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
        packed_search = _find_packed_cubic_norm_obstruction(
            factor_base,
            line,
            max_modulus=checked_caps["max_modulus"],
            remaining_states=checked_caps["max_residue_states"] - residue_states,
            cancelled=cancelled,
        )
        if packed_search is None:
            _ordinary_records, ordinary_factor_base = (
                _materialize_packed_cubic_factor_records(tuple(factor_records))
            )
            representative = relation_module.reconstruct_factor_base_ideal(
                field.maximal_order(), ordinary_factor_base, line["ambient_row"]
            )
            obstruction, used = _find_cubic_norm_obstruction(
                representative,
                line,
                max_modulus=checked_caps["max_modulus"],
                remaining_states=checked_caps["max_residue_states"] - residue_states,
                cancelled=cancelled,
            )
        else:
            obstruction, used = packed_search
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
            factor_base=(
                ()
                if factor_base and isinstance(factor_base[0], PackedCubicFactorRecord)
                else factor_base
            ),
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
            _packed_factor_records=(
                tuple(factor_records)
                if factor_records
                and isinstance(factor_records[0], PackedCubicFactorRecord)
                else ()
            ),
        )
    )


__all__ = [
    "CUBIC_CLASS_NUMBER_CERTIFICATE_SCHEMA",
    "CubicClassNumberResult",
    "CubicMinkowskiClassNumberCertificate",
    "PackedCubicFactorRecord",
    "authenticated_cubic_class_number",
    "authenticated_cubic_class_number_result_matches",
    "authenticated_cubic_relation_seed",
    "bounded_cubic_minkowski_class_number",
    "materialize_verified_packed_cubic_factor_records",
    "packed_cubic_factor_records",
]
