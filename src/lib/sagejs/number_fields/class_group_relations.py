"""Exact, replayable class-group relations and bounded relation search.

This module is the ordinary-Python correctness layer for relation collection.
It deliberately uses only the public number-field, maximal-order, and ideal
interfaces.  A relation records and verifies the exact equality

```
(alpha) = source * product(P[i] ** quotient_row[i])
        = product(P[i] ** row[i]).
```

Here `source` is itself authenticated by `source_row`; consequently `row` is
the principal relation consumed by relation-matrix code.  The optional source
ideal is useful for LLL searches in a selected ideal without weakening the
certificate.  Every admitted relation reconstructs all ideals before it can
enter a collector.

The bounded short-vector search follows the readable first stage of Hecke's
`Rel_LLL.jl`: reduce a Minkowski-embedded ideal basis, try basis vectors and
their pairwise sums and differences, then use a deterministic bounded
combination stream.  Numerical embeddings select a unimodular transform; that
transform is applied to exact ideal-coordinate rows before any relation is
considered.  Floating-point data therefore never enters a relation record or
its replay.
"""

from __future__ import annotations

import json
from typing import Any, Callable, Iterable

import sagejs as sage
from sagejs.number_fields.embeddings import archimedean_data

RELATION_SCHEMA = "sagejs.number-fields/class-relation-v1"
WITNESS_SCHEMA = "sagejs.number-fields/factored-principal-witness-v1"
IDEAL_SCHEMA = "sagejs.number-fields/relation-ideal-v1"
SEARCH_STATE_SCHEMA = "sagejs.number-fields/relation-search-state-v1"
MINKOWSKI_LATTICE_SCHEMA = "sagejs.number-fields/minkowski-lll-lattice-v1"
AUTOMORPHISM_PLAN_SCHEMA = "sagejs.number-fields/automorphism-orbit-plan-v1"
DEFAULT_RANK_PRIME = 2_147_483_647
_U64_MASK = (1 << 64) - 1


class RelationNotSmoothError(ArithmeticError):
    """The exact ideal has support outside the supplied factor base."""

    def __init__(self, message: str, *, ideal: Any = None) -> None:
        super().__init__(message)
        self.ideal = ideal


def _checked_integer(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(name + " must be an integer")
    return value


def _checked_nonnegative(value: Any, name: str) -> int:
    answer = _checked_integer(value, name)
    if answer < 0:
        raise ValueError(name + " must be nonnegative")
    return answer


def _json_value(value: Any, path: str = "$") -> Any:
    if value is None or isinstance(value, (bool, int, float, str)):
        return value
    if isinstance(value, (list, tuple)):
        return [_json_value(item, path + "[]") for item in value]
    if isinstance(value, dict):
        answer: dict[str, Any] = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise TypeError(path + " keys must be strings")
            answer[key] = _json_value(item, path + "." + key)
        return answer
    raise TypeError(path + " is not JSON-safe")


def _rational_pair(value: Any) -> list[int]:
    rational = sage.QQ(value)
    return [int(rational._numerator), int(rational._denominator)]


def _rational_from_pair(value: Any, name: str = "rational") -> Any:
    if not isinstance(value, list) or len(value) != 2:
        raise TypeError(name + " must be a numerator/denominator pair")
    numerator = _checked_integer(value[0], name + " numerator")
    denominator = _checked_integer(value[1], name + " denominator")
    if denominator <= 0:
        raise ValueError(name + " denominator must be positive")
    return sage.QQ(numerator) / sage.QQ(denominator)


def _element_payload(field: Any, value: Any) -> list[list[int]]:
    element = field(value)
    return [_rational_pair(coefficient) for coefficient in element.list()]


def _field_element_from_coefficients(field: Any, coefficients: Iterable[Any]) -> Any:
    answer = field(0)
    power = field(1)
    generator = field.gen()
    for coefficient in coefficients:
        answer += field(coefficient) * power
        power *= generator
    return answer


def _element_from_payload(field: Any, payload: Any) -> Any:
    if not isinstance(payload, list) or len(payload) != field.degree():
        raise ValueError("a witness factor has the wrong field degree")
    return _field_element_from_coefficients(
        field, [_rational_from_pair(value, "element coefficient") for value in payload]
    )


def _order_fingerprint(order: Any) -> dict[str, Any]:
    field = order.number_field()
    return {
        "defining_polynomial": [
            _rational_pair(value) for value in field._defining_coefficients
        ],
        "maximal_order_basis": [
            [_rational_pair(value) for value in row]
            for row in order.basis_matrix().rows()
        ],
        "discriminant": int(order.discriminant()),
    }


def _ideal_payload(ideal: Any) -> dict[str, Any]:
    return {
        "schema": IDEAL_SCHEMA,
        "field_order": _order_fingerprint(ideal.ring()),
        "basis": [
            [_rational_pair(value) for value in row]
            for row in ideal.basis_matrix().rows()
        ],
        "norm": _rational_pair(ideal.norm()),
    }


def _ideal_from_payload(order: Any, payload: Any) -> Any:
    if not isinstance(payload, dict) or payload.get("schema") != IDEAL_SCHEMA:
        raise ValueError("unsupported relation-ideal schema")
    if payload.get("field_order") != _order_fingerprint(order):
        raise ValueError("a relation ideal belongs to a different field or order")
    rows = payload.get("basis")
    if not isinstance(rows, list) or len(rows) != order.degree():
        raise ValueError("a nonzero relation ideal must have a full basis")
    field = order.number_field()
    elements = [
        _field_element_from_coefficients(
            field,
            [_rational_from_pair(value, "ideal basis entry") for value in row],
        )
        for row in rows
    ]
    ideal = order.ideal(elements)
    if _ideal_payload(ideal) != payload:
        raise ValueError("a relation ideal payload is not canonical")
    return ideal


def _prime_fingerprint(prime_ideal: Any) -> dict[str, Any]:
    return {
        "prime": int(prime_ideal.rational_prime()),
        "e": int(prime_ideal.ramification_index()),
        "f": int(prime_ideal.residue_class_degree()),
        "basis": [
            [_rational_pair(value) for value in row]
            for row in prime_ideal.basis_matrix().rows()
        ],
    }


def _validate_factor_base(order: Any, factor_base: Iterable[Any]) -> tuple[Any, ...]:
    factors = tuple(factor_base)
    seen: set[str] = set()
    for index, prime_ideal in enumerate(factors):
        if prime_ideal.ring() is not order:
            raise TypeError("factor-base prime " + str(index) + " has another order")
        fingerprint = json.dumps(_prime_fingerprint(prime_ideal), sort_keys=True)
        if fingerprint in seen:
            raise ValueError("the factor base contains a duplicate prime ideal")
        seen.add(fingerprint)
    return factors


def _canonical_factor_pairs(field: Any, factors: Iterable[Any]) -> list[list[Any]]:
    combined: dict[str, list[Any]] = {}
    for pair in factors:
        if not isinstance(pair, (list, tuple)) or len(pair) != 2:
            raise TypeError("factored witness entries must be element/exponent pairs")
        element = field(pair[0])
        exponent = int(pair[1])
        if exponent == 0:
            continue
        if element.is_zero():
            raise ValueError("zero cannot occur in a principal witness")
        payload = _element_payload(field, element)
        key = json.dumps(payload, separators=(",", ":"))
        if key in combined:
            combined[key][1] += exponent
        else:
            combined[key] = [element, exponent, payload]
    answer = [entry for entry in combined.values() if entry[1] != 0]
    answer.sort(key=lambda entry: json.dumps(entry[2], separators=(",", ":")))
    return answer


def _witness_pairs(field: Any, witness: Any) -> list[list[Any]]:
    if isinstance(witness, FactoredPrincipalWitness):
        if witness.field is not field:
            raise TypeError("a factored witness belongs to another field")
        return [[element, exponent] for element, exponent in witness.factors()]
    if isinstance(witness, dict):
        return [
            [_element_from_payload(field, item["element"]), int(item["exponent"])]
            for item in witness.get("factors", [])
        ]
    factors_method = getattr(witness, "factors", None)
    if callable(factors_method):
        values: Any = factors_method()
        if isinstance(values, dict):
            values = values.items()
        return [[pair[0], int(pair[1])] for pair in values]
    return [[field(witness), 1]]


class FactoredPrincipalWitness:
    """A small local factored-element protocol used by relation replay.

    The class is intentionally duck-compatible with the shared
    `FactoredNumberFieldElement`: callers may pass either object to relation
    admission, and records always lower factors to this stable relation schema.
    """

    def __init__(self, field: Any, factors: Iterable[Any]) -> None:
        self.field = field
        self._factors = _canonical_factor_pairs(field, factors)

    @classmethod
    def from_element(cls, value: Any) -> FactoredPrincipalWitness:
        return cls(value.parent(), [[value, 1]])

    def factors(self) -> tuple[tuple[Any, int], ...]:
        return tuple((entry[0], entry[1]) for entry in self._factors)

    def evaluate(self) -> Any:
        answer = self.field(1)
        for element, exponent, _payload in self._factors:
            answer *= element**exponent
        return answer

    def norm(self) -> Any:
        answer = sage.QQ(1)
        for element, exponent, _payload in self._factors:
            answer *= element.norm() ** exponent
        return answer

    def principal_ideal(self, order: Any = None) -> Any:
        if order is None:
            order = self.field.maximal_order()
        answer = order.ideal(1)
        for element, exponent, _payload in self._factors:
            answer *= order.ideal(element) ** exponent
        return answer

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": WITNESS_SCHEMA,
            "factors": [
                {"element": entry[2], "exponent": entry[1]} for entry in self._factors
            ],
        }

    to_relation_witness_payload = to_dict

    @classmethod
    def from_dict(cls, field: Any, payload: dict[str, Any]) -> FactoredPrincipalWitness:
        if payload.get("schema") != WITNESS_SCHEMA:
            raise ValueError("unsupported factored principal-witness schema")
        factors = payload.get("factors")
        if not isinstance(factors, list):
            raise TypeError("factored principal-witness factors must be a list")
        answer = cls(
            field,
            [
                [
                    _element_from_payload(field, item["element"]),
                    _checked_integer(item["exponent"], "witness exponent"),
                ]
                for item in factors
            ],
        )
        if answer.to_dict() != payload:
            raise ValueError("a factored principal witness is not canonical")
        return answer


