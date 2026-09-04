"""Thin ODE adapter for deterministic bounded numerical parameter sweeps."""

from __future__ import annotations

from collections.abc import Callable, Mapping, Sequence
from typing import Any

from .._json import JSONValue
from ..sweeps import (
    SweepBudget,
    SweepItemContext,
    SweepItemResult,
    SweepPlan,
    SweepResult,
    plan_parameter_sweep,
    run_parameter_sweep,
)
from .capabilities import plan_ode
from .model import OdeProblem
from .rosenbrock import rosenbrock4_workspace_bytes
from .solvers import solve_ode_problem

OdeProblemFactory = Callable[[JSONValue, "OdeSweepLimits"], OdeProblem]
SweepBatchExecutor = Callable[
    [Sequence[Callable[[], SweepItemResult]]], Sequence[SweepItemResult]
]


class OdeSweepLimits:
    """Deterministic per-item seed and remaining scheduler limits.

    A problem factory must construct an `OdeProblem` whose callback and elapsed
    budgets do not exceed these limits. The adapter verifies that contract
    before running the solver.
    """

    def __init__(
        self,
        *,
        seed: int,
        seed_index: int,
        max_evaluations: int,
        max_elapsed_ms: int,
    ) -> None:
        self._seed = int(seed)
        self._seed_index = int(seed_index)
        self._max_evaluations = int(max_evaluations)
        self._max_elapsed_ms = int(max_elapsed_ms)

    @property
    def seed(self) -> int:
        return self._seed

    @property
    def seed_index(self) -> int:
        return self._seed_index

    @property
    def max_evaluations(self) -> int:
        return self._max_evaluations

    @property
    def max_elapsed_ms(self) -> int:
        return self._max_elapsed_ms

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "seed": self._seed,
            "seed_index": self._seed_index,
            "max_evaluations": self._max_evaluations,
            "max_elapsed_ms": self._max_elapsed_ms,
        }


class OdeSweepSolveError(RuntimeError):
    """A completed nested ODE solve that did not validate successfully."""

    def __init__(self, status: str, termination_reason: str) -> None:
        self.status = str(status)
        self.termination_reason = str(termination_reason)
        super().__init__(self.status + "/" + self.termination_reason)


def _logical_memory_reservation(problem: OdeProblem) -> int:
    """Return a conservative logical bound for one retained ODE result."""
    dimension = len(problem.y0)
    budget = problem.ode_budget
    planned = plan_ode(problem)
    workspace = (
        rosenbrock4_workspace_bytes(dimension) if planned.method == "rosenbrock4" else 0
    )
    # Internal states, requested states, event states, dense coefficients,
    # scalar records, and list/object overhead are bounded by the same output
    # limit. Validation samples are separately bounded.
    retained = 64 * (7 * dimension + 16) * budget.max_output_points
    validation = 64 * (3 * dimension + 16) * budget.max_validation_evaluations
    return max(1, workspace + retained + validation + budget.max_trace_bytes)


def _factory_record(record: Mapping[str, Any] | None) -> Mapping[str, Any]:
    if record is not None:
        return record
    return {
        "kind": "ode_problem_factory",
        "replayable": False,
        "result": "OdeProblem",
    }


def _numeric_field(record: Mapping[str, JSONValue], name: str) -> int | float:
    value = record.get(name, 0)
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return 0
    return value


def _measurement_field(record: Mapping[str, JSONValue], name: str) -> int | float:
    measurements = record.get("measurements")
    if not isinstance(measurements, dict):
        return 0
    return _numeric_field(measurements, name)


def plan_ode_parameter_sweep(
    parameters: Sequence[Any],
    *,
    budget: SweepBudget | None = None,
    seed: int = 0,
    seed_offset: int = 0,
    concurrency: int = 1,
    mode: str = "collect",
    problem_factory_record: Mapping[str, Any] | None = None,
    executor_record: Mapping[str, Any] | None = None,
    has_batch_executor: bool = False,
    concurrency_fallback: str = "sequential",
) -> SweepPlan:
    """Return a zero-callback ODE sweep dispatch plan."""
    plan = plan_parameter_sweep(
        parameters,
        budget=budget,
        seed=seed,
        seed_offset=seed_offset,
        concurrency=concurrency,
        mode=mode,
        callback_record=_factory_record(problem_factory_record),
        executor_record=executor_record,
        has_batch_executor=has_batch_executor,
        concurrency_fallback=concurrency_fallback,
    )
    for index in range(plan.item_count):
        if plan.quota(index)["evaluations"] < 2:
            raise ValueError(
                "an ODE sweep requires one factory credit and at least one nested solver evaluation per item"
            )
    return plan


