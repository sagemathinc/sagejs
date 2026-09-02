"""Backend-neutral correctness witness for deterministic numerical sweeps."""

import json
import math
import sys
import time

from sagejs.numerics.sweeps import (
    SWEEP_ITEM_STATUSES,
    SWEEP_SCHEMA_VERSION,
    SweepBudget,
    SweepConcurrencyUnsupportedError,
    plan_parameter_sweep,
    run_parameter_sweep,
)

IS_SAGEJS = sys.version == "Sage.js"


def replayable_callback_record(name):
    return {
        "kind": "module_function",
        "module": "numerical_sweeps_fixture",
        "name": name,
        "replayable": True,
    }


parameters = [{"x": value} for value in range(6)]
plan = plan_parameter_sweep(parameters, seed=20260831, concurrency=4)
assert plan.item_count == 6
assert plan.effective_concurrency == (1 if IS_SAGEJS else 4)
if IS_SAGEJS:
    assert (
        "no qualified live-callable concurrency executor"
        in plan.to_dict()["fallback_reason"]
    )
    assert plan.to_dict()["executor"]["kind"] == "sequential"
else:
    assert plan.to_dict()["fallback_reason"] is None
    assert plan.to_dict()["executor"]["kind"] == "cpython_threads"
assert sum(plan.quota(index)["evaluations"] for index in range(6)) == 100_000
assert len({plan.item_seed(index) for index in range(6)}) == 6
assert [plan.item_seed(index) for index in range(6)] == [
    829256398566433,
    4243957263111234,
    3153374872089699,
    2062242724238468,
    971660333216933,
    4384162174506182,
]
assert plan.to_dict()["schema_version"] == SWEEP_SCHEMA_VERSION


def seeded_evaluator(parameter, context):
    context.emit("start", {"x": parameter["x"]})
    return {"x": parameter["x"], "seed": context.seed}


sequential = run_parameter_sweep(
    parameters,
    seeded_evaluator,
    seed=20260831,
    concurrency=4,
    callback_record=replayable_callback_record("seeded_evaluator"),
)
assert sequential.success and sequential.status == "completed"
assert sequential.plan.effective_concurrency == (1 if IS_SAGEJS else 4)
assert [item.value["x"] for item in sequential.items] == list(range(6))
assert [item.value["seed"] for item in sequential.items] == [
    plan.item_seed(index) for index in range(6)
]
assert json.loads(sequential.to_json())["reproducibility"]["replayable"] is IS_SAGEJS

if IS_SAGEJS:
    try:
        plan_parameter_sweep(
            parameters,
            concurrency=2,
            concurrency_fallback="error",
        )
    except SweepConcurrencyUnsupportedError as error:
        assert error.runtime == "sagejs"
        assert error.concurrency == 2
    else:
        raise AssertionError("required unsupported concurrency did not fail closed")
else:
    required = plan_parameter_sweep(
        parameters,
        concurrency=2,
        concurrency_fallback="error",
    )
    assert required.effective_concurrency == 2
    assert required.to_dict()["executor"]["kind"] == "cpython_threads"

batch_sizes = []


def reverse_batch_executor(jobs):
    batch_sizes.append(len(jobs))
    values = [job() for job in jobs]
    values.reverse()
    return values


batched = run_parameter_sweep(
    parameters,
    seeded_evaluator,
    seed=20260831,
    concurrency=3,
    batch_executor=reverse_batch_executor,
    callback_record=replayable_callback_record("seeded_evaluator"),
    executor_record={
        "kind": "test_batch_executor",
        "name": "reverse-sequential",
        "replayable": True,
    },
)
assert batch_sizes == [3, 3]
assert batched.plan.effective_concurrency == 3
assert [item.value for item in batched.items] == [
    item.value for item in sequential.items
]
assert [item.index for item in batched.items] == list(range(6))

