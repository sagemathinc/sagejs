"""Production-bounded adaptive Gauss-Kronrod quadrature.

The implementation follows the established QUADPACK strategy: an embedded
Gauss-Kronrod rule estimates each interval, the interval with the largest
local error is bisected, and the global sum is compared with an explicit
absolute/relative target.  It adds deterministic semantic traces, independent
Gauss-Legendre validation, cancellation, and hard evaluation, depth, interval,
elapsed-time, workspace-memory, and trace budgets.

This module intentionally supports real one-dimensional binary64 integrals.
It does not imply rigorous enclosures, automatic singularity discovery,
principal values, oscillatory weights, or multidimensional error control.
"""

from __future__ import annotations

import math
import time
from collections.abc import Callable, Mapping, Sequence
from typing import Any

from ..diagnostics import NumericalDiagnostic
from ..model import (
    NumericalPlan,
    NumericalProblem,
    NumericalValidation,
    ResourceBudget,
)
from ..trace import NumericalTrace, TracePolicy
from .result import IntegrationResult

_MACHINE_EPSILON = 2.220446049250313e-16
_MIN_NORMAL = 2.2250738585072014e-308
_POSITIVE_INFINITY = float("inf")
_NEGATIVE_INFINITY = float("-inf")
_INTERVAL_WORKSPACE_BYTES = 512
_COMPONENT_WORKSPACE_BYTES = 512

_GK21_ABSCISSAE = (
    0.9956571630258081,
    0.9739065285171717,
    0.9301574913557082,
    0.8650633666889845,
    0.7808177265864169,
    0.6794095682990244,
    0.5627571346686047,
    0.4333953941292472,
    0.2943928627014602,
    0.14887433898163122,
)
_GK21_WEIGHTS = (
    0.011694638867371874,
    0.03255816230796473,
    0.054755896574351996,
    0.07503967481091995,
    0.0931254545836976,
    0.10938715880229764,
    0.12349197626206585,
    0.13470921731147333,
    0.14277593857706008,
    0.14773910490133849,
)
_G10_WEIGHTS = (
    0.0,
    0.06667134430868814,
    0.0,
    0.1494513491505806,
    0.0,
    0.21908636251598204,
    0.0,
    0.26926671930999635,
    0.0,
    0.29552422471475287,
)
_GK21_CENTER_WEIGHT = 0.1494455540029169

_GK15_ABSCISSAE = (
    0.9914553711208126,
    0.9491079123427585,
    0.8648644233597691,
    0.7415311855993945,
    0.5860872354676911,
    0.4058451513773972,
    0.20778495500789848,
)
_GK15_WEIGHTS = (
    0.022935322010529224,
    0.06309209262997855,
    0.10479001032225019,
    0.14065325971552592,
    0.1690047266392679,
    0.19035057806478542,
    0.20443294007529889,
)
_G7_WEIGHTS = (
    0.0,
    0.1294849661688697,
    0.0,
    0.27970539148927664,
    0.0,
    0.3818300505051189,
    0.0,
)
_GK15_CENTER_WEIGHT = 0.20948214108472782
_G7_CENTER_WEIGHT = 0.4179591836734694

_GL8_ABSCISSAE = (
    0.9602898564975363,
    0.7966664774136267,
    0.525532409916329,
    0.1834346424956498,
)
_GL8_WEIGHTS = (
    0.10122853629037626,
    0.22238103445337448,
    0.31370664587788727,
    0.362683783378362,
)

INTEGRATION_CAPABILITY: dict[str, Any] = {
    "classification": "extension",
    "backend": "ordinary-python",
    "dimensions": [1],
    "numeric_types": ["binary64-real"],
    "methods": ["adaptive_gauss_kronrod"],
    "finite_rule": "embedded_gauss_10_kronrod_21",
    "infinite_rule": "embedded_gauss_7_kronrod_15",
    "independent_validation": "gauss_legendre_8_on_final_partition",
    "finite_intervals": True,
    "infinite_intervals": True,
    "known_breakpoints": True,
    "explicit_endpoint_transforms": ["left", "right", "both"],
    "endpoint_transform_limit": "physical_nodes_must_be_resolvable_in_binary64",
    "unsupported": [
        "complex_integrands",
        "multidimensional_integrals",
        "principal_values",
        "weighted_oscillatory_rules",
        "automatic_singularity_discovery",
        "rigorous_enclosures",
    ],
    "trace_levels": ["none", "summary", "iterations", "evaluations"],
    "hard_budgets": [
        "evaluations",
        "intervals",
        "depth",
        "elapsed_time",
        "workspace_memory",
        "trace_events",
        "trace_bytes",
        "cancellation",
    ],
    "qualification": {
        "level": "development",
        "evidence": ["cpython-linux-x64", "sagejs-dynamic-linux-x64"],
        "release_platforms": "unqualified_pending_receipts",
    },
}


class _StopIntegration(Exception):
    def __init__(self, reason: str, details: Mapping[str, Any] | None = None) -> None:
        super().__init__(reason)
        self.reason = reason
        self.details = {} if details is None else dict(details)


def _encoded_endpoint(value: float) -> float | str:
    if value == _POSITIVE_INFINITY:
        return "+infinity"
    if value == _NEGATIVE_INFINITY:
        return "-infinity"
    return value


def _decoded_endpoint(value: Any) -> float:
    if value == "+infinity":
        return _POSITIVE_INFINITY
    if value == "-infinity":
        return _NEGATIVE_INFINITY
    return float(value)


def _half_width(lower: float, upper: float) -> float:
    """Return half of a finite ordered interval width without overflow."""
    if lower < 0.0 < upper:
        return 0.5 * upper - 0.5 * lower
    return 0.5 * (upper - lower)


def _affine_point(lower: float, upper: float, fraction: float) -> float:
    """Map `[0, 1]` into an ordered finite interval without leaving it."""
    if fraction <= 0.0:
        return lower
    if fraction >= 1.0:
        return upper
    if lower < 0.0 < upper:
        point = math.fsum([(1.0 - fraction) * lower, fraction * upper])
    else:
        point = lower + (upper - lower) * fraction
    return min(upper, max(lower, point))


