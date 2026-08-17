/*
 * Runtime resources that are files in a source checkout and SEA assets in a
 * single-executable build.
 */

import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { createRequire } from "module";
import { basename, dirname, join, normalize } from "path";
import { getAsset, getAssetKeys, isSea } from "node:sea";
import { runInThisContext } from "node:vm";

import { measureInitialization } from "./timing";

const VIRTUAL_ROOT = normalize("/__sagejs_sea__");
const COMPILER_ASSET = "compiler/compiler.js";
const COMPILER_CACHE_ASSET = "runtime-cache/compiler.bin";
const BASELIB_ASSET = "compiler/baselib-plain-pretty.js";
const RUNTIME_BOOTSTRAP_PREFIX = "runtime-cache/runtime-bootstrap-";
const TASK_RUNTIME_ASSET = "compiler/task-runtime.js";
const TASK_RUNTIME_MODULE_MANIFEST = "task-runtime-modules.json";
const TASK_RUNTIME_MODULE_SCHEMA = "sagejs.task-runtime-modules/v1";
const PRECOMPILED_MODULE_FILENAME =
  "__sagejs_precompiled_module_filename__";
const FLINT_ASSET = "native/sagejs_flint.node";
const FLINT_FFI_ASSET = "native/sagejs_flint_ffi.node";
const FLINT_FFI_MANIFEST_ASSET = "native/sagejs_flint_ffi_manifest.json";
const GRAPH_ASSET = "native/sagejs_graph.node";
const GRAPH_FFI_ASSET = "native/sagejs_igraph_ffi.node";
const GRAPH_FFI_MANIFEST_ASSET = "native/sagejs_igraph_ffi_manifest.json";
const FFLAS_FFI_ASSET = "native/sagejs_fflas_ffi.node";
const FFLAS_FFI_MANIFEST_ASSET = "native/sagejs_fflas_ffi_manifest.json";
const ZEROMQ_ASSET = "native/zeromq.node";
const PLOTLY_ASSET = "vendor/plotly.min.js";
const KERNEL_WORKER_ASSET = "worker/kernel-worker.cjs";
const MULTIPROCESSING_WORKER_ASSET = "worker/multiprocessing-worker.cjs";
const VENDOR_ASSET_PREFIX = "vendor/";
const NATIVE_KERNEL_ASSET_PREFIX = "native-kernels/";
const NATIVE_RUNTIME_MODULES = new Set([
  "@sagemath/sagejs-flint",
  "@sagemath/sagejs-fflas",
  "@sagemath/sagejs-graph",
  "@sagemath/sagejs-m4ri",
  "zeromq",
]);

let flintModule: unknown;
let graphModule: unknown;
let fflasModule: unknown;
let zeroMQModule: unknown;
const runtimeModuleCache = new Map<string, unknown>();
let nativeTemporaryDirectory: string | undefined;
let kernelWorkerFilename: string | undefined;
let multiprocessingWorkerFilename: string | undefined;
const nativeKernelModules = new Map<string, unknown>();
let seaAssetKeys: Set<string> | undefined;

function hasAsset(key: string): boolean {
  if (!isSea()) return false;
  seaAssetKeys ??= new Set(getAssetKeys());
  return seaAssetKeys.has(key);
}

function assetText(key: string): string {
  return Buffer.from(getAsset(key)).toString("utf8");
}

function assetBytes(key: string): Uint8Array {
  return new Uint8Array(getAsset(key));
}

function attachEmbeddedFfiManifest(
  binding: Record<PropertyKey, unknown>,
  asset: string,
  library: string,
): void {
  if (!hasAsset(asset)) {
    throw new Error(
      `This Sage.js executable is missing its generated ${library} FFI manifest`,
    );
  }
  const manifest = JSON.parse(assetText(asset));
  if (
    manifest === null ||
    typeof manifest !== "object" ||
    typeof manifest.library !== "string"
  ) {
    throw new Error(`The embedded ${library} FFI manifest is invalid`);
  }
  Object.defineProperty(binding, "__sagejs_ffi_manifest__", {
    value: Object.freeze(manifest),
    enumerable: false,
  });
}

