"""Validated simple linear regression and robust line fitting."""

from __future__ import annotations

import math
from collections.abc import Callable, Iterable, Sequence
from typing import Any

from ..model import ResourceBudget
from ._core import (
    BudgetGuard,
    StatisticsNumericalError,
    StatisticsStopped,
    binary64_ulp,
    centered_sum_squares,
    diagnostic,
    median,
    paired_values,
    scaled_centered_products,
    stable_mean,
    validate_probability,
)
from .distributions import Normal, StudentT
from .result import StatisticsResult


_OLS_ASSUMPTIONS = (
    "the conditional mean of y is linear in x",
    "observations are independent",
    "standard errors and confidence intervals assume homoscedastic residuals",
    "finite-sample t inference assumes normally distributed residuals",
)
_MIN_INFERENCE_TAIL_PROBABILITY = 1.0e-14
_MAX_VISUAL_PAIRS = 512


def huber_loss(residual: float, tuning: float = 1.345) -> float:
    """Huber loss, quadratic at the origin and linear in the tails."""
    value = abs(float(residual))
    threshold = float(tuning)
    if not math.isfinite(threshold) or threshold <= 0.0:
        raise ValueError("tuning must be positive and finite")
    if value <= threshold:
        return 0.5 * value * value
    return threshold * (value - 0.5 * threshold)


def soft_l1_loss(residual: float) -> float:
    """Smooth robust loss `2 * (sqrt(1 + r^2) - 1)`."""
    absolute = abs(float(residual))
    if absolute <= 1.0:
        square = absolute * absolute
        return 2.0 * square / (math.sqrt(1.0 + square) + 1.0)
    inverse = 1.0 / absolute
    root = absolute * math.sqrt(1.0 + inverse * inverse)
    return 2.0 * (root - 1.0)


def cauchy_loss(residual: float) -> float:
    """Cauchy robust loss `log(1 + r^2)`."""
    value = float(residual)
    absolute = abs(value)
    if absolute <= math.sqrt(1.7976931348623157e308):
        return math.log1p(value * value)
    return 2.0 * math.log(absolute) + math.log1p(1.0 / (absolute * absolute))


def _huber_score(residual: float, tuning: float) -> float:
    return max(-tuning, min(tuning, residual))


def _scaled_huber_objective(
    residuals: Sequence[float], scale: float, tuning: float
) -> float:
    normalized = math.fsum(
        huber_loss(residual / scale, tuning) for residual in residuals
    )
    if not math.isfinite(normalized):
        raise StatisticsNumericalError(
            "the normalized Huber objective exceeds the binary64 envelope"
        )
    scaled_root = scale * math.sqrt(normalized)
    objective = scaled_root * scaled_root
    if not math.isfinite(objective):
        raise StatisticsNumericalError(
            "the Huber objective exceeds the finite binary64 result envelope"
        )
    return objective


def _line_payload(
    xs: Sequence[float],
    ys: Sequence[float],
    intercept: float,
    slope: float,
    *,
    weights: Sequence[float] | None = None,
) -> dict[str, Any]:
    lower = min(xs)
    upper = max(xs)
    line_y = [intercept + slope * lower, intercept + slope * upper]
    if not all(math.isfinite(value) for value in line_y):
        raise StatisticsNumericalError(
            "the fitted line exceeds the finite binary64 plotting envelope"
        )
    if len(xs) <= _MAX_VISUAL_PAIRS:
        indices = list(range(len(xs)))
    else:
        last = len(xs) - 1
        indices = [
            (index * last) // (_MAX_VISUAL_PAIRS - 1)
            for index in range(_MAX_VISUAL_PAIRS)
        ]
    plot: dict[str, Any] = {
        "kind": "regression",
        "x": [xs[index] for index in indices],
        "y": [ys[index] for index in indices],
        "line_x": [lower, upper],
        "line_y": line_y,
        "source_count": len(xs),
    }
    if weights is not None:
        plot["weights"] = [weights[index] for index in indices]
        plot["downweighted_source_count"] = sum(
            float(weight) < 0.8 for weight in weights
        )
    return {"plot": plot}


