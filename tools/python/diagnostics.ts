/** Host-neutral, JSON-safe diagnostics. Never derive Python frames from JS stacks. */
export type DiagnosticPhase = "parse" | "compile" | "import" | "execute" | "host";

export interface DiagnosticPosition {
  /** One-based line/column; columns and zero-based offsets use UTF-16 code units. */
  line: number;
  column: number;
  offset: number | null;
}

export interface PythonDiagnostic {
  schemaVersion: 1;
  category: "python.syntax" | "python.import" | "python.interrupt" | "python.runtime" | "host.error";
  exceptionType: string;
  message: string;
  phase: DiagnosticPhase;
  filename: string | null;
  span: { start: DiagnosticPosition; end: DiagnosticPosition | null } | null;
  frames: never[];
  cause: PythonDiagnostic | null;
  context: PythonDiagnostic | null;
  suppressContext: boolean;
  chainTruncated: boolean;
  hostStack?: string;
}

export interface DiagnosticOptions {
  phase: DiagnosticPhase;
  /** Explicit Python-execution boundary, not a guess based on the error name. */
  pythonExecution?: boolean;
  /** Root source filename, supplied by the frontend when not stored on the error. */
  filename?: string;
  /** Leading first-line directive characters removed before compilation. */
  sourceOffset?: number;
  includeHostStack?: boolean;
}

// Trust only envelopes created at our evaluation boundary, not an arbitrary
// user-assigned `error.pythonDiagnostic` property (which need not be cloneable).
const attachedDiagnostics = new WeakMap<object, PythonDiagnostic>();

function freezeDiagnostic(value: PythonDiagnostic): PythonDiagnostic {
  if (value.span) {
    Object.freeze(value.span.start);
    if (value.span.end) Object.freeze(value.span.end);
    Object.freeze(value.span);
  }
  Object.freeze(value.frames);
  if (value.cause) freezeDiagnostic(value.cause);
  if (value.context) freezeDiagnostic(value.context);
  return Object.freeze(value);
}

function get(value: unknown, key: string): unknown {
  try {
    return value != null ? (value as Record<string, unknown>)[key] : undefined;
  } catch {
    return undefined;
  }
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function integer(value: unknown, minimum: number): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum
    ? value : null;
}

function position(value: unknown): DiagnosticPosition | null {
  const line = integer(get(value, "line"), 1);
  const column = integer(get(value, "column"), 1);
  return line === null || column === null ? null : {
    line, column, offset: integer(get(value, "offset"), 0),
  };
}

function errorMessage(value: unknown): string {
  const message = string(get(value, "message"));
  if (message !== undefined) return message;
  try { return String(value); } catch { return "Unprintable thrown value"; }
}

/**
 * Creates a new envelope; leaves PythonSyntaxError.diagnostic untouched.
 * Cause/context traversal has both a depth limit and a total-node budget.
 * Context remains available even when suppressed; renderers must honor the flag.
 */
