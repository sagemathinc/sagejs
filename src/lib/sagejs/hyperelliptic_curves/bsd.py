"""Transparent supplied-data Birch--Swinnerton-Dyer arithmetic.

This module deliberately begins below the curve API.  It assembles a BSD
quotient from explicit arithmetic factors without importing the period,
reduction, height, or analytic implementations which will eventually compute
those factors.  Consequently it is also an ordinary CPython module and a
portable serialization boundary for Node and WebAssembly hosts.

For an abelian variety `A` and its dual `Adual`, the implemented normalization
is

```text
L^(r)(A, 1) / r! * #A(Q)_tors * #Adual(Q)_tors
------------------------------------------------.
        Omega_A * Reg * product_p(c_p)
```

For a principally polarized Jacobian and a full-rank subgroup `Gamma`, this is
named `sha_over_index_squared`: BSD predicts that it equals
`#Sha(J) / [J(Q)/torsion : Gamma]^2`.  It is promoted to `analytic_sha` only
when that index is accompanied by a certificate.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Iterable, Mapping, Sequence


BSD_INPUT_SCHEMA = "sagejs.hyperelliptic-bsd-input/v1"
BSD_QUOTIENT_SCHEMA = "sagejs.hyperelliptic-bsd-quotient/v1"
BSD_SQLITE_SCHEMA = "sagejs.hyperelliptic-bsd-sqlite/v1"
SUBGROUP_INDEX_CERTIFICATE_SCHEMA = "sagejs.bsd-subgroup-index-certificate/v1"

_PROVENANCE_STATUSES = {
    "bounded",
    "certified",
    "computed",
    "indeterminate",
    "probable",
    "proved",
    "supplied",
    "unsupported",
}
_RANK_STATUSES = {"indeterminate", "probable", "proved", "supplied"}
_PERIOD_NORMALIZATIONS = {"model", "neron", "unspecified"}
_TAMAGAWA_COVERAGE = {"complete", "incomplete", "override"}
_SUBGROUP_STATUSES = {
    "arbitrary",
    "full_mordell_weil",
    "full_rank_finite_index",
    "globally_saturated",
    "s_saturated",
}


class BSDArithmeticError(ArithmeticError):
    """Base class for BSD arithmetic failures."""


class BSDValidationError(BSDArithmeticError, ValueError):
    """An input violates the exact BSD arithmetic contract."""


class BSDIncompleteDataError(BSDArithmeticError):
    """Atomic quotient assembly is impossible with incomplete input."""


class BSDRankMismatchError(BSDValidationError):
    """Rank evidence or a supplied pairing has inconsistent dimension."""


class BSDSubgroupIndexUnknownError(BSDIncompleteDataError):
    """`analytic_sha` was requested without a certified subgroup index."""


def _gcd(left: int, right: int) -> int:
    left = abs(left)
    right = abs(right)
    while right:
        left, right = right, left % right
    return left


def _factorial(value: int) -> int:
    answer = 1
    for factor in range(2, value + 1):
        answer *= factor
    return answer


def _require_integer(value: Any, name: str, *, minimum: int | None = 0) -> int:
    if isinstance(value, bool) or isinstance(value, float) or isinstance(value, str):
        raise BSDValidationError(name + " must be an exact integer")
    try:
        answer = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise BSDValidationError(name + " must be an exact integer") from error
    try:
        equal = value == answer
    except Exception as error:
        raise BSDValidationError(name + " must be an exact integer") from error
    if not bool(equal):
        raise BSDValidationError(name + " must be an exact integer")
    if minimum is not None and answer < minimum:
        raise BSDValidationError(name + " must be at least " + str(minimum))
    return answer


def _require_bool(value: Any, name: str) -> bool:
    if not isinstance(value, bool):
        raise BSDValidationError(name + " must be a boolean")
    return value


def _require_string(value: Any, name: str, *, nonempty: bool = False) -> str:
    if not isinstance(value, str) or (nonempty and not value):
        qualifier = "a nonempty string" if nonempty else "a string"
        raise BSDValidationError(name + " must be " + qualifier)
    return value


def _integer_from_record(value: Any, name: str, *, minimum: int | None = 0) -> int:
    if not isinstance(value, str) or not value:
        raise BSDValidationError(name + " must be a decimal integer string")
    if value[0] == "-":
        digits = value[1:]
    else:
        digits = value
    if not digits.isdigit() or (len(digits) > 1 and digits[0] == "0"):
        raise BSDValidationError(name + " is not a canonical decimal integer")
    answer = int(value)
    if str(answer) != value:
        raise BSDValidationError(name + " is not a canonical decimal integer")
    if minimum is not None and answer < minimum:
        raise BSDValidationError(name + " must be at least " + str(minimum))
    return answer


def _is_prime(value: int) -> bool:
    if value < 2:
        return False
    if value % 2 == 0:
        return value == 2
    divisor = 3
    while divisor * divisor <= value:
        if value % divisor == 0:
            return False
        divisor += 2
    return True


def _canonical_decimal(value: Any, name: str) -> str:
    if isinstance(value, bool):
        raise BSDValidationError(name + " must be a finite decimal number")
    numerator, denominator = _decimal_ratio(str(value), name)
    return _terminating_decimal(numerator, denominator)


def _decimal_ratio(value: str, name: str = "decimal") -> tuple[int, int]:
    """Parse one finite base-10 string without binary floating-point."""
    text = value.strip().lower()
    if not text or text in {"+", "-"}:
        raise BSDValidationError(name + " must be a finite decimal number")
    sign = 1
    if text[0] in "+-":
        if text[0] == "-":
            sign = -1
        text = text[1:]
    pieces = text.split("e")
    if len(pieces) > 2:
        raise BSDValidationError(name + " must be a finite decimal number")
    mantissa = pieces[0]
    exponent = 0
    if len(pieces) == 2:
        exponent_text = pieces[1]
        if exponent_text.startswith(("+", "-")):
            exponent_digits = exponent_text[1:]
        else:
            exponent_digits = exponent_text
        if not exponent_digits.isdigit():
            raise BSDValidationError(name + " must be a finite decimal number")
        exponent = int(exponent_text)
    if mantissa.count(".") > 1:
        raise BSDValidationError(name + " must be a finite decimal number")
    if "." in mantissa:
        whole, fractional = mantissa.split(".")
    else:
        whole, fractional = mantissa, ""
    if not whole:
        whole = "0"
    if not whole.isdigit() or (fractional and not fractional.isdigit()):
        raise BSDValidationError(name + " must be a finite decimal number")
    digits = (whole + fractional).lstrip("0") or "0"
    scale = len(fractional) - exponent
    numerator = sign * int(digits)
    denominator = 1
    if scale >= 0:
        denominator = 10**scale
    else:
        numerator *= 10 ** (-scale)
    common = _gcd(numerator, denominator)
    return numerator // common, denominator // common


def _terminating_decimal(numerator: int, denominator: int) -> str:
    """Return the canonical finite decimal for a denominator using only 2,5."""
    if numerator == 0:
        return "0"
    denominator = abs(denominator)
    twos = 0
    fives = 0
    remaining = denominator
    while remaining % 2 == 0:
        remaining //= 2
        twos += 1
    while remaining % 5 == 0:
        remaining //= 5
        fives += 1
    if remaining != 1:
        raise BSDValidationError("a decimal endpoint is not terminating")
    scale = max(twos, fives)
    scaled = abs(numerator) * 2 ** (scale - twos) * 5 ** (scale - fives)
    digits = str(scaled).rjust(scale + 1, "0")
    if scale:
        text = digits[:-scale] + "." + digits[-scale:]
        text = text.rstrip("0").rstrip(".")
    else:
        text = digits
    return ("-" if numerator < 0 else "") + text


def _ratio_add(left: tuple[int, int], right: tuple[int, int]) -> tuple[int, int]:
    numerator = left[0] * right[1] + right[0] * left[1]
    denominator = left[1] * right[1]
    common = _gcd(numerator, denominator)
    return numerator // common, denominator // common


def _ratio_negate(value: tuple[int, int]) -> tuple[int, int]:
    return -value[0], value[1]


def _ratio_multiply(left: tuple[int, int], right: tuple[int, int]) -> tuple[int, int]:
    numerator = left[0] * right[0]
    denominator = left[1] * right[1]
    common = _gcd(numerator, denominator)
    return numerator // common, denominator // common


def _ratio_divide(left: tuple[int, int], right: tuple[int, int]) -> tuple[int, int]:
    if right[0] == 0:
        raise BSDValidationError("division by a zero BSD factor")
    sign = -1 if right[0] < 0 else 1
    numerator = sign * left[0] * right[1]
    denominator = left[1] * abs(right[0])
    common = _gcd(numerator, denominator)
    return numerator // common, denominator // common


def _ratio_compare(left: tuple[int, int], right: tuple[int, int]) -> int:
    difference = left[0] * right[1] - right[0] * left[1]
    return -1 if difference < 0 else (1 if difference > 0 else 0)


def _ratio_decimal(value: tuple[int, int], bits: int) -> str:
    """Round a rational to a stable point decimal at the requested precision."""
    numerator, denominator = value
    if numerator == 0:
        return "0"
    digits = max(18, (bits * 30103 + 99999) // 100000 + 4)
    scale = 10**digits
    quotient, remainder = divmod(abs(numerator) * scale, denominator)
    if 2 * remainder >= denominator:
        quotient += 1
    text = str(quotient).rjust(digits + 1, "0")
    text = text[:-digits] + "." + text[-digits:]
    text = text.rstrip("0").rstrip(".")
    return ("-" if numerator < 0 else "") + text


def _json_safe(value: Any, name: str = "metadata") -> Any:
    if isinstance(value, bool) or isinstance(value, str):
        return value
    if isinstance(value, int):
        return str(value)
    if value is None:
        raise BSDValidationError(
            name + " cannot contain null; use an explicit status instead"
        )
    # `typing.Mapping` is not a runtime ABC in Sage.js.  Serialized records
    # deliberately freeze to ordinary dictionaries at this boundary.
    if isinstance(value, dict):
        answer: dict[str, Any] = {}
        keys = list(value.keys())
        if any(not isinstance(key, str) for key in keys):
            raise BSDValidationError(name + " keys must be strings")
        for key in sorted(keys):
            if not isinstance(key, str):
                raise BSDValidationError(name + " keys must be strings")
            answer[key] = _json_safe(value[key], name + "." + key)
        return answer
    if isinstance(value, (list, tuple)):
        return [_json_safe(item, name) for item in value]
    raise BSDValidationError(name + " contains a non-serializable value")


def _canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


@dataclass(frozen=True)
class Provenance:
    """How one mathematical input was obtained."""

    status: str
    source: str
    reference: str = ""
    details: Mapping[str, Any] | None = None

    def __post_init__(self) -> None:
        if self.status not in _PROVENANCE_STATUSES:
            raise BSDValidationError("unknown provenance status " + repr(self.status))
        if not isinstance(self.source, str) or not self.source:
            raise BSDValidationError("provenance source must be a nonempty string")
        object.__setattr__(
            self, "reference", _require_string(self.reference, "provenance reference")
        )
        checked = {} if self.details is None else _json_safe(self.details)
        object.__setattr__(self, "details", checked)

    @classmethod
    def supplied(
        cls,
        source: str = "user",
        *,
        reference: str = "",
        details: Mapping[str, Any] | None = None,
    ) -> Provenance:
        return cls("supplied", source, reference, details)

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "source": self.source,
            "reference": self.reference,
            "details": dict(self.details or {}),
        }

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> Provenance:
        return cls(
            _require_string(value["status"], "provenance status"),
            _require_string(value["source"], "provenance source", nonempty=True),
            _require_string(value.get("reference", ""), "provenance reference"),
            value.get("details", {}),
        )


@dataclass(frozen=True)
class ArithmeticScalar:
    """An exact rational, decimal approximation, or decimal interval.

    Decimal endpoints are a portable interchange representation.  Arithmetic
    parses them exactly as base-10 rationals and rounds results back to the
    recorded precision.  It is intentionally labeled non-rigorous because
    this rounding is not directed outward.
    """

    kind: str
    numerator: int = 0
    denominator: int = 1
    value: str = ""
    lower: str = ""
    upper: str = ""
    precision_bits: int = 0
    rigorous: bool = False

    def __post_init__(self) -> None:
        _require_bool(self.rigorous, "scalar rigor")
        if self.kind == "exact":
            numerator = _require_integer(self.numerator, "numerator", minimum=None)
            denominator = _require_integer(self.denominator, "denominator", minimum=1)
            common = _gcd(numerator, denominator)
            object.__setattr__(self, "numerator", numerator // common)
            object.__setattr__(self, "denominator", denominator // common)
            object.__setattr__(self, "rigorous", True)
            object.__setattr__(self, "precision_bits", 0)
            return
        bits = _require_integer(self.precision_bits, "precision_bits", minimum=2)
        object.__setattr__(self, "precision_bits", bits)
        if self.kind == "decimal":
            object.__setattr__(self, "value", _canonical_decimal(self.value, "value"))
            object.__setattr__(self, "rigorous", False)
            return
        if self.kind == "interval":
            lower = _canonical_decimal(self.lower, "lower")
            upper = _canonical_decimal(self.upper, "upper")
            if _ratio_compare(_decimal_ratio(lower), _decimal_ratio(upper)) > 0:
                raise BSDValidationError(
                    "interval lower endpoint exceeds upper endpoint"
                )
            object.__setattr__(self, "lower", lower)
            object.__setattr__(self, "upper", upper)
            return
        raise BSDValidationError("unknown scalar kind " + repr(self.kind))

    @classmethod
    def exact(cls, value: Any, denominator: Any = 1) -> ArithmeticScalar:
        if isinstance(value, ArithmeticScalar):
            if denominator != 1 or value.kind != "exact":
                raise BSDValidationError("expected an exact rational scalar")
            return value
        if isinstance(value, (tuple, list)):
            if denominator != 1 or len(value) != 2:
                raise BSDValidationError("an exact rational pair has length two")
            return cls(
                "exact",
                _require_integer(value[0], "numerator", minimum=None),
                _require_integer(value[1], "denominator", minimum=1),
            )
        return cls(
            "exact",
            _require_integer(value, "numerator", minimum=None),
            _require_integer(denominator, "denominator", minimum=1),
        )

    @classmethod
    def decimal(
        cls, value: Any, *, precision_bits: int, rigorous: bool = False
    ) -> ArithmeticScalar:
        if rigorous:
            raise BSDValidationError(
                "a point decimal is not an enclosure; use ArithmeticScalar.interval"
            )
        return cls("decimal", value=str(value), precision_bits=precision_bits)

    @classmethod
    def interval(
        cls,
        lower: Any,
        upper: Any,
        *,
        precision_bits: int,
        rigorous: bool,
    ) -> ArithmeticScalar:
        return cls(
            "interval",
            lower=str(lower),
            upper=str(upper),
            precision_bits=precision_bits,
            rigorous=_require_bool(rigorous, "interval rigor"),
        )

    @classmethod
    def coerce_exact(cls, value: Any, name: str) -> ArithmeticScalar:
        try:
            return cls.exact(value)
        except BSDValidationError as error:
            raise BSDValidationError(name + " must be an exact rational") from error

    def to_dict(self) -> dict[str, Any]:
        if self.kind == "exact":
            return {
                "kind": "exact",
                "numerator": str(self.numerator),
                "denominator": str(self.denominator),
                "rigorous": True,
            }
        if self.kind == "decimal":
            return {
                "kind": "decimal",
                "value": self.value,
                "precision_bits": self.precision_bits,
                "rigorous": False,
            }
        return {
            "kind": "interval",
            "lower": self.lower,
            "upper": self.upper,
            "precision_bits": self.precision_bits,
            "rigorous": self.rigorous,
        }

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> ArithmeticScalar:
        kind = _require_string(value["kind"], "scalar kind")
        if kind == "exact":
            if _require_bool(value["rigorous"], "exact scalar rigor") is not True:
                raise BSDValidationError("an exact scalar must be rigorous")
            return cls.exact(
                _integer_from_record(value["numerator"], "numerator", minimum=None),
                _integer_from_record(value["denominator"], "denominator", minimum=1),
            )
        if kind == "decimal":
            if _require_bool(value["rigorous"], "decimal scalar rigor") is not False:
                raise BSDValidationError("a point decimal cannot claim rigor")
            return cls.decimal(
                _require_string(value["value"], "decimal value"),
                precision_bits=_require_integer(
                    value["precision_bits"], "precision_bits", minimum=2
                ),
            )
        if kind == "interval":
            return cls.interval(
                _require_string(value["lower"], "interval lower endpoint"),
                _require_string(value["upper"], "interval upper endpoint"),
                precision_bits=_require_integer(
                    value["precision_bits"], "precision_bits", minimum=2
                ),
                rigorous=_require_bool(value["rigorous"], "interval rigor"),
            )
        raise BSDValidationError("unknown scalar kind " + repr(kind))

    def _bounds(self) -> tuple[tuple[int, int], tuple[int, int]]:
        if self.kind == "exact":
            value = (self.numerator, self.denominator)
            return value, value
        if self.kind == "decimal":
            value = _decimal_ratio(self.value)
            return value, value
        return _decimal_ratio(self.lower), _decimal_ratio(self.upper)

    def _bits_with(self, other: ArithmeticScalar) -> int:
        bits = [
            value for value in (self.precision_bits, other.precision_bits) if value > 0
        ]
        return min(bits) if bits else 128

    @staticmethod
    def _from_bounds(
        lower: tuple[int, int],
        upper: tuple[int, int],
        *,
        bits: int,
        interval: bool,
    ) -> ArithmeticScalar:
        if interval:
            return ArithmeticScalar.interval(
                _ratio_decimal(lower, bits),
                _ratio_decimal(upper, bits),
                precision_bits=bits,
                rigorous=False,
            )
        return ArithmeticScalar.decimal(
            _ratio_decimal(lower, bits), precision_bits=bits, rigorous=False
        )

    def add(self, other: ArithmeticScalar) -> ArithmeticScalar:
        if self.kind == "exact" and other.kind == "exact":
            return ArithmeticScalar.exact(
                self.numerator * other.denominator + other.numerator * self.denominator,
                self.denominator * other.denominator,
            )
        bits = self._bits_with(other)
        left_lower, left_upper = self._bounds()
        right_lower, right_upper = other._bounds()
        return self._from_bounds(
            _ratio_add(left_lower, right_lower),
            _ratio_add(left_upper, right_upper),
            bits=bits,
            interval=self.kind == "interval" or other.kind == "interval",
        )

    def negate(self) -> ArithmeticScalar:
        if self.kind == "exact":
            return ArithmeticScalar.exact(-self.numerator, self.denominator)
        if self.kind == "decimal":
            return ArithmeticScalar.decimal(
                _ratio_decimal(
                    _ratio_negate(_decimal_ratio(self.value)), self.precision_bits
                ),
                precision_bits=self.precision_bits,
            )
        return ArithmeticScalar.interval(
            _ratio_decimal(
                _ratio_negate(_decimal_ratio(self.upper)), self.precision_bits
            ),
            _ratio_decimal(
                _ratio_negate(_decimal_ratio(self.lower)), self.precision_bits
            ),
            precision_bits=self.precision_bits,
            rigorous=False,
        )

    def subtract(self, other: ArithmeticScalar) -> ArithmeticScalar:
        return self.add(other.negate())

    def multiply(self, other: ArithmeticScalar) -> ArithmeticScalar:
        if self.kind == "exact" and other.kind == "exact":
            return ArithmeticScalar.exact(
                self.numerator * other.numerator,
                self.denominator * other.denominator,
            )
        bits = self._bits_with(other)
        left_lower, left_upper = self._bounds()
        right_lower, right_upper = other._bounds()
        candidates = (
            _ratio_multiply(left_lower, right_lower),
            _ratio_multiply(left_lower, right_upper),
            _ratio_multiply(left_upper, right_lower),
            _ratio_multiply(left_upper, right_upper),
        )
        lower = candidates[0]
        upper = candidates[0]
        for candidate in candidates[1:]:
            if _ratio_compare(candidate, lower) < 0:
                lower = candidate
            if _ratio_compare(candidate, upper) > 0:
                upper = candidate
        return self._from_bounds(
            lower,
            upper,
            bits=bits,
            interval=self.kind == "interval" or other.kind == "interval",
        )

    def divide(self, other: ArithmeticScalar) -> ArithmeticScalar:
        if other.kind == "exact" and other.numerator == 0:
            raise BSDValidationError("division by a zero BSD factor")
        if self.kind == "exact" and other.kind == "exact":
            sign = -1 if other.numerator < 0 else 1
            return ArithmeticScalar.exact(
                sign * self.numerator * other.denominator,
                abs(other.numerator) * self.denominator,
            )
        bits = self._bits_with(other)
        left_lower, left_upper = self._bounds()
        right_lower, right_upper = other._bounds()
        zero = (0, 1)
        if (
            _ratio_compare(right_lower, zero) <= 0
            and _ratio_compare(zero, right_upper) <= 0
        ):
            raise BSDValidationError("division by an interval containing zero")
        candidates = (
            _ratio_divide(left_lower, right_lower),
            _ratio_divide(left_lower, right_upper),
            _ratio_divide(left_upper, right_lower),
            _ratio_divide(left_upper, right_upper),
        )
        lower = candidates[0]
        upper = candidates[0]
        for candidate in candidates[1:]:
            if _ratio_compare(candidate, lower) < 0:
                lower = candidate
            if _ratio_compare(candidate, upper) > 0:
                upper = candidate
        return self._from_bounds(
            lower,
            upper,
            bits=bits,
            interval=self.kind == "interval" or other.kind == "interval",
        )

    def absolute(self) -> ArithmeticScalar:
        if self.kind == "exact":
            return (
                self.negate()
                if self.numerator < 0
                else ArithmeticScalar.exact(self.numerator, self.denominator)
            )
        if self.is_negative():
            return self.negate()
        if self.contains_zero() and not self.is_zero():
            if self.kind != "interval":
                raise BSDValidationError("unable to resolve the sign of a scalar")
            left = _decimal_ratio(self.lower)
            right = _decimal_ratio(self.upper)
            absolute_left = (abs(left[0]), left[1])
            absolute_right = (abs(right[0]), right[1])
            upper = (
                absolute_left
                if _ratio_compare(absolute_left, absolute_right) >= 0
                else absolute_right
            )
            return ArithmeticScalar.interval(
                "0",
                _ratio_decimal(upper, self.precision_bits),
                precision_bits=self.precision_bits,
                rigorous=False,
            )
        if self.kind == "interval":
            return ArithmeticScalar.interval(
                self.lower,
                self.upper,
                precision_bits=self.precision_bits,
                rigorous=False,
            )
        return ArithmeticScalar.decimal(
            self.value, precision_bits=self.precision_bits, rigorous=False
        )

    def is_zero(self) -> bool:
        if self.kind == "exact":
            return self.numerator == 0
        if self.kind == "decimal":
            return _decimal_ratio(self.value)[0] == 0
        return _decimal_ratio(self.lower)[0] == 0 and _decimal_ratio(self.upper)[0] == 0

    def contains_zero(self) -> bool:
        lower, upper = self._bounds()
        zero = (0, 1)
        return _ratio_compare(lower, zero) <= 0 and _ratio_compare(zero, upper) <= 0

    def is_positive(self) -> bool:
        lower, _upper = self._bounds()
        return _ratio_compare(lower, (0, 1)) > 0

    def is_negative(self) -> bool:
        _lower, upper = self._bounds()
        return _ratio_compare(upper, (0, 1)) < 0

    def consistent_with(self, other: ArithmeticScalar) -> bool:
        if self.kind == "exact" and other.kind == "exact":
            return (
                self.numerator == other.numerator
                and self.denominator == other.denominator
            )
        left_lower, left_upper = self._bounds()
        right_lower, right_upper = other._bounds()
        return (
            _ratio_compare(left_lower, right_upper) <= 0
            and _ratio_compare(right_lower, left_upper) <= 0
        )

    def __str__(self) -> str:
        if self.kind == "exact":
            if self.denominator == 1:
                return str(self.numerator)
            return str(self.numerator) + "/" + str(self.denominator)
        if self.kind == "decimal":
            return self.value
        return "[" + self.lower + ", " + self.upper + "]"


@dataclass(frozen=True)
class RankEvidence:
    """One explicit analytic or algebraic rank status."""

    status: str
    value: int
    provenance: Provenance

    def __post_init__(self) -> None:
        if self.status not in _RANK_STATUSES:
            raise BSDValidationError("unknown rank status " + repr(self.status))
        minimum = -1 if self.status == "indeterminate" else 0
        checked = _require_integer(self.value, "rank", minimum=minimum)
        if self.status == "indeterminate" and checked != -1:
            raise BSDValidationError("an indeterminate rank uses the explicit value -1")
        if self.status != "indeterminate" and checked < 0:
            raise BSDValidationError("a determined rank must be nonnegative")
        object.__setattr__(self, "value", checked)

    @classmethod
    def indeterminate(cls, source: str = "not-computed") -> RankEvidence:
        return cls("indeterminate", -1, Provenance("indeterminate", source))

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "value": self.value,
            "provenance": self.provenance.to_dict(),
        }

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> RankEvidence:
        return cls(
            _require_string(value["status"], "rank status"),
            _require_integer(value["value"], "rank", minimum=-1),
            Provenance.from_dict(value["provenance"]),
        )


def _real_part_as_string(value: Any) -> str:
    if isinstance(value, complex):
        if value.imag != 0:
            raise BSDValidationError("the leading derivative is not real")
        return str(value.real)
    real_attribute = getattr(value, "real", value)
    real_value = real_attribute() if callable(real_attribute) else real_attribute
    imag_attribute = getattr(value, "imag", 0)
    imag_value = imag_attribute() if callable(imag_attribute) else imag_attribute
    try:
        if bool(imag_value != 0):
            raise BSDValidationError("the leading derivative is not real")
    except TypeError as error:
        raise BSDValidationError(
            "unable to certify a real leading derivative"
        ) from error
    return str(real_value)


@dataclass(frozen=True)
class LeadingTermData:
    """The actual raw derivative `L^(r)(1)`, before division by `r!`."""

    rank: RankEvidence
    derivative: ArithmeticScalar
    functional_equation_sign: int
    refinement_status: str
    comparison_derivative: ArithmeticScalar
    provenance: Provenance

    def __post_init__(self) -> None:
        sign = _require_integer(
            self.functional_equation_sign, "functional equation sign", minimum=-1
        )
        if sign not in (-1, 1):
            raise BSDValidationError("functional equation sign must be -1 or 1")
        object.__setattr__(self, "functional_equation_sign", sign)
        if self.rank.status == "indeterminate":
            raise BSDValidationError("a leading derivative requires a determined rank")
        expected_sign = -1 if self.rank.value % 2 else 1
        if sign != expected_sign:
            raise BSDRankMismatchError(
                "functional-equation sign disagrees with the leading-order parity"
            )
        if self.refinement_status not in ("not_supplied", "consistent"):
            raise BSDValidationError("unknown leading-term refinement status")
        if (
            self.refinement_status == "consistent"
            and not self.derivative.consistent_with(self.comparison_derivative)
        ):
            raise BSDValidationError("independent leading derivatives are inconsistent")
        if self.derivative.contains_zero():
            raise BSDValidationError("the purported leading derivative contains zero")

    @classmethod
    def supplied(
        cls,
        rank: int,
        derivative: ArithmeticScalar | Any,
        functional_equation_sign: int,
        *,
        rank_status: str = "supplied",
        provenance: Provenance | None = None,
        comparison_derivative: ArithmeticScalar | None = None,
    ) -> LeadingTermData:
        supplied = Provenance.supplied() if provenance is None else provenance
        scalar = (
            derivative
            if isinstance(derivative, ArithmeticScalar)
            else ArithmeticScalar.coerce_exact(derivative, "leading derivative")
        )
        comparison = (
            ArithmeticScalar.exact(0)
            if comparison_derivative is None
            else comparison_derivative
        )
        return cls(
            RankEvidence(rank_status, rank, supplied),
            scalar,
            functional_equation_sign,
            "not_supplied" if comparison_derivative is None else "consistent",
            comparison,
            supplied,
        )

    @classmethod
    def from_lfunction_init(
        cls,
        initialized_lfunction: Any,
        *,
        provenance: Provenance | None = None,
    ) -> LeadingTermData:
        """Extract a probable raw leading derivative from `LFunctionInit`.

        This is deliberately duck typed to avoid importing the analytic engine
        into the arithmetic schema module.  `LFunctionInit.leading_derivative`
        already rejects an unstabilized or unisolated central jet.
        """
        try:
            diagnostics = initialized_lfunction.diagnostics()
            if not isinstance(diagnostics, dict):
                raise BSDValidationError("LFunctionInit diagnostics are not a record")
            precision_bits = _require_integer(
                diagnostics["precision_bits"], "prepared precision_bits", minimum=2
            )
            central = diagnostics["central"]
            if not isinstance(central, dict):
                raise BSDValidationError("central diagnostics are not a record")
            if not _require_bool(
                central["refinement_stable"], "central refinement stability"
            ):
                raise BSDValidationError("the prepared central jet is not stable")
            rank_value, derivative_value = initialized_lfunction.leading_derivative()
            rank = _require_integer(rank_value, "prepared analytic rank", minimum=0)
            sign = _require_integer(
                initialized_lfunction.curve().root_number(),
                "prepared functional equation sign",
                minimum=-1,
            )
            algorithm = _require_string(
                central["algorithm"], "central algorithm", nonempty=True
            )
            analytic_error_status = _require_string(
                central["analytic_error_status"],
                "central analytic error status",
                nonempty=True,
            )
        except Exception as error:
            raise BSDValidationError(
                "unable to extract a stabilized leading derivative from LFunctionInit"
            ) from error
        source = (
            Provenance(
                "probable",
                "sagejs.LFunctionInit",
                details={
                    "precision_bits": precision_bits,
                    "normalization": "raw L-function derivative at s=1",
                    "algorithm": algorithm,
                    "analytic_error_status": analytic_error_status,
                    "refinement_stable": True,
                },
            )
            if provenance is None
            else provenance
        )
        return cls(
            RankEvidence("probable", rank, source),
            ArithmeticScalar.decimal(
                _real_part_as_string(derivative_value),
                precision_bits=precision_bits,
            ),
            sign,
            "not_supplied",
            ArithmeticScalar.exact(0),
            source,
        )

    def taylor_coefficient(self) -> ArithmeticScalar:
        return self.derivative.divide(
            ArithmeticScalar.exact(_factorial(self.rank.value))
        )

    @property
    def rigorous(self) -> bool:
        return (
            self.derivative.rigorous
            and self.rank.status == "proved"
            and self.provenance.status in {"certified", "proved"}
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "rank": self.rank.to_dict(),
            "derivative": self.derivative.to_dict(),
            "functional_equation_sign": self.functional_equation_sign,
            "refinement_status": self.refinement_status,
            "comparison_derivative": self.comparison_derivative.to_dict(),
            "provenance": self.provenance.to_dict(),
        }

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> LeadingTermData:
        return cls(
            RankEvidence.from_dict(value["rank"]),
            ArithmeticScalar.from_dict(value["derivative"]),
            _require_integer(
                value["functional_equation_sign"],
                "functional equation sign",
                minimum=-1,
            ),
            _require_string(value["refinement_status"], "refinement status"),
            ArithmeticScalar.from_dict(value["comparison_derivative"]),
            Provenance.from_dict(value["provenance"]),
        )


@dataclass(frozen=True)
class PeriodData:
    """A real period together with its differential-lattice normalization."""

    value: ArithmeticScalar
    normalization: str
    real_component_factor: int
    component_factor_included: bool
    differential_basis: str
    provenance: Provenance

    def __post_init__(self) -> None:
        if self.normalization not in _PERIOD_NORMALIZATIONS:
            raise BSDValidationError("unknown period normalization")
        components = _require_integer(
            self.real_component_factor, "real component factor", minimum=1
        )
        object.__setattr__(self, "real_component_factor", components)
        included = _require_bool(
            self.component_factor_included, "period component-factor inclusion"
        )
        object.__setattr__(self, "component_factor_included", included)
        if not self.value.is_positive():
            raise BSDValidationError("the real period is not strictly positive")
        object.__setattr__(
            self,
            "differential_basis",
            _require_string(
                self.differential_basis,
                "period differential basis",
                nonempty=True,
            ),
        )

    @classmethod
    def supplied_neron(
        cls,
        value: ArithmeticScalar | Any,
        *,
        provenance: Provenance | None = None,
        real_component_factor: int,
        differential_basis: str,
        total_omega: bool,
    ) -> PeriodData:
        scalar = (
            value
            if isinstance(value, ArithmeticScalar)
            else ArithmeticScalar.coerce_exact(value, "real period")
        )
        return cls(
            scalar,
            "neron",
            real_component_factor,
            total_omega,
            differential_basis,
            Provenance.supplied() if provenance is None else provenance,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "value": self.value.to_dict(),
            "normalization": self.normalization,
            "real_component_factor": str(self.real_component_factor),
            "component_factor_included": self.component_factor_included,
            "differential_basis": self.differential_basis,
            "provenance": self.provenance.to_dict(),
        }

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> PeriodData:
        return cls(
            ArithmeticScalar.from_dict(value["value"]),
            _require_string(value["normalization"], "period normalization"),
            _integer_from_record(
                value["real_component_factor"], "real component factor", minimum=1
            ),
            _require_bool(
                value["component_factor_included"],
                "period component-factor inclusion",
            ),
            _require_string(
                value["differential_basis"],
                "period differential basis",
                nonempty=True,
            ),
            Provenance.from_dict(value["provenance"]),
        )


def _determinant(matrix: tuple[tuple[ArithmeticScalar, ...], ...]) -> ArithmeticScalar:
    size = len(matrix)
    if size == 0:
        return ArithmeticScalar.exact(1)
    if size == 1:
        return matrix[0][0]
    answer = ArithmeticScalar.exact(0)
    for column in range(size):
        minor = tuple(
            tuple(row[index] for index in range(size) if index != column)
            for row in matrix[1:]
        )
        term = matrix[0][column].multiply(_determinant(minor))
        answer = answer.subtract(term) if column % 2 else answer.add(term)
    return answer


def _coerce_matrix(
    value: Sequence[Sequence[ArithmeticScalar | Any]],
) -> tuple[tuple[ArithmeticScalar, ...], ...]:
    answer = []
    for row in value:
        checked_row = []
        for entry in row:
            checked_row.append(
                entry
                if isinstance(entry, ArithmeticScalar)
                else ArithmeticScalar.coerce_exact(entry, "pairing entry")
            )
        answer.append(tuple(checked_row))
    size = len(answer)
    if any(len(row) != size for row in answer):
        raise BSDRankMismatchError("the height pairing matrix must be square")
    return tuple(answer)


def _validated_pairing_determinants(
    matrix: tuple[tuple[ArithmeticScalar, ...], ...],
    rank: int,
    symmetric: bool,
) -> tuple[ArithmeticScalar, ArithmeticScalar]:
    if len(matrix) != rank:
        raise BSDRankMismatchError(
            "pairing dimension does not equal the supplied/analytic rank"
        )
    if any(len(row) != rank for row in matrix):
        raise BSDRankMismatchError("the height pairing matrix must be square")
    if symmetric:
        for row in range(rank):
            for column in range(row):
                if not matrix[row][column].consistent_with(matrix[column][row]):
                    raise BSDValidationError(
                        "the height pairing matrix is not symmetric"
                    )
        for size in range(1, rank + 1):
            leading = _determinant(tuple(tuple(row[:size]) for row in matrix[:size]))
            if not leading.is_positive():
                raise BSDValidationError(
                    "the symmetric height pairing is not positive definite"
                )
    signed = _determinant(matrix)
    if signed.contains_zero():
        raise BSDValidationError("the supplied pairing matrix is singular")
    return signed, signed.absolute()


@dataclass(frozen=True)
class RegulatorData:
    """A supplied regulator or determinant of a supplied pairing matrix."""

    rank: int
    value: ArithmeticScalar
    signed_determinant: ArithmeticScalar
    source_kind: str
    pairing_matrix: tuple[tuple[ArithmeticScalar, ...], ...]
    symmetric: bool
    pairing_convention: str
    provenance: Provenance

    def __post_init__(self) -> None:
        rank = _require_integer(self.rank, "regulator rank", minimum=0)
        object.__setattr__(self, "rank", rank)
        object.__setattr__(
            self, "symmetric", _require_bool(self.symmetric, "regulator symmetry")
        )
        if self.source_kind not in ("pairing_determinant", "supplied_scalar"):
            raise BSDValidationError("unknown regulator source kind")
        object.__setattr__(
            self,
            "pairing_convention",
            _require_string(
                self.pairing_convention,
                "regulator pairing convention",
                nonempty=True,
            ),
        )
        if not self.value.is_positive():
            raise BSDValidationError("the regulator is not strictly positive")
        if rank == 0 and self.value.to_dict() != ArithmeticScalar.exact(1).to_dict():
            raise BSDValidationError("the rank-zero regulator must be 1")
        if self.source_kind == "pairing_determinant":
            checked = _coerce_matrix(self.pairing_matrix)
            object.__setattr__(self, "pairing_matrix", checked)
            signed, regulator = _validated_pairing_determinants(
                checked, rank, self.symmetric
            )
            if self.signed_determinant.to_dict() != signed.to_dict():
                raise BSDValidationError(
                    "stored signed pairing determinant does not match the matrix"
                )
            if self.value.to_dict() != regulator.to_dict():
                raise BSDValidationError(
                    "stored regulator does not match the pairing determinant"
                )
        else:
            if self.pairing_matrix:
                raise BSDValidationError(
                    "a supplied scalar regulator cannot contain a pairing matrix"
                )
            if self.signed_determinant.to_dict() != self.value.to_dict():
                raise BSDValidationError(
                    "a scalar regulator has inconsistent cached determinant data"
                )

    @classmethod
    def supplied_scalar(
        cls,
        rank: int,
        value: ArithmeticScalar | Any,
        *,
        symmetric: bool = False,
        provenance: Provenance | None = None,
    ) -> RegulatorData:
        scalar = (
            value
            if isinstance(value, ArithmeticScalar)
            else ArithmeticScalar.coerce_exact(value, "regulator")
        )
        return cls(
            rank,
            scalar,
            scalar,
            "supplied_scalar",
            (),
            symmetric,
            "Neron--Tate pairing between A and Adual",
            Provenance.supplied() if provenance is None else provenance,
        )

    @classmethod
    def from_pairing(
        cls,
        rank: int,
        pairing_matrix: Sequence[Sequence[ArithmeticScalar | Any]],
        *,
        symmetric: bool,
        provenance: Provenance | None = None,
    ) -> RegulatorData:
        checked = _coerce_matrix(pairing_matrix)
        expected = _require_integer(rank, "regulator rank", minimum=0)
        signed, regulator = _validated_pairing_determinants(
            checked, expected, symmetric
        )
        source = Provenance.supplied() if provenance is None else provenance
        return cls(
            expected,
            regulator,
            signed,
            "pairing_determinant",
            checked,
            symmetric,
            (
                "<P,Q> = (hat_h(P+Q)-hat_h(P)-hat_h(Q))/2"
                if symmetric
                else "Neron--Tate pairing between A(Q) and Adual(Q)"
            ),
            source,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "rank": self.rank,
            "value": self.value.to_dict(),
            "signed_determinant": self.signed_determinant.to_dict(),
            "source_kind": self.source_kind,
            "pairing_matrix": [
                [entry.to_dict() for entry in row] for row in self.pairing_matrix
            ],
            "symmetric": self.symmetric,
            "pairing_convention": self.pairing_convention,
            "provenance": self.provenance.to_dict(),
        }

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> RegulatorData:
        matrix = tuple(
            tuple(ArithmeticScalar.from_dict(entry) for entry in row)
            for row in value.get("pairing_matrix", [])
        )
        rank = _require_integer(value["rank"], "regulator rank", minimum=0)
        symmetric = _require_bool(value["symmetric"], "regulator symmetry")
        provenance = Provenance.from_dict(value["provenance"])
        source_kind = _require_string(value["source_kind"], "regulator source kind")
        if source_kind == "pairing_determinant":
            result = cls.from_pairing(
                rank, matrix, symmetric=symmetric, provenance=provenance
            )
        elif source_kind == "supplied_scalar":
            result = cls.supplied_scalar(
                rank,
                ArithmeticScalar.from_dict(value["value"]),
                symmetric=symmetric,
                provenance=provenance,
            )
        else:
            raise BSDValidationError("unknown regulator source kind")
        if result.to_dict() != dict(value):
            raise BSDValidationError(
                "serialized regulator fields do not match exact recomputation"
            )
        return result


@dataclass(frozen=True)
class TorsionData:
    """One exact supplied torsion order with an independent provenance slot."""

    order: int
    provenance: Provenance
    completeness: str = "exact"

    def __post_init__(self) -> None:
        object.__setattr__(
            self, "order", _require_integer(self.order, "torsion order", minimum=1)
        )
        if self.completeness != "exact":
            raise BSDValidationError("a BSD torsion factor must be an exact order")
        if self.provenance.status not in {
            "certified",
            "computed",
            "proved",
            "supplied",
        }:
            raise BSDValidationError(
                "an exact torsion order cannot have bounded or indeterminate provenance"
            )

    def to_dict(self) -> dict[str, Any]:
        return {
            "order": str(self.order),
            "completeness": self.completeness,
            "provenance": self.provenance.to_dict(),
        }

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> TorsionData:
        return cls(
            _integer_from_record(value["order"], "torsion order", minimum=1),
            Provenance.from_dict(value["provenance"]),
            _require_string(value["completeness"], "torsion completeness"),
        )


@dataclass(frozen=True)
class TamagawaFactor:
    """The rational component-group order `#Phi_p(F_p)` at one prime."""

    prime: int
    order: int
    provenance: Provenance

    def __post_init__(self) -> None:
        prime = _require_integer(self.prime, "Tamagawa prime", minimum=2)
        if not _is_prime(prime):
            raise BSDValidationError("a Tamagawa key is not prime: " + str(prime))
        object.__setattr__(self, "prime", prime)
        object.__setattr__(
            self,
            "order",
            _require_integer(self.order, "Tamagawa number", minimum=1),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "prime": str(self.prime),
            "order": str(self.order),
            "provenance": self.provenance.to_dict(),
        }

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> TamagawaFactor:
        return cls(
            _integer_from_record(value["prime"], "Tamagawa prime", minimum=2),
            _integer_from_record(value["order"], "Tamagawa number", minimum=1),
            Provenance.from_dict(value["provenance"]),
        )


@dataclass(frozen=True)
class TamagawaData:
    """Atomic global Tamagawa coverage and its rational local factors."""

    factors: tuple[TamagawaFactor, ...]
    certified_bad_primes: tuple[int, ...]
    coverage: str
    provenance: Provenance
    override_provenance: Provenance

    def __post_init__(self) -> None:
        if self.coverage not in _TAMAGAWA_COVERAGE:
            raise BSDValidationError("unknown Tamagawa coverage status")
        sorted_factors = tuple(sorted(self.factors, key=lambda factor: factor.prime))
        if len({factor.prime for factor in sorted_factors}) != len(sorted_factors):
            raise BSDValidationError("duplicate Tamagawa prime")
        bad_primes = tuple(
            sorted(
                _require_integer(prime, "bad prime", minimum=2)
                for prime in self.certified_bad_primes
            )
        )
        if len(set(bad_primes)) != len(bad_primes):
            raise BSDValidationError("duplicate certified bad prime")
        if any(not _is_prime(prime) for prime in bad_primes):
            raise BSDValidationError(
                "the certified bad-prime list contains a composite"
            )
        object.__setattr__(self, "factors", sorted_factors)
        object.__setattr__(self, "certified_bad_primes", bad_primes)
        if self.coverage == "override" and self.override_provenance.status in {
            "indeterminate",
            "unsupported",
        }:
            raise BSDValidationError(
                "a global Tamagawa override needs positive provenance"
            )

    @classmethod
    def supplied(
        cls,
        numbers: Mapping[Any, Any],
        *,
        bad_primes: Iterable[Any],
        coverage: str = "complete",
        provenance: Provenance | None = None,
        override_provenance: Provenance | None = None,
    ) -> TamagawaData:
        source = Provenance.supplied() if provenance is None else provenance
        factors = tuple(
            TamagawaFactor(
                _require_integer(prime, "Tamagawa prime", minimum=2),
                _require_integer(order, "Tamagawa number", minimum=1),
                source,
            )
            for prime, order in numbers.items()
        )
        override = (
            Provenance("indeterminate", "no-global-override")
            if override_provenance is None
            else override_provenance
        )
        return cls(
            factors,
            tuple(
                _require_integer(prime, "bad prime", minimum=2) for prime in bad_primes
            ),
            coverage,
            source,
            override,
        )

    def validate_complete(self) -> None:
        factor_primes = {factor.prime for factor in self.factors}
        missing = sorted(set(self.certified_bad_primes) - factor_primes)
        if missing:
            raise BSDIncompleteDataError(
                "missing Tamagawa numbers at bad primes " + repr(tuple(missing))
            )
        unexpected = sorted(factor_primes - set(self.certified_bad_primes))
        if unexpected:
            raise BSDIncompleteDataError(
                "Tamagawa factors include primes not certified bad "
                + repr(tuple(unexpected))
            )
        if self.coverage == "incomplete":
            raise BSDIncompleteDataError(
                "global Tamagawa coverage is explicitly incomplete"
            )

    def product(self) -> int:
        self.validate_complete()
        answer = 1
        for factor in self.factors:
            answer *= factor.order
        return answer

    def to_dict(self) -> dict[str, Any]:
        return {
            "factors": [factor.to_dict() for factor in self.factors],
            "certified_bad_primes": [str(prime) for prime in self.certified_bad_primes],
            "coverage": self.coverage,
            "provenance": self.provenance.to_dict(),
            "override_provenance": self.override_provenance.to_dict(),
        }

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> TamagawaData:
        return cls(
            tuple(TamagawaFactor.from_dict(item) for item in value["factors"]),
            tuple(
                _integer_from_record(item, "bad prime", minimum=2)
                for item in value["certified_bad_primes"]
            ),
            _require_string(value["coverage"], "Tamagawa coverage"),
            Provenance.from_dict(value["provenance"]),
            Provenance.from_dict(value["override_provenance"]),
        )


def _record_sha256(value: Any) -> str:
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def _subgroup_binding_digests(
    *,
    object_kind: str,
    model_status: str,
    curve_model: Mapping[str, Any],
    rank: int,
    subgroup_status: str,
    basis_status: str,
    subgroup_basis: Sequence[Any],
    regulator: RegulatorData,
) -> tuple[str, str, str]:
    object_record = {
        "object_kind": object_kind,
        "model_status": model_status,
        "object_model": _json_safe(curve_model, "curve model"),
    }
    basis_record = {
        "rank": rank,
        "subgroup_status": subgroup_status,
        "basis_status": basis_status,
        "basis": _json_safe(list(subgroup_basis), "subgroup basis"),
    }
    return (
        _record_sha256(object_record),
        _record_sha256(basis_record),
        _record_sha256(regulator.to_dict()),
    )


@dataclass(frozen=True)
class SubgroupIndexCertificate:
    """Typed binding of an index verification to object, basis, and regulator."""

    method: str
    verifier: str
    certified_index: int
    object_sha256: str
    basis_sha256: str
    regulator_sha256: str
    evidence: Mapping[str, Any]

    def __post_init__(self) -> None:
        object.__setattr__(
            self, "method", _require_string(self.method, "index method", nonempty=True)
        )
        object.__setattr__(
            self,
            "verifier",
            _require_string(self.verifier, "index verifier", nonempty=True),
        )
        object.__setattr__(
            self,
            "certified_index",
            _require_integer(
                self.certified_index, "certified subgroup index", minimum=1
            ),
        )
        for field_name in ("object_sha256", "basis_sha256", "regulator_sha256"):
            digest = _require_string(
                getattr(self, field_name), field_name, nonempty=True
            )
            if len(digest) != 64 or any(
                character not in "0123456789abcdef" for character in digest
            ):
                raise BSDValidationError(field_name + " must be a lowercase SHA-256")
        object.__setattr__(
            self, "evidence", _json_safe(self.evidence, "index evidence")
        )

    @classmethod
    def bind_components(
        cls,
        *,
        object_kind: str,
        model_status: str,
        curve_model: Mapping[str, Any],
        rank: int,
        subgroup_status: str,
        basis_status: str,
        subgroup_basis: Sequence[Any],
        regulator: RegulatorData,
        certified_index: Any,
        method: str,
        verifier: str,
        evidence: Mapping[str, Any],
    ) -> SubgroupIndexCertificate:
        if basis_status != "supplied":
            raise BSDValidationError(
                "an index certificate must bind an explicit subgroup basis"
            )
        object_digest, basis_digest, regulator_digest = _subgroup_binding_digests(
            object_kind=object_kind,
            model_status=model_status,
            curve_model=curve_model,
            rank=rank,
            subgroup_status=subgroup_status,
            basis_status=basis_status,
            subgroup_basis=subgroup_basis,
            regulator=regulator,
        )
        return cls(
            method,
            verifier,
            _require_integer(certified_index, "certified subgroup index", minimum=1),
            object_digest,
            basis_digest,
            regulator_digest,
            evidence,
        )

    @classmethod
    def bind(
        cls,
        arithmetic_input: BSDArithmeticInput,
        *,
        certified_index: Any,
        method: str,
        verifier: str,
        evidence: Mapping[str, Any],
    ) -> SubgroupIndexCertificate:
        return cls.bind_components(
            object_kind=arithmetic_input.object_kind,
            model_status=arithmetic_input.model_status,
            curve_model=arithmetic_input.curve_model,
            rank=arithmetic_input.leading_term.rank.value,
            subgroup_status=arithmetic_input.subgroup_status,
            basis_status=arithmetic_input.basis_status,
            subgroup_basis=arithmetic_input.subgroup_basis,
            regulator=arithmetic_input.regulator,
            certified_index=certified_index,
            method=method,
            verifier=verifier,
            evidence=evidence,
        )

    def verify_binding(self, arithmetic_input: BSDArithmeticInput) -> None:
        expected = _subgroup_binding_digests(
            object_kind=arithmetic_input.object_kind,
            model_status=arithmetic_input.model_status,
            curve_model=arithmetic_input.curve_model,
            rank=arithmetic_input.leading_term.rank.value,
            subgroup_status=arithmetic_input.subgroup_status,
            basis_status=arithmetic_input.basis_status,
            subgroup_basis=arithmetic_input.subgroup_basis,
            regulator=arithmetic_input.regulator,
        )
        if expected != (
            self.object_sha256,
            self.basis_sha256,
            self.regulator_sha256,
        ):
            raise BSDValidationError(
                "subgroup-index certificate is bound to another object, basis, or regulator"
            )

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": SUBGROUP_INDEX_CERTIFICATE_SCHEMA,
            "method": self.method,
            "verifier": self.verifier,
            "certified_index": str(self.certified_index),
            "object_sha256": self.object_sha256,
            "basis_sha256": self.basis_sha256,
            "regulator_sha256": self.regulator_sha256,
            "evidence": dict(self.evidence),
        }

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> SubgroupIndexCertificate:
        if value.get("schema") != SUBGROUP_INDEX_CERTIFICATE_SCHEMA:
            raise BSDValidationError("unknown subgroup-index certificate schema")
        return cls(
            _require_string(value["method"], "index method", nonempty=True),
            _require_string(value["verifier"], "index verifier", nonempty=True),
            _integer_from_record(
                value["certified_index"], "certified subgroup index", minimum=1
            ),
            _require_string(value["object_sha256"], "object_sha256", nonempty=True),
            _require_string(value["basis_sha256"], "basis_sha256", nonempty=True),
            _require_string(
                value["regulator_sha256"], "regulator_sha256", nonempty=True
            ),
            value["evidence"],
        )


@dataclass(frozen=True)
class SubgroupIndexData:
    """An explicit unknown index or a certified positive subgroup index."""

    status: str
    value: int
    certificate: SubgroupIndexCertificate | None
    provenance: Provenance

    def __post_init__(self) -> None:
        if self.status not in ("unknown", "certified"):
            raise BSDValidationError("unknown subgroup-index status")
        minimum = 0 if self.status == "unknown" else 1
        checked = _require_integer(self.value, "subgroup index", minimum=minimum)
        if self.status == "unknown" and checked != 0:
            raise BSDValidationError("an unknown subgroup index uses explicit value 0")
        if self.status == "certified" and not isinstance(
            self.certificate, SubgroupIndexCertificate
        ):
            raise BSDValidationError(
                "a certified subgroup index needs a typed binding certificate"
            )
        if (
            self.status == "certified"
            and isinstance(self.certificate, SubgroupIndexCertificate)
            and self.certificate.certified_index != checked
        ):
            raise BSDValidationError(
                "the typed certificate does not authenticate this subgroup index"
            )
        if self.status == "unknown" and self.certificate is not None:
            raise BSDValidationError(
                "an unknown subgroup index cannot have a certificate"
            )
        object.__setattr__(self, "value", checked)

    @classmethod
    def unknown(cls) -> SubgroupIndexData:
        return cls(
            "unknown",
            0,
            None,
            Provenance("indeterminate", "subgroup-index-not-certified"),
        )

    @classmethod
    def certified(
        cls,
        value: Any,
        certificate: SubgroupIndexCertificate,
        *,
        provenance: Provenance | None = None,
    ) -> SubgroupIndexData:
        return cls(
            "certified",
            _require_integer(value, "subgroup index", minimum=1),
            certificate,
            Provenance("certified", "supplied-index-certificate")
            if provenance is None
            else provenance,
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "status": self.status,
            "value": str(self.value),
            "certificate_status": ("absent" if self.certificate is None else "present"),
            "certificate": (
                {} if self.certificate is None else self.certificate.to_dict()
            ),
            "provenance": self.provenance.to_dict(),
        }

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> SubgroupIndexData:
        status = _require_string(value["status"], "subgroup-index status")
        certificate_status = _require_string(
            value["certificate_status"], "subgroup certificate status"
        )
        if certificate_status == "absent":
            certificate = None
            if value["certificate"] != {}:
                raise BSDValidationError("an absent subgroup certificate must be empty")
        elif certificate_status == "present":
            certificate = SubgroupIndexCertificate.from_dict(value["certificate"])
        else:
            raise BSDValidationError("unknown subgroup certificate status")
        return cls(
            status,
            _integer_from_record(value["value"], "subgroup index", minimum=0),
            certificate,
            Provenance.from_dict(value["provenance"]),
        )


@dataclass(frozen=True)
class PolarizationData:
    """The dual-group identification used by the quotient."""

    kind: str
    principal: bool
    degree: int
    provenance: Provenance

    def __post_init__(self) -> None:
        object.__setattr__(
            self,
            "principal",
            _require_bool(self.principal, "principal polarization status"),
        )
        if self.kind not in ("canonical_jacobian", "generic", "supplied_principal"):
            raise BSDValidationError("unknown polarization kind")
        degree = _require_integer(self.degree, "polarization degree", minimum=0)
        if self.principal and degree != 1:
            raise BSDValidationError("a principal polarization has degree 1")
        if not self.principal and degree == 1:
            raise BSDValidationError("degree 1 must be recorded as principal")
        object.__setattr__(self, "degree", degree)

    @classmethod
    def generic(cls) -> PolarizationData:
        return cls("generic", False, 0, Provenance("indeterminate", "not-specified"))

    @classmethod
    def canonical_jacobian(cls) -> PolarizationData:
        return cls(
            "canonical_jacobian",
            True,
            1,
            Provenance("proved", "canonical-principal-polarization"),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "principal": self.principal,
            "degree": str(self.degree),
            "provenance": self.provenance.to_dict(),
        }

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> PolarizationData:
        return cls(
            _require_string(value["kind"], "polarization kind"),
            _require_bool(value["principal"], "principal polarization status"),
            _integer_from_record(value["degree"], "polarization degree", minimum=0),
            Provenance.from_dict(value["provenance"]),
        )


@dataclass(frozen=True)
class BSDArithmeticInput:
    """All normalized factors required for atomic supplied-data assembly."""

    object_kind: str
    model_status: str
    curve_model: Mapping[str, Any]
    leading_term: LeadingTermData
    algebraic_rank: RankEvidence
    period: PeriodData
    regulator: RegulatorData
    tamagawa: TamagawaData
    torsion_a: TorsionData
    torsion_adual: TorsionData
    polarization: PolarizationData
    subgroup_status: str
    subgroup_provenance: Provenance
    basis_status: str
    subgroup_basis: tuple[Any, ...]
    subgroup_index: SubgroupIndexData
    backend_versions: Mapping[str, Any]

    def __post_init__(self) -> None:
        if self.object_kind not in ("abelian_variety", "hyperelliptic_jacobian"):
            raise BSDValidationError("unknown BSD object kind")
        if self.model_status not in ("not_supplied", "supplied"):
            raise BSDValidationError("unknown curve-model status")
        checked_model = _json_safe(self.curve_model, "curve model")
        if self.model_status == "supplied" and not checked_model:
            raise BSDValidationError("a supplied model must not be empty")
        checked_backends = _json_safe(self.backend_versions, "backend versions")
        object.__setattr__(self, "curve_model", checked_model)
        object.__setattr__(self, "backend_versions", checked_backends)
        rank = self.leading_term.rank.value
        if (
            self.algebraic_rank.status != "indeterminate"
            and self.algebraic_rank.value != rank
        ):
            raise BSDRankMismatchError(
                "probable analytic rank disagrees with supplied/proved algebraic rank"
            )
        if self.regulator.rank != rank:
            raise BSDRankMismatchError(
                "regulator rank does not equal the leading-term rank"
            )
        if self.subgroup_status not in _SUBGROUP_STATUSES:
            raise BSDValidationError("unknown Mordell--Weil subgroup status")
        if self.basis_status not in {"not_supplied", "supplied"}:
            raise BSDValidationError("unknown subgroup-basis status")
        checked_basis = tuple(_json_safe(list(self.subgroup_basis), "subgroup basis"))
        object.__setattr__(self, "subgroup_basis", checked_basis)
        if self.basis_status == "not_supplied" and checked_basis:
            raise BSDValidationError("a non-supplied subgroup basis must be empty")
        if self.basis_status == "supplied" and len(checked_basis) != rank:
            raise BSDRankMismatchError(
                "the supplied subgroup basis size does not equal the rank"
            )
        if self.subgroup_index.status == "certified":
            certificate = self.subgroup_index.certificate
            if certificate is None:
                raise BSDValidationError("certified subgroup index has no certificate")
            certificate.verify_binding(self)
        if self.subgroup_status == "full_mordell_weil" and (
            self.subgroup_index.status != "certified" or self.subgroup_index.value != 1
        ):
            raise BSDValidationError(
                "a full Mordell--Weil basis must carry certified subgroup index 1"
            )
        if (
            self.object_kind == "abelian_variety"
            and self.subgroup_status != "full_mordell_weil"
        ):
            raise BSDValidationError(
                "generic BSD input currently requires full A and Adual Mordell--Weil bases"
            )
        if self.object_kind == "abelian_variety" and self.basis_status == "supplied":
            for basis_pair in checked_basis:
                if (
                    not isinstance(basis_pair, dict)
                    or "a" not in basis_pair
                    or "adual" not in basis_pair
                ):
                    raise BSDValidationError(
                        "each generic basis record must contain separate 'a' and 'adual' entries"
                    )
        if self.object_kind == "hyperelliptic_jacobian":
            if not self.polarization.principal:
                raise BSDValidationError(
                    "a Jacobian specialization needs the canonical principal polarization"
                )
            if self.torsion_a.order != self.torsion_adual.order:
                raise BSDValidationError(
                    "principal-polarization torsion factors must agree"
                )
            if not self.regulator.symmetric:
                raise BSDValidationError("a Jacobian height pairing must be symmetric")

    @staticmethod
    def _checked_basis(
        rank: int, subgroup_basis: Sequence[Any] | None
    ) -> tuple[str, tuple[Any, ...]]:
        if subgroup_basis is None:
            if rank == 0:
                return "supplied", ()
            return "not_supplied", ()
        checked = tuple(_json_safe(list(subgroup_basis), "subgroup basis"))
        if len(checked) != rank:
            raise BSDRankMismatchError(
                "the supplied subgroup basis size does not equal the rank"
            )
        return "supplied", checked

    @staticmethod
    def _resolved_index(
        supplied_index: SubgroupIndexData | None,
        *,
        object_kind: str,
        model_status: str,
        curve_model: Mapping[str, Any],
        rank: int,
        subgroup_status: str,
        basis_status: str,
        subgroup_basis: Sequence[Any],
        regulator: RegulatorData,
        provenance: Provenance,
    ) -> SubgroupIndexData:
        if supplied_index is not None:
            return supplied_index
        if subgroup_status != "full_mordell_weil":
            return SubgroupIndexData.unknown()
        certificate = SubgroupIndexCertificate.bind_components(
            object_kind=object_kind,
            model_status=model_status,
            curve_model=curve_model,
            rank=rank,
            subgroup_status=subgroup_status,
            basis_status=basis_status,
            subgroup_basis=subgroup_basis,
            regulator=regulator,
            certified_index=1,
            method="declared-full-mordell-weil-basis",
            verifier="supplied-arithmetic-data",
            evidence={"index": "1", "reason": "basis declared full Mordell--Weil"},
        )
        return SubgroupIndexData.certified(1, certificate, provenance=provenance)

    @staticmethod
    def _regulator(
        rank: int,
        regulator: ArithmeticScalar | Any | None,
        height_pairing: Sequence[Sequence[ArithmeticScalar | Any]] | None,
        *,
        symmetric: bool,
        provenance: Provenance,
    ) -> RegulatorData:
        if rank == 0 and regulator is None and height_pairing is None:
            regulator = ArithmeticScalar.exact(1)
        if (regulator is None) == (height_pairing is None):
            raise BSDValidationError(
                "supply exactly one of regulator and height_pairing"
            )
        if height_pairing is not None:
            return RegulatorData.from_pairing(
                rank, height_pairing, symmetric=symmetric, provenance=provenance
            )
        return RegulatorData.supplied_scalar(
            rank,
            regulator,
            symmetric=symmetric,
            provenance=provenance,
        )

    @classmethod
    def supplied_generic(
        cls,
        *,
        leading_term: LeadingTermData,
        real_period: ArithmeticScalar | Any,
        tamagawa_numbers: Mapping[Any, Any],
        bad_primes: Iterable[Any],
        torsion_order: Any,
        dual_torsion_order: Any,
        real_component_factor: Any,
        period_differential_basis: str,
        real_period_is_total: bool,
        regulator: ArithmeticScalar | Any | None = None,
        height_pairing: Sequence[Sequence[ArithmeticScalar | Any]] | None = None,
        algebraic_rank: RankEvidence | None = None,
        subgroup_status: str = "full_mordell_weil",
        subgroup_basis: Sequence[Any] | None = None,
        subgroup_index: SubgroupIndexData | None = None,
        curve_model: Mapping[str, Any] | None = None,
        backend_versions: Mapping[str, Any] | None = None,
        provenance: Provenance | None = None,
        tamagawa_coverage: str = "complete",
        tamagawa_override: Provenance | None = None,
    ) -> BSDArithmeticInput:
        source = Provenance.supplied() if provenance is None else provenance
        rank = leading_term.rank.value
        if subgroup_status != "full_mordell_weil":
            raise BSDValidationError(
                "generic BSD input currently requires full A and Adual Mordell--Weil bases"
            )
        model_status = "not_supplied" if curve_model is None else "supplied"
        model = {} if curve_model is None else curve_model
        basis_status, basis = cls._checked_basis(rank, subgroup_basis)
        period = PeriodData.supplied_neron(
            real_period,
            provenance=source,
            real_component_factor=_require_integer(
                real_component_factor, "real component factor", minimum=1
            ),
            differential_basis=_require_string(
                period_differential_basis,
                "period differential basis",
                nonempty=True,
            ),
            total_omega=_require_bool(
                real_period_is_total, "real period total-Omega status"
            ),
        )
        regulator_data = cls._regulator(
            rank,
            regulator,
            height_pairing,
            symmetric=False,
            provenance=source,
        )
        index_data = cls._resolved_index(
            subgroup_index,
            object_kind="abelian_variety",
            model_status=model_status,
            curve_model=model,
            rank=rank,
            subgroup_status=subgroup_status,
            basis_status=basis_status,
            subgroup_basis=basis,
            regulator=regulator_data,
            provenance=source,
        )
        return cls(
            "abelian_variety",
            model_status,
            model,
            leading_term,
            RankEvidence.indeterminate() if algebraic_rank is None else algebraic_rank,
            period,
            regulator_data,
            TamagawaData.supplied(
                tamagawa_numbers,
                bad_primes=bad_primes,
                coverage=tamagawa_coverage,
                provenance=source,
                override_provenance=tamagawa_override,
            ),
            TorsionData(torsion_order, source),
            TorsionData(dual_torsion_order, source),
            PolarizationData.generic(),
            subgroup_status,
            source,
            basis_status,
            basis,
            index_data,
            {} if backend_versions is None else backend_versions,
        )

    @classmethod
    def supplied_jacobian(
        cls,
        *,
        leading_term: LeadingTermData,
        real_period: ArithmeticScalar | Any,
        tamagawa_numbers: Mapping[Any, Any],
        bad_primes: Iterable[Any],
        torsion_order: Any,
        real_component_factor: Any,
        period_differential_basis: str,
        real_period_is_total: bool,
        regulator: ArithmeticScalar | Any | None = None,
        height_pairing: Sequence[Sequence[ArithmeticScalar | Any]] | None = None,
        algebraic_rank: RankEvidence | None = None,
        subgroup_status: str = "auto",
        subgroup_basis: Sequence[Any] | None = None,
        subgroup_index: SubgroupIndexData | None = None,
        curve_model: Mapping[str, Any] | None = None,
        backend_versions: Mapping[str, Any] | None = None,
        provenance: Provenance | None = None,
        tamagawa_coverage: str = "complete",
        tamagawa_override: Provenance | None = None,
    ) -> BSDArithmeticInput:
        source = Provenance.supplied() if provenance is None else provenance
        rank = leading_term.rank.value
        resolved_subgroup_status = (
            "full_mordell_weil"
            if subgroup_status == "auto" and rank == 0
            else (
                "full_rank_finite_index"
                if subgroup_status == "auto"
                else subgroup_status
            )
        )
        model_status = "not_supplied" if curve_model is None else "supplied"
        model = {} if curve_model is None else curve_model
        basis_status, basis = cls._checked_basis(rank, subgroup_basis)
        period = PeriodData.supplied_neron(
            real_period,
            provenance=source,
            real_component_factor=_require_integer(
                real_component_factor, "real component factor", minimum=1
            ),
            differential_basis=_require_string(
                period_differential_basis,
                "period differential basis",
                nonempty=True,
            ),
            total_omega=_require_bool(
                real_period_is_total, "real period total-Omega status"
            ),
        )
        regulator_data = cls._regulator(
            rank,
            regulator,
            height_pairing,
            symmetric=True,
            provenance=source,
        )
        index_data = cls._resolved_index(
            subgroup_index,
            object_kind="hyperelliptic_jacobian",
            model_status=model_status,
            curve_model=model,
            rank=rank,
            subgroup_status=resolved_subgroup_status,
            basis_status=basis_status,
            subgroup_basis=basis,
            regulator=regulator_data,
            provenance=source,
        )
        torsion = TorsionData(torsion_order, source)
        return cls(
            "hyperelliptic_jacobian",
            model_status,
            model,
            leading_term,
            RankEvidence.indeterminate() if algebraic_rank is None else algebraic_rank,
            period,
            regulator_data,
            TamagawaData.supplied(
                tamagawa_numbers,
                bad_primes=bad_primes,
                coverage=tamagawa_coverage,
                provenance=source,
                override_provenance=tamagawa_override,
            ),
            torsion,
            torsion,
            PolarizationData.canonical_jacobian(),
            resolved_subgroup_status,
            source,
            basis_status,
            basis,
            index_data,
            {} if backend_versions is None else backend_versions,
        )

    def with_subgroup_index(self, index: SubgroupIndexData) -> BSDArithmeticInput:
        return BSDArithmeticInput(
            self.object_kind,
            self.model_status,
            self.curve_model,
            self.leading_term,
            self.algebraic_rank,
            self.period,
            self.regulator,
            self.tamagawa,
            self.torsion_a,
            self.torsion_adual,
            self.polarization,
            self.subgroup_status,
            self.subgroup_provenance,
            self.basis_status,
            self.subgroup_basis,
            index,
            self.backend_versions,
        )

    def validate_complete(self) -> None:
        if self.model_status != "supplied" or not self.curve_model:
            raise BSDIncompleteDataError(
                "a complete BSD quotient requires a reproducible nonempty object model"
            )
        if not self.backend_versions:
            raise BSDIncompleteDataError(
                "a complete BSD quotient requires backend/version provenance"
            )
        if self.period.normalization != "neron":
            raise BSDIncompleteDataError(
                "the BSD quotient requires a Neron-normalized real period"
            )
        if not self.period.component_factor_included:
            raise BSDIncompleteDataError(
                "the supplied real period must be total Omega including its component factor"
            )
        if self.basis_status != "supplied":
            raise BSDIncompleteDataError(
                "a complete BSD quotient requires a reproducible subgroup basis"
            )
        if self.subgroup_status == "arbitrary":
            raise BSDIncompleteDataError(
                "the regulator does not belong to a recorded full-rank subgroup"
            )
        self.tamagawa.validate_complete()

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": BSD_INPUT_SCHEMA,
            "object_kind": self.object_kind,
            "model_status": self.model_status,
            "curve_model": dict(self.curve_model),
            "leading_term": self.leading_term.to_dict(),
            "algebraic_rank": self.algebraic_rank.to_dict(),
            "period": self.period.to_dict(),
            "regulator": self.regulator.to_dict(),
            "tamagawa": self.tamagawa.to_dict(),
            "torsion_a": self.torsion_a.to_dict(),
            "torsion_adual": self.torsion_adual.to_dict(),
            "polarization": self.polarization.to_dict(),
            "subgroup_status": self.subgroup_status,
            "subgroup_provenance": self.subgroup_provenance.to_dict(),
            "basis_status": self.basis_status,
            "subgroup_basis": list(self.subgroup_basis),
            "subgroup_index": self.subgroup_index.to_dict(),
            "backend_versions": dict(self.backend_versions),
        }

    def to_json(self) -> str:
        return _canonical_json(self.to_dict())

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> BSDArithmeticInput:
        if value.get("schema") != BSD_INPUT_SCHEMA:
            raise BSDValidationError("unknown BSD arithmetic input schema")
        return cls(
            _require_string(value["object_kind"], "BSD object kind"),
            _require_string(value["model_status"], "object-model status"),
            value["curve_model"],
            LeadingTermData.from_dict(value["leading_term"]),
            RankEvidence.from_dict(value["algebraic_rank"]),
            PeriodData.from_dict(value["period"]),
            RegulatorData.from_dict(value["regulator"]),
            TamagawaData.from_dict(value["tamagawa"]),
            TorsionData.from_dict(value["torsion_a"]),
            TorsionData.from_dict(value["torsion_adual"]),
            PolarizationData.from_dict(value["polarization"]),
            _require_string(value["subgroup_status"], "subgroup status"),
            Provenance.from_dict(value["subgroup_provenance"]),
            _require_string(value["basis_status"], "basis status"),
            tuple(value["subgroup_basis"]),
            SubgroupIndexData.from_dict(value["subgroup_index"]),
            value["backend_versions"],
        )

    @classmethod
    def from_json(cls, value: str) -> BSDArithmeticInput:
        try:
            record = json.loads(value)
        except (TypeError, json.JSONDecodeError) as error:
            raise BSDValidationError(
                "unable to decode BSD arithmetic input JSON"
            ) from error
        if not isinstance(record, dict):
            raise BSDValidationError("BSD arithmetic input JSON must contain an object")
        return cls.from_dict(record)


class BSDAnalyticQuotient:
    """A complete factor-by-factor supplied-data BSD quotient."""

    def __init__(self, arithmetic_input: BSDArithmeticInput) -> None:
        arithmetic_input.validate_complete()
        self.input = arithmetic_input
        self._leading_taylor = arithmetic_input.leading_term.taylor_coefficient()
        self._torsion_product = ArithmeticScalar.exact(
            arithmetic_input.torsion_a.order * arithmetic_input.torsion_adual.order
        )
        self._tamagawa_product = arithmetic_input.tamagawa.product()
        self._numerator = self._leading_taylor.multiply(self._torsion_product)
        self._denominator = arithmetic_input.period.value.multiply(
            arithmetic_input.regulator.value
        ).multiply(ArithmeticScalar.exact(self._tamagawa_product))
        self._quotient = self._numerator.divide(self._denominator)

    def leading_derivative(self) -> ArithmeticScalar:
        return self.input.leading_term.derivative

    def leading_taylor_coefficient(self) -> ArithmeticScalar:
        return self._leading_taylor

    def regulator(self) -> ArithmeticScalar:
        return self.input.regulator.value

    def tamagawa_product(self) -> int:
        return self._tamagawa_product

    def numerator(self) -> ArithmeticScalar:
        return self._numerator

    def denominator(self) -> ArithmeticScalar:
        return self._denominator

    def bsd_quotient(self) -> ArithmeticScalar:
        return self._quotient

    def sha_over_index_squared(self) -> ArithmeticScalar:
        if self.input.object_kind != "hyperelliptic_jacobian":
            raise BSDValidationError(
                "sha_over_index_squared requires a recorded principal Jacobian"
            )
        return self._quotient

    def analytic_sha(self) -> ArithmeticScalar:
        if self.input.object_kind != "hyperelliptic_jacobian":
            raise BSDValidationError(
                "analytic_sha requires a recorded principal Jacobian"
            )
        index = self.input.subgroup_index
        if index.status != "certified":
            raise BSDSubgroupIndexUnknownError(
                "analytic_sha requires a certified Mordell--Weil subgroup index"
            )
        return self._quotient.multiply(ArithmeticScalar.exact(index.value**2))

    def with_subgroup_index(
        self,
        value: Any,
        *,
        certificate: SubgroupIndexCertificate,
        provenance: Provenance | None = None,
    ) -> BSDAnalyticQuotient:
        index = SubgroupIndexData.certified(value, certificate, provenance=provenance)
        return BSDAnalyticQuotient(self.input.with_subgroup_index(index))

    @property
    def rigorous(self) -> bool:
        certified = {"certified", "proved"}
        return (
            self.input.leading_term.rigorous
            and self._leading_taylor.rigorous
            and self._torsion_product.rigorous
            and self._numerator.rigorous
            and self._denominator.rigorous
            and self._quotient.rigorous
            and self.input.algebraic_rank.status == "proved"
            and self.input.period.value.rigorous
            and self.input.period.provenance.status in certified
            and self.input.regulator.value.rigorous
            and self.input.regulator.provenance.status in certified
            and self.input.tamagawa.coverage == "complete"
            and self.input.tamagawa.provenance.status in certified
            and all(
                factor.provenance.status in certified
                for factor in self.input.tamagawa.factors
            )
            and self.input.torsion_a.provenance.status in certified
            and self.input.torsion_adual.provenance.status in certified
            and self.input.subgroup_status != "arbitrary"
            and self.input.subgroup_provenance.status in certified
        )

    def diagnostics(self) -> dict[str, Any]:
        warnings = []
        if not self.input.leading_term.rigorous:
            warnings.append(
                "the analytic leading term is numerical/probable, not a proved enclosure"
            )
        if (
            self.input.object_kind == "hyperelliptic_jacobian"
            and self.input.subgroup_index.status == "unknown"
        ):
            warnings.append(
                "the quotient is #Sha divided by the unknown subgroup index squared"
            )
        if self.input.tamagawa.coverage == "override":
            warnings.append("global Tamagawa completeness uses an explicit override")
        return {
            "complete": True,
            "rigorous": self.rigorous,
            "rank_status": self.input.leading_term.rank.status,
            "period_normalization": self.input.period.normalization,
            "regulator_source": self.input.regulator.source_kind,
            "tamagawa_coverage": self.input.tamagawa.coverage,
            "torsion_a_status": self.input.torsion_a.provenance.status,
            "torsion_adual_status": self.input.torsion_adual.provenance.status,
            "subgroup_status": self.input.subgroup_status,
            "subgroup_index_status": self.input.subgroup_index.status,
            "warnings": warnings,
        }

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": BSD_QUOTIENT_SCHEMA,
            "input": self.input.to_dict(),
            "factors": {
                "leading_derivative": self.leading_derivative().to_dict(),
                "factorial": str(_factorial(self.input.leading_term.rank.value)),
                "leading_taylor_coefficient": self._leading_taylor.to_dict(),
                "torsion_a": str(self.input.torsion_a.order),
                "torsion_adual": str(self.input.torsion_adual.order),
                "torsion_product": self._torsion_product.to_dict(),
                "real_period": self.input.period.value.to_dict(),
                "regulator": self.input.regulator.value.to_dict(),
                "tamagawa_product": str(self._tamagawa_product),
                "numerator": self._numerator.to_dict(),
                "denominator": self._denominator.to_dict(),
            },
            "quotient_name": (
                "sha_over_index_squared"
                if self.input.object_kind == "hyperelliptic_jacobian"
                else "bsd_quotient"
            ),
            "quotient": self._quotient.to_dict(),
            "diagnostics": self.diagnostics(),
        }

    def to_json(self) -> str:
        return _canonical_json(self.to_dict())

    @classmethod
    def from_dict(cls, value: Mapping[str, Any]) -> BSDAnalyticQuotient:
        if value.get("schema") != BSD_QUOTIENT_SCHEMA:
            raise BSDValidationError("unknown BSD analytic quotient schema")
        result = cls(BSDArithmeticInput.from_dict(value["input"]))
        if result.to_dict() != dict(value):
            raise BSDValidationError(
                "serialized BSD quotient factors do not match recomputation"
            )
        return result

    @classmethod
    def from_json(cls, value: str) -> BSDAnalyticQuotient:
        try:
            record = json.loads(value)
        except (TypeError, json.JSONDecodeError) as error:
            raise BSDValidationError("unable to decode BSD quotient JSON") from error
        if not isinstance(record, dict):
            raise BSDValidationError("BSD quotient JSON must contain an object")
        return cls.from_dict(record)

    def sqlite_record(self) -> dict[str, str | int]:
        """Return one flat record accepted by Python-compatible SQLite APIs."""
        payload = self.to_json()
        digest = hashlib.sha256(payload.encode("utf-8")).hexdigest()
        curve_payload = _canonical_json(dict(self.input.curve_model))
        curve_digest = hashlib.sha256(curve_payload.encode("utf-8")).hexdigest()
        quotient = self._quotient
        return {
            "schema": BSD_SQLITE_SCHEMA,
            "record_sha256": digest,
            "curve_sha256": curve_digest,
            "object_kind": self.input.object_kind,
            "rank": self.input.leading_term.rank.value,
            "rigorous": 1 if self.rigorous else 0,
            "quotient_name": (
                "sha_over_index_squared"
                if self.input.object_kind == "hyperelliptic_jacobian"
                else "bsd_quotient"
            ),
            "quotient_kind": quotient.kind,
            "quotient_numerator": (
                str(quotient.numerator) if quotient.kind == "exact" else ""
            ),
            "quotient_denominator": (
                str(quotient.denominator) if quotient.kind == "exact" else ""
            ),
            "payload_json": payload,
        }

    def __repr__(self) -> str:
        name = (
            "sha_over_index_squared"
            if self.input.object_kind == "hyperelliptic_jacobian"
            else "bsd_quotient"
        )
        return "BSDAnalyticQuotient(" + name + "=" + str(self._quotient) + ")"


def assemble_bsd_analytic_quotient(
    arithmetic_input: BSDArithmeticInput,
) -> BSDAnalyticQuotient:
    """Assemble and validate a supplied-data BSD quotient atomically."""
    return BSDAnalyticQuotient(arithmetic_input)


__all__ = [
    "ArithmeticScalar",
    "BSDAnalyticQuotient",
    "BSDArithmeticError",
    "BSDArithmeticInput",
    "BSDIncompleteDataError",
    "BSDRankMismatchError",
    "BSDSubgroupIndexUnknownError",
    "BSDValidationError",
    "LeadingTermData",
    "PeriodData",
    "PolarizationData",
    "Provenance",
    "RankEvidence",
    "RegulatorData",
    "SubgroupIndexCertificate",
    "SubgroupIndexData",
    "TamagawaData",
    "TamagawaFactor",
    "TorsionData",
    "assemble_bsd_analytic_quotient",
]
