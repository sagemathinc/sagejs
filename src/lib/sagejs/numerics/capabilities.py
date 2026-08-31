"""Machine-readable numerical capability registry and planning helpers."""

from __future__ import annotations

from ._json import JSONValue
from .diagnostics import NumericalDiagnostic
from .model import NumericalPlan, NumericalProblem

CAPABILITY_SCHEMA_VERSION = 1

_ROOT_METHODS: dict[str, dict[str, JSONValue]] = {
    "bisection": {
        "classification": "extension",
        "backend": "ordinary-python",
        "requires": ["finite_sign_change_bracket"],
        "numeric_types": ["binary64"],
        "trace_levels": ["none", "summary", "iterations", "evaluations"],
        "validation": ["residual", "bracket_invariant"],
        "platforms": [
            "browser",
            "node",
            "sea",
            "linux-x64",
            "linux-arm64",
            "macos-arm64",
            "windows-x64",
        ],
    },
    "brent": {
        "classification": "translated",
        "backend": "ordinary-python",
        "requires": ["finite_sign_change_bracket"],
        "numeric_types": ["binary64"],
        "trace_levels": ["none", "summary", "iterations", "evaluations"],
        "validation": ["residual", "bracket_invariant"],
        "platforms": [
            "browser",
            "node",
            "sea",
            "linux-x64",
            "linux-arm64",
            "macos-arm64",
            "windows-x64",
        ],
    },
    "secant": {
        "classification": "extension",
        "backend": "ordinary-python",
        "requires": ["two_initial_points"],
        "numeric_types": ["binary64"],
        "trace_levels": ["none", "summary", "iterations", "evaluations"],
        "validation": ["residual"],
        "platforms": [
            "browser",
            "node",
            "sea",
            "linux-x64",
            "linux-arm64",
            "macos-arm64",
            "windows-x64",
        ],
    },
    "newton": {
        "classification": "extension",
        "backend": "ordinary-python",
        "requires": ["initial_point"],
        "numeric_types": ["binary64"],
        "derivatives": ["analytic", "central_finite_difference"],
        "trace_levels": ["none", "summary", "iterations", "evaluations"],
        "validation": ["residual"],
        "platforms": [
            "browser",
            "node",
            "sea",
            "linux-x64",
            "linux-arm64",
            "macos-arm64",
            "windows-x64",
        ],
    },
}


def capabilities(domain: str | None = None) -> dict[str, JSONValue]:
    """Return the detached, versioned numerical capability registry."""
    operations: dict[str, JSONValue] = {
        "scalar_root": {
            "classification": "translated",
            "methods": {
                name: dict(_ROOT_METHODS[name]) for name in sorted(_ROOT_METHODS)
            },
            "frontends": {
                "python": "sagejs.numerics.find_root",
                "sage": "find_root / Expression.find_root",
                "matlab": "fzero",
                "wolfram": "FindRoot",
            },
        }
    }
    if domain is not None and domain not in ("roots", "scalar_root"):
        operations = {}
    return {
        "schema_version": CAPABILITY_SCHEMA_VERSION,
        "operations": operations,
    }


def describe(operation: str) -> dict[str, JSONValue]:
    records = capabilities()["operations"]
    if not isinstance(records, dict) or operation not in records:
        raise ValueError("unknown numerical operation: " + operation)
    value = records[operation]
    if not isinstance(value, dict):
        raise TypeError("invalid capability record")
    return dict(value)


def supports(problem: NumericalProblem, method: str | None = None) -> bool:
    if problem.operation != "scalar_root":
        return False
    selected = problem.method if method is None else method
    if selected == "auto":
        return True
    return selected in _ROOT_METHODS


def plan(problem: NumericalProblem, method: str | None = None) -> NumericalPlan:
    """Resolve a scalar-root problem without evaluating its callback."""
    if problem.operation != "scalar_root":
        raise NotImplementedError(
            "planning is not implemented for " + problem.operation
        )
    requested = problem.method if method is None else str(method)
    bracket = problem.bounds.get("bracket")
    initial = problem.initial_data.get("points")
    diagnostics: list[NumericalDiagnostic] = []
    rejected: list[dict[str, JSONValue]] = []
    if requested == "auto":
        if isinstance(bracket, list) and len(bracket) == 2:
            selected = "brent"
            reason = (
                "a finite sign-change bracket permits the robust Brent-Dekker method"
            )
        elif (
            problem.derivative is not None
            and isinstance(initial, list)
            and len(initial) >= 1
        ):
            selected = "newton"
            reason = "an initial point and explicit derivative permit Newton iteration"
        elif isinstance(initial, list) and len(initial) >= 2:
            selected = "secant"
            reason = "two initial points permit derivative-free secant iteration"
        elif isinstance(initial, list) and len(initial) == 1:
            selected = "newton"
            reason = "one initial point selects Newton with a central finite-difference derivative"
            diagnostics.append(NumericalDiagnostic("finite_difference_derivative"))
        else:
            raise ValueError(
                "automatic root planning requires a bracket or initial point"
            )
    else:
        selected = requested
        reason = "the caller explicitly requested " + selected
    if selected not in _ROOT_METHODS:
        raise ValueError("unsupported scalar root method: " + selected)
    if selected in ("bisection", "brent") and not (
        isinstance(bracket, list) and len(bracket) == 2
    ):
        raise ValueError(selected + " requires a two-endpoint bracket")
    if selected in ("newton", "secant") and not (
        isinstance(initial, list) and len(initial) >= 1
    ):
        raise ValueError(selected + " requires initial data")
    for name in sorted(_ROOT_METHODS):
        if name != selected:
            rejected.append(
                {"method": name, "reason": "not selected by the resolved policy"}
            )
    return NumericalPlan(
        problem,
        method=selected,
        backend="ordinary-python",
        reason=reason,
        capability=_ROOT_METHODS[selected],
        fallback={"method": "bisection" if isinstance(bracket, list) else "none"},
        expected_resources={
            "max_iterations": problem.resource_budget.max_iterations,
            "max_evaluations": problem.resource_budget.max_evaluations,
            "max_elapsed_ms": problem.resource_budget.max_elapsed_ms,
        },
        rejected_alternatives=rejected,
        diagnostics=diagnostics,
    )
