"""Portable binary64 special functions used by probability distributions."""

from __future__ import annotations

import math


_EPSILON = 3.0e-15
_TINY = 1.0e-300
_INFINITY = float("inf")
_SQRT_TWO = math.sqrt(2.0)
_SQRT_TWO_PI = math.sqrt(2.0 * math.pi)
_MAX_SERIES_ITERATIONS = 10_000


def _stirling_correction(value: float) -> float:
    """Small Stirling correction for a positive argument at least eight."""
    inverse = 1.0 / value
    square = inverse * inverse
    return inverse * (
        1.0 / 12.0
        + square
        * (
            -1.0 / 360.0
            + square
            * (
                1.0 / 1260.0
                + square
                * (
                    -1.0 / 1680.0
                    + square
                    * (
                        1.0 / 1188.0
                        + square * (-691.0 / 360360.0 + square * (7.0 / 1092.0))
                    )
                )
            )
        )
    )


def _log_gamma_ratio(base: float, increment: float) -> float:
    """Return `log Gamma(base + increment) - log Gamma(base)` stably."""
    if base < 8.0:
        return log_gamma(base + increment) - log_gamma(base)
    ratio = increment / base
    return (
        increment * math.log(base)
        + (base + increment - 0.5) * math.log1p(ratio)
        - increment
        + _stirling_correction(base + increment)
        - _stirling_correction(base)
    )


def _log_beta(a: float, b: float) -> float:
    """Stable `log(Beta(a, b))`, including strongly unbalanced parameters."""
    smaller = min(a, b)
    larger = max(a, b)
    return log_gamma(smaller) - _log_gamma_ratio(larger, smaller)


def log_gamma(value: float) -> float:
    """Natural logarithm of Gamma for positive binary64 arguments."""
    x = float(value)
    if not math.isfinite(x) or x <= 0.0:
        raise ValueError("log-gamma argument must be positive and finite")
    coefficients = (
        0.99999999999980993,
        676.5203681218851,
        -1259.1392167224028,
        771.3234287776531,
        -176.6150291621406,
        12.507343278686905,
        -0.13857109526572012,
        9.984369578019572e-6,
        1.5056327351493116e-7,
    )
    if x < 0.5:
        return math.log(math.pi) - math.log(math.sin(math.pi * x)) - log_gamma(1.0 - x)
    shifted = x - 1.0
    series = coefficients[0]
    for index in range(1, len(coefficients)):
        series += coefficients[index] / (shifted + index)
    t = shifted + 7.5
    return (
        0.5 * math.log(2.0 * math.pi)
        + (shifted + 0.5) * math.log(t)
        - t
        + math.log(series)
    )


def regularized_gamma_p(shape: float, x: float) -> float:
    """Lower regularized incomplete gamma ratio `P(shape, x)`."""
    if not math.isfinite(shape) or shape <= 0.0:
        raise ValueError("gamma shape must be positive and finite")
    if math.isnan(x) or x < 0.0:
        raise ValueError("gamma argument must be nonnegative")
    if x == 0.0:
        return 0.0
    if x == _INFINITY:
        return 1.0
    if x >= shape + 1.0:
        return max(0.0, 1.0 - regularized_gamma_q(shape, x))
    term = 1.0 / shape
    total = term
    denominator = shape
    for _ in range(1, _MAX_SERIES_ITERATIONS + 1):
        denominator += 1.0
        term *= x / denominator
        total += term
        if abs(term) <= abs(total) * _EPSILON:
            factor = math.exp(-x + shape * math.log(x) - log_gamma(shape))
            return min(1.0, max(0.0, total * factor))
    raise ArithmeticError("incomplete gamma series did not converge")


def regularized_gamma_q(shape: float, x: float) -> float:
    """Upper regularized incomplete gamma ratio `Q(shape, x)`."""
    if not math.isfinite(shape) or shape <= 0.0:
        raise ValueError("gamma shape must be positive and finite")
    if math.isnan(x) or x < 0.0:
        raise ValueError("gamma argument must be nonnegative")
    if x == 0.0:
        return 1.0
    if x == _INFINITY:
        return 0.0
    if x < shape + 1.0:
        return max(0.0, 1.0 - regularized_gamma_p(shape, x))
    b = x + 1.0 - shape
    c = 1.0 / _TINY
    d = 1.0 / max(abs(b), _TINY)
    if b < 0.0:
        d = -d
    fraction = d
    for index in range(1, _MAX_SERIES_ITERATIONS + 1):
        coefficient = -index * (index - shape)
        b += 2.0
        d = coefficient * d + b
        if abs(d) < _TINY:
            d = _TINY
        c = b + coefficient / c
        if abs(c) < _TINY:
            c = _TINY
        d = 1.0 / d
        delta = d * c
        fraction *= delta
        if abs(delta - 1.0) <= _EPSILON:
            factor = math.exp(-x + shape * math.log(x) - log_gamma(shape))
            return min(1.0, max(0.0, fraction * factor))
    raise ArithmeticError("incomplete gamma continued fraction did not converge")


