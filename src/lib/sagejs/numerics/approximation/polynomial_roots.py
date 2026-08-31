"""Validated binary64 roots of a univariate polynomial.

The primary implementation is a simultaneous Aberth--Ehrlich iteration on a
scaled monic polynomial.  A bounded Laguerre/deflation pass is available as a
same-source rescue when the simultaneous iteration stagnates.  Neither method
certifies multiplicities or forward errors: success is based on independent
coefficientwise backward-error and Vieta reconstruction checks.
"""

from __future__ import annotations

import cmath
import math
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
from ._common import (
    MACHINE_EPSILON,
    QUALIFIED_PLATFORM_SUPPORT,
    ApproximationExecution,
    ApproximationStopped,
    stopped_diagnostic,
    trace_policy,
)

if TYPE_CHECKING:
    from sagejs.plotting import PlotAnimation, PlotSpec

MAX_POLYNOMIAL_ROOT_DEGREE = 64
_TWO_PI = 6.283185307179586476925286766559
_MAX_FINITE = 1.7976931348623157e308
_MIN_NORMAL = 2.2250738585072014e-308


def _complex_magnitude(value: complex) -> float:
    real = abs(float(value.real))
    imaginary = abs(float(value.imag))
    high = max(real, imaginary)
    low = min(real, imaginary)
    if high == 0.0:
        return 0.0
    ratio = low / high
    return high * math.sqrt(1.0 + ratio * ratio)


def _divide_complex(numerator: complex, denominator: complex) -> complex:
    """Scaled complex division without squaring tiny or huge components."""
    real = float(denominator.real)
    imaginary = float(denominator.imag)
    numerator_real = float(numerator.real)
    numerator_imaginary = float(numerator.imag)
    scale = max(abs(real), abs(imaginary))
    if scale == 0.0:
        raise ZeroDivisionError("complex division by zero")
    scaled_real = real / scale
    scaled_imaginary = imaginary / scale
    divisor = scaled_real * scaled_real + scaled_imaginary * scaled_imaginary
    scaled_numerator_real = numerator_real / scale
    scaled_numerator_imaginary = numerator_imaginary / scale
    return complex(
        (
            scaled_numerator_real * scaled_real
            + scaled_numerator_imaginary * scaled_imaginary
        )
        / divisor,
        (
            scaled_numerator_imaginary * scaled_real
            - scaled_numerator_real * scaled_imaginary
        )
        / divisor,
    )


def _divide_complex_by_real(value: complex, denominator: float) -> complex:
    """Divide components directly so a tiny real is not squared by the host."""
    if denominator == 0.0:
        raise ZeroDivisionError("complex division by zero")
    return complex(value.real / denominator, value.imag / denominator)


def _complex_mean(values: Sequence[complex]) -> complex:
    """Average finite complex values without overflowing their raw sum."""
    if len(values) == 0:
        raise ValueError("cannot average an empty complex sequence")
    reciprocal = 1.0 / len(values)
    real = 0.0
    imaginary = 0.0
    for value in values:
        real += value.real * reciprocal
        imaginary += value.imag * reciprocal
    return complex(real, imaginary)


def _finite_complex(value: Any, name: str) -> complex:
    if isinstance(value, bool):
        raise TypeError(name + " must be a real or complex number")
    try:
        answer = complex(value)
    except Exception:
        raise TypeError(name + " must be a real or complex number") from None
    if not math.isfinite(answer.real) or not math.isfinite(answer.imag):
        raise ValueError(name + " must be finite")
    return answer


def _complex_record(value: complex) -> dict[str, float]:
    real = float(value.real)
    imaginary = float(value.imag)
    if not math.isfinite(real) or not math.isfinite(imaginary):
        raise ArithmeticError("a polynomial root is not representable in binary64")
    if real == 0.0:
        real = 0.0
    if imaginary == 0.0:
        imaginary = 0.0
    return {"real": real, "imag": imaginary}


def _record_complex(value: Mapping[str, Any], name: str) -> complex:
    if "real" not in value or "imag" not in value:
        raise TypeError(name + " must contain real and imag fields")
    return _finite_complex(complex(float(value["real"]), float(value["imag"])), name)


def _coefficient_records(coefficients: Sequence[Any]) -> list[dict[str, float]]:
    records: list[dict[str, float]] = []
    for index in range(len(coefficients)):
        records.append(
            _complex_record(
                _finite_complex(coefficients[index], "coefficients[" + str(index) + "]")
            )
        )
    return records


def _decode_coefficients(problem: NumericalProblem) -> list[complex]:
    values = problem.initial_data.get("coefficients")
    if not isinstance(values, list):
        raise TypeError("polynomial-root problem has no coefficient list")
    answer: list[complex] = []
    for index in range(len(values)):
        record = values[index]
        if not isinstance(record, dict):
            raise TypeError("invalid polynomial coefficient record")
        answer.append(_record_complex(record, "coefficients[" + str(index) + "]"))
    return answer


def polynomial_roots_problem(
    coefficients: Sequence[Any],
    *,
    order: str = "descending",
    method: str = "auto",
    atol: float = 0.0,
    rtol: float = 1.0e-12,
    resource_budget: ResourceBudget | None = None,
    trace: str | TracePolicy = "summary",
) -> NumericalProblem:
    """Describe all finite complex roots of a binary64 polynomial.

    Coefficients use descending powers by default.  Set `order="ascending"`
    for the convention used by `numpy.polynomial.polynomial`.
    """
    if order not in ("descending", "ascending"):
        raise ValueError("coefficient order must be descending or ascending")
    if method not in ("auto", "aberth-ehrlich", "laguerre-deflation"):
        raise ValueError(
            "polynomial-root method must be auto, aberth-ehrlich, or laguerre-deflation"
        )
    absolute_tolerance = float(atol)
    relative_tolerance = float(rtol)
    if (
        not math.isfinite(absolute_tolerance)
        or absolute_tolerance < 0.0
        or not math.isfinite(relative_tolerance)
        or relative_tolerance <= 0.0
    ):
        raise ValueError(
            "polynomial-root tolerances must be finite with atol >= 0 and rtol > 0"
        )
    records = _coefficient_records(coefficients)
    if len(records) == 0:
        raise ValueError("at least one polynomial coefficient is required")
    degree_bound = len(records) - 1
    if degree_bound > MAX_POLYNOMIAL_ROOT_DEGREE:
        raise ValueError(
            "the portable polynomial-root solver supports degree at most "
            + str(MAX_POLYNOMIAL_ROOT_DEGREE)
        )
    if order == "ascending":
        records.reverse()
    budget = resource_budget
    if budget is None:
        budget = ResourceBudget(
            max_iterations=max(256, 40 * max(1, degree_bound)),
            max_evaluations=max(1024, 320 * max(1, degree_bound)),
            max_elapsed_ms=30_000,
            max_trace_events=256,
            max_trace_bytes=1_000_000,
        )
    selected_method = "aberth-ehrlich" if method == "auto" else method
    return NumericalProblem(
        "approximation",
        "polynomial_roots",
        function_record={
            "kind": "polynomial_coefficients",
            "replayable": True,
            "coefficient_order": "descending",
        },
        numeric_type="complex-binary64",
        variables=[{"name": "z", "shape": []}],
        initial_data={"coefficients": records, "coefficient_order": "descending"},
        tolerances={"absolute": absolute_tolerance, "relative": relative_tolerance},
        method=selected_method,
        resource_budget=budget,
        trace_policy=trace_policy(budget, trace),
        source_intent={"language": "python", "source": {}},
        metadata={"input_degree_bound": degree_bound},
    )


