"""Package-local approximation discovery, support, and planning dispatch."""

from __future__ import annotations

from typing import Any

from .._json import JSONValue, materialize_json
from ..model import NumericalPlan, NumericalProblem
from ._common import QUALIFIED_PLATFORM_SUPPORT
from .chebyshev import MAX_CHEBYSHEV_DEGREE, plan_polynomial_approximation
from .finite_difference import MAX_STENCIL_SIZE, plan_finite_difference
from .interpolation import (
    MAX_VALIDATED_BARYCENTRIC_NODES,
    plan_interpolation,
)
from .polynomial_roots import (
    MAX_POLYNOMIAL_ROOT_DEGREE,
    plan_polynomial_roots,
)
from .splines import plan_spline

CAPABILITY_SCHEMA_VERSION = 1

_IMPLEMENTATION_PLATFORMS = [
    "linux-x64",
    "linux-arm64",
    "macos-arm64",
    "windows-x64",
]
_IMPLEMENTATION_RUNTIMES = ["browser", "cpython", "node", "sea"]


def _implementation_targets() -> dict[str, list[str]]:
    return {
        "platforms": list(_IMPLEMENTATION_PLATFORMS),
        "runtimes": list(_IMPLEMENTATION_RUNTIMES),
    }


_OPERATION_RECORDS: dict[str, dict[str, Any]] = {
    "polynomial_interpolation": {
        "classification": "extension",
        "methods": ["barycentric"],
        "planner": "plan_interpolation",
        "requires": ["distinct_finite_sample_nodes", "finite_sample_values"],
        "validation": ["node_reproduction", "off_node_newton_form_crosscheck"],
        "maximum_validated_nodes": MAX_VALIDATED_BARYCENTRIC_NODES,
        "numeric_types": ["binary64"],
        "platform_support": QUALIFIED_PLATFORM_SUPPORT,
        "implementation_targets": _implementation_targets(),
    },
    "piecewise_interpolation": {
        "classification": "extension",
        "methods": ["linear"],
        "planner": "plan_interpolation",
        "requires": ["distinct_finite_sample_nodes", "finite_sample_values"],
        "validation": ["node_reproduction", "direct_segment_crosscheck"],
        "numeric_types": ["binary64"],
        "platform_support": QUALIFIED_PLATFORM_SUPPORT,
        "implementation_targets": _implementation_targets(),
    },
    "cubic_spline": {
        "classification": "translated",
        "methods": ["not-a-knot", "explicit", "periodic"],
        "boundary_families": [
            "not-a-knot",
            "natural",
            "clamped",
            "periodic",
            "mixed-explicit",
        ],
        "planner": "plan_spline",
        "requires": ["strictly_increasing_finite_nodes", "finite_sample_values"],
        "validation": [
            "node_reproduction",
            "C1_continuity",
            "C2_continuity",
            "boundary_equations",
        ],
        "numeric_types": ["binary64"],
        "platform_support": QUALIFIED_PLATFORM_SUPPORT,
        "implementation_targets": _implementation_targets(),
    },
    "finite_difference_derivative": {
        "classification": "extension",
        "methods": [
            "fornberg-central",
            "fornberg-forward",
            "fornberg-backward",
        ],
        "planner": "plan_finite_difference",
        "requires": ["real_scalar_callback", "finite_evaluation_point"],
        "validation": [
            "defining_polynomial_moments",
            "step_halving",
            "optional_analytic_reference",
        ],
        "maximum_stencil_size": MAX_STENCIL_SIZE,
        "numeric_types": ["binary64"],
        "platform_support": QUALIFIED_PLATFORM_SUPPORT,
        "implementation_targets": _implementation_targets(),
    },
    "polynomial_approximation": {
        "classification": "extension",
        "methods": ["chebyshev"],
        "planner": "plan_polynomial_approximation",
        "requires": ["real_scalar_callback", "finite_interval"],
        "validation": [
            "independent_holdout_samples",
            "coefficient_tail_indicator",
        ],
        "maximum_degree": MAX_CHEBYSHEV_DEGREE,
        "numeric_types": ["binary64"],
        "platform_support": QUALIFIED_PLATFORM_SUPPORT,
        "implementation_targets": _implementation_targets(),
    },
    "polynomial_roots": {
        "classification": "extension",
        "methods": ["aberth-ehrlich", "laguerre-deflation"],
        "planner": "plan_polynomial_roots",
        "requires": ["finite_real_or_complex_power_basis_coefficients"],
        "validation": [
            "coefficientwise_backward_error",
            "independent_vieta_reconstruction",
            "conjugate_symmetry_for_real_input",
        ],
        "maximum_degree": MAX_POLYNOMIAL_ROOT_DEGREE,
        "multiplicity_policy": "numerical_clusters_only_never_certified",
        "numeric_types": ["real-binary64", "complex-binary64"],
        "platform_support": QUALIFIED_PLATFORM_SUPPORT,
        "implementation_targets": _implementation_targets(),
    },
}


