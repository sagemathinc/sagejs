/**
 * Host operating-system services exposed to the CPython-compatible library.
 *
 * Keep this module Node-only.  Browser and WASM evaluators deliberately do
 * not install the adapter; their pure path operations still work and their
 * filesystem operations fail when called with a useful NotImplementedError.
 */

import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as nodeOs from "node:os";
import * as path from "node:path";
import * as zlib from "node:zlib";
import { spawnSync } from "node:child_process";
import { Worker } from "node:worker_threads";

import type { SageLanguageMode } from "./kernel-evaluator";
import { NodeMultiprocessingAdapter } from "./multiprocessing-host";
import {
  classGroupServiceResource,
  hasPrecompiledTaskModule,
  type ClassGroupServiceResource,
} from "./resources";

interface HostFailure {
  code?: string;
  errno?: number;
  name?: string;
  remoteName?: string;
  remoteMessage?: string;
  remoteStack?: string;
  message: string;
  syscall?: string;
  path?: string;
  dest?: string;
}

type HostResult =
  | { ok: true; value: unknown }
  | { ok: false; error: HostFailure };

const synchronousWorkerPrelude = String.raw`
const { workerData } = require("node:worker_threads");
const control = new Int32Array(workerData.shared, 0, 2);
const output = new Uint8Array(workerData.shared, 8);
function finish(value) {
  let encoded;
  try { encoded = Buffer.from(JSON.stringify({ ok: true, value })); }
  catch (error) { encoded = Buffer.from(JSON.stringify({ ok: false, error: { code: error.code, message: error.message } })); }
  if (encoded.length > output.length) encoded = Buffer.from(JSON.stringify({ ok: false, error: { code: "ENOBUFS", message: "synchronous host response exceeded buffer" } }));
  output.set(encoded.subarray(0, output.length));
  Atomics.store(control, 1, Math.min(encoded.length, output.length));
  Atomics.store(control, 0, 1);
  Atomics.notify(control, 0);
}
function fail(error) { finish({ __sagejs_error__: { code: error && error.code, message: error && error.message ? error.message : String(error) } }); }
`;

function synchronousWorkerRequest(
  source: string,
  data: Record<string, unknown>,
  timeout = 30_000,
): unknown {
  const maximum = 64 * 1024 * 1024;
  const shared = new SharedArrayBuffer(8 + maximum);
  const control = new Int32Array(shared, 0, 2);
  const worker = new Worker(synchronousWorkerPrelude + source, {
    eval: true,
    workerData: { ...data, shared },
  });
  const result = Atomics.wait(control, 0, 0, timeout);
  void worker.terminate();
  if (result === "timed-out") {
    const error = new Error("synchronous host operation timed out") as NodeJS.ErrnoException;
    error.code = "ETIMEDOUT";
    throw error;
  }
  const length = Atomics.load(control, 1);
  const encoded = Buffer.from(new Uint8Array(shared, 8, length)).toString("utf8");
  const payload = JSON.parse(encoded) as {
    ok: boolean;
    value?: unknown;
    error?: { code?: string; message?: string };
  };
  if (!payload.ok) {
    const error = new Error(payload.error?.message ?? "host worker failed") as NodeJS.ErrnoException;
    error.code = payload.error?.code;
    throw error;
  }
  const value = payload.value as { __sagejs_error__?: { code?: string; message?: string } };
  if (value?.__sagejs_error__) {
    const error = new Error(value.__sagejs_error__.message ?? "host worker failed") as NodeJS.ErrnoException;
    error.code = value.__sagejs_error__.code;
    throw error;
  }
  return value;
}

const httpWorkerSource = String.raw`
const http = require("node:http");
const https = require("node:https");
function perform(url, redirects) {
  const target = new URL(url);
  const transport = target.protocol === "https:" ? https : http;
  const headers = Object.fromEntries(workerData.headers || []);
  const request = transport.request(target, { method: workerData.method, headers }, response => {
    const chunks = [];
    response.on("data", chunk => chunks.push(chunk));
    response.on("end", () => {
      const status = response.statusCode || 0;
      const location = response.headers.location;
      if (location && status >= 300 && status < 400 && redirects < 10) {
        perform(new URL(location, target).href, redirects + 1);
        return;
      }
      const responseHeaders = [];
      for (const [name, value] of Object.entries(response.headers)) {
        if (Array.isArray(value)) for (const item of value) responseHeaders.push([name, item]);
        else if (value !== undefined) responseHeaders.push([name, String(value)]);
      }
      finish({ status, reason: response.statusMessage || "", url: target.href, headers: responseHeaders, body: Buffer.concat(chunks).toString("base64") });
    });
  });
  request.on("error", fail);
  request.setTimeout(workerData.timeout, () => { const error = new Error("request timed out"); error.code = "ETIMEDOUT"; request.destroy(error); });
  if (workerData.body) request.write(Buffer.from(workerData.body));
  request.end();
}
perform(workerData.url, 0);
`;

const dnsWorkerSource = String.raw`
require("node:dns").lookup(workerData.hostname, { family: workerData.family || 0 }, (error, address, family) => {
  if (error) fail(error); else finish({ address, family });
});
`;

const tcpWorkerSource = String.raw`
const net = require("node:net");
const chunks = [];
let total = 0;
let completed = false;
const socket = net.createConnection({ host: workerData.host, port: workerData.port }, () => {
  if (workerData.payload) socket.write(Buffer.from(workerData.payload));
});
function done() {
  if (completed) return;
  completed = true;
  const body = Buffer.concat(chunks, total).subarray(0, workerData.maximum);
  finish({ body: body.toString("base64") });
  socket.destroy();
}
socket.on("data", chunk => { chunks.push(chunk); total += chunk.length; if (total >= workerData.maximum) done(); else setImmediate(done); });
socket.on("end", done);
socket.on("error", fail);
socket.setTimeout(workerData.timeout, () => { const error = new Error("socket timed out"); error.code = "ETIMEDOUT"; socket.destroy(error); });
`;

const CLASS_GROUP_REQUEST_BYTES = 1024 * 1024;
const CLASS_GROUP_RESPONSE_BYTES = 32 * 1024 * 1024;
const CLASS_GROUP_CONTROL_BYTES = 16;
const CLASS_GROUP_OPERATIONS = new Set([
  "capability",
  "open",
  "summary",
  "publication",
  "query",
  "close",
]);

