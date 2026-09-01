"""Fail-closed public adapter for the resident complex-cubic program.

The mathematical algorithm lives in `cubic_class_number_native.py`.  This
module owns only host marshalling, small reusable publication buffers, and an
immutable live certificate.  The exact computational workspace remains inside
the native arena.  The certificate can be replayed through the
ordinary exact cubic implementation, so the accelerated scalar is never the
only correctness authority.
"""

from __future__ import annotations

from typing import Any

from sagejs.number_fields.cubic_class_number_native import (
    _CUBIC_ANALYTIC_MAX_TERMS,
    _CUBIC_ANALYTIC_MAX_VALUES,
    _CUBIC_ANALYTIC_PRECISION,
    _CUBIC_ANALYTIC_THRESHOLD,
    _CUBIC_ANALYSIS_PROOF_CAPACITY,
    _CUBIC_MAX_FACTORS,
    _CUBIC_MAX_GROUPS,
    _CUBIC_MAX_ORDER_WITNESSES,
    _CUBIC_MAX_RELATIONS,
    _CUBIC_ROUND2_WORKSPACE_LENGTH,
    certified_complex_cubic_class_group_v1,
)


_CUBIC_OUTPUT_LENGTH = 64
_CUBIC_BUFFER_WORD_CAPACITY = 8
_CUBIC_ARENA_MEMORY_LIMIT = 1_048_576
_CUBIC_ARENA_TEMPORARY_LIMIT = 2_097_152
_CUBIC_RELATION_EFFORTS = (1, 2, 3, 4, 5)
_resident_buffers: tuple[Any, ...] | None = None
_resident_coefficients: tuple[Any, tuple[int, int, int, int], Any] | None = None
_resident_native_module: Any | None = None
_resident_call_active = False
_CERTIFIED_CUBIC_RECEIPT_TOKEN = object()


def _integral_monic_cubic_coefficients(field: Any) -> tuple[int, int, int, int] | None:
    """Return the defining coefficients accepted by the native envelope."""
    try:
        if int(field.degree()) != 3:
            return None
        # Sage.js fields already retain their exact defining coefficients.
        # Reading that immutable tuple avoids reconstructing a public list on
        # every closed-program call.  Foreign Sage-compatible field objects
        # continue through the public polynomial API.
        values = getattr(field, "_defining_coefficients", None)
        if values is None:
            polynomial = field.defining_polynomial()
            values = polynomial.list()
        if len(values) != 4:
            return None
        answer: list[int] = []
        for value in values:
            numerator = int(getattr(value, "_numerator", value))
            denominator = int(getattr(value, "_denominator", 1))
            if denominator != 1:
                return None
            answer.append(numerator)
        if answer[3] != 1:
            return None
        return answer[0], answer[1], answer[2], answer[3]
    except (AttributeError, OverflowError, TypeError, ValueError):
        return None


def _cubic_polynomial_discriminant(coefficients: tuple[int, ...]) -> int:
    constant, linear, quadratic, _leading = coefficients
    return (
        quadratic * quadratic * linear * linear
        - 4 * linear * linear * linear
        - 4 * quadratic * quadratic * quadratic * constant
        - 27 * constant * constant
        + 18 * quadratic * linear * constant
    )