def plan_polynomial_roots(problem: NumericalProblem) -> NumericalPlan:
    """Resolve the bounded portable algorithm without doing root iterations."""
    if problem.operation != "polynomial_roots":
        raise ValueError("not a polynomial-root problem")
    coefficients = _decode_coefficients(problem)
    degree_bound = len(coefficients) - 1
    method = problem.method
    if method not in ("aberth-ehrlich", "laguerre-deflation"):
        raise ValueError("unsupported polynomial-root method: " + method)
    if method == "aberth-ehrlich":
        reason = (
            "simultaneous Aberth--Ehrlich iteration avoids companion-matrix "
            "storage and routine deflation while retaining an ordinary-Python path"
        )
        fallback: dict[str, Any] = {
            "kind": "same-source",
            "method": "laguerre-deflation",
            "reason": "bounded rescue for a stalled simultaneous iteration",
        }
    else:
        reason = (
            "the caller explicitly requested bounded Laguerre iteration with "
            "synthetic deflation and final simultaneous polishing"
        )
        fallback = {"kind": "none"}
    return NumericalPlan(
        problem,
        method=method,
        backend="ordinary-python",
        reason=reason,
        capability={
            "coefficient_basis": "power",
            "coefficient_order": "descending",
            "numeric_types": ["real-binary64", "complex-binary64"],
            "maximum_degree": MAX_POLYNOMIAL_ROOT_DEGREE,
            "variable_scaling": "logarithmic-coefficient-envelope",
            "validation": [
                "coefficientwise-backward-error",
                "independent-vieta-reconstruction",
                "conjugate-symmetry-for-real-input",
            ],
            "multiplicity_policy": "numerical-clusters-only-never-certified",
            "platform_support": QUALIFIED_PLATFORM_SUPPORT,
        },
        expected_resources={
            "degree_bound": degree_bound,
            "working_complex_scalars": 5 * max(1, degree_bound) + 8,
            "iteration_complexity": "O(degree^2)",
            "max_iterations": problem.resource_budget.max_iterations,
            "max_evaluations": problem.resource_budget.max_evaluations,
            "max_elapsed_ms": problem.resource_budget.max_elapsed_ms,
        },
        fallback=fallback,
        rejected_alternatives=[
            {
                "method": "companion-matrix-eigenvalues",
                "reason": (
                    "a qualified LAPACK-class browser dependency is not yet part of "
                    "this domain; NumPy remains an independent differential oracle"
                ),
            },
            {
                "method": "durand-kerner",
                "reason": (
                    "Aberth's Newton correction generally converges faster and is "
                    "the better basis for condition-aware simultaneous iteration"
                ),
            },
            {
                "method": "multiprecision-mpsolve",
                "reason": (
                    "MPSolve is the preferred future rigorous/high-precision backend, "
                    "but no qualified browser/Windows pack is currently integrated"
                ),
            },
        ],
    )


class PolynomialRootsResult(NumericalResult):
    """Structured root set with finite JSON records and complex-number views."""

    @property
    def roots(self) -> tuple[complex, ...]:
        value = self.value
        if not isinstance(value, dict):
            return ()
        records = value.get("roots")
        if not isinstance(records, list):
            return ()
        answer: list[complex] = []
        for index in range(len(records)):
            record = records[index]
            if not isinstance(record, dict):
                raise TypeError("invalid root record")
            answer.append(_record_complex(record, "roots[" + str(index) + "]"))
        return tuple(answer)

    @property
    def clusters(self) -> tuple[dict[str, Any], ...]:
        value = self.value
        if not isinstance(value, dict):
            return ()
        clusters = value.get("clusters")
        if not isinstance(clusters, list):
            return ()
        return tuple(dict(cluster) for cluster in clusters if isinstance(cluster, dict))

    def explanation(self) -> dict[str, Any]:
        """Return a detached, structured account of the root computation."""
        value = self.value
        degree = 0
        maximum_backward_error: Any = None
        maximum_condition: Any = None
        if isinstance(value, dict):
            degree = int(value.get("degree", 0))
            maximum_backward_error = value.get("maximum_backward_error")
            maximum_condition = value.get("maximum_relative_condition")
        answer = {
            "schema": "sagejs.numerics.approximation.polynomial-roots.explanation/v1",
            "operation": self.problem.operation,
            "method": self.method,
            "outcome": {
                "success": self.success,
                "status": self.status,
                "truth_level": self.validation.truth_level,
                "validation_passed": self.validation.passed,
                "stop_reason": (
                    value.get("stop_reason") if isinstance(value, dict) else None
                ),
            },
            "construction": {
                "representation": "finite-complex-root-set",
                "degree": degree,
                "root_count": len(self.roots),
                "multiplicity_certified": (
                    value.get("multiplicity_certified")
                    if isinstance(value, dict)
                    else False
                ),
                "clusters": list(self.clusters),
            },
            "numerical_indicators": {
                "maximum_coefficientwise_backward_error": maximum_backward_error,
                "maximum_relative_condition_estimate": maximum_condition,
                "vieta_reconstruction_error": (
                    value.get("vieta_reconstruction_error")
                    if isinstance(value, dict)
                    else None
                ),
            },
            "validation": self.validation.to_dict(),
            "diagnostics": [item.to_dict() for item in self.diagnostics],
            "resources": {
                "iterations": self.iterations,
                "evaluations": self.evaluations,
                "budget": self.problem.resource_budget.to_dict(),
                "trace_policy": self.problem.trace_policy.to_dict(),
            },
            "semantic_trace": self.trace.to_dict(),
            "guidance": [
                "Interpret close roots as numerical clusters, never as certified multiplicities.",
                "Use the backward-error and Vieta checks before treating the root set as accepted.",
            ],
        }
        detached = materialize_json(answer)
        if not isinstance(detached, dict):
            raise TypeError("polynomial-roots explanation must be an object")
        return detached

    def explain(self) -> str:
        """Render the structured root explanation as concise plain text."""
        value = self.value
        degree = int(value.get("degree", 0)) if isinstance(value, dict) else 0
        maximum_backward_error = (
            value.get("maximum_backward_error") if isinstance(value, dict) else None
        )
        maximum_condition = (
            value.get("maximum_relative_condition") if isinstance(value, dict) else None
        )
        lines = [
            self.method + " polynomial roots (degree " + str(degree) + ")",
            "status: " + self.status,
            "validation: "
            + self.validation.truth_level
            + ("; passed" if self.validation.passed else "; not passed"),
        ]
        if maximum_backward_error is not None:
            lines.append(
                "maximum coefficientwise backward error: " + str(maximum_backward_error)
            )
        if maximum_condition is not None:
            lines.append(
                "maximum relative condition estimate: " + str(maximum_condition)
            )
        if isinstance(value, dict) and value.get("multiplicity_certified") is False:
            lines.append(
                "multiplicity: not certified; close roots are reported only as numerical clusters"
            )
        for diagnostic in self.diagnostics:
            lines.append("diagnostic: " + diagnostic.code)
        return "\n".join(lines)

    def to_plot_spec(self) -> PlotSpec:
        """Return a bounded complex-plane PlotSpec without renderer coupling."""
        return _polynomial_roots_plot_spec(self)

    def to_animation(self, *, max_frames: int = 32) -> PlotAnimation:
        """Return a bounded semantic animation of root-set construction."""
        return _polynomial_roots_animation(self, max_frames=max_frames)


