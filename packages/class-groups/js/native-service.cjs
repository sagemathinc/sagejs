"use strict";

const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const { lstatSync, readFileSync, realpathSync } = require("node:fs");
const { dirname, isAbsolute, join, relative, resolve, sep } = require("node:path");

const ARTIFACT_SCHEMA = "sagejs.class-groups/native-artifact-v1";
const REQUEST_SCHEMA = "sagejs.class-groups/service-request-v1";
const RESPONSE_SCHEMA = "sagejs.class-groups/service-response-v1";
const SERVICE_ABI = 1;
const MAXIMUM_LINE_BYTES = 16 * 1024 * 1024;

const PLATFORM_PACKAGES = Object.freeze({
  "linux-x64": "@sagemath/sagejs-linux-x64",
  "linux-arm64": "@sagemath/sagejs-linux-arm64",
  "darwin-arm64": "@sagemath/sagejs-darwin-arm64",
});

class NativeClassGroupUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.name = "NativeClassGroupUnavailableError";
  }
}

class NativeClassGroupInterruptedError extends Error {
  constructor(message = "native class-group service was interrupted") {
    super(message);
    this.name = "NativeClassGroupInterruptedError";
  }
}

class NativeClassGroupClosedError extends Error {
  constructor(message = "native class-group service is closed") {
    super(message);
    this.name = "NativeClassGroupClosedError";
  }
}

function targetName(platform = process.platform, arch = process.arch) {
  return `${platform}-${arch}`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalDigest(value, label) {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new NativeClassGroupUnavailableError(`${label} is not a canonical SHA-256 digest`);
  }
  return value;
}

function inside(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function resolvePackageRoot(packageName, resolver = require.resolve) {
  return realpathSync(dirname(resolver(`${packageName}/package.json`)));
}

function authenticateArtifact(packageRoot, expectedTarget) {
  const root = realpathSync(packageRoot);
  const manifestPath = join(root, "native", "class-group-service.json");
  let manifest;
  try {
    if (!lstatSync(manifestPath).isFile()) throw new Error("not a regular file");
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    throw new NativeClassGroupUnavailableError(
      `native class-group manifest is unavailable: ${error.message}`,
    );
  }
  const keys = Object.keys(manifest).sort();
  const expectedKeys = ["abi", "bytes", "executable", "schema", "sha256", "target"];
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
    throw new NativeClassGroupUnavailableError("native class-group manifest has unknown fields");
  }
  if (
    manifest.schema !== ARTIFACT_SCHEMA ||
    manifest.abi !== SERVICE_ABI ||
    manifest.target !== expectedTarget ||
    !Number.isSafeInteger(manifest.bytes) ||
    manifest.bytes <= 0 ||
    typeof manifest.executable !== "string" ||
    isAbsolute(manifest.executable)
  ) {
    throw new NativeClassGroupUnavailableError("native class-group manifest is incompatible");
  }
  canonicalDigest(manifest.sha256, "native class-group artifact digest");
  let executable;
  let contents;
  try {
    const unresolvedExecutable = join(root, manifest.executable);
    if (!lstatSync(unresolvedExecutable).isFile()) {
      throw new Error("artifact is not a regular file");
    }
    executable = realpathSync(unresolvedExecutable);
    if (!inside(root, executable)) {
      throw new Error("artifact escapes its package or is not a regular file");
    }
    contents = readFileSync(executable);
  } catch (error) {
    throw new NativeClassGroupUnavailableError(
      `native class-group artifact is unavailable: ${error.message}`,
    );
  }
  if (contents.byteLength !== manifest.bytes || sha256(contents) !== manifest.sha256) {
    throw new NativeClassGroupUnavailableError("native class-group artifact failed authentication");
  }
  return Object.freeze({ executable, manifest: Object.freeze({ ...manifest }), packageRoot: root });
}

function nativeClassGroupCapability(options = {}) {
  const target = options.target || targetName(options.platform, options.arch);
  const packageName = PLATFORM_PACKAGES[target];
  if (!packageName) {
    return Object.freeze({ available: false, reason: `no native class-group artifact for ${target}` });
  }
  try {
    const packageRoot = options.packageRoot || resolvePackageRoot(packageName, options.resolve);
    return Object.freeze({ available: true, target, ...authenticateArtifact(packageRoot, target) });
  } catch (error) {
    return Object.freeze({
      available: false,
      reason: error instanceof Error ? error.message : String(error),
      target,
    });
  }
}

function abortError() {
  const error = new Error("native class-group computation was aborted");
  error.name = "AbortError";
  return error;
}