function assetKeyForVirtualPath(filename: string): string | undefined {
  const normalized = normalize(filename);
  const prefix = `${VIRTUAL_ROOT}/`;
  const platformPrefix = normalize(prefix);
  if (!normalized.startsWith(platformPrefix)) return;
  return normalized.slice(platformPrefix.length).replaceAll("\\", "/");
}

export function isSingleExecutable(): boolean {
  return isSea();
}

export function virtualRoot(): string {
  return VIRTUAL_ROOT;
}

export function compilerDirectory(fallback: string): string {
  return isSea() ? join(VIRTUAL_ROOT, "compiler") : fallback;
}

export function standardLibraryDirectory(fallback: string): string {
  return isSea() ? join(VIRTUAL_ROOT, "lib") : fallback;
}

export function standardLibraryCacheDirectory(fallback: string): string {
  return isSea() ? join(VIRTUAL_ROOT, "module-cache") : fallback;
}

export function precompiledLazyModuleCacheDirectory(
  fallback: string,
): string {
  return isSea() ? join(VIRTUAL_ROOT, "lazy-module-cache") : fallback;
}

export function precompiledDynamicCacheDirectory(fallback: string): string {
  return isSea() ? join(VIRTUAL_ROOT, "dynamic-cache") : fallback;
}

export function precompiledNativeKernelCacheDirectory(
  fallback: string,
): string {
  return isSea() ? join(VIRTUAL_ROOT, "native-kernels") : fallback;
}

/** Load a published native-kernel wrapper from disk or an embedded SEA asset. */
export function loadPrecompiledNativeKernel(
  moduleFilename: string,
  sourceLabel = basename(dirname(moduleFilename)),
): unknown {
  if (!isSea()) {
    const resolved = require.resolve(moduleFilename);
    if (require.cache[resolved]) return require(resolved);
    return measureInitialization(
      "native-kernel",
      sourceLabel,
      () => require(resolved),
    );
  }
  const key = assetKeyForVirtualPath(moduleFilename);
  if (
    key === undefined ||
    !key.startsWith(NATIVE_KERNEL_ASSET_PREFIX) ||
    !key.endsWith("/index.cjs") ||
    !hasAsset(key)
  ) {
    throw new Error(`native kernel module is not embedded: ${moduleFilename}`);
  }
  const cached = nativeKernelModules.get(key);
  if (cached !== undefined) return cached;
  return measureInitialization("native-kernel", sourceLabel, () => {
    const relativeModule = key.slice(NATIVE_KERNEL_ASSET_PREFIX.length);
    const cacheKey = relativeModule.slice(0, -"/index.cjs".length);
    if (!/^[a-f0-9]{64}$/.test(cacheKey)) {
      throw new Error(`invalid embedded native kernel key ${cacheKey}`);
    }
    const addonKey =
      `${NATIVE_KERNEL_ASSET_PREFIX}${cacheKey}/build/Release/` +
      "sagejs_native_kernel.node";
    if (!hasAsset(addonKey)) {
      throw new Error(`native kernel addon is not embedded: ${addonKey}`);
    }
    if (!nativeTemporaryDirectory) {
      nativeTemporaryDirectory = mkdtempSync(join(tmpdir(), "sagejs-sea-"));
    }
    const outputDirectory = join(
      nativeTemporaryDirectory,
      "native-kernels",
      cacheKey,
    );
    const outputModule = join(outputDirectory, "index.cjs");
    const outputAddon = join(
      outputDirectory,
      "build",
      "Release",
      "sagejs_native_kernel.node",
    );
    mkdirSync(dirname(outputAddon), { recursive: true });
    writeFileSync(outputModule, Buffer.from(getAsset(key)), { mode: 0o700 });
    writeFileSync(outputAddon, Buffer.from(getAsset(addonKey)), { mode: 0o700 });
    const loaded = createRequire(outputModule)(outputModule);
    nativeKernelModules.set(key, loaded);
    return loaded;
  });
}

export function readResourceText(filename: string): string {
  if (isSea()) {
    const key = assetKeyForVirtualPath(filename);
    if (key && hasAsset(key)) return assetText(key);
  }
  return readFileSync(filename, "utf8");
}

