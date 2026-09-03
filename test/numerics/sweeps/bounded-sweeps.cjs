#!/usr/bin/env node
// sagejs-test-tier: integration
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..", "..", "..");
const witness = readFileSync(
  join(root, "test", "cpython", "numerical-sweeps.py"),
  "utf8",
);

function run(executable, args, options = {}) {
  const result = spawnSync(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    timeout: 180_000,
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function runCPython(source) {
  const executable = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const prefix = String.raw`
import collections.abc, concurrent.futures, hashlib, json, math, sys, threading, time, typing
sys.path.insert(0, ${JSON.stringify(join(root, "src/lib"))})
`;
  return run(executable, ["-I", "-c", prefix + source]);
}

function runSagejs(source) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-sweeps-"));
  const filename = join(directory, "witness.py");
  try {
    writeFileSync(filename, source);
    const executable = process.env.SAGEJS_TEST_BINARY || join(root, "bin/sagejs");
    return run(process.execPath, [executable, "--python", filename]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("bounded sweep contract agrees in CPython", () => {
  assert.equal(runCPython(witness), "bounded numerical sweeps passed");
});

test("bounded sweep contract runs through Sage.js", () => {
  assert.equal(runSagejs(witness), "bounded numerical sweeps passed");
});

test("CPython default executor overlaps work within the requested bound", () => {
  const threadedWitness = String.raw`
from sagejs.numerics.sweeps import run_parameter_sweep

lock = threading.Lock()
active = [0]
maximum_active = [0]

def evaluator(parameter, context):
    with lock:
        active[0] += 1
        maximum_active[0] = max(maximum_active[0], active[0])
    try:
        time.sleep(0.02 + 0.002 * (parameter % 2))
        return {"parameter": parameter, "seed": context.seed}
    finally:
        with lock:
            active[0] -= 1

result = run_parameter_sweep(
    list(range(9)),
    evaluator,
    seed=23,
    concurrency=3,
)
assert result.success
assert [item.value["parameter"] for item in result.items] == list(range(9))
assert 2 <= maximum_active[0] <= 3
assert result.plan.effective_concurrency == 3
assert result.plan.to_dict()["executor"] == {
    "kind": "cpython_threads",
    "name": "bounded-thread-pool",
    "replayable": False,
}
print("threaded bounded sweep passed")
`;
  assert.equal(
    runCPython(threadedWitness),
    "threaded bounded sweep passed",
  );
});

test("CPython concurrent sweeps preserve determinism and batch fail-fast semantics", () => {
  const source = String.raw`
from sagejs.numerics.sweeps import run_parameter_sweep

lock = threading.Lock()
started = []

def evaluator(parameter, context):
    with lock:
        started.append(parameter)
    time.sleep(0.003 * (3 - (parameter % 3)))
    if parameter == 1:
        raise RuntimeError("stop this batch")
    return {"parameter": parameter, "seed": context.seed}

first = run_parameter_sweep(
    list(range(8)), evaluator, seed=91, concurrency=3, mode="fail_fast"
)
assert first.status == "fail_fast"
assert sorted(started) == [0, 1, 2]
assert [item.status for item in first.items] == [
    "completed", "callback_error", "completed",
    "skipped_fail_fast", "skipped_fail_fast", "skipped_fail_fast",
    "skipped_fail_fast", "skipped_fail_fast",
]

def successful(parameter, context):
    time.sleep(0.002 * ((parameter + 1) % 3))
    return {"parameter": parameter, "seed": context.seed}

left = run_parameter_sweep(list(range(8)), successful, seed=91, concurrency=3)
right = run_parameter_sweep(list(range(8)), successful, seed=91, concurrency=3)
assert [item.index for item in left.items] == list(range(8))
assert [item.value for item in left.items] == [item.value for item in right.items]
assert [item.seed for item in left.items] == [item.seed for item in right.items]
assert [item.to_dict()["credits"] for item in left.items] == [
    item.to_dict()["credits"] for item in right.items
]
print("concurrent determinism and fail-fast passed")
`;
  assert.equal(runCPython(source), "concurrent determinism and fail-fast passed");
});

test("CPython concurrent sweep cancellation remains bounded and skips later batches", () => {
  const source = String.raw`
from sagejs.numerics.sweeps import run_parameter_sweep

lock = threading.Lock()
gate = threading.Barrier(3)
cancelled = threading.Event()
active = [0]
maximum_active = [0]

def evaluator(parameter, context):
    with lock:
        active[0] += 1
        maximum_active[0] = max(maximum_active[0], active[0])
    try:
        gate.wait(timeout=2)
        if parameter == 0:
            cancelled.set()
        time.sleep(0.01)
        context.check()
        return parameter
    finally:
        with lock:
            active[0] -= 1

result = run_parameter_sweep(
    list(range(9)),
    evaluator,
    concurrency=3,
    cancel=cancelled.is_set,
)
assert result.status == "cancelled"
assert maximum_active[0] == 3
assert [item.status for item in result.items[:3]] == [
    "cancelled", "cancelled", "cancelled"
]
assert {item.status for item in result.items[3:]} == {"skipped_cancelled"}
print("concurrent cancellation passed")
`;
  assert.equal(runCPython(source), "concurrent cancellation passed");
});

test("Sage.js concurrency fallback is explicit and can be required fail-closed", () => {
  const source = String.raw`
from sagejs.numerics.sweeps import (
    SweepConcurrencyUnsupportedError,
    plan_parameter_sweep,
)

fallback = plan_parameter_sweep([0, 1], concurrency=2)
assert fallback.effective_concurrency == 1
assert fallback.to_dict()["executor"]["kind"] == "sequential"
assert "no qualified live-callable concurrency executor" in fallback.to_dict()["fallback_reason"]
try:
    plan_parameter_sweep(
        [0, 1], concurrency=2, concurrency_fallback="error"
    )
except SweepConcurrencyUnsupportedError as error:
    assert error.runtime == "sagejs"
    assert error.concurrency == 2
else:
    raise AssertionError("unsupported concurrency did not fail closed")
print("sagejs concurrency policy passed")
`;
  assert.equal(runSagejs(source), "sagejs concurrency policy passed");
});
