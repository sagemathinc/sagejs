"""Prepared exact rational Cantor arithmetic backed by FLINT scratch storage.

The generalized Cantor formulas in this module are ordinary typed Python.  The
`@native` compiler lowers those formulas and the declared FLINT workspace calls
into one isolated exact kernel.  FLINT supplies polynomial representation and
in-place primitives only; it does not hide a second implementation of the
Jacobian group law.

The prepared public boundary is deliberately narrow: odd-degree, one-point at
infinity genus-2 and genus-3 Jacobians over `QQ`.  Its workspace has a fixed
number of polynomial slots, so scalar loops do not allocate foreign resources.
Proof-producing callers can request a replay certificate, whose verifier
recomputes every operation through the ordinary reference Cantor path.
"""

from __future__ import annotations

import hashlib
import time
from typing import Any

from sagejs.ffi.flint import (
    FmpqPolynomial,
    FmpqPolynomialWorkspace,
    fmpq_polynomial_workspace,
    fmpq_polynomial_workspace_add,
    fmpq_polynomial_workspace_allocated_bytes,
    fmpq_polynomial_workspace_coefficient_denominator,
    fmpq_polynomial_workspace_coefficient_numerator,
    fmpq_polynomial_workspace_copy,
    fmpq_polynomial_workspace_divexact,
    fmpq_polynomial_workspace_equal,
    fmpq_polynomial_workspace_is_one,
    fmpq_polynomial_workspace_is_zero,
    fmpq_polynomial_workspace_length,
    fmpq_polynomial_workspace_load,
    fmpq_polynomial_workspace_monic,
    fmpq_polynomial_workspace_mul,
    fmpq_polynomial_workspace_neg,
    fmpq_polynomial_workspace_one,
    fmpq_polynomial_workspace_rem,
    fmpq_polynomial_workspace_sub,
    fmpq_polynomial_workspace_swap,
    fmpq_polynomial_workspace_xgcd,
    fmpq_polynomial_workspace_zero,
)
from sagejs.native import (
    IntegerBuffer,
    integer_buffer_values,
    is_compiled,
    kernel_integer_zeros,
    native,
    uint64,
)

PACKED_RATIONAL_MUMFORD_SCHEMA = "sagejs.hyperelliptic.rational-mumford.v1"
_OUTPUT_WORDS = 16
_WORKSPACE_SLOTS = 48


def _reduce_one(
    workspace: FmpqPolynomialWorkspace,
    u: uint64,
    v: uint64,
    f: uint64,
    h: uint64,
    genus: uint64,
) -> bool:
    square: uint64 = 30
    product: uint64 = 31
    numerator: uint64 = 32
    quotient: uint64 = 33
    monic: uint64 = 34
    temporary: uint64 = 35
    negative: uint64 = 36
    next_v: uint64 = 38
    steps = 0
    while fmpq_polynomial_workspace_length(workspace, u) > genus + 1:
        if not fmpq_polynomial_workspace_mul(workspace, square, v, v):
            return False
        if not fmpq_polynomial_workspace_mul(workspace, product, h, v):
            return False
        if not fmpq_polynomial_workspace_add(workspace, numerator, square, product):
            return False
        if not fmpq_polynomial_workspace_sub(workspace, numerator, numerator, f):
            return False
        if not fmpq_polynomial_workspace_divexact(workspace, quotient, numerator, u):
            return False
        if not fmpq_polynomial_workspace_monic(workspace, monic, quotient):
            return False
        if not fmpq_polynomial_workspace_add(workspace, temporary, h, v):
            return False
        if not fmpq_polynomial_workspace_neg(workspace, negative, temporary):
            return False
        if not fmpq_polynomial_workspace_rem(workspace, next_v, negative, monic):
            return False
        if not fmpq_polynomial_workspace_swap(workspace, u, monic):
            return False
        if not fmpq_polynomial_workspace_swap(workspace, v, next_v):
            return False
        steps += 1
        if steps > 8:
            return False
    if not fmpq_polynomial_workspace_rem(workspace, next_v, v, u):
        return False
    return fmpq_polynomial_workspace_copy(workspace, v, next_v)


