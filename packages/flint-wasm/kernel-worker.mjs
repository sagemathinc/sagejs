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
let channel;

function send(message) {
  if (!channel) throw new Error("Sage.js browser kernel is not connected");
  channel.postMessage(message);
}

async function initialize(message) {
  if (evaluatorPromise) {
    throw new Error("Sage.js browser kernel is already initialized");
  }
  evaluatorPromise = instantiateSageEvaluator({
    compiler: message.compiler,
    baselib: message.baselib,
    standardLibrary: message.standardLibrary,
    flint: message.flint,
    algebraic: message.algebraic,
    nativeKernels: message.nativeKernels,
    m4ri: message.m4ri,
    symbolic: message.symbolic,
    compilerWorker: message.compilerWorker,
    compilerFrontend: message.compilerFrontend,
    treeSitterRuntime: message.treeSitterRuntime,
    pythonGrammar: message.pythonGrammar,
    sageGrammar: message.sageGrammar,
    capabilityReport: message.capabilityReport,
  });
  await evaluatorPromise;
  send({
    type: "ready",
    protocol: 2,
  });
}

async function evaluate(message) {
  const evaluator = await evaluatorPromise;
  const started = performance.now();
  const result = await evaluator.evaluate(message.source, {
    filename: message.filename,
    onOutput(text) {
      send({
        type: "stdout",
        id: message.id,
        text,
      });
    },
  });
  send({
    type: "result",
    id: message.id,
    ok: true,
    result: {
      repr: result.repr,
      display: result.display,
      saveRequests: result.saveRequests,
      durationMs: performance.now() - started,
    },
  });
}

self.onmessage = ({ data, ports }) => {
  if (
    channel ||
    !data ||
    data.type !== "initialize" ||
    data.protocol !== 2 ||
    ports.length !== 1
  ) {
    return;
  }
  channel = ports[0];
  self.onmessage = null;
  channel.onmessage = ({ data: privateData }) => {
    if (
      !privateData ||
      privateData.type !== "evaluate" ||
      !Number.isSafeInteger(privateData.id) ||
      privateData.id <= 0 ||
      typeof privateData.source !== "string" ||
      typeof privateData.filename !== "string"
    ) {
      return;
    }
    const run = evaluationTail.then(() => evaluate(privateData));
    evaluationTail = run.catch((error) => {
      send({
        type: "result",
        id: privateData.id,
        ok: false,
        error: serializeError(error),
      });
    });
  };
  channel.start?.();
  void initialize(data).catch((error) => {
    send({
      type: "initialization-error",
      error: serializeError(error),
    });
  });
};
