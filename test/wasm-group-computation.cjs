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
  writeFileSync,
} = require("node:fs");
const http = require("node:http");
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

const descriptor = {
  id: "packed-permutation-center-production",
  source: "src/lib/sagejs/kernels/groups/permutation.py",
  functions: ["packed_permutation_center"],
  semantic_domain:
    "bounded breadth-first permutation closure and exact centrality against " +
    "packed generators for the public degree-8 center workflow",
  fallback: "same-source",
  host_isolation: "certified",
  oracles: ["cpython", "javascript", "portable-permutation-objects"],
  benchmark: "bench:wasm-group-computation",
  platforms: ["linux-x64", "linux-arm64", "windows-x64", "macos-arm64"],
};

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
    readline.emit(
      "line",
      [
        "import sagejs.runtime as runtime",
        "G=PermutationGroup(['(1,2,3,4,5,6,7,8)','(1,2)'])",
        "expected=G._portable_center().gens()",
        "H=PermutationGroup(['(1,2,3,4,5,6,7,8)','(1,2)'])",
        "actual=H.center().gens()",
        "r=H._last_center_acceleration",
        "answer=[H.order(),repr(actual)==repr(expected),r.route,r.reason,r.boundaryCrossings,r.work,r.maxWork]",
        "runtime.reflect.set(runtime.global_object,'__sagejs_group_wasm_result__',str(answer))",
        "None",
      ].join("; "),
    );
    await controller.drain();
    readline.closed = true;
    readline.emit("close");
    await controller.finished();
    const result = globalThis.__sagejs_group_wasm_result__;
    delete globalThis.__sagejs_group_wasm_result__;
    return result;
  } finally {
    if (previousResolver === undefined) {
      delete globalThis.__sagejs_wasm_native_resolver__;
    } else {
      globalThis.__sagejs_wasm_native_resolver__ = previousResolver;
    }
  }
}

function symmetricEightGenerators() {
  return new BigUint64Array([
    2n, 3n, 4n, 5n, 6n, 7n, 8n, 1n,
    2n, 1n, 3n, 4n, 5n, 6n, 7n, 8n,
  ]);
}

function disabledNativePublicCenter() {
  const result = spawnSync(
    process.execPath,
    [join(root, "bin", "sagejs"), "--python"],
    {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
      input: [
        "G=PermutationGroup(['(1,2,3,4,5,6,7,8)','(1,2)'])",
        "expected=G._portable_center().gens()",
        "H=PermutationGroup(['(1,2,3,4,5,6,7,8)','(1,2)'])",
        "actual=H.center().gens()",
        "r=H._last_center_acceleration",
        "print([H.order(),repr(actual)==repr(expected),r.route,r.reason,r.boundaryCrossings,r.work])",
      ].join("\n"),
      timeout: 30_000,
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim().split("\n")[0];
}

async function createProxyServer(upstreamOrigin, manifest, outputRoot) {
  const browserSupport = await import(
    "../packages/flint-wasm/test/browser-wasm-support.mjs"
  );
  const manifestText = JSON.stringify(manifest);
  const packAssets = new Map(
    manifest.packs.map((pack) => [
      `/group-native/${pack.asset}`,
      join(outputRoot, pack.asset),
    ]),
  );
  const server = http.createServer((request, response) => {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/group-native/index.json") {
      response.writeHead(200, {
        ...browserSupport.securityHeaders,
        "Content-Type": "application/json; charset=utf-8",
      });
      response.end(manifestText);
      return;
    }
    const pack = packAssets.get(url.pathname);
    if (pack !== undefined) {
      response.writeHead(200, {
        ...browserSupport.securityHeaders,
        "Content-Type": "application/wasm",
      });
      response.end(readFileSync(pack));
      return;
    }
    const upstream = new URL(request.url, upstreamOrigin);
    const proxy = http.request(upstream, {
      method: request.method,
      headers: request.headers,
    }, (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode ?? 500,
        upstreamResponse.headers,
      );
      upstreamResponse.pipe(response);
    });
    proxy.on("error", (error) => {
      response.writeHead(502).end(String(error));
    });
    request.pipe(proxy);
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolvePromise, reject) =>
      server.close((error) => error ? reject(error) : resolvePromise())),
  };
}

