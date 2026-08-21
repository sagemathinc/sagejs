"""Abstract finite class groups with exact maps to and from ideals.

`IdealClassGroup.from_context(context)` is the integration boundary.  The
context is duck typed and supplies:

- `order` and immutable `proof_state` or `proof_status`;
- `class_group_presentation` or `presentation`, whose `invariants` are the
  Smith invariant factors and whose optional `verify()` replays the exact
  relation-matrix transforms;
- `class_group_generator_ideals` or `generator_ideals`;
- `class_group_relation_witnesses` or `relation_witnesses`, one exact
  principal-ideal witness for each Smith generator raised to its invariant;
- `ideal_class_log(ideal)` or `ideal_log(ideal)`, returning coordinates plus a
  principal witness for `ideal / representative(coordinates)`;
- optional proof, algorithm, theorem, relation-count, and saturation metadata.

This module imports no concrete context or matrix implementation.  In
particular, a matrix lane can expose transformations without the map lane
depending on its class names, and factored elements can prove principal ideals
through `verify_principal_ideal(ideal)` or `principal_ideal()` without being
expanded.  The engine adapter additionally consumes a verified
`saturation_record`; unconditional results must expose authenticated
`proof_progress` with strided partitions plus independently computed
`proof_dependency_hashes` for `relations`, `presentation`, `generators`, and
`saturation`.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from sagejs.number_fields.class_group_proof import (
    COMPLETE_PROOF_LABELS,
    EXACT_RELATIONS_CONDITIONAL_GRH,
    EXACT_UNCONDITIONAL,
    ConditionalGRHProofRecord,
    MinkowskiPrimeClassRecord,
    SaturationProofRecord,
    UnconditionalMinkowskiProofRecord,
    proof_label,
)

_PROGRESS_SCHEMA = "sagejs.number-fields.minkowski-proof-progress.v1"
_PARTITION_SCHEMA = "sagejs.number-fields.minkowski-proof-partition.v1"
_PROGRESS_RECORD_SCHEMA = "sagejs.number-fields.minkowski-proof-progress-record.v1"
_SATURATION_SCHEMA = "sagejs.number-fields/class-unit-saturation-v1"


def _integer(value: Any, purpose: str) -> int:
    try:
        answer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise TypeError(purpose + " must be an exact integer") from error
    if answer != value:
        raise TypeError(purpose + " must be an exact integer")
    return answer


def _gcd(left: int, right: int) -> int:
    while right:
        left, right = right, left % right
    return left if left >= 0 else -left


def _value(owner: Any, names: tuple[str, ...], default: Any = None) -> Any:
    for name in names:
        if hasattr(owner, name):
            answer = getattr(owner, name)
            # Sage parents and rings are themselves callable values.  Invoke
            # only a method bound to the object being inspected.
            if getattr(answer, "__self__", None) is owner:
                return answer()
            return answer
    return default


def _call(owner: Any, names: tuple[str, ...]) -> Any:
    for name in names:
        answer = getattr(owner, name, None)
        if callable(answer):
            return answer
    return None


def _same_order(ideal: Any, order: Any) -> bool:
    ring = getattr(ideal, "ring", None)
    return callable(ring) and ring() is order


def _nonzero_ideal(ideal: Any, order: Any) -> None:
    if not _same_order(ideal, order):
        raise TypeError("an ideal-class map requires an ideal in its exact order")
    is_zero = getattr(ideal, "is_zero", None)
    if not callable(is_zero):
        raise TypeError("an ideal-class map requires an exact fractional ideal")
    if is_zero():
        raise ValueError("the zero ideal has no ideal class")


def _ideal_power(ideal: Any, exponent: int) -> Any:
    try:
        return ideal**exponent
    except (TypeError, AttributeError, NotImplementedError):
        arithmetic = __import__(
            "sagejs.number_fields.ideal_arithmetic", fromlist=["ideal_power"]
        )
        return arithmetic.ideal_power(ideal, exponent)


def _ideal_quotient(numerator: Any, denominator: Any) -> Any:
    try:
        return numerator / denominator
    except (TypeError, AttributeError, NotImplementedError):
        arithmetic = __import__(
            "sagejs.number_fields.ideal_arithmetic", fromlist=["ideal_quotient"]
        )
        return arithmetic.ideal_quotient(numerator, denominator)


def _principal_ideal(generator: Any, order: Any) -> Any:
    for name in ("principal_ideal", "associated_ideal", "ideal"):
        constructor = getattr(generator, name, None)
        if callable(constructor):
            try:
                return constructor()
            except TypeError:
                return constructor(order)
    return order.ideal(generator)


def _stage(result: Any, name: str) -> Any:
    for stage in getattr(result, "stages", ()):
        if getattr(stage, "name", None) == name:
            return stage
    return None


def _canonical_payload(value: Any, purpose: str) -> dict[str, Any]:
    serializer = getattr(value, "to_dict", None)
    if callable(serializer):
        value = serializer()
    if not isinstance(value, dict):
        raise TypeError(purpose + " must serialize to a dictionary")
    try:
        text = json.dumps(
            value,
            allow_nan=False,
            ensure_ascii=True,
            separators=(",", ":"),
            sort_keys=True,
        )
        payload = json.loads(text)
    except (TypeError, ValueError) as error:
        raise TypeError(purpose + " must be JSON-safe") from error
    if not isinstance(payload, dict):
        raise TypeError(purpose + " must serialize to a dictionary")
    return payload


def _payload_hash(payload: dict[str, Any]) -> str:
    text = json.dumps(
        payload,
        allow_nan=False,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _authenticated_payload(payload: dict[str, Any]) -> bool:
    expected = payload.get("content_sha256")
    if not isinstance(expected, str):
        return False
    body = dict(payload)
    del body["content_sha256"]
    return _payload_hash(body) == expected


def _portable_ideal_fingerprint(ideal: Any) -> dict[str, Any]:
    arithmetic = __import__(
        "sagejs.number_fields.ideal_arithmetic", fromlist=["serialize_ideal"]
    )
    payload = arithmetic.serialize_ideal(ideal)
    return {
        "field_order_fingerprint": payload["field_order_fingerprint"],
        "basis": payload["basis"],
    }


def _decode_factored_generator(field: Any, payload: dict[str, Any]) -> Any:
    factored = __import__(
        "sagejs.number_fields.factored_elements",
        fromlist=["FactoredNumberFieldElement"],
    )
    schema = payload.get("schema")
    if schema == getattr(factored, "SERIALIZATION_SCHEMA", None):
        return factored.FactoredNumberFieldElement.from_dict(field, payload)
    relations = __import__(
        "sagejs.number_fields.class_group_relations",
        fromlist=["FactoredPrincipalWitness"],
    )
    return relations.FactoredPrincipalWitness.from_dict(field, payload)


def _engine_material(engine_group: Any, result: Any) -> tuple[Any, Any]:
    """Read the public adapter surface, with the current engine as fallback."""
    order = _value(engine_group, ("ideal_order", "number_field_order"), None)
    if order is None:
        order = getattr(engine_group, "_order", None)
    if order is None:
        field = getattr(result, "field", None)
        maximal_order = getattr(field, "maximal_order", None)
        if callable(maximal_order):
            order = maximal_order()
    presentation = _value(
        engine_group,
        ("presentation", "relation_presentation", "class_group_presentation"),
        None,
    )
    if presentation is None:
        presentation = getattr(engine_group, "_presentation", None)
    return order, presentation


def _producer_saturation(result: Any) -> tuple[Any, dict[str, Any]]:
    raw = getattr(result, "saturation_record", None)
    if raw is None:
        diagnostics = getattr(result, "diagnostics", None)
        if isinstance(diagnostics, dict):
            raw = diagnostics.get("saturation_record")
    if raw is None:
        raise ArithmeticError(
            "a completed engine result has no replayable saturation evidence"
        )
    payload = _canonical_payload(raw, "engine saturation evidence")
    if payload.get("schema") != _SATURATION_SCHEMA:
        raise ValueError("engine saturation evidence has the wrong schema")
    if not _authenticated_payload(payload):
        raise ArithmeticError("engine saturation evidence failed authentication")
    for name in ("rigorous", "complete", "saturated"):
        if payload.get(name) is not True:
            raise ArithmeticError("engine saturation evidence is not " + name)
    remaining = _integer(
        payload.get("remaining_index_bound"), "remaining saturation index bound"
    )
    if remaining != 1:
        raise ArithmeticError("engine saturation evidence leaves a nontrivial index")
    return raw, payload


def _saturation_record(payload: dict[str, Any]) -> SaturationProofRecord:
    class_primes = tuple(
        _integer(value, "class saturation prime")
        for value in payload.get("class_primes", ())
    )
    unit_primes = tuple(
        _integer(value, "unit saturation prime")
        for value in payload.get("unit_primes", payload.get("required_primes", ()))
    )
    required = {
        _integer(value, "required saturation prime")
        for value in payload.get("required_primes", ())
    }
    if not required.issubset(set(class_primes) | set(unit_primes)):
        raise ArithmeticError("required saturation-prime coverage is incomplete")
    initial_bound = _integer(
        payload.get("initial_index_bound", payload.get("index_bound")),
        "initial saturation index bound",
    )
    return SaturationProofRecord(
        class_primes,
        unit_primes,
        index_bound=initial_bound,
        complete=True,
        evidence=payload,
    )


def _producer_proof_progress(result: Any) -> tuple[Any, dict[str, Any]]:
    raw = getattr(result, "proof_progress", None)
    if raw is None:
        diagnostics = getattr(result, "diagnostics", None)
        if isinstance(diagnostics, dict):
            raw = diagnostics.get("proof_progress")
    if raw is None:
        raise ArithmeticError(
            "an unconditional engine result has no authenticated proof progress"
        )
    payload = _canonical_payload(raw, "Minkowski proof progress")
    if payload.get("schema") != _PROGRESS_SCHEMA:
        raise ValueError("Minkowski proof progress has the wrong schema")
    if not _authenticated_payload(payload):
        raise ArithmeticError("Minkowski proof progress failed authentication")
    if payload.get("complete") is not True:
        raise ArithmeticError("incomplete proof progress cannot prove a class group")
    return raw, payload


def _producer_dependency_hashes(result: Any) -> dict[str, str]:
    raw = getattr(result, "proof_dependency_hashes", None)
    if raw is None:
        diagnostics = getattr(result, "diagnostics", None)
        if isinstance(diagnostics, dict):
            raw = diagnostics.get("proof_dependency_hashes")
    if not isinstance(raw, dict):
        raise ArithmeticError("Minkowski proof dependencies are unavailable")
    answer: dict[str, str] = {}
    for name in ("relations", "presentation", "generators", "saturation"):
        value = raw.get(name)
        if (
            not isinstance(value, str)
            or len(value) != 64
            or any(character not in "0123456789abcdef" for character in value)
        ):
            raise ValueError("Minkowski proof dependency hash is missing: " + name)
        answer[name] = value
    return answer


class PrincipalIdealWitness:
    """Exact, optionally factored witness that one ideal is principal."""

    def __init__(
        self,
        ideal: Any,
        generator: Any,
        *,
        source: str = "exact principal-ideal relation",
    ) -> None:
        if not isinstance(source, str) or source == "":
            raise ValueError("a principal witness must describe its source")
        self._ideal = ideal
        self._generator = generator
        self._source = source

    @property
    def ideal(self) -> Any:
        return self._ideal

    @property
    def generator(self) -> Any:
        return self._generator

    @property
    def source(self) -> str:
        return self._source

    @property
    def factored(self) -> bool:
        return hasattr(self._generator, "factors") or hasattr(
            self._generator, "principal_ideal"
        )

    def verify(self, order: Any = None) -> bool:
        try:
            if order is None:
                ring = getattr(self._ideal, "ring", None)
                if not callable(ring):
                    return False
                order = ring()
            if not _same_order(self._ideal, order):
                return False
            verifier = getattr(self._generator, "verify_principal_ideal", None)
            if callable(verifier):
                try:
                    verified = verifier(self._ideal)
                except TypeError:
                    verified = verifier()
                if verified is not True:
                    return False
            return _principal_ideal(self._generator, order) == self._ideal
        except (TypeError, ValueError, ArithmeticError, AttributeError):
            return False

    def to_dict(self, encode_ideal: Any, encode_generator: Any) -> dict[str, Any]:
        return {
            "schema": "sagejs.number-fields.principal-ideal-witness.v1",
            "ideal": encode_ideal(self._ideal),
            "generator": encode_generator(self._generator),
            "source": self._source,
            "factored": self.factored,
        }

    @classmethod
    def from_dict(
        cls,
        data: dict[str, Any],
        decode_ideal: Any,
        decode_generator: Any,
    ) -> PrincipalIdealWitness:
        if data.get("schema") != "sagejs.number-fields.principal-ideal-witness.v1":
            raise ValueError("unsupported principal-ideal witness schema")
        source = data.get("source")
        if not isinstance(source, str):
            raise ValueError("a serialized principal witness has no source")
        witness = cls(
            decode_ideal(data.get("ideal")),
            decode_generator(data.get("generator")),
            source=source,
        )
        if data.get("factored") is not witness.factored:
            raise ValueError("a serialized principal witness changed representation")
        return witness


def _coerce_principal_witness(ideal: Any, witness: Any) -> PrincipalIdealWitness:
    if isinstance(witness, PrincipalIdealWitness):
        return witness
    for name in ("principal_witness", "witness"):
        nested = getattr(witness, name, None)
        if nested is not None:
            if callable(nested) and getattr(nested, "__self__", None) is witness:
                nested = nested()
            return _coerce_principal_witness(ideal, nested)
    generator = getattr(witness, "generator", None)
    if generator is not None:
        if callable(generator) and getattr(generator, "__self__", None) is witness:
            generator = generator()
        return PrincipalIdealWitness(ideal, generator)
    if callable(getattr(witness, "principal_ideal", None)):
        return PrincipalIdealWitness(ideal, witness)
    raise TypeError("a principal relation must retain an exact generator witness")


class IdealClassDiscreteLog:
    """Invariant coordinates plus an exact quotient-principality witness."""

    def __init__(
        self, coordinates: Any, principal_witness: PrincipalIdealWitness
    ) -> None:
        if not isinstance(principal_witness, PrincipalIdealWitness):
            raise TypeError("an ideal discrete log needs a principal witness")
        self._coordinates = tuple(
            _integer(value, "ideal-class coordinate") for value in coordinates
        )
        self._principal_witness = principal_witness

    @property
    def coordinates(self) -> tuple[int, ...]:
        return self._coordinates

    @property
    def principal_witness(self) -> PrincipalIdealWitness:
        return self._principal_witness

    def verify(self, ideal: Any, group: Any) -> bool:
        try:
            element = group.from_coordinates(self._coordinates)
            quotient = group.ideal_quotient(ideal, element.ideal())
            return (
                self._principal_witness.ideal == quotient
                and self._principal_witness.verify(group.ideal_order())
            )
        except (TypeError, ValueError, ArithmeticError, AttributeError):
            return False


class PrincipalityResult:
    """Boolean principality answer with an optional exact generator witness."""

    def __init__(
        self,
        is_principal: bool,
        witness: PrincipalIdealWitness | None,
        proof_status: Any,
    ) -> None:
        label = proof_label(proof_status)
        if label not in COMPLETE_PROOF_LABELS:
            raise ValueError("an incomplete proof state cannot decide principality")
        if is_principal and witness is None:
            raise ValueError("a principal result must retain its exact witness")
        if not is_principal and witness is not None:
            raise ValueError("a nonprincipal result cannot carry a principal witness")
        self._is_principal = is_principal is True
        self._witness = witness
        self._proof_status = label

    def __bool__(self) -> bool:
        return self._is_principal

    @property
    def is_principal(self) -> bool:
        return self._is_principal

    @property
    def witness(self) -> PrincipalIdealWitness | None:
        return self._witness

    @property
    def generator(self) -> Any:
        return None if self._witness is None else self._witness.generator

    @property
    def proof_status(self) -> str:
        return self._proof_status

    def verify(self, order: Any = None) -> bool:
        if not self._is_principal:
            return self._witness is None
        return self._witness is not None and self._witness.verify(order)


class IdealClassElement:
    """One ideal class in invariant-factor coordinates."""

    def __init__(self, parent: Any, coordinates: Any) -> None:
        values = tuple(coordinates)
        invariants = parent.invariants()
        if len(values) != len(invariants):
            raise ValueError("the ideal-class coordinate vector has the wrong length")
        self._parent = parent
        self._coordinates = tuple(
            _integer(value, "ideal-class coordinate") % invariants[index]
            for index, value in enumerate(values)
        )

    def parent(self) -> Any:
        return self._parent

    def coordinates(self) -> tuple[int, ...]:
        return self._coordinates

    exponents = coordinates

    def __iter__(self) -> Any:
        yield from self._coordinates

    def __repr__(self) -> str:
        if self.is_one():
            return "Trivial principal fractional ideal class"
        return "Fractional ideal class with coordinates " + str(self._coordinates)

    def __hash__(self) -> int:
        return hash((id(self._parent), self._coordinates))

    def __eq__(self, other: object) -> bool:
        return (
            isinstance(other, IdealClassElement)
            and other._parent is self._parent
            and other._coordinates == self._coordinates
        )

    def _same_parent(self, other: Any) -> None:
        if (
            not isinstance(other, IdealClassElement)
            or other._parent is not self._parent
        ):
            raise TypeError("ideal classes must belong to the same class group")

    def __mul__(self, other: Any) -> Any:
        self._same_parent(other)
        return self._parent.from_coordinates(
            [
                left + right
                for left, right in zip(
                    self._coordinates, other._coordinates, strict=False
                )
            ]
        )

    def __truediv__(self, other: Any) -> Any:
        self._same_parent(other)
        return self * other.inverse()

    def inverse(self) -> Any:
        return self._parent.from_coordinates([-value for value in self._coordinates])

    __invert__ = inverse

    def __pow__(self, exponent: Any) -> Any:
        value = _integer(exponent, "ideal-class exponent")
        return self._parent.from_coordinates(
            [value * item for item in self._coordinates]
        )

    def is_one(self) -> bool:
        return all(value == 0 for value in self._coordinates)

    is_principal = is_one

    def order(self) -> int:
        answer = 1
        for value, modulus in zip(
            self._coordinates, self._parent.invariants(), strict=False
        ):
            component = modulus // _gcd(modulus, value)
            answer = answer // _gcd(answer, component) * component
        return answer

    def ideal(self) -> Any:
        return self._parent.representative_ideal(self._coordinates)

    value = ideal


class IdealClassMap:
    """The explicit bidirectional map between coordinates and ideal classes."""

    def __init__(self, group: Any) -> None:
        self._group = group

    def domain(self) -> Any:
        return self._group

    def codomain(self) -> Any:
        return self._group.ideal_order()

    def __call__(self, element: Any) -> Any:
        if (
            not isinstance(element, IdealClassElement)
            or element.parent() is not self._group
        ):
            raise TypeError("the class-group map received an element of another group")
        return element.ideal()

    def preimage(self, ideal: Any) -> IdealClassElement:
        return self._group(ideal)

    inverse = preimage

    def discrete_log(self, ideal: Any) -> IdealClassDiscreteLog:
        return self._group.discrete_log(ideal)


class IdealClassGroup:
    """A complete finite abelian presentation represented by exact ideals."""

    Element = IdealClassElement

    def __init__(
        self,
        order: Any,
        invariants: Any,
        generator_ideals: Any,
        relation_witnesses: Any,
        ideal_log: Any,
        *,
        proof_status: Any,
        algorithm: str = "auto",
        factor_base_theorem: str | None = None,
        factor_base_bound: Any = None,
        presentation_evidence: Any = None,
        proof_record: Any = None,
        proof_context: Any = None,
        relation_count: Any = None,
    ) -> None:
        label = proof_label(proof_status)
        if label not in COMPLETE_PROOF_LABELS:
            raise ValueError(
                "an incomplete or heuristic state has no complete class group"
            )
        values = tuple(_integer(value, "class-group invariant") for value in invariants)
        previous = 1
        for value in values:
            if value <= 1 or value % previous != 0:
                raise ValueError(
                    "class-group invariants must exceed one and divide successively"
                )
            previous = value
        ideals = tuple(generator_ideals)
        raw_witnesses = tuple(relation_witnesses)
        if len(ideals) != len(values) or len(raw_witnesses) != len(values):
            raise ValueError(
                "each invariant needs one generator ideal and relation witness"
            )
        if not callable(ideal_log):
            raise TypeError("a class group needs an exact ideal discrete-log callback")
        if not isinstance(algorithm, str) or algorithm == "":
            raise ValueError("a class-group presentation must name its algorithm")
        if label == EXACT_RELATIONS_CONDITIONAL_GRH and (
            not isinstance(factor_base_theorem, str) or factor_base_theorem == ""
        ):
            raise ValueError(
                "a GRH-conditional group must name its factor-base theorem"
            )
        for ideal in ideals:
            _nonzero_ideal(ideal, order)
        witnesses = tuple(
            _coerce_principal_witness(_ideal_power(ideal, invariant), witness)
            for invariant, ideal, witness in zip(
                values, ideals, raw_witnesses, strict=False
            )
        )
        self._order = order
        self._invariants = values
        self._generator_ideals = ideals
        self._relation_witnesses = witnesses
        self._ideal_log = ideal_log
        self._proof_status = label
        self._algorithm = algorithm
        self._factor_base_theorem = factor_base_theorem
        self._factor_base_bound = factor_base_bound
        self._presentation_evidence = presentation_evidence
        self._proof_record = proof_record
        self._proof_context = proof_context
        self._relation_count = (
            None
            if relation_count is None
            else _integer(relation_count, "relation count")
        )
        if self._relation_count is not None and self._relation_count < 0:
            raise ValueError("relation count must be nonnegative")
        self._generators = tuple(
            IdealClassElement(
                self, [1 if index == position else 0 for index in range(len(values))]
            )
            for position in range(len(values))
        )
        self._one = IdealClassElement(self, [0 for _value in values])
        self._map = IdealClassMap(self)
        if not self._verify_relations():
            raise ArithmeticError("a class-group defining relation witness failed")
        if (
            presentation_evidence is not None
            and not self._verify_presentation_evidence()
        ):
            raise ArithmeticError(
                "the exact relation-matrix presentation failed replay"
            )

    @classmethod
    def from_context(cls, context: Any) -> IdealClassGroup:
        """Build a group from the documented context/matrix duck interface."""
        order = _value(context, ("order",))
        state = _value(context, ("proof_state", "proof_status"))
        presentation = _value(context, ("class_group_presentation", "presentation"))
        if presentation is None:
            raise ValueError("the context has no class-group matrix presentation")
        invariants = _value(presentation, ("invariants", "invariant_factors"))
        if invariants is None:
            raise ValueError("the matrix presentation has no invariant factors")
        generators = _value(
            context,
            ("class_group_generator_ideals", "generator_ideals"),
        )
        witnesses = _value(
            context,
            ("class_group_relation_witnesses", "relation_witnesses"),
        )
        resolver = _call(context, ("ideal_class_log", "ideal_log"))
        if generators is None or witnesses is None or resolver is None:
            raise ValueError("the context is missing class-group map material")
        return cls(
            order,
            invariants,
            generators,
            witnesses,
            resolver,
            proof_status=state,
            algorithm=_value(context, ("class_group_algorithm", "algorithm"), "auto"),
            factor_base_theorem=_value(context, ("factor_base_theorem",), None),
            factor_base_bound=_value(context, ("factor_base_bound",), None),
            presentation_evidence=presentation,
            proof_record=_value(
                context, ("class_group_proof_record", "proof_record"), None
            ),
            proof_context=context,
            relation_count=_value(context, ("relation_count",), None),
        )

    def __repr__(self) -> str:
        return (
            "Class group of order "
            + str(self.cardinality())
            + " with invariants "
            + str(self._invariants)
        )

    @property
    def proof_status(self) -> str:
        return self._proof_status

    @property
    def algorithm(self) -> str:
        return self._algorithm

    @property
    def factor_base_theorem(self) -> str | None:
        return self._factor_base_theorem

    @property
    def factor_base_bound(self) -> Any:
        return self._factor_base_bound

    @property
    def relation_count(self) -> int | None:
        return self._relation_count

    @property
    def proof_record(self) -> Any:
        return self._proof_record

    def ideal_order(self) -> Any:
        return self._order

    number_field_order = ideal_order

    def invariants(self) -> tuple[int, ...]:
        return self._invariants

    def order(self) -> int:
        answer = 1
        for value in self._invariants:
            answer *= value
        return answer

    cardinality = order

    def one(self) -> IdealClassElement:
        return self._one

    def gen(self, index: int = 0) -> IdealClassElement:
        if index < 0 or index >= len(self._generators):
            raise IndexError("class-group generator index out of range")
        return self._generators[index]

    def gens(self) -> tuple[IdealClassElement, ...]:
        return self._generators

    def gens_ideals(self) -> tuple[Any, ...]:
        return self._generator_ideals

    def from_coordinates(self, coordinates: Any) -> IdealClassElement:
        return IdealClassElement(self, coordinates)

    def __call__(self, ideal: Any) -> IdealClassElement:
        if isinstance(ideal, IdealClassElement):
            if ideal.parent() is not self:
                raise TypeError("the ideal class belongs to another class group")
            return ideal
        return self.from_coordinates(self.discrete_log(ideal).coordinates)

    def representative_ideal(self, coordinates: Any) -> Any:
        element = IdealClassElement(self, coordinates)
        answer = self._order.ideal(1)
        for coordinate, ideal in zip(
            element.coordinates(), self._generator_ideals, strict=False
        ):
            if coordinate:
                answer = answer * _ideal_power(ideal, coordinate)
        return answer

    def ideal_quotient(self, numerator: Any, denominator: Any) -> Any:
        _nonzero_ideal(numerator, self._order)
        _nonzero_ideal(denominator, self._order)
        return _ideal_quotient(numerator, denominator)

    def _log_parts(self, result: Any) -> tuple[Any, Any]:
        if isinstance(result, IdealClassDiscreteLog):
            return result.coordinates, result.principal_witness
        if isinstance(result, dict):
            return (
                result.get("coordinates"),
                result.get("principal_witness", result.get("witness")),
            )
        coordinates = getattr(result, "coordinates", None)
        if callable(coordinates):
            coordinates = coordinates()
        witness = getattr(result, "principal_witness", None)
        if callable(witness):
            witness = witness()
        if coordinates is not None and witness is not None:
            return coordinates, witness
        if isinstance(result, (tuple, list)) and len(result) == 2:
            return result[0], result[1]
        raise TypeError(
            "an ideal discrete log must include coordinates and an exact witness"
        )

    def discrete_log(self, ideal: Any) -> IdealClassDiscreteLog:
        _nonzero_ideal(ideal, self._order)
        coordinates, raw_witness = self._log_parts(self._ideal_log(ideal))
        normalized = IdealClassElement(self, coordinates).coordinates()
        quotient = self.ideal_quotient(ideal, self.representative_ideal(normalized))
        witness = _coerce_principal_witness(quotient, raw_witness)
        result = IdealClassDiscreteLog(normalized, witness)
        if not result.verify(ideal, self):
            raise ArithmeticError("the ideal discrete-log witness failed exact replay")
        return result

    ideal_class_log = discrete_log

    def principality(self, ideal: Any) -> PrincipalityResult:
        result = self.discrete_log(ideal)
        if any(result.coordinates):
            return PrincipalityResult(False, None, self._proof_status)
        return PrincipalityResult(True, result.principal_witness, self._proof_status)

    def is_principal(self, ideal: Any, proof: Any = True) -> bool:
        requested = True if proof is None else bool(proof)
        if requested and self._proof_status != EXACT_UNCONDITIONAL:
            raise ValueError(
                "proof=True requires an unconditionally complete class group"
            )
        return bool(self.principality(ideal))

    def proof_payload(self) -> dict[str, Any]:
        """Serialize the attached conditional or unconditional proof record."""
        if self._proof_record is None:
            raise ValueError("the class group has no attached completeness proof")
        if isinstance(self._proof_record, ConditionalGRHProofRecord):
            return self._proof_record.to_dict()
        if isinstance(self._proof_record, UnconditionalMinkowskiProofRecord):
            encoder = getattr(self._proof_context, "encode_prime_record", None)
            if not callable(encoder):
                raise TypeError("the Minkowski replay context has no prime encoder")
            payload = self._proof_record.to_dict(encoder)
            progress = getattr(self._proof_context, "proof_progress_payload", None)
            if callable(progress):
                payload["proof_progress"] = progress()
            return payload
        raise TypeError("unknown class-group completeness proof record")

    def verify_proof_payload(self, payload: dict[str, Any]) -> bool:
        """Decode and independently replay one serialized completeness proof."""
        try:
            schema = payload.get("schema")
            if schema == "sagejs.number-fields.class-group.grh-proof.v1":
                record: Any = ConditionalGRHProofRecord.from_dict(payload)
            elif schema == "sagejs.number-fields.class-group.minkowski-proof.v1":
                decoder = getattr(self._proof_context, "decode_prime_record", None)
                if not callable(decoder):
                    return False
                record = UnconditionalMinkowskiProofRecord.from_dict(payload, decoder)
                progress = getattr(
                    self._proof_context, "verify_proof_progress_payload", None
                )
                if callable(progress) and progress(payload, record) is not True:
                    return False
            else:
                return False
            return record.verify(self, self._proof_context) is True
        except (TypeError, ValueError, ArithmeticError, AttributeError, IndexError):
            return False

    def map(self) -> IdealClassMap:
        return self._map

    def _verify_relations(self) -> bool:
        try:
            for invariant, ideal, witness in zip(
                self._invariants,
                self._generator_ideals,
                self._relation_witnesses,
                strict=False,
            ):
                if witness.ideal != _ideal_power(ideal, invariant):
                    return False
                if not witness.verify(self._order):
                    return False
            return True
        except (TypeError, ValueError, ArithmeticError, AttributeError):
            return False

    def _verify_presentation_evidence(self) -> bool:
        evidence = self._presentation_evidence
        checker = _call(evidence, ("verify_class_group_presentation", "verify"))
        if checker is None:
            return True
        try:
            answer = checker(self)
        except TypeError:
            answer = checker()
        if answer is not True:
            return False
        invariants = _value(evidence, ("invariants", "invariant_factors"), None)
        if (
            invariants is not None
            and tuple(int(value) for value in invariants) != self._invariants
        ):
            return False
        presentation_order = _value(evidence, ("order",), None)
        if presentation_order is not None and int(presentation_order) != self.order():
            return False
        free_rank = _value(evidence, ("free_rank",), None)
        return free_rank is None or int(free_rank) == 0

    def verify(self) -> bool:
        try:
            if proof_label(self._proof_status) not in COMPLETE_PROOF_LABELS:
                return False
            if not self._verify_relations() or not self._verify_presentation_evidence():
                return False
            for index, generator in enumerate(self._generators):
                if generator.order() != self._invariants[index]:
                    return False
                if self(generator.ideal()) != generator:
                    return False
            if self._proof_record is not None:
                if proof_label(self._proof_record.proof_status) != self._proof_status:
                    return False
                if self._proof_record.verify(self, self._proof_context) is not True:
                    return False
            return True
        except (TypeError, ValueError, ArithmeticError, AttributeError, IndexError):
            return False


def class_group_from_context(context: Any) -> IdealClassGroup:
    """Public functional constructor for context-producing orchestration code."""
    return IdealClassGroup.from_context(context)


class _EngineProofReplayContext:
    """Independent replay hooks for one completed engine result."""

    def __init__(
        self,
        result: Any,
        engine_group: Any,
        order: Any,
        saturation: SaturationProofRecord,
        saturation_producer: Any,
        saturation_payload: dict[str, Any],
        bound: int,
        proof_progress: Any = None,
        proof_progress_payload: dict[str, Any] | None = None,
        dependency_hashes: dict[str, str] | None = None,
    ) -> None:
        self.result = result
        self.engine_group = engine_group
        self.order = order
        self.field = order.number_field()
        try:
            arithmetic = __import__(
                "sagejs.number_fields.ideal_arithmetic", fromlist=["serialize_ideal"]
            )
            identity_payload = arithmetic.serialize_ideal(order.ideal(1))
            self.field_order_fingerprint = identity_payload["field_order_fingerprint"]
        except (AttributeError, TypeError, ValueError, KeyError):
            self.field_order_fingerprint = _value(
                order, ("field_order_fingerprint",), None
            )
        self.discriminant = int(order.discriminant())
        self.minkowski_bound = (int(bound), 1)
        self.saturation_record = saturation
        self._saturation_producer = saturation_producer
        self._saturation_payload = saturation_payload
        self._proof_progress = proof_progress
        self._proof_progress_payload = proof_progress_payload
        self._dependency_hashes = dependency_hashes

    def verify_saturation_record(self, record: Any) -> bool:
        if (
            record.to_dict() != self.saturation_record.to_dict()
            or record.evidence != self._saturation_payload
        ):
            return False
        checker = getattr(self.result, "verify_saturation_record", None)
        if callable(checker):
            return checker(self._saturation_payload) is True
        checker = getattr(self._saturation_producer, "verify", None)
        if not callable(checker):
            return False
        original_units = getattr(self.result, "saturation_original_units", None)
        if original_units is None:
            original_units = _value(self.result, ("units",), ())
        analytic_validation = getattr(self.result, "analytic_validation", None)
        try:
            return (
                checker(
                    self.field,
                    self.order,
                    tuple(original_units),
                    analytic_validation=analytic_validation,
                )
                is True
            )
        except TypeError:
            try:
                return checker(self.field, self.order, tuple(original_units)) is True
            except TypeError:
                return checker() is True

    def proof_progress_payload(self) -> dict[str, Any]:
        if self._proof_progress_payload is None:
            raise ValueError("the proof has no authenticated partition progress")
        return _canonical_payload(
            self._proof_progress_payload, "Minkowski proof progress"
        )

    def _progress_records(self, payload: dict[str, Any]) -> tuple[dict[str, Any], ...]:
        count = _integer(payload.get("partition_count"), "proof partition count")
        fingerprints = payload.get("prime_fingerprints")
        partitions = payload.get("partitions")
        if (
            count < 1
            or not isinstance(fingerprints, list)
            or not isinstance(partitions, list)
        ):
            raise ValueError("Minkowski proof progress has invalid coverage metadata")
        if len(partitions) != count:
            raise ValueError("Minkowski proof progress lost a partition")
        total = len(fingerprints)
        if (
            _integer(payload.get("completed_items"), "completed proof item count")
            != total
        ):
            raise ValueError("Minkowski proof progress is not complete")
        indexed: dict[int, dict[str, Any]] = {}
        plan_hash = payload.get("plan_sha256")
        if (
            not isinstance(plan_hash, str)
            or len(plan_hash) != 64
            or any(character not in "0123456789abcdef" for character in plan_hash)
        ):
            raise ValueError("Minkowski proof progress has no plan hash")
        for expected_partition, partition in enumerate(partitions):
            if (
                not isinstance(partition, dict)
                or partition.get("schema") != _PARTITION_SCHEMA
                or not _authenticated_payload(partition)
            ):
                raise ValueError("a Minkowski proof partition failed authentication")
            if (
                _integer(partition.get("partition_index"), "proof partition index")
                != expected_partition
                or _integer(partition.get("partition_count"), "proof partition count")
                != count
                or _integer(partition.get("total_items"), "proof item count") != total
                or partition.get("plan_sha256") != plan_hash
            ):
                raise ValueError("a Minkowski proof partition has stale plan metadata")
            records = partition.get("records")
            if not isinstance(records, list):
                raise TypeError("a Minkowski proof partition has no record list")
            previous = expected_partition - count
            for entry in records:
                if not isinstance(entry, dict):
                    raise TypeError("a Minkowski proof partition record is not a map")
                index = _integer(entry.get("index"), "proof-prime global index")
                if (
                    index < 0
                    or index >= total
                    or index % count != expected_partition
                    or index <= previous
                    or index in indexed
                ):
                    raise ValueError(
                        "Minkowski proof partition coverage is invalid: "
                        + str((index, total, count, expected_partition, previous))
                    )
                schema = entry.get("schema")
                if schema == _PROGRESS_RECORD_SCHEMA:
                    if (
                        not _authenticated_payload(entry)
                        or entry.get("prime_fingerprint") != fingerprints[index]
                        or not isinstance(entry.get("evidence"), dict)
                    ):
                        raise ValueError(
                            "a wrapped proof-prime record failed authentication"
                        )
                    raw = dict(entry["evidence"])
                    evidence_index = raw.get("index")
                    if (
                        evidence_index is not None
                        and _integer(evidence_index, "proof evidence global index")
                        != index
                    ):
                        raise ValueError("proof evidence has the wrong global index")
                    raw["index"] = index
                else:
                    raw = entry
                indexed[index] = raw
                previous = index
        if tuple(sorted(indexed)) != tuple(range(total)):
            raise ValueError("Minkowski proof partitions are not complete")
        return tuple(indexed[index] for index in range(total))

    def verify_proof_progress_payload(
        self,
        proof_payload: dict[str, Any],
        record: UnconditionalMinkowskiProofRecord,
    ) -> bool:
        try:
            progress = proof_payload.get("proof_progress")
            if not isinstance(progress, dict) or self._proof_progress_payload is None:
                return False
            if _canonical_payload(progress, "Minkowski proof progress") != (
                self._proof_progress_payload
            ):
                return False
            if not _authenticated_payload(progress):
                return False
            if progress.get("bound") != list(record.bound):
                return False
            if progress.get("theorem") != proof_payload.get("theorem"):
                return False
            fingerprints = progress.get("prime_fingerprints")
            if fingerprints != [item.fingerprint for item in record.prime_records]:
                return False
            dependencies = progress.get("dependency_hashes")
            if (
                not isinstance(dependencies, dict)
                or self._dependency_hashes is None
                or dependencies != self._dependency_hashes
            ):
                return False
            saturation_hash = self._saturation_payload.get("content_sha256")
            if not isinstance(saturation_hash, str):
                saturation_hash = _payload_hash(self._saturation_payload)
            if dependencies.get("saturation") != saturation_hash:
                return False
            raw_records = self._progress_records(progress)
            public_records = proof_payload.get("prime_records")
            if not isinstance(public_records, list) or len(public_records) != len(
                raw_records
            ):
                return False
            for raw, public in zip(raw_records, public_records, strict=True):
                witness = public.get("principal_witness")
                if (
                    raw.get("ideal") != public.get("ideal")
                    or raw.get("norm") != public.get("norm")
                    or raw.get("coordinates") != public.get("coordinates")
                    or not isinstance(witness, dict)
                    or raw.get("witness") != witness.get("generator")
                ):
                    return False
            return True
        except (TypeError, ValueError, ArithmeticError, AttributeError, IndexError):
            return False

    def verify_conditional_grh_record(self, record: Any) -> bool:
        proof_stage = _stage(self.result, "proof")
        diagnostics = self.result.diagnostics
        return (
            self.result.complete is True
            and self.engine_group.verify() is True
            and proof_stage is not None
            and proof_stage.state == "complete"
            and proof_stage.details.get("proof_status")
            == EXACT_RELATIONS_CONDITIONAL_GRH
            and record.theorem == self.engine_group.factor_base_theorem
            and record.bound == (int(diagnostics.get("factor_base_bound")), 1)
            and record.relation_count == int(diagnostics.get("relations"))
            and "GRH" in record.assumption.upper()
        )

    def iter_minkowski_prime_ideals(self) -> Any:
        factor_base = __import__(
            "sagejs.number_fields.class_group_factor_base",
            fromlist=["factor_base_plan"],
        )
        bound = self.minkowski_bound[0]
        plan = factor_base.factor_base_plan(
            self.order,
            proof=True,
            theorem="minkowski",
            max_bound=max(1, bound),
            max_rational_primes=max(1, bound),
            max_prime_ideals=max(1, int(self.order.degree()) * max(1, bound)),
        )
        for record in factor_base.prime_ideal_norm_stream(plan):
            yield record.prime_ideal

    def ideal_fingerprint(self, ideal: Any) -> dict[str, Any]:
        return _portable_ideal_fingerprint(ideal)

    def encode_ideal(self, ideal: Any) -> dict[str, Any]:
        arithmetic = __import__(
            "sagejs.number_fields.ideal_arithmetic", fromlist=["serialize_ideal"]
        )
        return arithmetic.serialize_ideal(ideal)

    def decode_ideal(self, payload: dict[str, Any]) -> Any:
        arithmetic = __import__(
            "sagejs.number_fields.ideal_arithmetic", fromlist=["ideal_from_dict"]
        )
        return arithmetic.ideal_from_dict(self.order, payload)

    def encode_witness(self, witness: PrincipalIdealWitness) -> dict[str, Any]:
        return witness.to_dict(self.encode_ideal, self.encode_generator)

    def encode_generator(self, value: Any) -> dict[str, Any]:
        payload: Any = value.to_dict()
        if not isinstance(payload, dict):
            raise TypeError("a factored generator did not serialize to a dictionary")
        return payload

    def decode_generator(self, value: dict[str, Any]) -> Any:
        return _decode_factored_generator(self.field, value)

    def decode_witness(
        self, payload: dict[str, Any], _ideal: Any
    ) -> PrincipalIdealWitness:
        return PrincipalIdealWitness.from_dict(
            payload,
            self.decode_ideal,
            self.decode_generator,
        )

    def encode_prime_record(self, record: MinkowskiPrimeClassRecord) -> dict[str, Any]:
        return record.to_dict(self.encode_ideal, self.encode_witness)

    def decode_prime_record(self, payload: dict[str, Any]) -> MinkowskiPrimeClassRecord:
        return MinkowskiPrimeClassRecord.from_dict(
            payload, self.decode_ideal, self.decode_witness
        )


def _engine_unconditional_records(
    engine_group: Any,
    replay: _EngineProofReplayContext,
    raw_records: Any,
) -> tuple[MinkowskiPrimeClassRecord, ...]:
    answer = []
    for raw in raw_records:
        ideal = replay.decode_ideal(raw["ideal"])
        coordinates = tuple(int(value) for value in raw["coordinates"])
        representative = engine_group.representative_ideal(coordinates)
        quotient = _ideal_quotient(ideal, representative)
        generator = _decode_factored_generator(replay.field, raw["witness"])
        witness = PrincipalIdealWitness(
            quotient,
            generator,
            source="unconditional Minkowski proof-prime discrete log",
        )
        answer.append(
            MinkowskiPrimeClassRecord(
                ideal,
                replay.ideal_fingerprint(ideal),
                raw["norm"],
                coordinates,
                witness,
            )
        )
    return tuple(answer)


def class_group_from_engine_result(result: Any) -> IdealClassGroup:
    """Adapt one complete class/unit engine result to the public map contract."""
    if getattr(result, "complete", None) is not True:
        raise ValueError("an incomplete engine result has no public class group")
    engine_group = result.class_group()
    if isinstance(engine_group, IdealClassGroup):
        return engine_group
    order, presentation = _engine_material(engine_group, result)
    if order is None or presentation is None:
        raise TypeError("the engine class group has no exact presentation material")
    invariants = tuple(int(value) for value in engine_group.invariants())
    generator_ideals = tuple(engine_group.gens_ideals())
    relation_witnesses = []
    for invariant, ideal in zip(invariants, generator_ideals, strict=False):
        relation_ideal = _ideal_power(ideal, invariant)
        coordinates, generator = engine_group.discrete_log(relation_ideal)
        if any(int(value) for value in coordinates):
            raise ArithmeticError("an engine generator has the wrong claimed order")
        relation_witnesses.append(
            PrincipalIdealWitness(
                relation_ideal,
                generator,
                source="engine Smith-generator order relation",
            )
        )
    proof_status = proof_label(result.proof_status)
    proof_stage = _stage(result, "proof")
    if proof_stage is None or proof_stage.state != "complete":
        raise ArithmeticError("the engine result has no completed proof stage")
    diagnostics = result.diagnostics
    relation_count = int(diagnostics.get("relations"))
    if int(proof_stage.details.get("exact_relations", -1)) != relation_count:
        raise ArithmeticError("the proof stage has the wrong exact relation count")
    saturation_producer, saturation_payload = _producer_saturation(result)
    saturation = _saturation_record(saturation_payload)
    unconditional_stage = None
    proof_progress = None
    progress_payload = None
    dependency_hashes = None
    if proof_status == EXACT_UNCONDITIONAL:
        unconditional_stage = _stage(result, "unconditional-proof")
        if unconditional_stage is None or unconditional_stage.state != "complete":
            raise ArithmeticError(
                "an unconditional engine result has no completed Minkowski stage"
            )
        if "Minkowski" not in str(unconditional_stage.details.get("theorem")):
            raise ArithmeticError("the unconditional stage does not name Minkowski")
        bound = int(unconditional_stage.details.get("bound"))
        proof_progress, progress_payload = _producer_proof_progress(result)
        dependency_hashes = _producer_dependency_hashes(result)
    else:
        bound = int(diagnostics.get("factor_base_bound"))
    replay = _EngineProofReplayContext(
        result,
        engine_group,
        order,
        saturation,
        saturation_producer,
        saturation_payload,
        bound,
        proof_progress,
        progress_payload,
        dependency_hashes,
    )
    if proof_status == EXACT_UNCONDITIONAL:
        if unconditional_stage is None:
            raise ArithmeticError("the unconditional proof stage disappeared")
        if progress_payload is None:
            raise ArithmeticError("the unconditional proof progress disappeared")
        raw_prime_records = replay._progress_records(progress_payload)
        if int(unconditional_stage.details.get("prime_ideals", -1)) != len(
            raw_prime_records
        ) or int(proof_stage.details.get("minkowski_primes", -1)) != len(
            raw_prime_records
        ):
            raise ArithmeticError("the proof stages have the wrong Minkowski count")
        prime_records = _engine_unconditional_records(
            engine_group,
            replay,
            raw_prime_records,
        )
        proof_record: Any = UnconditionalMinkowskiProofRecord(
            field_order_fingerprint=replay.field_order_fingerprint,
            discriminant=replay.discriminant,
            bound=(bound, 1),
            prime_records=prime_records,
            saturation=saturation,
        )
        theorem = "Minkowski ideal-class theorem"
    elif proof_status == EXACT_RELATIONS_CONDITIONAL_GRH:
        theorem = str(engine_group.factor_base_theorem)
        proof_record = ConditionalGRHProofRecord(
            theorem,
            (bound, 1),
            relation_count=relation_count,
            assumption="GRH for the Dedekind zeta function",
            saturation=saturation,
            analytic_index_one=True,
        )
    else:
        raise ValueError("an incomplete proof label cannot expose a class group")
    answer = IdealClassGroup(
        order,
        invariants,
        generator_ideals,
        tuple(relation_witnesses),
        engine_group.discrete_log,
        proof_status=proof_status,
        algorithm=str(result.algorithm),
        factor_base_theorem=theorem,
        factor_base_bound=(bound, 1),
        presentation_evidence=presentation,
        proof_record=proof_record,
        proof_context=replay,
        relation_count=relation_count,
    )
    if not answer.verify():
        raise ArithmeticError("the adapted public class group failed proof replay")
    return answer


__all__ = [
    "IdealClassDiscreteLog",
    "IdealClassElement",
    "IdealClassGroup",
    "IdealClassMap",
    "PrincipalIdealWitness",
    "PrincipalityResult",
    "class_group_from_engine_result",
    "class_group_from_context",
]
