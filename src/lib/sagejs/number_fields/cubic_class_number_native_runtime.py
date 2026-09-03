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

import sagejs.runtime as runtime

from sagejs.number_fields.class_group_proof_contracts import (
    BDF_CLASS_CHARACTER_GRH,
    BELABAS_FRIEDMAN_ZETA_GRH,
)
from sagejs.number_fields.cubic_class_number_native import (
    _CUBIC_ANALYTIC_MAX_TERMS,
    _CUBIC_ANALYTIC_MAX_VALUES,
    _CUBIC_ANALYTIC_PRECISION,
    _CUBIC_ANALYTIC_THRESHOLD,
    _CUBIC_ANALYSIS_PROOF_CAPACITY,
    _CUBIC_ARCHIMEDEAN_EXPONENT_LIMIT,
    _CUBIC_MAX_FACTORS,
    _CUBIC_MAX_GRH_BOUND_SEARCH,
    _CUBIC_MAX_GROUPS,
    _CUBIC_MAX_ORDER_WITNESSES,
    _CUBIC_MAX_RELATIONS,
    _CUBIC_PROOF_ANALYTIC_GRH,
    _CUBIC_PROOF_TRIVIAL_GRH,
    _CUBIC_PROOF_TRIVIAL_MINKOWSKI,
    _CUBIC_ROUND2_WORKSPACE_LENGTH,
    certified_complex_cubic_class_group_v1,
)


_CUBIC_OUTPUT_LENGTH = 64
# Published exact units can be exponentially larger than their field
# discriminants.  Keep the bounded public buffers aligned with the closed
# program's 4096-bit archimedean reconstruction envelope.
# Exact-coordinate size is not mathematically bounded by the archimedean
# exponent.  This independent publication envelope is deliberately the same
# numerical size; a larger coordinate raises OverflowError and declines.
_CUBIC_BUFFER_WORD_CAPACITY = (_CUBIC_ARCHIMEDEAN_EXPONENT_LIMIT + 63) // 64
_CUBIC_ARENA_MEMORY_LIMIT = 1_048_576
_CUBIC_ARENA_TEMPORARY_LIMIT = 2_097_152
_CUBIC_RELATION_EFFORTS = (1, 2, 3, 4, 5, 6, 7, 8)
_resident_buffers: tuple[Any, ...] | None = None
_resident_coefficients: tuple[Any, tuple[int, int, int, int], Any] | None = None
_resident_native_module: Any | None = None
_resident_call_active = False
_CERTIFIED_CUBIC_RECEIPT_TOKEN = object()
_TRIVIAL_RELATION_TRANSCRIPT_SCHEMA = (
    "sagejs.number-fields/complex-cubic-trivial-relation-transcript-v1"
)


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


