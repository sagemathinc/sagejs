"""Bounded class-group certificates and class-number-formula reports.

The existing imaginary-quadratic reduced-form implementation is a complete
deterministic algorithm and is wrapped here with replayable group evidence.
For fields not yet supported by certified prime-ideal relations this module
returns an explicitly incomplete search result rather than guessing a class
group from a truncated relation search.
"""

from __future__ import annotations

from typing import Any

import sagejs.runtime as runtime

from sagejs.number_fields.embeddings import (
    certified_minkowski_class_bound,
    exact_signature,
)
from sagejs.number_fields.units import UnitSubgroupResult


class _TrivialClassElement:
    def __mul__(self, other: Any) -> _TrivialClassElement:
        if not isinstance(other, _TrivialClassElement):
            return NotImplemented
        return self

    def __pow__(self, exponent: Any) -> _TrivialClassElement:
        return self

    def __eq__(self, other: object) -> bool:
        return isinstance(other, _TrivialClassElement)

    def order(self) -> int:
        return 1

    def is_one(self) -> bool:
        return True


class _TrivialClassGroup:
    def __init__(self) -> None:
        self._one = _TrivialClassElement()

    def order(self) -> int:
        return 1

    def one(self) -> _TrivialClassElement:
        return self._one

    def list(self) -> list[_TrivialClassElement]:
        return [self._one]

    def invariants(self) -> tuple[()]:
        return ()

    def gens(self) -> tuple[()]:
        return ()


class ClassGroupCertificate:
    """Finite abelian presentation evidence for a computed class group."""

    def __init__(
        self,
        group: Any,
        invariants: list[int],
        generators: list[Any],
        enumerated_order: int,
        source: str,
        evidence_kind: str = "binary-quadratic-reduced-form-enumeration",
    ) -> None:
        self.group = group
        self.invariants = tuple(invariants)
        self.generators = tuple(generators)
        self.enumerated_order = enumerated_order
        self.source = source
        self.proof_status = "exact"
        self.evidence_kind = evidence_kind
        self.has_principal_element_witnesses = False
        relation_witnesses = []
        for index in range(len(self.generators)):
            generator = self.generators[index]
            invariant = self.invariants[index]
            relation_witnesses.append(
                {
                    "generator_index": index,
                    "exponent": invariant,
                    "principal_result": generator**invariant,
                }
            )
        self.relation_witnesses = tuple(relation_witnesses)

    def verify(self, max_elements: int = 100_000) -> bool:
        expected = 1
        for invariant in self.invariants:
            if invariant < 2:
                return False
            expected *= invariant
        if expected != self.enumerated_order:
            if not (expected == 1 and self.enumerated_order == 1):
                return False
        if self.enumerated_order > max_elements:
            raise ValueError("certificate replay exceeds max_elements")
        if self.group.order() != self.enumerated_order:
            return False
        if len(self.generators) != len(self.invariants):
            return False
        for index in range(len(self.generators)):
            generator = self.generators[index]
            invariant = self.invariants[index]
            if generator**invariant != self.group.one():
                return False
            if generator.order() != invariant:
                return False
        for witness in self.relation_witnesses:
            index = witness["generator_index"]
            exponent = witness["exponent"]
            if self.generators[index] ** exponent != witness["principal_result"]:
                return False
            if witness["principal_result"] != self.group.one():
                return False
        if self.enumerated_order == 1:
            return len(list(self.group.list())) == 1
        generated = [self.group.one()]
        for index in range(len(self.generators)):
            generator = self.generators[index]
            invariant = self.invariants[index]
            enlarged = []
            for known in generated:
                power = self.group.one()
                for _exponent in range(invariant):
                    candidate = known * power
                    if not any(candidate == value for value in enlarged):
                        enlarged.append(candidate)
                    power *= generator
            generated = enlarged
        return len(generated) == self.enumerated_order


