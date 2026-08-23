// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { PassThrough } = require("node:stream");
const test = require("node:test");

const root = resolve(__dirname, "..");
const {
  buildWasmProductionPacks,
  inventoryProductionKernels,
} = require("../tools/native-kernel/wasm-production-pack.cjs");
const {
  resolveToolchain,
} = require("../packages/flint-wasm/scripts/wasm-toolchain.cjs");
const { createSage } = require("../dist/tools/kernel.js");

const functions = [
  "packed_integer_matrix_permanent",
  "packed_integer_matrix_minors",
  "packed_rational_matrix_permanent",
  "packed_rational_matrix_minors",
  "packed_prime_matrix_permanent",
  "packed_prime_matrix_minors",
];
const commonDescriptor = {
  source: "src/lib/sagejs/kernels/matrix/combinatorial.py",
  semantic_domain:
    "batched exact matrix permanents and lexicographically ordered minors " +
    "over integers, rationals, and word-prime fields",
  fallback: "same-source",
  host_isolation: "certified",
  oracles: ["cpython", "javascript", "sage", "division-free-subset-dp"],
  benchmark: "bench:wasm-combinatorial-invariants",
  platforms: ["linux-x64", "linux-arm64", "windows-x64", "macos-arm64"],
};
const descriptors = [
  {
    ...commonDescriptor,
    id: "packed-combinatorial-integer-rational-production",
    functions: functions.slice(0, 4),
  },
  {
    ...commonDescriptor,
    id: "packed-combinatorial-prime-production",
    functions: functions.slice(4),
  },
];

