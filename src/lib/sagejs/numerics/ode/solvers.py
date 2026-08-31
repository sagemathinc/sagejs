"""Explicit Runge-Kutta initial-value solvers with durable evidence.

`rk4` is a fixed-step classroom baseline.  `rk45` is the Dormand-Prince
5(4) pair with local extrapolation, weighted-RMS error control, a safeguarded
step controller, and Shampine's quartic dense extension.  Neither method is a
stiff solver.
"""

from __future__ import annotations

import math
import time
from collections.abc import Callable, Mapping, Sequence
from typing import Any

from ..diagnostics import NumericalDiagnostic
from ..model import NumericalValidation
from ..trace import NumericalTrace, TracePolicy
from .capabilities import plan_ode
from .model import (
    DenseOutputSegment,
    OdeEvent,
    OdeEventOccurrence,
    OdeInvariant,
    OdeProblem,
    OdeResourceBudget,
    OdeResult,
    OdeTrajectory,
    ReferenceFunction,
    StateFunction,
    coerce_state,
)

_EPSILON = 2.220446049250313e-16
_SAFETY = 0.9
_MIN_FACTOR = 0.2
_MAX_FACTOR = 10.0

# Dormand-Prince 5(4), with the endpoint derivative stored as stage seven.
_RK45_C = (0.0, 1.0 / 5.0, 3.0 / 10.0, 4.0 / 5.0, 8.0 / 9.0, 1.0)
_RK45_A = (
    (),
    (1.0 / 5.0,),
    (3.0 / 40.0, 9.0 / 40.0),
    (44.0 / 45.0, -56.0 / 15.0, 32.0 / 9.0),
    (19372.0 / 6561.0, -25360.0 / 2187.0, 64448.0 / 6561.0, -212.0 / 729.0),
    (9017.0 / 3168.0, -355.0 / 33.0, 46732.0 / 5247.0, 49.0 / 176.0, -5103.0 / 18656.0),
)
_RK45_B = (
    35.0 / 384.0,
    0.0,
    500.0 / 1113.0,
    125.0 / 192.0,
    -2187.0 / 6784.0,
    11.0 / 84.0,
)
_RK45_E = (
    -71.0 / 57600.0,
    0.0,
    71.0 / 16695.0,
    -71.0 / 1920.0,
    17253.0 / 339200.0,
    -22.0 / 525.0,
    1.0 / 40.0,
)

# Shampine's quartic continuous extension, represented by Q = K^T P.
_RK45_P = (
    (
        1.0,
        -8048581381.0 / 2820520608.0,
        8663915743.0 / 2820520608.0,
        -12715105075.0 / 11282082432.0,
    ),
    (0.0, 0.0, 0.0, 0.0),
    (
        0.0,
        131558114200.0 / 32700410799.0,
        -68118460800.0 / 10900136933.0,
        87487479700.0 / 32700410799.0,
    ),
    (
        0.0,
        -1754552775.0 / 470086768.0,
        14199869525.0 / 1410260304.0,
        -10690763975.0 / 1880347072.0,
    ),
    (
        0.0,
        127303824393.0 / 49829197408.0,
        -318862633887.0 / 49829197408.0,
        701980252875.0 / 199316789632.0,
    ),
    (
        0.0,
        -282668133.0 / 205662961.0,
        2019193451.0 / 616988883.0,
        -1453857185.0 / 822651844.0,
    ),
    (0.0, 40617522.0 / 29380423.0, -110615467.0 / 29380423.0, 69997945.0 / 29380423.0),
)


class _StopOde(Exception):
    def __init__(self, status: str, reason: str) -> None:
        self.status = status
        self.reason = reason


class _OdeExecution:
    def __init__(
        self,
        problem: OdeProblem,
        trace: NumericalTrace,
        cancel: Callable[[], bool] | None,
    ) -> None:
        self.problem = problem
        self.trace = trace
        self.cancel = cancel
        self.started = time.perf_counter()
        self.callback_evaluations = 0
        self.rhs_evaluations = 0
        self.event_evaluations = 0

    def elapsed_ms(self) -> float:
        return 1000.0 * (time.perf_counter() - self.started)

    def check(self) -> None:
        if self.cancel is not None and self.cancel():
            raise _StopOde("cancelled", "cancelled")
        if self.elapsed_ms() > self.problem.ode_budget.max_elapsed_ms:
            raise _StopOde("backend_failure", "maximum_elapsed")

    def _consume_callback(self) -> None:
        self.check()
        if self.callback_evaluations >= self.problem.ode_budget.max_evaluations:
            raise _StopOde("maximum_evaluations", "maximum_evaluations")
        self.callback_evaluations += 1

    def rhs(
        self,
        t: float,
        y: Sequence[float],
        *,
        iteration: int | None = None,
    ) -> list[float]:
        self._consume_callback()
        function = self.problem.function
        if function is None:
            raise TypeError("ODE problem has no live right-hand side")
        self.rhs_evaluations += 1
        try:
            raw = function(float(t), list(y))
        except _StopOde:
            raise
        except Exception as error:
            self.trace.append(
                "failure",
                iteration=iteration,
                evaluation=self.callback_evaluations,
                data={"time": t, "error_type": type(error).__name__, "callback": "rhs"},
                diagnostics=[NumericalDiagnostic("callback_error")],
                important=True,
                force=True,
            )
            raise
        try:
            value = coerce_state(raw, "ODE right-hand side")
        except ValueError as error:
            if "finite" in str(error):
                self.trace.append(
                    "failure",
                    iteration=iteration,
                    evaluation=self.callback_evaluations,
                    data={"time": t, "callback": "rhs"},
                    diagnostics=[NumericalDiagnostic("nonfinite_evaluation")],
                    important=True,
                    force=True,
                )
                raise _StopOde(
                    "nonfinite_evaluation", "nonfinite_right_hand_side"
                ) from None
            raise
        if len(value) != len(self.problem.y0):
            raise ValueError("ODE right-hand side returned the wrong state dimension")
        self.trace.append(
            "evaluation",
            iteration=iteration,
            evaluation=self.callback_evaluations,
            data={"time": t, "state": list(y), "derivative": value, "callback": "rhs"},
        )
        return value

    def event(self, event: OdeEvent, t: float, y: Sequence[float]) -> float:
        self._consume_callback()
        self.event_evaluations += 1
        try:
            value = float(event.function(float(t), list(y)))
        except Exception:
            raise
        if not math.isfinite(value):
            raise _StopOde("nonfinite_evaluation", "nonfinite_event")
        return value