class NativeClassGroupService {
  constructor(capability, options = {}) {
    this.artifactCapability = capability;
    this.spawnProcess = options.spawn || spawn;
    this.maximumLineBytes = options.maximumLineBytes || MAXIMUM_LINE_BYTES;
    this.generation = 0;
    this.nextId = 0;
    this.closed = false;
    this.child = undefined;
    this.buffer = Buffer.alloc(0);
    this.pending = undefined;
    this.queue = Promise.resolve();
  }

  start() {
    if (this.closed) throw new NativeClassGroupClosedError();
    if (this.child !== undefined) return;
    const generation = ++this.generation;
    const child = this.spawnProcess(this.artifactCapability.executable, [], {
      stdio: ["pipe", "pipe", "inherit"],
      windowsHide: true,
    });
    this.child = child;
    this.buffer = Buffer.alloc(0);
    child.stdout.on("data", (chunk) => this.receive(child, generation, chunk));
    child.on("error", (error) => this.fail(child, generation, error));
    child.on("exit", (code, signal) => {
      const detail = signal ? `signal ${signal}` : `exit ${code}`;
      this.fail(child, generation, new NativeClassGroupInterruptedError(
        `native class-group service stopped with ${detail}`,
      ));
    });
  }

  fail(child, generation, error) {
    if (child !== this.child || generation !== this.generation) return;
    this.child = undefined;
    this.buffer = Buffer.alloc(0);
    if (this.pending !== undefined) {
      const pending = this.pending;
      this.pending = undefined;
      pending.signal?.removeEventListener("abort", pending.onAbort);
      pending.reject(error);
    }
  }

  receive(child, generation, chunk) {
    if (child !== this.child || generation !== this.generation) return;
    this.buffer = Buffer.concat([this.buffer, chunk]);
    if (this.buffer.byteLength > this.maximumLineBytes) {
      this.retire(new Error("native class-group response exceeded its byte limit"));
      return;
    }
    const newline = this.buffer.indexOf(10);
    if (newline < 0) return;
    const line = this.buffer.subarray(0, newline);
    this.buffer = this.buffer.subarray(newline + 1);
    if (this.buffer.byteLength !== 0 || this.pending === undefined) {
      this.retire(new Error("native class-group service violated one-response framing"));
      return;
    }
    const pending = this.pending;
    this.pending = undefined;
    pending.signal?.removeEventListener("abort", pending.onAbort);
    let response;
    try {
      response = JSON.parse(line.toString("utf8"));
      if (
        response?.schema !== RESPONSE_SCHEMA ||
        response?.abi !== SERVICE_ABI ||
        response?.id !== pending.id ||
        typeof response?.ok !== "boolean" ||
        (response.ok && !("result" in response)) ||
        (!response.ok && !("error" in response))
      ) {
        throw new Error("native class-group service returned an incompatible response");
      }
    } catch (error) {
      pending.reject(error);
      this.retire(error);
      return;
    }
    if (!response.ok) {
      const error = new Error(String(response.error?.message ?? response.error ?? "request rejected"));
      error.name = String(response.error?.name ?? "NativeClassGroupRequestError");
      pending.reject(error);
    } else {
      pending.resolve(response.result);
    }
  }

  retire(error = new NativeClassGroupInterruptedError()) {
    const child = this.child;
    if (child === undefined) return;
    this.fail(child, this.generation, error);
    child.kill();
  }

  transact(request, { signal } = {}) {
    if (this.closed) return Promise.reject(new NativeClassGroupClosedError());
    if (signal?.aborted) return Promise.reject(abortError());
    this.start();
    return new Promise((resolvePromise, reject) => {
      const onAbort = () => {
        const error = abortError();
        this.retire(error);
      };
      const id = String(++this.nextId);
      this.pending = { id, resolve: resolvePromise, reject, signal, onAbort };
      signal?.addEventListener("abort", onAbort, { once: true });
      const line = Buffer.from(`${JSON.stringify({ ...request, id })}\n`);
      if (line.byteLength > this.maximumLineBytes) {
        this.pending = undefined;
        signal?.removeEventListener("abort", onAbort);
        reject(new RangeError("native class-group request exceeded its byte limit"));
        return;
      }
      this.child.stdin.write(line, (error) => {
        if (error && this.pending !== undefined) this.retire(error);
      });
    });
  }

