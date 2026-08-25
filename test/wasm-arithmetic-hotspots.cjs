// sagejs-test-tier: integration
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
const test = require("node:test");

const root = resolve(__dirname, "..");
const {
  buildWasmProductionPacks,
  inventoryProductionKernels,
} = require("../tools/native-kernel/wasm-production-pack.cjs");

const descriptor = {
  id: "packed-moebius-range-production",
  source: "src/lib/sagejs/kernels/arithmetic/moebius.py",
  functions: ["packed_moebius_range"],
  semantic_domain:
    "one bounded exact linear sieve for the public moebius.range(0, stop) " +
    "normal heavy case over caller-owned signed and unsigned packed storage",
  fallback: "same-source",
  host_isolation: "certified",
  oracles: ["cpython", "javascript", "scalar-factorization"],
  benchmark: "bench:wasm-arithmetic-hotspots",
  platforms: ["linux-x64", "linux-arm64", "windows-x64", "macos-arm64"],
};

function discoverToolchain() {
  try {
    return require("../packages/wasm-toolchain/scripts/toolchain.cjs")
      .wasmKernelToolchain({ root });
  } catch {
    return null;
  }
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

async function syntheticManifest(temporary) {
  const manifestPath = join(temporary, "native-kernels.json");
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ kernels: [descriptor] }, null, 2)}\n`,
  );
  return manifestPath;
}

function scalarMoebius(value) {
  if (value === 0) return 0;
  let remaining = Math.abs(value);
  let sign = 1;
  for (let prime = 2; prime * prime <= remaining; prime += 1) {
    if (remaining % prime !== 0) continue;
    remaining /= prime;
    if (remaining % prime === 0) return 0;
    sign = -sign;
    while (remaining % prime === 0) remaining /= prime;
  }
  return remaining > 1 ? -sign : sign;
}

function digest(values) {
  return [
    values.length,
    values.reduce((total, value) => total + Number(value), 0),
    values.reduce((total, value) => total + Math.abs(Number(value)), 0),
    Array.from(values.slice(-10), Number),
  ];
}

async function evaluatePublicRange(resolver) {
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
        "values=moebius.range(10000)",
        "record=moebius._last_range_acceleration",
        "answer=[len(values),sum(values),sum(abs(x) for x in values),values[-10:],record.route,record.reason,record.boundaryCrossings]",
        "runtime.reflect.set(runtime.global_object,'__sagejs_moebius_wasm_result__',str(answer))",
        "None",
      ].join("; "),
    );
    await controller.drain();
    readline.closed = true;
    readline.emit("close");
    await controller.finished();
    const result = globalThis.__sagejs_moebius_wasm_result__;
    delete globalThis.__sagejs_moebius_wasm_result__;
    return result;
  } finally {
    if (previousResolver === undefined) {
      delete globalThis.__sagejs_wasm_native_resolver__;
    } else {
      globalThis.__sagejs_wasm_native_resolver__ = previousResolver;
    }
  }
}

function disabledNativePublicRange() {
  const result = spawnSync(
    process.execPath,
    [join(root, "bin", "sagejs"), "--python"],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
      input: String.raw`
values = moebius.range(10000)
record = moebius._last_range_acceleration
print([len(values), sum(values), sum(abs(x) for x in values), values[-10:],
       record.route, record.reason, record.boundaryCrossings])
assert moebius.range(10) == [0, 1, -1, -1, 0, -1, 1, -1, 0, 0]
assert moebius._last_range_acceleration.reason == "below-packed-threshold"
assert moebius.range(-5, 5) == [-1, 0, -1, -1, 1, 0, 1, -1, -1, 0]
assert moebius._last_range_acceleration.reason == "exceptional-range"
assert moebius.range(2097153, 2097152) == []
`,
      timeout: 30_000,
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim().split("\n")[0];
}

const toolchain = discoverToolchain();

test("the same-source linear sieve agrees with independent scalar factorization", () => {
  const oracle = spawnSync("python3", ["-c", String.raw`
import json
import sys
sys.path.insert(0, "src/lib")
from sagejs.kernels.arithmetic.moebius import packed_moebius_range

def scalar(value):
    if value == 0:
        return 0
    remaining = abs(value)
    sign = 1
    prime = 2
    while prime * prime <= remaining:
        if remaining % prime == 0:
            remaining //= prime
            if remaining % prime == 0:
                return 0
            sign = -sign
            while remaining % prime == 0:
                remaining //= prime
        prime += 1
    return -sign if remaining > 1 else sign

for stop in (0, 1, 2, 3, 10, 257, 10000):
    output = [91] * stop
    workspace = [92] * (2 * stop)
    assert packed_moebius_range(output, workspace, stop)
    assert output == [scalar(value) for value in range(stop)]

