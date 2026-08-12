/**
 * Build and execute the generated Python/Sage base runtime.
 *
 * Release builds include both the generated JavaScript and V8 cached data.
 * V8 safely rejects cached data produced by an incompatible Node release or
 * architecture, then compiles the unchanged source normally.
 */

import { mkdirSync, statSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { Script } from "vm";

import { markModuleCacheInUse } from "./cache-lease";
import type { Compiler } from "./compiler";
import dynamicCode from "./dynamic-code";
import {
  importJavaScriptModule,
  requireJavaScriptModule,
  resolveJavaScriptModule,
} from "./javascript-modules";
import type { PythonCompilerFrontend } from "./python/compiler-frontend";
import {
  loadPrecompiledNativeKernel,
  precompiledLazyModuleCacheDirectory,
  precompiledNativeKernelCacheDirectory,
  readBaselibSource,
  readResourceText,
  readRuntimeBootstrapCachedData,
  readRuntimeBootstrapSource,
  standardLibraryCacheDirectory,
} from "./resources";
import { getImportDirs, importPath, libraryPath, sha1sum } from "./utils";
import {
  beginInitializationTiming,
  finishInitializationTiming,
} from "./timing";

export type RuntimeBootstrapMode = "sage" | "python";

export const PRECOMPILED_MODULE_FILENAME =
  "__sagejs_precompiled_module_filename__";

// This is the runtime half of `NATIVE_ABI_VERSION` in
// `tools/native-kernel/c-backend.cjs`. Production-kernel tests ratchet the two
// values together. Keeping the expected value in the runtime makes an old
// cache fail closed even when its Python source has not changed.
export const NATIVE_KERNEL_ABI_VERSION = 21;

// A real statement gives the output pipeline a module to which it can attach
// the generated baselib.  This used to be a RapydScript anonymous-function
// extension; the authoritative frontend intentionally accepts Python/Sage.
const BOOTSTRAP_SOURCE = "pass\n";

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
): void {
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
    const metadata: Record<PropertyKey, any> = Object.create(null);
    Object.assign(metadata, {
      __name__: "builtins",
      __package__: "",
      __loader__: null,
      __spec__: {
        name: "builtins",
        parent: "",
        origin: "built-in",
        loader: null,
        submodule_search_locations: null,
      },
    });
    const builtins = new Proxy(metadata, {
      get(target, property) {
        if (Reflect.has(target, property)) return Reflect.get(target, property);
        return Reflect.get(globalThis, property);
      },
      has(target, property) {
        return Reflect.has(target, property) || Reflect.has(globalThis, property);
      },
      set(target, property, value) {
        if (Reflect.has(target, property)) return Reflect.set(target, property, value);
        return Reflect.set(globalThis, property, value);
      },
      ownKeys(target) {
        return [...new Set([
          ...Reflect.ownKeys(target),
          ...Reflect.ownKeys(globalThis),
        ])];
      },
      getOwnPropertyDescriptor(target, property) {
        const local = Reflect.getOwnPropertyDescriptor(target, property);
        if (local) return local;
        if (Reflect.has(globalThis, property)) {
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
  const nativeModules = new Map<
    string,
    { sourceHash: string; functions: Record<string, unknown> }
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
  };
  const nativeLogicalSourceKey = (filename: string): string | undefined => {
    const normalized = filename.replaceAll("\\", "/");
    const marker = "/sagejs/kernels/";
    const index = normalized.lastIndexOf(marker);
    return index < 0 ? undefined : normalized.slice(index + 1);
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
    if (
      typeof cacheKey !== "string" || !/^[a-f0-9]{64}$/.test(cacheKey) ||
      sourceHash !== expectedSourceHash ||
      nativeAbi !== NATIVE_KERNEL_ABI_VERSION ||
      !Array.isArray(declarations)
    ) {
      throw staleNativeArtifact(
        filename,
        "source, cache, or native ABI metadata does not match",
      );
    }
    const foreignDeclarations: NativeForeignDeclaration[] = [];
    const seen = new Set<string>();
    for (const declaration of declarations) {
      const id = declaration?.id;
      const declarationIdentity = declaration?.declarationIdentity;
      const dynamicPackage = declaration?.dynamicPackage;
      if (
        typeof id !== "string" || !/^[a-z][a-z0-9_]*$/.test(id) ||
        typeof declarationIdentity !== "string" ||
        !new RegExp(`^${id}@[a-f0-9]{64}$`).test(declarationIdentity) ||
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
      if (manifest?.library !== declarationIdentity) {
        throw staleNativeArtifact(
          filename,
          `FFI declaration ${declarationIdentity} is not provided by ` +
            dynamicPackage,
        );
      }
      foreignDeclarations.push({ id, declarationIdentity, dynamicPackage });
    }
    foreignDeclarations.sort((left, right) => left.id.localeCompare(right.id));
    return { cacheKey, sourceHash, nativeAbi, foreignDeclarations };
  };
  const nativeCompatibilityKey = (value: NativeCompatibility): string =>
    JSON.stringify({
      cacheKey: value.cacheKey,
      sourceHash: value.sourceHash,
      nativeAbi: value.nativeAbi,
      foreignDeclarations: value.foreignDeclarations,
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
    validatedNativeCompatibility(filename, compatibility, sourceHash);
    nativeModules.set(resolve(filename), { sourceHash, functions });
  };
  const resolveNativeFunction = (
    filename: string,
    name: string,
  ): unknown => {
    if (
      requestedNativeMode === "dynamic" ||
      (requestedNativeMode === "auto" &&
        process.env.SAGEJS_NATIVE_AUTOLOAD === "0") ||
      typeof internalRequire !== "function" ||
      typeof filename !== "string" ||
      !filename ||
      typeof name !== "string" ||
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)
    ) {
      return null;
    }
    const sourcePath = resolve(filename);
    const sourceHash = nativeSourceHash(sourcePath);
    if (sourceHash === undefined) return null;
    const registered = nativeModules.get(sourcePath);
    if (registered?.sourceHash === sourceHash) {
      const candidate = Reflect.get(registered.functions, name);
      if (usableNativeCandidate(candidate)) return candidate;
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
      if (
        index?.schema !== "sagejs.native-cache/v3" ||
        record?.sourceHash !== sourceHash ||
        !/^[a-f0-9]{64}$/.test(record?.cacheKey ?? "")
      ) {
        continue;
      }
      try {
        const modulePath = join(cacheRoot, record.cacheKey, "index.cjs");
        const loaded = loadPrecompiledNativeKernel(modulePath) as
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
        const candidate = Reflect.get(loaded, name);
        if (!usableNativeCandidate(candidate)) continue;
        registerNativeModule(
          sourcePath,
          sourceHash,
          loaded,
          moduleCompatibility,
        );
        return candidate;
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
  const loadModule = (name: string): any => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(name)) {
      throw new TypeError(`invalid lazy module name ${JSON.stringify(name)}`);
    }
    const registry = Reflect.get(globalThis, "ρσ_modules");
    if (Object.prototype.hasOwnProperty.call(registry, name)) {
      return Reflect.get(registry, name);
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
    const initializationTiming = beginInitializationTiming(`import ${name}`);
    try {
      // Installed modules are ordinary Python regardless of whether their
      // importer is a Sage worksheet. This also lets both host modes share a
      // single validated package cache instead of silently compiling Python
      // dependencies with Sage's exact-division semantics.
      const moduleMode: RuntimeBootstrapMode = "python";
      const sourceHash = sha1sum(source);
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
        try {
          const cached = JSON.parse(
            readResourceText(precompiledCacheFilename),
          );
          if (
            cached.version === compiler.get_compiler_version() &&
            cached.signature === sourceHash &&
            cached.mode === moduleMode &&
            cached.module === name &&
            typeof cached.javascriptTemplate === "string" &&
            cached.javascriptTemplate.includes(
              JSON.stringify(PRECOMPILED_MODULE_FILENAME),
            )
          ) {
            javascript = cached.javascriptTemplate.replaceAll(
              JSON.stringify(PRECOMPILED_MODULE_FILENAME),
              JSON.stringify(filename),
            );
            // Portable build artifacts intentionally omit V8 cached data
            // because their source filename is materialized at load time.
            // Write a local bytecode cache after constructing the script.
            cacheNeedsWrite = true;
          }
        } catch (_error) {}
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
          writeFileSync(cacheFilename, JSON.stringify({
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
}
