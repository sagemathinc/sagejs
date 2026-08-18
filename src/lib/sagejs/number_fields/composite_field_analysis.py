"""Proof-carrying fast path for square discriminant support.

This module handles a structural family that occurs when one small proved
prime accounts for the nonsquare part of a defining-polynomial discriminant
and the complementary support is an exact square.  The square root is kept as
one composite component: Buchmann--Lenstra arithmetic may split it lazily, but
the proof never assumes that component is prime or completely factors it.

Construction and authentication are deliberately different data flows.
Construction may use composite Dedekind/BL and the native word-prime order
resource.  Authentication only checks the final canonical lattice, the exact
square-index identity, a directly recognizable Dedekind certificate at the
residual prime, and discriminant coprimality at the whole composite support.
Thus it does not replay either accepted construction algorithm.
"""

from __future__ import annotations

import time
from typing import Any

from sagejs.native import (
    IntegerBuffer,
    kernel_integer_buffer,
    kernel_integer_zeros,
    native,
    uint64,
)
from sagejs.number_fields import buchmann_lenstra as bl
from sagejs.number_fields.discriminant_components import (
    PROVEN_PRIME,
    integer_gcd,
    primality_status,
)
from sagejs.number_fields.maximal_order_contracts import (
    DiscriminantComponent,
    OrderBasis,
)
from sagejs.number_fields.order_resource import native_order_from_polynomial

COMPOSITE_ANALYSIS_COMPLETE = "complete"
COMPOSITE_ANALYSIS_NOT_APPLICABLE = "not-applicable"
COMPOSITE_ANALYSIS_FALLBACK = "fallback"

AUTHENTICATED_COMPOSITE_ANALYSIS_SCHEMA = (
    "sagejs.number-fields/authenticated-composite-square-support-v1"
)

_SMALL_PROVED_PRIMES = (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47)
_MAX_WORD_PRIME = 4_294_967_291


@native
def packed_polynomial_discriminant(
    workspace: IntegerBuffer,
    polynomial: IntegerBuffer,
    degree: uint64,
) -> int:
    """Return the exact discriminant of one monic packed polynomial.

    Zero is the fail-closed result for malformed input or a singular
    polynomial.  The source is a direct fraction-free Sylvester determinant,
    retained here so factor discovery need not materialize a matrix graph.
    """
    size = 2 * degree - 1
    valid = (
        degree > 0
        and len(polynomial) == degree + 1
        and polynomial[degree] == 1
        and len(workspace) == size * size
    )
    entry = 0
    while entry < len(workspace):
        workspace[entry] = 0
        entry += 1
    shift = 0
    while valid and shift < degree - 1:
        coefficient = 0
        while coefficient <= degree:
            workspace[shift * size + shift + coefficient] = polynomial[
                degree - coefficient
            ]
            coefficient += 1
        shift += 1
    shift = 0
    while valid and shift < degree:
        coefficient = 0
        while coefficient < degree:
            exponent = degree - coefficient
            workspace[(degree - 1 + shift) * size + shift + coefficient] = (
                exponent * polynomial[exponent]
            )
            coefficient += 1
        shift += 1
    sign = 1
    previous = 1
    column = 0
    while valid and column < size - 1:
        pivot_row = column
        while pivot_row < size and workspace[pivot_row * size + column] == 0:
            pivot_row += 1
        if pivot_row == size:
            valid = False
        elif pivot_row != column:
            entry = 0
            while entry < size:
                left = column * size + entry
                right = pivot_row * size + entry
                temporary = workspace[left]
                workspace[left] = workspace[right]
                workspace[right] = temporary
                entry += 1
            sign = -sign
        if valid:
            pivot = workspace[column * size + column]
            row = column + 1
            while row < size:
                factor = workspace[row * size + column]
                entry = column + 1
                while entry < size:
                    exact = (
                        workspace[row * size + entry] * pivot
                        - factor * workspace[column * size + entry]
                    )
                    if previous != 1:
                        if exact % previous != 0:
                            valid = False
                        else:
                            exact //= previous
                    if valid:
                        workspace[row * size + entry] = exact
                    entry += 1
                workspace[row * size + column] = 0
                row += 1
            previous = pivot
        column += 1
    if not valid:
        return 0
    answer = sign * workspace[size * size - 1]
    if degree * (degree - 1) // 2 % 2:
        answer = -answer
    return answer


