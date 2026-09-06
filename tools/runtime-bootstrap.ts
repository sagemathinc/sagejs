/**
 * Build and execute the generated Python/Sage base runtime.
 *
 * Release builds include both the generated JavaScript and V8 cached data.
 * V8 safely rejects cached data produced by an incompatible Node release or
 * architecture, then compiles the unchanged source normally.
 */

import { mkdirSync, statSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { createRequire } from "module";
import { compileFunction, Script } from "vm";

import { markModuleCacheInUse } from "./cache-lease";
import { atomicWriteCacheFileSync } from "./cache-file";
import type { Compiler } from "./compiler";
import dynamicCode from "./dynamic-code";
import {
  importJavaScriptModule,
  requireJavaScriptModule,
  resolveJavaScriptModule,
} from "./javascript-modules";
import type { PythonCompilerFrontend } from "./python/compiler-frontend";
import {
  CompilerProfileMapCollector,
  OptimizerProfileMap,
} from "./python/optimizer/profile-map";
import {
  loadPrecompiledNativeKernel,
  isSingleExecutable,
  precompiledLazyModuleCacheDirectory,
  precompiledNativeKernelCacheDirectory,
  readBaselibSource,
  readResourceText,
  readRuntimeBootstrapCachedData,
  readRuntimeBootstrapSource,
  standardLibraryCacheDirectory,
} from "./resources";
import { loadSagejsCapabilityApi } from "./capability-api";
import { installImmutableUInt64CapsuleRuntime } from "./immutable-uint64-capsule";
import { basePath, getImportDirs, importPath, libraryPath, sha1sum } from "./utils";
import {
  beginInitializationTiming,
  finishInitializationTiming,
} from "./timing";

export type RuntimeBootstrapMode = "sage" | "python";

export interface RuntimeOptimizerProfileSessionOptions {
  observerIdentifier: string;
  observer(
    regionId: string,
    kind: string,
    outcome: string,
    rawGuardReason?: string | null,
  ): void;
  runNonce: string;
  declare(map: OptimizerProfileMap, javascript: string): void;
}

export interface RuntimeBootstrapController {
  beginOptimizerProfile(
    options: RuntimeOptimizerProfileSessionOptions,
  ): RuntimeOptimizerProfileSession;
  loadedLazyModules(): readonly string[];
  profileContaminated(): boolean;
}

export interface RuntimeOptimizerProfileSession {
  seal(): void;
  assertNoLateImports(): void;
  end(): void;
}

export class OptimizerProfileLateImportError extends Error {
  readonly reasonCode = "evidence.late-import" as const;
  readonly moduleName: string;

  constructor(moduleName: string) {
    super(
      `sealed optimizer profile rejected late lazy import ${JSON.stringify(moduleName)}; ` +
        "load the complete dynamic module closure during preparation or warmup",
    );
    this.name = "OptimizerProfileLateImportError";
    this.moduleName = moduleName;
  }
}

export const PRECOMPILED_MODULE_FILENAME =
  "/__sagejs_lazy_modules__/__SAGEJS_MODULE_FILENAME__";
export const PRECOMPILED_PACKAGE_PATH =
  "/__sagejs_lazy_modules__/__SAGEJS_PACKAGE_PATH__";

const pythonModuleNamePattern =
  /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/;
const reservedModuleSegments = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

function validLazyModuleName(name: unknown): name is string {
  return typeof name === "string" && pythonModuleNamePattern.test(name) &&
    name.split(".").every((segment) => !reservedModuleSegments.has(segment));
}

function exactRecordKeys(
  value: unknown,
  expected: string[],
): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  return JSON.stringify(Object.keys(value).sort()) ===
    JSON.stringify([...expected].sort());
}

function validPrecompiledLazyModuleRecord(
  cached: any,
  name: string,
): boolean {
  return exactRecordKeys(cached, [
    "schema",
    "version",
    "signature",
    "mode",
    "module",
    "package",
    "filenameMarker",
    "packagePathMarker",
    "javascriptTemplate",
  ]) && cached.schema === "sagejs.lazy-module-template/v1" &&
    typeof cached.version === "string" &&
    typeof cached.signature === "string" && /^[a-f0-9]{40}$/.test(cached.signature) &&
    cached.mode === "python" && cached.module === name &&
    typeof cached.package === "boolean" &&
    cached.filenameMarker === PRECOMPILED_MODULE_FILENAME &&
    cached.packagePathMarker === (
      cached.package ? PRECOMPILED_PACKAGE_PATH : null
    ) &&
    typeof cached.javascriptTemplate === "string" &&
    cached.javascriptTemplate.includes(
      JSON.stringify(PRECOMPILED_MODULE_FILENAME),
    ) && (cached.package
      ? cached.javascriptTemplate.includes(JSON.stringify(PRECOMPILED_PACKAGE_PATH))
      : !cached.javascriptTemplate.includes(JSON.stringify(PRECOMPILED_PACKAGE_PATH)));
}

function precompiledLazyModuleMatchesSource(
  cached: any,
  sourceHash: string,
  version: string,
  mode: RuntimeBootstrapMode,
  isPackage: boolean,
): boolean {
  return cached.version === version && cached.signature === sourceHash &&
    cached.mode === mode && cached.package === isPackage;
}

function rejectOptimizerProfileRawJavaScript(root: unknown): void {
  const active = new WeakSet<object>();
  const visit = (value: unknown): void => {
    if (value === null || typeof value !== "object" || active.has(value)) return;
    active.add(value);
    const node = value as Record<string, unknown>;
    if (String((node as any).constructor?.name ?? "") === "AST_Verbatim") {
      throw new TypeError(
        "optimizer profiling rejects raw `%js` regions because they cannot share " +
          "the private route-observer capability",
      );
    }
    for (const [key, child] of Object.entries(node)) {
      if (["scope", "thedef", "parent_scope", "classes", "globals"].includes(key)) continue;
      if (Array.isArray(child)) {
        for (const item of child) visit(item);
      } else {
        visit(child);
      }
    }
    active.delete(value);
  };
  visit(root);
}