def _open_affine_point(lower: float, upper: float, fraction: float) -> float:
    """Map an interior reference node to a representable interior point."""
    point = _affine_point(lower, upper, fraction)
    if not (lower < point < upper):
        raise _StopIntegration(
            "interval_too_small",
            {
                "reason": "no_representable_interior_quadrature_node",
                "lower": lower,
                "upper": upper,
            },
        )
    return point


def _scaled_product_quotient(
    numerators: Sequence[float], denominators: Sequence[float] = ()
) -> float:
    """Combine deliberately ordered scale factors portably."""
    sign = 1.0
    magnitudes: list[float] = []
    for value in numerators:
        if not math.isfinite(value):
            return value
        if value == 0.0:
            return value
        if value < 0.0:
            sign = -sign
        magnitudes.append(abs(value))
    while len(magnitudes) > 1:
        magnitudes.sort()
        smallest = magnitudes.pop(0)
        largest = magnitudes.pop()
        magnitudes.append(smallest * largest)
    result = math.copysign(magnitudes[0] if magnitudes else 1.0, sign)
    for value in denominators:
        if not math.isfinite(value) or value == 0.0:
            return math.copysign(_POSITIVE_INFINITY, result)
        result /= value
    return result


def _positive_integer(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(name + " must be a positive integer")
    return value


def _nonnegative_integer(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(name + " must be a nonnegative integer")
    return value


def _endpoint_singularity_record(value: str | Sequence[str]) -> list[str]:
    if isinstance(value, str):
        if value == "none":
            values: list[str] = []
        elif value == "both":
            values = ["left", "right"]
        else:
            values = [value]
    else:
        values = [str(item) for item in value]
    answer: list[str] = []
    for item in values:
        if item not in ("left", "right"):
            raise ValueError(
                "endpoint_singularities must be none, left, right, both, or a sequence of left/right"
            )
        if item not in answer:
            answer.append(item)
    answer.sort()
    return answer


def integration_capabilities() -> dict[str, Any]:
    """Return the detached capability record for this claimed package."""
    answer: dict[str, Any] = {}
    for key in INTEGRATION_CAPABILITY:
        value = INTEGRATION_CAPABILITY[key]
        if isinstance(value, list):
            answer[key] = list(value)
        else:
            answer[key] = value
    return {"schema_version": 1, "operation": "definite_integral", "capability": answer}


def integration_problem(
    function: Callable[[float], Any],
    lower: float,
    upper: float,
    *,
    method: str = "auto",
    absolute_tolerance: float = 1e-10,
    relative_tolerance: float = 1e-10,
    breakpoints: Sequence[float] = (),
    endpoint_singularities: str | Sequence[str] = "none",
    max_intervals: int = 256,
    max_depth: int = 50,
    max_evaluations: int = 16_384,
    max_elapsed_ms: int = 30_000,
    max_memory_bytes: int = 1_000_000,
    trace: str = "iterations",
    max_trace_events: int = 256,
    max_trace_bytes: int = 1_000_000,
    expression: str | None = None,
    variable: str = "x",
    source_language: str = "python",
    source: Mapping[str, Any] | None = None,
) -> NumericalProblem:
    """Construct a serializable definite-integral problem around a callback."""
    if not callable(function):
        raise TypeError("integration function must be callable")
    left = float(lower)
    right = float(upper)
    if math.isnan(left) or math.isnan(right):
        raise ValueError("integration endpoints must not be NaN")
    if (left == right) and not math.isfinite(left):
        raise ValueError("equal infinite integration endpoints are undefined")
    absolute = float(absolute_tolerance)
    relative = float(relative_tolerance)
    if (
        not math.isfinite(absolute)
        or not math.isfinite(relative)
        or absolute < 0.0
        or relative < 0.0
        or (absolute == 0.0 and relative == 0.0)
    ):
        raise ValueError(
            "integration tolerances must be finite, nonnegative, and not both zero"
        )
    if absolute == 0.0 and relative < 50.0 * _MACHINE_EPSILON:
        raise ValueError(
            "relative_tolerance must be at least 50*eps when absolute_tolerance is zero"
        )
    interval_limit = _positive_integer(max_intervals, "max_intervals")
    depth_limit = _nonnegative_integer(max_depth, "max_depth")
    memory_limit = _positive_integer(max_memory_bytes, "max_memory_bytes")
    singularities = _endpoint_singularity_record(endpoint_singularities)
    ordered_lower = min(left, right)
    ordered_upper = max(left, right)
    point_values: list[float] = []
    for raw_point in breakpoints:
        point = float(raw_point)
        if not math.isfinite(point):
            raise ValueError("integration breakpoints must be finite")
        if not (ordered_lower < point < ordered_upper):
            raise ValueError(
                "integration breakpoints must lie strictly inside the interval"
            )
        if point not in point_values:
            point_values.append(point)
    point_values.sort()
    if point_values and (not math.isfinite(left) or not math.isfinite(right)):
        raise ValueError("breakpoints on infinite intervals are not yet supported")
    if singularities and (not math.isfinite(left) or not math.isfinite(right)):
        raise ValueError("endpoint_singularities applies only to finite endpoints")
    if method not in ("auto", "adaptive_gauss_kronrod"):
        raise ValueError("unsupported integration method: " + str(method))
    replayable = expression is not None
    function_record: dict[str, Any] = {
        "kind": "expression" if replayable else "opaque_callback",
        "replayable": replayable,
    }
    if expression is not None:
        function_record["expression"] = expression
        function_record["variable"] = variable
    budget = ResourceBudget(
        max_iterations=interval_limit,
        max_evaluations=_positive_integer(max_evaluations, "max_evaluations"),
        max_elapsed_ms=_positive_integer(max_elapsed_ms, "max_elapsed_ms"),
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
    )
    return NumericalProblem(
        "integration",
        "definite_integral",
        function=function,
        function_record=function_record,
        variables=[{"name": variable, "shape": []}],
        bounds={
            "interval": [_encoded_endpoint(left), _encoded_endpoint(right)],
            "breakpoints": point_values,
        },
        tolerances={"absolute": absolute, "relative": relative},
        method=method,
        resource_budget=budget,
        trace_policy=TracePolicy(
            trace, max_events=max_trace_events, max_bytes=max_trace_bytes
        ),
        source_intent={
            "language": source_language,
            "source": {} if source is None else source,
        },
        initial_data={
            "endpoint_singularities": singularities,
            "max_depth": depth_limit,
            "max_intervals": interval_limit,
            "max_memory_bytes": memory_limit,
        },
        metadata={
            "dimension": 1,
            "numeric_type": "binary64-real",
            "error_semantics": "estimated_absolute_error_not_rigorous_enclosure",
        },
    )


def _ordered_problem_interval(problem: NumericalProblem) -> tuple[float, float, float]:
    record = problem.bounds.get("interval")
    if not isinstance(record, list) or len(record) != 2:
        raise ValueError("integration problem requires two interval endpoints")
    original_left = _decoded_endpoint(record[0])
    original_right = _decoded_endpoint(record[1])
    orientation = 1.0 if original_left <= original_right else -1.0
    return (
        min(original_left, original_right),
        max(original_left, original_right),
        orientation,
    )


def _selected_transform(problem: NumericalProblem) -> str:
    lower, upper, _orientation = _ordered_problem_interval(problem)
    singularities = problem.initial_data.get("endpoint_singularities")
    breakpoints = problem.bounds.get("breakpoints")
    if not math.isfinite(lower) and not math.isfinite(upper):
        return "whole_infinite_split_rational_transform"
    if not math.isfinite(lower):
        return "negative_infinite_rational_transform"
    if not math.isfinite(upper):
        return "positive_infinite_rational_transform"
    if isinstance(singularities, list) and singularities:
        return "explicit_endpoint_quadratic_transform"
    if isinstance(breakpoints, list) and breakpoints:
        return "finite_breakpoint_partition"
    return "direct_finite_interval"


def plan_integration(
    problem: NumericalProblem, method: str | None = None
) -> NumericalPlan:
    """Resolve an integration problem without evaluating its callback."""
    if problem.operation != "definite_integral":
        raise NotImplementedError("integration planning requires definite_integral")
    requested = problem.method if method is None else str(method)
    if requested == "auto":
        selected = "adaptive_gauss_kronrod"
        reason = (
            "global largest-error subdivision with an embedded Gauss-Kronrod rule "
            "provides portable error evidence for a real one-dimensional callback"
        )
    elif requested == "adaptive_gauss_kronrod":
        selected = requested
        reason = "the caller explicitly requested adaptive_gauss_kronrod"
    else:
        raise ValueError("unsupported integration method: " + requested)
    capability = integration_capabilities()["capability"]
    if not isinstance(capability, dict):
        raise TypeError("invalid integration capability record")
    capability["selected_transform"] = _selected_transform(problem)
    return NumericalPlan(
        problem,
        method=selected,
        backend="ordinary-python",
        reason=reason,
        capability=capability,
        fallback={"kind": "same_source_dynamic", "available": True},
        expected_resources={
            "max_intervals": int(problem.initial_data["max_intervals"]),
            "max_depth": int(problem.initial_data["max_depth"]),
            "max_evaluations": problem.resource_budget.max_evaluations,
            "max_elapsed_ms": problem.resource_budget.max_elapsed_ms,
            "max_workspace_bytes": int(problem.initial_data["max_memory_bytes"]),
            "independent_validation_evaluations_per_final_interval": 16,
        },
        rejected_alternatives=[
            {
                "method": "tanh_sinh",
                "reason": "valuable for high precision and endpoint singularities but not selected for the binary64 general finite default",
            },
            {
                "method": "multidimensional_nested_adaptivity",
                "reason": "no honest shared global error and resource contract is implemented",
            },
        ],
        diagnostics=(),
    )


class _Component:
    def __init__(self, identifier: int, kind: str, start: float, end: float) -> None:
        self.identifier = identifier
        self.kind = kind
        self.start = start
        self.end = end

    def parameter_interval(self) -> tuple[float, float]:
        if self.kind == "finite":
            return self.start, self.end
        return 0.0, 1.0

    def rule(self) -> str:
        if self.kind in ("positive_infinite", "negative_infinite", "whole_infinite"):
            return "gauss_7_kronrod_15"
        return "gauss_10_kronrod_21"

    def _finite_coordinate(self, parameter: float) -> tuple[float, tuple[float, ...]]:
        if self.kind == "finite":
            return parameter, (1.0,)
        half_width = _half_width(self.start, self.end)
        if self.kind == "endpoint_left":
            coordinate = _affine_point(self.start, self.end, parameter * parameter)
            if not (self.start < coordinate < self.end):
                raise _StopIntegration(
                    "interval_too_small",
                    {
                        "reason": "endpoint_transform_coordinate_unresolved",
                        "endpoint": self.start,
                        "parameter": parameter,
                    },
                )
            return coordinate, (4.0 * parameter, half_width)
        if self.kind == "endpoint_right":
            complement = 1.0 - parameter
            coordinate = _affine_point(
                self.start, self.end, 1.0 - complement * complement
            )
            if not (self.start < coordinate < self.end):
                raise _StopIntegration(
                    "interval_too_small",
                    {
                        "reason": "endpoint_transform_coordinate_unresolved",
                        "endpoint": self.end,
                        "parameter": parameter,
                    },
                )
            return coordinate, (4.0 * complement, half_width)
        raise ValueError("component does not have a finite coordinate")

    def evaluate(self, execution: "_IntegrationExecution", parameter: float) -> float:
        if self.kind in ("finite", "endpoint_left", "endpoint_right"):
            coordinate, multipliers = self._finite_coordinate(parameter)
            return execution.transformed_call(
                coordinate,
                self.identifier,
                parameter,
                multipliers=multipliers,
            )
        if self.kind == "positive_infinite":
            coordinate = self.start + (1.0 - parameter) / parameter
            return execution.transformed_call(
                coordinate,
                self.identifier,
                parameter,
                divisors=(parameter, parameter),
            )
        if self.kind == "negative_infinite":
            coordinate = self.end - (1.0 - parameter) / parameter
            return execution.transformed_call(
                coordinate,
                self.identifier,
                parameter,
                divisors=(parameter, parameter),
            )
        raise ValueError("unknown integration component kind: " + self.kind)

    def finite_physical_interval(self, left: float, right: float) -> list[float] | None:
        if self.kind not in ("finite", "endpoint_left", "endpoint_right"):
            return None
        if self.kind == "finite":
            left_coordinate = left
            right_coordinate = right
        elif self.kind == "endpoint_left":
            left_coordinate = _affine_point(self.start, self.end, left * left)
            right_coordinate = _affine_point(self.start, self.end, right * right)
        else:
            left_complement = 1.0 - left
            right_complement = 1.0 - right
            left_coordinate = _affine_point(
                self.start, self.end, 1.0 - left_complement * left_complement
            )
            right_coordinate = _affine_point(
                self.start, self.end, 1.0 - right_complement * right_complement
            )
        return [
            min(left_coordinate, right_coordinate),
            max(left_coordinate, right_coordinate),
        ]


class _Interval:
    def __init__(
        self,
        component: _Component,
        left: float,
        right: float,
        value: float,
        error: float,
        absolute_integral: float,
        absolute_deviation: float,
        depth: int,
    ) -> None:
        self.component = component
        self.left = left
        self.right = right
        self.value = value
        self.error = error
        self.absolute_integral = absolute_integral
        self.absolute_deviation = absolute_deviation
        self.depth = depth

    def record(self, infinite_problem: bool) -> dict[str, Any]:
        physical = self.component.finite_physical_interval(self.left, self.right)
        if physical is None:
            physical_record: Any = {
                "kind": self.component.kind,
                "parameter_interval": [self.left, self.right],
            }
            plot_left = self.left
            plot_right = self.right
            plot_coordinate = "transformed_t"
        else:
            physical_record = physical
            plot_left = physical[0]
            plot_right = physical[1]
            plot_coordinate = "physical_x"
        if infinite_problem:
            plot_coordinate = "transformed_t"
            plot_left = self.left
            plot_right = self.right
        return {
            "component": self.component.identifier,
            "component_kind": self.component.kind,
            "parameter_interval": [self.left, self.right],
            "physical_region": physical_record,
            "plot_coordinate": plot_coordinate,
            "plot_left": plot_left,
            "plot_right": plot_right,
            "value": self.value,
            "error_estimate": self.error,
            "absolute_integral_estimate": self.absolute_integral,
            "absolute_deviation": self.absolute_deviation,
            "depth": self.depth,
            "rule": self.component.rule(),
        }


class _IntegrationExecution:
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
        self.solver_evaluations = 0
        self.validation_evaluations = 0
        self.in_validation = False
        self.started = time.perf_counter()

    def elapsed_ms(self) -> float:
        return 1000.0 * (time.perf_counter() - self.started)

    def check(self) -> None:
        if self.cancel is not None:
            try:
                cancelled = bool(self.cancel())
            except Exception as error:
                raise _StopIntegration(
                    "callback_error",
                    {
                        "phase": "cancellation_callback",
                        "error_type": type(error).__name__,
                    },
                ) from None
            if cancelled:
                raise _StopIntegration("cancelled")
        if self.elapsed_ms() > self.problem.resource_budget.max_elapsed_ms:
            raise _StopIntegration("maximum_elapsed_time")

    def call(self, x: float, component: int, parameter: float) -> float:
        self.check()
        if self.evaluations >= self.problem.resource_budget.max_evaluations:
            raise _StopIntegration("maximum_evaluations")
        function = self.problem.function
        if function is None:
            raise _StopIntegration(
                "invalid_problem", {"reason": "missing_live_callback"}
            )
        self.evaluations += 1
        if self.in_validation:
            self.validation_evaluations += 1
        else:
            self.solver_evaluations += 1
        try:
            value = float(function(x))
        except Exception as error:
            self.trace.append(
                "failure",
                evaluation=self.evaluations,
                data={
                    "x": x,
                    "parameter": parameter,
                    "component": component,
                    "error_type": type(error).__name__,
                },
                diagnostics=[NumericalDiagnostic("callback_error")],
                important=True,
                force=True,
            )
            raise _StopIntegration(
                "callback_error",
                {"phase": "integrand_callback", "error_type": type(error).__name__},
            ) from None
        self.check()
        if not math.isfinite(value):
            self.trace.append(
                "failure",
                evaluation=self.evaluations,
                data={"x": x, "parameter": parameter, "component": component},
                diagnostics=[NumericalDiagnostic("nonfinite_evaluation")],
                important=True,
                force=True,
            )
            raise _StopIntegration("nonfinite_evaluation")
        self.trace.append(
            "evaluation",
            evaluation=self.evaluations,
            data={
                "x": x,
                "value": value,
                "parameter": parameter,
                "component": component,
                "phase": "validation" if self.in_validation else "solver",
            },
        )
        self.check()
        return value

    def transformed_call(
        self,
        x: float,
        component: int,
        parameter: float,
        *,
        multipliers: Sequence[float] = (),
        divisors: Sequence[float] = (),
    ) -> float:
        value = _scaled_product_quotient(
            [self.call(x, component, parameter), *multipliers], divisors
        )
        if not math.isfinite(value):
            self.nonfinite_transformed(parameter, component)
        return value

    def nonfinite_transformed(self, parameter: float, component: int) -> None:
        self.trace.append(
            "failure",
            evaluation=self.evaluations,
            data={"parameter": parameter, "component": component},
            diagnostics=[NumericalDiagnostic("nonfinite_evaluation")],
            important=True,
            force=True,
        )
        raise _StopIntegration("nonfinite_evaluation")


def _rescaled_error(raw_error: float, resabs: float, resasc: float) -> float:
    error = raw_error
    if resasc != 0.0 and error != 0.0:
        error = resasc * min(1.0, (200.0 * error / resasc) ** 1.5)
    if resabs > _MIN_NORMAL / (50.0 * _MACHINE_EPSILON):
        error = max(50.0 * _MACHINE_EPSILON * resabs, error)
    return error


def _gauss_kronrod_21(
    execution: _IntegrationExecution,
    component: _Component,
    lower: float,
    upper: float,
    depth: int,
) -> _Interval:
    center = _open_affine_point(lower, upper, 0.5)
    half_length = _half_width(lower, upper)
    center_value = component.evaluate(execution, center)
    kronrod_terms = [_GK21_CENTER_WEIGHT * center_value]
    gauss_terms: list[float] = []
    absolute_terms = [_GK21_CENTER_WEIGHT * abs(center_value)]
    sampled: list[tuple[float, float]] = []
    for index in range(len(_GK21_ABSCISSAE)):
        left_value = component.evaluate(
            execution,
            _open_affine_point(lower, upper, 0.5 * (1.0 - _GK21_ABSCISSAE[index])),
        )
        right_value = component.evaluate(
            execution,
            _open_affine_point(lower, upper, 0.5 * (1.0 + _GK21_ABSCISSAE[index])),
        )
        sampled.append((left_value, right_value))
        pair_sum = math.fsum([left_value, right_value])
        kronrod_terms.append(_GK21_WEIGHTS[index] * pair_sum)
        if _G10_WEIGHTS[index] != 0.0:
            gauss_terms.append(_G10_WEIGHTS[index] * pair_sum)
        absolute_terms.append(
            _GK21_WEIGHTS[index] * (abs(left_value) + abs(right_value))
        )
    kronrod_sum = math.fsum(kronrod_terms)
    gauss_sum = math.fsum(gauss_terms)
    mean = 0.5 * kronrod_sum
    deviation_terms = [_GK21_CENTER_WEIGHT * abs(center_value - mean)]
    for index in range(len(sampled)):
        left_value, right_value = sampled[index]
        deviation_terms.append(
            _GK21_WEIGHTS[index] * (abs(left_value - mean) + abs(right_value - mean))
        )
    absolute_half = abs(half_length)
    value = _scaled_product_quotient((kronrod_sum, half_length))
    resabs = _scaled_product_quotient((math.fsum(absolute_terms), absolute_half))
    resasc = _scaled_product_quotient((math.fsum(deviation_terms), absolute_half))
    error = _rescaled_error(
        abs(_scaled_product_quotient((kronrod_sum - gauss_sum, half_length))),
        resabs,
        resasc,
    )
    return _Interval(component, lower, upper, value, error, resabs, resasc, depth)


def _gauss_kronrod_15(
    execution: _IntegrationExecution,
    component: _Component,
    lower: float,
    upper: float,
    depth: int,
) -> _Interval:
    center = _open_affine_point(lower, upper, 0.5)
    half_length = _half_width(lower, upper)
    center_value = component.evaluate(execution, center)
    kronrod_terms = [_GK15_CENTER_WEIGHT * center_value]
    gauss_terms = [_G7_CENTER_WEIGHT * center_value]
    absolute_terms = [_GK15_CENTER_WEIGHT * abs(center_value)]
    sampled: list[tuple[float, float]] = []
    for index in range(len(_GK15_ABSCISSAE)):
        left_value = component.evaluate(
            execution,
            _open_affine_point(lower, upper, 0.5 * (1.0 - _GK15_ABSCISSAE[index])),
        )
        right_value = component.evaluate(
            execution,
            _open_affine_point(lower, upper, 0.5 * (1.0 + _GK15_ABSCISSAE[index])),
        )
        sampled.append((left_value, right_value))
        pair_sum = math.fsum([left_value, right_value])
        kronrod_terms.append(_GK15_WEIGHTS[index] * pair_sum)
        if _G7_WEIGHTS[index] != 0.0:
            gauss_terms.append(_G7_WEIGHTS[index] * pair_sum)
        absolute_terms.append(
            _GK15_WEIGHTS[index] * (abs(left_value) + abs(right_value))
        )
    kronrod_sum = math.fsum(kronrod_terms)
    gauss_sum = math.fsum(gauss_terms)
    mean = 0.5 * kronrod_sum
    deviation_terms = [_GK15_CENTER_WEIGHT * abs(center_value - mean)]
    for index in range(len(sampled)):
        left_value, right_value = sampled[index]
        deviation_terms.append(
            _GK15_WEIGHTS[index] * (abs(left_value - mean) + abs(right_value - mean))
        )
    absolute_half = abs(half_length)
    value = _scaled_product_quotient((kronrod_sum, half_length))
    resabs = _scaled_product_quotient((math.fsum(absolute_terms), absolute_half))
    resasc = _scaled_product_quotient((math.fsum(deviation_terms), absolute_half))
    error = _rescaled_error(
        abs(_scaled_product_quotient((kronrod_sum - gauss_sum, half_length))),
        resabs,
        resasc,
    )
    return _Interval(component, lower, upper, value, error, resabs, resasc, depth)


def _quadrature_interval(
    execution: _IntegrationExecution,
    component: _Component,
    lower: float,
    upper: float,
    depth: int,
) -> _Interval:
    try:
        if component.rule() == "gauss_7_kronrod_15":
            interval = _gauss_kronrod_15(execution, component, lower, upper, depth)
        else:
            interval = _gauss_kronrod_21(execution, component, lower, upper, depth)
    except (OverflowError, ValueError):
        raise _StopIntegration(
            "nonfinite_evaluation", {"phase": "quadrature_accumulation"}
        ) from None
    if not all(
        [
            math.isfinite(value)
            for value in (
                interval.value,
                interval.error,
                interval.absolute_integral,
                interval.absolute_deviation,
            )
        ]
    ):
        raise _StopIntegration(
            "nonfinite_evaluation", {"phase": "quadrature_accumulation"}
        )
    return interval


def _build_components(problem: NumericalProblem) -> list[_Component]:
    lower, upper, _orientation = _ordered_problem_interval(problem)
    if not math.isfinite(lower) and not math.isfinite(upper):
        return [
            _Component(0, "negative_infinite", 0.0, 0.0),
            _Component(1, "positive_infinite", 0.0, 0.0),
        ]
    if not math.isfinite(lower):
        return [_Component(0, "negative_infinite", 0.0, upper)]
    if not math.isfinite(upper):
        return [_Component(0, "positive_infinite", lower, 0.0)]
    breakpoint_record = problem.bounds.get("breakpoints")
    breakpoints = (
        []
        if not isinstance(breakpoint_record, list)
        else [float(value) for value in breakpoint_record]
    )
    cuts = [lower] + breakpoints + [upper]
    components: list[_Component] = []
    for index in range(len(cuts) - 1):
        components.append(_Component(index, "finite", cuts[index], cuts[index + 1]))
    singularity_record = problem.initial_data.get("endpoint_singularities")
    singularities = (
        [] if not isinstance(singularity_record, list) else singularity_record
    )
    left_singular = "left" in singularities
    right_singular = "right" in singularities
    if left_singular and right_singular and len(components) == 1:
        midpoint = lower + 0.5 * (upper - lower)
        return [
            _Component(0, "endpoint_left", lower, midpoint),
            _Component(1, "endpoint_right", midpoint, upper),
        ]
    if left_singular:
        components[0].kind = "endpoint_left"
    if right_singular:
        components[-1].kind = "endpoint_right"
    return components


def _workspace_bytes(interval_count: int, component_count: int) -> int:
    return (
        interval_count * _INTERVAL_WORKSPACE_BYTES
        + component_count * _COMPONENT_WORKSPACE_BYTES
    )


def _target(problem: NumericalProblem, value: float) -> float:
    return max(
        float(problem.tolerances["absolute"]),
        float(problem.tolerances["relative"]) * abs(value),
    )


def _totals(intervals: Sequence[_Interval]) -> tuple[float, float, float]:
    try:
        totals = (
            math.fsum([interval.value for interval in intervals]),
            math.fsum([interval.error for interval in intervals]),
            math.fsum([interval.absolute_integral for interval in intervals]),
        )
    except (OverflowError, ValueError):
        raise _StopIntegration(
            "nonfinite_evaluation", {"phase": "global_accumulation"}
        ) from None
    if not all([math.isfinite(value) for value in totals]):
        raise _StopIntegration("nonfinite_evaluation", {"phase": "global_accumulation"})
    return totals


def _gauss_legendre_8(
    execution: _IntegrationExecution,
    interval: _Interval,
    lower: float,
    upper: float,
) -> float:
    half_length = _half_width(lower, upper)
    terms: list[float] = []
    for index in range(len(_GL8_ABSCISSAE)):
        left_value = interval.component.evaluate(
            execution,
            _open_affine_point(lower, upper, 0.5 * (1.0 - _GL8_ABSCISSAE[index])),
        )
        right_value = interval.component.evaluate(
            execution,
            _open_affine_point(lower, upper, 0.5 * (1.0 + _GL8_ABSCISSAE[index])),
        )
        terms.append(_GL8_WEIGHTS[index] * math.fsum([left_value, right_value]))
    return _scaled_product_quotient((math.fsum(terms), half_length))


def _independent_interval_value(
    execution: _IntegrationExecution, interval: _Interval
) -> float:
    """Apply GL8 on two fresh panels inside one final adaptive leaf."""
    midpoint = _affine_point(interval.left, interval.right, 0.5)
    return math.fsum(
        [
            _gauss_legendre_8(execution, interval, interval.left, midpoint),
            _gauss_legendre_8(execution, interval, midpoint, interval.right),
        ]
    )


def _generic_status(reason: str) -> str:
    if reason in ("converged", "zero_interval"):
        return "converged"
    if reason in ("maximum_intervals", "maximum_depth"):
        return "maximum_iterations"
    if reason == "maximum_evaluations":
        return "maximum_evaluations"
    if reason == "maximum_elapsed_time":
        return "maximum_elapsed_time"
    if reason in ("roundoff_detected", "interval_too_small", "maximum_memory"):
        return "stagnation"
    if reason in (
        "cancelled",
        "callback_error",
        "nonfinite_evaluation",
        "invalid_problem",
        "validation_failed",
    ):
        return reason
    return "backend_failure"


def _diagnostic_for_stop(
    reason: str, details: Mapping[str, Any]
) -> NumericalDiagnostic | None:
    if reason in ("converged", "zero_interval"):
        return None
    if reason in ("maximum_intervals", "maximum_depth", "maximum_memory"):
        return NumericalDiagnostic(
            "maximum_iterations", details={"integration_stop_reason": reason, **details}
        )
    if reason == "maximum_evaluations":
        return NumericalDiagnostic(
            "maximum_evaluations",
            details={"integration_stop_reason": reason, **details},
        )
    if reason == "maximum_elapsed_time":
        return NumericalDiagnostic(
            "maximum_elapsed_time",
            details={"integration_stop_reason": reason, **details},
        )
    if reason in ("roundoff_detected", "interval_too_small"):
        return NumericalDiagnostic(
            "stagnation", details={"integration_stop_reason": reason, **details}
        )
    if reason in ("cancelled", "callback_error", "nonfinite_evaluation"):
        return NumericalDiagnostic(reason, details=details)
    if reason == "validation_failed":
        return NumericalDiagnostic("validation_failed", details=details)
    return NumericalDiagnostic(
        "validation_failed", details={"integration_stop_reason": reason, **details}
    )


def _condition_indicator(value: float, absolute_integral: float) -> float | None:
    if absolute_integral == 0.0:
        return 1.0
    if value == 0.0:
        return None
    indicator = absolute_integral / abs(value)
    return indicator if math.isfinite(indicator) else None


def _validation_record(
    converged: bool,
    value: float | None,
    solver_error: float | None,
    requested: float | None,
    independent_value: float | None,
    absolute_integral: float,
) -> tuple[NumericalValidation, bool, float | None]:
    if (
        not converged
        or value is None
        or solver_error is None
        or requested is None
        or independent_value is None
    ):
        return (
            NumericalValidation(
                "indeterminate",
                False,
                checks=[
                    {"kind": "solver_converged", "passed": converged},
                    {"kind": "independent_gauss_legendre_8", "passed": False},
                ],
                error_estimate=solver_error,
                condition_estimate=_condition_indicator(
                    value or 0.0, absolute_integral
                ),
            ),
            False,
            solver_error,
        )
    disagreement = abs(value - independent_value)
    validation_threshold = requested
    passed = solver_error <= requested and disagreement <= validation_threshold
    reported_error = max(solver_error, disagreement)
    return (
        NumericalValidation(
            "validated_approximate" if passed else "indeterminate",
            passed,
            checks=[
                {
                    "kind": "embedded_gauss_kronrod_error",
                    "passed": solver_error <= requested,
                    "value": solver_error,
                    "threshold": requested,
                    "rigorous_enclosure": False,
                },
                {
                    "kind": "independent_gauss_legendre_8",
                    "passed": disagreement <= validation_threshold,
                    "value": independent_value,
                    "difference": disagreement,
                    "threshold": validation_threshold,
                    "partition_reused": True,
                    "nodes_reused": False,
                },
            ],
            error_estimate=reported_error,
            condition_estimate=_condition_indicator(value, absolute_integral),
        ),
        passed,
        reported_error,
    )


def solve_integration_problem(
    problem: NumericalProblem,
    *,
    method: str | None = None,
    cancel: Callable[[], bool] | None = None,
) -> IntegrationResult:
    """Plan, integrate, independently validate, and package all evidence."""
    selected_plan = plan_integration(problem, method=method)
    trace = NumericalTrace(problem.trace_policy)
    transform = _selected_transform(problem)
    trace.append(
        "start",
        data={
            "operation": problem.operation,
            "method": selected_plan.method,
            "backend": selected_plan.backend,
            "transform": transform,
            "absolute_tolerance": float(problem.tolerances["absolute"]),
            "relative_tolerance": float(problem.tolerances["relative"]),
        },
        important=True,
        force=True,
    )
    execution = _IntegrationExecution(problem, trace, cancel)
    diagnostics: list[NumericalDiagnostic] = []
    if not problem.replayable:
        diagnostics.append(NumericalDiagnostic("non_replayable_callback"))
    lower, upper, orientation = _ordered_problem_interval(problem)
    components = _build_components(problem)
    max_intervals = int(problem.initial_data["max_intervals"])
    max_depth = int(problem.initial_data["max_depth"])
    max_memory = int(problem.initial_data["max_memory_bytes"])
    infinite_problem = not math.isfinite(lower) or not math.isfinite(upper)
    intervals: list[_Interval] = []
    iterations = 0
    roundoff_count = 0
    stop_reason = "backend_failure"
    stop_details: dict[str, Any] = {}
    solver_value: float | None = None
    solver_error: float | None = None
    absolute_integral = 0.0
    requested_tolerance: float | None = None
    independent_value: float | None = None

    if lower == upper:
        stop_reason = "zero_interval"
        solver_value = 0.0
        solver_error = 0.0
        requested_tolerance = _target(problem, 0.0)
        validation = NumericalValidation(
            "exact",
            True,
            checks=[{"kind": "zero_width_interval", "passed": True}],
            error_estimate=0.0,
            condition_estimate=1.0,
        )
        trace.append(
            "validation",
            data=validation.to_dict(),
            important=True,
            force=True,
        )
        trace.append(
            "finish",
            iteration=0,
            evaluation=0,
            data={"status": stop_reason, "success": True, "estimate": 0.0},
            important=True,
            force=True,
        )
        return IntegrationResult(
            problem,
            selected_plan,
            success=True,
            status="converged",
            stop_reason=stop_reason,
            value=0.0,
            validation=validation,
            estimated_error=0.0,
            requested_tolerance=requested_tolerance,
            final_intervals=(),
            diagnostics=diagnostics,
            trace=trace,
            provenance={
                "implementation": "sagejs.numerics.integration",
                "implementation_kind": "ordinary_python",
                "source_transparent": True,
                "algorithm_family": "adaptive_gauss_kronrod",
            },
            domain_payload={
                "integration_status": stop_reason,
                "solver_stop_reason": stop_reason,
                "estimated_absolute_error": 0.0,
                "requested_tolerance": requested_tolerance,
                "final_intervals": [],
            },
        )

    try:
        if len(components) > max_intervals:
            raise _StopIntegration(
                "maximum_intervals",
                {
                    "required_initial_intervals": len(components),
                    "max_intervals": max_intervals,
                },
            )
        initial_workspace = _workspace_bytes(len(components), len(components))
        if initial_workspace > max_memory:
            raise _StopIntegration(
                "maximum_memory",
                {
                    "required_workspace_bytes": initial_workspace,
                    "max_memory_bytes": max_memory,
                },
            )
        initial_intervals: list[_Interval] = []
        for component in components:
            parameter_lower, parameter_upper = component.parameter_interval()
            initial_intervals.append(
                _quadrature_interval(
                    execution, component, parameter_lower, parameter_upper, 0
                )
            )
        intervals = initial_intervals
        total, total_error, absolute_integral = _totals(intervals)
        solver_value = orientation * total
        solver_error = total_error
        requested_tolerance = _target(problem, solver_value)
        trace.append(
            "phase",
            iteration=0,
            evaluation=execution.evaluations,
            data={
                "phase": "initial_partition",
                "estimate": solver_value,
                "error_estimate": solver_error,
                "requested_tolerance": requested_tolerance,
                "active_intervals": len(intervals),
            },
            important=True,
        )
        while solver_error > requested_tolerance:
            execution.check()
            if (
                iterations >= problem.resource_budget.max_iterations
                or len(intervals) >= max_intervals
            ):
                raise _StopIntegration(
                    "maximum_intervals",
                    {
                        "active_intervals": len(intervals),
                        "max_intervals": max_intervals,
                    },
                )
            worst_index = 0
            for index in range(1, len(intervals)):
                if intervals[index].error > intervals[worst_index].error:
                    worst_index = index
            parent = intervals[worst_index]
            if parent.depth >= max_depth:
                raise _StopIntegration(
                    "maximum_depth",
                    {
                        "depth": parent.depth,
                        "max_depth": max_depth,
                        "local_error": parent.error,
                    },
                )
            midpoint = _affine_point(parent.left, parent.right, 0.5)
            if midpoint == parent.left or midpoint == parent.right:
                raise _StopIntegration(
                    "interval_too_small",
                    {"depth": parent.depth, "local_error": parent.error},
                )
            next_workspace = _workspace_bytes(len(intervals) + 1, len(components))
            if next_workspace > max_memory:
                raise _StopIntegration(
                    "maximum_memory",
                    {
                        "required_workspace_bytes": next_workspace,
                        "max_memory_bytes": max_memory,
                    },
                )
            left_interval = _quadrature_interval(
                execution,
                parent.component,
                parent.left,
                midpoint,
                parent.depth + 1,
            )
            right_interval = _quadrature_interval(
                execution,
                parent.component,
                midpoint,
                parent.right,
                parent.depth + 1,
            )
            child_value = math.fsum([left_interval.value, right_interval.value])
            child_error = math.fsum([left_interval.error, right_interval.error])
            if (
                abs(child_value - parent.value) <= 1e-5 * max(1.0, abs(child_value))
                and child_error >= 0.99 * parent.error
            ):
                roundoff_count += 1
            intervals[worst_index] = left_interval
            intervals.append(right_interval)
            iterations += 1
            total, total_error, absolute_integral = _totals(intervals)
            solver_value = orientation * total
            solver_error = max(0.0, total_error)
            requested_tolerance = _target(problem, solver_value)
            trace.append(
                "iteration",
                iteration=iterations,
                evaluation=execution.evaluations,
                accepted=True,
                data={
                    "action": "bisect_largest_error_interval",
                    "parent": parent.record(infinite_problem),
                    "children": [
                        left_interval.record(infinite_problem),
                        right_interval.record(infinite_problem),
                    ],
                    "estimate": solver_value,
                    "error_estimate": solver_error,
                    "requested_tolerance": requested_tolerance,
                    "active_intervals": len(intervals),
                    "roundoff_counter": roundoff_count,
                },
            )
            if roundoff_count >= 10:
                raise _StopIntegration(
                    "roundoff_detected",
                    {
                        "roundoff_counter": roundoff_count,
                        "error_estimate": solver_error,
                    },
                )
        stop_reason = "converged"
    except _StopIntegration as stop:
        stop_reason = stop.reason
        stop_details = stop.details
        if intervals:
            total, total_error, absolute_integral = _totals(intervals)
            solver_value = orientation * total
            solver_error = max(0.0, total_error)
            requested_tolerance = _target(problem, solver_value)

    solver_stop_reason = stop_reason
    solver_converged = solver_stop_reason == "converged"
    if solver_converged:
        try:
            execution.in_validation = True
            independent_value = orientation * math.fsum(
                [
                    _independent_interval_value(execution, interval)
                    for interval in intervals
                ]
            )
            execution.check()
        except _StopIntegration as stop:
            stop_reason = stop.reason
            stop_details = {"phase": "independent_validation", **stop.details}
        finally:
            execution.in_validation = False

    validation, validation_passed, reported_error = _validation_record(
        solver_converged,
        solver_value,
        solver_error,
        requested_tolerance,
        independent_value,
        absolute_integral,
    )
    if solver_converged and stop_reason == "converged" and not validation_passed:
        stop_reason = "validation_failed"
        stop_details = {
            "solver_error_estimate": solver_error,
            "independent_estimate": independent_value,
        }
    stop_diagnostic = _diagnostic_for_stop(stop_reason, stop_details)
    if stop_diagnostic is not None:
        diagnostics.append(stop_diagnostic)
    condition = _condition_indicator(solver_value or 0.0, absolute_integral)
    if absolute_integral > 0.0 and (condition is None or condition > 1e12):
        diagnostics.append(
            NumericalDiagnostic(
                "loss_of_significance",
                details={
                    "absolute_integral_estimate": absolute_integral,
                    "cancellation_indicator": condition,
                },
            )
        )
    trace.append(
        "validation",
        evaluation=execution.evaluations,
        data=validation.to_dict(),
        diagnostics=[stop_diagnostic] if stop_diagnostic is not None else (),
        important=True,
        force=True,
    )
    success = stop_reason == "converged" and validation.passed
    trace.append(
        "finish" if success else "failure",
        iteration=iterations,
        evaluation=execution.evaluations,
        data={
            "status": stop_reason,
            "success": success,
            "estimate": solver_value,
            "error_estimate": reported_error,
            "requested_tolerance": requested_tolerance,
            "active_intervals": len(intervals),
        },
        diagnostics=diagnostics,
        important=True,
        force=True,
    )
    interval_records = [interval.record(infinite_problem) for interval in intervals]
    max_depth_reached = max([interval.depth for interval in intervals] + [0])
    workspace_bytes = _workspace_bytes(len(intervals), len(components))
    payload = {
        "integration_status": stop_reason,
        "solver_stop_reason": solver_stop_reason,
        "estimated_absolute_error": reported_error,
        "embedded_error_estimate": solver_error,
        "requested_tolerance": requested_tolerance,
        "absolute_integral_estimate": absolute_integral,
        "cancellation_indicator": condition,
        "independent_estimate": independent_value,
        "independent_difference": None
        if independent_value is None or solver_value is None
        else abs(independent_value - solver_value),
        "selected_transform": transform,
        "orientation": int(orientation),
        "final_intervals": interval_records,
        "max_depth_reached": max_depth_reached,
        "workspace_bytes": workspace_bytes,
        "workspace_accounting": {
            "interval_bytes": _INTERVAL_WORKSPACE_BYTES,
            "component_bytes": _COMPONENT_WORKSPACE_BYTES,
            "conservative_estimate": True,
        },
        "failure_details": stop_details,
    }
    return IntegrationResult(
        problem,
        selected_plan,
        success=success,
        status=_generic_status(stop_reason),
        stop_reason=stop_reason,
        value=solver_value,
        validation=validation,
        estimated_error=reported_error,
        requested_tolerance=requested_tolerance,
        final_intervals=interval_records,
        diagnostics=diagnostics,
        iterations=iterations,
        evaluations=execution.evaluations,
        elapsed_ms=execution.elapsed_ms(),
        trace=trace,
        measurements={
            "solver_evaluations": execution.solver_evaluations,
            "validation_evaluations": execution.validation_evaluations,
            "active_intervals": len(intervals),
            "max_depth_reached": max_depth_reached,
            "workspace_bytes": workspace_bytes,
        },
        provenance={
            "implementation": "sagejs.numerics.integration",
            "implementation_kind": "ordinary_python",
            "source_transparent": True,
            "algorithm_family": "adaptive_gauss_kronrod",
            "finite_rule": "gauss_10_kronrod_21",
            "infinite_rule": "gauss_7_kronrod_15",
            "independent_validator": "gauss_legendre_8_final_partition",
            "error_claim": "estimated_not_rigorous",
        },
        domain_payload=payload,
    )


def integrate(
    function: Callable[[float], Any],
    lower: float,
    upper: float,
    **options: Any,
) -> IntegrationResult:
    """Integrate a real callback and return structured error evidence."""
    cancel = options.pop("cancel", None)
    problem = integration_problem(function, lower, upper, **options)
    return solve_integration_problem(problem, cancel=cancel)