def _stopped_result(
    operation: str,
    method: str,
    guard: BudgetGuard,
    stopped: StatisticsStopped,
    *,
    partial: dict[str, Any] | None = None,
) -> StatisticsResult:
    guard.trace.append(
        "failure",
        data={"status": stopped.status, "reason": stopped.reason},
        important=True,
        force=True,
    )
    return StatisticsResult(
        operation,
        success=False,
        status=stopped.status,
        value=partial,
        method=method,
        validation={"truth_level": "indeterminate", "passed": False, "checks": []},
        diagnostics=[
            diagnostic(
                stopped.status,
                "Regression stopped at its resource boundary.",
                details={"statistics_reason": stopped.reason},
            )
        ],
        trace=guard.trace,
        evaluations=guard.evaluations,
        iterations=guard.iterations,
        elapsed_ms=guard.elapsed_ms(),
        resource_budget=guard.budget,
    )


def _numerical_result(
    operation: str,
    method: str,
    guard: BudgetGuard,
    message: str,
) -> StatisticsResult:
    guard.trace.append(
        "failure",
        data={"status": "nonfinite_evaluation"},
        important=True,
        force=True,
    )
    return StatisticsResult(
        operation,
        success=False,
        status="nonfinite_evaluation",
        value=None,
        method=method,
        validation={"truth_level": "indeterminate", "passed": False, "checks": []},
        diagnostics=[diagnostic("nonfinite_evaluation", message, severity="error")],
        trace=guard.trace,
        evaluations=guard.evaluations,
        iterations=guard.iterations,
        elapsed_ms=guard.elapsed_ms(),
        resource_budget=guard.budget,
    )


def _ols_coefficients(
    xs: Sequence[float], ys: Sequence[float]
) -> tuple[float, float, float, float, float]:
    mean_x = stable_mean(xs)
    mean_y = stable_mean(ys)
    scale_x, scale_y, normalized_xx, normalized_yy, normalized_xy = (
        scaled_centered_products(xs, ys, mean_x, mean_y)
    )
    if scale_x == 0.0 or normalized_xx == 0.0:
        raise ValueError("linear regression requires at least two distinct x values")
    if scale_y == 0.0:
        slope = 0.0
        correlation = 0.0
    else:
        slope = (scale_y / scale_x) * (normalized_xy / normalized_xx)
        correlation = (normalized_xy / math.sqrt(normalized_xx)) / math.sqrt(
            normalized_yy
        )
    if not math.isfinite(slope):
        raise StatisticsNumericalError(
            "the OLS slope exceeds the finite binary64 result envelope"
        )
    intercept = mean_y - slope * mean_x
    if not math.isfinite(intercept):
        raise StatisticsNumericalError(
            "the OLS intercept exceeds the finite binary64 result envelope"
        )
    sxx = centered_sum_squares(xs, mean_x)
    syy = 0.0 if scale_y == 0.0 else centered_sum_squares(ys, mean_y)
    return intercept, slope, sxx, syy, correlation