// This is the runtime half of `NATIVE_ABI_VERSION` in
// `tools/native-kernel/c-backend.cjs`. Production-kernel tests ratchet the two
// values together. Keeping the expected value in the runtime makes an old
// cache fail closed even when its Python source has not changed.
export const NATIVE_KERNEL_ABI_VERSION = 23;

// A real statement gives the output pipeline a module to which it can attach
// the generated baselib.  This used to be a RapydScript anonymous-function
// extension; the authoritative frontend intentionally accepts Python/Sage.
const BOOTSTRAP_SOURCE = "pass\n";
const HYPERELLIPTIC_RECEIPT_RUNTIME =
  "__sagejs_hyperelliptic_auto_receipt_policy__";
let singleExecutableReceiptRuntime: object | undefined;

export function installHyperellipticAutoReceiptPolicy(): void {
  if (isSingleExecutable()) {
    const existing = Reflect.get(globalThis, HYPERELLIPTIC_RECEIPT_RUNTIME);
    if (singleExecutableReceiptRuntime !== undefined) {
      if (existing !== singleExecutableReceiptRuntime) {
        throw new Error("single-executable receipt runtime was replaced");
      }
      return;
    }
    if (existing !== undefined) {
      throw new Error("hyperelliptic receipt runtime existed before trusted startup");
    }
    const runtime = Object.freeze({
      schema: "sagejs.hyperelliptic-auto-receipt-runtime/v1",
      enabled: true,
      platform: "single-executable-unreceipted",
      source_bundle_sha256: null,
      decide(backend: unknown, operation: unknown) {
        return Object.freeze({
          schema: "sagejs.hyperelliptic-auto-receipt-runtime/v1",
          policy_enabled: true,
          selected: false,
          reason: "unreceipted-fallback",
          entry_id: null,
          backend,
          operation,
        });
      },
    });
    Object.defineProperty(globalThis, HYPERELLIPTIC_RECEIPT_RUNTIME, {
      configurable: false,
      enumerable: false,
      writable: false,
      value: runtime,
    });
    singleExecutableReceiptRuntime = runtime;
    return;
  }
  const loader = createRequire(__filename)(
    join(
      basePath,
      "tools",
      "math-dispatch",
      "hyperelliptic-auto-receipt-loader.cjs",
    ),
  ) as {
    installCheckedInAutoReceiptPolicy(options: {
      root: string;
      target: typeof globalThis;
    }): unknown;
  };
  loader.installCheckedInAutoReceiptPolicy({
    root: basePath,
    target: globalThis,
  });
}

function cacheDirectory(): string {
  return join(__dirname, "..", "runtime-cache");
}

function defaultModuleCacheDirectory(compiler: Compiler): string {
  const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(base, "sagejs", "modules", compiler.get_compiler_version());
}

export function runtimeBootstrapFilename(
  mode: RuntimeBootstrapMode,
): string {
  return `sagejs/runtime-bootstrap-${mode}.js`;
}

export function generateRuntimeBootstrapSource(
  compiler: Compiler,
  mode: RuntimeBootstrapMode,
  frontend: PythonCompilerFrontend,
): string {
  const ast = frontend.parse(BOOTSTRAP_SOURCE, {
    filename: "<runtime-bootstrap>",
    basedir: process.cwd(),
  });
  const output = new compiler.OutputStream({
    omit_baselib: false,
    write_name: false,
    private_scope: false,
    beautify: true,
    keep_docstrings: true,
    exact_integers: true,
    rational_division: mode === "sage",
    python_tuples: true,
    python_truthiness: true,
    python_attributes: true,
    pool_numeric_literals: true,
    numeric_literal_pool_prefix: `rho_runtime_${mode}_`,
    module_registry: "",
    standalone_builtins: false,
    baselib_plain: readBaselibSource(
      join(libraryPath, "baselib-plain-pretty.js"),
    ),
  });
  ast.print(output);
  return output.get();
}