def _normalize_events(events: Any) -> list[OdeEvent]:
    if events is None:
        return []
    if isinstance(events, OdeEvent):
        return [events]
    if callable(events):
        return [OdeEvent(events)]
    answer: list[OdeEvent] = []
    for index, item in enumerate(events):
        if isinstance(item, OdeEvent):
            answer.append(item)
        elif callable(item):
            answer.append(OdeEvent(item, name="event_" + str(index)))
        else:
            raise TypeError("events must contain OdeEvent objects or callables")
    return answer


def _normalize_invariants(invariants: Any) -> list[OdeInvariant]:
    if invariants is None:
        return []
    if isinstance(invariants, Mapping):
        return [
            OdeInvariant(function, name=str(name))
            for name, function in invariants.items()
        ]
    answer: list[OdeInvariant] = []
    for item in invariants:
        if not isinstance(item, OdeInvariant):
            raise TypeError("invariants must contain OdeInvariant objects")
        answer.append(item)
    return answer


def _normalize_atol(atol: Any, dimension: int) -> list[float]:
    if isinstance(atol, Sequence) and not isinstance(atol, (str, bytes)):
        values = [float(value) for value in atol]
        if len(values) != dimension:
            raise ValueError(
                "component absolute tolerances must match the state dimension"
            )
    else:
        values = [float(atol) for _ in range(dimension)]
    if any(value <= 0 or not math.isfinite(value) for value in values):
        raise ValueError("ODE absolute tolerances must be finite and positive")
    return values


def _normalize_evaluation_times(
    values: Sequence[Any] | None,
    t0: float,
    bound: float,
    maximum: int,
) -> list[float]:
    if values is None:
        return []
    answer = [_finite_time(value, "evaluation time") for value in values]
    if len(answer) > maximum:
        raise ValueError("evaluation times exceed max_output_points")
    direction = 1.0 if bound > t0 else -1.0
    previous: float | None = None
    for value in answer:
        if direction * (value - t0) < 0 or direction * (value - bound) > 0:
            raise ValueError("evaluation times must lie inside t_span")
        if previous is not None and direction * (value - previous) <= 0:
            raise ValueError("evaluation times must be strictly ordered along t_span")
        previous = value
    return answer


def _finite_time(value: Any, name: str) -> float:
    answer = float(value)
    if not math.isfinite(answer):
        raise ValueError(name + " must be finite")
    return answer


