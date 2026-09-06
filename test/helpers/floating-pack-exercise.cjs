"use strict";
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
  const logical = "sagejs/numerics/_packed_sum.py";
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

module.exports = { exercisePack };