def _root_plot_alt_text(result: PolynomialRootsResult, visible: int) -> str:
    if not result.success:
        return (
            "Polynomial root computation failed using "
            + result.method
            + "; status "
            + result.status
        )
    return (
        "Complex-plane scatter plot showing "
        + str(visible)
        + " of "
        + str(len(result.roots))
        + " validated polynomial roots; numerical clusters do not certify multiplicity"
    )


def _polynomial_roots_plot_spec(
    result: PolynomialRootsResult,
    *,
    visible_roots: int | None = None,
    show_failure: bool = True,
    constructor: str = "PolynomialRootsResult.to_plot_spec",
) -> PlotSpec:
    from sagejs.plotting import PlotSpec, Provenance, make_layer

    roots = result.roots
    count = len(roots) if visible_roots is None else visible_roots
    if count < 0 or count > len(roots):
        raise ValueError("visible root count is outside the computed root set")
    provenance = Provenance(
        "sagejs.numerics.approximation.polynomial_roots",
        source_language=str(result.problem.source_intent.get("language", "python")),
        constructor=constructor,
        sampling={"visible_roots": count},
        approximations=[
            {
                "operation": "polynomial_roots",
                "method": result.method,
                "truth_level": result.validation.truth_level,
                "validation_passed": result.validation.passed,
            }
        ],
        metadata={
            "problem_digest": result.problem.digest,
            "status": result.status,
            "trace_truncated": result.trace.truncated,
            "multiplicity_certified": False,
        },
    )
    if not result.success:
        message = "planned " + result.method
        if show_failure:
            message = "status: " + result.status
        layer = make_layer(
            "text",
            {"position": [0.0, 0.0], "text": message},
            ordinal=0,
            namespace="polynomial-roots",
            source_intent={"operation": "polynomial_roots", "role": "failure"},
            style={"color": "#a23b3b", "font_size": 16},
        )
        axes = {"x": {"label": ""}, "y": {"label": ""}}
    else:
        visible = roots[:count]
        layer = make_layer(
            "point",
            {
                "x": [float(root.real) for root in visible],
                "y": [float(root.imag) for root in visible],
            },
            ordinal=0,
            namespace="polynomial-roots",
            source_intent={"operation": "polynomial_roots", "role": "validated-roots"},
            style={"color": "#3366cc", "size": 9, "symbol": "circle"},
            legend={"label": "validated roots", "show": True},
        )
        axes = {
            "x": {"label": "real part", "scale": "linear"},
            "y": {"label": "imaginary part", "scale": "linear"},
        }
    return PlotSpec(
        2,
        [layer],
        axes_or_scene=axes,
        viewport={"responsive": True, "equal_aspect": True},
        annotations=[{"kind": "alt_text", "text": _root_plot_alt_text(result, count)}],
        provenance=provenance,
    )


def _bounded_root_counts(total: int, maximum: int) -> list[int]:
    if total == 0:
        return [0, 0]
    frame_count = min(total, maximum)
    if frame_count == 1:
        return [total, total]
    answer: list[int] = []
    for index in range(frame_count):
        count = 1 + round(index * (total - 1) / (frame_count - 1))
        if not answer or answer[-1] != count:
            answer.append(count)
    return answer if len(answer) > 1 else [answer[0], answer[0]]


def _polynomial_roots_animation(
    result: PolynomialRootsResult, *, max_frames: int
) -> PlotAnimation:
    from sagejs.plotting import (
        AnimationFrame,
        AnimationResourceLimits,
        AnimationTiming,
        PlotAnimation,
        stable_frame_id,
    )

    if isinstance(max_frames, bool) or not isinstance(max_frames, int):
        raise TypeError("polynomial-root max_frames must be an integer")
    if max_frames < 2 or max_frames > 64:
        raise ValueError("polynomial-root max_frames must be between 2 and 64")
    counts = (
        _bounded_root_counts(len(result.roots), max_frames)
        if result.success
        else [0, 0]
    )
    frames: list[AnimationFrame] = []
    for index in range(len(counts)):
        count = counts[index]
        frames.append(
            AnimationFrame(
                stable_frame_id(index),
                _polynomial_roots_plot_spec(
                    result,
                    visible_roots=count,
                    show_failure=index > 0,
                    constructor="PolynomialRootsResult.to_animation",
                ),
                label=(
                    "roots " + str(count) + "/" + str(len(result.roots))
                    if result.success
                    else ("planned " + result.method if index == 0 else result.status)
                ),
                metadata={
                    "visible_roots": count,
                    "trace_truncated": result.trace.truncated,
                },
            )
        )
    return PlotAnimation(
        frames,
        timing=AnimationTiming(frame_duration_ms=350, transition_duration_ms=0),
        limits=AnimationResourceLimits(
            max_frames=64,
            max_layers_per_frame=1,
            max_total_samples=4096,
            max_payload_bytes=2 * 1024 * 1024,
            max_duration_ms=64 * 350,
        ),
        metadata={
            "operation": "polynomial_roots",
            "method": result.method,
            "status": result.status,
            "problem_digest": result.problem.digest,
            "presentation_limits": {
                "requested_max_frames": max_frames,
                "hard_max_frames": 64,
                "hard_max_total_samples": 4096,
                "hard_max_payload_bytes": 2 * 1024 * 1024,
            },
        },
    )


def _count_polynomial_evaluation(execution: ApproximationExecution) -> None:
    execution.check()
    if execution.evaluations >= execution.problem.resource_budget.max_evaluations:
        raise ApproximationStopped("maximum_evaluations")
    execution.evaluations += 1


def _horner_with_derivatives(
    coefficients: Sequence[complex], point: complex, execution: ApproximationExecution
) -> tuple[complex, complex, complex]:
    _count_polynomial_evaluation(execution)
    value = coefficients[0]
    derivative = 0.0j
    second_half = 0.0j
    for index in range(1, len(coefficients)):
        second_half = second_half * point + derivative
        derivative = derivative * point + value
        value = value * point + coefficients[index]
    return value, derivative, 2.0 * second_half