const classGroupServiceWorkerSource = String.raw`
const { workerData } = require("node:worker_threads");
const { spawn } = require("node:child_process");
const readline = require("node:readline");
const control = new Int32Array(workerData.shared, 0, 4);
const input = new Uint8Array(
  workerData.shared,
  workerData.controlBytes,
  workerData.requestBytes,
);
const output = new Uint8Array(
  workerData.shared,
  workerData.controlBytes + workerData.requestBytes,
  workerData.responseBytes,
);
const decoder = new TextDecoder("utf-8", { fatal: true });
const encoder = new TextEncoder();
let child;
let nextId = 0;
let stderr = "";
let protocolError;
const pending = new Map();

function recordError(error) {
  return {
    code: typeof error?.code === "string" ? error.code : "ECLASSGROUP",
    name: typeof error?.name === "string" ? error.name : "Error",
    message: typeof error?.message === "string" ? error.message : String(error),
  };
}

function plainRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function corrupt(message) {
  const error = new Error(message);
  error.code = "EBADMSG";
  return error;
}

function failProtocol(error) {
  protocolError = error;
  for (const item of pending.values()) item.reject(error);
  pending.clear();
  child?.kill();
}

function validateServiceResponse(value, id) {
  if (!plainRecord(value) ||
      value.schema !== "sagejs.class-groups/service-response-v1" ||
      value.abi !== 1 || value.id !== id || typeof value.ok !== "boolean") {
    throw corrupt("class-group service returned a corrupt response envelope");
  }
  if (value.ok) {
    if (!plainRecord(value.result) || Object.hasOwn(value, "error")) {
      throw corrupt("class-group service returned a corrupt success result");
    }
    return value.result;
  }
  if (!plainRecord(value.error) ||
      value.error.schema !== "sagejs.class-groups/service-response-v1" ||
      value.error.outcome !== "error" || typeof value.error.category !== "string" ||
      typeof value.error.operation !== "string" || typeof value.error.message !== "string" ||
      Object.hasOwn(value, "result")) {
    throw corrupt("class-group service returned a corrupt failure result");
  }
  const error = new Error(value.error.message);
  error.code = value.error.category;
  error.name = typeof value.error.name === "string"
    ? value.error.name
    : "ClassGroupServiceError";
  throw error;
}

function startService() {
  child = spawn(workerData.filename, [], {
    stdio: ["pipe", "pipe", "pipe"],
    detached: true,
    windowsHide: true,
  });
  if (typeof child.pid !== "number" || child.pid <= 0) {
    throw new Error("class-group service did not publish a process id");
  }
  Atomics.store(control, 3, child.pid);
  child.stderr.on("data", chunk => {
    stderr = (stderr + chunk.toString("utf8")).slice(-4096);
  });
  let lineBytes = 0;
  child.stdout.on("data", chunk => {
    let start = 0;
    for (;;) {
      const newline = chunk.indexOf(10, start);
      if (newline < 0) break;
      lineBytes += newline - start;
      if (lineBytes > workerData.responseBytes) {
        failProtocol(corrupt("class-group service response exceeds the byte limit"));
        return;
      }
      lineBytes = 0;
      start = newline + 1;
    }
    lineBytes += chunk.length - start;
    if (lineBytes > workerData.responseBytes) {
      failProtocol(corrupt("class-group service response exceeds the byte limit"));
    }
  });
  const lines = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  lines.on("line", line => {
    if (protocolError !== undefined) return;
    let value;
    try { value = JSON.parse(line); }
    catch { value = corrupt("class-group service wrote non-JSON output"); }
    const id = plainRecord(value) && typeof value.id === "string" ? value.id : undefined;
    const slot = id === undefined ? undefined : pending.get(id);
    if (slot === undefined) {
      failProtocol(corrupt("class-group service response id mismatch"));
      return;
    }
    pending.delete(id);
    try { slot.resolve(validateServiceResponse(value, id)); }
    catch (error) { slot.reject(error); }
  });
  child.on("error", error => {
    for (const slot of pending.values()) slot.reject(error);
    pending.clear();
  });
  child.on("exit", (code, signal) => {
    if (Atomics.load(control, 3) === child.pid) Atomics.store(control, 3, 0);
    const detail = stderr.trim();
    const error = new Error(
      "class-group service exited" +
      (code === null ? "" : " with status " + code) +
      (signal === null ? "" : " after " + signal) +
      (detail.length === 0 ? "" : ": " + detail),
    );
    error.code = "EPIPE";
    for (const slot of pending.values()) slot.reject(error);
    pending.clear();
  });
}

function serviceCall(operation, request) {
  if (!plainRecord(request)) throw new TypeError("class-group request must be a plain object");
  if (protocolError !== undefined) return Promise.reject(protocolError);
  const id = "host-" + (++nextId);
  if (id.length > 64) throw new RangeError("class-group request id space exhausted");
  const message = {
    ...request,
    schema: "sagejs.class-groups/service-request-v1",
    abi: 1,
    id,
    operation,
  };
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify(message) + "\n", error => {
      if (!error) return;
      pending.delete(id);
      reject(error);
    });
  });
}

function finish(value) {
  let bytes;
  try { bytes = encoder.encode(JSON.stringify({ ok: true, value })); }
  catch (error) { bytes = encoder.encode(JSON.stringify({ ok: false, error: recordError(error) })); }
  if (bytes.length > output.length) {
    bytes = encoder.encode(JSON.stringify({
      ok: false,
      error: { code: "ENOBUFS", name: "RangeError", message: "class-group response exceeds the shared buffer" },
    }));
  }
  output.fill(0, 0, Math.min(64, output.length));
  output.set(bytes);
  Atomics.store(control, 2, bytes.length);
  Atomics.store(control, 0, 2);
  Atomics.notify(control, 0);
}

async function waitUntilChanged(expected) {
  while (Atomics.load(control, 0) === expected) {
    const waiter = Atomics.waitAsync(control, 0, expected);
    if (waiter.async) await waiter.value;
  }
}

async function main() {
  startService();
  for (;;) {
    await waitUntilChanged(0);
    const state = Atomics.load(control, 0);
    if (state === 3) break;
    if (state !== 1) {
      await waitUntilChanged(state);
      continue;
    }
    try {
      const length = Atomics.load(control, 1);
      if (length <= 0 || length > input.length) throw new RangeError("invalid class-group request length");
      const envelope = JSON.parse(decoder.decode(input.slice(0, length)));
      if (!plainRecord(envelope) || typeof envelope.operation !== "string" ||
          !plainRecord(envelope.request)) {
        throw new TypeError("invalid class-group host request");
      }
      const result = await serviceCall(envelope.operation, envelope.request);
      finish(result);
    } catch (error) {
      let bytes = encoder.encode(JSON.stringify({ ok: false, error: recordError(error) }));
      if (bytes.length > output.length) bytes = encoder.encode('{"ok":false,"error":{"code":"ENOBUFS","message":"class-group error exceeds the shared buffer"}}');
      output.set(bytes);
      Atomics.store(control, 2, bytes.length);
      Atomics.store(control, 0, 2);
      Atomics.notify(control, 0);
    }
    await waitUntilChanged(2);
  }
  child?.stdin.end();
  child?.kill();
}

process.on("exit", () => child?.kill());
main().catch(error => {
  finish({ __sagejs_worker_error__: recordError(error) });
  child?.kill();
});
`;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function classGroupHostError(
  code: string,
  message: string,
  name = "ClassGroupHostError",
): Error & { code: string } {
  const error = new Error(message) as Error & { code: string };
  error.name = name;
  error.code = code;
  return error;
}