def _cantor_add_one(
    workspace: FmpqPolynomialWorkspace,
    f: uint64,
    h: uint64,
    u1: uint64,
    v1: uint64,
    u2: uint64,
    v2: uint64,
    output_u: uint64,
    output_v: uint64,
    genus: uint64,
) -> bool:
    if fmpq_polynomial_workspace_is_one(workspace, u1) == 1:
        if not fmpq_polynomial_workspace_copy(workspace, output_u, u2):
            return False
        return fmpq_polynomial_workspace_copy(workspace, output_v, v2)
    if fmpq_polynomial_workspace_is_one(workspace, u2) == 1:
        if not fmpq_polynomial_workspace_copy(workspace, output_u, u1):
            return False
        return fmpq_polynomial_workspace_copy(workspace, output_v, v1)

    if (
        fmpq_polynomial_workspace_equal(workspace, u1, u2) == 1
        and fmpq_polynomial_workspace_equal(workspace, v1, v2) == 1
    ):
        double_v: uint64 = 8
        tangent: uint64 = 9
        common: uint64 = 10
        ignored: uint64 = 11
        bezout: uint64 = 12
        quotient: uint64 = 13
        u3: uint64 = 14
        hv: uint64 = 15
        vv: uint64 = 16
        numerator: uint64 = 17
        correction: uint64 = 18
        product: uint64 = 19
        v3: uint64 = 20
        if not fmpq_polynomial_workspace_add(workspace, double_v, v1, v1):
            return False
        if not fmpq_polynomial_workspace_add(workspace, tangent, double_v, h):
            return False
        if not fmpq_polynomial_workspace_xgcd(
            workspace, common, ignored, bezout, u1, tangent
        ):
            return False
        if not fmpq_polynomial_workspace_divexact(workspace, quotient, u1, common):
            return False
        if not fmpq_polynomial_workspace_mul(workspace, u3, quotient, quotient):
            return False
        if not fmpq_polynomial_workspace_mul(workspace, hv, h, v1):
            return False
        if not fmpq_polynomial_workspace_mul(workspace, vv, v1, v1):
            return False
        if not fmpq_polynomial_workspace_sub(workspace, numerator, f, hv):
            return False
        if not fmpq_polynomial_workspace_sub(workspace, numerator, numerator, vv):
            return False
        if not fmpq_polynomial_workspace_divexact(
            workspace, correction, numerator, common
        ):
            return False
        if not fmpq_polynomial_workspace_mul(workspace, product, bezout, correction):
            return False
        if not fmpq_polynomial_workspace_add(workspace, v3, v1, product):
            return False
        if not fmpq_polynomial_workspace_rem(workspace, output_v, v3, u3):
            return False
        if not fmpq_polynomial_workspace_copy(workspace, output_u, u3):
            return False
        return _reduce_one(workspace, output_u, output_v, f, h, genus)

    common0: uint64 = 8
    ignored0: uint64 = 9
    right0: uint64 = 10
    difference: uint64 = 11
    if not fmpq_polynomial_workspace_xgcd(workspace, common0, ignored0, right0, u1, u2):
        return False
    if not fmpq_polynomial_workspace_sub(workspace, difference, v1, v2):
        return False
    if fmpq_polynomial_workspace_is_one(workspace, common0) == 1:
        product0: uint64 = 12
        product1: uint64 = 13
        v3: uint64 = 14
        if not fmpq_polynomial_workspace_mul(workspace, output_u, u1, u2):
            return False
        if not fmpq_polynomial_workspace_mul(workspace, product0, right0, u2):
            return False
        if not fmpq_polynomial_workspace_mul(workspace, product1, product0, difference):
            return False
        if not fmpq_polynomial_workspace_add(workspace, v3, v2, product1):
            return False
        if not fmpq_polynomial_workspace_rem(workspace, output_v, v3, output_u):
            return False
        return _reduce_one(workspace, output_u, output_v, f, h, genus)

    conjugate0: uint64 = 12
    conjugate: uint64 = 13
    if not fmpq_polynomial_workspace_add(workspace, conjugate0, v1, v2):
        return False
    if not fmpq_polynomial_workspace_add(workspace, conjugate, conjugate0, h):
        return False
    if fmpq_polynomial_workspace_is_zero(workspace, conjugate) == 1:
        product: uint64 = 14
        common_square: uint64 = 15
        quotient: uint64 = 16
        first: uint64 = 17
        second: uint64 = 18
        v3: uint64 = 19
        if not fmpq_polynomial_workspace_mul(workspace, product, u1, u2):
            return False
        if not fmpq_polynomial_workspace_mul(
            workspace, common_square, common0, common0
        ):
            return False
        if not fmpq_polynomial_workspace_divexact(
            workspace, output_u, product, common_square
        ):
            return False
        if not fmpq_polynomial_workspace_divexact(workspace, quotient, u2, common0):
            return False
        if not fmpq_polynomial_workspace_mul(workspace, first, right0, difference):
            return False
        if not fmpq_polynomial_workspace_mul(workspace, second, first, quotient):
            return False
        if not fmpq_polynomial_workspace_add(workspace, v3, v2, second):
            return False
        if not fmpq_polynomial_workspace_rem(workspace, output_v, v3, output_u):
            return False
        return _reduce_one(workspace, output_u, output_v, f, h, genus)

    common: uint64 = 14
    coefficient0: uint64 = 15
    coefficient1: uint64 = 16
    product: uint64 = 17
    common_square: uint64 = 18
    first0: uint64 = 19
    first1: uint64 = 20
    first: uint64 = 21
    hv: uint64 = 22
    vv: uint64 = 23
    bracket: uint64 = 24
    second: uint64 = 25
    numerator: uint64 = 26
    quotient: uint64 = 27
    v3: uint64 = 28
    if not fmpq_polynomial_workspace_xgcd(
        workspace, common, coefficient0, coefficient1, common0, conjugate
    ):
        return False
    if not fmpq_polynomial_workspace_mul(workspace, product, u1, u2):
        return False
    if not fmpq_polynomial_workspace_mul(workspace, common_square, common, common):
        return False
    if not fmpq_polynomial_workspace_divexact(
        workspace, output_u, product, common_square
    ):
        return False
    if not fmpq_polynomial_workspace_mul(workspace, first0, coefficient0, right0):
        return False
    if not fmpq_polynomial_workspace_mul(workspace, first1, first0, difference):
        return False
    if not fmpq_polynomial_workspace_mul(workspace, first, first1, u2):
        return False
    if not fmpq_polynomial_workspace_mul(workspace, hv, h, v2):
        return False
    if not fmpq_polynomial_workspace_mul(workspace, vv, v2, v2):
        return False
    if not fmpq_polynomial_workspace_sub(workspace, bracket, f, hv):
        return False
    if not fmpq_polynomial_workspace_sub(workspace, bracket, bracket, vv):
        return False
    if not fmpq_polynomial_workspace_mul(workspace, second, coefficient1, bracket):
        return False
    if not fmpq_polynomial_workspace_add(workspace, numerator, first, second):
        return False
    if not fmpq_polynomial_workspace_divexact(workspace, quotient, numerator, common):
        return False
    if not fmpq_polynomial_workspace_add(workspace, v3, v2, quotient):
        return False
    if not fmpq_polynomial_workspace_rem(workspace, output_v, v3, output_u):
        return False
    return _reduce_one(workspace, output_u, output_v, f, h, genus)


