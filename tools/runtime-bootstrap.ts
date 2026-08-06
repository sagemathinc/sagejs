/**
 * Build and execute the generated Python/Sage base runtime.
 *
 * Release builds include both the generated JavaScript and V8 cached data.
 * V8 safely rejects cached data produced by an incompatible Node release or
 * architecture, then compiles the unchanged source normally.
 */

import { statSync } from "fs";
import { dirname, join } from "path";
import { Script } from "vm";

import type { Compiler } from "./compiler";
import type { PythonCompilerFrontend } from "./python/compiler-frontend";
import {
  readBaselibSource,
  readResourceText,
  readRuntimeBootstrapCachedData,
  readRuntimeBootstrapSource,
  standardLibraryCacheDirectory,
} from "./resources";
import { getImportDirs, importPath, libraryPath } from "./utils";

export type RuntimeBootstrapMode = "sage" | "python";

// A real statement gives the output pipeline a module to which it can attach
// the generated baselib.  This used to be a RapydScript anonymous-function
// extension; the authoritative frontend intentionally accepts Python/Sage.
const BOOTSTRAP_SOURCE = "pass\n";

function cacheDirectory(): string {
  return join(__dirname, "..", "runtime-cache");
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
): void {
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
    const locations = [
      ...additionalImportDirs,
      ...getImportDirs(),
      importPath,
      process.cwd(),
    ];
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
    Reflect.set(registry, name, namespace);
    if (parent && childName) Reflect.set(parent, childName, namespace);
    loading.add(name);
    try {
      const ast = frontend.parse(source, {
        filename,
        basedir: dirname(filename),
        libdir: importPath,
        import_dirs: getImportDirs(),
        module_id: name,
        runtime_imports: true,
        jsage: mode === "sage",
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
        rational_division: mode === "sage",
        python_tuples: true,
        python_truthiness: true,
        python_attributes: true,
        pool_numeric_literals: true,
        numeric_literal_pool_prefix:
          `rho_module_${name.replaceAll(".", "_")}_`,
        module_registry: "ρσ_modules",
      });
      ast.print(output);
      const previousModule = Reflect.get(
        globalThis,
        "__sagejs_current_module_namespace__",
      );
      Reflect.set(globalThis, "__sagejs_current_module_namespace__", namespace);
      try {
        new Script(`(function(){\n${output.get()}\n})();`, {
          filename: `sagejs/lazy-module-${name}.js`,
        }).runInThisContext();
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
  Reflect.set(
    globalThis,
    "__sagejs_parse_python__",
    (source: string, options: Record<string, any>) =>
      pythonFrontend.parse(source, options),
  );
}
