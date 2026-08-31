// sagejs-test-tier: specialized

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  NumericalBackendCapabilityError,
  createCminpackBackend,
  solveLeastSquaresWithFallback,
} from
  "../../packages/flint-wasm/numerical/index.mjs";

const artifact = new URL(
  "../../packages/flint-wasm/numerical/build/cminpack.wasm",
  import.meta.url,
);

async function backend() {
  return createCminpackBackend(await readFile(artifact));
}

function assertClose(actual, expected, tolerance = 1e-9) {
  assert.equal(actual.length, expected.length);
  for (let index = 0; index < actual.length; index += 1) {
    assert.ok(
      Math.abs(actual[index] - expected[index]) <= tolerance,
      `${actual[index]} != ${expected[index]} at ${index}`,
    );
  }
}

test("lmdif recovers a linear fit through a packed residual callback", async () => {
  const solver = await backend();
  const xs = Array.from({ length: 30 }, (_, index) => (index - 10) / 7);
  const ys = xs.map((x) => 2.5 * x - 0.75);
  const result = solver.leastSquares({
    initial: [0, 0],
    residualCount: xs.length,
    residual: ([slope, intercept]) =>
      xs.map((x, index) => slope * x + intercept - ys[index]),
    maximumEvaluations: 300,
  });
  assert.equal(result.backendConverged, true);
  assert.equal(result.independentValidationRequired, true);
  assert.equal(result.method, "cminpack-lmdif");
  assertClose(result.value, [2.5, -0.75], 1e-10);
  const independentResidual = Math.hypot(
    ...xs.map((x, index) => result.value[0] * x + result.value[1] - ys[index]),
  );
  assert.ok(independentResidual < 1e-10);
  assert.deepEqual(solver.inspect(), {
    activeContexts: 0,
    activeHandle: 0,
    liveAllocations: 0,
    liveBytes: 0,
    memoryBytes: solver.inspect().memoryBytes,
  });
});

test("lmder uses the supplied complete Jacobian and preserves method identity", async () => {
  const solver = await backend();
  const result = solver.leastSquares({
    initial: [-1.2, 1],
    residualCount: 2,
    residual: ([x, y]) => [10 * (y - x * x), 1 - x],
    jacobian: ([x]) => [[-20 * x, 10], [-1, 0]],
    maximumEvaluations: 300,
  });
  assert.equal(result.backendConverged, true);
  assert.equal(result.method, "cminpack-lmder");
  assert.ok(result.jacobianEvaluations > 0);
  assertClose(result.value, [1, 1], 1e-10);
  assert.ok(Math.hypot(10 * (result.value[1] - result.value[0] ** 2), 1 - result.value[0]) < 1e-10);
});

test("callback exceptions unwind through C cleanup and preserve identity", async () => {
  const solver = await backend();
  const marker = new Error("objective exploded");
  assert.throws(
    () =>
      solver.leastSquares({
        initial: [0],
        residualCount: 1,
        residual: () => {
          throw marker;
        },
      }),
    (error) => error === marker,
  );
  assert.equal(solver.inspect().liveAllocations, 0);
  assert.equal(solver.inspect().activeContexts, 0);
});

test("cancellation, evaluation, and elapsed budgets stop at callback boundaries", async () => {
  const solver = await backend();
  const common = {
    initial: [10],
    residualCount: 1,
    residual: ([x]) => [x - 1],
  };
  assert.equal(
    solver.leastSquares({ ...common, cancelled: () => true }).status,
    "cancelled",
  );
  assert.equal(
    solver.leastSquares({ ...common, maximumCallbackEvaluations: 1 }).status,
    "maximum_evaluations",
  );
  assert.equal(
    solver.leastSquares({ ...common, maximumElapsedMs: 0 }).status,
    "maximum_elapsed_time",
  );
  const shared = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const cancellationBuffer = new Int32Array(shared);
  Atomics.store(cancellationBuffer, 0, 1);
  assert.equal(
    solver.leastSquares({ ...common, cancellationBuffer }).status,
    "cancelled",
  );
  assert.equal(solver.inspect().liveAllocations, 0);
});

test("non-finite and malformed callback outputs fail closed", async () => {
  const solver = await backend();
  assert.throws(
    () =>
      solver.leastSquares({
        initial: [0],
        residualCount: 1,
        residual: () => [Number.NaN],
      }),
    /not finite/,
  );
  assert.throws(
    () =>
      solver.leastSquares({
        initial: [0],
        residualCount: 2,
        residual: () => [1],
      }),
    /expected 2/,
  );
  assert.equal(solver.inspect().liveAllocations, 0);
});

test("the module rejects reentrant solves and remains reusable", async () => {
  const solver = await backend();
  assert.throws(
    () =>
      solver.leastSquares({
        initial: [0],
        residualCount: 1,
        residual: () => {
          solver.leastSquares({
            initial: [0],
            residualCount: 1,
            residual: ([x]) => [x],
          });
          return [0];
        },
      }),
    /not reentrant/,
  );
  const result = solver.leastSquares({
    initial: [4],
    residualCount: 1,
    residual: ([x]) => [x - 2],
  });
  assert.equal(result.backendConverged, true);
  assertClose(result.value, [2]);
});

test("repeated solves leave no live allocations and stabilize memory", async () => {
  const solver = await backend();
  solver.leastSquares({
    initial: [4],
    residualCount: 1,
    residual: ([x]) => [x - 2],
  });
  const warmedBytes = solver.inspect().memoryBytes;
  for (let run = 0; run < 250; run += 1) {
    const result = solver.leastSquares({
      initial: [run % 7],
      residualCount: 1,
      residual: ([x]) => [x - 2],
    });
    assert.equal(result.backendConverged, true);
    assert.equal(solver.inspect().liveAllocations, 0);
  }
  assert.equal(solver.inspect().memoryBytes, warmedBytes);
});

test("every internal allocation failure unwinds and leaves the reactor reusable", async () => {
  const solver = await backend();
  for (let failure = 0; failure < 9; failure += 1) {
    const result = solver.leastSquares({
      initial: [4],
      residualCount: 1,
      residual: ([x]) => [x - 2],
      testingAllocationFailureAfter: failure,
    });
    assert.equal(result.status, "allocation_failed");
    assert.equal(result.value, undefined);
    assert.equal(solver.inspect().liveAllocations, 0);
    assert.equal(solver.inspect().liveBytes, 0);
  }
  const recovered = solver.leastSquares({
    initial: [4],
    residualCount: 1,
    residual: ([x]) => [x - 2],
  });
  assert.equal(recovered.backendConverged, true);
  assertClose(recovered.value, [2]);
});

test("exact method requests fail closed while auto records fallback identity", async () => {
  const solver = await backend();
  assert.throws(
    () => solver.leastSquares({
      method: "cminpack-lmder",
      initial: [1],
      residualCount: 1,
      residual: ([x]) => [x],
    }),
    NumericalBackendCapabilityError,
  );
  let observed;
  const routed = solveLeastSquaresWithFallback(
    solver,
    {
      method: "auto",
      initial: Array.from({ length: 257 }, () => 0),
      residualCount: 257,
      residual: (point) => point,
    },
    (options, diagnostic) => {
      observed = { options, diagnostic };
      return { portable: true };
    },
  );
  assert.equal(routed.route, "ordinary-python");
  assert.equal(routed.result.portable, true);
  assert.equal(observed.options.method, "damped-gauss-newton");
  assert.deepEqual(observed.diagnostic, routed.diagnostic);
  assert.equal(routed.diagnostic.rejectedBackend, "cminpack-wasm");
});
