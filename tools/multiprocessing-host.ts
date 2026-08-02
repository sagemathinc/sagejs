import { join } from "node:path";
import {
  MessageChannel,
  MessagePort,
  receiveMessageOnPort,
  Worker,
} from "node:worker_threads";

import type { SageLanguageMode } from "./kernel-evaluator";
import { multiprocessingWorkerPath } from "./resources";

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

interface RemoteError {
  name: string;
  message: string;
  stack?: string;
}

interface PoolWorker {
  worker: Worker;
  port: MessagePort;
}

class MultiprocessingRemoteError extends Error {
  code = "EREMOTE";
  remoteName: string;
  remoteMessage: string;
  remoteStack?: string;

  constructor(error: RemoteError) {
    super(
      `${error.name}: ${error.message}` +
        (error.stack ? `\nRemote worker traceback:\n${error.stack}` : ""),
    );
    this.name = "MultiprocessingRemoteError";
    this.remoteName = error.name;
    this.remoteMessage = error.message;
    this.remoteStack = error.stack;
  }
}

function referencedBindings(
  callable: (...args: unknown[]) => unknown,
  source: string,
  ancestors: Set<unknown>,
): Record<string, EncodedValue> {
  const bindings: Record<string, EncodedValue> = {};
  const globals = Reflect.get(callable, "__globals__");
  const getitem = Reflect.get(globalThis, "ρσ_getitem");
  const names =
    source.match(
      /[A-Za-z_$\u0370-\u03ff][A-Za-z0-9_$\u0370-\u03ff]*/g,
    ) ?? [];
  for (const name of new Set(names)) {
    let value: unknown;
    if (globals !== null && typeof globals === "object") {
      value = Reflect.get(globals, name);
      const liveScope = Reflect.get(globals, "_scope");
      if (
        value === undefined &&
        liveScope !== null &&
        typeof liveScope === "object"
      ) {
        value = Reflect.get(liveScope, name);
      }
      if (value === undefined && typeof getitem === "function") {
        try {
          value = Reflect.apply(getitem, undefined, [globals, name]);
        } catch {
          // Missing dictionary keys are expected for local/property names.
        }
      }
    }
    if (
      value === undefined &&
      (name.startsWith("ρσ_kernel_") || name.includes("ρσ_const_"))
    ) {
      value = Reflect.get(globalThis, name);
    }
    if (value === undefined || value === callable) continue;
    try {
      bindings[name] = encode(value, ancestors);
    } catch {
      // Identifiers in generated JavaScript include property names and local
      // variables. Only capture values which cross the current deterministic
      // serialization boundary; a genuinely missing dependency will produce
      // a precise worker-side ReferenceError.
    }
  }
  return bindings;
}

function encode(value: unknown, ancestors = new Set<unknown>()): EncodedValue {
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
      items: value.map((item) => encode(item, ancestors)),
    };
  }
  if (typeof value === "function") {
    if (ancestors.has(value)) {
      throw new TypeError("multiprocessing cannot serialize recursive closures");
    }
    const nestedAncestors = new Set(ancestors);
    nestedAncestors.add(value);
    const source = Function.prototype.toString.call(value);
    return {
      __sagejs_multiprocessing__: "function",
      source,
      bindings: referencedBindings(
        value as (...args: unknown[]) => unknown,
        source,
        nestedAncestors,
      ),
    };
  }
  throw new TypeError(
    "multiprocessing cannot yet serialize this value; supported values are " +
      "None, booleans, strings, numbers, exact integers, and nested sequences",
  );
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
  return value;
}

function callableSpec(callable: unknown): CallableSpec {
  if (typeof callable !== "function") {
    throw new TypeError("Pool task target must be callable");
  }
  const moduleValue = Reflect.get(callable, "__module__");
  const nameValue = Reflect.get(callable, "__name__");
  const source = Function.prototype.toString.call(callable);
  const bindings = referencedBindings(
    callable as (...args: unknown[]) => unknown,
    source,
    new Set([callable]),
  );
  return {
    module: typeof moduleValue === "string" ? moduleValue : undefined,
    name: typeof nameValue === "string" ? nameValue : undefined,
    source,
    bindings,
  };
}

class SynchronousWorkerPool {
  private readonly workers: PoolWorker[] = [];
  private readonly state: Int32Array;
  private closed = false;

