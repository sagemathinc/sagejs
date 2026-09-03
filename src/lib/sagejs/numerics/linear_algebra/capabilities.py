"""Detached capability discovery and no-computation linear-algebra planning."""

from __future__ import annotations

from typing import Any

from .._json import JSONValue, materialize_object
from ..model import NumericalPlan, NumericalProblem

CAPABILITY_SCHEMA_VERSION = 1

_TRACE_LEVELS = ["none", "summary", "iterations", "evaluations", "debug"]
_IMPLEMENTATION_PLATFORMS = [
    "linux-x64",
    "linux-arm64",
    "macos-arm64",
    "windows-x64",
]
_IMPLEMENTATION_RUNTIMES = ["browser", "cpython", "node", "sea"]


def _method(
    *,
    requires: list[str],
    validation: list[str],
    complexity: str,
    visualizations: list[str],
) -> dict[str, JSONValue]:
    return materialize_object(
        {
            "classification": "extension",
            "backend": "ordinary-python",
            "numeric_types": ["binary64"],
            "storage": ["finite_immutable_row_major"],
            "requires": requires,
            "validation": validation,
            "complexity": complexity,
            "trace_levels": list(_TRACE_LEVELS),
            "visualizations": visualizations,
            "implementation_targets": {
                "platforms": list(_IMPLEMENTATION_PLATFORMS),
                "runtimes": list(_IMPLEMENTATION_RUNTIMES),
            },
            "source_transparent": True,
        },
        "$.linear_algebra.method",
    )


_OPERATIONS: dict[str, dict[str, Any]] = {
    "lu_factorization": {
        "classification": "extension",
        "methods": {
            "partial_pivot_lu": _method(
                requires=["finite_real_rectangular_matrix"],
                validation=["independent_lu_reconstruction"],
                complexity="O(m*n*min(m,n))",
                visualizations=[
                    "factorization",
                    "validation",
                    "factorization_animation",
                ],
            )
        },
    },
    "qr_factorization": {
        "classification": "extension",
        "methods": {
            "householder_qr": _method(
                requires=["finite_real_rectangular_matrix"],
                validation=["independent_qr_reconstruction", "q_column_orthogonality"],
                complexity="O(m*n*min(m,n))",
                visualizations=[
                    "factorization",
                    "validation",
                    "factorization_animation",
                ],
            ),
            "column_pivoted_householder_qr": _method(
                requires=["finite_real_rectangular_matrix"],
                validation=["independent_qr_reconstruction", "q_column_orthogonality"],
                complexity="O(m*n*min(m,n))",
                visualizations=[
                    "factorization",
                    "validation",
                    "factorization_animation",
                ],
            ),
        },
    },
    "cholesky_factorization": {
        "classification": "extension",
        "methods": {
            "cholesky": _method(
                requires=[
                    "finite_real_square_matrix",
                    "verified_symmetric_positive_definite",
                ],
                validation=["independent_cholesky_reconstruction", "positive_diagonal"],
                complexity="O(n^3)",
                visualizations=[
                    "factorization",
                    "validation",
                    "factorization_animation",
                ],
            )
        },
    },
    "linear_solve": {
        "classification": "extension",
        "methods": {
            "partial_pivot_lu": _method(
                requires=["finite_real_square_matrix", "full_numerical_rank"],
                validation=[
                    "independent_compensated_residual",
                    "normwise_backward_error",
                ],
                complexity="O(n^3 + n^2*r)",
                visualizations=[
                    "conditioning",
                    "factorization",
                    "convergence",
                    "validation",
                ],
            ),
            "column_pivoted_householder_qr": _method(
                requires=["finite_real_square_matrix", "full_numerical_rank"],
                validation=[
                    "independent_compensated_residual",
                    "normwise_backward_error",
                ],
                complexity="O(n^3 + n^2*r)",
                visualizations=[
                    "conditioning",
                    "factorization",
                    "convergence",
                    "validation",
                ],
            ),
            "cholesky": _method(
                requires=[
                    "finite_real_square_matrix",
                    "verified_symmetric_positive_definite",
                ],
                validation=[
                    "independent_compensated_residual",
                    "normwise_backward_error",
                ],
                complexity="O(n^3 + n^2*r)",
                visualizations=[
                    "conditioning",
                    "factorization",
                    "convergence",
                    "validation",
                ],
            ),
        },
    },
    "least_squares": {
        "classification": "extension",
        "methods": {
            "column_pivoted_householder_qr": _method(
                requires=["finite_real_tall_or_square_matrix", "full_column_rank"],
                validation=[
                    "least_squares_stationarity",
                    "consistent_system_backward_error",
                ],
                complexity="O(m*n^2)",
                visualizations=[
                    "conditioning",
                    "factorization",
                    "convergence",
                    "validation",
                ],
            ),
            "column_pivoted_householder_qr_of_transpose": _method(
                requires=["finite_real_wide_matrix", "full_row_rank"],
                validation=[
                    "consistent_system_backward_error",
                    "independent_minimum_norm_row_space",
                ],
                complexity="O(n*m^2)",
                visualizations=[
                    "conditioning",
                    "factorization",
                    "convergence",
                    "validation",
                ],
            ),
        },
    },
    "matrix_rank": {
        "classification": "extension",
        "methods": {
            "one_sided_jacobi": _method(
                requires=["finite_real_rectangular_matrix"],
                validation=[
                    "jacobi_column_orthogonalization",
                    "recorded_rank_threshold",
                ],
                complexity="O(m*n^2*sweeps)",
                visualizations=["conditioning", "convergence"],
            )
        },
    },
    "condition_number": {
        "classification": "extension",
        "methods": {
            "one_sided_jacobi": _method(
                requires=["finite_real_rectangular_matrix"],
                validation=[
                    "jacobi_column_orthogonalization",
                    "recorded_rank_threshold",
                ],
                complexity="O(m*n^2*sweeps)",
                visualizations=["conditioning", "convergence"],
            )
        },
    },
    "determinant": {
        "classification": "extension",
        "methods": {
            "partial_pivot_lu": _method(
                requires=["finite_real_square_matrix", "explicit_request"],
                validation=["independent_lu_reconstruction", "sign_log_magnitude"],
                complexity="O(n^3)",
                visualizations=[
                    "factorization",
                    "validation",
                    "factorization_animation",
                ],
            )
        },
    },
    "matrix_inverse": {
        "classification": "extension",
        "methods": {
            "partial_pivot_lu": _method(
                requires=[
                    "finite_real_square_matrix",
                    "full_numerical_rank",
                    "explicit_request",
                ],
                validation=["left_inverse_residual", "right_inverse_residual"],
                complexity="O(n^3)",
                visualizations=[
                    "conditioning",
                    "factorization",
                    "convergence",
                    "validation",
                ],
            )
        },
    },
}