def _cubic_ceil_sqrt(value: int) -> int:
    """Return the exact ceiling square root of a nonnegative integer."""
    if value < 2:
        return value
    low = 0
    high = 1
    while high * high < value:
        high *= 2
    while high - low > 1:
        middle = (low + high) // 2
        if middle * middle < value:
            low = middle
        else:
            high = middle
    return high


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
        proof_mode = exact[35]
        discriminant_root = _cubic_ceil_sqrt(-exact[28])
        minkowski_bound = (2 * discriminant_root + 6) // 7
        if (
            exact[19] < 0
            or exact[19] > 4
            or exact[20] < 2
            or exact[24] != 1
            or exact[28] >= -1
            or exact[29] < 1
            or exact[30] < 1
            or exact[33] != exact[21]
            or exact[34] != equation_discriminant
            or exact[28] * exact[29] * exact[29] != equation_discriminant
            or proof_mode
            not in (
                _CUBIC_PROOF_ANALYTIC_GRH,
                _CUBIC_PROOF_TRIVIAL_MINKOWSKI,
                _CUBIC_PROOF_TRIVIAL_GRH,
            )
            or exact[21] < 0
            or exact[21] > _CUBIC_MAX_FACTORS
            or exact[22] < 0
            or exact[22] > _CUBIC_MAX_GROUPS
            or (exact[21] == 0 and exact[22] != 0)
            or (exact[21] != 0 and exact[22] == 0)
            or exact[23] < exact[21]
            or exact[23] > _CUBIC_MAX_RELATIONS
        ):
            return None
        if proof_mode == _CUBIC_PROOF_ANALYTIC_GRH:
            if (
                exact[36] != _CUBIC_ANALYTIC_THRESHOLD
                or exact[37] < 1
                or exact[37] > _CUBIC_ANALYTIC_MAX_TERMS
                or exact[38] < 5
                or exact[38] > _CUBIC_ANALYTIC_MAX_VALUES
                or exact[39] != _CUBIC_ANALYTIC_PRECISION
                or exact[47] != 1 << _CUBIC_ANALYTIC_PRECISION
                or exact[40] <= 0
                or exact[41] < exact[40]
                or exact[43] < exact[42]
                or exact[45] < exact[44]
                or exact[45] < 0
                or exact[45] >= 842 * exact[47] // 1215
                or exact[46] < 0
            ):
                return None
        elif (
            class_number != 1
            or invariant_count != 0
            or (exact[21] == 0 and exact[23] != 0)
            or any(exact[index] != 0 for index in range(36, 50))
            or (
                proof_mode == _CUBIC_PROOF_TRIVIAL_MINKOWSKI
                and exact[20] != minkowski_bound
            )
            or (proof_mode == _CUBIC_PROOF_TRIVIAL_GRH and exact[20] >= minkowski_bound)
        ):
            return None
        return exact
    except (IndexError, OverflowError, TypeError, ValueError):
        return None


def _checked_trivial_relation_transcript(
    value: Any,
    factor_count: int,
    relation_count: int,
) -> (
    tuple[
        tuple[tuple[int, ...], ...],
        tuple[tuple[int, ...], ...],
        tuple[tuple[int, int, int], ...],
    ]
    | None
):
    """Authenticate only the bounded shape and exact scalar encoding.

    Mathematical authentication is intentionally separate: the ordinary
    object replay reconstructs the theorem-qualified prime ideals, checks
    principal-ideal equalities, and proves that the relation lattice is all
    of `ZZ^factor_count`.
    """
    try:
        factor_rows, relation_rows, relation_elements = value
        if (
            len(factor_rows) != factor_count
            or len(relation_rows) != relation_count
            or len(relation_elements) != relation_count
        ):
            return None

        def exact_row(raw: Any, width: int) -> tuple[int, ...] | None:
            if not isinstance(raw, (list, tuple)) or len(raw) != width:
                return None
            row: list[int] = []
            for entry in raw:
                if isinstance(entry, (bool, float, str, bytes, bytearray)):
                    return None
                exact = int(entry)
                if exact != entry:
                    return None
                row.append(exact)
            return tuple(row)

        checked_factors: list[tuple[int, ...]] = []
        for raw in factor_rows:
            checked = exact_row(raw, 9)
            if checked is None:
                return None
            checked_factors.append(checked)
        checked_relations: list[tuple[int, ...]] = []
        for raw in relation_rows:
            checked = exact_row(raw, factor_count)
            if checked is None or any(entry < 0 for entry in checked):
                return None
            checked_relations.append(checked)
        checked_elements: list[tuple[int, int, int]] = []
        for raw in relation_elements:
            checked = exact_row(raw, 3)
            if checked is None:
                return None
            checked_elements.append((checked[0], checked[1], checked[2]))
        return (
            tuple(checked_factors),
            tuple(checked_relations),
            tuple(checked_elements),
        )
    except (OverflowError, TypeError, ValueError):
        return None


