"""ODE-specific problem, trajectory, event, and result records.

The records in this module remain ordinary CPython objects.  Dense-output
coefficients and event locations are durable numerical evidence rather than
renderer state.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Mapping, Sequence
from typing import Any

from .._json import JSONValue, materialize_object
from ..model import (
    NumericalPlan,
    NumericalProblem,
    NumericalResult,
    NumericalValidation,
    ResourceBudget,
)
from ..trace import NumericalTrace, TracePolicy

StateFunction = Callable[[float, Sequence[float]], Sequence[Any]]
StateJacobian = Callable[[float, Sequence[float]], Sequence[Sequence[Any]]]
ScalarStateFunction = Callable[[float, Sequence[float]], Any]
ReferenceFunction = Callable[[float], Sequence[Any]]
_MACHINE_EPSILON = 2.220446049250313e-16


def _finite_float(value: Any, name: str) -> float:
    answer = float(value)
    if not math.isfinite(answer):
        raise ValueError(name + " must be finite")
    return answer


def coerce_state(value: Sequence[Any], name: str) -> list[float]:
    """Return a nonempty finite binary64 state vector."""
    if isinstance(value, (str, bytes)):
        raise TypeError(name + " must be a sequence of real scalars")
    answer = [_finite_float(item, name) for item in value]
    if len(answer) == 0:
        raise ValueError(name + " must contain at least one component")
    return answer


class OdeUnsupportedError(NotImplementedError):
    """A structured, inspectable rejection outside the supported envelope."""

    def __init__(self, feature: str, reason: str, alternatives: Sequence[str]) -> None:
        self.feature = str(feature)
        self.reason = str(reason)
        self.alternatives = tuple(str(item) for item in alternatives)
        super().__init__(self.feature + " is unsupported: " + self.reason)

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "classification": "unsupported",
            "feature": self.feature,
            "reason": self.reason,
            "alternatives": list(self.alternatives),
        }


class OdeEvent:
    """A scalar zero-crossing condition evaluated on accepted dense output.

    `direction` is measured along the integration direction: `1` accepts
    negative-to-positive crossings, `-1` accepts positive-to-negative
    crossings, and `0` accepts either.  A terminal event ends the trajectory at
    the earliest located crossing in a step.
    """

    def __init__(
        self,
        function: ScalarStateFunction,
        *,
        name: str | None = None,
        terminal: bool = False,
        direction: int = 0,
        value_tolerance: float = 1e-8,
    ) -> None:
        if not callable(function):
            raise TypeError("ODE event function must be callable")
        if direction not in (-1, 0, 1):
            raise ValueError("ODE event direction must be -1, 0, or 1")
        if value_tolerance <= 0 or not math.isfinite(float(value_tolerance)):
            raise ValueError("event value_tolerance must be finite and positive")
        self._function = function
        self._name = "event" if name is None else str(name)
        if self._name == "":
            raise ValueError("ODE event name must be nonempty")
        self._terminal = bool(terminal)
        self._direction = int(direction)
        self._value_tolerance = float(value_tolerance)

    @property
    def function(self) -> ScalarStateFunction:
        return self._function

    @property
    def name(self) -> str:
        return self._name

    @property
    def terminal(self) -> bool:
        return self._terminal

    @property
    def direction(self) -> int:
        return self._direction

    @property
    def value_tolerance(self) -> float:
        return self._value_tolerance

    def descriptor(self, index: int) -> dict[str, JSONValue]:
        return {
            "index": index,
            "name": self._name,
            "terminal": self._terminal,
            "direction": self._direction,
            "value_tolerance": self._value_tolerance,
            "callback": {"kind": "opaque_callback", "replayable": False},
        }


class OdeInvariant:
    """An independently evaluated scalar invariant with a drift threshold."""

    def __init__(
        self,
        function: ScalarStateFunction,
        *,
        name: str,
        atol: float = 1e-8,
        rtol: float = 1e-6,
    ) -> None:
        if not callable(function):
            raise TypeError("ODE invariant function must be callable")
        if str(name) == "":
            raise ValueError("ODE invariant name must be nonempty")
        if atol < 0 or rtol < 0 or not math.isfinite(float(atol + rtol)):
            raise ValueError("ODE invariant tolerances must be finite and nonnegative")
        if atol == 0 and rtol == 0:
            raise ValueError("an ODE invariant requires a positive tolerance")
        self._function = function
        self._name = str(name)
        self._atol = float(atol)
        self._rtol = float(rtol)

    @property
    def function(self) -> ScalarStateFunction:
        return self._function

    @property
    def name(self) -> str:
        return self._name

    @property
    def atol(self) -> float:
        return self._atol

    @property
    def rtol(self) -> float:
        return self._rtol

    def descriptor(self) -> dict[str, JSONValue]:
        return {
            "name": self._name,
            "atol": self._atol,
            "rtol": self._rtol,
            "callback": {"kind": "opaque_callback", "replayable": False},
        }


class OdeResourceBudget(ResourceBudget):
    """Hard callback, step, elapsed, output, event, and validation limits."""

    def __init__(
        self,
        *,
        max_steps: int = 10_000,
        max_evaluations: int = 100_000,
        max_elapsed_ms: int = 30_000,
        max_output_points: int = 10_000,
        max_event_iterations: int = 64,
        max_validation_evaluations: int = 32,
        max_linear_solve_failures: int = 8,
        max_workspace_bytes: int = 64_000_000,
        max_trace_events: int = 256,
        max_trace_bytes: int = 1_000_000,
    ) -> None:
        super().__init__(
            max_iterations=max_steps,
            max_evaluations=max_evaluations,
            max_elapsed_ms=max_elapsed_ms,
            max_trace_events=max_trace_events,
            max_trace_bytes=max_trace_bytes,
        )
        extras = {
            "max_output_points": max_output_points,
            "max_event_iterations": max_event_iterations,
            "max_validation_evaluations": max_validation_evaluations,
            "max_linear_solve_failures": max_linear_solve_failures,
            "max_workspace_bytes": max_workspace_bytes,
        }
        for name, value in extras.items():
            if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
                raise ValueError(name + " must be a positive integer")
        if max_output_points < 2:
            raise ValueError("max_output_points must be an integer at least 2")
        self._ode_values = extras

    @property
    def max_steps(self) -> int:
        return self.max_iterations

    @property
    def max_output_points(self) -> int:
        return self._ode_values["max_output_points"]

    @property
    def max_event_iterations(self) -> int:
        return self._ode_values["max_event_iterations"]

    @property
    def max_validation_evaluations(self) -> int:
        return self._ode_values["max_validation_evaluations"]

    @property
    def max_linear_solve_failures(self) -> int:
        return self._ode_values["max_linear_solve_failures"]

    @property
    def max_workspace_bytes(self) -> int:
        return self._ode_values["max_workspace_bytes"]

    def to_dict(self) -> dict[str, JSONValue]:
        record = super().to_dict()
        record["max_steps"] = self.max_steps
        record.update(self._ode_values)
        return record

    @classmethod
    def domain_capability_record(cls) -> dict[str, JSONValue]:
        """Register ODE-only hard budgets in the common capability document."""
        return {
            "ode.initial_value_problem": {
                "max_steps": "hard_attempt_limit_alias_of_max_iterations",
                "max_output_points": "hard_retained_output_limit",
                "max_event_iterations": "hard_per_event_localization_limit",
                "max_validation_evaluations": "hard_reference_callback_limit",
                "max_linear_solve_failures": "hard_stiff_solver_failure_limit",
                "max_workspace_bytes": "hard_logical_workspace_limit",
            }
        }


class OdeProblem(NumericalProblem):
    """An immutable binary64 initial-value problem with live callbacks."""

    def __init__(
        self,
        function: StateFunction,
        t_span: Sequence[Any],
        y0: Sequence[Any],
        *,
        method: str,
        rtol: float,
        atol: Sequence[float],
        first_step: float | None,
        max_step: float,
        min_step: float,
        evaluation_times: Sequence[float],
        dense_output: bool,
        events: Sequence[OdeEvent],
        invariants: Sequence[OdeInvariant],
        reference: ReferenceFunction | None,
        reference_atol: float,
        reference_rtol: float,
        jacobian: StateJacobian | None,
        resource_budget: OdeResourceBudget,
        trace_policy: TracePolicy,
        function_record: Mapping[str, Any] | None,
        source_language: str,
        source: Mapping[str, Any] | None,
    ) -> None:
        self._t_span = tuple(float(value) for value in t_span)
        self._y0 = tuple(float(value) for value in y0)
        self._atol = tuple(float(value) for value in atol)
        self._first_step = first_step
        self._max_step = float(max_step)
        self._min_step = float(min_step)
        self._evaluation_times = tuple(float(value) for value in evaluation_times)
        self._dense_output = bool(dense_output)
        self._events = tuple(events)
        self._invariants = tuple(invariants)
        self._reference = reference
        self._reference_atol = float(reference_atol)
        self._reference_rtol = float(reference_rtol)
        self._jacobian = jacobian
        metadata: dict[str, Any] = {
            "dense_output": self._dense_output,
            "first_step": self._first_step,
            "max_step": self._max_step,
            "min_step": self._min_step,
            "evaluation_times": list(self._evaluation_times),
            "events": [event.descriptor(i) for i, event in enumerate(events)],
            "invariants": [item.descriptor() for item in invariants],
            "reference_solution": {
                "kind": "opaque_callback" if reference is not None else "none",
                "replayable": False,
                "atol": self._reference_atol,
                "rtol": self._reference_rtol,
            },
            "jacobian": {
                "kind": "opaque_callback"
                if jacobian is not None
                else "finite_difference",
                "replayable": False,
            },
        }
        super().__init__(
            "ode",
            "initial_value_problem",
            function=function,
            function_record=function_record,
            numeric_type="binary64",
            variables=[{"name": "t", "shape": []}, {"name": "y", "shape": [len(y0)]}],
            initial_data={"t_span": list(self._t_span), "y0": list(self._y0)},
            tolerances={"rtol": float(rtol), "atol": list(self._atol)},
            method=method,
            resource_budget=resource_budget,
            trace_policy=trace_policy,
            source_intent={
                "language": source_language,
                "source": {} if source is None else source,
            },
            metadata=metadata,
        )

    @property
    def t_span(self) -> tuple[float, float]:
        return self._t_span[0], self._t_span[1]

    @property
    def y0(self) -> tuple[float, ...]:
        return self._y0

    @property
    def atol(self) -> tuple[float, ...]:
        return self._atol

    @property
    def rtol(self) -> float:
        return float(self.tolerances["rtol"])

    @property
    def first_step(self) -> float | None:
        return self._first_step

    @property
    def max_step(self) -> float:
        return self._max_step

    @property
    def min_step(self) -> float:
        return self._min_step

    @property
    def evaluation_times(self) -> tuple[float, ...]:
        return self._evaluation_times

    @property
    def dense_output(self) -> bool:
        return self._dense_output

    @property
    def events(self) -> tuple[OdeEvent, ...]:
        return self._events

    @property
    def invariants(self) -> tuple[OdeInvariant, ...]:
        return self._invariants

    @property
    def reference(self) -> ReferenceFunction | None:
        return self._reference

    @property
    def reference_atol(self) -> float:
        return self._reference_atol

    @property
    def reference_rtol(self) -> float:
        return self._reference_rtol

    @property
    def jacobian(self) -> StateJacobian | None:
        return self._jacobian

    @property
    def ode_budget(self) -> OdeResourceBudget:
        budget = self.resource_budget
        if not isinstance(budget, OdeResourceBudget):
            raise TypeError("ODE problem requires an OdeResourceBudget")
        return budget


class DenseOutputSegment:
    """One quartic-or-lower polynomial valid over an accepted time step."""

    def __init__(
        self,
        t0: float,
        t1: float,
        full_step: float,
        y0: Sequence[float],
        coefficients: Sequence[Sequence[float]],
    ) -> None:
        if full_step == 0:
            raise ValueError("dense-output segment step must be nonzero")
        self._t0 = float(t0)
        self._t1 = float(t1)
        self._step = float(full_step)
        self._y0 = tuple(float(value) for value in y0)
        rows = [tuple(float(value) for value in row) for row in coefficients]
        if len(rows) != len(self._y0) or any(len(row) != 4 for row in rows):
            raise ValueError("dense-output coefficients must have state shape by four")
        self._coefficients = tuple(rows)

    @property
    def t0(self) -> float:
        return self._t0

    @property
    def t1(self) -> float:
        return self._t1

    def contains(self, t: float) -> bool:
        direction = 1.0 if self._t1 >= self._t0 else -1.0
        tolerance = 8.0 * _MACHINE_EPSILON * max(1.0, abs(self._t0), abs(self._t1))
        return (
            direction * (float(t) - self._t0) >= -tolerance
            and direction * (float(t) - self._t1) <= tolerance
        )

    def evaluate(self, t: float) -> list[float]:
        value = float(t)
        if not self.contains(value):
            raise ValueError("dense-output time is outside this segment")
        x = (value - self._t0) / self._step
        powers = (x, x * x, x * x * x, x * x * x * x)
        return [
            self._y0[i]
            + self._step * sum(self._coefficients[i][j] * powers[j] for j in range(4))
            for i in range(len(self._y0))
        ]

    def derivative(self, t: float) -> list[float]:
        value = float(t)
        if not self.contains(value):
            raise ValueError("dense-output time is outside this segment")
        x = (value - self._t0) / self._step
        return [
            row[0] + 2.0 * row[1] * x + 3.0 * row[2] * x * x + 4.0 * row[3] * x * x * x
            for row in self._coefficients
        ]

    def restricted(self, t1: float) -> "DenseOutputSegment":
        """Return the same polynomial with a shorter valid interval."""
        value = float(t1)
        if not self.contains(value):
            raise ValueError("restricted endpoint is outside the dense segment")
        return DenseOutputSegment(
            self._t0,
            value,
            self._step,
            self._y0,
            self._coefficients,
        )

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "t0": self._t0,
            "t1": self._t1,
            "full_step": self._step,
            "y0": list(self._y0),
            "coefficients": [list(row) for row in self._coefficients],
        }


class OdeTrajectory:
    """Accepted knots plus bounded, piecewise-polynomial dense output."""

    def __init__(
        self,
        internal_times: Sequence[float],
        internal_states: Sequence[Sequence[float]],
        segments: Sequence[DenseOutputSegment],
        *,
        requested_times: Sequence[float] = (),
        requested_states: Sequence[Sequence[float]] = (),
    ) -> None:
        self._internal_times = tuple(float(value) for value in internal_times)
        self._internal_states = tuple(
            tuple(float(value) for value in state) for state in internal_states
        )
        self._segments = tuple(segments)
        self._requested_times = tuple(float(value) for value in requested_times)
        self._requested_states = tuple(
            tuple(float(value) for value in state) for state in requested_states
        )
        if len(self._internal_times) != len(self._internal_states):
            raise ValueError("trajectory knot times and states must have equal length")
        if len(self._requested_times) != len(self._requested_states):
            raise ValueError(
                "requested trajectory times and states must have equal length"
            )

    @property
    def times(self) -> tuple[float, ...]:
        return self._requested_times or self._internal_times

    @property
    def states(self) -> tuple[tuple[float, ...], ...]:
        return self._requested_states or self._internal_states

    @property
    def internal_times(self) -> tuple[float, ...]:
        return self._internal_times

    @property
    def internal_states(self) -> tuple[tuple[float, ...], ...]:
        return self._internal_states

    @property
    def segments(self) -> tuple[DenseOutputSegment, ...]:
        return self._segments

    @property
    def final_time(self) -> float:
        return self._internal_times[-1]

    @property
    def final_state(self) -> tuple[float, ...]:
        return self._internal_states[-1]

    def evaluate(self, t: float) -> list[float]:
        value = float(t)
        for segment in self._segments:
            if segment.contains(value):
                return segment.evaluate(value)
        if value == self._internal_times[0]:
            return list(self._internal_states[0])
        raise ValueError("trajectory time is outside the integrated interval")

    __call__ = evaluate

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "times": list(self.times),
            "states": [list(state) for state in self.states],
            "internal_times": list(self._internal_times),
            "internal_states": [list(state) for state in self._internal_states],
            "dense_output": len(self._segments) > 0,
            "segments": [segment.to_dict() for segment in self._segments],
        }


class OdeEventOccurrence:
    """A located and independently residual-checked event crossing."""

    def __init__(
        self,
        event_index: int,
        event: OdeEvent,
        time: float,
        state: Sequence[float],
        value: float,
        bracket: Sequence[float],
        iterations: int,
    ) -> None:
        self.event_index = int(event_index)
        self.name = event.name
        self.time = float(time)
        self.state = tuple(float(item) for item in state)
        self.value = float(value)
        self.terminal = event.terminal
        self.direction = event.direction
        self.bracket = tuple(float(item) for item in bracket)
        self.iterations = int(iterations)
        self.residual_passed = abs(self.value) <= event.value_tolerance

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "event_index": self.event_index,
            "name": self.name,
            "time": self.time,
            "state": list(self.state),
            "value": self.value,
            "terminal": self.terminal,
            "direction": self.direction,
            "bracket": list(self.bracket),
            "location_iterations": self.iterations,
            "residual_passed": self.residual_passed,
        }


class OdeResult(NumericalResult):
    """A common numerical result envelope with typed ODE trajectory evidence."""

    def __init__(
        self,
        problem: OdeProblem,
        plan: NumericalPlan,
        *,
        success: bool,
        status: str,
        termination_reason: str,
        trajectory: OdeTrajectory,
        validation: NumericalValidation,
        diagnostics: Sequence[Any],
        iterations: int,
        evaluations: int,
        elapsed_ms: float,
        trace: NumericalTrace,
        occurrences: Sequence[OdeEventOccurrence],
        evidence: Mapping[str, Any],
        measurements: Mapping[str, Any],
    ) -> None:
        self._trajectory = trajectory
        self._occurrences = tuple(occurrences)
        self._evidence = materialize_object(evidence, "$.ode.evidence")
        self._termination_reason = str(termination_reason)
        domain_payload = {
            "trajectory": trajectory.to_dict(),
            "events": [item.to_dict() for item in occurrences],
            "termination_reason": self._termination_reason,
            "evidence": self._evidence,
            "limitations": {
                "local_error_is_not_global_error_bound": True,
                "event_detection_requires_a_sampled_sign_change": True,
                "stiff_methods_supported": plan.method == "rosenbrock4",
                "stiffness_detection_supported": False,
            },
        }
        super().__init__(
            problem,
            plan,
            success=success,
            status=status,
            value=list(trajectory.final_state),
            validation=validation,
            diagnostics=diagnostics,
            iterations=iterations,
            evaluations=evaluations,
            elapsed_ms=elapsed_ms,
            trace=trace,
            measurements=measurements,
            provenance={
                "implementation": "sagejs.numerics.ode",
                "implementation_kind": "ordinary_python",
                "source_transparent": True,
                "algorithm_family": "linearly_implicit_rosenbrock"
                if plan.method == "rosenbrock4"
                else "explicit_runge_kutta",
                "dense_output": "quartic"
                if plan.method == "rk45"
                else "rosenbrock_cubic"
                if plan.method == "rosenbrock4"
                else "cubic_hermite",
            },
            domain_payload=domain_payload,
        )

    @property
    def trajectory(self) -> OdeTrajectory:
        return self._trajectory

    @property
    def events(self) -> tuple[OdeEventOccurrence, ...]:
        return self._occurrences

    @property
    def evidence(self) -> dict[str, JSONValue]:
        return materialize_object(self._evidence, "$.ode.evidence")

    @property
    def termination_reason(self) -> str:
        return self._termination_reason

    def explain(self) -> str:
        local_value = self._evidence.get("local_error_control", {})
        residual_value = self._evidence.get("dense_defect", {})
        local = local_value if isinstance(local_value, dict) else {}
        residual = residual_value if isinstance(residual_value, dict) else {}
        lines = [
            self.method
            + (
                " linearly implicit Rosenbrock IVP"
                if self.method == "rosenbrock4"
                else " explicit Runge-Kutta IVP"
            ),
            "status: " + self.status + " (" + self._termination_reason + ")",
            "interval: "
            + str(self._trajectory.internal_times[0])
            + " to "
            + str(self._trajectory.final_time),
            "accepted/rejected steps: "
            + str(local.get("accepted_steps", self.iterations))
            + "/"
            + str(local.get("rejected_steps", 0)),
            "solver callback evaluations: " + str(self.evaluations),
            "validation: "
            + self.validation.truth_level
            + ("; passed" if self.validation.passed else "; not passed"),
        ]
        if residual.get("sample_count", 0):
            lines.append(
                "maximum sampled dense-output defect: "
                + str(residual.get("max_abs_defect"))
            )
        if self._occurrences:
            lines.append("events located: " + str(len(self._occurrences)))
        lines.append(
            "local error estimates control each accepted step; they are not a global error bound"
        )
        return "\n".join(lines)

    def plot(self, kind: str = "trajectory") -> Any:
        from .visualization import ode_plot

        return ode_plot(self, kind=kind)

    def animate(self, kind: str = "trajectory") -> Any:
        from .visualization import ode_animation

        return ode_animation(self, kind=kind)