const toolchain = discoverToolchain();
let built;

async function builtPack() {
  if (built !== undefined) return built;
  built = (async () => {
    const temporary = mkdtempSync(join(tmpdir(), "sagejs-wasm-groups-"));
    const manifestPath = join(temporary, "native-kernels.json");
    writeFileSync(
      manifestPath,
      `${JSON.stringify({ kernels: [descriptor] }, null, 2)}\n`,
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
    return { temporary, manifestPath, outputRoot, manifest };
  })();
  return built;
}

test.after(async () => {
  if (built === undefined) return;
  const { temporary } = await built;
  rmSync(temporary, { recursive: true, force: true });
});

test("the CPython body preserves closure order and all finite bounds", () => {
  const oracle = spawnSync("/usr/bin/python3", ["-c", String.raw`
import sys
sys.path.insert(0, "src/lib")
from sagejs.kernels.groups.permutation import packed_permutation_center

generators = [2,3,4,1, 2,1,3,4]
capacity = 24
elements = [0] * (capacity * 4)
center = [0] * capacity
table = [0] * 53
status = [0] * 4
assert packed_permutation_center(
    elements, center, generators, table, status, 4, 2, capacity, 100000
) == 0

def compose(left, right):
    return [left[right[index] - 1] for index in range(len(left))]

expected = [[1,2,3,4]]
cursor = 0
while cursor < len(expected):
    for generator in (generators[:4], generators[4:]):
        candidate = compose(expected[cursor], generator)
        if candidate not in expected:
            expected.append(candidate)
    cursor += 1
actual = [elements[4*i:4*i+4] for i in range(status[1])]
assert actual == expected
assert status[1:] == [24, 1, status[3]]
assert center[:status[2]] == [0]
assert 0 < status[3] <= 100000

too_small = [0] * (23 * 4)
small_status = [0] * 4
assert packed_permutation_center(
    too_small, [0] * 23, generators, [0] * 47, small_status,
    4, 2, 23, 100000,
) == 3
assert small_status[0] == 3 and small_status[1] == 23

work_status = [0] * 4
assert packed_permutation_center(
    [0] * 96, [0] * 24, generators, [0] * 53, work_status,
    4, 2, 24, 1,
) == 2
assert work_status[0] == 2

invalid_status = [0] * 4
assert packed_permutation_center(
    [91] * 16, [92] * 4, [1,1,3,4], [93] * 11, invalid_status,
    4, 1, 4, 100,
) == 1
assert invalid_status[0] == 1
print("cpython-bounds-ok")
`], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, PYTHONPATH: "" },
  });
  assert.equal(oracle.status, 0, oracle.stderr || oracle.stdout);
  assert.equal(oracle.stdout.trim(), "cpython-bounds-ok");
});

test("disabled native execution agrees with the independent public fallback", () => {
  assert.equal(
    disabledNativePublicCenter(),
    "[40320, True, 'portable-computation', " +
      "'compiled-source-unavailable', 0, 1034577]",
  );
});

