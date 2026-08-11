#!/usr/bin/env node
"use strict";

const {
  existsSync,
  mkdirSync,
  writeFileSync,
} = require("node:fs");
const { homedir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadRegistry } = require("../tools/ffi/declarations.cjs");
const {
  generatedWasmResourceAdapter,
} = require("../tools/ffi/wasm-adapters.cjs");

const root = resolve(__dirname, "..");

function parseArguments(argv) {
  const options = { resources: [], functions: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const option = argv[index];
    const value = argv[index + 1];
    if (!["--library", "--resource", "--function", "--output"].includes(
      option,
    ) || value === undefined) {
      throw new Error(`unknown or incomplete option ${option}`);
    }
    index += 1;
    if (option === "--library") options.library = value;
    if (option === "--resource") options.resources.push(value);
    if (option === "--function") options.functions.push(value);
    if (option === "--output") options.output = resolve(value);
  }
  if (options.library === undefined || options.output === undefined ||
      options.resources.length === 0) {
    throw new Error(
      "usage: build-ffi-wasm-resource-adapter.cjs --library ID " +
      "--resource ID [--function ID ...] --output DIRECTORY",
    );
  }
  return options;
}

function cowasmRoot() {
  const candidates = process.env.SAGEJS_COWASM_ROOT === undefined
    ? [join(root, "..", "cowasm"), join(homedir(), "cowasm")]
    : [resolve(process.env.SAGEJS_COWASM_ROOT)];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

function toolchain() {
  const cowasm = cowasmRoot();
  const wasiNative = join(
    cowasm, "core", "build", "build", "wasi-sdk", "dist",
    "wasi-sdk-next", "native",
  );
  const prefixes = ["flint", "mpfr", "gmp"].map((name) => ({
    name,
    path: join(cowasm, "sagemath", name, "dist", "wasi-sdk"),
  }));
  return {
    clang: join(wasiNative, "bin", "clang"),
    sysroot: join(wasiNative, "share", "wasi-sysroot"),
    prefixes,
  };
}

function requirePath(description, path) {
  if (!existsSync(path)) {
    throw new Error(
      `missing ${description}: ${path}\n` +
      "Build the CoWasm FLINT toolchain or set SAGEJS_COWASM_ROOT.",
    );
  }
}

function build(options) {
  const registry = loadRegistry({ root });
  const declaration = registry.byId.get(options.library);
  if (declaration === undefined) {
    throw new Error(`unknown FFI library ${options.library}`);
  }
  const artifacts = generatedWasmResourceAdapter(declaration, {
    resourceIds: options.resources,
    functionIds: options.functions.length === 0
      ? undefined : options.functions,
  });
  mkdirSync(options.output, { recursive: true });
  const cPath = join(options.output, "adapter.c");
  const wasmPath = join(options.output, "adapter.wasm");
  writeFileSync(cPath, artifacts.cSource);
  writeFileSync(join(options.output, "backend.mjs"), artifacts.javascriptSource);
  writeFileSync(join(options.output, "ffi_host.py"), artifacts.hostSource);
  writeFileSync(join(options.output, "manifest.json"), artifacts.manifestSource);

  const { clang, sysroot, prefixes } = toolchain();
  requirePath("WASI SDK clang", clang);
  requirePath("WASI SDK sysroot", sysroot);
  for (const prefix of prefixes) {
    requirePath(`${prefix.name} headers`, join(prefix.path, "include"));
    requirePath(
      `${prefix.name} archive`,
      join(prefix.path, "lib", `lib${prefix.name}.a`),
    );
  }
  const args = [
    "--target=wasm32-wasip1",
    `--sysroot=${sysroot}`,
    "-mexec-model=reactor",
    "-O2",
    "-fvisibility=hidden",
    "-Wall",
    "-Wextra",
    "-Werror",
    ...prefixes.flatMap((prefix) => [
      "-isystem",
      join(prefix.path, "include"),
    ]),
    `-I${join(root, "packages", "flint", "include")}`,
    cPath,
    join(root, "packages", "flint-wasm", "src", "wasi-stubs.c"),
    ...prefixes.flatMap((prefix) => [
      `-L${join(prefix.path, "lib")}`,
    ]),
    "-lflint",
    "-lmpfr",
    "-lgmp",
    "-lm",
    "-lwasi-emulated-signal",
    ...artifacts.manifest.exports.map((name) => `-Wl,--export=${name}`),
    "-Wl,--export-memory",
    "-Wl,--gc-sections",
    "-o",
    wasmPath,
  ];
  const result = spawnSync(clang, args, {
    cwd: root,
    encoding: "utf8",
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Wasm adapter compiler exited with ${result.status}`);
  }
  return Object.freeze({ ...artifacts, wasmPath });
}

if (require.main === module) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = build(options);
    process.stdout.write(`${result.wasmPath}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  }
}

module.exports = { build, cowasmRoot, parseArguments, toolchain };
