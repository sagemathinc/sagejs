#!/usr/bin/env node
// sagejs-test-tier: integration
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..", "..", "..");

function run(executable, args) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 180_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function runSagejs(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-ode-sweep-"));
  const filename = join(directory, "witness.py");
  try {
    writeFileSync(filename, source);
    const executable = process.env.SAGEJS_TEST_BINARY || join(root, "bin/sagejs");
    return run(process.execPath, [executable, "--python", filename]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function runCPython(source) {
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const prefix = String.raw`
import collections.abc, hashlib, json, math, sys, typing
sys.path.append(${JSON.stringify(join(root, "src/lib"))})
`;
  return run(executable, ["-I", "-c", prefix + source]);
}

const witness = String.raw`
import math
import sys
import time
from sagejs.numerics.ode import (
    ode_capabilities,
    ode_problem,
    plan_ode_parameter_sweep,
    run_ode_parameter_sweep,
)
from sagejs.numerics.sweeps import SweepBudget

IS_SAGEJS = sys.version == "Sage.js"

parameters = [{"rate": 0.5}, {"rate": 1.0}, {"rate": 2.0}]
assert ode_capabilities()["parameter_sweeps"]["scheduler"] == "bounded-batch-v1"
budget = SweepBudget(
    max_items=8,
    max_concurrency=3,
    max_evaluations=2000,
    max_elapsed_ms=10000,
    max_memory_bytes=20000000,
    max_input_bytes=100000,
    max_result_bytes=4000000,
    max_trace_events=100,
    max_trace_bytes=100000,
)

factory_calls = [0]
def decay_factory(parameter, limits):
    factory_calls[0] += 1
    rate = float(parameter["rate"])
    return ode_problem(
        lambda t, y: [-rate * y[0]],
        (0.0, 1.0),
        [1.0],
        rtol=1e-7,
        atol=1e-10,
        max_evaluations=limits.max_evaluations,
        max_elapsed_ms=limits.max_elapsed_ms,
        max_output_points=128,
        max_validation_evaluations=16,
        max_trace_bytes=4096,
        trace="summary",
        function_record={
            "kind": "parameterized_decay",
            "rate": rate,
            "seed": limits.seed,
            "replayable": True,
        },
    )

planned = plan_ode_parameter_sweep(
    parameters,
    budget=budget,
    seed=17,
    concurrency=3,
)
assert factory_calls[0] == 0
assert planned.item_count == 3
assert planned.requested_concurrency == 3
assert planned.effective_concurrency == (1 if IS_SAGEJS else 3)
assert all(planned.quota(index)["evaluations"] >= 2 for index in range(3))

sequential = run_ode_parameter_sweep(
    parameters,
    decay_factory,
    budget=budget,
    seed=17,
    concurrency=3,
)
assert sequential.success and sequential.status == "completed"
assert [item.index for item in sequential.items] == [0, 1, 2]
assert [item.seed for item in sequential.items] == [planned.item_seed(i) for i in range(3)]
for index, item in enumerate(sequential.items):
    expected = math.exp(-parameters[index]["rate"])
    assert abs(item.value["value"][0] - expected) < 2e-6
    item_record = item.to_dict()
    assert item_record["measurements"]["memory_peak_bytes"] > 0
    assert item_record["measurements"]["result_bytes"] > 0
    kinds = [event["kind"] for event in item_record["trace"]["events"]]
    assert kinds == ["ode_start", "ode_finish"]

expected_evaluations = len(parameters) + sum(
    item.value["evaluations"] for item in sequential.items
)
assert sequential.to_dict()["measurements"]["evaluations"] == expected_evaluations
if IS_SAGEJS:
    assert sequential.to_dict()["reproducibility"]["plan"]["fallback_reason"] is not None
else:
    assert sequential.to_dict()["reproducibility"]["plan"]["fallback_reason"] is None
    assert sequential.to_dict()["provenance"]["executor"]["kind"] == "cpython_threads"

def reverse_batch(jobs):
    return [job() for job in reversed(jobs)]

reversed_completion = run_ode_parameter_sweep(
    parameters,
    decay_factory,
    budget=budget,
    seed=17,
    concurrency=3,
    batch_executor=reverse_batch,
)
assert reversed_completion.success
assert [item.index for item in reversed_completion.items] == [0, 1, 2]
assert [item.seed for item in reversed_completion.items] == [
    item.seed for item in sequential.items
]
assert [item.value["value"] for item in reversed_completion.items] == [
    item.value["value"] for item in sequential.items
]

def partially_failing_factory(parameter, limits):
    rate = float(parameter["rate"])
    maximum = 1 if rate == 1.0 else limits.max_evaluations
    return ode_problem(
        lambda t, y: [-rate * y[0]],
        (0.0, 1.0),
        [1.0],
        max_evaluations=maximum,
        max_elapsed_ms=limits.max_elapsed_ms,
        max_output_points=64,
        max_trace_bytes=4096,
        trace="summary",
    )

collected = run_ode_parameter_sweep(
    parameters,
    partially_failing_factory,
    budget=budget,
    mode="collect",
)
assert collected.status == "completed_with_failures"
assert [item.status for item in collected.items] == [
    "completed",
    "callback_error",
    "completed",
]
failure = collected.items[1].to_dict()["error"]
assert failure["type"] == "OdeSweepSolveError"
assert failure["message"] == "maximum_evaluations/maximum_evaluations"

failed_fast = run_ode_parameter_sweep(
    parameters,
    partially_failing_factory,
    budget=budget,
    mode="fail_fast",
)
assert failed_fast.status == "fail_fast"
assert [item.status for item in failed_fast.items] == [
    "completed",
    "callback_error",
    "skipped_fail_fast",
]

memory_rhs_calls = [0]
def memory_factory(parameter, limits):
    def rhs(t, y):
        memory_rhs_calls[0] += 1
        return [-y[0]]
    return ode_problem(
        rhs,
        (0.0, 1.0),
        [1.0],
        max_evaluations=limits.max_evaluations,
        max_elapsed_ms=limits.max_elapsed_ms,
        max_output_points=64,
        max_trace_bytes=4096,
    )

memory_limited = run_ode_parameter_sweep(
    [0],
    memory_factory,
    budget=SweepBudget(
        max_evaluations=100,
        max_memory_bytes=100,
        max_result_bytes=1000000,
    ),
)
assert memory_limited.items[0].status == "memory_budget_exceeded"
assert memory_rhs_calls[0] == 0

cancelled_flag = [False]
def cancel_signal():
    return cancelled_flag[0]

def cancelling_factory(parameter, limits):
    def rhs(t, y):
        cancelled_flag[0] = True
        return [-y[0]]
    return ode_problem(
        rhs,
        (0.0, 1.0),
        [1.0],
        max_evaluations=limits.max_evaluations,
        max_elapsed_ms=limits.max_elapsed_ms,
        max_output_points=64,
        max_trace_bytes=4096,
    )

cancelled = run_ode_parameter_sweep(
    [0, 1, 2],
    cancelling_factory,
    budget=budget,
    cancel=cancel_signal,
)
assert cancelled.status == "cancelled"
assert [item.status for item in cancelled.items] == [
    "cancelled",
    "skipped_cancelled",
    "skipped_cancelled",
]

def slow_factory(parameter, limits):
    def rhs(t, y):
        time.sleep(0.02)
        return [-y[0]]
    return ode_problem(
        rhs,
        (0.0, 1.0),
        [1.0],
        max_evaluations=limits.max_evaluations,
        max_elapsed_ms=limits.max_elapsed_ms,
        max_output_points=64,
        max_trace_bytes=4096,
    )

timed_out = run_ode_parameter_sweep(
    [0, 1],
    slow_factory,
    budget=SweepBudget(
        max_evaluations=100,
        max_elapsed_ms=5,
        max_memory_bytes=10000000,
        max_result_bytes=1000000,
    ),
)
assert timed_out.status == "maximum_elapsed_time"
assert [item.status for item in timed_out.items] == [
    "maximum_elapsed_time",
    "skipped_elapsed_time",
]

try:
    plan_ode_parameter_sweep(
        parameters,
        budget=SweepBudget(max_evaluations=3),
    )
    raise AssertionError("one outer credit per item is insufficient for an ODE solve")
except ValueError:
    pass

print("ODE parameter sweep laboratory passed")
`;

test("ODE parameter sweeps preserve accounting, order, failures, and limits in CPython", () => {
  assert.equal(runCPython(witness), "ODE parameter sweep laboratory passed");
});

test("ODE parameter sweeps run through the shared scheduler in Sage.js", () => {
  assert.equal(runSagejs(witness), "ODE parameter sweep laboratory passed");
});