def _write_pair(
    output: IntegerBuffer,
    workspace: FmpqPolynomialWorkspace,
    u: uint64,
    v: uint64,
) -> bool:
    index: uint64 = 0
    while index < 16:
        output[index] = 0
        index += 1
    u_length = fmpq_polynomial_workspace_length(workspace, u)
    v_length = fmpq_polynomial_workspace_length(workspace, v)
    if u_length == 0 or u_length > 4 or v_length > 3:
        return False
    output[0] = u_length
    output[1] = v_length
    index = 0
    while index < u_length:
        output[2 + 2 * index] = fmpq_polynomial_workspace_coefficient_numerator(
            workspace, u, index
        )
        output[3 + 2 * index] = fmpq_polynomial_workspace_coefficient_denominator(
            workspace, u, index
        )
        index += 1
    index = 0
    while index < v_length:
        output[10 + 2 * index] = fmpq_polynomial_workspace_coefficient_numerator(
            workspace, v, index
        )
        output[11 + 2 * index] = fmpq_polynomial_workspace_coefficient_denominator(
            workspace, v, index
        )
        index += 1
    return True


@native
def rational_cantor_add(
    output: IntegerBuffer,
    workspace: FmpqPolynomialWorkspace,
    f: FmpqPolynomial,
    h: FmpqPolynomial,
    u1: FmpqPolynomial,
    v1: FmpqPolynomial,
    u2: FmpqPolynomial,
    v2: FmpqPolynomial,
    genus: uint64,
) -> bool:
    """Add one rational Mumford pair into a fixed exact output buffer."""
    if len(output) < 16 or genus < 2 or genus > 3:
        return False
    f_slot: uint64 = 0
    h_slot: uint64 = 1
    u1_slot: uint64 = 2
    v1_slot: uint64 = 3
    u2_slot: uint64 = 4
    v2_slot: uint64 = 5
    output_u: uint64 = 6
    output_v: uint64 = 7
    if not fmpq_polynomial_workspace_load(workspace, f_slot, f):
        return False
    if not fmpq_polynomial_workspace_load(workspace, h_slot, h):
        return False
    if not fmpq_polynomial_workspace_load(workspace, u1_slot, u1):
        return False
    if not fmpq_polynomial_workspace_load(workspace, v1_slot, v1):
        return False
    if not fmpq_polynomial_workspace_load(workspace, u2_slot, u2):
        return False
    if not fmpq_polynomial_workspace_load(workspace, v2_slot, v2):
        return False
    if not _cantor_add_one(
        workspace,
        f_slot,
        h_slot,
        u1_slot,
        v1_slot,
        u2_slot,
        v2_slot,
        output_u,
        output_v,
        genus,
    ):
        return False
    return _write_pair(output, workspace, output_u, output_v)


