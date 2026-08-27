#!/usr/bin/env node
"use strict";

const {
  existsSync,
  mkdirSync,
  writeFileSync,
} = require("node:fs");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { loadRegistry } = require("../tools/ffi/declarations.cjs");
const {
  generatedWasmResourceAdapter,
} = require("../tools/ffi/wasm-adapters.cjs");

const root = resolve(__dirname, "..");
const {
  resolveToolchain,
} = require("../packages/wasm-toolchain/scripts/toolchain.cjs");

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

const wasmLibraries = Object.freeze({
  flint: Object.freeze({
    prefixes: Object.freeze(["flint", "mpfr", "gmp"]),
    libraries: Object.freeze([
      "flint", "mpfr", "gmp", "m", "wasi-emulated-signal",
    ]),
    sources: Object.freeze([
      join(root, "packages", "flint-wasm", "src", "wasi-stubs.c"),
    ]),
  }),
  m4ri: Object.freeze({
    // M4RI's public headers include GMP declarations and the static archive
    // retains GMP references.  The adapter must therefore use the same
    // authenticated GMP prefix as the prepared M4RI dependency instead of
    // accidentally succeeding only on hosts with system GMP headers.
    prefixes: Object.freeze(["m4ri", "gmp"]),
    libraries: Object.freeze(["m4ri", "gmp", "m"]),
    sources: Object.freeze([]),
  }),
});

function toolchain(library = "flint") {
  const configuration = wasmLibraries[library];
  if (configuration === undefined) {
    throw new Error(`no Wasm toolchain configuration for ${library}`);
  }
  const prepared = resolveToolchain({ root });
  const prefixes = configuration.prefixes.map((name) => ({
    name,
    path: prepared.paths.libraries[name].prefix,
  }));
  return {
    clang: prepared.paths.clang,
    sysroot: prepared.paths.sysroot,
    prefixes,
    libraries: configuration.libraries,
    sources: configuration.sources,
  };
}

function requirePath(description, path) {
  if (!existsSync(path)) {
    throw new Error(
      `missing ${description}: ${path}\n` +
      "Prepare the Sage.js Wasm toolchain with " +
      "`pnpm --dir packages/wasm-toolchain toolchain:prepare`.",
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

  const { clang, sysroot, prefixes, libraries, sources } = toolchain(
    options.library,
  );
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
    ...declaration.library.native.toolchain.source_include_dirs.map(
      (directory) => `-I${join(root, directory)}`,
    ),
    cPath,
    ...sources,
    ...prefixes.flatMap((prefix) => [
      `-L${join(prefix.path, "lib")}`,
    ]),
    ...libraries.map((library) => `-l${library}`),
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

module.exports = { build, parseArguments, toolchain };