function discoverToolchain() {
  let status;
  try {
    status = resolveToolchain({ root });
  } catch {
    return null;
  }
  if (!status.ready) return null;
  return {
    clang: status.paths.clang,
    sysroot: status.paths.sysroot,
    gmpPrefix: status.paths.libraries.gmp.prefix,
    flintPrefix: status.paths.libraries.flint.prefix,
    mpfrPrefix: status.paths.libraries.mpfr.prefix,
    mpcPrefix: status.paths.libraries.mpc.prefix,
  };
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

async function publicWorkflow(resolver) {
  const Repl = require("../dist/tools/repl.js").default;
  let readline;
  const previousResolver = globalThis.__sagejs_wasm_native_resolver__;
  globalThis.__sagejs_wasm_native_resolver__ = resolver;
  try {
    const controller = await Repl({
      input: new PassThrough(),
      output: new PassThrough(),
      console: {
        log() {},
        warn() {},
        error(error) {
          throw error instanceof Error ? error : new Error(String(error));
        },
      },
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
    readline.emit(
      "line",
      [
        "import sagejs.runtime as runtime",
        "from sagejs.linear_algebra.combinatorial import matrix_permanent, matrix_minors",
        "answer=[]",
        "for base in [ZZ, QQ, GF(7)]: A=matrix(base,8,8,[base((i*7+3)%11-5) for i in range(64)])",
        " p=matrix_permanent(A)",
        " B=matrix(base,6,7,[base((i*7+3)%11-5) for i in range(42)])",
        " m=matrix_minors(B,3)",
        " answer.append([str(p),len(m),A._last_combinatorial_acceleration['route'],B._last_combinatorial_acceleration['route'],A._last_combinatorial_acceleration['boundaryCrossings'],B._last_combinatorial_acceleration['boundaryCrossings']])",
        "runtime.reflect.set(runtime.global_object,'__sagejs_combinatorial_wasm_result__',str(answer))",
        "None",
      ].join("; "),
    );
    await controller.drain();
    readline.closed = true;
    readline.emit("close");
    await controller.finished();
    const result = globalThis.__sagejs_combinatorial_wasm_result__;
    delete globalThis.__sagejs_combinatorial_wasm_result__;
    return result;
  } finally {
    if (previousResolver === undefined) {
      delete globalThis.__sagejs_wasm_native_resolver__;
    } else {
      globalThis.__sagejs_wasm_native_resolver__ = previousResolver;
    }
  }
}

async function syntheticManifest(temporary) {
  const manifestPath = join(temporary, "native-kernels.json");
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ kernels: descriptors }, null, 2)}\n`,
  );
  return manifestPath;
}

const toolchain = discoverToolchain();

test("public heavy exact workflows retain an explicit portable route", async () => {
  const previousNativeDisable = process.env.SAGEJS_NATIVE_DISABLE;
  process.env.SAGEJS_NATIVE_DISABLE = "1";
  let session;
  try {
    session = await createSage();
    const result = await session.evaluate([
      "from sagejs.linear_algebra.combinatorial import matrix_permanent, matrix_minors",
      "answer=[]",
      "for base in [ZZ,QQ,GF(7)]:",
      " A=matrix(base,8,8,[base((i*7+3)%11-5) for i in range(64)])",
      " p=matrix_permanent(A)",
      " B=matrix(base,6,7,[base((i*7+3)%11-5) for i in range(42)])",
      " m=matrix_minors(B,3)",
      " answer.append([str(p),len(m),A._last_combinatorial_acceleration['route'],B._last_combinatorial_acceleration['route']])",
      "answer",
    ].join("\n"));
    assert.equal(
      result.repr,
      "[['3903574', 700, 'portable-computation', 'portable-computation'], " +
        "['3903574', 700, 'portable-computation', 'portable-computation'], " +
        "['3', 700, 'portable-computation', 'portable-computation']]",
    );
  } finally {
    await session?.close();
    if (previousNativeDisable === undefined) {
      delete process.env.SAGEJS_NATIVE_DISABLE;
    } else {
      process.env.SAGEJS_NATIVE_DISABLE = previousNativeDisable;
    }
  }
});

test("packed combinatorial fallbacks reject malformed complete shapes", () => {
  const result = spawnSync("/usr/bin/python3", ["-c", String.raw`
import sys
sys.path.insert(0, "src/lib")
from sagejs.kernels.matrix.combinatorial import (
    packed_integer_matrix_minors,
    packed_integer_matrix_permanent,
    packed_prime_matrix_minors,
    packed_rational_matrix_permanent,
)

output = [91]
assert not packed_integer_matrix_permanent(output, [1, 2], [0, 0, 0, 0], 2, 2)
assert output == [91]
assert not packed_integer_matrix_minors([0], [1, 2, 3, 4], [0, 0], [0, 0], 2, 2, 2)
prime_output = [77, 77, 77, 77]
assert not packed_prime_matrix_minors(prime_output, [0, 1, 2, 7], [0, 0], [0, 0], 2, 2, 1, 7)
assert prime_output == [77, 77, 77, 77]
rational_output = [55]
rational_denominator = [66]
assert not packed_rational_matrix_permanent(
    rational_output, rational_denominator,
    [1, 2, 3, 4], [1, 0, 1, 1],
    [0, 0, 0, 0], [0, 0, 0, 0], 2, 2,
)
assert rational_output == [55]
assert rational_denominator == [66]
print("malformed-ok")
`], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PYTHONPATH: "" },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), "malformed-ok");
});

test("all six functions emit isolated size-classed production modules", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-combinatorial-inventory-"));
  try {
    const manifestPath = await syntheticManifest(temporary);
    const inventory = await inventoryProductionKernels({ root, manifestPath });
    assert.equal(inventory.modules.length, 2);
    assert.deepEqual(
      inventory.modules.flatMap((module) =>
        module.functions.map((item) => [item.name, item.status])
      ),
      functions.map((name) => [name, "compiled-source"]),
    );
    assert.deepEqual(
      inventory.modules.map((module) => [
        module.id,
        module.domain,
        module.identity.canonicalCore.audit.nativeDependencies,
      ]),
      [
        [
          "packed-combinatorial-integer-rational-production",
          "gmp",
          ["libc", "libm", "GMP"],
        ],
        [
          "packed-combinatorial-prime-production",
          "flint",
          ["libc", "libm", "GMP", "FLINT"],
        ],
      ],
    );
    for (const module of inventory.modules) {
      assert.equal(module.identity.canonicalCore.audit.hostCallbacks, 0);
      assert.doesNotMatch(
        module.identity.canonicalCore.source,
        /napi_|PyObject|node_api/,
      );
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("real WebAssembly executes direct and public exact batches", {
  skip: toolchain ? false : "the pinned WASI/GMP toolchain is unavailable",
  timeout: 240_000,
}, async (context) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-wasm-combinatorial-"));
  try {
    const manifestPath = await syntheticManifest(temporary);
    const outputRoot = join(temporary, "output");
    const manifest = await buildWasmProductionPacks({
      root,
      manifestPath,
      outputRoot,
      domains: ["gmp", "flint"],
      emitOnly: false,
      toolchain,
    });
    const runtime = await instantiate(manifest, outputRoot);
    const logical = "sagejs/kernels/matrix/combinatorial.py";
    for (const name of functions) {
      const fn = runtime.function(logical, name);
      assert.equal(fn.executionTarget, "wasm");
      assert.equal(fn.sourceTransparent, true);
    }

    const integerPermanent = runtime.function(
      logical,
      "packed_integer_matrix_permanent",
    );
    const entries = Array.from(
      { length: 64 },
      (_unused, index) => BigInt((index * 7 + 3) % 11 - 5),
    );
    const outputValues = [0n];
    const output = { values: outputValues, wordCapacity: 16 };
    const stateValues = Array(256).fill(0n);
    const states = { values: stateValues, wordCapacity: 16 };
    assert.equal(integerPermanent(output, entries, states, 8n, 8n), true);
    assert.equal(outputValues[0], 3903574n);
    const rejectedIntegerOutput = [91n];
    assert.equal(
      integerPermanent(
        { values: rejectedIntegerOutput, wordCapacity: 2 },
        [1n, 2n],
        { values: [0n, 0n, 0n, 0n], wordCapacity: 2 },
        2n,
        2n,
      ),
      false,
    );
    assert.deepEqual(rejectedIntegerOutput, [91n]);

    const primeMinors = runtime.function(logical, "packed_prime_matrix_minors");
    const primeEntries = new BigUint64Array(
      Array.from({ length: 42 }, (_unused, index) => {
        const value = (index * 7 + 3) % 11 - 5;
        return BigInt((value % 7 + 7) % 7);
      }),
    );
    const primeOutput = new BigUint64Array(700);
    assert.equal(
      primeMinors(
        primeOutput,
        primeEntries,
        new BigUint64Array(8),
        new BigUint64Array(6),
        6n,
        7n,
        3n,
        7n,
      ),
      true,
    );
    assert.deepEqual(Array.from(primeOutput.slice(0, 5)), [2n, 4n, 4n, 6n, 1n]);
    const rejectedPrimeOutput = new BigUint64Array([77n, 77n, 77n, 77n]);
    assert.equal(
      primeMinors(
        rejectedPrimeOutput,
        new BigUint64Array([0n, 1n, 2n, 7n]),
        new BigUint64Array(2),
        new BigUint64Array(2),
        2n,
        2n,
        1n,
        7n,
      ),
      false,
    );
    assert.deepEqual(Array.from(rejectedPrimeOutput), [77n, 77n, 77n, 77n]);

    assert.equal(
      await publicWorkflow(runtime),
      "[['3903574', 700, 'wasm-compiled-source', 'wasm-compiled-source', 1, 1], " +
        "['3903574', 700, 'wasm-compiled-source', 'wasm-compiled-source', 1, 1], " +
        "['3', 700, 'wasm-compiled-source', 'wasm-compiled-source', 1, 1]]",
    );

    const samples = [];
    for (let sample = 0; sample < 5; sample += 1) {
      const started = performance.now();
      assert.equal(integerPermanent(output, entries, states, 8n, 8n), true);
      samples.push(performance.now() - started);
    }
    samples.sort((left, right) => left - right);
    context.diagnostic(JSON.stringify({
      route: integerPermanent.executionTarget,
      boundaryCrossingsPerBatch: 1,
      warmMedianMilliseconds: samples[2],
      wasmBytesByDomain: Object.fromEntries(
        manifest.packs
          .filter((pack) => pack.status === "built")
          .map((pack) => [pack.domain, pack.bytes]),
      ),
    }));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
