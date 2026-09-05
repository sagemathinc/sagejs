// sagejs-test-tier: native
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { compileKernel } = require("../../../tools/native-kernel/compiler.cjs");
const { pythonPrefix } = require("../../../bench/numerics/performance/run.cjs");
const { removeLoadedNativeCache } = require("../../helpers/native-cache-cleanup.cjs");
const { buildWasmProductionPacks } = require("../../../tools/native-kernel/wasm-production-pack.cjs");
const { inspectToolchain, wasmKernelToolchain } = require("../../../packages/wasm-toolchain/scripts/toolchain.cjs");
const root = path.resolve(__dirname, "../../..");
const sourcePath = path.join(root, "src/lib/sagejs/numerics/_evaluation_root.py");
// Runs unchanged inside real browser workers; no Node or mathematical host calls.
async function browserRoots({ loader, manifest, assets, rows }) {
  const { instantiateWasmKernelPacks } = await import(loader);
  const resolver = await instantiateWasmKernelPacks({ manifest,
    load: pack => Uint8Array.from(assets[pack.asset]),
    host(_pack, module) {
      const imports = {};
      for (const entry of WebAssembly.Module.imports(module)) {
        if (entry.module !== "wasi_snapshot_preview1") throw new Error("unexpected import");
        imports[entry.module] ??= {};
        imports[entry.module][entry.name] = () => { throw new Error("host callback"); };
      }
      return imports;
    },
  });
  const run = resolver.resolve("sagejs/numerics/_evaluation_root.py", "bisect_program");
  const answers = [];
  for (const row of rows) {
    const output = new Float64Array(5).fill(17), telemetry = new Float64Array(2);
    const status = run(...[row.ops,row.left,row.right].map(x=>BigUint64Array.from(x,BigInt)),Float64Array.from(row.constants),new Float64Array(1),new Float64Array(row.ops.length),telemetry,output,BigInt(row.ops.length),row.lower,row.upper,1e-10,1e-10,BigInt(row.iterations));
    answers.push([status,Array.from(output),telemetry[1]]);
  }
  return answers;
}
const cases = [
  { ops:[1,7,0,6], left:[0,0,0,1], right:[0,0,0,2], constants:[2], lower:1, upper:2, iterations:100, status:0 },
  { ops:[1], left:[0], right:[0], constants:[], lower:0, upper:2, iterations:100, status:0 },
  { ops:[1], left:[0], right:[0], constants:[], lower:-2, upper:0, iterations:100, status:0 },
  { ops:[0], left:[0], right:[0], constants:[1], lower:-1, upper:1, iterations:100, status:4 },
  { ops:[0,1,8], left:[0,0,0], right:[0,0,1], constants:[1], lower:-1, upper:1, iterations:100, status:12 },
  { ops:[1,7,0,6], left:[0,0,0,1], right:[0,0,0,2], constants:[2], lower:1, upper:2, iterations:0, status:5 },
  { ops:[1], left:[0], right:[0], constants:[], lower:2, upper:1, iterations:100, status:1 },
  { ops:[1], left:[0], right:[0], constants:[], lower:0, upper:2, iterations:1025, status:1 },
];

