#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { PassThrough } = require("node:stream");

const root = resolve(__dirname, "..");
const stop = Number(process.env.SAGEJS_MOEBIUS_STOP || 100_000);
const samples = Number(process.env.SAGEJS_MOEBIUS_SAMPLES || 7);
if (!Number.isInteger(stop) || stop < 1024 || stop > 2 * 1024 * 1024) {
  throw new RangeError("SAGEJS_MOEBIUS_STOP must be in 1024..2097152");
}
if (!Number.isInteger(samples) || samples < 3) {
  throw new RangeError("SAGEJS_MOEBIUS_SAMPLES must be at least 3");
}

const descriptor = {
  id: "packed-moebius-range-production",
  source: "src/lib/sagejs/kernels/arithmetic/moebius.py",
  functions: ["packed_moebius_range"],
  semantic_domain: "bounded exact public Moebius range linear sieve",
  fallback: "same-source",
  host_isolation: "certified",
  oracles: ["cpython", "javascript", "scalar-factorization"],
  benchmark: "bench:wasm-arithmetic-hotspots",
  platforms: ["linux-x64", "linux-arm64", "windows-x64", "macos-arm64"],
};

function discoverToolchain() {
  return require("../packages/wasm-toolchain/scripts/toolchain.cjs")
    .wasmKernelToolchain({ root });
}

function median(values) {
  return [...values].sort((left, right) => left - right)[
    Math.floor(values.length / 2)
  ];
}

async function instantiate(manifest, outputRoot) {
  const { WASI } = require("node:wasi");
  const { instantiateWasmKernelPacks } = await import(
    "../tools/native-kernel/wasm-pack-loader.mjs"
  );
  return instantiateWasmKernelPacks({
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
}

async function publicSession(resolver) {
  const Repl = require("../dist/tools/repl.js").default;
  let readline;
  globalThis.__sagejs_wasm_native_resolver__ = resolver;
  const controller = await Repl({
    input: new PassThrough(),
    output: new PassThrough(),
    console: { log() {}, warn() {}, error(error) { throw error; } },
    mockReadline() {
      readline = new EventEmitter();
      readline.closed = false;
      readline.history = [];
      readline.setPrompt = () => {};
      readline.prompt = () => {};
      readline.write = () => {};
      return readline;
    },
    terminal: false,
    show_js: false,
    histfile: false,
    sage: true,
  });
  return {
    async measure(expression) {
      delete globalThis.__sagejs_moebius_benchmark_result__;
      const started = performance.now();
      readline.emit(
        "line",
        "import sagejs.runtime as runtime; values=" + expression + "; " +
          "runtime.reflect.set(runtime.global_object," +
          "'__sagejs_moebius_benchmark_result__'," +
          "str([len(values),sum(values),sum(abs(x) for x in values),values[-10:]])); None",
      );
      await controller.drain();
      return {
        milliseconds: performance.now() - started,
        digest: globalThis.__sagejs_moebius_benchmark_result__,
      };
    },
    async close() {
      readline.closed = true;
      readline.emit("close");
      await controller.finished();
      delete globalThis.__sagejs_wasm_native_resolver__;
      delete globalThis.__sagejs_moebius_benchmark_result__;
    },
  };
}

(async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-moebius-benchmark-"));
  try {
    const manifestPath = join(temporary, "native-kernels.json");
    writeFileSync(
      manifestPath,
      `${JSON.stringify({ kernels: [descriptor] }, null, 2)}\n`,
    );
    const outputRoot = join(temporary, "output");
    const { buildWasmProductionPacks } = require(
      "../tools/native-kernel/wasm-production-pack.cjs"
    );
    const manifest = await buildWasmProductionPacks({
      root,
      manifestPath,
      outputRoot,
      domains: ["gmp"],
      emitOnly: false,
      toolchain: discoverToolchain(),
    });
    const runtime = await instantiate(manifest, outputRoot);
    const packed = runtime.function(
      "sagejs/kernels/arithmetic/moebius.py",
      "packed_moebius_range",
    );
    const output = new BigInt64Array(stop);
    const workspace = new BigUint64Array(2 * stop);
    assert.equal(packed(output, workspace, BigInt(stop)), true);
    const direct = [];
    for (let sample = 0; sample < samples; sample += 1) {
      const started = performance.now();
      assert.equal(packed(output, workspace, BigInt(stop)), true);
      direct.push(performance.now() - started);
    }

    const session = await publicSession(runtime);
    let scalar;
    const publicWasm = [];
    try {
      scalar = await session.measure(
        `[moebius(value) for value in range(${stop})]`,
      );
      await session.measure(`moebius.range(${stop})`);
      for (let sample = 0; sample < samples; sample += 1) {
        publicWasm.push((await session.measure(`moebius.range(${stop})`)).milliseconds);
      }
      const publicDigest = (await session.measure(`moebius.range(${stop})`)).digest;
      assert.equal(publicDigest, scalar.digest);
    } finally {
      await session.close();
    }

    const directMedian = median(direct);
    const publicMedian = median(publicWasm);
    assert.ok(publicMedian < scalar.milliseconds, "packed public route did not beat scalar fallback");
    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.benchmark/public-moebius-range-wasm-v1",
      source: "moebius.range(stop)",
      stop,
      samples,
      equivalence: scalar.digest,
      route: "wasm-compiled-source",
      boundaryCrossingsPerRange: 1,
      copiedValuesPerRange: 3 * stop,
      warmMedianMilliseconds: {
        directWasm: directMedian,
        publicNodeWasm: publicMedian,
        scalarPortable: scalar.milliseconds,
      },
      publicSpeedupOverScalar: scalar.milliseconds / publicMedian,
      wasmBytes: manifest.packs.find((pack) => pack.status === "built").bytes,
      bounds: { minimumPackedStop: 1024, maximumPackedStop: 2 * 1024 * 1024 },
    }, null, 2)}\n`);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
