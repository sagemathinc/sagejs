/**
 * Build and execute the generated Python/Sage base runtime.
 *
 * Release builds include both the generated JavaScript and V8 cached data.
 * V8 safely rejects cached data produced by an incompatible Node release or
 * architecture, then compiles the unchanged source normally.
 */

import { mkdirSync, statSync, writeFileSync } from "fs";
import { homedir } from "os";
import { dirname, join } from "path";
import { Script } from "vm";

import type { Compiler } from "./compiler";
import dynamicCode from "./dynamic-code";
import {
  importJavaScriptModule,
  requireJavaScriptModule,
  resolveJavaScriptModule,
} from "./javascript-modules";
import type { PythonCompilerFrontend } from "./python/compiler-frontend";
import {
  precompiledLazyModuleCacheDirectory,
  readBaselibSource,
  readResourceText,
  readRuntimeBootstrapCachedData,
  readRuntimeBootstrapSource,
  standardLibraryCacheDirectory,
} from "./resources";
import { getImportDirs, importPath, libraryPath, sha1sum } from "./utils";

export type RuntimeBootstrapMode = "sage" | "python";

export const PRECOMPILED_MODULE_FILENAME =
  "__sagejs_precompiled_module_filename__";

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
  for (const value of Object.values(moduleRegistry)) {
    if (
      (typeof value === "object" && value !== null) ||
      typeof value === "function"
    ) {
      moduleNamespaces.add(value);
    }
  }
  Reflect.set(globalThis, "__sagejs_module_namespaces__", moduleNamespaces);
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