@native
def packed_integer_square_root(value: int) -> int:
    """Return `floor(sqrt(value))` by exact Newton iteration."""
    if value < 0:
        return -1
    if value < 2:
        return value
    # Starting at the first power of two above the root avoids the many
    # divisions caused by starting Newton iteration at `value` itself.
    bits = 0
    probe = value
    while probe:
        probe //= 2
        bits += 1
    current = 1
    shift = 0
    while shift < (bits + 1) // 2:
        current *= 2
        shift += 1
    following = (current + value // current) // 2
    while following < current:
        current = following
        following = (current + value // current) // 2
    while (current + 1) * (current + 1) <= value:
        current += 1
    while current * current > value:
        current -= 1
    return current


@native
def packed_order_lattice_is_valid(
    workspace: IntegerBuffer,
    numerator: IntegerBuffer,
    polynomial: IntegerBuffer,
    denominator: int,
    degree: uint64,
) -> bool:
    """Check equation-order containment and multiplication closure.

    Unlike the table-producing BL primitive, this proof boundary returns only
    a boolean.  It therefore does not copy `degree^3` large structure
    constants back through the host merely to discard them.
    """
    square = degree * degree
    inverse_offset = 0
    product_offset = square
    valid = (
        degree > 0
        and denominator > 0
        and len(workspace) == square + 2 * degree - 1
        and len(numerator) == square
        and len(polynomial) == degree + 1
        and polynomial[degree] == 1
    )
    row = 0
    while valid and row < degree:
        column = 0
        while column < row:
            if numerator[row * degree + column] != 0:
                valid = False
            column += 1
        row += 1
    reverse_row = 0
    while valid and reverse_row < degree:
        row = degree - reverse_row - 1
        diagonal = numerator[row * degree + row]
        if diagonal <= 0:
            valid = False
        column = 0
        while valid and column < degree:
            value = 0
            if row == column:
                value = denominator
            source = row + 1
            while source < degree:
                value -= (
                    numerator[row * degree + source]
                    * workspace[inverse_offset + source * degree + column]
                )
                source += 1
            if value % diagonal != 0:
                valid = False
            else:
                workspace[inverse_offset + row * degree + column] = value // diagonal
            column += 1
        reverse_row += 1
    denominator_squared = denominator * denominator
    left = 0
    while valid and left < degree:
        right = left
        while valid and right < degree:
            entry = 0
            while entry < 2 * degree - 1:
                workspace[product_offset + entry] = 0
                entry += 1
            left_index = 0
            while left_index < degree:
                left_value = numerator[left * degree + left_index]
                if left_value:
                    right_index = 0
                    while right_index < degree:
                        right_value = numerator[right * degree + right_index]
                        if right_value:
                            workspace[product_offset + left_index + right_index] += (
                                left_value * right_value
                            )
                        right_index += 1
                left_index += 1
            offset = 0
            while offset < degree - 1:
                exponent = 2 * degree - 2 - offset
                leading = workspace[product_offset + exponent]
                if leading:
                    coefficient = 0
                    while coefficient < degree:
                        workspace[product_offset + exponent - degree + coefficient] -= (
                            leading * polynomial[coefficient]
                        )
                        coefficient += 1
                offset += 1
            column = 0
            while valid and column < degree:
                value = 0
                source = 0
                while source < degree:
                    value += (
                        workspace[product_offset + source]
                        * workspace[inverse_offset + source * degree + column]
                    )
                    source += 1
                if value % denominator_squared != 0:
                    valid = False
                column += 1
            right += 1
        left += 1
    return valid


def _polynomial_discriminant(coefficients: list[int]) -> int:
    degree = len(coefficients) - 1
    maximum_bits = max(abs(value).bit_length() for value in coefficients)
    word_capacity = max(16, (4 * degree * (maximum_bits + 1) + 63) // 64 + 8)
    workspace = kernel_integer_zeros(
        packed_polynomial_discriminant,
        (2 * degree - 1) ** 2,
        word_capacity,
    )
    return int(
        packed_polynomial_discriminant(
            workspace,
            kernel_integer_buffer(packed_polynomial_discriminant, coefficients),
            degree,
        )
    )


def _square_root(value: int) -> int:
    root = int(packed_integer_square_root(int(value)))
    if root < 0 or root * root != int(value):
        raise ValueError("the discriminant complement is not an exact square")
    return root


def _monomial_dedekind_is_p_maximal(coefficients: list[int], prime: int) -> bool:
    """Check the exact `f mod p = x^n` Dedekind shortcut.

    In this shape the distinct-factor radical is `x`, its complementary
    quotient is `x^(n-1)`, and the Dedekind obstruction is one precisely when
    the constant coefficient of `(f - x^n)/p` is nonzero modulo `p`.
    """
    if prime not in _SMALL_PROVED_PRIMES or len(coefficients) < 2:
        return False
    if coefficients[-1] != 1:
        return False
    if any(value % prime != 0 for value in coefficients[:-1]):
        return False
    return coefficients[0] % (prime * prime) != 0


def _residual_prime_and_square_support(
    discriminant: int, coefficients: list[int]
) -> tuple[int, int, int] | None:
    absolute = abs(int(discriminant))
    for prime in _SMALL_PROVED_PRIMES:
        if absolute % prime != 0:
            continue
        remaining = absolute
        exponent = 0
        while remaining % prime == 0:
            remaining //= prime
            exponent += 1
        try:
            support = _square_root(remaining)
        except ValueError:
            continue
        if (
            support > 1
            and integer_gcd(support, prime) == 1
            and _monomial_dedekind_is_p_maximal(coefficients, prime)
        ):
            return prime, exponent, support
    return None


def _basis_index(basis: OrderBasis) -> int:
    determinant = 1
    for row in range(basis.degree):
        diagonal = int(basis.numerator[row][row])
        if diagonal <= 0:
            raise ArithmeticError("a canonical basis has a nonpositive diagonal")
        determinant *= diagonal
    numerator = basis.denominator**basis.degree
    if numerator % determinant != 0:
        raise ArithmeticError("a candidate basis has a nonintegral index")
    return numerator // determinant


def _merge_bases(bases: list[OrderBasis]) -> OrderBasis:
    if not bases:
        raise ValueError("at least one order basis is required")
    if len(bases) == 1:
        return bases[0]
    degree = bases[0].degree
    denominator = 1
    for basis in bases:
        if basis.degree != degree:
            raise ValueError("order bases have inconsistent degrees")
        denominator = (
            denominator
            * basis.denominator
            // integer_gcd(denominator, basis.denominator)
        )

    def one_generator_shape(basis: OrderBasis) -> bool:
        if basis.numerator[0][0] != 1:
            return False
        for row in range(1, degree):
            for column in range(degree):
                expected = basis.denominator if row == column else 0
                if basis.numerator[row][column] != expected:
                    return False
        return True

    # A very common Dedekind output is `ZZ[one generator]` over the equation
    # order: one HNF row above a diagonal denominator.  Coprime such lattices
    # merge by coordinatewise CRT, so a generic 2n-by-n HNF and its large
    # integer host crossing are unnecessary.
    if all(one_generator_shape(basis) for basis in bases):
        merged = bases[0]
        for following in bases[1:]:
            left_denominator = merged.denominator
            right_denominator = following.denominator
            if integer_gcd(left_denominator, right_denominator) != 1:
                break
            common = left_denominator * right_denominator
            gcd_value, right_coefficient, left_coefficient = bl._extended_gcd(
                right_denominator, left_denominator
            )
            if gcd_value != 1:
                break
            first_row = [1]
            for column in range(1, degree):
                first_row.append(
                    (
                        right_coefficient
                        * right_denominator
                        * merged.numerator[0][column]
                        + left_coefficient
                        * left_denominator
                        * following.numerator[0][column]
                    )
                    % common
                )
            rows = [first_row]
            for row in range(1, degree):
                rows.append(
                    [common if row == column else 0 for column in range(degree)]
                )
            merged = OrderBasis(rows, common, canonical=True)
        if merged.denominator == denominator:
            return merged
    generators: list[list[int]] = []
    for basis in bases:
        scale = denominator // basis.denominator
        generators.extend(
            [[int(value) * scale for value in row] for row in basis.numerator]
        )
    numerator = bl._packed_row_hnf(generators)
    return OrderBasis(numerator, denominator, canonical=True)


def _identity_basis(degree: int) -> OrderBasis:
    return OrderBasis(
        [
            [1 if row == column else 0 for column in range(degree)]
            for row in range(degree)
        ],
        1,
        canonical=True,
    )


def _construct_support_bases(
    coefficients: list[int], equation_discriminant: int, support: int
) -> tuple[list[OrderBasis], dict[str, int], list[dict[str, Any]]]:
    """Resolve one square support without complete integer factorization."""
    timings = {"factor_discovery_ns": 0, "bl_construction_ns": 0, "local_work_ns": 0}
    events: list[dict[str, Any]] = []
    bases: list[OrderBasis] = []
    word_primes: list[int] = []

    started = time.perf_counter_ns()
    cheap_prime = 0
    cheap_exponent = 0
    cheap_complement = support
    for prime in _SMALL_PROVED_PRIMES:
        if support % prime == 0:
            cheap_prime = prime
            while cheap_complement % prime == 0:
                cheap_complement //= prime
                cheap_exponent += 1
            break
    pending: list[int]
    if cheap_prime:
        pending = [cheap_prime]
        if cheap_complement > 1:
            pending.append(cheap_complement)
        events.append(
            {
                "stage": "factor-discovery",
                "state": "exact-small-prime-support-split",
                "component_bits": support.bit_length(),
                "prime": cheap_prime,
                "support_exponent": cheap_exponent,
                "complement_bits": cheap_complement.bit_length(),
            }
        )
    else:
        initial = bl._composite_dedekind_data_reference(coefficients, support)
        if initial.get("status") != "split":
            pending = [support]
        else:
            split = initial["split"]
            left = abs(int(split.left))
            right = abs(int(split.right))
            if left * right != support or integer_gcd(left, right) != 1:
                raise ArithmeticError(
                    "BL factor discovery did not split support exactly"
                )
            pending = [left, right]
            events.append(
                {
                    "stage": "factor-discovery",
                    "state": "split",
                    "component_bits": support.bit_length(),
                    "child_bits": [left.bit_length(), right.bit_length()],
                }
            )
    timings["factor_discovery_ns"] += time.perf_counter_ns() - started

    while pending:
        component = pending.pop(0)
        if component <= _MAX_WORD_PRIME:
            state, evidence = primality_status(component)
            if state == PROVEN_PRIME:
                word_primes.append(component)
                events.append(
                    {
                        "stage": "local-work",
                        "state": "queued-word-prime",
                        "prime": component,
                        "proof_kind": evidence.get("kind"),
                    }
                )
                continue
        started = time.perf_counter_ns()
        result = bl.buchmann_lenstra_overorder(
            coefficients,
            DiscriminantComponent(component, "composite"),
            equation_discriminant=equation_discriminant,
        )
        timings["bl_construction_ns"] += time.perf_counter_ns() - started
        if result.state == "split" and result.split is not None:
            left = abs(int(result.split.left))
            right = abs(int(result.split.right))
            if left * right != component or integer_gcd(left, right) != 1:
                raise ArithmeticError("BL construction returned an inexact split")
            pending = [left, right] + pending
            events.append(
                {
                    "stage": "bl-construction",
                    "state": "split",
                    "component_bits": component.bit_length(),
                }
            )
            continue
        if result.state != "complete" or result.basis is None:
            raise ArithmeticError("bounded composite BL support did not complete")
        if (
            result.basis.canonical_key()
            != _identity_basis(len(coefficients) - 1).canonical_key()
        ):
            bases.append(result.basis)
        events.append(
            {
                "stage": "bl-construction",
                "state": "complete",
                "component_bits": component.bit_length(),
                "index_bits": int(result.index).bit_length(),
            }
        )

    if word_primes:
        word_primes.sort()
        fallback_primes: list[int] = []
        packed_index = 1
        started = time.perf_counter_ns()
        for prime in word_primes:
            data = bl._composite_dedekind_data(coefficients, prime)
            if data.get("status") == "complete":
                continue
            if data.get("status") != "enlarge":
                fallback_primes.append(prime)
                continue
            basis, index = bl._dedekind_overorder_basis(
                coefficients,
                prime,
                data["generator"],
                data.get("packed_hnf"),
            )
            if (
                equation_discriminant % (index * index) != 0
                or integer_gcd(abs(equation_discriminant // (index * index)), prime)
                != 1
            ):
                fallback_primes.append(prime)
                continue
            bases.append(basis)
            packed_index *= index
        if fallback_primes:
            native = native_order_from_polynomial(coefficients, fallback_primes)
            if not native.complete:
                raise ArithmeticError("native word-prime support did not complete")
            bases.append(native.basis)
            packed_index *= int(native.index)
        timings["local_work_ns"] += time.perf_counter_ns() - started
        events.append(
            {
                "stage": "local-work",
                "state": "complete",
                "prime_count": len(word_primes),
                "packed_prime_count": len(word_primes) - len(fallback_primes),
                "native_fallback_count": len(fallback_primes),
                "index_bits": packed_index.bit_length(),
            }
        )
    return bases, timings, events


def _canonical_upper_hnf(rows: tuple[tuple[int, ...], ...]) -> bool:
    degree = len(rows)
    if degree == 0 or any(len(row) != degree for row in rows):
        return False
    for row in range(degree):
        if rows[row][row] <= 0:
            return False
        for column in range(row):
            if rows[row][column] != 0:
                return False
        for column in range(row + 1, degree):
            if rows[row][column] < 0 or rows[row][column] >= rows[column][column]:
                return False
    return True


class CompositeFieldAnalysisResult:
    """Immutable candidate and compact proof for the structural fast path."""

    def __init__(
        self,
        state: str,
        polynomial: list[int],
        scale: int,
        equation_discriminant: int,
        residual_prime: int,
        residual_exponent: int,
        square_support: int,
        basis: OrderBasis,
        index: int,
        order_discriminant: int,
        trace: dict[str, Any],
        message: str | None = None,
    ) -> None:
        self.state = str(state)
        self.polynomial = tuple(int(value) for value in polynomial)
        self.scale = int(scale)
        self.equation_discriminant = int(equation_discriminant)
        self.residual_prime = int(residual_prime)
        self.residual_exponent = int(residual_exponent)
        self.square_support = int(square_support)
        self.basis_numerator = tuple(
            tuple(int(value) for value in row) for row in basis.numerator
        )
        self.basis_denominator = int(basis.denominator)
        self.index = int(index)
        self.order_discriminant = int(order_discriminant)
        self.trace = dict(trace)
        self.message = message
        self.__dict__["_frozen"] = True

    def __setattr__(self, name: str, value: Any) -> None:
        if self.__dict__.get("_frozen", False):
            raise AttributeError("composite field-analysis results are immutable")
        self.__dict__[name] = value

    @property
    def proof_schema(self) -> str:
        return AUTHENTICATED_COMPOSITE_ANALYSIS_SCHEMA

    @property
    def certified(self) -> bool:
        return self.state == COMPOSITE_ANALYSIS_COMPLETE and self.__dict__.get(
            "_authentication_snapshot"
        ) == _authentication_snapshot(self)

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": AUTHENTICATED_COMPOSITE_ANALYSIS_SCHEMA,
            "state": self.state,
            "certified": self.certified,
            "polynomial": list(self.polynomial),
            "scale": self.scale,
            "equation_discriminant": self.equation_discriminant,
            "residual_prime": self.residual_prime,
            "residual_exponent": self.residual_exponent,
            "square_support": self.square_support,
            "basis_numerator": [list(row) for row in self.basis_numerator],
            "basis_denominator": self.basis_denominator,
            "index": self.index,
            "order_discriminant": self.order_discriminant,
            "trace": dict(self.trace),
            "message": self.message,
        }


def _authentication_snapshot(result: CompositeFieldAnalysisResult) -> tuple[Any, ...]:
    return (
        AUTHENTICATED_COMPOSITE_ANALYSIS_SCHEMA,
        result.state,
        result.polynomial,
        result.scale,
        result.equation_discriminant,
        result.residual_prime,
        result.residual_exponent,
        result.square_support,
        result.basis_numerator,
        result.basis_denominator,
        result.index,
        result.order_discriminant,
    )


def check_composite_field_analysis(result: Any) -> bool:
    """Independently authenticate a structural composite-support candidate."""
    if type(result) is not CompositeFieldAnalysisResult:
        return False
    if result.state != COMPOSITE_ANALYSIS_COMPLETE:
        return False
    coefficients = [int(value) for value in result.polynomial]
    degree = len(coefficients) - 1
    if degree < 1 or coefficients[-1] != 1 or result.scale < 1:
        return False
    if result.residual_prime not in _SMALL_PROVED_PRIMES:
        return False
    if result.residual_exponent < 1 or result.square_support <= 1:
        return False
    if integer_gcd(result.residual_prime, result.square_support) != 1:
        return False
    equation_discriminant = _polynomial_discriminant(coefficients)
    if (
        equation_discriminant == 0
        or equation_discriminant != result.equation_discriminant
    ):
        return False
    if abs(equation_discriminant) != (
        result.residual_prime**result.residual_exponent
        * result.square_support
        * result.square_support
    ):
        return False
    if not _monomial_dedekind_is_p_maximal(coefficients, result.residual_prime):
        return False
    if result.index <= 0 or result.index % result.residual_prime == 0:
        return False
    if result.order_discriminant * result.index * result.index != equation_discriminant:
        return False
    if integer_gcd(abs(result.order_discriminant), result.square_support) != 1:
        return False
    rows = result.basis_numerator
    if not _canonical_upper_hnf(rows) or result.basis_denominator <= 0:
        return False
    determinant = 1
    for row in range(degree):
        determinant *= rows[row][row]
    denominator_power = result.basis_denominator**degree
    if determinant == 0 or denominator_power % determinant != 0:
        return False
    if denominator_power // determinant != result.index:
        return False
    maximum_bits = max(
        [abs(value).bit_length() for row in rows for value in row]
        + [abs(value).bit_length() for value in coefficients]
        + [result.basis_denominator.bit_length()]
    )
    word_capacity = max(16, (4 * degree * (maximum_bits + 1) + 63) // 64 + 8)
    workspace = kernel_integer_zeros(
        packed_order_lattice_is_valid,
        degree * degree + 2 * degree - 1,
        word_capacity,
    )
    return bool(
        packed_order_lattice_is_valid(
            workspace,
            kernel_integer_buffer(
                packed_order_lattice_is_valid,
                [value for row in rows for value in row],
            ),
            kernel_integer_buffer(packed_order_lattice_is_valid, coefficients),
            result.basis_denominator,
            degree,
        )
    )


def construct_composite_field_analysis(
    coefficients: list[int], scale: int = 1
) -> CompositeFieldAnalysisResult:
    """Construct and authenticate the bounded structural candidate.

    A non-applicable or bounded-fallback result always carries the identity
    lattice and is never authenticated.  Callers may therefore fall through
    before constructing or caching a public order.
    """
    polynomial = [int(value) for value in coefficients]
    degree = len(polynomial) - 1
    identity = _identity_basis(max(1, degree))
    if degree < 1 or polynomial[-1] != 1 or int(scale) < 1:
        return CompositeFieldAnalysisResult(
            COMPOSITE_ANALYSIS_NOT_APPLICABLE,
            polynomial,
            scale,
            0,
            0,
            0,
            0,
            identity,
            1,
            0,
            {},
            "the structural path requires a monic integral polynomial",
        )
    started = time.perf_counter_ns()
    equation_discriminant = _polynomial_discriminant(polynomial)
    discriminant_ns = time.perf_counter_ns() - started
    started = time.perf_counter_ns()
    shape = _residual_prime_and_square_support(equation_discriminant, polynomial)
    support_ns = time.perf_counter_ns() - started
    if shape is None:
        return CompositeFieldAnalysisResult(
            COMPOSITE_ANALYSIS_NOT_APPLICABLE,
            polynomial,
            scale,
            equation_discriminant,
            0,
            0,
            0,
            identity,
            1,
            equation_discriminant,
            {
                "discriminant_ns": discriminant_ns,
                "factor_discovery_ns": support_ns,
            },
            "discriminant does not have eligible square-support shape",
        )
    residual_prime, residual_exponent, square_support = shape
    try:
        bases, timings, events = _construct_support_bases(
            polynomial, equation_discriminant, square_support
        )
        merge_started = time.perf_counter_ns()
        basis = _merge_bases(bases) if bases else identity
        merge_ns = time.perf_counter_ns() - merge_started
        index = _basis_index(basis)
        if index <= 1 or equation_discriminant % (index * index) != 0:
            raise ArithmeticError("structural candidate has an invalid index")
        order_discriminant = equation_discriminant // (index * index)
        trace = {
            "schema": "sagejs.number-fields/composite-field-analysis-trace-v1",
            "discriminant_ns": discriminant_ns,
            "factor_discovery_ns": support_ns + timings["factor_discovery_ns"],
            "bl_construction_ns": timings["bl_construction_ns"],
            "local_work_ns": timings["local_work_ns"],
            "hnf_merge_ns": merge_ns,
            "proof_check_ns": 0,
            "events": events,
        }
        result = CompositeFieldAnalysisResult(
            COMPOSITE_ANALYSIS_COMPLETE,
            polynomial,
            scale,
            equation_discriminant,
            residual_prime,
            residual_exponent,
            square_support,
            basis,
            index,
            order_discriminant,
            trace,
        )
        proof_started = time.perf_counter_ns()
        valid = check_composite_field_analysis(result)
        proof_ns = time.perf_counter_ns() - proof_started
        trace["proof_check_ns"] = proof_ns
        result.__dict__["trace"] = trace
        if not valid:
            raise ArithmeticError("independent composite proof rejected the candidate")
        result.__dict__["_authentication_snapshot"] = _authentication_snapshot(result)
        return result
    except Exception as error:
        return CompositeFieldAnalysisResult(
            COMPOSITE_ANALYSIS_FALLBACK,
            polynomial,
            scale,
            equation_discriminant,
            residual_prime,
            residual_exponent,
            square_support,
            identity,
            1,
            equation_discriminant,
            {
                "discriminant_ns": discriminant_ns,
                "factor_discovery_ns": support_ns,
            },
            str(error),
        )


def authenticated_composite_field_analysis_matches(
    result: Any,
    *,
    polynomial: list[int],
    scale: int,
    basis_numerator: list[list[int]] | None = None,
    basis_denominator: int | None = None,
    index: int | None = None,
    equation_discriminant: int | None = None,
    order_discriminant: int | None = None,
) -> bool:
    """Bind the live immutable proof to public certificate fields."""
    if type(result) is not CompositeFieldAnalysisResult or not result.certified:
        return False
    if tuple(int(value) for value in polynomial) != result.polynomial:
        return False
    if int(scale) != result.scale:
        return False
    checks = (
        (basis_numerator, [list(row) for row in result.basis_numerator]),
        (basis_denominator, result.basis_denominator),
        (index, result.index),
        (equation_discriminant, result.equation_discriminant),
        (order_discriminant, result.order_discriminant),
    )
    for supplied, expected in checks:
        if supplied is not None and supplied != expected:
            return False
    return True


__all__ = [
    "AUTHENTICATED_COMPOSITE_ANALYSIS_SCHEMA",
    "COMPOSITE_ANALYSIS_COMPLETE",
    "COMPOSITE_ANALYSIS_FALLBACK",
    "COMPOSITE_ANALYSIS_NOT_APPLICABLE",
    "CompositeFieldAnalysisResult",
    "authenticated_composite_field_analysis_matches",
    "check_composite_field_analysis",
    "construct_composite_field_analysis",
    "packed_integer_square_root",
    "packed_order_lattice_is_valid",
    "packed_polynomial_discriminant",
]
