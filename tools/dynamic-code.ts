import { dirname, join } from "node:path";
import createCompiler, { type Compiler } from "./compiler";

let compiler: Compiler | undefined;
let moduleCounter = 0;

function dynamicCompiler(): Compiler {
  compiler ??= createCompiler();
  return compiler;
}

const pythonKeywords = new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "nonlocal",
  "not",
  "or",
  "pass",
  "raise",
  "return",
  "try",
  "while",
  "with",
  "yield",
]);

export interface DynamicCode {
  filename: string;
  mode: "eval" | "exec" | "single";
  source: string;
}

interface PreparedDynamicCode {
  javascript: string;
  moduleId: string;
}

function parserOptions(filename: string, moduleId: string) {
  return {
    filename,
    module_id: moduleId,
    basedir:
      filename.startsWith("<") || !filename
        ? process.cwd()
        : dirname(filename),
    libdir: join(__dirname, "../../src/lib"),
    exact_integer_literals: true,
    strict_python_scopes: true,
    scoped_flags: {
      dict_literals: true,
      overload_getitem: true,
      bound_methods: true,
      sequential_definitions: true,
    },
  };
}

function expressionSource(source: string): string {
  return `__sagejs_eval_result__ = (\n${source}\n)\n`;
}

function statementSource(source: string): string {
  return source.endsWith("\n") ? source : `${source}\n`;
}

function parseSource(
  source: string,
  filename: string,
  mode: DynamicCode["mode"],
  moduleId: string,
) {
  const parse = Reflect.get(globalThis, "__sagejs_parse_python__");
  if (typeof parse !== "function") {
    throw new Error("the authoritative Python frontend is not initialized");
  }
  return Reflect.apply(
    parse,
    undefined,
    [
    mode === "eval" ? expressionSource(source) : statementSource(source),
    parserOptions(filename, moduleId),
    ],
  );
}

function syntaxError(error: unknown): SyntaxError {
  const result =
    error instanceof Error
      ? new SyntaxError(error.message)
      : new SyntaxError(String(error));
  const constructorName =
    typeof error === "object" &&
    error !== null &&
    "constructor" in error &&
    typeof error.constructor === "function"
      ? error.constructor.name
      : "";
  if (
    constructorName === "IndentationError" ||
    result.message.includes("Inconsistent indentation") ||
    result.message.includes("Unexpected indent")
  ) {
    Object.defineProperty(result, "sagejsErrorName", {
      value: "IndentationError",
    });
  }
  return result;
}

export function compileDynamic(
  source: string,
  filename: string,
  mode: DynamicCode["mode"],
): DynamicCode {
  try {
    parseSource(source, filename, mode, "__dynamic_validation__");
  } catch (error) {
    throw syntaxError(error);
  }
  return { filename, mode, source };
}

function canSeedName(name: string): boolean {
  return (
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) &&
    !pythonKeywords.has(name) &&
    name !== "__name__" &&
    name !== "__file__"
  );
}

function seededSource(code: DynamicCode, namespace: Record<string, unknown>) {
  const seed = Object.keys(namespace)
    .filter(canSeedName)
    .map(
      (name) =>
        `${name} = __sagejs_input_namespace__[${JSON.stringify(name)}]`,
    )
    .join("\n");
  const body =
    code.mode === "eval"
      ? expressionSource(code.source)
      : statementSource(code.source);
  return seed ? `${seed}\n${body}` : body;
}

export function runDynamic(
  code: DynamicCode,
  namespace: Record<string, unknown>,
): PreparedDynamicCode {
  const moduleId = `__dynamic_${++moduleCounter}__`;
  let javascript: string;
  try {
    const parse = Reflect.get(globalThis, "__sagejs_parse_python__");
    if (typeof parse !== "function") {
      throw new Error("the authoritative Python frontend is not initialized");
    }
    const ast: any = Reflect.apply(
      parse,
      undefined,
      [
      seededSource(code, namespace),
      parserOptions(code.filename, moduleId),
      ],
    );
    for (const [name, value] of Object.entries(namespace)) {
      if (
        value === undefined &&
        canSeedName(name) &&
        !ast.annotated_locals.includes(name)
      ) {
        ast.annotated_locals.push(name);
      }
    }
    const OutputStream = dynamicCompiler().OutputStream;
    const output = new OutputStream({
      omit_baselib: true,
      private_scope: false,
      write_name: true,
      beautify: true,
      exact_integers: true,
      python_tuples: true,
      python_truthiness: true,
      python_attributes: true,
      pool_numeric_literals: true,
      numeric_literal_pool_prefix: `${moduleId}_`,
    });
    ast.print(output);
    javascript = output.get();
  } catch (error) {
    throw syntaxError(error);
  }

  return { javascript, moduleId };
}

export default {
  compile: compileDynamic,
  run: runDynamic,
};