  constructor(
    readonly size: number,
    mode: SageLanguageMode,
  ) {
    this.state = new Int32Array(
      new SharedArrayBuffer((size + 1) * Int32Array.BYTES_PER_ELEMENT),
    );
    const workerFilename = multiprocessingWorkerPath(
      join(__dirname, "multiprocessing-worker.js"),
    );
    for (let index = 0; index < size; index += 1) {
      const channel = new MessageChannel();
      const worker = new Worker(workerFilename, {
        workerData: {
          mode,
          port: channel.port2,
          state: this.state.buffer,
          workerIndex: index,
        },
        transferList: [channel.port2],
      });
      worker.unref();
      this.workers.push({ worker, port: channel.port1 });
    }
    try {
      this.waitUntil(
        () =>
          this.workers.every(
            (_, index) => Atomics.load(this.state, index + 1) !== 0,
          ),
        120_000,
      );
    } catch (error) {
      this.abortInitialization();
      throw error;
    }
    const failed = this.workers.findIndex(
      (_, index) => Atomics.load(this.state, index + 1) < 0,
    );
    if (failed >= 0) {
      const message = this.nextMessage(this.workers[failed].port);
      const error = new MultiprocessingRemoteError(
        message?.error ?? {
          name: "Error",
          message: `multiprocessing worker ${failed} failed to initialize`,
        },
      );
      this.abortInitialization();
      throw error;
    }
    this.drainNonResults();
  }

  private nextMessage(port: MessagePort): any | undefined {
    return receiveMessageOnPort(port)?.message;
  }

  private abortInitialization(): void {
    for (const { worker, port } of this.workers) {
      port.close();
      void worker.terminate();
    }
  }

  private waitUntil(predicate: () => boolean, timeoutMs?: number): void {
    const deadline =
      timeoutMs === undefined ? undefined : Date.now() + timeoutMs;
    while (!predicate()) {
      const observed = Atomics.load(this.state, 0);
      if (predicate()) break;
      if (deadline !== undefined && Date.now() >= deadline) {
        throw new Error("timed out while initializing multiprocessing workers");
      }
      Atomics.wait(this.state, 0, observed, 1000);
    }
  }

  private drainNonResults(): void {
    for (const { port } of this.workers) {
      while (this.nextMessage(port) !== undefined) {
        // Startup and worker stdout are intentionally consumed here. A later
        // stream-aware API will route worker output explicitly.
      }
    }
  }

  map(callable: unknown, values: unknown[], star: boolean): unknown[] {
    if (this.closed) throw new Error("Pool is not running");
    if (values.length === 0) return [];
    const target = callableSpec(callable);
    const results = new Array<unknown>(values.length);
    const errors = new Array<RemoteError | undefined>(values.length);
    let received = 0;

    for (let index = 0; index < values.length; index += 1) {
      const rawArguments = star ? values[index] : [values[index]];
      if (!Array.isArray(rawArguments)) {
        throw new TypeError("Pool.starmap() arguments must be sequences");
      }
      this.workers[index % this.workers.length].port.postMessage({
        type: "task",
        id: index,
        callable: target,
        args: rawArguments.map((argument) => encode(argument)),
      });
    }

    this.waitUntil(() => {
      for (const { port } of this.workers) {
        let message;
        while ((message = this.nextMessage(port)) !== undefined) {
          if (message.type !== "result") continue;
          received += 1;
          if (message.ok) results[message.id] = decode(message.value);
          else errors[message.id] = message.error;
        }
      }
      return received === values.length;
    });

    const error = errors.find((value) => value !== undefined);
    if (error) throw new MultiprocessingRemoteError(error);
    return results;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const { port } of this.workers) port.postMessage({ type: "close" });
    this.waitUntil(() =>
      this.workers.every((_, index) => Atomics.load(this.state, index + 1) === 2),
    );
    for (const { port } of this.workers) port.close();
  }
}

export class NodeMultiprocessingAdapter {
  private readonly pools = new Map<number, SynchronousWorkerPool>();
  private nextPoolId = 1;

  constructor(private readonly mode: SageLanguageMode) {}

  createPool(processes: number): number {
    if (!Number.isInteger(processes) || processes < 1) {
      throw new RangeError("number of worker processes must be at least 1");
    }
    const id = this.nextPoolId++;
    this.pools.set(id, new SynchronousWorkerPool(processes, this.mode));
    return id;
  }

  map(
    id: number,
    callable: unknown,
    values: unknown[],
    star: boolean,
  ): unknown[] {
    const pool = this.pools.get(id);
    if (!pool) throw new Error("Pool is not running");
    return pool.map(callable, values, star);
  }

  closePool(id: number): void {
    const pool = this.pools.get(id);
    if (!pool) return;
    pool.close();
    this.pools.delete(id);
  }

  close(): void {
    for (const id of [...this.pools.keys()]) this.closePool(id);
  }
}