def _coerce_witness(order: Any, witness: Any) -> FactoredPrincipalWitness:
    return FactoredPrincipalWitness(
        order.number_field(), _witness_pairs(order.number_field(), witness)
    )


def _ideal_power(ideal: Any, exponent: int) -> Any:
    return ideal**exponent


def reconstruct_factor_base_ideal(
    order: Any, factor_base: Iterable[Any], row: Iterable[int]
) -> Any:
    factors = tuple(factor_base)
    exponents = tuple(int(value) for value in row)
    if len(factors) != len(exponents):
        raise ValueError("a relation row has the wrong factor-base width")
    answer = order.ideal(1)
    for prime_ideal, exponent in zip(factors, exponents, strict=False):
        if exponent:
            answer *= _ideal_power(prime_ideal, exponent)
    return answer


def factor_ideal_over_base(ideal: Any, factor_base: Iterable[Any]) -> tuple[int, ...]:
    """Return exact factor-base valuations, or reject incomplete smoothness."""
    factors = _validate_factor_base(ideal.ring(), factor_base)
    row = tuple(int(ideal.valuation(prime_ideal)) for prime_ideal in factors)
    reconstructed = reconstruct_factor_base_ideal(ideal.ring(), factors, row)
    if reconstructed != ideal:
        raise RelationNotSmoothError(
            "the ideal has support outside the supplied factor base", ideal=ideal
        )
    return row


def factor_witness_over_base(
    witness: FactoredPrincipalWitness, factor_base: Iterable[Any]
) -> tuple[int, ...]:
    """Return factor-base valuations of a factored principal witness.

    Computing the valuations on the factors avoids first multiplying a large
    principal fractional ideal and then repeatedly dividing it by every prime
    in the factor base.  Exact reconstruction by the caller remains the
    smoothness certificate, so this is only a faster way to obtain the same
    candidate row.
    """
    factors = tuple(factor_base)
    if not factors:
        return ()
    ideal_module = __import__(
        "sagejs.number_fields.ideal_arithmetic", fromlist=["ideal_arithmetic"]
    )
    row = [0 for _prime in factors]
    for element, exponent in witness.factors():
        for index, prime_ideal in enumerate(factors):
            row[index] += int(exponent) * int(
                ideal_module.element_valuation(element, prime_ideal)
            )
    return tuple(row)


def _factor_base_row_norm(factor_base: Iterable[Any], row: Iterable[int]) -> Any:
    answer = sage.QQ(1)
    for prime_ideal, exponent in zip(factor_base, row, strict=True):
        if exponent:
            answer *= prime_ideal.norm() ** int(exponent)
    return answer


def _factor_positive_integer(value: int) -> list[list[int]]:
    if value < 1:
        raise ValueError("a norm numerator or denominator must be positive")
    if value == 1:
        return []
    return [[int(prime), int(exponent)] for prime, exponent in sage.factor(value)]