class ClassGroupSearchResult:
    """A class-group computation or an honest bounded incomplete result."""

    def __init__(
        self,
        field: Any,
        complete: bool,
        reason: str,
        minkowski_bound: int,
        group: Any = None,
        certificate: ClassGroupCertificate | None = None,
    ) -> None:
        self.field = field
        self.complete = complete
        self.reason = reason
        self.minkowski_bound = minkowski_bound
        self.group = group
        self.certificate = certificate
        self.proof_status = (
            "exact-" + certificate.evidence_kind
            if complete and certificate is not None
            else "incomplete"
        )
        self.has_principal_element_witnesses = (
            certificate is not None and certificate.has_principal_element_witnesses
        )
        if complete and (group is None or certificate is None):
            raise ValueError("a complete class group needs a group and certificate")

    def order(self) -> int:
        if not self.complete or self.group is None:
            raise ValueError("an incomplete class-group search has no certified order")
        return int(self.group.order())

    def invariants(self) -> tuple[int, ...]:
        if not self.complete or self.certificate is None:
            raise ValueError("an incomplete class-group search has no invariants")
        return self.certificate.invariants

    def __repr__(self) -> str:
        if self.complete:
            return "Certified class group of order " + str(self.order())
        return "Incomplete class-group search (" + self.reason + ")"


class AnalyticClassNumberFormulaReport:
    """Independent numerical comparison of the residue formula's two sides."""

    def __init__(
        self,
        *,
        signature: tuple[int, int],
        discriminant: int,
        class_number: int | None,
        regulator: float | None,
        roots_of_unity: int | None,
        analytic_residue: Any,
        algebraic_residue: float | None,
        precision: int,
        inputs_complete: bool,
        difference: float | None,
        compatible: bool | None,
    ) -> None:
        self.signature = signature
        self.discriminant = discriminant
        self.class_number = class_number
        self.regulator = regulator
        self.roots_of_unity = roots_of_unity
        self.analytic_residue = analytic_residue
        self.algebraic_residue = algebraic_residue
        self.requested_precision = precision
        self.effective_precision_bits = min(53, precision)
        self.precision = self.effective_precision_bits
        self.inputs_complete = inputs_complete
        self.difference = difference
        self.compatible = compatible
        self.status = "numerical-approximation"
        self.proof_status = (
            "exact-algebraic-inputs-numerical-cross-check"
            if inputs_complete
            else "incomplete-algebraic-inputs"
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.number-fields/analytic-class-number-formula-v1",
            "signature": list(self.signature),
            "discriminant": self.discriminant,
            "class_number": self.class_number,
            "regulator": self.regulator,
            "roots_of_unity": self.roots_of_unity,
            "analytic_residue": str(self.analytic_residue),
            "algebraic_residue": self.algebraic_residue,
            "precision": self.precision,
            "requested_precision": self.requested_precision,
            "effective_precision_bits": self.effective_precision_bits,
            "inputs_complete": self.inputs_complete,
            "difference": self.difference,
            "compatible": self.compatible,
            "status": self.status,
            "proof_status": self.proof_status,
        }

    def __repr__(self) -> str:
        return (
            "Analytic class-number formula report ("
            + self.proof_status
            + ", compatible="
            + str(self.compatible)
            + ")"
        )


def _complex_midpoint(value: Any) -> complex:
    try:
        return complex(value)
    except (TypeError, ValueError):
        real_part = (
            value.real() if callable(getattr(value, "real", None)) else value.real
        )
        imag_part = (
            value.imag() if callable(getattr(value, "imag", None)) else value.imag
        )
        return complex(float(real_part), float(imag_part))


