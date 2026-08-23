"""Prepared packed acceleration for public genus-2/3 Jacobian divisors.

The ordinary generalized Cantor law in `jacobian.py` is the semantic source of
truth.  The v1 packed ABI covers odd-degree, one-point-at-infinity models over
odd prime fields.  Even-degree Jacobians use a mathematically different
representation and are deliberately rejected rather than ambiguously packed.
"""

from __future__ import annotations

import hashlib
import time
from typing import Any, Mapping

import sagejs.runtime as runtime
from sagejs.native import (
    is_compiled,
    kernel_uint64_buffer,
    kernel_uint64_zeros,
)

PACKED_MUMFORD_SCHEMA = "sagejs.hyperelliptic.packed-mumford.odd.v1"
_PACKED_ROW_WORDS = 8


class PreparedJacobianCapability:
    """Immutable description of a prepared arithmetic execution domain."""

    def __init__(
        self,
        *,
        available: bool,
        selected: str,
        reason: str,
        genus: int,
        prime: int | None,
        model_fingerprint: str,
    ) -> None:
        self.available = bool(available)
        self.selected = str(selected)
        self.reason = str(reason)
        self.genus = int(genus)
        self.prime = prime
        self.model_kind = "odd-degree-one-infinity"
        self.schema = PACKED_MUMFORD_SCHEMA
        self.model_fingerprint = str(model_fingerprint)

    def to_dict(self) -> dict[str, Any]:
        return {
            "available": self.available,
            "selected": self.selected,
            "reason": self.reason,
            "genus": self.genus,
            "prime": self.prime,
            "model_kind": self.model_kind,
            "schema": self.schema,
            "model_fingerprint": self.model_fingerprint,
        }

    def __repr__(self) -> str:
        return "PreparedJacobianCapability(" + repr(self.to_dict()) + ")"


class PreparedBatchDiagnostics:
    """Non-proof timing and branch counters for one prepared batch."""

    def __init__(
        self,
        *,
        operation: str,
        requested: str,
        selected: str,
        fallback_reason: str,
        count: int,
        pack_ns: int,
        kernel_ns: int,
        unpack_ns: int,
        validation_ns: int,
        statuses: tuple[int, ...],
    ) -> None:
        self.operation = operation
        self.requested = requested
        self.selected = selected
        self.fallback_reason = fallback_reason
        self.count = count
        self.pack_ns = pack_ns
        self.kernel_ns = kernel_ns
        self.unpack_ns = unpack_ns
        self.validation_ns = validation_ns
        self.statuses = statuses

    def to_dict(self) -> dict[str, Any]:
        branch_counts: dict[str, int] = {}
        for status in self.statuses:
            key = str(status)
            branch_counts[key] = branch_counts.get(key, 0) + 1
        return {
            "operation": self.operation,
            "requested": self.requested,
            "selected": self.selected,
            "fallback_reason": self.fallback_reason,
            "count": self.count,
            "timings_ns": {
                "pack": self.pack_ns,
                "kernel": self.kernel_ns,
                "unpack": self.unpack_ns,
                "validation": self.validation_ns,
            },
            "status_counts": branch_counts,
        }

    def __repr__(self) -> str:
        return "PreparedBatchDiagnostics(" + repr(self.to_dict()) + ")"


def _exact_integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise TypeError(name + " must be an integer")
    try:
        answer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise TypeError(name + " must be an integer") from error
    try:
        exact = value == answer
    except Exception:
        exact = False
    if exact is not True:
        raise ValueError(name + " must be an exact integer")
    return answer


def _bit_length(value: int) -> int:
    bits = 0
    while value:
        value //= 2
        bits += 1
    return bits


def _backend_capability() -> tuple[Any, Any, Mapping[str, Any]] | None:
    backend = runtime.flint_backend()
    capability_function = runtime.reflect.get(backend, "genus3JacobianCapabilities")
    scalar_function = runtime.reflect.get(backend, "genus3JacobianScalarMultiply")
    if capability_function is runtime.undefined or scalar_function is runtime.undefined:
        return None
    capability = runtime.reflect.apply(capability_function, backend, [])
    if not bool(runtime.reflect.get(capability, "available")):
        return None
    return backend, scalar_function, capability


def _prime(jacobian: Any) -> int | None:
    if int(jacobian.genus()) != 3:
        return None
    field = jacobian.base_ring()
    if not hasattr(field, "characteristic") or not hasattr(field, "order"):
        return None
    prime = int(field.characteristic())
    if prime < 3 or int(field.order()) != prime:
        return None
    return prime