def _norm_smoothness(
    principal: Any,
    source: Any,
    quotient: Any,
    row: tuple[int, ...],
    factor_base: tuple[Any, ...],
) -> dict[str, Any]:
    principal_pair = _rational_pair(principal.norm())
    source_pair = _rational_pair(source.norm())
    quotient_pair = _rational_pair(quotient.norm())
    numerator = abs(principal_pair[0])
    denominator = principal_pair[1]
    return {
        "principal_norm": principal_pair,
        "source_norm": source_pair,
        "quotient_norm": quotient_pair,
        "principal_norm_factorization": {
            "numerator": _factor_positive_integer(numerator),
            "denominator": _factor_positive_integer(denominator),
        },
        "factor_base_norms": [
            {
                "index": index,
                "exponent": exponent,
                "norm": _rational_pair(factor_base[index].norm()),
            }
            for index, exponent in enumerate(row)
            if exponent
        ],
    }


class RelationRecord:
    """One exact relation with independently replayable evidence."""

    def __init__(
        self,
        *,
        row: Iterable[int],
        quotient_row: Iterable[int],
        source_row: Iterable[int],
        witness: dict[str, Any],
        principal_ideal: dict[str, Any],
        source_ideal: dict[str, Any],
        smooth_quotient: dict[str, Any],
        norm_smoothness: dict[str, Any],
        field_order: dict[str, Any],
        factor_base: Iterable[dict[str, Any]],
        archimedean_logs: Iterable[Any] = (),
        log_precision: int = 0,
        provenance: dict[str, Any] | None = None,
    ) -> None:
        self.row = tuple(int(value) for value in row)
        self.quotient_row = tuple(int(value) for value in quotient_row)
        self.source_row = tuple(int(value) for value in source_row)
        if not (len(self.row) == len(self.quotient_row) == len(self.source_row)):
            raise ValueError("relation rows must have equal width")
        self.witness = _json_value(witness)
        self.principal_ideal = _json_value(principal_ideal)
        self.source_ideal = _json_value(source_ideal)
        self.smooth_quotient = _json_value(smooth_quotient)
        self.norm_smoothness = _json_value(norm_smoothness)
        self.field_order = _json_value(field_order)
        self.factor_base = tuple(_json_value(item) for item in factor_base)
        if len(self.factor_base) != len(self.row):
            raise ValueError("factor-base evidence has the wrong width")
        self.archimedean_logs = tuple(_json_value(value) for value in archimedean_logs)
        self.log_precision = _checked_nonnegative(log_precision, "log precision")
        self.provenance = _json_value({} if provenance is None else provenance)

    def sparse_row(self) -> tuple[tuple[int, int], ...]:
        """Return zero-based `(factor_base_index, exponent)` entries."""
        return tuple((index, value) for index, value in enumerate(self.row) if value)

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": RELATION_SCHEMA,
            "field_order": self.field_order,
            "factor_base": list(self.factor_base),
            "row": list(self.row),
            "quotient_row": list(self.quotient_row),
            "source_row": list(self.source_row),
            "witness": self.witness,
            "principal_ideal": self.principal_ideal,
            "source_ideal": self.source_ideal,
            "smooth_quotient": self.smooth_quotient,
            "norm_smoothness": self.norm_smoothness,
            "archimedean": {
                "precision": self.log_precision,
                "logs": list(self.archimedean_logs),
                "complex_place_convention": "one-place-log-absolute-value-times-two",
            },
            "provenance": self.provenance,
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> RelationRecord:
        if payload.get("schema") != RELATION_SCHEMA:
            raise ValueError("unsupported class-relation schema")
        archimedean = payload.get("archimedean")
        if not isinstance(archimedean, dict):
            raise TypeError("relation archimedean evidence must be a dictionary")
        if archimedean.get("complex_place_convention") != (
            "one-place-log-absolute-value-times-two"
        ):
            raise ValueError("unknown relation archimedean convention")
        return cls(
            row=payload["row"],
            quotient_row=payload["quotient_row"],
            source_row=payload["source_row"],
            witness=payload["witness"],
            principal_ideal=payload["principal_ideal"],
            source_ideal=payload["source_ideal"],
            smooth_quotient=payload["smooth_quotient"],
            norm_smoothness=payload["norm_smoothness"],
            field_order=payload["field_order"],
            factor_base=payload["factor_base"],
            archimedean_logs=archimedean["logs"],
            log_precision=archimedean["precision"],
            provenance=payload["provenance"],
        )

    def verify(self, order: Any, factor_base: Iterable[Any]) -> dict[str, Any]:
        return verify_relation_record(order, factor_base, self)

    def replay(self, order: Any, factor_base: Iterable[Any]) -> dict[str, Any]:
        verification = verify_relation_record(order, factor_base, self)
        if verification["certified"] is not True:
            raise ArithmeticError(
                "relation replay failed: " + "; ".join(verification["failures"])
            )
        factors = tuple(factor_base)
        return {
            "certified": True,
            "row": self.row,
            "sparse_row": self.sparse_row(),
            "witness": FactoredPrincipalWitness.from_dict(
                order.number_field(), self.witness
            ),
            "principal_ideal": _ideal_from_payload(order, self.principal_ideal),
            "source_ideal": _ideal_from_payload(order, self.source_ideal),
            "smooth_quotient": _ideal_from_payload(order, self.smooth_quotient),
            "reconstructed": reconstruct_factor_base_ideal(order, factors, self.row),
        }

    def canonical_key(self) -> str:
        return json.dumps(self.to_dict(), sort_keys=True, separators=(",", ":"))


