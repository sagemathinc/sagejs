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

test("CPython batch adapter bounds real concurrent work", () => {
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

def threaded_batch(jobs):
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(job) for job in jobs]
        return [future.result() for future in concurrent.futures.as_completed(futures)]

result = run_parameter_sweep(
    list(range(9)),
    evaluator,
    seed=23,
    concurrency=3,
    batch_executor=threaded_batch,
    executor_record={
        "kind": "cpython_threads",
        "name": "test-thread-pool",
        "replayable": False,
    },
)
assert result.success
assert [item.value["parameter"] for item in result.items] == list(range(9))
assert 2 <= maximum_active[0] <= 3
assert result.plan.effective_concurrency == 3
print("threaded bounded sweep passed")
`;
  assert.equal(
    runCPython(threadedWitness),
    "threaded bounded sweep passed",
  );
});
