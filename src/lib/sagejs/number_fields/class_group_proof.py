"""Replayable completeness records for number-field class groups.

The arithmetic which discovers relations lives elsewhere.  This module keeps
the logical boundary small: exact relations may be complete either
unconditionally or under a named GRH theorem, while incomplete and heuristic
states can never be mistaken for a class-group proof.

The record verifiers deliberately use duck-typed contexts.  An unconditional
Minkowski replay context supplies `field_order_fingerprint`, `discriminant`,
`minkowski_bound` (an exact `(numerator, denominator)` pair),
`iter_minkowski_prime_ideals()`, and `ideal_fingerprint(ideal)`.  A context may
also implement `verify_saturation_record(record)` and
`verify_conditional_grh_record(record)`.  No context implementation is
imported here, so relation, matrix, and orchestration lanes can compose these
records without a dependency cycle.
"""

from __future__ import annotations

from typing import Any

EXACT_UNCONDITIONAL = "exact-unconditional"
EXACT_RELATIONS_CONDITIONAL_GRH = "exact-relations-conditional-grh"
INCOMPLETE_RESOURCE_LIMIT = "incomplete-resource-limit"
HEURISTIC_DIAGNOSTIC_ONLY = "heuristic-diagnostic-only"

PROOF_LABELS = (
    EXACT_UNCONDITIONAL,
    EXACT_RELATIONS_CONDITIONAL_GRH,
    INCOMPLETE_RESOURCE_LIMIT,
    HEURISTIC_DIAGNOSTIC_ONLY,
)
COMPLETE_PROOF_LABELS = (
    EXACT_UNCONDITIONAL,
    EXACT_RELATIONS_CONDITIONAL_GRH,
)

MINKOWSKI_SCHEMA = "sagejs.number-fields.class-group.minkowski-proof.v1"
GRH_SCHEMA = "sagejs.number-fields.class-group.grh-proof.v1"


def proof_label(value: Any) -> str:
    """Return and validate an immutable class/unit proof-state label."""
    if not isinstance(value, str):
        for attribute in ("label", "proof_status", "status"):
            candidate = getattr(value, attribute, None)
            if callable(candidate):
                candidate = candidate()
            if isinstance(candidate, str):
                value = candidate
                break
    if value not in PROOF_LABELS:
        raise ValueError("unknown class-group proof label " + str(value))
    return value


def _as_integer(value: Any, purpose: str) -> int:
    if isinstance(value, bool):
        raise TypeError(purpose + " must be an exact integer")
    try:
        answer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise TypeError(purpose + " must be an exact integer") from error
    if answer != value:
        raise TypeError(purpose + " must be an exact integer")
    return answer


def _exact_bound(value: Any) -> tuple[int, int]:
    if callable(value):
        value = value()
    if isinstance(value, (tuple, list)):
        if len(value) != 2:
            raise ValueError("an exact bound must have numerator and denominator")
        numerator = _as_integer(value[0], "Minkowski-bound numerator")
        denominator = _as_integer(value[1], "Minkowski-bound denominator")
    else:
        numerator_value = getattr(value, "_numerator", None)
        denominator_value = getattr(value, "_denominator", None)
        if numerator_value is not None and denominator_value is not None:
            numerator = _as_integer(numerator_value, "Minkowski-bound numerator")
            denominator = _as_integer(denominator_value, "Minkowski-bound denominator")
        else:
            numerator = _as_integer(value, "Minkowski bound")
            denominator = 1
    if numerator < 0 or denominator <= 0:
        raise ValueError("the exact Minkowski bound must be nonnegative")
    common = _integer_gcd(numerator, denominator)
    numerator //= common
    denominator //= common
    return (numerator, denominator)


def _integer_gcd(left: int, right: int) -> int:
    while right:
        left, right = right, left % right
    return left if left >= 0 else -left


def _ideal_norm_integer(ideal: Any) -> int:
    norm = ideal.norm()
    if hasattr(norm, "_denominator"):
        if int(norm._denominator) != 1:
            raise ArithmeticError("a proof-prime ideal has nonintegral norm")
        return int(norm._numerator)
    return _as_integer(norm, "proof-prime ideal norm")