def verify_relation_record(
    order: Any, factor_base: Iterable[Any], record: RelationRecord | dict[str, Any]
) -> dict[str, Any]:
    failures: list[str] = []
    try:
        relation = (
            record
            if isinstance(record, RelationRecord)
            else RelationRecord.from_dict(record)
        )
        factors = _validate_factor_base(order, factor_base)
        if relation.field_order != _order_fingerprint(order):
            failures.append("field/order fingerprint mismatch")
        expected_factors = tuple(_prime_fingerprint(prime) for prime in factors)
        if relation.factor_base != expected_factors:
            failures.append("factor-base fingerprints or ordering changed")
        if len(relation.row) != len(factors):
            failures.append("relation row width mismatch")
        if relation.row != tuple(
            source + quotient
            for source, quotient in zip(
                relation.source_row, relation.quotient_row, strict=False
            )
        ):
            failures.append("principal row is not source_row + quotient_row")

        witness = FactoredPrincipalWitness.from_dict(
            order.number_field(), relation.witness
        )
        principal = witness.principal_ideal(order)
        recorded_principal = _ideal_from_payload(order, relation.principal_ideal)
        source = _ideal_from_payload(order, relation.source_ideal)
        quotient = _ideal_from_payload(order, relation.smooth_quotient)
        if principal != recorded_principal:
            failures.append("factored witness does not generate the recorded ideal")
        reconstructed_source = reconstruct_factor_base_ideal(
            order, factors, relation.source_row
        )
        reconstructed_quotient = reconstruct_factor_base_ideal(
            order, factors, relation.quotient_row
        )
        reconstructed_principal = reconstruct_factor_base_ideal(
            order, factors, relation.row
        )
        if source != reconstructed_source:
            failures.append("source ideal does not match source_row")
        if quotient != reconstructed_quotient:
            failures.append("smooth quotient does not match quotient_row")
        if principal != source * quotient:
            failures.append("principal ideal is not source times smooth quotient")
        if principal != reconstructed_principal:
            failures.append("principal ideal does not match the matrix row")
        expected_norms = _norm_smoothness(
            principal, source, quotient, relation.row, factors
        )
        if relation.norm_smoothness != expected_norms:
            failures.append("norm smoothness evidence is stale or incomplete")
    except Exception as error:
        failures.append(str(error))
    return {"certified": not failures, "failures": failures}


class ModularRankScreen:
    """Incremental deterministic sparse row reduction over one prime field."""

    def __init__(self, columns: int, prime: int = DEFAULT_RANK_PRIME) -> None:
        self.columns = _checked_nonnegative(columns, "column count")
        self.prime = _checked_integer(prime, "rank prime")
        if self.prime < 2 or not sage.is_prime(self.prime):
            raise ValueError("the modular rank modulus must be prime")
        self._pivots: dict[int, tuple[int, ...]] = {}

    @property
    def rank(self) -> int:
        return len(self._pivots)

    def add(self, row: Iterable[int]) -> tuple[bool, int | None]:
        values = [int(value) % self.prime for value in row]
        if len(values) != self.columns:
            raise ValueError("a modular-screen row has the wrong width")
        for pivot in sorted(self._pivots):
            scalar = values[pivot]
            if scalar:
                basis = self._pivots[pivot]
                values = [
                    (value - scalar * basis[index]) % self.prime
                    for index, value in enumerate(values)
                ]
        pivot = next((index for index, value in enumerate(values) if value), None)
        if pivot is None:
            return False, None
        inverse = pow(values[pivot], self.prime - 2, self.prime)
        normalized = tuple(value * inverse % self.prime for value in values)
        self._pivots[pivot] = normalized
        return True, pivot

    def missing_pivots(self) -> tuple[int, ...]:
        return tuple(
            index for index in range(self.columns) if index not in self._pivots
        )


class RelationAdmission:
    def __init__(
        self, record: RelationRecord, modular_independent: bool, pivot: int | None
    ) -> None:
        self.record = record
        self.modular_independent = bool(modular_independent)
        self.pivot = pivot


class ExactRelationCollector:
    """Authenticate, rank-screen, deduplicate, and retain exact relations."""

    def __init__(
        self,
        order: Any,
        factor_base: Iterable[Any],
        *,
        rank_prime: int = DEFAULT_RANK_PRIME,
        context: Any = None,
    ) -> None:
        self.order = order
        self.factor_base = _validate_factor_base(order, factor_base)
        self.rank_screen = ModularRankScreen(len(self.factor_base), rank_prime)
        self.records: list[RelationRecord] = []
        self.admissions: list[RelationAdmission] = []
        self.context = context
        self._keys: set[str] = set()

    def add_relation(
        self, record: RelationRecord | dict[str, Any]
    ) -> RelationAdmission:
        relation = (
            record
            if isinstance(record, RelationRecord)
            else RelationRecord.from_dict(record)
        )
        verification = relation.verify(self.order, self.factor_base)
        if verification["certified"] is not True:
            raise ArithmeticError(
                "relation admission failed: " + "; ".join(verification["failures"])
            )
        return self._store_verified(relation)

    def _store_verified(self, relation: RelationRecord) -> RelationAdmission:
        """Store a relation whose exact objects were verified by its producer."""
        key = relation.canonical_key()
        if key in self._keys:
            raise ValueError("the exact relation record was already admitted")
        independent, pivot = self.rank_screen.add(relation.row)
        admission = RelationAdmission(relation, independent, pivot)
        self._keys.add(key)
        self.records.append(relation)
        self.admissions.append(admission)
        if self.context is not None:
            add = getattr(self.context, "add_relation", None)
            if not callable(add):
                raise TypeError("the relation context has no add_relation method")
            add(relation)
        return admission

    def admit_witness(
        self,
        witness: Any,
        *,
        source_ideal: Any = None,
        source_row: Iterable[int] | None = None,
        archimedean_logs: Iterable[Any] = (),
        log_precision: int = 0,
        provenance: dict[str, Any] | None = None,
    ) -> RelationAdmission:
        factored = _coerce_witness(self.order, witness)
        if source_ideal is None:
            source = self.order.ideal(1)
        else:
            source = source_ideal
            if source.ring() is not self.order or source.is_zero():
                raise TypeError(
                    "a relation source must be a nonzero ideal of the order"
                )
        if source_row is None:
            computed_source_row = factor_ideal_over_base(source, self.factor_base)
        else:
            computed_source_row = tuple(int(value) for value in source_row)
            if (
                reconstruct_factor_base_ideal(
                    self.order, self.factor_base, computed_source_row
                )
                != source
            ):
                raise ArithmeticError(
                    "the supplied source row does not reconstruct its ideal"
                )
        row = factor_witness_over_base(factored, self.factor_base)
        witness_norm = sage.QQ(factored.norm())
        if witness_norm < 0:
            witness_norm = -witness_norm
        if _factor_base_row_norm(self.factor_base, row) != witness_norm:
            raise RelationNotSmoothError(
                "the principal witness norm has support outside the factor base"
            )
        principal = factored.principal_ideal(self.order)
        quotient_row = tuple(
            total - source_exponent
            for total, source_exponent in zip(row, computed_source_row, strict=False)
        )
        reconstructed_principal = reconstruct_factor_base_ideal(
            self.order, self.factor_base, row
        )
        if reconstructed_principal != principal:
            raise RelationNotSmoothError(
                "the principal witness has support outside the supplied factor base",
                ideal=principal,
            )
        quotient = reconstruct_factor_base_ideal(
            self.order, self.factor_base, quotient_row
        )
        if source * quotient != principal:
            raise ArithmeticError(
                "the source and quotient do not reconstruct principal"
            )
        record = RelationRecord(
            row=row,
            quotient_row=quotient_row,
            source_row=computed_source_row,
            witness=factored.to_dict(),
            principal_ideal=_ideal_payload(principal),
            source_ideal=_ideal_payload(source),
            smooth_quotient=_ideal_payload(quotient),
            norm_smoothness=_norm_smoothness(
                principal, source, quotient, row, self.factor_base
            ),
            field_order=_order_fingerprint(self.order),
            factor_base=[_prime_fingerprint(prime) for prime in self.factor_base],
            archimedean_logs=archimedean_logs,
            log_precision=log_precision,
            provenance=provenance,
        )
        # Everything used to construct this record was checked above with
        # exact ideal equality.  Avoid the public deserialization replay here:
        # it would refactor the same source, quotient, and principal ideals a
        # second time.  `add_relation` and `RelationRecord.verify` retain that
        # full replay for external or restored records.
        return self._store_verified(record)


