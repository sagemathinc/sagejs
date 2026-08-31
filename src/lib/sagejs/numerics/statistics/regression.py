"""Validated simple linear regression and robust line fitting."""

from __future__ import annotations

import math
from collections.abc import Callable, Iterable, Sequence
from typing import Any

from ..model import ResourceBudget
from ._core import (
    BudgetGuard,
    StatisticsStopped,
    binary64_ulp,
    centered_sum_squares,
    diagnostic,
    median,
    paired_values,
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
    value = float(residual)
    return 2.0 * (math.sqrt(1.0 + value * value) - 1.0)


def cauchy_loss(residual: float) -> float:
    """Cauchy robust loss `log(1 + r^2)`."""
    value = float(residual)
    return math.log1p(value * value)


def _huber_score(residual: float, tuning: float) -> float:
    return max(-tuning, min(tuning, residual))


def _line_payload(
    xs: Sequence[float], ys: Sequence[float], intercept: float, slope: float
) -> dict[str, Any]:
    lower = min(xs)
    upper = max(xs)
    return {
        "plot": {
            "kind": "regression",
            "x": list(xs),
            "y": list(ys),
            "line_x": [lower, upper],
            "line_y": [intercept + slope * lower, intercept + slope * upper],
        }
    }


def _stopped_result(
    operation: str,
    method: str,
    guard: BudgetGuard,
    status: str,
    *,
    partial: dict[str, Any] | None = None,
) -> StatisticsResult:
    guard.trace.append("failure", data={"status": status}, important=True, force=True)
    return StatisticsResult(
        operation,
        success=False,
        status=status,
        value=partial,
        method=method,
        validation={"truth_level": "indeterminate", "passed": False, "checks": []},
        diagnostics=[
            diagnostic(status, "Regression stopped at its resource boundary.")
        ],
        trace=guard.trace,
        evaluations=guard.evaluations,
        iterations=guard.iterations,
        elapsed_ms=guard.elapsed_ms(),
    )


def _ols_coefficients(
    xs: Sequence[float], ys: Sequence[float]
) -> tuple[float, float, float, float, float]:
    mean_x = stable_mean(xs)
    mean_y = stable_mean(ys)
    sxx = centered_sum_squares(xs, mean_x)
    syy = centered_sum_squares(ys, mean_y)
    if sxx == 0.0:
        raise ValueError("linear regression requires at least two distinct x values")
    sxy = math.fsum(
        (xs[index] - mean_x) * (ys[index] - mean_y) for index in range(len(xs))
    )
    slope = sxy / sxx
    intercept = mean_y - slope * mean_x
    return intercept, slope, sxx, syy, sxy


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
        intercept, slope, sxx, syy, sxy = _ols_coefficients(xs, ys)
        fitted = [intercept + slope * value for value in xs]
        residuals = [ys[index] - fitted[index] for index in range(len(xs))]
        guard.check(len(xs))
        sse = math.fsum(value * value for value in residuals)
        degrees = len(xs) - 2
        residual_variance = sse / degrees
        slope_standard_error = math.sqrt(residual_variance / sxx)
        mean_x = stable_mean(xs)
        intercept_standard_error = math.sqrt(
            residual_variance * (1.0 / len(xs) + mean_x * mean_x / sxx)
        )
        correlation = 0.0 if syy == 0.0 else sxy / math.sqrt(sxx * syy)
        correlation = min(1.0, max(-1.0, correlation))
        r_squared = (
            1.0
            if syy == 0.0 and sse == 0.0
            else (1.0 - sse / syy if syy > 0.0 else 0.0)
        )
        critical = StudentT(degrees).quantile(0.5 + 0.5 * level)
        diagnostics: list[dict[str, Any]] = []
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
            distribution = StudentT(degrees)
            if alternative == "less":
                pvalue = distribution.cdf(statistic)
            elif alternative == "greater":
                pvalue = distribution.sf(statistic)
            else:
                pvalue = min(1.0, 2.0 * distribution.sf(abs(statistic)))
            slope_interval = [
                slope - critical * slope_standard_error,
                slope + critical * slope_standard_error,
            ]
            intercept_interval = [
                intercept - critical * intercept_standard_error,
                intercept + critical * intercept_standard_error,
            ]
        sum_residual = abs(math.fsum(residuals))
        orthogonal_residual = abs(
            math.fsum(residuals[index] * xs[index] for index in range(len(xs)))
        )
        scale = max(
            math.sqrt(max(sse, 0.0)),
            math.sqrt(max(syy, 0.0)),
            max(abs(value) for value in ys),
            1.0,
        )
        x_scale = max(max(abs(value) for value in xs), 1.0)
        tolerance = 128.0 * binary64_ulp(scale * max(len(xs), 1))
        checks = [
            {
                "identity": "sum of residuals is approximately zero",
                "residual": sum_residual,
                "tolerance": tolerance,
                "passed": sum_residual <= tolerance,
            },
            {
                "identity": "residuals are approximately orthogonal to x",
                "residual": orthogonal_residual,
                "tolerance": tolerance * x_scale * len(xs),
                "passed": orthogonal_residual <= tolerance * x_scale * len(xs),
            },
            {
                "identity": "SST approximately equals SSR + SSE",
                "residual": abs(syy - (slope * slope * sxx + sse)),
                "tolerance": 256.0 * binary64_ulp(max(syy, sse, 1.0)),
                "passed": abs(syy - (slope * slope * sxx + sse))
                <= 256.0 * binary64_ulp(max(syy, sse, 1.0)),
            },
        ]
        passed = all(bool(check["passed"]) for check in checks)
        validation = {
            "truth_level": "validated_approximate" if passed else "indeterminate",
            "passed": passed,
            "checks": checks,
            "residual_norm": math.sqrt(sse),
            "condition_indicator": (
                max(abs(value - mean_x) for value in xs) ** 2 * len(xs) / sxx
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
            domain_payload=_line_payload(xs, ys, intercept, slope),
        )
    except StatisticsStopped as stopped:
        return _stopped_result(
            "linear_regression", "ordinary-least-squares", guard, stopped.status
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
                if difference != 0.0:
                    slopes.append((ys[right] - ys[left]) / difference)
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
            domain_payload=_line_payload(xs, ys, intercept, slope),
        )
    except StatisticsStopped as stopped:
        return _stopped_result(
            "theil_sen_regression",
            "theil-sen",
            guard,
            stopped.status,
            partial={"pairwise_slopes_completed": len(slopes)},
        )


def _weighted_line(
    xs: Sequence[float], ys: Sequence[float], weights: Sequence[float]
) -> tuple[float, float]:
    total_weight = math.fsum(weights)
    if total_weight <= 0.0:
        raise ArithmeticError("all robust regression weights vanished")
    mean_x = (
        math.fsum(weights[index] * xs[index] for index in range(len(xs))) / total_weight
    )
    mean_y = (
        math.fsum(weights[index] * ys[index] for index in range(len(xs))) / total_weight
    )
    denominator = math.fsum(
        weights[index] * (xs[index] - mean_x) ** 2 for index in range(len(xs))
    )
    if denominator == 0.0:
        raise ValueError("robust regression requires distinct weighted x values")
    numerator = math.fsum(
        weights[index] * (xs[index] - mean_x) * (ys[index] - mean_y)
        for index in range(len(xs))
    )
    slope = numerator / denominator
    return mean_y - slope * mean_x, slope


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
        data_scale = max(max(ys) - min(ys), max(abs(value) for value in ys), 1.0)
        scale_floor = math.sqrt(binary64_ulp(1.0)) * data_scale
        scale = (
            median(
                [abs(value - median(initial_residuals)) for value in initial_residuals]
            )
            / 0.6744897501960817
        )
        if scale == 0.0:
            scale = math.sqrt(
                math.fsum(value * value for value in initial_residuals) / len(xs)
            )
        if scale == 0.0:
            scale = scale_floor
        scale = max(scale, scale_floor)
        initial_objective = math.fsum(
            huber_loss(value / scale, tuning_value) * scale * scale
            for value in initial_residuals
        )
        converged = False
        weights: list[float] = [1.0] * len(xs)
        for _ in range(guard.budget.max_iterations):
            iteration = guard.iterate()
            residuals = [
                ys[index] - intercept - slope * xs[index] for index in range(len(xs))
            ]
            guard.check(len(xs))
            center = median(residuals)
            new_scale = (
                median([abs(value - center) for value in residuals])
                / 0.6744897501960817
            )
            if new_scale > 0.0:
                scale = max(new_scale, scale_floor)
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
            objective = math.fsum(
                huber_loss(
                    (ys[index] - new_intercept - new_slope * xs[index]) / scale,
                    tuning_value,
                )
                * scale
                * scale
                for index in range(len(xs))
            )
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
        scores = [_huber_score(value, tuning_value) for value in standardized]
        score_intercept = math.fsum(scores)
        mean_x = stable_mean(xs)
        score_slope = math.fsum(
            scores[index] * (xs[index] - mean_x) for index in range(len(xs))
        )
        final_objective = math.fsum(
            huber_loss(value, tuning_value) * scale * scale for value in standardized
        )
        score_scale = max(len(xs) * tuning_value, 1.0)
        x_scale = max(
            math.fsum(abs(value - mean_x) for value in xs) * tuning_value, 1.0
        )
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
                "residual": abs(score_slope) / x_scale,
                "tolerance": score_tolerance,
                "passed": abs(score_slope) / x_scale <= score_tolerance,
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
            "residual_norm": math.sqrt(math.fsum(value * value for value in residuals)),
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
            domain_payload=_line_payload(xs, ys, intercept, slope),
        )
    except StatisticsStopped as stopped:
        return _stopped_result(
            "huber_regression",
            "huber-irls",
            guard,
            stopped.status,
            partial={"intercept": intercept, "slope": slope, "scale": scale},
        )
