import { dirname, join } from "path";
import { runInThisContext } from "vm";

import createCompiler from "./compiler";
import {
  readBaselibSource,
  runtimeRequire,
  standardLibraryCacheDirectory,
} from "./resources";
import { getImportDirs, importPath, libraryPath } from "./utils";
import { installNodeGraphicsSaveHook } from "./graphics-export";

export type SageLanguageMode = "sage" | "python";

export interface SageDisplayData {
  mime: string;
  data: unknown;
}

export interface KernelEvaluation {
  repr: string;
  durationMs: number;
  display?: SageDisplayData;
}

export interface KernelEvaluator {
  evaluate(source: string, options?: { filename?: string }): KernelEvaluation;
  close(): void;
}

interface EvaluatorOptions {
  mode: SageLanguageMode;
  onOutput(text: string): void;
}

function richDisplay(value: unknown): SageDisplayData | undefined {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return undefined;
  }
  const method = Reflect.get(value, "_rich_repr_");
  if (typeof method !== "function") return undefined;
  const display = Reflect.apply(method, value, []);
  if (
    display === null ||
    typeof display !== "object" ||
    typeof Reflect.get(display, "mime") !== "string" ||
    !Reflect.has(display, "data")
  ) {
    throw new TypeError("_rich_repr_() must return { mime, data }");
  }
  return {
    mime: Reflect.get(display, "mime"),
    data: Reflect.get(display, "data"),
  };
}

/**
 * Create an evaluator inside an already isolated JavaScript realm.
 *
 * This deliberately returns only structured data. Runtime-owned mathematical
 * objects must not escape the worker which owns their native handles.
 */
export function createKernelEvaluator({
  mode,
  onOutput,
}: EvaluatorOptions): KernelEvaluator {
  const compiler = createCompiler();
  const precompiledModuleCacheDir = standardLibraryCacheDirectory(
    join(__dirname, "..", "module-cache"),
  );
  const sage = mode === "sage";
  let toplevel;
  let numericLiteralPoolCounter = 0;

  function outputJavaScript(ast, includeBaselib = false): string {
    const output = new compiler.OutputStream({
      omit_baselib: !includeBaselib,
      write_name: false,
      private_scope: false,
      beautify: true,
      keep_docstrings: true,
      exact_integers: true,
      rational_division: sage,
      python_tuples: true,
      python_truthiness: true,
      python_attributes: true,
      pool_numeric_literals: true,
      numeric_literal_pool_prefix:
        `ρσ_kernel_${numericLiteralPoolCounter++}_`,
      module_registry: includeBaselib
        ? ""
        : "__sagejs_kernel_modules__",
      baselib_plain: includeBaselib
        ? readBaselibSource(join(libraryPath, "baselib-plain-pretty.js"))
        : undefined,
    });
    ast.print(output);
    return output.get();
  }

  // These hooks are consulted dynamically by the generated baselib.
  global.require = runtimeRequire as NodeJS.Require;
  installNodeGraphicsSaveHook();
  global.__sagejs_output_write__ = (text: unknown) => {
    onOutput(String(text));
  };
  global.__sagejs_sage_mode__ = sage;

  const initialization = compiler.parse("", {
    filename: "<kernel-init>",
    basedir: process.cwd(),
  });
  runInThisContext(outputJavaScript(initialization, true));
  global.__sagejs_kernel_modules__ = global.ρσ_modules;
  delete global.__sagejs_sage_mode__;
  runInThisContext('var __name__ = "__embedded__"; show_js = false;');

  function compile(source: string, filename: string): string {
    const classes = toplevel?.classes;
    const scopedFlags = toplevel?.scoped_flags ?? {
      dict_literals: true,
      overload_getitem: true,
      bound_methods: true,
      sequential_definitions: true,
    };
    toplevel = compiler.parse(source, {
      filename,
      basedir: filename.startsWith("<") ? process.cwd() : dirname(filename),
      libdir: importPath,
      import_dirs: getImportDirs(),
      classes,
      scoped_flags: scopedFlags,
      jsage: sage,
      exact_integer_literals: true,
      strict_python_scopes: true,
      precompiled_module_cache_dir: precompiledModuleCacheDir,
    });
    const javascript = outputJavaScript(toplevel);

    if (classes) {
      const exported = new Set(toplevel.exports);
      for (const name of Object.getOwnPropertyNames(classes)) {
        if (!exported.has(name) && !toplevel.classes[name]) {
          toplevel.classes[name] = classes[name];
        }
      }
    }
    return javascript;
  }

  return {
    evaluate(
      source: string,
      { filename = "<embedded>" }: { filename?: string } = {},
    ): KernelEvaluation {
      const started = performance.now();
      const value = runInThisContext(compile(source, filename), {
        filename,
      });
      const repr =
        value === undefined ? "" : String(global.ρσ_repr(value));
      return {
        repr,
        durationMs: performance.now() - started,
        display: richDisplay(value),
      };
    },

    close(): void {
      delete global.__sagejs_output_write__;
      delete global.__sagejs_graphics_save_hook__;
      delete global.__sagejs_kernel_modules__;
    },
  };
}
