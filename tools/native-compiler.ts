import { writeFileSync } from "fs";
import { join, resolve } from "path";

interface NativeFunctionIR {
  name: string;
  analysis?: Record<string, unknown>;
}

interface NativeIR {
  version: number;
  callGraph: Record<string, string[]>;
  functions: NativeFunctionIR[];
  records?: NativeRecordIR[];
}

interface NativeRecordIR {
  name: string;
  layout: string;
  ownership: string;
  fields: Array<{ name: string; type: string }>;
}

interface NativeCompileResult {
  addonPath: string;
  cacheKey: string;
  cached: boolean;
  ir: NativeIR;
  modulePath: string;
  outputPath: string;
  coreSourcePath: string | null;
  coreHeaderPath: string | null;
}

interface NativeExplainResult {
  sourcePath: string;
  eligible: boolean;
  moduleReason?: string;
  error?: string;
  callGraph?: Record<string, string[]>;
  records?: NativeRecordIR[];
  functions: Array<Record<string, unknown> & {
    name: string;
    eligible: boolean;
    reason?: string;
  }>;
}

const nativeCompiler = require(
  join(__dirname, "..", "..", "tools", "native-kernel.cjs"),
) as {
  analyze(options: NativeOptions): Promise<{ sourcePath: string; ir: NativeIR }>;
  audit(options: NativeOptions): Promise<NativeAuditResult>;
  compile(options: NativeOptions): Promise<NativeCompileResult>;
  emitC(options: NativeOptions): Promise<{
    sourcePath: string;
    ir: NativeIR;
    cSource: string;
    cSourceMap: unknown[];
  }>;
  emitCore(options: NativeOptions): Promise<{
    sourcePath: string;
    ir: NativeIR;
    coreSource: string;
    coreHeader: string;
    coreSourceMap: unknown[];
    hostIsolation: Record<string, unknown>;
  }>;
  explain(options: NativeOptions): Promise<NativeExplainResult>;
};

interface NativeOptions {
  sourcePath: string;
  cacheRoot?: string;
  functions?: string[];
}

interface NativeCliArguments {
  files: string[];
  cache_root?: string;
  functions?: string;
  function?: string;
  json?: boolean;
  output?: string;
  stage?: string;
  args?: string;
  warmup?: string;
  repeat?: string;
}

interface NativeAuditResult {
  schemaVersion: number;
  rootPath: string;
  summary: {
    modules: number;
    functions: number;
    eligibleFunctions: number;
    rejectedFunctions: number;
    rejectionCategories: Record<string, number>;
  };
  modules: Array<{
    path: string;
    eligible: boolean;
    functions: Array<{ name: string; eligible: boolean; category?: string }>;
  }>;
}

function options(argv: NativeCliArguments, source: string): NativeOptions {
  const selected = argv.function
    ? [argv.function]
    : argv.functions
      ? argv.functions.split(",").map((name) => name.trim()).filter(Boolean)
      : undefined;
  return {
    sourcePath: resolve(source),
    cacheRoot: argv.cache_root ? resolve(argv.cache_root) : undefined,
    functions: selected,
  };
}

function writeJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function compileJson(result: NativeCompileResult, source: string) {
  return {
    addonPath: result.addonPath,
    cacheKey: result.cacheKey,
    cached: result.cached,
    callGraph: result.ir.callGraph,
    functions: result.ir.functions.map((fn) => fn.name),
    analysis: Object.fromEntries(
      result.ir.functions
        .filter((fn) => fn.analysis !== undefined)
        .map((fn) => [fn.name, fn.analysis]),
    ),
    modulePath: result.modulePath,
    outputPath: result.outputPath,
    coreSourcePath: result.coreSourcePath,
    coreHeaderPath: result.coreHeaderPath,
    sourcePath: resolve(source),
  };
}

