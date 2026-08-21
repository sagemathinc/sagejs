"""Shared proof-aware state for class-group and unit-group computations.

The context is intentionally representation-neutral.  Producer lanes may put
ordinary JSON-safe records or objects exposing `to_dict()` into its component
slots.  Checkpoints detach and canonically serialize those records, authenticate
the complete payload, and can replay them through caller-supplied decoders and
verifiers.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Iterable

import sagejs.runtime as runtime
from sagejs.number_fields.factored_elements import field_fingerprint

CONTEXT_SERIALIZATION_SCHEMA = "sagejs.number-fields.class-unit-context.v1"
PROOF_STATE_SERIALIZATION_SCHEMA = "sagejs.number-fields.class-unit-proof-state.v1"
RESOURCE_LIMITS_SERIALIZATION_SCHEMA = "sagejs.number-fields.class-unit-limits.v1"

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

_SEQUENCE_COMPONENTS = ("factor_base", "relations", "saturation_history")
_SINGLE_COMPONENTS = (
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
        self.matrix_state = matrix_state
        self.class_group_state = class_group_state
        self.unit_state = unit_state
        self.analytic_state = analytic_state
        self.saturation_history = tuple(saturation_history)
        self.proof_progress = proof_progress
        self.precision_history = _checked_precision_history(precision_history)
        self.diagnostics = {} if diagnostics is None else diagnostics
        self._validate_components()

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
        """Return a deterministic authenticated checkpoint."""
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


__all__ = [
    "ALGORITHMS",
    "CONTEXT_SERIALIZATION_SCHEMA",
    "ClassUnitGroupContext",
    "ClassUnitProofState",
    "PROOF_LABELS",
    "PROOF_STATE_SERIALIZATION_SCHEMA",
    "RESOURCE_LIMITS_SERIALIZATION_SCHEMA",
    "ResourceLimits",
    "canonical_component",
    "stable_component_hash",
]
