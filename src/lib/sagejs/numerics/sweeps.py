"""Deterministic, resource-bounded numerical parameter sweeps.

The scheduler in this module deliberately does not import a thread, process,
or browser-worker runtime.  Its default executor is sequential.  Hosts that
can execute independent Python callables concurrently may supply a synchronous
batch executor; the scheduler still owns stable ordering, fixed resource
credits, failure policy, and provenance.

Aggregate evaluation, memory, trace, and result budgets are divided into fixed
per-item credits before execution.  Consequently a different completion order
cannot spend a different amount of the global budget.  Memory accounting is
cooperative: callbacks reserve bytes before allocating them and release bytes
when possible.  Serialized inputs and outputs are always measured directly.
"""

from __future__ import annotations

import hashlib
import json
import time
from collections.abc import Callable, Mapping, Sequence
from typing import Any

from ._json import (
    JSONValue,
    canonical_json,
    materialize_array,
    materialize_json,
    materialize_object,
)

SWEEP_SCHEMA_VERSION = 1
SWEEP_SEED_ALGORITHM = "xorshift32-pair-index-v1"
SWEEP_SCHEDULER = "bounded-batch-v1"

SWEEP_MODES = ("collect", "fail_fast")
SWEEP_ITEM_STATUSES = (
    "completed",
    "callback_error",
    "invalid_result",
    "cancelled",
    "maximum_elapsed_time",
    "maximum_evaluations",
    "memory_budget_exceeded",
    "result_budget_exceeded",
    "executor_error",
    "skipped_fail_fast",
    "skipped_cancelled",
    "skipped_elapsed_time",
)

_MAX_SAFE_INTEGER = 9_007_199_254_740_991


def sweep_capabilities() -> dict[str, JSONValue]:
    """Return the public generic bounded-sweep capability document."""
    return {
        "schema_version": SWEEP_SCHEMA_VERSION,
        "domain": "sweeps",
        "operations": {
            "parameter_sweep": {
                "classification": "extension",
                "methods": {
                    SWEEP_SCHEDULER: {
                        "classification": "extension",
                        "backend": "ordinary-python",
                        "ordering": "stable_input_order",
                        "failure_modes": list(SWEEP_MODES),
                        "seed_algorithm": SWEEP_SEED_ALGORITHM,
                        "implementation_targets": {
                            "platforms": [
                                "linux-x64",
                                "linux-arm64",
                                "macos-arm64",
                                "windows-x64",
                            ],
                            "runtimes": ["browser", "node", "sea"],
                        },
                        "receipt_qualification": {
                            "status": "unqualified_in_public_registry",
                            "platforms": [],
                            "runtimes": [],
                            "receipt_sha256": [],
                        },
                    }
                },
                "resource_budgets": {
                    "hard": [
                        "max_items",
                        "max_input_bytes",
                        "max_result_bytes",
                        "max_evaluations",
                        "max_elapsed_ms",
                        "max_trace_events",
                        "max_trace_bytes",
                        "max_concurrency",
                    ],
                    "cooperative": ["max_memory_bytes", "cancellation"],
                    "unsupported": ["max_callback_depth", "max_allocation_bytes"],
                },
                "frontends": {
                    "sage": "run_parameter_sweep",
                    "python-scipy": "sagejs.run_parameter_sweep",
                    "matlab": "arrayfun (input translation only)",
                    "wolfram": "Map (input translation only)",
                },
            }
        },
    }