class SaturationProofRecord:
    """Immutable summary of the exact class/unit saturation pass."""

    def __init__(
        self,
        class_primes: Any = (),
        unit_primes: Any = (),
        *,
        index_bound: Any = 1,
        complete: bool = True,
        evidence: Any = None,
    ) -> None:
        class_values = tuple(
            _as_integer(value, "class saturation prime") for value in class_primes
        )
        unit_values = tuple(
            _as_integer(value, "unit saturation prime") for value in unit_primes
        )
        if any(value < 2 for value in class_values + unit_values):
            raise ValueError("saturation primes must be at least two")
        if tuple(sorted(set(class_values))) != class_values:
            raise ValueError("class saturation primes must be unique and sorted")
        if tuple(sorted(set(unit_values))) != unit_values:
            raise ValueError("unit saturation primes must be unique and sorted")
        bound = _as_integer(index_bound, "saturation index bound")
        if bound < 1:
            raise ValueError("the saturation index bound must be positive")
        self._class_primes = class_values
        self._unit_primes = unit_values
        self._index_bound = bound
        self._complete = complete is True
        self._evidence = evidence

    @property
    def class_primes(self) -> tuple[int, ...]:
        return self._class_primes

    @property
    def unit_primes(self) -> tuple[int, ...]:
        return self._unit_primes

    @property
    def index_bound(self) -> int:
        return self._index_bound

    @property
    def complete(self) -> bool:
        return self._complete

    @property
    def evidence(self) -> Any:
        return self._evidence

    def to_dict(self) -> dict[str, Any]:
        return {
            "class_primes": list(self._class_primes),
            "unit_primes": list(self._unit_primes),
            "index_bound": self._index_bound,
            "complete": self._complete,
            "evidence": self._evidence,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> SaturationProofRecord:
        return cls(
            data.get("class_primes", ()),
            data.get("unit_primes", ()),
            index_bound=data.get("index_bound"),
            complete=data.get("complete") is True,
            evidence=data.get("evidence"),
        )

    def verify(self, context: Any = None) -> bool:
        if not self._complete or self._index_bound < 1:
            return False
        if context is None:
            return True
        checker = getattr(context, "verify_saturation_record", None)
        if callable(checker):
            return checker(self) is True
        expected = getattr(context, "saturation_record", None)
        if expected is None:
            return True
        if callable(expected):
            expected = expected()
        serializer = getattr(expected, "to_dict", None)
        if callable(serializer):
            expected = serializer()
        return expected == self.to_dict()


class ConditionalGRHProofRecord:
    """Exact-relation completeness conditional on one named GRH theorem."""

    def __init__(
        self,
        theorem: str,
        bound: Any,
        *,
        relation_count: Any,
        assumption: str,
        saturation: SaturationProofRecord,
        analytic_index_one: bool,
    ) -> None:
        if not isinstance(theorem, str) or theorem.strip() == "":
            raise ValueError("a conditional proof must name its factor-base theorem")
        exact_bound = _exact_bound(bound)
        if exact_bound[0] == 0:
            raise ValueError("a GRH factor-base bound must be positive")
        count = _as_integer(relation_count, "relation count")
        if count < 0:
            raise ValueError("relation count must be nonnegative")
        if not isinstance(assumption, str) or "GRH" not in assumption.upper():
            raise ValueError("a conditional proof must state its GRH assumption")
        if not isinstance(saturation, SaturationProofRecord):
            raise TypeError("a conditional proof needs a saturation record")
        self._theorem = theorem
        self._bound = exact_bound
        self._relation_count = count
        self._assumption = assumption
        self._saturation = saturation
        self._analytic_index_one = analytic_index_one is True

    @property
    def proof_status(self) -> str:
        return EXACT_RELATIONS_CONDITIONAL_GRH

    @property
    def theorem(self) -> str:
        return self._theorem

    @property
    def bound(self) -> tuple[int, int]:
        return self._bound

    @property
    def relation_count(self) -> int:
        return self._relation_count

    @property
    def assumption(self) -> str:
        return self._assumption

    @property
    def saturation(self) -> SaturationProofRecord:
        return self._saturation

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": GRH_SCHEMA,
            "proof_status": self.proof_status,
            "theorem": self._theorem,
            "bound": list(self._bound),
            "relation_count": self._relation_count,
            "assumption": self._assumption,
            "saturation": self._saturation.to_dict(),
            "analytic_index_one": self._analytic_index_one,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ConditionalGRHProofRecord:
        if data.get("schema") != GRH_SCHEMA:
            raise ValueError("unsupported conditional class-group proof schema")
        if data.get("proof_status") != EXACT_RELATIONS_CONDITIONAL_GRH:
            raise ValueError("a conditional class-group proof has the wrong label")
        theorem = data.get("theorem")
        assumption = data.get("assumption")
        if not isinstance(theorem, str) or not isinstance(assumption, str):
            raise ValueError("a conditional proof lost its theorem or assumption")
        return cls(
            theorem,
            data.get("bound"),
            relation_count=data.get("relation_count"),
            assumption=assumption,
            saturation=SaturationProofRecord.from_dict(data.get("saturation", {})),
            analytic_index_one=data.get("analytic_index_one") is True,
        )

    def verify(self, presentation: Any = None, context: Any = None) -> bool:
        if context is None:
            return False
        if not self._analytic_index_one or not self._saturation.verify(context):
            return False
        if presentation is not None:
            if proof_label(presentation.proof_status) != self.proof_status:
                return False
            if presentation.factor_base_theorem != self._theorem:
                return False
            if _exact_bound(presentation.factor_base_bound) != self._bound:
                return False
            relation_count = getattr(presentation, "relation_count", None)
            if callable(relation_count):
                relation_count = relation_count()
            if (
                relation_count is not None
                and _as_integer(relation_count, "presentation relation count")
                != self._relation_count
            ):
                return False
        checker = getattr(context, "verify_conditional_grh_record", None)
        return callable(checker) and checker(self) is True


class MinkowskiPrimeClassRecord:
    """One exact discrete log required by an unconditional proof pass."""

    def __init__(
        self,
        ideal: Any,
        fingerprint: Any,
        norm: Any,
        coordinates: Any,
        principal_witness: Any,
    ) -> None:
        norm_value = _as_integer(norm, "proof-prime norm")
        if norm_value < 2:
            raise ValueError("a proof-prime norm must be at least two")
        self._ideal = ideal
        self._fingerprint = fingerprint
        self._norm = norm_value
        self._coordinates = tuple(
            _as_integer(value, "ideal-class coordinate") for value in coordinates
        )
        self._principal_witness = principal_witness

    @property
    def ideal(self) -> Any:
        return self._ideal

    @property
    def fingerprint(self) -> Any:
        return self._fingerprint

    @property
    def norm(self) -> int:
        return self._norm

    @property
    def coordinates(self) -> tuple[int, ...]:
        return self._coordinates

    @property
    def principal_witness(self) -> Any:
        return self._principal_witness

    def verify(self, presentation: Any, context: Any) -> bool:
        if _ideal_norm_integer(self._ideal) != self._norm:
            return False
        if context.ideal_fingerprint(self._ideal) != self._fingerprint:
            return False
        element = presentation.from_coordinates(self._coordinates)
        if presentation(self._ideal) != element:
            return False
        representative = element.ideal()
        quotient = presentation.ideal_quotient(self._ideal, representative)
        witness_ideal = getattr(self._principal_witness, "ideal", None)
        if callable(witness_ideal):
            witness_ideal = witness_ideal()
        if witness_ideal != quotient:
            return False
        return self._principal_witness.verify(presentation.ideal_order()) is True

    def to_dict(self, encode_ideal: Any, encode_witness: Any) -> dict[str, Any]:
        return {
            "ideal": encode_ideal(self._ideal),
            "fingerprint": self._fingerprint,
            "norm": self._norm,
            "coordinates": list(self._coordinates),
            "principal_witness": encode_witness(self._principal_witness),
        }

    @classmethod
    def from_dict(
        cls,
        data: dict[str, Any],
        decode_ideal: Any,
        decode_witness: Any,
    ) -> MinkowskiPrimeClassRecord:
        ideal = decode_ideal(data.get("ideal"))
        return cls(
            ideal,
            data.get("fingerprint"),
            data.get("norm"),
            data.get("coordinates", ()),
            decode_witness(data.get("principal_witness"), ideal),
        )


class UnconditionalMinkowskiProofRecord:
    """Replay record for all prime ideals through an exact Minkowski bound."""

    def __init__(
        self,
        *,
        field_order_fingerprint: Any,
        discriminant: Any,
        bound: Any,
        prime_records: Any,
        saturation: SaturationProofRecord,
        theorem: str = "Minkowski ideal-class theorem",
    ) -> None:
        discriminant_value = _as_integer(discriminant, "field discriminant")
        if discriminant_value == 0:
            raise ValueError("a number-field discriminant is nonzero")
        if not isinstance(theorem, str) or "Minkowski" not in theorem:
            raise ValueError("an unconditional proof must name Minkowski's theorem")
        if not isinstance(saturation, SaturationProofRecord):
            raise TypeError("an unconditional proof needs a saturation record")
        records = tuple(prime_records)
        self._field_order_fingerprint = field_order_fingerprint
        self._discriminant = discriminant_value
        self._bound = _exact_bound(bound)
        self._prime_records = records
        self._saturation = saturation
        self._theorem = theorem

    @property
    def proof_status(self) -> str:
        return EXACT_UNCONDITIONAL

    @property
    def field_order_fingerprint(self) -> Any:
        return self._field_order_fingerprint

    @property
    def discriminant(self) -> int:
        return self._discriminant

    @property
    def bound(self) -> tuple[int, int]:
        return self._bound

    @property
    def prime_records(self) -> tuple[Any, ...]:
        return self._prime_records

    @property
    def saturation(self) -> SaturationProofRecord:
        return self._saturation

    def to_dict(self, encode_prime: Any) -> dict[str, Any]:
        return {
            "schema": MINKOWSKI_SCHEMA,
            "proof_status": self.proof_status,
            "theorem": self._theorem,
            "field_order_fingerprint": self._field_order_fingerprint,
            "discriminant": self._discriminant,
            "bound": list(self._bound),
            "prime_records": [encode_prime(record) for record in self._prime_records],
            "saturation": self._saturation.to_dict(),
        }

    @classmethod
    def from_dict(
        cls,
        data: dict[str, Any],
        decode_prime: Any,
    ) -> UnconditionalMinkowskiProofRecord:
        if data.get("schema") != MINKOWSKI_SCHEMA:
            raise ValueError("unsupported unconditional class-group proof schema")
        if data.get("proof_status") != EXACT_UNCONDITIONAL:
            raise ValueError("an unconditional class-group proof has the wrong label")
        theorem = data.get("theorem")
        if not isinstance(theorem, str):
            raise ValueError("an unconditional proof lost its theorem")
        return cls(
            field_order_fingerprint=data.get("field_order_fingerprint"),
            discriminant=data.get("discriminant"),
            bound=data.get("bound"),
            prime_records=[
                decode_prime(value) for value in data.get("prime_records", ())
            ],
            saturation=SaturationProofRecord.from_dict(data.get("saturation", {})),
            theorem=theorem,
        )

    def verify(self, presentation: Any, context: Any) -> bool:
        try:
            if proof_label(presentation.proof_status) != self.proof_status:
                return False
            theorem = getattr(presentation, "factor_base_theorem", None)
            if callable(theorem):
                theorem = theorem()
            if theorem is not None and theorem != self._theorem:
                return False
            fingerprint = context.field_order_fingerprint
            if callable(fingerprint):
                fingerprint = fingerprint()
            if fingerprint != self._field_order_fingerprint:
                return False
            discriminant = context.discriminant
            if callable(discriminant):
                discriminant = discriminant()
            if _as_integer(discriminant, "context discriminant") != self._discriminant:
                return False
            if _exact_bound(context.minkowski_bound) != self._bound:
                return False
            if not self._saturation.verify(context):
                return False
            expected_ideals = tuple(context.iter_minkowski_prime_ideals())
            expected = tuple(
                context.ideal_fingerprint(ideal) for ideal in expected_ideals
            )
            recorded = tuple(record.fingerprint for record in self._prime_records)
            unique = all(
                not any(
                    recorded[index] == recorded[earlier] for earlier in range(index)
                )
                for index in range(len(recorded))
            )
            if expected != recorded or not unique:
                return False
            for record in self._prime_records:
                if not isinstance(record, MinkowskiPrimeClassRecord):
                    return False
                if record.norm * self._bound[1] > self._bound[0]:
                    return False
                if not record.verify(presentation, context):
                    return False
            return True
        except (AttributeError, TypeError, ValueError, ArithmeticError, IndexError):
            return False


__all__ = [
    "COMPLETE_PROOF_LABELS",
    "ConditionalGRHProofRecord",
    "EXACT_RELATIONS_CONDITIONAL_GRH",
    "EXACT_UNCONDITIONAL",
    "GRH_SCHEMA",
    "HEURISTIC_DIAGNOSTIC_ONLY",
    "INCOMPLETE_RESOURCE_LIMIT",
    "MINKOWSKI_SCHEMA",
    "MinkowskiPrimeClassRecord",
    "PROOF_LABELS",
    "SaturationProofRecord",
    "UnconditionalMinkowskiProofRecord",
    "proof_label",
]
