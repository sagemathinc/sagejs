import { instantiateSageEvaluator } from "./evaluator.mjs";

function serializeError(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  };
}

let evaluatorPromise;
let evaluationTail = Promise.resolve();

async function initialize(message) {
  if (evaluatorPromise) {
    throw new Error("Sage.js browser kernel is already initialized");
  }
  evaluatorPromise = instantiateSageEvaluator({
    compiler: message.compiler,
    baselib: message.baselib,
    flint: message.flint,
    compilerWorker: message.compilerWorker,
  });
  await evaluatorPromise;
  self.postMessage({
    type: "ready",
    protocol: 1,
  });
}

async function evaluate(message) {
  const evaluator = await evaluatorPromise;
  const started = performance.now();
  const result = await evaluator.evaluate(message.source, {
    filename: message.filename,
    onOutput(text) {
      self.postMessage({
        type: "stdout",
        id: message.id,
        text,
      });
    },
  });
  self.postMessage({
    type: "result",
    id: message.id,
    ok: true,
    result: {
      repr: result.repr,
      display: result.display,
      durationMs: performance.now() - started,
    },
  });
}

self.onmessage = ({ data }) => {
  if (data.type === "initialize") {
    void initialize(data).catch((error) => {
      self.postMessage({
        type: "initialization-error",
        error: serializeError(error),
      });
    });
    return;
  }
  if (data.type !== "evaluate") return;

  const run = evaluationTail.then(() => evaluate(data));
  evaluationTail = run.catch((error) => {
    self.postMessage({
      type: "result",
      id: data.id,
      ok: false,
      error: serializeError(error),
    });
  });
};
