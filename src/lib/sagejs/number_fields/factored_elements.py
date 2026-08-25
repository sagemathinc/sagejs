"""Compact exact products of nonzero number-field elements.

Relation generators and fundamental units can be far larger when expanded
than the factors from which they were discovered.  This module keeps those
factors exact, combines repeated bases, and expands only when a caller asks
for an ordinary field element.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Iterable

import sagejs as sage
import sagejs.runtime as runtime

SERIALIZATION_SCHEMA = "sagejs.number-fields.factored-element.v1"


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


def _rational_pair(value: Any) -> list[int]:
    rational = sage.QQ(value)
    return [int(rational._numerator), int(rational._denominator)]


def _checked_rational_pair(value: Any, name: str) -> Any:
    if not isinstance(value, list) or len(value) != 2:
        raise TypeError(name + " must be a [numerator, denominator] pair")
    numerator = value[0]
    denominator = value[1]
    if (
        isinstance(numerator, bool)
        or not isinstance(numerator, int)
        or isinstance(denominator, bool)
        or not isinstance(denominator, int)
    ):
        raise TypeError(name + " must contain integers")
    if denominator <= 0:
        raise ValueError(name + " must have a positive denominator")
    rational = sage.QQ(numerator) / sage.QQ(denominator)
    if _rational_pair(rational) != value:
        raise ValueError(name + " is not a reduced canonical rational")
    return rational


def field_fingerprint(field: Any) -> dict[str, Any]:
    """Return the stable presentation identity used by factored witnesses."""
    return {
        "defining_polynomial": [
            _rational_pair(coefficient) for coefficient in field._defining_coefficients
        ],
        "degree": int(field.degree()),
        "variable": field.variable_name(),
    }


def _element_key(field: Any, element: Any) -> tuple[tuple[int, int], ...]:
    coordinates = list(element.list())
    degree = int(field.degree())
    if len(coordinates) != degree:
        raise ArithmeticError("a field element has the wrong coordinate length")
    return tuple(
        (int(value._numerator), int(value._denominator)) for value in coordinates
    )


def _element_payload(field: Any, element: Any) -> list[list[int]]:
    return [
        [numerator, denominator]
        for numerator, denominator in _element_key(field, element)
    ]


def _element_from_payload(field: Any, payload: Any) -> Any:
    if not isinstance(payload, list) or len(payload) != int(field.degree()):
        raise ValueError("a factored element has the wrong coordinate length")
    coordinates = [
        _checked_rational_pair(value, "field-element coordinate") for value in payload
    ]
    return field._from_coefficients(coordinates)


def _checked_exponent(value: Any) -> int:
    if isinstance(value, bool) or (
        not runtime.is_exact_integer(value) and not isinstance(value, int)
    ):
        raise TypeError("a factored-element exponent must be an integer")
    exponent = runtime.integer_bigint(value)
    return int(exponent)


class FactoredNumberFieldElement:
    """An immutable exact product `prod(factor**exponent)`.

    Factors use canonical power-basis coordinates and signed integer
    exponents.  Equal bases are combined, factors with exponent zero and the
    base `1` disappear, and the remaining entries are sorted by coordinates.
    The empty factor list is the multiplicative identity.  Zero is not
    representable.
    """

    def __init__(
        self,
        field: Any,
        factors: Iterable[Any] = (),
    ) -> None:
        self._field = field
        combined: dict[tuple[tuple[int, int], ...], list[Any]] = {}
        for entry in factors:
            if isinstance(entry, (list, tuple)) and len(entry) == 2:
                raw_factor = entry[0]
                exponent = _checked_exponent(entry[1])
            else:
                raw_factor = entry
                exponent = 1
            if exponent == 0:
                continue
            factor = field(raw_factor)
            if factor.is_zero():
                raise ValueError("zero cannot occur in a factored number-field element")
            if factor.is_one():
                continue
            key = _element_key(field, factor)
            if key in combined:
                combined[key][1] += exponent
            else:
                combined[key] = [factor, exponent]
        ordered: list[tuple[Any, int]] = []
        for key in sorted(combined):
            factor, exponent = combined[key]
            if exponent:
                ordered.append((factor, int(exponent)))
        self._factors = tuple(ordered)
        # Exact unit replay asks for the same principal ideal during unit
        # recovery and again while authenticating the saturation record.  Keep
        # this cache object-local and tiny: the factored element is immutable,
        # while order identity prevents reuse in an unrelated order.
        self._principal_ideal_cache: list[tuple[Any, Any]] = []
        # Immutable factors make their canonical digest safely reusable.
        # `to_dict()` still returns a fresh body.
        self._stable_hash_cache: list[str] = []
        runtime.object.freeze(self)

    @classmethod
    def from_element(cls, field: Any, element: Any) -> FactoredNumberFieldElement:
        value = field(element)
        if value.is_zero():
            raise ValueError("zero cannot be represented as a factored element")
        return cls(field, () if value.is_one() else ((value, 1),))

    def field(self) -> Any:
        return self._field

    def factors(self) -> tuple[tuple[Any, int], ...]:
        return self._factors

    def is_one(self) -> bool:
        return len(self._factors) == 0

    def __len__(self) -> int:
        return len(self._factors)

    def _require_same_field(self, other: Any) -> FactoredNumberFieldElement:
        if not isinstance(other, FactoredNumberFieldElement):
            raise TypeError("factored multiplication needs another factored element")
        if other._field is not self._field:
            raise TypeError("factored elements must belong to the same field instance")
        return other

    def __mul__(self, other: Any) -> FactoredNumberFieldElement:
        right = self._require_same_field(other)
        return FactoredNumberFieldElement(
            self._field, list(self._factors) + list(right._factors)
        )

    def inverse(self) -> FactoredNumberFieldElement:
        return FactoredNumberFieldElement(
            self._field, ((factor, -exponent) for factor, exponent in self._factors)
        )

    def __invert__(self) -> FactoredNumberFieldElement:
        return self.inverse()

    def __truediv__(self, other: Any) -> FactoredNumberFieldElement:
        return self * self._require_same_field(other).inverse()

    def __pow__(self, exponent: Any) -> FactoredNumberFieldElement:
        power = _checked_exponent(exponent)
        return FactoredNumberFieldElement(
            self._field,
            (
                (factor, factor_exponent * power)
                for factor, factor_exponent in self._factors
            ),
        )

    def evaluate(self) -> Any:
        """Expand the exact product into one ordinary number-field element."""
        result = self._field.one()
        for factor, exponent in self._factors:
            result *= factor**exponent
        return result

    value = evaluate

    def norm(self) -> Any:
        """Return the exact field norm without expanding the product."""
        result = sage.QQ(1)
        for factor, exponent in self._factors:
            result *= factor.norm() ** exponent
        return result

    absolute_norm = norm

    def principal_ideal(self, order: Any = None) -> Any:
        """Construct the associated principal fractional ideal factor by factor."""
        selected_order = self._field.maximal_order() if order is None else order
        if selected_order.number_field() is not self._field:
            raise TypeError("the selected order belongs to a different field instance")
        for cached_order, cached_ideal in self._principal_ideal_cache:
            if cached_order is selected_order:
                return cached_ideal
        ideal_module = __import__(
            "sagejs.number_fields.ideal_arithmetic", fromlist=["ideal_arithmetic"]
        )
        result = selected_order.ideal(1)
        for factor, exponent in self._factors:
            result *= ideal_module.ideal_power(selected_order.ideal(factor), exponent)
        if len(self._principal_ideal_cache) >= 2:
            self._principal_ideal_cache.pop(0)
        self._principal_ideal_cache.append((selected_order, result))
        return result

    def verify_principal_ideal(self, ideal: Any) -> bool:
        try:
            return (
                ideal.number_field() is self._field
                and self.principal_ideal(ideal.ring()) == ideal
            )
        except (TypeError, ValueError, ArithmeticError, ZeroDivisionError):
            return False

    def archimedean_logarithms(
        self,
        prec: int = 53,
        *,
        workspace: Any = None,
        maximum_places: int | None = None,
    ) -> tuple[Any, ...]:
        """Return rigorous weighted log-absolute-value balls factor by factor."""
        if isinstance(prec, bool) or not isinstance(prec, int) or prec < 2:
            raise ValueError("archimedean precision must be an integer at least 2")
        embedding_module = __import__(
            "sagejs.number_fields.embeddings", fromlist=["embeddings"]
        )
        analytic_module = __import__(
            "sagejs.number_fields.class_unit_analytic",
            fromlist=["class_unit_analytic"],
        )
        cached_archimedean_data = getattr(self._field, "archimedean_data", None)
        data: Any = (
            cached_archimedean_data()
            if callable(cached_archimedean_data)
            else embedding_module.archimedean_data(self._field)
        )
        place_count = len(data.embeddings)
        if maximum_places is not None:
            if (
                isinstance(maximum_places, bool)
                or not isinstance(maximum_places, int)
                or maximum_places < 0
                or maximum_places > place_count
            ):
                raise ValueError("maximum_places is outside the embedding range")
            place_count = maximum_places
        embeddings = data.embeddings[:place_count]
        result = [
            analytic_module.RealBall(0, precision_bits=prec)
            for _embedding in embeddings
        ]
        for factor, exponent in self._factors:
            factor_logs = (
                _factor_archimedean_logarithms(
                    self._field,
                    factor,
                    prec,
                    data,
                    analytic_module,
                    maximum_places=place_count,
                )
                if workspace is None
                else workspace.factor_logarithms(
                    self._field,
                    factor,
                    prec,
                    data,
                    analytic_module,
                    maximum_places=place_count,
                )
            )
            for index, embedding in enumerate(embeddings):
                ball = factor_logs[index]
                weight = exponent * int(embedding.log_weight)
                result[index] = result[index] + ball * analytic_module.RealBall(
                    weight, precision_bits=prec
                )
        return tuple(result)

    logarithmic_image = archimedean_logarithms

    def regulator_logarithms(
        self, prec: int, unit_rank: int, *, workspace: Any = None
    ) -> tuple[Any, ...]:
        """Return only the embedding columns consumed by a regulator."""
        if isinstance(unit_rank, bool) or not isinstance(unit_rank, int):
            raise TypeError("unit_rank must be an integer")
        return self.archimedean_logarithms(
            prec,
            workspace=workspace,
            maximum_places=unit_rank,
        )

    def regulator_cache_key(
        self,
    ) -> tuple[tuple[tuple[tuple[int, int], ...], int], ...]:
        """Return the exact factor payload used by a live regulator cache."""
        return tuple(
            (_element_key(self._field, factor), int(exponent))
            for factor, exponent in self._factors
        )

    def _body_dict(self) -> dict[str, Any]:
        return {
            "schema": SERIALIZATION_SCHEMA,
            "field": field_fingerprint(self._field),
            "factors": [
                {
                    "element": _element_payload(self._field, factor),
                    "exponent": exponent,
                }
                for factor, exponent in self._factors
            ],
        }

    def to_dict(self) -> dict[str, Any]:
        """Return a canonical, pointer-independent authenticated payload."""
        body = self._body_dict()
        if self._stable_hash_cache:
            content_hash = self._stable_hash_cache[0]
        else:
            content_hash = _content_hash(body)
            self._stable_hash_cache.append(content_hash)
        body["content_sha256"] = content_hash
        return body

    @classmethod
    def from_dict(cls, field: Any, data: dict[str, Any]) -> FactoredNumberFieldElement:
        if not isinstance(data, dict):
            raise TypeError("a serialized factored element must be a dictionary")
        if data.get("schema") != SERIALIZATION_SCHEMA:
            raise ValueError("unsupported factored-element serialization schema")
        if data.get("field") != field_fingerprint(field):
            raise ValueError("a factored element belongs to a different field")
        expected_hash = data.get("content_sha256")
        if not isinstance(expected_hash, str) or len(expected_hash) != 64:
            raise ValueError("a factored element has no valid content hash")
        body = dict(data)
        del body["content_sha256"]
        if _content_hash(body) != expected_hash:
            raise ValueError("factored-element content hash mismatch")
        raw_factors = data.get("factors")
        if not isinstance(raw_factors, list):
            raise TypeError("serialized factored-element factors must be a list")
        factors: list[tuple[Any, int]] = []
        for entry in raw_factors:
            if not isinstance(entry, dict) or set(entry) != {"element", "exponent"}:
                raise TypeError("a serialized factored-element factor is malformed")
            factors.append(
                (
                    _element_from_payload(field, entry["element"]),
                    _checked_exponent(entry["exponent"]),
                )
            )
        answer = cls(field, factors)
        if answer.to_dict() != data:
            raise ValueError("factored-element serialization is not canonical")
        return answer

    def stable_hash(self) -> str:
        if self._stable_hash_cache:
            return self._stable_hash_cache[0]
        return self.to_dict()["content_sha256"]

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, FactoredNumberFieldElement):
            return False
        if other._field is not self._field or len(other._factors) != len(self._factors):
            return False
        return all(
            left_exponent == right_exponent and left_factor == right_factor
            for (left_factor, left_exponent), (right_factor, right_exponent) in zip(
                self._factors, other._factors, strict=False
            )
        )

    def __repr__(self) -> str:
        if self.is_one():
            return "Factored number-field element (1)"
        return (
            "Factored number-field element ("
            + " * ".join(
                "(" + str(factor) + ")^" + str(exponent)
                for factor, exponent in self._factors
            )
            + ")"
        )


def _factor_archimedean_logarithms(
    field: Any,
    factor: Any,
    precision: int,
    data: Any,
    analytic_module: Any,
    *,
    maximum_places: int | None = None,
) -> tuple[Any, ...]:
    answer = []
    embeddings = data.embeddings
    if maximum_places is not None:
        embeddings = embeddings[:maximum_places]
    for embedding in embeddings:
        algebraic = embedding(factor)
        enclosure = runtime.flint_backend().qqbarLogAbsBall(
            algebraic._native, precision
        )
        try:
            endpoint_encoding = enclosure["endpointEncoding"]
            lower_mantissa = enclosure["lowerMantissa"]
            lower_exponent = enclosure["lowerExponent"]
            upper_mantissa = enclosure["upperMantissa"]
            upper_exponent = enclosure["upperExponent"]
            precision_bits = enclosure["precisionBits"]
        except (KeyError, TypeError) as error:
            raise ArithmeticError(
                "FLINT returned an incomplete logarithm enclosure"
            ) from error
        if endpoint_encoding != "mantissa-times-two-power":
            raise ArithmeticError("FLINT did not return exact outward dyadic endpoints")
        answer.append(
            analytic_module.RealBall.dyadic_endpoints(
                lower_mantissa,
                lower_exponent,
                upper_mantissa,
                upper_exponent,
                precision_bits=int(precision_bits),
                rigorous=True,
                source="FLINT qqbar/Arb outward dyadic logarithmic embedding",
            )
        )
    return tuple(answer)


class FactoredLogarithmWorkspace:
    """Bound one field's reusable rigorous logarithms of canonical factors."""

    def __init__(self, field: Any, *, maximum_entries: int = 512) -> None:
        if (
            isinstance(maximum_entries, bool)
            or not isinstance(maximum_entries, int)
            or maximum_entries < 1
            or maximum_entries > 4096
        ):
            raise ValueError("factor-logarithm cache size must be in 1..4096")
        self._field = field
        self._maximum_entries = maximum_entries
        self._cache: dict[
            tuple[int, int, tuple[tuple[int, int], ...]], tuple[Any, ...]
        ] = {}
        self._requests = 0
        self._hits = 0
        self._evictions = 0

    def factor_logarithms(
        self,
        field: Any,
        factor: Any,
        precision: int,
        data: Any,
        analytic_module: Any,
        *,
        maximum_places: int | None = None,
    ) -> tuple[Any, ...]:
        if field is not self._field:
            raise TypeError("a factor-logarithm workspace belongs to another field")
        self._requests += 1
        selected_factor = field(factor)
        if maximum_places is not None and (
            isinstance(maximum_places, bool) or not isinstance(maximum_places, int)
        ):
            raise TypeError("maximum_places must be an integer")
        place_count = len(data.embeddings) if maximum_places is None else maximum_places
        if place_count < 0 or place_count > len(data.embeddings):
            raise ValueError("maximum_places is outside the embedding range")
        key = (precision, place_count, _element_key(field, selected_factor))
        cached = self._cache.get(key)
        if cached is not None:
            self._hits += 1
            return cached
        answer = _factor_archimedean_logarithms(
            field,
            selected_factor,
            precision,
            data,
            analytic_module,
            maximum_places=place_count,
        )
        if len(self._cache) >= self._maximum_entries:
            self._cache.pop(next(iter(self._cache)))
            self._evictions += 1
        self._cache[key] = answer
        return answer

    def diagnostics(self) -> dict[str, int]:
        return {
            "requests": self._requests,
            "hits": self._hits,
            "entries": len(self._cache),
            "maximum_entries": self._maximum_entries,
            "evictions": self._evictions,
        }


__all__ = [
    "FactoredLogarithmWorkspace",
    "FactoredNumberFieldElement",
    "SERIALIZATION_SCHEMA",
    "field_fingerprint",
]