def initial_rational_prime_relations(
    collector: ExactRelationCollector,
    rational_primes: Iterable[int] | None = None,
) -> tuple[RelationAdmission, ...]:
    """Admit deterministic `(p)` relations whose full split is in the base."""
    if rational_primes is None:
        candidates = sorted(
            {int(prime.rational_prime()) for prime in collector.factor_base}
        )
    else:
        candidates = sorted(
            {_checked_integer(value, "rational prime") for value in rational_primes}
        )
    answer: list[RelationAdmission] = []
    for sequence, rational_prime in enumerate(candidates):
        decomposition = collector.order.factor_rational_prime(rational_prime)
        complete = True
        for prime_ideal, _exponent in decomposition:
            if not any(
                prime_ideal == base_prime for base_prime in collector.factor_base
            ):
                complete = False
                break
        if not complete:
            continue
        answer.append(
            collector.admit_witness(
                collector.order.number_field()(rational_prime),
                provenance={
                    "algorithm": "rational-prime-decomposition",
                    "rational_prime": rational_prime,
                    "sequence": sequence,
                },
            )
        )
    return tuple(answer)


def _nearest_integer(value: Any) -> int:
    numerator = int(value._numerator)
    denominator = int(value._denominator)
    if numerator >= 0:
        return (2 * numerator + denominator) // (2 * denominator)
    return -((2 * (-numerator) + denominator) // (2 * denominator))


def _gram_schmidt(rows: list[list[int]]) -> tuple[list[list[Any]], list[Any]]:
    dimension = len(rows)
    width = len(rows[0]) if rows else 0
    orthogonal: list[list[Any]] = []
    mu = [[sage.QQ(0) for _column in range(dimension)] for _row in range(dimension)]
    norms: list[Any] = []
    for row_index, row in enumerate(rows):
        vector = [sage.QQ(value) for value in row]
        for previous in range(row_index):
            dot = sum(
                (
                    sage.QQ(row[column]) * orthogonal[previous][column]
                    for column in range(width)
                ),
                sage.QQ(0),
            )
            coefficient = dot / norms[previous]
            mu[row_index][previous] = coefficient
            vector = [
                vector[column] - coefficient * orthogonal[previous][column]
                for column in range(width)
            ]
        norm = sum((value * value for value in vector), sage.QQ(0))
        if norm == 0:
            raise ValueError("LLL input rows must be linearly independent")
        orthogonal.append(vector)
        norms.append(norm)
    return mu, norms


def _exact_lll_reduce_with_transform(
    rows: Iterable[Iterable[int]],
) -> tuple[list[list[int]], list[list[int]]]:
    """Return an exact 3/4-LLL basis and its unimodular row transform."""
    basis = [[int(value) for value in row] for row in rows]
    if not basis:
        return ([], [])
    width = len(basis[0])
    if any(len(row) != width for row in basis):
        raise ValueError("LLL input rows must have equal width")
    transform = [
        [1 if row == column else 0 for column in range(len(basis))]
        for row in range(len(basis))
    ]
    mu, norms = _gram_schmidt(basis)
    index = 1
    while index < len(basis):
        for previous in range(index - 1, -1, -1):
            multiple = _nearest_integer(mu[index][previous])
            if multiple:
                basis[index] = [
                    value - multiple * basis[previous][column]
                    for column, value in enumerate(basis[index])
                ]
                transform[index] = [
                    value - multiple * transform[previous][column]
                    for column, value in enumerate(transform[index])
                ]
                mu, norms = _gram_schmidt(basis)
        if (
            norms[index]
            >= (sage.QQ(3) / sage.QQ(4) - mu[index][index - 1] ** 2) * norms[index - 1]
        ):
            index += 1
        else:
            basis[index], basis[index - 1] = basis[index - 1], basis[index]
            transform[index], transform[index - 1] = (
                transform[index - 1],
                transform[index],
            )
            mu, norms = _gram_schmidt(basis)
            index = max(1, index - 1)
    return basis, transform


def exact_lll_reduce(rows: Iterable[Iterable[int]]) -> list[list[int]]:
    """Return a deterministic exact 3/4-LLL basis for an integer row lattice."""
    return _exact_lll_reduce_with_transform(rows)[0]


def _lcm(left: int, right: int) -> int:
    a = abs(left)
    b = abs(right)
    while b:
        a, b = b, a % b
    gcd = a
    return abs(left // gcd * right) if left and right else 0


def _integral_lattice_rows(ideal: Any) -> tuple[list[list[int]], int]:
    rows = ideal.basis_matrix().rows()
    denominator = 1
    for row in rows:
        for value in row:
            denominator = _lcm(denominator, int(value._denominator))
    return (
        [[int((value * denominator)._numerator) for value in row] for row in rows],
        denominator,
    )


def _decimal_rational(value: Any) -> tuple[int, int]:
    """Parse a finite FLINT real rendering without passing through binary64."""
    text = str(value).strip().lower()
    if text in ("+infinity", "-infinity", "nan"):
        raise ArithmeticError("a Minkowski coordinate is not finite")
    exponent = 0
    if "e" in text:
        text, exponent_text = text.split("e", 1)
        exponent = int(exponent_text)
    sign = -1 if text.startswith("-") else 1
    if text[:1] in ("+", "-"):
        text = text[1:]
    if "." in text:
        whole, fractional = text.split(".", 1)
    else:
        whole, fractional = text, ""
    if not whole:
        whole = "0"
    digits = whole + fractional
    if not digits.isdigit():
        raise ArithmeticError("unable to parse a Minkowski coordinate")
    numerator = sign * int(digits)
    denominator = 10 ** len(fractional)
    if exponent >= 0:
        numerator *= 10**exponent
    else:
        denominator *= 10 ** (-exponent)
    return numerator, denominator


def _scaled_real_integer(value: Any, scale_bits: int) -> int:
    numerator, denominator = _decimal_rational(value)
    scaled = sage.QQ(numerator * (1 << scale_bits)) / sage.QQ(denominator)
    return _nearest_integer(scaled)


def _real_part(value: Any) -> Any:
    method = getattr(value, "real", None)
    return method() if callable(method) else value


def _matrix_times_rows(
    matrix: Iterable[Iterable[int]], rows: Iterable[Iterable[int]]
) -> list[list[int]]:
    coefficients = [list(row) for row in matrix]
    source = [list(row) for row in rows]
    if not coefficients:
        return []
    return [
        [
            sum(
                coefficients[row_index][source_index] * source[source_index][column]
                for source_index in range(len(source))
            )
            for column in range(len(source[0]))
        ]
        for row_index in range(len(coefficients))
    ]


def _integer_determinant(rows: Iterable[Iterable[int]]) -> int:
    """Return the determinant of a square integer matrix by Bareiss elimination."""
    matrix = [list(row) for row in rows]
    size = len(matrix)
    if any(len(row) != size for row in matrix):
        raise ValueError("determinant input must be square")
    if size == 0:
        return 1
    sign = 1
    previous_pivot = 1
    for column in range(size - 1):
        pivot = column
        while pivot < size and matrix[pivot][column] == 0:
            pivot += 1
        if pivot == size:
            return 0
        if pivot != column:
            matrix[pivot], matrix[column] = matrix[column], matrix[pivot]
            sign = -sign
        pivot_value = matrix[column][column]
        for row in range(column + 1, size):
            for target in range(column + 1, size):
                numerator = (
                    matrix[row][target] * pivot_value
                    - matrix[row][column] * matrix[column][target]
                )
                matrix[row][target] = numerator // previous_pivot
            matrix[row][column] = 0
        previous_pivot = pivot_value
    return sign * matrix[size - 1][size - 1]


def _minkowski_integer_rows(
    ideal: Any, precision: int, scale_bits: int
) -> tuple[list[list[int]], tuple[int, int]]:
    field = ideal.number_field()
    data = archimedean_data(field)
    signature = data.signature()
    if signature[0] + 2 * signature[1] != field.degree():
        raise ArithmeticError("Minkowski embedding dimension is not the field degree")
    # Construct sqrt(2) in the same arbitrary-precision field as each complex
    # coordinate.  The decimal has substantially more digits than the public
    # precision ceiling used below and avoids an accidental binary64 boundary.
    sqrt_two_decimal = (
        "1.41421356237309504880168872420969807856967187537694807317667973799"
        "0732478462107038850387534327641572735013846230912297024924836"
    )
    rows: list[list[int]] = []
    for element in ideal.basis():
        row: list[int] = []
        for embedding in data.embeddings:
            approximation = embedding.approximate(element, precision).value
            if embedding.kind == "real":
                row.append(_scaled_real_integer(_real_part(approximation), scale_bits))
                continue
            real_method = getattr(approximation, "real", None)
            imag_method = getattr(approximation, "imag", None)
            real: Any
            imag: Any
            if callable(real_method) and callable(imag_method):
                real = real_method()
                imag = imag_method()
            else:
                real = approximation
                imag = approximation.parent()(0)
            real_field = real.parent()
            sqrt_two = real_field(sqrt_two_decimal)
            row.append(_scaled_real_integer(sqrt_two * real, scale_bits))
            row.append(_scaled_real_integer(sqrt_two * imag, scale_bits))
        rows.append(row)
    return rows, signature


class MinkowskiLatticePlan:
    """Numerical lattice choice with an exact ideal-basis transformation."""

    def __init__(
        self,
        *,
        precision: int,
        scale_bits: int,
        signature: tuple[int, int],
        source_embedded_rows: list[list[int]],
        embedded_rows: list[list[int]],
        transform: list[list[int]],
        exact_rows: list[list[int]],
        denominator: int,
    ) -> None:
        self.precision = precision
        self.scale_bits = scale_bits
        self.signature = signature
        self.source_embedded_rows = tuple(tuple(row) for row in source_embedded_rows)
        self.embedded_rows = tuple(tuple(row) for row in embedded_rows)
        self.transform = tuple(tuple(row) for row in transform)
        self.exact_rows = tuple(tuple(row) for row in exact_rows)
        self.denominator = denominator
        self.proof_status = "numerical-selector/exact-transform"

    def verify(self, ideal: Any) -> bool:
        """Recheck the exact transformed basis and ideal membership."""
        source_rows, denominator = _integral_lattice_rows(ideal)
        if denominator != self.denominator:
            return False
        if abs(_integer_determinant(self.transform)) != 1:
            return False
        embedded = _matrix_times_rows(self.transform, self.source_embedded_rows)
        if embedded != [list(row) for row in self.embedded_rows]:
            return False
        transformed = _matrix_times_rows(self.transform, source_rows)
        if transformed != [list(row) for row in self.exact_rows]:
            return False
        field = ideal.number_field()
        for row in transformed:
            element = _field_element_from_coefficients(
                field,
                [sage.QQ(value) / sage.QQ(denominator) for value in row],
            )
            if element not in ideal:
                return False
        return True

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": MINKOWSKI_LATTICE_SCHEMA,
            "precision": self.precision,
            "scale_bits": self.scale_bits,
            "signature": list(self.signature),
            "source_embedded_rows": [list(row) for row in self.source_embedded_rows],
            "embedded_rows": [list(row) for row in self.embedded_rows],
            "transform": [list(row) for row in self.transform],
            "exact_rows": [list(row) for row in self.exact_rows],
            "denominator": self.denominator,
            "proof_status": self.proof_status,
        }


def minkowski_lll_lattice(
    ideal: Any, *, precision: int = 128, scale_bits: int | None = None
) -> MinkowskiLatticePlan:
    """Reduce an ideal's true Minkowski embedding and retain exact rows.

    Real embeddings contribute one coordinate.  One representative of every
    complex pair contributes `sqrt(2) Re` and `sqrt(2) Im`, so Euclidean length
    is the canonical Minkowski length.  Approximate coordinates only choose a
    unimodular transform; the returned basis is represented exactly.
    """
    precision = _checked_integer(precision, "embedding precision")
    if precision < 53:
        raise ValueError("embedding precision must be at least 53 bits")
    if ideal.is_zero():
        raise ValueError("the zero ideal has no full Minkowski lattice")
    if scale_bits is None:
        scale_bits = min(96, precision - 16)
    scale_bits = _checked_integer(scale_bits, "Minkowski scale")
    if scale_bits < 24 or scale_bits >= precision:
        raise ValueError("Minkowski scale must be at least 24 and below precision")
    embedded_rows, signature = _minkowski_integer_rows(ideal, precision, scale_bits)
    reduced_embedded, transform = _exact_lll_reduce_with_transform(embedded_rows)
    source_rows, denominator = _integral_lattice_rows(ideal)
    exact_rows = _matrix_times_rows(transform, source_rows)
    plan = MinkowskiLatticePlan(
        precision=precision,
        scale_bits=scale_bits,
        signature=signature,
        source_embedded_rows=embedded_rows,
        embedded_rows=reduced_embedded,
        transform=transform,
        exact_rows=exact_rows,
        denominator=denominator,
    )
    if not plan.verify(ideal):
        raise ArithmeticError("Minkowski LLL transform failed exact ideal replay")
    return plan


class AutomorphismOrbitPlan:
    """Capability report for exact automorphism-derived relation orbits."""

    def __init__(self, field: Any, factor_base: Iterable[Any]) -> None:
        self.available = False
        self.strategy = "independent-minkowski-relation-search"
        self.factor_base_size = len(tuple(factor_base))
        self.detected = {
            "field_automorphisms": callable(getattr(field, "automorphisms", None)),
            "ideal_map": callable(getattr(field, "map_ideal_under_automorphism", None)),
            "factor_base_permutation": callable(
                getattr(field, "factor_base_automorphism_permutation", None)
            ),
        }
        self.reason = (
            "abstract Galois-group permutations do not provide exact field self-maps, "
            "ideal images, and an authenticated factor-base permutation"
        )

    def derive(self, relation: Any) -> tuple[()]:
        raise NotImplementedError(self.reason)

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": AUTOMORPHISM_PLAN_SCHEMA,
            "available": self.available,
            "strategy": self.strategy,
            "factor_base_size": self.factor_base_size,
            "detected": dict(self.detected),
            "reason": self.reason,
        }


