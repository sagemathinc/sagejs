"""Packed genus-2 Kummer arithmetic over small prime fields.

The compiled functions in this module are ordinary typed Python.  Their
Python bodies are both the dynamic reference implementation and the source of
the isolated native/Wasm kernels.  They implement Flynn's odd-quintic Kummer
duplication formula after specializing its curve coefficients once.

The supported model is `y^2 + h(x)y = f(x)` with `deg(f)=5` and
`deg(h)<=2` over an odd prime field of characteristic at most `2^32-1`.
Packed Mumford divisors use the shared eight-word ABI
`[deg_u,u0,u1,u2,u3,v0,v1,v2]`.  Kummer points are flat batches of
`[k1,k2,k3,k4]` in normalized projective coordinates.

General Kummer differential addition is intentionally not guessed.  The
source-transparent kernel handles the exact degenerate cases where one input
is zero; the context also recognizes `A-B=0` and dispatches to exact
duplication.  Other rows receive `KUMMER_UNSUPPORTED_DIFFERENTIAL` until the
audited Flynn biquadratic forms are added.
"""

from __future__ import annotations

from typing import Any, Iterable, cast

from sagejs.hyperelliptic_curves.genus2_kummer_formulas import (
    _CLASSICAL_DELTA_1,
    _CLASSICAL_DELTA_2,
    _CLASSICAL_DELTA_3,
    _CLASSICAL_DELTA_4,
)
from sagejs.native import (
    PrimeFieldModulus,
    UInt64Buffer,
    kernel_uint64_buffer,
    kernel_uint64_zeros,
    native,
    prime_add,
    prime_inverse,
    prime_mul,
    prime_sub,
    uint64,
)

KUMMER_OK = 0
KUMMER_INVALID_INPUT = 1
KUMMER_ALL_ZERO = 2
KUMMER_UNSUPPORTED_DIFFERENTIAL = 3
KUMMER_RESOURCE_LIMIT = 4

_MAX_PRIME = (1 << 32) - 1
_DIVISOR_WORDS = 8
_KUMMER_WORDS = 4
_QUARTIC_MONOMIALS = 35
_QUARTIC_PLAN_WORDS = 4 * _QUARTIC_MONOMIALS
_DEFAULT_MAX_BATCH_BYTES = 64 << 20


