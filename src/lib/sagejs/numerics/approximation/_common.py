"""Shared execution and result helpers for numerical approximation."""

from __future__ import annotations

import math
import time
from collections.abc import Callable, Mapping, Sequence
from typing import TYPE_CHECKING, Any

from .._json import materialize_json
from ..diagnostics import NumericalDiagnostic
from ..model import (
    STATUS_CODES,
    NumericalPlan,
    NumericalProblem,
    NumericalResult,
    NumericalValidation,
    ResourceBudget,
)
from ..trace import NumericalTrace, TracePolicy

if TYPE_CHECKING:
    from sagejs.plotting import PlotAnimation, PlotSpec

MACHINE_EPSILON = 2.220446049250313e-16

QUALIFIED_PLATFORM_SUPPORT = {
    "linux-x64": "local_cpython_and_sagejs_corpus_passed",
    "node": "local_sagejs_runtime_passed",
    "linux-arm64": "pending_persistent_host_receipt",
    "macos-arm64": "pending_persistent_host_receipt",
    "windows-x64": "pending_persistent_host_receipt",
    "browser": "pending_integration_and_browser_receipt",
    "sea": "pending_integration_and_sea_receipt",
}


class ApproximationStopped(Exception):
    """Internal, structured termination at a resource or cancellation boundary."""

    def __init__(self, status: str) -> None:
        self.status = status


class ApproximationExecution:
    """Account for callbacks, time, cancellation, and semantic events."""

    def __init__(
        self,
        problem: NumericalProblem,
        trace: NumericalTrace,
        cancel: Callable[[], bool] | None,
    ) -> None:
        self.problem = problem
        self.trace = trace
        self.cancel = cancel
        self.evaluations = 0
        self.iterations = 0
        self.started = time.perf_counter()

    def elapsed_ms(self) -> float:
        return 1000.0 * (time.perf_counter() - self.started)

    def check(self) -> None:
        if self.cancel is not None and self.cancel():
            raise ApproximationStopped("cancelled")
        if self.elapsed_ms() >= self.problem.resource_budget.max_elapsed_ms:
            raise ApproximationStopped("maximum_elapsed_time")

    def step(self) -> None:
        self.check()
        if self.iterations >= self.problem.resource_budget.max_iterations:
            raise ApproximationStopped("maximum_iterations")
        self.iterations += 1

    def evaluate(
        self,
        x: float,
        *,
        iteration: int | None = None,
        trace_data: Mapping[str, Any] | None = None,
    ) -> float:
        self.check()
        if not math.isfinite(x):
            raise ApproximationStopped("invalid_problem")
        if self.evaluations >= self.problem.resource_budget.max_evaluations:
            raise ApproximationStopped("maximum_evaluations")
        function = self.problem.function
        if function is None:
            raise TypeError("approximation problem has no live function")
        self.evaluations += 1
        try:
            value = float(function(x))
        except Exception as error:
            self.trace.append(
                "failure",
                iteration=iteration,
                evaluation=self.evaluations,
                data={"x": x, "error_type": type(error).__name__},
                diagnostics=[NumericalDiagnostic("callback_error")],
                important=True,
                force=True,
            )
            raise ApproximationStopped("callback_error") from None
        self.check()
        if not math.isfinite(value):
            self.trace.append(
                "failure",
                iteration=iteration,
                evaluation=self.evaluations,
                data={"x": x},
                diagnostics=[NumericalDiagnostic("nonfinite_evaluation")],
                important=True,
                force=True,
            )
            raise ApproximationStopped("nonfinite_evaluation")
        data: dict[str, Any] = {"x": x, "value": value}
        if trace_data is not None:
            data.update(trace_data)
        self.trace.append(
            "evaluation",
            iteration=iteration,
            evaluation=self.evaluations,
            data=data,
        )
        return value

    def evaluate_derivative_reference(self, x: float) -> float:
        """Evaluate an optional analytic derivative under the same hard budget."""
        self.check()
        if not math.isfinite(x):
            raise ApproximationStopped("invalid_problem")
        if self.evaluations >= self.problem.resource_budget.max_evaluations:
            raise ApproximationStopped("maximum_evaluations")
        derivative = self.problem.derivative
        if derivative is None:
            raise TypeError("approximation problem has no derivative reference")
        self.evaluations += 1
        try:
            value = float(derivative(x))
        except Exception as error:
            self.trace.append(
                "failure",
                evaluation=self.evaluations,
                data={"x": x, "error_type": type(error).__name__, "role": "derivative"},
                diagnostics=[NumericalDiagnostic("callback_error")],
                important=True,
                force=True,
            )
            raise ApproximationStopped("callback_error") from None
        self.check()
        if not math.isfinite(value):
            self.trace.append(
                "failure",
                evaluation=self.evaluations,
                data={"x": x, "role": "derivative"},
                diagnostics=[NumericalDiagnostic("nonfinite_evaluation")],
                important=True,
                force=True,
            )
            raise ApproximationStopped("nonfinite_evaluation")
        return value


