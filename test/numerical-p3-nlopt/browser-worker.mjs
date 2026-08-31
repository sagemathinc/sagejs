import { createNloptBackend } from "/index.mjs";

const backend = await createNloptBackend(
  new Uint8Array(await (await fetch("/artifact.wasm")).arrayBuffer()),
);
self.postMessage({ kind: "ready" });

self.onmessage = async ({ data }) => {
  const solver = backend;
  if (data.mode === "stuck") {
    solver.solve({
      method: "nlopt-nelder-mead",
      initial: [1],
      objective: () => {
        while (true) { /* outer evaluator termination is the hard-stop contract */ }
      },
    });
    return;
  }
  if (data.mode === "cooperative") {
    const cancellationBuffer = new Int32Array(data.shared);
    const result = solver.solve({
      method: "nlopt-nelder-mead",
      initial: [10, -10],
      initialStep: [1, 1],
      objective: ([x, y]) => {
        const started = performance.now();
        while (performance.now() - started < 1) { /* bounded expensive callback */ }
        return (x - 1) ** 2 + (y + 2) ** 2;
      },
      cancellationBuffer,
      maximumEvaluations: 10000,
    });
    self.postMessage({ kind: "result", result, inspect: solver.inspect() });
    return;
  }
  const result = solver.solve({
    method: "nlopt-cobyla",
    initial: [0],
    initialStep: [0.5],
    objective: ([x]) => (x - 0.25) ** 2,
    lower: [-1],
    upper: [1],
  });
  self.postMessage({ kind: "result", result, inspect: solver.inspect() });
};
