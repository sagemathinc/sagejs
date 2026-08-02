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
const BASELIB_ASSET = "compiler/baselib-plain-pretty.js";
const TASK_RUNTIME_ASSET = "compiler/task-runtime.js";
const FLINT_ASSET = "native/sagejs_flint.node";
const PLOTLY_ASSET = "vendor/plotly.min.js";
const MULTIPROCESSING_WORKER_ASSET = "worker/multiprocessing-worker.cjs";
const VENDOR_ASSET_PREFIX = "vendor/";

let flintModule: unknown;
let nativeTemporaryDirectory: string | undefined;
let multiprocessingWorkerFilename: string | undefined;

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
    if (key && getAssetKeys().includes(key)) return assetText(key);
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

export function readBaselibSource(fallbackFilename: string): string {
  return isSea() ? assetText(BASELIB_ASSET) : readResourceText(fallbackFilename);
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
  if (!getAssetKeys().includes(MULTIPROCESSING_WORKER_ASSET)) {
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

function loadEmbeddedFlint(): unknown {
  if (flintModule !== undefined) return flintModule;
  if (!getAssetKeys().includes(FLINT_ASSET)) {
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

export function runtimeRequire(name: string): unknown {
  if (isSea() && name === "@sagemath/sagejs-flint") {
    return loadEmbeddedFlint();
  }
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
  nativeTemporaryDirectory = undefined;
}

process.once("exit", cleanNativeResources);
