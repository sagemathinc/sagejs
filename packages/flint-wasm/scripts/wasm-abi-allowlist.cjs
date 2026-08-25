#!/usr/bin/env node
"use strict";

const { readFileSync, readdirSync, statSync, writeFileSync } = require("node:fs");
const { join, relative, resolve } = require("node:path");
const { pathToFileURL } = require("node:url");

const packageRoot = resolve(__dirname, "..");
const defaultDist = join(packageRoot, "dist");
const defaultAllowlist = join(packageRoot, "release", "wasm-abi-allowlist.json");

function wasmFiles(root) {
  const files = [];
  function visit(directory) {
    for (const name of readdirSync(directory).sort()) {
      const filename = join(directory, name);
      const information = statSync(filename);
      if (information.isDirectory()) visit(filename);
      else if (information.isFile() && name.endsWith(".wasm") &&
               !name.endsWith(".unstripped.wasm")) files.push(filename);
    }
  }
  visit(root);
  return files;
}

function records(values) {
  return values.map(({ module, name, kind }) => ({
    ...(module === undefined ? {} : { module }),
    name,
    kind,
  })).sort((left, right) =>
    `${left.module ?? ""}\0${left.name}\0${left.kind}`.localeCompare(
      `${right.module ?? ""}\0${right.name}\0${right.kind}`,
    ));
}

function inventory(dist) {
  const modules = {};
  for (const filename of wasmFiles(dist)) {
    const module = new WebAssembly.Module(readFileSync(filename));
    const name = relative(dist, filename).replaceAll("\\", "/");
    modules[name] = {
      imports: records(WebAssembly.Module.imports(module)),
      exports: records(WebAssembly.Module.exports(module)),
    };
  }
  return { schema: "sagejs.wasm-abi-allowlist/v1", modules };
}

async function validateWasiInventory(value) {
  const runtime = await import(pathToFileURL(
    join(packageRoot, "src", "wasi-constants.mjs"),
  ));
  const observed = [...new Set(Object.values(value.modules).flatMap(({ imports }) =>
    imports.filter(({ module, kind }) =>
      module === "wasi_snapshot_preview1" && kind === "function")
      .map(({ name }) => name)))].sort();
  const implemented = [...runtime.WASI_IMPLEMENTED_IMPORTS].sort();
  if (JSON.stringify(observed) !== JSON.stringify(implemented)) {
    throw new Error(
      `production WASI imports differ: observed=[${observed.join(", ")}], ` +
      `implemented=[${implemented.join(", ")}]`,
    );
  }
}

async function checkAbi({ dist = defaultDist, allowlist = defaultAllowlist } = {}) {
  const actual = inventory(dist);
  const expected = JSON.parse(readFileSync(allowlist, "utf8"));
  if (expected.schema !== actual.schema) throw new Error("unsupported Wasm ABI allowlist");
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    const actualNames = Object.keys(actual.modules);
    const expectedNames = Object.keys(expected.modules);
    const added = actualNames.filter((name) => !expectedNames.includes(name));
    const removed = expectedNames.filter((name) => !actualNames.includes(name));
    const changed = actualNames.filter((name) =>
      expected.modules[name] &&
      JSON.stringify(actual.modules[name]) !== JSON.stringify(expected.modules[name]));
    throw new Error(
      `production Wasm ABI differs; added=[${added.join(", ")}], ` +
      `removed=[${removed.join(", ")}], changed=[${changed.join(", ")}]`,
    );
  }
  await validateWasiInventory(actual);
  return actual;
}

async function main(argv) {
  const write = argv.includes("--write");
  let dist = defaultDist;
  let allowlist = defaultAllowlist;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--dist") dist = resolve(argv[++index]);
    else if (argv[index] === "--allowlist") allowlist = resolve(argv[++index]);
    else if (argv[index] !== "--write" && argv[index] !== "--check") {
      throw new Error(`unknown argument ${argv[index]}`);
    }
  }
  if (write) {
    const value = inventory(dist);
    await validateWasiInventory(value);
    writeFileSync(allowlist, `${JSON.stringify(value, null, 2)}\n`);
    process.stdout.write(`Wrote ${Object.keys(value.modules).length} reviewed Wasm ABI modules.\n`);
  } else {
    const value = await checkAbi({ dist, allowlist });
    process.stdout.write(`Verified ${Object.keys(value.modules).length} reviewed Wasm ABI modules.\n`);
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { checkAbi, inventory, wasmFiles };