export function normalizePythonDiagnostic(
  error: unknown,
  options: DiagnosticOptions,
): PythonDiagnostic {
  const ancestors = new Set<unknown>();
  let remaining = 32;
  function visit(value: unknown, depth: number): PythonDiagnostic {
    remaining--;
    const constructor = get(value, "constructor");
    const name = string(get(value, "name"));
    const constructorName = typeof value === "object" && value !== null
      ? string(get(constructor, "__name__")) || string(get(constructor, "name")) : undefined;
    // Python compiler subclasses can inherit Error.prototype.name unchanged.
    let exceptionType = (name && name !== "Error" ? name : undefined) ||
      (constructorName && constructorName !== "Object" ? constructorName : undefined) || name || "Error";
    if (options.pythonExecution) exceptionType = string(get(value, "sagejsErrorName")) || exceptionType;
    const parserError = exceptionType === "PythonSyntaxError";
    if (parserError) exceptionType = "SyntaxError";
    const interrupted = get(value, "code") === "ERR_SCRIPT_EXECUTION_INTERRUPTED";
    if (interrupted) exceptionType = "KeyboardInterrupt";
    if (options.pythonExecution && exceptionType === "ReferenceError") exceptionType = "NameError";
    const category: PythonDiagnostic["category"] = interrupted || exceptionType === "KeyboardInterrupt"
      ? "python.interrupt"
      : parserError || ((options.phase === "parse" || options.phase === "compile") &&
          ["SyntaxError", "IndentationError", "TabError"].includes(exceptionType))
      ? "python.syntax"
      : options.phase === "import" || ((options.phase === "compile" || options.pythonExecution) &&
          ["ImportError", "ModuleNotFoundError"].includes(exceptionType))
      ? "python.import"
      : options.pythonExecution ? "python.runtime" : "host.error";
    const filename = string(get(value, "filename")) || string(get(value, "fileName")) ||
      (depth === 0 ? options.filename : undefined) || null;
    let span: PythonDiagnostic["span"] = null;
    if (parserError) {
      const sourceSpan = get(get(value, "diagnostic"), "span");
      const start = position(get(sourceSpan, "start"));
      if (start) span = { start, end: position(get(sourceSpan, "end")) };
    } else if (options.phase === "parse" || options.phase === "compile" || options.phase === "import") {
      // Legacy compiler SyntaxError/ImportError use zero-based columns.
      const line = integer(get(value, "line"), 1);
      const column = integer(get(value, "col"), 0);
      if (line !== null && column !== null) span = {
        start: { line, column: column + 1, offset: integer(get(value, "pos"), 0) }, end: null,
      };
    }
    let message = interrupted ? "Sage.js evaluation interrupted" : errorMessage(value);
    const sourceOffset = integer(options.sourceOffset, 0) ?? 0;
    if (depth === 0 && span && sourceOffset && filename === options.filename) {
      const originalStart = span.start;
      const rebase = (point: DiagnosticPosition): DiagnosticPosition => ({
        line: point.line,
        column: point.column + (point.line === 1 ? sourceOffset : 0),
        offset: point.offset === null ? null : point.offset + sourceOffset,
      });
      span = { start: rebase(span.start), end: span.end ? rebase(span.end) : null };
      const prefix = `${filename}:${originalStart.line}:${originalStart.column}:`;
      if (parserError && message.startsWith(prefix)) {
        message = `${filename}:${span.start.line}:${span.start.column}:` + message.slice(prefix.length);
      }
    }
    const result: PythonDiagnostic = {
      schemaVersion: 1, category, exceptionType,
      message,
      phase: options.phase, filename, span, frames: [], cause: null, context: null,
      suppressContext: get(value, "__suppress_context__") === true, chainTruncated: false,
    };
    if (options.includeHostStack) {
      const stack = string(get(value, "stack"));
      if (stack !== undefined) result.hostStack = stack;
    }
    ancestors.add(value);
    for (const key of ["cause", "context"] as const) {
      const pythonValue = get(value, key === "cause" ? "__cause__" : "__context__");
      const child = pythonValue === undefined && key === "cause" ? get(value, "cause") : pythonValue;
      if (child === undefined || child === null) continue;
      if (depth >= 7 || remaining <= 0 || ancestors.has(child)) result.chainTruncated = true;
      else result[key] = visit(child, depth + 1);
    }
    ancestors.delete(value);
    return result;
  }
  return visit(error, 0);
}

/** Preserve the original exception and parser diagnostic whenever it is extensible. */
export function attachPythonDiagnostic(error: unknown, options: DiagnosticOptions): unknown {
  const pythonDiagnostic = freezeDiagnostic(normalizePythonDiagnostic(error, options));
  if ((typeof error === "object" && error !== null) || typeof error === "function") {
    try {
      Object.defineProperty(error, "pythonDiagnostic", {
        value: pythonDiagnostic, configurable: true, enumerable: true,
      });
      attachedDiagnostics.set(error, pythonDiagnostic);
      return error;
    } catch {
      // Frozen host exceptions still need a transportable error envelope.
    }
  }
  const wrapped = new Error(pythonDiagnostic.message);
  wrapped.name = pythonDiagnostic.exceptionType;
  attachedDiagnostics.set(wrapped, pythonDiagnostic);
  return Object.assign(wrapped, { pythonDiagnostic });
}

/** Worker-safe legacy Error fields plus the trusted diagnostic envelope. */
export function serializeDiagnosticError(error: unknown) {
  const attached = (typeof error === "object" && error !== null) || typeof error === "function"
    ? attachedDiagnostics.get(error) : undefined;
  const pythonDiagnostic = attached ?? normalizePythonDiagnostic(error, { phase: "host" });
  return {
    name: pythonDiagnostic.exceptionType === "KeyboardInterrupt"
      ? "KeyboardInterrupt" : string(get(error, "name")) ?? pythonDiagnostic.exceptionType,
    message: pythonDiagnostic.message,
    stack: string(get(error, "stack")),
    pythonDiagnostic,
  };
}
