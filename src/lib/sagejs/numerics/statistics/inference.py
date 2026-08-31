"""Basic t-based confidence intervals and hypothesis tests."""

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
    finite_values,
    stable_mean,
    validate_alternative,
    validate_probability,
)
from .distributions import StudentT
from .result import StatisticsResult


_INFERENCE_ASSUMPTIONS = (
    "observations are independent within each sample",
    "the mean has an approximately normal sampling distribution; finite-sample exactness requires normal data",
    "observations are represented as finite binary64 values",
)


def _moments(values: Sequence[float]) -> tuple[float, float]:
    mean = stable_mean(values)
    return mean, centered_sum_squares(values, mean) / (len(values) - 1)


def _pvalue(statistic: float, distribution: StudentT, alternative: str) -> float:
    if alternative == "less":
        return distribution.cdf(statistic)
    if alternative == "greater":
        return distribution.sf(statistic)
    return min(1.0, 2.0 * distribution.sf(abs(statistic)))


def _stopped(
    operation: str,
    method: str,
    guard: BudgetGuard,
    stopped: StatisticsStopped,
) -> StatisticsResult:
    guard.trace.append(
        "failure",
        data={"status": stopped.status},
        important=True,
        force=True,
    )
    return StatisticsResult(
        operation,
        success=False,
        status=stopped.status,
        value=None,
        method=method,
        validation={"truth_level": "indeterminate", "passed": False, "checks": []},
        assumptions=_INFERENCE_ASSUMPTIONS,
        diagnostics=[
            diagnostic(stopped.status, "Inference stopped at its resource boundary.")
        ],
        trace=guard.trace,
        evaluations=guard.evaluations,
        elapsed_ms=guard.elapsed_ms(),
    )


def confidence_interval_mean(
    data: Iterable[Any],
    confidence: float = 0.95,
    *,
    nan_policy: str = "raise",
    budget: ResourceBudget | None = None,
    cancel: Callable[[], bool] | None = None,
    trace: str = "summary",
) -> StatisticsResult:
    """Two-sided Student t confidence interval for one population mean."""
    level = validate_probability(confidence, open_interval=True)
    guard = BudgetGuard(budget=budget, cancel=cancel, trace=trace)
    guard.trace.append(
        "start",
        data={"operation": "mean_confidence_interval", "confidence": level},
        important=True,
        force=True,
    )
    try:
        values = finite_values(data, nan_policy=nan_policy, guard=guard, minimum=2)
        mean, variance = _moments(values)
        standard_error = math.sqrt(variance / len(values))
        critical = StudentT(len(values) - 1).quantile(0.5 + 0.5 * level)
        half_width = critical * standard_error
        lower = mean - half_width
        upper = mean + half_width
        symmetry_residual = abs((upper - mean) - (mean - lower))
        tolerance = 16.0 * binary64_ulp(max(abs(mean), abs(half_width), 1.0))
        checks = [
            {
                "identity": "interval is centered on the sample mean",
                "residual": symmetry_residual,
                "tolerance": tolerance,
                "passed": symmetry_residual <= tolerance,
            },
            {
                "identity": "reported interval contains the estimate",
                "passed": lower <= mean <= upper,
            },
        ]
        passed = all(bool(check["passed"]) for check in checks)
        validation = {
            "truth_level": "validated_approximate" if passed else "indeterminate",
            "passed": passed,
            "checks": checks,
        }
        guard.trace.append("validation", data=validation, important=True, force=True)
        guard.trace.append(
            "finish" if passed else "failure",
            data={"status": "converged" if passed else "validation_failed"},
            important=True,
            force=True,
        )
        return StatisticsResult(
            "mean_confidence_interval",
            success=passed,
            status="converged" if passed else "validation_failed",
            value={
                "estimate": mean,
                "standard_error": standard_error,
                "degrees_of_freedom": len(values) - 1,
                "confidence_level": level,
                "critical_value": critical,
                "interval": [lower, upper],
            },
            method="student-t-pivot",
            validation=validation,
            assumptions=_INFERENCE_ASSUMPTIONS,
            trace=guard.trace,
            evaluations=guard.evaluations,
            elapsed_ms=guard.elapsed_ms(),
            domain_payload={
                "plot": {
                    "kind": "interval",
                    "parameter": "population mean",
                    "estimate": mean,
                    "lower": lower,
                    "upper": upper,
                }
            },
        )
    except StatisticsStopped as stopped:
        return _stopped("mean_confidence_interval", "student-t-pivot", guard, stopped)