def _checked_native_values(
    coefficients: tuple[int, int, int, int], values: Any
) -> tuple[int, ...] | None:
    """Authenticate the constant-size publication before issuing authority."""
    try:
        exact = tuple(int(value) for value in values)
        if len(exact) != _CUBIC_OUTPUT_LENGTH or exact[0] != 2:
            return None
        class_number = exact[1]
        invariant_count = exact[2]
        if class_number < 1 or invariant_count < 0 or invariant_count > 16:
            return None
        invariants = exact[3 : 3 + invariant_count]
        product = 1
        previous = 1
        for invariant in invariants:
            if invariant <= 1 or invariant % previous != 0:
                return None
            product *= invariant
            previous = invariant
        if product != class_number:
            return None
        equation_discriminant = _cubic_polynomial_discriminant(coefficients)
        if (
            exact[19] < 0
            or exact[19] > 4
            or exact[24] != 1
            or exact[28] >= -1
            or exact[29] < 1
            or exact[30] < 1
            or exact[33] != exact[21]
            or exact[34] != equation_discriminant
            or exact[28] * exact[29] * exact[29] != equation_discriminant
            or exact[35] != 1
            or exact[36] != _CUBIC_ANALYTIC_THRESHOLD
            or exact[37] < 1
            or exact[37] > _CUBIC_ANALYTIC_MAX_TERMS
            or exact[38] < 5
            or exact[38] > _CUBIC_ANALYTIC_MAX_VALUES
            or exact[39] != _CUBIC_ANALYTIC_PRECISION
            or exact[47] != 1 << _CUBIC_ANALYTIC_PRECISION
            or exact[21] < 0
            or exact[21] > _CUBIC_MAX_FACTORS
            or exact[22] < 0
            or exact[22] > _CUBIC_MAX_GROUPS
            or (exact[21] == 0 and exact[22] != 0)
            or (exact[21] != 0 and exact[22] == 0)
            or exact[23] < exact[21]
            or exact[23] > _CUBIC_MAX_RELATIONS
            or exact[40] <= 0
            or exact[41] < exact[40]
            or exact[43] < exact[42]
            or exact[45] < exact[44]
            or exact[45] < 0
            # `log(2) > 842/1215` follows from the first three positive terms
            # of `2*atanh(1/3) = 2/3 + 2/81 + 2/1215 + ...`.  This independent
            # rational
            # check is weaker than the native interval check and therefore
            # cannot turn a decline into acceptance, while avoiding the
            # needlessly coarse one-term bound `2/3`.
            or exact[45] >= 842 * exact[47] // 1215
            or exact[46] < 0
        ):
            return None
        return exact
    except (IndexError, OverflowError, TypeError, ValueError):
        return None