_ALIASES = {
    "lu": "partial_pivot_lu",
    "qr": "column_pivoted_householder_qr",
}


def capabilities(operation: str | None = None) -> dict[str, JSONValue]:
    """Return a detached package-local capability record, optionally filtered."""
    if operation is not None and not isinstance(operation, str):
        raise TypeError("operation must be a string or None")
    selected: dict[str, Any]
    if operation is None:
        selected = _OPERATIONS
    elif operation in _OPERATIONS:
        selected = {operation: _OPERATIONS[operation]}
    else:
        selected = {}
    return materialize_object(
        {
            "schema_version": CAPABILITY_SCHEMA_VERSION,
            "domain": "linear_algebra",
            "operations": selected,
        },
        "$.linear_algebra.capabilities",
    )


def _problem_shape(problem: NumericalProblem) -> tuple[int, int] | None:
    record = problem.to_dict()
    variables = record.get("variables")
    if not isinstance(variables, list) or len(variables) == 0:
        return None
    first = variables[0]
    shape = first.get("shape") if isinstance(first, dict) else None
    if not isinstance(shape, list) or len(shape) != 2:
        return None
    rows, columns = shape
    if (
        isinstance(rows, bool)
        or not isinstance(rows, int)
        or isinstance(columns, bool)
        or not isinstance(columns, int)
    ):
        return None
    return rows, columns


def _methods(operation: str) -> dict[str, Any]:
    operation_record = _OPERATIONS[operation]
    methods = operation_record.get("methods")
    if not isinstance(methods, dict):
        raise TypeError("invalid linear-algebra capability record")
    return methods


def _requested_method(problem: NumericalProblem, method: str | None) -> str:
    requested = problem.method if method is None else str(method)
    return _ALIASES.get(requested, requested)


def _structurally_supported(operation: str, shape: tuple[int, int] | None) -> bool:
    if shape is None:
        return False
    rows, columns = shape
    if rows < 0 or columns < 0:
        return False
    if operation in (
        "cholesky_factorization",
        "linear_solve",
        "determinant",
        "matrix_inverse",
    ):
        return rows == columns
    return True


def _method_shape_supported(
    operation: str, method: str, shape: tuple[int, int]
) -> bool:
    if operation != "least_squares":
        return True
    rows, columns = shape
    if method == "column_pivoted_householder_qr":
        return rows >= columns
    if method == "column_pivoted_householder_qr_of_transpose":
        return rows < columns
    return False


