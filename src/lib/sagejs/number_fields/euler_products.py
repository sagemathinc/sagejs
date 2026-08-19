"""Controlled Dedekind-zeta evaluation in the half-plane `Re(s)>1`.

The exact arithmetic comes from :mod:`zeta_coefficients`.  Numerical values
are ordinary portable `mpmath` midpoints.  The module proves bounds for the
*omitted analytic tail*, but mpmath rounding itself is not enclosed; therefore
the returned diagnostic is always labelled `numerical approximation` and a
request for `rigorous=True` is rejected.  A later Acb integration may combine
the same analytic bounds with a rounding ball to produce a rigorous enclosure.

No function in this module continues a zeta function across `Re(s)=1`.
"""

from __future__ import annotations

from typing import Any, Sequence, TypedDict

from mpmath import mp
from sagejs.number_fields.zeta_coefficients import (
    SplittingProvider,
    ZetaCoefficientLimits,
    compact_splitting_records,
    zeta_coefficients,
)

__all__ = [
    "EulerProductLimits",
    "EulerProductResourceError",
    "RigorousEnclosureUnavailableError",
    "ZetaHalfPlaneDomainError",
    "dirichlet_series",
    "evaluate_euler_factor",
    "euler_product",
]


class ZetaHalfPlaneDomainError(ValueError):
    """Evaluation was requested outside the absolute-convergence half-plane."""


class EulerProductResourceError(RuntimeError):
    """A numerical zeta request exceeds an explicit resource limit."""


class RigorousEnclosureUnavailableError(NotImplementedError):
    """The portable midpoint path cannot enclose its rounding error."""


class EulerProductLimits:
    """Deterministic limits checked before coefficient or prime generation."""

    def __init__(
        self,
        *,
        maximum_precision_bits: int = 4_096,
        maximum_degree: int = 64,
        maximum_prime_bound: int = 10_000_000,
        maximum_coefficient_bound: int = 5_000_000,
    ) -> None:
        self.maximum_precision_bits = _positive_integer(
            maximum_precision_bits, "maximum_precision_bits"
        )
        self.maximum_degree = _positive_integer(maximum_degree, "maximum_degree")
        self.maximum_prime_bound = _positive_integer(
            maximum_prime_bound, "maximum_prime_bound"
        )
        self.maximum_coefficient_bound = _positive_integer(
            maximum_coefficient_bound, "maximum_coefficient_bound"
        )


class HalfPlaneValueResult(TypedDict):
    """Serializable midpoint and independently proved truncation diagnostic."""

    algorithm: str
    status: str
    proof_status: str
    rigorous: bool
    precision_bits: int
    work_precision_bits: int
    degree: int
    value_real: str
    value_imag: str
    analytic_tail_bound: str
    analytic_tail_bound_status: str
    rounding_error_status: str
    terms: int


def _integer(value: Any, name: str) -> int:
    if isinstance(value, bool):
        raise TypeError(name + " must be an integer")
    try:
        result = int(value)
    except (TypeError, ValueError, OverflowError) as error:
        raise TypeError(name + " must be an integer") from error
    if result != value:
        raise TypeError(name + " must be an integer")
    return result


def _positive_integer(value: Any, name: str) -> int:
    result = _integer(value, name)
    if result <= 0:
        raise ValueError(name + " must be positive")
    return result


def _point(value: Any) -> Any:
    if isinstance(value, dict):
        real = value.get("real", value.get("real_part"))
        imag = value.get("imag", value.get("imaginary_part", 0))
        return mp.mpc(real, imag)
    if isinstance(value, (tuple, list)) and len(value) == 2:
        return mp.mpc(value[0], value[1])
    return mp.mpc(value)


def _number_string(value: Any, precision_bits: int) -> str:
    digits = max(18, int(precision_bits * 0.30103) + 8)
    return str(mp.nstr(value, digits, strip_zeros=False))


