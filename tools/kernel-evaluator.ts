import { dirname, join } from "path";
import { runInThisContext } from "vm";

import createCompiler from "./compiler";
import {
  readResourceBytes,
  runtimeRequire,
  standardLibraryCacheDirectory,
} from "./resources";
import { getImportDirs, importPath } from "./utils";
import { runRuntimeBootstrap } from "./runtime-bootstrap";
import { installNodeGraphicsSaveHook } from "./graphics-export";
import { installNodeHost } from "./host";
import {
  DocumentationCatalog,
  documentationCatalogFromRegistry,
} from "./documentation";
import {
  createPythonCompilerFrontend,
  PythonCompilerFrontend,
} from "./python/compiler-frontend";
import { PYTHON_KEYWORDS } from "./python/contract";
import {
  formatExecutionTiming,
  installTimingHooks,
  measureExecution,
} from "./timing";

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

export interface KernelCompletion {
  matches: string[];
  cursorStart: number;
  cursorEnd: number;
}

export interface KernelInspection {
  found: boolean;
  text: string;
}

export interface KernelCompleteness {
  status: "complete" | "incomplete" | "invalid";
  indent?: string;
}

export interface KernelEvaluator {
  evaluate(
    source: string,
    options?: {
      filename?: string;
      language?: SageLanguageMode;
      suppressResult?: boolean;
    },
  ): KernelEvaluation;
  complete(source: string, cursorPosition: number): KernelCompletion;
  inspect(source: string, cursorPosition: number): KernelInspection;
  isComplete(
    source: string,
    language?: SageLanguageMode,
  ): KernelCompleteness;
  documentation(): DocumentationCatalog;
  close(): void;
}

interface EvaluatorOptions {
  mode: SageLanguageMode;
  onOutput(text: string): void;
  interruptState?: Int32Array;
  compiler?: any;
  compilerFrontends?: Map<SageLanguageMode, PythonCompilerFrontend>;
}