export function runRuntimeBootstrap(
  compiler: Compiler,
  mode: RuntimeBootstrapMode,
  frontend: PythonCompilerFrontend,
  pythonFrontend: PythonCompilerFrontend = frontend,
  additionalImportDirs: string[] = [],
  requestedModuleCacheDirectory?: string | false,
): RuntimeBootstrapController {
  installHyperellipticAutoReceiptPolicy();
  installImmutableUInt64CapsuleRuntime();
  if (Reflect.get(globalThis, "__sagejs_capability_api__") === undefined) {
    Reflect.set(globalThis, "__sagejs_capability_api__", loadSagejsCapabilityApi());
  }
  const internalRequire = Reflect.get(globalThis, "require");
  if (typeof internalRequire === "function") {
    // Compiler intrinsics use this collision-proof name. In particular,
    // ``from sagejs.javascript import require`` must not redirect internal
    // FLINT, SQLite, dynamic-code, or other trusted runtime dependencies.
    const trustedRequire = (name: string): unknown => {
      if (name === "./dynamic-code.js") return { default: dynamicCode };
      return Reflect.apply(internalRequire, undefined, [name]);
    };
    Reflect.set(globalThis, "__sagejs_runtime_require__", trustedRequire);
  }
  const moduleCacheDirectory = requestedModuleCacheDirectory === false
    ? ""
    : requestedModuleCacheDirectory ?? defaultModuleCacheDirectory(compiler);
  if (moduleCacheDirectory) markModuleCacheInUse(moduleCacheDirectory);
  const precompiledModuleCacheDirectory =
    process.env.SAGEJS_PRECOMPILED_MODULE_CACHE_DIR ??
    precompiledLazyModuleCacheDirectory(
      join(__dirname, "..", "lazy-module-cache"),
    );
  const directory = cacheDirectory();
  const source =
    readRuntimeBootstrapSource(
      mode,
      join(directory, `runtime-bootstrap-${mode}.js`),
    ) ??
    generateRuntimeBootstrapSource(compiler, mode, frontend);
  const cachedData = readRuntimeBootstrapCachedData(
    mode,
    join(directory, `runtime-bootstrap-${mode}.bin`),
  );
  const script = new Script(source, {
    filename: runtimeBootstrapFilename(mode),
    cachedData,
  });

  global.__sagejs_sage_mode__ = mode === "sage";
  try {
    script.runInThisContext();
  } finally {
    delete global.__sagejs_sage_mode__;
  }

  // ``import builtins`` must expose the same live objects used by generated
  // code.  A proxy is important here: packages are allowed to monkey-patch
  // builtins, and a one-time copied namespace would immediately diverge from
  // ordinary name lookup.
  const moduleRegistry = Reflect.get(globalThis, "ρσ_modules");
  if (!Object.prototype.hasOwnProperty.call(moduleRegistry, "builtins")) {
    const generatedFacadeNames = Reflect.get(globalThis, "__sagejs_baselib_facade_names__");
    if (!Array.isArray(generatedFacadeNames)) {
      throw new Error("generated baselib facade inventory is unavailable");
    }
    // Stage zero reserves `super`, so baselib publishes its public host
    // property explicitly rather than declaring a Python source alias.
    const facadeNames = [...generatedFacadeNames, "super"];
    const builtinNames = new Set<PropertyKey>([
      ...facadeNames,
      "__sagejs_native_resolve__",
      "__sagejs_native_fallback_policy__",
      "__sagejs_native_private_fallback__",
    ]);
    const pythonBuiltinNames = new Set<PropertyKey>(["super"]);
    const baselibRegistry = Reflect.get(
      globalThis,
      "__sagejs_baselib_modules__",
    ) as Record<string, unknown> | undefined;
    for (const moduleName of [
      "sagejs._baselib.builtins",
      "sagejs._baselib.errors",
    ]) {
      const namespace = baselibRegistry?.[moduleName];
      if (namespace && (typeof namespace === "object" || typeof namespace === "function")) {
        for (const property of Reflect.ownKeys(namespace)) {
          pythonBuiltinNames.add(property);
        }
      }
    }
    const metadata: Record<PropertyKey, any> = Object.create(null);
    const explicitlyWrittenBuiltinNames = new Set<PropertyKey>();
    const existingDeletedBuiltin = Reflect.get(
      globalThis,
      "ρσ_deleted_builtin",
    );
    const deletedBuiltin = existingDeletedBuiltin?.__sagejs_deleted_builtin__ === true
      ? existingDeletedBuiltin
      : Object.freeze({ __sagejs_deleted_builtin__: true });
    Reflect.set(globalThis, "ρσ_deleted_builtin", deletedBuiltin);
    Object.assign(metadata, {
      __name__: "builtins",
      __package__: "",
      __loader__: null,
      // `eval` is a reserved JavaScript binding, so the compiler publishes
      // the Python implementation under its internal `ρσ_eval` name instead
      // of adding an `eval` entry to the generated facade.  Expose that exact
      // implementation explicitly: falling through to `globalThis.eval`
      // would leak the JavaScript host primitive into Python, while omitting
      // it breaks ordinary `import builtins; builtins.eval(...)` consumers
      // such as `inspect.signature(..., eval_str=True)` and Traitlets.
      eval: Reflect.get(globalThis, "ρσ_eval"),
      __spec__: {
        name: "builtins",
        parent: "",
        origin: "built-in",
        loader: null,
        submodule_search_locations: null,
      },
    });
    Object.defineProperties(metadata, {
      __sagejs_builtin_facade_names__: { value: builtinNames },
      __sagejs_python_builtin_names__: { value: pythonBuiltinNames },
      __sagejs_explicit_builtin_names__: {
        value: explicitlyWrittenBuiltinNames,
      },
    });
    const builtins = new Proxy(metadata, {
      get(target, property) {
        if (Reflect.has(target, property)) return Reflect.get(target, property);
        if (!builtinNames.has(property)) return undefined;
        const value = Reflect.get(globalThis, property);
        return value === deletedBuiltin ? undefined : value;
      },
      has(target, property) {
        return Reflect.has(target, property) || (builtinNames.has(property) &&
          Reflect.has(globalThis, property) &&
          Reflect.get(globalThis, property) !== deletedBuiltin);
      },
      set(target, property, value) {
        if (Reflect.has(target, property)) return Reflect.set(target, property, value);
        if (builtinNames.has(property)) {
          explicitlyWrittenBuiltinNames.add(property);
          return Reflect.set(globalThis, property, value);
        }
        return Reflect.set(target, property, value);
      },
      deleteProperty(target, property) {
        if (Reflect.has(target, property)) {
          return Reflect.deleteProperty(target, property);
        }
        if (builtinNames.has(property)) {
          explicitlyWrittenBuiltinNames.delete(property);
          if (Reflect.deleteProperty(globalThis, property)) return true;
          // Top-level `var` bindings are non-configurable in the host realm.
          // A process-wide tombstone preserves Python deletion semantics
          // without pretending that JavaScript removed the property.
          return Reflect.set(globalThis, property, deletedBuiltin);
        }
        return true;
      },
      ownKeys(target) {
        return [...new Set([
          ...Reflect.ownKeys(target),
          ...facadeNames.filter((property) =>
            Reflect.has(globalThis, property) &&
            Reflect.get(globalThis, property) !== deletedBuiltin
          ),
        ])];
      },
      getOwnPropertyDescriptor(target, property) {
        const local = Reflect.getOwnPropertyDescriptor(target, property);
        if (local) return local;
        if (builtinNames.has(property) && Reflect.has(globalThis, property)) {
          return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: Reflect.get(globalThis, property),
          };
        }
        return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: undefined,
        };
      },
    });
    Reflect.set(moduleRegistry, "builtins", builtins);
  }

  const loading = new Set<string>();
  const loadedLazyModules = new Set<string>();
  let activeOptimizerProfile: (RuntimeOptimizerProfileSessionOptions & {
    profiledModules: Set<string>;
    unavailableModules: Set<string>;
    sealed: boolean;
    lateImportAttempt: string | null;
  }) | undefined;
  let optimizerProfileContaminated = false;
  // Module ``__dict__`` is a live writable mapping in CPython.  Keep an
  // identity set so the Python compatibility layer can distinguish module
  // namespaces from ordinary objects without scanning/copying their members.
  // A WeakSet also avoids extending the public namespace with a marker.
  const moduleNamespaces = new WeakSet<object>();
  const namespaceRegistries = [moduleRegistry];
  const baselibModules = Reflect.get(
    globalThis,
    "__sagejs_baselib_modules__",
  );
  if (baselibModules && typeof baselibModules === "object") {
    namespaceRegistries.push(baselibModules);
  }
  for (const registry of namespaceRegistries) {
    for (const value of Object.values(registry)) {
      if (
        (typeof value === "object" && value !== null) ||
        typeof value === "function"
      ) {
        moduleNamespaces.add(value);
      }
    }
  }
  Reflect.set(globalThis, "__sagejs_module_namespaces__", moduleNamespaces);
  const requestedNativeMode = process.env.SAGEJS_NATIVE_MODE || "auto";
  if (
    !["auto", "dynamic", "javascript", "native"].includes(
      requestedNativeMode,
    )
  ) {
    throw new RangeError(
      "SAGEJS_NATIVE_MODE must be auto, dynamic, javascript, or native",
    );
  }
  const nativeFallbackPolicy =
    requestedNativeMode === "native" ||
    (requestedNativeMode === "auto" &&
      process.env.SAGEJS_NATIVE_REQUIRED === "1")
      ? "required"
      : process.env.SAGEJS_NATIVE_WARN_FALLBACK === "1"
        ? "warn"
        : "allow";
  Reflect.set(
    globalThis,
    "__sagejs_native_fallback_policy__",
    nativeFallbackPolicy,
  );
  Reflect.set(
    globalThis,
    "__sagejs_native_trace_enabled__",
    process.env.SAGEJS_NATIVE_TRACE === "1",
  );
  const nativePrivateFallback = Object.freeze(Object.create(null));
  Reflect.set(
    globalThis,
    "__sagejs_native_private_fallback__",
    nativePrivateFallback,
  );
  const nativeModules = new Map<
    string,
    {
      sourceHash: string;
      functions: Record<string, unknown>;
      privateFunctions: ReadonlySet<string>;
    }
  >();
  const nativeSourceHashes = new Map<string, string>();
  type NativeForeignDeclaration = {
    id: string;
    declarationIdentity: string;
    dynamicPackage: string;
  };
  type NativeCompatibility = {
    cacheKey: string;
    sourceHash: string;
    nativeAbi: number;
    foreignDeclarations: NativeForeignDeclaration[];
    privateFunctions: string[];
  };
  const nativeLogicalSourceKey = (filename: string): string | undefined => {
    const normalized = filename.replaceAll("\\", "/");
    for (const marker of ["/src/lib/", "/__sagejs_lazy_modules__/"]) {
      const index = normalized.lastIndexOf(marker);
      if (index >= 0) return normalized.slice(index + marker.length);
    }
    const marker = "/sagejs/kernels/";
    const index = normalized.lastIndexOf(marker);
    return index < 0 ? undefined : normalized.slice(index + 1);
  };
  const nativeSourcePath = (filename: string): string => {
    const taskSources = Reflect.get(
      globalThis,
      "__sagejs_precompiled_task_source_paths__",
    );
    const mapped = taskSources !== null && typeof taskSources === "object" &&
        Object.hasOwn(taskSources, filename)
      ? Reflect.get(taskSources, filename)
      : undefined;
    return resolve(typeof mapped === "string" && mapped ? mapped : filename);
  };
  const usableNativeCandidate = (candidate: unknown): boolean => {
    if (typeof candidate !== "function") return false;
    // Source-transparent prime-field kernels currently have a native core but
    // no portable typed-IR JavaScript emitter.  When the native addon is
    // deliberately disabled, retain the original Python function instead of
    // installing an artifact whose public wrapper can only throw.  This keeps
    // `SAGEJS_NATIVE_DISABLE=1` a correct dynamic-fallback mode while making
    // the missing portable emitter explicit and local to the compiler.
    return !(
      Reflect.get(candidate, "sourceTransparent") === true &&
      Reflect.get(candidate, "nativeAvailable") !== true &&
      typeof Reflect.get(candidate, "javascript") !== "function"
    );
  };
  const nativeSourceHash = (filename: string): string | undefined => {
    const cached = nativeSourceHashes.get(filename);
    if (cached !== undefined) return cached;
    try {
      // Keep crypto off the ordinary startup path. It is only needed when an
      // imported function actually carries @native and asks for resolution.
      const { createHash } = require("crypto") as typeof import("crypto");
      const digest = createHash("sha256")
        .update(readResourceText(filename))
        .digest("hex");
      nativeSourceHashes.set(filename, digest);
      return digest;
    } catch (_error) {
      return undefined;
    }
  };
  const staleNativeArtifact = (filename: string, reason: string): Error =>
    new Error(
      `stale native kernel artifact for ${filename}: ${reason}; ` +
      "rebuild the native kernel cache",
    );
  const validatedNativeCompatibility = (
    filename: string,
    value: unknown,
    expectedSourceHash: string,
  ): NativeCompatibility => {
    if (value === null || typeof value !== "object") {
      throw staleNativeArtifact(filename, "missing compatibility metadata");
    }
    const cacheKey = Reflect.get(value, "cacheKey");
    const sourceHash = Reflect.get(value, "sourceHash");
    const nativeAbi = Reflect.get(value, "nativeAbi");
    const declarations = Reflect.get(value, "foreignDeclarations");
    const privateNames = Reflect.get(value, "privateFunctions");
    if (
      typeof cacheKey !== "string" || !/^[a-f0-9]{64}$/.test(cacheKey) ||
      sourceHash !== expectedSourceHash ||
      nativeAbi !== NATIVE_KERNEL_ABI_VERSION ||
      !Array.isArray(declarations) ||
      !Array.isArray(privateNames)
    ) {
      throw staleNativeArtifact(
        filename,
        "source, cache, or native ABI metadata does not match",
      );
    }
    const privateFunctions: string[] = [];
    let previousPrivateName: string | undefined;
    for (const name of privateNames) {
      if (
        typeof name !== "string" ||
        !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
        (previousPrivateName !== undefined && name <= previousPrivateName)
      ) {
        throw staleNativeArtifact(
          filename,
          "invalid private native-function metadata",
        );
      }
      privateFunctions.push(name);
      previousPrivateName = name;
    }
    const foreignDeclarations: NativeForeignDeclaration[] = [];
    const seen = new Set<string>();
    for (const declaration of declarations) {
      const id = declaration?.id;
      const declarationIdentity = declaration?.declarationIdentity;
      const dynamicPackage = declaration?.dynamicPackage;
      const identityMatch = typeof id === "string" &&
          typeof declarationIdentity === "string"
        ? declarationIdentity.match(
          new RegExp(`^${id}@[a-f0-9]{64}(?::([a-z][a-z0-9_]*))?$`),
        )
        : null;
      if (
        typeof id !== "string" || !/^[a-z][a-z0-9_]*$/.test(id) ||
        typeof declarationIdentity !== "string" ||
        identityMatch === null ||
        typeof dynamicPackage !== "string" || dynamicPackage.length === 0 ||
        seen.has(id)
      ) {
        throw staleNativeArtifact(
          filename,
          "invalid foreign declaration metadata",
        );
      }
      seen.add(id);
      const backend = Reflect.apply(
        internalRequire as (...args: any[]) => unknown,
        undefined,
        [dynamicPackage],
      );
      const manifest = backend === null ||
          (typeof backend !== "object" && typeof backend !== "function")
        ? undefined
        : Reflect.get(backend, "__sagejs_ffi_manifest__");
      const libraryIdentity = declarationIdentity.split(":", 1)[0];
      const selectedFunction = identityMatch[1];
      const manifestProvidesSelection = selectedFunction === undefined ||
        (Array.isArray(manifest?.functions) && manifest.functions.some(
          (entry: unknown) =>
            entry !== null && typeof entry === "object" &&
            Reflect.get(entry, "declaration") === `${id}:${selectedFunction}`,
        ));
      if (
        manifest?.library !== libraryIdentity || !manifestProvidesSelection
      ) {
        throw staleNativeArtifact(
          filename,
          `FFI declaration ${declarationIdentity} is not provided by ` +
            dynamicPackage,
        );
      }
      foreignDeclarations.push({ id, declarationIdentity, dynamicPackage });
    }
    foreignDeclarations.sort((left, right) => left.id.localeCompare(right.id));
    return {
      cacheKey,
      sourceHash,
      nativeAbi,
      foreignDeclarations,
      privateFunctions,
    };
  };
  const nativeCompatibilityKey = (value: NativeCompatibility): string =>
    JSON.stringify({
      cacheKey: value.cacheKey,
      sourceHash: value.sourceHash,
      nativeAbi: value.nativeAbi,
      foreignDeclarations: value.foreignDeclarations,
      privateFunctions: value.privateFunctions,
    });
  const registerNativeModule = (
    filename: string,
    sourceHash: string,
    functions: Record<string, unknown>,
    compatibility: unknown,
  ): void => {
    if (
      typeof filename !== "string" ||
      !filename ||
      !/^[a-f0-9]{64}$/.test(sourceHash) ||
      functions === null ||
      typeof functions !== "object"
    ) {
      throw new TypeError("invalid Sage.js native-module registration");
    }
    const validated = validatedNativeCompatibility(
      filename,
      compatibility,
      sourceHash,
    );
    if (validated.privateFunctions.some((name) =>
      typeof Reflect.get(functions, name) === "function"
    )) {
      throw staleNativeArtifact(
        filename,
        "private native-function metadata overlaps callable exports",
      );
    }
    nativeModules.set(resolve(filename), {
      sourceHash,
      functions,
      privateFunctions: new Set(validated.privateFunctions),
    });
  };
  const resolveNativeFunction = (
    filename: string,
    name: string,
  ): unknown => {
    if (
      requestedNativeMode === "dynamic" ||
      (requestedNativeMode === "auto" &&
        process.env.SAGEJS_NATIVE_AUTOLOAD === "0") ||
      typeof filename !== "string" ||
      !filename ||
      typeof name !== "string" ||
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
    ) {
      return null;
    }
    const wasmResolver = Reflect.get(
      globalThis,
      "__sagejs_wasm_native_resolver__",
    );
    const logicalSourceKey = nativeLogicalSourceKey(filename);
    if (
      logicalSourceKey !== undefined &&
      wasmResolver !== null &&
      typeof wasmResolver === "object" &&
      typeof Reflect.get(wasmResolver, "resolve") === "function"
    ) {
      const candidate = Reflect.apply(
        Reflect.get(wasmResolver, "resolve"),
        wasmResolver,
        [logicalSourceKey, name],
      );
      if (usableNativeCandidate(candidate)) return candidate;
    }
    if (typeof internalRequire !== "function") return null;
    const sourcePath = nativeSourcePath(filename);
    const sourceHash = nativeSourceHash(sourcePath);
    if (sourceHash === undefined) return null;
    const registered = nativeModules.get(sourcePath);
    if (registered?.sourceHash === sourceHash) {
      const candidate = Reflect.get(registered.functions, name);
      if (usableNativeCandidate(candidate)) return candidate;
      if (registered.privateFunctions.has(name)) return nativePrivateFallback;
    }

    // An explicit cache directory is an override, not an additional search
    // path. This makes hermetic builds/tests possible and prevents a stale or
    // deliberately isolated cache from silently falling through to a sibling
    // artifact next to the source.
    const cacheRoots = process.env.SAGEJS_NATIVE_CACHE_DIR
      ? [process.env.SAGEJS_NATIVE_CACHE_DIR]
      : [
          precompiledNativeKernelCacheDirectory(
            join(__dirname, "..", "native-kernels"),
          ),
          join(dirname(sourcePath), ".sagejs-native-kernels"),
        ];
    for (const cacheRootValue of new Set(cacheRoots)) {
      const cacheRoot = resolve(cacheRootValue);
      let index: any;
      try {
        index = JSON.parse(
          readResourceText(join(cacheRoot, "index.json")),
        );
      } catch (_error) {
        continue;
      }
      const logicalSourceKey = nativeLogicalSourceKey(sourcePath);
      const record = index?.sources?.[sourcePath] ??
        (logicalSourceKey === undefined
          ? undefined
          : index?.logicalSources?.[logicalSourceKey]);
      const pack = index?.schema === "sagejs.native-cache/v4" &&
          Array.isArray(index?.packs)
        ? index.packs.find(
          (candidate: any) => candidate?.packKey === record?.packKey,
        )
        : undefined;
      if (
        ![
          "sagejs.native-cache/v3",
          "sagejs.native-cache/v4",
        ].includes(index?.schema) ||
        record?.sourceHash !== sourceHash ||
        !/^[a-f0-9]{64}$/.test(record?.cacheKey ?? "") ||
        (index?.schema === "sagejs.native-cache/v4" &&
          (index?.complete !== true ||
            !/^[a-f0-9]{64}$/.test(record?.packKey ?? "") ||
            !Array.isArray(pack?.kernels) ||
            !pack.kernels.includes(record.cacheKey)))
      ) {
        continue;
      }
      try {
        const modulePath = join(cacheRoot, record.cacheKey, "index.cjs");
        const loaded = loadPrecompiledNativeKernel(modulePath, sourcePath) as
          Record<string, unknown>;
        const indexCompatibility = validatedNativeCompatibility(
          sourcePath,
          record,
          sourceHash,
        );
        const moduleCompatibility = validatedNativeCompatibility(
          sourcePath,
          loaded,
          sourceHash,
        );
        if (
          nativeCompatibilityKey(indexCompatibility) !==
            nativeCompatibilityKey(moduleCompatibility)
        ) {
          nativeModules.delete(sourcePath);
          throw staleNativeArtifact(
            sourcePath,
            "cache index and generated wrapper metadata differ",
          );
        }
        registerNativeModule(
          sourcePath,
          sourceHash,
          loaded,
          moduleCompatibility,
        );
        const candidate = Reflect.get(loaded, name);
        if (usableNativeCandidate(candidate)) return candidate;
        if (moduleCompatibility.privateFunctions.includes(name)) {
          return nativePrivateFallback;
        }
      } catch (error) {
        // Generated wrappers self-register while `require` evaluates them.
        // Never retain that registration if the cache index or current FFI
        // backend proves the artifact stale afterward.
        nativeModules.delete(sourcePath);
        if (process.env.SAGEJS_NATIVE_REQUIRED === "1") throw error;
      }
    }
    return null;
  };
  Reflect.set(
    globalThis,
    "__sagejs_native_register__",
    registerNativeModule,
  );
  Reflect.set(
    globalThis,
    "__sagejs_native_resolve__",
    resolveNativeFunction,
  );
  const compileProfiledLazyModule = (
    name: string,
    source: string,
    filename: string,
    profile: RuntimeOptimizerProfileSessionOptions & { profiledModules: Set<string> },
  ): (() => void) => {
    if (/^[ \t]*%js(?:[ \t]|$)/m.test(source)) {
      throw new TypeError(
        "optimizer profiling rejects raw `%js` regions because they cannot share " +
          "the private route-observer capability",
      );
    }
    const collector = new CompilerProfileMapCollector(
      source,
      filename,
      basePath,
      "sagejs-python-frontend/v1",
      "python",
    );
    const ast = pythonFrontend.parse(source, {
      filename,
      basedir: dirname(filename),
      libdir: importPath,
      import_dirs: getImportDirs(),
      module_id: name,
      runtime_imports: true,
      jsage: false,
      exact_integer_literals: true,
      strict_python_scopes: true,
      scoped_flags: {
        dict_literals: true,
        overload_getitem: true,
        bound_methods: true,
        sequential_definitions: true,
      },
      precompiled_module_cache_dir: standardLibraryCacheDirectory(
        join(__dirname, "..", "module-cache"),
      ),
    });
    rejectOptimizerProfileRawJavaScript(ast);
    const output = new compiler.OutputStream({
      omit_baselib: true,
      write_name: false,
      private_scope: false,
      beautify: true,
      keep_docstrings: true,
      exact_integers: true,
      rational_division: false,
      python_tuples: true,
      python_truthiness: true,
      python_attributes: true,
      pool_numeric_literals: true,
      numeric_literal_pool_prefix:
        `rho_profile_module_${name.replaceAll(".", "_")}_`,
      module_registry: "ρσ_modules",
      source_map: collector,
      optimizer_profile_observer: profile.observerIdentifier,
    });
    ast.print(output);
    const javascript = output.get();
    const sourceUnitId = collector.sourceIdentity.id;
    const url = `sagejs-profile:///lazy/${encodeURIComponent(name)}` +
      `?source=${encodeURIComponent(sourceUnitId)}&run=${profile.runNonce}`;
    const map = collector.finish(javascript, url);
    // Registration precedes parsing, so Inspector can authenticate the exact
    // scriptId emitted by compileFunction rather than trusting a URL later.
    profile.declare(map, javascript);
    const program = compileFunction(
      javascript,
      [profile.observerIdentifier],
      { filename: url },
    );
    return () => {
      optimizerProfileContaminated = true;
      profile.profiledModules.add(name);
      program(profile.observer);
    };
  };

  const loadModule = (name: string): any => {
    if (!validLazyModuleName(name)) {
      throw new TypeError(`invalid lazy module name ${JSON.stringify(name)}`);
    }
    const registry = Reflect.get(globalThis, "ρσ_modules");
    if (Object.prototype.hasOwnProperty.call(registry, name)) {
      return Reflect.get(registry, name);
    }
    if (activeOptimizerProfile?.sealed) {
      // ``from package.module import attribute`` probes
      // ``package.module.attribute`` when the attribute is absent.  Preserve
      // a missing-child result already established while preparing the
      // authenticated closure; it is not a request to execute new code.
      if (activeOptimizerProfile.unavailableModules.has(name)) {
        const message = `No module named '${name}'`;
        const ImportErrorClass = Reflect.get(globalThis, "ImportError");
        if (typeof ImportErrorClass === "function") {
          throw Reflect.construct(ImportErrorClass, [message]);
        }
        const error = new Error(message);
        error.name = "ImportError";
        throw error;
      }
      activeOptimizerProfile.lateImportAttempt ??= name;
      throw new OptimizerProfileLateImportError(name);
    }

    const separator = name.lastIndexOf(".");
    const parentName = separator < 0 ? "" : name.slice(0, separator);
    const childName = separator < 0 ? "" : name.slice(separator + 1);
    const parent = parentName ? loadModule(parentName) : undefined;
    // Executing a package's __init__.py may import the very child module that
    // caused us to load the package.  Recheck after the parent returns so the
    // child is not executed a second time (which would reset module globals
    // and create distinct class objects).
    if (Object.prototype.hasOwnProperty.call(registry, name)) {
      return Reflect.get(registry, name);
    }
    const modulePath = name.replaceAll(".", "/");
    let source: string | undefined;
    let filename = "";
    let namespaceDirectory = "";
    // Python code is allowed to mutate ``sys.path`` at runtime.  Pytest's
    // default import mode relies on this when it prepends a test directory;
    // consulting only the evaluator's startup paths made an explicitly
    // selected test file collect as an empty module.
    const sysModule = Reflect.get(registry, "sys");
    const dynamicSysPath = sysModule == null
      ? []
      : Reflect.get(sysModule, "path");
    const locations = [...new Set([
      ...(Array.isArray(dynamicSysPath)
        ? dynamicSysPath.map((value) => String(value))
        : []),
      ...additionalImportDirs,
      ...getImportDirs(),
      importPath,
      process.cwd(),
    ])];
    for (const location of locations) {
      for (const candidate of [
        join(location, `${modulePath}.py`),
        join(location, modulePath, "__init__.py"),
      ]) {
        try {
          source = readResourceText(candidate);
          filename = candidate;
          break;
        } catch (_error) {}
      }
      if (source !== undefined) break;
      try {
        const candidate = join(location, modulePath);
        if (statSync(candidate).isDirectory()) namespaceDirectory = candidate;
      } catch (_error) {}
    }
    if (source === undefined && namespaceDirectory) {
      source = "";
      filename = join(namespaceDirectory, "__init__.py");
    }
    if (source === undefined) {
      activeOptimizerProfile?.unavailableModules.add(name);
      const message = `No module named '${name}'`;
      const ImportErrorClass = Reflect.get(globalThis, "ImportError");
      if (typeof ImportErrorClass === "function") {
        throw Reflect.construct(ImportErrorClass, [message]);
      }
      const error = new Error(message);
      error.name = "ImportError";
      throw error;
    }

    const namespace = {};
    moduleNamespaces.add(namespace);
    Reflect.set(registry, name, namespace);
    if (parent && childName) Reflect.set(parent, childName, namespace);
    loading.add(name);
    const initializationTiming = beginInitializationTiming("module", name);
    try {
      // Installed modules are ordinary Python regardless of whether their
      // importer is a Sage worksheet. This also lets both host modes share a
      // single validated package cache instead of silently compiling Python
      // dependencies with Sage's exact-division semantics.
      const moduleMode: RuntimeBootstrapMode = "python";
      const sourceHash = sha1sum(source);
      if (activeOptimizerProfile) {
        const runProfiledModule = compileProfiledLazyModule(
          name,
          source,
          filename,
          activeOptimizerProfile,
        );
        const previousModule = Reflect.get(
          globalThis,
          "__sagejs_current_module_namespace__",
        );
        Reflect.set(globalThis, "__sagejs_current_module_namespace__", namespace);
        try {
          runProfiledModule();
        } finally {
          if (previousModule === undefined) {
            Reflect.deleteProperty(globalThis, "__sagejs_current_module_namespace__");
          } else {
            Reflect.set(
              globalThis,
              "__sagejs_current_module_namespace__",
              previousModule,
            );
          }
        }
      } else {
      const cacheFilename = moduleCacheDirectory
        ? join(
          moduleCacheDirectory,
          "lazy",
          `${name.replaceAll(".", "-")}-${sha1sum(filename).slice(0, 16)}.json`,
        )
        : "";
      const precompiledCacheFilename = join(
        precompiledModuleCacheDirectory,
        `${name.replaceAll(".", "-")}.json`,
      );
      let javascript = "";
      let cachedData: Buffer | undefined;
      let cacheNeedsWrite = false;
      if (cacheFilename) {
        try {
          const cached = JSON.parse(readResourceText(cacheFilename));
          if (
            cached.version === compiler.get_compiler_version() &&
            cached.signature === sourceHash &&
            cached.mode === moduleMode &&
            cached.filename === filename &&
            typeof cached.javascript === "string"
          ) {
            javascript = cached.javascript;
            if (typeof cached.cachedData === "string") {
              cachedData = Buffer.from(cached.cachedData, "base64");
            }
          }
        } catch (_error) {}
      }
      if (!javascript) {
        let precompiledText: string | undefined;
        try {
          precompiledText = readResourceText(precompiledCacheFilename);
        } catch (_error) {}
        if (precompiledText !== undefined) {
          let cached: any;
          try {
            cached = JSON.parse(precompiledText);
          } catch {
            throw new Error(`invalid precompiled lazy module record ${name}`);
          }
          const isPackage = filename.replaceAll("\\", "/").endsWith(
            "/__init__.py",
          );
          if (!validPrecompiledLazyModuleRecord(cached, name)) {
            throw new Error(`invalid precompiled lazy module record ${name}`);
          }
          if (precompiledLazyModuleMatchesSource(
            cached,
            sourceHash,
            compiler.get_compiler_version(),
            moduleMode,
            isPackage,
          )) {
            javascript = cached.javascriptTemplate
              .replaceAll(
                JSON.stringify(PRECOMPILED_MODULE_FILENAME),
                JSON.stringify(filename),
              )
              .replaceAll(
                JSON.stringify(PRECOMPILED_PACKAGE_PATH),
                JSON.stringify(dirname(filename)),
              );
            // Portable build artifacts intentionally omit V8 cached data
            // because their source filename is materialized at load time.
            // Write a local bytecode cache after constructing the script.
            cacheNeedsWrite = true;
          }
        }
      }
      if (!javascript) {
        const ast = pythonFrontend.parse(source, {
          filename,
          basedir: dirname(filename),
          libdir: importPath,
          import_dirs: getImportDirs(),
          module_id: name,
          runtime_imports: true,
          jsage: false,
          exact_integer_literals: true,
          strict_python_scopes: true,
          // Dynamically loaded third-party modules are ordinary Python, not
          // legacy RapydScript.  Give them the same semantic baseline as the
          // main Python frontend before module-local directives are applied.
          scoped_flags: {
            dict_literals: true,
            overload_getitem: true,
            bound_methods: true,
            sequential_definitions: true,
          },
          precompiled_module_cache_dir: standardLibraryCacheDirectory(
            join(__dirname, "..", "module-cache"),
          ),
        });
        const output = new compiler.OutputStream({
          omit_baselib: true,
          write_name: false,
          private_scope: false,
          beautify: true,
          keep_docstrings: true,
          exact_integers: true,
          rational_division: false,
          python_tuples: true,
          python_truthiness: true,
          python_attributes: true,
          pool_numeric_literals: true,
          numeric_literal_pool_prefix:
            `rho_module_${name.replaceAll(".", "_")}_`,
          module_registry: "ρσ_modules",
        });
        ast.print(output);
        javascript = output.get();
        cacheNeedsWrite = true;
      }
      const scriptSource = `(function(){\n${javascript}\n})();`;
      let moduleScript = new Script(scriptSource, {
        filename: `sagejs/lazy-module-${name}.js`,
        cachedData,
      });
      if (moduleScript.cachedDataRejected) {
        cachedData = undefined;
        cacheNeedsWrite = true;
        moduleScript = new Script(scriptSource, {
          filename: `sagejs/lazy-module-${name}.js`,
        });
      }
      if (cacheFilename && (cacheNeedsWrite || !cachedData)) {
        try {
          cachedData = moduleScript.createCachedData();
          mkdirSync(dirname(cacheFilename), { recursive: true });
          atomicWriteCacheFileSync(cacheFilename, JSON.stringify({
            version: compiler.get_compiler_version(),
            signature: sourceHash,
            mode: moduleMode,
            filename,
            javascript,
            cachedData: cachedData.toString("base64"),
          }));
        } catch (_error) {
          // A read-only home or competing cache writer must never make an
          // otherwise importable Python package fail.
        }
      }
      const previousModule = Reflect.get(
        globalThis,
        "__sagejs_current_module_namespace__",
      );
      Reflect.set(globalThis, "__sagejs_current_module_namespace__", namespace);
      try {
        moduleScript.runInThisContext();
      } finally {
        if (previousModule === undefined) {
          Reflect.deleteProperty(globalThis, "__sagejs_current_module_namespace__");
        } else {
          Reflect.set(
            globalThis,
            "__sagejs_current_module_namespace__",
            previousModule,
          );
        }
      }
      }
      loadedLazyModules.add(name);
    } catch (error) {
      Reflect.deleteProperty(registry, name);
      if (parent && childName) Reflect.deleteProperty(parent, childName);
      throw error;
    } finally {
      finishInitializationTiming(initializationTiming);
      loading.delete(name);
    }
    if (!Object.prototype.hasOwnProperty.call(registry, name)) {
      throw new Error(`lazy module ${name} did not register itself`);
    }
    return Reflect.get(registry, name);
  };
  Reflect.set(globalThis, "__sagejs_load_module__", loadModule);
  // Public JavaScript interoperation deliberately uses project-local loaders.
  // The historical global require resolves relative to Sage.js itself and is
  // retained only as an internal compiler/runtime boundary.
  Reflect.set(
    globalThis,
    "__sagejs_javascript_require__",
    requireJavaScriptModule,
  );
  Reflect.set(
    globalThis,
    "__sagejs_javascript_resolve__",
    resolveJavaScriptModule,
  );
  Reflect.set(
    globalThis,
    "__sagejs_javascript_import__",
    importJavaScriptModule,
  );
  Reflect.set(
    globalThis,
    "__sagejs_parse_python__",
    (source: string, options: Record<string, any>) =>
      pythonFrontend.parse(source, options),
  );
  const controller: RuntimeBootstrapController = Object.freeze({
    beginOptimizerProfile(
      options: RuntimeOptimizerProfileSessionOptions,
    ): RuntimeOptimizerProfileSession {
      if (activeOptimizerProfile) {
        throw new Error("an optimizer profile is already active in this evaluator");
      }
      if (optimizerProfileContaminated) {
        throw new Error(
          "this evaluator contains profile-instrumented lazy modules and must be closed",
        );
      }
      if (loadedLazyModules.size !== 0) {
        throw new Error(
          "optimizer profiling requires a fresh evaluator before any lazy module is loaded: " +
            [...loadedLazyModules].sort().join(", "),
        );
      }
      if (!/^\$ρσ\$optimizer_profile_[a-f0-9]{32}$/.test(
        options?.observerIdentifier ?? "",
      ) ||
          typeof options?.observer !== "function" ||
          typeof options?.declare !== "function" ||
          !/^[a-f0-9]{32}$/.test(options?.runNonce ?? "")) {
        throw new TypeError("invalid optimizer profile runtime session");
      }
      const session = {
        ...options,
        profiledModules: new Set<string>(),
        unavailableModules: new Set<string>(),
        sealed: false,
        lateImportAttempt: null as string | null,
      };
      activeOptimizerProfile = session;
      let ended = false;
      const assertActive = (): void => {
        if (ended || activeOptimizerProfile !== session) {
          throw new Error("optimizer profile runtime session is not active");
        }
      };
      return Object.freeze({
        seal(): void {
          assertActive();
          if (session.sealed) {
            throw new Error("optimizer profile runtime session is already sealed");
          }
          session.sealed = true;
        },
        assertNoLateImports(): void {
          assertActive();
          if (session.lateImportAttempt !== null) {
            throw new OptimizerProfileLateImportError(session.lateImportAttempt);
          }
        },
        end(): void {
          assertActive();
          ended = true;
          activeOptimizerProfile = undefined;
        },
      });
    },
    loadedLazyModules(): readonly string[] {
      return Object.freeze([...loadedLazyModules].sort());
    },
    profileContaminated(): boolean {
      return optimizerProfileContaminated;
    },
  });
  return controller;
}
