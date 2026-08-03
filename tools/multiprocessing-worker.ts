import { MessagePort, parentPort, workerData } from "node:worker_threads";
import { runInThisContext } from "node:vm";

import type { SageLanguageMode } from "./kernel-evaluator";
import { createTaskEvaluator } from "./task-evaluator";
import { decode as decodePacket, encode as encodePacket } from "./serialization";
import type { SagePacket } from "./serialization";

interface EncodedFunction {
  __sagejs_multiprocessing__: "function";
  source: string;
  bindings: Record<string, EncodedValue>;
  metadata: Record<string, EncodedValue>;
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
}

interface TaskMessage {
  type: "task";
  id: number;
  callable: CallableSpec;
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
  return {
    name: value?.name ?? "Error",
    message: value?.message ?? String(error),
    stack: value?.stack,
  };
}

function decode(value: EncodedValue): unknown {
  if (isEncodedFunction(value)) {
    const names = Object.keys(value.bindings);
    const factory = runInThisContext(
      `(function(${names.join(",")}) { return (${value.source}); })`,
      { filename: "<multiprocessing-dependency>" },
    ) as (...values: unknown[]) => unknown;
    const callable = Reflect.apply(
      factory,
      undefined,
      names.map((name) => decode(value.bindings[name])),
    );
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
    onOutput(text) {
      port.postMessage({ type: "stdout", text });
      signal();
    },
  });
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

port.on("message", (message: TaskMessage | { type: "close" }) => {
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
    const result = evaluator.invoke(
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
      message.args.map(decode),
    );
    const value = encode(result);
    port.postMessage({
      type: "result",
      id: message.id,
      ok: true,
      value,
    }, value.buffers);
  } catch (error) {
    port.postMessage({
      type: "result",
      id: message.id,
      ok: false,
      error: errorValue(error),
    });
  }
  signal();
});
