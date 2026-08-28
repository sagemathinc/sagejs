/*
 * Entry point for Node.js single-executable builds.
 *
 * Keep this intentionally smaller than bin/sagejs: a distributed runtime does
 * not need the compiler bootstrap, lint, msgfmt, or repository test commands.
 */

import Compile from "./compile";
import { runDocumentationCli } from "./docs";
import { createKernelEvaluatorAsync } from "./kernel-evaluator";
import { installCliOutputHandler } from "./process-output";
import { runPytestCli } from "./pytest";
import Repl from "./repl";
import { importPath, libraryPath } from "./utils";
import { basename, dirname, extname } from "path";
import { runStdioKernel } from "./stdio-kernel";
import { SAGEJS_VERSION_INFO } from "./version-info";

const executable = basename(process.argv[1]);
const executableStem = basename(executable, extname(executable)).toLowerCase();

installCliOutputHandler();

interface SeaArguments {
  files: string[];
  import_path: string;
  mode:
    | "compile"
    | "docs"
    | "repl"
    | "jupyter-install"
    | "jupyter-uninstall"
    | "jupyter-kernel"
    | "jupyter-self-test"
    | "embedded-kernel"
    | "pytest";
  execute: boolean;
  sage: boolean;
  magma: boolean;
  macaulay2: boolean;
  m2: boolean;
  maple: boolean;
  matlab: boolean;
  wolfram: boolean;
  mathematica: boolean;
  emit_sage: boolean;
  no_js: boolean;
  tokens: boolean;
  optimization_level?: string;
  optimization_disable?: string;
  optimization_require?: string;
  explain_optimizations?: boolean;
  json?: boolean;
  jsonl?: boolean;
  markdown?: boolean;
  regex?: boolean;
  ignore_case?: boolean;
  case_sensitive?: boolean;
  kind?: string;
  backend?: string;
  tag?: string;
  jupyter_args?: string[];
  pytest_args?: string[];
}

function usage(): void {
  console.log(`Usage: ${executable} [options] [program.py]

Run Sage.js from a self-contained executable. With no program, start a REPL.

  ${executable} docs <search|show|export|coverage> [query]
  ${executable} pytest [pytest options] [paths]
  ${executable} --install-jupyter-kernel [--jupyter-kernel-mode sage|python]
  ${executable} --uninstall-jupyter-kernel [--jupyter-kernel-mode sage|python]

Options:
  --python        use Python syntax and division
  --sage          use mathematics-friendly Sage syntax
  --magma         use the experimental Magma language frontend
  --macaulay2     use the experimental Macaulay2 frontend (--m2 alias)
  --maple         use the experimental Maple language frontend
  --matlab        use the experimental MATLAB language frontend
  --wolfram       use the experimental Wolfram Language frontend
  --mathematica   alias for --wolfram
  --emit-sage     print Sage source generated from foreign-language input
  --install-jupyter-kernel
                  install a user kernelspec without requiring Jupyter/Python
  --uninstall-jupyter-kernel
                  remove this executable's user kernelspec
  --no-js         hide generated JavaScript in the REPL (default)
  --tokens        display parser tokens
  --optimization-level O0|O1|O2|O3|Os
                  select the mathematical optimizer policy
  --optimization-disable IDS
                  disable comma-separated stable pass IDs
  --optimization-require IDS
                  require comma-separated pass or region IDs
  --explain-optimizations
                  print deterministic optimizer decisions
  -h, --help      show this help
  -V, --version   show the Sage.js version`);
}

