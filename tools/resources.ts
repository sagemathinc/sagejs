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

import { measureInitialization } from "./timing";

const VIRTUAL_ROOT = normalize("/__sagejs_sea__");
const COMPILER_ASSET = "compiler/compiler.js";
const COMPILER_CACHE_ASSET = "runtime-cache/compiler.bin";
const BASELIB_ASSET = "compiler/baselib-plain-pretty.js";
const RUNTIME_BOOTSTRAP_PREFIX = "runtime-cache/runtime-bootstrap-";
const TASK_RUNTIME_ASSET = "compiler/task-runtime.js";
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
): unknown {
  if (!isSea()) return require(moduleFilename);
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
  const outputDirectory = join(nativeTemporaryDirectory, "native-kernels", cacheKey);
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
  return measureInitialization(`require ${name}`, () => {
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