function printExplanation(result: NativeExplainResult): void {
  process.stdout.write(`Native Kernel explanation: ${result.sourcePath}\n`);
  if (result.moduleReason) process.stdout.write(`Module: ${result.moduleReason}\n`);
  if (result.error) process.stdout.write(`Rejected: ${result.error}\n`);
  if (result.records && result.records.length > 0) {
    process.stdout.write("Compiler-owned records:\n");
    for (const record of result.records) {
      const fields = record.fields
        .map((field) => `${field.name}: ${field.type}`).join(", ");
      process.stdout.write(
        `  ${record.name}(${fields})\n` +
        `    ${record.layout}; ${record.ownership}\n`,
      );
    }
  }
  for (const fn of result.functions) {
    if (!fn.eligible) {
      process.stdout.write(`\n${fn.name}: rejected\n  ${fn.reason}\n`);
      continue;
    }
    const signature = fn.signature as {
      parameters: Array<{ name: string; type: string }>;
      returnType: string;
    };
    const displayType = (type: string): string =>
      type.startsWith("Record:") ? type.slice(7) : type;
    const parameters = signature.parameters
      .map((param) => `${param.name}: ${displayType(param.type)}`).join(", ");
    process.stdout.write(
      `\n${fn.name}(${parameters}) -> ` +
      `${displayType(signature.returnType)}\n` +
      `  kernel: ${fn.kernelKind}\n` +
      `  source-transparent: ${fn.sourceTransparent ? "yes" : "no"}\n` +
      `  host-isolated core: ` +
      `${(fn.hostIsolation as { eligible: boolean }).eligible ? "yes" : "no"}\n` +
      `  dependencies: ${(fn.dependencies as string[]).join(", ") || "none"}\n`,
    );
    const isolation = fn.hostIsolation as {
      publicCrossingsPerCall: number;
      normalPathHostCallbacks: number;
      dependenciesStayInsideCore: boolean;
    };
    process.stdout.write(
      `  host boundary: ${isolation.publicCrossingsPerCall} public crossing/call; ` +
      `${isolation.normalPathHostCallbacks} callbacks inside core; ` +
      `dependencies ${isolation.dependenciesStayInsideCore
        ? "stay inside core"
        : "may cross the host"}\n`,
    );
    const foreign = (fn.foreignDependencies as string[] | undefined) || [];
    if (foreign.length > 0) {
      process.stdout.write(`  foreign calls: ${foreign.join(", ")}\n`);
    }
    const optimizations = fn.optimizations as Record<string, number>;
    if (Object.keys(optimizations).length > 0) {
      process.stdout.write(
        `  optimizations: ${Object.entries(optimizations)
          .map(([name, count]) => `${name}=${count}`).join(", ")}\n`,
      );
    }
    const ir = fn.ir as { operations: number; generated: number };
    process.stdout.write(
      `  IR operations: ${ir.operations} (${ir.generated} generated)\n`,
    );
    const analysis = fn.analysis as Record<string, unknown>;
    if (Object.keys(analysis).length > 0) {
      process.stdout.write(`  analysis: ${JSON.stringify(analysis)}\n`);
    }
  }
}

function printAudit(result: NativeAuditResult): void {
  process.stdout.write(`Native Kernel audit: ${result.rootPath}\n`);
  process.stdout.write(
    `${result.summary.modules} module(s), ${result.summary.functions} function(s): ` +
    `${result.summary.eligibleFunctions} eligible, ` +
    `${result.summary.rejectedFunctions} rejected\n`,
  );
  for (const module of result.modules) {
    const eligible = module.functions.filter((fn) => fn.eligible).length;
    const rejected = module.functions.length - eligible;
    process.stdout.write(
      `\n${module.path}: ${eligible} eligible, ${rejected} rejected\n`,
    );
    for (const fn of module.functions) {
      process.stdout.write(
        `  ${fn.eligible ? "yes" : "no "} ${fn.name}` +
        `${fn.category ? ` [${fn.category}]` : ""}\n`,
      );
    }
  }
  const categories = Object.entries(result.summary.rejectionCategories);
  if (categories.length > 0) {
    process.stdout.write("\nRejection categories:\n");
    for (const [name, count] of categories) {
      process.stdout.write(`  ${name}: ${count}\n`);
    }
  }
}