def plan_automorphism_orbits(
    field: Any, factor_base: Iterable[Any]
) -> AutomorphismOrbitPlan:
    """Report whether exact relation orbits can be derived in this runtime.

    The current Galois API describes abstract permutation groups only.  It
    cannot map a principal witness or prime ideal, so orbit relations would be
    unverifiable guesses.  This explicit result lets collectors select the
    independent-search fallback without probing private APIs.
    """
    return AutomorphismOrbitPlan(field, factor_base)


class RelationSearchState:
    def __init__(
        self,
        seed: int,
        *,
        random_state: int | None = None,
        candidates_tested: int = 0,
        ideals_tested: int = 0,
        relations_admitted: int = 0,
    ) -> None:
        self.seed = _checked_integer(seed, "search seed") & _U64_MASK
        state = (
            self.seed
            if random_state is None
            else _checked_integer(random_state, "random state")
        )
        self.random_state = (state & _U64_MASK) or 0x9E3779B97F4A7C15
        self.candidates_tested = _checked_nonnegative(
            candidates_tested, "candidates tested"
        )
        self.ideals_tested = _checked_nonnegative(ideals_tested, "ideals tested")
        self.relations_admitted = _checked_nonnegative(
            relations_admitted, "relations admitted"
        )

    def next_u64(self) -> int:
        value = self.random_state
        value ^= (value << 13) & _U64_MASK
        value ^= value >> 7
        value ^= (value << 17) & _U64_MASK
        self.random_state = value & _U64_MASK
        return self.random_state

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": SEARCH_STATE_SCHEMA,
            "seed": self.seed,
            "random_state": self.random_state,
            "candidates_tested": self.candidates_tested,
            "ideals_tested": self.ideals_tested,
            "relations_admitted": self.relations_admitted,
        }

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> RelationSearchState:
        if payload.get("schema") != SEARCH_STATE_SCHEMA:
            raise ValueError("unsupported relation-search state schema")
        return cls(
            payload["seed"],
            random_state=payload["random_state"],
            candidates_tested=payload["candidates_tested"],
            ideals_tested=payload["ideals_tested"],
            relations_admitted=payload["relations_admitted"],
        )


