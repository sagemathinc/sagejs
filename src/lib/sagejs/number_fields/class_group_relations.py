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
certificate.  Live admission checks the source and principal rows exactly;
the compact serialized record retains their exponent rows, and detached replay
reconstructs source, quotient, and principal ideals and multiplies them
independently.

The bounded short-vector search follows the readable first stage of Hecke's
`Rel_LLL.jl`: reduce a Minkowski-embedded ideal basis, try basis vectors and
their pairwise sums and differences, then use a deterministic bounded
combination stream.  Numerical embeddings select a unimodular transform; that
transform is applied to exact ideal-coordinate rows before any relation is
considered.  Floating-point data therefore never enters a relation record or
its replay.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any, Callable, Iterable

import sagejs as sage
import sagejs.runtime as runtime
from sagejs.number_fields.embeddings import archimedean_data

RELATION_SCHEMA = "sagejs.number-fields/class-relation-v2"
WITNESS_SCHEMA = "sagejs.number-fields/factored-principal-witness-v1"
IDEAL_SCHEMA = "sagejs.number-fields/relation-ideal-v1"
SEARCH_STATE_SCHEMA = "sagejs.number-fields/relation-search-state-v1"
IDEAL_REDUCTION_STATE_SCHEMA = "sagejs.number-fields/ideal-reduction-state-v1"
MINKOWSKI_LATTICE_SCHEMA = "sagejs.number-fields/minkowski-lll-lattice-v1"
AUTOMORPHISM_PLAN_SCHEMA = "sagejs.number-fields/automorphism-orbit-plan-v1"
DEFAULT_RANK_PRIME = 2_147_483_647
DEFAULT_RECONSTRUCTION_ROW_CACHE_SIZE = 512
DEFAULT_FACTOR_POWER_CACHE_SIZE = 512
DEFAULT_ADMISSION_RECEIPT_CACHE_SIZE = 64
_VALIDATED_FACTOR_BASE_TOKEN = object()
_U64_MASK = (1 << 64) - 1
_IDEAL_REDUCTION_STATE_KEYS = {
    "schema",
    "ideal_fingerprint",
    "factor_base_fingerprints",
    "embedding_precision",
    "dimension",
    "radius",
    "cube_index",
    "candidates_tested",
    "content_sha256",
}
MAX_IDEAL_REDUCTION_DIMENSION = 64
MAX_IDEAL_REDUCTION_PRECISION = 4096
MAX_IDEAL_REDUCTION_RADIUS_BITS = 31
MAX_IDEAL_REDUCTION_INTEGER_BITS = 4096
MAX_IDEAL_REDUCTION_WORK_BITS = 1024
MAX_IDEAL_REDUCTION_JSON_NODES = 100_000
MAX_IDEAL_REDUCTION_JSON_CHARACTERS = 1_000_000
MAX_IDEAL_REDUCTION_REPLAY_CANDIDATES = 4096
MAX_IDEAL_REDUCTION_REPLAY_CURSOR_STEPS = 65_536
MAX_FLINT_LLL_DIMENSION = 64
MAX_FLINT_LLL_VALUES = 4096
MAX_FLINT_LLL_ENTRY_BITS = 16_384
MAX_INTEGRAL_RELATION_BATCH_VALUES = 65_536
MAX_INTEGRAL_RELATION_BATCH_PRIME_POWERS = 4096
MAX_INTEGRAL_RELATION_BATCH_INTEGER_BITS = 4096
_lll_kernel_override: Any = None
_integral_relation_batch_kernel_override: Any = None


class RelationNotSmoothError(ArithmeticError):
    """The exact ideal has support outside the supplied factor base."""

    def __init__(self, message: str, *, ideal: Any = None) -> None:
        super().__init__(message)
        self.ideal = ideal


class IdealReductionResourceLimit(RelationNotSmoothError):
    """An explicitly bounded ideal reduction exhausted its candidate budget."""

    def __init__(self, ideal: Any, state: IdealReductionState) -> None:
        super().__init__(
            "bounded ideal reduction exhausted its candidate budget", ideal=ideal
        )
        self.state = state


class IdealReductionCancelled(RuntimeError):
    """A resumable adaptive ideal reduction observed cancellation."""

    def __init__(self, state: IdealReductionState) -> None:
        super().__init__("class/unit computation cancelled")
        self.state = state


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


def _validate_bounded_json(value: Any) -> None:
    """Reject oversized or noncanonical checkpoint component trees pre-hash."""
    remaining = MAX_IDEAL_REDUCTION_JSON_NODES
    remaining_characters = MAX_IDEAL_REDUCTION_JSON_CHARACTERS
    stack = [value]
    while stack:
        remaining -= 1
        if remaining < 0:
            raise ValueError("ideal-reduction checkpoint metadata is too large")
        item = stack.pop()
        if item is None or isinstance(item, bool):
            continue
        if isinstance(item, str):
            remaining_characters -= len(item)
            if remaining_characters < 0:
                raise ValueError("ideal-reduction checkpoint metadata is too large")
            continue
        if isinstance(item, int):
            if abs(item).bit_length() > MAX_IDEAL_REDUCTION_INTEGER_BITS:
                raise ValueError("ideal-reduction checkpoint integer is too large")
            continue
        if isinstance(item, list):
            stack.extend(item)
            continue
        if isinstance(item, dict):
            for key, nested in item.items():
                if not isinstance(key, str):
                    raise TypeError("ideal-reduction checkpoint keys must be strings")
                remaining_characters -= len(key)
                if remaining_characters < 0:
                    raise ValueError("ideal-reduction checkpoint metadata is too large")
                stack.append(nested)
            continue
        raise TypeError("ideal-reduction checkpoint metadata is not exact JSON")


def _checked_bounded_cursor_integer(
    value: Any, name: str, *, positive: bool = False
) -> int:
    answer = _checked_integer(value, name)
    if answer < 1 if positive else answer < 0:
        qualifier = "positive" if positive else "nonnegative"
        raise ValueError(name + " must be " + qualifier)
    if abs(answer).bit_length() > MAX_IDEAL_REDUCTION_INTEGER_BITS:
        raise ValueError(name + " exceeds the checkpoint integer limit")
    return answer


def _count_inner_cube_prefix(side: int, dimension: int, limit: int) -> int:
    """Count base-`side` vectors below `limit` with every digit interior."""
    digits = [0] * dimension
    cursor = limit
    for index in range(dimension):
        digits[index] = cursor % side
        cursor //= side
    allowed = side - 2
    answer = 0
    for position in range(dimension - 1, -1, -1):
        digit = digits[position]
        smaller_allowed = min(max(digit - 1, 0), allowed)
        answer += smaller_allowed * allowed**position
        if digit < 1 or digit > side - 2:
            break
    return answer


def _expected_reduction_candidates(radius: int, cube_index: int, dimension: int) -> int:
    inner_side = 2 * radius - 1
    completed = inner_side**dimension - 1
    current_shell = cube_index - _count_inner_cube_prefix(
        2 * radius + 1, dimension, cube_index
    )
    return completed + current_shell


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
        field = value.parent()
        element = field(value)
        if element.is_zero():
            raise ValueError("zero cannot occur in a principal witness")
        # A single exponent-one element is already a canonical factorization.
        # Avoid the generic combine-by-JSON and sorting path used for arbitrary
        # factor lists while retaining the identical canonical element payload.
        answer = cls(field, ())
        answer._factors = [[element, 1, _element_payload(field, element)]]
        return answer

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
        answer = None
        for element, exponent, _payload in self._factors:
            base = order.ideal(element)
            power = base if exponent == 1 else base**exponent
            answer = power if answer is None else answer * power
        return order.ideal(1) if answer is None else answer

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
    answer = None
    for prime_ideal, exponent in zip(factors, exponents, strict=False):
        if exponent:
            power = (
                prime_ideal if exponent == 1 else _ideal_power(prime_ideal, exponent)
            )
            answer = power if answer is None else answer * power
    return order.ideal(1) if answer is None else answer