export function readResourceBytes(filename: string): Uint8Array {
  if (isSea()) {
    const key = assetKeyForVirtualPath(filename);
    if (key && getAssetKeys().includes(key)) return assetBytes(key);
  }
  return readFileSync(filename);
}

export function vendorResourcePath(filename: string): string {
  return isSea()
    ? join(VIRTUAL_ROOT, VENDOR_ASSET_PREFIX, filename)
    : join(__dirname, "..", "vendor", filename);
}

export function readCompilerSource(fallbackFilename: string): string {
  return isSea() ? assetText(COMPILER_ASSET) : readResourceText(fallbackFilename);
}

export function readCompilerCachedData(
  fallbackFilename: string,
): Uint8Array | undefined {
  if (isSea()) {
    return hasAsset(COMPILER_CACHE_ASSET)
      ? assetBytes(COMPILER_CACHE_ASSET)
      : undefined;
  }
  return existsSync(fallbackFilename)
    ? new Uint8Array(readFileSync(fallbackFilename))
    : undefined;
}

export function readBaselibSource(fallbackFilename: string): string {
  return isSea() ? assetText(BASELIB_ASSET) : readResourceText(fallbackFilename);
}

export function readRuntimeBootstrapSource(
  mode: "sage" | "python",
  fallbackFilename: string,
): string | undefined {
  const key = `${RUNTIME_BOOTSTRAP_PREFIX}${mode}.js`;
  if (isSea()) return hasAsset(key) ? assetText(key) : undefined;
  return existsSync(fallbackFilename)
    ? readFileSync(fallbackFilename, "utf8")
    : undefined;
}

export function readRuntimeBootstrapCachedData(
  mode: "sage" | "python",
  fallbackFilename: string,
): Uint8Array | undefined {
  const key = `${RUNTIME_BOOTSTRAP_PREFIX}${mode}.bin`;
  if (isSea()) return hasAsset(key) ? assetBytes(key) : undefined;
  return existsSync(fallbackFilename)
    ? new Uint8Array(readFileSync(fallbackFilename))
    : undefined;
}

export function readTaskRuntimeSource(fallbackFilename: string): string {
  return isSea()
    ? assetText(TASK_RUNTIME_ASSET)
    : readResourceText(fallbackFilename);
}

interface TaskRuntimeModuleRecord {
  resource: string;
  version: string;
  signature: string;
  mode: "python";
  filename: string;
}

interface TaskRuntimeModuleManifest {
  schema: string;
  roots: string[];
  modules: Record<string, TaskRuntimeModuleRecord>;
}

interface PrecompiledTaskModule {
  version: string;
  signature: string;
  mode: "python";
  module: string;
  javascriptTemplate: string;
}

const pythonModuleNamePattern =
  /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;

function own(object: unknown, name: PropertyKey): boolean {
  return (
    object !== null &&
    (typeof object === "object" || typeof object === "function") &&
    Object.prototype.hasOwnProperty.call(object, name)
  );
}

function taskRuntimeModuleCacheDirectory(fallbackDirectory?: string): string {
  return process.env.SAGEJS_PRECOMPILED_MODULE_CACHE_DIR ??
    precompiledLazyModuleCacheDirectory(
      fallbackDirectory ?? join(__dirname, "..", "lazy-module-cache"),
    );
}

function validTaskModuleRecord(
  name: string,
  record: unknown,
): record is TaskRuntimeModuleRecord {
  const expectedResource = `${name.replaceAll(".", "-")}.json`;
  return (
    pythonModuleNamePattern.test(name) &&
    record !== null &&
    typeof record === "object" &&
    Reflect.get(record, "resource") === expectedResource &&
    typeof Reflect.get(record, "version") === "string" &&
    typeof Reflect.get(record, "signature") === "string" &&
    Reflect.get(record, "mode") === "python" &&
    typeof Reflect.get(record, "filename") === "string" &&
    Reflect.get(record, "filename").startsWith(
      "/__sagejs_task_modules__/",
    )
  );
}