function comparable(value: unknown): string {
  return JSON.stringify(value, (_key, current) =>
    typeof current === "bigint" ? { bigint: current.toString() } : current
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function benchmarkImplementations(
  fn: ((...args: unknown[]) => unknown) & Record<string, unknown>,
  args: unknown[],
  warmup: number,
  repeat: number,
) {
  const candidates: Array<[string, (...args: unknown[]) => unknown]> = [
    ["selected", fn],
  ];
  for (const name of ["javascript", "tagged", "gmp"]) {
    if (typeof fn[name] === "function") {
      candidates.push([name, fn[name] as (...args: unknown[]) => unknown]);
    }
  }
  let expected: string | undefined;
  return candidates.map(([name, implementation]) => {
    let answer: unknown;
    for (let index = 0; index < warmup; index += 1) {
      answer = implementation(...args);
    }
    const samples: number[] = [];
    for (let sample = 0; sample < 9; sample += 1) {
      const start = process.hrtime.bigint();
      for (let index = 0; index < repeat; index += 1) {
        answer = implementation(...args);
      }
      const elapsed = process.hrtime.bigint() - start;
      samples.push(Number(elapsed) / repeat);
    }
    const serialized = comparable(answer);
    expected ??= serialized;
    if (serialized !== expected) {
      throw new Error(`${name} returned a different benchmark result`);
    }
    return {
      name,
      medianNanoseconds: median(samples),
      minimumNanoseconds: Math.min(...samples),
      samplesNanoseconds: samples,
      result: serialized,
    };
  });
}

/** Inspect, emit, compile, or benchmark typed native mathematical code. */
export async function runNativeCompilerCli(argv: NativeCliArguments): Promise<void> {
  const [command, source, ...extra] = argv.files;
  if (!command || !source || extra.length !== 0 ||
      !["audit", "explain", "ir", "emit-c", "emit-core-c", "emit-header", "compile", "benchmark"].includes(command)) {
    throw new Error(
      "usage: sagejs native <audit|explain|ir|emit-c|emit-core-c|emit-header|compile|benchmark> SOURCE " +
      "[--function NAME] [--json]",
    );
  }
  const nativeOptions = options(argv, source);
  if (command === "audit") {
    const result = await nativeCompiler.audit(nativeOptions);
    if (argv.output) {
      writeFileSync(resolve(argv.output), `${JSON.stringify(result, null, 2)}\n`);
      process.stdout.write(`${resolve(argv.output)}\n`);
    } else if (argv.json) writeJson(result);
    else printAudit(result);
    return;
  }
  if (command === "explain") {
    const result = await nativeCompiler.explain(nativeOptions);
    if (argv.json) writeJson(result);
    else printExplanation(result);
    return;
  }
  if (command === "ir") {
    if ((argv.stage || "optimized") !== "optimized") {
      throw new Error("the only currently retained IR stage is optimized");
    }
    const result = await nativeCompiler.analyze(nativeOptions);
    if (argv.json) writeJson(result.ir);
    else process.stdout.write(`${JSON.stringify(result.ir, null, 2)}\n`);
    return;
  }
  if (command === "emit-c") {
    const result = await nativeCompiler.emitC(nativeOptions);
    if (argv.json) {
      writeJson({
        sourcePath: result.sourcePath,
        irVersion: result.ir.version,
        sourceMap: result.cSourceMap,
        cSource: result.cSource,
      });
    } else if (argv.output) {
      writeFileSync(resolve(argv.output), result.cSource);
      process.stdout.write(`${resolve(argv.output)}\n`);
    } else {
      process.stdout.write(result.cSource);
    }
    return;
  }
  if (command === "emit-core-c" || command === "emit-header") {
    const result = await nativeCompiler.emitCore(nativeOptions);
    if (argv.json) {
      writeJson({
        sourcePath: result.sourcePath,
        irVersion: result.ir.version,
        sourceMap: result.coreSourceMap,
        hostIsolation: result.hostIsolation,
        coreSource: result.coreSource,
        coreHeader: result.coreHeader,
      });
    } else {
      const emitted = command === "emit-core-c"
        ? result.coreSource
        : result.coreHeader;
      if (argv.output) {
        writeFileSync(resolve(argv.output), emitted);
        process.stdout.write(`${resolve(argv.output)}\n`);
      } else {
        process.stdout.write(emitted);
      }
    }
    return;
  }

  const result = await nativeCompiler.compile(nativeOptions);
  if (command === "compile") {
    if (argv.json) writeJson(compileJson(result, source));
    else {
      const action = result.cached ? "cached" : "built";
      process.stdout.write(
        `${action} ${result.ir.functions.length} native function` +
        `${result.ir.functions.length === 1 ? "" : "s"}\n` +
        `${result.modulePath}\n`,
      );
    }
    return;
  }

  const loaded = require(result.modulePath) as Record<string, unknown>;
  const names = argv.function
    ? [argv.function]
    : result.ir.functions.map((fn) => fn.name);
  if (names.length !== 1) {
    throw new Error("native benchmark requires --function when the module has multiple functions");
  }
  const fn = loaded[names[0]];
  if (typeof fn !== "function") throw new Error(`compiled function ${names[0]} is missing`);
  let args: unknown;
  try {
    args = JSON.parse(argv.args || "[]");
  } catch (error) {
    throw new Error(`--args must be JSON: ${error}`);
  }
  if (!Array.isArray(args)) throw new Error("--args must contain a JSON array");
  const warmup = Number(argv.warmup ?? "10");
  const repeat = Number(argv.repeat ?? "100");
  if (!Number.isInteger(warmup) || warmup < 0 ||
      !Number.isInteger(repeat) || repeat < 1) {
    throw new Error("--warmup and --repeat must be nonnegative/positive integers");
  }
  const benchmarkFunction = fn as unknown as
    ((...values: unknown[]) => unknown) & Record<string, unknown>;
  const backendFor = benchmarkFunction.backendFor;
  const benchmark = {
    sourcePath: resolve(source),
    function: names[0],
    args,
    warmup,
    repeat,
    boundary: {
      publicCrossingsPerCall: 1,
      callbacksInsideCore: 0,
      dependenciesStayInsideCore: true,
      selectedBackend: typeof backendFor === "function"
        ? (backendFor as (...values: unknown[]) => unknown)(...args)
        : benchmarkFunction.nativeAvailable === true
          ? "native"
          : "javascript",
    },
    implementations: benchmarkImplementations(
      benchmarkFunction,
      args,
      warmup,
      repeat,
    ),
  };
  if (argv.json) writeJson(benchmark);
  else {
    process.stdout.write(`${benchmark.function}(${args.map(String).join(", ")})\n`);
    process.stdout.write(
      `  boundary   1 public crossing/call; dependencies stay inside core\n` +
      `  backend    ${String(benchmark.boundary.selectedBackend)}\n`,
    );
    for (const item of benchmark.implementations) {
      process.stdout.write(
        `  ${item.name.padEnd(10)} ${(item.medianNanoseconds / 1e3).toFixed(3)} us/call\n`,
      );
    }
  }
}