@native
def rational_cantor_scalar(
    output: IntegerBuffer,
    workspace: FmpqPolynomialWorkspace,
    f: FmpqPolynomial,
    h: FmpqPolynomial,
    u: FmpqPolynomial,
    v: FmpqPolynomial,
    scalar: int,
    genus: uint64,
    max_group_operations: uint64,
) -> bool:
    """Multiply one rational Mumford pair with bounded exact scratch."""
    if len(output) < 16 or genus < 2 or genus > 3:
        return False
    f_slot: uint64 = 0
    h_slot: uint64 = 1
    accumulator_u: uint64 = 2
    accumulator_v: uint64 = 3
    addend_u: uint64 = 4
    addend_v: uint64 = 5
    output_u: uint64 = 6
    output_v: uint64 = 7
    temporary0: uint64 = 8
    temporary1: uint64 = 9
    temporary2: uint64 = 10
    if not fmpq_polynomial_workspace_load(workspace, f_slot, f):
        return False
    if not fmpq_polynomial_workspace_load(workspace, h_slot, h):
        return False
    if not fmpq_polynomial_workspace_one(workspace, accumulator_u):
        return False
    if not fmpq_polynomial_workspace_zero(workspace, accumulator_v):
        return False
    if not fmpq_polynomial_workspace_load(workspace, addend_u, u):
        return False
    if not fmpq_polynomial_workspace_load(workspace, addend_v, v):
        return False
    negative = scalar < 0
    if negative:
        scalar = -scalar
    operations = 0
    while scalar:
        if scalar % 2:
            operations += 1
            if operations > max_group_operations:
                return False
            if not _cantor_add_one(
                workspace,
                f_slot,
                h_slot,
                accumulator_u,
                accumulator_v,
                addend_u,
                addend_v,
                output_u,
                output_v,
                genus,
            ):
                return False
            if not fmpq_polynomial_workspace_swap(workspace, accumulator_u, output_u):
                return False
            if not fmpq_polynomial_workspace_swap(workspace, accumulator_v, output_v):
                return False
        scalar //= 2
        if scalar:
            operations += 1
            if operations > max_group_operations:
                return False
            if not _cantor_add_one(
                workspace,
                f_slot,
                h_slot,
                addend_u,
                addend_v,
                addend_u,
                addend_v,
                output_u,
                output_v,
                genus,
            ):
                return False
            if not fmpq_polynomial_workspace_swap(workspace, addend_u, output_u):
                return False
            if not fmpq_polynomial_workspace_swap(workspace, addend_v, output_v):
                return False
            # Once a doubled addend is the identity, all remaining binary
            # digits contribute zero.  This exact early exit is particularly
            # important for high-bit torsion witnesses and avoids hundreds of
            # redundant FLINT copies.
            if fmpq_polynomial_workspace_is_one(workspace, addend_u) == 1:
                scalar = 0
    if negative:
        if not fmpq_polynomial_workspace_add(
            workspace, temporary0, h_slot, accumulator_v
        ):
            return False
        if not fmpq_polynomial_workspace_neg(workspace, temporary1, temporary0):
            return False
        if not fmpq_polynomial_workspace_rem(
            workspace, temporary2, temporary1, accumulator_u
        ):
            return False
        if not fmpq_polynomial_workspace_swap(workspace, accumulator_v, temporary2):
            return False
    return _write_pair(output, workspace, accumulator_u, accumulator_v)


def _exact_integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise TypeError(name + " must be an integer")
    try:
        answer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise TypeError(name + " must be an integer") from error
    if value != answer:
        raise ValueError(name + " must be an exact integer")
    return answer


def _fraction(value: Any) -> tuple[int, int]:
    numerator = value.numerator() if hasattr(value, "numerator") else value
    denominator = value.denominator() if hasattr(value, "denominator") else 1
    return int(numerator), int(denominator)


def _polynomial_data(polynomial: Any) -> tuple[tuple[int, int], ...]:
    return tuple(_fraction(value) for value in polynomial.list())


