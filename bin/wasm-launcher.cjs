"use strict";

const { join } = require("node:path");
const { pathToFileURL } = require("node:url");

function wasmArguments(argv = process.argv.slice(2)) {
  return argv[0] === "--wasm" ? argv.slice(1) : undefined;
}

async function importProductionWasmCli() {
  const filename = join(
    __dirname,
    "..",
    "packages",
    "flint-wasm",
    "node-cli.mjs",
  );
  return import(pathToFileURL(filename).href);
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
  wasmArguments,
};
