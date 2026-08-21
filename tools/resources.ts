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
import { createHash } from "node:crypto";

import { measureInitialization } from "./timing";

const VIRTUAL_ROOT = normalize("/__sagejs_sea__");
const COMPILER_ASSET = "compiler/compiler.js";
const COMPILER_CACHE_ASSET = "runtime-cache/compiler.bin";
const BASELIB_ASSET = "compiler/baselib-plain-pretty.js";
const RUNTIME_BOOTSTRAP_SOURCE_ASSET =
  "runtime-cache/runtime-bootstrap.js";
const RUNTIME_BOOTSTRAP_CACHE_PREFIX = "runtime-cache/runtime-bootstrap-";
const TASK_RUNTIME_ASSET = "compiler/task-runtime.js";
const TASK_RUNTIME_MODULE_MANIFEST = "task-runtime-modules.json";
const TASK_RUNTIME_MODULE_SCHEMA = "sagejs.task-runtime-modules/v3";
const PRECOMPILED_MODULE_FILENAME =
  "/__sagejs_lazy_modules__/__SAGEJS_MODULE_FILENAME__";
const PRECOMPILED_PACKAGE_PATH =
  "/__sagejs_lazy_modules__/__SAGEJS_PACKAGE_PATH__";
const LAZY_MODULE_VIRTUAL_ROOT = "/__sagejs_lazy_modules__";
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
const NATIVE_KERNEL_PACK_ASSET =
  "native-kernels/pack/sagejs_native_kernel_pack.node";
const NATIVE_KERNEL_PACK_MANIFEST_ASSET = "native-kernels/pack/index.json";
const NATIVE_KERNEL_PACK_ABI_VERSION = 1;
const NATIVE_KERNEL_COMPILER_ABI_VERSION = 22;
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

function loadExtractedNativeAddon(
  filename: string,
): Record<PropertyKey, unknown> {
  // Use a real CommonJS Module record and normal native-module cache semantics
  // for each extracted addon.
  return createRequire(filename)(filename) as Record<PropertyKey, unknown>;
}

function assetKeyForVirtualPath(filename: string): string | undefined {
  const normalized = normalize(filename);
  const prefix = `${VIRTUAL_ROOT}/`;
  const platformPrefix = normalize(prefix);
  const offset = normalized.startsWith(platformPrefix)
    ? 0
    : process.platform === "win32" &&
        /^[A-Za-z]:/.test(normalized) &&
        normalized.slice(2).startsWith(platformPrefix)
      ? 2
      : -1;
  if (offset < 0) return;
  return normalized
    .slice(offset + platformPrefix.length)
    .replaceAll("\\", "/");
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
    if (
      !hasAsset(NATIVE_KERNEL_PACK_ASSET) ||
      !hasAsset(NATIVE_KERNEL_PACK_MANIFEST_ASSET)
    ) {
      throw new Error("production native mathematics pack is not embedded");
    }
    const packBytes = Buffer.from(getAsset(NATIVE_KERNEL_PACK_ASSET));
    const manifest = JSON.parse(
      assetText(NATIVE_KERNEL_PACK_MANIFEST_ASSET),
    );
    const kernel = Array.isArray(manifest?.kernels)
      ? manifest.kernels.find(
        (entry: unknown) =>
          entry !== null &&
          typeof entry === "object" &&
          Reflect.get(entry, "cacheKey") === cacheKey,
      )
      : undefined;
    if (
      manifest?.schema !== "sagejs.native-pack/v2" ||
      manifest.packAbi !== NATIVE_KERNEL_PACK_ABI_VERSION ||
      manifest.nativeAbi !== NATIVE_KERNEL_COMPILER_ABI_VERSION ||
      manifest.platform !== process.platform ||
      manifest.architecture !== process.arch ||
      manifest.nodeModulesAbi !== process.versions.modules ||
      manifest.bytes !== packBytes.length ||
      manifest.sha256 !== createHash("sha256").update(packBytes).digest("hex") ||
      kernel === undefined
    ) {
      throw new Error("embedded production native mathematics pack is invalid");
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
    const outputPack = join(
      nativeTemporaryDirectory,
      "native-kernels",
      "pack",
      "sagejs_native_kernel_pack.node",
    );
    mkdirSync(outputDirectory, { recursive: true });
    mkdirSync(dirname(outputPack), { recursive: true });
    writeFileSync(outputModule, Buffer.from(getAsset(key)), { mode: 0o700 });
    if (!existsSync(outputPack)) {
      writeFileSync(outputPack, packBytes, { mode: 0o700 });
    }
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
  _mode: "sage" | "python",
  fallbackFilename: string,
): string | undefined {
  if (isSea()) {
    return hasAsset(RUNTIME_BOOTSTRAP_SOURCE_ASSET)
      ? assetText(RUNTIME_BOOTSTRAP_SOURCE_ASSET)
      : undefined;
  }
  return existsSync(fallbackFilename)
    ? readFileSync(fallbackFilename, "utf8")
    : undefined;
}

export function readRuntimeBootstrapCachedData(
  mode: "sage" | "python",
  fallbackFilename: string,
): Uint8Array | undefined {
  const key = `${RUNTIME_BOOTSTRAP_CACHE_PREFIX}${mode}.bin`;
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
  package: boolean;
  filename: string;
  packagePath: string | null;
  source: string;
}

interface TaskRuntimeModuleManifest {
  schema: string;
  compilerSha256: string;
  roots: string[];
  modules: Record<string, TaskRuntimeModuleRecord>;
}

interface PrecompiledTaskModule {
  schema: "sagejs.lazy-module-template/v1";
  version: string;
  signature: string;
  mode: "python";
  module: string;
  package: boolean;
  filenameMarker: string;
  packagePathMarker: string | null;
  javascriptTemplate: string;
}

const pythonModuleNamePattern =
  /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const reservedModuleSegments = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);