def native_scalar_supported(jacobian: Any) -> bool:
    """Return whether the packed scalar kernel supports `jacobian`."""
    native = _backend_capability()
    prime = _prime(jacobian)
    if native is None or prime is None:
        return False
    capability = native[2]
    return runtime.integer_bigint(prime) <= runtime.integer_bigint(
        runtime.reflect.get(capability, "primeUpperBound")
    )


def _residue(value: Any, prime: int) -> int:
    lifted = value.lift() if hasattr(value, "lift") else value
    return int(lifted) % prime


def _pack_polynomial(polynomial: Any, length: int, prime: int) -> Any:
    values = [_residue(value, prime) for value in polynomial.list()]
    if len(values) > length:
        raise ArithmeticError("the native genus-3 polynomial has excessive degree")
    values.extend([0 for _index in range(length - len(values))])
    return runtime.uint64_buffer([runtime.bigint(value) for value in values])


def _pack_divisor(divisor: Any, prime: int) -> Any:
    u_value, v_value = divisor.uv()
    u_values = [_residue(value, prime) for value in u_value.list()]
    v_values = [_residue(value, prime) for value in v_value.list()]
    if len(u_values) > 4 or len(v_values) > 3:
        raise ArithmeticError("the native kernel cannot pack this Mumford divisor")
    u_values.extend([0 for _index in range(4 - len(u_values))])
    v_values.extend([0 for _index in range(3 - len(v_values))])
    return runtime.uint64_buffer(
        [runtime.bigint(int(u_value.degree()))]
        + [runtime.bigint(value) for value in u_values]
        + [runtime.bigint(value) for value in v_values]
    )


def _unpack_divisor(jacobian: Any, packed: Any) -> Any:
    if len(packed) != 8:
        raise ArithmeticError("the native kernel returned a malformed divisor")
    degree = int(runtime.integer_bigint(packed[0]))
    if degree < 0 or degree > 3:
        raise ArithmeticError("the native kernel returned an invalid divisor degree")
    field = jacobian.base_ring()
    ring = jacobian.polynomial_ring()
    u_values = [
        field(int(runtime.integer_bigint(packed[index])))
        for index in range(1, degree + 2)
    ]
    v_values = [
        field(int(runtime.integer_bigint(packed[index])))
        for index in range(5, 5 + degree)
    ]
    divisor = jacobian._element(ring(u_values), ring(v_values), False)
    jacobian._validate_reduced(divisor[0], divisor[1])
    return divisor


def _prepared_prime(jacobian: Any) -> tuple[int | None, str]:
    genus = int(jacobian.genus())
    if genus not in (2, 3):
        return None, "genus-not-2-or-3"
    field = jacobian.base_ring()
    if not hasattr(field, "characteristic") or not hasattr(field, "order"):
        return None, "base-ring-not-finite-prime-field"
    prime = int(field.characteristic())
    if prime < 3 or int(field.order()) != prime:
        return None, "base-ring-not-odd-prime-field"
    if prime > 4_294_967_295:
        return None, "prime-exceeds-source-kernel-word-domain"
    if max(jacobian.f().degree(), 2 * jacobian.h().degree()) != 2 * genus + 1:
        return None, "model-not-odd-degree-one-infinity"
    return prime, "supported"