def interval_geometry(lower: float, upper: float) -> tuple[float, float]:
    """Return an overflow-safe midpoint and positive half-width."""
    if not math.isfinite(lower) or not math.isfinite(upper) or lower >= upper:
        raise ValueError("interval must contain finite lower < upper endpoints")
    if lower < 0.0 < upper:
        midpoint = 0.5 * lower + 0.5 * upper
        radius = -0.5 * lower + 0.5 * upper
    else:
        width = upper - lower
        radius = 0.5 * width
        midpoint = lower + radius
    if not math.isfinite(midpoint) or not math.isfinite(radius) or radius <= 0.0:
        raise ValueError("interval cannot be represented safely in binary64")
    return midpoint, radius


def interval_coordinate(point: float, midpoint: float, radius: float) -> float:
    """Map a finite point to an affine interval coordinate without overflow."""
    coordinate = (point - midpoint) / radius
    if not math.isfinite(coordinate):
        raise ArithmeticError("query is outside the representable affine interval")
    return coordinate


def finite_floats(values: Sequence[Any], name: str) -> list[float]:
    """Validate and detach a finite binary64 sequence."""
    answer: list[float] = []
    for index in range(len(values)):
        value = float(values[index])
        if not math.isfinite(value):
            raise ValueError(name + "[" + str(index) + "] must be finite")
        answer.append(value)
    return answer


def validate_nodes_values(
    nodes: Sequence[Any], values: Sequence[Any], *, minimum: int = 2
) -> tuple[list[float], list[float]]:
    """Return increasing nodes and correspondingly ordered finite values."""
    x = finite_floats(nodes, "nodes")
    y = finite_floats(values, "values")
    if len(x) != len(y):
        raise ValueError("nodes and values must have the same length")
    if len(x) < minimum:
        raise ValueError("at least " + str(minimum) + " nodes are required")
    pairs = sorted(zip(x, y, strict=True), key=lambda pair: pair[0])
    sorted_x = [pair[0] for pair in pairs]
    sorted_y = [pair[1] for pair in pairs]
    for index in range(1, len(sorted_x)):
        if sorted_x[index] <= sorted_x[index - 1]:
            raise ValueError("interpolation nodes must be distinct")
    return sorted_x, sorted_y


def default_budget(
    *,
    work_items: int,
    evaluations: int = 1,
    max_trace_events: int = 256,
    max_trace_bytes: int = 1_000_000,
) -> ResourceBudget:
    """Create a practical default while retaining explicit hard limits."""
    return ResourceBudget(
        max_iterations=max(100, work_items + 8),
        max_evaluations=max(256, evaluations + 8),
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
    )


def trace_policy(budget: ResourceBudget, level: str | TracePolicy) -> TracePolicy:
    if isinstance(level, TracePolicy):
        return level
    return TracePolicy(
        level,
        max_events=budget.max_trace_events,
        max_bytes=budget.max_trace_bytes,
    )


def data_problem(
    operation: str,
    nodes: Sequence[float],
    values: Sequence[float],
    *,
    method: str,
    budget: ResourceBudget,
    trace: str | TracePolicy,
    metadata: Mapping[str, Any] | None = None,
    extra_initial_data: Mapping[str, Any] | None = None,
) -> NumericalProblem:
    initial_data: dict[str, Any] = {"nodes": list(nodes), "values": list(values)}
    if extra_initial_data is not None:
        initial_data.update(extra_initial_data)
    return NumericalProblem(
        "approximation",
        operation,
        function_record={
            "kind": "sampled_data",
            "replayable": True,
            "sample_count": len(nodes),
        },
        variables=[{"name": "x", "shape": []}],
        initial_data=initial_data,
        bounds={"interval": [nodes[0], nodes[-1]]},
        tolerances={},
        method=method,
        resource_budget=budget,
        trace_policy=trace_policy(budget, trace),
        source_intent={"language": "python", "source": {}},
        metadata=metadata,
    )


