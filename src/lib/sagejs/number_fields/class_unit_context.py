"""Shared proof-aware state for class-group and unit-group computations.

The context is intentionally representation-neutral.  Producer lanes may put
ordinary JSON-safe records or objects exposing `to_dict()` into its component
slots. Checkpoints detach and canonically serialize those records, bind the
complete payload with a content-integrity hash, and can replay them through
caller-supplied decoders and verifiers. The unkeyed hash detects corruption;
mathematical component replay, not the hash, is the trust boundary for
untrusted checkpoints.
"""

from __future__ import annotations

import errno
import hashlib
import json
import os
from typing import Any, Iterable

import sagejs.runtime as runtime
from sagejs.number_fields.factored_elements import field_fingerprint

CONTEXT_SERIALIZATION_SCHEMA = "sagejs.number-fields.class-unit-context.v1"
PROOF_STATE_SERIALIZATION_SCHEMA = "sagejs.number-fields.class-unit-proof-state.v1"
RESOURCE_LIMITS_SERIALIZATION_SCHEMA = "sagejs.number-fields.class-unit-limits.v1"
MINKOWSKI_PROGRESS_RECORD_SCHEMA = (
    "sagejs.number-fields.minkowski-proof-progress-record.v1"
)
MINKOWSKI_PROOF_PARTITION_SCHEMA = "sagejs.number-fields.minkowski-proof-partition.v1"
MINKOWSKI_PROOF_PROGRESS_SCHEMA = "sagejs.number-fields.minkowski-proof-progress.v1"

PROOF_LABELS = (
    "exact-unconditional",
    "exact-relations-conditional-grh",
    "incomplete-resource-limit",
    "heuristic-diagnostic-only",
)

ALGORITHMS = (
    "auto",
    "quadratic-forms",
    "minkowski",
    "buchmann-hecke",
)

_LIVE_CLASS_UNIT_CONTEXT_TOKEN = object()

_SEQUENCE_COMPONENTS = ("factor_base", "relations", "saturation_history")
_SINGLE_COMPONENTS = (
    "search_state",
    "matrix_state",
    "class_group_state",
    "unit_state",
    "analytic_state",
    "proof_progress",
    "diagnostics",
)


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        allow_nan=False,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    )


def _content_hash(value: Any) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def canonical_component(value: Any, path: str = "$component") -> Any:
    """Detach one duck-typed value into deterministic JSON-safe data."""
    serializer = getattr(value, "to_dict", None)
    if callable(serializer):
        return canonical_component(serializer(), path + ".to_dict()")
    if value is None or isinstance(value, (bool, int, float, str)):
        # The JSON encoder below rejects NaN and infinities.  Round-tripping an
        # ordinary finite float is deterministic, while exact mathematical
        # enclosures should use endpoint strings or rational pairs.
        _canonical_json(value)
        return value
    if runtime.is_exact_integer(value):
        return int(value)
    if isinstance(value, (list, tuple)):
        return [
            canonical_component(item, path + "[" + str(index) + "]")
            for index, item in enumerate(value)
        ]
    if isinstance(value, dict):
        keys: list[str] = []
        for key in value:
            if not isinstance(key, str):
                raise TypeError(path + " has a non-string dictionary key")
            keys.append(key)
        keys.sort()
        return {key: canonical_component(value[key], path + "." + key) for key in keys}
    raise TypeError(path + " is not JSON-safe and does not expose to_dict()")


def stable_component_hash(value: Any) -> str:
    """Return a portable SHA-256 digest of one canonical component."""
    return _content_hash(canonical_component(value))


def _checked_positive_optional(value: Any, name: str) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(name + " must be a positive integer or None")
    if value <= 0:
        raise ValueError(name + " must be positive")
    return value


