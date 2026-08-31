// This fixture deliberately instantiates the solver in the same worker that
// owns the JavaScript callback.  Functions are not structured-cloneable, so a
// nested "solver worker" would make arbitrary Sage.js callbacks impossible.
import { parentPort } from "node:worker_threads";

import { createCminpackBackend } from
  "../../packages/flint-wasm/numerical/index.mjs";

let backend;

parentPort.on("message", async (message) => {
  try {
    if (message.kind === "initialize") {
      backend = await createCminpackBackend(message.artifact);
      parentPort.postMessage({ kind: "ready" });
      return;
    }
    if (message.kind === "hang") {
      parentPort.postMessage({ kind: "hanging" });
      while (true) {}
    }
    if (message.kind === "rosenbrock") {
      const result = backend.leastSquares({
        method: "cminpack-lmder",
        initial: [-1.2, 1],
        residualCount: 2,
        residual: ([x, y]) => [10 * (y - x * x), 1 - x],
        jacobian: ([x]) => [[-20 * x, 10], [-1, 0]],
      });
      parentPort.postMessage({ kind: "result", result, inspect: backend.inspect() });
      return;
    }
    if (message.kind === "cancel") {
      const cancellationBuffer = new Int32Array(message.cancellation);
      let announced = false;
      const result = backend.leastSquares({
        method: "cminpack-lmdif",
        initial: [-100],
        residualCount: 1,
        residual: ([x]) => {
          if (!announced) {
            announced = true;
            parentPort.postMessage({ kind: "evaluating" });
          }
          const deadline = performance.now() + 2;
          while (performance.now() < deadline) {}
          return [x - 1];
        },
        cancellationBuffer,
        maximumEvaluations: 10000,
        maximumCallbackEvaluations: 10000,
      });
      parentPort.postMessage({ kind: "result", result, inspect: backend.inspect() });
      return;
    }
    throw new Error(`unknown worker request ${message.kind}`);
  } catch (error) {
    parentPort.postMessage({
      kind: "error",
      error: { name: error.name, message: error.message, stack: error.stack },
    });
  }
});