def one_sample_t_test(
    data: Iterable[Any],
    population_mean: float = 0.0,
    *,
    alternative: str = "two-sided",
    confidence: float = 0.95,
    nan_policy: str = "raise",
    budget: ResourceBudget | None = None,
    cancel: Callable[[], bool] | None = None,
    trace: str = "summary",
) -> StatisticsResult:
    """Test a population mean with a one-sample Student t statistic."""
    null_mean = float(population_mean)
    if not math.isfinite(null_mean):
        raise ValueError("population_mean must be finite")
    alternative = validate_alternative(alternative)
    level = validate_probability(confidence, open_interval=True)
    guard = BudgetGuard(budget=budget, cancel=cancel, trace=trace)
    guard.trace.append(
        "start",
        data={
            "operation": "one_sample_t_test",
            "null_mean": null_mean,
            "alternative": alternative,
        },
        important=True,
        force=True,
    )
    try:
        values = finite_values(data, nan_policy=nan_policy, guard=guard, minimum=2)
        mean, variance = _moments(values)
        standard_error = math.sqrt(variance / len(values))
        if standard_error == 0.0:
            message = (
                "The t statistic is undefined because the sample variance is zero."
            )
            guard.trace.append(
                "failure",
                data={"status": "invalid_problem", "reason": "zero_variance"},
                important=True,
                force=True,
            )
            return StatisticsResult(
                "one_sample_t_test",
                success=False,
                status="invalid_problem",
                value={"estimate": mean, "null_value": null_mean},
                method="one-sample-student-t",
                validation={
                    "truth_level": "indeterminate",
                    "passed": False,
                    "checks": [],
                },
                assumptions=_INFERENCE_ASSUMPTIONS,
                diagnostics=[diagnostic("zero_variance", message, severity="error")],
                trace=guard.trace,
                evaluations=guard.evaluations,
                elapsed_ms=guard.elapsed_ms(),
            )
        degrees = len(values) - 1
        statistic = (mean - null_mean) / standard_error
        distribution = StudentT(degrees)
        pvalue = _pvalue(statistic, distribution, alternative)
        critical = distribution.quantile(0.5 + 0.5 * level)
        interval = [mean - critical * standard_error, mean + critical * standard_error]
        alpha = 1.0 - level
        duality = (pvalue < alpha) == (
            null_mean < interval[0] or null_mean > interval[1]
        )
        checks = [
            {
                "identity": "t statistic equals (estimate - null) / standard error",
                "residual": abs(statistic - (mean - null_mean) / standard_error),
                "passed": True,
            },
            {
                "identity": "two-sided test and confidence interval are dual",
                "passed": duality if alternative == "two-sided" else True,
                "applicable": alternative == "two-sided",
            },
            {"identity": "p-value is in [0, 1]", "passed": 0.0 <= pvalue <= 1.0},
        ]
        passed = all(bool(check["passed"]) for check in checks)
        validation = {
            "truth_level": "validated_approximate" if passed else "indeterminate",
            "passed": passed,
            "checks": checks,
        }
        guard.trace.append("validation", data=validation, important=True, force=True)
        guard.trace.append(
            "finish" if passed else "failure",
            data={"status": "converged" if passed else "validation_failed"},
            important=True,
            force=True,
        )
        return StatisticsResult(
            "one_sample_t_test",
            success=passed,
            status="converged" if passed else "validation_failed",
            value={
                "statistic": statistic,
                "p_value": pvalue,
                "degrees_of_freedom": degrees,
                "alternative": alternative,
                "null_value": null_mean,
                "estimate": mean,
                "standard_error": standard_error,
                "confidence_level": level,
                "confidence_interval": interval,
                "reject_at_alpha": pvalue < alpha,
            },
            method="one-sample-student-t",
            validation=validation,
            assumptions=_INFERENCE_ASSUMPTIONS,
            trace=guard.trace,
            evaluations=guard.evaluations,
            elapsed_ms=guard.elapsed_ms(),
            domain_payload={
                "plot": {
                    "kind": "interval",
                    "parameter": "population mean",
                    "estimate": mean,
                    "lower": interval[0],
                    "upper": interval[1],
                }
            },
        )
    except StatisticsStopped as stopped:
        return _stopped("one_sample_t_test", "one-sample-student-t", guard, stopped)


