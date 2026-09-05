"""Detached statistics capabilities and evaluation-free planning."""

from __future__ import annotations

from typing import Any

from .._json import JSONValue, materialize_object
from ..model import NumericalPlan, NumericalProblem

CAPABILITY_SCHEMA_VERSION = 1

_IMPLEMENTATION_PLATFORMS = [
    "linux-x64",
    "linux-arm64",
    "macos-arm64",
    "windows-x64",
]
_IMPLEMENTATION_RUNTIMES = ["browser", "cpython", "node", "sea"]

_OPERATIONS: dict[str, dict[str, Any]] = {
    "descriptive_statistics": {
        "default_method": "corrected-two-pass",
        "methods": ("corrected-two-pass",),
        "requirements": ("finite_scalar_observations",),
        "validation": ("centered_sum", "quantile_order", "nonnegative_variance"),
    },
    "quantile": {
        "default_method": "linear-r-type-7",
        "methods": ("linear-r-type-7",),
        "requirements": (
            "finite_scalar_observations",
            "probability_in_closed_unit_interval",
        ),
        "validation": ("ordered_interpolation",),
    },
    "covariance": {
        "default_method": "corrected-two-pass",
        "methods": ("corrected-two-pass",),
        "requirements": ("paired_finite_observations",),
        "validation": ("centered_cross_product",),
    },
    "correlation": {
        "default_method": "scaled-centered-products",
        "methods": ("scaled-centered-products",),
        "requirements": ("paired_finite_observations", "nonconstant_pairs"),
        "validation": ("closed_unit_interval",),
    },
    "distribution_curve": {
        "default_method": "analytic-cdf",
        "methods": ("analytic-pdf", "analytic-pmf", "analytic-cdf", "analytic-sf"),
        "requirements": ("qualified_distribution_parameters", "finite_plot_bounds"),
        "validation": ("finite_nonnegative_ordinates",),
    },
    "random_sample": {
        "default_method": "normal-sampler",
        "methods": (
            "normal-sampler",
            "student_t-sampler",
            "chi_square-sampler",
            "binomial-sampler",
            "poisson-sampler",
        ),
        "requirements": ("qualified_sampler_parameters", "explicit_rng_state"),
        "validation": ("declared_support", "sampler_envelope"),
    },
    "mean_confidence_interval": {
        "default_method": "student-t-pivot",
        "methods": ("student-t-pivot",),
        "requirements": ("at_least_two_observations",),
        "validation": ("interval_symmetry", "estimate_containment"),
    },
    "one_sample_t_test": {
        "default_method": "one-sample-student-t",
        "methods": ("one-sample-student-t",),
        "requirements": ("at_least_two_observations", "positive_standard_error"),
        "validation": ("statistic_identity", "test_interval_duality"),
    },
    "two_sample_t_test": {
        "default_method": "welch-two-sample-t",
        "methods": ("welch-two-sample-t", "pooled-two-sample-t"),
        "requirements": ("two_samples", "positive_standard_error"),
        "validation": ("statistic_identity", "test_interval_duality"),
    },
    "linear_regression": {
        "default_method": "ordinary-least-squares",
        "methods": ("ordinary-least-squares",),
        "requirements": ("at_least_three_pairs", "distinct_predictor_values"),
        "validation": ("normal_equations", "sum_of_squares_decomposition"),
    },
    "theil_sen_regression": {
        "default_method": "theil-sen",
        "methods": ("theil-sen",),
        "requirements": ("at_least_two_pairs", "distinct_predictor_values"),
        "validation": ("median_pairwise_slope", "ordered_slope_interval"),
    },
    "huber_regression": {
        "default_method": "huber-irls",
        "methods": ("huber-irls",),
        "requirements": ("at_least_three_pairs", "distinct_predictor_values"),
        "validation": ("estimating_equations", "fixed_objective_descent"),
    },
    "huber_loss": {
        "default_method": "analytic-huber",
        "methods": ("analytic-huber",),
        "requirements": ("positive_finite_tuning",),
        "validation": ("piecewise_quadratic_linear_definition",),
    },
    "soft_l1_loss": {
        "default_method": "analytic-soft-l1",
        "methods": ("analytic-soft-l1",),
        "requirements": ("binary64_residual",),
        "validation": ("overflow_safe_identity",),
    },
    "cauchy_loss": {
        "default_method": "analytic-cauchy",
        "methods": ("analytic-cauchy",),
        "requirements": ("binary64_residual",),
        "validation": ("overflow_safe_log_identity",),
    },
}


