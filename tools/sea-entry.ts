/*
 * Entry point for Node.js single-executable builds.
 *
 * Keep this intentionally smaller than bin/sagejs: a distributed runtime does
 * not need the compiler bootstrap, lint, msgfmt, or repository test commands.
 */

import Compile from "./compile";
import { runDocumentationCli } from "./docs";
import { createKernelEvaluator } from "./kernel-evaluator";
import Repl from "./repl";
import { importPath, libraryPath } from "./utils";
import { basename, dirname, extname } from "path";

const executable = basename(process.argv[1]);
const executableStem = basename(executable, extname(executable)).toLowerCase();

interface SeaArguments {
  files: string[];
  import_path: string;
  mode: "compile" | "docs" | "repl";
  execute: boolean;
  sage: boolean;
  magma: boolean;
  maple: boolean;
  matlab: boolean;
  wolfram: boolean;
  mathematica: boolean;
  emit_sage: boolean;
  no_js: boolean;
  tokens: boolean;
  json?: boolean;
  jsonl?: boolean;
  markdown?: boolean;
  regex?: boolean;
  ignore_case?: boolean;
  case_sensitive?: boolean;
  kind?: string;
  backend?: string;
  tag?: string;
}

function usage(): void {
  console.log(`Usage: ${executable} [options] [program.py]

Run Sage.js from a self-contained executable. With no program, start a REPL.

  ${executable} docs <search|show|export|coverage> [query]

Options:
  --python        use Python syntax and division
  --sage          use mathematics-friendly Sage syntax
  --magma         use the experimental Magma language frontend
  --maple         use the experimental Maple language frontend
  --matlab        use the experimental MATLAB language frontend
  --wolfram       use the experimental Wolfram Language frontend
  --mathematica   alias for --wolfram
  --emit-sage     print Sage source generated from foreign-language input
  --no-js         hide generated JavaScript in the REPL (default)
  --tokens        display parser tokens
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
    maple: false,
    matlab: false,
    wolfram: false,
    mathematica: false,
    emit_sage: false,
    no_js: true,
    tokens: false,
  };
  const rawArguments = process.argv.slice(2);
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
  let optionsEnded = false;
  for (const argument of rawArguments) {
    if (!optionsEnded && argument === "--") {
      optionsEnded = true;
    } else if (!optionsEnded && argument === "--python") {
      args.sage = false;
    } else if (!optionsEnded && argument === "--sage") {
      args.sage = true;
    } else if (!optionsEnded && argument === "--magma") {
      args.sage = true;
      args.magma = true;
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
      const packageJson = require("../../package.json");
      console.log(`sagejs ${packageJson.version}`);
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
  if (argv.mode === "repl") {
    await Repl({
      show_js: !argv.no_js,
      sage: sageMode,
      magma: argv.magma,
      maple: argv.maple,
      matlab: argv.matlab,
      wolfram: argv.wolfram,
      mathematica: argv.mathematica,
      emitSage: argv.emit_sage,
      tokens: argv.tokens,
    });
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
    const evaluator = createKernelEvaluator({
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
