/*
 * Runtime resources that are files in a source checkout and SEA assets in a
 * single-executable build.
 */

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { tmpdir } from "os";
import { basename, join, normalize } from "path";
import { getAsset, getAssetKeys, isSea } from "node:sea";

const VIRTUAL_ROOT = normalize("/__sagejs_sea__");
const COMPILER_ASSET = "compiler/compiler.js";
const COMPILER_CACHE_ASSET = "runtime-cache/compiler.bin";
const BASELIB_ASSET = "compiler/baselib-plain-pretty.js";
const RUNTIME_BOOTSTRAP_PREFIX = "runtime-cache/runtime-bootstrap-";
const TASK_RUNTIME_ASSET = "compiler/task-runtime.js";
const FLINT_ASSET = "native/sagejs_flint.node";
const GRAPH_ASSET = "native/sagejs_graph.node";
const ZEROMQ_ASSET = "native/zeromq.node";
const PLOTLY_ASSET = "vendor/plotly.min.js";
const KERNEL_WORKER_ASSET = "worker/kernel-worker.cjs";
const MULTIPROCESSING_WORKER_ASSET = "worker/multiprocessing-worker.cjs";
const VENDOR_ASSET_PREFIX = "vendor/";

let flintModule: unknown;
let graphModule: unknown;
let zeroMQModule: unknown;
let nativeTemporaryDirectory: string | undefined;
let kernelWorkerFilename: string | undefined;
let multiprocessingWorkerFilename: string | undefined;
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
  flintModule = nativeModule.exports;
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
  graphModule = nativeModule.exports;
  return graphModule;
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
  if (isSea() && name === "@sagemath/sagejs-flint") {
    return loadEmbeddedFlint();
  }
  if (isSea() && name === "@sagemath/sagejs-graph") {
    return loadEmbeddedGraph();
  }
  if (isSea() && name === "zeromq") return loadEmbeddedZeroMQ();
  if (name === "numpy-ts") {
    return require("../vendor/numpy-ts.cjs");
  }
  if (name === "@sagemath/sagejs-symbolic") {
    return require("../vendor/symbolic-backend.cjs");
  }
  return require(name);
}

export function cleanNativeResources(): void {
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
