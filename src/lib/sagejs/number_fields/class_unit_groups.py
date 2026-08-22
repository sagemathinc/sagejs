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
# Reusing the bounded cubic producer's unconditional Minkowski prefix avoids
# rebuilding a conditional BDF base and, when proof is requested, a second
# unconditional base.  Corpus measurements show a clear win through seven
# prime ideals and Minkowski bound 20.  Larger bases can make authenticated
# generation replay more expensive than fresh BDF discovery, so keep this a
# deliberately conservative live optimization policy.
MAX_DIRECT_CUBIC_RELATION_SEED_BOUND = 20
MAX_DIRECT_CUBIC_RELATION_SEED_SIZE = 7
MAX_UNCONDITIONAL_CUBIC_RELATION_SEED_SIZE = 10
MAX_RELATION_LOG_STEERING_RECORDS = 4_096

_AUTHENTICATED_CLASS_UNIT_SATURATION_TOKEN = object()
_AUTHENTICATED_ENGINE_CLASS_GROUP_TOKEN = object()
_CUBIC_RELATION_SEED_UNREAD = object()


def _factor_base_proof_status(plan: Any) -> str:
    """Derive discovery authority from the theorem and its assumptions."""
    if tuple(plan.assumptions):
        return EXACT_RELATIONS_CONDITIONAL_GRH
    if "Minkowski" not in str(plan.theorem):
        raise ArithmeticError(
            "an unconditional factor-base plan needs Minkowski authority"
        )
    return EXACT_UNCONDITIONAL


def _needs_unconditional_upgrade(requested_proof: bool, proof_status: str) -> bool:
    return bool(requested_proof and proof_status != EXACT_UNCONDITIONAL)


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