function validatedTaskModuleResource(
  cacheDirectory: string,
  name: string,
  record: TaskRuntimeModuleRecord,
): PrecompiledTaskModule {
  const cached = JSON.parse(readResourceText(
    join(cacheDirectory, record.resource),
  )) as PrecompiledTaskModule;
  if (
    cached?.version !== record.version ||
    cached.signature !== record.signature ||
    cached.mode !== record.mode ||
    cached.module !== name ||
    typeof cached.javascriptTemplate !== "string" ||
    !cached.javascriptTemplate.includes(
      JSON.stringify(PRECOMPILED_MODULE_FILENAME),
    )
  ) {
    throw new Error(
      `invalid precompiled multiprocessing module resource ${name}`,
    );
  }
  return cached;
}

/** Return whether an exact module has a validated worker-runtime resource. */
export function hasPrecompiledTaskModule(
  name: string,
  fallbackDirectory?: string,
): boolean {
  if (!pythonModuleNamePattern.test(name)) return false;
  try {
    const cacheDirectory = taskRuntimeModuleCacheDirectory(fallbackDirectory);
    const manifest = JSON.parse(readResourceText(
      join(cacheDirectory, TASK_RUNTIME_MODULE_MANIFEST),
    )) as TaskRuntimeModuleManifest;
    if (
      manifest?.schema !== TASK_RUNTIME_MODULE_SCHEMA ||
      manifest.modules === null ||
      typeof manifest.modules !== "object" ||
      Array.isArray(manifest.modules) ||
      !Object.hasOwn(manifest.modules, name)
    ) return false;
    const record = manifest.modules[name];
    if (!validTaskModuleRecord(name, record)) return false;
    validatedTaskModuleResource(cacheDirectory, name, record);
    return true;
  } catch (_error) {
    return false;
  }
}

/** Install the compiler-free allowlisted module loader in a task evaluator. */
export function installPrecompiledTaskModuleLoader(
  fallbackDirectory?: string,
): boolean {
  const cacheDirectory = taskRuntimeModuleCacheDirectory(fallbackDirectory);
  let manifestText: string;
  try {
    manifestText = readResourceText(
      join(cacheDirectory, TASK_RUNTIME_MODULE_MANIFEST),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return false;
    throw error;
  }
  const manifest = JSON.parse(manifestText) as TaskRuntimeModuleManifest;
  if (
    manifest?.schema !== TASK_RUNTIME_MODULE_SCHEMA ||
    !Array.isArray(manifest.roots) ||
    manifest.modules === null ||
    typeof manifest.modules !== "object" ||
    Array.isArray(manifest.modules)
  ) {
    throw new Error("invalid precompiled multiprocessing module manifest");
  }
  for (const root of manifest.roots) {
    if (
      typeof root !== "string" ||
      !pythonModuleNamePattern.test(root) ||
      !Object.hasOwn(manifest.modules, root)
    ) {
      throw new Error("invalid precompiled multiprocessing module root");
    }
  }
  for (const [name, record] of Object.entries(manifest.modules)) {
    if (!validTaskModuleRecord(name, record)) {
      throw new Error(
        `invalid precompiled multiprocessing module record ${name}`,
      );
    }
  }

  const registry = Reflect.get(globalThis, "ρσ_modules") as
    Record<string, unknown> | undefined;
  const baselib = Reflect.get(globalThis, "__sagejs_baselib_modules__");
  if (registry === null || typeof registry !== "object") {
    throw new Error("multiprocessing module registry is unavailable");
  }

  const imported = (name: string): unknown => {
    if (own(registry, name)) return Reflect.get(registry, name);
    if (own(baselib, name)) return Reflect.get(baselib, name);
    return undefined;
  };
  const importError = (name: string): Error => {
    const message = "No module named '" + name + "'";
    const ImportErrorClass = Reflect.get(globalThis, "ImportError");
    if (typeof ImportErrorClass === "function") {
      return Reflect.construct(ImportErrorClass, [message]) as Error;
    }
    const error = new Error(message);
    error.name = "ImportError";
    return error;
  };
  const load = (name: string): unknown => {
    if (!pythonModuleNamePattern.test(name)) {
      throw new TypeError(
        `invalid multiprocessing module name ${JSON.stringify(name)}`,
      );
    }
    const existing = imported(name);
    if (existing !== undefined) return existing;
    const record = manifest.modules[name];
    if (record === undefined) throw importError(name);

    const separator = name.lastIndexOf(".");
    const parentName = separator < 0 ? "" : name.slice(0, separator);
    const childName = separator < 0 ? "" : name.slice(separator + 1);
    const parent = parentName ? load(parentName) : undefined;
    if (
      parent !== undefined && childName &&
      (parent === null ||
        (typeof parent !== "object" && typeof parent !== "function"))
    ) throw new TypeError(`module ${parentName} is not a namespace`);
    const namespace = Object.create(null);
    Reflect.set(registry, name, namespace);
    if (parent !== undefined && childName) {
      Reflect.set(parent as object, childName, namespace);
    }
    const previous = Reflect.get(
      globalThis,
      "__sagejs_current_module_namespace__",
    );
    Reflect.set(
      globalThis,
      "__sagejs_current_module_namespace__",
      namespace,
    );
    try {
      const cached = validatedTaskModuleResource(
        cacheDirectory,
        name,
        record,
      );
      const source = cached.javascriptTemplate.replaceAll(
        JSON.stringify(PRECOMPILED_MODULE_FILENAME),
        JSON.stringify(record.filename),
      );
      runInThisContext(source, { filename: record.filename });
    } catch (error) {
      Reflect.deleteProperty(registry, name);
      if (parent !== undefined && childName) {
        Reflect.deleteProperty(parent as object, childName);
      }
      throw error;
    } finally {
      if (previous === undefined) {
        Reflect.deleteProperty(
          globalThis,
          "__sagejs_current_module_namespace__",
        );
      } else {
        Reflect.set(
          globalThis,
          "__sagejs_current_module_namespace__",
          previous,
        );
      }
    }
    if (!own(registry, name)) {
      throw new Error(
        `multiprocessing module ${name} did not register itself`,
      );
    }
    return Reflect.get(registry, name);
  };
  const proxy = new Proxy(registry, {
    get(target: Record<string, unknown>, property: string | symbol, receiver) {
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver);
      }
      if (
        typeof property === "string" &&
        Object.hasOwn(manifest.modules, property)
      ) {
        return load(property);
      }
      return Reflect.get(target, property, receiver);
    },
  });
  Reflect.set(globalThis, "\u03c1\u03c3_modules", proxy);
  Reflect.set(globalThis, "__sagejs_load_module__", load);
  Reflect.set(
    globalThis,
    "__sagejs_precompiled_task_modules__",
    Object.freeze(Object.keys(manifest.modules)),
  );
  return true;
}

