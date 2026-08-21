"""Deterministic orchestration for general class and unit groups.

The producers used here live in separate lazy modules.  This module owns the
policy joining them: factor-base selection, adaptive exact relation search,
Smith presentation extraction, unit recovery, analytic index validation, and
the unconditional Minkowski upgrade.  Optional producers are imported only
when a general computation reaches their stage.  This keeps the module usable
while the independently claimable producers are integrated, and makes every
fallback fail with an honest incomplete result instead of blessing a guess.

The algorithm follows Hecke's class/unit context and adaptive relation loop in
`NumFieldOrd/NfOrd/Clgp.jl` and `Clgp/Main_LLL.jl`.  PARI's `buch2.c` informed
the retry policy and the separation between exact relation work and analytic
index validation.  Neither system is a runtime dependency.
"""

from __future__ import annotations

import hashlib
import json
import time
from typing import Any, Callable, Iterable, Sequence

EXACT_UNCONDITIONAL = "exact-unconditional"
EXACT_RELATIONS_CONDITIONAL_GRH = "exact-relations-conditional-grh"
INCOMPLETE_RESOURCE_LIMIT = "incomplete-resource-limit"


def _optional_module(name: str) -> Any:
    try:
        return __import__(name, fromlist=[name.rsplit(".", 1)[-1]])
    except ImportError:
        return None


def _integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise TypeError(name + " must be an integer")
    answer = int(value)
    if answer != value:
        raise TypeError(name + " must be an integer")
    return answer


def _positive(value: Any, name: str) -> int:
    answer = _integer(value, name)
    if answer < 1:
        raise ValueError(name + " must be positive")
    return answer


def _product(values: Iterable[int]) -> int:
    answer = 1
    for value in values:
        answer *= int(value)
    return answer


def _prime_divisors(value: int) -> tuple[int, ...]:
    """Return the distinct prime divisors of a positive exact bound."""
    remaining = abs(int(value))
    answer = []
    divisor = 2
    while divisor * divisor <= remaining:
        if remaining % divisor == 0:
            answer.append(divisor)
            while remaining % divisor == 0:
                remaining //= divisor
        divisor = 3 if divisor == 2 else divisor + 2
    if remaining > 1:
        answer.append(remaining)
    return tuple(answer)


def _component_payload(value: Any) -> Any:
    """Project a duck-typed proof component to canonical JSON-safe data."""
    if value is None or isinstance(value, (bool, int, str)):
        return value
    if isinstance(value, (list, tuple)):
        return [_component_payload(item) for item in value]
    if isinstance(value, dict):
        return {
            str(key): _component_payload(value[key]) for key in sorted(value, key=str)
        }
    encode = getattr(value, "to_dict", None)
    if callable(encode):
        return _component_payload(encode())
    raise TypeError("a class/unit proof component is not canonically serializable")


def _content_hash(payload: dict[str, Any]) -> str:
    encoded = json.dumps(
        _component_payload(payload), sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _value(owner: Any, names: Sequence[str], default: Any = None) -> Any:
    for name in names:
        if hasattr(owner, name):
            answer = getattr(owner, name)
            return answer() if callable(answer) else answer
    return default


def _ideal_power(ideal: Any, exponent: int) -> Any:
    return ideal**exponent


def _is_cancellation(error: BaseException) -> bool:
    return str(error) == "class/unit computation cancelled" or (
        type(error).__name__ == "ClassUnitCancellationError"
    )


class ClassUnitEngineLimits:
    """Portable resource policy for one adaptive computation."""

    def __init__(
        self,
        *,
        max_factor_base_bound: int = 100_000,
        max_factor_base_size: int = 4_096,
        max_relation_attempts: int = 512,
        max_relations: int = 2_048,
        max_candidates_per_ideal: int = 64,
        max_random_terms: int = 5,
        max_coefficient_bound: int = 3,
        max_partial_relations: int = 512,
        large_prime_bound_multiplier: int = 20,
        exact_presentation_batch_size: int = 4,
        max_saturation_rounds: int = 3,
        saturation_relation_batch: int = 4,
        max_saturation_target_classes: int = 10_000,
        max_saturation_work: int = 1_000_000,
        proof_partition_count: int = 1,
        precision_bits: int = 128,
        max_precision_bits: int = 1_024,
        max_analytic_prime_bound: int = 1_000_000,
        max_memory_bytes: int = 512 * 1024 * 1024,
    ) -> None:
        self.max_factor_base_bound = _positive(
            max_factor_base_bound, "max_factor_base_bound"
        )
        self.max_factor_base_size = _positive(
            max_factor_base_size, "max_factor_base_size"
        )
        self.max_relation_attempts = _positive(
            max_relation_attempts, "max_relation_attempts"
        )
        self.max_relations = _positive(max_relations, "max_relations")
        self.max_candidates_per_ideal = _positive(
            max_candidates_per_ideal, "max_candidates_per_ideal"
        )
        self.max_random_terms = _positive(max_random_terms, "max_random_terms")
        self.max_coefficient_bound = _positive(
            max_coefficient_bound, "max_coefficient_bound"
        )
        self.max_partial_relations = _positive(
            max_partial_relations, "max_partial_relations"
        )
        self.large_prime_bound_multiplier = _positive(
            large_prime_bound_multiplier, "large_prime_bound_multiplier"
        )
        self.exact_presentation_batch_size = _positive(
            exact_presentation_batch_size, "exact_presentation_batch_size"
        )
        self.max_saturation_rounds = _positive(
            max_saturation_rounds, "max_saturation_rounds"
        )
        self.saturation_relation_batch = _positive(
            saturation_relation_batch, "saturation_relation_batch"
        )
        self.max_saturation_target_classes = _positive(
            max_saturation_target_classes, "max_saturation_target_classes"
        )
        self.max_saturation_work = _positive(max_saturation_work, "max_saturation_work")
        self.proof_partition_count = _positive(
            proof_partition_count, "proof_partition_count"
        )
        self.precision_bits = _positive(precision_bits, "precision_bits")
        self.max_precision_bits = _positive(max_precision_bits, "max_precision_bits")
        if self.precision_bits > self.max_precision_bits:
            raise ValueError("precision_bits cannot exceed max_precision_bits")
        self.max_analytic_prime_bound = _positive(
            max_analytic_prime_bound, "max_analytic_prime_bound"
        )
        self.max_memory_bytes = _positive(max_memory_bytes, "max_memory_bytes")

    def to_dict(self) -> dict[str, int]:
        return {
            name: int(getattr(self, name))
            for name in (
                "max_factor_base_bound",
                "max_factor_base_size",
                "max_relation_attempts",
                "max_relations",
                "max_candidates_per_ideal",
                "max_random_terms",
                "max_coefficient_bound",
                "max_partial_relations",
                "large_prime_bound_multiplier",
                "exact_presentation_batch_size",
                "max_saturation_rounds",
                "saturation_relation_batch",
                "max_saturation_target_classes",
                "max_saturation_work",
                "proof_partition_count",
                "precision_bits",
                "max_precision_bits",
                "max_analytic_prime_bound",
                "max_memory_bytes",
            )
        }


class ClassUnitStage:
    """One deterministic stage transition and its compact diagnostics."""

    def __init__(self, name: str, state: str, details: dict[str, Any]) -> None:
        self.name = name
        self.state = state
        self.details = dict(details)

    def to_dict(self) -> dict[str, Any]:
        return {"name": self.name, "state": self.state, "details": self.details}


class ClassUnitSaturationRecord:
    """Authenticated record of bounded saturation and final `h*R` replay.

    A producer artifact is trusted only after its exact `verify(field, order,
    original_units)` method succeeds.  Independent of those artifacts, a
    complete record requires the final rigorous analytic interval to isolate
    the combined class/unit index at one.  This lets additional exact
    relations discharge an earlier index bound without pretending that a
    bounded negative unit search proved `p`-maximality.
    """

    def __init__(
        self,
        field: Any,
        order: Any,
        original_units: Sequence[Any],
        units: Sequence[Any],
        *,
        index_bound: int,
        required_primes: Sequence[int],
        remaining_index_bound: int,
        attempts: Sequence[Any],
        analytic_validation: dict[str, Any],
        producer_artifacts: Sequence[tuple[Any, Sequence[Any], Any, Any]] = (),
        analytic_module: Any = None,
        reason: str = "",
    ) -> None:
        self.original_units = tuple(original_units)
        self.units = tuple(units)
        self.index_bound = max(1, int(index_bound))
        self.required_primes = tuple(sorted({int(value) for value in required_primes}))
        self.remaining_index_bound = max(1, int(remaining_index_bound))
        self.attempts = tuple(_component_payload(value) for value in attempts)
        self.analytic_validation = _component_payload(analytic_validation)
        self._producer_artifacts = tuple(
            (artifact, tuple(before), torsion, generation_verifier)
            for artifact, before, torsion, generation_verifier in producer_artifacts
        )
        self._analytic_module = analytic_module
        self.rigorous = bool(self.analytic_validation.get("rigorous"))
        self.complete = bool(
            self.rigorous
            and int(self.analytic_validation.get("lower_index", 0)) == 1
            and int(self.analytic_validation.get("upper_index", 0)) == 1
            and self.remaining_index_bound == 1
        )
        self.saturated = self.complete
        self.reason = str(reason)
        self._field = field
        self._order = order
        body = self._body_dict()
        self.content_sha256 = _content_hash(body)

    def _unit_payload(self, unit: Any) -> Any:
        encode = getattr(unit, "to_dict", None)
        if callable(encode):
            return _component_payload(encode())
        evaluate = getattr(unit, "evaluate", None)
        value: Any = evaluate() if callable(evaluate) else unit
        coordinates = list(value.list())
        return [
            [int(coordinate._numerator), int(coordinate._denominator)]
            for coordinate in coordinates
        ]

    def _body_dict(self) -> dict[str, Any]:
        return {
            "schema": "sagejs.number-fields/class-unit-saturation-v1",
            "index_bound": self.index_bound,
            "required_primes": list(self.required_primes),
            "remaining_index_bound": self.remaining_index_bound,
            "attempts": list(self.attempts),
            "analytic_validation": self.analytic_validation,
            "original_units": [
                self._unit_payload(unit) for unit in self.original_units
            ],
            "units": [self._unit_payload(unit) for unit in self.units],
            "rigorous": self.rigorous,
            "complete": self.complete,
            "saturated": self.saturated,
            "reason": self.reason,
        }

    def to_dict(self) -> dict[str, Any]:
        payload = self._body_dict()
        payload["content_sha256"] = self.content_sha256
        return payload

    def verify(
        self,
        field: Any = None,
        order: Any = None,
        original_units: Sequence[Any] | None = None,
    ) -> bool:
        selected_field = self._field if field is None else field
        selected_order = self._order if order is None else order
        if selected_field is not self._field or selected_order is not self._order:
            return False
        if original_units is not None and tuple(original_units) != self.original_units:
            return False
        if _content_hash(self._body_dict()) != self.content_sha256:
            return False
        one = selected_order.ideal(1)
        try:
            if any(unit.principal_ideal(selected_order) != one for unit in self.units):
                return False
            for (
                artifact,
                before,
                torsion,
                generation_verifier,
            ) in self._producer_artifacts:
                verifier = getattr(
                    self._analytic_module, "verify_saturation_record", None
                )
                if callable(verifier):
                    torsion_elements = tuple(_value(torsion, ("elements",), ()))
                    try:
                        accepted = verifier(
                            selected_field,
                            selected_order,
                            before,
                            artifact.to_dict(),
                            torsion_elements=torsion_elements,
                            generation_verifier=generation_verifier,
                        )
                    except TypeError:
                        accepted = verifier(
                            selected_field,
                            selected_order,
                            before,
                            artifact.to_dict(),
                            torsion_elements=torsion_elements,
                        )
                    if not bool(accepted):
                        return False
                    continue
                replay = getattr(artifact, "verify", None)
                if not callable(replay):
                    return False
                try:
                    accepted = replay()
                except TypeError:
                    accepted = replay(selected_field, selected_order, before)
                if not bool(accepted):
                    return False
        except (AttributeError, TypeError, ValueError, ArithmeticError):
            return False
        return self.complete


class UnitGroupComputation:
    """Exact unit generators plus explicit completeness and regulator state."""

    def __init__(
        self,
        torsion: Any,
        generators: Iterable[Any],
        unit_rank: int,
        *,
        complete: bool,
        regulator: Any = None,
        reason: str = "",
        proof_status: str | None = None,
    ) -> None:
        self.torsion = torsion
        self.generators = tuple(generators)
        self.unit_rank = int(unit_rank)
        self.complete = bool(complete)
        self.regulator_enclosure = regulator
        self.reason = reason
        self.proof_status = (
            (EXACT_UNCONDITIONAL if proof_status is None else proof_status)
            if self.complete
            else INCOMPLETE_RESOURCE_LIMIT
        )

    def gens(self) -> tuple[Any, ...]:
        return self.generators


class _EngineClassElement:
    def __init__(self, parent: Any, coordinates: Iterable[int]) -> None:
        self._parent = parent
        values = tuple(int(value) for value in coordinates)
        if len(values) != len(parent._invariants):
            raise ValueError("ideal-class coordinates have the wrong length")
        normalized = []
        for index in range(len(values)):
            normalized.append(values[index] % parent._invariants[index])
        self._coordinates = tuple(normalized)

    def parent(self) -> Any:
        return self._parent

    def coordinates(self) -> tuple[int, ...]:
        return self._coordinates

    def ideal(self) -> Any:
        return self._parent.representative_ideal(self._coordinates)

    def order(self) -> int:
        answer = 1
        for coordinate, modulus in zip(
            self._coordinates, self._parent._invariants, strict=False
        ):
            if coordinate:
                common = _gcd(coordinate, modulus)
                answer = _lcm(answer, modulus // common)
        return answer

    def is_one(self) -> bool:
        return not any(self._coordinates)

    def __mul__(self, other: Any) -> Any:
        if (
            not isinstance(other, _EngineClassElement)
            or other._parent is not self._parent
        ):
            return NotImplemented
        return _EngineClassElement(
            self._parent,
            [
                left + right
                for left, right in zip(
                    self._coordinates, other._coordinates, strict=False
                )
            ],
        )

    def __pow__(self, exponent: Any) -> Any:
        power = _integer(exponent, "class-group exponent")
        return _EngineClassElement(
            self._parent, [power * value for value in self._coordinates]
        )

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, _EngineClassElement)
            and other._parent is self._parent
            and other._coordinates == self._coordinates
        )

    def __repr__(self) -> str:
        return "Ideal class with coordinates " + str(self._coordinates)