class CertifiedComplexCubicClassNumber:
    """Immutable live receipt for one rigorously certified native result."""

    def __init__(
        self,
        token: object,
        field: Any,
        coefficients: tuple[int, int, int, int],
        values: tuple[int, ...],
    ) -> None:
        if token is not _CERTIFIED_CUBIC_RECEIPT_TOKEN:
            raise TypeError("certified cubic receipts are adapter-issued")
        state = self.__dict__
        state["field"] = field
        state["_coefficients"] = coefficients
        state["_values"] = values
        state["_snapshot"] = (id(field), coefficients, values)
        state["_frozen"] = True

    def __setattr__(self, name: str, value: Any) -> None:
        if self.__dict__.get("_frozen", False):
            raise AttributeError("certified cubic class-number receipts are immutable")
        self.__dict__[name] = value

    def _authentication_snapshot(self) -> tuple[Any, ...]:
        return id(self.field), self._coefficients, self._values

    @property
    def polynomial_coefficients(self) -> tuple[int, int, int, int]:
        return self._coefficients

    @property
    def class_number(self) -> int:
        return self._values[1]

    @property
    def invariants(self) -> tuple[int, ...]:
        return tuple(self._values[3 : 3 + self._values[2]])

    @property
    def unit_coordinates(self) -> tuple[int, int, int]:
        return self._values[25], self._values[26], self._values[27]

    @property
    def field_discriminant(self) -> int:
        return self._values[28]

    @property
    def equation_order_index(self) -> int:
        return self._values[29]

    @property
    def order_basis_denominator(self) -> int:
        return self._values[30]

    @property
    def generator_bound(self) -> int:
        return self._values[20]

    @property
    def compound_multiplier_passes(self) -> int:
        return self._values[19]

    @property
    def factor_base_size(self) -> int:
        return self._values[21]

    @property
    def relation_count(self) -> int:
        return self._values[23]

    @property
    def regulator_interval(self) -> tuple[int, int, int]:
        return self._values[40], self._values[41], self._values[47]

    @property
    def zeta_log_residue_interval(self) -> tuple[int, int, int]:
        return self._values[42], self._values[43], self._values[47]

    @property
    def index_log_interval(self) -> tuple[int, int, int]:
        return self._values[44], self._values[45], self._values[47]

    @property
    def analytic_threshold(self) -> int:
        return self._values[36]

    @property
    def analytic_precision(self) -> int:
        return self._values[39]

    @property
    def proof_status(self) -> str:
        return "exact-relations-conditional-grh"

    @property
    def assumptions(self) -> tuple[str, ...]:
        return ("GRH: zeta_K(s) and zeta_Q(s) are nonzero whenever Re(s) > 1/2",)

    @property
    def theorem(self) -> str:
        return "belabas-diaz-y-diaz-friedman-generators-plus-belabas-friedman-index-one"

    def matches(self, field: Any) -> bool:
        """Return whether this live immutable receipt still binds `field`."""
        try:
            return bool(
                field is self.field
                and self.__dict__.get("_snapshot") == self._authentication_snapshot()
                and _integral_monic_cubic_coefficients(field)
                == self.polynomial_coefficients
                and _checked_native_values(self.polynomial_coefficients, self._values)
                == self._values
            )
        except (AttributeError, TypeError, ValueError, ArithmeticError):
            return False

    def verify(self, field: Any | None = None) -> bool:
        """Replay this receipt through the ordinary exact cubic producer.

        Replay deliberately does not invoke the closed native program.  It
        reconstructs the maximal order and a certified Minkowski class-number
        result through the readable object implementation, and separately
        checks that the published unit has norm plus or minus one.
        """
        selected = self.field if field is None else field
        if not self.matches(selected):
            return False
        try:
            order = selected.maximal_order()
            if order.discriminant() != self.field_discriminant:
                return False
            basis = tuple(order.basis())
            if len(basis) != 3:
                return False
            unit = (
                self.unit_coordinates[0] * basis[0]
                + self.unit_coordinates[1] * basis[1]
                + self.unit_coordinates[2] * basis[2]
            )
            if abs(unit.norm()) != 1:
                return False
            ordinary = __import__(
                "sagejs.number_fields.cubic_class_number",
                fromlist=["cubic_class_number"],
            )
            replay = ordinary.bounded_cubic_minkowski_class_number(selected)
            authenticated = ordinary.authenticated_cubic_class_number(replay, selected)
            if bool(
                authenticated == self.class_number
                and replay.complete
                and replay.proof_status == "exact-unconditional"
            ):
                return True
            # The small class-only producer is intentionally bounded and can
            # decline even when the general exact engine succeeds.  That
            # engine uses independent object representations, relation
            # admission, saturation, and analytic replay; use it as the final
            # research audit rather than asking the native program to repeat
            # itself.
            general = __import__(
                "sagejs.number_fields.class_unit_groups",
                fromlist=["class_unit_groups"],
            )
            computation = general.compute_class_unit_group(selected, proof=True)
            return bool(
                computation.complete
                and computation.proof_status == "exact-unconditional"
                and computation.class_number() == self.class_number
                and tuple(computation.class_group().invariants()) == self.invariants
            )
        except (
            AttributeError,
            ImportError,
            KeyError,
            OverflowError,
            RuntimeError,
            TypeError,
            ValueError,
            ArithmeticError,
        ):
            return False

    def to_dict(self) -> dict[str, Any]:
        """Return a detached, exact, JSON-safe research receipt."""
        return {
            "schema": "sagejs.number-fields/certified-complex-cubic-native-v1",
            "polynomial_coefficients": list(self.polynomial_coefficients),
            "class_number": self.class_number,
            "invariants": list(self.invariants),
            "unit_order_coordinates": list(self.unit_coordinates),
            "field_discriminant": self.field_discriminant,
            "equation_order_index": self.equation_order_index,
            "order_basis_denominator": self.order_basis_denominator,
            "generator_bound": self.generator_bound,
            "compound_multiplier_passes": self.compound_multiplier_passes,
            "factor_base_size": self.factor_base_size,
            "relation_count": self.relation_count,
            "regulator_interval": list(self.regulator_interval),
            "zeta_log_residue_interval": list(self.zeta_log_residue_interval),
            "index_log_interval": list(self.index_log_interval),
            "analytic_threshold": self.analytic_threshold,
            "analytic_precision": self.analytic_precision,
            "proof_status": self.proof_status,
            "assumptions": list(self.assumptions),
            "theorem": self.theorem,
        }