def callback_problem(
    operation: str,
    function: Callable[[float], Any],
    *,
    interval: Sequence[float],
    initial_data: Mapping[str, Any],
    tolerances: Mapping[str, Any],
    method: str,
    budget: ResourceBudget,
    trace: str | TracePolicy,
    expression: str | None,
    derivative: Callable[[float], Any] | None = None,
    derivative_record: Mapping[str, Any] | None = None,
) -> NumericalProblem:
    if not callable(function):
        raise TypeError("approximation function must be callable")
    endpoints = finite_floats(interval, "interval")
    if len(endpoints) != 2 or endpoints[0] >= endpoints[1]:
        raise ValueError("interval must contain finite lower < upper endpoints")
    function_record: dict[str, Any] = {
        "kind": "expression" if expression is not None else "opaque_callback",
        "replayable": expression is not None,
    }
    if expression is not None:
        function_record["expression"] = expression
        function_record["variable"] = "x"
    return NumericalProblem(
        "approximation",
        operation,
        function=function,
        derivative=derivative,
        function_record=function_record,
        variables=[{"name": "x", "shape": []}],
        initial_data=initial_data,
        bounds={"interval": endpoints},
        tolerances=tolerances,
        method=method,
        derivative_record=derivative_record,
        resource_budget=budget,
        trace_policy=trace_policy(budget, trace),
        source_intent={"language": "python", "source": {}},
    )


def approximation_plan(
    problem: NumericalProblem,
    *,
    method: str,
    reason: str,
    capability: Mapping[str, Any],
    expected_resources: Mapping[str, Any],
    rejected: Sequence[Any] = (),
    diagnostics: Sequence[NumericalDiagnostic] = (),
) -> NumericalPlan:
    return NumericalPlan(
        problem,
        method=method,
        backend="ordinary-python",
        reason=reason,
        capability=capability,
        fallback={"kind": "same-source", "backend": "ordinary-python"},
        expected_resources=expected_resources,
        rejected_alternatives=rejected,
        diagnostics=diagnostics,
    )


def stopped_diagnostic(status: str) -> NumericalDiagnostic | None:
    if status in (
        "cancelled",
        "callback_error",
        "maximum_evaluations",
        "maximum_iterations",
        "nonfinite_evaluation",
        "stagnation",
        "validation_failed",
        "maximum_elapsed_time",
    ):
        try:
            return NumericalDiagnostic(status)
        except ValueError:
            # The shared integration lane owns new status/diagnostic registry
            # entries. Preserve the exact stop reason in the domain payload
            # until that registry entry is integrated.
            return None
    return None


class ApproximationResult(NumericalResult):
    """Structured approximation result with evaluation and plot-data views."""

    def __init__(
        self, *args: Any, model: Mapping[str, Any] | None = None, **kwargs: Any
    ) -> None:
        detached = materialize_json({} if model is None else model)
        if not isinstance(detached, dict):
            raise TypeError("approximation model must be a mapping")
        self._approximation_model = detached
        super().__init__(*args, value=self._approximation_model, **kwargs)

    @property
    def value(self) -> dict[str, Any]:
        """Return a detached copy so validation evidence cannot be mutated."""
        detached = materialize_json(self._approximation_model)
        if not isinstance(detached, dict):
            raise TypeError("invalid approximation model")
        return detached

    def to_dict(self) -> dict[str, Any]:
        """Return a detached result record, including detached model data."""
        record = super().to_dict()
        record["value"] = self.value
        return record

    def evaluate(self, x: float, derivative: int = 0) -> float:
        """Evaluate the detached approximant or derivative at `x`."""
        kind = str(self._approximation_model.get("kind", ""))
        if kind in ("barycentric_polynomial", "piecewise_linear"):
            from .interpolation import evaluate_interpolant

            return evaluate_interpolant(self._approximation_model, x, derivative)
        if kind == "cubic_spline":
            from .splines import evaluate_spline

            return evaluate_spline(self._approximation_model, x, derivative)
        if kind == "chebyshev_series":
            from .chebyshev import evaluate_chebyshev

            return evaluate_chebyshev(self._approximation_model, x, derivative)
        if kind == "finite_difference":
            if derivative != 0:
                raise ValueError("a derivative estimate is a scalar result")
            estimate = self._approximation_model.get("estimate")
            if not isinstance(estimate, (int, float)) or isinstance(estimate, bool):
                raise TypeError("invalid finite-difference estimate")
            return float(estimate)
        raise ValueError("result does not contain an evaluable approximation")

    def plot_data(self, samples: int = 201) -> dict[str, Any]:
        """Return renderer-neutral, PlotSpec-friendly semantic layer data."""
        if samples < 2:
            raise ValueError("plot samples must be at least 2")
        kind = str(self._approximation_model.get("kind", ""))
        if kind == "finite_difference":
            points = self._approximation_model.get("sample_points")
            values = self._approximation_model.get("sample_values")
            weights = self._approximation_model.get("weights")
            return {
                "schema": "sagejs.numerics.approximation.plot-data/v1",
                "description": "finite-difference stencil samples and weights",
                "layers": [
                    {
                        "kind": "point",
                        "role": "stencil",
                        "x": list(points) if isinstance(points, list) else [],
                        "y": list(values) if isinstance(values, list) else [],
                        "weights": list(weights) if isinstance(weights, list) else [],
                    }
                ],
            }
        interval = self.problem.bounds.get("interval")
        if not isinstance(interval, list) or len(interval) != 2:
            raise ValueError("approximation has no plotting interval")
        lower = float(interval[0])
        upper = float(interval[1])
        midpoint, radius = interval_geometry(lower, upper)
        x_values = [
            midpoint + radius * (-1.0 + 2.0 * index / (samples - 1))
            for index in range(samples)
        ]
        y_values = [self.evaluate(x) for x in x_values]
        nodes = self._approximation_model.get("nodes", [])
        values = self._approximation_model.get("values", [])
        return {
            "schema": "sagejs.numerics.approximation.plot-data/v1",
            "description": "approximation curve and construction samples",
            "layers": [
                {"kind": "line", "role": "approximation", "x": x_values, "y": y_values},
                {
                    "kind": "point",
                    "role": "samples",
                    "x": list(nodes) if isinstance(nodes, list) else [],
                    "y": list(values) if isinstance(values, list) else [],
                },
            ],
        }

    def explanation(self) -> dict[str, Any]:
        """Return a detached domain-owned explanation document."""
        from .presentation import approximation_explanation

        return approximation_explanation(self)

    def explain(self) -> str:
        """Return a concise rendering of the structured explanation."""
        from .presentation import format_approximation_explanation

        return format_approximation_explanation(self)

    def to_plot_spec(self, samples: int = 201) -> PlotSpec:
        """Return a bounded canonical PlotSpec for success or failure."""
        from .presentation import approximation_plot_spec

        return approximation_plot_spec(self, samples)

    def to_animation(
        self, *, samples: int = 129, max_frames: int = 32
    ) -> PlotAnimation:
        """Return a bounded canonical PlotAnimation of construction or failure."""
        from .presentation import approximation_animation

        return approximation_animation(self, samples=samples, max_frames=max_frames)