def bounded_class_group(
    field: Any,
    max_elements: int = 100_000,
) -> ClassGroupSearchResult:
    """Compute a certified class group where a bounded exact path exists."""
    if max_elements < 1:
        raise ValueError("max_elements must be positive")
    bound = certified_minkowski_class_bound(field)
    signature = exact_signature(field)
    if field.degree() == 1:
        group = _TrivialClassGroup()
        certificate = ClassGroupCertificate(
            group,
            [],
            [],
            1,
            "every degree-one number field is QQ and has trivial ideal class group",
            "degree-one-PID-theorem",
        )
        if not certificate.verify(max_elements):
            raise ArithmeticError("degree-one class-group replay failed")
        return ClassGroupSearchResult(
            field,
            True,
            certificate.source,
            bound,
            group,
            certificate,
        )
    if field.degree() == 2 and signature == (0, 1):
        group = field.class_group()
        order = int(group.order())
        if order > max_elements:
            raise ValueError(
                "imaginary-quadratic class group has "
                + str(order)
                + " elements, exceeding max_elements="
                + str(max_elements)
            )
        invariants = [int(value) for value in group.invariants()]
        generators = list(group.gens())
        certificate = ClassGroupCertificate(
            group,
            invariants,
            generators,
            order,
            "complete enumeration of reduced primitive positive binary quadratic forms",
        )
        if not certificate.verify(max_elements):
            raise ArithmeticError("imaginary-quadratic class-group replay failed")
        return ClassGroupSearchResult(
            field,
            True,
            certificate.source,
            bound,
            group,
            certificate,
        )
    return ClassGroupSearchResult(
        field,
        False,
        "certified prime-ideal relations and principal witnesses are not available",
        bound,
    )


def analytic_class_number_formula_report(
    field: Any,
    analytic_residue: Any,
    units: UnitSubgroupResult,
    class_group: ClassGroupSearchResult,
    prec: int = 100,
) -> AnalyticClassNumberFormulaReport:
    """Compare an independently supplied zeta residue with algebraic data."""
    if prec < 2:
        raise ValueError("precision must be at least 2")
    signature = exact_signature(field)
    discriminant = int(field.discriminant())
    units_verified = (
        units.torsion.verify()
        and len(units.generators) == units.unit_rank
        and len(units.certificates) == units.unit_rank
        and all(certificate.verify(field) for certificate in units.certificates)
        and units.verify_completion()
    )
    class_group_verified = (
        class_group.certificate is not None
        and class_group.certificate.verify(
            max_elements=class_group.certificate.enumerated_order
        )
    )
    inputs_complete = (
        units.complete
        and units.torsion.complete
        and class_group.complete
        and units.field is field
        and class_group.field is field
        and units_verified
        and class_group_verified
    )
    if not inputs_complete:
        return AnalyticClassNumberFormulaReport(
            signature=signature,
            discriminant=discriminant,
            class_number=None,
            regulator=None,
            roots_of_unity=None,
            analytic_residue=analytic_residue,
            algebraic_residue=None,
            precision=prec,
            inputs_complete=False,
            difference=None,
            compatible=None,
        )
    r1, r2 = signature
    class_number = class_group.order()
    regulator = units.regulator(prec).value
    torsion_order = units.torsion.order
    algebraic_residue = (
        (2**r1)
        * ((2 * runtime.math.PI) ** r2)
        * class_number
        * regulator
        / (torsion_order * runtime.math.sqrt(abs(discriminant)))
    )
    analytic_value = _complex_midpoint(analytic_residue)
    difference = abs(analytic_value - algebraic_residue)
    # This is only a midpoint stability check: neither input is promoted to a
    # rigorous enclosure by this tolerance.
    effective_precision = min(53, prec)
    tolerance = max(1.0, abs(algebraic_residue)) * (
        2.0 ** (-min(40, effective_precision // 2))
    )
    return AnalyticClassNumberFormulaReport(
        signature=signature,
        discriminant=discriminant,
        class_number=class_number,
        regulator=regulator,
        roots_of_unity=torsion_order,
        analytic_residue=analytic_residue,
        algebraic_residue=algebraic_residue,
        precision=prec,
        inputs_complete=True,
        difference=difference,
        compatible=difference <= tolerance,
    )


__all__ = [
    "AnalyticClassNumberFormulaReport",
    "ClassGroupCertificate",
    "ClassGroupSearchResult",
    "analytic_class_number_formula_report",
    "bounded_class_group",
]