class LLLRelationSearch:
    """Bounded deterministic relation search with replayable PRNG state."""

    def __init__(
        self,
        collector: ExactRelationCollector,
        *,
        seed: int = 0,
        max_candidates_per_ideal: int = 64,
        random_terms: int = 5,
        coefficient_bound: int = 2,
        embedding_precision: int = 128,
        basis_reducer: Callable[[Iterable[Iterable[int]]], list[list[int]]]
        | None = None,
        state: RelationSearchState | None = None,
    ) -> None:
        self.collector = collector
        self.max_candidates_per_ideal = _checked_nonnegative(
            max_candidates_per_ideal, "candidate bound"
        )
        self.random_terms = _checked_nonnegative(random_terms, "random-term bound")
        self.coefficient_bound = _checked_nonnegative(
            coefficient_bound, "coefficient bound"
        )
        self.embedding_precision = _checked_integer(
            embedding_precision, "embedding precision"
        )
        if self.embedding_precision < 53:
            raise ValueError("embedding precision must be at least 53 bits")
        self.basis_reducer = basis_reducer
        self.last_lattice_plan: MinkowskiLatticePlan | None = None
        self.state = RelationSearchState(seed) if state is None else state

    def short_elements(self, ideal: Any) -> tuple[Any, ...]:
        if ideal.ring() is not self.collector.order or ideal.is_zero():
            raise TypeError("short-vector search requires a nonzero ideal of the order")
        integer_rows, denominator = _integral_lattice_rows(ideal)
        if self.basis_reducer is None:
            self.last_lattice_plan = minkowski_lll_lattice(
                ideal, precision=self.embedding_precision
            )
            reduced = [list(row) for row in self.last_lattice_plan.exact_rows]
            denominator = self.last_lattice_plan.denominator
        else:
            self.last_lattice_plan = None
            reduced = self.basis_reducer(integer_rows)
        coefficient_rows: list[list[int]] = []
        coefficient_rows.extend(reduced)
        for left in range(len(reduced)):
            for right in range(left + 1, len(reduced)):
                coefficient_rows.append(
                    [a + b for a, b in zip(reduced[left], reduced[right], strict=False)]
                )
        for left in range(len(reduced)):
            for right in range(left + 1, len(reduced)):
                coefficient_rows.append(
                    [a - b for a, b in zip(reduced[left], reduced[right], strict=False)]
                )
        while len(coefficient_rows) < self.max_candidates_per_ideal and reduced:
            candidate = [0 for _ in reduced[0]]
            terms = min(self.random_terms, len(reduced))
            for _term in range(terms):
                source = reduced[self.state.next_u64() % len(reduced)]
                span = 2 * self.coefficient_bound + 1
                coefficient = int(self.state.next_u64() % span) - self.coefficient_bound
                candidate = [
                    value + coefficient * source[index]
                    for index, value in enumerate(candidate)
                ]
            if any(candidate):
                coefficient_rows.append(candidate)
        field = ideal.number_field()
        answer: list[Any] = []
        seen: set[str] = set()
        for row in coefficient_rows[: self.max_candidates_per_ideal]:
            element = _field_element_from_coefficients(
                field,
                [sage.QQ(value) / sage.QQ(denominator) for value in row],
            )
            if element.is_zero() or element not in ideal:
                continue
            key = json.dumps(_element_payload(field, element), separators=(",", ":"))
            if key not in seen:
                seen.add(key)
                answer.append(element)
        return tuple(answer)

    def search_ideal(
        self,
        ideal: Any,
        *,
        source_row: Iterable[int] | None = None,
        stop_after: int | None = None,
        provenance: dict[str, Any] | None = None,
    ) -> tuple[RelationAdmission, ...]:
        self.state.ideals_tested += 1
        limit = (
            self.max_candidates_per_ideal
            if stop_after is None
            else _checked_nonnegative(stop_after, "relation limit")
        )
        if limit == 0:
            return ()
        answer: list[RelationAdmission] = []
        for sequence, element in enumerate(self.short_elements(ideal)):
            self.state.candidates_tested += 1
            candidate_provenance = {
                "algorithm": (
                    "minkowski-fixed-point-lll"
                    if self.last_lattice_plan is not None
                    else "custom-coefficient-lattice-reducer"
                ),
                "embedding_precision": self.embedding_precision,
                "seed": self.state.seed,
                "ideal_sequence": self.state.ideals_tested - 1,
                "candidate_sequence": sequence,
            }
            if provenance:
                candidate_provenance.update(_json_value(provenance))
            try:
                admission = self.collector.admit_witness(
                    element,
                    source_ideal=ideal,
                    source_row=source_row,
                    provenance=candidate_provenance,
                )
            except RelationNotSmoothError:
                continue
            answer.append(admission)
            self.state.relations_admitted += 1
            if len(answer) >= limit:
                break
        return tuple(answer)

    def random_factor_base_ideal(
        self, *, terms: int = 3, max_exponent: int = 2
    ) -> tuple[Any, tuple[int, ...]]:
        width = len(self.collector.factor_base)
        if width == 0:
            raise ValueError("a random relation ideal requires a nonempty factor base")
        term_count = max(1, _checked_integer(terms, "random ideal terms"))
        exponent_bound = max(1, _checked_integer(max_exponent, "random ideal exponent"))
        row = [0] * width
        missing = self.collector.rank_screen.missing_pivots()
        first = (
            missing[self.state.next_u64() % len(missing)]
            if missing
            else self.state.next_u64() % width
        )
        row[first] += 1 + self.state.next_u64() % exponent_bound
        for _term in range(1, term_count):
            index = self.state.next_u64() % width
            row[index] += 1 + self.state.next_u64() % exponent_bound
        exponents = tuple(int(value) for value in row)
        return (
            reconstruct_factor_base_ideal(
                self.collector.order, self.collector.factor_base, exponents
            ),
            exponents,
        )

    def search_random_ideals(
        self,
        ideal_count: int,
        *,
        terms: int = 3,
        max_exponent: int = 2,
        stop_after_per_ideal: int = 1,
    ) -> tuple[RelationAdmission, ...]:
        count = _checked_nonnegative(ideal_count, "random ideal count")
        answer: list[RelationAdmission] = []
        for sequence in range(count):
            ideal, row = self.random_factor_base_ideal(
                terms=terms, max_exponent=max_exponent
            )
            answer.extend(
                self.search_ideal(
                    ideal,
                    source_row=row,
                    stop_after=stop_after_per_ideal,
                    provenance={"random_ideal_sequence": sequence},
                )
            )
        return tuple(answer)


