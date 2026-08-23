// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join, relative, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");
const { PassThrough } = require("node:stream");
const test = require("node:test");

const root = resolve(__dirname, "..");
const packageRoot = join(root, "packages", "flint-wasm");
const {
  buildWasmProductionPacks,
  inventoryProductionKernels,
} = require("../tools/native-kernel/wasm-production-pack.cjs");
const {
  resolveToolchain,
} = require("../packages/flint-wasm/scripts/wasm-toolchain.cjs");
const { createSage } = require("../dist/tools/kernel.js");
const {
  PRECOMPILED_MODULE_FILENAME,
  PRECOMPILED_PACKAGE_PATH,
  canonicalizeJavascriptTemplate,
  sha256,
} = require("../scripts/lazy-module-provenance.cjs");

const descriptor = {
  id: "packed-graph-shortest-paths-production",
  source: "src/lib/sagejs/kernels/graph/shortest_paths.py",
  functions: [
    "packed_graph_shortest_paths",
    "packed_graph_all_pairs_distances",
  ],
  semantic_domain:
    "bounded insertion-order single-source and all-pairs unweighted graph " +
    "distances over packed directed or undirected multigraph endpoints",
  fallback: "same-source",
  host_isolation: "certified",
  oracles: ["cpython", "javascript", "sage", "portable-edge-scan-bfs"],
  benchmark: "bench:wasm-graph-shortest-paths",
  platforms: ["linux-x64", "linux-arm64", "windows-x64", "macos-arm64"],
};

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