const sha1Pattern = /^[a-f0-9]{40}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

function digest(algorithm: "sha1" | "sha256", value: string): string {
  return createHash(algorithm).update(value).digest("hex");
}

function own(object: unknown, name: PropertyKey): boolean {
  return (
    object !== null &&
    (typeof object === "object" || typeof object === "function") &&
    Object.prototype.hasOwnProperty.call(object, name)
  );
}

function validLazyModuleName(name: unknown): name is string {
  return typeof name === "string" && pythonModuleNamePattern.test(name) &&
    name.split(".").every((segment) => !reservedModuleSegments.has(segment));
}

function exactRecordKeys(value: unknown, expected: string[]): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return JSON.stringify(Object.keys(value).sort()) ===
    JSON.stringify([...expected].sort());
}

function canonicalTaskModuleFilename(name: string, isPackage: boolean): string {
  const stem = name.replaceAll(".", "/");
  return isPackage
    ? `${LAZY_MODULE_VIRTUAL_ROOT}/${stem}/__init__.py`
    : `${LAZY_MODULE_VIRTUAL_ROOT}/${stem}.py`;
}

function canonicalTaskPackagePath(name: string, isPackage: boolean): string | null {
  return isPackage
    ? `${LAZY_MODULE_VIRTUAL_ROOT}/${name.replaceAll(".", "/")}`
    : null;
}

function taskRuntimeModuleCacheDirectory(fallbackDirectory?: string): string {
  return process.env.SAGEJS_PRECOMPILED_MODULE_CACHE_DIR ??
    precompiledLazyModuleCacheDirectory(
      fallbackDirectory ?? join(__dirname, "..", "lazy-module-cache"),
    );
}

function taskRuntimeSourceDirectory(fallbackDirectory?: string): string {
  return standardLibraryDirectory(
    fallbackDirectory ?? join(__dirname, "..", "..", "src", "lib"),
  );
}

function taskRuntimeCompilerFilename(fallbackFilename?: string): string {
  return compilerDirectory(
    fallbackFilename ?? join(__dirname, "..", "compiler", "compiler.js"),
  );
}