export function readPlotlySource(fallbackFilename: string): string {
  return isSea() ? assetText(PLOTLY_ASSET) : readResourceText(fallbackFilename);
}

export function multiprocessingWorkerPath(fallbackFilename: string): string {
  if (!isSea()) return fallbackFilename;
  if (!hasAsset(MULTIPROCESSING_WORKER_ASSET)) {
    throw new Error("multiprocessing worker is missing from this executable");
  }
  if (multiprocessingWorkerFilename) return multiprocessingWorkerFilename;
  if (!nativeTemporaryDirectory) {
    nativeTemporaryDirectory = mkdtempSync(join(tmpdir(), "sagejs-sea-"));
  }
  multiprocessingWorkerFilename = join(
    nativeTemporaryDirectory,
    basename(MULTIPROCESSING_WORKER_ASSET),
  );
  writeFileSync(
    multiprocessingWorkerFilename,
    Buffer.from(getAsset(MULTIPROCESSING_WORKER_ASSET)),
    { mode: 0o700 },
  );
  return multiprocessingWorkerFilename;
}

export function kernelWorkerPath(fallbackFilename: string): string {
  if (!isSea()) return fallbackFilename;
  if (!hasAsset(KERNEL_WORKER_ASSET)) {
    throw new Error("Jupyter kernel worker is missing from this executable");
  }
  if (kernelWorkerFilename) return kernelWorkerFilename;
  if (!nativeTemporaryDirectory) {
    nativeTemporaryDirectory = mkdtempSync(join(tmpdir(), "sagejs-sea-"));
  }
  kernelWorkerFilename = join(
    nativeTemporaryDirectory,
    basename(KERNEL_WORKER_ASSET),
  );
  writeFileSync(
    kernelWorkerFilename,
    Buffer.from(getAsset(KERNEL_WORKER_ASSET)),
    { mode: 0o700 },
  );
  return kernelWorkerFilename;
}

