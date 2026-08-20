"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = resolve(__dirname, "..");
const {
  buildWasmProductionPacks,
  inventoryProductionKernels,
} = require("../tools/native-kernel/wasm-production-pack.cjs");
const {
  portableKernelIdentity,
} = require("../tools/native-kernel/portable-identity.cjs");

test("the Wasm source-kernel inventory accounts for all registered kernels", async () => {
  const manifestPath = join(root, "architecture", "native-kernels.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const inventory = await inventoryProductionKernels({ root, manifestPath });
  assert.equal(manifest.kernels.length, 31);
  assert.equal(inventory.registered.length, manifest.kernels.length);
  assert.equal(inventory.production.length, 24);
  assert.equal(inventory.modules.length, inventory.production.length);
  assert.equal(inventory.nonProduction.length, 7);
  for (const omitted of inventory.nonProduction) {
    assert.match(omitted.reason, /\S/);
    assert.equal(omitted.fallback, "same-source");
    assert.ok(omitted.oracles.length > 0);
    assert.ok(omitted.tests.length > 0);
  }
  const functions = inventory.inventory.flatMap((kernel) => kernel.functions);
  assert.ok(functions.filter((fn) => fn.status === "compiled-source").length > 150);
  for (const fn of functions.filter((item) => item.status === "unsupported")) {
    assert.match(fn.reason, /\S/);
    assert.match(fn.declarationHash, /^[a-f0-9]{64}$/);
  }
  for (const kernel of inventory.inventory) {
    assert.equal(kernel.fallback, "same-source");
    assert.ok(kernel.oracles.length > 0);
    assert.ok(kernel.tests.length > 0);
  }
});

test("portable identities are deterministic and independent of Node cache keys", async () => {
  const manifestPath = join(root, "architecture", "native-kernels.json");
  const inventory = await inventoryProductionKernels({ root, manifestPath });
  const module = inventory.modules.find((item) =>
    item.id === "number-field-zeta-coefficients-production"
  );
  assert.ok(module);
  const repeated = portableKernelIdentity(module);
  for (const key of [
    "sourceHash",
    "abiHash",
    "coreHash",
    "oracleIdentity",
    "identityHash",
  ]) {
    assert.match(module.identity[key], /^[a-f0-9]{64}$/);
    assert.equal(repeated[key], module.identity[key]);
  }
  assert.equal(module.identity.moduleIdentity.length, 16);
  assert.doesNotMatch(module.identity.canonicalCore.source, /\bnapi_/);
});

test("generated runtime manifests expose bridges and exact unsupported reasons", async () => {
  const outputRoot = mkdtempSync(join(tmpdir(), "sagejs-wasm-kernel-emit-"));
  try {
    const manifest = await buildWasmProductionPacks({
      root,
      manifestPath: join(root, "architecture", "native-kernels.json"),
      outputRoot,
      emitOnly: true,
    });
    assert.equal(manifest.completeInventory, true);
    assert.equal(manifest.registeredKernels, 31);
    assert.equal(manifest.productionKernels, 24);
    assert.equal(manifest.compiledKernelCores, 24);
    assert.equal(manifest.compiledFunctions, 193);
    assert.equal(manifest.unsupportedFunctions, 25);
    assert.equal(manifest.nonProductionKernels.length, 7);
    assert.deepEqual(manifest.packs.map((pack) => pack.domain), ["flint", "gmp"]);
    const zeta = manifest.kernels.find((kernel) =>
      kernel.id === "number-field-zeta-coefficients-production"
    );
    assert.ok(zeta.runtime);
    assert.equal(zeta.functions.length, 1);
    assert.match(zeta.functions[0].bridge.export,
      /^sagejs_wasm_call_m_[a-f0-9]{16}_/);
    const extension = manifest.kernels.find((kernel) =>
      kernel.id === "extension-polynomial-flint-production"
    );
    assert.ok(extension.functions.every((fn) =>
      fn.status === "unsupported" && /resource/.test(fn.reason)
    ));
    assert.ok(manifest.unsupported.every((fn) =>
      fn.fallback === "same-source" && fn.oracles.length > 0 &&
      fn.tests.length > 0
    ));
    const persisted = JSON.parse(readFileSync(join(outputRoot, "index.json")));
    assert.deepEqual(persisted, manifest);

    const densePrimeBridge = readFileSync(join(
      outputRoot,
      "sources",
      manifest.kernels.find((kernel) =>
        kernel.id === "dense-prime-production"
      ).moduleIdentity,
      "wasm_bridge.c",
    ), "utf8");
    assert.match(densePrimeBridge, /sagejs_source_u64_buffer/);
    assert.match(densePrimeBridge, /uint64_t sagejs_result_0/);

    const denseIntegerBridge = readFileSync(join(
      outputRoot,
      "sources",
      manifest.kernels.find((kernel) =>
        kernel.id === "dense-integer-flint-production"
      ).moduleIdentity,
      "wasm_bridge.c",
    ), "utf8");
    assert.match(denseIntegerBridge, /int sagejs_result_0/);
  } finally {
    rmSync(outputRoot, { recursive: true, force: true });
  }
});

const clang = process.env.SAGEJS_WASI_CLANG;
const sysroot = process.env.SAGEJS_WASI_SYSROOT;
const gmpPrefix = process.env.SAGEJS_WASM_GMP_PREFIX;
const toolchainAvailable = [clang, sysroot, gmpPrefix].every((value) =>
  typeof value === "string" && existsSync(value)
) && existsSync(join(gmpPrefix ?? "", "lib", "libgmp.a"));

test("a compiled Wasm core executes the same exact source as the fallback", {
  skip: toolchainAvailable
    ? false
    : "set SAGEJS_WASI_CLANG, SAGEJS_WASI_SYSROOT, and SAGEJS_WASM_GMP_PREFIX",
  timeout: 180_000,
}, async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-wasm-kernel-run-"));
  try {
    const registered = JSON.parse(readFileSync(
      join(root, "architecture", "native-kernels.json"),
      "utf8",
    ));
    const kernel = registered.kernels.find((item) =>
      item.id === "number-field-composite-analysis-production"
    );
    assert.ok(kernel);
    const manifestPath = join(temporary, "native-kernels.json");
    writeFileSync(manifestPath, `${JSON.stringify({ kernels: [kernel] }, null, 2)}\n`);
    const outputRoot = join(temporary, "output");
    const manifest = await buildWasmProductionPacks({
      root,
      manifestPath,
      outputRoot,
      domains: ["gmp"],
      emitOnly: false,
      toolchain: {
        clang,
        sysroot,
        gmpPrefix,
        flintPrefix: "unused",
        mpfrPrefix: "unused",
        mpcPrefix: "unused",
      },
    });
    const { WASI } = require("node:wasi");
    const { instantiateWasmKernelPacks } = await import(
      "../tools/native-kernel/wasm-pack-loader.mjs"
    );
    const runtime = await instantiateWasmKernelPacks({
      manifest,
      load(pack) {
        return readFileSync(join(outputRoot, pack.asset));
      },
      host() {
        const wasi = new WASI({ version: "preview1", returnOnExit: true });
        return {
          imports: { wasi_snapshot_preview1: wasi.wasiImport },
          initialize(instance) {
            wasi.initialize(instance);
          },
        };
      },
    });
    const source = "sagejs/number_fields/composite_field_analysis.py";
    const squareRoot = runtime.function(source, "packed_integer_square_root");
    assert.equal(runtime.resolve(source, "packed_integer_square_root", {
      sourceHash: squareRoot.sourceHash,
      abiHash: squareRoot.abiHash,
      declarationHash: squareRoot.declarationHash,
      portableIdentity: squareRoot.portableIdentity,
    }), squareRoot);
    assert.equal(runtime.resolve(source, "packed_integer_square_root", {
      declarationHash: "0".repeat(64),
    }), null);
    const value = (1n << 190n) + 123456789n;
    const wasmAnswer = squareRoot(value);
    const oracle = spawnSync(
      process.execPath,
      [join(root, "bin", "sagejs"), "--python"],
      {
        cwd: root,
        encoding: "utf8",
        env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
        input: [
          "from sagejs.number_fields.composite_field_analysis import packed_integer_square_root",
          `print(packed_integer_square_root(Integer('${value}')))`,
          "",
        ].join("\n"),
      },
    );
    assert.equal(oracle.status, 0, oracle.stderr);
    assert.equal(wasmAnswer, BigInt(oracle.stdout.trim()));
    assert.equal(squareRoot(-1n), -1n);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
