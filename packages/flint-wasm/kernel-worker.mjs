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
let compilerOptimizationReport;

function validOptimizationReport(value) {
  return (
    value?.schema === "sagejs.optimizer-evaluation/v1" &&
    value?.authority === "compiler-verified-static" &&
    value?.program?.schema === "sagejs.optimizing-mathematics/v1" &&
    Array.isArray(value?.program?.passes) &&
    Array.isArray(value?.program?.contracts) &&
    Array.isArray(value?.program?.regions)
  );
}

// The nested compiler worker is already isolated from evaluated code. Observe
// only its verified static report here rather than publishing a trace hook into
// the evaluator global. Returning an explicit object from a constructor is
// supported by JavaScript and preserves the Worker interface expected by the
// evaluator without modifying that separately certified source boundary.
function ReportingCompilerWorker(url, options) {
  const worker = new Worker(url, options);
  worker.addEventListener("message", ({ data }) => {
    const report = data?.ok ? data?.result?.optimization : undefined;
    if (validOptimizationReport(report)) compilerOptimizationReport = report;
  });
  return worker;
}

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
    lazyModules: message.lazyModules,
    conwayData: message.conwayData,
    dynamicPrograms: message.dynamicPrograms,
    flint: message.flint,
    algebraic: message.algebraic,
    nativeKernels: message.nativeKernels,
    m4ri: message.m4ri,
    symbolic: message.symbolic,
    compilerWorker: message.compilerWorker,
    compilerFrontend: message.compilerFrontend,
    foreignFrontend: message.foreignFrontend,
    treeSitterRuntime: message.treeSitterRuntime,
    pythonGrammar: message.pythonGrammar,
    sageGrammar: message.sageGrammar,
    foreignGrammars: message.foreignGrammars,
    capabilityReport: message.capabilityReport,
    WorkerConstructor: ReportingCompilerWorker,
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
  compilerOptimizationReport = undefined;
  const result = await evaluator.evaluate(message.source, {
    filename: message.filename,
    onOutput(text) {
      send({
        type: "stdout",
        id: message.id,
        text,
      });
    },
    onError(text) {
      send({
        type: "stderr",
        id: message.id,
        text,
      });
    },
  });
  if (!validOptimizationReport(compilerOptimizationReport)) {
    throw new TypeError("browser compiler did not return verified optimizer IR");
  }
  send({
    type: "result",
    id: message.id,
    ok: true,
    result: {
      repr: result.repr,
      display: result.display,
      saveRequests: result.saveRequests,
      instrumentation: result.instrumentation,
      optimization: compilerOptimizationReport,
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
