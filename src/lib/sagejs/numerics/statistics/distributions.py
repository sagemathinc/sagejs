"""Backend-neutral common probability distributions for binary64 work."""

from __future__ import annotations

import math
from collections.abc import Callable
from typing import Any

from ._core import binary64_ulp, validate_probability
from ._special import (
    log_gamma,
    normal_cdf_standard,
    normal_pdf_standard,
    normal_quantile_standard,
    normal_sf_standard,
    regularized_beta,
    regularized_gamma_p,
    regularized_gamma_q,
)
from .result import StatisticsResult


_INFINITY = float("inf")


def _positive_finite(value: Any, name: str) -> float:
    answer = float(value)
    if not math.isfinite(answer) or answer <= 0.0:
        raise ValueError(name + " must be positive and finite")
    return answer


def _nonnegative_finite(value: Any, name: str) -> float:
    answer = float(value)
    if not math.isfinite(answer) or answer < 0.0:
        raise ValueError(name + " must be nonnegative and finite")
    return answer


def _integer(value: Any, name: str, *, minimum: int = 0) -> int:
    try:
        integer = int(value)
    except (OverflowError, TypeError, ValueError):
        raise ValueError(
            name + " must be an exactly representable integer at least " + str(minimum)
        ) from None
    if (
        isinstance(value, bool)
        or integer != value
        or integer < minimum
        or integer > 9_007_199_254_740_991
    ):
        raise ValueError(name + " must be an integer at least " + str(minimum))
    return integer


def _continuous_quantile(
    probability: float,
    cdf: Callable[[float], float],
    *,
    lower: float,
    upper: float,
) -> float:
    target = validate_probability(probability)
    if target == 0.0:
        return -_INFINITY if lower == -_INFINITY else lower
    if target == 1.0:
        return _INFINITY if upper == _INFINITY else upper
    left = -1.0 if lower == -_INFINITY else lower
    right = 1.0 if upper == _INFINITY else upper
    while cdf(left) > target:
        right = left
        left *= 2.0
    while cdf(right) < target:
        left = right
        right = 2.0 * right if right > 0.0 else 1.0
    for _ in range(160):
        midpoint = left + 0.5 * (right - left)
        if cdf(midpoint) < target:
            left = midpoint
        else:
            right = midpoint
        if right - left <= 4.0 * binary64_ulp(max(abs(midpoint), 1.0)):
            break
    return left + 0.5 * (right - left)


class Distribution:
    """Small common protocol for scalar probability laws."""

    name = "distribution"
    discrete = False

    def to_dict(self) -> dict[str, Any]:
        raise NotImplementedError

    def quantile(self, probability: float) -> float | int:
        raise NotImplementedError

    def plot(
        self,
        function: str = "pdf",
        *,
        lower: float | None = None,
        upper: float | None = None,
        points: int = 257,
    ) -> Any:
        """Return a bounded semantic PlotSpec for a density/mass/CDF curve."""
        if function not in ("pdf", "pmf", "cdf", "sf"):
            raise ValueError("function must be pdf, pmf, cdf, or sf")
        if isinstance(points, bool) or not 2 <= points <= 4096:
            raise ValueError("points must be an integer from 2 through 4096")
        if lower is None or upper is None:
            q_lower = self.quantile(0.001)
            q_upper = self.quantile(0.999)
            if lower is None:
                lower = float(q_lower)
            if upper is None:
                upper = float(q_upper)
        if not math.isfinite(lower) or not math.isfinite(upper) or lower >= upper:
            raise ValueError("plot bounds must be finite and increasing")
        method_name = "pmf" if self.discrete and function == "pdf" else function
        method = getattr(self, method_name)
        if self.discrete:
            start = int(math.ceil(lower))
            stop = int(math.floor(upper))
            xs = [float(value) for value in range(start, stop + 1)]
            if len(xs) > points:
                raise ValueError("discrete plot support exceeds the point budget")
        else:
            xs = [
                lower + (upper - lower) * index / (points - 1)
                for index in range(points)
            ]
        ys = [float(method(value)) for value in xs]
        result = StatisticsResult(
            "distribution_curve",
            success=True,
            status="converged",
            value={"distribution": self.to_dict(), "function": method_name},
            method="analytic-" + method_name,
            validation={
                "truth_level": "validated_approximate",
                "passed": all(value >= 0.0 for value in ys),
                "checks": ["nonnegative ordinates"],
            },
            domain_payload={
                "plot": {
                    "kind": "distribution",
                    "function": method_name,
                    "x": xs,
                    "y": ys,
                }
            },
        )
        return result.to_plot_spec()


