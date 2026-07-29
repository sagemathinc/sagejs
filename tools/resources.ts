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
const FLINT_ASSET = "native/sagejs_flint.node";
const PLOTLY_ASSET = "vendor/plotly.min.js";

let flintModule: unknown;
let nativeTemporaryDirectory: string | undefined;

function assetText(key: string): string {
  return Buffer.from(getAsset(key)).toString("utf8");
}

function assetKeyForVirtualPath(filename: string): string | undefined {
  const normalized = normalize(filename);
  const prefix = `${VIRTUAL_ROOT}/`;
  if (!normalized.startsWith(prefix)) return;
  return normalized.slice(prefix.length);
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

export function readCompilerSource(fallbackFilename: string): string {
  return isSea() ? assetText(COMPILER_ASSET) : readResourceText(fallbackFilename);
}

export function readBaselibSource(fallbackFilename: string): string {
  return isSea() ? assetText(BASELIB_ASSET) : readResourceText(fallbackFilename);
}

export function readPlotlySource(fallbackFilename: string): string {
  return isSea() ? assetText(PLOTLY_ASSET) : readResourceText(fallbackFilename);
}

function loadEmbeddedFlint(): unknown {
  if (flintModule !== undefined) return flintModule;
  if (!getAssetKeys().includes(FLINT_ASSET)) {
    throw new Error(
      "This Sage.js executable was built without the optional FLINT mathematics backend",
    );
  }

  nativeTemporaryDirectory = mkdtempSync(join(tmpdir(), "sagejs-sea-"));
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
}

process.once("exit", cleanNativeResources);