def _backward_error_and_condition(
    coefficients: Sequence[complex], point: complex
) -> tuple[float, float]:
    """Return a log-scaled residual and relative root condition estimate.

    This is deliberately independent of the solver's Horner recurrence.  Each
    term is scaled by the largest logarithmic term magnitude before summation,
    so coefficients and roots separated by hundreds of decimal orders neither
    overflow nor disappear merely because a common coefficient normalization
    underflows.
    """
    degree = len(coefficients) - 1
    radius = _complex_magnitude(point)
    if radius == 0.0:
        constant_magnitude = _complex_magnitude(coefficients[-1])
        residual = 0.0 if constant_magnitude == 0.0 else 1.0
        return residual, _MAX_FINITE
    logarithmic_radius = math.log(radius)
    term_logs: list[float | None] = []
    maximum_log = -_MAX_FINITE
    for index in range(len(coefficients)):
        magnitude = _complex_magnitude(coefficients[index])
        if magnitude == 0.0:
            term_logs.append(None)
            continue
        exponent = degree - index
        logarithmic_magnitude = math.log(magnitude) + exponent * logarithmic_radius
        term_logs.append(logarithmic_magnitude)
        maximum_log = max(maximum_log, logarithmic_magnitude)
    if maximum_log == -_MAX_FINITE:
        return _MAX_FINITE, _MAX_FINITE
    point_phase = math.atan2(point.imag, point.real)
    value_scaled = 0.0j
    logarithmic_derivative_scaled = 0.0j
    denominator_scaled = 0.0
    for index in range(len(coefficients)):
        logarithmic_magnitude = term_logs[index]
        if logarithmic_magnitude is None:
            continue
        exponent = degree - index
        magnitude = math.exp(max(-745.0, logarithmic_magnitude - maximum_log))
        coefficient = coefficients[index]
        phase = math.atan2(coefficient.imag, coefficient.real) + exponent * point_phase
        term = complex(magnitude * math.cos(phase), magnitude * math.sin(phase))
        value_scaled += term
        denominator_scaled += magnitude
        if exponent > 0:
            logarithmic_derivative_scaled += exponent * term
    residual = _complex_magnitude(value_scaled) / max(
        denominator_scaled, _MAX_FINITE**-1
    )
    relative_condition = denominator_scaled / max(
        _complex_magnitude(logarithmic_derivative_scaled), _MAX_FINITE**-1
    )
    if not math.isfinite(residual):
        residual = _MAX_FINITE
    if not math.isfinite(relative_condition):
        relative_condition = _MAX_FINITE
    return min(_MAX_FINITE, residual), min(_MAX_FINITE, relative_condition)


def _trim_and_normalize(
    coefficients: list[complex],
) -> tuple[list[complex], int, int, float, list[complex]]:
    first = 0
    while first < len(coefficients) and coefficients[first] == 0.0j:
        first += 1
    if first == len(coefficients):
        return [], first, 0, 1.0, []
    trimmed = coefficients[first:]
    zero_roots = 0
    while len(trimmed) > 1 and trimmed[-1] == 0.0j:
        trimmed.pop()
        zero_roots += 1
    normalized = list(trimmed)
    degree = len(normalized) - 1
    if degree <= 0:
        return normalized, first, zero_roots, 1.0, normalized
    leading_magnitude = _complex_magnitude(normalized[0])
    leading_log = math.log(leading_magnitude)
    logarithmic_scale = -600.0
    found = False
    for index in range(1, len(normalized)):
        magnitude = _complex_magnitude(trimmed[index])
        if magnitude == 0.0:
            continue
        candidate = (math.log(magnitude) - leading_log) / index
        if not found or candidate > logarithmic_scale:
            logarithmic_scale = candidate
            found = True
    if not found:
        logarithmic_scale = 0.0
    logarithmic_scale = max(-709.0, min(709.0, logarithmic_scale))
    scale = math.exp(logarithmic_scale)
    leading_phase = math.atan2(trimmed[0].imag, trimmed[0].real)
    transformed: list[complex] = [1.0 + 0.0j]
    for index in range(1, len(normalized)):
        coefficient = trimmed[index]
        magnitude = _complex_magnitude(coefficient)
        if magnitude == 0.0:
            transformed.append(0.0j)
            continue
        log_magnitude = math.log(magnitude) - leading_log - index * logarithmic_scale
        transformed_magnitude = math.exp(max(-745.0, min(700.0, log_magnitude)))
        phase = math.atan2(coefficient.imag, coefficient.real) - leading_phase
        transformed.append(
            complex(
                transformed_magnitude * math.cos(phase),
                transformed_magnitude * math.sin(phase),
            )
        )
    return normalized, first, zero_roots, scale, transformed


def _initial_aberth_points(coefficients: Sequence[complex]) -> list[complex]:
    degree = len(coefficients) - 1
    radius = 1.0 + max(_complex_magnitude(value) for value in coefficients[1:])
    constant = coefficients[-1]
    phase = 0.0
    if constant != 0.0j:
        phase = (math.atan2((-constant).imag, (-constant).real)) / degree
    answer: list[complex] = []
    for index in range(degree):
        fraction = 0.5 if degree == 1 else ((37 * index) % degree) / (degree - 1)
        local_radius = radius * (0.82 + 0.30 * fraction)
        angle = phase + _TWO_PI * (index + 0.5) / degree
        answer.append(
            complex(local_radius * math.cos(angle), local_radius * math.sin(angle))
        )
    return answer