function expectedTaskModuleSources(name: string): string[] {
  const stem = name.replaceAll(".", "/");
  return [`${stem}.py`, `${stem}/__init__.py`];
}

function validTaskModuleRecord(
  name: string,
  record: unknown,
): record is TaskRuntimeModuleRecord {
  const expectedResource = `${name.replaceAll(".", "-")}.json`;
  if (!validLazyModuleName(name) || !exactRecordKeys(record, [
    "resource", "version", "signature", "mode", "package", "filename",
    "packagePath", "source",
  ])) return false;
  const candidate = record as Record<PropertyKey, unknown>;
  const isPackage = candidate.package;
  const expectedSource = isPackage
    ? `${name.replaceAll(".", "/")}/__init__.py`
    : `${name.replaceAll(".", "/")}.py`;
  return candidate.resource === expectedResource &&
    typeof candidate.version === "string" &&
    typeof candidate.signature === "string" &&
    candidate.mode === "python" && typeof isPackage === "boolean" &&
    candidate.filename === canonicalTaskModuleFilename(name, isPackage) &&
    candidate.packagePath === canonicalTaskPackagePath(name, isPackage) &&
    candidate.source === expectedSource &&
    sha1Pattern.test(candidate.signature);
}

function validatedTaskManifestIdentity(
  manifest: TaskRuntimeModuleManifest,
  compilerFilename?: string,
): void {
  if (
    !sha256Pattern.test(manifest.compilerSha256) ||
    digest("sha256", readCompilerSource(
      taskRuntimeCompilerFilename(compilerFilename),
    )) !== manifest.compilerSha256
  ) {
    throw new Error("stale precompiled multiprocessing compiler identity");
  }
}