def _extract_trivial_relation_transcript(
    receipt: Any,
) -> (
    tuple[
        tuple[tuple[int, ...], ...],
        tuple[tuple[int, ...], ...],
        tuple[tuple[int, int, int], ...],
    ]
    | None
):
    """Rerun the proof finder once into exact-sized, audit-only buffers."""
    global _resident_call_active, _resident_coefficients
    if receipt._values[35] != _CUBIC_PROOF_TRIVIAL_GRH:
        return None
    factor_count = receipt.factor_base_size
    relation_count = receipt.relation_count
    if factor_count == 0:
        return ((), (), ())
    try:
        kernel = certified_complex_cubic_class_group_v1
        native_module = _resident_native_module
        if (
            _resident_call_active
            or native_module is None
            or _resident_buffers is None
            or _resident_buffers[0] is not kernel
            or not native_module.is_compiled(kernel)
        ):
            return None
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
            _unused_factor_rows,
            _unused_relation_rows,
            _unused_relation_elements,
        ) = _resident_buffers
        factor_output = native_module.kernel_integer_zeros(
            kernel,
            runtime.number(9 * factor_count),
            _CUBIC_BUFFER_WORD_CAPACITY,
        )
        relation_output = native_module.kernel_integer_zeros(
            kernel,
            runtime.number(relation_count * factor_count),
            _CUBIC_BUFFER_WORD_CAPACITY,
        )
        element_output = native_module.kernel_integer_zeros(
            kernel,
            runtime.number(3 * relation_count),
            _CUBIC_BUFFER_WORD_CAPACITY,
        )
        coefficients = receipt.polynomial_coefficients
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
                factor_output,
                relation_output,
                element_output,
                1,
                receipt.relation_effort,
                _CUBIC_ARENA_MEMORY_LIMIT,
                _CUBIC_ARENA_TEMPORARY_LIMIT,
            )
        finally:
            _resident_call_active = False
        if accepted is not True:
            return None
        values = _checked_native_values(
            coefficients, native_module.integer_buffer_values(output)
        )
        if values != receipt._values:
            return None
        flat_factors = tuple(
            int(value) for value in native_module.integer_buffer_values(factor_output)
        )
        flat_relations = tuple(
            int(value) for value in native_module.integer_buffer_values(relation_output)
        )
        flat_elements = tuple(
            int(value) for value in native_module.integer_buffer_values(element_output)
        )
        transcript = (
            tuple(
                flat_factors[index * 9 : (index + 1) * 9]
                for index in range(factor_count)
            ),
            tuple(
                flat_relations[index * factor_count : (index + 1) * factor_count]
                for index in range(relation_count)
            ),
            tuple(
                (
                    flat_elements[3 * index],
                    flat_elements[3 * index + 1],
                    flat_elements[3 * index + 2],
                )
                for index in range(relation_count)
            ),
        )
        return _checked_trivial_relation_transcript(
            transcript, factor_count, relation_count
        )
    except (
        AttributeError,
        ImportError,
        IndexError,
        OverflowError,
        RuntimeError,
        TypeError,
        ValueError,
        ArithmeticError,
    ):
        _resident_call_active = False
        return None