def _aberth_iterations(
    coefficients: Sequence[complex],
    roots: list[complex],
    execution: ApproximationExecution,
    *,
    maximum_sweeps: int,
    absolute_tolerance: float,
    relative_tolerance: float,
) -> tuple[list[complex], bool, float]:
    degree = len(roots)
    last_step = _MAX_FINITE
    backward_gate = max(256.0 * MACHINE_EPSILON * (degree + 1), relative_tolerance)
    for _ in range(maximum_sweeps):
        execution.step()
        corrections: list[complex] = []
        maximum_step = 0.0
        maximum_residual = 0.0
        for index in range(degree):
            execution.check()
            point = roots[index]
            value, derivative, _ = _horner_with_derivatives(
                coefficients, point, execution
            )
            derivative_magnitude = _complex_magnitude(derivative)
            if derivative_magnitude == 0.0 or not math.isfinite(derivative_magnitude):
                corrections.append(0.0j)
                maximum_step = _MAX_FINITE
                continue
            newton = _divide_complex(value, derivative)
            repulsion = 0.0j
            collision = False
            for other_index in range(degree):
                if other_index == index:
                    continue
                difference = point - roots[other_index]
                distance = _complex_magnitude(difference)
                if distance <= 32.0 * MACHINE_EPSILON * max(
                    1.0, _complex_magnitude(point)
                ):
                    collision = True
                    break
                repulsion += _divide_complex(1.0 + 0.0j, difference)
            if collision:
                angle = _TWO_PI * (index + execution.iterations) / max(1, degree)
                correction = complex(math.cos(angle), math.sin(angle)) * (
                    64.0 * MACHINE_EPSILON * max(1.0, _complex_magnitude(point))
                )
            else:
                denominator = 1.0 - newton * repulsion
                if _complex_magnitude(denominator) <= 32.0 * MACHINE_EPSILON:
                    correction = newton
                else:
                    correction = _divide_complex(newton, denominator)
            if not math.isfinite(correction.real) or not math.isfinite(correction.imag):
                corrections.append(0.0j)
                maximum_step = _MAX_FINITE
                continue
            corrections.append(correction)
            maximum_step = max(maximum_step, _complex_magnitude(correction))
            residual, _condition = _backward_error_and_condition(coefficients, point)
            maximum_residual = max(maximum_residual, residual)
        for index in range(degree):
            roots[index] -= corrections[index]
        last_step = maximum_step
        execution.trace.append(
            "iteration",
            iteration=execution.iterations,
            data={
                "phase": "aberth-ehrlich",
                "maximum_step": maximum_step,
                "maximum_backward_error": maximum_residual,
            },
        )
        scale = max(1.0, max(_complex_magnitude(root) for root in roots))
        metrics = [_backward_error_and_condition(coefficients, root) for root in roots]
        maximum_checked_residual = max((metric[0] for metric in metrics), default=0.0)
        maximum_condition = max((metric[1] for metric in metrics), default=0.0)
        vieta_error = _vieta_error(coefficients, roots)
        vieta_gate = max(
            100.0 * relative_tolerance,
            4096.0 * MACHINE_EPSILON * (degree + 1) ** 2,
            min(1.0e-4, 64.0 * MACHINE_EPSILON * maximum_condition),
        )
        # Distinct, well-conditioned roots terminate on the usual step test.
        # Multiple or unresolved clustered roots cannot satisfy such a forward
        # test in binary64.  For those, terminate only when both independent
        # backward checks support the *whole root set*.  This does not certify
        # multiplicity or a forward error and is labeled that way in the result.
        step_passed = maximum_step <= max(
            absolute_tolerance, relative_tolerance * scale
        )
        root_set_passed = (
            maximum_checked_residual <= backward_gate and vieta_error <= vieta_gate
        )
        if root_set_passed and (step_passed or execution.iterations >= 4):
            return roots, True, last_step
    return roots, False, last_step


def _laguerre_root(
    coefficients: Sequence[complex],
    initial: complex,
    execution: ApproximationExecution,
    maximum_updates: int,
    absolute_tolerance: float,
    relative_tolerance: float,
) -> tuple[complex, bool]:
    degree = len(coefficients) - 1
    point = initial
    for update in range(maximum_updates):
        execution.step()
        value, derivative, second = _horner_with_derivatives(
            coefficients, point, execution
        )
        value_magnitude = _complex_magnitude(value)
        if value_magnitude == 0.0:
            return point, True
        first_ratio = _divide_complex(derivative, value)
        second_ratio = first_ratio * first_ratio - _divide_complex(second, value)
        radical = cmath.sqrt(
            (degree - 1) * (degree * second_ratio - first_ratio * first_ratio)
        )
        plus = first_ratio + radical
        minus = first_ratio - radical
        denominator = (
            plus if _complex_magnitude(plus) >= _complex_magnitude(minus) else minus
        )
        if denominator == 0.0j:
            angle = _TWO_PI * (update + 1) / (maximum_updates + 1)
            correction = complex(math.cos(angle), math.sin(angle)) * (
                1.0 + _complex_magnitude(point)
            )
        else:
            correction = _divide_complex(complex(degree, 0.0), denominator)
        if not math.isfinite(correction.real) or not math.isfinite(correction.imag):
            return point, False
        point -= correction
        execution.trace.append(
            "iteration",
            iteration=execution.iterations,
            data={
                "phase": "laguerre",
                "active_degree": degree,
                "step": _complex_magnitude(correction),
            },
        )
        if _complex_magnitude(correction) <= max(
            absolute_tolerance,
            relative_tolerance * max(1.0, _complex_magnitude(point)),
        ):
            residual, _condition = _backward_error_and_condition(coefficients, point)
            if residual <= max(
                512.0 * MACHINE_EPSILON * (degree + 1), relative_tolerance
            ):
                return point, True
    return point, False


def _synthetic_deflate(
    coefficients: Sequence[complex], root: complex
) -> tuple[list[complex], complex]:
    quotient = [coefficients[0]]
    for index in range(1, len(coefficients) - 1):
        quotient.append(coefficients[index] + quotient[-1] * root)
    remainder = coefficients[-1] + quotient[-1] * root
    return quotient, remainder