def _operation_record(name: str) -> dict[str, JSONValue]:
    source = _OPERATIONS[name]
    methods: dict[str, JSONValue] = {}
    for method in source["methods"]:
        methods[str(method)] = {
            "backend": "ordinary-python",
            "numeric_types": ["binary64"],
            "source_transparent": True,
            "callback_evaluation_during_planning": False,
            "random_draws_during_planning": False,
            "implementation_targets": {
                "platforms": list(_IMPLEMENTATION_PLATFORMS),
                "runtimes": list(_IMPLEMENTATION_RUNTIMES),
            },
        }
    record: dict[str, JSONValue] = {
        "classification": "extension",
        "default_method": str(source["default_method"]),
        "methods": methods,
        "requirements": list(source["requirements"]),
        "validation": list(source["validation"]),
        "planning": "detached-metadata-only",
    }
    if name == "descriptive_statistics":
        record["prepared_data"] = {
            "classification": "extension",
            "constructor": "sagejs.numerics.statistics.StatisticsData",
            "default_backend": "dynamic",
            "native_backend": "experimental-explicit-aot-opt-in",
            "missing_native_artifact": "ordinary-python-fallback",
            "public_native_qualification": "pending",
            "browser_native_acceleration": "unsupported",
            "ownership": "copied-input-and-private-workspace",
            "summary_precomputed": False,
            "concurrent_queries": "unsupported-same-instance",
        }
    return record


def capabilities(operation: str | None = None) -> dict[str, JSONValue]:
    """Return detached package-local capability records.

    The registry describes only implementation properties. It makes no host or
    release-platform qualification claim.
    """
    if operation is not None and operation not in _OPERATIONS:
        return {
            "schema_version": CAPABILITY_SCHEMA_VERSION,
            "domain": "statistics",
            "operations": {},
        }
    names = sorted(_OPERATIONS) if operation is None else [operation]
    return {
        "schema_version": CAPABILITY_SCHEMA_VERSION,
        "domain": "statistics",
        "operations": {name: _operation_record(name) for name in names},
    }


def supports(problem: NumericalProblem, method: str | None = None) -> bool:
    """Return whether package-local planning can resolve `problem`."""
    if not isinstance(problem, NumericalProblem) or problem.domain != "statistics":
        return False
    record = _OPERATIONS.get(problem.operation)
    if record is None:
        return False
    requested = problem.method if method is None else str(method)
    return requested == "auto" or requested in record["methods"]


def plan(problem: NumericalProblem, method: str | None = None) -> NumericalPlan:
    """Resolve a statistics operation without evaluating callbacks or RNGs."""
    if not isinstance(problem, NumericalProblem):
        raise TypeError("problem must be a NumericalProblem")
    if problem.domain != "statistics" or problem.operation not in _OPERATIONS:
        raise NotImplementedError(
            "statistics planning is not implemented for " + problem.operation
        )
    record = _OPERATIONS[problem.operation]
    requested = problem.method if method is None else str(method)
    selected = str(record["default_method"]) if requested == "auto" else requested
    methods = record["methods"]
    if selected not in methods:
        raise ValueError(
            "unsupported method for " + problem.operation + ": " + selected
        )
    rejected = [
        {"method": candidate, "reason": "not selected by the detached request"}
        for candidate in methods
        if candidate != selected
    ]
    capability = _operation_record(problem.operation)
    method_capability = capability["methods"]
    if not isinstance(method_capability, dict):
        raise TypeError("invalid statistics capability record")
    selected_capability = method_capability[selected]
    if not isinstance(selected_capability, dict):
        raise TypeError("invalid statistics method capability")
    selected_record = dict(selected_capability)
    selected_record["domain"] = "statistics"
    selected_record["operation"] = problem.operation
    selected_record["requirements"] = capability["requirements"]
    selected_record["validation"] = capability["validation"]
    return NumericalPlan(
        problem,
        method=selected,
        backend="ordinary-python",
        reason=(
            "the explicit method request was accepted"
            if requested != "auto"
            else "the package-local deterministic default was selected"
        ),
        capability=materialize_object(selected_record, "$.statistics.capability"),
        fallback={
            "available": False,
            "reason": "the implementation is already the portable dynamic path",
        },
        expected_resources={
            "max_iterations": problem.resource_budget.max_iterations,
            "max_evaluations": problem.resource_budget.max_evaluations,
            "max_elapsed_ms": problem.resource_budget.max_elapsed_ms,
            "planning_evaluations": 0,
            "planning_random_draws": 0,
        },
        rejected_alternatives=rejected,
    )
