"""Deterministic, resource-bounded numerical parameter sweeps.

On CPython, an explicit concurrency request uses a bounded
`ThreadPoolExecutor` without requiring application glue. Sage.js's synchronous
live-callable contract cannot transfer arbitrary Python closures into Node or
browser workers, so those runtimes either record an explicit sequential
fallback or fail closed when concurrency is required. Hosts with a separately
qualified worker protocol may still supply a synchronous batch executor; the
scheduler owns stable ordering, fixed resource credits, failure policy, and
provenance in every case.

Aggregate evaluation, memory, trace, and result budgets are divided into fixed
per-item credits before execution.  Consequently a different completion order
cannot spend a different amount of the global budget.  Memory accounting is
cooperative: callbacks reserve bytes before allocating them and release bytes
when possible.  Serialized inputs and outputs are always measured directly.
"""

from __future__ import annotations

import hashlib
import json
import sys
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
SWEEP_CONCURRENCY_FALLBACKS = ("sequential", "error")
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
                "executors": {
                    "cpython-thread-pool": {
                        "status": "implemented",
                        "runtime": "cpython",
                        "bounded": True,
                        "ordering": "stable_input_order",
                    },
                    "sagejs-live-callable-workers": {
                        "status": "unsupported",
                        "runtimes": ["browser", "node", "sea"],
                        "reason": "the synchronous API cannot safely transfer arbitrary live Python closures across isolated workers",
                        "fallbacks": ["explicit sequential execution", "fail closed"],
                    },
                    "custom-sync-batch": {
                        "status": "host_supplied_unqualified",
                        "runtimes": ["browser", "node", "sea", "cpython"],
                        "boundary": "trusted host executor",
                    },
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


def _json_pointer(value: JSONValue, pointer: str, name: str) -> JSONValue:
    """Select one retained JSON value using an RFC 6901 pointer."""
    if not isinstance(pointer, str):
        raise TypeError(name + " must be a JSON pointer string")
    if pointer == "":
        return value
    if not pointer.startswith("/"):
        raise ValueError(name + " must be empty or start with '/'")
    current = value
    for raw_token in pointer[1:].split("/"):
        for offset, character in enumerate(raw_token):
            if character == "~" and (
                offset + 1 == len(raw_token) or raw_token[offset + 1] not in "01"
            ):
                raise ValueError(name + " contains an invalid JSON pointer escape")
        token = raw_token.replace("~1", "/").replace("~0", "~")
        if isinstance(current, dict):
            if token not in current:
                raise KeyError(name + " does not resolve at '" + token + "'")
            current = current[token]
        elif isinstance(current, list):
            if token == "" or not token.isdigit():
                raise KeyError(name + " has a non-index array token '" + token + "'")
            index = int(token)
            if index >= len(current):
                raise IndexError(name + " array index is out of range")
            current = current[index]
        else:
            raise KeyError(name + " traverses a scalar at '" + token + "'")
    return current


def _finite_number(value: Any, name: str) -> float:
    """Return one finite plotting coordinate without accepting booleans."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise TypeError(name + " must select a number")
    answer = float(value)
    if answer != answer or answer in (float("inf"), -float("inf")):
        raise ValueError(name + " must select a finite number")
    return answer


def _bounded_progress_counts(item_count: int, max_frames: int) -> list[int]:
    """Select exact completed-item prefixes, including zero and the endpoint."""
    if max_frames < 2:
        raise ValueError("max_frames must be at least 2")
    if max_frames > 256:
        raise ValueError("max_frames must not exceed 256")
    count = item_count + 1
    if count <= max_frames:
        return list(range(count))
    indices = [(index * item_count) // (max_frames - 1) for index in range(max_frames)]
    return list(dict.fromkeys(indices))


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


def _runtime_kind() -> str:
    """Return the execution family relevant to the synchronous scheduler."""
    implementation = getattr(sys, "implementation", None)
    cache_tag = getattr(implementation, "cache_tag", "")
    if isinstance(cache_tag, str) and cache_tag.startswith("sagejs-"):
        return "sagejs"
    name = getattr(implementation, "name", "unknown")
    return str(name)


class _CPythonThreadExecutor:
    """One reusable bounded CPython pool, loaded only on the selected path."""

    def __init__(self, max_workers: int) -> None:
        import concurrent.futures

        self._futures = concurrent.futures
        self._pool = concurrent.futures.ThreadPoolExecutor(
            max_workers=max_workers, thread_name_prefix="sagejs-sweep"
        )

    def run(
        self, jobs: Sequence[Callable[[], "SweepItemResult"]]
    ) -> list["SweepItemResult"]:
        futures = [self._pool.submit(job) for job in jobs]
        return [future.result() for future in self._futures.as_completed(futures)]

    def close(self) -> None:
        self._pool.shutdown(wait=True, cancel_futures=True)


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


class SweepConcurrencyUnsupportedError(NotImplementedError):
    """Raised when requested concurrency has no safe executor on this host."""

    def __init__(self, runtime: str, concurrency: int) -> None:
        self.runtime = str(runtime)
        self.concurrency = int(concurrency)
        super().__init__(
            "concurrency "
            + str(concurrency)
            + " requires a qualified batch executor on "
            + self.runtime
        )


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

    def explanation(self) -> dict[str, JSONValue]:
        """Return a detached explanation assembled only from retained evidence.

        A generic sweep cannot claim that an arbitrary callback result is
        mathematically validated.  When an item contains a standard numerical
        result record, its independent validation status and truth level are
        reported explicitly.  Other successful values remain classified as
        completed but unvalidated by this presentation layer.
        """
        record = self.to_dict()
        counts = record["counts"]
        measurements = record["measurements"]
        if not isinstance(counts, dict) or not isinstance(measurements, dict):
            raise TypeError("sweep result has malformed aggregate evidence")
        status_counts: dict[str, int] = {}
        failures: list[JSONValue] = []
        validations: list[JSONValue] = []
        validated = 0
        validation_failed = 0
        completed_unvalidated = 0
        for item in self._items:
            item_record = item.to_dict()
            status_counts[item.status] = status_counts.get(item.status, 0) + 1
            nested = item_record.get("value")
            validation: Any = None
            nested_status: Any = None
            nested_success: Any = None
            if isinstance(nested, dict):
                validation = nested.get("validation")
                nested_status = nested.get("status")
                nested_success = nested.get("success")
            if isinstance(validation, dict):
                passed = validation.get("passed") is True
                validated += 1 if passed else 0
                validation_failed += 0 if passed else 1
                validations.append(
                    {
                        "index": item.index,
                        "passed": passed,
                        "truth_level": validation.get("truth_level"),
                        "residual": validation.get("residual"),
                        "nested_status": nested_status,
                        "nested_success": nested_success,
                    }
                )
            elif item.success:
                completed_unvalidated += 1
            if not item.success:
                failures.append(
                    {
                        "index": item.index,
                        "parameter": item_record["parameter"],
                        "status": item.status,
                        "error": item_record["error"],
                    }
                )
        plan_record = self._plan.to_dict()
        fallback_reason = plan_record["fallback_reason"]
        limitations = [
            "Sweep success means every scheduled item completed; generic callback values have no implied mathematical validation.",
            "The scheduler's memory and cancellation limits are cooperative inside live callbacks.",
            "Presentation reads retained finite JSON only and cannot recover values suppressed by failed items.",
        ]
        if fallback_reason is not None:
            limitations.append(str(fallback_reason))
        interpretation = [
            str(counts["completed"])
            + " of "
            + str(counts["planned"])
            + " planned items ran; "
            + str(counts["failed"])
            + " failed and "
            + str(counts["skipped"])
            + " were skipped.",
            str(validated)
            + " nested numerical result"
            + ("" if validated == 1 else "s")
            + " retained passing independent validation evidence.",
        ]
        if validation_failed:
            interpretation.append(
                str(validation_failed)
                + " nested numerical result"
                + ("" if validation_failed == 1 else "s")
                + " retained non-passing validation evidence."
            )
        if completed_unvalidated:
            interpretation.append(
                str(completed_unvalidated)
                + " completed callback value"
                + ("" if completed_unvalidated == 1 else "s")
                + " had no standard nested validation record."
            )
        return materialize_object(
            {
                "schema_version": SWEEP_SCHEMA_VERSION,
                "kind": "sweep-explanation",
                "operation": "parameter_sweep",
                "headline": "bounded deterministic parameter sweep",
                "outcome": {
                    "success": self.success,
                    "status": self._status,
                    "counts": materialize_object(counts, "$.sweep.counts"),
                    "item_status_counts": status_counts,
                },
                "execution": {
                    "scheduler": SWEEP_SCHEDULER,
                    "mode": self._plan.mode,
                    "requested_concurrency": self._plan.requested_concurrency,
                    "effective_concurrency": self._plan.effective_concurrency,
                    "fallback_reason": fallback_reason,
                },
                "evidence": {
                    "plan_digest": self._plan.digest,
                    "nested_validations": validations,
                    "validated_item_count": validated,
                    "validation_failed_item_count": validation_failed,
                    "completed_unvalidated_item_count": completed_unvalidated,
                    "failures": failures,
                    "measurements": materialize_object(
                        measurements, "$.sweep.measurements"
                    ),
                },
                "interpretation": interpretation,
                "limitations": limitations,
                "provenance": {
                    "source": "retained SweepResult records",
                    "computed_evidence_only": True,
                    "callback_reevaluated": False,
                },
            },
            "$.sweep.explanation",
        )

    def explain(self) -> str:
        """Render a compact human explanation of the retained sweep evidence."""
        explanation = self.explanation()
        outcome = explanation["outcome"]
        execution = explanation["execution"]
        evidence = explanation["evidence"]
        if not isinstance(outcome, dict):
            raise TypeError("sweep explanation outcome is malformed")
        if not isinstance(execution, dict):
            raise TypeError("sweep explanation execution is malformed")
        if not isinstance(evidence, dict):
            raise TypeError("sweep explanation evidence is malformed")
        counts = outcome["counts"]
        measurements = evidence["measurements"]
        if not isinstance(counts, dict) or not isinstance(measurements, dict):
            raise TypeError("sweep explanation evidence is malformed")
        lines = [
            str(explanation["headline"]),
            "status: " + str(outcome["status"]),
            "items: "
            + str(counts["completed"])
            + "/"
            + str(counts["planned"])
            + " ran; "
            + str(counts["failed"])
            + " failed; "
            + str(counts["skipped"])
            + " skipped",
            "concurrency: requested "
            + str(execution["requested_concurrency"])
            + ", effective "
            + str(execution["effective_concurrency"]),
            "resources: "
            + str(measurements["evaluations"])
            + " evaluations; "
            + str(measurements["trace_events"])
            + " retained trace events; "
            + str(measurements["result_bytes"])
            + " result bytes",
            "nested validation: "
            + str(evidence["validated_item_count"])
            + " passed; "
            + str(evidence["validation_failed_item_count"])
            + " did not pass; "
            + str(evidence["completed_unvalidated_item_count"])
            + " completed values were not standard numerical results",
        ]
        fallback_reason = execution["fallback_reason"]
        if fallback_reason is not None:
            lines.append("executor fallback: " + str(fallback_reason))
        failures = evidence["failures"]
        if isinstance(failures, list):
            for failure in failures:
                if isinstance(failure, dict):
                    lines.append(
                        "item "
                        + str(failure["index"])
                        + " failed with "
                        + str(failure["status"])
                    )
        lines.append(
            "presentation: retained result evidence only; no callback was replayed"
        )
        return "\n".join(lines)

    def _presentation_points(
        self,
        *,
        x_path: str,
        y_path: str,
        through: int | None = None,
    ) -> tuple[list[float], list[float], list[int]]:
        """Extract an exact prefix of validated presentation coordinates."""
        stop = len(self._items) if through is None else through
        if isinstance(stop, bool) or not isinstance(stop, int):
            raise TypeError("presentation prefix must be an integer")
        if stop < 0 or stop > len(self._items):
            raise IndexError("presentation prefix is out of range")
        x_values: list[float] = []
        y_values: list[float] = []
        source_indices: list[int] = []
        for item in self._items[:stop]:
            if not item.success:
                continue
            record = item.to_dict()
            x_values.append(
                _finite_number(
                    _json_pointer(record, x_path, "x_path"),
                    "x_path for successful item " + str(item.index),
                )
            )
            y_values.append(
                _finite_number(
                    _json_pointer(record, y_path, "y_path"),
                    "y_path for successful item " + str(item.index),
                )
            )
            source_indices.append(item.index)
        return x_values, y_values, source_indices

    def _plot_spec(
        self,
        *,
        x_path: str,
        y_path: str,
        x_label: str,
        y_label: str,
        through: int | None,
    ) -> Any:
        plotting = __import__(
            "sagejs.plotting",
            fromlist=["PlotSpec", "Provenance", "make_layer"],
        )
        x_values, y_values, source_indices = self._presentation_points(
            x_path=x_path, y_path=y_path, through=through
        )
        stop = len(self._items) if through is None else through
        complete = stop == len(self._items)
        failed_indices = [item.index for item in self._items[:stop] if not item.success]
        description = (
            "Parameter sweep retained "
            + str(len(x_values))
            + " successful numeric point"
            + ("" if len(x_values) == 1 else "s")
            + " from "
            + str(stop)
            + " processed item"
            + ("" if stop == 1 else "s")
            + ". "
            + str(len(failed_indices))
            + " processed item"
            + ("" if len(failed_indices) == 1 else "s")
            + " failed and remain"
            + ("s" if len(failed_indices) == 1 else "")
            + " in the structured explanation, not as invented plot coordinates."
        )
        layers = [
            plotting.make_layer(
                "line",
                {"x": x_values, "y": y_values},
                ordinal=0,
                namespace="numerical-sweep",
                source_intent={
                    "operation": "parameter_sweep",
                    "role": "successful-retained-values",
                },
                style={"color": "#3366cc", "width": 2},
                legend={"label": "successfully completed items", "show": True},
                metadata={"source_item_indices": source_indices},
            ),
            plotting.make_layer(
                "point",
                {"x": x_values, "y": y_values},
                ordinal=1,
                namespace="numerical-sweep",
                source_intent={
                    "operation": "parameter_sweep",
                    "role": "successful-retained-values",
                },
                style={"color": "#dd8452", "size": 8},
                legend={"label": "computed sweep endpoints", "show": True},
                metadata={"source_item_indices": source_indices},
            ),
        ]
        return plotting.PlotSpec(
            2,
            layers,
            axes_or_scene={
                "xaxis": {"title": {"text": x_label}},
                "yaxis": {"title": {"text": y_label}},
            },
            viewport={"responsive": True},
            annotations=[{"kind": "alt_text", "text": description}],
            provenance=plotting.Provenance(
                "sagejs.numerics.sweeps",
                constructor="SweepResult.to_plot_spec",
                metadata={
                    "plan_digest": self._plan.digest,
                    "x_path": x_path,
                    "y_path": y_path,
                    "processed_items": stop,
                    "complete_sweep": complete,
                    "source_item_indices": source_indices,
                    "failed_item_indices": failed_indices,
                    "computed_evidence_only": True,
                    "callback_reevaluated": False,
                },
            ),
        )

    def to_plot_spec(
        self,
        *,
        x_path: str = "/parameter",
        y_path: str = "/value",
        x_label: str = "parameter",
        y_label: str = "retained value",
    ) -> Any:
        """Plot numeric successful items selected from retained JSON records.

        `x_path` and `y_path` are RFC 6901 pointers relative to each item
        record.  Declarative selectors make it impossible for visualization to
        invoke the original evaluator. Failed items remain in `explanation()`
        and plot provenance; they are not assigned a fabricated y-coordinate.
        """
        if not isinstance(x_label, str) or x_label == "":
            raise TypeError("x_label must be a nonempty string")
        if not isinstance(y_label, str) or y_label == "":
            raise TypeError("y_label must be a nonempty string")
        x_values, _, _ = self._presentation_points(x_path=x_path, y_path=y_path)
        if len(x_values) == 0:
            raise ValueError("the sweep has no successful numeric presentation points")
        return self._plot_spec(
            x_path=x_path,
            y_path=y_path,
            x_label=x_label,
            y_label=y_label,
            through=None,
        )

    def plot(
        self,
        *,
        x_path: str = "/parameter",
        y_path: str = "/value",
        x_label: str = "parameter",
        y_label: str = "retained value",
    ) -> Any:
        """Alias for `to_plot_spec`."""
        return self.to_plot_spec(
            x_path=x_path,
            y_path=y_path,
            x_label=x_label,
            y_label=y_label,
        )

    def to_animation(
        self,
        *,
        x_path: str = "/parameter",
        y_path: str = "/value",
        x_label: str = "parameter",
        y_label: str = "retained value",
        max_frames: int = 32,
        frame_duration_ms: int = 450,
    ) -> Any:
        """Animate exact completed-item prefixes without replay or interpolation."""
        if not isinstance(x_label, str) or x_label == "":
            raise TypeError("x_label must be a nonempty string")
        if not isinstance(y_label, str) or y_label == "":
            raise TypeError("y_label must be a nonempty string")
        plotting = __import__(
            "sagejs.plotting",
            fromlist=[
                "AnimationControls",
                "AnimationFrame",
                "AnimationResourceLimits",
                "AnimationTiming",
                "PlotAnimation",
                "stable_frame_id",
            ],
        )
        # Validate the complete final selection before constructing any frames.
        final_x, _, _ = self._presentation_points(x_path=x_path, y_path=y_path)
        if len(final_x) == 0:
            raise ValueError("the sweep has no successful numeric presentation points")
        selected_counts = _bounded_progress_counts(len(self._items), max_frames)
        frames = []
        for frame_index, processed in enumerate(selected_counts):
            current = None if processed == 0 else self._items[processed - 1]
            frames.append(
                plotting.AnimationFrame(
                    plotting.stable_frame_id(frame_index),
                    self._plot_spec(
                        x_path=x_path,
                        y_path=y_path,
                        x_label=x_label,
                        y_label=y_label,
                        through=processed,
                    ),
                    label=(
                        "start"
                        if processed == 0
                        else str(processed) + " / " + str(len(self._items))
                    ),
                    metadata={
                        "processed_items": processed,
                        "source_item_index": None if current is None else current.index,
                        "source_item_status": None
                        if current is None
                        else current.status,
                        "source_item_success": None
                        if current is None
                        else current.success,
                        "interpolated": False,
                    },
                )
            )
        return plotting.PlotAnimation(
            frames,
            timing=plotting.AnimationTiming(
                frame_duration_ms=frame_duration_ms,
                transition_duration_ms=0,
            ),
            controls=plotting.AnimationControls(
                slider_prefix="Processed items: ",
                autoplay=False,
                loop=False,
            ),
            limits=plotting.AnimationResourceLimits(
                max_frames=max_frames,
                max_layers_per_frame=2,
                max_total_samples=max(32, 4 * len(final_x) * len(frames)),
                max_payload_bytes=4_000_000,
                max_duration_ms=max_frames * frame_duration_ms,
            ),
            metadata={
                "source": "retained SweepResult item prefixes",
                "plan_digest": self._plan.digest,
                "source_item_count": len(self._items),
                "selected_completed_item_counts": selected_counts,
                "gallery_decimated": len(selected_counts) < len(self._items) + 1,
                "decimation_policy": "deterministic evenly spaced exact prefixes",
                "interpolation": "none",
                "computed_evidence_only": True,
                "callback_reevaluated": False,
            },
        )

    def animate(
        self,
        *,
        x_path: str = "/parameter",
        y_path: str = "/value",
        x_label: str = "parameter",
        y_label: str = "retained value",
        max_frames: int = 32,
        frame_duration_ms: int = 450,
    ) -> Any:
        """Alias for `to_animation`."""
        return self.to_animation(
            x_path=x_path,
            y_path=y_path,
            x_label=x_label,
            y_label=y_label,
            max_frames=max_frames,
            frame_duration_ms=frame_duration_ms,
        )


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
    concurrency_fallback: str = "sequential",
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
    if concurrency_fallback not in SWEEP_CONCURRENCY_FALLBACKS:
        raise ValueError("concurrency_fallback must be sequential or error")
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
    runtime = _runtime_kind()
    use_cpython_threads = (
        requested > 1 and not has_batch_executor and runtime == "cpython"
    )
    if requested > 1 and not has_batch_executor and not use_cpython_threads:
        if concurrency_fallback == "error":
            raise SweepConcurrencyUnsupportedError(runtime, requested)
        effective = 1
        fallback_reason = (
            "no qualified live-callable concurrency executor is available on "
            + runtime
            + "; using explicitly permitted sequential execution"
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
        elif use_cpython_threads:
            executor = {
                "kind": "cpython_threads",
                "name": "bounded-thread-pool",
                "replayable": False,
            }
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
    concurrency_fallback: str = "sequential",
) -> SweepResult:
    """Run a stable ordered parameter sweep.

    An evaluator receives `(parameter, context)`. On CPython, requesting more
    than one worker selects a bounded thread pool. A custom `batch_executor`
    receives at most `concurrency` zero-argument jobs and must synchronously
    return each job's `SweepItemResult`, in any order. Sage.js Node/browser/SEA
    execution records a sequential fallback unless `concurrency_fallback` is
    `"error"`, in which case planning fails before any callback is evaluated.
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
        concurrency_fallback=concurrency_fallback,
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
    automatic_executor = (
        _CPythonThreadExecutor(plan.effective_concurrency)
        if batch_executor is None and plan.effective_concurrency > 1
        else None
    )
    try:
        while next_index < plan.item_count and stop_status is None:
            if time.perf_counter() >= deadline:
                stop_status = "maximum_elapsed_time"
                break
            stop = min(next_index + plan.effective_concurrency, plan.item_count)
            indices = list(range(next_index, stop))
            jobs: list[Callable[[], SweepItemResult]] = []
            for item_index in indices:

                def job(index: int = item_index) -> SweepItemResult:
                    return _run_item(
                        plan, index, evaluator, cancel, started_at, deadline
                    )

                jobs.append(job)
            if automatic_executor is not None:
                try:
                    batch_values = _validate_batch_results(
                        indices, automatic_executor.run(tuple(jobs))
                    )
                except Exception as error:
                    batch_values = _executor_failure(plan, indices, error)
            elif batch_executor is None:
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
    finally:
        if automatic_executor is not None:
            automatic_executor.close()
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
    "SWEEP_CONCURRENCY_FALLBACKS",
    "SWEEP_ITEM_STATUSES",
    "SWEEP_MODES",
    "SWEEP_SCHEMA_VERSION",
    "SWEEP_SCHEDULER",
    "SWEEP_SEED_ALGORITHM",
    "SweepBudget",
    "SweepConcurrencyUnsupportedError",
    "SweepItemContext",
    "SweepItemResult",
    "SweepPlan",
    "SweepResult",
    "plan_parameter_sweep",
    "run_parameter_sweep",
]
