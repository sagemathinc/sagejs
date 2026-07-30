/*
 * Entry point for Node.js single-executable builds.
 *
 * Keep this intentionally smaller than bin/sagejs: a distributed runtime does
 * not need the compiler bootstrap, lint, msgfmt, or repository test commands.
 */

import Compile from "./compile";
import Repl from "./repl";
import { importPath, libraryPath } from "./utils";
import { basename } from "path";

const executable = basename(process.argv[1]);

interface SeaArguments {
  files: string[];
  import_path: string;
  mode: "compile" | "repl";
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
}

function usage(): void {
  console.log(`Usage: ${executable} [options] [program.py]

Run Sage.js from a self-contained executable. With no program, start a REPL.

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
    sage: executable !== "sagepython",
    magma: false,
    maple: false,
    matlab: false,
    wolfram: false,
    mathematica: false,
    emit_sage: false,
    no_js: true,
    tokens: false,
  };
  let optionsEnded = false;
  for (const argument of process.argv.slice(2)) {
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
      src_path: importPath.endsWith("/lib")
        ? importPath.slice(0, -"/lib".length)
        : importPath,
      lib_path: libraryPath,
    });
    return;
  }
  throw new Error(
    `The single-executable distribution does not include the ${JSON.stringify(
      argv.mode,
    )} development command`,
  );
}

void main();
