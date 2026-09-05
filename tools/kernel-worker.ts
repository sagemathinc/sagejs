import { serializeDiagnosticError } from "./python/diagnostics";
import { parentPort, workerData } from "worker_threads";

import {
  createKernelEvaluatorAsync,
  SageLanguageMode,
} from "./kernel-evaluator";

if (!parentPort) {
  throw new Error("the Sage.js kernel worker requires a parent port");
}

let evaluationId: number | undefined;
const interruptState = new Int32Array(
  workerData.interruptBuffer as SharedArrayBuffer,
);
async function main(): Promise<void> {
  const port = parentPort!;
  const evaluator = await createKernelEvaluatorAsync({
    mode: workerData.mode as SageLanguageMode,
    interruptState,
    onOutput(text) {
      port.postMessage({
        type: "stdout",
        id: evaluationId,
        text,
      });
    },
    onEvent(event) {
      port.postMessage({
        type: "output-event",
        id: evaluationId,
        event,
      });
    },
    onComm(event) {
      port.postMessage({
        type: "comm-event",
        id: evaluationId,
        event,
      });
    },
  });

  port.on("message", (message) => {
  if (
    message.type === "evaluate" ||
    message.type === "complete" ||
    message.type === "inspect" ||
    message.type === "isComplete" ||
    message.type === "documentation" ||
    message.type === "comm" ||
    message.type === "commInfo"
  ) {
    evaluationId = message.id;
    try {
      let result;
      if (message.type === "evaluate") {
        result = evaluator.evaluate(message.source, {
          filename: message.filename,
          language: message.language,
          suppressResult: message.suppressResult,
          parentId: message.parentId,
          structuredResult: message.structuredResult,
        });
      } else if (message.type === "complete") {
        result = evaluator.complete(message.source, message.cursorPosition);
      } else if (message.type === "inspect") {
        result = evaluator.inspect(message.source, message.cursorPosition);
      } else if (message.type === "documentation") {
        result = evaluator.documentation();
      } else if (message.type === "comm") {
        evaluator.comm(message.event);
        result = undefined;
      } else if (message.type === "commInfo") {
        result = evaluator.commInfo(message.targetName);
      } else {
        result = evaluator.isComplete(message.source, message.language);
      }
      port.postMessage({
        type: "result",
        id: message.id,
        ok: true,
        result,
      });
    } catch (error) {
      const serialized = serializeDiagnosticError(error);
      if (serialized.name === "KeyboardInterrupt") {
        Atomics.store(interruptState, 0, 0);
      }
      port.postMessage({
        type: "result",
        id: message.id,
        ok: false,
        error: serialized,
      });
    } finally {
      evaluationId = undefined;
    }
  } else if (message.type === "close") {
    evaluator.close();
      port.close();
    }
  });

  port.postMessage({
    type: "ready",
    protocol: 1,
  });
}

void main().catch((error) => {
  parentPort!.postMessage({
    type: "startup-error",
    error: serializeDiagnosticError(error),
  });
  parentPort!.close();
});
