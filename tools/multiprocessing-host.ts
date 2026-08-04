import { join } from "node:path";
import {
  MessageChannel,
  MessagePort,
  receiveMessageOnPort,
  Worker,
} from "node:worker_threads";

import type { SageLanguageMode } from "./kernel-evaluator";
import { multiprocessingWorkerPath } from "./resources";
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

interface RemoteError {
  name: string;
  message: string;
  stack?: string;
}

interface PoolWorker {
  worker: Worker;
  port: MessagePort;
}

interface PendingJob {
  results: unknown[];
  errors: Array<RemoteError | undefined>;
  received: number;
  total: number;
}

export interface PoolJobResult {
  ready: boolean;
  ok?: boolean;
  value?: unknown[];
  error?: RemoteError;
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

let serializationModule: typeof import("./serialization") | undefined;

function serialization(): typeof import("./serialization") {
  // Keep serialization and all mathematical codecs off the cold-start path.
  // This module is first loaded only when a Pool or explicit serializer is used.
  return serializationModule ??= require("./serialization");
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
  if (typeof value === "function") {
    if (ancestors.has(value)) {
      throw new TypeError("multiprocessing cannot serialize recursive closures");
    }
    const nestedAncestors = new Set(ancestors);
    nestedAncestors.add(value);
    const source = Function.prototype.toString.call(value);
    const metadata: Record<string, EncodedValue> = {};
    for (const name of [
      "__argnames__",
      "__defaults__",
      "__handles_kwarg_interpolation__",
      "__kwonly__",
      "__varkw__",
    ]) {
      const property = Reflect.get(value, name);
      if (property !== undefined) {
        metadata[name] = encode(property, nestedAncestors);
      }
    }
    return {
      __sagejs_multiprocessing__: "function",
      source,
      bindings: referencedBindings(
        value as (...args: unknown[]) => unknown,
        source,
        nestedAncestors,
      ),
      metadata,
    };
  }
  return serialization().encodeForTransfer(value);
}

function decode(value: EncodedValue): unknown {
  if (isEncodedFunction(value)) return value;
  return serialization().decode(value as SagePacket);
}

function packetBuffers(value: EncodedValue): ArrayBuffer[] {
  if (isEncodedFunction(value)) {
    return [
      ...Object.values(value.bindings).flatMap(packetBuffers),
      ...Object.values(value.metadata).flatMap(packetBuffers),
    ];
  }
  return (value as SagePacket).buffers;
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
  private readonly jobs = new Map<number, PendingJob>();
  private nextJobId = 1;
  private closed = false;
  private workersReleased = false;

  constructor(
    readonly size: number,
    mode: SageLanguageMode,
    initializer?: unknown,
    initargs: unknown[] = [],
  ) {
    this.state = new Int32Array(
      new SharedArrayBuffer((size + 1) * Int32Array.BYTES_PER_ELEMENT),
    );
    const workerFilename = multiprocessingWorkerPath(
      join(__dirname, "multiprocessing-worker.js"),
    );
    const initializerSpec =
      initializer === undefined || initializer === null
        ? undefined
        : callableSpec(initializer);
    const encodedInitargs = initargs.map((value) => encode(value));
    for (let index = 0; index < size; index += 1) {
      const channel = new MessageChannel();
      const worker = new Worker(workerFilename, {
        workerData: {
          mode,
          port: channel.port2,
          state: this.state.buffer,
          workerIndex: index,
          initializer: initializerSpec,
          initargs: encodedInitargs,
        },
        transferList: [channel.port2],
      });
      worker.unref();
      this.workers.push({ worker, port: channel.port1 });
    }
    try {
      const initialized = this.waitUntil(
        () =>
          this.workers.every(
            (_, index) => Atomics.load(this.state, index + 1) !== 0,
          ),
        120_000,
      );
      if (!initialized) {
        throw new Error(
          "timed out while initializing multiprocessing workers",
        );
      }
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

  private waitUntil(
    predicate: () => boolean,
    timeoutMs?: number,
  ): boolean {
    const deadline =
      timeoutMs === undefined ? undefined : Date.now() + timeoutMs;
    while (!predicate()) {
      const observed = Atomics.load(this.state, 0);
      if (predicate()) break;
      if (deadline !== undefined && Date.now() >= deadline) {
        return false;
      }
      const waitMilliseconds = deadline === undefined
        ? 1000
        : Math.min(1000, Math.max(0, deadline - Date.now()));
      Atomics.wait(this.state, 0, observed, waitMilliseconds);
    }
    return true;
  }

  private drainNonResults(): void {
    for (const { port } of this.workers) {
      while (this.nextMessage(port) !== undefined) {
        // Startup and worker stdout are intentionally consumed here. A later
        // stream-aware API will route worker output explicitly.
      }
    }
  }

  private drainMessages(): void {
    for (const { port } of this.workers) {
      let message;
      while ((message = this.nextMessage(port)) !== undefined) {
        if (message.type !== "result") continue;
        const job = this.jobs.get(Number(message.jobId));
        if (!job || job.received >= job.total) continue;
        job.received += 1;
        if (message.ok) job.results[message.id] = decode(message.value);
        else job.errors[message.id] = message.error;
      }
    }
  }

  submitMap(callable: unknown, values: unknown[], star: boolean): number {
    if (this.closed) throw new Error("Pool is not running");
    const target = callableSpec(callable);
    const jobId = this.nextJobId++;
    this.jobs.set(jobId, {
      results: new Array<unknown>(values.length),
      errors: new Array<RemoteError | undefined>(values.length),
      received: 0,
      total: values.length,
    });

    for (let index = 0; index < values.length; index += 1) {
      const rawArguments = star ? values[index] : [values[index]];
      if (!Array.isArray(rawArguments)) {
        this.jobs.delete(jobId);
        throw new TypeError("Pool.starmap() arguments must be sequences");
      }
      const args = rawArguments.map((argument) => encode(argument));
      const message = {
        type: "task",
        jobId,
        id: index,
        callable: target,
        args,
      };
      const transferList = args.flatMap(packetBuffers);
      this.workers[index % this.workers.length].port.postMessage(
        message,
        transferList,
      );
    }
    return jobId;
  }

  jobResult(jobId: number, timeoutMs?: number): PoolJobResult {
    const job = this.jobs.get(jobId);
    if (!job) throw new Error("unknown multiprocessing result");
    const ready = () => {
      this.drainMessages();
      return job.received === job.total;
    };
    if (!ready()) {
      const completed = this.waitUntil(
        ready,
        timeoutMs,
      );
      if (!completed) return { ready: false };
    }
    const error = job.errors.find((value) => value !== undefined);
    if (error) return { ready: true, ok: false, error };
    return { ready: true, ok: true, value: job.results };
  }

  forgetJob(jobId: number): void {
    this.jobs.delete(jobId);
  }

  map(callable: unknown, values: unknown[], star: boolean): unknown[] {
    const jobId = this.submitMap(callable, values, star);
    const result = this.jobResult(jobId);
    this.forgetJob(jobId);
    if (!result.ok) throw new MultiprocessingRemoteError(result.error!);
    return result.value!;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const { port } of this.workers) port.postMessage({ type: "close" });
  }

  join(): void {
    if (!this.closed) throw new Error("Pool is still running");
    if (this.workersReleased) return;
    this.waitUntil(() => {
      this.drainMessages();
      return this.workers.every(
        (_, index) => Atomics.load(this.state, index + 1) === 2,
      );
    });
    for (const { port } of this.workers) port.close();
    this.workersReleased = true;
  }

  terminate(): void {
    if (this.workersReleased) return;
    this.closed = true;
    const error = {
      name: "RuntimeError",
      message: "multiprocessing pool was terminated",
    };
    for (const job of this.jobs.values()) {
      if (job.received < job.total) {
        job.errors[0] = error;
        job.received = job.total;
      }
    }
    for (const { worker, port } of this.workers) {
      port.close();
      void worker.terminate();
    }
    this.workersReleased = true;
  }
}

export class NodeMultiprocessingAdapter {
  private readonly pools = new Map<number, SynchronousWorkerPool>();
  private nextPoolId = 1;

  constructor(private readonly mode: SageLanguageMode) {}

  createPool(
    processes: number,
    initializer?: unknown,
    initargs: unknown[] = [],
  ): number {
    if (!Number.isInteger(processes) || processes < 1) {
      throw new RangeError("number of worker processes must be at least 1");
    }
    const id = this.nextPoolId++;
    this.pools.set(
      id,
      new SynchronousWorkerPool(
        processes, this.mode, initializer, initargs),
    );
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

  submitMap(
    id: number,
    callable: unknown,
    values: unknown[],
    star: boolean,
  ): number {
    const pool = this.pools.get(id);
    if (!pool) throw new Error("Pool is not running");
    return pool.submitMap(callable, values, star);
  }

  jobResult(id: number, jobId: number, timeoutMs?: number): PoolJobResult {
    const pool = this.pools.get(id);
    if (!pool) throw new Error("Pool is not running");
    return pool.jobResult(jobId, timeoutMs);
  }

  forgetJob(id: number, jobId: number): void {
    this.pools.get(id)?.forgetJob(jobId);
  }

  closePool(id: number): void {
    const pool = this.pools.get(id);
    if (!pool) return;
    pool.close();
  }

  joinPool(id: number): void {
    const pool = this.pools.get(id);
    if (!pool) return;
    pool.join();
  }

  terminatePool(id: number): void {
    const pool = this.pools.get(id);
    if (!pool) return;
    pool.terminate();
  }

  close(): void {
    for (const pool of this.pools.values()) pool.terminate();
    this.pools.clear();
  }
}