def ode_problem(
    function: StateFunction,
    t_span: Sequence[Any],
    y0: Sequence[Any],
    *,
    method: str = "auto",
    rtol: float = 1e-6,
    atol: Any = 1e-9,
    first_step: float | None = None,
    max_step: float | None = None,
    min_step: float = 0.0,
    evaluation_times: Sequence[Any] | None = None,
    dense_output: bool = True,
    events: Any = None,
    invariants: Any = None,
    reference: ReferenceFunction | None = None,
    reference_atol: float | None = None,
    reference_rtol: float | None = None,
    max_steps: int = 10_000,
    max_evaluations: int = 100_000,
    max_elapsed_ms: int = 30_000,
    max_output_points: int = 10_000,
    max_event_iterations: int = 64,
    max_validation_evaluations: int = 32,
    trace: str = "iterations",
    max_trace_events: int = 256,
    max_trace_bytes: int = 1_000_000,
    function_record: Mapping[str, Any] | None = None,
    source_language: str = "python",
    source: Mapping[str, Any] | None = None,
) -> OdeProblem:
    """Construct a validated real-binary64 initial-value problem."""
    if not callable(function):
        raise TypeError("ODE right-hand side must be callable")
    span = [_finite_time(value, "t_span endpoint") for value in t_span]
    if len(span) != 2 or span[0] == span[1]:
        raise ValueError("t_span must contain two distinct finite endpoints")
    state = coerce_state(y0, "initial ODE state")
    relative = float(rtol)
    if not math.isfinite(relative) or relative < 10.0 * _EPSILON:
        raise ValueError("ODE rtol must be finite and at least 10*machine epsilon")
    absolute = _normalize_atol(atol, len(state))
    interval = abs(span[1] - span[0])
    maximum_step = interval if max_step is None else float(max_step)
    minimum_step = float(min_step)
    if not math.isfinite(maximum_step) or maximum_step <= 0:
        raise ValueError("max_step must be finite and positive")
    if (
        not math.isfinite(minimum_step)
        or minimum_step < 0
        or minimum_step > maximum_step
    ):
        raise ValueError(
            "min_step must be finite, nonnegative, and no larger than max_step"
        )
    initial_step = None if first_step is None else float(first_step)
    if initial_step is not None and (
        not math.isfinite(initial_step)
        or initial_step <= 0
        or initial_step > interval
        or initial_step > maximum_step
        or initial_step < minimum_step
    ):
        raise ValueError(
            "first_step must lie between min_step and the integration bounds"
        )
    if reference is not None and not callable(reference):
        raise TypeError("reference solution must be callable")
    budget = OdeResourceBudget(
        max_steps=max_steps,
        max_evaluations=max_evaluations,
        max_elapsed_ms=max_elapsed_ms,
        max_output_points=max_output_points,
        max_event_iterations=max_event_iterations,
        max_validation_evaluations=max_validation_evaluations,
        max_trace_events=max_trace_events,
        max_trace_bytes=max_trace_bytes,
    )
    requested_times = _normalize_evaluation_times(
        evaluation_times, span[0], span[1], budget.max_output_points
    )
    reference_absolute = (
        10.0 * max(absolute) if reference_atol is None else float(reference_atol)
    )
    reference_relative = (
        10.0 * relative if reference_rtol is None else float(reference_rtol)
    )
    if (
        reference_absolute < 0
        or reference_relative < 0
        or not math.isfinite(reference_absolute + reference_relative)
        or reference_absolute + reference_relative == 0
    ):
        raise ValueError(
            "reference tolerances must be finite, nonnegative, and not both zero"
        )
    callback_record = (
        {"kind": "opaque_callback", "replayable": False}
        if function_record is None
        else function_record
    )
    return OdeProblem(
        function,
        span,
        state,
        method=str(method).lower(),
        rtol=relative,
        atol=absolute,
        first_step=initial_step,
        max_step=maximum_step,
        min_step=minimum_step,
        evaluation_times=requested_times,
        dense_output=dense_output,
        events=_normalize_events(events),
        invariants=_normalize_invariants(invariants),
        reference=reference,
        reference_atol=reference_absolute,
        reference_rtol=reference_relative,
        resource_budget=budget,
        trace_policy=TracePolicy(
            trace, max_events=max_trace_events, max_bytes=max_trace_bytes
        ),
        function_record=callback_record,
        source_language=source_language,
        source=source,
    )


def _weighted_norm(values: Sequence[float], scale: Sequence[float]) -> float:
    total = 0.0
    for value, weight in zip(values, scale):
        ratio = value / weight
        total += ratio * ratio
    return math.sqrt(total / len(values))


def _combine(
    y: Sequence[float],
    h: float,
    stages: Sequence[Sequence[float]],
    weights: Sequence[float],
) -> list[float]:
    return [
        y[i] + h * sum(weights[j] * stages[j][i] for j in range(len(weights)))
        for i in range(len(y))
    ]


def _select_initial_step(
    execution: _OdeExecution,
    t: float,
    y: Sequence[float],
    derivative: Sequence[float],
    direction: float,
) -> float:
    problem = execution.problem
    if problem.first_step is not None:
        return problem.first_step
    scale = [problem.atol[i] + abs(y[i]) * problem.rtol for i in range(len(y))]
    d0 = _weighted_norm(y, scale)
    d1 = _weighted_norm(derivative, scale)
    h0 = 1e-6 if d0 < 1e-5 or d1 < 1e-5 else 0.01 * d0 / d1
    h0 = min(h0, problem.max_step, abs(problem.t_span[1] - t))
    trial = [y[i] + direction * h0 * derivative[i] for i in range(len(y))]
    trial_derivative = execution.rhs(t + direction * h0, trial, iteration=0)
    d2 = _weighted_norm(
        [
            (trial_derivative[i] - derivative[i]) / max(h0, 1e-300)
            for i in range(len(y))
        ],
        scale,
    )
    largest = max(d1, d2)
    h1 = max(1e-6, h0 * 1e-3) if largest <= 1e-15 else (0.01 / largest) ** 0.2
    return min(100.0 * h0, h1, problem.max_step, abs(problem.t_span[1] - t))