function parseArguments(): SeaArguments {
  const args: SeaArguments = {
    files: [],
    import_path: "",
    mode: "repl",
    execute: false,
    sage: executableStem !== "sagepython",
    magma: false,
    macaulay2: false,
    m2: false,
    maple: false,
    matlab: false,
    wolfram: false,
    mathematica: false,
    emit_sage: false,
    no_js: true,
    tokens: false,
  };
  const rawArguments = process.argv.slice(2);
  if (rawArguments.includes("--embedded-kernel")) {
    const allowed = new Set(["--embedded-kernel", "--python", "--sage"]);
    const unexpected = rawArguments.find((argument) => !allowed.has(argument));
    if (unexpected !== undefined) {
      throw new Error(
        `unknown embedded-kernel option ${JSON.stringify(unexpected)}`,
      );
    }
    args.mode = "embedded-kernel";
    args.sage = !rawArguments.includes("--python");
    return args;
  }
  if (rawArguments.includes("--jupyter-kernel-self-test")) {
    if (rawArguments.length !== 1) {
      throw new Error("--jupyter-kernel-self-test takes no other arguments");
    }
    args.mode = "jupyter-self-test";
    return args;
  }
  if (rawArguments.includes("--jupyter-kernel")) {
    args.mode = "jupyter-kernel";
    args.jupyter_args = rawArguments.filter(
      (argument) => argument !== "--jupyter-kernel",
    );
    return args;
  }
  const installJupyter = rawArguments.includes("--install-jupyter-kernel");
  const uninstallJupyter = rawArguments.includes("--uninstall-jupyter-kernel");
  if (installJupyter || uninstallJupyter) {
    if (installJupyter && uninstallJupyter) {
      throw new Error("choose install or uninstall, not both");
    }
    args.mode = installJupyter ? "jupyter-install" : "jupyter-uninstall";
    const jupyterArguments: string[] = [];
    for (let index = 0; index < rawArguments.length; index += 1) {
      const argument = rawArguments[index];
      if (
        argument === "--install-jupyter-kernel" ||
        argument === "--uninstall-jupyter-kernel"
      ) continue;
      if (argument === "--jupyter-kernel-mode") {
        const value = rawArguments[++index];
        if (value === undefined) {
          throw new Error("--jupyter-kernel-mode requires sage or python");
        }
        jupyterArguments.push("--mode", value);
      } else if (argument.startsWith("--jupyter-kernel-mode=")) {
        jupyterArguments.push(
          "--mode",
          argument.slice("--jupyter-kernel-mode=".length),
        );
      } else if (argument === "--prefix") {
        const value = rawArguments[++index];
        if (value === undefined) throw new Error("--prefix requires a value");
        jupyterArguments.push(argument, value);
      } else if (argument === "--user" || argument === "--sys-prefix") {
        jupyterArguments.push(argument);
      } else {
        throw new Error(
          `unknown Jupyter installer option ${JSON.stringify(argument)}`,
        );
      }
    }
    args.jupyter_args = jupyterArguments;
    return args;
  }
  if (rawArguments[0] === "docs") {
    args.mode = "docs";
    const documentationArguments = rawArguments.slice(1);
    for (let index = 0; index < documentationArguments.length; index += 1) {
      const argument = documentationArguments[index];
      if (argument === "--json") args.json = true;
      else if (argument === "--jsonl") args.jsonl = true;
      else if (argument === "--markdown") args.markdown = true;
      else if (argument === "--regex" || argument === "-e") args.regex = true;
      else if (argument === "--ignore-case" || argument === "-i") {
        args.ignore_case = true;
      } else if (argument === "--case-sensitive" || argument === "-s") {
        args.case_sensitive = true;
      } else if (
        argument === "--kind" ||
        argument === "--backend" ||
        argument === "--tag"
      ) {
        const value = documentationArguments[++index];
        if (value === undefined) {
          throw new Error(`${argument} requires a value`);
        }
        args[argument.slice(2) as "kind" | "backend" | "tag"] = value;
      } else if (/^--(?:kind|backend|tag)=/.test(argument)) {
        const separator = argument.indexOf("=");
        const name = argument.slice(2, separator) as
          | "kind"
          | "backend"
          | "tag";
        args[name] = argument.slice(separator + 1);
      } else if (argument === "--help" || argument === "-h") {
        console.log(
          `Usage: ${executable} docs ` +
            "<search|show|export|coverage> [options] [query]\n\n" +
            "Options: --json --jsonl --markdown --regex/-e " +
            "--ignore-case/-i --case-sensitive/-s " +
            "--kind VALUE --backend VALUE --tag VALUE",
        );
        process.exit(0);
      } else if (argument.startsWith("-")) {
        throw new Error(`unknown docs option ${JSON.stringify(argument)}`);
      } else {
        args.files.push(argument);
      }
    }
    return args;
  }
  if (rawArguments[0] === "pytest") {
    args.mode = "pytest";
    args.pytest_args = rawArguments.slice(1);
    return args;
  }
  let optionsEnded = false;
  for (let argumentIndex = 0; argumentIndex < rawArguments.length; argumentIndex += 1) {
    const argument = rawArguments[argumentIndex];
    if (!optionsEnded && argument === "--") {
      optionsEnded = true;
    } else if (!optionsEnded && argument === "--python") {
      args.sage = false;
    } else if (!optionsEnded && argument === "--sage") {
      args.sage = true;
    } else if (!optionsEnded && argument === "--magma") {
      args.sage = true;
      args.magma = true;
    } else if (!optionsEnded && argument === "--macaulay2") {
      args.sage = true;
      args.macaulay2 = true;
    } else if (!optionsEnded && argument === "--m2") {
      args.sage = true;
      args.m2 = true;
    } else if (!optionsEnded && argument === "--maple") {
      args.sage = true;
      args.maple = true;
    } else if (!optionsEnded && argument === "--matlab") {
      args.sage = true;
      args.matlab = true;
    } else if (!optionsEnded && argument === "--wolfram") {
      args.sage = true;
      args.wolfram = true;
    } else if (!optionsEnded && argument === "--mathematica") {
      args.sage = true;
      args.mathematica = true;
    } else if (!optionsEnded && argument === "--emit-sage") {
      args.emit_sage = true;
    } else if (!optionsEnded && argument === "--no-js") {
      args.no_js = true;
    } else if (!optionsEnded && argument === "--tokens") {
      args.tokens = true;
    } else if (!optionsEnded && argument === "--explain-optimizations") {
      args.explain_optimizations = true;
    } else if (
      !optionsEnded &&
      ["--optimization-level", "--optimization-disable", "--optimization-require"]
        .includes(argument)
    ) {
      const value = rawArguments[++argumentIndex];
      if (value === undefined) throw new Error(`${argument} requires a value`);
      const field = argument.slice(2).replaceAll("-", "_") as
        | "optimization_level"
        | "optimization_disable"
        | "optimization_require";
      args[field] = value;
    } else if (!optionsEnded && /^--optimization-(?:level|disable|require)=/.test(argument)) {
      const separator = argument.indexOf("=");
      const field = argument.slice(2, separator).replaceAll("-", "_") as
        | "optimization_level"
        | "optimization_disable"
        | "optimization_require";
      args[field] = argument.slice(separator + 1);
    } else if (
      !optionsEnded &&
      (argument === "--help" || argument === "-h")
    ) {
      usage();
      process.exit(0);
    } else if (
      !optionsEnded &&
      (argument === "--version" || argument === "-V")
    ) {
      console.log(`sagejs ${SAGEJS_VERSION_INFO.version}`);
      process.exit(0);
    } else if (!optionsEnded && argument.startsWith("-")) {
      throw new Error(`unknown option ${JSON.stringify(argument)}`);
    } else {
      args.files.push(argument);
    }
  }
  if (args.files.length) {
    args.mode = "compile";
    args.execute = true;
  }
  return args;
}