def _resource(polynomial: Any) -> FmpqPolynomial:
    if not polynomial._has_fmpq_polynomial_resource():
        raise RuntimeError("FLINT rational polynomial storage is unavailable")
    return polynomial._exact_polynomial_resource()


class PreparedRationalJacobianCapability:
    """Immutable capability record for one prepared rational Jacobian."""

    def __init__(
        self,
        genus: int,
        fingerprint: str,
        compiled: bool,
        coefficient_word_capacity: int,
    ) -> None:
        self.available = True
        self.selected = "native" if compiled else "dynamic-fallback"
        self.genus = genus
        self.base_ring = "QQ"
        self.model_kind = "odd-degree-one-infinity"
        self.model_fingerprint = fingerprint
        self.schema = PACKED_RATIONAL_MUMFORD_SCHEMA
        self.workspace_slots = _WORKSPACE_SLOTS
        self.coefficient_word_capacity = coefficient_word_capacity

    def to_dict(self) -> dict[str, Any]:
        return {
            "available": self.available,
            "selected": self.selected,
            "genus": self.genus,
            "base_ring": self.base_ring,
            "model_kind": self.model_kind,
            "model_fingerprint": self.model_fingerprint,
            "schema": self.schema,
            "workspace_slots": self.workspace_slots,
            "coefficient_word_capacity": self.coefficient_word_capacity,
        }


