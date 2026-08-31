"""Side-effect-free package-local planning for spectral operations."""

from __future__ import annotations

from typing import Any

from ..model import NumericalPlan, NumericalProblem

_METHODS: dict[str, tuple[str, ...]] = {
    "symmetric_eigen": ("cyclic_jacobi",),
    "general_eigen": ("complex_shifted_qr",),
    "singular_value_decomposition": ("one_sided_jacobi",),
    "fourier_transform": ("radix2_cooley_tukey", "bluestein_radix2"),
    "inverse_fourier_transform": ("radix2_cooley_tukey", "bluestein_radix2"),
    "convolution": ("direct", "fft"),
    "sparse_linear_solve": ("cg", "bicgstab"),
    "sparse_dominant_eigen": ("power_iteration",),
}


def _problem_record(problem: NumericalProblem) -> dict[str, Any]:
    record = problem.to_dict()
    return dict(record)


def _metadata(problem: NumericalProblem) -> dict[str, Any]:
    value = _problem_record(problem).get("metadata")
    return dict(value) if isinstance(value, dict) else {}


def _sequence_length(problem: NumericalProblem, name: str) -> int | None:
    metadata_value = _metadata(problem).get(name + "_length")
    if isinstance(metadata_value, int) and not isinstance(metadata_value, bool):
        return metadata_value
    initial = problem.initial_data.get(name)
    if isinstance(initial, list):
        return len(initial)
    return None


def _transform_length(problem: NumericalProblem) -> int | None:
    metadata_value = _metadata(problem).get("length")
    if isinstance(metadata_value, int) and not isinstance(metadata_value, bool):
        return metadata_value
    samples = problem.initial_data.get("samples")
    if isinstance(samples, list):
        return len(samples)
    return None


def _automatic_method(problem: NumericalProblem) -> tuple[str, str]:
    operation = problem.operation
    methods = _METHODS.get(operation)
    if methods is None:
        raise NotImplementedError("planning is not implemented for " + operation)
    if len(methods) == 1:
        return methods[0], "the operation has one validated ordinary-Python method"
    if operation in ("fourier_transform", "inverse_fourier_transform"):
        length = _transform_length(problem)
        if length is None or length <= 0:
            raise ValueError("automatic FFT planning requires a positive sample length")
        if length & (length - 1) == 0:
            return (
                "radix2_cooley_tukey",
                "a power-of-two sample length selects radix-2 Cooley-Tukey",
            )
        return (
            "bluestein_radix2",
            "an arbitrary positive sample length selects Bluestein reduction",
        )
    if operation == "convolution":
        left = _sequence_length(problem, "left")
        right = _sequence_length(problem, "right")
        if left is None or right is None or left <= 0 or right <= 0:
            raise ValueError(
                "automatic convolution planning requires two positive sequence lengths"
            )
        if left * right <= 4_096:
            return "direct", "the direct product count is at most 4096"
        return "fft", "the direct product count exceeds the FFT crossover"
    if operation == "sparse_linear_solve":
        if _metadata(problem).get("spd_certified") is True:
            return (
                "cg",
                "detached metadata records an independent sufficient SPD certificate",
            )
        return (
            "bicgstab",
            "without an independent SPD certificate the planner fails closed away from CG",
        )
    raise NotImplementedError("automatic planning is not implemented for " + operation)