def _positive_integer(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise ValueError(name + " must be a positive integer")
    if value > _MAX_SAFE_INTEGER:
        raise ValueError(name + " must not exceed the exact JSON integer range")
    return value


def _nonnegative_integer(value: Any, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(name + " must be a nonnegative integer")
    if value > _MAX_SAFE_INTEGER:
        raise ValueError(name + " must not exceed the exact JSON integer range")
    return value


def _encoded_bytes(value: Any) -> int:
    return len(canonical_json(value).encode("utf-8"))


def _canonical_materialized_json(value: JSONValue) -> str:
    """Encode an already detached finite JSON value without copying it again."""
    return json.dumps(
        value,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def _encoded_materialized_bytes(value: JSONValue) -> int:
    return len(_canonical_materialized_json(value).encode("utf-8"))


def _quota(total: int, count: int, index: int) -> int:
    """Return the stable equal-share credit for item `index`."""
    if count == 0:
        return 0
    quotient, remainder = divmod(total, count)
    return quotient + (1 if index < remainder else 0)


def _derive_seed(master_seed: int, seed_index: int) -> int:
    mask = 4_294_967_295

    def mix32(value: int) -> int:
        answer = value & mask
        answer ^= (answer << 13) & mask
        answer ^= answer >> 17
        answer ^= (answer << 5) & mask
        return answer & mask

    folded_master = (master_seed & mask) ^ ((master_seed >> 32) & mask)
    logical_index = seed_index & mask
    low = mix32(folded_master ^ ((logical_index + 2_654_435_769) & mask))
    high = mix32(
        folded_master ^ ((logical_index + 2_246_822_519) & mask) ^ 2_776_037_531
    )
    # Twenty high bits plus 32 low bits remain exact in JSON and JavaScript.
    return (high & 1_048_575) * 4_294_967_296 + low


class SweepBudget:
    """Hard aggregate limits for one parameter sweep.

    `max_memory_bytes` applies to cooperative callback reservations.
    `max_input_bytes` and `max_result_bytes` are enforced from canonical UTF-8
    JSON and therefore do not rely on host memory instrumentation.
    """

    def __init__(
        self,
        *,
        max_items: int = 256,
        max_concurrency: int = 8,
        max_evaluations: int = 100_000,
        max_elapsed_ms: int = 30_000,
        max_memory_bytes: int = 268_435_456,
        max_input_bytes: int = 8_388_608,
        max_result_bytes: int = 33_554_432,
        max_trace_events: int = 4096,
        max_trace_bytes: int = 8_388_608,
    ) -> None:
        self._values = {
            "max_items": _positive_integer(max_items, "max_items"),
            "max_concurrency": _positive_integer(max_concurrency, "max_concurrency"),
            "max_evaluations": _positive_integer(max_evaluations, "max_evaluations"),
            "max_elapsed_ms": _positive_integer(max_elapsed_ms, "max_elapsed_ms"),
            "max_memory_bytes": _positive_integer(max_memory_bytes, "max_memory_bytes"),
            "max_input_bytes": _positive_integer(max_input_bytes, "max_input_bytes"),
            "max_result_bytes": _positive_integer(max_result_bytes, "max_result_bytes"),
            "max_trace_events": _positive_integer(max_trace_events, "max_trace_events"),
            "max_trace_bytes": _positive_integer(max_trace_bytes, "max_trace_bytes"),
        }

    def __getattr__(self, name: str) -> int:
        if name not in self._values:
            raise AttributeError(name)
        return self._values[name]

    def to_dict(self) -> dict[str, JSONValue]:
        return dict(self._values)


class SweepPlan:
    """Immutable dispatch plan produced before any callback is evaluated."""

    def __init__(
        self,
        parameters: Sequence[Any],
        *,
        budget: SweepBudget,
        seed: int,
        seed_offset: int,
        requested_concurrency: int,
        effective_concurrency: int,
        mode: str,
        callback_record: Mapping[str, Any],
        executor_record: Mapping[str, Any],
        fallback_reason: str | None,
    ) -> None:
        self._parameters = materialize_array(parameters, "$.sweep.parameters")
        self._budget = budget
        self._seed = seed
        self._seed_offset = seed_offset
        self._requested_concurrency = requested_concurrency
        self._effective_concurrency = effective_concurrency
        self._mode = mode
        self._callback_record = materialize_object(callback_record, "$.sweep.callback")
        self._executor_record = materialize_object(executor_record, "$.sweep.executor")
        self._fallback_reason = fallback_reason
        count = len(self._parameters)
        quotas: list[dict[str, int]] = []
        for index in range(count):
            quotas.append(
                {
                    "evaluations": _quota(budget.max_evaluations, count, index),
                    "memory_bytes": _quota(budget.max_memory_bytes, count, index),
                    "result_bytes": _quota(budget.max_result_bytes, count, index),
                    "trace_events": _quota(budget.max_trace_events, count, index),
                    "trace_bytes": _quota(budget.max_trace_bytes, count, index),
                }
            )
        self._quotas = quotas
        self._seeds = [
            _derive_seed(self._seed, self._seed_offset + index)
            for index in range(count)
        ]
        self._digest: str | None = None

    @property
    def parameters(self) -> list[JSONValue]:
        return materialize_array(self._parameters, "$.sweep.parameters")

    @property
    def budget(self) -> SweepBudget:
        return self._budget

    @property
    def seed(self) -> int:
        return self._seed

    @property
    def seed_offset(self) -> int:
        return self._seed_offset

    @property
    def mode(self) -> str:
        return self._mode

    @property
    def requested_concurrency(self) -> int:
        return self._requested_concurrency

    @property
    def effective_concurrency(self) -> int:
        return self._effective_concurrency

    @property
    def item_count(self) -> int:
        return len(self._parameters)

    def item_parameter(self, index: int) -> JSONValue:
        """Return one detached parameter without copying the complete sweep."""
        if index < 0 or index >= len(self._parameters):
            raise IndexError("sweep item index out of range")
        return materialize_json(
            self._parameters[index], "$.sweep.parameters[" + str(index) + "]"
        )

    def quota(self, index: int) -> dict[str, int]:
        if index < 0 or index >= len(self._quotas):
            raise IndexError("sweep item index out of range")
        return dict(self._quotas[index])

    def item_seed(self, index: int) -> int:
        if index < 0 or index >= len(self._parameters):
            raise IndexError("sweep item index out of range")
        return self._seeds[index]

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "schema_version": SWEEP_SCHEMA_VERSION,
            "operation": "parameter_sweep",
            "mode": self._mode,
            "parameters": self.parameters,
            "budget": self._budget.to_dict(),
            "requested_concurrency": self._requested_concurrency,
            "effective_concurrency": self._effective_concurrency,
            "fallback_reason": self._fallback_reason,
            "master_seed": self._seed,
            "seed_offset": self._seed_offset,
            "seed_algorithm": SWEEP_SEED_ALGORITHM,
            "scheduler": SWEEP_SCHEDULER,
            "callback": materialize_object(self._callback_record, "$.sweep.callback"),
            "executor": materialize_object(self._executor_record, "$.sweep.executor"),
            "item_credits": materialize_array(self._quotas, "$.sweep.item_credits"),
        }

    @property
    def digest(self) -> str:
        if self._digest is None:
            self._digest = hashlib.sha256(
                _canonical_materialized_json(self.to_dict()).encode("utf-8")
            ).hexdigest()
        return self._digest


class _SweepControl(Exception):
    def __init__(self, status: str, resource: str | None = None) -> None:
        self.status = status
        self.resource = resource
        super().__init__(status)


class _SweepCallbackFailure(Exception):
    def __init__(self, error: Exception, phase: str) -> None:
        self.error = error
        self.phase = phase
        super().__init__(str(error))


class SweepItemContext:
    """One evaluator's deterministic seed, credits, cancellation, and trace."""

    def __init__(
        self,
        *,
        index: int,
        seed_index: int,
        seed: int,
        quota: Mapping[str, int],
        started_at: float,
        deadline: float,
        cancel: Callable[[], Any] | None,
    ) -> None:
        self._index = index
        self._seed_index = seed_index
        self._seed = seed
        self._quota = {str(key): int(quota[key]) for key in quota}
        self._started_at = started_at
        self._deadline = deadline
        self._cancel = cancel
        self._evaluations = 0
        self._memory_current = 0
        self._memory_peak = 0
        self._trace: list[dict[str, JSONValue]] = []
        self._trace_bytes = 0
        self._trace_observed = 0
        self._trace_dropped = 0

    @property
    def index(self) -> int:
        return self._index

    @property
    def seed_index(self) -> int:
        return self._seed_index

    @property
    def seed(self) -> int:
        return self._seed

    @property
    def evaluations(self) -> int:
        return self._evaluations

    @property
    def memory_peak_bytes(self) -> int:
        return self._memory_peak

    @property
    def remaining_evaluations(self) -> int:
        return self._quota["evaluations"] - self._evaluations

    @property
    def remaining_elapsed_ms(self) -> float:
        return max(0.0, (self._deadline - time.perf_counter()) * 1000.0)

    def check(self) -> None:
        """Cooperatively check the global deadline and cancellation signal."""
        if time.perf_counter() >= self._deadline:
            raise _SweepControl("maximum_elapsed_time", "elapsed_time")
        if self._cancel is None:
            return
        try:
            cancelled = bool(self._cancel())
        except Exception as error:
            raise _SweepCallbackFailure(error, "cancellation") from error
        if cancelled:
            raise _SweepControl("cancelled", "cancellation")

    def consume_evaluations(self, count: int = 1) -> None:
        """Charge work already performed by a nested numerical operation."""
        amount = _positive_integer(count, "evaluation count")
        self.check()
        if self._evaluations + amount > self._quota["evaluations"]:
            raise _SweepControl("maximum_evaluations", "evaluations")
        self._evaluations += amount

    def evaluate(self, function: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        """Evaluate one counted live callback inside this item's credits."""
        if not callable(function):
            raise TypeError("evaluated object must be callable")
        self.consume_evaluations(1)
        try:
            value = function(*args, **kwargs)
        except Exception as error:
            raise _SweepCallbackFailure(error, "nested_callback") from error
        self.check()
        return value

    def reserve_memory(self, byte_count: int) -> None:
        """Reserve cooperative live memory before allocating it."""
        amount = _positive_integer(byte_count, "memory reservation")
        self.check()
        if self._memory_current + amount > self._quota["memory_bytes"]:
            raise _SweepControl("memory_budget_exceeded", "memory")
        self._memory_current += amount
        self._memory_peak = max(self._memory_peak, self._memory_current)

    def release_memory(self, byte_count: int) -> None:
        amount = _positive_integer(byte_count, "memory release")
        if amount > self._memory_current:
            raise ValueError("cannot release more sweep memory than is reserved")
        self._memory_current -= amount

    def emit(self, kind: str, data: Mapping[str, Any] | None = None) -> bool:
        """Append one bounded semantic event, or deterministically drop it."""
        if not isinstance(kind, str) or kind == "":
            raise TypeError("sweep trace kind must be a nonempty string")
        self._trace_observed += 1
        event = materialize_object(
            {
                "sequence": self._trace_observed - 1,
                "kind": kind,
                "data": {} if data is None else data,
            },
            "$.sweep.trace.event",
        )
        event_bytes = _encoded_bytes(event)
        if (
            len(self._trace) >= self._quota["trace_events"]
            or self._trace_bytes + event_bytes > self._quota["trace_bytes"]
        ):
            self._trace_dropped += 1
            return False
        self._trace.append(event)
        self._trace_bytes += event_bytes
        return True

    def trace_record(self) -> dict[str, JSONValue]:
        return {
            "observed_events": self._trace_observed,
            "retained_events": len(self._trace),
            "dropped_events": self._trace_dropped,
            "retained_bytes": self._trace_bytes,
            "events": materialize_array(self._trace, "$.sweep.trace.events"),
        }

    def measurements(
        self, elapsed_ms: float, result_bytes: int
    ) -> dict[str, JSONValue]:
        return {
            "evaluations": self._evaluations,
            "elapsed_ms": max(0.0, float(elapsed_ms)),
            "memory_peak_bytes": self._memory_peak,
            "result_bytes": result_bytes,
            "trace_events": len(self._trace),
            "trace_bytes": self._trace_bytes,
            "trace_events_dropped": self._trace_dropped,
        }


class SweepItemResult:
    """Structured success or failure for exactly one input item."""

    def __init__(
        self,
        *,
        index: int,
        seed_index: int,
        seed: int,
        parameter: Any,
        success: bool,
        status: str,
        value: Any = None,
        error: Mapping[str, Any] | None = None,
        measurements: Mapping[str, Any] | None = None,
        trace: Mapping[str, Any] | None = None,
        credits: Mapping[str, Any] | None = None,
    ) -> None:
        if status not in SWEEP_ITEM_STATUSES:
            raise ValueError("unknown sweep item status: " + status)
        self._index = index
        self._seed_index = seed_index
        self._seed = seed
        self._parameter = materialize_json(parameter, "$.sweep.item.parameter")
        self._success = bool(success)
        self._status = status
        self._value = materialize_json(value, "$.sweep.item.value")
        self._error = materialize_object(error, "$.sweep.item.error")
        self._measurements = materialize_object(
            measurements, "$.sweep.item.measurements"
        )
        self._trace = materialize_object(trace, "$.sweep.item.trace")
        self._credits = materialize_object(credits, "$.sweep.item.credits")

    @property
    def index(self) -> int:
        return self._index

    @property
    def success(self) -> bool:
        return self._success

    @property
    def status(self) -> str:
        return self._status

    @property
    def seed(self) -> int:
        return self._seed

    @property
    def value(self) -> JSONValue:
        return materialize_json(self._value, "$.sweep.item.value")

    def to_dict(self) -> dict[str, JSONValue]:
        return {
            "index": self._index,
            "seed_index": self._seed_index,
            "seed": self._seed,
            "parameter": materialize_json(self._parameter, "$.sweep.item.parameter"),
            "success": self._success,
            "status": self._status,
            "value": self.value,
            "error": materialize_object(self._error, "$.sweep.item.error"),
            "measurements": materialize_object(
                self._measurements, "$.sweep.item.measurements"
            ),
            "trace": materialize_object(self._trace, "$.sweep.item.trace"),
            "credits": materialize_object(self._credits, "$.sweep.item.credits"),
        }

    def measurement_integer(self, name: str) -> int:
        """Return one validated nonnegative integer measurement."""
        value = self._measurements.get(name, 0)
        if isinstance(value, bool) or not isinstance(value, int) or value < 0:
            return 0
        return value


class SweepResult:
    """Stable ordered sweep outcomes plus aggregate resource evidence."""

    def __init__(
        self,
        plan: SweepPlan,
        items: Sequence[SweepItemResult],
        *,
        status: str,
        elapsed_ms: float,
        cancel_record: Mapping[str, Any],
    ) -> None:
        self._plan = plan
        self._items = tuple(items)
        self._status = str(status)
        self._elapsed_ms = max(0.0, float(elapsed_ms))
        self._cancel_record = materialize_object(cancel_record, "$.sweep.cancellation")

    @property
    def plan(self) -> SweepPlan:
        return self._plan

    @property
    def items(self) -> tuple[SweepItemResult, ...]:
        return tuple(self._items)

    @property
    def status(self) -> str:
        return self._status

    @property
    def success(self) -> bool:
        return all(item.success for item in self._items)

    def to_dict(self) -> dict[str, JSONValue]:
        records = [item.to_dict() for item in self._items]
        completed = sum(
            1 for item in self._items if not item.status.startswith("skipped_")
        )
        skipped = len(self._items) - completed
        failed = sum(
            1
            for item in self._items
            if not item.success and not item.status.startswith("skipped_")
        )
        evaluations = sum(
            item.measurement_integer("evaluations") for item in self._items
        )
        memory_upper_bound = sum(
            item.measurement_integer("memory_peak_bytes") for item in self._items
        )
        trace_events = sum(
            item.measurement_integer("trace_events") for item in self._items
        )
        trace_bytes = sum(
            item.measurement_integer("trace_bytes") for item in self._items
        )
        result_bytes = sum(
            item.measurement_integer("result_bytes") for item in self._items
        )
        plan_record = self._plan.to_dict()
        callback_record = plan_record["callback"]
        executor_record = plan_record["executor"]
        replayable = (
            isinstance(callback_record, dict)
            and callback_record.get("replayable") is True
            and isinstance(executor_record, dict)
            and executor_record.get("replayable") is True
            and self._cancel_record.get("replayable") is True
        )
        return {
            "schema_version": SWEEP_SCHEMA_VERSION,
            "operation": "parameter_sweep",
            "success": self.success,
            "status": self._status,
            "plan_digest": self._plan.digest,
            "items": materialize_array(records, "$.sweep.result.items"),
            "counts": {
                "planned": len(self._items),
                "completed": completed,
                "failed": failed,
                "skipped": skipped,
            },
            "measurements": {
                "elapsed_ms": self._elapsed_ms,
                "evaluations": evaluations,
                "memory_peak_upper_bound_bytes": memory_upper_bound,
                "result_bytes": result_bytes,
                "trace_events": trace_events,
                "trace_bytes": trace_bytes,
            },
            "provenance": {
                "scheduler": SWEEP_SCHEDULER,
                "seed_algorithm": SWEEP_SEED_ALGORITHM,
                "master_seed": self._plan.seed,
                "seed_offset": self._plan.seed_offset,
                "callback": callback_record,
                "executor": executor_record,
                "cancellation": materialize_object(
                    self._cancel_record, "$.sweep.cancellation"
                ),
            },
            "reproducibility": {
                "replayable": replayable,
                "plan": plan_record,
            },
        }

    def to_json(self) -> str:
        return _canonical_materialized_json(self.to_dict())


def plan_parameter_sweep(
    parameters: Sequence[Any],
    *,
    budget: SweepBudget | None = None,
    seed: int = 0,
    seed_offset: int = 0,
    concurrency: int = 1,
    mode: str = "collect",
    callback_record: Mapping[str, Any] | None = None,
    executor_record: Mapping[str, Any] | None = None,
    has_batch_executor: bool = False,
) -> SweepPlan:
    """Validate inputs and return a zero-callback sweep plan."""
    if isinstance(parameters, (str, bytes, bytearray)) or not isinstance(
        parameters, Sequence
    ):
        raise TypeError("sweep parameters must be a finite sequence")
    selected_budget = SweepBudget() if budget is None else budget
    if not isinstance(selected_budget, SweepBudget):
        raise TypeError("budget must be a SweepBudget")
    requested = _positive_integer(concurrency, "concurrency")
    if requested > selected_budget.max_concurrency:
        raise ValueError("concurrency exceeds the sweep max_concurrency budget")
    master_seed = _nonnegative_integer(seed, "seed")
    offset = _nonnegative_integer(seed_offset, "seed_offset")
    if mode not in SWEEP_MODES:
        raise ValueError("sweep mode must be collect or fail_fast")
    values = materialize_array(parameters, "$.sweep.parameters")
    if offset + len(values) > 4_294_967_296:
        raise ValueError("seed_offset plus item count exceeds the seed-index range")
    if len(values) > selected_budget.max_items:
        raise ValueError("sweep parameter count exceeds max_items")
    if len(values) > selected_budget.max_evaluations:
        raise ValueError(
            "max_evaluations must provide at least one credit per sweep item"
        )
    if _encoded_bytes(values) > selected_budget.max_input_bytes:
        raise ValueError("serialized sweep inputs exceed max_input_bytes")
    fallback_reason = None
    effective = requested
    if not has_batch_executor:
        effective = 1
        if requested > 1:
            fallback_reason = (
                "no batch executor supplied; using portable sequential execution"
            )
    callback = (
        {"kind": "opaque_callback", "replayable": False}
        if callback_record is None
        else callback_record
    )
    executor = executor_record
    if executor is None:
        if has_batch_executor:
            executor = {"kind": "custom_batch_executor", "replayable": False}
        else:
            executor = {
                "kind": "sequential",
                "name": "portable-sequential",
                "replayable": True,
            }
    return SweepPlan(
        values,
        budget=selected_budget,
        seed=master_seed,
        seed_offset=offset,
        requested_concurrency=requested,
        effective_concurrency=effective,
        mode=mode,
        callback_record=callback,
        executor_record=executor,
        fallback_reason=fallback_reason,
    )


def _error_record(error: Exception, phase: str) -> dict[str, JSONValue]:
    return {
        "phase": phase,
        "type": type(error).__name__,
        "message": str(error),
    }


def _empty_trace() -> dict[str, JSONValue]:
    return {
        "observed_events": 0,
        "retained_events": 0,
        "dropped_events": 0,
        "retained_bytes": 0,
        "events": [],
    }


def _skipped_item(plan: SweepPlan, index: int, status: str) -> SweepItemResult:
    return SweepItemResult(
        index=index,
        seed_index=plan.seed_offset + index,
        seed=plan.item_seed(index),
        parameter=plan.item_parameter(index),
        success=False,
        status=status,
        measurements={
            "evaluations": 0,
            "elapsed_ms": 0.0,
            "memory_peak_bytes": 0,
            "result_bytes": 0,
            "trace_events": 0,
            "trace_bytes": 0,
            "trace_events_dropped": 0,
        },
        trace=_empty_trace(),
        credits=plan.quota(index),
    )


def _run_item(
    plan: SweepPlan,
    index: int,
    evaluator: Callable[[Any, SweepItemContext], Any],
    cancel: Callable[[], Any] | None,
    sweep_started_at: float,
    deadline: float,
) -> SweepItemResult:
    started_at = time.perf_counter()
    quota = plan.quota(index)
    context = SweepItemContext(
        index=index,
        seed_index=plan.seed_offset + index,
        seed=plan.item_seed(index),
        quota=quota,
        started_at=sweep_started_at,
        deadline=deadline,
        cancel=cancel,
    )
    value: JSONValue = None
    result_bytes = 0
    error_record: dict[str, JSONValue] = {}
    success = False
    status = "callback_error"
    try:
        # The outer evaluator invocation itself consumes one evaluation credit.
        context.consume_evaluations(1)
        raw_value = evaluator(plan.item_parameter(index), context)
        context.check()
        if hasattr(raw_value, "to_dict") and callable(raw_value.to_dict):
            raw_value = raw_value.to_dict()
        try:
            value = materialize_json(raw_value, "$.sweep.item.value")
        except (TypeError, ValueError) as error:
            raise _SweepControl("invalid_result", "result") from error
        result_bytes = _encoded_materialized_bytes(value)
        if result_bytes > quota["result_bytes"]:
            value = None
            result_bytes = 0
            raise _SweepControl("result_budget_exceeded", "result")
        success = True
        status = "completed"
    except _SweepCallbackFailure as failure:
        status = "callback_error"
        error_record = _error_record(failure.error, failure.phase)
    except _SweepControl as control:
        status = control.status
        error_record = {
            "phase": "control",
            "resource": control.resource,
            "message": control.status,
        }
    except Exception as error:
        status = "callback_error"
        error_record = _error_record(error, "evaluator")
    elapsed_ms = (time.perf_counter() - started_at) * 1000.0
    return SweepItemResult(
        index=index,
        seed_index=plan.seed_offset + index,
        seed=plan.item_seed(index),
        parameter=plan.item_parameter(index),
        success=success,
        status=status,
        value=value,
        error=error_record,
        measurements=context.measurements(elapsed_ms, result_bytes),
        trace=context.trace_record(),
        credits=quota,
    )


def _executor_failure(
    plan: SweepPlan, indices: Sequence[int], error: Exception
) -> list[SweepItemResult]:
    answer: list[SweepItemResult] = []
    record = _error_record(error, "batch_executor")
    for index in indices:
        answer.append(
            SweepItemResult(
                index=index,
                seed_index=plan.seed_offset + index,
                seed=plan.item_seed(index),
                parameter=plan.item_parameter(index),
                success=False,
                status="executor_error",
                error=record,
                measurements={
                    "evaluations": 0,
                    "elapsed_ms": 0.0,
                    "memory_peak_bytes": 0,
                    "result_bytes": 0,
                    "trace_events": 0,
                    "trace_bytes": 0,
                    "trace_events_dropped": 0,
                },
                trace=_empty_trace(),
                credits=plan.quota(index),
            )
        )
    return answer


def _validate_batch_results(
    expected: Sequence[int], values: Any
) -> list[SweepItemResult]:
    try:
        items = list(values)
    except Exception as error:
        raise TypeError(
            "batch executor must return an iterable of item results"
        ) from error
    if len(items) != len(expected):
        raise ValueError("batch executor returned the wrong number of item results")
    expected_set = set(expected)
    seen: set[int] = set()
    for item in items:
        if not isinstance(item, SweepItemResult):
            raise TypeError("batch executor returned a non-SweepItemResult value")
        if item.index not in expected_set or item.index in seen:
            raise ValueError("batch executor returned an unknown or duplicate item")
        seen.add(item.index)
    items.sort(key=lambda item: item.index)
    return items


def run_parameter_sweep(
    parameters: Sequence[Any],
    evaluator: Callable[[Any, SweepItemContext], Any],
    *,
    budget: SweepBudget | None = None,
    seed: int = 0,
    seed_offset: int = 0,
    concurrency: int = 1,
    mode: str = "collect",
    cancel: Callable[[], Any] | None = None,
    batch_executor: Callable[[Sequence[Callable[[], SweepItemResult]]], Any]
    | None = None,
    callback_record: Mapping[str, Any] | None = None,
    executor_record: Mapping[str, Any] | None = None,
    cancel_record: Mapping[str, Any] | None = None,
) -> SweepResult:
    """Run a stable ordered parameter sweep.

    An evaluator receives `(parameter, context)`.  A custom `batch_executor`
    receives at most `concurrency` zero-argument jobs and must synchronously
    return each job's `SweepItemResult`, in any order.  The default executes
    sequentially and records that fallback when more concurrency was requested.
    """
    if not callable(evaluator):
        raise TypeError("sweep evaluator must be callable")
    if cancel is not None and not callable(cancel):
        raise TypeError("sweep cancellation signal must be callable")
    if batch_executor is not None and not callable(batch_executor):
        raise TypeError("batch_executor must be callable")
    plan = plan_parameter_sweep(
        parameters,
        budget=budget,
        seed=seed,
        seed_offset=seed_offset,
        concurrency=concurrency,
        mode=mode,
        callback_record=callback_record,
        executor_record=executor_record,
        has_batch_executor=batch_executor is not None,
    )
    cancellation = cancel_record
    if cancellation is None:
        cancellation = (
            {"kind": "none", "replayable": True}
            if cancel is None
            else {"kind": "opaque_callback", "replayable": False}
        )
    started_at = time.perf_counter()
    deadline = started_at + plan.budget.max_elapsed_ms / 1000.0
    items: list[SweepItemResult] = []
    next_index = 0
    stop_status: str | None = None
    while next_index < plan.item_count and stop_status is None:
        if time.perf_counter() >= deadline:
            stop_status = "maximum_elapsed_time"
            break
        stop = min(next_index + plan.effective_concurrency, plan.item_count)
        indices = list(range(next_index, stop))
        jobs: list[Callable[[], SweepItemResult]] = []
        for item_index in indices:

            def job(index: int = item_index) -> SweepItemResult:
                return _run_item(plan, index, evaluator, cancel, started_at, deadline)

            jobs.append(job)
        if batch_executor is None:
            batch_values = [job() for job in jobs]
        else:
            try:
                batch_values = _validate_batch_results(
                    indices, batch_executor(tuple(jobs))
                )
            except Exception as error:
                batch_values = _executor_failure(plan, indices, error)
        batch_values.sort(key=lambda item: item.index)
        items.extend(batch_values)
        next_index = stop
        statuses = {item.status for item in batch_values}
        if "executor_error" in statuses:
            stop_status = "executor_error"
        elif "cancelled" in statuses:
            stop_status = "cancelled"
        elif "maximum_elapsed_time" in statuses:
            stop_status = "maximum_elapsed_time"
        elif mode == "fail_fast" and any(not item.success for item in batch_values):
            stop_status = "fail_fast"
    skipped_status = "skipped_fail_fast"
    if stop_status == "cancelled":
        skipped_status = "skipped_cancelled"
    elif stop_status == "maximum_elapsed_time":
        skipped_status = "skipped_elapsed_time"
    for index in range(next_index, plan.item_count):
        items.append(_skipped_item(plan, index, skipped_status))
    if stop_status is None:
        stop_status = (
            "completed"
            if all(item.success for item in items)
            else "completed_with_failures"
        )
    elapsed_ms = (time.perf_counter() - started_at) * 1000.0
    return SweepResult(
        plan,
        items,
        status=stop_status,
        elapsed_ms=elapsed_ms,
        cancel_record=cancellation,
    )


__all__ = [
    "SWEEP_ITEM_STATUSES",
    "SWEEP_MODES",
    "SWEEP_SCHEMA_VERSION",
    "SWEEP_SCHEDULER",
    "SWEEP_SEED_ALGORITHM",
    "SweepBudget",
    "SweepItemContext",
    "SweepItemResult",
    "SweepPlan",
    "SweepResult",
    "plan_parameter_sweep",
    "run_parameter_sweep",
]