def certified_complex_cubic_class_number(
    field: Any,
) -> CertifiedComplexCubicClassNumber | None:
    """Return a certified native receipt, or `None` outside its envelope."""
    global _resident_buffers, _resident_call_active, _resident_coefficients
    global _resident_native_module
    cached = getattr(field, "_native_cubic_class_number_certificate", None)
    if isinstance(cached, CertifiedComplexCubicClassNumber) and cached.matches(field):
        return cached
    coefficients = _integral_monic_cubic_coefficients(field)
    if coefficients is None:
        return None
    try:
        kernel = certified_complex_cubic_class_group_v1
        if _resident_call_active:
            return None
        native_module = _resident_native_module
        if native_module is None:
            native_module = __import__("sagejs.native", fromlist=["native"])
            if not native_module.is_compiled(kernel):
                return None
            _resident_native_module = native_module
        if _resident_buffers is None or _resident_buffers[0] is not kernel:
            output = native_module.kernel_integer_zeros(
                kernel,
                _CUBIC_OUTPUT_LENGTH,
                _CUBIC_BUFFER_WORD_CAPACITY,
            )
            analysis_proof = native_module.kernel_integer_zeros(
                kernel,
                _CUBIC_ANALYSIS_PROOF_CAPACITY,
                _CUBIC_BUFFER_WORD_CAPACITY,
            )
            verification_polynomial = native_module.kernel_integer_zeros(
                kernel, 4, _CUBIC_BUFFER_WORD_CAPACITY
            )
            verification_numerator = native_module.kernel_integer_zeros(
                kernel, 9, _CUBIC_BUFFER_WORD_CAPACITY
            )
            verification_primes = native_module.kernel_integer_zeros(
                kernel,
                _CUBIC_MAX_ORDER_WITNESSES,
                _CUBIC_BUFFER_WORD_CAPACITY,
            )
            verification_radical_dimensions = native_module.kernel_integer_zeros(
                kernel,
                _CUBIC_MAX_ORDER_WITNESSES,
                _CUBIC_BUFFER_WORD_CAPACITY,
            )
            verification_radicals = native_module.kernel_integer_zeros(
                kernel,
                9 * _CUBIC_MAX_ORDER_WITNESSES,
                _CUBIC_BUFFER_WORD_CAPACITY,
            )
            verification_selectors = native_module.kernel_integer_zeros(
                kernel,
                3 * _CUBIC_MAX_ORDER_WITNESSES,
                _CUBIC_BUFFER_WORD_CAPACITY,
            )
            verification_workspace = native_module.kernel_integer_zeros(
                kernel,
                _CUBIC_ROUND2_WORKSPACE_LENGTH,
                _CUBIC_BUFFER_WORD_CAPACITY,
            )
            _resident_buffers = (
                kernel,
                output,
                analysis_proof,
                verification_polynomial,
                verification_numerator,
                verification_primes,
                verification_radical_dimensions,
                verification_radicals,
                verification_selectors,
                verification_workspace,
            )
        (
            _kernel,
            output,
            analysis_proof,
            verification_polynomial,
            verification_numerator,
            verification_primes,
            verification_radical_dimensions,
            verification_radicals,
            verification_selectors,
            verification_workspace,
        ) = _resident_buffers
        # The defining polynomial is immutable native input.  Retain one
        # packed capsule so repeated computations for the same polynomial do
        # not allocate or copy at the timed host/native boundary.  One entry
        # is deliberately enough: it is bounded, follows the active kernel's
        # lifetime, and cannot turn a field corpus into an unbounded cache.
        if (
            _resident_coefficients is None
            or _resident_coefficients[0] is not kernel
            or _resident_coefficients[1] != coefficients
        ):
            packed_coefficients = native_module.kernel_integer_buffer(
                kernel, coefficients
            )
            _resident_coefficients = kernel, coefficients, packed_coefficients
        else:
            packed_coefficients = _resident_coefficients[2]
        _resident_call_active = True
        try:
            accepted = False
            for relation_effort in _CUBIC_RELATION_EFFORTS:
                accepted = kernel(
                    output,
                    packed_coefficients,
                    analysis_proof,
                    verification_polynomial,
                    verification_numerator,
                    verification_primes,
                    verification_radical_dimensions,
                    verification_radicals,
                    verification_selectors,
                    verification_workspace,
                    relation_effort,
                    _CUBIC_ARENA_MEMORY_LIMIT,
                    _CUBIC_ARENA_TEMPORARY_LIMIT,
                )
                if accepted is True:
                    break
                # Only relation-rank, unit-rank, or analytic-index exhaustion
                # can authorize broader adjacent or compound relation effort.
                # Every earlier failure remains a fail-closed decline rather
                # than paying for semantically irrelevant retries.
                failed_values = native_module.integer_buffer_values(output)
                if int(failed_values[63]) not in (41, 42, 43, 8):
                    break
        finally:
            _resident_call_active = False
        if accepted is not True:
            return None
        values = _checked_native_values(
            coefficients, native_module.integer_buffer_values(output)
        )
        if values is None:
            return None
        certificate = CertifiedComplexCubicClassNumber(
            _CERTIFIED_CUBIC_RECEIPT_TOKEN,
            field,
            coefficients,
            values,
        )
        field._native_cubic_class_number_certificate = certificate
        return certificate
    except (
        AttributeError,
        ImportError,
        OverflowError,
        RuntimeError,
        TypeError,
        ValueError,
        ArithmeticError,
    ):
        _resident_call_active = False
        return None


__all__ = [
    "CertifiedComplexCubicClassNumber",
    "certified_complex_cubic_class_number",
]