@native
def genus2_kummer_project_batch(
    output: UInt64Buffer,
    statuses: UInt64Buffer,
    packed_divisors: UInt64Buffer,
    model_f: UInt64Buffer,
    model_h: UInt64Buffer,
    count: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    """Project canonical packed Mumford divisors to normalized Kummer points."""
    valid = (
        len(output) == count * 4
        and len(statuses) == count
        and len(packed_divisors) == count * 8
        and len(model_f) == 8
        and len(model_h) == 4
        and model_f[5] != 0
        and model_f[6] == 0
        and model_f[7] == 0
        and model_h[3] == 0
    )
    if valid:
        for row in range(count):
            input_start = row * 8
            output_start = row * 4
            degree = packed_divisors[input_start]
            row_valid = degree <= 2
            if degree == 0:
                if packed_divisors[input_start + 1] != 1:
                    row_valid = False
                for index in range(2, 8):
                    if packed_divisors[input_start + index] != 0:
                        row_valid = False
            elif degree == 1:
                if packed_divisors[input_start + 2] != 1:
                    row_valid = False
                if (
                    packed_divisors[input_start + 3] != 0
                    or packed_divisors[input_start + 4] != 0
                    or packed_divisors[input_start + 6] != 0
                    or packed_divisors[input_start + 7] != 0
                ):
                    row_valid = False
            elif degree == 2:
                if packed_divisors[input_start + 3] != 1:
                    row_valid = False
                if (
                    packed_divisors[input_start + 4] != 0
                    or packed_divisors[input_start + 7] != 0
                ):
                    row_valid = False
            if not row_valid:
                statuses[row] = 1
                for index in range(4):
                    output[output_start + index] = 0
            elif degree == 0:
                statuses[row] = 0
                output[output_start] = 0
                output[output_start + 1] = 0
                output[output_start + 2] = 0
                output[output_start + 3] = 1
            elif degree == 1:
                statuses[row] = 0
                u0 = packed_divisors[input_start + 1]
                x_value = 0
                if u0 != 0:
                    x_value = modulus - u0
                x_square = prime_mul(x_value, x_value, modulus)
                output[output_start] = 0
                output[output_start + 1] = 1
                output[output_start + 2] = x_value
                output[output_start + 3] = prime_mul(model_f[5], x_square, modulus)
            else:
                statuses[row] = 0
                u0 = packed_divisors[input_start + 1]
                u1 = packed_divisors[input_start + 2]
                slope = packed_divisors[input_start + 6]
                s_value = 0
                if u1 != 0:
                    s_value = modulus - u1
                s_square = prime_mul(s_value, s_value, modulus)
                s_cube = prime_mul(s_square, s_value, modulus)
                fourth = prime_mul(slope, slope, modulus)
                h_linear = prime_add(
                    model_h[1],
                    prime_mul(model_h[2], s_value, modulus),
                    modulus,
                )
                fourth = prime_add(fourth, prime_mul(slope, h_linear, modulus), modulus)
                fourth = prime_sub(fourth, model_f[2], modulus)
                fourth = prime_sub(
                    fourth, prime_mul(model_f[3], s_value, modulus), modulus
                )
                fourth = prime_sub(
                    fourth, prime_mul(model_f[4], s_square, modulus), modulus
                )
                fourth = prime_add(
                    fourth,
                    prime_mul(model_f[5], prime_mul(u0, s_value, modulus), modulus),
                    modulus,
                )
                fourth = prime_sub(
                    fourth, prime_mul(model_f[5], s_cube, modulus), modulus
                )
                output[output_start] = 1
                output[output_start + 1] = s_value
                output[output_start + 2] = u0
                output[output_start + 3] = fourth
    return valid


@native
def genus2_kummer_double_batch(
    output: UInt64Buffer,
    statuses: UInt64Buffer,
    points: UInt64Buffer,
    quartic_plan: UInt64Buffer,
    monomial_workspace: UInt64Buffer,
    h_transform: uint64,
    count: uint64,
    generalized_model: uint64,
    normalize: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    """Duplicate a flat batch using a fixed curve's prepared quartics."""
    valid = (
        len(output) == count * 4
        and len(statuses) == count
        and len(points) == count * 4
        and len(quartic_plan) == 140
        and len(monomial_workspace) == 35
    )
    if valid:
        inverse_four = prime_inverse(4 % modulus, modulus)
        for row in range(count):
            start = row * 4
            k0 = points[start]
            k1 = points[start + 1]
            k2 = points[start + 2]
            k3 = points[start + 3]
            classical_k3 = k3
            if generalized_model != 0:
                classical_k3 = prime_sub(
                    prime_mul(4 % modulus, k3, modulus),
                    prime_mul(h_transform, k0, modulus),
                    modulus,
                )
            monomial_index = 0
            for exponent0 in range(5):
                for exponent1 in range(5 - exponent0):
                    for exponent2 in range(5 - exponent0 - exponent1):
                        exponent3 = 4 - exponent0 - exponent1 - exponent2
                        monomial = 1
                        for _step in range(exponent0):
                            monomial = prime_mul(monomial, k0, modulus)
                        for _step in range(exponent1):
                            monomial = prime_mul(monomial, k1, modulus)
                        for _step in range(exponent2):
                            monomial = prime_mul(monomial, k2, modulus)
                        for _step in range(exponent3):
                            monomial = prime_mul(monomial, classical_k3, modulus)
                        monomial_workspace[monomial_index] = monomial
                        monomial_index += 1
            for coordinate in range(4):
                value = 0
                plan_start = coordinate * 35
                for monomial_index in range(35):
                    value = prime_add(
                        value,
                        prime_mul(
                            quartic_plan[plan_start + monomial_index],
                            monomial_workspace[monomial_index],
                            modulus,
                        ),
                        modulus,
                    )
                output[start + coordinate] = value
            if generalized_model != 0:
                output[start + 3] = prime_mul(
                    prime_add(
                        output[start + 3],
                        prime_mul(h_transform, output[start], modulus),
                        modulus,
                    ),
                    inverse_four,
                    modulus,
                )
            pivot = 4
            for index in range(4):
                if pivot == 4 and output[start + index] != 0:
                    pivot = index
            if pivot == 4:
                statuses[row] = 2
            else:
                statuses[row] = 0
                if normalize != 0:
                    inverse = prime_inverse(output[start + pivot], modulus)
                    for index in range(4):
                        output[start + index] = prime_mul(
                            output[start + index], inverse, modulus
                        )
    return valid


@native
def genus2_kummer_degenerate_pseudo_add_batch(
    output: UInt64Buffer,
    statuses: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    differences: UInt64Buffer,
    count: uint64,
    modulus: PrimeFieldModulus,
) -> bool:
    """Handle exact sign-free xADD rows where either input is the identity.

    A row not covered by these identities is marked unsupported.  The
    `A=B` case is recognized by :class:`Genus2PrimeKummerContext` and sent
    through the duplication kernel, which also avoids duplicating the large
    quartic evaluator in this small boundary kernel.
    """
    valid = (
        len(output) == count * 4
        and len(statuses) == count
        and len(left) == count * 4
        and len(right) == count * 4
        and len(differences) == count * 4
    )
    if valid:
        for row in range(count):
            start = row * 4
            left_identity = (
                left[start] == 0
                and left[start + 1] == 0
                and left[start + 2] == 0
                and left[start + 3] == 1
            )
            right_identity = (
                right[start] == 0
                and right[start + 1] == 0
                and right[start + 2] == 0
                and right[start + 3] == 1
            )
            difference_is_right = True
            difference_is_left = True
            for index in range(4):
                if differences[start + index] != right[start + index]:
                    difference_is_right = False
                if differences[start + index] != left[start + index]:
                    difference_is_left = False
            if left_identity and difference_is_right:
                statuses[row] = 0
                for index in range(4):
                    output[start + index] = right[start + index]
            elif right_identity and difference_is_left:
                statuses[row] = 0
                for index in range(4):
                    output[start + index] = left[start + index]
            else:
                statuses[row] = 3
            if statuses[row] != 0:
                for index in range(4):
                    output[start + index] = 0
    return valid


def _is_prime(value: int) -> bool:
    if value < 2:
        return False
    if value % 2 == 0:
        return value == 2
    divisor = 3
    while divisor * divisor <= value:
        if value % divisor == 0:
            return False
        divisor += 2
    return True


def _canonical_coefficients(
    values: Iterable[Any], length: int, prime: int
) -> list[int]:
    answer = [int(value) % prime for value in values]
    if len(answer) > length:
        raise ValueError("too many model coefficients")
    answer.extend(0 for _index in range(length - len(answer)))
    return answer


def _quartic_monomials() -> tuple[tuple[int, int, int, int], ...]:
    answer: list[tuple[int, int, int, int]] = []
    for exponent0 in range(5):
        for exponent1 in range(5 - exponent0):
            for exponent2 in range(5 - exponent0 - exponent1):
                answer.append(
                    (
                        exponent0,
                        exponent1,
                        exponent2,
                        4 - exponent0 - exponent1 - exponent2,
                    )
                )
    return tuple(answer)


_MONOMIALS = _quartic_monomials()


def _specialized_quartic_plan(classical_f: list[int], prime: int) -> list[int]:
    index_by_exponents = {
        exponents: index for index, exponents in enumerate(_MONOMIALS)
    }
    plan = [0 for _index in range(_QUARTIC_PLAN_WORDS)]
    tables = (
        _CLASSICAL_DELTA_1,
        _CLASSICAL_DELTA_2,
        _CLASSICAL_DELTA_3,
        _CLASSICAL_DELTA_4,
    )
    for coordinate, terms in enumerate(tables):
        for term in terms:
            coefficient = int(term[0]) % prime
            for index in range(6):
                exponent = int(term[index + 5])
                if exponent:
                    coefficient = (
                        coefficient * pow(classical_f[index], exponent, prime)
                    ) % prime
            target = (
                coordinate * _QUARTIC_MONOMIALS
                + index_by_exponents[
                    (int(term[1]), int(term[2]), int(term[3]), int(term[4]))
                ]
            )
            plan[target] = (plan[target] + coefficient) % prime
    return plan


def _rows(values: Iterable[Iterable[Any]], width: int, prime: int) -> list[int]:
    answer: list[int] = []
    for row in values:
        entries = [int(value) for value in row]
        if len(entries) != width:
            raise ValueError(f"each packed row must contain exactly {width} words")
        for entry in entries:
            if entry < 0 or entry >= prime:
                raise ValueError("packed coordinates must be canonical residues")
        answer.extend(entries)
    return answer


def _materialize(buffer: Any) -> list[int]:
    converter = getattr(buffer, "toArray", None)
    values = cast(Any, converter() if callable(converter) else buffer)
    return [int(value) for value in values]


class Genus2PrimeKummerContext:
    """Prepared fixed-model Kummer arithmetic with bounded batch allocation."""

    __slots__ = (
        "_f",
        "_generalized",
        "_h",
        "_h_transform",
        "_max_batch_bytes",
        "_plan",
        "_prime",
    )

    def __init__(
        self,
        prime: Any,
        f_coefficients: Iterable[Any],
        h_coefficients: Iterable[Any] = (),
        *,
        max_batch_bytes: int = _DEFAULT_MAX_BATCH_BYTES,
    ) -> None:
        characteristic = int(prime)
        if (
            characteristic <= 2
            or characteristic > _MAX_PRIME
            or not _is_prime(characteristic)
        ):
            raise ValueError("Kummer arithmetic requires an odd prime at most 2^32-1")
        f_values = _canonical_coefficients(f_coefficients, 8, characteristic)
        h_values = _canonical_coefficients(h_coefficients, 4, characteristic)
        if f_values[5] == 0 or f_values[6] != 0 or f_values[7] != 0:
            raise ValueError("Kummer arithmetic requires an odd quintic model")
        if h_values[3] != 0:
            raise ValueError("Kummer arithmetic requires deg(h)<=2")
        byte_limit = int(max_batch_bytes)
        if byte_limit <= 0:
            raise ValueError("max_batch_bytes must be positive")
        generalized = any(value != 0 for value in h_values)
        classical_f = [f_values[index] for index in range(6)]
        if generalized:
            for index in range(6):
                classical_f[index] = (4 * f_values[index]) % characteristic
            for left in range(3):
                for right in range(3):
                    classical_f[left + right] = (
                        classical_f[left + right] + h_values[left] * h_values[right]
                    ) % characteristic
        h_transform = (2 * h_values[0] * h_values[2]) % characteristic
        self._prime = characteristic
        self._f = tuple(f_values)
        self._h = tuple(h_values)
        self._generalized = generalized
        self._h_transform = h_transform
        self._max_batch_bytes = byte_limit
        self._plan = tuple(_specialized_quartic_plan(classical_f, characteristic))

    @property
    def prime(self) -> int:
        return self._prime

    @property
    def model_fingerprint(self) -> tuple[Any, ...]:
        return ("genus2-kummer-prime.v1", self._prime, self._f, self._h)

    def capability(self) -> dict[str, Any]:
        return {
            "supported": True,
            "schema": "sagejs.hyperelliptic.genus2-prime-kummer.v1",
            "prime": self._prime,
            "model_fingerprint": self.model_fingerprint,
            "packed_divisor_words": _DIVISOR_WORDS,
            "packed_kummer_words": _KUMMER_WORDS,
            "max_batch_bytes": self._max_batch_bytes,
            "general_pseudo_addition": False,
            "supported_pseudo_addition": (
                "left-identity",
                "right-identity",
                "zero-difference-duplication",
            ),
            "sign_free_scalars": "powers-of-two",
        }

    def _check_batch(self, count: int, bytes_per_row: int) -> None:
        required = count * bytes_per_row
        if required > self._max_batch_bytes:
            raise MemoryError(
                f"Kummer batch needs {required} bytes; "
                f"max_batch_bytes={self._max_batch_bytes}"
            )

    def project_packed(
        self, packed_divisors: Iterable[Iterable[Any]]
    ) -> tuple[list[list[int]], list[int]]:
        flat = _rows(packed_divisors, _DIVISOR_WORDS, self._prime)
        count = len(flat) // _DIVISOR_WORDS
        self._check_batch(count, 104)
        kernel = genus2_kummer_project_batch
        source = kernel_uint64_buffer(kernel, flat)
        model_f = kernel_uint64_buffer(kernel, self._f)
        model_h = kernel_uint64_buffer(kernel, self._h)
        output = kernel_uint64_zeros(kernel, count * _KUMMER_WORDS)
        statuses = kernel_uint64_zeros(kernel, count)
        if not kernel(output, statuses, source, model_f, model_h, count, self._prime):
            raise RuntimeError("invalid internal Kummer projection buffer shape")
        values = _materialize(output)
        return (
            [values[index : index + 4] for index in range(0, len(values), 4)],
            _materialize(statuses),
        )

    def double_batch(
        self,
        points: Iterable[Iterable[Any]],
        *,
        normalize: bool = True,
    ) -> tuple[list[list[int]], list[int]]:
        flat = _rows(points, _KUMMER_WORDS, self._prime)
        count = len(flat) // _KUMMER_WORDS
        self._check_batch(count, 72)
        kernel = genus2_kummer_double_batch
        source = kernel_uint64_buffer(kernel, flat)
        plan = kernel_uint64_buffer(kernel, self._plan)
        output = kernel_uint64_zeros(kernel, count * _KUMMER_WORDS)
        statuses = kernel_uint64_zeros(kernel, count)
        workspace = kernel_uint64_zeros(kernel, _QUARTIC_MONOMIALS)
        if not kernel(
            output,
            statuses,
            source,
            plan,
            workspace,
            self._h_transform,
            count,
            1 if self._generalized else 0,
            1 if normalize else 0,
            self._prime,
        ):
            raise RuntimeError("invalid internal Kummer duplication buffer shape")
        values = _materialize(output)
        return (
            [values[index : index + 4] for index in range(0, len(values), 4)],
            _materialize(statuses),
        )

    def power_of_two_batch(
        self,
        points: Iterable[Iterable[Any]],
        exponent: Any,
    ) -> tuple[list[list[int]], list[int]]:
        steps = int(exponent)
        if steps < 0:
            raise ValueError("the power-of-two exponent must be nonnegative")
        current = [list(row) for row in points]
        statuses = [KUMMER_OK for _row in current]
        for _step in range(steps):
            current, statuses = self.double_batch(current)
            if any(status != KUMMER_OK for status in statuses):
                break
        return current, statuses

    def annihilates_power_of_two_batch(
        self,
        points: Iterable[Iterable[Any]],
        exponent: Any,
    ) -> tuple[list[bool], list[int]]:
        values, statuses = self.power_of_two_batch(points, exponent)
        identity = [0, 0, 0, 1]
        return (
            [
                status == KUMMER_OK and value == identity
                for value, status in zip(values, statuses)
            ],
            statuses,
        )

    def pseudo_add_batch(
        self,
        left: Iterable[Iterable[Any]],
        right: Iterable[Iterable[Any]],
        differences: Iterable[Iterable[Any]],
    ) -> tuple[list[list[int]], list[int]]:
        left_rows = [list(row) for row in left]
        right_rows = [list(row) for row in right]
        difference_rows = [list(row) for row in differences]
        if not (len(left_rows) == len(right_rows) == len(difference_rows)):
            raise ValueError("pseudo-addition batches must have equal row counts")
        count = len(left_rows)
        self._check_batch(count, 136)
        left_flat = _rows(left_rows, 4, self._prime)
        right_flat = _rows(right_rows, 4, self._prime)
        difference_flat = _rows(difference_rows, 4, self._prime)
        kernel = genus2_kummer_degenerate_pseudo_add_batch
        packed_left = kernel_uint64_buffer(kernel, left_flat)
        packed_right = kernel_uint64_buffer(kernel, right_flat)
        packed_differences = kernel_uint64_buffer(kernel, difference_flat)
        output = kernel_uint64_zeros(kernel, count * 4)
        statuses = kernel_uint64_zeros(kernel, count)
        if not kernel(
            output,
            statuses,
            packed_left,
            packed_right,
            packed_differences,
            count,
            self._prime,
        ):
            raise RuntimeError("invalid internal Kummer pseudo-addition buffer shape")
        values = _materialize(output)
        result = [values[index : index + 4] for index in range(0, len(values), 4)]
        status_values = _materialize(statuses)
        identity = [0, 0, 0, 1]
        duplicate_indices = [
            index
            for index in range(count)
            if status_values[index] == KUMMER_UNSUPPORTED_DIFFERENTIAL
            and difference_rows[index] == identity
            and left_rows[index] == right_rows[index]
        ]
        if duplicate_indices:
            duplicated, duplicate_statuses = self.double_batch(
                [left_rows[index] for index in duplicate_indices]
            )
            for offset, index in enumerate(duplicate_indices):
                result[index] = duplicated[offset]
                status_values[index] = duplicate_statuses[offset]
        return result, status_values


__all__ = [
    "Genus2PrimeKummerContext",
    "KUMMER_ALL_ZERO",
    "KUMMER_INVALID_INPUT",
    "KUMMER_OK",
    "KUMMER_RESOURCE_LIMIT",
    "KUMMER_UNSUPPORTED_DIFFERENTIAL",
    "genus2_kummer_degenerate_pseudo_add_batch",
    "genus2_kummer_double_batch",
    "genus2_kummer_project_batch",
]
