import { MessagePort, parentPort, workerData } from "node:worker_threads";
import { runInThisContext } from "node:vm";

import type { SageLanguageMode } from "./kernel-evaluator";
import { createTaskEvaluator } from "./task-evaluator";

interface EncodedSequence {
  __sagejs_multiprocessing__: "list" | "tuple";
  items: EncodedValue[];
}

interface EncodedFunction {
  __sagejs_multiprocessing__: "function";
  source: string;
  bindings: Record<string, EncodedValue>;
}

type EncodedValue =
  | null
  | boolean
  | string
  | number
  | bigint
  | EncodedSequence
  | EncodedFunction;

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
  if (
    value !== null &&
    typeof value === "object" &&
    (value.__sagejs_multiprocessing__ === "list" ||
      value.__sagejs_multiprocessing__ === "tuple")
  ) {
    const items = value.items.map(decode);
    if (value.__sagejs_multiprocessing__ === "tuple") {
      const makeTuple = Reflect.get(globalThis, "ρσ_math_tuple");
      if (typeof makeTuple === "function") {
        return Reflect.apply(makeTuple, undefined, [items]);
      }
    }
    return items;
  }
  if (
    value !== null &&
    typeof value === "object" &&
    value.__sagejs_multiprocessing__ === "function"
  ) {
    const names = Object.keys(value.bindings);
    const factory = runInThisContext(
      `(function(${names.join(",")}) { return (${value.source}); })`,
      { filename: "<multiprocessing-dependency>" },
    ) as (...values: unknown[]) => unknown;
    return Reflect.apply(
      factory,
      undefined,
      names.map((name) => decode(value.bindings[name])),
    );
  }
  return value;
}

function encode(value: unknown): EncodedValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint"
  ) {
    return value as null | boolean | string | number | bigint;
  }
  if (Array.isArray(value)) {
    return {
      __sagejs_multiprocessing__: Object.isFrozen(value) ? "tuple" : "list",
      items: value.map(encode),
    };
  }
  throw new TypeError(
    "multiprocessing cannot yet serialize this result; supported values are " +
      "None, booleans, strings, numbers, exact integers, and nested sequences",
  );
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
    port.postMessage({
      type: "result",
      id: message.id,
      ok: true,
      value: encode(result),
    });
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