def _validate_common(
    s: Any,
    degree: Any,
    prec: Any,
    rigorous: bool,
    limits: EulerProductLimits,
) -> tuple[Any, int, int]:
    degree_value = _positive_integer(degree, "degree")
    precision_bits = _positive_integer(prec, "prec")
    if degree_value > limits.maximum_degree:
        raise EulerProductResourceError(
            "number-field degree exceeds the Euler-product resource limit"
        )
    if precision_bits > limits.maximum_precision_bits:
        raise EulerProductResourceError(
            "precision exceeds the Euler-product resource limit"
        )
    # Parse decimal strings and exact inputs only after the requested working
    # precision is active.  Constructing the mpc first would irreversibly
    # demote them to the ambient global mpmath precision.
    with mp.workprec(precision_bits + 32):
        point = +_point(s)
        if not mp.isfinite(point.real) or not mp.isfinite(point.imag):
            raise ValueError("s must be finite")
        if point.real <= 1:
            raise ZetaHalfPlaneDomainError(
                "Dedekind-zeta direct series and Euler products require Re(s)>1"
            )
    if rigorous:
        raise RigorousEnclosureUnavailableError(
            "the portable Euler-product path proves its analytic tail but does "
            "not enclose mpmath rounding; use rigorous=False or an Acb backend"
        )
    return point, degree_value, precision_bits


def _direct_series_tail_bound(bound: int, degree: int, sigma: Any) -> Any:
    """Bound `sum_{m>B} a_m*m^-sigma` using zeta domination.

    Put `v=(sigma+1)/2`.  Since `a_m <= d_degree(m)` coefficientwise,
    `zeta_K(v) <= zeta(v)^degree`.  For `m>B`, the remaining factor
    `m^(v-sigma)` is at most `B^(v-sigma)`.  Finally the integral test gives
    `zeta(v) <= 1 + 1/(v-1)`.  The result works throughout `sigma>1` and is
    generally much sharper than a tuple-union bound.
    """
    auxiliary = (sigma + 1) / 2
    zeta_upper = 1 + 1 / (auxiliary - 1)
    return mp.power(bound, auxiliary - sigma) * mp.power(zeta_upper, degree)


def _euler_log_tail_bound(prime_bound: int, degree: int, sigma: Any) -> Any:
    """Bound the absolute logarithm of all omitted rational-prime factors."""
    integer_tail = mp.power(prime_bound, 1 - sigma) / (sigma - 1)
    geometric = 1 / (1 - mp.power(prime_bound + 1, -sigma))
    return degree * integer_tail * geometric


def evaluate_euler_factor(record: Any, s: Any, *, degree: int, prec: int = 53) -> Any:
    """Numerically evaluate one exact local factor at `Re(s)>1`."""
    resource_limits = EulerProductLimits()
    point, degree_value, precision_bits = _validate_common(
        s, degree, prec, False, resource_limits
    )

    def one_record(start: int, stop: int) -> list[Any]:
        del start, stop
        return [record]

    prime_value = None
    if isinstance(record, dict):
        prime_value = record.get("prime", record.get("p"))
    else:
        prime_value = getattr(record, "prime", getattr(record, "p", None))
        if callable(prime_value):
            prime_value = prime_value()
        if prime_value is None:
            try:
                prime_value = record[0]
            except (TypeError, IndexError) as error:
                raise TypeError("record must expose its rational prime") from error
    prime = _positive_integer(prime_value, "rational prime")
    # Reuse the exact stream validator, including primality and sum(e*f).
    validated = list(
        compact_splitting_records(one_record, prime, prime + 1, degree=degree_value)
    )
    if len(validated) != 1:
        raise ValueError("record prime does not define a one-prime interval")
    with mp.workprec(precision_bits + 32):
        value = mp.mpc(1)
        for factor in validated[0].factors:
            residue_degree = factor[1]
            value /= 1 - mp.exp(-residue_degree * point * mp.log(validated[0].prime))
        return +value


