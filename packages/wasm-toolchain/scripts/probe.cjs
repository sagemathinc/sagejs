#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { mkdirSync, mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { WASI } = require("node:wasi");

const { resolveToolchain } = require("./toolchain.cjs");

const packageRoot = resolve(__dirname, "..");
const repositoryRoot = resolve(packageRoot, "..", "..");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function runProbe() {
  const toolchain = resolveToolchain({ root: repositoryRoot });
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-wasi-conformance-"));
  const wasm = join(temporary, "wasi-abi.wasm");
  try {
    const compilerProbes = [];
    for (const probe of [
      {
        compiler: toolchain.paths.clang,
        source: "compiler-c.c",
        output: "compiler-c.wasm",
        exportName: "sagejs_compiler_c_probe",
        multiplier: 31,
      },
      {
        compiler: toolchain.paths.clangxx,
        source: "compiler-cxx.cc",
        output: "compiler-cxx.wasm",
        exportName: "sagejs_compiler_cxx_probe",
        multiplier: 37,
      },
    ]) {
      const output = join(temporary, probe.output);
      execFileSync(probe.compiler, [
        `--target=${toolchain.lock.build.target}`,
        `--sysroot=${toolchain.paths.sysroot}`,
        "-Oz",
        "-nostdlib",
        "-Wl,--no-entry",
        `-Wl,--export=${probe.exportName}`,
        join(packageRoot, "probes", probe.source),
        "-o", output,
      ], { cwd: repositoryRoot, stdio: "inherit" });
      const probeBytes = readFileSync(output);
      const probeModule = await WebAssembly.compile(probeBytes);
      assert.deepEqual(WebAssembly.Module.imports(probeModule), []);
      const probeInstance = await WebAssembly.instantiate(probeModule);
      assert.equal(
        probeInstance.exports[probe.exportName](17, 5),
        17 * probe.multiplier + 5,
      );
      compilerProbes.push({
        language: probe.source.endsWith(".cc") ? "c++" : "c",
        moduleSha256: sha256(probeBytes),
        result: probeInstance.exports[probe.exportName](17, 5),
      });
    }

    execFileSync(toolchain.paths.clang, [
      `--target=${toolchain.lock.build.target}`,
      `--sysroot=${toolchain.paths.sysroot}`,
      "-Oz",
      "-nostdlib",
      "-Wl,--no-entry",
      "-Wl,--export-memory",
      "-Wl,--initial-memory=131072",
      "-Wl,--max-memory=131072",
      join(packageRoot, "probes", "wasi-abi.c"),
      "-o", wasm,
    ], { cwd: repositoryRoot, stdio: "inherit" });
    const bytes = readFileSync(wasm);
    const module = await WebAssembly.compile(bytes);
    const imports = WebAssembly.Module.imports(module).map(
      ({ module: namespace, name, kind }) => ({ module: namespace, name, kind }),
    );
    assert.ok(imports.length > 0);
    assert.ok(imports.every(({ module: namespace, kind }) =>
      namespace === "wasi_snapshot_preview1" && kind === "function"));

    const { createWasiHost } = await import(
      "../../flint-wasm/src/wasi-runtime.mjs"
    );
    const firstParty = createWasiHost();
    const instance = await WebAssembly.instantiate(module, {
      wasi_snapshot_preview1: firstParty.imports,
    });
    firstParty.initialize(instance);
    const firstPartyResult = instance.exports.sagejs_wasi_probe();
    assert.equal(firstPartyResult, 0);
    assert.equal(firstParty.filesystemUsage().fileCount, 0);
    firstParty.dispose();

    const standardsRoot = join(temporary, "standards-root");
    mkdirSync(join(standardsRoot, "tmp"), { recursive: true });
    const standards = new WASI({
      version: "preview1",
      args: [],
      env: {},
      preopens: { "/": standardsRoot },
      returnOnExit: true,
    });
    const standardsInstance = await WebAssembly.instantiate(module, {
      wasi_snapshot_preview1: standards.wasiImport,
    });
    standards.initialize(standardsInstance);
    const standardsResult = standardsInstance.exports.sagejs_wasi_probe();
    assert.equal(standardsResult, 0);

    return {
      schema: "sagejs.wasi-preview1-conformance/v1",
      toolchain: toolchain.lockDigest,
      compilerProbes,
      moduleSha256: sha256(bytes),
      imports,
      firstPartyResult,
      standardsOracle: "node:wasi-preview1",
      standardsResult,
    };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

if (require.main === module) {
  runProbe().then((receipt) => {
    process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
  }).catch((error) => {
    process.stderr.write(`${error.stack ?? error}\n`);
    process.exitCode = 1;
  });
}

module.exports = { runProbe };