def linear_regression(
    x: Iterable[Any],
    y: Iterable[Any],
    *,
    confidence: float = 0.95,
    alternative: str = "two-sided",
    nan_policy: str = "raise",
    budget: ResourceBudget | None = None,
    cancel: Callable[[], bool] | None = None,
    trace: str = "summary",
) -> StatisticsResult:
    """Fit `y = intercept + slope*x` by centered ordinary least squares."""
    level = validate_probability(confidence, open_interval=True)
    if 0.5 * (1.0 - level) < _MIN_INFERENCE_TAIL_PROBABILITY:
        raise ValueError(
            "confidence is too close to one for the qualified Student-t tail envelope"
        )
    if alternative not in ("two-sided", "less", "greater"):
        raise ValueError("alternative must be 'two-sided', 'less', or 'greater'")
    guard = BudgetGuard(budget=budget, cancel=cancel, trace=trace)
    guard.trace.append(
        "start",
        data={"operation": "linear_regression", "method": "ordinary-least-squares"},
        important=True,
        force=True,
    )
    try:
        xs, ys = paired_values(x, y, nan_policy=nan_policy, guard=guard, minimum=3)
        intercept, slope, sxx, syy, correlation = _ols_coefficients(xs, ys)
        fitted = [intercept + slope * value for value in xs]
        residuals = [ys[index] - fitted[index] for index in range(len(xs))]
        guard.check(len(xs))
        sse = math.fsum(value * value for value in residuals)
        if not math.isfinite(sse):
            raise StatisticsNumericalError(
                "the OLS residual sum of squares exceeds the binary64 result envelope"
            )
        degrees = len(xs) - 2
        residual_variance = sse / degrees
        slope_standard_error = math.sqrt(residual_variance / sxx)
        mean_x = stable_mean(xs)
        centered_mean_ratio = mean_x / math.sqrt(sxx)
        intercept_standard_error = math.sqrt(
            residual_variance
            * (1.0 / len(xs) + centered_mean_ratio * centered_mean_ratio)
        )
        correlation = min(1.0, max(-1.0, correlation))
        r_squared = (
            1.0
            if syy == 0.0 and sse == 0.0
            else (1.0 - sse / syy if syy > 0.0 else 0.0)
        )
        distribution = StudentT(degrees)
        two_sided_critical = distribution.inverse_survival(0.5 * (1.0 - level))
        slope_critical = (
            two_sided_critical
            if alternative == "two-sided"
            else distribution.inverse_survival(1.0 - level)
        )
        diagnostics: list[Any] = []
        if slope_standard_error == 0.0:
            statistic = None
            pvalue = None
            slope_interval = [slope, slope]
            intercept_interval = [intercept, intercept]
            diagnostics.append(
                diagnostic(
                    "zero_residual_variance",
                    "The line fits exactly; binary64 standard errors collapse to zero and a slope p-value is not reported.",
                    severity="info",
                )
            )
        else:
            statistic = slope / slope_standard_error
            if alternative == "less":
                pvalue = distribution.cdf(statistic)
            elif alternative == "greater":
                pvalue = distribution.sf(statistic)
            else:
                pvalue = min(1.0, 2.0 * distribution.sf(abs(statistic)))
            if alternative == "greater":
                slope_interval = [
                    slope - slope_critical * slope_standard_error,
                    None,
                ]
            elif alternative == "less":
                slope_interval = [
                    None,
                    slope + slope_critical * slope_standard_error,
                ]
            else:
                slope_interval = [
                    slope - slope_critical * slope_standard_error,
                    slope + slope_critical * slope_standard_error,
                ]
            intercept_interval = [
                intercept - two_sided_critical * intercept_standard_error,
                intercept + two_sided_critical * intercept_standard_error,
            ]
        reported_scalars = [
            slope_standard_error,
            intercept_standard_error,
            correlation,
            r_squared,
        ]
        reported_scalars.extend(
            value for value in slope_interval + intercept_interval if value is not None
        )
        if not all(math.isfinite(value) for value in reported_scalars):
            raise StatisticsNumericalError(
                "the OLS inference result exceeds the finite binary64 envelope"
            )
        residual_scale = max((abs(value) for value in residuals), default=0.0)
        normalized_residuals = (
            [0.0] * len(residuals)
            if residual_scale == 0.0
            else [value / residual_scale for value in residuals]
        )
        centered_x = [value - mean_x for value in xs]
        centered_x_scale = max(abs(value) for value in centered_x)
        normalized_x = [value / centered_x_scale for value in centered_x]
        sum_residual = abs(math.fsum(normalized_residuals))
        orthogonal_residual = abs(
            math.fsum(
                normalized_residuals[index] * normalized_x[index]
                for index in range(len(xs))
            )
        )
        normalized_tolerance = 4096.0 * binary64_ulp(float(max(len(xs), 1)))
        explained_sum_squares = (slope * sxx) * slope
        if not math.isfinite(explained_sum_squares):
            raise StatisticsNumericalError(
                "the OLS explained sum of squares exceeds the binary64 result envelope"
            )
        checks = [
            {
                "identity": "scaled sum of residuals is approximately zero",
                "residual": sum_residual,
                "tolerance": normalized_tolerance,
                "passed": sum_residual <= normalized_tolerance,
            },
            {
                "identity": "scaled residuals are approximately orthogonal to centered x",
                "residual": orthogonal_residual,
                "tolerance": normalized_tolerance,
                "passed": orthogonal_residual <= normalized_tolerance,
            },
            {
                "identity": "SST approximately equals SSR + SSE",
                "residual": abs(syy - (explained_sum_squares + sse)),
                "tolerance": 256.0 * binary64_ulp(max(syy, sse, 1.0)),
                "passed": abs(syy - (explained_sum_squares + sse))
                <= 256.0 * binary64_ulp(max(syy, sse, 1.0)),
            },
            {
                "identity": "R-squared agrees with squared correlation",
                "residual": abs(r_squared - correlation * correlation),
                "tolerance": 2.0e-12,
                "passed": syy == 0.0
                or abs(r_squared - correlation * correlation) <= 2.0e-12,
                "applicable": syy != 0.0,
            },
        ]
        passed = all(bool(check["passed"]) for check in checks)
        validation = {
            "truth_level": "validated_approximate" if passed else "indeterminate",
            "passed": passed,
            "checks": checks,
            "residual_norm": math.sqrt(sse),
            "condition_indicator": max(
                (centered_x_scale / math.sqrt(sxx)) ** 2 * len(xs),
                abs(mean_x) / centered_x_scale,
            ),
        }
        value = {
            "intercept": intercept,
            "slope": slope,
            "correlation": correlation,
            "r_squared": r_squared,
            "residual_sum_squares": sse,
            "residual_standard_error": math.sqrt(residual_variance),
            "degrees_of_freedom": degrees,
            "slope_standard_error": slope_standard_error,
            "intercept_standard_error": intercept_standard_error,
            "slope_statistic": statistic,
            "slope_p_value": pvalue,
            "alternative": alternative,
            "confidence_level": level,
            "slope_confidence_interval": slope_interval,
            "intercept_confidence_interval": intercept_interval,
            "fitted_values": fitted,
            "residuals": residuals,
        }
        guard.trace.append(
            "phase",
            data={
                "intercept": intercept,
                "slope": slope,
                "r_squared": r_squared,
                "residual_degrees_of_freedom": degrees,
                "visual_sample_count": min(len(xs), _MAX_VISUAL_PAIRS),
            },
        )
        guard.trace.append("validation", data=validation, important=True, force=True)
        guard.trace.append(
            "finish" if passed else "failure",
            data={"status": "converged" if passed else "validation_failed"},
            important=True,
            force=True,
        )
        return StatisticsResult(
            "linear_regression",
            success=passed,
            status="converged" if passed else "validation_failed",
            value=value,
            method="ordinary-least-squares",
            validation=validation,
            assumptions=_OLS_ASSUMPTIONS,
            diagnostics=diagnostics,
            trace=guard.trace,
            evaluations=guard.evaluations,
            elapsed_ms=guard.elapsed_ms(),
            resource_budget=guard.budget,
            domain_payload=_line_payload(xs, ys, intercept, slope),
        )
    except StatisticsStopped as stopped:
        return _stopped_result(
            "linear_regression", "ordinary-least-squares", guard, stopped
        )
    except (StatisticsNumericalError, OverflowError) as error:
        return _numerical_result(
            "linear_regression", "ordinary-least-squares", guard, str(error)
        )