def _checked_nonnegative(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(name + " must be a nonnegative integer")
    if value < 0:
        raise ValueError(name + " must be nonnegative")
    return value


class ClassUnitProofState:
    """Immutable terminal proof status and its exact assumptions."""

    def __init__(
        self,
        label: str,
        *,
        factor_base_theorem: str | None = None,
        factor_base_bound: int | None = None,
        assumptions: Iterable[str] = (),
        reason: str = "",
        evidence: Any = None,
    ) -> None:
        if label not in PROOF_LABELS:
            raise ValueError("unknown class/unit proof label: " + str(label))
        if factor_base_theorem is not None and (
            not isinstance(factor_base_theorem, str) or factor_base_theorem == ""
        ):
            raise TypeError("factor-base theorem must be a nonempty string or None")
        bound = _checked_positive_optional(factor_base_bound, "factor-base bound")
        assumption_values = tuple(assumptions)
        if any(
            not isinstance(value, str) or value == "" for value in assumption_values
        ):
            raise TypeError("proof assumptions must be nonempty strings")
        if len(set(assumption_values)) != len(assumption_values):
            raise ValueError("proof assumptions must not be repeated")
        assumption_values = tuple(sorted(assumption_values))
        if not isinstance(reason, str):
            raise TypeError("proof-state reason must be a string")
        if label == "exact-relations-conditional-grh":
            if factor_base_theorem is None or bound is None:
                raise ValueError(
                    "a conditional GRH state needs a factor-base theorem and bound"
                )
            if not assumption_values:
                raise ValueError("a conditional GRH state needs an explicit assumption")
        elif label == "exact-unconditional":
            if assumption_values:
                raise ValueError("an unconditional proof state cannot have assumptions")
        elif reason == "":
            raise ValueError("an incomplete or heuristic state needs a reason")
        self.label = label
        self.factor_base_theorem = factor_base_theorem
        self.factor_base_bound = bound
        self.assumptions = assumption_values
        self.reason = reason
        self._evidence = canonical_component({} if evidence is None else evidence)
        runtime.object.freeze(self)

    @property
    def evidence(self) -> Any:
        return canonical_component(self._evidence)

    @classmethod
    def unconditional(
        cls,
        factor_base_theorem: str | None = None,
        factor_base_bound: int | None = None,
        evidence: Any = None,
    ) -> ClassUnitProofState:
        return cls(
            "exact-unconditional",
            factor_base_theorem=factor_base_theorem,
            factor_base_bound=factor_base_bound,
            evidence=evidence,
        )

    @classmethod
    def conditional_grh(
        cls,
        factor_base_theorem: str,
        factor_base_bound: int,
        assumption: str,
        evidence: Any = None,
    ) -> ClassUnitProofState:
        return cls(
            "exact-relations-conditional-grh",
            factor_base_theorem=factor_base_theorem,
            factor_base_bound=factor_base_bound,
            assumptions=(assumption,),
            evidence=evidence,
        )

    @classmethod
    def incomplete(cls, reason: str, evidence: Any = None) -> ClassUnitProofState:
        return cls("incomplete-resource-limit", reason=reason, evidence=evidence)

    @classmethod
    def heuristic(cls, reason: str, evidence: Any = None) -> ClassUnitProofState:
        return cls("heuristic-diagnostic-only", reason=reason, evidence=evidence)

    def _body_dict(self) -> dict[str, Any]:
        return {
            "schema": PROOF_STATE_SERIALIZATION_SCHEMA,
            "label": self.label,
            "factor_base_theorem": self.factor_base_theorem,
            "factor_base_bound": self.factor_base_bound,
            "assumptions": list(self.assumptions),
            "reason": self.reason,
            "evidence": canonical_component(self._evidence),
        }

    def to_dict(self) -> dict[str, Any]:
        body = self._body_dict()
        body["content_sha256"] = _content_hash(body)
        return body

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ClassUnitProofState:
        if not isinstance(data, dict):
            raise TypeError("a proof-state payload must be a dictionary")
        if data.get("schema") != PROOF_STATE_SERIALIZATION_SCHEMA:
            raise ValueError("unsupported class/unit proof-state schema")
        expected = data.get("content_sha256")
        body = dict(data)
        if "content_sha256" not in body:
            raise ValueError("a proof-state payload has no content hash")
        del body["content_sha256"]
        if not isinstance(expected, str) or _content_hash(body) != expected:
            raise ValueError("class/unit proof-state content hash mismatch")
        assumptions = data.get("assumptions")
        if not isinstance(assumptions, list):
            raise TypeError("proof-state assumptions must be a list")
        answer = cls(
            data["label"],
            factor_base_theorem=data.get("factor_base_theorem"),
            factor_base_bound=data.get("factor_base_bound"),
            assumptions=assumptions,
            reason=data.get("reason", ""),
            evidence=data.get("evidence", {}),
        )
        if answer.to_dict() != data:
            raise ValueError("class/unit proof-state payload is not canonical")
        return answer

    def stable_hash(self) -> str:
        return self.to_dict()["content_sha256"]

    def cache_key(self) -> tuple[str, str]:
        return (self.label, self.stable_hash())


class ResourceLimits:
    """Immutable resource policy participating in context cache identity."""

    _NAMES = (
        "max_factor_base_size",
        "max_relations",
        "max_partial_relations",
        "max_relation_attempts",
        "max_proof_primes",
        "max_precision_bits",
        "max_checkpoint_bytes",
        "max_seconds",
        "max_memory_bytes",
    )

    def __init__(
        self,
        *,
        max_factor_base_size: int | None = None,
        max_relations: int | None = None,
        max_partial_relations: int | None = None,
        max_relation_attempts: int | None = None,
        max_proof_primes: int | None = None,
        max_precision_bits: int | None = None,
        max_checkpoint_bytes: int | None = None,
        max_seconds: int | None = None,
        max_memory_bytes: int | None = None,
        extra: dict[str, Any] | None = None,
    ) -> None:
        values = {
            "max_factor_base_size": max_factor_base_size,
            "max_relations": max_relations,
            "max_partial_relations": max_partial_relations,
            "max_relation_attempts": max_relation_attempts,
            "max_proof_primes": max_proof_primes,
            "max_precision_bits": max_precision_bits,
            "max_checkpoint_bytes": max_checkpoint_bytes,
            "max_seconds": max_seconds,
            "max_memory_bytes": max_memory_bytes,
        }
        for name in self._NAMES:
            checked = _checked_positive_optional(values[name], name)
            setattr(self, name, checked)
        extension_values = {} if extra is None else dict(extra)
        for name in extension_values:
            if not isinstance(name, str) or name == "":
                raise TypeError(
                    "resource-limit extension names must be nonempty strings"
                )
            if name in self._NAMES:
                raise ValueError("a resource-limit extension repeats " + name)
            extension_values[name] = _checked_positive_optional(
                extension_values[name], "resource-limit extension " + name
            )
            if extension_values[name] is None:
                raise ValueError("resource-limit extensions cannot be None")
        self._extra = canonical_component(extension_values)
        runtime.object.freeze(self)

    @property
    def extra(self) -> dict[str, Any]:
        return canonical_component(self._extra)

    def get(self, name: str, default: Any = None) -> Any:
        if name in self._NAMES:
            return getattr(self, name)
        return self._extra.get(name, default)

    def _body_dict(self) -> dict[str, Any]:
        return {
            "schema": RESOURCE_LIMITS_SERIALIZATION_SCHEMA,
            "values": {name: getattr(self, name) for name in self._NAMES},
            "extra": canonical_component(self._extra),
        }

    def to_dict(self) -> dict[str, Any]:
        body = self._body_dict()
        body["content_sha256"] = _content_hash(body)
        return body

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ResourceLimits:
        if not isinstance(data, dict):
            raise TypeError("a resource-limits payload must be a dictionary")
        if data.get("schema") != RESOURCE_LIMITS_SERIALIZATION_SCHEMA:
            raise ValueError("unsupported class/unit resource-limits schema")
        expected = data.get("content_sha256")
        body = dict(data)
        if "content_sha256" not in body:
            raise ValueError("a resource-limits payload has no content hash")
        del body["content_sha256"]
        if not isinstance(expected, str) or _content_hash(body) != expected:
            raise ValueError("class/unit resource-limits content hash mismatch")
        values = data.get("values")
        if not isinstance(values, dict) or set(values) != set(cls._NAMES):
            raise ValueError("resource-limits values do not match the schema")
        answer = cls(**values, extra=data.get("extra", {}))
        if answer.to_dict() != data:
            raise ValueError("class/unit resource-limits payload is not canonical")
        return answer

    def stable_hash(self) -> str:
        return self.to_dict()["content_sha256"]

    def cache_key(self) -> tuple[Any, ...]:
        return tuple(getattr(self, name) for name in self._NAMES) + (
            self.stable_hash(),
        )


def _order_fingerprint(field: Any, order: Any) -> dict[str, Any]:
    if order.number_field() is not field:
        raise TypeError("the class/unit order belongs to a different field instance")
    if not order.is_maximal():
        raise ValueError("a class/unit context requires a certified maximal order")
    return {
        "field": field_fingerprint(field),
        "maximal_order_basis": [
            [[int(value._numerator), int(value._denominator)] for value in row]
            for row in order._basis_rows
        ],
        "discriminant": int(order.discriminant()),
    }


def _checked_signature(value: Any, degree: int) -> tuple[int, int]:
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise TypeError("a class/unit signature must be a pair")
    r1, r2 = value
    if (
        isinstance(r1, bool)
        or not isinstance(r1, int)
        or isinstance(r2, bool)
        or not isinstance(r2, int)
        or r1 < 0
        or r2 < 0
    ):
        raise ValueError("signature entries must be nonnegative integers")
    if r1 + 2 * r2 != degree:
        raise ValueError("the class/unit signature does not reproduce the degree")
    return (r1, r2)


def _checked_precision_history(values: Iterable[Any]) -> tuple[int, ...]:
    answer: list[int] = []
    for value in values:
        if isinstance(value, bool) or not isinstance(value, int) or value < 2:
            raise ValueError("precision history entries must be integers at least 2")
        if answer and value <= answer[-1]:
            raise ValueError("precision history must be strictly increasing")
        answer.append(value)
    return tuple(answer)


class _LiveClassUnitArtifacts:
    """Producer-owned algebraic state excluded from detached checkpoints.

    `ClassUnitGroupContext` remains the portable serialization boundary.  This
    companion owns the exact in-process objects that make one computation a
    coherent transaction: its factor base, authenticated relation prefix,
    presentation, units, analytic workspace, saturation record, and terminal
    group.  Nothing here is trusted after serialization; checkpoint replay
    continues through the ordinary component decoders and verifiers.
    """

    def __init__(
        self,
        field: Any,
        order: Any,
        *,
        reusable: bool,
        analytic_workspace: Any = None,
        factored_logarithm_workspace: Any = None,
    ) -> None:
        self.field = field
        self.order = order
        self.reusable = bool(reusable)
        self.factor_base: tuple[Any, ...] = ()
        self.factor_base_bound = False
        self.factor_base_validation_available = False
        self.collector: Any = None
        self.relations: tuple[Any, ...] = ()
        self.presentation: Any = None
        self.factored_units: tuple[Any, ...] = ()
        self.analytic_workspace = analytic_workspace
        self.factored_logarithm_workspace = factored_logarithm_workspace
        self.analytic_proof: tuple[Any, ...] | None = None
        self.generation_evidence: Any = None
        self.generation_hashes: tuple[str, str, str] | None = None
        self.generation_verification_cache: dict[str, bool] = {}
        self.generation_live_authority_available = False
        self.generation_verification_active = True
        self.saturation_record: Any = None
        self.saturation_live_authority_available = False
        self.authenticated_dependency_unit_hashes: set[str] = set()
        self.class_group: Any = None
        self.unit_group: Any = None
        self.sealed = False

    def bind_factor_base(self, factor_base: Iterable[Any], *, validated: bool) -> None:
        if self.sealed:
            raise ValueError("a sealed class/unit context cannot accept a factor base")
        self.factor_base = tuple(factor_base)
        self.factor_base_bound = True
        self.factor_base_validation_available = bool(self.reusable and validated)

    def factor_base_validated(self, factor_base: Iterable[Any]) -> bool:
        supplied = tuple(factor_base)
        return bool(
            not self.sealed
            and self.reusable
            and self.factor_base_validation_available
            and len(supplied) == len(self.factor_base)
            and all(
                retained is current
                for retained, current in zip(self.factor_base, supplied, strict=True)
            )
        )

    def bind_relations(
        self,
        factor_base: Iterable[Any],
        collector: Any,
        presentation: Any,
        relation_authentication_token: Any,
    ) -> bool:
        if self.sealed:
            return False
        factors = tuple(factor_base)
        if self.factor_base_bound and (
            len(factors) != len(self.factor_base)
            or any(
                retained is not supplied
                for retained, supplied in zip(self.factor_base, factors, strict=True)
            )
        ):
            return False
        retained_factors = tuple(getattr(collector, "factor_base", ()))
        if getattr(collector, "order", None) is not self.order or len(
            retained_factors
        ) != len(factors):
            return False
        if any(
            retained is not supplied
            for retained, supplied in zip(retained_factors, factors, strict=True)
        ):
            return False
        authenticate = getattr(collector, "_all_records_live_authenticated", None)
        if not callable(authenticate) or not authenticate(
            relation_authentication_token
        ):
            return False
        records = tuple(collector.records)
        if len(tuple(getattr(presentation, "relation_rows", ()))) != len(records):
            return False
        self.factor_base = factors
        self.factor_base_bound = True
        self.collector = collector
        self.relations = records
        self.presentation = presentation
        return self.reusable

    def relation_stage_authenticated(self, collector: Any, presentation: Any) -> bool:
        if (
            self.sealed
            or not self.reusable
            or collector is not self.collector
            or presentation is not self.presentation
        ):
            return False
        current_factors = tuple(getattr(collector, "factor_base", ()))
        if len(current_factors) != len(self.factor_base) or any(
            retained is not current
            for retained, current in zip(self.factor_base, current_factors, strict=True)
        ):
            return False
        current_relations = tuple(getattr(collector, "records", ()))
        return bool(
            len(current_relations) == len(self.relations)
            and all(
                retained is current
                for retained, current in zip(
                    self.relations, current_relations, strict=True
                )
            )
        )

    def relation_payloads(
        self, collector: Any, presentation: Any
    ) -> tuple[dict[str, Any], ...] | None:
        if not self.relation_stage_authenticated(collector, presentation):
            return None
        # `reusable` means no callback, cancellation hook, or checkpoint can
        # interpose after `bind_relations` authenticated this exact prefix.
        # The analytic certificate immediately captures canonical bytes.  This
        # live-only projection therefore need not recursively clone normalized
        # JSON trees a second time.
        return tuple(record.to_dict() for record in self.relations)

    def bind_generation_evidence(
        self, evidence: Any, hashes: tuple[str, str, str]
    ) -> None:
        if self.sealed:
            raise ValueError("a sealed class/unit context cannot accept evidence")
        self.generation_evidence = evidence
        self.generation_hashes = (
            str(hashes[0]),
            str(hashes[1]),
            str(hashes[2]),
        )
        self.generation_live_authority_available = self.reusable

    def consume_generation_authority(self, cache_key: str, evidence: Any) -> bool:
        if (
            self.sealed
            or not self.generation_verification_active
            or not self.generation_live_authority_available
            or evidence is not self.generation_evidence
        ):
            return False
        self.generation_live_authority_available = False
        self.generation_verification_cache[str(cache_key)] = True
        return True

    def generation_verification_cached(self, cache_key: str) -> bool:
        return bool(
            self.generation_verification_active
            and self.generation_verification_cache.get(str(cache_key)) is True
        )

    def retain_generation_verification(self, cache_key: str) -> None:
        if self.generation_verification_active:
            self.generation_verification_cache[str(cache_key)] = True

    def deactivate_generation_verification(self) -> None:
        self.generation_verification_active = False
        self.generation_live_authority_available = False

    def bind_analytic_proof(self, proof: Iterable[Any]) -> None:
        if self.sealed:
            raise ValueError("a sealed class/unit context cannot accept analytic state")
        values = tuple(proof)
        if len(values) != 6:
            raise ValueError("a live analytic proof must contain six exact components")
        self.analytic_proof = values

    def dependency_hashes(
        self, collector: Any, presentation: Any
    ) -> tuple[str, str] | None:
        if self.generation_hashes is None or not self.relation_stage_authenticated(
            collector, presentation
        ):
            return None
        return self.generation_hashes[1], self.generation_hashes[2]

    def retain_dependency_units(
        self,
        collector: Any,
        presentation: Any,
        dependencies: Iterable[Iterable[int]],
        units: Iterable[Any],
    ) -> bool:
        """Retain principality authority derived from exact relation kernels."""
        # The engine calls this immediately after
        # `relation_stage_authenticated()` and has no callback boundary in a
        # reusable context.  Recheck the exact stage objects, but do not walk
        # the same factor/record identity vectors a second time.
        if (
            self.sealed
            or not self.reusable
            or collector is not self.collector
            or presentation is not self.presentation
        ):
            return False
        relations = self.relations
        factor_base_width = len(self.factor_base)
        hashes: list[str] = []
        for dependency, unit in zip(dependencies, units, strict=True):
            coefficients = tuple(int(value) for value in dependency)
            if len(coefficients) != len(relations) or not any(coefficients):
                return False
            relation_row = [0] * factor_base_width
            for coefficient, record in zip(coefficients, relations, strict=True):
                row = tuple(record.row)
                if len(row) != factor_base_width:
                    return False
                for index, value in enumerate(row):
                    relation_row[index] += coefficient * int(value)
            stable_hash = getattr(unit, "stable_hash", None)
            if not any(relation_row) and callable(stable_hash):
                hashes.append(str(stable_hash()))
        for value in hashes:
            if len(self.authenticated_dependency_unit_hashes) >= 1024:
                self.authenticated_dependency_unit_hashes.pop()
            self.authenticated_dependency_unit_hashes.add(value)
        return True

    def dependency_unit_authenticated(self, unit: Any) -> bool:
        if self.sealed or not self.reusable:
            return False
        stable_hash = getattr(unit, "stable_hash", None)
        return bool(
            callable(stable_hash)
            and str(stable_hash()) in self.authenticated_dependency_unit_hashes
        )

    def bind_saturation_record(self, record: Any, *, authenticated: bool) -> None:
        if self.sealed:
            raise ValueError("a sealed class/unit context cannot accept saturation")
        self.saturation_record = record
        self.saturation_live_authority_available = bool(self.reusable and authenticated)

    def consume_saturation_record(self, record: Any) -> bool:
        accepted = bool(
            not self.sealed
            and self.saturation_live_authority_available
            and record is self.saturation_record
        )
        self.saturation_live_authority_available = False
        return accepted

    def verify_class_group_construction(self, group: Any) -> bool:
        """Authenticate a class group built from this uninterrupted live state.

        The context authenticated the exact collector prefix when relations
        were bound.  A reusable context has no progress, cancellation, or
        checkpoint callback which could interpose between that boundary and
        class-group construction.  Bind the resulting group back to those
        retained objects and replay only the generator rows which the engine
        has just materialized.  Detached contexts have no live artifacts and
        continue through the group's independent public verifier.
        """
        if self.sealed or not self.reusable:
            return False
        try:
            collector = self.collector
            presentation = self.presentation
            if (
                collector is None
                or presentation is None
                or not self.relation_stage_authenticated(collector, presentation)
                or getattr(group, "_order", None) is not self.order
                or getattr(group, "_relation_reconstructor", None) is not collector
                or getattr(group, "_presentation", None) is not presentation
            ):
                return False
            group_factors = tuple(getattr(group, "_factor_base", ()))
            if len(group_factors) != len(self.factor_base) or any(
                retained is not supplied
                for retained, supplied in zip(
                    self.factor_base, group_factors, strict=True
                )
            ):
                return False
            group_relations = tuple(getattr(group, "_relations", ()))
            if len(group_relations) != len(self.relations) or any(
                retained is not supplied
                for retained, supplied in zip(
                    self.relations, group_relations, strict=True
                )
            ):
                return False
            presentation_rows = tuple(
                tuple(int(value) for value in row.dense())
                for row in presentation.relation_rows
            )
            relation_rows = tuple(
                tuple(int(value) for value in record.row) for record in self.relations
            )
            if presentation_rows != relation_rows:
                return False
            invariants = tuple(int(value) for value in presentation.invariants)
            if tuple(getattr(group, "_invariants", ())) != invariants:
                return False
            positions = tuple(presentation.invariant_positions)
            expected_rows = tuple(
                tuple(
                    int(value) for value in presentation.smith_right_inverse[position]
                )
                for position in positions
            )
            generator_rows = tuple(getattr(group, "_generator_rows", ()))
            generator_ideals = tuple(getattr(group, "_generator_ideals", ()))
            generators = tuple(getattr(group, "_gens", ()))
            if (
                generator_rows != expected_rows
                or len(generator_ideals) != len(expected_rows)
                or len(generators) != len(invariants)
            ):
                return False
            reconstruct = getattr(collector, "reconstruct_factor_base_ideal", None)
            if not callable(reconstruct):
                return False
            for index, (row, ideal) in enumerate(
                zip(generator_rows, generator_ideals, strict=True)
            ):
                if reconstruct(row) != ideal:
                    return False
                coordinates = tuple(
                    int(value) for value in presentation.class_coordinates(row)
                )
                expected_coordinates = tuple(
                    1 if coordinate == index else 0
                    for coordinate in range(len(invariants))
                )
                if coordinates != expected_coordinates:
                    return False
                if generators[index].order() != invariants[index]:
                    return False
            return True
        except (KeyError, AttributeError, TypeError, ValueError, ArithmeticError):
            return False

    def retain_terminal(
        self,
        *,
        units: Iterable[Any] = (),
        saturation_record: Any = None,
        class_group: Any = None,
        unit_group: Any = None,
    ) -> None:
        if self.sealed:
            raise ValueError("a class/unit context is already terminal")
        if (
            saturation_record is not None
            and self.saturation_record is not None
            and saturation_record is not self.saturation_record
        ):
            raise ValueError("terminal saturation differs from retained live state")
        self.factored_units = tuple(units)
        if saturation_record is not None:
            self.saturation_record = saturation_record
        self.class_group = class_group
        self.unit_group = unit_group
        self.deactivate_generation_verification()
        self.saturation_live_authority_available = False
        self.sealed = True

    def diagnostics(self) -> dict[str, Any]:
        return {
            "reusable": self.reusable,
            "sealed": self.sealed,
            "factor_base_size": len(self.factor_base),
            "has_factor_base": self.factor_base_bound,
            "factor_base_validation_available": (self.factor_base_validation_available),
            "relation_count": len(self.relations),
            "has_presentation": self.presentation is not None,
            "unit_count": len(self.factored_units),
            "has_analytic_workspace": self.analytic_workspace is not None,
            "has_analytic_proof": self.analytic_proof is not None,
            "has_generation_authority": self.generation_hashes is not None,
            "generation_verification_active": self.generation_verification_active,
            "generation_verification_entries": len(self.generation_verification_cache),
            "has_saturation_record": self.saturation_record is not None,
            "saturation_live_authority_available": (
                self.saturation_live_authority_available
            ),
            "authenticated_dependency_units": len(
                self.authenticated_dependency_unit_hashes
            ),
            "has_class_group": self.class_group is not None,
            "has_unit_group": self.unit_group is not None,
        }


class ClassUnitGroupContext:
    """One shared, checkpointable class-group and unit-group computation."""

    def __init__(
        self,
        field: Any,
        order: Any,
        proof_state: ClassUnitProofState,
        *,
        algorithm: str = "auto",
        limits: ResourceLimits | None = None,
        factor_base: Iterable[Any] = (),
        relations: Iterable[Any] = (),
        search_state: Any = None,
        matrix_state: Any = None,
        class_group_state: Any = None,
        unit_state: Any = None,
        analytic_state: Any = None,
        saturation_history: Iterable[Any] = (),
        proof_progress: Any = None,
        precision_history: Iterable[int] = (),
        diagnostics: Any = None,
        random_seed: int = 0,
        signature: Any = None,
    ) -> None:
        if type(proof_state) is not ClassUnitProofState:
            raise TypeError("a class/unit context needs an immutable proof state")
        if algorithm not in ALGORITHMS:
            raise ValueError("unknown class/unit algorithm: " + str(algorithm))
        selected_limits = ResourceLimits() if limits is None else limits
        if type(selected_limits) is not ResourceLimits:
            raise TypeError("class/unit resource limits must be ResourceLimits")
        seed = _checked_nonnegative(random_seed, "class/unit random seed")
        if seed > 9_007_199_254_740_991:
            raise ValueError("class/unit random seed must not exceed 2^53-1")
        identity = _order_fingerprint(field, order)
        embedding_module = __import__(
            "sagejs.number_fields.embeddings", fromlist=["embeddings"]
        )
        exact_signature = embedding_module.exact_signature(field)
        if signature is None:
            signature = exact_signature
        elif _checked_signature(signature, int(field.degree())) != exact_signature:
            raise ValueError("the class/unit signature differs from exact root counts")
        self._field = field
        self._order = order
        self._field_order_identity = identity
        self._signature = _checked_signature(signature, int(field.degree()))
        self._discriminant = identity["discriminant"]
        self._algorithm = algorithm
        self._proof_state = proof_state
        self._limits = selected_limits
        self._random_seed = seed
        self.factor_base = tuple(factor_base)
        self.relations = tuple(relations)
        self.search_state = search_state
        self.matrix_state = matrix_state
        self.class_group_state = class_group_state
        self.unit_state = unit_state
        self.analytic_state = analytic_state
        self.saturation_history = tuple(saturation_history)
        self.proof_progress = proof_progress
        self.precision_history = _checked_precision_history(precision_history)
        self.diagnostics = {} if diagnostics is None else diagnostics
        self._live_artifacts: _LiveClassUnitArtifacts | None = None
        self._validate_components()

    def _activate_live(
        self,
        token: Any,
        *,
        reusable: bool,
        analytic_workspace: Any = None,
        factored_logarithm_workspace: Any = None,
    ) -> None:
        """Attach the one producer-owned live state for this computation."""
        if token is not _LIVE_CLASS_UNIT_CONTEXT_TOKEN:
            raise TypeError("live class/unit contexts are engine-owned")
        if self._live_artifacts is not None:
            raise ValueError("the class/unit context is already live")
        self._live_artifacts = _LiveClassUnitArtifacts(
            self.field,
            self.order,
            reusable=reusable,
            analytic_workspace=analytic_workspace,
            factored_logarithm_workspace=factored_logarithm_workspace,
        )

    def _bind_live_relations(
        self,
        token: Any,
        factor_base: Iterable[Any],
        collector: Any,
        presentation: Any,
        relation_authentication_token: Any,
    ) -> bool:
        if token is not _LIVE_CLASS_UNIT_CONTEXT_TOKEN:
            raise TypeError("live relation state is engine-owned")
        live = self._live_artifacts
        return bool(
            live is not None
            and live.bind_relations(
                factor_base,
                collector,
                presentation,
                relation_authentication_token,
            )
        )

    def _bind_live_factor_base(
        self, token: Any, factor_base: Iterable[Any], *, validated: bool
    ) -> None:
        if token is not _LIVE_CLASS_UNIT_CONTEXT_TOKEN:
            raise TypeError("live factor-base state is engine-owned")
        live = self._live_artifacts
        if live is not None:
            live.bind_factor_base(factor_base, validated=validated)

    def _live_factor_base_validated(
        self, token: Any, factor_base: Iterable[Any]
    ) -> bool:
        if token is not _LIVE_CLASS_UNIT_CONTEXT_TOKEN:
            raise TypeError("live factor-base state is engine-owned")
        live = self._live_artifacts
        return bool(live is not None and live.factor_base_validated(factor_base))

    def _live_relation_payloads(
        self, token: Any, collector: Any, presentation: Any
    ) -> tuple[dict[str, Any], ...] | None:
        if token is not _LIVE_CLASS_UNIT_CONTEXT_TOKEN:
            raise TypeError("live relation payloads are engine-owned")
        live = self._live_artifacts
        return None if live is None else live.relation_payloads(collector, presentation)

    def _live_relation_stage_authenticated(
        self, token: Any, collector: Any, presentation: Any
    ) -> bool:
        if token is not _LIVE_CLASS_UNIT_CONTEXT_TOKEN:
            raise TypeError("live relation state is engine-owned")
        live = self._live_artifacts
        return bool(
            live is not None
            and live.relation_stage_authenticated(collector, presentation)
        )

    def _retain_live_dependency_units(
        self,
        token: Any,
        collector: Any,
        presentation: Any,
        dependencies: Iterable[Iterable[int]],
        units: Iterable[Any],
    ) -> bool:
        if token is not _LIVE_CLASS_UNIT_CONTEXT_TOKEN:
            raise TypeError("live dependency-unit state is engine-owned")
        live = self._live_artifacts
        return bool(
            live is not None
            and live.retain_dependency_units(
                collector, presentation, dependencies, units
            )
        )

    def _live_dependency_unit_authenticated(self, token: Any, unit: Any) -> bool:
        if token is not _LIVE_CLASS_UNIT_CONTEXT_TOKEN:
            raise TypeError("live dependency-unit state is engine-owned")
        live = self._live_artifacts
        return bool(live is not None and live.dependency_unit_authenticated(unit))

    def _bind_live_generation_evidence(
        self,
        token: Any,
        evidence: Any,
        hashes: tuple[str, str, str],
    ) -> None:
        if token is not _LIVE_CLASS_UNIT_CONTEXT_TOKEN:
            raise TypeError("live generation evidence is engine-owned")
        live = self._live_artifacts
        if live is not None:
            live.bind_generation_evidence(evidence, hashes)

    def _consume_live_generation_authority(
        self, token: Any, cache_key: str, evidence: Any
    ) -> bool:
        if token is not _LIVE_CLASS_UNIT_CONTEXT_TOKEN:
            raise TypeError("live generation authority is engine-owned")
        live = self._live_artifacts
        return bool(
            live is not None and live.consume_generation_authority(cache_key, evidence)
        )

    def _live_generation_verification_cached(self, token: Any, cache_key: str) -> bool:
        if token is not _LIVE_CLASS_UNIT_CONTEXT_TOKEN:
            raise TypeError("live generation verification is engine-owned")
        live = self._live_artifacts
        return bool(live is not None and live.generation_verification_cached(cache_key))

    def _retain_live_generation_verification(self, token: Any, cache_key: str) -> None:
        if token is not _LIVE_CLASS_UNIT_CONTEXT_TOKEN:
            raise TypeError("live generation verification is engine-owned")
        live = self._live_artifacts
        if live is not None:
            live.retain_generation_verification(cache_key)

    def _deactivate_live_generation_verification(self, token: Any) -> None:
        if token is not _LIVE_CLASS_UNIT_CONTEXT_TOKEN:
            raise TypeError("live generation verification is engine-owned")
        live = self._live_artifacts
        if live is not None:
            live.deactivate_generation_verification()

    def _bind_live_analytic_proof(self, token: Any, proof: Iterable[Any]) -> None:
        if token is not _LIVE_CLASS_UNIT_CONTEXT_TOKEN:
            raise TypeError("live analytic state is engine-owned")
        live = self._live_artifacts
        if live is not None:
            live.bind_analytic_proof(proof)

    def _live_analytic_proof(self, token: Any) -> tuple[Any, ...] | None:
        if token is not _LIVE_CLASS_UNIT_CONTEXT_TOKEN:
            raise TypeError("live analytic state is engine-owned")
        live = self._live_artifacts
        return None if live is None else live.analytic_proof

    def _live_generation_dependency_hashes(
        self, token: Any, collector: Any, presentation: Any
    ) -> tuple[str, str] | None:
        if token is not _LIVE_CLASS_UNIT_CONTEXT_TOKEN:
            raise TypeError("live generation state is engine-owned")
        live = self._live_artifacts
        return None if live is None else live.dependency_hashes(collector, presentation)

    def _bind_live_saturation_record(
        self, token: Any, record: Any, *, authenticated: bool
    ) -> None:
        if token is not _LIVE_CLASS_UNIT_CONTEXT_TOKEN:
            raise TypeError("live saturation state is engine-owned")
        live = self._live_artifacts
        if live is not None:
            live.bind_saturation_record(record, authenticated=authenticated)

    def _consume_live_saturation_record(self, token: Any, record: Any) -> bool:
        if token is not _LIVE_CLASS_UNIT_CONTEXT_TOKEN:
            raise TypeError("live saturation state is engine-owned")
        live = self._live_artifacts
        return bool(live is not None and live.consume_saturation_record(record))

    def _live_saturation_record(self, token: Any) -> Any:
        if token is not _LIVE_CLASS_UNIT_CONTEXT_TOKEN:
            raise TypeError("live saturation state is engine-owned")
        live = self._live_artifacts
        return None if live is None else live.saturation_record

    def _verify_live_class_group_construction(self, token: Any, group: Any) -> bool:
        if token is not _LIVE_CLASS_UNIT_CONTEXT_TOKEN:
            raise TypeError("live class-group state is engine-owned")
        live = self._live_artifacts
        return bool(live is not None and live.verify_class_group_construction(group))

    def _retain_live_terminal(
        self,
        token: Any,
        *,
        proof_state: ClassUnitProofState | None = None,
        units: Iterable[Any] = (),
        saturation_record: Any = None,
        class_group: Any = None,
        unit_group: Any = None,
        proof_progress: Any = None,
        diagnostics: Any = None,
    ) -> None:
        if token is not _LIVE_CLASS_UNIT_CONTEXT_TOKEN:
            raise TypeError("terminal live state is engine-owned")
        if proof_state is not None:
            if type(proof_state) is not ClassUnitProofState:
                raise TypeError("terminal context proof state is not immutable")
            self._proof_state = proof_state
        live = self._live_artifacts
        if live is not None:
            live.retain_terminal(
                units=units,
                saturation_record=saturation_record,
                class_group=class_group,
                unit_group=unit_group,
            )
            # Retain the exact producer objects for lazy checkpoint projection.
            # No canonical tree walk is charged to the ordinary public result.
            self.factor_base = live.factor_base
            self.relations = live.relations
            self.matrix_state = live.presentation
        if saturation_record is not None:
            self.saturation_history = (saturation_record,)
            self.analytic_state = getattr(
                saturation_record, "analytic_validation", None
            )
        if proof_progress is not None:
            self.proof_progress = proof_progress
        if diagnostics is not None:
            self.diagnostics = diagnostics

    def live_diagnostics(self) -> dict[str, Any]:
        """Describe retained in-process state without exposing its authority."""
        live = self._live_artifacts
        return {} if live is None else live.diagnostics()

    @property
    def field(self) -> Any:
        return self._field

    @property
    def order(self) -> Any:
        return self._order

    @property
    def field_order_identity(self) -> dict[str, Any]:
        return canonical_component(self._field_order_identity)

    @property
    def signature(self) -> tuple[int, int]:
        return self._signature

    @property
    def discriminant(self) -> int:
        return self._discriminant

    @property
    def algorithm(self) -> str:
        return self._algorithm

    @property
    def proof_state(self) -> ClassUnitProofState:
        return self._proof_state

    @property
    def limits(self) -> ResourceLimits:
        return self._limits

    @property
    def random_seed(self) -> int:
        return self._random_seed

    def _validate_components(self) -> None:
        for name in _SEQUENCE_COMPONENTS:
            for index, value in enumerate(getattr(self, name)):
                canonical_component(value, "$context." + name + "[" + str(index) + "]")
        for name in _SINGLE_COMPONENTS:
            canonical_component(getattr(self, name), "$context." + name)

    def cache_key(self) -> tuple[Any, ...]:
        """Return the immutable policy identity used by shared context caches."""
        return (
            stable_component_hash(self.field_order_identity),
            self.algorithm,
            self.proof_state.cache_key(),
            self.limits.cache_key(),
            self.random_seed,
        )

    def set_factor_base(self, factor_base: Iterable[Any]) -> None:
        values = tuple(factor_base)
        for value in values:
            canonical_component(value)
        self.factor_base = values

    def add_relation(self, relation: Any) -> None:
        canonical_component(relation)
        self.relations = self.relations + (relation,)

    def set_relations(self, relations: Iterable[Any]) -> None:
        values = tuple(relations)
        for value in values:
            canonical_component(value)
        self.relations = values

    def set_search_state(self, state: Any) -> None:
        canonical_component(state)
        self.search_state = state

    def set_matrix_state(self, state: Any) -> None:
        canonical_component(state)
        self.matrix_state = state

    def set_class_group_state(self, state: Any) -> None:
        canonical_component(state)
        self.class_group_state = state

    def set_unit_state(self, state: Any) -> None:
        canonical_component(state)
        self.unit_state = state

    def set_analytic_state(self, state: Any) -> None:
        canonical_component(state)
        self.analytic_state = state

    def record_saturation(self, record: Any) -> None:
        canonical_component(record)
        self.saturation_history = self.saturation_history + (record,)

    def set_proof_progress(self, progress: Any) -> None:
        canonical_component(progress)
        self.proof_progress = progress

    def record_precision(self, precision: int) -> None:
        values = list(self.precision_history) + [precision]
        self.precision_history = _checked_precision_history(values)

    def record_diagnostic(self, name: str, value: Any) -> None:
        if not isinstance(name, str) or name == "":
            raise TypeError("a diagnostic name must be a nonempty string")
        current = canonical_component(self.diagnostics)
        if not isinstance(current, dict):
            raise TypeError(
                "context diagnostics must be a dictionary to append entries"
            )
        current[name] = canonical_component(value)
        self.diagnostics = current

    def fork_for_proof(self, proof_state: ClassUnitProofState) -> ClassUnitGroupContext:
        """Share exact work in a new context with a separate proof cache key."""
        return ClassUnitGroupContext(
            self.field,
            self.order,
            proof_state,
            algorithm=self.algorithm,
            limits=self.limits,
            factor_base=self.factor_base,
            relations=self.relations,
            search_state=self.search_state,
            matrix_state=self.matrix_state,
            class_group_state=self.class_group_state,
            unit_state=self.unit_state,
            analytic_state=self.analytic_state,
            saturation_history=self.saturation_history,
            proof_progress=self.proof_progress,
            precision_history=self.precision_history,
            diagnostics=self.diagnostics,
            random_seed=self.random_seed,
            signature=self.signature,
        )

    def _body_dict(self) -> dict[str, Any]:
        return {
            "schema": CONTEXT_SERIALIZATION_SCHEMA,
            "field_order_identity": canonical_component(self.field_order_identity),
            "signature": list(self.signature),
            "discriminant": self.discriminant,
            "algorithm": self.algorithm,
            "proof_state": self.proof_state.to_dict(),
            "limits": self.limits.to_dict(),
            "random_seed": self.random_seed,
            "factor_base": canonical_component(self.factor_base),
            "relations": canonical_component(self.relations),
            "search_state": canonical_component(self.search_state),
            "matrix_state": canonical_component(self.matrix_state),
            "class_group_state": canonical_component(self.class_group_state),
            "unit_state": canonical_component(self.unit_state),
            "analytic_state": canonical_component(self.analytic_state),
            "saturation_history": canonical_component(self.saturation_history),
            "proof_progress": canonical_component(self.proof_progress),
            "precision_history": list(self.precision_history),
            "diagnostics": canonical_component(self.diagnostics),
        }

    def to_dict(self) -> dict[str, Any]:
        """Return a deterministic content-integrity-bound checkpoint."""
        body = self._body_dict()
        body["content_sha256"] = _content_hash(body)
        return body

    checkpoint = to_dict

    def stable_hash(self) -> str:
        return self.to_dict()["content_sha256"]

    checkpoint_hash = stable_hash

    @staticmethod
    def _decode_component(name: str, value: Any, decoders: dict[str, Any]) -> Any:
        decoder = decoders.get(name)
        if decoder is None:
            return value
        if not callable(decoder):
            raise TypeError("component decoder for " + name + " is not callable")
        if name in _SEQUENCE_COMPONENTS:
            return [decoder(item) for item in value]
        return decoder(value)

    @classmethod
    def from_dict(
        cls,
        field: Any,
        order: Any,
        data: dict[str, Any],
        *,
        component_decoders: dict[str, Any] | None = None,
        component_verifiers: dict[str, Any] | None = None,
    ) -> ClassUnitGroupContext:
        """Authenticate and replay one checkpoint against an exact field/order."""
        if not isinstance(data, dict):
            raise TypeError("a class/unit checkpoint must be a dictionary")
        if data.get("schema") != CONTEXT_SERIALIZATION_SCHEMA:
            raise ValueError("unsupported class/unit context schema")
        expected = data.get("content_sha256")
        body = dict(data)
        if "content_sha256" not in body:
            raise ValueError("a class/unit checkpoint has no content hash")
        del body["content_sha256"]
        if not isinstance(expected, str) or _content_hash(body) != expected:
            raise ValueError("class/unit checkpoint content hash mismatch")
        if data.get("field_order_identity") != _order_fingerprint(field, order):
            raise ValueError("a class/unit checkpoint belongs to another field/order")
        if data.get("discriminant") != int(order.discriminant()):
            raise ValueError("a class/unit checkpoint has a stale discriminant")
        decoders = {} if component_decoders is None else dict(component_decoders)
        unknown_decoders = set(decoders) - set(
            _SEQUENCE_COMPONENTS + _SINGLE_COMPONENTS
        )
        if unknown_decoders:
            raise ValueError("unknown class/unit component decoder")
        decoded = {
            name: cls._decode_component(name, data.get(name), decoders)
            for name in _SEQUENCE_COMPONENTS + _SINGLE_COMPONENTS
        }
        answer = cls(
            field,
            order,
            ClassUnitProofState.from_dict(data["proof_state"]),
            algorithm=data["algorithm"],
            limits=ResourceLimits.from_dict(data["limits"]),
            factor_base=decoded["factor_base"],
            relations=decoded["relations"],
            search_state=decoded["search_state"],
            matrix_state=decoded["matrix_state"],
            class_group_state=decoded["class_group_state"],
            unit_state=decoded["unit_state"],
            analytic_state=decoded["analytic_state"],
            saturation_history=decoded["saturation_history"],
            proof_progress=decoded["proof_progress"],
            precision_history=data["precision_history"],
            diagnostics=decoded["diagnostics"],
            random_seed=data["random_seed"],
            signature=data["signature"],
        )
        if answer.to_dict() != data:
            raise ValueError("class/unit checkpoint is not canonically encoded")
        verifiers = {} if component_verifiers is None else dict(component_verifiers)
        unknown_verifiers = set(verifiers) - set(
            _SEQUENCE_COMPONENTS + _SINGLE_COMPONENTS
        )
        if unknown_verifiers:
            raise ValueError("unknown class/unit component verifier")
        for name in verifiers:
            verifier = verifiers[name]
            if not callable(verifier):
                raise TypeError("component verifier for " + name + " is not callable")
            value = getattr(answer, name)
            values = value if name in _SEQUENCE_COMPONENTS else (value,)
            for item in values:
                if verifier(item, answer) is not True:
                    raise ValueError(
                        "class/unit " + name + " replay verification failed"
                    )
        return answer

    replay = from_dict


DEFAULT_MAX_CHECKPOINT_BYTES = 256 * 1024 * 1024


class ClassUnitCancellationError(RuntimeError):
    """Cooperative cancellation observed at a named resumable stage."""

    def __init__(self, stage: str, details: Any = None) -> None:
        super().__init__("class/unit computation cancelled")
        self.stage = stage
        self.details = canonical_component({} if details is None else details)


class ClassUnitProgressEvent:
    """Immutable progress event delivered outside mathematical producers."""

    def __init__(
        self,
        sequence: int,
        stage: str,
        state: str,
        details: Any = None,
    ) -> None:
        self.sequence = _checked_nonnegative(sequence, "progress sequence")
        if not isinstance(stage, str) or stage == "":
            raise TypeError("a progress stage must be a nonempty string")
        if not isinstance(state, str) or state == "":
            raise TypeError("a progress state must be a nonempty string")
        self.stage = stage
        self.state = state
        self._details = canonical_component({} if details is None else details)
        runtime.object.freeze(self)

    @property
    def details(self) -> Any:
        return canonical_component(self._details)

    def to_dict(self) -> dict[str, Any]:
        return {
            "sequence": self.sequence,
            "stage": self.stage,
            "state": self.state,
            "details": canonical_component(self.details),
        }


def _checked_sha256(value: Any, purpose: str) -> str:
    if not isinstance(value, str) or len(value) != 64:
        raise ValueError(purpose + " must be a lowercase SHA-256 digest")
    if any(character not in "0123456789abcdef" for character in value):
        raise ValueError(purpose + " must be a lowercase SHA-256 digest")
    return value


def _checked_exact_bound(value: Any) -> tuple[int, int]:
    if isinstance(value, (list, tuple)):
        if len(value) != 2:
            raise ValueError("an exact Minkowski bound must be a rational pair")
        numerator = value[0]
        denominator = value[1]
    else:
        numerator = value
        denominator = 1
    if (
        isinstance(numerator, bool)
        or not isinstance(numerator, int)
        or isinstance(denominator, bool)
        or not isinstance(denominator, int)
    ):
        raise TypeError("an exact Minkowski bound must contain integers")
    if numerator < 0 or denominator < 1:
        raise ValueError("an exact Minkowski bound must be nonnegative")
    left = numerator
    right = denominator
    while right:
        left, right = right, left % right
    divisor = abs(left)
    return (numerator // divisor, denominator // divisor)


def _checked_dependency_hashes(value: Any) -> dict[str, str]:
    if value is None:
        return {}
    if not isinstance(value, dict):
        raise TypeError("Minkowski proof dependency hashes must be a dictionary")
    answer: dict[str, str] = {}
    for name in sorted(value):
        if not isinstance(name, str) or name == "":
            raise TypeError("Minkowski proof dependency names must be nonempty strings")
        answer[name] = _checked_sha256(
            value[name], "Minkowski proof dependency " + name
        )
    return answer


def _proof_record_index(record: Any) -> int:
    index = getattr(record, "index", None)
    if callable(index):
        index = index()
    if index is None:
        payload = canonical_component(record)
        if not isinstance(payload, dict):
            raise TypeError("a Minkowski proof record must serialize to a dictionary")
        index = payload.get("index")
    return _checked_nonnegative(index, "Minkowski proof record index")


class MinkowskiProofProgressRecord:
    """Authenticated evidence for one prime in a Minkowski proof stream."""

    def __init__(self, index: int, prime_fingerprint: Any, evidence: Any) -> None:
        self.index = _checked_nonnegative(index, "Minkowski proof record index")
        self._prime_fingerprint = canonical_component(prime_fingerprint)
        self._evidence = evidence
        canonical_component(evidence)
        runtime.object.freeze(self)

    @property
    def prime_fingerprint(self) -> Any:
        return canonical_component(self._prime_fingerprint)

    @property
    def evidence(self) -> Any:
        return self._evidence

    def _body_dict(self) -> dict[str, Any]:
        return {
            "schema": MINKOWSKI_PROGRESS_RECORD_SCHEMA,
            "index": self.index,
            "prime_fingerprint": canonical_component(self._prime_fingerprint),
            "evidence": canonical_component(self._evidence),
        }

    def to_dict(self) -> dict[str, Any]:
        body = self._body_dict()
        body["content_sha256"] = _content_hash(body)
        return body

    def stable_hash(self) -> str:
        return self.to_dict()["content_sha256"]

    @classmethod
    def from_dict(
        cls,
        data: dict[str, Any],
        evidence_decoder: Any = None,
        evidence_verifier: Any = None,
    ) -> MinkowskiProofProgressRecord:
        if not isinstance(data, dict):
            raise TypeError("a Minkowski proof record must be a dictionary")
        if data.get("schema") != MINKOWSKI_PROGRESS_RECORD_SCHEMA:
            raise ValueError("unsupported Minkowski proof record schema")
        body = dict(data)
        expected = body.pop("content_sha256", None)
        if not isinstance(expected, str) or _content_hash(body) != expected:
            raise ValueError("Minkowski proof record content hash mismatch")
        if evidence_decoder is not None and not callable(evidence_decoder):
            raise TypeError("a Minkowski evidence decoder must be callable")
        evidence = data.get("evidence")
        if evidence_decoder is not None:
            evidence = evidence_decoder(evidence)
        answer = cls(data["index"], data.get("prime_fingerprint"), evidence)
        if answer.to_dict() != data:
            raise ValueError("a Minkowski proof record is not canonically encoded")
        if evidence_verifier is not None:
            if not callable(evidence_verifier):
                raise TypeError("a Minkowski evidence verifier must be callable")
            if (
                evidence_verifier(
                    answer.evidence,
                    answer.index,
                    answer.prime_fingerprint,
                )
                is not True
            ):
                raise ValueError("Minkowski proof-record evidence verification failed")
        return answer


class MinkowskiProofPartition:
    """One immutable resumable prefix of a deterministic proof partition."""

    def __init__(
        self,
        plan_sha256: str,
        partition_index: int,
        partition_count: int,
        total_items: int,
        records: Iterable[Any] = (),
    ) -> None:
        self.plan_sha256 = _checked_sha256(plan_sha256, "Minkowski proof plan hash")
        checked_count = _checked_positive_optional(
            partition_count, "Minkowski proof partition count"
        )
        if checked_count is None:
            raise AssertionError("a proof partition count cannot be None")
        self.partition_count: int = checked_count
        self.partition_index = _checked_nonnegative(
            partition_index, "Minkowski proof partition index"
        )
        if self.partition_index >= self.partition_count:
            raise ValueError("a Minkowski proof partition index is out of range")
        self.total_items = _checked_nonnegative(
            total_items, "Minkowski proof item count"
        )
        values = tuple(records)
        assigned = tuple(
            range(self.partition_index, self.total_items, self.partition_count)
        )
        if len(values) > len(assigned):
            raise ValueError("a Minkowski proof partition has too many records")
        for position, record in enumerate(values):
            canonical_component(record)
            if _proof_record_index(record) != assigned[position]:
                raise ValueError(
                    "Minkowski proof records must be the assigned prefix in order"
                )
        self._records = values
        self._assigned_indices = assigned
        runtime.object.freeze(self)

    @property
    def records(self) -> tuple[Any, ...]:
        return self._records

    @property
    def assigned_indices(self) -> tuple[int, ...]:
        return self._assigned_indices

    @property
    def pending_indices(self) -> tuple[int, ...]:
        return self._assigned_indices[len(self._records) :]

    @property
    def complete(self) -> bool:
        return len(self._records) == len(self._assigned_indices)

    def append(self, record: Any) -> MinkowskiProofPartition:
        if self.complete:
            raise ValueError("a complete Minkowski proof partition cannot grow")
        if _proof_record_index(record) != self.pending_indices[0]:
            raise ValueError("a Minkowski proof record is not the next assigned item")
        return MinkowskiProofPartition(
            self.plan_sha256,
            self.partition_index,
            self.partition_count,
            self.total_items,
            self._records + (record,),
        )

    def merge(self, other: MinkowskiProofPartition) -> MinkowskiProofPartition:
        if not isinstance(other, MinkowskiProofPartition):
            raise TypeError("only Minkowski proof partitions can be merged")
        identity = (
            self.plan_sha256,
            self.partition_index,
            self.partition_count,
            self.total_items,
        )
        other_identity = (
            other.plan_sha256,
            other.partition_index,
            other.partition_count,
            other.total_items,
        )
        if identity != other_identity:
            raise ValueError("Minkowski proof partitions belong to different plans")
        overlap = min(len(self._records), len(other._records))
        for index in range(overlap):
            if canonical_component(self._records[index]) != canonical_component(
                other._records[index]
            ):
                raise ValueError("Minkowski proof partitions diverge on one record")
        return self if len(self._records) >= len(other._records) else other

    def _body_dict(self) -> dict[str, Any]:
        return {
            "schema": MINKOWSKI_PROOF_PARTITION_SCHEMA,
            "plan_sha256": self.plan_sha256,
            "partition_index": self.partition_index,
            "partition_count": self.partition_count,
            "total_items": self.total_items,
            "records": canonical_component(self._records),
        }

    def to_dict(self) -> dict[str, Any]:
        body = self._body_dict()
        body["content_sha256"] = _content_hash(body)
        return body

    def stable_hash(self) -> str:
        return self.to_dict()["content_sha256"]

    @classmethod
    def from_dict(
        cls,
        data: dict[str, Any],
        record_decoder: Any = None,
    ) -> MinkowskiProofPartition:
        if not isinstance(data, dict):
            raise TypeError("a Minkowski proof partition must be a dictionary")
        if data.get("schema") != MINKOWSKI_PROOF_PARTITION_SCHEMA:
            raise ValueError("unsupported Minkowski proof partition schema")
        body = dict(data)
        expected = body.pop("content_sha256", None)
        if not isinstance(expected, str) or _content_hash(body) != expected:
            raise ValueError("Minkowski proof partition content hash mismatch")
        if record_decoder is not None and not callable(record_decoder):
            raise TypeError("a Minkowski proof-record decoder must be callable")
        raw_records = data.get("records")
        if not isinstance(raw_records, list):
            raise TypeError("Minkowski proof partition records must be a list")
        records = [
            value if record_decoder is None else record_decoder(value)
            for value in raw_records
        ]
        answer = cls(
            data["plan_sha256"],
            data["partition_index"],
            data["partition_count"],
            data["total_items"],
            records,
        )
        if answer.to_dict() != data:
            raise ValueError("a Minkowski proof partition is not canonically encoded")
        return answer


class MinkowskiProofProgress:
    """Authenticated deterministic coverage of a parallel Minkowski proof."""

    def __init__(
        self,
        bound: Any,
        prime_fingerprints: Iterable[Any],
        *,
        partition_count: int = 1,
        theorem: str = "Minkowski ideal-class theorem",
        dependency_hashes: dict[str, str] | None = None,
        partitions: Iterable[MinkowskiProofPartition] | None = None,
    ) -> None:
        if not isinstance(theorem, str) or "Minkowski" not in theorem:
            raise ValueError("a Minkowski proof plan must name its theorem")
        count = _checked_positive_optional(
            partition_count, "Minkowski proof partition count"
        )
        if count is None:
            raise AssertionError("a proof partition count cannot be None")
        fingerprints = canonical_component(tuple(prime_fingerprints))
        if not isinstance(fingerprints, list):
            raise AssertionError("canonical fingerprints must be a list")
        self.theorem = theorem
        self.bound = _checked_exact_bound(bound)
        self.partition_count = count
        self._prime_fingerprints = fingerprints
        self._dependency_hashes = _checked_dependency_hashes(dependency_hashes)
        self.plan_sha256 = _content_hash(self._plan_dict())
        if partitions is None:
            partition_values = tuple(
                MinkowskiProofPartition(
                    self.plan_sha256,
                    index,
                    self.partition_count,
                    len(self._prime_fingerprints),
                )
                for index in range(self.partition_count)
            )
        else:
            partition_values = tuple(partitions)
        if len(partition_values) != self.partition_count:
            raise ValueError("a Minkowski proof plan lost a partition")
        for index, partition in enumerate(partition_values):
            if not isinstance(partition, MinkowskiProofPartition):
                raise TypeError("Minkowski proof partitions have the wrong type")
            if (
                partition.plan_sha256 != self.plan_sha256
                or partition.partition_index != index
                or partition.partition_count != self.partition_count
                or partition.total_items != len(self._prime_fingerprints)
            ):
                raise ValueError("a Minkowski proof partition has stale plan metadata")
            for record in partition.records:
                record_index = _proof_record_index(record)
                record_fingerprint = getattr(record, "prime_fingerprint", None)
                if callable(record_fingerprint):
                    record_fingerprint = record_fingerprint()
                if record_fingerprint is not None and canonical_component(
                    record_fingerprint
                ) != canonical_component(self._prime_fingerprints[record_index]):
                    raise ValueError("a proof record belongs to another prime ideal")
        self._partitions = partition_values
        runtime.object.freeze(self)

    @classmethod
    def create(
        cls,
        bound: Any,
        prime_fingerprints: Iterable[Any],
        *,
        partition_count: int = 1,
        theorem: str = "Minkowski ideal-class theorem",
        dependency_hashes: dict[str, str] | None = None,
    ) -> MinkowskiProofProgress:
        return cls(
            bound,
            prime_fingerprints,
            partition_count=partition_count,
            theorem=theorem,
            dependency_hashes=dependency_hashes,
        )

    @property
    def prime_fingerprints(self) -> tuple[Any, ...]:
        return tuple(canonical_component(self._prime_fingerprints))

    @property
    def dependency_hashes(self) -> dict[str, str]:
        return dict(self._dependency_hashes)

    @property
    def partitions(self) -> tuple[MinkowskiProofPartition, ...]:
        return self._partitions

    @property
    def completed_items(self) -> int:
        return sum(len(partition.records) for partition in self._partitions)

    @property
    def total_items(self) -> int:
        return len(self._prime_fingerprints)

    @property
    def complete(self) -> bool:
        return all(partition.complete for partition in self._partitions)

    def pending_indices(self, partition_index: int | None = None) -> tuple[int, ...]:
        if partition_index is None:
            values: list[int] = []
            for partition in self._partitions:
                values.extend(partition.pending_indices)
            return tuple(sorted(values))
        index = _checked_nonnegative(partition_index, "Minkowski proof partition index")
        if index >= self.partition_count:
            raise ValueError("a Minkowski proof partition index is out of range")
        return self._partitions[index].pending_indices

    def record(self, index: int, record: Any) -> MinkowskiProofProgress:
        record_index = _proof_record_index(record)
        checked_index = _checked_nonnegative(index, "Minkowski proof record index")
        if record_index != checked_index or checked_index >= self.total_items:
            raise ValueError("a Minkowski proof record has the wrong global index")
        partition_index = checked_index % self.partition_count
        partitions = list(self._partitions)
        partitions[partition_index] = partitions[partition_index].append(record)
        return MinkowskiProofProgress(
            self.bound,
            self._prime_fingerprints,
            partition_count=self.partition_count,
            theorem=self.theorem,
            dependency_hashes=self._dependency_hashes,
            partitions=partitions,
        )

    def merge_partition(
        self, partition: MinkowskiProofPartition
    ) -> MinkowskiProofProgress:
        if not isinstance(partition, MinkowskiProofPartition):
            raise TypeError("only a Minkowski proof partition can be merged")
        if partition.partition_index >= self.partition_count:
            raise ValueError("a Minkowski proof partition index is out of range")
        partitions = list(self._partitions)
        partitions[partition.partition_index] = partitions[
            partition.partition_index
        ].merge(partition)
        return MinkowskiProofProgress(
            self.bound,
            self._prime_fingerprints,
            partition_count=self.partition_count,
            theorem=self.theorem,
            dependency_hashes=self._dependency_hashes,
            partitions=partitions,
        )

    def merge(self, other: MinkowskiProofProgress) -> MinkowskiProofProgress:
        if not isinstance(other, MinkowskiProofProgress):
            raise TypeError("only Minkowski proof progress records can be merged")
        if self.plan_sha256 != other.plan_sha256:
            raise ValueError("Minkowski proof progress belongs to another plan")
        answer = self
        for partition in other.partitions:
            answer = answer.merge_partition(partition)
        return answer

    def _plan_dict(self) -> dict[str, Any]:
        return {
            "theorem": self.theorem,
            "bound": list(self.bound),
            "prime_fingerprints": canonical_component(self._prime_fingerprints),
            "dependency_hashes": dict(self._dependency_hashes),
            "partition_count": self.partition_count,
        }

    def matches_plan(
        self,
        bound: Any,
        prime_fingerprints: Iterable[Any],
        *,
        partition_count: int = 1,
        theorem: str = "Minkowski ideal-class theorem",
        dependency_hashes: dict[str, str] | None = None,
    ) -> bool:
        try:
            expected = MinkowskiProofProgress.create(
                bound,
                prime_fingerprints,
                partition_count=partition_count,
                theorem=theorem,
                dependency_hashes=dependency_hashes,
            )
            return self.plan_sha256 == expected.plan_sha256
        except (TypeError, ValueError):
            return False

    def verify_records(self, record_verifier: Any) -> bool:
        if not callable(record_verifier):
            raise TypeError("a Minkowski proof-record verifier must be callable")
        for partition in self._partitions:
            for record in partition.records:
                index = _proof_record_index(record)
                if (
                    record_verifier(
                        record,
                        index,
                        canonical_component(self._prime_fingerprints[index]),
                    )
                    is not True
                ):
                    return False
        return True

    def _body_dict(self) -> dict[str, Any]:
        body = {
            "schema": MINKOWSKI_PROOF_PROGRESS_SCHEMA,
            **self._plan_dict(),
            "plan_sha256": self.plan_sha256,
            "partitions": [partition.to_dict() for partition in self._partitions],
            "completed_items": self.completed_items,
            "complete": self.complete,
        }
        return body

    def to_dict(self) -> dict[str, Any]:
        body = self._body_dict()
        body["content_sha256"] = _content_hash(body)
        return body

    def stable_hash(self) -> str:
        return self.to_dict()["content_sha256"]

    @classmethod
    def from_dict(
        cls,
        data: dict[str, Any],
        record_decoder: Any = None,
        record_verifier: Any = None,
    ) -> MinkowskiProofProgress:
        if not isinstance(data, dict):
            raise TypeError("Minkowski proof progress must be a dictionary")
        if data.get("schema") != MINKOWSKI_PROOF_PROGRESS_SCHEMA:
            raise ValueError("unsupported Minkowski proof-progress schema")
        body = dict(data)
        expected = body.pop("content_sha256", None)
        if not isinstance(expected, str) or _content_hash(body) != expected:
            raise ValueError("Minkowski proof-progress content hash mismatch")
        raw_partitions = data.get("partitions")
        if not isinstance(raw_partitions, list):
            raise TypeError("Minkowski proof partitions must be a list")
        partitions = [
            MinkowskiProofPartition.from_dict(value, record_decoder)
            for value in raw_partitions
        ]
        answer = cls(
            data.get("bound"),
            data.get("prime_fingerprints", ()),
            partition_count=data["partition_count"],
            theorem=data["theorem"],
            dependency_hashes=data.get("dependency_hashes"),
            partitions=partitions,
        )
        if answer.to_dict() != data:
            raise ValueError("Minkowski proof progress is not canonically encoded")
        if record_verifier is not None and not answer.verify_records(record_verifier):
            raise ValueError("Minkowski proof-record replay verification failed")
        return answer


def _checkpoint_byte_limit(value: Any, name: str) -> int:
    if value is None:
        return DEFAULT_MAX_CHECKPOINT_BYTES
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ValueError(name + " must be a positive integer")
    return value


def _checkpoint_text(payload: dict[str, Any], maximum_bytes: int) -> str:
    text = _canonical_json(payload)
    if len(text.encode("utf-8")) > maximum_bytes:
        raise ValueError("class/unit checkpoint exceeds its byte limit")
    return text


def _sync_not_supported(error: OSError) -> bool:
    unsupported = {
        getattr(errno, "EINVAL", -1),
        getattr(errno, "ENOSYS", -1),
        getattr(errno, "ENOTSUP", -1),
        getattr(errno, "EOPNOTSUPP", -1),
    }
    return getattr(error, "errno", None) in unsupported


def _sync_parent_directory(path: str) -> None:
    if os.name == "nt":
        return
    native_open = getattr(os, "open", None)
    native_close = getattr(os, "close", None)
    sync = getattr(os, "fsync", None)
    read_only = getattr(os, "O_RDONLY", None)
    if (
        not callable(native_open)
        or not callable(native_close)
        or not callable(sync)
        or not isinstance(read_only, int)
    ):
        return
    flags = read_only
    directory_flag = getattr(os, "O_DIRECTORY", 0)
    close_on_exec = getattr(os, "O_CLOEXEC", 0)
    if isinstance(directory_flag, int):
        flags |= directory_flag
    if isinstance(close_on_exec, int):
        flags |= close_on_exec
    directory = os.path.dirname(os.path.abspath(path)) or "."
    try:
        descriptor = native_open(directory, flags)
    except OSError as error:
        if _sync_not_supported(error):
            return
        raise
    try:
        try:
            sync(descriptor)
        except OSError as error:
            if not _sync_not_supported(error):
                raise
    finally:
        native_close(descriptor)


def _checkpoint_temporary_path(path: str) -> str:
    directory = os.path.dirname(path) or "."
    basename = os.path.basename(path)
    token = os.urandom(16).hex()
    return os.path.join(directory, "." + basename + ".tmp-" + token)


def _open_exclusive_checkpoint(path: str) -> int:
    native_open = getattr(os, "open", None)
    write_only = getattr(os, "O_WRONLY", None)
    create = getattr(os, "O_CREAT", None)
    exclusive = getattr(os, "O_EXCL", None)
    if (
        callable(native_open)
        and isinstance(write_only, int)
        and isinstance(create, int)
        and isinstance(exclusive, int)
    ):
        flags = write_only | create | exclusive
        no_follow = getattr(os, "O_NOFOLLOW", 0)
        close_on_exec = getattr(os, "O_CLOEXEC", 0)
        binary = getattr(os, "O_BINARY", 0)
        for optional_flag in (no_follow, close_on_exec, binary):
            if isinstance(optional_flag, int):
                flags |= optional_flag
        descriptor = native_open(path, flags, 0o600)
        if isinstance(descriptor, bool) or not isinstance(descriptor, int):
            raise TypeError("os.open() did not return a file descriptor")
        return descriptor
    raise NotImplementedError(
        "secure checkpoint writes require descriptor-level exclusive creation"
    )


def _write_checkpoint_descriptor(descriptor: int, data: bytes) -> None:
    write = getattr(os, "write", None)
    sync = getattr(os, "fsync", None)
    if not callable(write) or not callable(sync):
        raise NotImplementedError(
            "secure checkpoint writes require descriptor write and fsync"
        )
    offset = 0
    while offset < len(data):
        written = write(descriptor, data[offset:])
        if isinstance(written, bool) or not isinstance(written, int) or written <= 0:
            raise OSError(errno.EIO, "checkpoint descriptor write made no progress")
        if written > len(data) - offset:
            raise OSError(errno.EIO, "checkpoint descriptor write over-reported bytes")
        offset += written
    sync(descriptor)


def _write_checkpoint_path(path: str, text: str) -> None:
    if path == "":
        raise ValueError("a checkpoint destination path cannot be empty")
    temporary = None
    descriptor = None
    try:
        for _attempt in range(128):
            candidate = _checkpoint_temporary_path(path)
            try:
                descriptor = _open_exclusive_checkpoint(candidate)
            except FileExistsError:
                continue
            temporary = candidate
            break
        if temporary is None:
            raise FileExistsError(
                "could not reserve a unique checkpoint temporary file"
            )
        if descriptor is None:
            raise AssertionError("a reserved checkpoint lost its descriptor")
        try:
            _write_checkpoint_descriptor(descriptor, (text + "\n").encode("utf-8"))
        finally:
            os.close(descriptor)
            descriptor = None
        os.replace(temporary, path)
        temporary = None
        _sync_parent_directory(path)
    except BaseException:
        if temporary is not None:
            try:
                os.unlink(temporary)
            except FileNotFoundError:
                pass
            except OSError:
                pass
        raise


def save_class_unit_checkpoint(
    destination: Any,
    context: ClassUnitGroupContext,
    *,
    max_checkpoint_bytes: int | None = None,
) -> str:
    """Atomically save a context path or call a duck-typed checkpoint sink.

    A sink object may expose `save(payload)`, or the destination itself may be
    callable.  Both receive a detached canonical dictionary.  String paths
    are written through a same-directory temporary file and `os.replace`, so
    an interrupted write leaves the previous complete checkpoint intact.
    """
    if not isinstance(context, ClassUnitGroupContext):
        raise TypeError("only a ClassUnitGroupContext can be checkpointed")
    configured_limit = context.limits.get("max_checkpoint_bytes")
    selected_limit = (
        configured_limit
        if max_checkpoint_bytes is None and configured_limit is not None
        else max_checkpoint_bytes
    )
    maximum = _checkpoint_byte_limit(selected_limit, "checkpoint byte limit")
    payload = context.to_dict()
    content_hash = payload["content_sha256"]
    text = _checkpoint_text(payload, maximum)
    if isinstance(destination, str):
        _write_checkpoint_path(path=destination, text=text)
    else:
        save = getattr(destination, "save", None)
        if callable(save):
            save(json.loads(text))
        elif callable(destination):
            destination(json.loads(text))
        else:
            raise TypeError(
                "a checkpoint destination must be a path, callable, or save(payload) sink"
            )
    return content_hash


def _read_checkpoint_source(source: Any, maximum_bytes: int) -> dict[str, Any]:
    raw: Any
    if isinstance(source, dict):
        raw = source
    elif isinstance(source, str):
        with open(source, "rb") as handle:
            encoded = handle.read(maximum_bytes + 1)
        if len(encoded) > maximum_bytes:
            raise ValueError("class/unit checkpoint exceeds its byte limit")
        raw = encoded.decode("utf-8")
    else:
        load = getattr(source, "load", None)
        if callable(load):
            raw = load()
        elif callable(source):
            raw = source()
        else:
            raise TypeError(
                "a checkpoint source must be a path, payload, callable, or load() source"
            )
    if isinstance(raw, str):
        if len(raw.encode("utf-8")) > maximum_bytes:
            raise ValueError("class/unit checkpoint exceeds its byte limit")
        payload = json.loads(raw)
    elif isinstance(raw, dict):
        text = _checkpoint_text(raw, maximum_bytes)
        payload = json.loads(text)
    else:
        raise TypeError("a checkpoint source returned neither text nor a dictionary")
    if not isinstance(payload, dict):
        raise TypeError("a class/unit checkpoint must contain a JSON object")
    return payload


def load_class_unit_checkpoint(
    source: Any,
    field: Any,
    order: Any,
    *,
    component_decoders: dict[str, Any] | None = None,
    component_verifiers: dict[str, Any] | None = None,
    max_checkpoint_bytes: int | None = None,
) -> ClassUnitGroupContext:
    """Load, integrity-check, decode, and independently verify a checkpoint."""
    maximum = _checkpoint_byte_limit(max_checkpoint_bytes, "checkpoint byte limit")
    payload = _read_checkpoint_source(source, maximum)
    return ClassUnitGroupContext.from_dict(
        field,
        order,
        payload,
        component_decoders=component_decoders,
        component_verifiers=component_verifiers,
    )


class ClassUnitCheckpoint:
    """Duck-typed execution controller for durable class/unit computations.

    The mathematical engine remains independent of files and callback policy.
    It captures exact producer records here, calls `stage` around expensive
    work, polls `check_cancelled`, and calls `save` at resumable boundaries.
    A resumed controller exposes decoded state through its `restore_*` methods.
    """

    def __init__(
        self,
        field: Any,
        order: Any,
        proof_state: ClassUnitProofState | None = None,
        *,
        algorithm: str | None = None,
        limits: ResourceLimits | None = None,
        random_seed: int | None = None,
        destination: Any = None,
        resume_from: Any = None,
        progress: Any = None,
        cancelled: Any = None,
        component_decoders: dict[str, Any] | None = None,
        component_verifiers: dict[str, Any] | None = None,
        max_checkpoint_bytes: int | None = None,
    ) -> None:
        if progress is not None and not callable(progress):
            raise TypeError("a class/unit progress callback must be callable")
        if cancelled is not None and not callable(cancelled):
            raise TypeError("a class/unit cancellation callback must be callable")
        self._progress = progress
        self._cancelled = cancelled
        initial_maximum = max_checkpoint_bytes
        if initial_maximum is None and limits is not None:
            initial_maximum = limits.get("max_checkpoint_bytes")
        self._maximum_bytes = _checkpoint_byte_limit(
            initial_maximum, "checkpoint byte limit"
        )
        self._destination = (
            resume_from
            if destination is None and isinstance(resume_from, str)
            else destination
        )
        self._last_saved_hash: str | None = None
        if resume_from is None:
            if proof_state is None:
                raise TypeError("a new class/unit checkpoint needs a proof state")
            self.context = ClassUnitGroupContext(
                field,
                order,
                proof_state,
                algorithm="auto" if algorithm is None else algorithm,
                limits=limits,
                random_seed=0 if random_seed is None else random_seed,
            )
            self.resumed = False
        else:
            self.context = load_class_unit_checkpoint(
                resume_from,
                field,
                order,
                component_decoders=component_decoders,
                component_verifiers=component_verifiers,
                max_checkpoint_bytes=self._maximum_bytes,
            )
            self.resumed = True
            if proof_state is not None and (
                proof_state.stable_hash() != self.context.proof_state.stable_hash()
            ):
                raise ValueError("resume proof policy differs from the checkpoint")
            if algorithm is not None and algorithm != self.context.algorithm:
                raise ValueError("resume algorithm differs from the checkpoint")
            if (
                limits is not None
                and limits.stable_hash() != self.context.limits.stable_hash()
            ):
                raise ValueError("resume resource limits differ from the checkpoint")
            if random_seed is not None and random_seed != self.context.random_seed:
                raise ValueError("resume random seed differs from the checkpoint")
            self._last_saved_hash = self.context.stable_hash()
        if max_checkpoint_bytes is None:
            context_maximum = self.context.limits.get("max_checkpoint_bytes")
            if context_maximum is not None:
                self._maximum_bytes = _checkpoint_byte_limit(
                    context_maximum, "checkpoint byte limit"
                )
        last_progress = None
        if isinstance(self.context.diagnostics, dict):
            last_progress = self.context.diagnostics.get("last_progress")
        self._progress_sequence = (
            int(last_progress.get("sequence", -1)) + 1
            if isinstance(last_progress, dict)
            else 0
        )

    def restore_factor_base(self) -> tuple[Any, ...]:
        return self.context.factor_base

    def restore_relations(self) -> tuple[Any, ...]:
        return self.context.relations

    def restore_search_state(self) -> Any:
        return self.context.search_state

    def restore_matrix_state(self) -> Any:
        return self.context.matrix_state

    def restore_proof_progress(self) -> Any:
        return self.context.proof_progress

    def restore_minkowski_proof_progress(
        self,
        *,
        bound: Any,
        prime_fingerprints: Iterable[Any],
        partition_count: int = 1,
        theorem: str = "Minkowski ideal-class theorem",
        dependency_hashes: dict[str, str] | None = None,
        record_decoder: Any = None,
        record_verifier: Any = None,
    ) -> MinkowskiProofProgress | None:
        """Restore proof progress only when it matches the requested exact plan."""
        value = self.context.proof_progress
        if value is None:
            return None
        if isinstance(value, dict):
            value = MinkowskiProofProgress.from_dict(
                value,
                record_decoder=record_decoder,
                record_verifier=record_verifier,
            )
            self.context.set_proof_progress(value)
        if not isinstance(value, MinkowskiProofProgress):
            raise TypeError("checkpoint proof progress is not a Minkowski proof plan")
        if not value.matches_plan(
            bound,
            prime_fingerprints,
            partition_count=partition_count,
            theorem=theorem,
            dependency_hashes=dependency_hashes,
        ):
            raise ValueError("checkpoint Minkowski proof plan differs from this run")
        if record_verifier is not None and not value.verify_records(record_verifier):
            raise ValueError("Minkowski proof-record replay verification failed")
        return value

    def begin_minkowski_proof(
        self,
        bound: Any,
        prime_fingerprints: Iterable[Any],
        *,
        partition_count: int = 1,
        theorem: str = "Minkowski ideal-class theorem",
        dependency_hashes: dict[str, str] | None = None,
        force: bool = True,
    ) -> MinkowskiProofProgress:
        """Create and durably record one deterministic Minkowski proof plan."""
        if self.context.proof_progress is not None:
            raise ValueError("checkpoint already contains proof progress")
        self.check_cancelled("unconditional-proof", {"state": "planning"})
        progress = MinkowskiProofProgress.create(
            bound,
            prime_fingerprints,
            partition_count=partition_count,
            theorem=theorem,
            dependency_hashes=dependency_hashes,
        )
        self.context.set_proof_progress(progress)
        self.save(force=force)
        return progress

    def _checkpoint_minkowski_progress(
        self,
        progress: MinkowskiProofProgress,
        updated: MinkowskiProofProgress,
        details: Any,
        force: bool,
    ) -> MinkowskiProofProgress:
        current = self.context.proof_progress
        if (
            current is not progress
            and canonical_component(current) != progress.to_dict()
        ):
            raise ValueError("Minkowski proof progress is stale for this checkpoint")
        event_details = canonical_component({} if details is None else details)
        if not isinstance(event_details, dict):
            raise TypeError("Minkowski checkpoint details must be a dictionary")
        event_details.update(
            {
                "completed": updated.completed_items,
                "total": updated.total_items,
                "plan_sha256": updated.plan_sha256,
            }
        )
        self.check_cancelled("unconditional-proof", event_details)
        self.context.set_proof_progress(updated)
        try:
            self.stage("unconditional-proof", "checkpoint", event_details)
        finally:
            # A callback-triggered cancellation or exception cannot discard the
            # exact prime record which was just accepted.
            self.save(force=force)
        return updated

    def checkpoint_minkowski_proof_prime(
        self,
        progress: MinkowskiProofProgress,
        index: int,
        record: Any,
        *,
        details: Any = None,
        force: bool = True,
    ) -> MinkowskiProofProgress:
        """Append and atomically checkpoint one exact proof-prime record."""
        if not isinstance(progress, MinkowskiProofProgress):
            raise TypeError("Minkowski proof progress has the wrong type")
        updated = progress.record(index, record)
        return self._checkpoint_minkowski_progress(progress, updated, details, force)

    def checkpoint_minkowski_proof_partition(
        self,
        progress: MinkowskiProofProgress,
        partition: MinkowskiProofPartition,
        *,
        details: Any = None,
        force: bool = True,
    ) -> MinkowskiProofProgress:
        """Merge and atomically checkpoint one deterministic worker prefix."""
        if not isinstance(progress, MinkowskiProofProgress):
            raise TypeError("Minkowski proof progress has the wrong type")
        updated = progress.merge_partition(partition)
        return self._checkpoint_minkowski_progress(progress, updated, details, force)

    def capture(self, payload: dict[str, Any]) -> None:
        """Capture one exact resumable state update from a producer engine."""
        if not isinstance(payload, dict):
            raise TypeError("checkpoint capture payload must be a dictionary")
        allowed = {
            "factor_base",
            "relations",
            "relation",
            "search_state",
            "matrix_state",
            "class_group_state",
            "unit_state",
            "analytic_state",
            "saturation_history",
            "saturation",
            "proof_progress",
            "precision_history",
            "precision",
            "diagnostics",
        }
        if set(payload) - allowed:
            raise ValueError("a checkpoint capture payload has unknown fields")
        if "factor_base" in payload:
            self.context.set_factor_base(payload["factor_base"])
        if "relations" in payload:
            self.context.set_relations(payload["relations"])
        if "relation" in payload:
            self.context.add_relation(payload["relation"])
        if "search_state" in payload:
            self.context.set_search_state(payload["search_state"])
        for name, setter_name in (
            ("matrix_state", "set_matrix_state"),
            ("class_group_state", "set_class_group_state"),
            ("unit_state", "set_unit_state"),
            ("analytic_state", "set_analytic_state"),
            ("proof_progress", "set_proof_progress"),
        ):
            if name in payload:
                getattr(self.context, setter_name)(payload[name])
        if "saturation_history" in payload:
            values = tuple(payload["saturation_history"])
            for value in values:
                canonical_component(value)
            self.context.saturation_history = values
        if "saturation" in payload:
            self.context.record_saturation(payload["saturation"])
        if "precision_history" in payload:
            self.context.precision_history = _checked_precision_history(
                payload["precision_history"]
            )
        if "precision" in payload:
            self.context.record_precision(payload["precision"])
        if "diagnostics" in payload:
            diagnostics = canonical_component(payload["diagnostics"])
            if not isinstance(diagnostics, dict):
                raise TypeError("checkpoint diagnostics must be a dictionary")
            current = canonical_component(self.context.diagnostics)
            if not isinstance(current, dict):
                raise TypeError("context diagnostics must be a dictionary")
            current.update(diagnostics)
            self.context.diagnostics = current

    def check_cancelled(self, stage: str = "", details: Any = None) -> None:
        if self._cancelled is not None and self._cancelled():
            raise ClassUnitCancellationError(stage, details)

    def stage(
        self, name: str, state: str, details: Any = None
    ) -> ClassUnitProgressEvent:
        """Record and publish one progress transition with cancellation polls."""
        self.check_cancelled(name, details)
        event = ClassUnitProgressEvent(
            self._progress_sequence,
            name,
            state,
            details,
        )
        self._progress_sequence += 1
        current = canonical_component(self.context.diagnostics)
        if not isinstance(current, dict):
            raise TypeError("context diagnostics must be a dictionary")
        current["last_progress"] = event.to_dict()
        current["progress_events"] = self._progress_sequence
        self.context.diagnostics = current
        if self._progress is not None:
            self._progress(event)
        self.check_cancelled(name, details)
        return event

    def save(self, payload: dict[str, Any] | None = None, force: bool = False) -> str:
        """Capture optional state and durably save a canonical checkpoint."""
        if payload is not None:
            self.capture(payload)
        content_hash = self.context.stable_hash()
        if self._destination is None:
            return content_hash
        if not force and content_hash == self._last_saved_hash:
            return content_hash
        saved = save_class_unit_checkpoint(
            self._destination,
            self.context,
            max_checkpoint_bytes=self._maximum_bytes,
        )
        self._last_saved_hash = saved
        return saved


__all__ = [
    "ALGORITHMS",
    "CONTEXT_SERIALIZATION_SCHEMA",
    "ClassUnitCancellationError",
    "ClassUnitCheckpoint",
    "ClassUnitGroupContext",
    "ClassUnitProgressEvent",
    "ClassUnitProofState",
    "DEFAULT_MAX_CHECKPOINT_BYTES",
    "MINKOWSKI_PROGRESS_RECORD_SCHEMA",
    "MINKOWSKI_PROOF_PARTITION_SCHEMA",
    "MINKOWSKI_PROOF_PROGRESS_SCHEMA",
    "MinkowskiProofPartition",
    "MinkowskiProofProgress",
    "MinkowskiProofProgressRecord",
    "PROOF_LABELS",
    "PROOF_STATE_SERIALIZATION_SCHEMA",
    "RESOURCE_LIMITS_SERIALIZATION_SCHEMA",
    "ResourceLimits",
    "canonical_component",
    "load_class_unit_checkpoint",
    "save_class_unit_checkpoint",
    "stable_component_hash",
]