def capabilities(operation: str | None = None) -> dict[str, JSONValue]:
    """Return detached capability records for every approximation operation."""
    if operation is not None and not isinstance(operation, str):
        raise TypeError("approximation operation filter must be a string or None")
    names = (
        sorted(_OPERATION_RECORDS)
        if operation is None
        else ([operation] if operation in _OPERATION_RECORDS else [])
    )
    document = {
        "schema_version": CAPABILITY_SCHEMA_VERSION,
        "domain": "approximation",
        "operations": {name: _OPERATION_RECORDS[name] for name in names},
    }
    detached = materialize_json(document)
    if not isinstance(detached, dict):
        raise TypeError("approximation capability registry must be an object")
    return detached


def _copy_with_method(problem: NumericalProblem, method: str) -> NumericalProblem:
    record = problem.to_dict()
    function_record = record.get("function")
    variables = record.get("variables")
    derivative_record = record.get("derivative")
    metadata = record.get("metadata")
    if not isinstance(function_record, dict):
        raise TypeError("problem function record must be an object")
    if not isinstance(variables, list):
        raise TypeError("problem variables must be a sequence")
    if not isinstance(derivative_record, dict):
        raise TypeError("problem derivative record must be an object")
    if not isinstance(metadata, dict):
        raise TypeError("problem metadata must be an object")
    return NumericalProblem(
        problem.domain,
        problem.operation,
        function=problem.function,
        derivative=problem.derivative,
        function_record=function_record,
        numeric_type=str(record.get("numeric_type", "binary64")),
        variables=variables,
        initial_data=problem.initial_data,
        bounds=problem.bounds,
        tolerances=problem.tolerances,
        method=method,
        derivative_record=derivative_record,
        resource_budget=problem.resource_budget,
        trace_policy=problem.trace_policy,
        source_intent=problem.source_intent,
        metadata=metadata,
    )


def _requested_method(problem: NumericalProblem, method: str | None) -> str:
    return problem.method if method is None else str(method)


def plan(problem: NumericalProblem, method: str | None = None) -> NumericalPlan:
    """Dispatch to an operation planner without evaluating live callbacks."""
    if not isinstance(problem, NumericalProblem):
        raise TypeError("approximation planning requires a NumericalProblem")
    if problem.domain != "approximation" or problem.operation not in _OPERATION_RECORDS:
        raise NotImplementedError(
            "approximation planning is not implemented for " + problem.operation
        )
    requested = _requested_method(problem, method)
    if problem.operation == "polynomial_interpolation":
        if requested not in ("auto", "barycentric"):
            raise ValueError("polynomial interpolation supports barycentric planning")
        candidate = (
            problem
            if requested == problem.method
            else _copy_with_method(problem, requested)
        )
        return plan_interpolation(candidate)
    if problem.operation == "piecewise_interpolation":
        if requested not in ("auto", "linear"):
            raise ValueError("piecewise interpolation supports linear planning")
        candidate = (
            problem
            if requested == problem.method
            else _copy_with_method(problem, "linear")
        )
        return plan_interpolation(candidate)
    if problem.operation == "cubic_spline":
        resolved = plan_spline(problem)
        if requested not in ("auto", resolved.method):
            raise ValueError(
                "spline method override conflicts with its boundary construction data"
            )
        return resolved
    if problem.operation == "finite_difference_derivative":
        resolved = plan_finite_difference(problem)
        if requested not in ("auto", resolved.method):
            raise ValueError(
                "finite-difference method override conflicts with its stored stencil"
            )
        return resolved
    if problem.operation == "polynomial_roots":
        if requested not in ("auto", "aberth-ehrlich", "laguerre-deflation"):
            raise ValueError(
                "polynomial roots support Aberth--Ehrlich or Laguerre--deflation planning"
            )
        candidate = (
            problem
            if requested in ("auto", problem.method)
            else _copy_with_method(problem, requested)
        )
        return plan_polynomial_roots(candidate)
    resolved = plan_polynomial_approximation(problem)
    if requested not in ("auto", "chebyshev", resolved.method):
        raise ValueError("polynomial approximation supports Chebyshev planning")
    return resolved


def supports(problem: NumericalProblem, method: str | None = None) -> bool:
    """Return whether package-local planning accepts `problem` and `method`."""
    if not isinstance(problem, NumericalProblem):
        return False
    try:
        plan(problem, method)
    except (ArithmeticError, KeyError, NotImplementedError, TypeError, ValueError):
        return False
    return True
