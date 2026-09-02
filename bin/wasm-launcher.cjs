"use strict";

const { existsSync } = require("node:fs");
const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

const wasmCliFilename = join(
  __dirname,
  "..",
  "packages",
  "flint-wasm",
  "node-cli.mjs",
);

function wasmArguments(argv = process.argv.slice(2)) {
  return argv[0] === "--wasm" ? argv.slice(1) : undefined;
}

async function importProductionWasmCli() {
  if (!existsSync(wasmCliFilename)) {
    throw new Error(
      "this Sage.js installation does not contain the production WebAssembly " +
        "runtime; reinstall @sagemath/sagejs from a complete published package",
    );
  }
  return import(pathToFileURL(wasmCliFilename).href);
}

async function runWasmCli({
  argv = process.argv.slice(2),
  loadCli = importProductionWasmCli,
  errorOutput = process.stderr,
} = {}) {
  const forwarded = wasmArguments(argv);
  if (forwarded === undefined) return undefined;

  try {
    const module = await loadCli();
    if (typeof module.runCli !== "function") {
      throw new Error("WebAssembly CLI entry point does not export runCli");
    }
    await module.runCli({ argv: forwarded });
    return 0;
  } catch (error) {
    errorOutput.write(`${error?.stack ?? error}\n`);
    return error?.name === "SageSessionTimeoutError" ? 124 : 1;
  }
}

function launchWasmIfRequested(options = {}) {
  const argv = options.argv ?? process.argv.slice(2);
  if (wasmArguments(argv) === undefined) return false;

  void runWasmCli({ ...options, argv }).then((status) => {
    process.exitCode = status ?? 1;
  });
  return true;
}

module.exports = {
  importProductionWasmCli,
  launchWasmIfRequested,
  runWasmCli,
  wasmCliFilename,
  wasmArguments,
};