# Seed offsets make independently scheduled shards identical to one complete
# sweep without making completion order part of seed derivation.
left = run_parameter_sweep(parameters[:3], seeded_evaluator, seed=99)
right = run_parameter_sweep(parameters[3:], seeded_evaluator, seed=99, seed_offset=3)
whole = run_parameter_sweep(parameters, seeded_evaluator, seed=99)
assert [item.seed for item in left.items + right.items] == [
    item.seed for item in whole.items
]


def sometimes_fails(parameter, context):
    if parameter["x"] == 1:
        raise RuntimeError("deliberate item failure")
    return parameter["x"] * parameter["x"]


collected = run_parameter_sweep(parameters[:4], sometimes_fails, mode="collect")
assert collected.status == "completed_with_failures"
assert [item.status for item in collected.items] == [
    "completed",
    "callback_error",
    "completed",
    "completed",
]
assert collected.items[1].to_dict()["error"] == {
    "message": "deliberate item failure",
    "phase": "evaluator",
    "type": "RuntimeError",
}

failed_fast = run_parameter_sweep(parameters[:4], sometimes_fails, mode="fail_fast")
assert failed_fast.status == "fail_fast"
assert [item.status for item in failed_fast.items] == [
    "completed",
    "callback_error",
    "skipped_fail_fast",
    "skipped_fail_fast",
]

cancelled = run_parameter_sweep(parameters[:3], seeded_evaluator, cancel=lambda: True)
assert cancelled.status == "cancelled"
assert [item.status for item in cancelled.items] == [
    "cancelled",
    "skipped_cancelled",
    "skipped_cancelled",
]


def broken_cancellation_signal():
    raise LookupError("broken cancellation source")


cancel_error = run_parameter_sweep(
    parameters[:1], seeded_evaluator, cancel=broken_cancellation_signal
)
assert cancel_error.items[0].status == "callback_error"
assert cancel_error.items[0].to_dict()["error"]["phase"] == "cancellation"


def nested_callback_error(parameter, context):
    def broken_nested_callback():
        raise ArithmeticError("nested failure")

    return context.evaluate(broken_nested_callback)


nested_error = run_parameter_sweep(parameters[:1], nested_callback_error)
assert nested_error.items[0].status == "callback_error"
assert nested_error.items[0].to_dict()["error"]["phase"] == "nested_callback"


def slow_evaluator(parameter, context):
    started = time.perf_counter()
    while (time.perf_counter() - started) * 1000.0 < 4.0:
        pass
    return parameter


timed_out = run_parameter_sweep(
    parameters[:3],
    slow_evaluator,
    budget=SweepBudget(max_elapsed_ms=1),
)
assert timed_out.status == "maximum_elapsed_time"
assert timed_out.items[0].status == "maximum_elapsed_time"
assert [item.status for item in timed_out.items[1:]] == [
    "skipped_elapsed_time",
    "skipped_elapsed_time",
]


def spend_two_more_evaluations(parameter, context):
    context.consume_evaluations(2)
    return parameter


evaluation_limited = run_parameter_sweep(
    parameters[:3],
    spend_two_more_evaluations,
    budget=SweepBudget(max_evaluations=6),
)
assert {item.status for item in evaluation_limited.items} == {"maximum_evaluations"}
assert evaluation_limited.to_dict()["measurements"]["evaluations"] == 3


def allocate_five_bytes(parameter, context):
    context.reserve_memory(5)
    return parameter


memory_limited = run_parameter_sweep(
    parameters[:3],
    allocate_five_bytes,
    budget=SweepBudget(max_memory_bytes=12),
)
assert {item.status for item in memory_limited.items} == {"memory_budget_exceeded"}
assert memory_limited.to_dict()["measurements"]["memory_peak_upper_bound_bytes"] == 0


def verbose_evaluator(parameter, context):
    for step in range(3):
        context.emit("step", {"step": step})
    return parameter


trace_limited = run_parameter_sweep(
    parameters[:3],
    verbose_evaluator,
    budget=SweepBudget(max_trace_events=3, max_trace_bytes=100_000),
)
assert trace_limited.to_dict()["measurements"]["trace_events"] == 3
assert (
    sum(item.to_dict()["trace"]["dropped_events"] for item in trace_limited.items) == 6
)