class PreparedRationalJacobianArithmetic:
    """Prepared exact Cantor arithmetic for a genus-2/3 Jacobian over `QQ`."""

    def __init__(
        self,
        jacobian: Any,
        *,
        algorithm: str = "auto",
        max_batch_items: int = 1_000_000,
        max_group_operations: int = 4096,
        coefficient_word_capacity: int = 256,
        max_memory_bytes: int | None = None,
        cancel: Any = None,
    ) -> None:
        if algorithm not in ("auto", "native", "reference"):
            raise ValueError("unknown rational Cantor algorithm " + repr(algorithm))
        genus = int(jacobian.genus())
        if genus not in (2, 3):
            raise NotImplementedError(
                "prepared rational Cantor arithmetic needs genus 2 or 3"
            )
        if str(jacobian.base_ring()) != "Rational Field":
            raise NotImplementedError("prepared rational Cantor arithmetic needs QQ")
        if max(jacobian.f().degree(), 2 * jacobian.h().degree()) != 2 * genus + 1:
            raise NotImplementedError("prepared arithmetic needs an odd-degree model")
        maximum = _exact_integer(max_batch_items, "max_batch_items")
        operation_maximum = _exact_integer(max_group_operations, "max_group_operations")
        word_capacity = _exact_integer(
            coefficient_word_capacity, "coefficient_word_capacity"
        )
        if maximum <= 0 or operation_maximum <= 0 or word_capacity <= 0:
            raise ValueError("prepared arithmetic bounds must be positive")
        if word_capacity > 1_000_000:
            raise ValueError("coefficient_word_capacity is too large")
        memory_maximum = None
        if max_memory_bytes is not None:
            memory_maximum = _exact_integer(max_memory_bytes, "max_memory_bytes")
            if memory_maximum <= 0:
                raise ValueError("max_memory_bytes must be positive")
            fixed_output_bytes = 2 * _OUTPUT_WORDS * word_capacity * 8
            if fixed_output_bytes > memory_maximum:
                raise RuntimeError(
                    "rational Cantor output buffers exceed max_memory_bytes"
                )
        if cancel is not None and not callable(cancel):
            raise TypeError("cancel must be callable")
        self._jacobian = jacobian
        self._genus = genus
        self._requested = algorithm
        self._max_batch_items = maximum
        self._max_group_operations = operation_maximum
        self._coefficient_word_capacity = word_capacity
        self._max_memory_bytes = memory_maximum
        self._cancel = cancel
        self._workspace = fmpq_polynomial_workspace(_WORKSPACE_SLOTS)
        self._busy = False
        self._f_resource = _resource(jacobian.f())
        self._h_resource = _resource(jacobian.h())
        self._add_output = kernel_integer_zeros(
            rational_cantor_add, _OUTPUT_WORDS, word_capacity
        )
        self._scalar_output = kernel_integer_zeros(
            rational_cantor_scalar, _OUTPUT_WORDS, word_capacity
        )
        model = (genus, _polynomial_data(jacobian.f()), _polynomial_data(jacobian.h()))
        self.model_fingerprint = hashlib.sha256(repr(model).encode("ascii")).hexdigest()
        compiled = is_compiled(rational_cantor_add) and is_compiled(
            rational_cantor_scalar
        )
        self._capability = PreparedRationalJacobianCapability(
            genus, self.model_fingerprint, compiled, word_capacity
        )
        if algorithm == "native" and not compiled:
            raise RuntimeError("the compiled rational Cantor kernels are unavailable")

    @property
    def native_available(self) -> bool:
        return self._capability.selected == "native"

    def capability(self) -> PreparedRationalJacobianCapability:
        """Return the immutable prepared-domain capability record."""
        return self._capability

    @property
    def closed(self) -> bool:
        return self._workspace.closed

    def close(self) -> None:
        """Release the prepared FLINT scratch workspace deterministically."""
        self._workspace.close()

    def __enter__(self) -> PreparedRationalJacobianArithmetic:
        if self.closed:
            raise RuntimeError("prepared rational Cantor context is closed")
        return self

    def __exit__(self, exception_type: Any, exception: Any, traceback: Any) -> bool:
        self.close()
        return False

    def _bounded_count(self, count: int) -> None:
        if count > self._max_batch_items:
            raise RuntimeError("rational Cantor batch exceeds max_batch_items")

    def _bounded_tuple(self, values: Any) -> tuple[Any, ...]:
        """Materialize at most the configured number of batch entries."""
        if isinstance(values, tuple):
            self._bounded_count(len(values))
            return values
        answer = []
        for value in values:
            if len(answer) >= self._max_batch_items:
                raise RuntimeError("rational Cantor batch exceeds max_batch_items")
            answer.append(value)
        return tuple(answer)

    def _enter(self) -> None:
        if self.closed:
            raise RuntimeError("prepared rational Cantor context is closed")
        if self._busy:
            raise RuntimeError("prepared rational Cantor context is already active")
        self._busy = True

    def _check_limits(self) -> None:
        if self._cancel is not None and self._cancel():
            raise RuntimeError("prepared rational Cantor operation cancelled")
        if self._max_memory_bytes is not None:
            allocated = int(fmpq_polynomial_workspace_allocated_bytes(self._workspace))
            if allocated > self._max_memory_bytes:
                raise RuntimeError("rational Cantor workspace exceeds max_memory_bytes")

    def _leave(self) -> None:
        self._busy = False

    def pack(self, divisor: Any) -> dict[str, Any]:
        if divisor.parent() is not self._jacobian:
            raise TypeError("divisor belongs to a different Jacobian")
        u, v = divisor.uv()
        return {
            "schema": PACKED_RATIONAL_MUMFORD_SCHEMA,
            "model_fingerprint": self.model_fingerprint,
            "u": _polynomial_data(u),
            "v": _polynomial_data(v),
        }

    def unpack(self, row: dict[str, Any]) -> Any:
        if row.get("schema") != PACKED_RATIONAL_MUMFORD_SCHEMA:
            raise ValueError("unknown packed rational Mumford schema")
        if row.get("model_fingerprint") != self.model_fingerprint:
            raise ValueError("packed rational Mumford model mismatch")
        ring = self._jacobian.polynomial_ring()
        field = self._jacobian.base_ring()
        u = ring(
            [field(numerator) / denominator for numerator, denominator in row["u"]]
        )
        v = ring(
            [field(numerator) / denominator for numerator, denominator in row["v"]]
        )
        answer = self._jacobian._element(u, v, False)
        self._jacobian._validate_reduced(u, v)
        return answer

    def fingerprint(self, divisor: Any) -> str:
        row = self.pack(divisor)
        payload = (row["schema"], row["model_fingerprint"], row["u"], row["v"])
        return hashlib.sha256(repr(payload).encode("ascii")).hexdigest()

    def _unpack_output(self, output: IntegerBuffer) -> Any:
        values = integer_buffer_values(output)
        u_length = int(values[0])
        v_length = int(values[1])
        if u_length < 1 or u_length > 4 or v_length < 0 or v_length > 3:
            raise ArithmeticError("native rational Cantor output is malformed")
        field = self._jacobian.base_ring()
        ring = self._jacobian.polynomial_ring()
        u_values = [
            field(values[2 + 2 * index]) / field(values[3 + 2 * index])
            for index in range(u_length)
        ]
        v_values = [
            field(values[10 + 2 * index]) / field(values[11 + 2 * index])
            for index in range(v_length)
        ]
        # The native kernel reaches this point only after exact FLINT division,
        # monic reduction, and the fixed reduced-degree checks in `_write_pair`.
        # Repeating the full polynomial divisibility test here costs more than
        # the group operation itself.  Untrusted external rows still go through
        # `unpack`, which performs `_validate_reduced`, while operation
        # certificates independently replay the reference group law.
        return self._jacobian._element(ring(u_values), ring(v_values), False)

    def _native_add(self, left: Any, right: Any) -> Any:
        u1, v1 = left[0], left[1]
        u2, v2 = right[0], right[1]
        if not rational_cantor_add(
            self._add_output,
            self._workspace,
            self._f_resource,
            self._h_resource,
            _resource(u1),
            _resource(v1),
            _resource(u2),
            _resource(v2),
            self._genus,
        ):
            raise ArithmeticError("native rational Cantor addition failed closed")
        return self._unpack_output(self._add_output)

    def _native_scalar(self, divisor: Any, scalar: int, maximum: int) -> Any:
        u, v = divisor[0], divisor[1]
        if not rational_cantor_scalar(
            self._scalar_output,
            self._workspace,
            self._f_resource,
            self._h_resource,
            _resource(u),
            _resource(v),
            scalar,
            self._genus,
            maximum,
        ):
            raise RuntimeError(
                "rational Cantor scalar operation bound exceeded or arithmetic failed"
            )
        return self._unpack_output(self._scalar_output)

    def _reference_add(self, left: Any, right: Any) -> Any:
        u, v = self._jacobian._compose(left[0], left[1], right[0], right[1])
        return self._jacobian._element(u, v, False)

    def add_batch(
        self,
        lefts: Any,
        rights: Any,
        *,
        algorithm: str | None = None,
        diagnostics: bool = False,
    ) -> Any:
        left_values = self._bounded_tuple(lefts)
        right_values = self._bounded_tuple(rights)
        if len(left_values) != len(right_values):
            raise ValueError("rational Cantor batch lengths differ")
        selected = self._requested if algorithm is None else algorithm
        if selected not in ("auto", "native", "reference"):
            raise ValueError("unknown rational Cantor algorithm " + repr(selected))
        use_native = selected != "reference" and self.native_available
        if selected == "native" and not use_native:
            raise RuntimeError("compiled rational Cantor addition is unavailable")
        limits_active = self._cancel is not None or self._max_memory_bytes is not None
        if len(left_values) == 1 and use_native and not diagnostics:
            left, right = left_values[0], right_values[0]
            if (
                left.parent() is not self._jacobian
                or right.parent() is not self._jacobian
            ):
                raise TypeError("divisor belongs to a different Jacobian")
            self._enter()
            try:
                if limits_active:
                    self._check_limits()
                answer = self._native_add(left, right)
                if limits_active:
                    self._check_limits()
            finally:
                self._leave()
            return (answer,)
        started = time.perf_counter_ns() if diagnostics else 0
        answers = []
        self._enter()
        try:
            for left, right in zip(left_values, right_values, strict=True):
                if limits_active:
                    self._check_limits()
                if (
                    left.parent() is not self._jacobian
                    or right.parent() is not self._jacobian
                ):
                    raise TypeError("divisor belongs to a different Jacobian")
                answers.append(
                    self._native_add(left, right)
                    if use_native
                    else self._reference_add(left, right)
                )
                if limits_active:
                    self._check_limits()
        finally:
            self._leave()
        elapsed = time.perf_counter_ns() - started if diagnostics else 0
        result = tuple(answers)
        if diagnostics:
            return result, {
                "operation": "add_batch",
                "selected": "native" if use_native else "reference",
                "count": len(result),
                "elapsed_ns": elapsed,
                "workspace_slots": _WORKSPACE_SLOTS,
            }
        return result

    def double_batch(
        self,
        elements: Any,
        *,
        algorithm: str | None = None,
        diagnostics: bool = False,
    ) -> Any:
        values = self._bounded_tuple(elements)
        return self.add_batch(
            values, values, algorithm=algorithm, diagnostics=diagnostics
        )

    def negate_batch(
        self,
        elements: Any,
        *,
        algorithm: str | None = None,
        diagnostics: bool = False,
    ) -> Any:
        """Return canonical inverses through the bounded scalar boundary."""
        values = self._bounded_tuple(elements)
        result = self.scalar_batch(
            values,
            tuple(-1 for _value in values),
            algorithm=algorithm,
            diagnostics=diagnostics,
        )
        if diagnostics:
            answers, record = result
            record["operation"] = "negate_batch"
            return answers, record
        return result

    def scalar_batch(
        self,
        elements: Any,
        scalars: Any,
        *,
        algorithm: str | None = None,
        diagnostics: bool = False,
        max_group_operations: int | None = None,
    ) -> Any:
        values = self._bounded_tuple(elements)
        scalar_values = tuple(
            _exact_integer(value, "scalar") for value in self._bounded_tuple(scalars)
        )
        if len(values) != len(scalar_values):
            raise ValueError("rational Cantor scalar batch lengths differ")
        selected = self._requested if algorithm is None else algorithm
        if selected not in ("auto", "native", "reference"):
            raise ValueError("unknown rational Cantor algorithm " + repr(selected))
        use_native = selected != "reference" and self.native_available
        if selected == "native" and not use_native:
            raise RuntimeError("compiled rational Cantor scalar is unavailable")
        maximum = self._max_group_operations
        if max_group_operations is not None:
            maximum = _exact_integer(max_group_operations, "max_group_operations")
            if maximum <= 0:
                raise ValueError("max_group_operations must be positive")
        limits_active = self._cancel is not None or self._max_memory_bytes is not None
        if len(values) == 1 and use_native and not diagnostics:
            divisor, scalar = values[0], scalar_values[0]
            if divisor.parent() is not self._jacobian:
                raise TypeError("divisor belongs to a different Jacobian")
            self._enter()
            try:
                if limits_active:
                    self._check_limits()
                answer = self._native_scalar(divisor, scalar, maximum)
                if limits_active:
                    self._check_limits()
            finally:
                self._leave()
            return (answer,)
        started = time.perf_counter_ns() if diagnostics else 0
        answers = []
        self._enter()
        try:
            for divisor, scalar in zip(values, scalar_values, strict=True):
                if limits_active:
                    self._check_limits()
                if divisor.parent() is not self._jacobian:
                    raise TypeError("divisor belongs to a different Jacobian")
                if use_native:
                    answer = self._native_scalar(divisor, scalar, maximum)
                else:
                    bit_bound = 2 * abs(scalar).bit_length()
                    if bit_bound > maximum:
                        raise RuntimeError(
                            "rational Cantor scalar operation bound exceeded"
                        )
                    answer = divisor._scalar_multiple_reference(scalar)
                answers.append(answer)
                if limits_active:
                    self._check_limits()
        finally:
            self._leave()
        elapsed = time.perf_counter_ns() - started if diagnostics else 0
        result = tuple(answers)
        if diagnostics:
            return result, {
                "operation": "scalar_batch",
                "selected": "native" if use_native else "reference",
                "count": len(result),
                "elapsed_ns": elapsed,
                "workspace_slots": _WORKSPACE_SLOTS,
            }
        return result

    def sum(
        self,
        elements: Any,
        *,
        algorithm: str | None = None,
    ) -> Any:
        values = self._bounded_tuple(elements)
        answer = self._jacobian.zero()
        for divisor in values:
            answer = self.add_batch((answer,), (divisor,), algorithm=algorithm)[0]
        return answer

    def operation_certificate(
        self,
        operation: str,
        left: Any,
        right: Any,
    ) -> dict[str, Any]:
        if operation == "add":
            answer = self.add_batch((left,), (right,))[0]
            certificate = {
                "schema": "sagejs.hyperelliptic.rational-cantor-operation.v1",
                "operation": operation,
                "left": self.pack(left),
                "right": self.pack(right),
                "answer": self.pack(answer),
            }
        elif operation == "scalar":
            scalar = _exact_integer(right, "scalar")
            answer = self.scalar_batch((left,), (scalar,))[0]
            certificate = {
                "schema": "sagejs.hyperelliptic.rational-cantor-operation.v1",
                "operation": operation,
                "left": self.pack(left),
                "scalar": str(scalar),
                "answer": self.pack(answer),
            }
        else:
            raise ValueError("unknown rational Cantor certificate operation")
        self.verify_operation_certificate(certificate)
        return certificate

    def verify_operation_certificate(self, certificate: dict[str, Any]) -> bool:
        if (
            certificate.get("schema")
            != "sagejs.hyperelliptic.rational-cantor-operation.v1"
        ):
            raise ValueError("unknown rational Cantor certificate schema")
        left = self.unpack(certificate["left"])
        operation = certificate.get("operation")
        if operation == "add":
            right = self.unpack(certificate["right"])
            expected = self._reference_add(left, right)
        elif operation == "scalar":
            expected = left._scalar_multiple_reference(int(certificate["scalar"]))
        else:
            raise ValueError("unknown rational Cantor certificate operation")
        answer = self.unpack(certificate["answer"])
        if answer != expected:
            raise ArithmeticError("rational Cantor certificate failed reference replay")
        return True


__all__ = [
    "PACKED_RATIONAL_MUMFORD_SCHEMA",
    "PreparedRationalJacobianArithmetic",
    "PreparedRationalJacobianCapability",
    "rational_cantor_add",
    "rational_cantor_scalar",
]
