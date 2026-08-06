/**
 * Build and execute the generated Python/Sage base runtime.
 *
 * Release builds include both the generated JavaScript and V8 cached data.
 * V8 safely rejects cached data produced by an incompatible Node release or
 * architecture, then compiles the unchanged source normally.
 */

import { join } from "path";
import { Script } from "vm";

import type { Compiler } from "./compiler";
import type { PythonCompilerFrontend } from "./python/compiler-frontend";
import {
  readBaselibSource,
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

  const loading = new Set<string>();
  Reflect.set(globalThis, "__sagejs_load_module__", (name: string) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      throw new TypeError(`invalid lazy module name ${JSON.stringify(name)}`);
    }
    const registry = Reflect.get(globalThis, "ρσ_modules");
    if (Object.prototype.hasOwnProperty.call(registry, name)) {
      return Reflect.get(registry, name);
    }
    if (loading.has(name)) {
      throw new Error(`recursive lazy module load for ${name}`);
    }
    loading.add(name);
    try {
      const ast = frontend.parse(`import ${name}\n`, {
        filename: `<lazy-module:${name}>`,
        basedir: process.cwd(),
        libdir: importPath,
        import_dirs: getImportDirs(),
        jsage: mode === "sage",
        exact_integer_literals: true,
        strict_python_scopes: true,
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
        module_registry: "ρσ_modules",
      });
      ast.print(output);
      new Script(output.get(), {
        filename: `sagejs/lazy-module-${name}.js`,
      }).runInThisContext();
    } finally {
      loading.delete(name);
    }
    if (!Object.prototype.hasOwnProperty.call(registry, name)) {
      throw new Error(`lazy module ${name} did not register itself`);
    }
    return Reflect.get(registry, name);
  });
  Reflect.set(
    globalThis,
    "__sagejs_parse_python__",
    (source: string, options: Record<string, any>) =>
      pythonFrontend.parse(source, options),
  );
}
