import { createCminpackBackend } from "/backend.mjs";

let backend;
self.onmessage = async ({ data: message }) => {
  try {
    if (message.kind === "initialize") {
      backend = await createCminpackBackend(message.artifact);
      self.postMessage({ kind: "ready" });
    } else if (message.kind === "cancel") {
      const cancellationBuffer = new Int32Array(message.cancellation);
      let announced = false;
      const result = backend.leastSquares({
        method: "cminpack-lmdif",
        initial: [-100],
        residualCount: 1,
        residual: ([x]) => {
          if (!announced) {
            announced = true;
            self.postMessage({ kind: "evaluating" });
          }
          const deadline = performance.now() + 2;
          while (performance.now() < deadline) {}
          return [x - 1];
        },
        cancellationBuffer,
        maximumEvaluations: 10000,
        maximumCallbackEvaluations: 10000,
      });
      self.postMessage({ kind: "result", result, inspect: backend.inspect() });
    } else if (message.kind === "rosenbrock") {
      const result = backend.leastSquares({
        method: "cminpack-lmder",
        initial: [-1.2, 1], residualCount: 2,
        residual: ([x, y]) => [10 * (y - x * x), 1 - x],
        jacobian: ([x]) => [[-20 * x, 10], [-1, 0]],
      });
      self.postMessage({ kind: "result", result, inspect: backend.inspect() });
    } else if (message.kind === "hang") {
      self.postMessage({ kind: "hanging" });
      while (true) {}
    }
  } catch (error) {
    self.postMessage({ kind: "error", error: String(error.stack || error) });
  }
};