def _gcd(left: int, right: int) -> int:
    a, b = abs(int(left)), abs(int(right))
    while b:
        a, b = b, a % b
    return a


def _lcm(left: int, right: int) -> int:
    return abs(left // _gcd(left, right) * right) if left and right else 0


class _EngineClassGroup:
    """Small exact ideal-class map backed by an authenticated SNF presentation."""

    Element = _EngineClassElement

    def __init__(
        self,
        order: Any,
        invariants: Iterable[int],
        generator_ideals: Iterable[Any],
        generator_rows: Iterable[Iterable[int]],
        presentation: Any,
        factor_base: Iterable[Any],
        relation_records: Iterable[Any],
        combine_relations: Callable[[Sequence[int]], Any],
        factor_over_base: Callable[[Any, Iterable[Any]], Sequence[int]],
        reduce_over_base: Callable[[Any, Iterable[Any]], Any],
        combine_reduction_witness: Callable[[Any, Any], Any],
        proof_status: str,
        theorem: str,
    ) -> None:
        self._order = order
        self._invariants = tuple(int(value) for value in invariants)
        self._generator_ideals = tuple(generator_ideals)
        checked_generator_rows = []
        for row in generator_rows:
            checked_generator_rows.append(tuple(int(value) for value in row))
        self._generator_rows = tuple(checked_generator_rows)
        self._presentation = presentation
        self._factor_base = tuple(factor_base)
        self._relations = tuple(relation_records)
        self._combine_relations = combine_relations
        self._factor_over_base = factor_over_base
        self._reduce_over_base = reduce_over_base
        self._combine_reduction_witness = combine_reduction_witness
        self.proof_status = proof_status
        self.factor_base_theorem = theorem
        self._gens = tuple(
            _EngineClassElement(
                self,
                [
                    1 if index == position else 0
                    for index in range(len(self._invariants))
                ],
            )
            for position in range(len(self._invariants))
        )

    def invariants(self) -> tuple[int, ...]:
        return self._invariants

    def order(self) -> int:
        return _product(self._invariants)

    cardinality = order

    def one(self) -> _EngineClassElement:
        return _EngineClassElement(self, [0] * len(self._invariants))

    def gen(self, index: int = 0) -> _EngineClassElement:
        return self._gens[index]

    def gens(self) -> tuple[_EngineClassElement, ...]:
        return self._gens

    def gens_ideals(self) -> tuple[Any, ...]:
        return self._generator_ideals

    def representative_ideal(self, coordinates: Iterable[int]) -> Any:
        element = _EngineClassElement(self, coordinates)
        answer = self._order.ideal(1)
        for coordinate, ideal in zip(
            element.coordinates(), self._generator_ideals, strict=False
        ):
            if coordinate:
                answer *= _ideal_power(ideal, coordinate)
        return answer

    def _relation_coefficients(self, ambient: Sequence[int]) -> tuple[int, ...]:
        smith = tuple(self._presentation.smith_coordinates(ambient))
        coefficients = [0] * len(self._relations)
        for index in range(self._presentation.rank):
            diagonal = int(self._presentation.diagonal[index])
            if smith[index] % diagonal:
                raise ArithmeticError(
                    "an ideal quotient is not in the relation lattice"
                )
            multiple = smith[index] // diagonal
            transform = self._presentation.relation_combination(index)
            for position in range(len(coefficients)):
                coefficients[position] += multiple * int(transform[position])
        if any(smith[index] for index in range(self._presentation.rank, len(smith))):
            raise ArithmeticError("an ideal quotient has a nonzero free class")
        return tuple(coefficients)

    def discrete_log(self, ideal: Any) -> tuple[tuple[int, ...], Any]:
        reduction_witness = None
        try:
            row = tuple(
                int(value) for value in self._factor_over_base(ideal, self._factor_base)
            )
        except ArithmeticError:
            quotient_row, reduction_witness = self._reduce_over_base(
                ideal, self._factor_base
            )
            row = tuple(-int(value) for value in quotient_row)
        coordinates = tuple(self._presentation.class_coordinates(row))
        reduced = tuple(self._presentation.lift_class_coordinates(coordinates))
        delta_values = []
        for index in range(len(row)):
            delta_values.append(row[index] - reduced[index])
        delta = tuple(delta_values)
        witness = self._combine_relations(self._relation_coefficients(delta))
        if reduction_witness is not None:
            witness = self._combine_reduction_witness(witness, reduction_witness)
        return coordinates, witness

    def __call__(self, ideal: Any) -> _EngineClassElement:
        if isinstance(ideal, _EngineClassElement):
            if ideal.parent() is not self:
                raise TypeError("the ideal class belongs to another group")
            return ideal
        coordinates, _witness = self.discrete_log(ideal)
        return _EngineClassElement(self, coordinates)

    def is_principal(self, ideal: Any, proof: bool = True) -> bool:
        requested = True if proof is None else bool(proof)
        if requested and self.proof_status != EXACT_UNCONDITIONAL:
            raise ValueError(
                "proof=True requires an unconditionally complete class group"
            )
        return self(ideal).is_one()

    def verify(self) -> bool:
        if not self._presentation.verify():
            return False
        for generator in self._gens:
            if self(generator.ideal()) != generator:
                return False
            if not (generator ** generator.order()).is_one():
                return False
        return True


class ClassUnitComputation:
    """Terminal result; incomplete states never expose a proved class group."""

    def __init__(
        self,
        field: Any,
        *,
        proof_status: str,
        complete: bool,
        reason: str,
        algorithm: str,
        stages: Iterable[ClassUnitStage],
        class_group: Any = None,
        unit_group: Any = None,
        tentative_invariants: Iterable[int] = (),
        context: Any = None,
        diagnostics: dict[str, Any] | None = None,
        saturation_record: Any = None,
        proof_progress: Any = None,
        proof_dependency_hashes: dict[str, str] | None = None,
    ) -> None:
        self.field = field
        self.proof_status = proof_status
        self.complete = bool(complete)
        self.reason = reason
        self.algorithm = algorithm
        self.stages = tuple(stages)
        self._class_group = class_group
        self._unit_group = unit_group
        self.tentative_invariants = tuple(int(value) for value in tentative_invariants)
        self.context = context
        self.diagnostics = {} if diagnostics is None else dict(diagnostics)
        self.saturation_record = saturation_record
        self.saturation_original_units = tuple(
            _value(saturation_record, ("original_units",), ())
        )
        self.analytic_validation = _value(
            saturation_record, ("analytic_validation",), None
        )
        self.proof_progress = proof_progress
        self.proof_partitions = tuple(_value(proof_progress, ("partitions",), ()))
        self.proof_dependency_hashes = (
            {} if proof_dependency_hashes is None else dict(proof_dependency_hashes)
        )
        if self.complete and (class_group is None or unit_group is None):
            raise ValueError("a complete class/unit computation needs both groups")

    def class_group(self) -> Any:
        if not self.complete:
            raise ValueError(
                "an incomplete class/unit computation has no proved class group"
            )
        return self._class_group

    def class_number(self) -> int:
        return int(self.class_group().order())

    def unit_group(self) -> Any:
        if self._unit_group is None:
            raise ValueError("the computation did not produce a unit subgroup")
        return self._unit_group

    def units(self) -> tuple[Any, ...]:
        return tuple(_value(self.unit_group(), ("generators", "gens"), ()))

    def regulator(self) -> Any:
        unit_group = self.unit_group()
        value = _value(unit_group, ("regulator_enclosure",), None)
        if value is None:
            regulator = getattr(unit_group, "regulator", None)
            if callable(regulator):
                return regulator()
            raise ValueError("the unit computation has no regulator")
        return value

    def verify_saturation_record(self, payload: Any) -> bool:
        record = self.saturation_record
        if record is None:
            return False
        encode = getattr(record, "to_dict", None)
        replay = getattr(record, "verify", None)
        return bool(
            callable(encode)
            and callable(replay)
            and _component_payload(payload) == _component_payload(encode())
            and replay(
                self.field, self.field.maximal_order(), self.saturation_original_units
            )
        )

    def __repr__(self) -> str:
        if self.complete:
            return (
                "Class/unit computation with class number "
                + str(self.class_number())
                + " ("
                + self.proof_status
                + ")"
            )
        return "Incomplete class/unit computation (" + self.reason + ")"


class _Components:
    def __init__(self) -> None:
        self.context = _optional_module("sagejs.number_fields.class_unit_context")
        self.factored = _optional_module("sagejs.number_fields.factored_elements")
        self.factor_base = _optional_module(
            "sagejs.number_fields.class_group_factor_base"
        )
        self.relations = _optional_module("sagejs.number_fields.class_group_relations")
        self.matrix = _optional_module("sagejs.number_fields.class_group_matrix")
        self.analytic = _optional_module("sagejs.number_fields.class_unit_analytic")

    def missing(self) -> tuple[str, ...]:
        return tuple(
            name
            for name in (
                "factor_base",
                "relations",
                "matrix",
                "analytic",
            )
            if getattr(self, name) is None
        )


def _prime_ideal_key(prime_ideal: Any) -> tuple[Any, ...]:
    """Return a stable in-process identity for an exact prime ideal."""
    rows = []
    for row in prime_ideal.basis_matrix().rows():
        rows.append(
            tuple((int(value._numerator), int(value._denominator)) for value in row)
        )
    return (
        int(prime_ideal.rational_prime()),
        int(prime_ideal.ramification_index()),
        int(prime_ideal.residue_class_degree()),
        tuple(rows),
    )


def _portable_ideal_fingerprint(ideal: Any) -> dict[str, Any]:
    """Return the portable order/lattice identity used by public proof replay."""
    payload = ideal.to_dict()
    return {
        "field_order_fingerprint": payload["field_order_fingerprint"],
        "basis": payload["basis"],
    }


class _LargePrimePartial:
    def __init__(
        self,
        witness: Any,
        source_ideal: Any,
        source_row: Sequence[int],
        provenance: dict[str, Any],
    ) -> None:
        self.witness = witness
        self.source_ideal = source_ideal
        self.source_row = tuple(int(value) for value in source_row)
        self.provenance = dict(provenance)


class ClassUnitGroupEngine:
    """Adaptive Buchmann--Hecke driver with exact terminal-state checks."""

    def __init__(
        self,
        field: Any,
        *,
        proof: bool = True,
        algorithm: str = "auto",
        limits: ClassUnitEngineLimits | None = None,
        seed: int = 0,
        cancelled: Callable[[], bool] | None = None,
        progress: Callable[[dict[str, Any]], None] | None = None,
        checkpoint: Any = None,
        resume_from: Any = None,
        checkpoint_controller: Any = None,
        max_checkpoint_bytes: int | None = None,
        components: Any = None,
    ) -> None:
        if algorithm not in ("auto", "minkowski", "buchmann-hecke"):
            raise ValueError("unknown class/unit algorithm: " + str(algorithm))
        self.field = field
        self.order = field.maximal_order()
        if not self.order.is_maximal():
            raise ValueError("class/unit arithmetic requires a certified maximal order")
        self.proof = bool(proof)
        self.algorithm = algorithm
        self.limits = ClassUnitEngineLimits() if limits is None else limits
        if not isinstance(self.limits, ClassUnitEngineLimits):
            raise TypeError("limits must be ClassUnitEngineLimits")
        self.seed = _integer(seed, "deterministic seed")
        self.cancelled = (lambda: False) if cancelled is None else cancelled
        if not callable(self.cancelled):
            raise TypeError("cancelled must be callable")
        self.progress = progress
        if self.progress is not None and not callable(self.progress):
            raise TypeError("progress must be callable")
        self.components = _Components() if components is None else components
        self.checkpoint_controller = checkpoint_controller
        if self.checkpoint_controller is None and (
            checkpoint is not None or resume_from is not None
        ):
            context_module = self.components.context
            if context_module is None:
                raise ImportError("the class/unit checkpoint controller is unavailable")
            controller_type = getattr(context_module, "ClassUnitCheckpoint", None)
            if controller_type is None:
                raise ImportError("the class/unit checkpoint controller is unavailable")
            prime_module = _optional_module("sagejs.number_fields.prime_ideals")

            def decode_factor_base(payload: Any) -> Any:
                return prime_module.prime_ideal_from_dict(self.order, payload)

            def decode_search_state(payload: Any) -> Any:
                if payload is None:
                    return None
                return self.components.relations.RelationSearchState.from_dict(payload)

            def decode_matrix_state(payload: Any) -> Any:
                if payload is None:
                    return None
                return self.components.matrix.RelationPresentation.from_dict(payload)

            decoders = {
                "factor_base": decode_factor_base,
                "relations": self.components.relations.RelationRecord.from_dict,
                "search_state": decode_search_state,
                "matrix_state": decode_matrix_state,
            }
            proof_state = context_module.ClassUnitProofState.incomplete(
                "class/unit computation in progress",
                evidence={
                    "schema": "sagejs.number-fields/class-unit-request-policy-v1",
                    "requested_proof": self.proof,
                },
            )
            limit_values = self.limits.to_dict()
            standard_limit_names = {
                "max_factor_base_size",
                "max_relations",
                "max_partial_relations",
                "max_relation_attempts",
                "max_precision_bits",
                "max_memory_bytes",
            }
            extra_limits = {}
            for name in sorted(limit_values):
                if name not in standard_limit_names:
                    extra_limits[name] = limit_values[name]
            checkpoint_limits = context_module.ResourceLimits(
                max_factor_base_size=self.limits.max_factor_base_size,
                max_relations=self.limits.max_relations,
                max_partial_relations=self.limits.max_partial_relations,
                max_relation_attempts=self.limits.max_relation_attempts,
                max_proof_primes=self.limits.max_factor_base_size,
                max_precision_bits=self.limits.max_precision_bits,
                max_checkpoint_bytes=max_checkpoint_bytes,
                max_memory_bytes=self.limits.max_memory_bytes,
                extra=extra_limits,
            )
            self.checkpoint_controller = controller_type(
                self.field,
                self.order,
                proof_state,
                algorithm=self.algorithm,
                limits=checkpoint_limits,
                random_seed=self.seed,
                destination=checkpoint,
                resume_from=resume_from,
                progress=self.progress,
                cancelled=self.cancelled,
                component_decoders=decoders,
                max_checkpoint_bytes=max_checkpoint_bytes,
            )
        self.stages: list[ClassUnitStage] = []
        self._started_ns = time.perf_counter_ns()
        self._phase_timings: dict[str, float] = {}
        self._resource_usage: dict[str, Any] = {
            "relation_attempts": 0,
            "relation_candidates": 0,
            "ideals_tested": 0,
            "relations": 0,
            "partial_relations": 0,
            "partial_matches": 0,
            "partial_discards": 0,
            "unit_log_rank": 0,
            "unit_rank_target": 0,
            "presentation_extractions": 0,
            "saturation_rounds": 0,
            "proof_primes_completed": 0,
        }
        self._partials: dict[tuple[Any, ...], _LargePrimePartial] = {}
        self._relation_unit_log_rank = 0
        self._relation_search_state: Any = None
        self._relation_matrix_accumulator: Any = None
        self._relation_presentation_policy: Any = None
        self._relation_presentation_record_count = 0
        self._proof_progress: Any = None
        self._proof_dependency_hashes: dict[str, str] = {}
        self._saturation_record: Any = None

    def _stage(self, name: str, state: str, **details: Any) -> None:
        if name in self._phase_timings and "elapsed_seconds" not in details:
            details["elapsed_seconds"] = self._phase_timings[name]
        self.stages.append(ClassUnitStage(name, state, details))
        if self.checkpoint_controller is not None:
            try:
                self.checkpoint_controller.stage(name, state, details)
            except RuntimeError as error:
                if state != "incomplete" or not _is_cancellation(error):
                    raise
            self.checkpoint_controller.capture(
                {"diagnostics": self._diagnostics({"stage": name, "state": state})}
            )
            self.checkpoint_controller.save(force=False)
        self._emit_progress(
            "stage",
            stage=name,
            state=state,
            details=dict(details),
        )

    def _phase_start(self) -> int:
        return time.perf_counter_ns()

    def _phase_finish(self, name: str, started_ns: int) -> float:
        if name == "total" and name in self._phase_timings:
            return self._phase_timings[name]
        elapsed = (time.perf_counter_ns() - started_ns) / 1_000_000_000
        self._phase_timings[name] = self._phase_timings.get(name, 0.0) + elapsed
        return elapsed

    def _elapsed_seconds(self) -> float:
        return (time.perf_counter_ns() - self._started_ns) / 1_000_000_000

    def _emit_progress(self, event: str, **details: Any) -> None:
        if self.progress is None:
            return
        payload = {
            "event": event,
            "elapsed_seconds": self._elapsed_seconds(),
            "resources": dict(self._resource_usage),
        }
        payload.update(details)
        self.progress(payload)

    def _diagnostics(self, extra: dict[str, Any] | None = None) -> dict[str, Any]:
        answer = {
            "elapsed_seconds": self._elapsed_seconds(),
            "phase_timings": dict(self._phase_timings),
            "resources": dict(self._resource_usage),
            "limits": self.limits.to_dict(),
        }
        if extra:
            answer.update(extra)
        return answer

    def _check_cancelled(self) -> None:
        if self.checkpoint_controller is not None:
            stage = self.stages[-1].name if self.stages else "initialization"
            self.checkpoint_controller.check_cancelled(
                stage, dict(self._resource_usage)
            )
        if self.cancelled():
            self._emit_progress("cancelled")
            raise RuntimeError("class/unit computation cancelled")

    def _checkpoint_capture(self, payload: dict[str, Any]) -> None:
        if self.checkpoint_controller is not None:
            self.checkpoint_controller.capture(payload)

    def _checkpoint_save(self, *, force: bool = False) -> None:
        if self.checkpoint_controller is not None:
            self.checkpoint_controller.save(force=force)

    def _incomplete(
        self,
        reason: str,
        *,
        invariants: Iterable[int] = (),
        unit_group: Any = None,
        diagnostics: dict[str, Any] | None = None,
    ) -> ClassUnitComputation:
        self._phase_finish("total", self._started_ns)
        self._stage("terminal", "incomplete", reason=reason)
        self._checkpoint_capture({"diagnostics": self._diagnostics(diagnostics)})
        self._checkpoint_save(force=True)
        return ClassUnitComputation(
            self.field,
            proof_status=INCOMPLETE_RESOURCE_LIMIT,
            complete=False,
            reason=reason,
            algorithm=self.algorithm,
            stages=self.stages,
            unit_group=unit_group,
            tentative_invariants=invariants,
            diagnostics=self._diagnostics(diagnostics),
            saturation_record=self._saturation_record,
            proof_progress=self._proof_progress,
            proof_dependency_hashes=self._proof_dependency_hashes,
        )

    def _specialized(self) -> ClassUnitComputation | None:
        if self.algorithm != "auto" or self.field.degree() > 3:
            return None
        started = self._phase_start()
        classes_module = _optional_module("sagejs.number_fields.class_groups")
        units_module = _optional_module("sagejs.number_fields.units")
        if classes_module is None or units_module is None:
            return None
        try:
            classes = classes_module.bounded_class_group(self.field)
            units = units_module.bounded_unit_subgroup(self.field)
        except (TypeError, ValueError, ArithmeticError):
            return None
        if not classes.complete or not units.complete:
            return None
        self._phase_finish("specialized", started)
        self._stage(
            "specialized",
            "complete",
            class_number=int(classes.order()),
            unit_rank=int(units.unit_rank),
        )
        self._phase_finish("total", self._started_ns)
        self._stage("terminal", "complete", class_number=int(classes.order()))
        self._checkpoint_capture({"diagnostics": self._diagnostics()})
        self._checkpoint_save(force=True)
        return ClassUnitComputation(
            self.field,
            proof_status=EXACT_UNCONDITIONAL,
            complete=True,
            reason="bounded specialized exact algorithm",
            algorithm="specialized",
            stages=self.stages,
            class_group=classes.group,
            unit_group=units,
            tentative_invariants=classes.invariants(),
            diagnostics=self._diagnostics(),
        )

    def _factor_base(
        self, *, proof: bool, record_stage: bool = True
    ) -> tuple[Any, tuple[Any, ...]]:
        started = self._phase_start()
        module = self.components.factor_base
        plan = module.factor_base_plan(
            self.order,
            proof=proof,
            theorem=("minkowski" if proof else "auto"),
            max_bound=self.limits.max_factor_base_bound,
            max_prime_ideals=self.limits.max_factor_base_size,
            max_memory_bytes=self.limits.max_memory_bytes,
        )
        plan.require_feasible()
        records = module.build_factor_base(plan)
        primes = tuple(_value(record, ("prime_ideal", "ideal")) for record in records)
        if any(prime is None for prime in primes):
            raise TypeError("factor-base records do not expose exact prime ideals")
        if self.checkpoint_controller is not None:
            restored = tuple(self.checkpoint_controller.restore_factor_base())
            if restored:
                if len(restored) != len(primes) or any(
                    left != right for left, right in zip(restored, primes, strict=True)
                ):
                    raise ValueError(
                        "the checkpoint factor base differs from the deterministic plan"
                    )
                primes = restored
            else:
                self._checkpoint_capture({"factor_base": primes})
        if record_stage:
            self._phase_finish("factor-base", started)
        if record_stage:
            self._stage(
                "factor-base",
                "complete",
                theorem=plan.theorem,
                assumptions=list(plan.assumptions),
                bound=int(plan.bound),
                size=len(primes),
            )
        return plan, primes

    def _large_prime_factor(
        self, quotient: Any, factor_base: tuple[Any, ...], bound: int
    ) -> Any:
        """Return the sole bounded outside prime in an integral quotient."""
        outside = []
        for prime_ideal, exponent in quotient.factor():
            if any(prime_ideal == base_prime for base_prime in factor_base):
                continue
            outside.append((prime_ideal, int(exponent)))
        if len(outside) != 1 or outside[0][1] != 1:
            return None
        prime_ideal = outside[0][0]
        norm = prime_ideal.norm()
        if norm._denominator != 1 or int(norm._numerator) > bound:
            return None
        return prime_ideal

    def _combine_partial_witnesses(self, left: Any, right: Any) -> Any:
        factors = list(left.factors())
        for element, exponent in right.factors():
            factors.append((element, -int(exponent)))
        return self.components.relations.FactoredPrincipalWitness(self.field, factors)

    def _try_large_prime_partial(
        self,
        collector: Any,
        witness: Any,
        source_ideal: Any,
        source_row: Sequence[int],
        provenance: dict[str, Any],
        large_prime_bound: int,
    ) -> Any:
        """Match one exact one-large-prime partial, if available."""
        principal = witness.principal_ideal(self.order)
        quotient = principal / source_ideal
        try:
            large_prime = self._large_prime_factor(
                quotient, collector.factor_base, large_prime_bound
            )
        except (AttributeError, NotImplementedError, TypeError, ValueError):
            self._resource_usage["partial_discards"] += 1
            return None
        if large_prime is None:
            self._resource_usage["partial_discards"] += 1
            return None
        key = _prime_ideal_key(large_prime)
        previous = self._partials.pop(key, None)
        if previous is None:
            if len(self._partials) >= self.limits.max_partial_relations:
                self._resource_usage["partial_discards"] += 1
                return None
            self._partials[key] = _LargePrimePartial(
                witness, source_ideal, source_row, provenance
            )
            self._resource_usage["partial_relations"] = len(self._partials)
            return None
        combined = self._combine_partial_witnesses(previous.witness, witness)
        combined_source = previous.source_ideal / source_ideal
        combined_values = []
        for left, right in zip(previous.source_row, source_row, strict=True):
            combined_values.append(int(left) - int(right))
        combined_row = tuple(combined_values)
        try:
            admission = collector.admit_witness(
                combined,
                source_ideal=combined_source,
                source_row=combined_row,
                provenance={
                    "algorithm": "one-large-prime-match",
                    "large_prime_norm": int(large_prime.norm()._numerator),
                    "left": previous.provenance,
                    "right": provenance,
                },
            )
        except ValueError as error:
            if "already admitted" not in str(error):
                raise
            admission = None
        self._resource_usage["partial_matches"] += 1
        self._resource_usage["partial_relations"] = len(self._partials)
        return admission

    def _relation_ideal(
        self,
        search: Any,
        factor_base: tuple[Any, ...],
        attempt: int,
        coefficient_bound: int,
        *,
        saturation_prime: int | None = None,
    ) -> tuple[Any, tuple[int, ...], str]:
        """Choose a targeted product ideal before falling back to the PRNG."""
        width = len(factor_base)
        if width == 0:
            return self.order.ideal(1), (), "unit-ideal-sweep"
        missing = tuple(search.collector.rank_screen.missing_pivots())
        row = [0] * width
        if saturation_prime is not None:
            prime = _positive(saturation_prime, "saturation_prime")
            target = (attempt + prime + self.seed) % width
            row[target] = prime
            if width > 1 and attempt % 2:
                row[(target + 1 + attempt) % width] = 1
            strategy = "targeted-class-p-saturation-" + str(prime)
        elif attempt < width:
            index = (attempt + (self.seed % width)) % width
            row[index] = 1
            strategy = "single-prime-sweep"
        elif attempt % 3 != 2:
            target = missing[attempt % len(missing)] if missing else attempt % width
            row[target] = 1 + ((attempt // max(1, width)) % coefficient_bound)
            if width > 1:
                stride = 1 + ((attempt // width) % (width - 1))
                row[(target + stride) % width] += 1
            strategy = "targeted-prime-product"
        else:
            ideal, random_row = search.random_factor_base_ideal(
                terms=search.random_terms,
                max_exponent=min(3, coefficient_bound + 1),
            )
            return ideal, random_row, "seeded-random-product"
        source_row = tuple(row)
        ideal = self.components.relations.reconstruct_factor_base_ideal(
            self.order, factor_base, source_row
        )
        return ideal, source_row, strategy

    def _search_relation_ideal(
        self,
        search: Any,
        ideal: Any,
        source_row: Sequence[int],
        provenance: dict[str, Any],
        large_prime_bound: int,
        stop_after: int = 2,
    ) -> int:
        """Search one ideal while retaining bounded exact partial relations."""
        search.state.ideals_tested += 1
        admitted = 0
        for sequence, element in enumerate(search.short_elements(ideal)):
            self._check_cancelled()
            search.state.candidates_tested += 1
            candidate_provenance = {
                "algorithm": "exact-coefficient-lll",
                "seed": search.state.seed,
                "ideal_sequence": search.state.ideals_tested - 1,
                "candidate_sequence": sequence,
            }
            candidate_provenance.update(provenance)
            witness = self.components.relations.FactoredPrincipalWitness.from_element(
                element
            )
            try:
                admission = search.collector.admit_witness(
                    witness,
                    source_ideal=ideal,
                    source_row=source_row,
                    provenance=candidate_provenance,
                )
            except self.components.relations.RelationNotSmoothError:
                admission = self._try_large_prime_partial(
                    search.collector,
                    witness,
                    ideal,
                    source_row,
                    candidate_provenance,
                    large_prime_bound,
                )
            except ValueError as error:
                if "already admitted" not in str(error):
                    raise
                admission = None
            if admission is not None:
                admitted += 1
                search.state.relations_admitted += 1
                if admitted >= stop_after:
                    break
        return admitted

    def _unconditional_proof_pass(self, group: Any) -> tuple[Any, ...]:
        started = self._phase_start()
        plan, proof_primes = self._factor_base(proof=True, record_stage=False)
        if tuple(plan.assumptions):
            raise ArithmeticError("the Minkowski proof pass recorded an assumption")
        context_module = self.components.context
        progress_type: Any = getattr(context_module, "MinkowskiProofProgress", None)
        record_type: Any = getattr(context_module, "MinkowskiProofProgressRecord", None)
        if not callable(progress_type) or not callable(record_type):
            raise ImportError("resumable Minkowski proof progress is unavailable")
        theorem = "Minkowski ideal-class theorem"
        fingerprints = tuple(
            _portable_ideal_fingerprint(prime) for prime in proof_primes
        )

        def evidence(record: Any) -> Any:
            value = getattr(record, "evidence", None)
            if value is not None:
                return value
            if isinstance(record, dict) and "evidence" in record:
                return record["evidence"]
            return record

        def decode_record(payload: Any) -> Any:
            decoder = getattr(record_type, "from_dict", None)
            if not callable(decoder):
                raise TypeError("Minkowski proof records have no decoder")
            return decoder(payload)

        def verify_record(record: Any, index: int, fingerprint: Any) -> bool:
            try:
                raw = evidence(record)
                prime = proof_primes[index]
                if (
                    _component_payload(fingerprint)
                    != _component_payload(fingerprints[index])
                    or int(raw["index"]) != index
                    or raw["ideal"] != prime.to_dict()
                ):
                    return False
                coordinates = tuple(int(value) for value in raw["coordinates"])
                representative = group.representative_ideal(coordinates)
                witness_type = getattr(
                    self.components.factored, "FactoredNumberFieldElement", None
                )
                if witness_type is None:
                    witness_type = self.components.relations.FactoredPrincipalWitness
                witness = witness_type.from_dict(self.field, raw["witness"])
                return witness.principal_ideal(self.order) == prime / representative
            except (
                KeyError,
                IndexError,
                AttributeError,
                TypeError,
                ValueError,
                ArithmeticError,
            ):
                return False

        controller = self.checkpoint_controller
        progress: Any = None
        if controller is not None:
            restore = getattr(controller, "restore_minkowski_proof_progress", None)
            if callable(restore):
                progress = restore(
                    bound=(int(plan.bound), 1),
                    prime_fingerprints=fingerprints,
                    partition_count=self.limits.proof_partition_count,
                    theorem=theorem,
                    dependency_hashes=self._proof_dependency_hashes,
                    record_decoder=decode_record,
                    record_verifier=verify_record,
                )
            if progress is None:
                begin = getattr(controller, "begin_minkowski_proof", None)
                if not callable(begin):
                    raise TypeError(
                        "the checkpoint controller cannot begin a Minkowski proof"
                    )
                progress = begin(
                    (int(plan.bound), 1),
                    fingerprints,
                    partition_count=self.limits.proof_partition_count,
                    theorem=theorem,
                    dependency_hashes=self._proof_dependency_hashes,
                )
        else:
            create_progress: Any = getattr(progress_type, "create", None)
            if not callable(create_progress):
                raise TypeError("Minkowski proof progress has no create constructor")
            progress = create_progress(
                (int(plan.bound), 1),
                fingerprints,
                partition_count=self.limits.proof_partition_count,
                theorem=theorem,
                dependency_hashes=self._proof_dependency_hashes,
            )
        self._proof_progress = progress

        for partition_index in range(self.limits.proof_partition_count):
            while True:
                pending = tuple(progress.pending_indices(partition_index))
                if not pending:
                    break
                index = pending[0]
                prime_ideal = proof_primes[index]
                self._check_cancelled()
                coordinates, witness = group.discrete_log(prime_ideal)
                representative = group.representative_ideal(coordinates)
                quotient = prime_ideal / representative
                if witness.principal_ideal(self.order) != quotient:
                    raise ArithmeticError(
                        "a Minkowski proof-prime discrete log failed principal replay"
                    )
                norm = prime_ideal.norm()
                if norm._denominator != 1:
                    raise ArithmeticError("a proof-prime ideal has nonintegral norm")
                raw = {
                    "index": index,
                    "norm": int(norm._numerator),
                    "coordinates": tuple(int(value) for value in coordinates),
                    "ideal": prime_ideal.to_dict(),
                    "witness": witness.to_dict(),
                }
                wrapped = record_type(index, fingerprints[index], raw)
                if not verify_record(wrapped, index, fingerprints[index]):
                    raise ArithmeticError(
                        "a Minkowski proof-prime record failed exact replay"
                    )
                if controller is None:
                    progress = progress.record(index, wrapped)
                    self._checkpoint_capture({"proof_progress": progress})
                    self._checkpoint_save(force=True)
                else:
                    checkpoint_prime = getattr(
                        controller, "checkpoint_minkowski_proof_prime", None
                    )
                    if not callable(checkpoint_prime):
                        raise TypeError(
                            "the checkpoint controller cannot save a proof prime"
                        )
                    try:
                        progress = checkpoint_prime(
                            progress,
                            index,
                            wrapped,
                            details={
                                "partition_index": partition_index,
                                "prime_index": index,
                            },
                            force=True,
                        )
                    finally:
                        restored = controller.restore_minkowski_proof_progress(
                            bound=(int(plan.bound), 1),
                            prime_fingerprints=fingerprints,
                            partition_count=self.limits.proof_partition_count,
                            theorem=theorem,
                            dependency_hashes=self._proof_dependency_hashes,
                            record_decoder=decode_record,
                            record_verifier=verify_record,
                        )
                        if restored is not None:
                            progress = restored
                self._proof_progress = progress
                self._resource_usage["proof_primes_completed"] = int(
                    progress.completed_items
                )
                self._emit_progress(
                    "proof-prime",
                    completed=int(progress.completed_items),
                    total=len(proof_primes),
                    partition_index=partition_index,
                    partition_count=self.limits.proof_partition_count,
                    prime_index=index,
                )
        if not progress.complete or not progress.verify_records(verify_record):
            raise ArithmeticError("the Minkowski proof partitions are incomplete")
        records = tuple(
            evidence(record)
            for partition in progress.partitions
            for record in partition.records
        )
        records = tuple(sorted(records, key=lambda record: int(record["index"])))
        self._phase_finish("unconditional-proof", started)
        self._stage(
            "unconditional-proof",
            "complete",
            theorem=theorem,
            bound=int(plan.bound),
            prime_ideals=len(records),
            partitions=int(progress.partition_count),
            plan_sha256=str(progress.plan_sha256),
        )
        return records

    def _proof_dependencies(
        self, group: Any, collector: Any, presentation: Any, saturation: Any
    ) -> dict[str, str]:
        """Hash every exact dependency consumed by proof-prime replay."""
        return {
            "relations": _content_hash(
                {
                    "schema": "sagejs.number-fields/proof-relations-v1",
                    "records": [
                        _component_payload(record) for record in collector.records
                    ],
                    "execution_policy": {
                        "schema": "sagejs.number-fields/class-unit-execution-policy-v1",
                        "requested_proof": self.proof,
                        "algorithm": self.algorithm,
                        "limits": self.limits.to_dict(),
                    },
                }
            ),
            "presentation": _content_hash(
                {
                    "schema": "sagejs.number-fields/proof-presentation-v1",
                    "presentation": _component_payload(presentation),
                }
            ),
            "generators": _content_hash(
                {
                    "schema": "sagejs.number-fields/proof-generators-v1",
                    "ideals": [
                        _component_payload(ideal) for ideal in group.gens_ideals()
                    ],
                }
            ),
            "saturation": str(saturation.content_sha256),
        }

    def _relations(
        self,
        factor_base: tuple[Any, ...],
        unit_rank: int,
        *,
        collector: Any = None,
        presentation: Any = None,
        minimum_dependencies: int | None = None,
        saturation_prime: int | None = None,
    ) -> tuple[Any, Any]:
        """Collect exact relations, deferring dense transforms in safe batches."""
        started = self._phase_start()
        relations = self.components.relations
        matrix_module = self.components.matrix
        restored_state = self._relation_search_state
        if collector is None:
            collector = relations.ExactRelationCollector(self.order, factor_base)
            restored_relations = ()
            restored_matrix = None
            if self.checkpoint_controller is not None:
                restored_relations = tuple(
                    self.checkpoint_controller.restore_relations()
                )
                restored_state = self.checkpoint_controller.restore_search_state()
                restored_matrix = self.checkpoint_controller.restore_matrix_state()
            for record in restored_relations:
                collector.add_relation(record)
            if not restored_relations:
                relations.initial_rational_prime_relations(collector)
                self._checkpoint_capture({"relations": tuple(collector.records)})
            if presentation is None and restored_matrix is not None:
                replay = getattr(restored_matrix, "verify", None)
                rows = getattr(restored_matrix, "relation_rows", ())
                dense_rows = [
                    row.dense() if hasattr(row, "dense") else list(row) for row in rows
                ]
                if (
                    callable(replay)
                    and replay()
                    and dense_rows == [list(record.row) for record in collector.records]
                ):
                    presentation = restored_matrix
        if isinstance(restored_state, dict):
            restored_state = relations.RelationSearchState.from_dict(restored_state)

        accumulator_type = getattr(matrix_module, "RelationMatrixAccumulator", None)
        if self._relation_matrix_accumulator is None and callable(accumulator_type):
            accumulator: Any = accumulator_type(len(factor_base))
            for record in collector.records:
                accumulator.add_relation(record.row)
            self._relation_matrix_accumulator = accumulator

        policy_type = getattr(matrix_module, "DeferredPresentationPolicy", None)
        if (
            self._relation_presentation_policy is None
            and self._relation_matrix_accumulator is not None
            and callable(policy_type)
        ):
            self._relation_presentation_policy = policy_type(
                len(factor_base),
                batch_size=self.limits.exact_presentation_batch_size,
            )
        policy = self._relation_presentation_policy

        def accept_presentation(answer: Any, *, policy_recorded: bool = False) -> Any:
            self._relation_presentation_record_count = len(collector.records)
            self._resource_usage["presentation_extractions"] += 1
            if (
                policy is not None
                and not policy_recorded
                and int(answer.rank) == len(factor_base)
                and int(policy.last_exact_row_count) != len(collector.records)
            ):
                policy.note_exact_presentation(
                    self._relation_matrix_accumulator,
                    answer,
                    extracted_level="snf",
                )
            self._checkpoint_capture({"matrix_state": answer})
            return answer

        def extract_presentation() -> Any:
            answer = matrix_module.extract_relation_presentation(
                [record.row for record in collector.records],
                len(factor_base),
                require_full_rank=False,
            )
            return accept_presentation(answer)

        def policy_presentation(*, force: bool = False) -> Any:
            if policy is None:
                return None
            update = policy.extract_if_due(
                self._relation_matrix_accumulator,
                required_level="snf",
                force=force,
                backend="auto",
            )
            if not update.extracted:
                return None
            return accept_presentation(update.presentation, policy_recorded=True)

        if presentation is None:
            presentation = extract_presentation()
        else:
            row_count = len(getattr(presentation, "relation_rows", ()))
            if row_count == 0 and collector.records:
                row_count = self._relation_presentation_record_count
            self._relation_presentation_record_count = row_count
            if (
                policy is not None
                and row_count == len(collector.records)
                and int(presentation.rank) == len(factor_base)
                and int(policy.last_exact_row_count) != row_count
            ):
                policy.note_exact_presentation(
                    self._relation_matrix_accumulator,
                    presentation,
                    extracted_level="snf",
                )
        coefficient_bound = 1
        search = relations.LLLRelationSearch(
            collector,
            seed=self.seed,
            max_candidates_per_ideal=min(8, self.limits.max_candidates_per_ideal),
            random_terms=min(3, self.limits.max_random_terms),
            coefficient_bound=coefficient_bound,
            state=restored_state,
        )
        self._relation_search_state = search.state
        attempts = int(search.state.ideals_tested)
        dependency_target = (
            unit_rank + max(2, int(self.field.degree()))
            if minimum_dependencies is None
            else max(0, int(minimum_dependencies))
        )
        unit_log_rank = self._unit_logarithmic_rank(
            collector.records, presentation, unit_rank
        )
        self._relation_unit_log_rank = unit_log_rank
        self._resource_usage.update(
            {
                "relation_attempts": attempts,
                "relation_candidates": int(search.state.candidates_tested),
                "ideals_tested": int(search.state.ideals_tested),
                "relations": len(collector.records),
                "unit_log_rank": unit_log_rank,
                "unit_rank_target": unit_rank,
            }
        )
        factor_norms = [int(prime.norm()._numerator) for prime in factor_base]
        largest_factor_norm = max(factor_norms) if factor_norms else 2
        large_prime_bound = (
            largest_factor_norm * self.limits.large_prime_bound_multiplier
        )
        while (
            presentation.rank < len(factor_base)
            or len(presentation.dependency_transforms) < dependency_target
            or unit_log_rank < unit_rank
        ):
            self._check_cancelled()
            if attempts >= self.limits.max_relation_attempts:
                break
            search.max_candidates_per_ideal = min(
                self.limits.max_candidates_per_ideal,
                8 * coefficient_bound,
            )
            search.random_terms = min(
                self.limits.max_random_terms, 2 + coefficient_bound
            )
            search.coefficient_bound = coefficient_bound
            if saturation_prime is None:
                ideal, source_row, strategy = self._relation_ideal(
                    search, factor_base, attempts, coefficient_bound
                )
            else:
                ideal, source_row, strategy = self._relation_ideal(
                    search,
                    factor_base,
                    attempts,
                    coefficient_bound,
                    saturation_prime=saturation_prime,
                )
            before = len(collector.records)
            self._search_relation_ideal(
                search,
                ideal,
                source_row,
                {
                    "relation_attempt": attempts,
                    "ideal_strategy": strategy,
                },
                large_prime_bound,
            )
            attempts += 1
            if len(collector.records) > self.limits.max_relations:
                raise ValueError("exact relation count exceeds max_relations")
            if len(collector.records) != before:
                accumulator = self._relation_matrix_accumulator
                if accumulator is not None:
                    for record in collector.records[before:]:
                        accumulator.add_relation(record.row)
                if policy is not None:
                    update = policy_presentation()
                    if update is not None:
                        presentation = update
                else:
                    pending_exact = (
                        len(collector.records)
                        - self._relation_presentation_record_count
                    )
                    rank_screen = getattr(collector, "rank_screen", None)
                    modular_full = bool(
                        _value(accumulator, ("full_rank_plausible",), False)
                        if accumulator is not None
                        else _value(rank_screen, ("rank",), 0) == len(factor_base)
                    )
                    if pending_exact >= self.limits.exact_presentation_batch_size or (
                        presentation.rank < len(factor_base) and modular_full
                    ):
                        presentation = extract_presentation()
                unit_log_rank = self._unit_logarithmic_rank(
                    collector.records, presentation, unit_rank
                )
                self._relation_unit_log_rank = unit_log_rank
            coefficient_bound = min(
                self.limits.max_coefficient_bound,
                1 + attempts // max(1, len(factor_base)),
            )
            self._resource_usage.update(
                {
                    "relation_attempts": attempts,
                    "relation_candidates": int(search.state.candidates_tested),
                    "ideals_tested": int(search.state.ideals_tested),
                    "relations": len(collector.records),
                    "partial_relations": len(self._partials),
                    "unit_log_rank": unit_log_rank,
                    "unit_rank_target": unit_rank,
                }
            )
            if len(collector.records) != before:
                for record in collector.records[before:]:
                    self._checkpoint_capture({"relation": record})
            self._checkpoint_capture(
                {
                    "search_state": search.state,
                }
            )
            if attempts % 8 == 0:
                self._checkpoint_save(force=False)
            self._emit_progress(
                "relation-search",
                attempt=attempts,
                strategy=strategy,
                rank=int(presentation.rank),
                columns=len(factor_base),
                dependencies=len(presentation.dependency_transforms),
                unit_log_rank=unit_log_rank,
                unit_rank_target=unit_rank,
                exact_rows=self._relation_presentation_record_count,
                pending_exact_rows=(
                    len(collector.records) - self._relation_presentation_record_count
                ),
                search_state=search.state.to_dict(),
            )
        if self._relation_presentation_record_count != len(collector.records):
            update = policy_presentation(force=True)
            presentation = extract_presentation() if update is None else update
            unit_log_rank = self._unit_logarithmic_rank(
                collector.records, presentation, unit_rank
            )
            self._relation_unit_log_rank = unit_log_rank
        self._phase_finish("relations", started)
        search_complete = (
            presentation.rank == len(factor_base)
            and len(presentation.dependency_transforms) >= dependency_target
            and unit_log_rank >= unit_rank
        )
        self._stage(
            "relations",
            "complete" if search_complete else "bounded",
            attempts=attempts,
            relations=len(collector.records),
            rank=int(presentation.rank),
            columns=len(factor_base),
            dependencies=len(presentation.dependency_transforms),
            dependency_target=dependency_target,
            unit_log_rank=unit_log_rank,
            unit_rank_target=unit_rank,
            candidates=int(search.state.candidates_tested),
            ideals=int(search.state.ideals_tested),
            partials_retained=len(self._partials),
            partial_matches=int(self._resource_usage["partial_matches"]),
            partial_discards=int(self._resource_usage["partial_discards"]),
            large_prime_bound=large_prime_bound,
            saturation_prime=saturation_prime,
            exact_rows=self._relation_presentation_record_count,
            presentation_extractions=int(
                self._resource_usage["presentation_extractions"]
            ),
            search_state=search.state.to_dict(),
        )
        return collector, presentation

    def _unit_logarithmic_rank(
        self, records: Sequence[Any], presentation: Any, unit_rank: int
    ) -> int:
        """Return the observed archimedean rank of exact dependency units."""
        if unit_rank == 0:
            return 0
        logarithms = []
        for dependency in presentation.dependency_transforms:
            unit = self._combine(records, dependency)
            logarithms.append(list(unit.archimedean_logarithms(80)[:-1]))
        return min(unit_rank, _floating_matrix_rank(logarithms))

    def _decode_relation_witness(self, record: Any) -> Any:
        return self.components.relations.FactoredPrincipalWitness.from_dict(
            self.field, record.witness
        )

    def _combine(self, records: Sequence[Any], coefficients: Sequence[int]) -> Any:
        factors = []
        for record, coefficient in zip(records, coefficients, strict=False):
            if coefficient == 0:
                continue
            witness = self._decode_relation_witness(record)
            for element, exponent in witness.factors():
                factors.append((element, exponent * int(coefficient)))
        if self.components.factored is not None:
            return self.components.factored.FactoredNumberFieldElement(
                self.field, factors
            )
        return self.components.relations.FactoredPrincipalWitness(self.field, factors)

    def _independent_units(
        self, records: Sequence[Any], presentation: Any, unit_rank: int
    ) -> tuple[Any, ...]:
        started = self._phase_start()
        if unit_rank == 0:
            self._phase_finish("unit-recovery", started)
            self._stage("unit-recovery", "complete", rank=0, candidates=0)
            return ()
        if not presentation.verify():
            raise ArithmeticError("the relation presentation failed exact replay")
        candidates: list[Any] = []
        for dependency in presentation.dependency_transforms:
            unit = self._combine(records, dependency)
            candidates.append(unit)
        units = self._select_unit_basis(candidates, unit_rank)
        if not units:
            self._phase_finish("unit-recovery", started)
            self._stage(
                "unit-recovery",
                "bounded",
                rank=unit_rank,
                candidates=len(candidates),
            )
            return ()
        self._verify_exact_units(units)
        self._phase_finish("unit-recovery", started)
        self._stage(
            "unit-recovery",
            "complete",
            rank=unit_rank,
            candidates=len(candidates),
        )
        return units

    def _select_unit_basis(
        self, candidates: Sequence[Any], unit_rank: int
    ) -> tuple[Any, ...]:
        """Select a smallest observed full-rank logarithmic sublattice basis."""
        if unit_rank == 0:
            return ()
        logarithms = [list(unit.archimedean_logarithms(80)[:-1]) for unit in candidates]
        best: tuple[int, ...] = ()
        best_volume: float | None = None
        checked = 0
        for indices in _index_combinations(len(candidates), unit_rank):
            checked += 1
            if checked > 50_000:
                break
            volume = _floating_determinant_absolute(
                [logarithms[index] for index in indices]
            )
            if volume <= 1e-12:
                continue
            if best_volume is None or volume < best_volume:
                best = indices
                best_volume = volume
        if not best:
            return ()
        return tuple(candidates[index] for index in best)

    def _verify_exact_units(self, units: Sequence[Any]) -> None:
        one = self.order.ideal(1)
        for unit in units:
            if unit.principal_ideal(self.order) != one:
                raise ArithmeticError("a relation dependency is not an exact unit")

    def _analytic_index(
        self, presentation: Any, units: tuple[Any, ...], unit_rank: int
    ) -> tuple[Any, Any, Any]:
        started = self._phase_start()
        analytic = self.components.analytic
        if len(units) != unit_rank:
            raise ArithmeticError(
                "relations did not yield the full Dirichlet unit rank"
            )
        regulator = analytic.regulator_from_factored_units(
            units,
            unit_rank=unit_rank,
            precision_bits=self.limits.precision_bits,
            maximum_precision_bits=self.limits.max_precision_bits,
        )
        zeta_limits = analytic.ZetaLogResidueLimits(
            maximum_prime_bound=self.limits.max_analytic_prime_bound,
            maximum_precision_bits=self.limits.max_precision_bits,
        )
        zeta = analytic.zeta_log_residue_bound(
            int(self.order.discriminant()),
            int(self.field.degree()),
            self.order.splitting_records,
            precision_bits=self.limits.precision_bits,
            limits=zeta_limits,
        )
        units_module = _optional_module("sagejs.number_fields.units")
        torsion = units_module.roots_of_unity(self.field)
        if not torsion.complete or not torsion.verify():
            raise ArithmeticError("roots of unity are incomplete")
        index = analytic.validate_hr_index(
            signature=_value(self.field, ("signature",)),
            discriminant=int(self.order.discriminant()),
            class_number=int(presentation.order),
            roots_of_unity=int(torsion.order),
            regulator=regulator,
            zeta_log_residue=zeta,
            precision_bits=self.limits.precision_bits,
        )
        self._phase_finish("analytic-index", started)
        self._stage(
            "analytic-index",
            "complete" if index.index_one else "bounded",
            lower_index=int(index.lower_index),
            upper_index=int(index.upper_index),
            rigorous=bool(index.rigorous),
            zeta_threshold=int(zeta.threshold),
        )
        return torsion, regulator, index

    def _analytic_validation_payload(
        self, index: Any, regulator: Any
    ) -> dict[str, Any]:
        return {
            "lower_index": int(index.lower_index),
            "upper_index": int(index.upper_index),
            "index_one": bool(index.index_one),
            "rigorous": bool(index.rigorous),
            "regulator_precision_bits": int(regulator.precision_bits),
            "regulator_rigorous": bool(regulator.rigorous),
        }

    def _generation_authority(
        self,
        plan: Any,
        factor_base: tuple[Any, ...],
        collector: Any,
        presentation: Any,
        proof_status: str,
    ) -> tuple[dict[str, Any], Any]:
        """Bind the exact class-generation theorem consumed by `h*R`."""
        evidence = {
            "schema": "sagejs.number-fields/class-generation-authority-v1",
            "proof_status": proof_status,
            "theorem": str(plan.theorem),
            "assumptions": list(plan.assumptions),
            "bound": int(plan.bound),
            "factor_base": [_component_payload(prime) for prime in factor_base],
            "relations": [_component_payload(record) for record in collector.records],
            "presentation": _component_payload(presentation),
        }
        canonical = _component_payload(evidence)

        def verify_generation(
            field: Any,
            order: Any,
            initial_units: Sequence[Any],
            class_number: Any,
            supplied_evidence: Any,
            supplied_proof_status: str,
        ) -> bool:
            del initial_units
            try:
                if field is not self.field or order is not self.order:
                    return False
                if (
                    supplied_proof_status != proof_status
                    or _component_payload(supplied_evidence) != canonical
                    or int(class_number) != int(presentation.order)
                    or not presentation.verify()
                ):
                    return False
                rebuilt_records = self.components.factor_base.build_factor_base(plan)
                rebuilt_factor_base = tuple(
                    _value(record, ("prime_ideal", "ideal"))
                    for record in rebuilt_records
                )
                if rebuilt_factor_base != tuple(factor_base):
                    return False
                if proof_status == EXACT_UNCONDITIONAL:
                    if tuple(plan.assumptions) or "Minkowski" not in str(plan.theorem):
                        return False
                elif proof_status == EXACT_RELATIONS_CONDITIONAL_GRH:
                    if not tuple(plan.assumptions):
                        return False
                else:
                    return False
                for record in collector.records:
                    replay = record.verify(order, factor_base)
                    if replay.get("certified") is not True:
                        return False
                return True
            except (AttributeError, TypeError, ValueError, ArithmeticError):
                return False

        if not verify_generation(
            self.field,
            self.order,
            (),
            presentation.order,
            evidence,
            proof_status,
        ):
            raise ArithmeticError("class-generation authority failed exact replay")
        return evidence, verify_generation

    def _try_unit_saturation(
        self,
        units: tuple[Any, ...],
        torsion: Any,
        index: Any,
        unit_rank: int,
        class_number: int,
        generation_evidence: Any,
        generation_verifier: Any,
        proof_status: str,
    ) -> tuple[tuple[Any, ...], Any, dict[str, Any]]:
        """Invoke an optional exact producer and reject unverifiable artifacts."""
        index_bound = max(1, int(index.upper_index))
        required_primes = _prime_divisors(index_bound)
        attempt: dict[str, Any] = {
            "schema": "sagejs.number-fields/unit-saturation-attempt-v1",
            "index_bound": int(index_bound),
            "required_primes": list(required_primes),
            "producer": "unavailable",
            "accepted": False,
        }
        producer = getattr(self.components.analytic, "saturate_unit_lattice", None)
        if not callable(producer):
            attempt["reason"] = "no exact unit p-saturation producer is installed"
            return units, None, attempt
        self._check_cancelled()
        try:

            def saturation_cancelled() -> bool:
                if self.checkpoint_controller is not None:
                    self.checkpoint_controller.check_cancelled(
                        "saturation", dict(self._resource_usage)
                    )
                return bool(self.cancelled())

            authority: Any = index
            certificate_factory = getattr(
                self.components.analytic, "certify_unit_saturation_index", None
            )
            if not callable(certificate_factory):
                attempt["reason"] = (
                    "no authenticated class/unit index certificate producer is installed"
                )
                return units, None, attempt
            zeta_limits_type = getattr(
                self.components.analytic, "ZetaLogResidueLimits", None
            )
            zeta_limits = (
                None
                if not callable(zeta_limits_type)
                else zeta_limits_type(
                    maximum_prime_bound=self.limits.max_analytic_prime_bound,
                    maximum_degree=max(2, int(self.field.degree())),
                    maximum_precision_bits=self.limits.max_precision_bits,
                )
            )
            authority = certificate_factory(
                self.field,
                self.order,
                units,
                class_number=class_number,
                roots_of_unity=int(_value(torsion, ("order",), 0)),
                precision_bits=self.limits.precision_bits,
                maximum_precision_bits=self.limits.max_precision_bits,
                zeta_limits=zeta_limits,
                generation_evidence=generation_evidence,
                generation_verifier=generation_verifier,
                proof_status=proof_status,
            )
            attempt["index_certificate"] = _component_payload(authority)
            result = producer(
                self.field,
                self.order,
                units,
                authority,
                index_bound_is_rigorous=bool(
                    index.rigorous and int(index.lower_index) == int(index.upper_index)
                ),
                torsion=torsion,
                precision_bits=self.limits.precision_bits,
                maximum_precision_bits=self.limits.max_precision_bits,
                maximum_target_classes=self.limits.max_saturation_target_classes,
                maximum_saturation_work=self.limits.max_saturation_work,
                cancelled=saturation_cancelled,
            )
            attempt["producer"] = type(result).__name__
            result_payload = _component_payload(result)
            attempt["result"] = result_payload
            module_verifier = getattr(
                self.components.analytic, "verify_saturation_record", None
            )
            if callable(module_verifier):
                try:
                    replayed = bool(
                        module_verifier(
                            self.field,
                            self.order,
                            units,
                            result_payload,
                            torsion_elements=tuple(_value(torsion, ("elements",), ())),
                            generation_verifier=generation_verifier,
                        )
                    )
                except TypeError:
                    replayed = bool(
                        module_verifier(
                            self.field,
                            self.order,
                            units,
                            result_payload,
                            torsion_elements=tuple(_value(torsion, ("elements",), ())),
                        )
                    )
            else:
                replay = getattr(result, "verify", None)
                if not callable(replay):
                    replayed = False
                else:
                    try:
                        replayed = bool(replay())
                    except TypeError:
                        replayed = bool(replay(self.field, self.order, units))
            if not replayed:
                attempt["reason"] = "unit saturation producer replay failed"
                return units, None, attempt
            updated = tuple(_value(result, ("units", "generators"), ()))
            if len(updated) != unit_rank:
                attempt["reason"] = "unit saturation returned the wrong free rank"
                return units, None, attempt
            self._verify_exact_units(updated)
            logarithmic_rank = self._unit_logarithmic_rank_from_units(
                updated, unit_rank
            )
            if logarithmic_rank != unit_rank:
                attempt["reason"] = "unit saturation returned dependent generators"
                return units, None, attempt
            attempt["accepted"] = True
            attempt["producer_complete"] = bool(
                _value(result, ("complete", "saturated"), False)
            )
            attempt["producer_rigorous"] = bool(_value(result, ("rigorous",), False))
            attempt["reason"] = str(
                _value(
                    result,
                    ("reason", "incomplete_reason"),
                    "exact saturation artifact replayed",
                )
            )
            return updated, result, attempt
        except RuntimeError as error:
            if _is_cancellation(error) or self.cancelled():
                raise
            attempt["producer"] = getattr(producer, "__name__", "duck-producer")
            attempt["reason"] = str(error)
            return units, None, attempt
        except (
            ImportError,
            NotImplementedError,
            TypeError,
            ValueError,
            ArithmeticError,
        ) as error:
            attempt["producer"] = getattr(producer, "__name__", "duck-producer")
            attempt["reason"] = str(error)
            return units, None, attempt

    def _unit_logarithmic_rank_from_units(
        self, units: Sequence[Any], unit_rank: int
    ) -> int:
        if unit_rank == 0:
            return 0
        rows = [list(unit.archimedean_logarithms(80)[:-1]) for unit in units]
        return min(unit_rank, _floating_matrix_rank(rows))

    def _adaptive_saturation(
        self,
        factor_base: tuple[Any, ...],
        collector: Any,
        presentation: Any,
        units: tuple[Any, ...],
        torsion: Any,
        regulator: Any,
        index: Any,
        unit_rank: int,
        *,
        plan: Any = None,
        proof_status: str = EXACT_RELATIONS_CONDITIONAL_GRH,
    ) -> tuple[Any, Any, tuple[Any, ...], Any, Any, Any, Any]:
        """Boundedly enlarge class/unit lattices and re-run rigorous `h*R`."""
        original_units = tuple(units)
        initial_bound = max(1, int(index.upper_index))
        required_primes = set(_prime_divisors(initial_bound))
        attempts: list[Any] = []
        artifacts: list[tuple[Any, Sequence[Any], Any, Any]] = []
        for round_index in range(self.limits.max_saturation_rounds):
            if index.index_one:
                break
            self._check_cancelled()
            self._resource_usage["saturation_rounds"] = round_index + 1
            bound = max(1, int(index.upper_index))
            required_primes.update(_prime_divisors(bound))
            before_units = units
            if plan is None:
                generation_evidence = {
                    "schema": "sagejs.number-fields/duck-generation-authority-v1"
                }

                def generation_verifier(*args: Any, **kwargs: Any) -> bool:
                    del args, kwargs
                    return True

            else:
                generation_evidence, generation_verifier = self._generation_authority(
                    plan,
                    factor_base,
                    collector,
                    presentation,
                    proof_status,
                )
            saturated_units, artifact, attempt = self._try_unit_saturation(
                units,
                torsion,
                index,
                unit_rank,
                int(_value(presentation, ("order",), 1)),
                generation_evidence,
                generation_verifier,
                proof_status,
            )
            attempt["round"] = round_index
            attempts.append(attempt)
            self._checkpoint_capture({"saturation": attempt})
            if artifact is not None:
                artifacts.append((artifact, before_units, torsion, generation_verifier))
                units = saturated_units
                torsion, regulator, index = self._analytic_index(
                    presentation, units, unit_rank
                )
                if index.index_one:
                    break

            relation_progress = False
            for prime in _prime_divisors(max(1, int(index.upper_index))):
                relation_count = len(collector.records)
                before_order = _value(presentation, ("order",), None)
                dependency_target = (
                    len(presentation.dependency_transforms)
                    + self.limits.saturation_relation_batch
                )
                collector, presentation = self._relations(
                    factor_base,
                    unit_rank,
                    collector=collector,
                    presentation=presentation,
                    minimum_dependencies=dependency_target,
                    saturation_prime=prime,
                )
                after_order = _value(presentation, ("order",), None)
                admitted = len(collector.records) - relation_count
                relation_progress = relation_progress or admitted > 0
                attempts.append(
                    {
                        "schema": "sagejs.number-fields/class-saturation-attempt-v1",
                        "round": round_index,
                        "prime": prime,
                        "relations_admitted": admitted,
                        "class_order_before": before_order,
                        "class_order_after": after_order,
                        "class_lattice_enlarged": bool(
                            before_order is not None
                            and after_order is not None
                            and int(after_order) < int(before_order)
                            and int(before_order) % int(after_order) == 0
                        ),
                        "accepted": admitted > 0,
                        "reason": (
                            "targeted exact p-relation batch replayed"
                            if admitted > 0
                            else "relation resource cap prevented lattice enlargement"
                        ),
                    }
                )
                if admitted == 0:
                    continue
                relation_units = self._independent_units(
                    collector.records, presentation, unit_rank
                )
                combined = self._select_unit_basis(
                    tuple(units) + tuple(relation_units), unit_rank
                )
                if unit_rank and not combined:
                    continue
                self._verify_exact_units(combined)
                units = combined
                torsion, regulator, index = self._analytic_index(
                    presentation, units, unit_rank
                )
                if index.index_one:
                    break
            if not relation_progress and not index.index_one:
                break

        analytic_validation = self._analytic_validation_payload(index, regulator)
        record = ClassUnitSaturationRecord(
            self.field,
            self.order,
            original_units,
            units,
            index_bound=initial_bound,
            required_primes=tuple(required_primes),
            remaining_index_bound=max(1, int(index.upper_index)),
            attempts=attempts,
            analytic_validation=analytic_validation,
            producer_artifacts=artifacts,
            analytic_module=self.components.analytic,
            reason=(
                "rigorous hR index-one validation after bounded saturation"
                if index.index_one
                else "bounded saturation did not isolate class/unit index one"
            ),
        )
        self._saturation_record = record
        self._checkpoint_capture({"saturation": record})
        self._stage(
            "saturation",
            "complete" if record.complete else "bounded",
            index_bound=record.index_bound,
            remaining_index_bound=record.remaining_index_bound,
            required_primes=record.required_primes,
            attempts=len(record.attempts),
            rigorous=record.rigorous,
        )
        return collector, presentation, units, torsion, regulator, index, record

    def _class_group(
        self,
        factor_base: tuple[Any, ...],
        collector: Any,
        presentation: Any,
        proof_status: str,
        theorem: str,
    ) -> _EngineClassGroup:
        started = self._phase_start()
        positions = tuple(presentation.invariant_positions)
        generator_rows = tuple(
            tuple(int(value) for value in presentation.smith_right_inverse[position])
            for position in positions
        )
        reconstruct = self.components.relations.reconstruct_factor_base_ideal
        generator_ideals = tuple(
            reconstruct(self.order, factor_base, row) for row in generator_rows
        )
        group = _EngineClassGroup(
            self.order,
            presentation.invariants,
            generator_ideals,
            generator_rows,
            presentation,
            factor_base,
            collector.records,
            lambda coefficients: self._combine(collector.records, coefficients),
            self.components.relations.factor_ideal_over_base,
            self.components.relations.reduce_ideal_over_base,
            lambda relation_witness, reduction_witness: (
                self.components.factored.FactoredNumberFieldElement(
                    self.field,
                    list(relation_witness.factors())
                    + list(reduction_witness.factors()),
                )
            ),
            proof_status,
            theorem,
        )
        if not group.verify():
            raise ArithmeticError("class-group ideal maps failed exact replay")
        self._phase_finish("class-group", started)
        self._stage(
            "class-group",
            "complete",
            invariants=tuple(int(value) for value in presentation.invariants),
        )
        return group

    def run(self) -> ClassUnitComputation:
        self._check_cancelled()
        specialized = self._specialized()
        if specialized is not None:
            return specialized
        missing = self.components.missing()
        if missing:
            return self._incomplete(
                "general class/unit producers are not installed: " + ", ".join(missing)
            )
        try:
            embedding_module = _optional_module("sagejs.number_fields.embeddings")
            signature = embedding_module.exact_signature(self.field)
            unit_rank = int(signature[0] + signature[1] - 1)
            # Relation discovery uses the much smaller BDF factor base.  A
            # proof=True request is upgraded afterward by expressing every
            # Minkowski-required prime ideal in this exact presentation.
            discovery_proof = self.algorithm == "minkowski"
            plan, factor_base = self._factor_base(proof=discovery_proof)
            collector, presentation = self._relations(factor_base, unit_rank)
            if presentation.rank != len(factor_base) or presentation.order is None:
                return self._incomplete(
                    "relation search exhausted before full rank",
                    invariants=presentation.invariants,
                    diagnostics={"relations": len(collector.records)},
                )
            if self._relation_unit_log_rank < unit_rank:
                return self._incomplete(
                    "relation search exhausted before full logarithmic unit rank",
                    invariants=presentation.invariants,
                    diagnostics={
                        "relations": len(collector.records),
                        "unit_log_rank": self._relation_unit_log_rank,
                        "unit_rank_target": unit_rank,
                    },
                )
            units = self._independent_units(collector.records, presentation, unit_rank)
            torsion, regulator, index = self._analytic_index(
                presentation, units, unit_rank
            )
            conditional_discovery = bool(tuple(plan.assumptions))
            if not conditional_discovery and not discovery_proof:
                raise ArithmeticError("a conditional run did not record its assumption")
            initial_proof_status = (
                EXACT_RELATIONS_CONDITIONAL_GRH
                if conditional_discovery
                else EXACT_UNCONDITIONAL
            )
            (
                collector,
                presentation,
                units,
                torsion,
                regulator,
                index,
                saturation_record,
            ) = self._adaptive_saturation(
                factor_base,
                collector,
                presentation,
                units,
                torsion,
                regulator,
                index,
                unit_rank,
                plan=plan,
                proof_status=initial_proof_status,
            )
            unit_group = UnitGroupComputation(
                torsion,
                units,
                unit_rank,
                complete=bool(index.index_one),
                regulator=regulator,
                reason="rigorous hR index-one validation",
                proof_status=EXACT_RELATIONS_CONDITIONAL_GRH,
            )
            if not index.index_one:
                return self._incomplete(
                    "bounded saturation did not isolate class/unit index one",
                    invariants=presentation.invariants,
                    unit_group=unit_group,
                    diagnostics={
                        "saturation_record": saturation_record.to_dict(),
                    },
                )
            group = self._class_group(
                factor_base,
                collector,
                presentation,
                initial_proof_status,
                str(plan.theorem),
            )
            self._proof_dependency_hashes = self._proof_dependencies(
                group, collector, presentation, saturation_record
            )
            proof_records: tuple[Any, ...] = ()
            proof_status = initial_proof_status
            if self.proof or discovery_proof:
                proof_records = self._unconditional_proof_pass(group)
                proof_status = EXACT_UNCONDITIONAL
                group.proof_status = proof_status
                group.factor_base_theorem = "Minkowski ideal-class theorem"
                unit_group.proof_status = proof_status
            self._stage(
                "proof",
                "complete",
                proof_status=proof_status,
                minkowski_primes=len(proof_records),
                exact_relations=len(collector.records),
            )
            self._phase_finish("total", self._started_ns)
            self._stage("terminal", "complete", class_number=group.order())
            self._checkpoint_capture(
                {
                    "matrix_state": presentation,
                    "proof_progress": self._proof_progress,
                    "diagnostics": self._diagnostics(),
                }
            )
            self._checkpoint_save(force=True)
            result = ClassUnitComputation(
                self.field,
                proof_status=proof_status,
                complete=True,
                reason="exact relations and rigorous class/unit index one",
                algorithm="buchmann-hecke",
                stages=self.stages,
                class_group=group,
                unit_group=unit_group,
                tentative_invariants=presentation.invariants,
                diagnostics=self._diagnostics(
                    {
                        "factor_base_bound": int(plan.bound),
                        "factor_base_size": len(factor_base),
                        "relations": len(collector.records),
                        "unconditional_prime_records": proof_records,
                        "saturation_record": saturation_record.to_dict(),
                        "proof_dependency_hashes": dict(self._proof_dependency_hashes),
                        "proof_progress": (
                            None
                            if self._proof_progress is None
                            else self._proof_progress.to_dict()
                        ),
                    }
                ),
                saturation_record=saturation_record,
                proof_progress=self._proof_progress,
                proof_dependency_hashes=self._proof_dependency_hashes,
            )
            return result
        except RuntimeError as error:
            if _is_cancellation(error):
                return self._incomplete(
                    "class/unit computation cancelled",
                    diagnostics={
                        "cancelled_stage": getattr(error, "stage", ""),
                        "cancelled_details": getattr(error, "details", None),
                    },
                )
            raise
        except (ImportError, TypeError, ValueError, ArithmeticError) as error:
            return self._incomplete(str(error))


def _floating_value(value: Any) -> float:
    midpoint: Any = getattr(value, "midpoint", None)
    selected: Any = midpoint() if callable(midpoint) else value
    return float(selected)


def _index_combinations(count: int, size: int) -> Iterable[tuple[int, ...]]:
    if size < 0 or size > count:
        return
    if size == 0:
        yield ()
        return
    indices = list(range(size))
    while True:
        yield tuple(indices)
        position = size - 1
        while position >= 0 and indices[position] == count - size + position:
            position -= 1
        if position < 0:
            return
        indices[position] += 1
        for index in range(position + 1, size):
            indices[index] = indices[index - 1] + 1


def _floating_matrix_rank(rows: Sequence[Sequence[Any]]) -> int:
    """Estimate row rank after scale normalization for search steering only."""
    if not rows:
        return 0
    width = len(rows[0])
    matrix = []
    for row in rows:
        if len(row) != width:
            raise ValueError("logarithm rows have inconsistent widths")
        values = [_floating_value(value) for value in row]
        scale = 0.0
        for value in values:
            scale = max(scale, abs(value))
        if scale > 1e-14:
            matrix.append([value / scale for value in values])
    rank = 0
    for column in range(width):
        pivot = None
        pivot_size = 0.0
        for row_index in range(rank, len(matrix)):
            candidate_size = abs(matrix[row_index][column])
            if candidate_size > pivot_size:
                pivot = row_index
                pivot_size = candidate_size
        if pivot is None or abs(matrix[pivot][column]) <= 1e-10:
            continue
        matrix[rank], matrix[pivot] = matrix[pivot], matrix[rank]
        pivot_value = matrix[rank][column]
        for row_index in range(rank + 1, len(matrix)):
            multiple = matrix[row_index][column] / pivot_value
            for index in range(column, width):
                matrix[row_index][index] -= multiple * matrix[rank][index]
        rank += 1
        if rank == len(matrix):
            break
    return rank


def _floating_determinant_absolute(rows: Sequence[Sequence[Any]]) -> float:
    size = len(rows)
    if size == 0:
        return 1.0
    if any(len(row) != size for row in rows):
        return 0.0
    matrix = [[_floating_value(value) for value in row] for row in rows]
    determinant = 1.0
    for column in range(size):
        pivot = max(range(column, size), key=lambda row: abs(matrix[row][column]))
        if abs(matrix[pivot][column]) <= 1e-14:
            return 0.0
        if pivot != column:
            matrix[column], matrix[pivot] = matrix[pivot], matrix[column]
            determinant = -determinant
        value = matrix[column][column]
        determinant *= value
        for row in range(column + 1, size):
            multiple = matrix[row][column] / value
            for index in range(column + 1, size):
                matrix[row][index] -= multiple * matrix[column][index]
    return abs(determinant)


def compute_class_unit_group(
    field: Any,
    *,
    proof: bool = True,
    algorithm: str = "auto",
    limits: ClassUnitEngineLimits | None = None,
    seed: int = 0,
    cancelled: Callable[[], bool] | None = None,
    progress: Callable[[dict[str, Any]], None] | None = None,
    checkpoint: Any = None,
    resume_from: Any = None,
    checkpoint_controller: Any = None,
    max_checkpoint_bytes: int | None = None,
    components: Any = None,
) -> ClassUnitComputation:
    """Run one deterministic shared class-and-unit computation."""
    engine = ClassUnitGroupEngine(
        field,
        proof=proof,
        algorithm=algorithm,
        limits=limits,
        seed=seed,
        cancelled=cancelled,
        progress=progress,
        checkpoint=checkpoint,
        resume_from=resume_from,
        checkpoint_controller=checkpoint_controller,
        max_checkpoint_bytes=max_checkpoint_bytes,
        components=components,
    )
    try:
        return engine.run()
    except RuntimeError as error:
        if not _is_cancellation(error):
            raise
        return engine._incomplete("class/unit computation cancelled")


class_unit_group = compute_class_unit_group


def class_unit_context(
    field: Any,
    *,
    proof: bool | None = None,
    algorithm: str = "auto",
    limits: ClassUnitEngineLimits | None = None,
    seed: int = 0,
    cancelled: Callable[[], bool] | None = None,
    progress: Callable[[dict[str, Any]], None] | None = None,
    checkpoint: Any = None,
    resume_from: Any = None,
    checkpoint_controller: Any = None,
    max_checkpoint_bytes: int | None = None,
    components: Any = None,
    **limit_overrides: Any,
) -> ClassUnitComputation:
    """Return the shared computation consumed by every public projection."""
    if limits is not None and limit_overrides:
        raise ValueError("pass either limits or limit overrides, not both")
    selected_limits = (
        ClassUnitEngineLimits(**limit_overrides) if limit_overrides else limits
    )
    if selected_limits is None:
        selected_limits = ClassUnitEngineLimits()
    proof_value = True if proof is None else bool(proof)
    use_cache = (
        cancelled is None
        and progress is None
        and checkpoint is None
        and resume_from is None
        and checkpoint_controller is None
        and components is None
    )
    cache_key = (
        proof_value,
        algorithm,
        seed,
        tuple(sorted(selected_limits.to_dict().items())),
    )
    cache = getattr(field, "_class_unit_engine_cache", None)
    if use_cache and isinstance(cache, dict) and cache_key in cache:
        return cache[cache_key]
    result = compute_class_unit_group(
        field,
        proof=proof_value,
        algorithm=algorithm,
        limits=selected_limits,
        seed=seed,
        cancelled=cancelled,
        progress=progress,
        checkpoint=checkpoint,
        resume_from=resume_from,
        checkpoint_controller=checkpoint_controller,
        max_checkpoint_bytes=max_checkpoint_bytes,
        components=components,
    )
    if use_cache:
        if not isinstance(cache, dict):
            cache = {}
            field._class_unit_engine_cache = cache
        cache[cache_key] = result
    return result


def class_group(
    field: Any,
    proof: bool | None = None,
    names: str = "c",
    algorithm: str = "auto",
    *,
    cancelled: Callable[[], bool] | None = None,
    progress: Callable[[dict[str, Any]], None] | None = None,
    checkpoint: Any = None,
    resume_from: Any = None,
    checkpoint_controller: Any = None,
    max_checkpoint_bytes: int | None = None,
    **limits: Any,
) -> Any:
    """Return the proved ordinary ideal class group of `field`."""
    del names
    result = class_unit_context(
        field,
        proof=proof,
        algorithm=algorithm,
        cancelled=cancelled,
        progress=progress,
        checkpoint=checkpoint,
        resume_from=resume_from,
        checkpoint_controller=checkpoint_controller,
        max_checkpoint_bytes=max_checkpoint_bytes,
        **limits,
    )
    raw_group = result.class_group()
    if not isinstance(raw_group, _EngineClassGroup):
        return raw_group
    maps = __import__(
        "sagejs.number_fields.class_group_maps", fromlist=["class_group_maps"]
    )
    adapter = maps.class_group_from_engine_result
    return adapter(result)


def class_number(
    field: Any,
    proof: bool | None = None,
    algorithm: str = "auto",
    *,
    cancelled: Callable[[], bool] | None = None,
    progress: Callable[[dict[str, Any]], None] | None = None,
    checkpoint: Any = None,
    resume_from: Any = None,
    checkpoint_controller: Any = None,
    max_checkpoint_bytes: int | None = None,
    **limits: Any,
) -> int:
    """Return the proved ordinary class number of `field`."""
    return class_unit_context(
        field,
        proof=proof,
        algorithm=algorithm,
        cancelled=cancelled,
        progress=progress,
        checkpoint=checkpoint,
        resume_from=resume_from,
        checkpoint_controller=checkpoint_controller,
        max_checkpoint_bytes=max_checkpoint_bytes,
        **limits,
    ).class_number()


def unit_group(
    field: Any,
    proof: bool | None = None,
    algorithm: str = "auto",
    *,
    cancelled: Callable[[], bool] | None = None,
    progress: Callable[[dict[str, Any]], None] | None = None,
    checkpoint: Any = None,
    resume_from: Any = None,
    checkpoint_controller: Any = None,
    max_checkpoint_bytes: int | None = None,
    **limits: Any,
) -> Any:
    """Return the complete ordinary unit group computation for `field`."""
    result = class_unit_context(
        field,
        proof=proof,
        algorithm=algorithm,
        cancelled=cancelled,
        progress=progress,
        checkpoint=checkpoint,
        resume_from=resume_from,
        checkpoint_controller=checkpoint_controller,
        max_checkpoint_bytes=max_checkpoint_bytes,
        **limits,
    )
    unit_result = result.unit_group()
    if not unit_result.complete:
        raise ValueError("the unit subgroup has not been proved complete")
    return unit_result


def units(
    field: Any,
    proof: bool | None = None,
    algorithm: str = "auto",
    *,
    cancelled: Callable[[], bool] | None = None,
    progress: Callable[[dict[str, Any]], None] | None = None,
    checkpoint: Any = None,
    resume_from: Any = None,
    checkpoint_controller: Any = None,
    max_checkpoint_bytes: int | None = None,
    **limits: Any,
) -> tuple[Any, ...]:
    """Return exact free unit generators for `field`."""
    result = unit_group(
        field,
        proof,
        algorithm,
        cancelled=cancelled,
        progress=progress,
        checkpoint=checkpoint,
        resume_from=resume_from,
        checkpoint_controller=checkpoint_controller,
        max_checkpoint_bytes=max_checkpoint_bytes,
        **limits,
    )
    return tuple(_value(result, ("generators", "gens"), ()))


def regulator(
    field: Any,
    prec: int = 53,
    proof: bool | None = None,
    algorithm: str = "auto",
    *,
    cancelled: Callable[[], bool] | None = None,
    progress: Callable[[dict[str, Any]], None] | None = None,
    checkpoint: Any = None,
    resume_from: Any = None,
    checkpoint_controller: Any = None,
    max_checkpoint_bytes: int | None = None,
    **limits: Any,
) -> Any:
    """Return the regulator result under a requested `prec`-bit policy."""
    precision = _positive(prec, "regulator precision")
    result = class_unit_context(
        field,
        proof=proof,
        algorithm=algorithm,
        cancelled=cancelled,
        progress=progress,
        checkpoint=checkpoint,
        resume_from=resume_from,
        checkpoint_controller=checkpoint_controller,
        max_checkpoint_bytes=max_checkpoint_bytes,
        **limits,
    )
    current = result.regulator()
    if int(current.precision_bits) >= precision:
        return current
    unit_result = result.unit_group()
    cache = getattr(unit_result, "_regulator_precision_cache", None)
    if not isinstance(cache, dict):
        cache = {int(current.precision_bits): current}
        unit_result._regulator_precision_cache = cache
    if precision not in cache:
        analytic = _optional_module("sagejs.number_fields.class_unit_analytic")
        if analytic is None:
            raise ImportError("the class/unit analytic module is unavailable")
        cache[precision] = analytic.regulator_from_factored_units(
            result.units(),
            unit_rank=int(unit_result.unit_rank),
            precision_bits=precision,
            maximum_precision_bits=max(1_024, precision),
        )
    return cache[precision]


__all__ = [
    "ClassUnitComputation",
    "ClassUnitEngineLimits",
    "ClassUnitGroupEngine",
    "ClassUnitSaturationRecord",
    "ClassUnitStage",
    "EXACT_RELATIONS_CONDITIONAL_GRH",
    "EXACT_UNCONDITIONAL",
    "INCOMPLETE_RESOURCE_LIMIT",
    "UnitGroupComputation",
    "class_group",
    "class_number",
    "class_unit_context",
    "class_unit_group",
    "compute_class_unit_group",
    "regulator",
    "unit_group",
    "units",
]