def _laguerre_all(
    coefficients: Sequence[complex],
    execution: ApproximationExecution,
    absolute_tolerance: float,
    relative_tolerance: float,
    seeds: Sequence[complex] | None = None,
) -> tuple[list[complex], bool]:
    working = list(coefficients)
    roots: list[complex] = []
    degree = len(working) - 1
    remaining_iterations = max(
        0, execution.problem.resource_budget.max_iterations - execution.iterations
    )
    updates_per_root = max(4, min(40, remaining_iterations // max(1, degree)))
    for root_index in range(degree):
        execution.check()
        active_degree = len(working) - 1
        if active_degree == 1:
            root = _divide_complex(-working[1], working[0])
            converged = True
        else:
            if seeds is not None and root_index < len(seeds):
                initial = seeds[root_index]
            else:
                angle = _TWO_PI * (root_index + 0.5) / max(1, degree)
                initial = complex(math.cos(angle), math.sin(angle))
            root, converged = _laguerre_root(
                working,
                initial,
                execution,
                updates_per_root,
                absolute_tolerance,
                relative_tolerance,
            )
        if not converged:
            return roots, False
        roots.append(root)
        working, remainder = _synthetic_deflate(working, root)
        if not math.isfinite(remainder.real) or not math.isfinite(remainder.imag):
            return roots, False
    return roots, True


def _quadratic_roots(coefficients: Sequence[complex]) -> list[complex]:
    leading, linear, constant = coefficients
    discriminant = cmath.sqrt(linear * linear - 4.0 * leading * constant)
    candidate_a = -linear + discriminant
    candidate_b = -linear - discriminant
    numerator = (
        candidate_a
        if _complex_magnitude(candidate_a) >= _complex_magnitude(candidate_b)
        else candidate_b
    )
    q_value = 0.5 * numerator
    if q_value == 0.0j:
        root = _divide_complex(-linear, 2.0 * leading)
        return [root, root]
    return [
        _divide_complex(q_value, leading),
        _divide_complex(constant, q_value),
    ]


def _is_real_polynomial(coefficients: Sequence[complex]) -> bool:
    return all(value.imag == 0.0 for value in coefficients)


def _restore_conjugate_symmetry(roots: list[complex]) -> list[complex]:
    answer = list(roots)
    used: set[int] = set()
    for index in range(len(answer)):
        if index in used:
            continue
        root = answer[index]
        scale = max(_MIN_NORMAL, _complex_magnitude(root))
        if abs(root.imag) <= 256.0 * MACHINE_EPSILON * abs(root.real):
            answer[index] = complex(root.real, 0.0)
            used.add(index)
            continue
        best_index = -1
        best_distance = _MAX_FINITE
        target = root.conjugate()
        for other_index in range(index + 1, len(answer)):
            if other_index in used:
                continue
            distance = _complex_magnitude(answer[other_index] - target)
            if distance < best_distance:
                best_distance = distance
                best_index = other_index
        if best_index >= 0 and best_distance <= 1.0e-7 * scale:
            other = answer[best_index]
            real = 0.5 * root.real + 0.5 * other.real
            imaginary = 0.5 * abs(root.imag) + 0.5 * abs(other.imag)
            if root.imag < 0.0:
                answer[index] = complex(real, -imaginary)
                answer[best_index] = complex(real, imaginary)
            else:
                answer[index] = complex(real, imaginary)
                answer[best_index] = complex(real, -imaginary)
            used.add(index)
            used.add(best_index)
    return answer


def _vieta_error(coefficients: Sequence[complex], roots: Sequence[complex]) -> float:
    reconstructed: list[complex] = [1.0 + 0.0j]
    for root in roots:
        next_coefficients = [0.0j] * (len(reconstructed) + 1)
        for index in range(len(reconstructed)):
            next_coefficients[index] += reconstructed[index]
            next_coefficients[index + 1] -= root * reconstructed[index]
        reconstructed = next_coefficients
    maximum = 0.0
    for index in range(len(coefficients)):
        target = coefficients[index]
        difference = _complex_magnitude(reconstructed[index] - target)
        denominator = max(1.0, _complex_magnitude(target))
        maximum = max(maximum, difference / denominator)
    return min(_MAX_FINITE, maximum)


def _sort_roots(roots: Sequence[complex]) -> list[complex]:
    return sorted(roots, key=lambda value: (float(value.real), float(value.imag)))


def _cluster_records(
    roots: Sequence[complex], conditions: Sequence[float]
) -> list[dict[str, Any]]:
    count = len(roots)
    parent = list(range(count))

    def find(index: int) -> int:
        while parent[index] != index:
            parent[index] = parent[parent[index]]
            index = parent[index]
        return index

    def union(left: int, right: int) -> None:
        left_root = find(left)
        right_root = find(right)
        if left_root != right_root:
            parent[right_root] = left_root

    def uncertainty(condition: float) -> float:
        first_order = 8.0 * math.sqrt(MACHINE_EPSILON * max(1.0, condition))
        # A first-order estimate understates the observed splitting of a
        # nearly multiple root: an m-fold root responds like perturbation^(1/m).
        # This broad envelope is used only after the condition estimate is
        # already catastrophic, and it never certifies multiplicity.
        if condition >= 1.0e8:
            return min(2.5e-1, max(5.0e-2, first_order))
        return min(5.0e-2, max(1.0e-7, first_order))

    for left in range(count):
        left_uncertainty = uncertainty(conditions[left])
        for right in range(left + 1, count):
            right_uncertainty = uncertainty(conditions[right])
            scale = max(
                _MIN_NORMAL,
                _complex_magnitude(roots[left]),
                _complex_magnitude(roots[right]),
            )
            if (
                _complex_magnitude(roots[left] - roots[right])
                <= max(left_uncertainty, right_uncertainty) * scale
            ):
                union(left, right)
    groups: dict[int, list[int]] = {}
    for index in range(count):
        representative = find(index)
        if representative not in groups:
            groups[representative] = []
        groups[representative].append(index)
    records: list[dict[str, Any]] = []
    for indices in groups.values():
        center = _complex_mean([roots[index] for index in indices])
        radius = max(
            (_complex_magnitude(roots[index] - center) for index in indices),
            default=0.0,
        )
        records.append(
            {
                "indices": indices,
                "size": len(indices),
                "center": _complex_record(center),
                "radius": radius,
                "classification": (
                    "isolated_numerical_root"
                    if len(indices) == 1
                    else "numerical_cluster_not_certified_multiplicity"
                ),
            }
        )
    return records


def _polish_unresolved_clusters(
    coefficients: Sequence[complex],
    roots: list[complex],
    relative_tolerance: float,
) -> list[complex]:
    """Collapse only numerically unresolved clusters when evidence improves.

    The replacement is accepted only when it improves the complete Vieta
    reconstruction and preserves every root's coefficientwise residual. It is
    a numerical representative of an unresolved cluster, not a multiplicity
    claim.
    """
    if len(roots) <= 1:
        return roots
    metrics = [_backward_error_and_condition(coefficients, root) for root in roots]
    conditions = [metric[1] for metric in metrics]
    clusters = _cluster_records(roots, conditions)
    severe_indices: list[int] = []
    candidate = list(roots)
    for cluster in clusters:
        indices_value = cluster.get("indices")
        if not isinstance(indices_value, list) or len(indices_value) <= 1:
            continue
        indices = [int(index) for index in indices_value]
        if max(conditions[index] for index in indices) < 1.0e8:
            continue
        center = _complex_mean([roots[index] for index in indices])
        for index in indices:
            candidate[index] = center
            severe_indices.append(index)
    if len(severe_indices) == 0:
        return roots
    target_sum = -coefficients[1]
    correction = _divide_complex_by_real(
        target_sum - sum(candidate, 0.0j), len(severe_indices)
    )
    for index in severe_indices:
        candidate[index] += correction
    old_vieta = _vieta_error(coefficients, roots)
    new_vieta = _vieta_error(coefficients, candidate)
    backward_gate = max(
        relative_tolerance,
        256.0 * MACHINE_EPSILON * (len(coefficients)),
    )
    new_residual = max(
        (_backward_error_and_condition(coefficients, root)[0] for root in candidate),
        default=0.0,
    )
    if new_vieta < old_vieta and new_residual <= backward_gate:
        return candidate
    return roots


def _make_result(
    problem: NumericalProblem,
    plan: NumericalPlan,
    execution: ApproximationExecution,
    *,
    roots: Sequence[complex],
    effective_degree: int,
    leading_zero_count: int,
    exact_zero_roots: int,
    scale: float,
    success: bool,
    status: str,
    validation: NumericalValidation,
    backward_errors: Sequence[float] = (),
    conditions: Sequence[float] = (),
    vieta_error: float | None = None,
    diagnostics: Sequence[NumericalDiagnostic] = (),
    solver_converged: bool = False,
    stop_reason: str | None = None,
) -> PolynomialRootsResult:
    sorted_roots = _sort_roots(roots)
    sorted_metrics = (
        sorted(
            zip(roots, backward_errors, conditions, strict=True),
            key=lambda item: (float(item[0].real), float(item[0].imag)),
        )
        if len(backward_errors) == len(roots) and len(conditions) == len(roots)
        else []
    )
    if sorted_metrics:
        sorted_backward_errors = [float(item[1]) for item in sorted_metrics]
        sorted_conditions = [float(item[2]) for item in sorted_metrics]
    else:
        sorted_backward_errors = [float(value) for value in backward_errors]
        sorted_conditions = [float(value) for value in conditions]
    clusters = (
        _cluster_records(sorted_roots, sorted_conditions)
        if len(sorted_conditions) == len(sorted_roots)
        else []
    )
    model: dict[str, Any] = {
        "kind": "polynomial_root_set",
        "degree": effective_degree,
        "roots": [_complex_record(root) for root in sorted_roots],
        "root_backward_errors": sorted_backward_errors,
        "root_relative_condition_estimates": sorted_conditions,
        "maximum_backward_error": max(sorted_backward_errors, default=0.0),
        "maximum_relative_condition": max(sorted_conditions, default=0.0),
        "vieta_reconstruction_error": vieta_error,
        "clusters": clusters,
        "multiplicity_certified": False,
        "leading_zero_coefficients_ignored": leading_zero_count,
        "exact_zero_roots": exact_zero_roots,
        "variable_scale": scale,
        "solver_converged": solver_converged,
    }
    payload: dict[str, Any] = {
        "root_count": len(sorted_roots),
        "multiplicity_policy": "numerical-clusters-only-never-certified",
    }
    if stop_reason is not None:
        payload["stop_reason"] = stop_reason
    return PolynomialRootsResult(
        problem,
        plan,
        success=success,
        status=status,
        value=model,
        validation=validation,
        diagnostics=diagnostics,
        iterations=execution.iterations,
        evaluations=execution.evaluations,
        elapsed_ms=execution.elapsed_ms(),
        trace=execution.trace,
        measurements={
            "effective_degree": effective_degree,
            "working_complex_scalars": 5 * max(1, effective_degree) + 8,
        },
        provenance={
            "implementation": "ordinary CPython-parseable Python",
            "numeric_type": "IEEE-754 complex binary64",
            "source_family": "sagejs.numerics.approximation.polynomial_roots",
            "primary_algorithm": "Aberth--Ehrlich",
            "rescue_algorithm": "Laguerre with synthetic deflation",
        },
        domain_payload=payload,
    )


def _failed_result(
    problem: NumericalProblem,
    plan: NumericalPlan,
    execution: ApproximationExecution,
    status: str,
    *,
    roots: Sequence[complex] = (),
    effective_degree: int = 0,
    leading_zero_count: int = 0,
    exact_zero_roots: int = 0,
    scale: float = 1.0,
) -> PolynomialRootsResult:
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
    return _make_result(
        problem,
        plan,
        execution,
        roots=roots,
        effective_degree=effective_degree,
        leading_zero_count=leading_zero_count,
        exact_zero_roots=exact_zero_roots,
        scale=scale,
        success=False,
        status=public_status,
        validation=NumericalValidation(
            "indeterminate",
            False,
            checks=[{"kind": "execution_completed", "passed": False}],
        ),
        diagnostics=diagnostics,
        solver_converged=False,
        stop_reason=status,
    )


def solve_polynomial_roots_problem(
    problem: NumericalProblem,
    *,
    cancel: Callable[[], bool] | None = None,
) -> PolynomialRootsResult:
    """Compute roots and accept them only after independent validation."""
    plan = plan_polynomial_roots(problem)
    trace = NumericalTrace(problem.trace_policy)
    execution = ApproximationExecution(problem, trace, cancel)
    trace.append(
        "start",
        data={"operation": problem.operation, "method": plan.method},
        important=True,
        force=True,
    )
    coefficients = _decode_coefficients(problem)
    normalized: list[complex] = []
    leading_zero_count = 0
    exact_zero_roots = 0
    scale = 1.0
    effective_degree = 0
    roots: list[complex] = []
    try:
        execution.check()
        normalized, leading_zero_count, exact_zero_roots, scale, transformed = (
            _trim_and_normalize(coefficients)
        )
        if len(normalized) == 0:
            trace.append(
                "failure",
                data={"reason": "zero_polynomial_has_indeterminate_root_set"},
                important=True,
                force=True,
            )
            return _failed_result(problem, plan, execution, "invalid_problem")
        effective_degree = len(normalized) - 1 + exact_zero_roots
        validation_coefficients = coefficients[leading_zero_count:]
        core_degree = len(normalized) - 1
        if core_degree == 0:
            roots = [0.0j] * exact_zero_roots
            validation = NumericalValidation(
                "exact",
                True,
                checks=[
                    {"kind": "constant_or_monomial_root_set", "passed": True},
                    {"kind": "root_count", "passed": len(roots) == effective_degree},
                ],
                residual=0.0,
                error_estimate=0.0,
                condition_estimate=None,
            )
            trace.append(
                "finish",
                data={"status": "converged", "success": True, "root_count": len(roots)},
                important=True,
                force=True,
            )
            return _make_result(
                problem,
                plan,
                execution,
                roots=roots,
                effective_degree=effective_degree,
                leading_zero_count=leading_zero_count,
                exact_zero_roots=exact_zero_roots,
                scale=scale,
                success=True,
                status="converged",
                validation=validation,
                backward_errors=[0.0] * len(roots),
                conditions=[0.0] * len(roots),
                vieta_error=0.0,
                solver_converged=True,
            )
        relative_tolerance = float(problem.tolerances.get("relative", 1.0e-12))
        absolute_tolerance = float(problem.tolerances.get("absolute", 0.0))
        scaled_absolute_tolerance = absolute_tolerance / scale
        if not math.isfinite(scaled_absolute_tolerance):
            scaled_absolute_tolerance = _MAX_FINITE
        solver_converged = False
        scaled_roots: list[complex]
        if core_degree == 1:
            scaled_roots = [-transformed[1]]
            solver_converged = True
        elif core_degree == 2:
            scaled_roots = _quadratic_roots(transformed)
            solver_converged = True
        elif plan.method == "laguerre-deflation":
            scaled_roots, solver_converged = _laguerre_all(
                transformed,
                execution,
                scaled_absolute_tolerance,
                relative_tolerance,
            )
            if solver_converged:
                remaining = max(
                    0,
                    problem.resource_budget.max_iterations - execution.iterations,
                )
                if remaining > 0:
                    scaled_roots, polished, _step = _aberth_iterations(
                        transformed,
                        scaled_roots,
                        execution,
                        maximum_sweeps=min(16, remaining),
                        absolute_tolerance=scaled_absolute_tolerance,
                        relative_tolerance=relative_tolerance,
                    )
                    solver_converged = solver_converged and polished
        else:
            scaled_roots = _initial_aberth_points(transformed)
            primary_sweeps = min(
                160,
                max(8, problem.resource_budget.max_iterations // 2),
            )
            scaled_roots, solver_converged, _step = _aberth_iterations(
                transformed,
                scaled_roots,
                execution,
                maximum_sweeps=primary_sweeps,
                absolute_tolerance=scaled_absolute_tolerance,
                relative_tolerance=relative_tolerance,
            )
            if not solver_converged:
                trace.append(
                    "phase",
                    data={
                        "from": "aberth-ehrlich",
                        "to": "laguerre-deflation",
                        "reason": "simultaneous_iteration_stalled",
                    },
                    diagnostics=[NumericalDiagnostic("backend_fallback")],
                    important=True,
                    force=True,
                )
                laguerre_roots, laguerre_converged = _laguerre_all(
                    transformed,
                    execution,
                    scaled_absolute_tolerance,
                    relative_tolerance,
                    seeds=scaled_roots,
                )
                if laguerre_converged and len(laguerre_roots) == core_degree:
                    scaled_roots = laguerre_roots
                    remaining = max(
                        0,
                        problem.resource_budget.max_iterations - execution.iterations,
                    )
                    if remaining > 0:
                        scaled_roots, polished, _step = _aberth_iterations(
                            transformed,
                            scaled_roots,
                            execution,
                            maximum_sweeps=min(20, remaining),
                            absolute_tolerance=scaled_absolute_tolerance,
                            relative_tolerance=relative_tolerance,
                        )
                        solver_converged = polished
                    else:
                        solver_converged = laguerre_converged
        if len(scaled_roots) != core_degree:
            return _failed_result(
                problem,
                plan,
                execution,
                "stagnation",
                effective_degree=effective_degree,
                leading_zero_count=leading_zero_count,
                exact_zero_roots=exact_zero_roots,
                scale=scale,
            )
        scaled_roots = _polish_unresolved_clusters(
            transformed, scaled_roots, relative_tolerance
        )
        core_roots: list[complex] = []
        for scaled_root in scaled_roots:
            root = scaled_root * scale
            if not math.isfinite(root.real) or not math.isfinite(root.imag):
                raise ApproximationStopped("validation_failed")
            core_roots.append(root)
        roots.extend(core_roots)
        roots.extend([0.0j] * exact_zero_roots)
        if _is_real_polynomial(normalized):
            roots = _restore_conjugate_symmetry(roots)
        backward_errors: list[float] = []
        conditions: list[float] = []
        for root in roots:
            execution.check()
            residual, condition = _backward_error_and_condition(
                validation_coefficients, root
            )
            backward_errors.append(residual)
            conditions.append(condition)
        core_vieta_error = _vieta_error(
            transformed,
            [_divide_complex_by_real(root, scale) for root in core_roots],
        )
        maximum_backward_error = max(backward_errors, default=0.0)
        maximum_condition = max(conditions, default=0.0)
        backward_gate = max(
            relative_tolerance,
            256.0 * MACHINE_EPSILON * (effective_degree + 1),
        )
        vieta_gate = max(
            100.0 * relative_tolerance,
            4096.0 * MACHINE_EPSILON * (effective_degree + 1) ** 2,
        )
        root_count_passed = len(roots) == effective_degree
        backward_passed = maximum_backward_error <= backward_gate
        vieta_passed = core_vieta_error <= vieta_gate
        validation_passed = root_count_passed and backward_passed and vieta_passed
        checks = [
            {
                "kind": "coefficientwise_backward_error",
                "passed": backward_passed,
                "maximum": maximum_backward_error,
                "tolerance": backward_gate,
                "interpretation": "small residual relative to coefficient magnitudes at each root",
            },
            {
                "kind": "vieta_reconstruction",
                "passed": vieta_passed,
                "maximum_normalized_coefficient_error": core_vieta_error,
                "tolerance": vieta_gate,
            },
            {
                "kind": "root_count",
                "passed": root_count_passed,
                "expected": effective_degree,
                "observed": len(roots),
            },
            {
                "kind": "multiplicity",
                "passed": False,
                "note": "binary64 clusters do not certify algebraic multiplicity",
            },
        ]
        diagnostics: list[NumericalDiagnostic] = []
        if maximum_condition >= 1.0e5:
            diagnostics.append(
                NumericalDiagnostic(
                    "ill_conditioned",
                    details={"maximum_relative_condition_estimate": maximum_condition},
                )
            )
        if not validation_passed:
            diagnostics.append(
                NumericalDiagnostic(
                    "validation_failed",
                    details={
                        "maximum_backward_error": maximum_backward_error,
                        "vieta_reconstruction_error": core_vieta_error,
                    },
                )
            )
        if not solver_converged:
            diagnostics.append(NumericalDiagnostic("stagnation"))
        success = solver_converged and validation_passed
        status = (
            "converged"
            if success
            else ("stagnation" if not solver_converged else "validation_failed")
        )
        truth_level = "validated_approximate" if validation_passed else "indeterminate"
        validation = NumericalValidation(
            truth_level,
            validation_passed,
            checks=checks,
            residual=maximum_backward_error,
            error_estimate=None,
            condition_estimate=maximum_condition,
        )
        trace.append(
            "validation",
            data={
                "passed": validation_passed,
                "maximum_backward_error": maximum_backward_error,
                "vieta_reconstruction_error": core_vieta_error,
                "maximum_relative_condition_estimate": maximum_condition,
            },
            diagnostics=diagnostics,
            important=True,
            force=True,
        )
        trace.append(
            "finish",
            data={"status": status, "success": success, "root_count": len(roots)},
            diagnostics=diagnostics,
            important=True,
            force=True,
        )
        return _make_result(
            problem,
            plan,
            execution,
            roots=roots,
            effective_degree=effective_degree,
            leading_zero_count=leading_zero_count,
            exact_zero_roots=exact_zero_roots,
            scale=scale,
            success=success,
            status=status,
            validation=validation,
            backward_errors=backward_errors,
            conditions=conditions,
            vieta_error=core_vieta_error,
            diagnostics=diagnostics,
            solver_converged=solver_converged,
        )
    except ApproximationStopped as stopped:
        return _failed_result(
            problem,
            plan,
            execution,
            stopped.status,
            roots=roots,
            effective_degree=effective_degree,
            leading_zero_count=leading_zero_count,
            exact_zero_roots=exact_zero_roots,
            scale=scale,
        )


def polynomial_roots(
    coefficients: Sequence[Any],
    *,
    order: str = "descending",
    method: str = "auto",
    atol: float = 0.0,
    rtol: float = 1.0e-12,
    resource_budget: ResourceBudget | None = None,
    trace: str | TracePolicy = "summary",
    cancel: Callable[[], bool] | None = None,
) -> PolynomialRootsResult:
    """Return a validated structured approximation to every finite root."""
    problem = polynomial_roots_problem(
        coefficients,
        order=order,
        method=method,
        atol=atol,
        rtol=rtol,
        resource_budget=resource_budget,
        trace=trace,
    )
    return solve_polynomial_roots_problem(problem, cancel=cancel)


__all__ = [
    "MAX_POLYNOMIAL_ROOT_DEGREE",
    "PolynomialRootsResult",
    "plan_polynomial_roots",
    "polynomial_roots",
    "polynomial_roots_problem",
    "solve_polynomial_roots_problem",
]