def _tie_counts(values: Sequence[float]) -> list[int]:
    ordered = sorted(values)
    answer: list[int] = []
    run = 1
    for index in range(1, len(ordered)):
        if ordered[index] == ordered[index - 1]:
            run += 1
        else:
            if run > 1:
                answer.append(run)
            run = 1
    if run > 1:
        answer.append(run)
    return answer


def theil_sen_regression(
    x: Iterable[Any],
    y: Iterable[Any],
    *,
    confidence: float = 0.95,
    intercept_method: str = "separate",
    nan_policy: str = "raise",
    budget: ResourceBudget | None = None,
    cancel: Callable[[], bool] | None = None,
    trace: str = "summary",
) -> StatisticsResult:
    """Fit the median pairwise-slope Theil-Sen robust line."""
    level = validate_probability(confidence, open_interval=True)
    if intercept_method not in ("separate", "joint"):
        raise ValueError("intercept_method must be 'separate' or 'joint'")
    guard = BudgetGuard(budget=budget, cancel=cancel, trace=trace)
    guard.trace.append(
        "start",
        data={"operation": "theil_sen_regression", "confidence": level},
        important=True,
        force=True,
    )
    slopes: list[float] = []
    try:
        xs, ys = paired_values(x, y, nan_policy=nan_policy, guard=guard, minimum=2)
        for right in range(1, len(xs)):
            for left in range(right):
                guard.check(1)
                difference = xs[right] - xs[left]
                response_difference = ys[right] - ys[left]
                if not math.isfinite(difference) or not math.isfinite(
                    response_difference
                ):
                    raise StatisticsNumericalError(
                        "a pairwise difference exceeds the finite binary64 envelope"
                    )
                if difference != 0.0:
                    candidate = response_difference / difference
                    if not math.isfinite(candidate):
                        raise StatisticsNumericalError(
                            "a pairwise slope exceeds the finite binary64 result envelope"
                        )
                    slopes.append(candidate)
        if not slopes:
            raise ValueError("Theil-Sen regression requires distinct x values")
        slopes.sort()
        slope = median(slopes)
        if intercept_method == "joint":
            intercept = median(
                [ys[index] - slope * xs[index] for index in range(len(xs))]
            )
        else:
            intercept = median(ys) - slope * median(xs)
        if not math.isfinite(intercept):
            raise StatisticsNumericalError(
                "the Theil-Sen intercept exceeds the binary64 result envelope"
            )
        alpha = 1.0 - level
        z = Normal().quantile(alpha / 2.0)
        n = len(xs)
        tie_x = _tie_counts(xs)
        tie_y = _tie_counts(ys)
        variance = (
            n * (n - 1) * (2 * n + 5)
            - math.fsum(count * (count - 1) * (2 * count + 5) for count in tie_x)
            - math.fsum(count * (count - 1) * (2 * count + 5) for count in tie_y)
        ) / 18.0
        sigma = math.sqrt(max(variance, 0.0))
        pair_count = len(slopes)
        lower_rank = max(int(round((pair_count + z * sigma) / 2.0)) - 1, 0)
        upper_rank = min(int(round((pair_count - z * sigma) / 2.0)), pair_count - 1)
        slope_interval = [slopes[lower_rank], slopes[upper_rank]]
        residuals = [
            ys[index] - intercept - slope * xs[index] for index in range(len(xs))
        ]
        if not all(math.isfinite(value) for value in residuals):
            raise StatisticsNumericalError(
                "Theil-Sen residuals exceed the finite binary64 envelope"
            )
        median_residual = median(residuals)
        checks = [
            {
                "identity": "reported slope is the median finite pairwise slope",
                "residual": abs(slope - median(slopes)),
                "passed": slope == median(slopes),
            },
            {
                "identity": "slope interval is ordered and contains the estimate",
                "passed": slope_interval[0] <= slope <= slope_interval[1],
            },
            {
                "identity": "joint intercept centers residuals at zero",
                "residual": abs(median_residual),
                "passed": intercept_method != "joint"
                or abs(median_residual)
                <= 16.0 * binary64_ulp(max(abs(intercept), 1.0)),
                "applicable": intercept_method == "joint",
            },
        ]
        passed = all(bool(check["passed"]) for check in checks)
        validation = {
            "truth_level": "validated_approximate" if passed else "indeterminate",
            "passed": passed,
            "checks": checks,
        }
        guard.trace.append(
            "phase",
            data={"pairwise_slopes": pair_count, "distinct_x": len(set(xs))},
        )
        guard.trace.append("validation", data=validation, important=True, force=True)
        guard.trace.append(
            "finish" if passed else "failure",
            data={"status": "converged" if passed else "validation_failed"},
            important=True,
            force=True,
        )
        return StatisticsResult(
            "theil_sen_regression",
            success=passed,
            status="converged" if passed else "validation_failed",
            value={
                "intercept": intercept,
                "slope": slope,
                "slope_confidence_interval": slope_interval,
                "confidence_level": level,
                "intercept_method": intercept_method,
                "pairwise_slope_count": pair_count,
                "residuals": residuals,
            },
            method="theil-sen",
            validation=validation,
            assumptions=(
                "the conditional median is represented by a straight line",
                "observations are independent for the Sen rank confidence interval",
                "the intercept has no confidence interval in this implementation",
            ),
            trace=guard.trace,
            evaluations=guard.evaluations,
            elapsed_ms=guard.elapsed_ms(),
            resource_budget=guard.budget,
            domain_payload=_line_payload(xs, ys, intercept, slope),
        )
    except StatisticsStopped as stopped:
        return _stopped_result(
            "theil_sen_regression",
            "theil-sen",
            guard,
            stopped,
            partial={"pairwise_slopes_completed": len(slopes)},
        )
    except (StatisticsNumericalError, OverflowError) as error:
        return _numerical_result("theil_sen_regression", "theil-sen", guard, str(error))


