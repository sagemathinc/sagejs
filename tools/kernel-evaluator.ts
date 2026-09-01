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
  explainOptimizationProgram,
  OptimizationProgram,
} from "./python/optimizer";
import {
  formatExecutionTiming,
  installTimingHooks,
  measureExecution,
  parseTimeDirective,
  parseTimeitDirective,
  TimeitOptions,
} from "./timing";

export type SageLanguageMode = "sage" | "python";

export interface SageDisplayData {
  mime: string;
  data: unknown;
}

export type SageOutputEvent =
  | {
      schema: "sagejs.output-event/v1";
      type: "stream";
      parentId?: string;
      name: "stdout" | "stderr";
      text: string;
    }
  | {
      schema: "sagejs.output-event/v1";
      type: "display_data" | "update_display_data";
      parentId?: string;
      data: Record<string, unknown>;
      metadata: Record<string, unknown>;
      displayId?: string;
    }
  | {
      schema: "sagejs.output-event/v1";
      type: "clear_output";
      parentId?: string;
      wait: boolean;
    }
  | {
      schema: "sagejs.output-event/v1";
      type: "error";
      parentId?: string;
      name: string;
      message: string;
      traceback: string[];
    };

export interface SageCommEvent {
  schema: "sagejs.comm-event/v1";
  type: "open" | "message" | "close";
  parentId?: string;
  commId: string;
  targetName?: string;
  targetModule?: string;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  buffers: Uint8Array[];
}

export interface SageCommInfo {
  [commId: string]: { targetName: string };
}

export interface KernelEvaluation {
  repr: string;
  durationMs: number;
  display?: SageDisplayData;
  mimeBundle?: {
    data: Record<string, unknown>;
    metadata: Record<string, unknown>;
  };
  events: SageOutputEvent[];
  commEvents: SageCommEvent[];
  optimization: SageOptimizationReport;
}

export interface SageOptimizationReport {
  schema: "sagejs.optimizer-evaluation/v1";
  authority: "compiler-verified-static";
  filename: string;
  program: OptimizationProgram;
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
      parentId?: string;
    },
  ): KernelEvaluation;
  complete(source: string, cursorPosition: number): KernelCompletion;
  comm(event: SageCommEvent): void;
  commInfo(targetName?: string): SageCommInfo;
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
  onEvent?(event: SageOutputEvent): void;
  onComm?(event: SageCommEvent): void;
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
  const jsmap = Reflect.get(value, "jsmap");
  const keymap = Reflect.get(value, "keymap");
  if (jsmap instanceof Map && keymap instanceof Map) {
    const answer: Record<string, unknown> = {};
    seen.set(value, answer);
    for (const normalizedKey of jsmap.keys()) {
      const key = keymap.get(normalizedKey);
      if (typeof key !== "string") {
        throw new TypeError("display dictionaries require string MIME keys");
      }
      answer[key] = displayTransportValue(jsmap.get(normalizedKey), seen);
    }
    return answer;
  }
  const answer: Record<string, unknown> = {};
  seen.set(value, answer);
  for (const key of Object.keys(value)) {
    answer[key] = displayTransportValue(Reflect.get(value, key), seen);
  }
  return answer;
}

const COMM_MAX_JSON_BYTES = 8 * 1024 * 1024;
const COMM_MAX_DEPTH = 64;
const COMM_MAX_BUFFERS = 64;
const COMM_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
const COMM_MAX_TOTAL_BUFFER_BYTES = 128 * 1024 * 1024;

function validateCommIdentifier(value: unknown, description: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024) {
    throw new TypeError(`${description} must be a nonempty string of at most 1024 characters`);
  }
  return value;
}

function commJsonValue(value: unknown): Record<string, unknown> {
  const converted = displayTransportValue(value);
  if (converted === null || typeof converted !== "object" || Array.isArray(converted)) {
    throw new TypeError("comm data and metadata must be dictionaries");
  }
  const seen = new Set<unknown>();
  const visit = (item: unknown, depth: number): void => {
    if (depth > COMM_MAX_DEPTH) throw new RangeError("comm JSON exceeds maximum nesting depth");
    if (item === null || typeof item === "string" || typeof item === "boolean") return;
    if (typeof item === "number") {
      if (!Number.isFinite(item)) throw new TypeError("comm JSON numbers must be finite");
      return;
    }
    if (typeof item !== "object") throw new TypeError("comm data is not JSON-compatible");
    if (seen.has(item)) throw new TypeError("comm JSON cannot contain cycles");
    seen.add(item);
    for (const child of Array.isArray(item) ? item : Object.values(item)) visit(child, depth + 1);
    seen.delete(item);
  };
  visit(converted, 0);
  const encoded = JSON.stringify(converted);
  if (Buffer.byteLength(encoded, "utf8") > COMM_MAX_JSON_BYTES) {
    throw new RangeError("comm JSON exceeds the 8 MiB message limit");
  }
  return converted as Record<string, unknown>;
}