function validatedTaskModuleSource(
  sourceDirectory: string,
  name: string,
  record: TaskRuntimeModuleRecord,
): void {
  if (!expectedTaskModuleSources(name).includes(record.source)) {
    throw new Error(`invalid precompiled multiprocessing source ${name}`);
  }
  const source = readResourceText(join(sourceDirectory, record.source));
  if (digest("sha1", source) !== record.signature) {
    throw new Error(`stale precompiled multiprocessing source ${name}`);
  }
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
    !exactRecordKeys(cached, [
      "schema", "version", "signature", "mode", "module", "package",
      "filenameMarker", "packagePathMarker", "javascriptTemplate",
    ]) ||
    cached.schema !== "sagejs.lazy-module-template/v1" ||
    cached.version !== record.version ||
    cached.signature !== record.signature ||
    cached.mode !== record.mode ||
    cached.module !== name ||
    cached.package !== record.package ||
    cached.filenameMarker !== PRECOMPILED_MODULE_FILENAME ||
    cached.packagePathMarker !== (
      record.package ? PRECOMPILED_PACKAGE_PATH : null
    ) ||
    typeof cached.javascriptTemplate !== "string" ||
    !cached.javascriptTemplate.includes(
      JSON.stringify(PRECOMPILED_MODULE_FILENAME),
    ) || (record.package
      ? !cached.javascriptTemplate.includes(
        JSON.stringify(PRECOMPILED_PACKAGE_PATH),
      )
      : cached.javascriptTemplate.includes(
        JSON.stringify(PRECOMPILED_PACKAGE_PATH),
      ))
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
  if (!validLazyModuleName(name)) return false;
  try {
    const cacheDirectory = taskRuntimeModuleCacheDirectory(fallbackDirectory);
    const manifest = JSON.parse(readResourceText(
      join(cacheDirectory, TASK_RUNTIME_MODULE_MANIFEST),
    )) as TaskRuntimeModuleManifest;
    if (
      manifest?.schema !== TASK_RUNTIME_MODULE_SCHEMA ||
      !exactRecordKeys(manifest, [
        "schema", "compilerSha256", "roots", "modules",
      ]) ||
      !exactRecordKeys(manifest.modules, Object.keys(manifest.modules ?? {})) ||
      !Object.hasOwn(manifest.modules, name)
    ) return false;
    validatedTaskManifestIdentity(manifest);
    const sourceDirectory = taskRuntimeSourceDirectory();
    for (const [moduleName, moduleRecord] of Object.entries(manifest.modules)) {
      if (!validTaskModuleRecord(moduleName, moduleRecord)) return false;
      validatedTaskModuleSource(
        sourceDirectory,
        moduleName,
        moduleRecord,
      );
    }
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
    !exactRecordKeys(manifest, [
      "schema", "compilerSha256", "roots", "modules",
    ]) ||
    !Array.isArray(manifest.roots) ||
    !exactRecordKeys(manifest.modules, Object.keys(manifest.modules ?? {}))
  ) {
    throw new Error("invalid precompiled multiprocessing module manifest");
  }
  validatedTaskManifestIdentity(manifest);
  for (const root of manifest.roots) {
    if (
      typeof root !== "string" ||
      !validLazyModuleName(root) ||
      !Object.hasOwn(manifest.modules, root)
    ) {
      throw new Error("invalid precompiled multiprocessing module root");
    }
  }
  if (JSON.stringify(manifest.roots) !==
      JSON.stringify([...new Set(manifest.roots)].sort()) ||
      JSON.stringify(Object.keys(manifest.modules)) !==
        JSON.stringify(Object.keys(manifest.modules).sort())) {
    throw new Error("noncanonical precompiled multiprocessing manifest");
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
  const sourceDirectory = taskRuntimeSourceDirectory();
  const taskSourcePaths: Record<string, string> = Object.create(null);
  for (const [name, record] of Object.entries(manifest.modules)) {
    validatedTaskModuleSource(sourceDirectory, name, record);
    taskSourcePaths[record.filename] = join(sourceDirectory, record.source);
  }
  Reflect.set(
    globalThis,
    "__sagejs_precompiled_task_source_paths__",
    Object.freeze(taskSourcePaths),
  );
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
    if (!validLazyModuleName(name)) {
      throw new TypeError(
        `invalid multiprocessing module name ${JSON.stringify(name)}`,
      );
    }
    const existing = imported(name);
    if (existing !== undefined) return existing;
    const record = manifest.modules[name];
    if (record === undefined) throw importError(name);
    validatedTaskModuleSource(sourceDirectory, name, record);

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
      const source = cached.javascriptTemplate
        .replaceAll(
          JSON.stringify(PRECOMPILED_MODULE_FILENAME),
          JSON.stringify(record.filename),
        )
        .replaceAll(
          JSON.stringify(PRECOMPILED_PACKAGE_PATH),
          JSON.stringify(record.packagePath),
        );
      // Each compiler-emitted module expects its ``var`` declarations to be
      // module-local. Running raw templates at global scope lets similarly
      // named lowered bindings in later modules overwrite earlier closures.
      // The full runtime uses the same IIFE boundary for lazy modules.
      runInThisContext(
        `(function(){\n${source}\n}).call(globalThis);`,
        { filename: record.filename },
      );
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

  const nativeExports = loadExtractedNativeAddon(addonFilename);
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
  const ffiExports = loadExtractedNativeAddon(ffiAddonFilename);
  const combined = Object.create(null) as Record<PropertyKey, unknown>;
  for (const source of [nativeExports, ffiExports]) {
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
  const nativeExports = loadExtractedNativeAddon(addonFilename);
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
  const ffiExports = loadExtractedNativeAddon(ffiAddonFilename);
  const combined = Object.create(null) as Record<PropertyKey, unknown>;
  for (const source of [nativeExports, ffiExports]) {
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
  const nativeExports = loadExtractedNativeAddon(addonFilename);
  attachEmbeddedFfiManifest(
    nativeExports,
    FFLAS_FFI_MANIFEST_ASSET,
    "FFLAS",
  );
  fflasModule = nativeExports;
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

  const native = loadExtractedNativeAddon(addonFilename) as {
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