def _envelope_error(problem: NumericalProblem, selected: str) -> str | None:
    record = _problem_record(problem)
    if problem.domain != "spectral":
        return "spectral planning requires problem.domain == 'spectral'"
    if record.get("numeric_type") not in ("binary64", "complex_binary64"):
        return "spectral methods require binary64 or complex_binary64 input"
    if selected not in _METHODS.get(problem.operation, ()):
        return "unsupported " + problem.operation + " method: " + selected
    if problem.operation in ("fourier_transform", "inverse_fourier_transform"):
        length = _transform_length(problem)
        if length is None or length <= 0:
            return "FFT planning requires a positive sample length"
        is_power_of_two = length & (length - 1) == 0
        if selected == "radix2_cooley_tukey" and not is_power_of_two:
            return "radix2_cooley_tukey requires a power-of-two sample length"
    if problem.operation == "convolution":
        left = _sequence_length(problem, "left")
        right = _sequence_length(problem, "right")
        if left is None or right is None or left <= 0 or right <= 0:
            return "convolution planning requires two positive sequence lengths"
    if (
        problem.operation == "sparse_linear_solve"
        and selected == "cg"
        and _metadata(problem).get("spd_certified") is not True
    ):
        return "CG requires an independently recorded sufficient SPD certificate"
    if (
        problem.operation == "sparse_dominant_eigen"
        and _metadata(problem).get("dominant_magnitude_certified") is not True
    ):
        return (
            "power iteration requires an independently recorded unique-dominant-"
            "magnitude certificate"
        )
    return None


def supports(problem: NumericalProblem, method: str | None = None) -> bool:
    """Return whether package-local planning can resolve `problem` safely."""
    if not isinstance(problem, NumericalProblem):
        return False
    if problem.domain != "spectral" or problem.operation not in _METHODS:
        return False
    requested = problem.method if method is None else str(method)
    try:
        if requested.lower() in ("auto", "auto_fft"):
            selected, _ = _automatic_method(problem)
        else:
            selected = requested.lower()
        return _envelope_error(problem, selected) is None
    except (NotImplementedError, TypeError, ValueError):
        return False


def _detached_capability(operation: str, selected: str) -> dict[str, Any]:
    # The lazy import avoids an initialization cycle while keeping the public
    # capability record the single package-local source of descriptive facts.
    from . import capabilities

    registry = capabilities(operation)
    operations = registry.get("operations")
    if not isinstance(operations, dict):
        raise TypeError("invalid detached spectral capability registry")
    value = operations.get(operation)
    if not isinstance(value, dict):
        raise TypeError("invalid detached spectral operation capability")
    record = dict(value)
    methods = record.get("methods")
    record["methods"] = list(methods) if isinstance(methods, list) else []
    validation = record.get("validation")
    record["validation"] = list(validation) if isinstance(validation, list) else []
    record.update(
        {
            "selected_method": selected,
            "backend": "ordinary-python",
            "numeric_types": ["binary64", "complex_binary64"],
            "trace_levels": ["none", "summary", "iterations", "evaluations"],
        }
    )
    return record


def plan(problem: NumericalProblem, method: str | None = None) -> NumericalPlan:
    """Resolve a spectral method without computation or callback evaluation."""
    if not isinstance(problem, NumericalProblem):
        raise TypeError("spectral plan requires a NumericalProblem")
    methods = _METHODS.get(problem.operation)
    if problem.domain != "spectral" or methods is None:
        raise NotImplementedError(
            "planning is not implemented for " + problem.operation
        )
    requested = problem.method if method is None else str(method)
    if requested.lower() in ("auto", "auto_fft"):
        selected, reason = _automatic_method(problem)
    else:
        selected = requested.lower()
        reason = "the caller explicitly requested " + selected
    envelope_error = _envelope_error(problem, selected)
    if envelope_error is not None:
        raise ValueError(envelope_error)
    rejected = [
        {"method": name, "reason": "not selected by the resolved policy"}
        for name in methods
        if name != selected
    ]
    return NumericalPlan(
        problem,
        method=selected,
        backend="ordinary-python",
        reason=reason,
        capability=_detached_capability(problem.operation, selected),
        fallback={
            "kind": "same-source",
            "backend": "ordinary-python",
            "method": selected,
        },
        expected_resources={
            "max_iterations": problem.resource_budget.max_iterations,
            "max_evaluations": problem.resource_budget.max_evaluations,
            "max_elapsed_ms": problem.resource_budget.max_elapsed_ms,
        },
        rejected_alternatives=rejected,
    )


__all__ = ["plan", "supports"]
