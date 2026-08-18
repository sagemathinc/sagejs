import { MessagePort, parentPort, workerData } from "node:worker_threads";
import type { SageLanguageMode } from "./kernel-evaluator";
import { createTaskEvaluator } from "./task-evaluator";
import {
  decode as decodePacket,
  encodeForTransfer as encodePacket,
} from "./serialization";
import type { SagePacket } from "./serialization";

interface EncodedFunction {
  __sagejs_multiprocessing__: "function";
  source: string;
  bindings: Record<string, EncodedValue>;
  metadata: Record<string, EncodedValue>;
  moduleGlobals: Record<string, string>;
  module?: string;
  name?: string;
  publishInModule?: boolean;
}

type EncodedValue = SagePacket | EncodedFunction;

function isEncodedFunction(value: EncodedValue): value is EncodedFunction {
  return (
    value !== null &&
    typeof value === "object" &&
    Reflect.get(value, "__sagejs_multiprocessing__") === "function"
  );
}

interface CallableSpec {
  module?: string;
  name?: string;
  source: string;
  bindings?: Record<string, EncodedValue>;
  moduleGlobals?: Record<string, string>;
  publishInModule?: boolean;
}

interface TaskMessage {
  type: "task";
  jobId: number;
  id: number;
  callable: CallableSpec;
  args: EncodedValue[];
}

interface ModuleTaskMessage {
  type: "module-task";
  jobId: number;
  id: number;
  module: string;
  name: string;
  args: EncodedValue[];
}

const port = workerData.port as MessagePort;
const state = new Int32Array(workerData.state as SharedArrayBuffer);
const workerIndex = Number(workerData.workerIndex);
let evaluator: ReturnType<typeof createTaskEvaluator> | undefined;

function signal(): void {
  Atomics.add(state, 0, 1);
  Atomics.notify(state, 0);
}

function errorValue(error: unknown) {
  const value = error as {
    name?: string;
    message?: string;
    stack?: string;
  };
  // Sage.js intentionally implements Python NameError with JavaScript's
  // ReferenceError constructor (`NameError = runtime.reference_error`).  The
  // worker boundary transports Python exception names rather than JavaScript
  // implementation names, so restore the public Python identity here.
  const name = value?.name === "ReferenceError"
    ? "NameError"
    : value?.name ?? "Error";
  return {
    name,
    message: value?.message ?? String(error),
    stack: value?.stack,
  };
}

function decode(value: EncodedValue): unknown {
  if (isEncodedFunction(value)) {
    if (!evaluator) throw new Error("multiprocessing worker did not initialize");
    const callable = evaluator.reconstruct({
      source: value.source,
      module: value.module,
      name: value.name,
      publishInModule: value.publishInModule,
      moduleGlobals: value.moduleGlobals,
      bindings: Object.fromEntries(
        Object.entries(value.bindings).map(([name, binding]) => [
          name,
          decode(binding),
        ]),
      ),
    });
    for (const [name, property] of Object.entries(value.metadata ?? {})) {
      Reflect.set(callable as object, name, decode(property));
    }
    return callable;
  }
  return decodePacket(value as SagePacket);
}

function encode(value: unknown): SagePacket {
  return encodePacket(value);
}

try {
  evaluator = createTaskEvaluator({
    mode: workerData.mode as SageLanguageMode,
    precompiledNativeRuntime: workerData.precompiledNativeRuntime === true,
    onOutput(text) {
      port.postMessage({ type: "stdout", text });
      signal();
    },
  });
  if (workerData.initializer) {
    evaluator.invoke(
      {
        ...workerData.initializer,
        bindings: workerData.initializer.bindings
          ? Object.fromEntries(
              Object.entries(workerData.initializer.bindings).map(
                ([name, value]) => [name, decode(value as EncodedValue)],
              ),
            )
          : undefined,
      },
      ((workerData.initargs as EncodedValue[] | undefined) ?? []).map(decode),
    );
  }
  Atomics.store(state, workerIndex + 1, 1);
  port.postMessage({ type: "ready", workerIndex });
  signal();
} catch (error) {
  Atomics.store(state, workerIndex + 1, -1);
  port.postMessage({
    type: "fatal",
    workerIndex,
    error: errorValue(error),
  });
  signal();
}

port.on("message", (message: TaskMessage | ModuleTaskMessage | { type: "close" }) => {
  if (message.type === "close") {
    evaluator?.close();
    Atomics.store(state, workerIndex + 1, 2);
    port.postMessage({ type: "closed", workerIndex });
    signal();
    port.close();
    parentPort?.close();
    return;
  }

  try {
    if (!evaluator) throw new Error("multiprocessing worker did not initialize");
    const args = message.args.map(decode);
    const result = message.type === "module-task"
      ? evaluator.invokeModule(message.module, message.name, args)
      : evaluator.invoke(
        {
          ...message.callable,
          bindings: message.callable.bindings
            ? Object.fromEntries(
                Object.entries(message.callable.bindings).map(([name, value]) => [
                  name,
                  decode(value),
                ]),
              )
            : undefined,
        },
        args,
      );
    const value = encode(result);
    port.postMessage({
      type: "result",
      jobId: message.jobId,
      id: message.id,
      ok: true,
      value,
    }, value.buffers);
  } catch (error) {
    port.postMessage({
      type: "result",
      jobId: message.jobId,
      id: message.id,
      ok: false,
      error: errorValue(error),
    });
  }
  signal();
});