/** Lazy synchronous facade over the resident asynchronous native service. */
export class NodeClassGroupBackend {
  private worker: Worker | undefined;
  private shared: SharedArrayBuffer | undefined;
  private control: Int32Array | undefined;
  private input: Uint8Array | undefined;
  private output: Uint8Array | undefined;
  private resource: ClassGroupServiceResource | undefined;
  private generation = 0n;
  private readonly sessions = new Map<
    string,
    { generation: string; handle: string }
  >();
  private closed = false;

  private capabilityDeclined(
    message: string,
    code = "capability-declined",
    route?: string,
  ): Record<string, unknown> {
    return {
      schema: "sagejs.class-groups/service-response-v1",
      outcome: "error",
      category: "capability-declined",
      operation: "capability",
      message,
      code,
      ...(route === undefined ? {} : { route }),
    };
  }

  private capability(): Record<string, unknown> {
    if (this.closed) {
      return this.capabilityDeclined("class-group backend is closed", "ECLOSED");
    }
    if (process.platform === "win32") {
      return this.capabilityDeclined(
        "native class groups are unavailable on Windows; use the Wasm worker fallback",
        "ENOSYS",
        "wasm-fallback",
      );
    }
    try {
      this.resource ??= classGroupServiceResource();
      if (this.resource === undefined) {
        return this.capabilityDeclined(
          "the optional native class-group service is not installed",
          "ENOENT",
        );
      }
      return {
        schema: "sagejs.class-groups/service-response-v1",
        outcome: "available",
        operation: "capability",
        abi: 1,
        mathematicalScope: "absolute-monic-cubic-conditional-grh",
        maximumResidentSessions: 4,
        proofModes: ["conditional-grh"],
        operations: ["capability", "open", "summary", "query", "publication", "close"],
        route: "native-resident-worker",
        artifactSha256: this.resource.artifactSha256,
        artifactBytes: this.resource.bytes,
      };
    } catch (error) {
      const failure = error as NodeJS.ErrnoException;
      return this.capabilityDeclined(
        failure.message,
        failure.code ?? "ECLASSGROUP",
      );
    }
  }

  private ensureWorker(): void {
    if (this.closed) throw classGroupHostError("ECLOSED", "class-group backend is closed");
    const capability = this.capability();
    if (capability.outcome !== "available" || this.resource === undefined) {
      throw classGroupHostError(
        String(capability.code ?? "ENOSYS"),
        String(capability.message ?? "native class groups are unavailable"),
        "ClassGroupUnavailableError",
      );
    }
    if (this.worker !== undefined) return;
    const shared = new SharedArrayBuffer(
      CLASS_GROUP_CONTROL_BYTES + CLASS_GROUP_REQUEST_BYTES + CLASS_GROUP_RESPONSE_BYTES,
    );
    this.shared = shared;
    this.control = new Int32Array(shared, 0, 4);
    this.input = new Uint8Array(shared, CLASS_GROUP_CONTROL_BYTES, CLASS_GROUP_REQUEST_BYTES);
    this.output = new Uint8Array(
      shared,
      CLASS_GROUP_CONTROL_BYTES + CLASS_GROUP_REQUEST_BYTES,
      CLASS_GROUP_RESPONSE_BYTES,
    );
    this.worker = new Worker(classGroupServiceWorkerSource, {
      eval: true,
      workerData: {
        shared,
        controlBytes: CLASS_GROUP_CONTROL_BYTES,
        requestBytes: CLASS_GROUP_REQUEST_BYTES,
        responseBytes: CLASS_GROUP_RESPONSE_BYTES,
        filename: this.resource.filename,
      },
    });
    // A warm resident service is an optimization, not process ownership. The
    // command-line runtime must be allowed to finish without an explicit
    // backend close; the process exit hook still tears down the service group.
    this.worker.unref();
    this.generation += 1n;
  }

