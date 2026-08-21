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
expanded.
"""

from __future__ import annotations

from typing import Any

from sagejs.number_fields.class_group_proof import (
    COMPLETE_PROOF_LABELS,
    EXACT_RELATIONS_CONDITIONAL_GRH,
    proof_label,
)


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

    def is_principal(self, ideal: Any) -> bool:
        return bool(self.principality(ideal))

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
        return (
            invariants is None
            or tuple(int(value) for value in invariants) == self._invariants
        )

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


__all__ = [
    "IdealClassDiscreteLog",
    "IdealClassElement",
    "IdealClassGroup",
    "IdealClassMap",
    "PrincipalIdealWitness",
    "PrincipalityResult",
    "class_group_from_context",
]