def _rk45_attempt(
    execution: _OdeExecution,
    t: float,
    y: Sequence[float],
    derivative: Sequence[float],
    h: float,
    iteration: int,
) -> tuple[list[float], list[float], list[float], float, DenseOutputSegment]:
    stages: list[list[float]] = [list(derivative)]
    for stage_index in range(1, 6):
        stage_state = _combine(y, h, stages, _RK45_A[stage_index])
        stages.append(
            execution.rhs(
                t + _RK45_C[stage_index] * h,
                stage_state,
                iteration=iteration,
            )
        )
    y_new = _combine(y, h, stages, _RK45_B)
    derivative_new = execution.rhs(t + h, y_new, iteration=iteration)
    stages.append(derivative_new)
    error = [
        h * sum(_RK45_E[j] * stages[j][i] for j in range(7)) for i in range(len(y))
    ]
    scale = [
        execution.problem.atol[i]
        + execution.problem.rtol * max(abs(y[i]), abs(y_new[i]))
        for i in range(len(y))
    ]
    error_norm = _weighted_norm(error, scale)
    dense_coefficients = [
        [sum(stages[k][i] * _RK45_P[k][j] for k in range(7)) for j in range(4)]
        for i in range(len(y))
    ]
    segment = DenseOutputSegment(t, t + h, h, y, dense_coefficients)
    return y_new, derivative_new, error, error_norm, segment


def _rk4_attempt(
    execution: _OdeExecution,
    t: float,
    y: Sequence[float],
    derivative: Sequence[float],
    h: float,
    iteration: int,
) -> tuple[list[float], list[float], DenseOutputSegment]:
    k1 = list(derivative)
    k2 = execution.rhs(t + 0.5 * h, _combine(y, h, [k1], [0.5]), iteration=iteration)
    k3 = execution.rhs(t + 0.5 * h, _combine(y, h, [k2], [0.5]), iteration=iteration)
    k4 = execution.rhs(t + h, _combine(y, h, [k3], [1.0]), iteration=iteration)
    y_new = _combine(
        y, h, [k1, k2, k3, k4], [1.0 / 6.0, 1.0 / 3.0, 1.0 / 3.0, 1.0 / 6.0]
    )
    derivative_new = execution.rhs(t + h, y_new, iteration=iteration)
    coefficients: list[list[float]] = []
    for index in range(len(y)):
        delta = (y_new[index] - y[index]) / h
        coefficients.append(
            [
                k1[index],
                3.0 * delta - 2.0 * k1[index] - derivative_new[index],
                k1[index] + derivative_new[index] - 2.0 * delta,
                0.0,
            ]
        )
    return y_new, derivative_new, DenseOutputSegment(t, t + h, h, y, coefficients)


def _crosses(event: OdeEvent, old: float, new: float) -> bool:
    if old == 0.0:
        return False
    crossing = new == 0.0 or old * new < 0.0
    if not crossing:
        return False
    change = new - old
    return (
        event.direction == 0
        or (event.direction > 0 and change > 0)
        or (event.direction < 0 and change < 0)
    )


def _locate_event(
    execution: _OdeExecution,
    index: int,
    event: OdeEvent,
    segment: DenseOutputSegment,
    old_value: float,
    new_value: float,
) -> OdeEventOccurrence:
    left = segment.t0
    right = segment.t1
    fleft = old_value
    fright = new_value
    iterations = 0
    if fright == 0.0:
        root = right
        state = segment.evaluate(root)
        value = fright
    else:
        root = left
        state = segment.evaluate(left)
        value = fleft
        for iterations in range(
            1, execution.problem.ode_budget.max_event_iterations + 1
        ):
            execution.check()
            middle = left + 0.5 * (right - left)
            state = segment.evaluate(middle)
            value = execution.event(event, middle, state)
            root = middle
            width_tolerance = 4.0 * _EPSILON * max(1.0, abs(left), abs(right))
            if (
                abs(value) <= event.value_tolerance
                or abs(right - left) <= width_tolerance
            ):
                break
            if fleft * value <= 0.0:
                right = middle
                fright = value
            else:
                left = middle
                fleft = value
        candidates = [
            (abs(fleft), left, fleft),
            (abs(fright), right, fright),
            (abs(value), root, value),
        ]
        _, root, value = min(candidates, key=lambda item: item[0])
        state = segment.evaluate(root)
        value = execution.event(event, root, state)
    return OdeEventOccurrence(
        index, event, root, state, value, [left, right], iterations
    )


def _sample_indices(count: int, maximum: int) -> list[int]:
    if count <= maximum:
        return list(range(count))
    if maximum <= 1:
        return [count - 1]
    answer: list[int] = []
    for index in range(maximum):
        candidate = int(round(index * (count - 1) / (maximum - 1)))
        if not answer or answer[-1] != candidate:
            answer.append(candidate)
    return answer


class _ValidationBudget:
    def __init__(self, maximum: int, execution: _OdeExecution) -> None:
        self.maximum = maximum
        self.execution = execution
        self.used = 0

    def consume(self) -> bool:
        self.execution.check()
        if self.used >= self.maximum:
            return False
        self.used += 1
        return True