  private retireWorker(): void {
    const worker = this.worker;
    const servicePid = this.control === undefined ? 0 : Atomics.load(this.control, 3);
    if (this.control !== undefined) {
      Atomics.store(this.control, 0, 3);
      Atomics.notify(this.control, 0);
    }
    this.worker = undefined;
    this.shared = undefined;
    this.control = undefined;
    this.input = undefined;
    this.output = undefined;
    this.sessions.clear();
    if (servicePid > 0 && process.platform !== "win32") {
      try {
        // The worker creates a dedicated service process group so abrupt
        // worker termination cannot orphan the service or its descendants.
        process.kill(-servicePid, "SIGKILL");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
          try {
            process.kill(servicePid, "SIGKILL");
          } catch {
            // Worker termination remains the final cleanup boundary.
          }
        }
      }
    }
    if (worker !== undefined) {
      const termination = setTimeout(() => void worker.terminate(), 250);
      termination.unref();
      worker.once("exit", () => clearTimeout(termination));
    }
  }

  call(operation: string, request: Record<string, unknown>): Record<string, unknown> {
    if (!CLASS_GROUP_OPERATIONS.has(operation)) {
      throw classGroupHostError("EINVAL", `unknown class-group operation: ${operation}`);
    }
    if (!isPlainRecord(request)) {
      throw new TypeError("class-group request must be a plain object");
    }
    if (operation === "capability") return this.capability();
    let serviceRequest = request;
    let sessionKey: string | undefined;
    if (operation !== "open") {
      if (typeof request.generation !== "string" ||
          !/^(0|[1-9][0-9]*)$/.test(request.generation) ||
          typeof request.handle !== "string" ||
          !/^(0|[1-9][0-9]*)$/.test(request.handle)) {
        throw classGroupHostError(
          "stale-handle",
          "class-group request has an invalid or stale session binding",
          "ClassGroupServiceError",
        );
      }
      sessionKey = `${request.generation}:${request.handle}`;
      const native = this.sessions.get(sessionKey);
      if (native === undefined) {
        throw classGroupHostError(
          "stale-handle",
          "class-group request has an invalid or stale session binding",
          "ClassGroupServiceError",
        );
      }
      serviceRequest = {
        ...request,
        generation: native.generation,
        handle: native.handle,
      };
    }
    this.ensureWorker();
    const control = this.control as Int32Array;
    const input = this.input as Uint8Array;
    const output = this.output as Uint8Array;
    const encoded = Buffer.from(JSON.stringify({ operation, request: serviceRequest }));
    if (encoded.length === 0 || encoded.length > input.length) {
      throw classGroupHostError("E2BIG", "class-group request exceeds the shared buffer", "RangeError");
    }
    if (Atomics.load(control, 0) !== 0) {
      this.retireWorker();
      throw classGroupHostError("EBUSY", "class-group worker protocol is not idle");
    }
    input.set(encoded);
    Atomics.store(control, 1, encoded.length);
    Atomics.store(control, 2, 0);
    Atomics.store(control, 0, 1);
    Atomics.notify(control, 0);
    const timeout = operation === "open" ? 120_000 : 30_000;
    const waited = Atomics.wait(control, 0, 1, timeout);
    if (waited === "timed-out") {
      this.retireWorker();
      throw classGroupHostError(
        "ETIMEDOUT",
        `class-group ${operation} operation timed out`,
        "ClassGroupTimeoutError",
      );
    }
    const length = Atomics.load(control, 2);
    if (Atomics.load(control, 0) !== 2 || length <= 0 || length > output.length) {
      this.retireWorker();
      throw classGroupHostError("EBADMSG", "class-group worker returned a corrupt response");
    }
    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.from(output.slice(0, length)).toString("utf8"));
    } catch {
      this.retireWorker();
      throw classGroupHostError("EBADMSG", "class-group worker returned invalid JSON");
    } finally {
      if (this.control !== undefined) {
        Atomics.store(control, 0, 0);
        Atomics.notify(control, 0);
      }
    }
    if (!isPlainRecord(payload) || typeof payload.ok !== "boolean") {
      this.retireWorker();
      throw classGroupHostError("EBADMSG", "class-group worker returned an invalid envelope");
    }
    if (!payload.ok) {
      const error = isPlainRecord(payload.error) ? payload.error : {};
      if (typeof error.code !== "string" || typeof error.message !== "string") {
        this.retireWorker();
        throw classGroupHostError("EBADMSG", "class-group worker returned an invalid error");
      }
      if (error.code === "EBADMSG") this.retireWorker();
      throw classGroupHostError(
        error.code,
        error.message,
        typeof error.name === "string" ? error.name : "ClassGroupServiceError",
      );
    }
    if (!isPlainRecord(payload.value)) {
      this.retireWorker();
      throw classGroupHostError("EBADMSG", "class-group worker returned a non-object result");
    }
    const value = payload.value;
    if (isPlainRecord(value.__sagejs_worker_error__)) {
      this.retireWorker();
      throw classGroupHostError("EPIPE", "class-group worker failed");
    }
    if (operation === "open") {
      if (typeof value.generation !== "string" || !/^(0|[1-9][0-9]*)$/.test(value.generation) ||
          typeof value.handle !== "string" || !/^(0|[1-9][0-9]*)$/.test(value.handle) ||
          !isPlainRecord(value.completion)) {
        this.retireWorker();
        throw classGroupHostError("EBADMSG", "class-group service returned an invalid open result");
      }
      value.artifactSha256 = this.resource?.artifactSha256;
      const nativeGeneration = value.generation;
      const nativeHandle = value.handle;
      value.generation = this.generation.toString();
      this.sessions.set(`${value.generation}:${nativeHandle}`, {
        generation: nativeGeneration,
        handle: nativeHandle,
      });
    } else if (operation === "summary") {
      value.artifactSha256 = this.resource?.artifactSha256;
    } else if (operation === "close" && sessionKey !== undefined) {
      this.sessions.delete(sessionKey);
    }
    return value;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.retireWorker();
  }
}

/*
 * Optional WebGPU twist screening lives in an isolated worker because Dawn's
 * adapter/device discovery is asynchronous while the CPython host ABI is
 * deliberately synchronous.  The worker is also a clean capability boundary:
 * installations without the optional `webgpu` package or a physical adapter
 * return `available=false` without changing the mathematical CPU path.
 *
 * Each invocation computes one deterministic f32 dot product per
 * (discriminant, derivative) pair.  There are no floating-point atomics and a
 * single invocation accumulates terms in increasing n order, so repeated runs
 * on one device have a fixed reduction order.  The authoritative Python layer
 * supplies and records conservative error bounds and refines retained rows
 * with Arb.
 */
const webGpuTwistShader = String.raw`
struct Parameters { rows: u32, orders: u32, terms: u32, padding: u32 }
@group(0) @binding(0) var<storage, read> coefficients: array<f32>;
@group(0) @binding(1) var<storage, read> characters: array<f32>;
@group(0) @binding(2) var<storage, read> weights: array<f32>;
@group(0) @binding(3) var<storage, read_write> output: array<f32>;
@group(0) @binding(4) var<uniform> parameters: Parameters;
@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let item = id.x;
  let total = parameters.rows * parameters.orders;
  if (item >= total) { return; }
  let row = item / parameters.orders;
  let order = item % parameters.orders;
  var sum: f32 = 0.0;
  var n: u32 = 0u;
  loop {
    if (n >= parameters.terms) { break; }
    let character = characters[row * parameters.terms + n];
    let weightIndex = (row * parameters.orders + order) * parameters.terms + n;
    sum = sum + coefficients[n] * character * weights[weightIndex];
    n = n + 1u;
  }
  output[item] = sum;
}
`;