function commBuffer(value: unknown): Uint8Array {
  let candidate = value;
  if (candidate && typeof candidate === "object") {
    const bytesValues = Reflect.get(candidate, "_bytes_values");
    if (typeof bytesValues === "function") {
      candidate = Reflect.apply(bytesValues, candidate, []);
    } else {
      const values = Reflect.get(candidate, "_values");
      candidate =
        typeof values === "function"
          ? Reflect.apply(values, candidate, [])
          : values === undefined
            ? candidate
            : values;
    }
  }
  let result: Uint8Array;
  if (candidate instanceof Uint8Array) result = candidate.slice();
  else if (candidate instanceof ArrayBuffer) result = new Uint8Array(candidate.slice(0));
  else if (ArrayBuffer.isView(candidate)) {
    result = new Uint8Array(candidate.buffer, candidate.byteOffset, candidate.byteLength).slice();
  } else if (Array.isArray(candidate)) {
    if (candidate.some((item) => !Number.isInteger(item) || item < 0 || item > 255)) {
      throw new TypeError("comm buffers must contain bytes");
    }
    result = Uint8Array.from(candidate);
  } else {
    throw new TypeError("comm buffers must be bytes-like values");
  }
  if (result.byteLength > COMM_MAX_BUFFER_BYTES) {
    throw new RangeError("one comm buffer exceeds the 64 MiB limit");
  }
  return result;
}

function commBuffers(value: unknown): Uint8Array[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new TypeError("comm buffers must be a list");
  if (value.length > COMM_MAX_BUFFERS) throw new RangeError("comm message exceeds 64 buffers");
  const result = value.map(commBuffer);
  const total = result.reduce((sum, buffer) => sum + buffer.byteLength, 0);
  if (total > COMM_MAX_TOTAL_BUFFER_BYTES) {
    throw new RangeError("comm buffers exceed the 128 MiB aggregate limit");
  }
  return result;
}

function displayBundle(value: unknown): {
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
} {
  const data: Record<string, unknown> = {};
  const metadata: Record<string, unknown> = {};
  if (value !== null && (typeof value === "object" || typeof value === "function")) {
    const mimeBundle = Reflect.get(value, "_repr_mimebundle_");
    if (typeof mimeBundle === "function") {
      const bundleResult = Reflect.apply(mimeBundle, value, []);
      const converted = displayTransportValue(bundleResult);
      if (Array.isArray(converted) && converted.length === 2) {
        Object.assign(data, converted[0]);
        Object.assign(metadata, converted[1]);
      } else if (converted && typeof converted === "object") {
        Object.assign(data, converted);
      }
    }
  }
  if (!("text/plain" in data)) {
    data["text/plain"] = String(global.ρσ_repr(value));
  }
  const rich = richDisplay(value);
  if (rich) data[rich.mime] = rich.data;
  return { data, metadata };
}