  invoke(operation, fields = {}, options = {}) {
    if (typeof operation !== "string" || operation === "") {
      return Promise.reject(new TypeError("native class-group operation must be nonempty"));
    }
    const run = async () => {
      if (this.closed) throw new NativeClassGroupClosedError();
      const generationBeforeStart = this.generation;
      this.start();
      if (this.generation !== generationBeforeStart && operation !== "capability") {
        const capability = await this.transact({
          schema: REQUEST_SCHEMA,
          abi: SERVICE_ABI,
          operation: "capability",
        }, options);
        if (capability?.abi !== SERVICE_ABI) {
          this.retire(new NativeClassGroupUnavailableError("service capability ABI mismatch"));
          throw new NativeClassGroupUnavailableError("service capability ABI mismatch");
        }
      }
      return this.transact({ schema: REQUEST_SCHEMA, abi: SERVICE_ABI, operation, ...fields }, options);
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => {});
    return result;
  }

  async capability(options) {
    const result = await this.invoke("capability", {}, options);
    return Object.freeze({
      ...result,
      artifactSha256: this.artifactCapability.manifest.sha256,
      artifactTarget: this.artifactCapability.manifest.target,
    });
  }

  async open(request, options) {
    const receipt = await this.invoke("open", { request }, options);
    if (typeof receipt?.handle !== "string" || typeof receipt?.generation !== "string") {
      return receipt;
    }
    return new NativeClassGroupSession(this, receipt, this.generation);
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    const child = this.child;
    this.child = undefined;
    if (this.pending !== undefined) {
      const pending = this.pending;
      this.pending = undefined;
      pending.reject(new NativeClassGroupClosedError());
    }
    if (child !== undefined) {
      child.stdin.end();
      child.kill();
    }
  }
}

class NativeClassGroupSession {
  constructor(service, openReceipt, generation) {
    this.service = service;
    this.openReceipt = openReceipt;
    this.handle = openReceipt.handle;
    this.serviceGeneration = openReceipt.generation;
    this.generation = generation;
    this.closed = false;
  }

  ensureLive() {
    if (this.closed) throw new NativeClassGroupClosedError("native class-group session is closed");
    if (this.service.closed) throw new NativeClassGroupClosedError();
    if (this.generation !== this.service.generation) {
      throw new NativeClassGroupInterruptedError("native class-group session belongs to a retired process");
    }
  }

  query(idealIntegralBasisRows, resources, options) {
    this.ensureLive();
    return this.service.invoke("query", {
      generation: this.serviceGeneration,
      handle: this.handle,
      idealIntegralBasisRows,
      resources,
    }, options);
  }

  publication(options) {
    this.ensureLive();
    return this.service.invoke("publication", {
      generation: this.serviceGeneration,
      handle: this.handle,
    }, options);
  }

  async close(options) {
    if (this.closed) return;
    this.ensureLive();
    this.closed = true;
    await this.service.invoke("close", {
      generation: this.serviceGeneration,
      handle: this.handle,
    }, options);
  }
}

async function createNativeClassGroupService(options = {}) {
  const capability = options.capability || nativeClassGroupCapability(options);
  if (!capability.available) {
    if (options.required) throw new NativeClassGroupUnavailableError(capability.reason);
    return undefined;
  }
  const service = new NativeClassGroupService(capability, options);
  try {
    const capabilityReceipt = await service.capability({ signal: options.signal });
    if (capabilityReceipt?.abi !== SERVICE_ABI) {
      throw new NativeClassGroupUnavailableError("service capability ABI mismatch");
    }
    service.authenticatedCapabilities = capabilityReceipt;
    service.artifactSha256 = capability.manifest.sha256;
    return service;
  } catch (error) {
    await service.close();
    if (options.required) throw error;
    return undefined;
  }
}

async function createNativeClassGroupBackend(options = {}) {
  const service = await createNativeClassGroupService(options);
  if (service === undefined) return undefined;
  return Object.freeze({
    artifactSha256: service.artifactSha256,
    capabilities: service.authenticatedCapabilities,
    call(operation, fields, callOptions) {
      return service.invoke(operation, fields, callOptions);
    },
    close() {
      return service.close();
    },
  });
}

module.exports = {
  ARTIFACT_SCHEMA,
  MAXIMUM_LINE_BYTES,
  NativeClassGroupClosedError,
  NativeClassGroupInterruptedError,
  NativeClassGroupService,
  NativeClassGroupSession,
  NativeClassGroupUnavailableError,
  PLATFORM_PACKAGES,
  REQUEST_SCHEMA,
  RESPONSE_SCHEMA,
  SERVICE_ABI,
  authenticateArtifact,
  createNativeClassGroupBackend,
  createNativeClassGroupService,
  nativeClassGroupCapability,
  targetName,
};