class Normal(Distribution):
    """Normal distribution with tail-stable `cdf`/`sf` evaluation."""

    name = "normal"

    def __init__(self, mean: float = 0.0, standard_deviation: float = 1.0) -> None:
        self.mean = float(mean)
        if not math.isfinite(self.mean):
            raise ValueError("normal mean must be finite")
        self.standard_deviation = _positive_finite(
            standard_deviation, "normal standard deviation"
        )

    @property
    def variance(self) -> float:
        return self.standard_deviation * self.standard_deviation

    def pdf(self, x: float) -> float:
        z = (float(x) - self.mean) / self.standard_deviation
        return normal_pdf_standard(z) / self.standard_deviation

    def logpdf(self, x: float) -> float:
        z = (float(x) - self.mean) / self.standard_deviation
        return (
            -0.5 * z * z
            - math.log(self.standard_deviation)
            - 0.5 * math.log(2.0 * math.pi)
        )

    def cdf(self, x: float) -> float:
        return normal_cdf_standard((float(x) - self.mean) / self.standard_deviation)

    def sf(self, x: float) -> float:
        return normal_sf_standard((float(x) - self.mean) / self.standard_deviation)

    def quantile(self, probability: float) -> float:
        return self.mean + self.standard_deviation * normal_quantile_standard(
            validate_probability(probability)
        )

    ppf = quantile

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "parameters": {
                "mean": self.mean,
                "standard_deviation": self.standard_deviation,
            },
            "support": {"lower": None, "upper": None, "closed": [False, False]},
        }


class StudentT(Distribution):
    """Central Student t distribution."""

    name = "student_t"

    def __init__(self, degrees_of_freedom: float) -> None:
        self.degrees_of_freedom = _positive_finite(
            degrees_of_freedom, "degrees of freedom"
        )

    @property
    def mean(self) -> float | None:
        return 0.0 if self.degrees_of_freedom > 1.0 else None

    @property
    def variance(self) -> float | None:
        df = self.degrees_of_freedom
        return df / (df - 2.0) if df > 2.0 else None

    def logpdf(self, x: float) -> float:
        df = self.degrees_of_freedom
        value = float(x)
        return (
            log_gamma(0.5 * (df + 1.0))
            - log_gamma(0.5 * df)
            - 0.5 * math.log(df * math.pi)
            - 0.5 * (df + 1.0) * math.log1p(value * value / df)
        )

    def pdf(self, x: float) -> float:
        return math.exp(self.logpdf(x))

    def cdf(self, x: float) -> float:
        value = float(x)
        if value == 0.0:
            return 0.5
        df = self.degrees_of_freedom
        beta = regularized_beta(0.5 * df, 0.5, df / (df + value * value))
        return 1.0 - 0.5 * beta if value > 0.0 else 0.5 * beta

    def sf(self, x: float) -> float:
        value = float(x)
        if value == 0.0:
            return 0.5
        df = self.degrees_of_freedom
        beta = regularized_beta(0.5 * df, 0.5, df / (df + value * value))
        return 0.5 * beta if value > 0.0 else 1.0 - 0.5 * beta

    def quantile(self, probability: float) -> float:
        target = validate_probability(probability)
        if target == 0.5:
            return 0.0
        return _continuous_quantile(target, self.cdf, lower=-_INFINITY, upper=_INFINITY)

    ppf = quantile

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "parameters": {"degrees_of_freedom": self.degrees_of_freedom},
            "support": {"lower": None, "upper": None, "closed": [False, False]},
        }


class ChiSquare(Distribution):
    """Central chi-square distribution."""

    name = "chi_square"

    def __init__(self, degrees_of_freedom: float) -> None:
        self.degrees_of_freedom = _positive_finite(
            degrees_of_freedom, "degrees of freedom"
        )
        self.mean = self.degrees_of_freedom
        self.variance = 2.0 * self.degrees_of_freedom

    def logpdf(self, x: float) -> float:
        value = float(x)
        if value < 0.0:
            return -_INFINITY
        if value == _INFINITY:
            return -_INFINITY
        shape = 0.5 * self.degrees_of_freedom
        if value == 0.0:
            if shape < 1.0:
                return _INFINITY
            if shape == 1.0:
                return -math.log(2.0)
            return -_INFINITY
        return (
            (shape - 1.0) * math.log(value)
            - 0.5 * value
            - shape * math.log(2.0)
            - log_gamma(shape)
        )

    def pdf(self, x: float) -> float:
        value = self.logpdf(x)
        if value == _INFINITY:
            return _INFINITY
        if value == -_INFINITY:
            return 0.0
        return math.exp(value)

    def cdf(self, x: float) -> float:
        value = float(x)
        return (
            0.0
            if value <= 0.0
            else regularized_gamma_p(0.5 * self.degrees_of_freedom, 0.5 * value)
        )

    def sf(self, x: float) -> float:
        value = float(x)
        return (
            1.0
            if value <= 0.0
            else regularized_gamma_q(0.5 * self.degrees_of_freedom, 0.5 * value)
        )

    def quantile(self, probability: float) -> float:
        return _continuous_quantile(probability, self.cdf, lower=0.0, upper=_INFINITY)

    ppf = quantile

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "parameters": {"degrees_of_freedom": self.degrees_of_freedom},
            "support": {"lower": 0.0, "upper": None, "closed": [True, False]},
        }