def supports(problem: NumericalProblem, method: str | None = None) -> bool:
    """Return whether metadata permits a package-local plan without computing."""
    if not isinstance(problem, NumericalProblem):
        raise TypeError("problem must be a NumericalProblem")
    if problem.domain != "linear_algebra" or problem.operation not in _OPERATIONS:
        return False
    record = problem.to_dict()
    if record.get("numeric_type") != "binary64":
        return False
    shape = _problem_shape(problem)
    if not _structurally_supported(problem.operation, shape):
        return False
    if shape is None:
        return False
    requested = _requested_method(problem, method)
    if requested == "auto":
        return True
    return requested in _methods(problem.operation) and _method_shape_supported(
        problem.operation, requested, shape
    )


def _automatic_method(
    problem: NumericalProblem, shape: tuple[int, int]
) -> tuple[str, str]:
    operation = problem.operation
    rows, columns = shape
    metadata = problem.to_dict().get("metadata")
    metadata_record = metadata if isinstance(metadata, dict) else {}
    if operation == "linear_solve":
        if metadata_record.get("assume") == "positive_definite":
            return (
                "cholesky",
                "the explicit positive-definite assumption selects checked Cholesky",
            )
        return (
            "partial_pivot_lu",
            "the general square dense solve defaults to partial-pivot LU",
        )
    if operation == "least_squares":
        if rows >= columns:
            return (
                "column_pivoted_householder_qr",
                "a tall or square input selects column-pivoted QR",
            )
        return (
            "column_pivoted_householder_qr_of_transpose",
            "a wide input selects column-pivoted QR of A.T for minimum norm",
        )
    if operation == "qr_factorization" and metadata_record.get("pivoted") is True:
        return (
            "column_pivoted_householder_qr",
            "the explicit pivoted option selects column pivoting",
        )
    defaults = {
        "lu_factorization": "partial_pivot_lu",
        "qr_factorization": "householder_qr",
        "cholesky_factorization": "cholesky",
        "matrix_rank": "one_sided_jacobi",
        "condition_number": "one_sided_jacobi",
        "determinant": "partial_pivot_lu",
        "matrix_inverse": "partial_pivot_lu",
    }
    return defaults[operation], "the operation has one default reference method"


def plan(problem: NumericalProblem, method: str | None = None) -> NumericalPlan:
    """Resolve a linear-algebra plan from immutable metadata without computing."""
    if not isinstance(problem, NumericalProblem):
        raise TypeError("problem must be a NumericalProblem")
    if problem.domain != "linear_algebra" or problem.operation not in _OPERATIONS:
        raise NotImplementedError(
            "linear-algebra planning is not implemented for " + problem.operation
        )
    shape = _problem_shape(problem)
    if not _structurally_supported(problem.operation, shape):
        raise ValueError(
            problem.operation + " does not support the recorded coefficient shape"
        )
    if problem.to_dict().get("numeric_type") != "binary64":
        raise ValueError("linear-algebra planning currently requires binary64")
    if shape is None:
        raise ValueError("linear-algebra planning requires a two-dimensional shape")
    requested = _requested_method(problem, method)
    if requested == "auto":
        selected, reason = _automatic_method(problem, shape)
    else:
        selected = requested
        reason = "the caller explicitly requested " + selected
    methods = _methods(problem.operation)
    if selected not in methods:
        raise ValueError("unsupported " + problem.operation + " method: " + selected)
    if not _method_shape_supported(problem.operation, selected, shape):
        raise ValueError(
            selected + " does not support the recorded least-squares shape"
        )
    rejected = [
        {"method": name, "reason": "not selected by the resolved policy"}
        for name in sorted(methods)
        if name != selected
    ]
    rows, columns = shape
    capability = materialize_object(
        methods[selected], "$.linear_algebra.plan.capability"
    )
    return NumericalPlan(
        problem,
        method=selected,
        backend="ordinary-python",
        reason=reason,
        capability=capability,
        fallback={
            "backend": "ordinary-python",
            "semantics": "same-source",
        },
        expected_resources={
            "shape": [rows, columns],
            "complexity": capability.get("complexity"),
            "max_iterations": problem.resource_budget.max_iterations,
            "max_elapsed_ms": problem.resource_budget.max_elapsed_ms,
            "max_trace_events": problem.resource_budget.max_trace_events,
            "max_trace_bytes": problem.resource_budget.max_trace_bytes,
        },
        rejected_alternatives=rejected,
    )


__all__ = [
    "CAPABILITY_SCHEMA_VERSION",
    "capabilities",
    "plan",
    "supports",
]