test("prepared bisection and evaluator share an isolated native/Wasm closure", async () => {
  const program = pythonPrefix(root) + `
import json, sys
from sagejs.numerics._evaluation_root import bisect_program
answers = []
for row in json.loads(sys.argv[1]):
    n = len(row['ops'])
    output = [17.0]*5
    telemetry = [0.0, 0.0]
    status = bisect_program(row['ops'], row['left'], row['right'], row['constants'], [0.0], [0.0]*n, telemetry, output, n, row['lower'], row['upper'], 1e-10, 1e-10, row['iterations'])
    assert status == row['status']
    answers.append([status, output, telemetry[1]])
print(json.dumps(answers))
`;
  const py = spawnSync(process.env.PYTHON || (process.platform === "win32" ? "python" : "python3"), ["-I", "-c", program, JSON.stringify(cases)], {encoding:"utf8", timeout:120000});
  assert.equal(py.status, 0, py.stderr);
  const expected = JSON.parse(py.stdout);
  assert.ok(Math.abs(expected[0][1][0] - Math.sqrt(2)) < 1e-10);
  assert.ok(Math.abs(expected[0][1][1]) <= 1e-10);
  assert.ok(expected[0][1][4] - expected[0][1][3] <= 1e-10);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-prepared-root-"));
  try {
    const compiled = await compileKernel({ sourcePath, cacheRoot: directory, functions: ["bisect_program"] });
    assert.ok(compiled.ir.nativeSourceDependencies.some(x => x.module === "sagejs.numerics._evaluation_core"));
    const fn = require(compiled.modulePath).bisect_program;
    assert.equal(fn.nativeAvailable, true);
    const implementations = [fn, fn.javascript];
    if (inspectToolchain({root}).ready) {
      const manifestPath = path.join(directory, "manifest.json");
      fs.writeFileSync(manifestPath, JSON.stringify({ kernels:[{id:"prepared-root-production", source:"src/lib/sagejs/numerics/_evaluation_root.py", functions:["bisect_program"], fallback:"same-source", oracles:["CPython"]}] }));
      const toolchain = wasmKernelToolchain({root});
      for (const key of ["gmpPrefix","flintPrefix","mpfrPrefix","mpcPrefix"]) toolchain[key] = path.join(directory,"absent",key);
      const manifest = await buildWasmProductionPacks({root,manifestPath,outputRoot:directory,toolchain,isolateFloat64:true});
      const {instantiateWasmKernelPacks} = await import(pathToFileURL(path.join(root,"tools/native-kernel/wasm-pack-loader.mjs")));
      const resolver = await instantiateWasmKernelPacks({manifest,load:pack=>fs.readFileSync(path.join(directory,pack.asset)),host(_pack,module) {
        const imports={};
        for (const item of WebAssembly.Module.imports(module)) {
          assert.equal(item.module,"wasi_snapshot_preview1");
          imports[item.module] ??= {};
          imports[item.module][item.name] = () => {throw new Error("unexpected host callback");};
        }
        return imports;
      }});
      implementations.push(resolver.resolve("sagejs/numerics/_evaluation_root.py","bisect_program"));
      if (process.env.SAGEJS_NUMERICAL_BROWSER_TESTS === "1") {
        const { runBrowserCases } = require("../../helpers/float64-wasm.cjs");
        const server = require("node:http").createServer((_request,response) => response.end("<!doctype html><title>isolated root witness</title>"));
        await new Promise(resolve => server.listen(0,"127.0.0.1",resolve));
        try {
          const payload = { manifest, rows: cases,
            loader: "data:text/javascript;base64," + fs.readFileSync(path.join(root,"tools/native-kernel/wasm-pack-loader.mjs")).toString("base64"),
            assets: Object.fromEntries(manifest.packs.map(pack => [pack.asset,Array.from(fs.readFileSync(path.join(directory,pack.asset)))])),
          };
          for (const engine of ["chromium","firefox","webkit"]) {
            assert.deepEqual(await runBrowserCases(engine,browserRoots,payload,{pageUrl:`http://127.0.0.1:${server.address().port}`}),expected,engine);
          }
        } finally { await new Promise(resolve => server.close(resolve)); }
      }
    }
    for (const run of implementations) for (const [i,row] of cases.entries()) {
      const output = new Float64Array(5).fill(17);
      const telemetry = new Float64Array(2);
      const status = run(...[row.ops,row.left,row.right].map(x=>BigUint64Array.from(x,BigInt)), Float64Array.from(row.constants),new Float64Array(1),new Float64Array(row.ops.length),telemetry,output,BigInt(row.ops.length),row.lower,row.upper,1e-10,1e-10,BigInt(row.iterations));
      assert.deepEqual([status,Array.from(output),telemetry[1]],expected[i]);
      if (status !== 0) assert.deepEqual(Array.from(output),[17,17,17,17,17]);
    }
  } finally {removeLoadedNativeCache(directory);}
});
