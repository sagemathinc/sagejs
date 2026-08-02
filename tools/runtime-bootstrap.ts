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
import {
  readBaselibSource,
  readRuntimeBootstrapCachedData,
  readRuntimeBootstrapSource,
} from "./resources";
import { libraryPath } from "./utils";

export type RuntimeBootstrapMode = "sage" | "python";

const BOOTSTRAP_SOURCE = "(def ():\n yield 1\n)";

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
): string {
  const ast = compiler.parse(BOOTSTRAP_SOURCE, {
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
): void {
  const directory = cacheDirectory();
  const source =
    readRuntimeBootstrapSource(
      mode,
      join(directory, `runtime-bootstrap-${mode}.js`),
    ) ??
    generateRuntimeBootstrapSource(compiler, mode);
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
}