function chromiumPath() {
  for (const candidate of [
    process.env.SAGEJS_CHROMIUM_PATH,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ]) {
    if (candidate && existsSync(candidate)) return candidate;
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

function syntheticManifest(directory) {
  const manifestPath = join(directory, "native-kernels.json");
  writeFileSync(
    manifestPath,
    `${JSON.stringify({ kernels: [descriptor] }, null, 2)}\n`,
  );
  return manifestPath;
}

async function publicNodeWorkflow(resolver) {
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
    readline.emit("line", [
      "import sagejs.runtime as runtime",
      "G=graphs.CycleGraph(1000)",
      "path=G.shortest_path(0,500)",
      "single=[len(path),G._last_shortest_paths_acceleration.route,G._last_shortest_paths_acceleration.boundaryCrossings]",
      "H=graphs.CycleGraph(120)",
      "expected=H._portable_distances_all_pairs()",
      "actual=H.distances_all_pairs()",
      "pairs=[actual==expected,actual[0][60],H._last_shortest_paths_acceleration.route,H._last_shortest_paths_acceleration.boundaryCrossings]",
      "runtime.reflect.set(runtime.global_object,'__sagejs_graph_shortest_wasm_result__',str([single,pairs]))",
      "None",
    ].join("; "));
    await controller.drain();
    readline.closed = true;
    readline.emit("close");
    await controller.finished();
    const answer = globalThis.__sagejs_graph_shortest_wasm_result__;
    delete globalThis.__sagejs_graph_shortest_wasm_result__;
    return answer;
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

function filesBelow(directory) {
  if (!existsSync(directory)) return [];
  const answer = [];
  for (const entry of readdirSync(directory)) {
    const filename = join(directory, entry);
    if (statSync(filename).isDirectory()) answer.push(...filesBelow(filename));
    else answer.push(filename);
  }
  return answer;
}

function stageBrowserLazyBundle(temporary, browserOutput) {
  const cacheHome = join(temporary, "browser-module-cache");
  const generated = spawnSync(process.execPath, [join(root, "bin", "sagejs"), "--python"], {
    cwd: root,
    encoding: "utf8",
    input: "import sagejs.kernels.graph.shortest_paths\n",
    env: {
      ...process.env,
      XDG_CACHE_HOME: cacheHome,
      SAGEJS_PRECOMPILED_MODULE_CACHE_DIR: join(temporary, "missing-modules"),
      SAGEJS_PRECOMPILED_DYNAMIC_CACHE_DIR: join(temporary, "missing-dynamic"),
    },
  });
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);
  const requested = new Map([
    ["sagejs.kernels.graph", [
      "sagejs.kernels.graph.components",
      "sagejs.kernels.graph.shortest_paths",
    ]],
    ["sagejs.kernels.graph.components", ["sagejs.native"]],
    ["sagejs.kernels.graph.shortest_paths", ["sagejs.native"]],
  ]);
  const cached = new Map();
  for (const filename of filesBelow(cacheHome).filter((name) => name.endsWith(".json"))) {
    const record = JSON.parse(readFileSync(filename, "utf8"));
    if (typeof record.filename !== "string" || typeof record.javascript !== "string") {
      continue;
    }
    for (const name of requested.keys()) {
      const expected = name.endsWith(".graph")
        ? "sagejs/kernels/graph/__init__.py"
        : `${name.replaceAll(".", "/")}.py`;
      if (record.filename.replaceAll("\\", "/").endsWith(expected)) {
        cached.set(name, record);
      }
    }
  }
  assert.equal(cached.size, requested.size, "graph lazy modules were not compiled");
  const bundle = JSON.parse(
    readFileSync(join(packageRoot, "dist", "lazy-modules.json"), "utf8"),
  );
  for (const [name, dependencies] of requested) {
    const compiled = cached.get(name);
    const canonical = canonicalizeJavascriptTemplate({
      name,
      sourceFilename: compiled.filename,
      javascript: compiled.javascript,
      repositoryRoot: root,
    });
    const source = name.endsWith(".graph")
      ? "sagejs/kernels/graph/__init__.py"
      : `${name.replaceAll(".", "/")}.py`;
    const sourceContents = readFileSync(join(root, "src", "lib", source));
    const templateRecord = {
      schema: "sagejs.lazy-module-template/v1",
      version: compiled.version,
      signature: compiled.signature,
      mode: compiled.mode,
      module: name,
      package: canonical.package,
      filenameMarker: PRECOMPILED_MODULE_FILENAME,
      packagePathMarker: canonical.package ? PRECOMPILED_PACKAGE_PATH : null,
      javascriptTemplate: canonical.javascriptTemplate,
    };
    bundle.modules[name] = {
      resource: `${name.replaceAll(".", "-")}.json`,
      resourceSha256: sha256(JSON.stringify(templateRecord)),
      source,
      sourceSha256: sha256(sourceContents),
      signature: compiled.signature,
      version: compiled.version,
      mode: compiled.mode,
      package: canonical.package,
      filename: canonical.filename,
      packagePath: canonical.packagePath,
      dependencies,
      javascriptTemplate: canonical.javascriptTemplate,
    };
  }
  bundle.modules = Object.fromEntries(
    Object.keys(bundle.modules).sort().map((name) => [name, bundle.modules[name]]),
  );
  const filename = join(browserOutput, "lazy-modules.json");
  writeFileSync(filename, `${JSON.stringify(bundle)}\n`);
  return filename;
}

const toolchain = discoverToolchain();

test("heavy public shortest paths expose the exact installed route", async () => {
  const session = await createSage();
  try {
    const result = await session.evaluate([
      "G=graphs.CycleGraph(1000)",
      "portable_distances,portable_parents=G._shortest_index_data(0)",
      "path=G.shortest_path(0,500)",
      "single=[len(path),G._last_shortest_paths_acceleration.route,G._last_shortest_paths_acceleration.reason]",
      "H=graphs.CycleGraph(120)",
      "expected=H._portable_distances_all_pairs()",
      "actual=H.distances_all_pairs()",
      "[single,actual==expected,H._last_shortest_paths_acceleration.route,H._last_shortest_paths_acceleration.reason]",
    ].join("\n"));
    assert.ok([
      "[[501, 'portable-computation', 'compiled-source-unavailable'], " +
        "True, 'portable-computation', 'compiled-source-unavailable']",
      "[[501, 'native-compiled-source', 'normal-heavy-case'], " +
        "True, 'native-compiled-source', 'normal-heavy-case']",
    ].includes(result.repr), result.repr);
  } finally {
    await session.close();
  }
});

test("CPython fallback differentials cover directed, disconnected, and bounds", () => {
  const result = spawnSync("/usr/bin/python3", ["-c", String.raw`
import random
import sys
sys.path.insert(0, "src/lib")
from sagejs.kernels.graph.shortest_paths import (
    graph_shortest_paths_workspace_length,
    packed_graph_all_pairs_distances,
    packed_graph_shortest_paths,
)

def oracle(n, edges, directed, source):
    adjacent = [[] for _ in range(n)]
    for left, right in edges:
        adjacent[left].append(right)
        if not directed and right != left:
            adjacent[right].append(left)
    distances = [n] * n
    parents = [n] * n
    distances[source] = 0
    queue = [source]
    for current in queue:
        for target in adjacent[current]:
            if distances[target] == n:
                distances[target] = distances[current] + 1
                parents[target] = current
                queue.append(target)
    return distances, parents

random.seed(20260821)
for directed in (0, 1):
    for n in range(1, 18):
        edges = []
        for _ in range(2 * n):
            edges.append((random.randrange(n), random.randrange(n)))
        flat = [entry for edge in edges for entry in edge]
        all_pairs = [0] * (n * n)
        workspace = [0] * graph_shortest_paths_workspace_length(n, len(flat))
        assert packed_graph_all_pairs_distances(
            all_pairs, flat, workspace, n, len(flat), directed,
            n * (n + len(flat)),
        ) == 0
        for source in range(n):
            expected_distances, expected_parents = oracle(n, edges, directed, source)
            distances = [0] * n
            parents = [0] * n
            workspace = [0] * graph_shortest_paths_workspace_length(n, len(flat))
            assert packed_graph_shortest_paths(
                distances, parents, flat, workspace, n, len(flat), directed,
                source, n + len(flat),
            ) == 0
            assert distances == expected_distances
            assert parents == expected_parents
            assert all_pairs[source*n:(source+1)*n] == expected_distances

distances = [91, 92, 93]
parents = [81, 82, 83]
workspace = [0] * graph_shortest_paths_workspace_length(3, 2)
assert packed_graph_shortest_paths(
    distances, parents, [0, 3], workspace, 3, 2, 0, 0, 99,
) == 1
assert distances == [91, 92, 93] and parents == [81, 82, 83]

edges = [0, 1, 1, 2]
workspace = [0] * graph_shortest_paths_workspace_length(3, len(edges))
assert packed_graph_shortest_paths(
    distances, parents, edges, workspace, 3, len(edges), 0, 0, 1,
) == 2
workspace = [0] * graph_shortest_paths_workspace_length(3, len(edges))
assert packed_graph_shortest_paths(
    distances, parents, edges, workspace, 3, len(edges), 0, 0, 7,
) == 0
assert distances == [0, 1, 2]
print("differential-ok")
`], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PYTHONPATH: "" },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), "differential-ok");
});