def _weighted_line(
    xs: Sequence[float], ys: Sequence[float], weights: Sequence[float]
) -> tuple[float, float]:
    total_weight = math.fsum(weights)
    if total_weight <= 0.0:
        raise ArithmeticError("all robust regression weights vanished")
    absolute_x = max(abs(value) for value in xs)
    absolute_y = max(abs(value) for value in ys)
    x_scale = max(absolute_x, 1.0)
    y_scale = max(absolute_y, 1.0)
    mean_x = x_scale * (
        math.fsum(weights[index] * (xs[index] / x_scale) for index in range(len(xs)))
        / total_weight
    )
    mean_y = y_scale * (
        math.fsum(weights[index] * (ys[index] / y_scale) for index in range(len(xs)))
        / total_weight
    )
    spread_x = max(abs(value - mean_x) for value in xs)
    spread_y = max(abs(value - mean_y) for value in ys)
    if not math.isfinite(spread_x) or not math.isfinite(spread_y):
        raise StatisticsNumericalError(
            "weighted centering exceeds the finite binary64 envelope"
        )
    if spread_x == 0.0:
        raise ValueError("robust regression requires distinct weighted x values")
    normalized_x = [(value - mean_x) / spread_x for value in xs]
    normalized_y = (
        [0.0] * len(ys)
        if spread_y == 0.0
        else [(value - mean_y) / spread_y for value in ys]
    )
    denominator = math.fsum(
        weights[index] * normalized_x[index] * normalized_x[index]
        for index in range(len(xs))
    )
    if denominator == 0.0:
        raise ValueError("robust regression requires distinct weighted x values")
    numerator = math.fsum(
        weights[index] * normalized_x[index] * normalized_y[index]
        for index in range(len(xs))
    )
    slope = 0.0 if spread_y == 0.0 else (spread_y / spread_x) * numerator / denominator
    intercept = mean_y - slope * mean_x
    if not math.isfinite(slope) or not math.isfinite(intercept):
        raise StatisticsNumericalError(
            "the weighted line exceeds the finite binary64 result envelope"
        )
    return intercept, slope