const webGpuTwistWorkerSource = String.raw`
(async () => {
  const crypto = require("node:crypto");
  let webgpu;
  try { webgpu = require("webgpu"); }
  catch (error) {
    finish({ available: false, reason: "optional webgpu package unavailable", detail: String(error && error.message || error) });
    return;
  }
  Object.assign(globalThis, webgpu.globals);
  const options = String(process.env.SAGEJS_WEBGPU_OPTIONS || "")
    .split(";").map(value => value.trim()).filter(Boolean);
  const implementation = webgpu.create(options);
  const adapter = await implementation.requestAdapter({ powerPreference: "high-performance" });
  if (!adapter) {
    finish({ available: false, reason: "no WebGPU adapter available" });
    return;
  }
  const info = adapter.info || {};
  const provenance = {
    implementation: "webgpu-dawn-node-0.4.0",
    vendor: String(info.vendor || ""),
    architecture: String(info.architecture || ""),
    device: String(info.device || ""),
    description: String(info.description || ""),
    numericFormat: "f32",
    reduction: "one-invocation-increasing-index",
  };
  if (workerData.mode === "capabilities") {
    finish({ available: true, ...provenance });
    return;
  }
  const rows = Number(workerData.rows);
  const orders = Number(workerData.orders);
  const terms = Number(workerData.terms);
  const coefficients = Float32Array.from(workerData.coefficients || []);
  const characters = Float32Array.from(workerData.characters || []);
  const weights = Float32Array.from(workerData.weights || []);
  if (!Number.isSafeInteger(rows) || rows < 1 ||
      !Number.isSafeInteger(orders) || orders < 1 ||
      !Number.isSafeInteger(terms) || terms < 1 ||
      coefficients.length !== terms ||
      characters.length !== rows * terms ||
      weights.length !== rows * orders * terms) {
    throw new RangeError("invalid WebGPU twist-dot-product dimensions");
  }
  const outputLength = rows * orders;
  const shader = String(workerData.shader);
  const shaderHash = crypto.createHash("sha256").update(shader).digest("hex");
  if (options.includes("backend=null")) {
    const values = [];
    for (let row = 0; row < rows; row += 1) {
      for (let order = 0; order < orders; order += 1) {
        let sum = Math.fround(0);
        for (let n = 0; n < terms; n += 1) {
          const product = Math.fround(
            Math.fround(coefficients[n] * characters[row * terms + n]) *
              weights[(row * orders + order) * terms + n],
          );
          sum = Math.fround(sum + product);
        }
        values.push(sum);
      }
    }
    finish({
      available: true, values, shaderHash, rows, orders, terms,
      ...provenance,
      implementation: "webgpu-dawn-null-contract-emulator",
      device: "Dawn null adapter",
    });
    return;
  }
  const device = await adapter.requestDevice();
  function buffer(data, usage) {
    const size = Math.max(4, (data.byteLength + 3) & ~3);
    const result = device.createBuffer({ size, usage, mappedAtCreation: true });
    new Uint8Array(result.getMappedRange()).set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    result.unmap();
    return result;
  }
  const storageRead = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
  const coefficientBuffer = buffer(coefficients, storageRead);
  const characterBuffer = buffer(characters, storageRead);
  const weightBuffer = buffer(weights, storageRead);
  const outputBuffer = device.createBuffer({
    size: outputLength * 4,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
  });
  const readBuffer = device.createBuffer({
    size: outputLength * 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });
  const parameters = new Uint32Array([rows, orders, terms, 0]);
  const parameterBuffer = buffer(parameters, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
  const module = device.createShaderModule({ code: shader });
  const pipeline = device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "main" } });
  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: coefficientBuffer } },
      { binding: 1, resource: { buffer: characterBuffer } },
      { binding: 2, resource: { buffer: weightBuffer } },
      { binding: 3, resource: { buffer: outputBuffer } },
      { binding: 4, resource: { buffer: parameterBuffer } },
    ],
  });
  const encoder = device.createCommandEncoder();
  const pass = encoder.beginComputePass();
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.dispatchWorkgroups(Math.ceil(outputLength / 64));
  pass.end();
  encoder.copyBufferToBuffer(outputBuffer, 0, readBuffer, 0, outputLength * 4);
  device.queue.submit([encoder.finish()]);
  await readBuffer.mapAsync(GPUMapMode.READ);
  const values = Array.from(new Float32Array(readBuffer.getMappedRange().slice(0)));
  readBuffer.unmap();
  device.destroy();
  finish({ available: true, values, shaderHash, rows, orders, terms, ...provenance });
})().catch(fail);
`;

function failure(error: unknown): HostResult {
  const value = error as NodeJS.ErrnoException & {
    dest?: string;
    remoteName?: string;
    remoteMessage?: string;
    remoteStack?: string;
  };
  return {
    ok: false,
    error: {
      code: value?.code,
      name: value?.name,
      remoteName: value?.remoteName,
      remoteMessage: value?.remoteMessage,
      remoteStack: value?.remoteStack,
      errno: typeof value?.errno === "number" ? Math.abs(value.errno) : undefined,
      message: value?.message ?? String(error),
      syscall: value?.syscall,
      path: typeof value?.path === "string" ? value.path : undefined,
      dest: typeof value?.dest === "string" ? value.dest : undefined,
    },
  };
}

function statValue(value: fs.BigIntStats) {
  return {
    mode: value.mode,
    ino: value.ino,
    dev: value.dev,
    nlink: value.nlink,
    uid: value.uid,
    gid: value.gid,
    size: value.size,
    atime: Number(value.atimeNs) / 1e9,
    mtime: Number(value.mtimeNs) / 1e9,
    ctime: Number(value.ctimeNs) / 1e9,
    birthtime: Number(value.birthtimeNs) / 1e9,
    atimeNs: value.atimeNs,
    mtimeNs: value.mtimeNs,
    ctimeNs: value.ctimeNs,
    birthtimeNs: value.birthtimeNs,
    isFile: value.isFile(),
    isDirectory: value.isDirectory(),
    isSymbolicLink: value.isSymbolicLink(),
  };
}