class FactorBaseIdealReconstructor:
    """Reconstruct ideals with bounded collector-local row and power caches.

    The order and factor-base tuple are immutable for the lifetime of a
    relation collector.  Reusing their exact ideal products avoids rebuilding
    the same source and quotient ideals for adjacent candidates.  The cache is
    only a construction accelerator: callers retain every final exact ideal
    equality that authenticates a relation.
    """

    def __init__(
        self,
        order: Any,
        factor_base: Iterable[Any],
        *,
        max_rows: int = DEFAULT_RECONSTRUCTION_ROW_CACHE_SIZE,
        max_powers: int = DEFAULT_FACTOR_POWER_CACHE_SIZE,
        _validated_token: Any = None,
    ) -> None:
        self.order = order
        self.factor_base = (
            tuple(factor_base)
            if _validated_token is _VALIDATED_FACTOR_BASE_TOKEN
            else _validate_factor_base(order, factor_base)
        )
        self.max_rows = _checked_nonnegative(max_rows, "reconstruction row cache size")
        self.max_powers = _checked_nonnegative(max_powers, "factor-power cache size")
        self._rows: dict[tuple[int, ...], Any] = {}
        self._powers: dict[tuple[int, int], Any] = {}
        self._statistics = {
            "row_requests": 0,
            "row_hits": 0,
            "row_misses": 0,
            "row_evictions": 0,
            "power_requests": 0,
            "power_hits": 0,
            "power_misses": 0,
            "power_evictions": 0,
        }
        if self.max_rows:
            self._rows[(0,) * len(self.factor_base)] = self.order.ideal(1)

    @staticmethod
    def _retain(cache: dict[Any, Any], key: Any, value: Any, limit: int) -> bool:
        if limit == 0:
            return False
        if len(cache) >= limit:
            oldest = next(iter(cache))
            cache.pop(oldest)
        cache[key] = value
        return True

    def reconstruct(self, row: Iterable[int]) -> Any:
        exponents = tuple(int(value) for value in row)
        if len(exponents) != len(self.factor_base):
            raise ValueError("a relation row has the wrong factor-base width")
        self._statistics["row_requests"] += 1
        cached = self._rows.get(exponents)
        if cached is not None:
            self._statistics["row_hits"] += 1
            return cached
        self._statistics["row_misses"] += 1
        answer = None
        for index, (prime_ideal, exponent) in enumerate(
            zip(self.factor_base, exponents, strict=True)
        ):
            if not exponent:
                continue
            self._statistics["power_requests"] += 1
            key = (index, exponent)
            power = self._powers.get(key)
            if power is None:
                self._statistics["power_misses"] += 1
                power = (
                    prime_ideal
                    if exponent == 1
                    else _ideal_power(prime_ideal, exponent)
                )
                evicted = self.max_powers > 0 and len(self._powers) >= self.max_powers
                if self._retain(self._powers, key, power, self.max_powers) and evicted:
                    self._statistics["power_evictions"] += 1
            else:
                self._statistics["power_hits"] += 1
            answer = power if answer is None else answer * power
        if answer is None:
            answer = self.order.ideal(1)
        evicted = self.max_rows > 0 and len(self._rows) >= self.max_rows
        if self._retain(self._rows, exponents, answer, self.max_rows) and evicted:
            self._statistics["row_evictions"] += 1
        return answer

    def diagnostics(self) -> dict[str, int]:
        """Return deterministic cache bounds, occupancy, and hit counters."""
        return {
            **self._statistics,
            "row_entries": len(self._rows),
            "power_entries": len(self._powers),
            "max_row_entries": self.max_rows,
            "max_power_entries": self.max_powers,
            "retained_ideal_objects": len(self._rows) + len(self._powers),
            "max_retained_ideal_objects": self.max_rows + self.max_powers,
        }


def _relation_reconstructor(
    order: Any, factors: tuple[Any, ...], reconstructor: Any
) -> Callable[[Iterable[int]], Any]:
    if reconstructor is None:

        def reconstruct(row: Iterable[int]) -> Any:
            return reconstruct_factor_base_ideal(order, factors, row)

        return reconstruct
    for name in ("reconstruct_factor_base_ideal", "reconstruct"):
        method = getattr(reconstructor, name, None)
        if callable(method):
            return method
    if callable(reconstructor):
        return reconstructor
    raise TypeError("relation reconstructor must be callable or expose reconstruct")


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
    row, _norm = _factor_witness_over_base_and_norm(witness, factor_base)
    return row


def _factor_witness_over_base_and_norm(
    witness: FactoredPrincipalWitness, factor_base: Iterable[Any]
) -> tuple[tuple[int, ...], Any]:
    """Return exact factor-base valuations and the shared witness norm."""
    factors = tuple(factor_base)
    if not factors:
        return (), sage.QQ(witness.norm())
    ideal_module = __import__(
        "sagejs.number_fields.ideal_arithmetic", fromlist=["ideal_arithmetic"]
    )
    row = [0 for _prime in factors]
    norm = sage.QQ(1)
    for element, exponent in witness.factors():
        valuations, element_norm = ideal_module.element_valuations_with_norm(
            element, factors
        )
        for index, valuation in enumerate(valuations):
            row[index] += int(exponent) * int(valuation)
        norm *= sage.QQ(element_norm) ** int(exponent)
    return tuple(row), norm


def _factor_base_row_norm(factor_base: Iterable[Any], row: Iterable[int]) -> Any:
    answer = sage.QQ(1)
    for prime_ideal, exponent in zip(factor_base, row, strict=True):
        if exponent:
            answer *= prime_ideal.norm() ** int(exponent)
    return answer


def _factor_base_row_norm_from_norms(
    factor_base_norms: Iterable[Any], row: Iterable[int]
) -> Any:
    answer = sage.QQ(1)
    for norm, exponent in zip(factor_base_norms, row, strict=True):
        if exponent:
            answer *= sage.QQ(norm) ** int(exponent)
    return answer


def _factor_positive_integer(value: int) -> list[list[int]]:
    if value < 1:
        raise ValueError("a norm numerator or denominator must be positive")
    if value == 1:
        return []
    return [[int(prime), int(exponent)] for prime, exponent in sage.factor(value)]


