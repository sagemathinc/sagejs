#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { createSage } from "./node-kernel.mjs";

function usage() {
  return `Sage.js WebAssembly kernel for Node

Usage:
  sagejs-wasm [FILE]
  sagejs-wasm -c SOURCE
  echo 'factor(2026)' | sagejs-wasm

With no file or piped input, starts a line-oriented Sage REPL.  This command
uses the same WebAssembly artifacts and isolated evaluator as the browser; it
does not load the native Node addon.`;
}

function argumentsFrom(argv) {
  if (argv.includes("-h") || argv.includes("--help")) return { help: true };
  if (argv[0] === "-c") {
    if (argv.length !== 2) throw new Error("-c requires exactly one source argument");
    return { source: argv[1], filename: "<command>" };
  }
  if (argv.length > 1) throw new Error("expected at most one Sage source file");
  return argv.length === 1 ? { file: argv[0] } : {};
}

async function evaluate(session, source, filename) {
  const result = await session.evaluate(source, {
    filename,
    onOutput: (text) => stdout.write(text),
    onError: (text) => process.stderr.write(text),
  });
  if (result.repr && result.repr !== "None") stdout.write(`${result.repr}\n`);
}

async function main() {
  const options = argumentsFrom(process.argv.slice(2));
  if (options.help) {
    stdout.write(`${usage()}\n`);
    return;
  }
  const session = await createSage();
  try {
    if (options.source !== undefined) {
      await evaluate(session, options.source, options.filename);
      return;
    }
    if (options.file) {
      await evaluate(session, await readFile(options.file, "utf8"), options.file);
      return;
    }
    if (!stdin.isTTY) {
      let source = "";
      stdin.setEncoding("utf8");
      for await (const chunk of stdin) source += chunk;
      await evaluate(session, source, "<stdin>");
      return;
    }
    stdout.write("Sage.js WebAssembly (Node host)\n");
    const readline = createInterface({ input: stdin, output: stdout });
    try {
      while (true) {
        const source = await readline.question("sage: ");
        if (source.trim() === "quit" || source.trim() === "exit") break;
        try {
          await evaluate(session, source, "<repl>");
        } catch (error) {
          process.stderr.write(`${error.stack ?? error}\n`);
        }
      }
    } finally {
      readline.close();
    }
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
