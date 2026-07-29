import { parentPort, workerData } from "worker_threads";

import {
  createKernelEvaluator,
  SageLanguageMode,
} from "./kernel-evaluator";

if (!parentPort) {
  throw new Error("the Sage.js kernel worker requires a parent port");
}

function serializeError(error: unknown) {
  const value = error as {
    name?: string;
    message?: string;
    stack?: string;
  };
  return {
    name: value?.name ?? "Error",
    message: value?.message ?? String(error),
    stack: value?.stack,
  };
}

let evaluationId: number | undefined;
const evaluator = createKernelEvaluator({
  mode: workerData.mode as SageLanguageMode,
  onOutput(text) {
    parentPort.postMessage({
      type: "stdout",
      id: evaluationId,
      text,
    });
  },
});

parentPort.on("message", (message) => {
  if (message.type === "evaluate") {
    evaluationId = message.id;
    try {
      const result = evaluator.evaluate(message.source, {
        filename: message.filename,
      });
      parentPort.postMessage({
        type: "result",
        id: message.id,
        ok: true,
        result,
      });
    } catch (error) {
      parentPort.postMessage({
        type: "result",
        id: message.id,
        ok: false,
        error: serializeError(error),
      });
    } finally {
      evaluationId = undefined;
    }
  } else if (message.type === "close") {
    evaluator.close();
    parentPort.close();
  }
});

parentPort.postMessage({
  type: "ready",
  protocol: 1,
});