test("the packed center emits one inspected host-isolated core", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-group-inventory-"));
  try {
    const manifestPath = join(temporary, "native-kernels.json");
    writeFileSync(
      manifestPath,
      `${JSON.stringify({ kernels: [descriptor] }, null, 2)}\n`,
    );
    const inventory = await inventoryProductionKernels({ root, manifestPath });
    assert.equal(inventory.modules.length, 1);
    const module = inventory.modules[0];
    assert.deepEqual(module.functions.map((item) => [item.name, item.status]), [
      ["packed_permutation_center", "compiled-source"],
    ]);
    assert.equal(module.domain, "gmp");
    assert.equal(module.identity.canonicalCore.audit.hostCallbacks, 0);
    assert.deepEqual(
      module.identity.canonicalCore.audit.nativeDependencies,
      ["libc", "libm", "GMP"],
    );
    assert.doesNotMatch(
      module.identity.canonicalCore.source,
      /napi_|PyObject|node_api/,
    );
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("real Wasm executes directly and through the public Node workflow", {
  skip: toolchain ? false : "the pinned WASI/GMP toolchain is unavailable",
  timeout: 240_000,
}, async (context) => {
  const { manifest, outputRoot } = await builtPack();
  const runtime = await instantiate(manifest, outputRoot);
  const center = runtime.function(
    "sagejs/kernels/groups/permutation.py",
    "packed_permutation_center",
  );
  assert.equal(center.executionTarget, "wasm");
  assert.equal(center.sourceTransparent, true);
  const capacity = 40320;
  const elements = new BigUint64Array(capacity * 8);
  const centerIndices = new BigUint64Array(capacity);
  const hashTable = new BigUint64Array(131071);
  const status = new BigUint64Array(4);
  assert.equal(center(
    elements,
    centerIndices,
    symmetricEightGenerators(),
    hashTable,
    status,
    8n,
    2n,
    BigInt(capacity),
    12000000n,
  ), 0n);
  assert.deepEqual(Array.from(status), [0n, 40320n, 1n, 1034577n]);
  assert.equal(centerIndices[0], 0n);
  assert.deepEqual(Array.from(elements.slice(0, 8)), [1n,2n,3n,4n,5n,6n,7n,8n]);
  assert.equal(
    await publicNodeWorkflow(runtime),
    "[40320, True, 'wasm-compiled-source', 'normal-heavy-case', " +
      "1, 1034577, 12000000]",
  );
  context.diagnostic(JSON.stringify({
    route: center.executionTarget,
    sourceTransparent: center.sourceTransparent,
    elements: Number(status[1]),
    centerElements: Number(status[2]),
    work: Number(status[3]),
    maxWork: 12000000,
    boundaryCrossingsPerPublicCall: 1,
  }));
});

test("the same public source selects the group pack in Chromium", {
  skip: toolchain ? false : "the pinned WASI/GMP toolchain is unavailable",
  timeout: 240_000,
}, async (context) => {
  const [{ chromium }, browserSupport] = await Promise.all([
    import("playwright-core"),
    import("../packages/flint-wasm/test/browser-wasm-support.mjs"),
  ]);
  const executablePath = browserSupport.executablePathFor("chromium", chromium);
  if (!executablePath) {
    context.skip("Chromium is unavailable");
    return;
  }
  const { manifest, outputRoot } = await builtPack();
  const upstream = await browserSupport.createBrowserWasmServer();
  const proxy = await createProxyServer(upstream.origin, manifest, outputRoot);
  let browser;
  try {
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage();
    const browserLog = [];
    page.on("console", (message) => browserLog.push(`console: ${message.text()}`));
    page.on("pageerror", (error) => browserLog.push(`pageerror: ${error.stack}`));
    page.on("requestfailed", (request) => browserLog.push(
      `requestfailed: ${request.url()} ${request.failure()?.errorText}`,
    ));
    page.on("response", (response) => {
      if (response.status() >= 400 || response.url().includes("group-native")) {
        browserLog.push(`response: ${response.status()} ${response.url()}`);
      }
    });
    await page.addInitScript((nativeKernels) => {
      window.__sagejsTestOptions = { nativeKernels };
    }, `${proxy.origin}/group-native/index.json`);
    await page.goto(`${proxy.origin}/browser-wasm-harness.html`, {
      waitUntil: "load",
    });
    await page.waitForFunction(() => window.__sagejsReady !== undefined);
    try {
      await page.evaluate(() => window.__sagejsReady);
    } catch (error) {
      throw new Error(`${error.stack}\n${browserLog.join("\n")}`);
    }
    const result = await page.evaluate(
      ([source, timeout]) => window.__sagejsTest.evaluate(source, timeout),
      [[
        "G=PermutationGroup(['(1,2,3,4,5,6,7,8)','(1,2)'])",
        "C=G.center()",
        "r=G._last_center_acceleration",
        "[G.order(),repr(C.gens()),r.route,r.reason,r.boundaryCrossings,r.work,r.maxWork]",
      ].join("\n"), 120_000],
    );
    assert.equal(
      result.repr,
      "[40320, '((),)', 'wasm-compiled-source', 'normal-heavy-case', " +
        "1, 1034577, 12000000]",
      browserLog.join("\n"),
    );
    context.diagnostic(JSON.stringify({
      engine: "chromium",
      publicRoute: "wasm-compiled-source",
      durationMilliseconds: result.duration_ms,
    }));
  } finally {
    await browser?.close();
    await proxy.close();
    await upstream.close();
  }
});