def _beta_fraction(a: float, b: float, x: float) -> float:
    qab = a + b
    qap = a + 1.0
    qam = a - 1.0
    c = 1.0
    d = 1.0 - qab * x / qap
    if abs(d) < _TINY:
        d = _TINY
    d = 1.0 / d
    fraction = d
    for index in range(1, _MAX_SERIES_ITERATIONS + 1):
        even = 2 * index
        coefficient = index * (b - index) * x / ((qam + even) * (a + even))
        d = 1.0 + coefficient * d
        if abs(d) < _TINY:
            d = _TINY
        c = 1.0 + coefficient / c
        if abs(c) < _TINY:
            c = _TINY
        d = 1.0 / d
        fraction *= d * c
        coefficient = -(a + index) * (qab + index) * x / ((a + even) * (qap + even))
        d = 1.0 + coefficient * d
        if abs(d) < _TINY:
            d = _TINY
        c = 1.0 + coefficient / c
        if abs(c) < _TINY:
            c = _TINY
        d = 1.0 / d
        delta = d * c
        fraction *= delta
        if abs(delta - 1.0) <= _EPSILON:
            return fraction
    raise ArithmeticError("incomplete beta continued fraction did not converge")


def regularized_beta(a: float, b: float, x: float) -> float:
    """Regularized incomplete beta `I_x(a, b)` using symmetry and Lentz CF."""
    if not math.isfinite(a) or not math.isfinite(b) or a <= 0.0 or b <= 0.0:
        raise ValueError("beta parameters must be positive and finite")
    if math.isnan(x) or not 0.0 <= x <= 1.0:
        raise ValueError("beta argument must be in [0, 1]")
    if x == 0.0:
        return 0.0
    if x == 1.0:
        return 1.0
    front = math.exp(-_log_beta(a, b) + a * math.log(x) + b * math.log1p(-x))
    if x < (a + 1.0) / (a + b + 2.0):
        value = front * _beta_fraction(a, b, x) / a
    else:
        value = 1.0 - front * _beta_fraction(b, a, 1.0 - x) / b
    return min(1.0, max(0.0, value))


def normal_pdf_standard(x: float) -> float:
    return math.exp(-0.5 * x * x) / _SQRT_TWO_PI


def normal_cdf_standard(x: float) -> float:
    value = float(x)
    if value == 0.0:
        return 0.5
    tail = 0.5 * regularized_gamma_q(0.5, 0.5 * value * value)
    return 1.0 - tail if value > 0.0 else tail


def normal_sf_standard(x: float) -> float:
    value = float(x)
    if value == 0.0:
        return 0.5
    tail = 0.5 * regularized_gamma_q(0.5, 0.5 * value * value)
    return tail if value > 0.0 else 1.0 - tail


def normal_quantile_standard(probability: float) -> float:
    """Inverse normal CDF using Acklam's rational seed and one Newton step."""
    if math.isnan(probability) or not 0.0 <= probability <= 1.0:
        raise ValueError("probability must be in [0, 1]")
    if probability == 0.0:
        return -_INFINITY
    if probability == 1.0:
        return _INFINITY
    a = (
        -3.969683028665376e01,
        2.209460984245205e02,
        -2.759285104469687e02,
        1.383577518672690e02,
        -3.066479806614716e01,
        2.506628277459239e00,
    )
    b = (
        -5.447609879822406e01,
        1.615858368580409e02,
        -1.556989798598866e02,
        6.680131188771972e01,
        -1.328068155288572e01,
    )
    c = (
        -7.784894002430293e-03,
        -3.223964580411365e-01,
        -2.400758277161838e00,
        -2.549732539343734e00,
        4.374664141464968e00,
        2.938163982698783e00,
    )
    d = (
        7.784695709041462e-03,
        3.224671290700398e-01,
        2.445134137142996e00,
        3.754408661907416e00,
    )
    lower = 0.02425
    upper = 1.0 - lower
    if probability < lower:
        q = math.sqrt(-2.0 * math.log(probability))
        x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / (
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q) + 1.0
        )
    elif probability <= upper:
        q = probability - 0.5
        r = q * q
        x = (
            (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5])
            * q
            / ((((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r) + 1.0)
        )
    else:
        q = math.sqrt(-2.0 * math.log1p(-probability))
        x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / (
            ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q) + 1.0
        )
    density = normal_pdf_standard(x)
    if density > 0.0:
        if probability <= 0.5:
            error = normal_cdf_standard(x) - probability
        else:
            error = (1.0 - probability) - normal_sf_standard(x)
        x -= error / density
    return x