class CertifiedComplexCubicClassNumber:
    """Immutable live receipt for one rigorously certified native result."""

    def __init__(
        self,
        token: object,
        field: Any,
        coefficients: tuple[int, int, int, int],
        values: tuple[int, ...],
        relation_effort: int,
    ) -> None:
        if token is not _CERTIFIED_CUBIC_RECEIPT_TOKEN:
            raise TypeError("certified cubic receipts are adapter-issued")
        if relation_effort < 1 or relation_effort > max(_CUBIC_RELATION_EFFORTS):
            raise ValueError("a cubic receipt has an invalid relation effort")
        state = self.__dict__
        state["field"] = field
        state["_coefficients"] = coefficients
        state["_values"] = values
        state["_relation_effort"] = relation_effort
        state["_trivial_relation_transcript"] = None
        state["_transcript_attempted"] = False
        state["_snapshot"] = self._authentication_snapshot()
        state["_frozen"] = True

    def __setattr__(self, name: str, value: Any) -> None:
        if self.__dict__.get("_frozen", False):
            raise AttributeError("certified cubic class-number receipts are immutable")
        self.__dict__[name] = value

    def _authentication_snapshot(self) -> tuple[Any, ...]:
        return (
            id(self.field),
            self._coefficients,
            self._values,
            self._relation_effort,
            self._transcript_attempted,
            self._trivial_relation_transcript,
        )

    @property
    def relation_effort(self) -> int:
        return self._relation_effort

    def _ensure_trivial_relation_transcript(self) -> Any:
        if self._values[35] != _CUBIC_PROOF_TRIVIAL_GRH:
            return None
        state = self.__dict__
        if not state["_transcript_attempted"]:
            state["_trivial_relation_transcript"] = (
                _extract_trivial_relation_transcript(self)
            )
            state["_transcript_attempted"] = True
            state["_snapshot"] = self._authentication_snapshot()
        return state["_trivial_relation_transcript"]

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

    def _minkowski_bound(self) -> int:
        discriminant_root = _cubic_ceil_sqrt(-self.field_discriminant)
        return (2 * discriminant_root + 6) // 7

    def _uses_bdf_generator_bound(self) -> bool:
        return self.generator_bound < self._minkowski_bound()

    @property
    def proof_status(self) -> str:
        if self._values[35] == _CUBIC_PROOF_TRIVIAL_MINKOWSKI:
            if self.factor_base_size == 0:
                return "exact-empty-generator-base-unconditional"
            return "exact-trivial-presentation-unconditional"
        if self._values[35] == _CUBIC_PROOF_TRIVIAL_GRH:
            if self.factor_base_size == 0:
                return "exact-empty-generator-base-conditional-grh"
            return "exact-trivial-presentation-conditional-grh"
        return "exact-relations-conditional-grh"

    @property
    def assumptions(self) -> tuple[str, ...]:
        if self._values[35] == _CUBIC_PROOF_TRIVIAL_MINKOWSKI:
            return ()
        if self._values[35] == _CUBIC_PROOF_TRIVIAL_GRH:
            return (BDF_CLASS_CHARACTER_GRH,)
        if self._uses_bdf_generator_bound():
            return (BDF_CLASS_CHARACTER_GRH, BELABAS_FRIEDMAN_ZETA_GRH)
        return (BELABAS_FRIEDMAN_ZETA_GRH,)

    @property
    def theorem(self) -> str:
        if self._values[35] == _CUBIC_PROOF_TRIVIAL_MINKOWSKI:
            suffix = "empty-factor-base"
            if self.factor_base_size != 0:
                suffix = "trivial-relation-presentation"
            return "minkowski-generators-plus-" + suffix
        if self._values[35] == _CUBIC_PROOF_TRIVIAL_GRH:
            suffix = "empty-factor-base"
            if self.factor_base_size != 0:
                suffix = "trivial-relation-presentation"
            return "belabas-diaz-y-diaz-friedman-generators-plus-" + suffix
        if self._uses_bdf_generator_bound():
            return (
                "belabas-diaz-y-diaz-friedman-generators-plus-"
                "belabas-friedman-index-one"
            )
        return "minkowski-generators-plus-belabas-friedman-index-one"

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

    def _verify_bounded_minkowski(self, selected: Any) -> bool:
        """Replay only the unconditional bounded cubic object producer."""
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
        presentation = replay.presentation
        return bool(
            authenticated == self.class_number
            and replay.complete
            and replay.proof_status == "exact-unconditional"
            and presentation is not None
            and presentation.verify()
            and tuple(presentation.invariants) == self.invariants
        )

    def _verify_trivial_relation_transcript(self, selected: Any) -> bool:
        """Check a trivial presentation under its exact generator theorem.

        The closed program merely found this transcript.  Authority comes
        from rebuilding the maximal order and factor base through ordinary
        objects, checking a sufficient set of principal-ideal equalities, and
        independently proving that their exact row lattice is `ZZ^n`.
        """
        transcript = self._ensure_trivial_relation_transcript()
        checked = _checked_trivial_relation_transcript(
            transcript,
            self.factor_base_size,
            self.relation_count,
        )
        if checked is None:
            return False
        factor_rows, relation_rows, relation_elements = checked
        order = selected.maximal_order()
        if order.discriminant() != self.field_discriminant:
            return False

        factor_module = __import__(
            "sagejs.number_fields.class_group_factor_base",
            fromlist=["class_group_factor_base"],
        )
        relation_module = __import__(
            "sagejs.number_fields.class_group_relations",
            fromlist=["class_group_relations"],
        )
        matrix_module = __import__(
            "sagejs.number_fields.class_group_matrix",
            fromlist=["class_group_matrix"],
        )
        conditional = self._values[35] == _CUBIC_PROOF_TRIVIAL_GRH
        plan = factor_module.factor_base_plan(
            order,
            proof=not conditional,
            theorem="bdf" if conditional else "minkowski",
            max_bound=_CUBIC_MAX_GRH_BOUND_SEARCH,
        )
        plan.require_feasible()
        if (
            int(plan.bound) != self.generator_bound
            or abs(int(plan.bound_result.discriminant)) != abs(self.field_discriminant)
            or tuple(plan.assumptions) != self.assumptions
            or (conditional and plan.theorem != "Belabas--Diaz y Diaz--Friedman")
            or (not conditional and plan.theorem != "Minkowski")
        ):
            return False
        records = factor_module.build_factor_base(plan)
        if len(records) != self.factor_base_size:
            return False

        unmatched = [record.prime_ideal for record in records]
        order_basis = tuple(order.basis())
        if len(order_basis) != 3:
            return False
        factors: list[Any] = []
        for fingerprint in factor_rows:
            generators: list[Any] = []
            for row_index in range(3):
                generator = selected(0)
                for column_index in range(3):
                    generator += (
                        fingerprint[3 * row_index + column_index]
                        * order_basis[column_index]
                    )
                generators.append(generator)
            transcript_ideal = order.ideal(generators)
            matches = [
                index
                for index, prime_ideal in enumerate(unmatched)
                if prime_ideal == transcript_ideal
            ]
            if len(matches) != 1:
                return False
            factors.append(unmatched.pop(matches[0]))
        if unmatched:
            return False
        if not factors:
            return self.relation_count == 0

        identity_basis = tuple(
            tuple(int(row == column) for column in range(len(factors)))
            for row in range(len(factors))
        )
        selected_rows: list[tuple[int, ...]] = []
        selected_indices: list[int] = []
        basis: tuple[tuple[int, ...], ...] = ()
        for index, row in enumerate(relation_rows):
            candidate_rows = selected_rows + [row]
            candidate_basis = matrix_module.exact_relation_hnf_basis(
                candidate_rows,
                len(factors),
            )
            if candidate_basis != basis:
                selected_rows.append(row)
                selected_indices.append(index)
                basis = candidate_basis
            if basis == identity_basis:
                break
        if basis != identity_basis:
            return False

        for row, index in zip(selected_rows, selected_indices, strict=True):
            coordinates = relation_elements[index]
            element = selected(0)
            for coordinate, basis_element in zip(coordinates, order_basis, strict=True):
                element += coordinate * basis_element
            if element.is_zero():
                return False
            principal = order.ideal(element)
            reconstructed = relation_module.reconstruct_factor_base_ideal(
                order,
                factors,
                row,
            )
            if principal != reconstructed:
                return False
        return bool(
            matrix_module.exact_relation_hnf_basis(
                selected_rows,
                len(factors),
            )
            == identity_basis
        )

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
            if self._verify_bounded_minkowski(selected):
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

    def verify_conditional_grh(self, field: Any | None = None) -> bool:
        """Independently recompute the result under the receipt's GRH contract.

        This audit does not invoke the closed native program.  It uses the
        ordinary object implementation to reconstruct the maximal order, check
        the published unit exactly, and compute the complete class group with
        `proof=False`.  The accepted result is therefore exact under the same
        explicit GRH assumptions as the native receipt.  Use `verify()` when
        the stronger, potentially much more expensive unconditional replay is
        required.
        """
        selected = self.field if field is None else field
        if not self.matches(selected):
            return False
        # Empty bases and trivial presentations need no analytic completion.
        # Replay the exact relation transcript against the theorem-qualified
        # generator base instead of rediscovering principality by a far larger
        # Minkowski enumeration.
        if self.proof_status != "exact-relations-conditional-grh":
            try:
                if self._values[35] == _CUBIC_PROOF_TRIVIAL_MINKOWSKI:
                    return self._verify_bounded_minkowski(selected)
                return self._verify_trivial_relation_transcript(selected)
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
            general = __import__(
                "sagejs.number_fields.class_unit_groups",
                fromlist=["class_unit_groups"],
            )
            algorithm = (
                "minkowski"
                if self.assumptions == (BELABAS_FRIEDMAN_ZETA_GRH,)
                else "auto"
            )
            computation = general.compute_class_unit_group(
                selected,
                proof=False,
                algorithm=algorithm,
            )
            proof_state = getattr(computation.context, "proof_state", None)
            replay_assumptions = tuple(getattr(proof_state, "assumptions", ()))
            assumptions_covered = set(replay_assumptions).issubset(
                set(self.assumptions)
            )
            return bool(
                computation.complete
                and computation.proof_status
                in ("exact-relations-conditional-grh", "exact-unconditional")
                and proof_state is not None
                and getattr(proof_state, "label", None) == computation.proof_status
                and (
                    computation.proof_status == "exact-unconditional"
                    and replay_assumptions == ()
                    or computation.proof_status == "exact-relations-conditional-grh"
                    and bool(replay_assumptions)
                    and assumptions_covered
                )
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
        """Return a JSON-safe audit view of this live authenticated receipt."""
        transcript = self._ensure_trivial_relation_transcript()
        transcript_payload = None
        if transcript is not None:
            factor_rows, relation_rows, relation_elements = transcript
            transcript_payload = {
                "schema": _TRIVIAL_RELATION_TRANSCRIPT_SCHEMA,
                "factor_ideal_hnf_order_coordinates": [
                    [list(row[index : index + 3]) for index in range(0, 9, 3)]
                    for row in factor_rows
                ],
                "relation_rows": [list(row) for row in relation_rows],
                "principal_element_order_coordinates": [
                    list(row) for row in relation_elements
                ],
            }
        return {
            "schema": "sagejs.number-fields/certified-complex-cubic-native-v3",
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
            "relation_effort": self.relation_effort,
            "regulator_interval": list(self.regulator_interval),
            "zeta_log_residue_interval": list(self.zeta_log_residue_interval),
            "index_log_interval": list(self.index_log_interval),
            "analytic_threshold": self.analytic_threshold,
            "analytic_precision": self.analytic_precision,
            "proof_status": self.proof_status,
            "assumptions": list(self.assumptions),
            "theorem": self.theorem,
            "trivial_relation_transcript": transcript_payload,
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
            transcript_factor_rows = native_module.kernel_integer_zeros(
                kernel, 1, _CUBIC_BUFFER_WORD_CAPACITY
            )
            transcript_relation_rows = native_module.kernel_integer_zeros(
                kernel, 1, _CUBIC_BUFFER_WORD_CAPACITY
            )
            transcript_relation_elements = native_module.kernel_integer_zeros(
                kernel, 1, _CUBIC_BUFFER_WORD_CAPACITY
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
                transcript_factor_rows,
                transcript_relation_rows,
                transcript_relation_elements,
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
            transcript_factor_rows,
            transcript_relation_rows,
            transcript_relation_elements,
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
            accepted_effort = 0
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
                    transcript_factor_rows,
                    transcript_relation_rows,
                    transcript_relation_elements,
                    0,
                    relation_effort,
                    _CUBIC_ARENA_MEMORY_LIMIT,
                    _CUBIC_ARENA_TEMPORARY_LIMIT,
                )
                if accepted is True:
                    accepted_effort = relation_effort
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
            accepted_effort,
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