def two_sample_t_test(
    first: Iterable[Any],
    second: Iterable[Any],
    *,
    equal_variance: bool = False,
    alternative: str = "two-sided",
    confidence: float = 0.95,
    nan_policy: str = "raise",
    budget: ResourceBudget | None = None,
    cancel: Callable[[], bool] | None = None,
    trace: str = "summary",
) -> StatisticsResult:
    """Welch (default) or pooled two-sample t test for a difference in means."""
    if not isinstance(equal_variance, bool):
        raise TypeError("equal_variance must be a bool")
    alternative = validate_alternative(alternative)
    level = validate_probability(confidence, open_interval=True)
    guard = BudgetGuard(budget=budget, cancel=cancel, trace=trace)
    method = "pooled-two-sample-t" if equal_variance else "welch-two-sample-t"
    guard.trace.append(
        "start",
        data={"operation": "two_sample_t_test", "method": method},
        important=True,
        force=True,
    )
    try:
        first_values = finite_values(
            first, nan_policy=nan_policy, guard=guard, minimum=2
        )
        second_values = finite_values(
            second, nan_policy=nan_policy, guard=guard, minimum=2
        )
        first_mean, first_variance = _moments(first_values)
        second_mean, second_variance = _moments(second_values)
        n1 = len(first_values)
        n2 = len(second_values)
        if equal_variance:
            degrees = n1 + n2 - 2.0
            pooled = ((n1 - 1) * first_variance + (n2 - 1) * second_variance) / degrees
            standard_error = math.sqrt(pooled * (1.0 / n1 + 1.0 / n2))
        else:
            first_component = first_variance / n1
            second_component = second_variance / n2
            standard_error = math.sqrt(first_component + second_component)
            denominator = first_component * first_component / (
                n1 - 1
            ) + second_component * second_component / (n2 - 1)
            degrees = (
                (first_component + second_component) ** 2 / denominator
                if denominator > 0.0
                else 0.0
            )
        if standard_error == 0.0 or degrees <= 0.0:
            guard.trace.append(
                "failure",
                data={"status": "invalid_problem", "reason": "zero_variance"},
                important=True,
                force=True,
            )
            return StatisticsResult(
                "two_sample_t_test",
                success=False,
                status="invalid_problem",
                value={"estimate": first_mean - second_mean},
                method=method,
                validation={
                    "truth_level": "indeterminate",
                    "passed": False,
                    "checks": [],
                },
                assumptions=_INFERENCE_ASSUMPTIONS,
                diagnostics=[
                    diagnostic(
                        "zero_variance",
                        "The two-sample t statistic has zero standard error.",
                        severity="error",
                    )
                ],
                trace=guard.trace,
                evaluations=guard.evaluations,
                elapsed_ms=guard.elapsed_ms(),
            )
        estimate = first_mean - second_mean
        statistic = estimate / standard_error
        distribution = StudentT(degrees)
        pvalue = _pvalue(statistic, distribution, alternative)
        critical = distribution.quantile(0.5 + 0.5 * level)
        interval = [
            estimate - critical * standard_error,
            estimate + critical * standard_error,
        ]
        checks = [
            {
                "identity": "reported t statistic matches estimate / standard error",
                "residual": abs(statistic - estimate / standard_error),
                "passed": True,
            },
            {"identity": "p-value is in [0, 1]", "passed": 0.0 <= pvalue <= 1.0},
            {
                "identity": "confidence interval contains the point estimate",
                "passed": interval[0] <= estimate <= interval[1],
            },
        ]
        passed = all(bool(check["passed"]) for check in checks)
        validation = {
            "truth_level": "validated_approximate" if passed else "indeterminate",
            "passed": passed,
            "checks": checks,
        }
        assumptions: list[str] = list(_INFERENCE_ASSUMPTIONS)
        assumptions.append(
            "the two population variances are equal"
            if equal_variance
            else "Welch's unequal-variance standard error and Satterthwaite degrees of freedom are used"
        )
        guard.trace.append("validation", data=validation, important=True, force=True)
        guard.trace.append(
            "finish" if passed else "failure",
            data={"status": "converged" if passed else "validation_failed"},
            important=True,
            force=True,
        )
        return StatisticsResult(
            "two_sample_t_test",
            success=passed,
            status="converged" if passed else "validation_failed",
            value={
                "statistic": statistic,
                "p_value": pvalue,
                "degrees_of_freedom": degrees,
                "alternative": alternative,
                "estimate": estimate,
                "standard_error": standard_error,
                "confidence_level": level,
                "confidence_interval": interval,
                "reject_at_alpha": pvalue < 1.0 - level,
                "sample_sizes": [n1, n2],
            },
            method=method,
            validation=validation,
            assumptions=assumptions,
            trace=guard.trace,
            evaluations=guard.evaluations,
            elapsed_ms=guard.elapsed_ms(),
            domain_payload={
                "plot": {
                    "kind": "interval",
                    "parameter": "difference in means",
                    "estimate": estimate,
                    "lower": interval[0],
                    "upper": interval[1],
                }
            },
        )
    except StatisticsStopped as stopped:
        return _stopped("two_sample_t_test", method, guard, stopped)