function displayTransportValue(
  value: unknown,
  seen = new WeakMap<object, unknown>(),
): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Reflect.get(value, "__sagejs_float__") === true) {
    return Number(value);
  }
  const previous = seen.get(value);
  if (previous !== undefined) return previous;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  if (Array.isArray(value)) {
    const answer: unknown[] = [];
    seen.set(value, answer);
    for (const item of value) answer.push(displayTransportValue(item, seen));
    return answer;
  }
  const answer: Record<string, unknown> = {};
  seen.set(value, answer);
  for (const key of Object.keys(value)) {
    answer[key] = displayTransportValue(Reflect.get(value, key), seen);
  }
  return answer;
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
    data: displayTransportValue(Reflect.get(display, "data")),
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
  interruptState,
  compiler: suppliedCompiler,
  compilerFrontends,
}: EvaluatorOptions): KernelEvaluator {
  const compiler = suppliedCompiler ?? createCompiler();
  if (!compilerFrontends?.has("python") || !compilerFrontends.has("sage")) {
    throw new TypeError(
      "createKernelEvaluator requires initialized Python and Sage frontends; " +
        "use createKernelEvaluatorAsync()",
    );
  }
  const precompiledModuleCacheDir = standardLibraryCacheDirectory(
    join(__dirname, "..", "module-cache"),
  );
  let toplevel;
  let finalStatementIsAssignment = false;
  let sourceEndsWithSemicolon = false;
  let numericLiteralPoolCounter = 0;
  const scopedFlagsByLanguage = new Map<
    SageLanguageMode,
    Record<string, boolean>
  >();

  function parserOptions(
    filename: string,
    transient = false,
    language: SageLanguageMode = mode,
  ) {
    const classes = toplevel?.classes;
    const scopedFlags = scopedFlagsByLanguage.get(language) ?? {
      dict_literals: true,
      overload_getitem: true,
      bound_methods: true,
      sequential_definitions: true,
    };
    return {
      filename,
      basedir: filename.startsWith("<") ? process.cwd() : dirname(filename),
      libdir: importPath,
      import_dirs: getImportDirs(),
      classes: transient && classes ? { ...classes } : classes,
      scoped_flags: transient ? { ...scopedFlags } : scopedFlags,
      jsage: language === "sage",
      exact_integer_literals: true,
      strict_python_scopes: true,
      runtime_imports: true,
      precompiled_module_cache_dir: precompiledModuleCacheDir,
    };
  }

  function outputJavaScript(
    ast,
    language: SageLanguageMode = mode,
  ): string {
    const output = new compiler.OutputStream({
      omit_baselib: true,
      write_name: false,
      private_scope: false,
      beautify: true,
      keep_docstrings: true,
      exact_integers: true,
      rational_division: language === "sage",
      python_tuples: true,
      python_truthiness: true,
      python_attributes: true,
      pool_numeric_literals: true,
      numeric_literal_pool_prefix:
        `ρσ_kernel_${numericLiteralPoolCounter++}_`,
      module_registry: "__sagejs_kernel_modules__",
    });
    ast.print(output);
    return output.get();
  }

  // These hooks are consulted dynamically by the generated baselib.
  global.require = runtimeRequire as NodeJS.Require;
  global.__sagejs_graph_database_bytes__ = () =>
    readResourceBytes(join(importPath, "sage", "graphs", "data", "graphs.db"));
  installNodeGraphicsSaveHook();
  const uninstallNodeHost = installNodeHost(globalThis, mode);
  global.__sagejs_output_write__ = (text: unknown) => {
    onOutput(String(text));
  };
  global.__sagejs_interrupt_state__ = interruptState;
  const uninstallTimingHooks = installTimingHooks(
    globalThis,
    (text) => onOutput(`${text}\n`),
  );
  runRuntimeBootstrap(
    compiler,
    mode,
    compilerFrontends.get(mode)!,
    compilerFrontends.get("python")!,
  );
  global.__sagejs_kernel_modules__ = global.ρσ_modules;
  runInThisContext('var __name__ = "__embedded__"; show_js = false;');

  function compile(
    source: string,
    filename: string,
    language: SageLanguageMode,
  ): string {
    const classes = toplevel?.classes;
    toplevel = compilerFrontends.get(language)!.parse(
      source,
      parserOptions(filename, false, language),
    );
    const finalStatement = toplevel.body[toplevel.body.length - 1];
    finalStatementIsAssignment =
      finalStatement instanceof compiler.AST_SimpleStatement &&
      finalStatement.body instanceof compiler.AST_Assign;
    sourceEndsWithSemicolon = source.trimEnd().endsWith(";");
    scopedFlagsByLanguage.set(language, { ...toplevel.scoped_flags });
    const javascript = outputJavaScript(toplevel, language);

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

  function evaluateTransient(source: string): unknown {
    const ast = compilerFrontends.get(mode)!.parse(
      source,
      parserOptions("<kernel-introspection>", true),
    );
    return runInThisContext(outputJavaScript(ast), {
      filename: "<kernel-introspection>",
    });
  }

  function codePointPrefix(source: string, cursorPosition: number): string {
    return Array.from(source).slice(0, cursorPosition).join("");
  }

  function completionContext(
    source: string,
    cursorPosition: number,
  ): {
    expression?: string;
    prefix: string;
    cursorStart: number;
    cursorEnd: number;
  } {
    const before = codePointPrefix(source, cursorPosition);
    const prefix = before.match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0] ?? "";
    const prefixStart = before.length - prefix.length;
    const dot = prefixStart - 1;
    if (dot < 0 || before[dot] !== ".") {
      return {
        prefix,
        cursorStart: cursorPosition - Array.from(prefix).length,
        cursorEnd: cursorPosition,
      };
    }

    let start = dot;
    let nesting = 0;
    for (let index = dot - 1; index >= 0; index -= 1) {
      const character = before[index];
      if (character === "'" || character === '"') {
        const quote = character;
        index -= 1;
        while (
          index >= 0 &&
          (before[index] !== quote || before[index - 1] === "\\")
        ) {
          index -= 1;
        }
        start = index;
        continue;
      }
      if (")]}".includes(character)) {
        nesting += 1;
      } else if ("([{".includes(character)) {
        if (nesting === 0) break;
        nesting -= 1;
      } else if (
        nesting === 0 &&
        (/\s/.test(character) || "=,:;+-*/%<>!&|^".includes(character))
      ) {
        break;
      }
      start = index;
    }
    const expression = before.slice(start, dot).trim();
    return {
      expression: expression || undefined,
      prefix,
      cursorStart: cursorPosition - Array.from(prefix).length,
      cursorEnd: cursorPosition,
    };
  }

  function uniqueSortedStrings(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((item) => typeof item === "string"))].sort();
  }

  function inspectableExpression(
    source: string,
    cursorPosition: number,
  ): string | undefined {
    const before = codePointPrefix(source, cursorPosition);
    return before.match(
      /([A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*)$/,
    )?.[1];
  }

  function inspectionText(value: unknown, expression: string): string {
    const lines: string[] = [];
    const constructor =
      value === null || value === undefined
        ? undefined
        : Reflect.get(Object(value), "constructor");
    const rawName =
      typeof value === "function"
        ? Reflect.get(value, "__name__") ?? value.name
        : constructor?.__name__ ?? constructor?.name;
    const name =
      typeof rawName === "string" ? rawName.replace(/^ρσ_/, "") : "";
    const callable = typeof value === "function";
    const argumentNames = callable ? Reflect.get(value, "__argnames__") : null;
    if (callable && Array.isArray(argumentNames)) {
      lines.push(`${expression}(${argumentNames.join(", ")})`);
    } else if (name) {
      lines.push(`${expression}: ${name}`);
    } else {
      lines.push(expression);
    }
    const doc =
      value === null || value === undefined
        ? undefined
        : Reflect.get(Object(value), "__doc__");
    if (typeof doc === "string" && doc.trim()) {
      lines.push("", doc.trim());
    } else if (!callable) {
      lines.push("", String(global.ρσ_repr(value)));
    }
    return lines.join("\n");
  }

  return {
    evaluate(
      source: string,
      {
        filename = "<embedded>",
        language = mode,
        suppressResult = false,
      }: {
        filename?: string;
        language?: SageLanguageMode;
        suppressResult?: boolean;
      } = {},
    ): KernelEvaluation {
      let timed = false;
      const timingMatch =
        source.match(/^[ \t]*%time[ \t]+/) ??
        (language === "sage"
          ? source.match(/^[ \t]*time[ \t]+/)
          : null);
      if (timingMatch) {
        timed = true;
        source = source.slice(timingMatch[0].length);
      }
      const javascript = compile(source, filename, language);
      const execution = measureExecution(() => {
        if (interruptState) Atomics.store(interruptState, 1, 1);
        try {
          global.ρσ_check_interrupt();
          return runInThisContext(javascript, {
            filename,
            breakOnSigint: true,
          });
        } finally {
          if (interruptState) Atomics.store(interruptState, 1, 0);
        }
      });
      const value = execution.value;
      const publishResult =
        !suppressResult &&
        !finalStatementIsAssignment &&
        !sourceEndsWithSemicolon &&
        value !== undefined &&
        value !== null;
      const repr =
        !publishResult
          ? ""
          : String(global.ρσ_repr(value));
      const display = publishResult ? richDisplay(value) : undefined;
      if (publishResult) global._ = value;
      const durationMs = execution.timing.wallMs;
      if (timed) onOutput(`${formatExecutionTiming(execution.timing)}\n`);
      return {
        repr,
        durationMs,
        display,
      };
    },

    complete(source: string, cursorPosition: number): KernelCompletion {
      const context = completionContext(source, cursorPosition);
      let names: string[];
      try {
        names = context.expression
          ? uniqueSortedStrings(
              evaluateTransient(`dir(${context.expression})`),
            )
          : uniqueSortedStrings(global.ρσ_dir(globalThis)).concat(
              PYTHON_KEYWORDS,
            );
      } catch (_error) {
        names = [];
      }
      return {
        matches: [...new Set(names)]
          .filter(
            (name) =>
              name.startsWith(context.prefix) &&
              !name.startsWith("ρσ_") &&
              !name.startsWith("__sagejs_"),
          )
          .sort(),
        cursorStart: context.cursorStart,
        cursorEnd: context.cursorEnd,
      };
    },

    inspect(source: string, cursorPosition: number): KernelInspection {
      const expression = inspectableExpression(source, cursorPosition);
      if (!expression) return { found: false, text: "" };
      try {
        const value = evaluateTransient(expression);
        return {
          found: true,
          text: inspectionText(value, expression),
        };
      } catch (_error) {
        return { found: false, text: "" };
      }
    },

    isComplete(
      source: string,
      language: SageLanguageMode = mode,
    ): KernelCompleteness {
      if (!source.trim()) return { status: "complete" };
      try {
        compilerFrontends.get(language)!.parse(
          source,
          parserOptions("<kernel-is-complete>", true, language),
        );
        return { status: "complete" };
      } catch (error) {
        const value = error as {
          is_eof?: boolean;
          line?: number;
          col?: number;
        };
        if (value.is_eof) {
          const finalLine = source.split("\n").at(-1) ?? "";
          const leading = finalLine.match(/^\s*/)?.[0] ?? "";
          return {
            status: "incomplete",
            indent: finalLine.trimEnd().endsWith(":")
              ? `${leading}    `
              : leading,
          };
        }
        return { status: "invalid" };
      }
    },

    documentation(): DocumentationCatalog {
      return documentationCatalogFromRegistry(
        Reflect.get(globalThis, "__sagejs_doc_registry__"),
      );
    },

    close(): void {
      for (const frontend of compilerFrontends.values()) {
        frontend.close();
      }
      uninstallTimingHooks();
      uninstallNodeHost();
      delete global.__sagejs_output_write__;
      delete global.__sagejs_interrupt_state__;
      delete global.__sagejs_graphics_save_hook__;
      delete global.__sagejs_graph_database_bytes__;
      delete global.__sagejs_kernel_modules__;
      Reflect.deleteProperty(globalThis, "__sagejs_parse_python__");
    },
  };
}

/** Create the user-facing evaluator with both authoritative grammars loaded. */
export async function createKernelEvaluatorAsync(
  options: Omit<EvaluatorOptions, "compiler" | "compilerFrontends">,
): Promise<KernelEvaluator> {
  const compiler = createCompiler();
  const [python, sage] = await Promise.all([
    createPythonCompilerFrontend(compiler, "python"),
    createPythonCompilerFrontend(compiler, "sage"),
  ]);
  return createKernelEvaluator({
    ...options,
    compiler,
    compilerFrontends: new Map([
      ["python", python],
      ["sage", sage],
    ]),
  });
}
