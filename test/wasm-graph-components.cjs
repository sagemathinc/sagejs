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
const { createSage } = require("../dist/tools/kernel.js");

function discoverToolchain() {
  const common = spawnSync("git", ["rev-parse", "--git-common-dir"], {
    cwd: root,
    encoding: "utf8",
  }).stdout.trim();
  const store = resolve(root, common, "sagejs-wasm-toolchains", "v1");
  if (!existsSync(store)) return null;
  for (const generation of readdirSync(store).sort().reverse()) {
    const cowasm = join(store, generation, "cowasm");
    const sdk = join(
      cowasm,
      "core/build/build/wasi-sdk/dist/wasi-sdk-next/native",
    );
    const toolchain = {
      clang: join(sdk, "bin/clang"),
      sysroot: join(sdk, "share/wasi-sysroot"),
      gmpPrefix: join(cowasm, "sagemath/gmp/dist/wasi-sdk"),
      flintPrefix: "unused",
      mpfrPrefix: "unused",
      mpcPrefix: "unused",
    };
    if (
      existsSync(toolchain.clang) &&
      existsSync(join(toolchain.gmpPrefix, "lib/libgmp.a"))
    ) return toolchain;
  }
  return null;
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

async function evaluatePublicGraphWithResolver(resolver) {
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
      "import sagejs.runtime as runtime; " +
        "G=graphs.CycleGraph(500); " +
        "expected=G._portable_connected_components(False); " +
        "actual=G.connected_components(); " +
        "runtime.reflect.set(runtime.global_object, " +
        "'__sagejs_graph_wasm_public_result__', " +
        "str([actual == expected, len(actual[0]), " +
        "G._last_components_acceleration.route, " +
        "G._last_components_acceleration.boundaryCrossings]));",
    );
    await controller.drain();
    readline.closed = true;
    readline.emit("close");
    await controller.finished();
    const result = globalThis.__sagejs_graph_wasm_public_result__;
    delete globalThis.__sagejs_graph_wasm_public_result__;
    return result;
  } finally {
    if (previousResolver === undefined) {
      delete globalThis.__sagejs_wasm_native_resolver__;
    } else {
      globalThis.__sagejs_wasm_native_resolver__ = previousResolver;
    }
  }
}

function cycleEdges(order) {
  const edges = new BigUint64Array(2 * order);
  for (let vertex = 0; vertex < order; vertex += 1) {
    edges[2 * vertex] = BigInt(vertex);
    edges[2 * vertex + 1] = BigInt((vertex + 1) % order);
  }
  return edges;
}

function expectedCycleTraversal(order) {
  const answer = [0n];
  for (let distance = 1; distance <= Math.floor(order / 2); distance += 1) {
    answer.push(BigInt(distance));
    const reverse = order - distance;
    if (reverse !== distance) answer.push(BigInt(reverse));
  }
  return answer;
}

const toolchain = discoverToolchain();

test("the public Graph and DiGraph workflows report the installed packed route", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "G = graphs.CycleGraph(500)",
      "expected = G._portable_connected_components(False)",
      "actual = G.connected_components()",
      "D = DiGraph(500)",
      "D.add_edges([(i+1,i) for i in range(499)])",
      "directed_expected = D._portable_connected_components(False)",
      "directed_actual = D.connected_components()",
      "[actual == expected, directed_actual == directed_expected,",
      " G._last_components_acceleration.route,",
      " G._last_components_acceleration.reason,",
      " len(actual[0]), len(directed_actual[0])]",
    ].join("\n"));
    assert.ok([
      "[True, True, 'portable-computation', " +
        "'compiled-source-unavailable', 500, 500]",
      "[True, True, 'native-compiled-source', " +
        "'normal-heavy-case', 500, 500]",
    ].includes(result.repr), result.repr);
  } finally {
    await session.close();
  }
});

test("CPython fallback preserves the packed traversal contract", () => {
  const oracle = spawnSync("python3", ["-c", String.raw`
import json
import sys
sys.path.insert(0, "src/lib")
from sagejs.kernels.graph.components import (
    graph_components_workspace_length,
    packed_graph_components,
)

order = 17
edges = []
for vertex in range(order):
    edges.extend([vertex, (vertex + 1) % order])
traversal = [0] * order
offsets = [0] * (order + 1)
workspace = [0] * graph_components_workspace_length(order, len(edges))
count = packed_graph_components(
    traversal, offsets, edges, workspace, order, len(edges), 0
)
print(json.dumps([count, traversal, offsets[:count + 1]]))
`], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PYTHONPATH: "" },
  });
  assert.equal(oracle.status, 0, oracle.stderr || oracle.stdout);
  assert.deepEqual(JSON.parse(oracle.stdout), [
    1,
    expectedCycleTraversal(17).map(Number),
    [0, 17],
  ]);
});