class Binomial(Distribution):
    """Binomial distribution on `0, ..., trials`."""

    name = "binomial"
    discrete = True

    def __init__(self, trials: int, probability: float) -> None:
        self.trials = _integer(trials, "trials")
        self.probability = validate_probability(probability)
        self.mean = self.trials * self.probability
        self.variance = self.mean * (1.0 - self.probability)

    def logpmf(self, k: int | float) -> float:
        numeric = float(k)
        if not math.isfinite(numeric) or int(numeric) != numeric:
            return -_INFINITY
        count = int(numeric)
        if count < 0 or count > self.trials:
            return -_INFINITY
        if self.probability == 0.0:
            return 0.0 if count == 0 else -_INFINITY
        if self.probability == 1.0:
            return 0.0 if count == self.trials else -_INFINITY
        return (
            log_gamma(self.trials + 1.0)
            - log_gamma(count + 1.0)
            - log_gamma(self.trials - count + 1.0)
            + count * math.log(self.probability)
            + (self.trials - count) * math.log1p(-self.probability)
        )

    def pmf(self, k: int | float) -> float:
        value = self.logpmf(k)
        return 0.0 if value == -_INFINITY else math.exp(value)

    pdf = pmf

    def cdf(self, k: int | float) -> float:
        value = float(k)
        if value == _INFINITY:
            return 1.0
        if value == -_INFINITY:
            return 0.0
        count = math.floor(value)
        if count < 0:
            return 0.0
        if count >= self.trials:
            return 1.0
        if self.probability == 0.0:
            return 1.0
        if self.probability == 1.0:
            return 0.0
        return regularized_beta(
            self.trials - count, count + 1.0, 1.0 - self.probability
        )

    def sf(self, k: int | float) -> float:
        value = float(k)
        if value == _INFINITY:
            return 0.0
        if value == -_INFINITY:
            return 1.0
        count = math.floor(value)
        if count < 0:
            return 1.0
        if count >= self.trials:
            return 0.0
        if self.probability == 0.0:
            return 0.0
        if self.probability == 1.0:
            return 1.0
        return regularized_beta(count + 1.0, self.trials - count, self.probability)

    def quantile(self, probability: float) -> int:
        target = validate_probability(probability)
        if target == 0.0:
            return 0
        if target == 1.0:
            return self.trials
        lower = 0
        upper = self.trials
        while lower < upper:
            midpoint = (lower + upper) // 2
            if self.cdf(midpoint) >= target:
                upper = midpoint
            else:
                lower = midpoint + 1
        return lower

    ppf = quantile

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "parameters": {
                "trials": self.trials,
                "probability": self.probability,
            },
            "support": {"lower": 0, "upper": self.trials, "closed": [True, True]},
        }


class Poisson(Distribution):
    """Poisson distribution on the nonnegative integers."""

    name = "poisson"
    discrete = True

    def __init__(self, rate: float) -> None:
        self.rate = _nonnegative_finite(rate, "Poisson rate")
        self.mean = self.rate
        self.variance = self.rate

    def logpmf(self, k: int | float) -> float:
        numeric = float(k)
        if not math.isfinite(numeric) or int(numeric) != numeric or numeric < 0:
            return -_INFINITY
        count = int(numeric)
        if self.rate == 0.0:
            return 0.0 if count == 0 else -_INFINITY
        return -self.rate + count * math.log(self.rate) - log_gamma(count + 1.0)

    def pmf(self, k: int | float) -> float:
        value = self.logpmf(k)
        return 0.0 if value == -_INFINITY else math.exp(value)

    pdf = pmf

    def cdf(self, k: int | float) -> float:
        value = float(k)
        if value == _INFINITY:
            return 1.0
        if value == -_INFINITY:
            return 0.0
        count = math.floor(value)
        if count < 0:
            return 0.0
        if self.rate == 0.0:
            return 1.0
        return regularized_gamma_q(count + 1.0, self.rate)

    def sf(self, k: int | float) -> float:
        value = float(k)
        if value == _INFINITY:
            return 0.0
        if value == -_INFINITY:
            return 1.0
        count = math.floor(value)
        if count < 0:
            return 1.0
        if self.rate == 0.0:
            return 0.0
        return regularized_gamma_p(count + 1.0, self.rate)

    def quantile(self, probability: float) -> int:
        target = validate_probability(probability)
        if target == 0.0:
            return 0
        if self.rate == 0.0:
            return 0
        if target == 1.0:
            raise ValueError("Poisson quantile at probability 1 is unbounded")
        lower = 0
        upper = max(1, int(math.ceil(self.rate)))
        while self.cdf(upper) < target:
            lower = upper + 1
            upper *= 2
        while lower < upper:
            midpoint = (lower + upper) // 2
            if self.cdf(midpoint) >= target:
                upper = midpoint
            else:
                lower = midpoint + 1
        return lower

    ppf = quantile

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "parameters": {"rate": self.rate},
            "support": {"lower": 0, "upper": None, "closed": [True, False]},
        }
