// sagejs-test-tier: native
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const test = require("node:test");
const http = require("node:http");
const { once } = require("node:events");
const { buildWasmProductionPacks } = require("../../../tools/native-kernel/wasm-production-pack.cjs");
const { inspectToolchain, wasmKernelToolchain } = require("../../../packages/wasm-toolchain/scripts/toolchain.cjs");
const { runBrowserCases } = require("../../helpers/float64-wasm.cjs");
const root = path.resolve(__dirname, "../../..");

// This runner also executes unchanged inside real browser workers.
async function exercisePack({ loader, manifest, assets }) {
  const api = await import(loader);
  const load = async pack => Uint8Array.from(assets[pack.asset]);
  const memories = [];
  const host = async (_pack, module) => {
    const imports = {};
    for (const item of WebAssembly.Module.imports(module)) {
      if (item.kind !== "function" || item.module !== "wasi_snapshot_preview1") {
        throw new Error("unexpected host import " + item.name);
      }
      imports[item.module] ??= {};
      imports[item.module][item.name] = () => { throw new Error("unexpected host callback " + item.name); };
    }
    return { imports, initialize(instance) {
      instance.exports._initialize?.();
      memories.push(instance.exports.memory);
    } };
  };
  const resolver = await api.instantiateWasmKernelPacks({manifest, load, host});
  const logical = "sagejs/numerics/statistics/_packed.py";
  const sum = resolver.function(logical, "finite_sum");
  const input = sum.createFloat64Buffer([1e16, 1.0, -1e16, -0.0]);
  const scratch = sum.createFloat64Buffer(4);
  const output = sum.createFloat64Buffer(1);
  let status;
  for (let i = 0; i < 10; i++) status = sum(input, scratch, output, 4n);
  const initialMemory = memories[0].buffer.byteLength;
  for (let i = 0; i < 1000; i++) status = sum(input, scratch, output, 4n);
  const orderingInput = sum.createFloat64Buffer([0.0, -0.0, 2.0, 0.0, -0.0, -3.0]);
  const ordered = sum.sortedFloat64Buffer(orderingInput);
  const signs = Array.from(ordered, x => Object.is(x,-0) ? "-0" : String(x));
  const original = Array.from(orderingInput, x => Object.is(x,-0) ? "-0" : String(x));
  let hooks = 0;
  const boxed = Object(3.0);
  boxed.valueOf = () => { hooks++; throw new Error("conversion hook"); };
  const boxedOrder = Array.from(sum.sortedFloat64Buffer([boxed, 1.0]));
  const rejected = [];
  for (const value of [NaN, Infinity, { valueOf() { hooks++; return 1.0; } }]) {
    try { sum.sortedFloat64Buffer([value]); rejected.push(false); }
    catch { rejected.push(true); }
  }
  const sameSource = manifest.kernels.find(k=>k.logicalSource === logical).sourceHash;
  const wrongSource = resolver.resolve(logical, "finite_sum", {sourceHash:"0".repeat(64)}) === null;
  const boundSource = resolver.resolve(logical, "finite_sum", {sourceHash:sameSource}) === sum;
  const corrupt = JSON.parse(JSON.stringify(manifest));
  corrupt.packs[0].sha256 = "0".repeat(64);
  let corruptionRejected = false;
  try { await api.instantiateWasmKernelPacks({manifest:corrupt,load,host}); }
  catch (error) { corruptionRejected = /digest mismatch/.test(String(error)); }
  const missing = JSON.parse(JSON.stringify(manifest));
  missing.packs[0].status = "emitted";
  const unavailable = await api.instantiateWasmKernelPacks({manifest:missing,load,host});
  return { domains:resolver.domains, status, total:output[0], input:Array.from(input),
    signs, original, boxedOrder, hooks, rejected, wrongSource, boundSource,
    corruptionRejected, unavailable:unavailable.resolve(logical,"finite_sum") === null,
    target:sum.executionTarget, capacityStable:memories[0].buffer.byteLength === initialMemory };
}

test("pure binary64 packs build and execute without any exact-library prefix", {
  skip: inspectToolchain({root}).ready ? false : "prepared WASI toolchain required",
  timeout:180000,
}, async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-floating-pack-"));
  try {
    const manifestPath = path.join(directory,"manifest.json");
    const kernels = [
      ["_packed.py", ["finite_sum"]],
      ["_packed_centered.py", ["prepare_centered", "prepare_products", "prepare_summary_checks"]],
    ].map(([file,functions],index)=>({id:`float64-test-${index}-production`,
      source:"src/lib/sagejs/numerics/statistics/"+file,functions,fallback:"same-source",
      oracles:["test/numerics/performance/packed-centered.py"], benchmark:__filename}));
    fs.writeFileSync(manifestPath,JSON.stringify({kernels}));
    const outputRoot = path.join(directory,"pack");
    const toolchain = wasmKernelToolchain({root});
    for (const key of ["gmpPrefix","flintPrefix","mpfrPrefix","mpcPrefix"]) {
      toolchain[key] = path.join(directory,"intentionally-absent",key);
    }
    const manifest = await buildWasmProductionPacks({root,manifestPath,outputRoot,toolchain,isolateFloat64:true});
    assert.equal(manifest.compiledFunctions,4);
    assert.equal(manifest.unsupportedFunctions,0);
    assert.deepEqual(manifest.packs.map(p=>p.domain),["float64"]);
    assert.deepEqual(manifest.packs[0].toolchain.archives,[]);
    assert.equal(manifest.packs[0].requiredResourceAdapters.length,0);
    const loaderText=fs.readFileSync(path.join(root,"tools/native-kernel/wasm-pack-loader.mjs"),"utf8");
    const payload={loader:"data:text/javascript;base64,"+Buffer.from(loaderText).toString("base64"),
      manifest,assets:Object.fromEntries(manifest.packs.map(p=>[p.asset,Array.from(fs.readFileSync(path.join(outputRoot,p.asset)))]))};
    const expected={domains:["float64"],status:0,total:1,input:[1e16,1,-1e16,-0],
      signs:["-3","0","-0","0","-0","2"],original:["0","-0","2","0","-0","-3"],
      boxedOrder:[1,3],hooks:0,rejected:[true,true,true],wrongSource:true,boundSource:true,
      corruptionRejected:true,unavailable:true,target:"wasm",capacityStable:true};
    assert.deepEqual(await exercisePack(payload),expected);
    if(process.env.SAGEJS_NUMERICAL_BROWSER_TESTS === "1") {
      // Digest authentication needs a real secure context, not a blob:null page.
      const server = http.createServer((request,response) => {
        response.setHeader("Content-Type",request.url === "/loader.mjs" ? "text/javascript" : "text/html");
        response.end(request.url === "/loader.mjs" ? loaderText : "<!doctype html><title>Floating pack witness</title>");
      });
      server.listen(0,"127.0.0.1");
      await once(server,"listening");
      const pageUrl = `http://127.0.0.1:${server.address().port}/`;
      try {
        for(const engine of ["chromium","firefox","webkit"]){
          assert.deepEqual(await runBrowserCases(engine,exercisePack,
            {...payload,loader:pageUrl + "loader.mjs"},{pageUrl}),expected,engine);
        }
      } finally {
        await new Promise((resolve,reject)=>server.close(error=>error ? reject(error) : resolve()));
      }
    }
  } finally {
    fs.rmSync(directory,{recursive:true,force:true});
  }
});