def dirichlet_series(
    s: Any,
    coefficient_bound: int,
    *,
    degree: int,
    coefficients: Sequence[int] | None = None,
    splitting_provider: SplittingProvider | Any | None = None,
    prec: int = 53,
    rigorous: bool = False,
    limits: EulerProductLimits | None = None,
) -> HalfPlaneValueResult:
    """Evaluate an exact coefficient prefix with a proved omission bound.

    The analytic tail bound is rigorous.  The returned midpoint is not a ball,
    so its floating-point rounding remains explicitly non-rigorous.
    """
    resource_limits = limits if limits is not None else EulerProductLimits()
    point, degree_value, precision_bits = _validate_common(
        s, degree, prec, rigorous, resource_limits
    )
    bound = _positive_integer(coefficient_bound, "coefficient_bound")
    if bound > resource_limits.maximum_coefficient_bound:
        raise EulerProductResourceError(
            "coefficient bound exceeds the direct-series resource limit"
        )
    if coefficients is None:
        if splitting_provider is None:
            raise TypeError(
                "splitting_provider is required when coefficients are omitted"
            )
        coefficient_limits = ZetaCoefficientLimits(
            maximum_bound=resource_limits.maximum_coefficient_bound,
            maximum_degree=resource_limits.maximum_degree,
            maximum_prime_interval=resource_limits.maximum_prime_bound + 1,
        )
        exact_coefficients = zeta_coefficients(
            bound,
            degree=degree_value,
            splitting_provider=splitting_provider,
            limits=coefficient_limits,
        )
    else:
        if len(coefficients) < bound:
            raise ValueError("coefficient prefix is shorter than coefficient_bound")
        exact_coefficients = []
        for index, coefficient in enumerate(coefficients[:bound], start=1):
            value = _integer(coefficient, "coefficient a_" + str(index))
            if value < 0:
                raise ValueError("Dedekind-zeta coefficients must be nonnegative")
            exact_coefficients.append(value)
        if exact_coefficients[0] != 1:
            raise ValueError("a_1 must equal 1")

    work_precision = precision_bits + 32
    with mp.workprec(work_precision):
        value = mp.mpc(0)
        for index, coefficient in enumerate(exact_coefficients, start=1):
            if coefficient:
                value += coefficient * mp.exp(-point * mp.log(index))
        tail = _direct_series_tail_bound(bound, degree_value, point.real)
        return {
            "algorithm": "dedekind-dirichlet-series",
            "status": "numerical_approximation",
            "proof_status": "proved-tail-formula-nonrigorous-numeric-presentation",
            "rigorous": False,
            "precision_bits": precision_bits,
            "work_precision_bits": work_precision,
            "degree": degree_value,
            "value_real": _number_string(value.real, precision_bits),
            "value_imag": _number_string(value.imag, precision_bits),
            "analytic_tail_bound": _number_string(tail, precision_bits),
            "analytic_tail_bound_status": (
                "degree-only-majorant-formula-proved; displayed midpoint is "
                "not outward-rounded"
            ),
            "rounding_error_status": "mpmath-rounding-not-enclosed",
            "terms": bound,
        }


def euler_product(
    s: Any,
    prime_bound: int,
    *,
    degree: int,
    splitting_provider: SplittingProvider | Any,
    prec: int = 53,
    rigorous: bool = False,
    limits: EulerProductLimits | None = None,
) -> HalfPlaneValueResult:
    """Evaluate local factors through `p<=prime_bound` with a tail bound."""
    resource_limits = limits if limits is not None else EulerProductLimits()
    point, degree_value, precision_bits = _validate_common(
        s, degree, prec, rigorous, resource_limits
    )
    bound = _positive_integer(prime_bound, "prime_bound")
    if bound < 2:
        raise ValueError("prime_bound must be at least 2")
    if bound > resource_limits.maximum_prime_bound:
        raise EulerProductResourceError(
            "prime bound exceeds the Euler-product resource limit"
        )
    coefficient_limits = ZetaCoefficientLimits(
        maximum_bound=resource_limits.maximum_coefficient_bound,
        maximum_degree=resource_limits.maximum_degree,
        maximum_prime_interval=resource_limits.maximum_prime_bound + 1,
    )
    work_precision = precision_bits + 32
    with mp.workprec(work_precision):
        value = mp.mpc(1)
        prime_count = 0
        for record in compact_splitting_records(
            splitting_provider,
            2,
            bound + 1,
            degree=degree_value,
            limits=coefficient_limits,
        ):
            logarithm = mp.log(record.prime)
            for factor in record.factors:
                residue_degree = factor[1]
                value /= 1 - mp.exp(-residue_degree * point * logarithm)
            prime_count += 1
        log_tail = _euler_log_tail_bound(bound, degree_value, point.real)
        absolute_tail = abs(value) * mp.expm1(log_tail)
        return {
            "algorithm": "dedekind-euler-product",
            "status": "numerical_approximation",
            "proof_status": "proved-tail-formula-nonrigorous-numeric-presentation",
            "rigorous": False,
            "precision_bits": precision_bits,
            "work_precision_bits": work_precision,
            "degree": degree_value,
            "value_real": _number_string(value.real, precision_bits),
            "value_imag": _number_string(value.imag, precision_bits),
            "analytic_tail_bound": _number_string(absolute_tail, precision_bits),
            "analytic_tail_bound_status": (
                "degree-only-majorant-formula-proved; exact partial-product "
                "formula proved; displayed midpoint is not outward-rounded"
            ),
            "rounding_error_status": "mpmath-rounding-not-enclosed",
            "terms": prime_count,
        }