def _norm_smoothness(
    principal_norm: Any,
    row: tuple[int, ...],
    factor_base: tuple[Any, ...],
) -> dict[str, Any]:
    principal_pair = _rational_pair(principal_norm)
    numerator = abs(principal_pair[0])
    denominator = principal_pair[1]
    return {
        "principal_norm": principal_pair,
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


def _norm_smoothness_from_norms(
    principal_norm: Any,
    row: tuple[int, ...],
    factor_base_norms: tuple[Any, ...],
) -> dict[str, Any]:
    principal_pair = _rational_pair(principal_norm)
    numerator = abs(principal_pair[0])
    denominator = principal_pair[1]
    return {
        "principal_norm": principal_pair,
        "principal_norm_factorization": {
            "numerator": _factor_positive_integer(numerator),
            "denominator": _factor_positive_integer(denominator),
        },
        "factor_base_norms": [
            {
                "index": index,
                "exponent": exponent,
                "norm": _rational_pair(factor_base_norms[index]),
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
        norm_smoothness: dict[str, Any],
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
        self.norm_smoothness = _json_value(norm_smoothness)
        self.archimedean_logs = tuple(_json_value(value) for value in archimedean_logs)
        self.log_precision = _checked_nonnegative(log_precision, "log precision")
        self.provenance = _json_value({} if provenance is None else provenance)
        self._principal_ideal_cache: list[tuple[Any, str, Any]] = []

    def _principal_from_witness(self, order: Any) -> Any:
        """Replay the witness ideal with bounded live-record memoization."""
        witness_key = json.dumps(self.witness, sort_keys=True, separators=(",", ":"))
        for cached_order, cached_key, cached_ideal in self._principal_ideal_cache:
            if cached_order is order and cached_key == witness_key:
                return cached_ideal
        witness = FactoredPrincipalWitness.from_dict(order.number_field(), self.witness)
        principal = witness.principal_ideal(order)
        if len(self._principal_ideal_cache) >= 2:
            self._principal_ideal_cache.pop(0)
        self._principal_ideal_cache.append((order, witness_key, principal))
        return principal

    def _remember_principal_ideal(self, order: Any, principal: Any) -> None:
        """Seed a live record with the exact ideal checked during admission."""
        witness_key = json.dumps(self.witness, sort_keys=True, separators=(",", ":"))
        if len(self._principal_ideal_cache) >= 2:
            self._principal_ideal_cache.pop(0)
        self._principal_ideal_cache.append((order, witness_key, principal))

    def sparse_row(self) -> tuple[tuple[int, int], ...]:
        """Return zero-based `(factor_base_index, exponent)` entries."""
        return tuple((index, value) for index, value in enumerate(self.row) if value)

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": RELATION_SCHEMA,
            "row": list(self.row),
            "quotient_row": list(self.quotient_row),
            "source_row": list(self.source_row),
            "witness": self.witness,
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
        if not isinstance(payload, dict) or payload.get("schema") != RELATION_SCHEMA:
            raise ValueError("unsupported class-relation schema")
        expected = {
            "schema",
            "row",
            "quotient_row",
            "source_row",
            "witness",
            "norm_smoothness",
            "archimedean",
            "provenance",
        }
        if set(payload) != expected:
            raise ValueError("class-relation evidence has unexpected fields")
        archimedean = payload.get("archimedean")
        if not isinstance(archimedean, dict):
            raise TypeError("relation archimedean evidence must be a dictionary")
        if set(archimedean) != {
            "precision",
            "logs",
            "complex_place_convention",
        } or archimedean.get("complex_place_convention") != (
            "one-place-log-absolute-value-times-two"
        ):
            raise ValueError("unknown relation archimedean convention")
        answer = cls(
            row=payload["row"],
            quotient_row=payload["quotient_row"],
            source_row=payload["source_row"],
            witness=payload["witness"],
            norm_smoothness=payload["norm_smoothness"],
            archimedean_logs=archimedean["logs"],
            log_precision=archimedean["precision"],
            provenance=payload["provenance"],
        )
        if answer.to_dict() != payload:
            raise ValueError("class-relation evidence is not canonical")
        return answer

    def verify(
        self,
        order: Any,
        factor_base: Iterable[Any],
        *,
        reconstructor: Any = None,
        admission_verifier: Any = None,
    ) -> dict[str, Any]:
        """Verify exactly, optionally reusing a live row-to-ideal cache.

        Detached verification deliberately uses the independent cold
        reconstruction path.  A live engine may inject a duck-typed callable
        or object exposing `reconstruct(row)`; every reconstructed ideal still
        participates in the same exact equality checks.
        """
        return verify_relation_record(
            order,
            factor_base,
            self,
            reconstructor=reconstructor,
            admission_verifier=admission_verifier,
        )

    def replay(self, order: Any, factor_base: Iterable[Any]) -> dict[str, Any]:
        factors = tuple(factor_base)
        reconstructor = FactorBaseIdealReconstructor(order, factors)
        verification = verify_relation_record(
            order, factors, self, reconstructor=reconstructor
        )
        if verification["certified"] is not True:
            raise ArithmeticError(
                "relation replay failed: " + "; ".join(verification["failures"])
            )
        principal = self._principal_from_witness(order)
        return {
            "certified": True,
            "row": self.row,
            "sparse_row": self.sparse_row(),
            "witness": FactoredPrincipalWitness.from_dict(
                order.number_field(), self.witness
            ),
            "principal_ideal": principal,
            "source_ideal": reconstructor.reconstruct(self.source_row),
            "smooth_quotient": reconstructor.reconstruct(self.quotient_row),
            "reconstructed": reconstructor.reconstruct(self.row),
        }

    def canonical_key(self) -> str:
        return json.dumps(self.to_dict(), sort_keys=True, separators=(",", ":"))


def verify_relation_record(
    order: Any,
    factor_base: Iterable[Any],
    record: RelationRecord | dict[str, Any],
    *,
    reconstructor: Any = None,
    admission_verifier: Any = None,
) -> dict[str, Any]:
    failures: list[str] = []
    try:
        relation = (
            record
            if isinstance(record, RelationRecord)
            else RelationRecord.from_dict(record)
        )
        factors = _validate_factor_base(order, factor_base)
        verify_admission = getattr(admission_verifier, "verify_admission_receipt", None)
        if callable(verify_admission) and bool(
            verify_admission(order, factors, relation)
        ):
            return {"certified": True, "failures": []}
        reconstruct = _relation_reconstructor(order, factors, reconstructor)
        if len(relation.row) != len(factors):
            failures.append("relation row width mismatch")
        if relation.row != tuple(
            source + quotient
            for source, quotient in zip(
                relation.source_row, relation.quotient_row, strict=False
            )
        ):
            failures.append("principal row is not source_row + quotient_row")

        principal = relation._principal_from_witness(order)
        reconstructed_source = reconstruct(relation.source_row)
        reconstructed_quotient = reconstruct(relation.quotient_row)
        reconstructed_principal = reconstruct(relation.row)
        if principal != reconstructed_source * reconstructed_quotient:
            failures.append("principal ideal is not source times smooth quotient")
        if principal != reconstructed_principal:
            failures.append("principal ideal does not match the matrix row")
        expected_norms = _norm_smoothness(
            abs(sage.QQ(principal.norm())),
            relation.row,
            factors,
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
        max_reconstructed_ideals: int = DEFAULT_RECONSTRUCTION_ROW_CACHE_SIZE,
        max_factor_powers: int = DEFAULT_FACTOR_POWER_CACHE_SIZE,
        max_admission_receipts: int = DEFAULT_ADMISSION_RECEIPT_CACHE_SIZE,
    ) -> None:
        self.order = order
        self.factor_base = _validate_factor_base(order, factor_base)
        self._factor_base_norms = tuple(
            sage.QQ(prime_ideal.norm()) for prime_ideal in self.factor_base
        )
        self._reconstructor = FactorBaseIdealReconstructor(
            order,
            self.factor_base,
            max_rows=max_reconstructed_ideals,
            max_powers=max_factor_powers,
            _validated_token=_VALIDATED_FACTOR_BASE_TOKEN,
        )
        self.rank_screen = ModularRankScreen(len(self.factor_base), rank_prime)
        self.records: list[RelationRecord] = []
        self.admissions: list[RelationAdmission] = []
        self.context = context
        self._order_basis: tuple[Any, ...] | None = None
        self._keys: set[str] = set()
        self.max_admission_receipts = _checked_nonnegative(
            max_admission_receipts, "admission receipt cache size"
        )
        self._admission_receipts: dict[str, None] = {}
        self._admission_receipt_statistics = {
            "requests": 0,
            "hits": 0,
            "misses": 0,
            "evictions": 0,
            "integral_norm_certificates": 0,
            "integral_norm_fallbacks": 0,
            "integral_batch_calls": 0,
            "integral_batch_rows": 0,
            "integral_batch_fallbacks": 0,
        }

    @staticmethod
    def _admission_receipt_key(
        relation: RelationRecord, canonical_key: str | None = None
    ) -> str:
        payload = relation.canonical_key() if canonical_key is None else canonical_key
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def _remember_admission_receipt(
        self, relation: RelationRecord, *, canonical_key: str | None = None
    ) -> None:
        if self.max_admission_receipts == 0:
            return
        key = self._admission_receipt_key(relation, canonical_key)
        if key in self._admission_receipts:
            return
        if len(self._admission_receipts) >= self.max_admission_receipts:
            oldest = next(iter(self._admission_receipts))
            self._admission_receipts.pop(oldest)
            self._admission_receipt_statistics["evictions"] += 1
        self._admission_receipts[key] = None

    def verify_admission_receipt(
        self,
        order: Any,
        factor_base: Iterable[Any],
        relation: RelationRecord,
    ) -> bool:
        """Recognize one unchanged relation checked by this live collector."""
        self._admission_receipt_statistics["requests"] += 1
        factors = tuple(factor_base)
        identities_match = order is self.order and len(factors) == len(self.factor_base)
        if identities_match:
            identities_match = all(
                supplied is retained
                for supplied, retained in zip(factors, self.factor_base, strict=True)
            )
        key = self._admission_receipt_key(relation)
        if identities_match and key in self._admission_receipts:
            self._admission_receipt_statistics["hits"] += 1
            return True
        self._admission_receipt_statistics["misses"] += 1
        return False

    def admission_receipt_diagnostics(self) -> dict[str, int]:
        """Return fixed-capacity live admission-receipt statistics."""
        return {
            **self._admission_receipt_statistics,
            "entries": len(self._admission_receipts),
            "max_entries": self.max_admission_receipts,
        }

    def reconstruct_factor_base_ideal(self, row: Iterable[int]) -> Any:
        """Reconstruct one row through this collector's bounded exact cache."""
        return self._reconstructor.reconstruct(row)

    def reconstruction_diagnostics(self) -> dict[str, int]:
        """Return bounded-cache occupancy and reuse counters."""
        return self._reconstructor.diagnostics()

    def _factor_ideal_over_base(self, ideal: Any) -> tuple[int, ...]:
        row = tuple(int(ideal.valuation(prime)) for prime in self.factor_base)
        if self.reconstruct_factor_base_ideal(row) != ideal:
            raise RelationNotSmoothError(
                "the ideal has support outside the supplied factor base", ideal=ideal
            )
        return row

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
        self._remember_admission_receipt(relation, canonical_key=key)
        return admission

    def admit_witness(
        self,
        witness: Any,
        *,
        source_ideal: Any = None,
        source_row: Iterable[int] | None = None,
        principal_row: Iterable[int] | None = None,
        integral_generator: Any = None,
        archimedean_logs: Iterable[Any] = (),
        log_precision: int = 0,
        provenance: dict[str, Any] | None = None,
    ) -> RelationAdmission:
        """Admit one exact principal relation.

        `integral_generator` enables a producer-only theorem for the common
        short-element path.  When it is the single exponent-one witness,
        belongs to the order, has an integral source, and every source,
        principal, and quotient valuation is nonnegative, exact norm equality
        proves that no omitted prime ideal divides its principal ideal.
        Detached replay deliberately retains the full independent ideal
        reconstruction.
        """
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
            computed_source_row = self._factor_ideal_over_base(source)
        else:
            computed_source_row = tuple(int(value) for value in source_row)
            if self.reconstruct_factor_base_ideal(computed_source_row) != source:
                raise ArithmeticError(
                    "the supplied source row does not reconstruct its ideal"
                )
        if principal_row is None:
            row, witness_norm = _factor_witness_over_base_and_norm(
                factored, self.factor_base
            )
        else:
            row = tuple(
                _checked_integer(value, "a sieved relation exponent")
                for value in principal_row
            )
            witness_norm = sage.QQ(factored.norm())
        if len(row) != len(self.factor_base):
            raise ValueError("the supplied principal row has the wrong width")
        if witness_norm < 0:
            witness_norm = -witness_norm
        if (
            _factor_base_row_norm_from_norms(self._factor_base_norms, row)
            != witness_norm
        ):
            raise RelationNotSmoothError(
                "the principal witness norm has support outside the factor base"
            )
        quotient_row = tuple(
            total - source_exponent
            for total, source_exponent in zip(row, computed_source_row, strict=False)
        )
        integral_norm_certificate = False
        if integral_generator is not None:
            generator = self.order.number_field()(integral_generator)
            witness_factors = factored.factors()
            if (
                len(witness_factors) != 1
                or witness_factors[0][1] != 1
                or witness_factors[0][0] != generator
            ):
                raise ValueError(
                    "an integral relation generator must be the exact single witness"
                )
            integral_norm_certificate = bool(
                source.is_integral()
                and generator in self.order
                and all(value >= 0 for value in computed_source_row)
                and all(value >= 0 for value in row)
                and all(value >= 0 for value in quotient_row)
            )
        principal = None
        if integral_norm_certificate:
            self._admission_receipt_statistics["integral_norm_certificates"] += 1
        else:
            if integral_generator is not None:
                self._admission_receipt_statistics["integral_norm_fallbacks"] += 1
            principal = factored.principal_ideal(self.order)
            reconstructed_principal = self.reconstruct_factor_base_ideal(row)
            if reconstructed_principal != principal:
                raise RelationNotSmoothError(
                    "the principal witness has support outside the supplied factor base",
                    ideal=principal,
                )
        # The compact producer record retains exponent rows instead of three
        # duplicate ideal lattices.  Detached replay reconstructs source,
        # quotient, and principal ideals and checks their product independently.
        record = RelationRecord(
            row=row,
            quotient_row=quotient_row,
            source_row=computed_source_row,
            witness=factored.to_dict(),
            norm_smoothness=_norm_smoothness_from_norms(
                witness_norm,
                row,
                self._factor_base_norms,
            ),
            archimedean_logs=archimedean_logs,
            log_precision=log_precision,
            provenance=provenance,
        )
        if principal is not None:
            record._remember_principal_ideal(self.order, principal)
        # Everything used to construct this record was checked above with
        # exact ideal equality.  Avoid the public deserialization replay here:
        # it would refactor the same source, quotient, and principal ideals a
        # second time.  `add_relation` and `RelationRecord.verify` retain that
        # full replay for external or restored records.
        return self._store_verified(record)

    def admit_integral_generator_row(
        self,
        generator: Any,
        principal_row: Iterable[int],
        *,
        provenance: dict[str, Any] | None = None,
    ) -> RelationAdmission:
        """Admit a proposed integral row after exact containment and norm replay.

        This is the batch-sieve boundary.  A packed producer may propose the
        factor-base row of an algebraic integer, but it is not trusted as a
        certificate.  In a maximal order, independently check membership in
        every required prime power and exact equality between the row norm
        and `|Norm(generator)|`.  The proposed valuations are therefore lower
        bounds for the principal ideal valuations, and norm equality rules out
        both higher valuations and omitted prime factors.  For a nonmaximal
        order, retain the general reconstructed-ideal check.  Detached replay
        remains unchanged and rebuilds the complete principal ideal again.
        """
        return self._admit_integral_generator_row(
            self.order.number_field()(generator),
            principal_row,
            provenance=provenance,
            known_order_element=False,
        )

    def admit_integral_order_basis_row(
        self,
        coordinates: Iterable[int],
        principal_row: Iterable[int],
        *,
        provenance: dict[str, Any] | None = None,
    ) -> RelationAdmission:
        """Admit an integral generator constructed from exact order coordinates.

        The coordinate construction itself proves order membership.  Every
        norm, factor-base row, and prime-power containment check remains the
        same as `admit_integral_generator_row`, and detached replay still
        rebuilds the complete principal ideal independently.
        """
        values = tuple(
            _checked_integer(value, "an order-basis coordinate")
            for value in coordinates
        )
        if len(values) != int(self.order.degree()):
            raise ValueError("an integral generator has the wrong coordinate width")
        if self._order_basis is None:
            self._order_basis = tuple(self.order.basis())
        field = self.order.number_field()
        element = field(0)
        for coefficient, basis_element in zip(values, self._order_basis, strict=True):
            element += coefficient * basis_element
        return self._admit_integral_generator_row(
            element,
            principal_row,
            provenance=provenance,
            known_order_element=True,
        )

    def admit_integral_order_basis_rows(
        self,
        proposals: Iterable[tuple[Iterable[int], Iterable[int], dict[str, Any] | None]],
    ) -> tuple[RelationAdmission, ...] | None:
        """Independently replay and admit a prevalidated packed integral batch.

        Each proposal contains order-basis coordinates, a nonnegative
        factor-base row, and optional provenance.  Exact element norms are
        recomputed here.  One canonical packed lattice pass then checks every
        prime-power containment and reconstructs every valuation row.  The
        packed proposal producer is therefore not trusted, while avoiding a
        separate ideal-membership call for every nonzero valuation.  Returning
        `None` means the source-transparent kernel is unavailable and callers
        should use `admit_integral_order_basis_row` unchanged.
        """
        raw_proposals = tuple(proposals)
        if not raw_proposals:
            return ()
        self._admission_receipt_statistics["integral_batch_calls"] += 1
        degree = int(self.order.degree())
        count = len(raw_proposals)
        width = len(self.factor_base)
        if (
            degree < 1
            or degree > 16
            or count > 4096
            or width < 1
            or width > 4096
            or count * width > MAX_INTEGRAL_RELATION_BATCH_VALUES
            or not self.order.is_maximal()
        ):
            self._admission_receipt_statistics["integral_batch_fallbacks"] += 1
            return None
        if _integral_relation_batch_kernel_override is False:
            self._admission_receipt_statistics["integral_batch_fallbacks"] += 1
            return None
        try:
            kernel_module = __import__(
                "sagejs.number_fields.bl_composite_kernel",
                fromlist=["bl_composite_kernel"],
            )
            row_kernel = getattr(
                kernel_module, "packed_factor_base_rows_in_place", None
            )
            native_module = __import__("sagejs.native", fromlist=["native"])
            ideal_module = __import__(
                "sagejs.number_fields.ideal_arithmetic",
                fromlist=["ideal_arithmetic"],
            )
        except (AttributeError, ImportError):
            self._admission_receipt_statistics["integral_batch_fallbacks"] += 1
            return None
        if callable(_integral_relation_batch_kernel_override):
            row_kernel = _integral_relation_batch_kernel_override
        if not callable(row_kernel):
            self._admission_receipt_statistics["integral_batch_fallbacks"] += 1
            return None
        if self._order_basis is None:
            self._order_basis = tuple(self.order.basis())
        field = self.order.number_field()
        normalized: list[
            tuple[tuple[int, ...], tuple[int, ...], dict[str, Any] | None, Any, Any]
        ] = []
        maxima = [0] * width
        for coordinates, principal_row, provenance in raw_proposals:
            values = tuple(
                _checked_integer(value, "an order-basis coordinate")
                for value in coordinates
            )
            if len(values) != degree:
                raise ValueError("an integral generator has the wrong coordinate width")
            if any(
                abs(value).bit_length() > MAX_INTEGRAL_RELATION_BATCH_INTEGER_BITS
                for value in values
            ):
                raise ValueError("an integral generator coordinate is too large")
            row = tuple(int(value) for value in principal_row)
            if len(row) != width or any(value < 0 for value in row):
                raise ValueError(
                    "a sieved integral relation row must be nonnegative and have factor-base width"
                )
            if any(value > MAX_INTEGRAL_RELATION_BATCH_PRIME_POWERS for value in row):
                raise ValueError("a sieved integral relation exponent is too large")
            element = field(0)
            for coefficient, basis_element in zip(
                values, self._order_basis, strict=True
            ):
                element += coefficient * basis_element
            if element.is_zero():
                raise ValueError("a sieved relation generator must be nonzero")
            witness_norm = sage.QQ(element.norm())
            if witness_norm < 0:
                witness_norm = -witness_norm
            if witness_norm <= 1:
                raise ValueError("a sieved class relation must have nonunit norm")
            if (
                _factor_base_row_norm_from_norms(self._factor_base_norms, row)
                != witness_norm
            ):
                raise RelationNotSmoothError(
                    "the sieved relation norm has support outside the factor base"
                )
            for index, exponent in enumerate(row):
                maxima[index] = max(maxima[index], exponent)
            normalized.append((values, row, provenance, element, witness_norm))

        if sum(maxima) > MAX_INTEGRAL_RELATION_BATCH_PRIME_POWERS:
            raise ValueError(
                "a packed integral relation batch has too many prime powers"
            )

        offsets = [0]
        prime_power_numerators: list[int] = []
        prime_power_denominators: list[int] = []
        for prime_ideal, maximum in zip(self.factor_base, maxima, strict=True):
            powers = prime_ideal._valuation_power_cache
            while len(powers) < maximum:
                powers.append(powers[-1] * prime_ideal)
            for index in range(maximum):
                packed_basis, denominator = ideal_module._packed_ideal_basis(
                    powers[index]
                )
                prime_power_numerators.extend(packed_basis)
                prime_power_denominators.append(int(denominator))
            offsets.append(len(prime_power_denominators))
        if not prime_power_denominators:
            raise RelationNotSmoothError("a sieved relation row has no prime support")
        order_basis_numerators, order_basis_denominator = (
            ideal_module._packed_ideal_basis(self.order.ideal(1))
        )
        factor_norms = []
        for norm in self._factor_base_norms:
            if int(norm._denominator) != 1:
                raise ArithmeticError("a factor-base norm is not integral")
            factor_norms.append(int(norm._numerator))
        absolute_norms = []
        for _values, _row, _provenance, _element, norm in normalized:
            if int(norm._denominator) != 1:
                raise ArithmeticError("an integral element norm is not integral")
            absolute_norms.append(int(norm._numerator))
        metadata = native_module.kernel_integer_zeros(row_kernel, 3, 1)
        row_output = native_module.kernel_integer_zeros(row_kernel, count * width, 16)
        smooth_output = native_module.kernel_integer_zeros(row_kernel, count, 1)
        if not row_kernel(
            metadata,
            row_output,
            smooth_output,
            native_module.kernel_integer_zeros(row_kernel, 2 * degree, 16),
            native_module.kernel_integer_buffer(
                row_kernel,
                [value for proposal in normalized for value in proposal[0]],
            ),
            native_module.kernel_integer_buffer(row_kernel, absolute_norms),
            native_module.kernel_integer_buffer(row_kernel, order_basis_numerators),
            native_module.kernel_integer_buffer(row_kernel, prime_power_numerators),
            native_module.kernel_integer_buffer(row_kernel, prime_power_denominators),
            native_module.kernel_integer_buffer(row_kernel, offsets),
            native_module.kernel_integer_buffer(row_kernel, factor_norms),
            int(order_basis_denominator),
            degree,
            count,
            width,
            len(prime_power_denominators),
        ):
            self._admission_receipt_statistics["integral_batch_fallbacks"] += 1
            return None
        metadata_values = tuple(
            int(value) for value in native_module.integer_buffer_values(metadata)
        )
        row_values = tuple(
            int(value) for value in native_module.integer_buffer_values(row_output)
        )
        smooth_values = tuple(
            int(value) for value in native_module.integer_buffer_values(smooth_output)
        )
        if metadata_values != (count, count, len(prime_power_denominators)):
            raise RelationNotSmoothError(
                "packed relation replay did not certify every proposed row"
            )
        for index, (_values, row, _provenance, _element, _norm) in enumerate(
            normalized
        ):
            start = index * width
            if smooth_values[index] != 1 or row_values[start : start + width] != row:
                raise RelationNotSmoothError(
                    "packed relation replay disagrees with a proposed valuation row"
                )

        records = tuple(
            self._integral_generator_record(element, row, norm, provenance)
            for _values, row, provenance, element, norm in normalized
        )
        new_keys: dict[str, bool] = {}
        for record in records:
            key = record.canonical_key()
            if key in self._keys or new_keys.get(key, False):
                raise ValueError("the exact relation record was already admitted")
            new_keys[key] = True
        admissions = tuple(self._store_verified(record) for record in records)
        self._admission_receipt_statistics["integral_norm_certificates"] += len(
            admissions
        )
        self._admission_receipt_statistics["integral_batch_rows"] += len(admissions)
        return admissions

    def _integral_generator_record(
        self,
        element: Any,
        row: tuple[int, ...],
        witness_norm: Any,
        provenance: dict[str, Any] | None,
    ) -> RelationRecord:
        """Construct the compact record after exact integral-row validation."""
        factored = FactoredPrincipalWitness.from_element(element)
        zero_row = (0,) * len(row)
        return RelationRecord(
            row=row,
            quotient_row=row,
            source_row=zero_row,
            witness=factored.to_dict(),
            norm_smoothness=_norm_smoothness_from_norms(
                witness_norm,
                row,
                self._factor_base_norms,
            ),
            provenance=provenance,
        )

    def _admit_integral_generator_row(
        self,
        element: Any,
        principal_row: Iterable[int],
        *,
        provenance: dict[str, Any] | None,
        known_order_element: bool,
    ) -> RelationAdmission:
        if element.is_zero() or (not known_order_element and element not in self.order):
            raise ValueError(
                "a sieved relation generator must be a nonzero order element"
            )
        row = tuple(int(value) for value in principal_row)
        if len(row) != len(self.factor_base) or any(value < 0 for value in row):
            raise ValueError(
                "a sieved integral relation row must be nonnegative and have factor-base width"
            )
        witness_norm = sage.QQ(element.norm())
        if witness_norm < 0:
            witness_norm = -witness_norm
        if witness_norm <= 1:
            raise ValueError("a sieved class relation must have nonunit norm")
        row_norm = _factor_base_row_norm_from_norms(self._factor_base_norms, row)
        if row_norm != witness_norm:
            raise RelationNotSmoothError(
                "the sieved relation norm has support outside the factor base"
            )
        reconstructed = None
        if self.order.is_maximal():
            for prime_ideal, exponent in zip(self.factor_base, row, strict=True):
                if exponent == 0:
                    continue
                powers = prime_ideal._valuation_power_cache
                while len(powers) < exponent:
                    powers.append(powers[-1] * prime_ideal)
                if element not in powers[exponent - 1]:
                    raise RelationNotSmoothError(
                        "the sieved relation row has a false prime valuation",
                        ideal=powers[exponent - 1],
                    )
        else:
            reconstructed = self.reconstruct_factor_base_ideal(row)
            if reconstructed.norm() != witness_norm or element not in reconstructed:
                raise RelationNotSmoothError(
                    "the sieved relation row does not contain its generator",
                    ideal=reconstructed,
                )
        record = self._integral_generator_record(element, row, witness_norm, provenance)
        # The exact containment plus equal-norm argument above proves that
        # this retained lattice is precisely the witness principal ideal.
        if reconstructed is not None:
            record._remember_principal_ideal(self.order, reconstructed)
        self._admission_receipt_statistics["integral_norm_certificates"] += 1
        return self._store_verified(record)

    def admit_automorphism_orbit(
        self,
        relation: RelationRecord | RelationAdmission | dict[str, Any],
        *,
        plan: AutomorphismOrbitPlan | None = None,
    ) -> RelationAdmission | None:
        """Admit the exact useful quadratic conjugate of one relation.

        Unsupported fields, incomplete factor-base orbits, and relations fixed
        by conjugation deterministically produce no derived admission.
        """
        orbit = (
            plan_automorphism_orbits(self.order.number_field(), self.factor_base)
            if plan is None
            else plan
        )
        if not orbit.available or not orbit.useful:
            return None
        return orbit.derive(relation, self)


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
        row = [0] * len(collector.factor_base)
        local_degree = 0
        for index, prime_ideal in enumerate(collector.factor_base):
            if int(prime_ideal.rational_prime()) != rational_prime:
                continue
            exponent = int(prime_ideal.ramification_index())
            residue_degree = int(prime_ideal.residue_class_degree())
            row[index] = exponent
            local_degree += exponent * residue_degree
        # The factor base contains distinct, already certified prime ideals.
        # Full local degree is a cheap coverage screen.  Integral admission
        # then checks `p` in every required prime power and equality of the
        # proposed row norm with `|Norm(p)|`; together these prove exact ideal
        # equality without multiplying the same prime powers a second time.
        if local_degree != int(collector.order.number_field().degree()):
            continue
        generator = collector.order.number_field()(rational_prime)
        answer.append(
            collector.admit_integral_generator_row(
                generator,
                row,
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


def _readable_exact_lll_reduce_with_transform(
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
                # Subtracting a multiple of an earlier basis vector leaves
                # this row's orthogonal component and norm unchanged.  Only
                # its Gram--Schmidt coefficients through `previous` change:
                # later coefficients are against vectors orthogonal to the
                # subtracted row.  Updating those exact rationals avoids a
                # complete Gram--Schmidt replay after every size reduction.
                for earlier in range(previous):
                    mu[index][earlier] -= multiple * mu[previous][earlier]
                mu[index][previous] -= multiple
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


def _flint_lll_reduce_with_transform(
    basis: list[list[int]],
) -> tuple[list[list[int]], list[list[int]]] | None:
    """Return an exactly authenticated FLINT LLL transform when available."""
    row_count = len(basis)
    column_count = len(basis[0]) if basis else 0
    if (
        row_count == 0
        or row_count > MAX_FLINT_LLL_DIMENSION
        or column_count < row_count
        or row_count * column_count > MAX_FLINT_LLL_VALUES
        or any(len(row) != column_count for row in basis)
    ):
        return None
    maximum_bits = max(abs(value).bit_length() for row in basis for value in row)
    if maximum_bits > MAX_FLINT_LLL_ENTRY_BITS:
        return None
    try:
        kernel_module = __import__(
            "sagejs.kernels.matrix.dense_integer_flint",
            fromlist=["dense_integer_flint"],
        )
        native_module = __import__("sagejs.native", fromlist=["native"])
        kernel = (
            kernel_module.flint_dense_integer_matrix_lll_transform
            if _lll_kernel_override is None
            else _lll_kernel_override
        )
        if kernel is False or not native_module.is_compiled(kernel):
            return None
        flattened = [value for row in basis for value in row]
        source = native_module.kernel_integer_buffer(kernel, flattened)
        word_capacity = max(8, (maximum_bits + 2 * row_count + 255) // 64)
        output = native_module.kernel_integer_zeros(
            kernel, row_count * column_count, word_capacity
        )
        transform_output = native_module.kernel_integer_zeros(
            kernel, row_count * row_count, word_capacity
        )
        if not kernel(
            output,
            transform_output,
            source,
            row_count,
            column_count,
        ):
            return None
        output_values = [
            int(value) for value in native_module.integer_buffer_values(output)
        ]
        transform_values = [
            int(value)
            for value in native_module.integer_buffer_values(transform_output)
        ]
        reduced = [
            output_values[index * column_count : (index + 1) * column_count]
            for index in range(row_count)
        ]
        transform = [
            transform_values[index * row_count : (index + 1) * row_count]
            for index in range(row_count)
        ]
        if (
            abs(_integer_determinant(transform)) != 1
            or _matrix_times_rows(transform, basis) != reduced
        ):
            return None
        return reduced, transform
    except (
        ImportError,
        AttributeError,
        OverflowError,
        RuntimeError,
        TypeError,
        ValueError,
        ArithmeticError,
    ):
        return None


def _exact_lll_reduce_with_transform(
    rows: Iterable[Iterable[int]],
) -> tuple[list[list[int]], list[list[int]]]:
    """Return an exact 3/4-LLL basis and its unimodular row transform."""
    basis = [[int(value) for value in row] for row in rows]
    accelerated = _flint_lll_reduce_with_transform(basis)
    if accelerated is not None:
        return accelerated
    return _readable_exact_lll_reduce_with_transform(basis)


def exact_lll_reduce(rows: Iterable[Iterable[int]]) -> list[list[int]]:
    """Return an exact 3/4-LLL basis for an integer row lattice."""
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
    cached_archimedean_data = getattr(field, "archimedean_data", None)
    data: Any = (
        cached_archimedean_data()
        if callable(cached_archimedean_data)
        else archimedean_data(field)
    )
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
    # Approximate each generator image once, then evaluate every ideal-basis
    # row in that numerical parent.  Evaluating an exact QQbar expression and
    # converting it back to the same precision for every row is much more
    # expensive in higher degree.  This matrix is only an LLL candidate
    # selector: the returned unimodular transform is applied to exact ideal
    # coordinates and every resulting relation is replayed algebraically.
    numerical_embeddings: list[tuple[Any, Any, Any]] = []
    for embedding in data.embeddings:
        generator_image = embedding.generator_image.n(precision)
        sqrt_two = None
        if embedding.kind == "complex":
            real_part = generator_image.real()
            sqrt_two = real_part.parent()(sqrt_two_decimal)
        numerical_embeddings.append((embedding, generator_image, sqrt_two))
    rows: list[list[int]] = []
    for element in ideal.basis():
        coefficients = list(element.list())
        row: list[int] = []
        for embedding, generator_image, sqrt_two in numerical_embeddings:
            numerical_parent = generator_image.parent()
            approximation = numerical_parent(0)
            for coefficient in reversed(coefficients):
                approximation = approximation * generator_image + numerical_parent(
                    coefficient
                )
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
            if sqrt_two is None:
                raise ArithmeticError("a complex embedding lacks its sqrt(2) scale")
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
    # This plan only selects relation candidates: its exact rows are direct
    # integer combinations of the authenticated ideal basis, and every
    # accepted relation is independently reconstructed and compared with its
    # principal ideal.  Avoid replaying the producer-owned transform on every
    # search ideal.  Public callers and tests retain `plan.verify(ideal)` for
    # detached or diagnostic validation.
    return plan


class AutomorphismOrbitPlan:
    """Authenticated quadratic conjugation on one exact factor base.

    A plan is available only when the field is quadratic, conjugation preserves
    the exact maximal order, and every conjugated factor-base prime has one
    unique match in the same factor base.  This deliberately does not infer an
    ideal action from an abstract Galois permutation.
    """

    def __init__(self, field: Any, factor_base: Iterable[Any]) -> None:
        factors = tuple(factor_base)
        self._field = field
        self._factor_base = factors
        self._order = field.maximal_order()
        defining_coefficients = list(field.defining_polynomial().coefficients())
        self._quadratic_linear = None
        if field.degree() == 2:
            self._quadratic_linear = sage.QQ(defining_coefficients[1]) / sage.QQ(
                defining_coefficients[2]
            )
        if any(prime.ring() is not self._order for prime in factors):
            raise TypeError("automorphism factor-base ideals belong to another order")
        self.available = False
        self.useful = False
        self.strategy = "independent-minkowski-relation-search"
        self.factor_base_size = len(factors)
        self.permutation: tuple[int, ...] = ()
        self.factor_base_fingerprints = tuple(
            _prime_fingerprint(prime) for prime in factors
        )
        self.image_fingerprints: tuple[dict[str, Any], ...] = ()
        self.detected = {
            "quadratic_conjugation": field.degree() == 2,
            "field_automorphisms": callable(getattr(field, "automorphisms", None)),
            "ideal_map": callable(getattr(field, "map_ideal_under_automorphism", None)),
            "factor_base_permutation": False,
        }
        self.reason = ""
        if field.degree() != 2:
            self.reason = (
                "no exact generic field self-map API supplies element images, ideal "
                "images, and an authenticated factor-base permutation"
            )
        else:
            conjugated_order = self._conjugate_ideal_unchecked(self._order.ideal(1))
            if conjugated_order != self._order.ideal(1):
                self.reason = "quadratic conjugation does not preserve the exact order"
            else:
                images = tuple(
                    self._conjugate_ideal_unchecked(prime) for prime in factors
                )
                permutation: list[int] = []
                stable = True
                for image in images:
                    matches = [
                        index for index, prime in enumerate(factors) if image == prime
                    ]
                    if len(matches) != 1:
                        stable = False
                        break
                    permutation.append(matches[0])
                if stable and sorted(permutation) == list(range(len(factors))):
                    candidate = tuple(permutation)
                    stable = all(
                        candidate[candidate[index]] == index
                        for index in range(len(candidate))
                    )
                if not stable:
                    self.reason = (
                        "quadratic conjugation does not permute the complete supplied "
                        "factor base"
                    )
                else:
                    self.available = True
                    self.permutation = tuple(permutation)
                    self.image_fingerprints = tuple(
                        _ideal_payload(image) for image in images
                    )
                    self.detected["factor_base_permutation"] = True
                    self.strategy = "quadratic-conjugation-factor-base-permutation"
                    self.useful = any(
                        image != index for index, image in enumerate(self.permutation)
                    )
                    if self.useful:
                        self.reason = (
                            "exact quadratic conjugation permutes at least one "
                            "factor-base prime"
                        )
                    else:
                        self.reason = (
                            "quadratic conjugation fixes every supplied factor-base "
                            "prime"
                        )
        self._content_sha256 = _content_hash(self._dictionary_body())

    def _conjugate_element_unchecked(self, value: Any) -> Any:
        coefficients = self._field(value).list()
        linear = self._quadratic_linear
        if linear is None:
            raise NotImplementedError("quadratic conjugation needs a degree-two field")
        return _field_element_from_coefficients(
            self._field,
            [coefficients[0] - linear * coefficients[1], -coefficients[1]],
        )

    def _conjugate_ideal_unchecked(self, ideal: Any) -> Any:
        return self._order.ideal(
            [self._conjugate_element_unchecked(element) for element in ideal.basis()]
        )

    def _require_available(self) -> None:
        if not self.available:
            raise NotImplementedError(self.reason)

    def conjugate_element(self, value: Any) -> Any:
        """Apply the exact nontrivial quadratic field automorphism."""
        self._require_available()
        return self._conjugate_element_unchecked(value)

    def conjugate_ideal(self, ideal: Any) -> Any:
        """Map an ideal after checking its exact retained order."""
        self._require_available()
        if ideal.ring() is not self._order:
            raise TypeError("an automorphism plan cannot map an ideal of another order")
        return self._conjugate_ideal_unchecked(ideal)

    def permute_row(self, row: Iterable[int]) -> tuple[int, ...]:
        """Map a factor-base exponent row under the authenticated permutation."""
        self._require_available()
        values = tuple(_checked_integer(value, "relation exponent") for value in row)
        if len(values) != self.factor_base_size:
            raise ValueError("an automorphism relation row has the wrong width")
        answer = [0 for _index in values]
        for index, value in enumerate(values):
            answer[self.permutation[index]] = value
        return tuple(answer)

    def verify(self) -> bool:
        """Replay the plan hash, exact ideal images, and involution."""
        try:
            if _content_hash(self._dictionary_body()) != self._content_sha256:
                return False
            if not self.available:
                return True
            if self._conjugate_ideal_unchecked(
                self._order.ideal(1)
            ) != self._order.ideal(1):
                return False
            if any(
                self._conjugate_element_unchecked(
                    self._conjugate_element_unchecked(element)
                )
                != element
                for element in self._order.basis()
            ):
                return False
            for index, prime in enumerate(self._factor_base):
                image = self._conjugate_ideal_unchecked(prime)
                if image != self._factor_base[self.permutation[index]]:
                    return False
                if _ideal_payload(image) != self.image_fingerprints[index]:
                    return False
            return True
        except Exception:
            return False

    def derive(
        self, relation: Any, collector: ExactRelationCollector | None = None
    ) -> RelationAdmission | None:
        """Admit one independently replayed conjugate relation when useful."""
        self._require_available()
        if not self.useful:
            return None
        if collector is None:
            raise TypeError("deriving an automorphism relation requires a collector")
        if (
            collector.order is not self._order
            or tuple(_prime_fingerprint(prime) for prime in collector.factor_base)
            != self.factor_base_fingerprints
        ):
            raise ValueError("the collector does not match the automorphism plan")
        parent = (
            relation.record if isinstance(relation, RelationAdmission) else relation
        )
        parent = (
            parent
            if isinstance(parent, RelationRecord)
            else RelationRecord.from_dict(parent)
        )
        verification = parent.verify(self._order, self._factor_base)
        if verification["certified"] is not True:
            raise ArithmeticError(
                "cannot derive from an invalid relation: "
                + "; ".join(verification["failures"])
            )
        mapped_row = self.permute_row(parent.row)
        if mapped_row == parent.row:
            return None
        mapped_source_row = self.permute_row(parent.source_row)
        mapped_quotient_row = self.permute_row(parent.quotient_row)
        witness = FactoredPrincipalWitness.from_dict(self._field, parent.witness)
        mapped_witness = FactoredPrincipalWitness(
            self._field,
            [
                [self._conjugate_element_unchecked(element), exponent]
                for element, exponent in witness.factors()
            ],
        )
        parent_source = reconstruct_factor_base_ideal(
            self._order, self._factor_base, parent.source_row
        )
        mapped_source = self._conjugate_ideal_unchecked(parent_source)
        reconstructed_mapped_source = collector.reconstruct_factor_base_ideal(
            mapped_source_row
        )
        if mapped_source != reconstructed_mapped_source:
            raise ArithmeticError(
                "a conjugate source ideal did not match its permuted row"
            )
        admission = collector.admit_witness(
            mapped_witness,
            source_ideal=mapped_source,
            source_row=mapped_source_row,
            provenance={
                "algorithm": "quadratic-conjugation-orbit",
                "parent_relation_sha256": hashlib.sha256(
                    parent.canonical_key().encode("utf-8")
                ).hexdigest(),
                "automorphism_plan_sha256": self._content_sha256,
            },
        )
        derived = admission.record
        if (
            derived.row != mapped_row
            or derived.source_row != mapped_source_row
            or derived.quotient_row != mapped_quotient_row
        ):
            raise ArithmeticError("a conjugate relation did not replay its mapped rows")
        detached = RelationRecord.from_dict(derived.to_dict())
        replay = detached.verify(self._order, self._factor_base)
        if replay["certified"] is not True:
            raise ArithmeticError(
                "a conjugate relation failed detached replay: "
                + "; ".join(replay["failures"])
            )
        return admission

    def _dictionary_body(self) -> dict[str, Any]:
        return {
            "schema": AUTOMORPHISM_PLAN_SCHEMA,
            "available": self.available,
            "useful": self.useful,
            "strategy": self.strategy,
            "factor_base_size": self.factor_base_size,
            "detected": dict(self.detected),
            "reason": self.reason,
            "permutation": list(self.permutation),
            "factor_base_fingerprints": list(self.factor_base_fingerprints),
            "image_fingerprints": list(self.image_fingerprints),
        }

    def to_dict(self) -> dict[str, Any]:
        body = self._dictionary_body()
        body["content_sha256"] = self._content_sha256
        return body

    @classmethod
    def from_dict(
        cls, field: Any, factor_base: Iterable[Any], payload: dict[str, Any]
    ) -> AutomorphismOrbitPlan:
        """Authenticate a serialized plan against freshly replayed exact images."""
        if not isinstance(payload, dict):
            raise TypeError("an automorphism plan must be a dictionary")
        expected_keys = {
            "schema",
            "available",
            "useful",
            "strategy",
            "factor_base_size",
            "detected",
            "reason",
            "permutation",
            "factor_base_fingerprints",
            "image_fingerprints",
            "content_sha256",
        }
        if set(payload) != expected_keys:
            raise ValueError("an automorphism plan has unexpected fields")
        if payload.get("schema") != AUTOMORPHISM_PLAN_SCHEMA:
            raise ValueError("unsupported automorphism-orbit plan schema")
        content_hash = payload.get("content_sha256")
        if not isinstance(content_hash, str) or len(content_hash) != 64:
            raise ValueError("an automorphism plan has an invalid content hash")
        body = dict(payload)
        del body["content_sha256"]
        if _content_hash(body) != content_hash:
            raise ValueError("automorphism plan content hash mismatch")
        answer = cls(field, factor_base)
        if answer.to_dict() != payload or not answer.verify():
            raise ValueError("automorphism plan exact replay mismatch")
        return answer


def plan_automorphism_orbits(
    field: Any, factor_base: Iterable[Any]
) -> AutomorphismOrbitPlan:
    """Plan exact quadratic conjugation or report a deterministic fallback."""
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


class IdealReductionState:
    """Immutable cursor for exhaustive ideal-basis coefficient shells."""

    def __init__(
        self,
        *,
        ideal_fingerprint: dict[str, Any],
        factor_base_fingerprints: Iterable[dict[str, Any]],
        embedding_precision: int,
        dimension: int,
        radius: int = 1,
        cube_index: int = 0,
        candidates_tested: int = 0,
    ) -> None:
        if not isinstance(ideal_fingerprint, dict):
            raise TypeError("ideal-reduction ideal fingerprint must be a dictionary")
        factor_values = tuple(factor_base_fingerprints)
        if any(not isinstance(value, dict) for value in factor_values):
            raise TypeError("ideal-reduction factor fingerprints must be dictionaries")
        _validate_bounded_json(ideal_fingerprint)
        _validate_bounded_json(list(factor_values))
        precision = _checked_bounded_cursor_integer(
            embedding_precision, "embedding precision", positive=True
        )
        if precision < 53 or precision > MAX_IDEAL_REDUCTION_PRECISION:
            raise ValueError("embedding precision is outside the checkpoint limit")
        dimension = _checked_bounded_cursor_integer(
            dimension, "ideal reduction dimension", positive=True
        )
        if dimension > MAX_IDEAL_REDUCTION_DIMENSION:
            raise ValueError("ideal reduction dimension exceeds the checkpoint limit")
        radius = _checked_bounded_cursor_integer(
            radius, "ideal reduction radius", positive=True
        )
        if radius.bit_length() > MAX_IDEAL_REDUCTION_RADIUS_BITS:
            raise ValueError("ideal reduction radius exceeds the checkpoint limit")
        cube_index = _checked_bounded_cursor_integer(
            cube_index, "ideal reduction cube index"
        )
        candidates_tested = _checked_bounded_cursor_integer(
            candidates_tested, "ideal reduction candidate count"
        )
        side = 2 * radius + 1
        if side.bit_length() * dimension > MAX_IDEAL_REDUCTION_WORK_BITS:
            raise ValueError("ideal reduction shell exceeds the checkpoint work limit")
        if cube_index >= side**dimension:
            raise ValueError("ideal reduction cube index is outside its shell cube")
        expected_candidates = _expected_reduction_candidates(
            radius, cube_index, dimension
        )
        if candidates_tested != expected_candidates:
            raise ValueError("ideal reduction cursor skips or repeats shell candidates")
        self._ideal_fingerprint = _json_value(ideal_fingerprint)
        self._factor_base_fingerprints = tuple(
            _json_value(value) for value in factor_values
        )
        self.embedding_precision = precision
        self.dimension = dimension
        self.radius = radius
        self.cube_index = cube_index
        self.candidates_tested = candidates_tested
        runtime.object.freeze(self)

    def to_dict(self) -> dict[str, Any]:
        body = {
            "schema": IDEAL_REDUCTION_STATE_SCHEMA,
            "ideal_fingerprint": _json_value(self._ideal_fingerprint),
            "factor_base_fingerprints": [
                _json_value(value) for value in self._factor_base_fingerprints
            ],
            "embedding_precision": self.embedding_precision,
            "dimension": self.dimension,
            "radius": self.radius,
            "cube_index": self.cube_index,
            "candidates_tested": self.candidates_tested,
        }
        body["content_sha256"] = _content_hash(body)
        return body

    def stable_hash(self) -> str:
        return self.to_dict()["content_sha256"]

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> IdealReductionState:
        if not isinstance(payload, dict):
            raise TypeError("ideal-reduction state must be a dictionary")
        if (
            len(payload) != len(_IDEAL_REDUCTION_STATE_KEYS)
            or set(payload) != _IDEAL_REDUCTION_STATE_KEYS
        ):
            raise ValueError("ideal-reduction state has unexpected or missing keys")
        if payload.get("schema") != IDEAL_REDUCTION_STATE_SCHEMA:
            raise ValueError("unsupported ideal-reduction state schema")
        if not isinstance(payload["ideal_fingerprint"], dict):
            raise TypeError("ideal-reduction ideal fingerprint must be a dictionary")
        if not isinstance(payload["factor_base_fingerprints"], list):
            raise TypeError("ideal-reduction factor fingerprints must be a list")
        expected_hash = payload["content_sha256"]
        if (
            not isinstance(expected_hash, str)
            or len(expected_hash) != 64
            or any(character not in "0123456789abcdef" for character in expected_hash)
        ):
            raise ValueError("ideal-reduction state has an invalid content hash")
        for name in (
            "embedding_precision",
            "dimension",
            "radius",
            "cube_index",
            "candidates_tested",
        ):
            _checked_bounded_cursor_integer(payload[name], name)
        _validate_bounded_json(payload["ideal_fingerprint"])
        _validate_bounded_json(payload["factor_base_fingerprints"])
        body = dict(payload)
        del body["content_sha256"]
        if _content_hash(body) != expected_hash:
            raise ValueError("ideal-reduction state content hash mismatch")
        state = cls(
            ideal_fingerprint=payload["ideal_fingerprint"],
            factor_base_fingerprints=payload["factor_base_fingerprints"],
            embedding_precision=payload["embedding_precision"],
            dimension=payload["dimension"],
            radius=payload["radius"],
            cube_index=payload["cube_index"],
            candidates_tested=payload["candidates_tested"],
        )
        if state.to_dict() != payload:
            raise ValueError("ideal-reduction state is not canonical")
        return state

    def _advance(self, radius: int, cube_index: int) -> IdealReductionState:
        return IdealReductionState(
            ideal_fingerprint=self._ideal_fingerprint,
            factor_base_fingerprints=self._factor_base_fingerprints,
            embedding_precision=self.embedding_precision,
            dimension=self.dimension,
            radius=radius,
            cube_index=cube_index,
            candidates_tested=self.candidates_tested + 1,
        )

    def _matches(
        self,
        ideal_fingerprint: dict[str, Any],
        factor_base_fingerprints: Iterable[dict[str, Any]],
        precision: int,
        dimension: int,
    ) -> bool:
        return (
            self._ideal_fingerprint == ideal_fingerprint
            and self._factor_base_fingerprints == tuple(factor_base_fingerprints)
            and self.embedding_precision == precision
            and self.dimension == dimension
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
        self.last_random_attempts = 0
        self.state = RelationSearchState(seed) if state is None else state

    def iter_short_elements(self, ideal: Any) -> Iterable[Any]:
        """Yield exact short elements without materializing unused candidates.

        Lattice reduction and the bounded coefficient stream are still
        constructed eagerly, so the replayable PRNG state is identical to a
        full `short_elements` call.  Field-element conversion, ideal
        membership, and canonical deduplication happen only as the consumer
        advances the iterator.
        """
        if ideal.ring() is not self.collector.order or ideal.is_zero():
            raise TypeError("short-vector search requires a nonzero ideal of the order")
        if self.basis_reducer is None:
            self.last_lattice_plan = minkowski_lll_lattice(
                ideal, precision=self.embedding_precision
            )
            reduced = [list(row) for row in self.last_lattice_plan.exact_rows]
            denominator = self.last_lattice_plan.denominator
        else:
            self.last_lattice_plan = None
            integer_rows, denominator = _integral_lattice_rows(ideal)
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
        missing = max(0, self.max_candidates_per_ideal - len(coefficient_rows))
        random_draw_budget = (
            8 * missing
            if reduced and self.random_terms > 0 and self.coefficient_bound > 0
            else 0
        )
        self.last_random_attempts = 0
        for _draw in range(random_draw_budget):
            if len(coefficient_rows) >= self.max_candidates_per_ideal:
                break
            runtime.check_interrupt()
            self.last_random_attempts += 1
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
                yield element

    def short_elements(self, ideal: Any) -> tuple[Any, ...]:
        """Return the complete bounded exact short-element tuple."""
        return tuple(self.iter_short_elements(ideal))

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
        for sequence, element in enumerate(self.iter_short_elements(ideal)):
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
            self.collector.reconstruct_factor_base_ideal(exponents),
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


def _shell_coefficients(radius: int, cube_index: int, dimension: int) -> list[int]:
    side = 2 * radius + 1
    coefficients = []
    cursor = cube_index
    for _coordinate in range(dimension):
        coefficients.append(cursor % side - radius)
        cursor //= side
    return coefficients


def _advance_reduction_cursor(
    state: IdealReductionState,
) -> tuple[IdealReductionState, list[int] | None]:
    coefficients = _shell_coefficients(state.radius, state.cube_index, state.dimension)
    next_index = state.cube_index + 1
    side = 2 * state.radius + 1
    if next_index == side**state.dimension:
        next_radius = state.radius + 1
        next_index = 0
    else:
        next_radius = state.radius
    if max(abs(value) for value in coefficients) != state.radius:
        return (
            IdealReductionState(
                ideal_fingerprint=state._ideal_fingerprint,
                factor_base_fingerprints=state._factor_base_fingerprints,
                embedding_precision=state.embedding_precision,
                dimension=state.dimension,
                radius=next_radius,
                cube_index=next_index,
                candidates_tested=state.candidates_tested,
            ),
            None,
        )
    return state._advance(next_radius, next_index), coefficients


def _reduction_candidate(
    ideal: Any,
    factors: tuple[Any, ...],
    ideal_row: tuple[int, ...],
    ideal_norm: Any,
    element: Any,
) -> tuple[tuple[int, ...], FactoredPrincipalWitness] | None:
    quotient_norm = sage.QQ(element.norm()) / ideal_norm
    if quotient_norm < 0:
        quotient_norm = -quotient_norm
    numerator = abs(int(quotient_norm._numerator))
    denominator = int(quotient_norm._denominator)
    rational_primes = sorted({int(prime.rational_prime()) for prime in factors})
    for rational_prime in rational_primes:
        while numerator % rational_prime == 0:
            numerator //= rational_prime
        while denominator % rational_prime == 0:
            denominator //= rational_prime
    if numerator != 1 or denominator != 1:
        return None
    factored = FactoredPrincipalWitness.from_element(element)
    principal_row = factor_witness_over_base(factored, factors)
    row = tuple(
        principal_exponent - ideal_exponent
        for principal_exponent, ideal_exponent in zip(
            principal_row, ideal_row, strict=True
        )
    )
    if _factor_base_row_norm(factors, row) != quotient_norm:
        return None
    principal = ideal.ring().ideal(element)
    reconstructed = reconstruct_factor_base_ideal(ideal.ring(), factors, row)
    if ideal * reconstructed != principal:
        raise ArithmeticError("ideal reduction failed exact principal replay")
    return row, factored


def _reduction_element(
    field: Any,
    basis_rows: tuple[tuple[int, ...], ...],
    denominator: Any,
    coefficients: list[int],
) -> Any:
    dimension = len(basis_rows)
    exact_row = [
        sum(
            coefficients[basis_index] * basis_rows[basis_index][column]
            for basis_index in range(dimension)
        )
        for column in range(dimension)
    ]
    return _field_element_from_coefficients(
        field, [sage.QQ(value) / denominator for value in exact_row]
    )


def _verify_reduction_checkpoint(
    target: IdealReductionState,
    ideal: Any,
    factors: tuple[Any, ...],
    ideal_row: tuple[int, ...],
    ideal_norm: Any,
    field: Any,
    basis_rows: tuple[tuple[int, ...], ...],
    denominator: Any,
) -> None:
    """Replay a bounded cursor prefix and reject skipped successful elements."""
    if target.candidates_tested > MAX_IDEAL_REDUCTION_REPLAY_CANDIDATES:
        raise ValueError("ideal-reduction checkpoint exceeds the replay work limit")
    cursor = IdealReductionState(
        ideal_fingerprint=target._ideal_fingerprint,
        factor_base_fingerprints=target._factor_base_fingerprints,
        embedding_precision=target.embedding_precision,
        dimension=target.dimension,
    )
    steps = 0
    while cursor.radius != target.radius or cursor.cube_index != target.cube_index:
        steps += 1
        if steps > MAX_IDEAL_REDUCTION_REPLAY_CURSOR_STEPS:
            raise ValueError("ideal-reduction checkpoint exceeds the cursor work limit")
        cursor, coefficients = _advance_reduction_cursor(cursor)
        if cursor.candidates_tested > target.candidates_tested:
            raise ValueError("ideal-reduction checkpoint cursor is inconsistent")
        if coefficients is None:
            continue
        element = _reduction_element(field, basis_rows, denominator, coefficients)
        if (
            _reduction_candidate(ideal, factors, ideal_row, ideal_norm, element)
            is not None
        ):
            raise ValueError(
                "ideal-reduction checkpoint skipped a successful candidate"
            )
    if cursor.candidates_tested != target.candidates_tested:
        raise ValueError("ideal-reduction checkpoint candidate count is inconsistent")


def reduce_ideal_over_base(
    ideal: Any,
    factor_base: Iterable[Any],
    *,
    seed: int = 0,
    max_candidates: int | None = None,
    embedding_precision: int = 128,
    cancelled: Callable[[], bool] | None = None,
    checkpoint: IdealReductionState | dict[str, Any] | None = None,
    checkpoint_callback: Callable[[IdealReductionState], None] | None = None,
) -> tuple[tuple[int, ...], FactoredPrincipalWitness]:
    """Find `(alpha) = ideal * Q` by exhaustive deterministic shell search.

    This is the inverse-map analogue of relation collection.  It permits an
    arbitrary nonzero fractional ideal, even when that ideal itself contains
    primes outside the factor base.  The returned row factors `Q`; therefore
    the ideal's class is the negative of that row.  Exact ideal equality is
    checked before returning the principal witness `alpha`.

    `max_candidates=None` is the total map used by complete class groups.  An
    integer opts into a bounded operation; exhaustion raises
    `IdealReductionResourceLimit` with an immutable resumable `state`.  The
    coefficient shells exhaust the exact ideal lattice, so whenever the factor
    base generates the complete class group a smooth quotient is eventually
    found.  Cancellation uses the shared class/unit cancellation message and
    likewise retains the next untested cursor.
    """
    order = ideal.ring()
    factors = _validate_factor_base(order, factor_base)
    if ideal.is_zero():
        raise ValueError("the zero ideal has no ideal class")
    _checked_integer(seed, "deterministic seed")
    if max_candidates is not None:
        max_candidates = _checked_nonnegative(max_candidates, "candidate bound")
    precision = _checked_integer(embedding_precision, "embedding precision")
    if precision < 53 or precision > MAX_IDEAL_REDUCTION_PRECISION:
        raise ValueError("embedding precision is outside the ideal-reduction limit")
    field_dimension = _checked_integer(
        ideal.number_field().degree(), "ideal reduction dimension"
    )
    if field_dimension < 1 or field_dimension > MAX_IDEAL_REDUCTION_DIMENSION:
        raise ValueError("ideal reduction dimension exceeds the resource limit")
    if cancelled is not None and not callable(cancelled):
        raise TypeError("cancelled must be callable")
    if checkpoint_callback is not None and not callable(checkpoint_callback):
        raise TypeError("checkpoint callback must be callable")
    plan = minkowski_lll_lattice(ideal, precision=precision)
    dimension = len(plan.exact_rows)
    if dimension != field_dimension:
        raise ArithmeticError("ideal reduction basis has the wrong dimension")
    ideal_fingerprint = _ideal_payload(ideal)
    factor_fingerprints = tuple(_prime_fingerprint(prime) for prime in factors)
    if checkpoint is None:
        state = IdealReductionState(
            ideal_fingerprint=ideal_fingerprint,
            factor_base_fingerprints=factor_fingerprints,
            embedding_precision=precision,
            dimension=dimension,
        )
    else:
        state = (
            checkpoint
            if isinstance(checkpoint, IdealReductionState)
            else IdealReductionState.from_dict(checkpoint)
        )
        if not state._matches(
            ideal_fingerprint, factor_fingerprints, precision, dimension
        ):
            raise ValueError("ideal-reduction checkpoint belongs to another problem")
    field = ideal.number_field()
    denominator = sage.QQ(plan.denominator)
    basis_rows = plan.exact_rows
    ideal_row = tuple(int(ideal.valuation(prime)) for prime in factors)
    ideal_norm = sage.QQ(ideal.norm())
    if checkpoint is not None:
        _verify_reduction_checkpoint(
            state,
            ideal,
            factors,
            ideal_row,
            ideal_norm,
            field,
            basis_rows,
            denominator,
        )
    attempted = 0
    while max_candidates is None or attempted < max_candidates:
        runtime.check_interrupt()
        if cancelled is not None and cancelled():
            raise IdealReductionCancelled(state)
        state, coefficients = _advance_reduction_cursor(state)
        if coefficients is None:
            continue
        attempted += 1
        element = _reduction_element(field, basis_rows, denominator, coefficients)
        result = _reduction_candidate(ideal, factors, ideal_row, ideal_norm, element)
        if checkpoint_callback is not None:
            checkpoint_callback(state)
        if result is not None:
            return result
    raise IdealReductionResourceLimit(ideal, state)


__all__ = [
    "AutomorphismOrbitPlan",
    "DEFAULT_RANK_PRIME",
    "ExactRelationCollector",
    "FactorBaseIdealReconstructor",
    "FactoredPrincipalWitness",
    "IdealReductionCancelled",
    "IdealReductionResourceLimit",
    "IdealReductionState",
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
