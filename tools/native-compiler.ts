import { join, resolve } from "path";

interface NativeCompileResult {
  addonPath: string;
  cacheKey: string;
  cached: boolean;
  ir: {
    callGraph: Record<string, string[]>;
    functions: Array<{ name: string }>;
  };
  modulePath: string;
}

// The source-tree CLI is loaded from dist/tools, while the public compiler is
// intentionally shipped at tools/native-kernel.cjs beside its CJS backends.
// Resolve that public entry point explicitly so copied backend files do not
// mistake dist/ for the package root.
const nativeCompiler = require(
  join(__dirname, "..", "..", "tools", "native-kernel.cjs"),
) as {
  compile(options: {
    sourcePath: string;
    cacheRoot?: string;
    functions?: string[];
  }): Promise<NativeCompileResult>;
};

interface NativeCliArguments {
  files: string[];
  cache_root?: string;
  functions?: string;
  json?: boolean;
}

/** Compile decorated functions in an ordinary Python/Sage source module. */
export async function runNativeCompilerCli(
  argv: NativeCliArguments,
): Promise<void> {
  const [command, source, ...extra] = argv.files;
  if (command !== "compile" || !source || extra.length !== 0) {
    throw new Error(
      "usage: sagejs native compile SOURCE [--cache-root DIRECTORY] [--json]",
    );
  }
  const result = await nativeCompiler.compile({
    sourcePath: resolve(source),
    cacheRoot: argv.cache_root ? resolve(argv.cache_root) : undefined,
    functions: argv.functions
      ? argv.functions.split(",").map((name) => name.trim()).filter(Boolean)
      : undefined,
  });
  if (argv.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          addonPath: result.addonPath,
          cacheKey: result.cacheKey,
          cached: result.cached,
          callGraph: result.ir.callGraph,
          functions: result.ir.functions.map((fn) => fn.name),
          modulePath: result.modulePath,
          sourcePath: resolve(source),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  const action = result.cached ? "cached" : "built";
  process.stdout.write(
    `${action} ${result.ir.functions.length} native function` +
      `${result.ir.functions.length === 1 ? "" : "s"}\n` +
      `${result.modulePath}\n`,
  );
}
