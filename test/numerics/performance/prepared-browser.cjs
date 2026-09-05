// sagejs-test-tier: native
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const test = require("node:test");
const { buildBrowserStandardLibrary } = require("../../../packages/flint-wasm/scripts/browser-python-resources.cjs");
const { buildWasmProductionPacks } = require("../../../tools/native-kernel/wasm-production-pack.cjs");
const { wasmKernelToolchain } = require("../../../packages/wasm-toolchain/scripts/toolchain.cjs");
const { validateLazyModuleBundle } = require("../../../scripts/lazy-module-provenance.cjs");
const root = path.resolve(__dirname, "../../..");
const packageRoot = path.join(root, "packages/flint-wasm");

// This is a public browser SOURCE integration witness. It deliberately records
// no release receipt: exact Wasm assets come from an existing local package,
// while numerics modules, compiler frontend, and floating pack are current.
test("public prepared numerical APIs use the optional pack in real browser sessions", {
  skip: process.env.SAGEJS_NUMERICAL_BROWSER_TESTS !== "1" ? "explicit browser source qualification" : false,
  timeout: 600000,
}, async () => {
  const measurementPath = process.env.SAGEJS_NUMERICAL_BROWSER_MEASUREMENTS;
  if (measurementPath && fs.existsSync(measurementPath)) throw new Error("refusing to overwrite measurements");
  const measurements = [];
  const evaluators = process.env.SAGEJS_NUMERICAL_BROWSER_WORKLOAD === "evaluators";
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-prepared-browser-"));
  let server;
  try {
    const lazy = JSON.parse(fs.readFileSync(path.join(root, "dist/lazy-modules.json"), "utf8"));
    validateLazyModuleBundle(lazy, { repositoryRoot: root });
    for (const name of ["_packed", "_packed_centered", "_prepared_native"]) {
      assert.ok(lazy.modules[`sagejs.numerics.statistics.${name}`], `missing lazy ${name}`);
    }
    buildBrowserStandardLibrary({
      sourceDirectory: path.join(root, "src/lib"), cacheDirectory: path.join(root, "dist/module-cache"),
      requiredModules: ["collections.abc"], output: path.join(directory, "stdlib.json"),
    });
    for (const [source, destination] of [
      ["dist/compiler/compiler.js", "compiler.js"],
      ["dist/compiler/baselib-plain-pretty.js", "baselib.js"],
      ["dist/lazy-modules.json", "lazy-modules.json"],
    ]) fs.copyFileSync(path.join(root, source), path.join(directory, destination));
    const frontend = spawnSync(process.execPath, [
      path.join(packageRoot, "scripts/build-compiler-frontend.cjs"),
      path.join(packageRoot, "src/compiler-frontend-entry.ts"),
      path.join(directory, "compiler-frontend.mjs"),
      path.join(packageRoot, "src/compiler-resources.ts"),
      require.resolve("path-browserify", { paths: [packageRoot] }),
      path.join(directory, "compiler-frontend.metafile.json"),
    ], { cwd: root, encoding: "utf8", timeout: 120000 });
    assert.equal(frontend.status, 0, frontend.stderr);
    const outputRoot = path.join(directory, "floating");
    const toolchain = wasmKernelToolchain({ root });
    for (const name of ["gmpPrefix", "flintPrefix", "mpfrPrefix", "mpcPrefix"]) {
      toolchain[name] = path.join(directory, "absent", name);
    }
    const manifest = await buildWasmProductionPacks({ root, toolchain, outputRoot, isolateFloat64: true,
      manifestPath: path.join(packageRoot, "numerical/floating-kernels.json") });
    const stale = structuredClone(manifest);
    stale.kernels[0].sourceHash = "0".repeat(64);
    const requests = [];
    server = http.createServer((request, response) => {
      const url = new URL(request.url, "http://localhost");
      requests.push(url.pathname);
      response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
      response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
      if (url.pathname === "/__requests") {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(requests.slice(Number(url.searchParams.get("since")))));
        return;
      }
      if (url.pathname === "/") {
        response.setHeader("Content-Type", "text/html");
        response.end("<!doctype html><title>Public statistics source witness</title>");
        return;
      }
      if (url.pathname === "/__witness/stale/index.json") {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(stale));
        return;
      }
      const witness = url.pathname.startsWith("/__witness/");
      const base = witness ? directory : packageRoot;
      const relative = witness ? url.pathname.slice("/__witness/".length) : url.pathname.slice(1);
      const filename = path.resolve(base, relative);
      if (!filename.startsWith(base + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
        response.writeHead(404).end("not found");
        return;
      }
      response.setHeader("Content-Type", ({ ".mjs": "text/javascript", ".js": "text/javascript",
        ".json": "application/json", ".wasm": "application/wasm" })[path.extname(filename)] || "application/octet-stream");
      fs.createReadStream(filename).pipe(response);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const source = evaluators
      ? ["prepared-functions.py", "prepared-root-api.py"].map(name => fs.readFileSync(path.join(__dirname,name),"utf8")).join("\n")
      : fs.readFileSync(path.join(__dirname, "prepared-statistics.py"), "utf8");
    const benchmark = measurementPath ? fs.readFileSync(path.join(root,
      evaluators ? "bench/numerics/performance/prepared-root.py" : "bench/numerics/performance/prepared-statistics.py"), "utf8") : null;
    for (const engine of (process.env.SAGEJS_NUMERICAL_BROWSER_ENGINE
      ? [process.env.SAGEJS_NUMERICAL_BROWSER_ENGINE] : ["chromium", "firefox", "webkit"])) {
      const browser = await require("playwright-core")[engine].launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.goto(origin);
        for (const [route, expected] of [["disabled", "ordinary-python"], ["floating", "source-native"], ["stale", "ordinary-python"], ["missing", "ordinary-python"]]) {
          const start = requests.length;
          const observation = await page.evaluate(async ({ origin, route, expected, source, start, benchmark, evaluators }) => {
            const { createSage } = await import(origin + "/kernel.mjs");
            const sage = await createSage({ mode: "python",
              compiler: origin + "/__witness/compiler.js", baselib: origin + "/__witness/baselib.js",
              standardLibrary: origin + "/__witness/stdlib.json", lazyModules: origin + "/__witness/lazy-modules.json",
              compilerFrontend: origin + "/__witness/compiler-frontend.mjs",
              floatingKernels: route === "disabled" ? undefined : origin + `/__witness/${route}/index.json`,
            });
            try {
              await sage.evaluate("assert 2 + 2 == 4", { timeout: 120000 });
              const fetched = await (await fetch(origin + `/__requests?since=${start}`)).json();
              if (fetched.some((url) => url.startsWith(`/__witness/${route}/`))) {
                throw new Error("floating pack was fetched before a statistics import");
              }
              const result = await sage.evaluate(`EXPECTED_BACKEND = ${JSON.stringify(expected)}\nEXPECTED_TARGET = ${JSON.stringify(expected === "source-native" ? "wasm" : "dynamic")}\n` + source, { timeout: 180000 });
              if (route === "floating") await sage.evaluate(
                evaluators
                  ? 'from sagejs.numerics._evaluation_core import evaluate_program\nassert evaluate_program.executionTarget == "wasm"'
                  : 'from sagejs.numerics.statistics._packed import finite_sum\nassert finite_sum.executionTarget == "wasm"',
                { timeout: 120000 },
              );
              const recovery = await sage.evaluate("print(6 * 7)", { timeout: 120000 });
              let measured = null;
              if (benchmark && route === "floating") {
                const start = performance.now();
                const result = await sage.evaluate('EXPECTED_NATIVE_BACKEND = "source-native"\n' + benchmark,
                  { timeout: 300000 });
                measured = { evaluate_wall_ms: performance.now() - start,
                  ...JSON.parse(result.stdout.trim()) };
              }
              return { stdout: result.stdout, recovery: recovery.stdout, measured };
            } finally { sage.close(); }
          }, { origin, route, expected, source, start, benchmark, evaluators });
          assert.equal(observation.stdout.trim(), evaluators ? "prepared functions passed\nprepared root API passed" : "prepared statistics passed", engine + ":" + route);
          assert.equal(observation.recovery.trim(), "42");
          if (observation.measured) {
            measurements.push({ engine, version: browser.version(), ...observation.measured });
          }
          const selected = requests.slice(start).filter((url) => url.startsWith(`/__witness/${route}/`));
          assert.equal(selected.filter((url) => url.endsWith("index.json")).length, route === "disabled" ? 0 : 1);
          if (route === "disabled") {
            assert.equal(requests.slice(start).filter((url) => url === "/floating-kernels.mjs").length, 0,
              "default sessions must not import the optional floating loader");
          }
          assert.equal(selected.filter((url) => url.endsWith(".wasm")).length, route === "floating" ? 1 : 0);
          process.stdout.write(`${engine} ${route}: public ownership, exactness, budgets, fallback and recovery passed\n`);
        }
      } finally { await browser.close(); }
    }
    if (measurementPath) {
      const inputFiles = ["dist/compiler/compiler.js", "dist/compiler/baselib-plain-pretty.js",
        "dist/lazy-modules.json", "packages/flint-wasm/evaluator.mjs",
        "packages/flint-wasm/compiler-worker.mjs", "packages/flint-wasm/floating-kernels.mjs",
        "packages/flint-wasm/dist/flint-factor.wasm", "tools/native-kernel/wasm-pack-loader.mjs",
        "test/numerics/performance/prepared-browser.cjs"];
      const report = {
        schema: evaluators ? "sagejs.prepared-root-browser-development/v1" : "sagejs.prepared-statistics-browser-development/v1",
        classification: "source-integration-development-not-release-qualification",
        host: { platform: process.platform, arch: process.arch, node: process.version,
          cpu: os.cpus()[0]?.model, load_average: os.loadavg() },
        sources: inputFiles.map((name) => ({ path: name, sha256: hash(fs.readFileSync(path.join(root, name))) })),
        generated_resources: ["stdlib.json", "compiler-frontend.mjs", "floating/index.json"].map(name => ({
          path: name, sha256: hash(fs.readFileSync(path.join(directory, name))),
        })),
        workload_sha256: hash(benchmark),
        pack: manifest.packs[0],
        policy: { warmups: 3, samples: 7, ...(evaluators ? { roots_per_batch: 20 } : { observations: 20000 }),
          included: evaluators ? ["complete public solve", "parameter packing", "independent validation", "result"]
            : ["complete public query", "validation", "sorting", "result", "trace"],
          separate: evaluators ? ["expression preparation"] : ["data preparation", "first query"],
          unmeasured: ["cold browser startup", "peak memory", "frozen paired qualification", "npm/SEA"] },
        measurements,
      };
      fs.mkdirSync(path.dirname(path.resolve(measurementPath)), { recursive: true });
      fs.writeFileSync(measurementPath, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
    }
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