def huber_regression(
    x: Iterable[Any],
    y: Iterable[Any],
    *,
    tuning: float = 1.345,
    tolerance: float = 1.0e-10,
    nan_policy: str = "raise",
    budget: ResourceBudget | None = None,
    cancel: Callable[[], bool] | None = None,
    trace: str = "iterations",
) -> StatisticsResult:
    """Fit a Huber M-estimator by bounded iteratively reweighted least squares."""
    tuning_value = float(tuning)
    tolerance_value = float(tolerance)
    if not math.isfinite(tuning_value) or tuning_value <= 0.0:
        raise ValueError("tuning must be positive and finite")
    if not math.isfinite(tolerance_value) or tolerance_value <= 0.0:
        raise ValueError("tolerance must be positive and finite")
    guard = BudgetGuard(budget=budget, cancel=cancel, trace=trace)
    guard.trace.append(
        "start",
        data={
            "operation": "huber_regression",
            "tuning": tuning_value,
            "tolerance": tolerance_value,
        },
        important=True,
        force=True,
    )
    intercept = 0.0
    slope = 0.0
    scale = 0.0
    try:
        xs, ys = paired_values(x, y, nan_policy=nan_policy, guard=guard, minimum=3)
        intercept, slope, _, _, _ = _ols_coefficients(xs, ys)
        initial_residuals = [
            ys[index] - intercept - slope * xs[index] for index in range(len(xs))
        ]
        data_scale = max(max(abs(value) for value in ys), 1.0)
        scale_floor = math.sqrt(binary64_ulp(1.0)) * data_scale
        scale = (
            median(
                [abs(value - median(initial_residuals)) for value in initial_residuals]
            )
            / 0.6744897501960817
        )
        if scale == 0.0:
            residual_scale = max(abs(value) for value in initial_residuals)
            if residual_scale > 0.0:
                scale = residual_scale * math.sqrt(
                    math.fsum(
                        (value / residual_scale) * (value / residual_scale)
                        for value in initial_residuals
                    )
                    / len(xs)
                )
        if scale == 0.0:
            scale = scale_floor
        scale = max(scale, scale_floor)
        initial_objective = _scaled_huber_objective(
            initial_residuals, scale, tuning_value
        )
        converged = False
        weights: list[float] = [1.0] * len(xs)
        for _ in range(guard.budget.max_iterations):
            iteration = guard.iterate()
            residuals = [
                ys[index] - intercept - slope * xs[index] for index in range(len(xs))
            ]
            guard.check(len(xs))
            weights = []
            for residual in residuals:
                standardized = abs(residual) / scale
                weights.append(
                    1.0 if standardized <= tuning_value else tuning_value / standardized
                )
            new_intercept, new_slope = _weighted_line(xs, ys, weights)
            change = max(
                abs(new_intercept - intercept) / max(1.0, abs(intercept)),
                abs(new_slope - slope) / max(1.0, abs(slope)),
            )
            new_residuals = [
                ys[index] - new_intercept - new_slope * xs[index]
                for index in range(len(xs))
            ]
            objective = _scaled_huber_objective(new_residuals, scale, tuning_value)
            intercept = new_intercept
            slope = new_slope
            guard.trace.append(
                "iteration",
                iteration=iteration,
                accepted=True,
                data={
                    "intercept": intercept,
                    "slope": slope,
                    "scale": scale,
                    "relative_change": change,
                    "objective": objective,
                },
            )
            if change <= tolerance_value:
                converged = True
                break
        if not converged:
            raise StatisticsStopped("maximum_iterations")
        residuals = [
            ys[index] - intercept - slope * xs[index] for index in range(len(xs))
        ]
        standardized = [value / scale for value in residuals]
        weights = [
            1.0 if abs(value) <= tuning_value else tuning_value / abs(value)
            for value in standardized
        ]
        scores = [_huber_score(value, tuning_value) for value in standardized]
        score_intercept = math.fsum(scores)
        mean_x = stable_mean(xs)
        centered_x_scale = max(abs(value - mean_x) for value in xs)
        score_slope = math.fsum(
            scores[index] * ((xs[index] - mean_x) / centered_x_scale)
            for index in range(len(xs))
        )
        final_objective = _scaled_huber_objective(residuals, scale, tuning_value)
        final_residual_scale = max(abs(value) for value in residuals)
        residual_norm = (
            final_residual_scale
            * math.sqrt(
                math.fsum(
                    (value / final_residual_scale) * (value / final_residual_scale)
                    for value in residuals
                )
            )
            if final_residual_scale > 0.0
            else 0.0
        )
        score_scale = max(len(xs) * tuning_value, 1.0)
        score_tolerance = max(
            1.0e-7,
            64.0 * binary64_ulp(data_scale) / scale,
        )
        checks = [
            {
                "identity": "Huber intercept estimating equation is near zero",
                "residual": abs(score_intercept) / score_scale,
                "tolerance": score_tolerance,
                "passed": abs(score_intercept) / score_scale <= score_tolerance,
            },
            {
                "identity": "Huber slope estimating equation is near zero",
                "residual": abs(score_slope) / score_scale,
                "tolerance": score_tolerance,
                "passed": abs(score_slope) / score_scale <= score_tolerance,
            },
            {
                "identity": "IRLS did not increase the Huber objective from OLS initialization",
                "residual": max(0.0, final_objective - initial_objective),
                "passed": final_objective
                <= initial_objective + 64.0 * binary64_ulp(max(initial_objective, 1.0)),
            },
        ]
        passed = all(bool(check["passed"]) for check in checks)
        validation = {
            "truth_level": "validated_approximate" if passed else "indeterminate",
            "passed": passed,
            "checks": checks,
            "residual_norm": residual_norm,
        }
        guard.trace.append("validation", data=validation, important=True, force=True)
        guard.trace.append(
            "finish" if passed else "failure",
            iteration=guard.iterations,
            data={"status": "converged" if passed else "validation_failed"},
            important=True,
            force=True,
        )
        return StatisticsResult(
            "huber_regression",
            success=passed,
            status="converged" if passed else "validation_failed",
            value={
                "intercept": intercept,
                "slope": slope,
                "scale": scale,
                "tuning": tuning_value,
                "objective": final_objective,
                "weights": weights,
                "residuals": residuals,
            },
            method="huber-irls",
            validation=validation,
            assumptions=(
                "the conditional location of y is linear in x",
                "observations are independent",
                "the reported coefficients are a Huber M-estimate; no classical p-values are implied",
                "IRLS convergence finds a stationary point of this convex line-fit objective",
            ),
            trace=guard.trace,
            iterations=guard.iterations,
            evaluations=guard.evaluations,
            elapsed_ms=guard.elapsed_ms(),
            resource_budget=guard.budget,
            domain_payload=_line_payload(xs, ys, intercept, slope, weights=weights),
        )
    except StatisticsStopped as stopped:
        return _stopped_result(
            "huber_regression",
            "huber-irls",
            guard,
            stopped,
            partial={"intercept": intercept, "slope": slope, "scale": scale},
        )
    except (StatisticsNumericalError, OverflowError) as error:
        return _numerical_result("huber_regression", "huber-irls", guard, str(error))