function richDisplay(value: unknown): SageDisplayData | undefined {
  if (
    value === null ||
    (typeof value !== "object" && typeof value !== "function")
  ) {
    return undefined;
  }
  const method = Reflect.get(value, "_rich_repr_");
  if (typeof method !== "function") {
    const latex = Reflect.get(value, "_latex_");
    if (typeof latex !== "function") return undefined;
    return {
      mime: "text/latex",
      data: `$\\displaystyle ${String(Reflect.apply(latex, value, []))}$`,
    };
  }
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
  onEvent = () => undefined,
  onComm = () => undefined,
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
  let optimizationReport: SageOptimizationReport | undefined;
  let activeParentId: string | undefined;
  let activeEvents: SageOutputEvent[] | undefined;
  let activeCommEvents: SageCommEvent[] | undefined;
  let nextDisplayId = 0;
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
      intrinsic_modules: toplevel?.intrinsic_modules,
      scoped_flags: transient ? { ...scopedFlags } : scopedFlags,
      jsage: language === "sage",
      exact_integer_literals: true,
      strict_python_scopes: true,
      reuse_main_module: true,
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
      write_name: true,
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
      reuse_main_module: true,
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
  const emitEvent = (event: SageOutputEvent) => {
    activeEvents?.push(event);
    onEvent(event);
  };
  const emitComm = (event: SageCommEvent) => {
    activeCommEvents?.push(event);
    onComm(event);
  };
  const writeOutput = (text: unknown) => {
    const value = String(text);
    onOutput(value);
    emitEvent({
      schema: "sagejs.output-event/v1",
      type: "stream",
      parentId: activeParentId,
      name: "stdout",
      text: value,
    });
  };
  global.__sagejs_output_write__ = writeOutput;
  global.__sagejs_format_display__ = (value: unknown) => displayBundle(value);
  global.__sagejs_display_publish__ = (
    value: unknown,
    requestedDisplayId?: unknown,
    update = false,
  ) => {
    let displayId: string | undefined;
    if (requestedDisplayId === true) {
      displayId = `display-${String(++nextDisplayId).padStart(6, "0")}`;
    } else if (typeof requestedDisplayId === "string" && requestedDisplayId) {
      displayId = requestedDisplayId;
    }
    const formatted = displayBundle(value);
    emitEvent({
      schema: "sagejs.output-event/v1",
      type: update ? "update_display_data" : "display_data",
      parentId: activeParentId,
      data: formatted.data,
      metadata: formatted.metadata,
      displayId,
    });
    return displayId;
  };
  global.__sagejs_clear_output__ = (wait = false) => {
    emitEvent({
      schema: "sagejs.output-event/v1",
      type: "clear_output",
      parentId: activeParentId,
      wait: Boolean(wait),
    });
  };
  global.__sagejs_get_parent__ = () =>
    activeParentId ? { header: { msg_id: activeParentId } } : {};
  global.__sagejs_set_parent__ = (parent: unknown) => {
    const header = parent && typeof parent === "object"
      ? Reflect.get(parent, "header")
      : undefined;
    const msgId = header && typeof header === "object"
      ? Reflect.get(header, "msg_id")
      : undefined;
    activeParentId = typeof msgId === "string" ? msgId : activeParentId;
  };
  global.__sagejs_showtraceback__ = (error: unknown) => {
    const name = String(Reflect.get(Object(error), "name") ?? "Error");
    const message = String(Reflect.get(Object(error), "message") ?? error);
    const stack = Reflect.get(Object(error), "stack");
    emitEvent({
      schema: "sagejs.output-event/v1",
      type: "error",
      parentId: activeParentId,
      name,
      message,
      traceback: typeof stack === "string" ? stack.split("\n") : [`${name}: ${message}`],
    });
  };
  global.__sagejs_comm_publish__ = (
    type: unknown,
    commId: unknown,
    targetName: unknown,
    targetModule: unknown,
    data: unknown,
    metadata: unknown,
    buffers: unknown,
  ) => {
    if (type !== "open" && type !== "message" && type !== "close") {
      throw new TypeError(`unknown Sage.js comm event type ${JSON.stringify(type)}`);
    }
    const event: SageCommEvent = {
      schema: "sagejs.comm-event/v1",
      type,
      parentId: activeParentId,
      commId: validateCommIdentifier(commId, "comm id"),
      data: commJsonValue(data ?? {}),
      metadata: commJsonValue(metadata ?? {}),
      buffers: commBuffers(buffers),
    };
    if (type === "open") {
      event.targetName = validateCommIdentifier(targetName, "comm target name");
      if (typeof targetModule === "string" && targetModule) {
        event.targetModule = validateCommIdentifier(targetModule, "comm target module");
      }
    }
    emitComm(event);
  };
  global.__sagejs_interrupt_state__ = interruptState;
  const uninstallTimingHooks = installTimingHooks(
    globalThis,
    (text) => writeOutput(`${text}\n`),
  );
  runRuntimeBootstrap(
    compiler,
    mode,
    compilerFrontends.get(mode)!,
    compilerFrontends.get("python")!,
  );
  Reflect.set(
    globalThis,
    "__sagejs_parse_sage__",
    (source: string, options: Record<string, any>) =>
      compilerFrontends.get("sage")!.parse(source, options),
  );
  global.__sagejs_kernel_modules__ = global.ρσ_modules;
  runInThisContext('var __name__ = "__main__"; show_js = false;');

  function compile(
    source: string,
    filename: string,
    language: SageLanguageMode,
    timeitOptions?: TimeitOptions,
  ): string {
    const classes = toplevel?.classes;
    toplevel = compilerFrontends.get(language)!.parse(
      source,
      parserOptions(filename, false, language),
    );
    optimizationReport = {
      schema: "sagejs.optimizer-evaluation/v1",
      authority: "compiler-verified-static",
      filename,
      program: explainOptimizationProgram(toplevel.optimization_ir),
    };
    if (timeitOptions) {
      const statements = toplevel.body;
      const body = statements.length === 1
        ? statements[0]
        : new compiler.AST_BlockStatement({
          start: statements[0]?.start ?? toplevel.start,
          end: statements.at(-1)?.end ?? toplevel.end,
          body: statements,
        });
      const statement = new compiler.AST_TimedStatement({
        start: body.start,
        end: body.end,
        body,
      });
      statement.timeit_number = timeitOptions.number ?? null;
      statement.timeit_repeat = timeitOptions.repeat ?? 7;
      toplevel.body = [statement];
    }
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
        parentId,
      }: {
        filename?: string;
        language?: SageLanguageMode;
        suppressResult?: boolean;
        parentId?: string;
      } = {},
    ): KernelEvaluation {
      const previousParentId = activeParentId;
      activeParentId = parentId;
      activeEvents = [];
      activeCommEvents = [];
      const timeit = parseTimeitDirective(source);
      if (timeit) source = timeit.source;
      const timing = parseTimeDirective(source, language === "sage");
      if (timing) source = timing.source;
      let javascript: string;
      try {
        javascript = compile(source, filename, language, timeit?.options);
      } catch (error) {
        activeParentId = previousParentId;
        activeEvents = undefined;
        activeCommEvents = undefined;
        throw error;
      }
      let execution;
      try {
        execution = measureExecution(() => {
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
      } catch (error) {
        activeParentId = previousParentId;
        activeEvents = undefined;
        activeCommEvents = undefined;
        throw error;
      }
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
      const mimeBundle =
        publishResult &&
        (typeof value === "object" || typeof value === "function") &&
        value !== null &&
        typeof Reflect.get(value, "_repr_mimebundle_") === "function"
          ? displayBundle(value)
          : undefined;
      if (publishResult) global._ = value;
      const durationMs = execution.timing.wallMs;
      if (timing) {
        writeOutput(
          `${formatExecutionTiming(execution.timing, {
            breakdown: timing.breakdown,
          })}\n`,
        );
      }
      const events = activeEvents;
      const commEvents = activeCommEvents;
      activeEvents = undefined;
      activeCommEvents = undefined;
      activeParentId = previousParentId;
      return {
        repr,
        durationMs,
        display,
        mimeBundle,
        events: events ?? [],
        commEvents: commEvents ?? [],
        optimization: optimizationReport!,
      };
    },
    comm(event: SageCommEvent): void {
      if (event.schema !== "sagejs.comm-event/v1") {
        throw new TypeError("unsupported Sage.js comm schema");
      }
      const dispatch = Reflect.get(globalThis, "__sagejs_comm_dispatch_python__");
      if (typeof dispatch !== "function") {
        throw new Error("no Sage.js comm backend is active; import IPython or ipywidgets first");
      }
      const normalized: SageCommEvent = {
        schema: "sagejs.comm-event/v1",
        type: event.type,
        parentId: event.parentId,
        commId: validateCommIdentifier(event.commId, "comm id"),
        data: commJsonValue(event.data ?? {}),
        metadata: commJsonValue(event.metadata ?? {}),
        buffers: commBuffers(event.buffers),
      };
      if (event.type === "open") {
        normalized.targetName = validateCommIdentifier(event.targetName, "comm target name");
        if (event.targetModule) normalized.targetModule = validateCommIdentifier(event.targetModule, "comm target module");
      }
      const previousParentId = activeParentId;
      activeParentId = event.parentId;
      try {
        Reflect.apply(dispatch, undefined, [normalized]);
      } finally {
        activeParentId = previousParentId;
      }
    },
    commInfo(targetName?: string): SageCommInfo {
      const info = Reflect.get(globalThis, "__sagejs_comm_info_python__");
      if (typeof info !== "function") return {};
      const value = Reflect.apply(info, undefined, [targetName]);
      return commJsonValue(value) as SageCommInfo;
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
        const timeit = parseTimeitDirective(source);
        if (timeit) source = timeit.source;
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
      Reflect.deleteProperty(globalThis, "__sagejs_parse_sage__");
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