def make_result(
    problem: NumericalProblem,
    plan: NumericalPlan,
    execution: ApproximationExecution,
    *,
    model: Mapping[str, Any],
    success: bool,
    status: str,
    validation: NumericalValidation,
    diagnostics: Sequence[NumericalDiagnostic] = (),
    measurements: Mapping[str, Any] | None = None,
    domain_payload: Mapping[str, Any] | None = None,
) -> ApproximationResult:
    merged_diagnostics = list(diagnostics)
    if (
        problem.function is not None
        and not problem.replayable
        and not any(
            diagnostic.code == "non_replayable_callback"
            for diagnostic in merged_diagnostics
        )
    ):
        merged_diagnostics.append(NumericalDiagnostic("non_replayable_callback"))
    payload: dict[str, Any] = {"model_kind": model.get("kind", "none")}
    if domain_payload is not None:
        payload.update(domain_payload)
    return ApproximationResult(
        problem,
        plan,
        model=model,
        success=success,
        status=status,
        validation=validation,
        diagnostics=merged_diagnostics,
        iterations=execution.iterations,
        evaluations=execution.evaluations,
        elapsed_ms=execution.elapsed_ms(),
        trace=execution.trace,
        measurements=measurements,
        provenance={
            "implementation": "ordinary CPython-parseable Python",
            "numeric_type": "IEEE-754 binary64",
            "source_family": "sagejs.numerics.approximation",
        },
        domain_payload=payload,
    )


def failed_result(
    problem: NumericalProblem,
    plan: NumericalPlan,
    execution: ApproximationExecution,
    status: str,
) -> ApproximationResult:
    public_status = status if status in STATUS_CODES else "backend_failure"
    diagnostic = stopped_diagnostic(status)
    diagnostics = [] if diagnostic is None else [diagnostic]
    execution.trace.append(
        "finish",
        data={"status": public_status, "stop_reason": status, "success": False},
        diagnostics=diagnostics,
        important=True,
        force=True,
    )
    return make_result(
        problem,
        plan,
        execution,
        model={"kind": "none"},
        success=False,
        status=public_status,
        validation=NumericalValidation(
            "indeterminate",
            False,
            checks=[{"kind": "execution_completed", "passed": False}],
        ),
        diagnostics=diagnostics,
        domain_payload={"stop_reason": status},
    )