export class NodeHostAdapter {
  private currentDirectory = process.cwd();
  private readonly environment: Record<string, string> = Object.create(null);
  private readonly multiprocessing: NodeMultiprocessingAdapter;
  private readonly classGroups = new NodeClassGroupBackend();

  constructor(mode: SageLanguageMode = "sage") {
    this.multiprocessing = new NodeMultiprocessingAdapter(mode);
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) this.environment[key] = value;
    }
  }

  private resolve(filename: unknown): string {
    const value = String(filename);
    return path.isAbsolute(value)
      ? path.normalize(value)
      : path.resolve(this.currentDirectory, value);
  }

  private environmentKey(name: unknown): string {
    const key = String(name);
    if (process.platform !== "win32") return key;
    const normalized = key.toUpperCase();
    return Object.keys(this.environment).find(
      (candidate) => candidate.toUpperCase() === normalized,
    ) ?? key;
  }

  call(method: string, args: unknown[] = []): HostResult {
    try {
      switch (method) {
        case "describe":
          return {
            ok: true,
            value: {
              name: process.platform === "win32" ? "nt" : "posix",
              sep: path.sep,
              altsep: process.platform === "win32" ? "/" : null,
              pathsep: path.delimiter,
              linesep: process.platform === "win32" ? "\r\n" : "\n",
              devnull: process.platform === "win32" ? "nul" : "/dev/null",
              curdir: ".",
              pardir: "..",
              tempdir: nodeOs.tmpdir(),
              executable: process.execPath,
            },
          };
        case "uname":
          return {
            ok: true,
            value: [
              nodeOs.type(),
              nodeOs.hostname(),
              nodeOs.release(),
              nodeOs.version(),
              nodeOs.machine(),
            ],
          };
        case "getcwd":
          return { ok: true, value: this.currentDirectory };
        case "chdir": {
          const destination = this.resolve(args[0]);
          const metadata = fs.statSync(destination);
          if (!metadata.isDirectory()) {
            const error = new Error(
              `not a directory, chdir '${destination}'`,
            ) as NodeJS.ErrnoException;
            error.code = "ENOTDIR";
            error.errno = -20;
            error.path = destination;
            error.syscall = "chdir";
            throw error;
          }
          this.currentDirectory = fs.realpathSync(destination);
          return { ok: true, value: null };
        }
        case "listdir":
          return {
            ok: true,
            value: fs.readdirSync(this.resolve(args[0] ?? ".")),
          };
        case "scandir":
          return {
            ok: true,
            value: fs.readdirSync(this.resolve(args[0] ?? "."), {
              withFileTypes: true,
            }).map((entry) => ({
              name: entry.name,
              isFile: entry.isFile(),
              isDirectory: entry.isDirectory(),
              isSymbolicLink: entry.isSymbolicLink(),
            })),
          };
        case "stat":
          return {
            ok: true,
            value: statValue(fs.statSync(this.resolve(args[0]), { bigint: true })),
          };
        case "lstat":
          return {
            ok: true,
            value: statValue(fs.lstatSync(this.resolve(args[0]), { bigint: true })),
          };
        case "mkdir":
          fs.mkdirSync(this.resolve(args[0]), {
            mode: args[1] === undefined ? 0o777 : Number(args[1]),
          });
          return { ok: true, value: null };
        case "makedirs": {
          const destination = this.resolve(args[0]);
          if (fs.existsSync(destination)) {
            const error = new Error(
              `file already exists, mkdir '${destination}'`,
            ) as NodeJS.ErrnoException;
            error.code = "EEXIST";
            error.errno = -17;
            error.path = destination;
            error.syscall = "mkdir";
            throw error;
          }
          fs.mkdirSync(destination, {
            mode: args[1] === undefined ? 0o777 : Number(args[1]),
            recursive: true,
          });
          return { ok: true, value: null };
        }
        case "unlink":
          fs.unlinkSync(this.resolve(args[0]));
          return { ok: true, value: null };
        case "rmdir":
          fs.rmdirSync(this.resolve(args[0]));
          return { ok: true, value: null };
        case "rename":
        case "replace":
          fs.renameSync(this.resolve(args[0]), this.resolve(args[1]));
          return { ok: true, value: null };
        case "readlink":
          return { ok: true, value: fs.readlinkSync(this.resolve(args[0])) };
        case "symlink":
          fs.symlinkSync(
            String(args[0]),
            this.resolve(args[1]),
            args[2] === undefined ? undefined : String(args[2]) as fs.symlink.Type,
          );
          return { ok: true, value: null };
        case "link":
          fs.linkSync(this.resolve(args[0]), this.resolve(args[1]));
          return { ok: true, value: null };
        case "chmod":
          fs.chmodSync(this.resolve(args[0]), Number(args[1]));
          return { ok: true, value: null };
        case "utime":
          fs.utimesSync(
            this.resolve(args[0]), Number(args[1]), Number(args[2]));
          return { ok: true, value: null };
        case "statfs": {
          const value = fs.statfsSync(this.resolve(args[0] ?? "."), {
            bigint: true,
          });
          return {
            ok: true,
            value: {
              blocks: value.blocks,
              bfree: value.bfree,
              bavail: value.bavail,
              bsize: value.bsize,
            },
          };
        }
        case "realpath":
          return { ok: true, value: fs.realpathSync(this.resolve(args[0])) };
        case "access":
          fs.accessSync(
            this.resolve(args[0]),
            Number(args[1] ?? fs.constants.F_OK),
          );
          return { ok: true, value: true };
        case "openFd":
          return {
            ok: true,
            value: fs.openSync(
              this.resolve(args[0]),
              String(args[1] ?? "r"),
              args[2] === undefined ? 0o666 : Number(args[2]),
            ),
          };
        case "closeFd":
          fs.closeSync(Number(args[0]));
          return { ok: true, value: null };
        case "writeFd": {
          const data = Buffer.from(args[1] as number[]);
          return {
            ok: true,
            value: fs.writeSync(Number(args[0]), data),
          };
        }
        case "fsyncFd":
          fs.fsyncSync(Number(args[0]));
          return { ok: true, value: null };
        case "readFile": {
          const filename = this.resolve(args[0]);
          if (Boolean(args[1])) {
            return {
              ok: true,
              value: fs.readFileSync(filename),
            };
          }
          return {
            ok: true,
            value: fs.readFileSync(filename, {
              encoding: String(args[2] ?? "utf8") as BufferEncoding,
            }),
          };
        }
        case "writeFile": {
          const filename = this.resolve(args[0]);
          const binary = Boolean(args[2]);
          const exclusive = Boolean(args[3]);
          const data = binary
            ? Buffer.from(args[1] as number[])
            : String(args[1]);
          fs.writeFileSync(filename, data, {
            encoding: String(args[4] ?? "utf8") as BufferEncoding,
            flag: exclusive ? "wx" : "w",
          });
          return { ok: true, value: null };
        }
        case "compressData": {
          const format = String(args[0]);
          const data = Buffer.from(args[1] as number[]);
          const level = Number(args[2] ?? -1);
          const options = level < 0 ? undefined : { level };
          let compressed: Buffer;
          if (format === "gzip") compressed = zlib.gzipSync(data, options);
          else if (format === "deflate") {
            compressed = zlib.deflateSync(data, options);
          } else if (format === "deflateRaw") {
            compressed = zlib.deflateRawSync(data, options);
          } else if (format === "brotli") {
            compressed = zlib.brotliCompressSync(data);
          } else {
            throw new Error(`unsupported compression format: ${format}`);
          }
          return { ok: true, value: Array.from(compressed) };
        }
        case "decompressData": {
          const format = String(args[0]);
          const data = Buffer.from(args[1] as number[]);
          let decompressed: Buffer;
          if (format === "gzip") decompressed = zlib.gunzipSync(data);
          else if (format === "deflate") {
            decompressed = zlib.inflateSync(data);
          } else if (format === "deflateRaw") {
            decompressed = zlib.inflateRawSync(data);
          } else if (format === "brotli") {
            decompressed = zlib.brotliDecompressSync(data);
          } else {
            throw new Error(`unsupported compression format: ${format}`);
          }
          return { ok: true, value: Array.from(decompressed) };
        }
        case "hashData": {
          const requested = String(args[0]).replaceAll("_", "-");
          const algorithm = requested === "blake2b"
            ? "blake2b512"
            : requested === "blake2s"
              ? "blake2s256"
              : requested;
          const data = Buffer.from(args[1] as number[]);
          const length = args[2] === undefined ? undefined : Number(args[2]);
          const hash = length === undefined
            ? crypto.createHash(algorithm)
            : crypto.createHash(algorithm, { outputLength: length });
          hash.update(data);
          const digest = hash.digest();
          return { ok: true, value: Array.from(digest) };
        }
        case "subprocessRun": {
          const command = (args[0] as unknown[]).map(String);
          if (command.length === 0) {
            throw new TypeError("subprocess command must not be empty");
          }
          const cwd = args[1] == null ? this.currentDirectory : this.resolve(args[1]);
          const environment = args[2] == null
            ? { ...this.environment }
            : Object.fromEntries(args[2] as [string, string][]);
          const input = args[3] == null
            ? undefined
            : Buffer.from(args[3] as number[]);
          const timeout = args[4] == null ? undefined : Number(args[4]);
          const shell = Boolean(args[5]);
          const executable = args[6] == null ? undefined : String(args[6]);
          const maxBuffer = args[7] == null ? 64 * 1024 * 1024 : Number(args[7]);
          const result = spawnSync(executable ?? command[0], command.slice(1), {
            cwd,
            env: environment,
            input,
            timeout,
            shell,
            encoding: null,
            maxBuffer,
            windowsHide: true,
          });
          return {
            ok: true,
            value: {
              pid: result.pid,
              status: result.status,
              signal: result.signal,
              errorCode: (result.error as NodeJS.ErrnoException | undefined)?.code,
              errorMessage: result.error?.message,
              stdout: Array.from(
                Buffer.isBuffer(result.stdout)
                  ? result.stdout
                  : Buffer.from(result.stdout ?? ""),
              ),
              stderr: Array.from(
                Buffer.isBuffer(result.stderr)
                  ? result.stderr
                  : Buffer.from(result.stderr ?? ""),
              ),
            },
          };
        }
        case "httpRequest": {
          const timeout = Number(args[4] ?? 30_000);
          return {
            ok: true,
            value: synchronousWorkerRequest(
              httpWorkerSource,
              {
                method: String(args[0] ?? "GET"),
                url: String(args[1]),
                headers: args[2] ?? [],
                body: args[3] ?? null,
                timeout,
              },
              timeout + 1_000,
            ),
          };
        }
        case "dnsLookup": {
          return {
            ok: true,
            value: synchronousWorkerRequest(
              dnsWorkerSource,
              { hostname: String(args[0]), family: Number(args[1] ?? 0) },
            ),
          };
        }
        case "tcpExchange": {
          const timeout = Number(args[4] ?? 30_000);
          return {
            ok: true,
            value: synchronousWorkerRequest(
              tcpWorkerSource,
              {
                host: String(args[0]),
                port: Number(args[1]),
                payload: args[2] ?? [],
                maximum: Number(args[3] ?? 65_536),
                timeout,
              },
              timeout + 1_000,
            ),
          };
        }
        case "webgpuTwistCapabilities":
          return {
            ok: true,
            value: synchronousWorkerRequest(
              webGpuTwistWorkerSource,
              { mode: "capabilities", shader: webGpuTwistShader },
              Number(args[0] ?? 30_000),
            ),
          };
        case "webgpuTwistDotProducts": {
          return {
            ok: true,
            value: synchronousWorkerRequest(
              webGpuTwistWorkerSource,
              {
                mode: "dot-products",
                rows: Number(args[0]),
                orders: Number(args[1]),
                terms: Number(args[2]),
                coefficients: args[3],
                characters: args[4],
                weights: args[5],
                shader: webGpuTwistShader,
              },
              Number(args[6] ?? 120_000),
            ),
          };
        }
        case "environmentEntries":
          return { ok: true, value: Object.entries(this.environment) };
        case "setEnv": {
          const key = this.environmentKey(args[0]);
          this.environment[key] = String(args[1]);
          return { ok: true, value: null };
        }
        case "deleteEnv": {
          const key = this.environmentKey(args[0]);
          delete this.environment[key];
          return { ok: true, value: null };
        }
        case "getpid":
          return { ok: true, value: process.pid };
        case "cpuCount":
          return { ok: true, value: nodeOs.availableParallelism() };
        case "urandom":
          return { ok: true, value: Array.from(crypto.randomBytes(Number(args[0]))) };
        case "serializationDumps": {
          const serializer = require("./serialization") as typeof import("./serialization");
          return { ok: true, value: serializer.dumps(args[0]) };
        }
        case "serializationLoads": {
          const serializer = require("./serialization") as typeof import("./serialization");
          return { ok: true, value: serializer.loads(String(args[0])) };
        }
        case "serializationLoadsIntegerTupleTable": {
          const serializer = require("./serialization") as typeof import("./serialization");
          return {
            ok: true,
            value: serializer.loadsIntegerTupleTable(String(args[0])),
          };
        }
        case "serializationLoadIntegerTupleTable": {
          const serializer = require("./serialization") as typeof import("./serialization");
          return {
            ok: true,
            value: serializer.loadsIntegerTupleTable(
              fs.readFileSync(this.resolve(args[0]), "utf8"),
            ),
          };
        }
        case "serializationIntegerTupleTableView": {
          const serializer = require("./serialization") as typeof import("./serialization");
          return {
            ok: true,
            value: serializer.integerTupleTableView(
              args[0],
              String(args[1]) as "keys" | "values" | "items",
            ),
          };
        }
        case "serializationPack": {
          const serializer = require("./serialization") as typeof import("./serialization");
          return { ok: true, value: serializer.packPython(args[0]) };
        }
        case "serializationUnpack": {
          const serializer = require("./serialization") as typeof import("./serialization");
          const source = args[0] === null || args[0] === undefined
            ? args[0]
            : Reflect.get(Object(args[0]), "_values") ?? args[0];
          return { ok: true, value: serializer.unpack(source as number[]) };
        }
        case "classGroup":
          return {
            ok: true,
            value: this.classGroups.call(
              String(args[0]),
              args[1] as Record<string, unknown>,
            ),
          };
        case "multiprocessingCreatePool":
          return {
            ok: true,
            value: this.multiprocessing.createPool(
              Number(args[0]),
              args[1],
              (args[2] as unknown[] | undefined) ?? [],
            ),
          };
        case "multiprocessingCreatePrecompiledPool":
          return {
            ok: true,
            value: this.multiprocessing.createPool(
              Number(args[0]), undefined, [], true, true,
            ),
          };
        case "multiprocessingWorkerModuleAvailable":
          return {
            ok: true,
            value:
              typeof args[0] === "string" &&
              hasPrecompiledTaskModule(args[0]),
          };
        case "multiprocessingMemoryBudgetBytes": {
          const availableMemory = typeof process.availableMemory === "function"
            ? process.availableMemory()
            : nodeOs.freemem();
          const constrainedMemory = typeof process.constrainedMemory === "function"
            ? process.constrainedMemory()
            : 0;
          const candidates = [
            availableMemory,
            constrainedMemory,
            nodeOs.totalmem(),
          ].filter((value) => Number.isFinite(value) && value > 0);
          if (candidates.length === 0) return { ok: true, value: null };
          // Keep 25% of currently available or constrained memory outside the
          // worker budget for the parent, native libraries, and concurrent
          // activity.  IEEE-safe integer clamping keeps the Python wire exact.
          const available = Math.min(...candidates);
          return {
            ok: true,
            value: Math.min(
              Number.MAX_SAFE_INTEGER,
              Math.floor(available * 0.75),
            ),
          };
        }
        case "multiprocessingMap":
          return {
            ok: true,
            value: this.multiprocessing.map(
              Number(args[0]),
              args[1],
              args[2] as unknown[],
              Boolean(args[3]),
            ),
          };
        case "multiprocessingClosePool":
          this.multiprocessing.closePool(Number(args[0]));
          return { ok: true, value: null };
        case "multiprocessingJoinPool":
          this.multiprocessing.joinPool(Number(args[0]));
          return { ok: true, value: null };
        case "multiprocessingSubmitMap":
          return {
            ok: true,
            value: this.multiprocessing.submitMap(
              Number(args[0]),
              args[1],
              args[2] as unknown[],
              Boolean(args[3]),
            ),
          };
        case "multiprocessingSubmitModuleCall":
          return {
            ok: true,
            value: this.multiprocessing.submitModuleCall(
              Number(args[0]),
              String(args[1]),
              String(args[2]),
              args[3] as unknown[],
            ),
          };
        case "multiprocessingJobResult":
          return {
            ok: true,
            value: this.multiprocessing.jobResult(
              Number(args[0]),
              Number(args[1]),
              args[2] === null || args[2] === undefined
                ? undefined
                : Number(args[2]),
            ),
          };
        case "multiprocessingAttestedJobResult":
          return {
            ok: true,
            value: this.multiprocessing.attestedJobResult(
              Number(args[0]),
              Number(args[1]),
              String(args[2]),
              String(args[3]),
              args[4] === null || args[4] === undefined
                ? undefined
                : Number(args[4]),
            ),
          };
        case "multiprocessingForgetJob":
          this.multiprocessing.forgetJob(
            Number(args[0]), Number(args[1]),
          );
          return { ok: true, value: null };
        case "multiprocessingTerminatePool":
          this.multiprocessing.terminatePool(Number(args[0]));
          return { ok: true, value: null };
        case "multiprocessingCloseAllPools":
          this.multiprocessing.close();
          return { ok: true, value: null };
        case "classGroupCloseHost":
          this.classGroups.close();
          return { ok: true, value: null };
        default:
          return {
            ok: false,
            error: {
              code: "ENOSYS",
              errno: 38,
              message: `unknown Sage.js host operation: ${method}`,
            },
          };
      }
    } catch (error) {
      return failure(error);
    }
  }
}

export function installNodeHost(
  target: object = globalThis,
  mode: SageLanguageMode = "sage",
): () => void {
  const property = "__sagejs_host__";
  const hadPrevious = Reflect.has(target, property);
  const previous = Reflect.get(target, property);
  const adapter = new NodeHostAdapter(mode);
  Reflect.set(target, property, adapter);
  return () => {
    adapter.call("multiprocessingCloseAllPools");
    adapter.call("classGroupCloseHost");
    if (hadPrevious) Reflect.set(target, property, previous);
    else Reflect.deleteProperty(target, property);
  };
}