def reduce_ideal_over_base(
    ideal: Any,
    factor_base: Iterable[Any],
    *,
    seed: int = 0,
    max_candidates: int = 128,
) -> tuple[tuple[int, ...], FactoredPrincipalWitness]:
    """Find `(alpha) = ideal * Q` with `Q` smooth over the factor base.

    This is the inverse-map analogue of relation collection.  It permits an
    arbitrary nonzero fractional ideal, even when that ideal itself contains
    primes outside the factor base.  The returned row factors `Q`; therefore
    the ideal's class is the negative of that row.  Exact ideal equality is
    checked before returning the principal witness `alpha`.
    """
    order = ideal.ring()
    factors = _validate_factor_base(order, factor_base)
    if ideal.is_zero():
        raise ValueError("the zero ideal has no ideal class")
    collector = ExactRelationCollector(order, factors)
    search = LLLRelationSearch(
        collector,
        seed=seed,
        max_candidates_per_ideal=_checked_nonnegative(
            max_candidates, "candidate bound"
        ),
        random_terms=min(5, max(1, order.number_field().degree())),
        coefficient_bound=3,
    )
    ideal_row = tuple(int(ideal.valuation(prime)) for prime in factors)
    ideal_norm = sage.QQ(ideal.norm())
    for element in search.short_elements(ideal):
        principal_row = factor_witness_over_base(
            FactoredPrincipalWitness.from_element(element), factors
        )
        row = tuple(
            principal_exponent - ideal_exponent
            for principal_exponent, ideal_exponent in zip(
                principal_row, ideal_row, strict=True
            )
        )
        quotient_norm = sage.QQ(element.norm()) / ideal_norm
        if quotient_norm < 0:
            quotient_norm = -quotient_norm
        if _factor_base_row_norm(factors, row) != quotient_norm:
            continue
        principal = order.ideal(element)
        reconstructed = reconstruct_factor_base_ideal(order, factors, row)
        if ideal * reconstructed != principal:
            raise ArithmeticError("ideal reduction failed exact principal replay")
        return row, FactoredPrincipalWitness.from_element(element)
    raise RelationNotSmoothError(
        "bounded ideal reduction found no factor-base-smooth quotient", ideal=ideal
    )


__all__ = [
    "AutomorphismOrbitPlan",
    "DEFAULT_RANK_PRIME",
    "ExactRelationCollector",
    "FactoredPrincipalWitness",
    "LLLRelationSearch",
    "MinkowskiLatticePlan",
    "ModularRankScreen",
    "RelationAdmission",
    "RelationNotSmoothError",
    "RelationRecord",
    "RelationSearchState",
    "exact_lll_reduce",
    "factor_ideal_over_base",
    "factor_witness_over_base",
    "initial_rational_prime_relations",
    "minkowski_lll_lattice",
    "plan_automorphism_orbits",
    "reduce_ideal_over_base",
    "reconstruct_factor_base_ideal",
    "verify_relation_record",
]