function loadEmbeddedFlint(): unknown {
  if (flintModule !== undefined) return flintModule;
  if (!hasAsset(FLINT_ASSET)) {
    throw new Error(
      "This Sage.js executable was built without the optional FLINT mathematics backend",
    );
  }

  if (!nativeTemporaryDirectory) {
    nativeTemporaryDirectory = mkdtempSync(join(tmpdir(), "sagejs-sea-"));
  }
  const addonFilename = join(
    nativeTemporaryDirectory,
    basename(FLINT_ASSET),
  );
  writeFileSync(addonFilename, Buffer.from(getAsset(FLINT_ASSET)), {
    mode: 0o700,
  });

  const nativeModule = { exports: {} };
  process.dlopen(nativeModule, addonFilename);
  if (!hasAsset(FLINT_FFI_ASSET)) {
    throw new Error(
      "This Sage.js executable is missing its generated FLINT FFI host adapter",
    );
  }
  const ffiAddonFilename = join(
    nativeTemporaryDirectory,
    basename(FLINT_FFI_ASSET),
  );
  writeFileSync(ffiAddonFilename, Buffer.from(getAsset(FLINT_FFI_ASSET)), {
    mode: 0o700,
  });
  const ffiModule = { exports: {} };
  process.dlopen(ffiModule, ffiAddonFilename);
  const combined = Object.create(null) as Record<PropertyKey, unknown>;
  for (const source of [nativeModule.exports, ffiModule.exports]) {
    for (const name of Reflect.ownKeys(source as object)) {
      combined[name] = Reflect.get(source as object, name);
    }
  }
  attachEmbeddedFfiManifest(combined, FLINT_FFI_MANIFEST_ASSET, "FLINT");
  flintModule = combined;
  return flintModule;
}

function loadEmbeddedGraph(): unknown {
  if (graphModule !== undefined) return graphModule;
  if (!hasAsset(GRAPH_ASSET)) {
    throw new Error(
      "This Sage.js executable was built without the optional igraph backend",
    );
  }
  if (!nativeTemporaryDirectory) {
    nativeTemporaryDirectory = mkdtempSync(join(tmpdir(), "sagejs-sea-"));
  }
  const addonFilename = join(nativeTemporaryDirectory, basename(GRAPH_ASSET));
  writeFileSync(addonFilename, Buffer.from(getAsset(GRAPH_ASSET)), {
    mode: 0o700,
  });
  const nativeModule = { exports: {} };
  process.dlopen(nativeModule, addonFilename);
  if (!hasAsset(GRAPH_FFI_ASSET)) {
    throw new Error(
      "This Sage.js executable is missing its generated igraph FFI host adapter",
    );
  }
  const ffiAddonFilename = join(
    nativeTemporaryDirectory,
    basename(GRAPH_FFI_ASSET),
  );
  writeFileSync(ffiAddonFilename, Buffer.from(getAsset(GRAPH_FFI_ASSET)), {
    mode: 0o700,
  });
  const ffiModule = { exports: {} };
  process.dlopen(ffiModule, ffiAddonFilename);
  const combined = Object.create(null) as Record<PropertyKey, unknown>;
  for (const source of [nativeModule.exports, ffiModule.exports]) {
    for (const name of Reflect.ownKeys(source as object)) {
      combined[name] = Reflect.get(source as object, name);
    }
  }
  attachEmbeddedFfiManifest(combined, GRAPH_FFI_MANIFEST_ASSET, "igraph");
  graphModule = combined;
  return graphModule;
}