trace_byte_limited = run_parameter_sweep(
    parameters[:3],
    verbose_evaluator,
    budget=SweepBudget(max_trace_events=30, max_trace_bytes=30),
)
assert trace_byte_limited.to_dict()["measurements"]["trace_bytes"] <= 30
assert (
    sum(item.to_dict()["trace"]["dropped_events"] for item in trace_byte_limited.items)
    == 9
)

result_limited = run_parameter_sweep(
    parameters[:3],
    lambda parameter, context: "xxxx",
    budget=SweepBudget(max_result_bytes=9),
)
assert {item.status for item in result_limited.items} == {"result_budget_exceeded"}

nonfinite = run_parameter_sweep([0], lambda parameter, context: float("inf"))
assert nonfinite.items[0].status == "invalid_result"
assert "Infinity" not in nonfinite.to_json()
assert "NaN" not in nonfinite.to_json()

mutable = []


def mutable_evaluator(parameter, context):
    value = {"items": [parameter]}
    mutable.append(value)
    return value


detached = run_parameter_sweep([2], mutable_evaluator)
mutable[0]["items"][0] = 99
view = detached.items[0].value
view["items"][0] = 88
assert detached.items[0].value == {"items": [2]}


def malformed_executor(jobs):
    return []


executor_error = run_parameter_sweep(
    parameters[:2],
    seeded_evaluator,
    concurrency=2,
    batch_executor=malformed_executor,
)
assert executor_error.status == "executor_error"
assert {item.status for item in executor_error.items} == {"executor_error"}


# ODE-shaped adapter: this intentionally does not depend on the ODE package.
# A real ODE adapter can charge the solver's reported evaluation count in the
# same way while returning its structured `to_dict()` result.
def decay_adapter(parameter, context):
    rate = parameter["rate"]
    steps = parameter["steps"]
    context.reserve_memory((steps + 1) * 8)
    step_size = 1.0 / steps
    value = 1.0
    for step in range(steps):
        context.consume_evaluations(1)
        value += step_size * (-rate * value)
        context.emit("accepted_step", {"step": step + 1, "value": value})
    context.release_memory((steps + 1) * 8)
    return {
        "final_time": 1.0,
        "final_state": [value],
        "expected": math.exp(-rate),
    }


ode_parameters = [
    {"rate": 0.5, "steps": 100},
    {"rate": 1.0, "steps": 100},
    {"rate": 2.0, "steps": 100},
]
ode_sweep = run_parameter_sweep(
    ode_parameters,
    decay_adapter,
    seed=17,
    budget=SweepBudget(max_evaluations=1000),
    callback_record=replayable_callback_record("decay_adapter"),
)
assert ode_sweep.success
for item in ode_sweep.items:
    assert abs(item.value["final_state"][0] - item.value["expected"]) < 0.008
assert ode_sweep.to_dict()["measurements"]["evaluations"] == 303

for invalid in (
    lambda: plan_parameter_sweep(list(range(3)), budget=SweepBudget(max_items=2)),
    lambda: plan_parameter_sweep(["long input"], budget=SweepBudget(max_input_bytes=4)),
    lambda: plan_parameter_sweep(
        [1], concurrency=3, budget=SweepBudget(max_concurrency=2)
    ),
    lambda: plan_parameter_sweep([1], mode="unknown"),
    lambda: plan_parameter_sweep([1], concurrency_fallback="unknown"),
    lambda: plan_parameter_sweep([1], seed=-1),
    lambda: plan_parameter_sweep([1, 2], seed_offset=4_294_967_295),
):
    try:
        invalid()
    except (TypeError, ValueError):
        pass
    else:
        raise AssertionError("invalid sweep input was accepted")

assert set(item.status for item in collected.items) <= set(SWEEP_ITEM_STATUSES)
print("bounded numerical sweeps passed")