test("packed graph components emit an isolated inspected production core", async () => {
  const inventory = await inventoryProductionKernels({
    root,
    manifestPath: join(root, "architecture/native-kernels.json"),
  });
  const kernel = inventory.modules.find(
    (item) => item.id === "packed-graph-components-production",
  );
  assert.ok(kernel);
  assert.deepEqual(kernel.functions.map((item) => item.name), [
    "packed_graph_components",
  ]);
  assert.equal(kernel.functions[0].status, "compiled-source");
  assert.equal(kernel.identity.canonicalCore.audit.hostCallbacks, 0);
  assert.deepEqual(
    kernel.identity.canonicalCore.audit.nativeDependencies,
    ["libc", "libm", "GMP"],
  );
  assert.match(kernel.identity.sourceHash, /^[a-f0-9]{64}$/);
  assert.match(kernel.identity.coreHash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(kernel.identity.canonicalCore.source, /napi_|PyObject|node_api/);
});

test("the exact graph traversal executes as real WebAssembly in one batch", {
  skip: toolchain ? false : "the pinned WASI/GMP toolchain is unavailable",
  timeout: 180_000,
}, async (context) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-wasm-graph-components-"));
  try {
    const registered = JSON.parse(
      readFileSync(join(root, "architecture/native-kernels.json"), "utf8"),
    );
    const kernel = registered.kernels.find(
      (item) => item.id === "packed-graph-components-production",
    );
    assert.ok(kernel);
    const manifestPath = join(temporary, "native-kernels.json");
    writeFileSync(
      manifestPath,
      `${JSON.stringify({ kernels: [kernel] }, null, 2)}\n`,
    );
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
    const components = runtime.function(
      "sagejs/kernels/graph/components.py",
      "packed_graph_components",
    );
    assert.equal(components.executionTarget, "wasm");
    assert.equal(components.sourceTransparent, true);
    assert.equal(components.nativeAvailable, true);

    const order = 10_000;
    const edges = cycleEdges(order);
    const traversal = new BigUint64Array(order);
    const offsets = new BigUint64Array(order + 1);
    const workspace = new BigUint64Array(7 * order + 2 + edges.length);
    const count = components(
      traversal,
      offsets,
      edges,
      workspace,
      BigInt(order),
      BigInt(edges.length),
      0n,
    );
    assert.equal(count, 1n);
    assert.equal(offsets[0], 0n);
    assert.equal(offsets[1], BigInt(order));
    assert.deepEqual(Array.from(traversal), expectedCycleTraversal(order));

    assert.equal(
      await evaluatePublicGraphWithResolver(runtime),
      "[True, 500, 'wasm-compiled-source', 1]",
    );

    const warmSamples = [];
    for (let sample = 0; sample < 5; sample += 1) {
      const started = performance.now();
      assert.equal(
        components(
          traversal,
          offsets,
          edges,
          workspace,
          BigInt(order),
          BigInt(edges.length),
          0n,
        ),
        1n,
      );
      warmSamples.push(performance.now() - started);
    }
    warmSamples.sort((left, right) => left - right);
    assert.ok(
      warmSamples[2] < 1000,
      `10,000-vertex packed Wasm traversal took ${warmSamples[2]} ms`,
    );
    context.diagnostic(JSON.stringify({
      route: components.executionTarget,
      sourceTransparent: components.sourceTransparent,
      vertices: order,
      edges: order,
      boundaryCrossingsPerBatch: 1,
      warmMedianMilliseconds: warmSamples[2],
      wasmBytes: manifest.packs.find((pack) => pack.status === "built").bytes,
    }));

    const badEdges = new BigUint64Array([0n, 3n]);
    const badTraversal = new BigUint64Array(3);
    const badOffsets = new BigUint64Array(4);
    const badWorkspace = new BigUint64Array(7 * 3 + 2 + badEdges.length);
    assert.equal(
      components(
        badTraversal,
        badOffsets,
        badEdges,
        badWorkspace,
        3n,
        2n,
        0n,
      ),
      4n,
    );
    assert.deepEqual(Array.from(badTraversal), [0n, 0n, 0n]);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