test("both kernels emit one source-provenant isolated core", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-graph-shortest-inventory-"));
  try {
    const manifestPath = syntheticManifest(temporary);
    const inventory = await inventoryProductionKernels({ root, manifestPath });
    assert.equal(inventory.modules.length, 1);
    const module = inventory.modules[0];
    assert.deepEqual(
      module.functions.map((item) => [item.name, item.status]),
      descriptor.functions.map((name) => [name, "compiled-source"]),
    );
    assert.equal(module.identity.canonicalCore.audit.hostCallbacks, 0);
    assert.deepEqual(
      module.identity.canonicalCore.audit.nativeDependencies,
      ["libc", "libm", "GMP"],
    );
    assert.match(module.identity.sourceHash, /^[a-f0-9]{64}$/);
    assert.match(module.identity.coreHash, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(module.identity.canonicalCore.source, /napi_|PyObject|node_api/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("real Wasm executes direct and public Node/browser shortest paths", {
  skip: toolchain ? false : "the pinned WASI/GMP toolchain is unavailable",
  timeout: 360_000,
}, async (context) => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-wasm-graph-shortest-"));
  const browserOutput = mkdtempSync(join(packageRoot, ".graph-shortest-wasm-"));
  try {
    const manifestPath = syntheticManifest(temporary);
    const manifest = await buildWasmProductionPacks({
      root,
      manifestPath,
      outputRoot: browserOutput,
      domains: ["gmp"],
      emitOnly: false,
      toolchain,
    });
    const runtime = await instantiate(manifest, browserOutput);
    const logical = "sagejs/kernels/graph/shortest_paths.py";
    const single = runtime.function(logical, "packed_graph_shortest_paths");
    const allPairs = runtime.function(
      logical,
      "packed_graph_all_pairs_distances",
    );
    for (const fn of [single, allPairs]) {
      assert.equal(fn.executionTarget, "wasm");
      assert.equal(fn.sourceTransparent, true);
      assert.equal(fn.nativeAvailable, true);
    }

    const order = 10_000;
    const edges = cycleEdges(order);
    const distances = new BigUint64Array(order);
    const parents = new BigUint64Array(order);
    const workspace = new BigUint64Array(3 * order + 1 + edges.length);
    assert.equal(
      single(
        distances,
        parents,
        edges,
        workspace,
        BigInt(order),
        BigInt(edges.length),
        0n,
        0n,
        BigInt(order + edges.length),
      ),
      0n,
    );
    assert.equal(distances[5000], 5000n);
    assert.equal(parents[5000], 4999n);

    const pairOrder = 120;
    const pairEdges = cycleEdges(pairOrder);
    const pairDistances = new BigUint64Array(pairOrder * pairOrder);
    assert.equal(
      allPairs(
        pairDistances,
        pairEdges,
        new BigUint64Array(3 * pairOrder + 1 + pairEdges.length),
        BigInt(pairOrder),
        BigInt(pairEdges.length),
        0n,
        BigInt(pairOrder * (pairOrder + pairEdges.length)),
      ),
      0n,
    );
    assert.equal(pairDistances[60], 60n);
    assert.equal(pairDistances[60 * pairOrder], 60n);

    const { instrumentAuthenticatedWasmKernelResolver } = await import(
      "../tools/native-kernel/wasm-pack-loader.mjs"
    );
    const privateCalls = [];
    const observed = instrumentAuthenticatedWasmKernelResolver(
      runtime,
      (capabilityId, arguments_) => {
        privateCalls.push({ capabilityId, argumentCount: arguments_.length });
      },
    );
    assert.throws(
      () => instrumentAuthenticatedWasmKernelResolver({ ...runtime }, () => {}),
      /no authenticated pack identity/,
    );
    assert.equal(
      await publicNodeWorkflow(observed),
      "[[501, 'wasm-compiled-source', 1], [True, 60, " +
        "'wasm-compiled-source', 1]]",
    );
    assert.deepEqual(privateCalls, [
      {
        capabilityId: "kernel:packed-graph-shortest-paths-production",
        argumentCount: 9,
      },
      {
        capabilityId: "kernel:packed-graph-shortest-paths-production",
        argumentCount: 7,
      },
    ]);

    const executablePath = chromiumPath();
    const browserBuildReady = existsSync(join(packageRoot, "dist", "baselib.js"));
    if (!executablePath || !browserBuildReady) {
      context.diagnostic(
        "public Chromium subtest skipped: build packages/flint-wasm and install Chromium",
      );
    } else {
      const browserLazyModules = stageBrowserLazyBundle(temporary, browserOutput);
      const { chromium } = require("playwright-core");
      const { createBrowserWasmServer } = await import(
        "../packages/flint-wasm/test/browser-wasm-support.mjs"
      );
      const server = await createBrowserWasmServer();
      const browser = await chromium.launch({
        executablePath,
        headless: true,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      });
      try {
        const page = await browser.newPage();
        const relativeManifest = relative(packageRoot, join(browserOutput, "index.json"))
          .split("\\").join("/");
        const relativeLazyModules = relative(packageRoot, browserLazyModules)
          .split("\\").join("/");
        await page.addInitScript(([nativeKernels, lazyModules]) => {
          window.__sagejsTestOptions = { nativeKernels, lazyModules };
        }, [`/${relativeManifest}`, `/${relativeLazyModules}`]);
        await page.goto(`${server.origin}/browser-wasm-harness.html`, {
          waitUntil: "load",
        });
        await page.waitForFunction(() => window.__sagejsReady !== undefined);
        await page.evaluate(() => window.__sagejsReady);
        const result = await page.evaluate(
          ([source, timeout]) => window.__sagejsTest.evaluate(source, timeout),
          [[
            "G=graphs.CycleGraph(1000)",
            "path=G.shortest_path(0,500)",
            "H=graphs.CycleGraph(120)",
            "pairs=H.distances_all_pairs()",
            "[len(path),pairs[0][60],G._last_shortest_paths_acceleration.route,H._last_shortest_paths_acceleration.route]",
          ].join("\n"), 120000],
        );
        assert.equal(
          result.repr,
          "[501, 60, 'wasm-compiled-source', 'wasm-compiled-source']",
        );
        assert.match(
          JSON.stringify(result.instrumentation),
          /kernel:packed-graph-shortest-paths-production/,
        );
        assert.match(
          JSON.stringify(result.instrumentation),
          /receipt-backed-wasm-artifact/,
        );

        const interrupted = await page.evaluate(() =>
          window.__sagejsTest.replaceDuring(
            "interrupt",
            "G=graphs.CycleGraph(2048)\nG.distances_all_pairs()",
            30,
          ));
        assert.equal(interrupted.rejected, true);
        const after = await page.evaluate(
          ([source, timeout]) => window.__sagejsTest.evaluate(source, timeout),
          ["graphs.PathGraph(5).shortest_path(0,4)", 120000],
        );
        assert.equal(after.repr, "[0, 1, 2, 3, 4]");
      } finally {
        await browser.close();
        await server.close();
      }
    }

    context.diagnostic(JSON.stringify({
      route: single.executionTarget,
      sourceTransparent: single.sourceTransparent,
      vertices: order,
      boundaryCrossingsPerBatch: 1,
      wasmBytes: manifest.packs.find((pack) => pack.status === "built").bytes,
    }));
  } finally {
    rmSync(browserOutput, { recursive: true, force: true });
    rmSync(temporary, { recursive: true, force: true });
  }
});