def _canonical_payload_hash(payload: Any) -> str:
    """Hash a tree already projected to canonical JSON scalar containers."""
    encoded = json.dumps(
        payload,
        allow_nan=False,
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _saturation_diagnostic_summary(record: Any) -> dict[str, Any]:
    """Return fixed-shape status without duplicating authenticated proof data."""
    certificate = getattr(record, "_analytic_certificate", None)
    workspace_diagnostics = getattr(certificate, "workspace_diagnostics", None)
    raw_counters: Any = (
        workspace_diagnostics() if callable(workspace_diagnostics) else None
    )
    counters: dict[str, int] = {}
    if isinstance(raw_counters, dict):
        for name in (
            "provider_calls",
            "regulator_cache_hits",
            "finite_term_cache_hits",
            "certificate_construction_calls",
            "certificate_replay_calls",
        ):
            value = raw_counters.get(name)
            if isinstance(value, int) and not isinstance(value, bool):
                counters[name] = int(value)
    complete = bool(getattr(record, "complete", False))
    return {
        "schema": "sagejs.number-fields/class-unit-saturation-summary-v1",
        "status": "complete" if complete else "bounded",
        "complete": complete,
        "rigorous": bool(getattr(record, "rigorous", False)),
        "index_bound": int(getattr(record, "index_bound", 1)),
        "remaining_index_bound": int(getattr(record, "remaining_index_bound", 1)),
        "content_sha256": str(getattr(record, "content_sha256", "")),
        "certificate_workspace": counters,
    }


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
        analytic_certificate: Any = None,
        analytic_generation_verifier: Any = None,
        producer_artifacts: Sequence[tuple[Any, Sequence[Any], Any, Any]] = (),
        analytic_module: Any = None,
        analytic_workspace: Any = None,
        reason: str = "",
    ) -> None:
        self.original_units = tuple(original_units)
        self.units = tuple(units)
        self.index_bound = max(1, int(index_bound))
        self.required_primes = tuple(sorted({int(value) for value in required_primes}))
        self.remaining_index_bound = max(1, int(remaining_index_bound))
        self.attempts = tuple(_component_payload(value) for value in attempts)
        self.analytic_validation = _component_payload(analytic_validation)
        self._analytic_certificate = analytic_certificate
        standard_certificate_type = getattr(
            analytic_module, "UnitSaturationIndexCertificate", None
        )
        if (
            standard_certificate_type is not None
            and type(analytic_certificate) is standard_certificate_type
        ):
            self._analytic_certificate_payload = analytic_certificate.to_dict()
        else:
            self._analytic_certificate_payload = _component_payload(
                analytic_certificate
            )
        self._analytic_generation_verifier = analytic_generation_verifier
        self._producer_artifacts = tuple(
            (artifact, tuple(before), torsion, generation_verifier)
            for artifact, before, torsion, generation_verifier in producer_artifacts
        )
        self._analytic_module = analytic_module
        self._analytic_workspace = analytic_workspace
        self.rigorous = bool(self.analytic_validation.get("rigorous"))
        self.complete = bool(
            self.rigorous
            and self._analytic_certificate is not None
            and int(self.analytic_validation.get("lower_index", 0)) == 1
            and int(self.analytic_validation.get("upper_index", 0)) == 1
            and self.remaining_index_bound == 1
        )
        self.saturated = self.complete
        self.reason = str(reason)
        self._field = field
        self._order = order
        body = self._body_dict()
        self.content_sha256 = _canonical_payload_hash(body)

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
            "analytic_certificate": self._analytic_certificate_payload,
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
        if _canonical_payload_hash(self._body_dict()) != self.content_sha256:
            return False
        one = selected_order.ideal(1)
        try:
            certificate = self._analytic_certificate
            replay_certificate = getattr(certificate, "verify", None)
            if not callable(replay_certificate):
                return False
            if int(_value(certificate, ("index_bound",), 0)) != int(
                self.remaining_index_bound
            ):
                return False
            if int(self.analytic_validation.get("lower_index", 0)) != int(
                self.remaining_index_bound
            ) or int(self.analytic_validation.get("upper_index", 0)) != int(
                self.remaining_index_bound
            ):
                return False
            if not bool(
                replay_certificate(
                    selected_field,
                    selected_order,
                    self.units,
                    generation_verifier=self._analytic_generation_verifier,
                )
            ):
                return False
            if any(unit.principal_ideal(selected_order) != one for unit in self.units):
                return False
            for (
                artifact,
                before,
                _torsion,
                generation_verifier,
            ) in self._producer_artifacts:
                verifier = getattr(
                    self._analytic_module, "verify_saturation_record", None
                )
                if callable(verifier):
                    accepted = verifier(
                        selected_field,
                        selected_order,
                        before,
                        artifact.to_dict(),
                        generation_verifier=generation_verifier,
                        workspace=self._analytic_workspace,
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


def _saturation_record_live_snapshot(record: Any) -> tuple[Any, ...]:
    """Snapshot the critical state crossing one synchronous engine boundary.

    The authority is consumed before the engine returns the record, so this
    state does not need to duplicate the large serialized certificate.  It
    binds every mathematical decision used at the terminal check plus the
    identities of the standard objects which made those decisions.  The
    public verifier remains the only reusable or detached verifier.
    """
    if type(record) is not ClassUnitSaturationRecord:
        raise TypeError("a live saturation record must have the exact record type")
    certificate = record._analytic_certificate
    analytic_proof = certificate._analytic_proof
    hr_index = analytic_proof["hr_index"]
    return (
        record.content_sha256,
        record.index_bound,
        record.required_primes,
        record.remaining_index_bound,
        id(record.attempts),
        id(record.analytic_validation),
        int(record.analytic_validation["lower_index"]),
        int(record.analytic_validation["upper_index"]),
        bool(record.analytic_validation["rigorous"]),
        record.rigorous,
        record.complete,
        record.saturated,
        record.reason,
        id(certificate),
        certificate._body_json,
        certificate._content_sha256,
        id(certificate._body_snapshot),
        id(certificate._field_order_identity),
        id(certificate._initial_units),
        id(certificate._configuration),
        id(analytic_proof),
        id(certificate._generation_evidence),
        certificate._index_bound,
        certificate._proof_status,
        int(hr_index["lower_index"]),
        int(hr_index["upper_index"]),
        int(hr_index["unique_index"]),
        bool(hr_index["rigorous"]),
        bool(analytic_proof["regulator"]["rigorous"]),
        bool(analytic_proof["zeta_log_residue"]["rigorous"]),
        id(record._analytic_generation_verifier),
        id(record._analytic_module),
        id(record._analytic_workspace),
        tuple(id(unit) for unit in record.original_units),
        tuple(id(unit) for unit in record.units),
        tuple(
            (
                id(artifact),
                tuple(id(unit) for unit in before),
                id(torsion),
                id(generation_verifier),
            )
            for artifact, before, torsion, generation_verifier in record._producer_artifacts
        ),
    )


class _AuthenticatedClassUnitSaturationRecord:
    """One non-serializable authority issued at the live engine boundary."""

    def __init__(self, token: object, record: ClassUnitSaturationRecord) -> None:
        if token is not _AUTHENTICATED_CLASS_UNIT_SATURATION_TOKEN:
            raise TypeError("live saturation authorities are module-issued")
        analytic = _optional_module("sagejs.number_fields.class_unit_analytic")
        certificate_type = getattr(analytic, "UnitSaturationIndexCertificate", None)
        workspace_type = getattr(analytic, "ZetaLogResidueWorkspace", None)
        if (
            record._analytic_module is not analytic
            or type(record._analytic_certificate) is not certificate_type
            or type(record._analytic_workspace) is not workspace_type
            or not record.complete
            or not record.rigorous
            or record.remaining_index_bound != 1
        ):
            raise ValueError(
                "only a complete standard analytic saturation record can be sealed"
            )
        self.__dict__["_record"] = record
        self.__dict__["_field"] = record._field
        self.__dict__["_order"] = record._order
        self.__dict__["_snapshot"] = _saturation_record_live_snapshot(record)
        self.__dict__["_frozen"] = True

    def __setattr__(self, name: str, value: Any) -> None:
        if self.__dict__.get("_frozen", False):
            raise AttributeError("live saturation authorities are immutable")
        self.__dict__[name] = value

    def consume(self, field: Any, order: Any) -> bool:
        try:
            if self.__dict__.get("_consumed", False):
                return False
            record = self.__dict__.get("_record")
            accepted = bool(
                type(record) is ClassUnitSaturationRecord
                and record._field is field
                and record._order is order
                and self.__dict__.get("_field") is field
                and self.__dict__.get("_order") is order
                and record.complete
                and record.rigorous
                and record.remaining_index_bound == 1
                and self.__dict__.get("_snapshot")
                == _saturation_record_live_snapshot(record)
            )
            self.__dict__["_consumed"] = True
            return accepted
        except (AttributeError, TypeError, ValueError, ArithmeticError):
            self.__dict__["_consumed"] = True
            return False


def _issue_live_saturation_record(record: ClassUnitSaturationRecord) -> bool:
    """Attach a private live authority when the canonical producer was used."""
    try:
        authority = _AuthenticatedClassUnitSaturationRecord(
            _AUTHENTICATED_CLASS_UNIT_SATURATION_TOKEN, record
        )
    except (AttributeError, TypeError, ValueError, ArithmeticError):
        return False
    record.__dict__["_live_authentication"] = authority
    return True


def _authenticated_live_saturation_record_matches(
    record: Any, field: Any, order: Any
) -> bool:
    """Recognize unchanged live evidence without detached arithmetic replay."""
    if type(record) is not ClassUnitSaturationRecord:
        return False
    authority = record.__dict__.pop("_live_authentication", None)
    return bool(
        type(authority) is _AuthenticatedClassUnitSaturationRecord
        and authority.__dict__.get("_record") is record
        and authority.consume(field, order)
    )


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
        relation_reconstructor: Any = None,
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
        self._relation_reconstructor = relation_reconstructor
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
        try:
            if not self._presentation.verify():
                return False
            presentation_rows = tuple(
                tuple(int(value) for value in row.dense())
                for row in self._presentation.relation_rows
            )
            relation_rows = tuple(
                tuple(int(value) for value in record.row) for record in self._relations
            )
            if relation_rows != presentation_rows:
                return False
            positions = tuple(self._presentation.invariant_positions)
            expected_generator_rows = tuple(
                tuple(
                    int(value)
                    for value in self._presentation.smith_right_inverse[position]
                )
                for position in positions
            )
            if self._generator_rows != expected_generator_rows or len(
                self._generator_ideals
            ) != len(expected_generator_rows):
                return False
            for record in self._relations:
                if self._relation_reconstructor is None:
                    replay = record.verify(self._order, self._factor_base)
                else:
                    replay = record.verify(
                        self._order,
                        self._factor_base,
                        reconstructor=self._relation_reconstructor,
                        admission_verifier=self._relation_reconstructor,
                    )
                if replay["certified"] is not True:
                    return False
            for generator in self._gens:
                if self(generator.ideal()) != generator:
                    return False
                if not (generator ** generator.order()).is_one():
                    return False
            return True
        except (KeyError, AttributeError, TypeError, ValueError, ArithmeticError):
            return False

    def _verify_live_construction(self, token: object) -> bool:
        """Authenticate the exact producer state without generic map replay.

        The engine has just built each generator ideal from its authenticated
        factor-base row.  Factoring that same ideal through the public map is
        a useful detached check, but it repeats exact ideal arithmetic at the
        live producer boundary.  Here we instead bind the retained collector,
        its admission receipts, the verified presentation, and every
        generator ideal to the exact row which constructed it.  Public and
        detached calls to `verify()` continue to exercise the generic ideal
        maps above.
        """
        if token is not _AUTHENTICATED_ENGINE_CLASS_GROUP_TOKEN:
            return False
        try:
            collector = self._relation_reconstructor
            if (
                collector is None
                or getattr(collector, "order", None) is not self._order
            ):
                return False
            retained_factors = tuple(getattr(collector, "factor_base", ()))
            if len(retained_factors) != len(self._factor_base) or any(
                retained is not supplied
                for retained, supplied in zip(
                    retained_factors, self._factor_base, strict=True
                )
            ):
                return False
            retained_relations = tuple(getattr(collector, "records", ()))
            if len(retained_relations) != len(self._relations) or any(
                retained is not supplied
                for retained, supplied in zip(
                    retained_relations, self._relations, strict=True
                )
            ):
                return False
            if not self._presentation.verify():
                return False
            presentation_rows = tuple(
                tuple(int(value) for value in row.dense())
                for row in self._presentation.relation_rows
            )
            relation_rows = tuple(
                tuple(int(value) for value in record.row) for record in self._relations
            )
            if relation_rows != presentation_rows:
                return False
            verify_admission = getattr(collector, "verify_admission_receipt", None)
            if not callable(verify_admission) or not all(
                verify_admission(self._order, self._factor_base, record)
                for record in self._relations
            ):
                return False

            positions = tuple(self._presentation.invariant_positions)
            expected_rows = tuple(
                tuple(
                    int(value)
                    for value in self._presentation.smith_right_inverse[position]
                )
                for position in positions
            )
            if expected_rows != self._generator_rows:
                return False
            reconstruct = getattr(collector, "reconstruct_factor_base_ideal", None)
            if not callable(reconstruct):
                return False
            if len(self._generator_ideals) != len(self._generator_rows):
                return False
            for index, (row, ideal) in enumerate(
                zip(self._generator_rows, self._generator_ideals, strict=True)
            ):
                if reconstruct(row) != ideal:
                    return False
                coordinates = tuple(
                    int(value) for value in self._presentation.class_coordinates(row)
                )
                expected_coordinates = tuple(
                    1 if coordinate == index else 0
                    for coordinate in range(len(self._invariants))
                )
                if coordinates != expected_coordinates:
                    return False
                if self._gens[index].order() != self._invariants[index]:
                    return False
            return True
        except (KeyError, AttributeError, TypeError, ValueError, ArithmeticError):
            return False


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
        self.conditional_relation_records = tuple(
            getattr(class_group, "_relations", ())
        )
        self.conditional_presentation_evidence = getattr(
            class_group, "_presentation", None
        )
        self.conditional_factor_base = tuple(getattr(class_group, "_factor_base", ()))
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
        self._analytic_workspace: Any = None
        self._factored_logarithm_workspace: Any = None
        factored_workspace_type = getattr(
            self.components.factored, "FactoredLogarithmWorkspace", None
        )
        if callable(factored_workspace_type):
            self._factored_logarithm_workspace = factored_workspace_type(self.field)
        workspace_type = getattr(
            self.components.analytic, "ZetaLogResidueWorkspace", None
        )
        if callable(workspace_type) and int(self.field.degree()) > 1:
            workspace_options: dict[str, Any] = {}
            if components is None:
                workspace_options["share_across_isomorphic_fields"] = True
            self._analytic_workspace = workspace_type(
                int(self.order.discriminant()),
                int(self.field.degree()),
                self.order.splitting_records,
                **workspace_options,
            )
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
            "unit_logarithm_requests": 0,
            "unit_logarithm_cache_hits": 0,
            "relation_log_rank_calls": 0,
            "relation_dependency_unit_requests": 0,
            "relation_dependency_unit_cache_hits": 0,
            "relation_dependency_unit_cache_entries": 0,
            "relation_dependency_units_seen": 0,
            "relation_independent_log_units": 0,
            "relation_log_steering_resets": 0,
            "relation_log_steering_fallbacks": 0,
            "relation_witness_decode_requests": 0,
            "relation_witness_decode_cache_hits": 0,
            "relation_witness_logarithm_requests": 0,
            "relation_witness_logarithm_cache_hits": 0,
            "dependency_unit_materializations": 0,
            "unit_principal_authority_requests": 0,
            "unit_principal_authority_hits": 0,
            "unit_principal_authority_fallbacks": 0,
            "presentation_extractions": 0,
            "saturation_rounds": 0,
            "proof_primes_completed": 0,
            "generation_verification_calls": 0,
            "generation_verification_cache_hits": 0,
            "generation_verification_live_authentication_hits": 0,
            "generation_verification_full_replays": 0,
            "generation_reconstruction_calls": 0,
            "generation_reconstruction_cache_hits": 0,
            "generation_admission_receipt_requests": 0,
            "generation_admission_receipt_hits": 0,
            "class_group_live_authentication_requests": 0,
            "class_group_live_authentication_hits": 0,
            "class_group_live_authentication_fallback_replays": 0,
            "cubic_relation_seed_uses": 0,
            "cubic_relation_seed_relations": 0,
            "cubic_factor_base_seed_uses": 0,
            "cubic_specialized_seed_skips": 0,
            "automorphism_orbit_plans": 0,
            "automorphism_orbit_available_plans": 0,
            "automorphism_orbit_useful_plans": 0,
            "automorphism_orbit_relations": 0,
            "automorphism_orbit_fixed_skips": 0,
            "automorphism_orbit_duplicate_skips": 0,
            "automorphism_orbit_recursive_skips": 0,
            "automorphism_orbit_limit_skips": 0,
            "saturation_live_authentication_requests": 0,
            "saturation_live_authentication_hits": 0,
            "saturation_live_authentication_fallback_replays": 0,
        }
        self._generation_verification_cache: dict[str, bool] = {}
        self._generation_verification_cache_active = True
        self._live_analytic_proof: tuple[Any, ...] | None = None
        self._unit_logarithm_cache: dict[tuple[int, str], tuple[Any, ...]] = {}
        self._relation_log_record_prefix: tuple[Any, ...] = ()
        self._relation_dependency_unit_hashes: dict[tuple[int, ...], str] = {}
        self._relation_seen_dependency_units: set[str] = set()
        self._relation_independent_logarithms: list[tuple[Any, ...]] = []
        self._relation_witness_cache: dict[int, tuple[Any, str, Any]] = {}
        self._relation_witness_logarithm_cache: dict[
            tuple[int, int], tuple[Any, str, tuple[Any, ...]]
        ] = {}
        self._authenticated_dependency_units: set[str] = set()
        self._partials: dict[tuple[Any, ...], _LargePrimePartial] = {}
        self._relation_unit_log_rank = 0
        self._relation_search_state: Any = None
        self._relation_matrix_accumulator: Any = None
        self._relation_presentation_policy: Any = None
        self._relation_presentation_record_count = 0
        self._automorphism_orbit_plans: list[tuple[tuple[Any, ...], Any]] = []
        self._proof_progress: Any = None
        self._proof_dependency_hashes: dict[str, str] = {}
        self._saturation_record: Any = None
        self._authenticated_cubic_relation_seed_cache: Any = _CUBIC_RELATION_SEED_UNREAD

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
        answer: dict[str, Any] = {
            "elapsed_seconds": self._elapsed_seconds(),
            "phase_timings": dict(self._phase_timings),
            "resources": dict(self._resource_usage),
            "limits": self.limits.to_dict(),
        }
        workspace_diagnostics = getattr(self._analytic_workspace, "diagnostics", None)
        if callable(workspace_diagnostics):
            answer["analytic_workspace"] = workspace_diagnostics()
        factored_diagnostics = getattr(
            self._factored_logarithm_workspace, "diagnostics", None
        )
        if callable(factored_diagnostics):
            answer["factored_logarithm_workspace"] = factored_diagnostics()
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
        if (
            self.field.degree() == 3
            and self._authenticated_cubic_relation_seed() is not None
        ):
            # The public bounded cubic producer has already completed the
            # same small-field decision and retained an exact relation prefix.
            # Re-running the unrelated bounded class enumeration and 125-term
            # unit box cannot complete this field and only delays the general
            # relation engine that consumes that authenticated prefix.
            self._resource_usage["cubic_specialized_seed_skips"] += 1
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
        factored_type = getattr(
            self.components.factored, "FactoredNumberFieldElement", None
        )
        regulator_producer = getattr(
            self._analytic_workspace, "regulator_from_factored_units", None
        )
        if not callable(regulator_producer):
            regulator_producer = getattr(
                self.components.analytic, "regulator_from_factored_units", None
            )
        if factored_type is None or not callable(regulator_producer):
            return None
        try:
            factored_units = tuple(
                factored_type.from_element(self.field, unit)
                for unit in tuple(units.generators)
            )
            regulator = regulator_producer(
                factored_units,
                unit_rank=int(units.unit_rank),
                precision_bits=self.limits.precision_bits,
                maximum_precision_bits=self.limits.max_precision_bits,
            )
        except (TypeError, ValueError, ArithmeticError):
            return None
        unit_group = UnitGroupComputation(
            units.torsion,
            factored_units,
            int(units.unit_rank),
            complete=True,
            regulator=regulator,
            reason="bounded specialized exact units with rigorous regulator",
            proof_status=EXACT_UNCONDITIONAL,
        )
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
            unit_group=unit_group,
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
        target_missing_pivots: bool = False,
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
            index = (
                missing[0]
                if target_missing_pivots and missing
                else (attempt + (self.seed % width)) % width
            )
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
        # The collector immediately authenticates the same source row during
        # witness admission.  Construct it through the collector-owned exact
        # cache so that admission observes an identity-preserving row hit
        # instead of rebuilding the prime powers and ideal product.
        ideal = search.collector.reconstruct_factor_base_ideal(source_row)
        return ideal, source_row, strategy

    def _search_relation_ideal(
        self,
        search: Any,
        ideal: Any,
        source_row: Sequence[int],
        provenance: dict[str, Any],
        large_prime_bound: int,
        stop_after: int = 2,
        stop_after_independent: bool = False,
    ) -> int:
        """Search one ideal while retaining bounded exact partial relations."""
        search.state.ideals_tested += 1
        admitted = 0
        independent_admitted = 0
        for sequence, element in enumerate(search.iter_short_elements(ideal)):
            self._check_cancelled()
            search.state.candidates_tested += 1
            candidate_provenance = {
                "algorithm": "exact-coefficient-lll",
                "seed": search.state.seed,
                "ideal_sequence": search.state.ideals_tested - 1,
                "candidate_sequence": sequence,
            }
            candidate_provenance.update(provenance)
            try:
                admission = search.collector.admit_witness(
                    element,
                    source_ideal=ideal,
                    source_row=source_row,
                    integral_generator=element,
                    provenance=candidate_provenance,
                )
            except self.components.relations.RelationNotSmoothError:
                witness = (
                    self.components.relations.FactoredPrincipalWitness.from_element(
                        element
                    )
                )
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
                if admission.modular_independent:
                    independent_admitted += 1
                search.state.relations_admitted += 1
                progress = independent_admitted if stop_after_independent else admitted
                if progress >= stop_after:
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
            "relations": _canonical_payload_hash(
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
            "presentation": _canonical_payload_hash(
                {
                    "schema": "sagejs.number-fields/proof-presentation-v1",
                    "presentation": _component_payload(presentation),
                }
            ),
            "generators": _canonical_payload_hash(
                {
                    "schema": "sagejs.number-fields/proof-generators-v1",
                    "ideals": [
                        _component_payload(ideal) for ideal in group.gens_ideals()
                    ],
                }
            ),
            "saturation": str(saturation.content_sha256),
        }

    def _automorphism_plan_for_factor_base(
        self, relations: Any, factor_base: tuple[Any, ...]
    ) -> Any:
        """Build at most one exact automorphism plan for each factor base."""
        for planned_factor_base, plan in self._automorphism_orbit_plans:
            if len(planned_factor_base) == len(factor_base) and all(
                left is right or left == right
                for left, right in zip(planned_factor_base, factor_base, strict=True)
            ):
                return plan
        planner = getattr(relations, "plan_automorphism_orbits", None)
        plan = planner(self.field, factor_base) if callable(planner) else None
        self._automorphism_orbit_plans.append((factor_base, plan))
        self._resource_usage["automorphism_orbit_plans"] += 1
        if plan is not None:
            available = bool(getattr(plan, "available", False))
            useful = bool(getattr(plan, "useful", False))
            if useful and not available:
                raise ArithmeticError(
                    "a useful automorphism-orbit plan must be available"
                )
            if available:
                self._resource_usage["automorphism_orbit_available_plans"] += 1
            if useful:
                self._resource_usage["automorphism_orbit_useful_plans"] += 1
        return plan

    def _admit_automorphism_orbits(
        self,
        collector: Any,
        plan: Any,
        newly_admitted: Sequence[Any],
    ) -> tuple[Any, ...]:
        """Admit one nonrecursive exact orbit image for each new parent."""
        if plan is None or not bool(getattr(plan, "available", False)):
            return ()
        if not bool(getattr(plan, "useful", False)):
            return ()
        admit = getattr(collector, "admit_automorphism_orbit", None)
        if not callable(admit):
            raise TypeError(
                "an exact relation collector lacks automorphism-orbit admission"
            )
        derived: list[Any] = []
        parents = tuple(newly_admitted)
        for parent_index, parent in enumerate(parents):
            provenance = getattr(parent, "provenance", None)
            if (
                isinstance(provenance, dict)
                and provenance.get("algorithm") == "quadratic-conjugation-orbit"
            ):
                self._resource_usage["automorphism_orbit_recursive_skips"] += 1
                continue
            if len(collector.records) >= self.limits.max_relations:
                self._resource_usage["automorphism_orbit_limit_skips"] += (
                    len(parents) - parent_index
                )
                break
            before = len(collector.records)
            try:
                admission = admit(parent, plan=plan)
            except ValueError as error:
                if "already admitted" not in str(error):
                    raise
                self._resource_usage["automorphism_orbit_duplicate_skips"] += 1
                continue
            after = len(collector.records)
            if admission is None:
                if after != before:
                    raise ArithmeticError(
                        "a skipped automorphism orbit changed the relation collector"
                    )
                self._resource_usage["automorphism_orbit_fixed_skips"] += 1
                continue
            if after != before + 1:
                raise ArithmeticError(
                    "an automorphism orbit must admit exactly one derived relation"
                )
            record = getattr(admission, "record", collector.records[-1])
            if record is not collector.records[-1]:
                raise ArithmeticError(
                    "an automorphism admission did not return the appended relation"
                )
            derived.append(record)
        self._resource_usage["automorphism_orbit_relations"] += len(derived)
        return tuple(derived)

    def _relations(
        self,
        factor_base: tuple[Any, ...],
        unit_rank: int,
        *,
        collector: Any = None,
        presentation: Any = None,
        minimum_dependencies: int | None = None,
        saturation_prime: int | None = None,
        relations_per_ideal: int = 2,
        independent_relations_per_ideal: bool = False,
        target_missing_pivots: bool = False,
    ) -> tuple[Any, Any]:
        """Collect exact relations, deferring dense transforms in safe batches."""
        relations_per_ideal = _positive(relations_per_ideal, "relations_per_ideal")
        started = self._phase_start()
        relations = self.components.relations
        matrix_module = self.components.matrix
        automorphism_plan = self._automorphism_plan_for_factor_base(
            relations, factor_base
        )
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
                before_initial = len(collector.records)
                relations.initial_rational_prime_relations(collector)
                if len(collector.records) > self.limits.max_relations:
                    raise ValueError("exact relation count exceeds max_relations")
                self._admit_automorphism_orbits(
                    collector,
                    automorphism_plan,
                    tuple(collector.records[before_initial:]),
                )
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
        # Initial discovery needs a full relation-matrix rank and enough
        # independent logarithmic units.  Extra dependencies are not a proof
        # boundary: rigorous hR index-one certification below proves
        # completeness, while adaptive saturation requests an explicit larger
        # dependency target whenever the certified index is not one.
        dependency_target = (
            unit_rank
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
                relation_ideal_options: dict[str, Any] = {}
                if target_missing_pivots:
                    relation_ideal_options["target_missing_pivots"] = True
                ideal, source_row, strategy = self._relation_ideal(
                    search,
                    factor_base,
                    attempts,
                    coefficient_bound,
                    **relation_ideal_options,
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
            search_options: dict[str, Any] = {"stop_after": relations_per_ideal}
            if independent_relations_per_ideal:
                search_options["stop_after_independent"] = True
            self._search_relation_ideal(
                search,
                ideal,
                source_row,
                {
                    "relation_attempt": attempts,
                    "ideal_strategy": strategy,
                },
                large_prime_bound,
                **search_options,
            )
            attempts += 1
            if len(collector.records) > self.limits.max_relations:
                raise ValueError("exact relation count exceeds max_relations")
            parents = tuple(collector.records[before:])
            derived = self._admit_automorphism_orbits(
                collector, automorphism_plan, parents
            )
            if derived:
                search.state.relations_admitted += len(derived)
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
            if derived:
                self._checkpoint_capture(
                    {
                        "relations": tuple(collector.records),
                        "search_state": search.state,
                    }
                )
            else:
                if len(collector.records) != before:
                    for record in collector.records[before:]:
                        self._checkpoint_capture({"relation": record})
                self._checkpoint_capture({"search_state": search.state})
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
            automorphism_plan_available=bool(
                getattr(automorphism_plan, "available", False)
            ),
            automorphism_plan_useful=bool(getattr(automorphism_plan, "useful", False)),
            automorphism_relations=int(
                self._resource_usage["automorphism_orbit_relations"]
            ),
            search_state=search.state.to_dict(),
        )
        return collector, presentation

    def _unit_logarithmic_rank(
        self, records: Sequence[Any], presentation: Any, unit_rank: int
    ) -> int:
        """Return a monotone observed rank of exact dependency units.

        Relation collection only appends authenticated records.  A dependency
        unit from an earlier exact presentation therefore remains an exact
        unit after later rows are appended (its coefficient vector is padded
        by zeroes).  Retaining an independent logarithm basis avoids rebuilding
        and reevaluating every earlier dependency at each presentation.

        This state only steers the producer search.  The final unit basis,
        regulator, analytic index, and detached certificate replay remain the
        rigorous completion boundary.
        """
        self._resource_usage["relation_log_rank_calls"] += 1
        if unit_rank == 0:
            return 0
        record_prefix = tuple(records)
        cached_prefix = self._relation_log_record_prefix
        extends_prefix = len(cached_prefix) <= len(record_prefix)
        if extends_prefix:
            for index, cached in enumerate(cached_prefix):
                if cached is not record_prefix[index]:
                    extends_prefix = False
                    break
        if not extends_prefix:
            self._reset_relation_log_steering()
        if len(record_prefix) > MAX_RELATION_LOG_STEERING_RECORDS:
            self._resource_usage["relation_log_steering_fallbacks"] += 1
            return self._uncached_unit_logarithmic_rank(
                record_prefix, presentation, unit_rank
            )
        self._relation_log_record_prefix = record_prefix
        logarithms = self._relation_independent_logarithms
        current_rank = len(logarithms)
        for dependency in presentation.dependency_transforms:
            if current_rank >= unit_rank:
                break
            self._resource_usage["relation_dependency_unit_requests"] += 1
            normalized = [int(value) for value in dependency]
            while normalized and normalized[-1] == 0:
                normalized.pop()
            dependency_key = tuple(normalized)
            unit_hash = self._relation_dependency_unit_hashes.get(dependency_key)
            unit = None
            if unit_hash is None:
                unit = self._combine(record_prefix, dependency)
                stable_hash = getattr(unit, "stable_hash", None)
                if not callable(stable_hash):
                    self._resource_usage["relation_log_steering_fallbacks"] += 1
                    self._reset_relation_log_steering()
                    return self._uncached_unit_logarithmic_rank(
                        record_prefix, presentation, unit_rank
                    )
                unit_hash = str(stable_hash())
                if (
                    len(self._relation_dependency_unit_hashes)
                    < MAX_RELATION_LOG_STEERING_RECORDS
                ):
                    self._relation_dependency_unit_hashes[dependency_key] = unit_hash
            else:
                self._resource_usage["relation_dependency_unit_cache_hits"] += 1
            if unit_hash in self._relation_seen_dependency_units:
                continue
            if (
                len(self._relation_seen_dependency_units)
                >= MAX_RELATION_LOG_STEERING_RECORDS
            ):
                self._resource_usage["relation_log_steering_fallbacks"] += 1
                self._reset_relation_log_steering()
                return self._uncached_unit_logarithmic_rank(
                    record_prefix, presentation, unit_rank
                )
            self._relation_seen_dependency_units.add(unit_hash)
            if unit is None:
                unit = self._combine(record_prefix, dependency)
            row = tuple(self._unit_logarithms(unit, 80)[:-1])
            candidate = [*logarithms, row]
            candidate_rank = _floating_matrix_rank(candidate)
            if candidate_rank > current_rank:
                logarithms.append(row)
                current_rank = candidate_rank
        self._resource_usage["relation_dependency_unit_cache_entries"] = len(
            self._relation_dependency_unit_hashes
        )
        self._resource_usage["relation_dependency_units_seen"] = len(
            self._relation_seen_dependency_units
        )
        self._resource_usage["relation_independent_log_units"] = len(logarithms)
        return min(unit_rank, current_rank)

    def _reset_relation_log_steering(self) -> None:
        """Drop producer-only logarithm state when the relation lineage changes."""
        if (
            self._relation_log_record_prefix
            or self._relation_dependency_unit_hashes
            or self._relation_seen_dependency_units
            or self._relation_independent_logarithms
        ):
            self._resource_usage["relation_log_steering_resets"] += 1
        self._relation_log_record_prefix = ()
        self._relation_dependency_unit_hashes.clear()
        self._relation_seen_dependency_units.clear()
        self._relation_independent_logarithms.clear()

    def _uncached_unit_logarithmic_rank(
        self, records: Sequence[Any], presentation: Any, unit_rank: int
    ) -> int:
        """Evaluate a complete presentation without retaining steering state."""
        logarithms = []
        for dependency in presentation.dependency_transforms:
            unit = self._combine(records, dependency)
            logarithms.append(list(self._unit_logarithms(unit, 80)[:-1]))
        return min(unit_rank, _floating_matrix_rank(logarithms))

    def _unit_logarithms(self, unit: Any, precision: int) -> tuple[Any, ...]:
        """Return one bounded computation-local logarithm vector."""
        self._resource_usage["unit_logarithm_requests"] += 1
        stable_hash = getattr(unit, "stable_hash", None)
        if not callable(stable_hash):
            return tuple(
                unit.archimedean_logarithms(
                    precision, workspace=self._factored_logarithm_workspace
                )
            )
        key = (precision, str(stable_hash()))
        cached = self._unit_logarithm_cache.get(key)
        if cached is not None:
            self._resource_usage["unit_logarithm_cache_hits"] += 1
            return cached
        answer = tuple(
            unit.archimedean_logarithms(
                precision, workspace=self._factored_logarithm_workspace
            )
        )
        if len(self._unit_logarithm_cache) >= 256:
            self._unit_logarithm_cache.pop(next(iter(self._unit_logarithm_cache)))
        self._unit_logarithm_cache[key] = answer
        return answer

    def _relation_witness_logarithms(
        self, record: Any, precision: int
    ) -> tuple[Any, ...]:
        """Return one mutation-safe cached logarithm vector for a witness."""
        self._resource_usage["relation_witness_logarithm_requests"] += 1
        witness_key = json.dumps(record.witness, sort_keys=True, separators=(",", ":"))
        cache_key = (id(record), int(precision))
        cached = self._relation_witness_logarithm_cache.get(cache_key)
        if cached is not None and cached[0] is record and cached[1] == witness_key:
            self._resource_usage["relation_witness_logarithm_cache_hits"] += 1
            return cached[2]
        witness = self._decode_relation_witness(record)
        if self.components.factored is None:
            unit = witness
        else:
            unit = self.components.factored.FactoredNumberFieldElement(
                self.field, witness.factors()
            )
        answer = tuple(
            _floating_value(value) for value in self._unit_logarithms(unit, precision)
        )
        if (
            len(self._relation_witness_logarithm_cache)
            >= MAX_RELATION_LOG_STEERING_RECORDS
        ):
            self._relation_witness_logarithm_cache.pop(
                next(iter(self._relation_witness_logarithm_cache))
            )
        self._relation_witness_logarithm_cache[cache_key] = (
            record,
            witness_key,
            answer,
        )
        return answer

    def _dependency_logarithms(
        self,
        records: Sequence[Any],
        dependency: Sequence[int],
        precision: int,
    ) -> tuple[Any, ...]:
        """Combine cached witness logs without materializing a factored unit."""
        answer: list[float] | None = None
        for record, coefficient in zip(records, dependency, strict=True):
            coefficient = int(coefficient)
            if coefficient == 0:
                continue
            logarithms = self._relation_witness_logarithms(record, precision)
            if answer is None:
                answer = [0.0 for _value in logarithms]
            for index, value in enumerate(logarithms):
                answer[index] += value * coefficient
        if answer is None:
            raise ArithmeticError("a relation dependency cannot be the zero vector")
        return tuple(answer)

    def _select_dependency_unit_basis(
        self,
        records: Sequence[Any],
        dependencies: Sequence[Sequence[int]],
        unit_rank: int,
    ) -> tuple[tuple[Any, ...], tuple[tuple[int, ...], ...]]:
        """Select dependency rows by cached logs, then materialize only the basis."""
        logarithms = [
            list(self._dependency_logarithms(records, dependency, 80)[:-1])
            for dependency in dependencies
        ]
        best: tuple[int, ...] = ()
        best_volume: float | None = None
        checked = 0
        for indices in _index_combinations(len(dependencies), unit_rank):
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
            return (), ()
        selected_dependencies = tuple(
            tuple(int(value) for value in dependencies[index]) for index in best
        )
        units = tuple(
            self._combine(records, dependency) for dependency in selected_dependencies
        )
        self._resource_usage["dependency_unit_materializations"] += len(units)
        return units, selected_dependencies

    def _decode_relation_witness(self, record: Any) -> Any:
        """Decode one live witness with a bounded mutation-safe memo."""
        self._resource_usage["relation_witness_decode_requests"] += 1
        witness_key = json.dumps(record.witness, sort_keys=True, separators=(",", ":"))
        record_key = id(record)
        cached = self._relation_witness_cache.get(record_key)
        if cached is not None and cached[0] is record and cached[1] == witness_key:
            self._resource_usage["relation_witness_decode_cache_hits"] += 1
            return cached[2]
        witness = self.components.relations.FactoredPrincipalWitness.from_dict(
            self.field, record.witness
        )
        if len(self._relation_witness_cache) >= MAX_RELATION_LOG_STEERING_RECORDS:
            self._relation_witness_cache.pop(next(iter(self._relation_witness_cache)))
        self._relation_witness_cache[record_key] = (record, witness_key, witness)
        return witness

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
        self, collector: Any, presentation: Any, unit_rank: int
    ) -> tuple[Any, ...]:
        started = self._phase_start()
        if unit_rank == 0:
            self._phase_finish("unit-recovery", started)
            self._stage("unit-recovery", "complete", rank=0, candidates=0)
            return ()
        if not presentation.verify():
            raise ArithmeticError("the relation presentation failed exact replay")
        records = tuple(collector.records)
        admission_verifier = getattr(collector, "verify_admission_receipt", None)
        live_relations_authenticated = callable(admission_verifier) and all(
            admission_verifier(self.order, collector.factor_base, record)
            for record in records
        )
        dependencies = tuple(presentation.dependency_transforms)
        for dependency in presentation.dependency_transforms:
            if len(dependency) != len(records):
                raise ArithmeticError("a relation dependency has the wrong exact width")
        units, selected_dependencies = self._select_dependency_unit_basis(
            records, dependencies, unit_rank
        )
        if live_relations_authenticated:
            for dependency, unit in zip(selected_dependencies, units, strict=True):
                relation_row = [0] * len(collector.factor_base)
                for coefficient, record in zip(dependency, records, strict=True):
                    if len(record.row) != len(relation_row):
                        raise ArithmeticError(
                            "an authenticated relation has the wrong exact width"
                        )
                    for index, value in enumerate(record.row):
                        relation_row[index] += int(coefficient) * int(value)
                stable_hash = getattr(unit, "stable_hash", None)
                if not any(relation_row) and callable(stable_hash):
                    if len(self._authenticated_dependency_units) >= 1024:
                        self._authenticated_dependency_units.pop()
                    self._authenticated_dependency_units.add(str(stable_hash()))
        if not units:
            self._phase_finish("unit-recovery", started)
            self._stage(
                "unit-recovery",
                "bounded",
                rank=unit_rank,
                candidates=len(dependencies),
            )
            return ()
        self._verify_exact_units(units)
        self._phase_finish("unit-recovery", started)
        self._stage(
            "unit-recovery",
            "complete",
            rank=unit_rank,
            candidates=len(dependencies),
        )
        return units

    def _select_unit_basis(
        self, candidates: Sequence[Any], unit_rank: int
    ) -> tuple[Any, ...]:
        """Select a smallest observed full-rank logarithmic sublattice basis."""
        if unit_rank == 0:
            return ()
        logarithms = [list(self._unit_logarithms(unit, 80)[:-1]) for unit in candidates]
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
            self._resource_usage["unit_principal_authority_requests"] += 1
            stable_hash = getattr(unit, "stable_hash", None)
            if (
                callable(stable_hash)
                and str(stable_hash()) in self._authenticated_dependency_units
            ):
                self._resource_usage["unit_principal_authority_hits"] += 1
                continue
            self._resource_usage["unit_principal_authority_fallbacks"] += 1
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
        workspace_regulator = getattr(
            self._analytic_workspace, "regulator_from_factored_units", None
        )
        if callable(workspace_regulator):
            regulator = workspace_regulator(
                units,
                unit_rank=unit_rank,
                precision_bits=self.limits.precision_bits,
                maximum_precision_bits=self.limits.max_precision_bits,
            )
        else:
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
        zeta_options: dict[str, Any] = {
            "precision_bits": self.limits.precision_bits,
            "limits": zeta_limits,
        }
        if self._analytic_workspace is not None:
            zeta_options["workspace"] = self._analytic_workspace
        zeta = analytic.zeta_log_residue_bound(
            int(self.order.discriminant()),
            int(self.field.degree()),
            self.order.splitting_records,
            **zeta_options,
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
        self._live_analytic_proof = (
            tuple(units),
            int(presentation.order),
            int(torsion.order),
            regulator,
            zeta,
            index,
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
        *,
        _defer_live_authentication: bool = False,
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
        cache_key = _canonical_payload_hash(
            {
                "evidence": canonical,
                "class_number": int(presentation.order),
                "proof_status": proof_status,
            }
        )
        live_authority_available = True

        def verify_generation(
            field: Any,
            order: Any,
            initial_units: Sequence[Any],
            class_number: Any,
            supplied_evidence: Any,
            supplied_proof_status: str,
        ) -> bool:
            nonlocal live_authority_available
            del initial_units
            try:
                self._resource_usage["generation_verification_calls"] += 1
                if field is not self.field or order is not self.order:
                    return False
                if supplied_proof_status != proof_status or int(class_number) != int(
                    presentation.order
                ):
                    return False
                if (
                    self._generation_verification_cache_active
                    and live_authority_available
                    and supplied_evidence is evidence
                ):
                    # This first call is made synchronously by this producer,
                    # before the authority escapes.  The plan, factor base,
                    # exact relations, and presentation are the identical
                    # objects just constructed by the engine.  Consume the
                    # authority once and make every later call authenticate
                    # the canonical payload or perform detached replay.
                    live_authority_available = False
                    self._generation_verification_cache[cache_key] = True
                    self._resource_usage[
                        "generation_verification_live_authentication_hits"
                    ] += 1
                    return True
                if _component_payload(supplied_evidence) != canonical:
                    return False
                if (
                    self._generation_verification_cache_active
                    and self._generation_verification_cache.get(cache_key) is True
                ):
                    self._resource_usage["generation_verification_cache_hits"] += 1
                    return True
                self._resource_usage["generation_verification_full_replays"] += 1
                if not presentation.verify():
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
                reconstruction_diagnostics = getattr(
                    collector, "reconstruction_diagnostics", None
                )
                receipt_diagnostics = getattr(
                    collector, "admission_receipt_diagnostics", None
                )
                reconstruct = getattr(collector, "reconstruct_factor_base_ideal", None)
                before_reconstruction: Any = (
                    reconstruction_diagnostics()
                    if callable(reconstruction_diagnostics)
                    else None
                )
                before_receipts: Any = (
                    receipt_diagnostics() if callable(receipt_diagnostics) else None
                )
                try:
                    for record in collector.records:
                        if callable(reconstruct):
                            replay = record.verify(
                                order,
                                factor_base,
                                reconstructor=collector,
                                admission_verifier=collector,
                            )
                        else:
                            replay = record.verify(order, factor_base)
                        if replay["certified"] is not True:
                            return False
                finally:
                    after_reconstruction: Any = (
                        reconstruction_diagnostics()
                        if callable(reconstruction_diagnostics)
                        else None
                    )
                    if isinstance(before_reconstruction, dict) and isinstance(
                        after_reconstruction, dict
                    ):
                        self._resource_usage["generation_reconstruction_calls"] += int(
                            after_reconstruction.get("row_requests", 0)
                        ) - int(before_reconstruction.get("row_requests", 0))
                        self._resource_usage[
                            "generation_reconstruction_cache_hits"
                        ] += int(after_reconstruction.get("row_hits", 0)) - int(
                            before_reconstruction.get("row_hits", 0)
                        )
                    after_receipts: Any = (
                        receipt_diagnostics() if callable(receipt_diagnostics) else None
                    )
                    if isinstance(before_receipts, dict) and isinstance(
                        after_receipts, dict
                    ):
                        self._resource_usage[
                            "generation_admission_receipt_requests"
                        ] += int(after_receipts.get("requests", 0)) - int(
                            before_receipts.get("requests", 0)
                        )
                        self._resource_usage["generation_admission_receipt_hits"] += (
                            int(after_receipts.get("hits", 0))
                            - int(before_receipts.get("hits", 0))
                        )
                if self._generation_verification_cache_active:
                    self._generation_verification_cache[cache_key] = True
                return True
            except (AttributeError, TypeError, ValueError, ArithmeticError):
                return False

        if not _defer_live_authentication:
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

            authority = self._unit_index_certificate(
                units,
                torsion,
                class_number,
                generation_evidence,
                generation_verifier,
                proof_status,
            )
            if authority is None:
                attempt["reason"] = (
                    "no authenticated class/unit index certificate producer is installed"
                )
                return units, None, attempt
            attempt["index_certificate"] = _component_payload(authority)
            result = producer(
                self.field,
                self.order,
                units,
                authority,
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
                replayed = bool(
                    module_verifier(
                        self.field,
                        self.order,
                        units,
                        result_payload,
                        generation_verifier=generation_verifier,
                        workspace=self._analytic_workspace,
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

    def _unit_index_certificate(
        self,
        units: tuple[Any, ...],
        torsion: Any,
        class_number: int,
        generation_evidence: Any,
        generation_verifier: Any,
        proof_status: str,
    ) -> Any:
        """Bind an `h*R` index to exact units and class-generation evidence."""
        certificate_factory = getattr(
            self.components.analytic, "certify_unit_saturation_index", None
        )
        if not callable(certificate_factory):
            return None
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
        options: dict[str, Any] = {
            "class_number": class_number,
            "roots_of_unity": int(_value(torsion, ("order",), 0)),
            "precision_bits": self.limits.precision_bits,
            "maximum_precision_bits": self.limits.max_precision_bits,
            "zeta_limits": zeta_limits,
            "workspace": self._analytic_workspace,
            "generation_evidence": generation_evidence,
            "generation_verifier": generation_verifier,
            "proof_status": proof_status,
        }
        live_proof = self._live_analytic_proof
        standard_analytic = _optional_module("sagejs.number_fields.class_unit_analytic")
        if (
            live_proof is not None
            and self.components.analytic is standard_analytic
            and certificate_factory
            is getattr(standard_analytic, "certify_unit_saturation_index", None)
        ):
            (
                live_units,
                live_class_number,
                live_torsion_order,
                live_regulator,
                live_zeta,
                live_index,
            ) = live_proof
            if (
                len(live_units) == len(units)
                and all(
                    retained is supplied
                    for retained, supplied in zip(live_units, units, strict=True)
                )
                and live_class_number == int(class_number)
                and live_torsion_order == int(_value(torsion, ("order",), 0))
            ):
                options["_precomputed_regulator"] = live_regulator
                options["_precomputed_zeta_log_residue"] = live_zeta
                options["_precomputed_index"] = live_index
        return certificate_factory(
            self.field,
            self.order,
            units,
            **options,
        )

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
        prefer_relation_saturation = bool(
            int(self.field.degree()) == 3
            and self._resource_usage["cubic_relation_seed_uses"] > 0
        )

        def current_generation_authority() -> tuple[Any, Any]:
            if plan is not None:
                return self._generation_authority(
                    plan,
                    factor_base,
                    collector,
                    presentation,
                    proof_status,
                    _defer_live_authentication=True,
                )
            evidence = {"schema": "sagejs.number-fields/duck-generation-authority-v1"}

            def verifier(*args: Any, **kwargs: Any) -> bool:
                del args, kwargs
                return True

            return evidence, verifier

        def try_unit_saturation(round_index: int) -> bool:
            nonlocal units, torsion, regulator, index
            before_units = units
            generation_evidence, generation_verifier = current_generation_authority()
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
                return True
            return False

        for round_index in range(self.limits.max_saturation_rounds):
            if index.index_one:
                break
            self._check_cancelled()
            self._resource_usage["saturation_rounds"] = round_index + 1
            bound = max(1, int(index.upper_index))
            required_primes.update(_prime_divisors(bound))
            if not prefer_relation_saturation:
                try_unit_saturation(round_index)
                if index.index_one:
                    break

            relation_progress = False
            for prime in _prime_divisors(max(1, int(index.upper_index))):
                if int(index.upper_index) % prime:
                    continue
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
                    collector, presentation, unit_rank
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
                unit_progress = (
                    try_unit_saturation(round_index)
                    if prefer_relation_saturation
                    else False
                )
                if unit_progress and not index.index_one:
                    continue
                break
            if (
                prefer_relation_saturation
                and relation_progress
                and not index.index_one
                and round_index + 1 == self.limits.max_saturation_rounds
            ):
                try_unit_saturation(round_index)

        analytic_validation = self._analytic_validation_payload(index, regulator)
        final_generation_evidence, final_generation_verifier = (
            current_generation_authority()
        )
        analytic_certificate = self._unit_index_certificate(
            units,
            torsion,
            int(_value(presentation, ("order",), 1)),
            final_generation_evidence,
            final_generation_verifier,
            proof_status,
        )
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
            analytic_certificate=analytic_certificate,
            analytic_generation_verifier=final_generation_verifier,
            producer_artifacts=artifacts,
            analytic_module=self.components.analytic,
            analytic_workspace=self._analytic_workspace,
            reason=(
                "rigorous hR index-one validation after bounded saturation"
                if index.index_one
                else "bounded saturation did not isolate class/unit index one"
            ),
        )
        _issue_live_saturation_record(record)
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
            collector,
        )
        self._resource_usage["class_group_live_authentication_requests"] += 1
        live_verified = group._verify_live_construction(
            _AUTHENTICATED_ENGINE_CLASS_GROUP_TOKEN
        )
        if live_verified:
            self._resource_usage["class_group_live_authentication_hits"] += 1
        else:
            self._resource_usage[
                "class_group_live_authentication_fallback_replays"
            ] += 1
        if not live_verified and not group.verify():
            raise ArithmeticError("class-group ideal maps failed exact replay")
        self._phase_finish("class-group", started)
        self._stage(
            "class-group",
            "complete",
            invariants=tuple(int(value) for value in presentation.invariants),
        )
        return group

    def _authenticated_cubic_relation_seed(self) -> Any:
        """Read the live class-only relation prefix without replaying it."""
        if self.algorithm not in ("auto", "minkowski"):
            return None
        if (
            self._authenticated_cubic_relation_seed_cache
            is not _CUBIC_RELATION_SEED_UNREAD
        ):
            return self._authenticated_cubic_relation_seed_cache
        artifact = getattr(self.field, "_bounded_cubic_class_number_artifact", None)
        if artifact is None:
            self._authenticated_cubic_relation_seed_cache = None
            return None
        try:
            module = __import__(
                "sagejs.number_fields.cubic_class_number",
                fromlist=["cubic_class_number"],
            )
            reader = getattr(module, "authenticated_cubic_relation_seed", None)
            seed: Any = reader(artifact, self.field) if callable(reader) else None
            self._authenticated_cubic_relation_seed_cache = seed
            return seed
        except (AttributeError, ImportError, TypeError, ValueError, ArithmeticError):
            self._authenticated_cubic_relation_seed_cache = None
            return None

    def _direct_cubic_relation_seed(self) -> Any:
        """Reuse a tiny authenticated Minkowski base under the default policy."""
        if (
            self.algorithm != "auto"
            or self.seed != 0
            or self.checkpoint_controller is not None
            or self.limits.to_dict() != ClassUnitEngineLimits().to_dict()
        ):
            return None
        seed = self._authenticated_cubic_relation_seed()
        if seed is None:
            return None
        try:
            maximum_size = (
                MAX_UNCONDITIONAL_CUBIC_RELATION_SEED_SIZE
                if self.proof
                else MAX_DIRECT_CUBIC_RELATION_SEED_SIZE
            )
            if (
                seed.plan.order is self.order
                and not tuple(seed.plan.assumptions)
                and "Minkowski" in str(seed.plan.theorem)
                and int(seed.plan.bound) <= MAX_DIRECT_CUBIC_RELATION_SEED_BOUND
                and len(seed.factor_base) <= maximum_size
            ):
                return seed
        except (AttributeError, TypeError, ValueError, ArithmeticError):
            pass
        return None

    def _cubic_relation_seed(self, plan: Any, factor_base: tuple[Any, ...]) -> Any:
        """Return an authenticated class-only relation prefix when compatible."""
        seed = self._authenticated_cubic_relation_seed()
        if seed is None:
            return None
        try:
            if (
                seed.plan.order is not self.order
                or int(seed.plan.bound) != int(plan.bound)
                or tuple(seed.plan.assumptions)
                or "Minkowski" not in str(seed.plan.theorem)
                or "Minkowski" not in str(plan.theorem)
                or len(seed.factor_base) != len(factor_base)
                or any(
                    retained != rebuilt
                    for retained, rebuilt in zip(
                        seed.factor_base, factor_base, strict=True
                    )
                )
            ):
                return None
            return seed
        except (AttributeError, ImportError, TypeError, ValueError, ArithmeticError):
            return None

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
            relation_seed = self._direct_cubic_relation_seed()
            if relation_seed is None:
                plan, factor_base = self._factor_base(proof=discovery_proof)
                relation_seed = self._cubic_relation_seed(plan, factor_base)
            else:
                started = self._phase_start()
                plan = relation_seed.plan
                factor_base = relation_seed.factor_base
                self._resource_usage["cubic_factor_base_seed_uses"] += 1
                self._phase_finish("factor-base", started)
                self._stage(
                    "factor-base",
                    "complete",
                    theorem=plan.theorem,
                    assumptions=list(plan.assumptions),
                    bound=int(plan.bound),
                    size=len(factor_base),
                    reused_cubic_seed=True,
                )
            # In cubic fields, retaining a second smooth witness from the same
            # short-vector enumeration costs more exact ideal admission and
            # replay work than it saves in lattice setup.  The stopping rule
            # below still requires full relation rank, the full logarithmic
            # unit rank, and rigorous index one.  Other degrees keep two
            # admissions per ideal because their LLL/enumeration setup is the
            # dominant cost and should be amortized across useful witnesses.
            initial_relations_per_ideal = 1 if int(self.field.degree()) == 3 else 2
            if relation_seed is None:
                collector, presentation = self._relations(
                    factor_base,
                    unit_rank,
                    relations_per_ideal=initial_relations_per_ideal,
                )
            else:
                plan = relation_seed.plan
                factor_base = relation_seed.factor_base
                self._relation_search_state = relation_seed.search_state
                self._resource_usage["cubic_relation_seed_uses"] += 1
                self._resource_usage["cubic_relation_seed_relations"] += len(
                    relation_seed.collector.records
                )
                collector, presentation = self._relations(
                    factor_base,
                    unit_rank,
                    collector=relation_seed.collector,
                    presentation=relation_seed.presentation,
                    relations_per_ideal=initial_relations_per_ideal,
                )
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
            units = self._independent_units(collector, presentation, unit_rank)
            torsion, regulator, index = self._analytic_index(
                presentation, units, unit_rank
            )
            initial_proof_status = _factor_base_proof_status(plan)
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
                proof_status=initial_proof_status,
            )
            try:
                self._resource_usage["saturation_live_authentication_requests"] += 1
                live_saturation = _authenticated_live_saturation_record_matches(
                    saturation_record, self.field, self.order
                )
                if live_saturation:
                    self._resource_usage["saturation_live_authentication_hits"] += 1
                else:
                    self._resource_usage[
                        "saturation_live_authentication_fallback_replays"
                    ] += 1
                saturation_replayed = bool(
                    saturation_record.complete
                    and (
                        live_saturation
                        or saturation_record.verify(self.field, self.order)
                    )
                )
            finally:
                # Proof objects used after the computation must replay their
                # detached evidence instead of inheriting this live-work memo.
                self._generation_verification_cache_active = False
            if not index.index_one or not saturation_replayed:
                return self._incomplete(
                    (
                        "bounded saturation did not isolate class/unit index one"
                        if not index.index_one
                        else "class/unit index one failed authenticated analytic replay"
                    ),
                    invariants=presentation.invariants,
                    unit_group=unit_group,
                    diagnostics={
                        "saturation": _saturation_diagnostic_summary(saturation_record),
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
            if _needs_unconditional_upgrade(self.proof, initial_proof_status):
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
                        "saturation": _saturation_diagnostic_summary(saturation_record),
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