const argv = parseArguments();
const sageMode = argv.sage;

async function main(): Promise<void> {
  if (argv.mode === "embedded-kernel") {
    await runStdioKernel(argv.sage ? "sage" : "python");
    return;
  }
  if (argv.mode === "jupyter-install" || argv.mode === "jupyter-uninstall") {
    const jupyter = await import("./jupyter-kernel.js");
    const jupyterArguments = argv.jupyter_args ?? [];
    const modeIndex = jupyterArguments.indexOf("--mode");
    const mode = (modeIndex >= 0
      ? jupyterArguments[modeIndex + 1]
      : "sage") as "sage" | "python";
    if (mode !== "sage" && mode !== "python") {
      throw new Error(`unknown Sage.js Jupyter mode ${JSON.stringify(mode)}`);
    }
    if (argv.mode === "jupyter-install") {
      jupyter.installKernelSpec(mode, jupyterArguments, [
        process.execPath,
        "--jupyter-kernel",
      ]);
    } else {
      jupyter.uninstallKernelSpec(mode, jupyterArguments);
    }
    return;
  }
  if (argv.mode === "jupyter-kernel") {
    const jupyter = await import("./jupyter-kernel.js");
    await jupyter.main(argv.jupyter_args);
    return;
  }
  if (argv.mode === "jupyter-self-test") {
    const jupyter = await import("./jupyter-kernel.js");
    console.log(await jupyter.runtimeSelfTest());
    return;
  }
  if (argv.mode === "repl") {
    const repl = await Repl({
      show_js: !argv.no_js,
      sage: sageMode,
      magma: argv.magma,
      macaulay2: argv.macaulay2,
      m2: argv.m2,
      maple: argv.maple,
      matlab: argv.matlab,
      wolfram: argv.wolfram,
      mathematica: argv.mathematica,
      emitSage: argv.emit_sage,
      tokens: argv.tokens,
      optimizationLevel: argv.optimization_level,
      optimizationDisable: argv.optimization_disable,
      optimizationRequire: argv.optimization_require,
      explainOptimizations: argv.explain_optimizations,
    });
    // A non-interactive SEA has no filesystem handles keeping Node alive while
    // the lazily initialized Tree-sitter frontend consumes piped input.  Wait
    // for every line observed during REPL initialization before returning.
    // Interactive readline sessions remain alive through their input handle.
    await repl.finished();
    return;
  }
  if (argv.mode === "compile") {
    await Compile({
      argv: argv as any,
      src_path: dirname(importPath),
      lib_path: libraryPath,
    });
    return;
  }
  if (argv.mode === "docs") {
    const evaluator = await createKernelEvaluatorAsync({
      mode: "sage",
      onOutput(text) {
        process.stderr.write(text);
      },
    });
    try {
      await runDocumentationCli(argv, process.cwd(), {
        pathAvailable: false,
        catalog: evaluator.documentation(),
      });
    } finally {
      evaluator.close();
    }
    return;
  }
  if (argv.mode === "pytest") {
    process.exitCode = await runPytestCli({ files: argv.pytest_args ?? [] });
    return;
  }
  throw new Error(
    `The single-executable distribution does not include the ${JSON.stringify(
      argv.mode,
    )} development command`,
  );
}

void main().catch((error) => {
  console.error(error?.message ?? String(error));
  process.exitCode = 1;
});