def _independent_validation(
    problem: OdeProblem,
    execution: _OdeExecution,
    trajectory: OdeTrajectory,
    occurrences: Sequence[OdeEventOccurrence],
    completed: bool,
    local_evidence: Mapping[str, Any],
) -> tuple[NumericalValidation, dict[str, Any], list[NumericalDiagnostic]]:
    checks: list[dict[str, Any]] = []
    diagnostics: list[NumericalDiagnostic] = []
    checks.append({"kind": "solver_completion", "passed": completed})
    finite = all(
        math.isfinite(value) for state in trajectory.internal_states for value in state
    )
    checks.append({"kind": "finite_trajectory", "passed": finite})
    endpoint_error = 0.0
    for index, segment in enumerate(trajectory.segments):
        expected = trajectory.internal_states[index + 1]
        actual = segment.evaluate(segment.t1)
        endpoint_error = max(
            endpoint_error,
            max(abs(actual[i] - expected[i]) for i in range(len(actual))),
        )
    endpoint_passed = endpoint_error <= 64.0 * _EPSILON * max(
        1.0,
        max(abs(value) for state in trajectory.internal_states for value in state),
    )
    checks.append(
        {
            "kind": "dense_endpoint_consistency",
            "passed": endpoint_passed,
            "max_abs_difference": endpoint_error,
        }
    )
    event_passed = all(item.residual_passed for item in occurrences)
    checks.append(
        {
            "kind": "event_residuals",
            "passed": event_passed,
            "count": len(occurrences),
            "maximum_residual": max([abs(item.value) for item in occurrences] + [0.0]),
        }
    )
    local_passed = bool(local_evidence.get("passed", False))
    checks.append(
        {
            "kind": "accepted_local_error_estimates",
            "passed": local_passed,
            "maximum_weighted_rms": local_evidence.get("max_accepted_error_norm"),
            "scope": "per_step_not_global",
        }
    )
    budget = _ValidationBudget(problem.ode_budget.max_validation_evaluations, execution)
    defect_samples: list[dict[str, Any]] = []
    function = problem.function
    if completed and function is not None and trajectory.segments:
        maximum = min(len(trajectory.segments), max(1, budget.maximum // 2))
        for index in _sample_indices(len(trajectory.segments), maximum):
            if not budget.consume():
                break
            segment = trajectory.segments[index]
            middle = segment.t0 + 0.5 * (segment.t1 - segment.t0)
            state = segment.evaluate(middle)
            derivative = segment.derivative(middle)
            try:
                rhs = coerce_state(
                    function(middle, state), "validation right-hand side"
                )
                if len(rhs) != len(state):
                    raise ValueError("validation right-hand side dimension mismatch")
                difference = [derivative[i] - rhs[i] for i in range(len(state))]
                scale = [
                    problem.atol[i] + problem.rtol * abs(state[i])
                    for i in range(len(state))
                ]
                defect_samples.append(
                    {
                        "time": middle,
                        "max_abs": max(abs(value) for value in difference),
                        "weighted_rms": _weighted_norm(difference, scale),
                    }
                )
            except Exception as error:
                defect_samples.append(
                    {"time": middle, "error_type": type(error).__name__}
                )
    defect_complete = all("max_abs" in sample for sample in defect_samples)
    dense_defect: dict[str, Any] = {
        "sample_count": len(defect_samples),
        "max_abs_defect": max(
            [float(sample.get("max_abs", 0.0)) for sample in defect_samples] + [0.0]
        ),
        "max_scaled_defect": max(
            [float(sample.get("weighted_rms", 0.0)) for sample in defect_samples]
            + [0.0]
        ),
        "finite": defect_complete,
        "interpretation": "sampled derivative defect of the dense polynomial; not a global error bound",
    }
    checks.append(
        {
            "kind": "sampled_dense_defect_finite",
            "passed": defect_complete,
            **dense_defect,
        }
    )
    invariant_records: list[dict[str, Any]] = []
    for invariant in problem.invariants if completed else ():
        values: list[float] = []
        sample_count = min(len(trajectory.internal_times), 8)
        complete = True
        for index in _sample_indices(len(trajectory.internal_times), sample_count):
            if not budget.consume():
                complete = False
                break
            try:
                value = float(
                    invariant.function(
                        trajectory.internal_times[index],
                        trajectory.internal_states[index],
                    )
                )
                if not math.isfinite(value):
                    raise ValueError("nonfinite invariant")
                values.append(value)
            except Exception:
                complete = False
                break
        baseline = values[0] if values else 0.0
        drift = max([abs(value - baseline) for value in values] + [0.0])
        threshold = invariant.atol + invariant.rtol * abs(baseline)
        passed = complete and len(values) >= 2 and drift <= threshold
        record = {
            "name": invariant.name,
            "passed": passed,
            "sample_count": len(values),
            "initial_value": baseline if values else None,
            "max_abs_drift": drift,
            "threshold": threshold,
        }
        invariant_records.append(record)
        checks.append({"kind": "invariant", **record})
    reference_record: dict[str, Any] = {"available": False}
    if completed and problem.reference is not None:
        errors: list[float] = []
        normalized: list[float] = []
        complete = True
        sample_count = min(len(trajectory.internal_times), 8)
        for index in _sample_indices(len(trajectory.internal_times), sample_count):
            if not budget.consume():
                complete = False
                break
            try:
                expected = coerce_state(
                    problem.reference(trajectory.internal_times[index]),
                    "reference solution",
                )
                actual = trajectory.internal_states[index]
                if len(expected) != len(actual):
                    raise ValueError("reference solution dimension mismatch")
                for component in range(len(actual)):
                    error = abs(actual[component] - expected[component])
                    scale = problem.reference_atol + problem.reference_rtol * abs(
                        expected[component]
                    )
                    errors.append(error)
                    normalized.append(error / scale)
            except Exception:
                complete = False
                break
        reference_passed = complete and bool(errors) and max(normalized) <= 1.0
        reference_record = {
            "available": True,
            "passed": reference_passed,
            "sample_count": sample_count if complete else len(errors),
            "max_abs_error": max(errors + [0.0]),
            "max_normalized_error": max(normalized + [0.0]),
            "atol": problem.reference_atol,
            "rtol": problem.reference_rtol,
        }
        checks.append({"kind": "reference_solution", **reference_record})
    required_passed = (
        completed
        and finite
        and endpoint_passed
        and event_passed
        and local_passed
        and defect_complete
    )
    required_passed = required_passed and all(
        bool(record["passed"]) for record in invariant_records
    )
    if reference_record.get("available"):
        required_passed = required_passed and bool(reference_record.get("passed"))
    if completed and not required_passed:
        diagnostics.append(NumericalDiagnostic("validation_failed"))
    truth_level = (
        "validated_approximate"
        if required_passed and local_evidence.get("controlled")
        else "heuristic"
    )
    if not required_passed:
        truth_level = "indeterminate"
    embedded_error = local_evidence.get("max_accepted_abs_error")
    evidence = {
        "local_error_control": dict(local_evidence),
        "dense_defect": dense_defect,
        "invariants": invariant_records,
        "reference_solution": reference_record,
        "validation_callback_evaluations": budget.used,
    }
    return (
        NumericalValidation(
            truth_level,
            required_passed,
            checks=checks,
            residual=float(dense_defect["max_abs_defect"]),
            error_estimate=float(embedded_error)
            if embedded_error is not None
            else None,
        ),
        evidence,
        diagnostics,
    )


def _status_diagnostic(status: str) -> NumericalDiagnostic | None:
    known = {
        "cancelled": "cancelled",
        "callback_error": "callback_error",
        "maximum_evaluations": "maximum_evaluations",
        "maximum_iterations": "maximum_iterations",
        "nonfinite_evaluation": "nonfinite_evaluation",
        "stagnation": "stagnation",
    }
    code = known.get(status)
    return None if code is None else NumericalDiagnostic(code)


def solve_ode_problem(
    problem: OdeProblem,
    *,
    method: str | None = None,
    cancel: Callable[[], bool] | None = None,
) -> OdeResult:
    """Plan, integrate, locate events, validate, and package an ODE result."""
    selected_plan = plan_ode(problem, method=method)
    trace = NumericalTrace(problem.trace_policy)
    trace.append(
        "start",
        data={
            "operation": problem.operation,
            "method": selected_plan.method,
            "backend": selected_plan.backend,
            "t_span": list(problem.t_span),
            "initial_state": list(problem.y0),
        },
        important=True,
        force=True,
    )
    execution = _OdeExecution(problem, trace, cancel)
    diagnostics: list[NumericalDiagnostic] = []
    if not problem.replayable:
        diagnostics.append(NumericalDiagnostic("non_replayable_callback"))
    t, bound = problem.t_span
    direction = 1.0 if bound > t else -1.0
    y = list(problem.y0)
    internal_times = [t]
    internal_states = [list(y)]
    segments: list[DenseOutputSegment] = []
    occurrences: list[OdeEventOccurrence] = []
    status = "backend_failure"
    termination_reason = "backend_failure"
    attempts = 0
    accepted_steps = 0
    rejected_steps = 0
    consecutive_rejections = 0
    max_consecutive_rejections = 0
    accepted_error_norms: list[float] = []
    accepted_abs_errors: list[float] = []
    rejected_error_norms: list[float] = []
    completed = False
    derivative: list[float] | None = None
    event_values: list[float] = []
    try:
        derivative = execution.rhs(t, y, iteration=0)
        for event in problem.events:
            value = execution.event(event, t, y)
            event_values.append(value)
        for index, event in enumerate(problem.events):
            if abs(event_values[index]) <= event.value_tolerance:
                occurrence = OdeEventOccurrence(
                    index,
                    event,
                    t,
                    y,
                    event_values[index],
                    [t, t],
                    0,
                )
                occurrences.append(occurrence)
                trace.append(
                    "event",
                    iteration=0,
                    data=occurrence.to_dict(),
                    important=True,
                    force=True,
                )
                if event.terminal:
                    status = "converged"
                    termination_reason = "terminal_event"
                    completed = True
                    break
        if not completed:
            if selected_plan.method == "rk45":
                h_abs = _select_initial_step(execution, t, y, derivative, direction)
            else:
                h_abs = problem.first_step or min(
                    problem.max_step, abs(bound - t) / 100.0
                )
            while direction * (bound - t) > 0.0:
                execution.check()
                if attempts >= problem.ode_budget.max_steps:
                    raise _StopOde("maximum_iterations", "maximum_steps")
                remaining = abs(bound - t)
                minimum_representable = 10.0 * _EPSILON * max(1.0, abs(t))
                effective_minimum = max(problem.min_step, minimum_representable)
                h_abs = min(h_abs, problem.max_step, remaining)
                if h_abs <= 0.0 or t + direction * h_abs == t:
                    raise _StopOde("stagnation", "step_underflow")
                if h_abs < effective_minimum and remaining > effective_minimum:
                    raise _StopOde("stagnation", "minimum_step")
                h = direction * h_abs
                attempts += 1
                if selected_plan.method == "rk45":
                    y_new, derivative_new, error, error_norm, segment = _rk45_attempt(
                        execution, t, y, derivative, h, attempts
                    )
                    if not math.isfinite(error_norm):
                        raise _StopOde(
                            "nonfinite_evaluation", "nonfinite_error_estimate"
                        )
                    accepted = error_norm <= 1.0
                    if accepted:
                        factor = (
                            _MAX_FACTOR
                            if error_norm == 0.0
                            else min(_MAX_FACTOR, _SAFETY * error_norm**-0.2)
                        )
                        if consecutive_rejections:
                            factor = min(1.0, factor)
                        proposed_step = h_abs * factor
                    else:
                        factor = max(_MIN_FACTOR, _SAFETY * error_norm**-0.2)
                        proposed_step = h_abs * factor
                else:
                    y_new, derivative_new, segment = _rk4_attempt(
                        execution, t, y, derivative, h, attempts
                    )
                    error = []
                    error_norm = None
                    accepted = True
                    proposed_step = h_abs
                if not accepted:
                    if error_norm is None:
                        raise RuntimeError(
                            "an adaptive rejection requires an error norm"
                        )
                    rejected_steps += 1
                    consecutive_rejections += 1
                    max_consecutive_rejections = max(
                        max_consecutive_rejections, consecutive_rejections
                    )
                    rejected_error_norms.append(float(error_norm))
                    trace.append(
                        "step",
                        iteration=attempts,
                        evaluation=execution.callback_evaluations,
                        accepted=False,
                        data={
                            "t_start": t,
                            "attempted_step": h,
                            "error_norm": error_norm,
                            "proposed_step": direction * proposed_step,
                        },
                    )
                    h_abs = proposed_step
                    continue
                accepted_steps += 1
                max_consecutive_rejections = max(
                    max_consecutive_rejections, consecutive_rejections
                )
                consecutive_rejections = 0
                t_new = t + h
                if error_norm is not None:
                    accepted_error_norms.append(float(error_norm))
                    accepted_abs_errors.append(max(abs(value) for value in error))
                new_event_values: list[float] = []
                found: list[OdeEventOccurrence] = []
                for index, event in enumerate(problem.events):
                    value = execution.event(event, t_new, y_new)
                    new_event_values.append(value)
                    if _crosses(event, event_values[index], value):
                        found.append(
                            _locate_event(
                                execution,
                                index,
                                event,
                                segment,
                                event_values[index],
                                value,
                            )
                        )
                found.sort(key=lambda item: direction * item.time)
                terminal: OdeEventOccurrence | None = None
                for item in found:
                    if (
                        terminal is not None
                        and direction * (item.time - terminal.time) > 0
                    ):
                        continue
                    occurrences.append(item)
                    trace.append(
                        "event",
                        iteration=attempts,
                        evaluation=execution.callback_evaluations,
                        data=item.to_dict(),
                        important=True,
                        force=True,
                    )
                    if item.terminal and terminal is None:
                        terminal = item
                if terminal is not None:
                    t_new = terminal.time
                    y_new = list(terminal.state)
                    segment = segment.restricted(t_new)
                segments.append(segment)
                internal_times.append(t_new)
                internal_states.append(list(y_new))
                trace.append(
                    "step",
                    iteration=attempts,
                    evaluation=execution.callback_evaluations,
                    accepted=True,
                    data={
                        "t_start": t,
                        "t_end": t_new,
                        "step_size": t_new - t,
                        "state": list(y_new),
                        "error_norm": error_norm,
                        "max_abs_error_estimate": max(
                            [abs(value) for value in error] + [0.0]
                        ),
                        "proposed_step": direction * proposed_step,
                        "event_count": len(found),
                    },
                )
                t = t_new
                y = list(y_new)
                derivative = derivative_new
                event_values = new_event_values
                h_abs = proposed_step
                if terminal is not None:
                    status = "converged"
                    termination_reason = "terminal_event"
                    completed = True
                    break
            if not completed and direction * (bound - t) <= 0.0:
                status = "converged"
                termination_reason = "reached_t_bound"
                completed = True
    except _StopOde as stop:
        status = stop.status
        termination_reason = stop.reason
    except Exception as error:
        status = "callback_error"
        termination_reason = "callback_error"
        diagnostics.append(
            NumericalDiagnostic(
                "callback_error", details={"error_type": type(error).__name__}
            )
        )
    diagnostic = _status_diagnostic(status)
    if diagnostic is not None and diagnostic.code not in {
        item.code for item in diagnostics
    }:
        diagnostics.append(diagnostic)
    temporary_trajectory = OdeTrajectory(internal_times, internal_states, segments)
    requested_times: list[float] = []
    requested_states: list[list[float]] = []
    for value in problem.evaluation_times:
        if direction * (value - temporary_trajectory.final_time) <= 0.0:
            try:
                requested_times.append(value)
                requested_states.append(temporary_trajectory.evaluate(value))
            except ValueError:
                if value == temporary_trajectory.internal_times[0]:
                    requested_times.append(value)
                    requested_states.append(
                        list(temporary_trajectory.internal_states[0])
                    )
    published_segments = segments if problem.dense_output else []
    trajectory = OdeTrajectory(
        internal_times,
        internal_states,
        published_segments,
        requested_times=requested_times,
        requested_states=requested_states,
    )
    local_evidence = {
        "method": selected_plan.method,
        "controlled": selected_plan.method == "rk45",
        "norm": "weighted_rms",
        "acceptance_threshold": 1.0 if selected_plan.method == "rk45" else None,
        "accepted_steps": accepted_steps,
        "rejected_steps": rejected_steps,
        "attempted_steps": attempts,
        "max_consecutive_rejections": max_consecutive_rejections,
        "max_accepted_error_norm": max(accepted_error_norms + [0.0])
        if selected_plan.method == "rk45"
        else None,
        "max_rejected_error_norm": max(rejected_error_norms + [0.0])
        if rejected_error_norms
        else None,
        "max_accepted_abs_error": max(accepted_abs_errors + [0.0])
        if selected_plan.method == "rk45"
        else None,
        "passed": completed
        and (
            selected_plan.method == "rk4"
            or all(value <= 1.0 + 16.0 * _EPSILON for value in accepted_error_norms)
        ),
        "scope": "accepted_step_local_estimates_not_global_error",
    }
    validation_trajectory = temporary_trajectory
    try:
        validation, evidence, validation_diagnostics = _independent_validation(
            problem,
            execution,
            validation_trajectory,
            occurrences,
            completed,
            local_evidence,
        )
    except _StopOde as stop:
        completed = False
        status = stop.status
        termination_reason = stop.reason
        stopped_diagnostic = _status_diagnostic(status)
        if stopped_diagnostic is not None:
            diagnostics.append(stopped_diagnostic)
        validation = NumericalValidation(
            "indeterminate",
            False,
            checks=[
                {
                    "kind": "validation_resource_budget",
                    "passed": False,
                    "termination_reason": termination_reason,
                }
            ],
        )
        evidence = {
            "local_error_control": local_evidence,
            "dense_defect": {
                "sample_count": 0,
                "finite": False,
                "interpretation": "validation stopped by a hard resource or cancellation budget",
            },
            "invariants": [],
            "reference_solution": {"available": problem.reference is not None},
            "validation_callback_evaluations": 0,
        }
        validation_diagnostics = []
    diagnostics.extend(validation_diagnostics)
    if completed and not validation.passed:
        status = "validation_failed"
        termination_reason = "independent_validation_failed"
    success = completed and validation.passed
    trace.append(
        "validation",
        iteration=attempts,
        evaluation=execution.callback_evaluations,
        data=validation.to_dict(),
        diagnostics=validation_diagnostics,
        important=True,
        force=True,
    )
    trace.append(
        "finish" if success else "failure",
        iteration=attempts,
        evaluation=execution.callback_evaluations,
        data={
            "status": status,
            "termination_reason": termination_reason,
            "success": success,
            "final_time": trajectory.final_time,
            "final_state": list(trajectory.final_state),
        },
        diagnostics=diagnostics,
        important=True,
        force=True,
    )
    measurements = {
        "callback_evaluations": execution.callback_evaluations,
        "rhs_evaluations": execution.rhs_evaluations,
        "event_evaluations": execution.event_evaluations,
        "validation_callback_evaluations": evidence["validation_callback_evaluations"],
        "accepted_steps": accepted_steps,
        "rejected_steps": rejected_steps,
        "stored_internal_points": len(internal_times),
        "stored_dense_segments": len(published_segments),
    }
    return OdeResult(
        problem,
        selected_plan,
        success=success,
        status=status,
        termination_reason=termination_reason,
        trajectory=trajectory,
        validation=validation,
        diagnostics=diagnostics,
        iterations=attempts,
        evaluations=execution.callback_evaluations,
        elapsed_ms=execution.elapsed_ms(),
        trace=trace,
        occurrences=occurrences,
        evidence=evidence,
        measurements=measurements,
    )


def solve_ivp(
    function: StateFunction,
    t_span: Sequence[Any],
    y0: Sequence[Any],
    **options: Any,
) -> OdeResult:
    """Solve an explicit nonstiff IVP and return its complete evidence record."""
    cancel = options.pop("cancel", None)
    problem = ode_problem(function, t_span, y0, **options)
    return solve_ode_problem(problem, cancel=cancel)