output = [91, 91]
workspace = [92, 92]
assert not packed_moebius_range(output, workspace, 2)
assert output == [91, 91] and workspace == [92, 92]
print(json.dumps("cpython-scalar-oracle-ok"))
`], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PYTHONPATH: "" },
  });
  assert.equal(oracle.status, 0, oracle.stderr || oracle.stdout);
  assert.equal(JSON.parse(oracle.stdout), "cpython-scalar-oracle-ok");
});

test("the public disabled-native route preserves exact and exceptional semantics", () => {
  assert.equal(
    disabledNativePublicRange(),
    "[10000, -23, 6083, [0, 1, 0, 1, -1, 1, 0, 1, 1, 0], " +
      "'portable-computation', 'compiled-source-unavailable', 0]",
  );
});

test("the packed sieve emits one inspected host-isolated core", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-moebius-inventory-"));
  try {
    const manifestPath = await syntheticManifest(temporary);
    const inventory = await inventoryProductionKernels({ root, manifestPath });
    assert.equal(inventory.modules.length, 1);
    const module = inventory.modules[0];
    assert.deepEqual(
      module.functions.map((item) => [item.name, item.status]),
      [["packed_moebius_range", "compiled-source"]],
    );
    assert.equal(module.identity.canonicalCore.audit.hostCallbacks, 0);
    assert.match(module.identity.sourceHash, /^[a-f0-9]{64}$/);
    assert.match(module.identity.coreHash, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(
      module.identity.canonicalCore.source,
      /napi_|PyObject|node_api/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("direct and public Node-Wasm execute one authenticated packed batch", {
  skip: toolchain ? false : "the pinned WASI/GMP toolchain is unavailable",
  timeout: 180_000,
}, async (context) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-wasm-moebius-"));
  try {
    const manifestPath = await syntheticManifest(temporary);
    const outputRoot = join(temporary, "output");
    const manifest = await buildWasmProductionPacks({
      root,
      manifestPath,
      outputRoot,
      domains: ["gmp"],
      emitOnly: false,
      toolchain,
    });
    const runtime = await instantiate(manifest, outputRoot);
    const logical = "sagejs/kernels/arithmetic/moebius.py";
    const packed = runtime.function(logical, "packed_moebius_range");
    assert.equal(packed.executionTarget, "wasm");
    assert.equal(packed.sourceTransparent, true);
    assert.equal(packed.nativeAvailable, true);

    const stop = 100_000;
    const output = new BigInt64Array(stop);
    const workspace = new BigUint64Array(2 * stop);
    assert.equal(packed(output, workspace, BigInt(stop)), true);
    assert.deepEqual(
      Array.from(output, Number),
      Array.from({ length: stop }, (_unused, value) => scalarMoebius(value)),
    );

    const malformedOutput = new BigInt64Array([91n, 91n]);
    const malformedWorkspace = new BigUint64Array([92n, 92n]);
    assert.equal(packed(malformedOutput, malformedWorkspace, 2n), false);
    assert.deepEqual(Array.from(malformedOutput), [91n, 91n]);
    assert.deepEqual(Array.from(malformedWorkspace), [92n, 92n]);

    const { createCapabilityDispatchTrace, capabilityTraceInstrumentation } =
      await import("../packages/flint-wasm/capability-trace.mjs");
    const { instrumentAuthenticatedWasmKernelResolver } = await import(
      "../tools/native-kernel/wasm-pack-loader.mjs"
    );
    const trace = createCapabilityDispatchTrace();
    const resolver = instrumentAuthenticatedWasmKernelResolver(
      runtime,
      (capabilityId, arguments_, value) => {
        const byteLength = (item) =>
          ArrayBuffer.isView(item) ? item.byteLength :
            (typeof item === "bigint" || typeof item === "number" ||
                typeof item === "boolean" ? 8 : 0);
        trace.record(capabilityId, "receipt-backed-wasm-artifact", {
          executionTarget: "wasm-artifact",
          ingressBytes: arguments_.reduce(
            (total, item) => total + byteLength(item),
            0,
          ),
          egressBytes: byteLength(value),
        });
      },
    );
    const publicResult = await evaluatePublicRange(resolver);
    assert.equal(
      publicResult,
      "[10000, -23, 6083, [0, 1, 0, 1, -1, 1, 0, 1, 1, 0], " +
        "'wasm-compiled-source', 'normal-heavy-case', 1]",
    );
    const instrumentation = capabilityTraceInstrumentation(trace);
    assert.deepEqual(
      instrumentation.routes.map((record) => [
        record.capability_id,
        record.selected_route,
        record.execution_target,
        record.call_count,
      ]),
      [[
        "kernel:packed-moebius-range-production",
        "receipt-backed-wasm-artifact",
        "wasm-artifact",
        1,
      ]],
    );
    assert.equal(instrumentation.boundary_crossings, 1);
    assert.equal(
      disabledNativePublicRange().replace(
        "'portable-computation', 'compiled-source-unavailable', 0",
        "'wasm-compiled-source', 'normal-heavy-case', 1",
      ),
      publicResult,
    );

    const warmSamples = [];
    for (let sample = 0; sample < 5; sample += 1) {
      const started = performance.now();
      assert.equal(packed(output, workspace, BigInt(stop)), true);
      warmSamples.push(performance.now() - started);
    }
    warmSamples.sort((left, right) => left - right);
    assert.ok(
      warmSamples[2] < 1000,
      `100,000 exact Möbius values took ${warmSamples[2]} ms`,
    );
    context.diagnostic(JSON.stringify({
      route: packed.executionTarget,
      sourceTransparent: packed.sourceTransparent,
      values: stop,
      boundaryCrossingsPerBatch: 1,
      warmMedianMilliseconds: warmSamples[2],
      digest: digest(output),
      wasmBytes: manifest.packs.find((pack) => pack.status === "built").bytes,
    }));
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
