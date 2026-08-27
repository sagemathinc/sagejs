import { dirname, extname, join, resolve } from "path";
import { readFile } from "fs/promises";
import createCompiler from "./compiler";
import { getImportDirs } from "./utils";
import { createPythonCompilerFrontend } from "./python/compiler-frontend";
import {
  explainOptimizationProgram,
  formatOptimizationExplanation,
  OptimizationProgram,
  verifyOptimizationProgram,
} from "./python/optimizer";
import { standardLibraryCacheDirectory } from "./resources";

interface OptimizerCliArguments {
  files: string[];
  json?: boolean;
  function?: string;
  sage?: boolean;
  python?: boolean;
  import_path?: string;
  stdin_filename?: string;
  optimization_level?: string;
  optimization_disable?: string;
  optimization_require?: string;
}

interface OptimizerCliPaths {
  srcPath: string;
  compilerPath: string;
}

async function readStandardInput(): Promise<string> {
  const chunks: string[] = [];
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) chunks.push(String(chunk));
  return chunks.join("");
}

function filteredProgram(
  program: OptimizationProgram,
  functionName: string,
): OptimizationProgram {
  if (!functionName) return program;
  const contracts = program.contracts.filter(
    (contract) => contract.functionName === functionName,
  );
  if (contracts.length === 0) {
    throw new Error(
      `no import-proven @optimize contract was found for function ${JSON.stringify(functionName)}`,
    );
  }
  if (contracts.length > 1) {
    throw new Error(
      `function filter ${JSON.stringify(functionName)} is ambiguous; use distinct top-level names`,
    );
  }
  const functionId = contracts[0].id;
  return {
    ...program,
    contracts,
    regions: program.regions.filter((region) => region.functionId === functionId),
  };
}

function actionAndFilename(files: readonly string[]): {
  action: "explain" | "check";
  filename?: string;
} {
  const [rawAction, filename, ...extra] = files;
  if (rawAction !== "explain" && rawAction !== "check") {
    throw new Error("usage: sagejs optimize <explain|check> [input.py]");
  }
  if (extra.length > 0) {
    throw new Error("sagejs optimize accepts at most one input file");
  }
  return { action: rawAction, filename };
}

/** Inspect optimizer decisions without executing untrusted input source. */
export async function runOptimizerCli(
  argv: OptimizerCliArguments,
  paths: OptimizerCliPaths,
): Promise<void> {
  const { action, filename } = actionAndFilename(argv.files);
  const logicalFilename = filename
    ? resolve(filename)
    : (argv.stdin_filename || "<stdin>");
  const source = filename
    ? await readFile(logicalFilename, "utf8")
    : await readStandardInput();
  const sageMode = argv.sage === true ||
    (argv.python !== true && extname(logicalFilename).toLowerCase() === ".sage");
  const compiler = createCompiler();
  const frontend = await createPythonCompilerFrontend(
    compiler,
    sageMode ? "sage" : "python",
  );
  try {
    const topLevel = frontend.parse(source, {
      filename: logicalFilename,
      basedir: logicalFilename === "<stdin>" ? undefined : dirname(logicalFilename),
      libdir: join(paths.srcPath, "lib"),
      import_dirs: getImportDirs(argv.import_path || ""),
      module_cache_dir: "",
      precompiled_module_cache_dir: standardLibraryCacheDirectory(
        join(dirname(paths.compilerPath), "module-cache"),
      ),
      jsage: sageMode,
      exact_integer_literals: true,
      strict_python_scopes: true,
      runtime_imports: false,
      scoped_flags: {
        dict_literals: true,
        overload_getitem: true,
        bound_methods: true,
        sequential_definitions: true,
      },
      optimization_level: argv.optimization_level || undefined,
      optimization_disable: argv.optimization_disable || undefined,
      optimization_require: argv.optimization_require || undefined,
      optimization_explain: true,
    });
    const program = filteredProgram(
      topLevel.optimization_ir,
      argv.function || "",
    );
    verifyOptimizationProgram(program);
    if (action === "check") {
      const selected = program.regions.filter((region) => region.selected).length;
      if (argv.json) {
        process.stdout.write(`${JSON.stringify({
          ok: true,
          schema: program.schema,
          level: program.level,
          contracts: program.contracts.length,
          selectedRegions: selected,
        }, null, 2)}\n`);
      } else {
        process.stdout.write(
          `optimizer check passed: ${program.contracts.length} contract(s), ` +
            `${selected} selected region(s)\n`,
        );
      }
      return;
    }
    if (argv.json) {
      process.stdout.write(
        `${JSON.stringify(explainOptimizationProgram(program), null, 2)}\n`,
      );
    } else {
      process.stdout.write(formatOptimizationExplanation(program));
    }
  } finally {
    frontend.close();
  }
}
