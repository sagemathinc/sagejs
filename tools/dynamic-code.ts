import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import createCompiler, { type Compiler } from "./compiler";
import {
  precompiledDynamicCacheDirectory,
  readResourceText,
} from "./resources";

let compiler: Compiler | undefined;

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
  ast?: any;
  cacheFilename: string;
  filename: string;
  mode: "eval" | "exec" | "single";
  moduleId: string;
  outputs: Record<string, string>;
  source: string;
  sourceHash: string;
  version: string;
}

interface PreparedDynamicCode {
  javascript: string;
  moduleId: string;
}

interface DynamicCodeCache {
  filename: string;
  mode: DynamicCode["mode"];
  outputs: Record<string, string>;
  sourceHash: string;
  version: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function dynamicCacheDirectory(version: string): string {
  if (process.env.SAGEJS_DYNAMIC_CACHE_DIR) {
    return join(process.env.SAGEJS_DYNAMIC_CACHE_DIR, version);
  }
  const base = process.env.XDG_CACHE_HOME || join(homedir(), ".cache");
  return join(base, "sagejs", "dynamic", version);
}

function readDynamicCache(
  cacheFilename: string,
  expected: Omit<DynamicCodeCache, "outputs">,
): Record<string, string> | undefined {
  try {
    const cached = JSON.parse(readResourceText(cacheFilename));
    if (
      cached.version === expected.version &&
      cached.sourceHash === expected.sourceHash &&
      cached.filename === expected.filename &&
      cached.mode === expected.mode &&
      cached.outputs &&
      typeof cached.outputs === "object"
    ) {
      return cached.outputs;
    }
  } catch (_error) {}
  return undefined;
}

function writeDynamicCache(code: DynamicCode): void {
  try {
    mkdirSync(dirname(code.cacheFilename), { recursive: true });
    writeFileSync(code.cacheFilename, JSON.stringify({
      version: code.version,
      sourceHash: code.sourceHash,
      filename: code.filename,
      mode: code.mode,
      outputs: code.outputs,
    } satisfies DynamicCodeCache));
  } catch (_error) {
    // Dynamic execution must still work with a read-only home directory or
    // when another process happens to write the same content-addressed entry.
  }
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
  const version = dynamicCompiler().get_compiler_version();
  const sourceHash = sha256(source);
  const identity = sha256(JSON.stringify({ version, sourceHash, filename, mode }));
  const moduleId = `__dynamic_${identity.slice(0, 24)}__`;
  const cacheFilename = join(dynamicCacheDirectory(version), `${identity}.json`);
  const precompiledCacheFilename = join(
    process.env.SAGEJS_PRECOMPILED_DYNAMIC_CACHE_DIR ??
      precompiledDynamicCacheDirectory(join(__dirname, "..", "dynamic-cache")),
    `${identity}.json`,
  );
  const expected = { version, sourceHash, filename, mode };
  const outputs =
    readDynamicCache(cacheFilename, expected) ??
    readDynamicCache(precompiledCacheFilename, expected);
  if (outputs) {
    return {
      cacheFilename,
      filename,
      mode,
      moduleId,
      outputs,
      source,
      sourceHash,
      version,
    };
  }
  try {
    const ast = parseSource(source, filename, mode, moduleId);
    return {
      ast,
      cacheFilename,
      filename,
      mode,
      moduleId,
      outputs: Object.create(null),
      source,
      sourceHash,
      version,
    };
  } catch (error) {
    throw syntaxError(error);
  }
}

function canSeedName(name: string): boolean {
  return (
    /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) &&
    !pythonKeywords.has(name) &&
    name !== "__name__" &&
    name !== "__file__"
  );
}

function namespaceNames(namespace: Record<string, unknown>): string[] {
  return Object.keys(namespace)
    .filter(canSeedName)
    .sort();
}

function namespacePrelude(names: string[], output: any): string {
  return names
    .map(
      (name) =>
        `var ${output.make_name(name)} = ` +
        `__sagejs_input_namespace__[${JSON.stringify(name)}];`,
    )
    .join("\n");
}

function namespaceSignature(
  names: string[],
  namespace: Record<string, unknown>,
): string {
  const undefinedNames = names.filter((name) => namespace[name] === undefined);
  return sha256(JSON.stringify([names, undefinedNames]));
}

export function runDynamic(
  code: DynamicCode,
  namespace: Record<string, unknown>,
): PreparedDynamicCode {
  const names = namespaceNames(namespace);
  const signature = namespaceSignature(names, namespace);
  const cached = code.outputs[signature];
  if (typeof cached === "string") {
    return { javascript: cached, moduleId: code.moduleId };
  }
  code.ast ??= parseSource(code.source, code.filename, code.mode, code.moduleId);
  const originalAnnotatedLocals = code.ast.annotated_locals;
  let javascript: string;
  try {
    // ``compile()`` has already parsed and lowered the authoritative Python
    // syntax tree.  Names supplied by the execution namespace are ordinary
    // JavaScript lexical bindings around that generated program; manufacturing
    // Python assignments for every name used to make ``exec()`` parse and
    // lower a much larger program for a second time.
    code.ast.annotated_locals = [...(originalAnnotatedLocals ?? [])];
    for (const [name, value] of Object.entries(namespace)) {
      if (
        value === undefined &&
        canSeedName(name) &&
        !code.ast.annotated_locals.includes(name)
      ) {
        code.ast.annotated_locals.push(name);
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
      numeric_literal_pool_prefix: `${code.moduleId}_`,
    });
    code.ast.print(output);
    const prelude = namespacePrelude(names, output);
    javascript = prelude ? `${prelude}\n${output.get()}` : output.get();
    code.outputs[signature] = javascript;
    writeDynamicCache(code);
  } catch (error) {
    throw syntaxError(error);
  } finally {
    code.ast.annotated_locals = originalAnnotatedLocals;
  }

  return { javascript, moduleId: code.moduleId };
}

export default {
  compile: compileDynamic,
  run: runDynamic,
};