class PreparedJacobianArithmetic:
    """Prepared exact public arithmetic for one immutable Jacobian model.

    `algorithm="reference"` always executes ordinary polynomial Cantor
    arithmetic. `algorithm="native"` fails closed unless the same-source
    kernel is compiled and the v1 prime-field domain applies. `"auto"` uses
    that kernel when available and otherwise takes the exact reference path.
    """

    def __init__(
        self,
        jacobian: Any,
        *,
        algorithm: str = "auto",
        max_batch_items: int = 1_000_000,
    ) -> None:
        if algorithm not in ("auto", "native", "reference"):
            raise ValueError("unknown prepared Jacobian algorithm " + repr(algorithm))
        maximum = _exact_integer(max_batch_items, "max_batch_items")
        if maximum < 1:
            raise ValueError("max_batch_items must be positive")
        self._jacobian = jacobian
        self._algorithm = algorithm
        self._max_batch_items = maximum
        self._kummer_context_cache: dict[int, Any] = {}
        self.genus = int(jacobian.genus())
        self.prime, self._domain_reason = _prepared_prime(jacobian)
        self.schema = PACKED_MUMFORD_SCHEMA
        self.model_kind = "odd-degree-one-infinity"
        self._model = self._pack_model() if self.prime is not None else ()
        digest = hashlib.sha256()
        digest.update(self.schema.encode("ascii"))
        digest.update(bytes([self.genus]))
        if self.prime is not None:
            digest.update(int(self.prime).to_bytes(8, "little"))
            for value in self._model:
                digest.update(int(value).to_bytes(8, "little"))
        else:
            digest.update(repr(jacobian).encode("utf-8"))
        self.model_fingerprint = digest.hexdigest()

        from sagejs.hyperelliptic_curves.jacobian_kernels import (
            packed_cantor_add_batch,
            packed_cantor_progression_batch,
            packed_cantor_scalar_batch,
        )

        self._add_kernel = packed_cantor_add_batch
        self._progression_kernel = packed_cantor_progression_batch
        self._scalar_kernel = packed_cantor_scalar_batch
        self._native_available = (
            self.prime is not None
            and is_compiled(self._add_kernel)
            and is_compiled(self._progression_kernel)
            and is_compiled(self._scalar_kernel)
        )
        if algorithm == "native" and not self._native_available:
            raise NotImplementedError(
                "prepared native Cantor arithmetic is unavailable: "
                + (
                    self._domain_reason
                    if self.prime is None
                    else "source-transparent-artifact-unavailable"
                )
            )

    def jacobian(self) -> Any:
        return self._jacobian

    @property
    def native_available(self) -> bool:
        return self._native_available

    @property
    def max_batch_items(self) -> int:
        return self._max_batch_items

    @property
    def model_coefficients(self) -> tuple[int, ...]:
        """Return immutable packed `(f0,...,f7,h0,...,h3)` coefficients."""
        return self._model

    @property
    def f_coefficients(self) -> tuple[int, ...]:
        """Return the eight fixed-width packed coefficients of `f`."""
        return self._model[:8]

    @property
    def h_coefficients(self) -> tuple[int, ...]:
        """Return the four fixed-width packed coefficients of `h`."""
        return self._model[8:]

    def kummer_context(self, *, max_batch_bytes: int = 64 << 20) -> Any:
        """Return the cached sign-free genus-2 prime Kummer context.

        The import is deliberately lazy: public Cantor consumers need not load
        the Kummer kernel, and neither API exposes host/native implementation
        details.  Contexts are immutable and cached by their exact byte bound.
        """
        maximum = _exact_integer(max_batch_bytes, "max_batch_bytes")
        if maximum < 1:
            raise ValueError("max_batch_bytes must be positive")
        if self.genus != 2:
            raise NotImplementedError("the prepared Kummer context requires genus 2")
        if self.prime is None:
            raise NotImplementedError(
                "the prepared Kummer context is unavailable: " + self._domain_reason
            )
        cached = self._kummer_context_cache.get(maximum)
        if cached is not None:
            return cached
        try:
            module = __import__(
                "sagejs.hyperelliptic_curves.jacobian_kummer_native",
                fromlist=["Genus2PrimeKummerContext"],
            )
        except ImportError as error:
            raise NotImplementedError(
                "the prepared genus-2 Kummer kernel is unavailable"
            ) from error
        context = module.Genus2PrimeKummerContext(
            self.prime,
            self.f_coefficients,
            self.h_coefficients,
            max_batch_bytes=maximum,
        )
        self._kummer_context_cache[maximum] = context
        return context

    def capability(self) -> PreparedJacobianCapability:
        selected, reason = self._selection(self._algorithm)
        return PreparedJacobianCapability(
            available=self._native_available,
            selected=selected,
            reason=reason,
            genus=self.genus,
            prime=self.prime,
            model_fingerprint=self.model_fingerprint,
        )

    def _selection(self, requested: str | None) -> tuple[str, str]:
        algorithm = self._algorithm if requested is None else requested
        if algorithm not in ("auto", "native", "reference"):
            raise ValueError("unknown prepared Jacobian algorithm " + repr(algorithm))
        if algorithm == "reference":
            return "reference", "explicit-reference"
        if self._native_available:
            return "native", "supported-source-transparent-kernel"
        reason = (
            self._domain_reason
            if self.prime is None
            else "source-transparent-artifact-unavailable"
        )
        if algorithm == "native":
            raise NotImplementedError(
                "prepared native Cantor arithmetic is unavailable: " + reason
            )
        return "reference", reason

    def _pack_model(self) -> tuple[int, ...]:
        assert self.prime is not None
        f_values = [_residue(value, self.prime) for value in self._jacobian.f().list()]
        h_values = [_residue(value, self.prime) for value in self._jacobian.h().list()]
        if len(f_values) > 8 or len(h_values) > 4:
            raise ArithmeticError("the odd-degree v1 packed model has excessive degree")
        f_values.extend([0] * (8 - len(f_values)))
        h_values.extend([0] * (4 - len(h_values)))
        return tuple(f_values + h_values)

    def _check_batch_size(self, count: int) -> None:
        if count > self._max_batch_items:
            raise RuntimeError(
                "prepared Jacobian batch exceeds max_batch_items="
                + str(self._max_batch_items)
            )

    def pack(self, divisor: Any) -> tuple[int, ...]:
        """Return the canonical odd-degree v1 eight-word row."""
        if self.prime is None:
            raise NotImplementedError(
                "packed Mumford v1 is unavailable: " + self._domain_reason
            )
        if divisor.parent() is not self._jacobian:
            raise ValueError("the divisor belongs to a different Jacobian")
        cached = divisor._packed_row
        if cached is not None:
            return cached
        self._jacobian._validate_reduced(divisor[0], divisor[1])
        u_value, v_value = divisor.uv()
        degree = int(u_value.degree())
        if degree < 0 or degree > self.genus:
            raise ArithmeticError("the divisor is outside packed Mumford v1")
        u_values = [_residue(value, self.prime) for value in u_value.list()]
        v_values = [_residue(value, self.prime) for value in v_value.list()]
        u_values.extend([0] * (4 - len(u_values)))
        v_values.extend([0] * (3 - len(v_values)))
        row = tuple([degree] + u_values[:4] + v_values[:3])
        if row[degree + 1] != 1:
            raise ArithmeticError("packed u is not monic")
        divisor._packed_row = row
        return row

    def unpack(self, row: Any) -> Any:
        """Validate and publish one canonical odd-degree v1 row."""
        if self.prime is None:
            raise NotImplementedError(
                "packed Mumford v1 is unavailable: " + self._domain_reason
            )
        values = tuple(_exact_integer(value, "packed coefficient") for value in row)
        if len(values) != _PACKED_ROW_WORDS:
            raise ValueError("a packed Mumford v1 row must have eight words")
        degree = values[0]
        if degree < 0 or degree > self.genus:
            raise ValueError("packed Mumford degree is outside the context")
        if any(value < 0 or value >= self.prime for value in values[1:]):
            raise ValueError("packed Mumford coefficients are not canonical residues")
        if values[degree + 1] != 1:
            raise ValueError("packed Mumford u is not monic")
        if any(values[index] != 0 for index in range(degree + 2, 5)):
            raise ValueError("packed Mumford u has nonzero unused words")
        if any(values[index] != 0 for index in range(5 + degree, 8)):
            raise ValueError("packed Mumford v has nonzero unused words")
        field = self._jacobian.base_ring()
        ring = self._jacobian.polynomial_ring()
        divisor = self._jacobian._element(
            ring([field(value) for value in values[1 : degree + 2]]),
            ring([field(value) for value in values[5 : 5 + degree]]),
            False,
        )
        self._jacobian._validate_reduced(divisor[0], divisor[1])
        divisor._packed_row = values
        return divisor

    def fingerprint(self, divisor: Any) -> str:
        digest = hashlib.sha256()
        digest.update(bytes.fromhex(self.model_fingerprint))
        for value in self.pack(divisor):
            digest.update(int(value).to_bytes(8, "little"))
        return digest.hexdigest()

    def _reference_add(self, left: Any, right: Any) -> Any:
        u_value, v_value = self._jacobian._compose(left[0], left[1], right[0], right[1])
        return self._jacobian._element(u_value, v_value, False)

    def add_batch(
        self,
        lefts: Any,
        rights: Any,
        *,
        algorithm: str | None = None,
        diagnostics: bool = False,
    ) -> Any:
        left_values = tuple(lefts)
        right_values = tuple(rights)
        if len(left_values) != len(right_values):
            raise ValueError("left and right batches must have the same length")
        self._check_batch_size(len(left_values))
        for value in left_values + right_values:
            if value.parent() is not self._jacobian:
                raise ValueError("every batch divisor must lie in this Jacobian")
        selected, reason = self._selection(algorithm)
        started = time.perf_counter_ns()
        left_rows = ()
        right_rows = ()
        if selected == "native":
            left_rows = tuple(
                value for divisor in left_values for value in self.pack(divisor)
            )
            right_rows = tuple(
                value for divisor in right_values for value in self.pack(divisor)
            )
        pack_ns = time.perf_counter_ns() - started
        statuses: tuple[int, ...] = ()
        validation_ns = 0
        if selected == "reference":
            started = time.perf_counter_ns()
            answer = tuple(
                self._reference_add(left, right)
                for left, right in zip(left_values, right_values, strict=True)
            )
            kernel_ns = time.perf_counter_ns() - started
            unpack_ns = 0
            statuses = tuple(100 for _value in answer)
        else:
            assert self.prime is not None
            output = kernel_uint64_zeros(self._add_kernel, len(left_values) * 8)
            status_buffer = kernel_uint64_zeros(self._add_kernel, len(left_values))
            model = kernel_uint64_buffer(self._add_kernel, self._model)
            packed_left = kernel_uint64_buffer(self._add_kernel, left_rows)
            packed_right = kernel_uint64_buffer(self._add_kernel, right_rows)
            started = time.perf_counter_ns()
            accepted = self._add_kernel(
                output,
                status_buffer,
                model,
                packed_left,
                packed_right,
                len(left_values),
                self.genus,
                self.prime,
            )
            kernel_ns = time.perf_counter_ns() - started
            if not accepted:
                raise ArithmeticError(
                    "the packed Cantor addition kernel rejected a validated batch"
                )
            statuses = tuple(
                int(status_buffer[index]) for index in range(len(left_values))
            )
            if any(status == 0 for status in statuses):
                raise ArithmeticError("the packed Cantor kernel returned a failed item")
            started = time.perf_counter_ns()
            answer = tuple(
                self.unpack(tuple(int(output[8 * item + index]) for index in range(8)))
                for item in range(len(left_values))
            )
            unpack_ns = time.perf_counter_ns() - started
        record = PreparedBatchDiagnostics(
            operation="add",
            requested=self._algorithm if algorithm is None else algorithm,
            selected=selected,
            fallback_reason=reason,
            count=len(left_values),
            pack_ns=pack_ns,
            kernel_ns=kernel_ns,
            unpack_ns=unpack_ns,
            validation_ns=validation_ns,
            statuses=statuses,
        )
        return (answer, record) if diagnostics else answer

    def double_batch(
        self,
        elements: Any,
        *,
        algorithm: str | None = None,
        diagnostics: bool = False,
    ) -> Any:
        values: tuple[Any, ...] = tuple(elements)
        result = self.add_batch(
            values, values, algorithm=algorithm, diagnostics=diagnostics
        )
        if diagnostics:
            answer, record = result
            record.operation = "double"
            return answer, record
        return result

    def progression_batch(
        self,
        start: Any,
        step: Any,
        count: Any,
        *,
        algorithm: str | None = None,
        diagnostics: bool = False,
        max_group_operations: Any = None,
    ) -> Any:
        """Return `(start + i*step for i in range(count))` in one batch."""
        length = _exact_integer(count, "count")
        if length < 0:
            raise ValueError("count must be nonnegative")
        self._check_batch_size(length)
        if start.parent() is not self._jacobian or step.parent() is not self._jacobian:
            raise ValueError("progression divisors must lie in this Jacobian")
        operations = max(0, length - 1)
        if max_group_operations is not None:
            operation_limit = _exact_integer(
                max_group_operations, "max_group_operations"
            )
            if operation_limit < 0:
                raise ValueError("max_group_operations must be nonnegative")
            if operations > operation_limit:
                raise RuntimeError(
                    "prepared progression exceeds max_group_operations="
                    + str(operation_limit)
                )
        selected, reason = self._selection(algorithm)
        started = time.perf_counter_ns()
        start_row = step_row = ()
        if selected == "native":
            start_row = self.pack(start)
            step_row = self.pack(step)
        pack_ns = time.perf_counter_ns() - started
        validation_ns = 0
        if selected == "reference":
            started = time.perf_counter_ns()
            values = []
            current = start
            for index in range(length):
                values.append(current)
                if index + 1 < length:
                    current = self._reference_add(current, step)
            answer = tuple(values)
            kernel_ns = time.perf_counter_ns() - started
            unpack_ns = 0
            statuses = tuple(100 for _value in answer)
        else:
            assert self.prime is not None
            output = kernel_uint64_zeros(self._progression_kernel, length * 8)
            status_buffer = kernel_uint64_zeros(self._progression_kernel, length)
            started = time.perf_counter_ns()
            accepted = self._progression_kernel(
                output,
                status_buffer,
                kernel_uint64_buffer(self._progression_kernel, self._model),
                kernel_uint64_buffer(self._progression_kernel, start_row),
                kernel_uint64_buffer(self._progression_kernel, step_row),
                length,
                self.genus,
                self.prime,
            )
            kernel_ns = time.perf_counter_ns() - started
            if not accepted:
                raise ArithmeticError(
                    "the packed Cantor progression kernel rejected validated input"
                )
            statuses = tuple(int(status_buffer[index]) for index in range(length))
            started = time.perf_counter_ns()
            answer = tuple(
                self.unpack(tuple(int(output[8 * item + index]) for index in range(8)))
                for item in range(length)
            )
            unpack_ns = time.perf_counter_ns() - started
        record = PreparedBatchDiagnostics(
            operation="progression",
            requested=self._algorithm if algorithm is None else algorithm,
            selected=selected,
            fallback_reason=reason,
            count=length,
            pack_ns=pack_ns,
            kernel_ns=kernel_ns,
            unpack_ns=unpack_ns,
            validation_ns=validation_ns,
            statuses=statuses,
        )
        return (answer, record) if diagnostics else answer

    def scalar_batch(
        self,
        elements: Any,
        scalars: Any,
        *,
        algorithm: str | None = None,
        diagnostics: bool = False,
        max_group_operations: Any = None,
    ) -> Any:
        values = tuple(elements)
        scalar_values = tuple(_exact_integer(value, "scalar") for value in scalars)
        if len(values) != len(scalar_values):
            raise ValueError("element and scalar batches must have the same length")
        self._check_batch_size(len(values))
        for value in values:
            if value.parent() is not self._jacobian:
                raise ValueError("every batch divisor must lie in this Jacobian")
        if max_group_operations is not None:
            operation_limit = _exact_integer(
                max_group_operations, "max_group_operations"
            )
            if operation_limit < 0:
                raise ValueError("max_group_operations must be nonnegative")
            for scalar in scalar_values:
                magnitude = abs(scalar)
                required = 0
                while magnitude:
                    required += magnitude % 2
                    magnitude //= 2
                bits = _bit_length(abs(scalar))
                if bits:
                    required += bits - 1
                if required > operation_limit:
                    raise RuntimeError(
                        "prepared scalar multiplication exceeds "
                        "max_group_operations=" + str(operation_limit)
                    )
        selected, reason = self._selection(algorithm)
        started = time.perf_counter_ns()
        rows = ()
        if selected == "native":
            rows = tuple(value for divisor in values for value in self.pack(divisor))
        maximum_bits = max(
            (_bit_length(abs(value)) for value in scalar_values), default=0
        )
        words_per_scalar = max(1, (maximum_bits + 63) // 64)
        words: list[int] = []
        signs: list[int] = []
        for value in scalar_values:
            signs.append(1 if value < 0 else 0)
            magnitude = abs(value)
            for _index in range(words_per_scalar):
                words.append(magnitude % (1 << 64))
                magnitude //= 1 << 64
        pack_ns = time.perf_counter_ns() - started
        validation_ns = 0
        if selected == "reference":
            started = time.perf_counter_ns()
            answer = tuple(
                self._reference_scalar(value, scalar)
                for value, scalar in zip(values, scalar_values, strict=True)
            )
            kernel_ns = time.perf_counter_ns() - started
            unpack_ns = 0
            statuses = tuple(100 for _value in answer)
        else:
            assert self.prime is not None
            output = kernel_uint64_zeros(self._scalar_kernel, len(values) * 8)
            status_buffer = kernel_uint64_zeros(self._scalar_kernel, len(values))
            started = time.perf_counter_ns()
            accepted = self._scalar_kernel(
                output,
                status_buffer,
                kernel_uint64_buffer(self._scalar_kernel, self._model),
                kernel_uint64_buffer(self._scalar_kernel, rows),
                kernel_uint64_buffer(self._scalar_kernel, words),
                kernel_uint64_buffer(self._scalar_kernel, signs),
                len(values),
                words_per_scalar,
                self.genus,
                self.prime,
            )
            kernel_ns = time.perf_counter_ns() - started
            if not accepted:
                raise ArithmeticError(
                    "the packed Cantor scalar kernel rejected a validated batch"
                )
            statuses = tuple(int(status_buffer[index]) for index in range(len(values)))
            started = time.perf_counter_ns()
            answer = tuple(
                self.unpack(tuple(int(output[8 * item + index]) for index in range(8)))
                for item in range(len(values))
            )
            unpack_ns = time.perf_counter_ns() - started
        record = PreparedBatchDiagnostics(
            operation="scalar",
            requested=self._algorithm if algorithm is None else algorithm,
            selected=selected,
            fallback_reason=reason,
            count=len(values),
            pack_ns=pack_ns,
            kernel_ns=kernel_ns,
            unpack_ns=unpack_ns,
            validation_ns=validation_ns,
            statuses=statuses,
        )
        return (answer, record) if diagnostics else answer

    def _reference_scalar(self, value: Any, scalar: int) -> Any:
        if scalar < 0:
            return self._reference_scalar(-value, -scalar)
        result = self._jacobian.zero()
        addend = value
        while scalar:
            if scalar % 2:
                result = self._reference_add(result, addend)
            scalar //= 2
            if scalar:
                addend = self._reference_add(addend, addend)
        return result

    def sum(
        self,
        elements: Any,
        *,
        algorithm: str | None = None,
        diagnostics: bool = False,
    ) -> Any:
        values: tuple[Any, ...] = tuple(elements)
        self._check_batch_size(len(values))
        if not values:
            answer = self._jacobian.zero()
            if not diagnostics:
                return answer
            return answer, PreparedBatchDiagnostics(
                operation="sum",
                requested=self._algorithm if algorithm is None else algorithm,
                selected=self._selection(algorithm)[0],
                fallback_reason="empty",
                count=0,
                pack_ns=0,
                kernel_ns=0,
                unpack_ns=0,
                validation_ns=0,
                statuses=(),
            )
        total_pack = total_kernel = total_unpack = total_validation = 0
        all_statuses: list[int] = []
        level: tuple[Any, ...] = values
        selected, reason = self._selection(algorithm)
        while len(level) > 1:
            lefts = level[0::2]
            rights = level[1::2]
            carry = () if len(lefts) == len(rights) else (lefts[-1],)
            lefts = lefts[: len(rights)]
            pair_sums, record = self.add_batch(
                lefts, rights, algorithm=algorithm, diagnostics=True
            )
            total_pack += record.pack_ns
            total_kernel += record.kernel_ns
            total_unpack += record.unpack_ns
            total_validation += record.validation_ns
            all_statuses.extend(record.statuses)
            level = pair_sums + carry
        answer = next(iter(level))
        record = PreparedBatchDiagnostics(
            operation="sum",
            requested=self._algorithm if algorithm is None else algorithm,
            selected=selected,
            fallback_reason=reason,
            count=len(values),
            pack_ns=total_pack,
            kernel_ns=total_kernel,
            unpack_ns=total_unpack,
            validation_ns=total_validation,
            statuses=tuple(all_statuses),
        )
        return (answer, record) if diagnostics else answer


def native_scalar_multiply(
    divisor: Any,
    scalar: Any,
    *,
    max_group_operations: Any = None,
) -> tuple[Any, dict[str, int]] | None:
    """Return `(scalar*divisor, diagnostics)` or `None` outside the domain."""
    scalar_value = _exact_integer(scalar, "scalar")
    negative = scalar_value < 0
    magnitude = -scalar_value if negative else scalar_value
    magnitude_bits = _bit_length(magnitude)
    if magnitude_bits > 128:
        return None
    jacobian = divisor.parent()
    native = _backend_capability()
    prime = _prime(jacobian)
    if native is None or prime is None:
        return None
    backend, scalar_function, capability = native
    if runtime.integer_bigint(prime) > runtime.integer_bigint(
        runtime.reflect.get(capability, "primeUpperBound")
    ):
        return None
    default_operations = max(2, 2 * magnitude_bits + 2)
    if max_group_operations is None:
        operation_limit = default_operations
    else:
        operation_limit = _exact_integer(max_group_operations, "max_group_operations")
        if operation_limit < 0:
            raise ValueError("max_group_operations must be nonnegative")
    result = runtime.reflect.apply(
        scalar_function,
        backend,
        [
            runtime.bigint(prime),
            _pack_polynomial(jacobian.f(), 8, prime),
            _pack_polynomial(jacobian.h(), 4, prime),
            _pack_divisor(divisor, prime),
            runtime.bigint(magnitude),
            runtime.bigint(operation_limit),
            runtime.undefined,
        ],
    )
    status_name = str(runtime.reflect.get(result, "statusName"))
    diagnostics_value = runtime.reflect.get(result, "diagnostics")
    diagnostics = {
        name: int(runtime.integer_bigint(runtime.reflect.get(diagnostics_value, name)))
        for name in ["groupOperations", "scalarBits"]
    }
    if status_name in ("resource_limit", "cancelled"):
        raise RuntimeError(
            "native genus-3 scalar multiplication stopped with status "
            + repr(status_name)
        )
    if status_name != "ok":
        raise ArithmeticError(
            "native genus-3 scalar multiplication failed with status "
            + repr(status_name)
        )
    answer = _unpack_divisor(jacobian, runtime.reflect.get(result, "divisor"))
    if negative:
        answer = -answer
    return answer, diagnostics


def native_sum(
    elements: Any,
    *,
    max_group_operations: Any = None,
) -> tuple[Any, dict[str, int]] | None:
    """Add a bounded packed genus-3 batch in one native call."""
    values = list(elements)
    if not values:
        return None
    jacobian = values[0].parent()
    if any(value.parent() is not jacobian for value in values):
        raise ValueError("every native sum element must have the same parent")
    native = _backend_capability()
    prime = _prime(jacobian)
    if native is None or prime is None:
        return None
    backend, _scalar_function, capability = native
    if runtime.integer_bigint(prime) > runtime.integer_bigint(
        runtime.reflect.get(capability, "primeUpperBound")
    ):
        return None
    sum_function = runtime.reflect.get(backend, "genus3JacobianSum")
    if sum_function is runtime.undefined:
        return None
    operation_limit = (
        max(1, len(values))
        if max_group_operations is None
        else _exact_integer(max_group_operations, "max_group_operations")
    )
    if operation_limit < 0:
        raise ValueError("max_group_operations must be nonnegative")
    packed_values = []
    for value in values:
        packed = _pack_divisor(value, prime)
        for index in range(len(packed)):
            packed_values.append(runtime.integer_bigint(packed[index]))
    result = runtime.reflect.apply(
        sum_function,
        backend,
        [
            runtime.bigint(prime),
            _pack_polynomial(jacobian.f(), 8, prime),
            _pack_polynomial(jacobian.h(), 4, prime),
            runtime.uint64_buffer(packed_values),
            runtime.bigint(operation_limit),
            runtime.undefined,
        ],
    )
    status_name = str(runtime.reflect.get(result, "statusName"))
    diagnostics_value = runtime.reflect.get(result, "diagnostics")
    diagnostics = {
        "groupOperations": int(
            runtime.integer_bigint(
                runtime.reflect.get(diagnostics_value, "groupOperations")
            )
        )
    }
    if status_name in ("resource_limit", "cancelled"):
        raise RuntimeError(
            "native genus-3 sum stopped with status " + repr(status_name)
        )
    if status_name != "ok":
        raise ArithmeticError(
            "native genus-3 sum failed with status " + repr(status_name)
        )
    return _unpack_divisor(
        jacobian, runtime.reflect.get(result, "divisor")
    ), diagnostics


def native_element_order(
    divisor: Any,
    multiple: Any,
    *,
    max_group_operations: Any = 10_000_000,
) -> tuple[int, tuple[tuple[int, int], ...], dict[str, int]] | None:
    """Factor and strip an annihilating multiple in the packed kernel."""
    multiple_value = _exact_integer(multiple, "multiple")
    if multiple_value <= 0 or _bit_length(multiple_value) > 128:
        return None
    jacobian = divisor.parent()
    native = _backend_capability()
    prime = _prime(jacobian)
    if native is None or prime is None:
        return None
    backend, _scalar_function, capability = native
    if runtime.integer_bigint(prime) > runtime.integer_bigint(
        runtime.reflect.get(capability, "primeUpperBound")
    ):
        return None
    search_function = runtime.reflect.get(backend, "genus3JacobianSearchProgression")
    if search_function is runtime.undefined:
        return None
    operation_limit = _exact_integer(max_group_operations, "max_group_operations")
    if operation_limit < 0:
        raise ValueError("max_group_operations must be nonnegative")
    result = runtime.reflect.apply(
        search_function,
        backend,
        [
            runtime.bigint(prime),
            _pack_polynomial(jacobian.f(), 8, prime),
            _pack_polynomial(jacobian.h(), 4, prime),
            _pack_divisor(divisor, prime),
            runtime.bigint(multiple_value),
            runtime.bigint(1),
            runtime.bigint(1),
            runtime.bigint(2),
            runtime.bigint(operation_limit),
            runtime.undefined,
        ],
    )
    status_name = str(runtime.reflect.get(result, "statusName"))
    diagnostics_value = runtime.reflect.get(result, "diagnostics")
    diagnostics = {
        name: int(runtime.integer_bigint(runtime.reflect.get(diagnostics_value, name)))
        for name in [
            "groupOperations",
            "scalarBits",
            "babySteps",
            "giantSteps",
            "hashCollisions",
        ]
    }
    if status_name == "not_found":
        raise ValueError("the supplied multiple does not annihilate the element")
    if status_name in ("resource_limit", "cancelled"):
        raise RuntimeError(
            "native genus-3 order stripping stopped with status " + repr(status_name)
        )
    if status_name != "ok":
        raise ArithmeticError(
            "native genus-3 order stripping failed with status " + repr(status_name)
        )
    order = int(runtime.integer_bigint(runtime.reflect.get(result, "elementOrder")))
    raw_factors = runtime.reflect.get(result, "factorization")
    factors = tuple(
        sorted(
            (
                int(runtime.integer_bigint(raw_factors[index][0])),
                int(raw_factors[index][1]),
            )
            for index in range(len(raw_factors))
        )
    )
    return order, factors, diagnostics