function loadEmbeddedFflas(): unknown {
  if (fflasModule !== undefined) return fflasModule;
  if (!hasAsset(FFLAS_FFI_ASSET)) {
    throw new Error(
      "This Sage.js executable was built without the optional FFLAS backend",
    );
  }
  if (!nativeTemporaryDirectory) {
    nativeTemporaryDirectory = mkdtempSync(join(tmpdir(), "sagejs-sea-"));
  }
  const addonFilename = join(
    nativeTemporaryDirectory,
    basename(FFLAS_FFI_ASSET),
  );
  writeFileSync(addonFilename, Buffer.from(getAsset(FFLAS_FFI_ASSET)), {
    mode: 0o700,
  });
  const nativeModule = { exports: {} as Record<PropertyKey, unknown> };
  process.dlopen(nativeModule, addonFilename);
  attachEmbeddedFfiManifest(
    nativeModule.exports,
    FFLAS_FFI_MANIFEST_ASSET,
    "FFLAS",
  );
  fflasModule = nativeModule.exports;
  return fflasModule;
}

function loadEmbeddedZeroMQ(): unknown {
  if (zeroMQModule !== undefined) return zeroMQModule;
  if (!hasAsset(ZEROMQ_ASSET)) {
    throw new Error("ZeroMQ is missing from this Sage.js executable");
  }

  if (!nativeTemporaryDirectory) {
    nativeTemporaryDirectory = mkdtempSync(join(tmpdir(), "sagejs-sea-"));
  }
  const addonFilename = join(nativeTemporaryDirectory, basename(ZEROMQ_ASSET));
  writeFileSync(addonFilename, Buffer.from(getAsset(ZEROMQ_ASSET)), {
    mode: 0o700,
  });

  const nativeModule = { exports: {} };
  process.dlopen(nativeModule, addonFilename);
  const native = nativeModule.exports as {
    Socket: new (type: number, options?: unknown) => any;
  };

  // zeromq.js implements receive iteration in its JavaScript layer rather
  // than in the Node-API addon. Recreate that small, public behavior here so
  // the embedded addon has the same semantics as the ordinary npm package.
  if (!(Symbol.asyncIterator in native.Socket.prototype)) {
    Object.defineProperty(native.Socket.prototype, Symbol.asyncIterator, {
      value: function asyncIterator(this: any) {
        return {
          next: async () => {
            if (this.closed) return { done: true };
            try {
              return { value: await this.receive(), done: false };
            } catch (error: any) {
              if (this.closed && error?.code === "EAGAIN") {
                return { done: true };
              }
              throw error;
            }
          },
        };
      },
    });
  }

  class Publisher extends native.Socket {
    constructor(options?: unknown) {
      super(1, options);
    }
  }
  class Reply extends native.Socket {
    constructor(options?: unknown) {
      super(4, options);
    }
  }
  class Router extends native.Socket {
    constructor(options?: unknown) {
      super(6, options);
    }
  }

  zeroMQModule = { Publisher, Reply, Router };
  return zeroMQModule;
}

export function runtimeRequire(name: string): unknown {
  if (runtimeModuleCache.has(name)) return runtimeModuleCache.get(name);
  const kind = NATIVE_RUNTIME_MODULES.has(name)
    ? "addon"
    : "runtime";
  return measureInitialization(kind, name, () => {
    let module: unknown;
    if (isSea() && name === "@sagemath/sagejs-flint") {
      module = loadEmbeddedFlint();
    } else if (isSea() && name === "@sagemath/sagejs-fflas") {
      module = loadEmbeddedFflas();
    } else if (isSea() && name === "@sagemath/sagejs-graph") {
      module = loadEmbeddedGraph();
    } else if (isSea() && name === "zeromq") {
      module = loadEmbeddedZeroMQ();
    } else if (name === "numpy-ts") {
      module = require("../vendor/numpy-ts.cjs");
    } else if (name === "@sagemath/sagejs-symbolic") {
      module = require("../vendor/symbolic-backend.cjs");
    } else {
      module = require(name);
    }
    runtimeModuleCache.set(name, module);
    return module;
  });
}

export function cleanNativeResources(): void {
  runtimeModuleCache.clear();
  nativeKernelModules.clear();
  if (!nativeTemporaryDirectory || !existsSync(nativeTemporaryDirectory)) return;
  try {
    rmSync(nativeTemporaryDirectory, { recursive: true, force: true });
  } catch {
    // Windows can keep a loaded addon locked until process shutdown.
  }
  multiprocessingWorkerFilename = undefined;
  kernelWorkerFilename = undefined;
  nativeTemporaryDirectory = undefined;
}

process.once("exit", cleanNativeResources);