def run_ode_parameter_sweep(
    parameters: Sequence[Any],
    problem_factory: OdeProblemFactory,
    *,
    budget: SweepBudget | None = None,
    seed: int = 0,
    seed_offset: int = 0,
    concurrency: int = 1,
    mode: str = "collect",
    cancel: Callable[[], Any] | None = None,
    batch_executor: SweepBatchExecutor | None = None,
    problem_factory_record: Mapping[str, Any] | None = None,
    executor_record: Mapping[str, Any] | None = None,
    cancel_record: Mapping[str, Any] | None = None,
    concurrency_fallback: str = "sequential",
) -> SweepResult:
    """Construct, solve, and account for one `OdeProblem` per parameter.

    The shared scheduler owns ordering, seeds, batching, cancellation,
    fail-fast behavior, and aggregate limits. The adapter reserves a logical
    ODE memory bound before solving, charges the exact nested callback count,
    and returns each successful detached `OdeResult` record.
    """
    if not callable(problem_factory):
        raise TypeError("ODE sweep problem_factory must be callable")
    selected_budget = SweepBudget() if budget is None else budget
    plan_ode_parameter_sweep(
        parameters,
        budget=selected_budget,
        seed=seed,
        seed_offset=seed_offset,
        concurrency=concurrency,
        mode=mode,
        problem_factory_record=problem_factory_record,
        executor_record=executor_record,
        has_batch_executor=batch_executor is not None,
        concurrency_fallback=concurrency_fallback,
    )

    def evaluate(parameter: JSONValue, context: SweepItemContext) -> JSONValue:
        context.check()
        limits = OdeSweepLimits(
            seed=context.seed,
            seed_index=context.seed_index,
            max_evaluations=context.remaining_evaluations,
            max_elapsed_ms=max(1, int(context.remaining_elapsed_ms)),
        )
        problem = problem_factory(parameter, limits)
        context.check()
        if not isinstance(problem, OdeProblem):
            raise TypeError("ODE sweep problem_factory must return an OdeProblem")
        if problem.ode_budget.max_evaluations > limits.max_evaluations:
            raise ValueError(
                "nested ODE max_evaluations exceeds its deterministic sweep credit"
            )
        if problem.ode_budget.max_elapsed_ms > limits.max_elapsed_ms:
            raise ValueError(
                "nested ODE max_elapsed_ms exceeds the remaining sweep deadline"
            )
        memory_reservation = _logical_memory_reservation(problem)
        context.reserve_memory(memory_reservation)
        context.emit(
            "ode_start",
            {
                "method": plan_ode(problem).method,
                "logical_memory_reservation_bytes": memory_reservation,
            },
        )
        try:
            result = solve_ode_problem(problem, cancel=cancel)
            if result.evaluations:
                context.consume_evaluations(result.evaluations)
            record = result.to_dict()
            context.emit(
                "ode_finish",
                {
                    "success": result.success,
                    "status": result.status,
                    "termination_reason": result.termination_reason,
                    "evaluations": result.evaluations,
                    "iterations": result.iterations,
                    "elapsed_ms": _numeric_field(record, "elapsed_ms"),
                    "estimated_workspace_bytes": _measurement_field(
                        record, "estimated_workspace_bytes"
                    ),
                    "retained_trace_bytes": _measurement_field(
                        record, "retained_trace_bytes"
                    ),
                    "stored_internal_points": _measurement_field(
                        record, "stored_internal_points"
                    ),
                    "stored_dense_segments": _measurement_field(
                        record, "stored_dense_segments"
                    ),
                },
            )
            if not result.success:
                raise OdeSweepSolveError(result.status, result.termination_reason)
            return record
        finally:
            context.release_memory(memory_reservation)

    return run_parameter_sweep(
        parameters,
        evaluate,
        budget=selected_budget,
        seed=seed,
        seed_offset=seed_offset,
        concurrency=concurrency,
        mode=mode,
        cancel=cancel,
        batch_executor=batch_executor,
        callback_record=_factory_record(problem_factory_record),
        executor_record=executor_record,
        cancel_record=cancel_record,
        concurrency_fallback=concurrency_fallback,
    )


__all__ = [
    "OdeProblemFactory",
    "OdeSweepLimits",
    "OdeSweepSolveError",
    "plan_ode_parameter_sweep",
    "run_ode_parameter_sweep",
]
