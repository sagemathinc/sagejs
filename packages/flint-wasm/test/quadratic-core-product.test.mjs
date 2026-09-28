import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { createClassGroupCore } from "../class-group-core.mjs";
import { instantiateClassGroupCore } from "../class-group-core-loader.mjs";
import { installNodeWorkerHost } from "../node-worker.mjs";
import { createWasiHost } from "../src/wasi-runtime.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const artifact = path.resolve(process.env.SAGEJS_QUADRATIC_WASM_ARTIFACT ||
  path.join(root, "packages/imaginary-quadratic-core/target/wasm32-wasip1/release/" +
    "sagejs_imaginary_quadratic_core.wasm"));

test("the isolated quadratic reactor retains complete ideal maps in Wasm", {
  skip: !existsSync(artifact) && "build the standalone quadratic development reactor first",
}, async () => {
  const bytes = new Uint8Array(await readFile(artifact));
  const direct = await instantiateClassGroupCore(bytes);
  try {
    const capability = direct.invoke({
      schema: "sagejs.class-groups/service-request-v1",
      abi: 1,
      id: "quadratic-capability",
      operation: "capability",
    });
    assert.equal(capability.ok, true);
    assert.deepEqual(capability.result.operations,
      ["capability", "imaginary-class-number", "imaginary-class-group"]);
  } finally {
    direct.close();
  }

  installNodeWorkerHost();
  const service = await createClassGroupCore({
    artifact: pathToFileURL(artifact),
    receipt: {
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  });
  try {
    for (const [polynomial, classNumber, invariants] of [
      [[6, -1, 1], 3, [3]],
      [[21, 0, 1], 4, [2, 2]],
      [[3750000079, -1, 1], 33768, [2, 16884]],
    ]) {
      const scalar = await service.imaginaryClassNumber(polynomial);
      const group = await service.imaginaryClassGroup(polynomial);
      assert.equal(scalar.classNumber, classNumber);
      assert.equal(group.classNumber, classNumber);
      assert.deepEqual(group.invariantFactors, invariants);
      assert.equal(group.proofStatus, "unconditional-complete");
      assert.equal(group.completeClassMap.length, classNumber);
      assert.equal(group.certificate.reducedForms.length, classNumber);
      assert.equal(new Set(group.completeClassMap.map(({ form }) =>
        `${form.a},${form.b},${form.c}`)).size, classNumber);
      assert.equal(new Set(group.completeClassMap.map(({ coordinates }) =>
        coordinates.join(","))).size, classNumber);
      for (const entry of group.completeClassMap) {
        assert.equal(entry.representativeIdeal.norm, entry.form.a);
        assert.deepEqual(entry.representativeIdeal.basisColumns[0], [entry.form.a, 0]);
      }
    }
    await assert.rejects(service.call("open", { request: {} }),
      (error) => error.category === "capability-declined");
  } finally {
    await service.close();
  }
});

test("a malformed reactor export fails without poisoning the next load", {
  skip: !existsSync(artifact) && "build the standalone quadratic development reactor first",
}, async () => {
  const runtimeModule = existsSync(path.join(root,
    "packages/flint-wasm/dist/wasi-runtime.mjs"))
    ? "../dist/wasi-runtime.mjs" : "../src/wasi-runtime.mjs";
  const { createWasiHost } = await import(runtimeModule);
  let disposedHosts = 0;
  const wasiHostFactory = (options) => {
    const host = createWasiHost(options);
    return {
      ...host,
      dispose() {
        disposedHosts += 1;
        host.dispose();
      },
    };
  };
  const bytes = new Uint8Array(await readFile(artifact));
  const malformed = bytes.slice();
  const exportName = new TextEncoder().encode("sagejs_class_group_alloc");
  const offset = Buffer.from(malformed).indexOf(exportName);
  assert.ok(offset > 0);
  malformed[offset] = "x".charCodeAt(0);
  assert.equal(WebAssembly.Module.exports(new WebAssembly.Module(malformed)).some(
    ({ name }) => name === "sagejs_class_group_alloc"), false);
  await assert.rejects(instantiateClassGroupCore(malformed, { wasiHostFactory }),
    /class-group core does not export sagejs_class_group_alloc/);
  assert.equal(disposedHosts, 1, "the rejected reactor must release its WASI host");

  const valid = await instantiateClassGroupCore(bytes, { wasiHostFactory });
  try {
    const response = valid.invoke({
      schema: "sagejs.class-groups/service-request-v1",
      abi: 1,
      id: "valid-after-malformed-export",
      operation: "capability",
    });
    assert.equal(response.ok, true);
  } finally {
    valid.close();
  }
  assert.equal(disposedHosts, 2);
});

test("the quadratic reactor rejects forged and stale guest pointers", {
  skip: !existsSync(artifact) && "build the standalone quadratic development reactor first",
}, async () => {
  const module = await WebAssembly.compile(await readFile(artifact));
  const wasi = createWasiHost({ stdout() {}, stderr() {} });
  let instance;
  try {
    instance = await WebAssembly.instantiate(module, {
      wasi_snapshot_preview1: {
        ...wasi.imports,
        environ_get: () => 0,
        environ_sizes_get: (countPointer, bytesPointer) => {
          const memory = instance.exports.memory.buffer;
          new DataView(memory).setUint32(countPointer, 0, true);
          new DataView(memory).setUint32(bytesPointer, 0, true);
          return 0;
        },
      },
    });
    wasi.initialize(instance);
    const { memory, sagejs_class_group_alloc: alloc,
      sagejs_class_group_abi_version: abiVersion,
      sagejs_class_group_allocation_length: allocationLength,
      sagejs_class_group_run_json: run,
      sagejs_class_group_dealloc: dealloc } = instance.exports;
    assert.equal(abiVersion(), 2);
    const pointerOf = (handle) => Number(handle & 0xffff_ffffn);
    const replacePointer = (handle, pointer) =>
      (handle & ~0xffff_ffffn) | BigInt(pointer);
    const request = new TextEncoder().encode(JSON.stringify({
      schema: "sagejs.class-groups/service-request-v1",
      abi: 1,
      id: "owned-pointer-test",
      operation: "capability",
    }));
    const inputHandle = alloc(request.length);
    const inputPointer = pointerOf(inputHandle);
    assert.ok(inputHandle > 0n && inputPointer > 0);
    assert.equal(allocationLength(inputHandle), 0);
    new Uint8Array(memory.buffer, inputPointer, request.length).set(request);
    const beforeGrowth = memory.buffer.byteLength;
    assert.equal(memory.grow(1), beforeGrowth / 65_536);
    assert.equal(memory.buffer.byteLength, beforeGrowth + 65_536);
    const invoke = (handle, length) => {
      const outputHandle = BigInt.asUintN(64, run(handle, length));
      const outputPointer = pointerOf(outputHandle);
      const outputLength = allocationLength(outputHandle);
      assert.ok(outputPointer > 0 && outputLength > 0);
      const result = JSON.parse(new TextDecoder().decode(
        new Uint8Array(memory.buffer, outputPointer, outputLength),
      ));
      return { outputHandle, outputPointer, outputLength, result };
    };
    const forged = invoke(replacePointer(inputHandle, inputPointer + 1), request.length - 1);
    assert.equal(forged.result.ok, false);
    dealloc(forged.outputHandle, forged.outputLength);
    const wrongLength = invoke(inputHandle, request.length - 1);
    assert.equal(wrongLength.result.ok, false);
    dealloc(wrongLength.outputHandle, wrongLength.outputLength);

    dealloc(replacePointer(inputHandle, inputPointer + 1), request.length - 1);
    dealloc(inputHandle, request.length - 1);
    const valid = invoke(inputHandle, request.length);
    assert.equal(valid.result.ok, true);
    assert.equal(allocationLength(valid.outputHandle + (1n << 32n)), 0);
    assert.equal(valid.result.result.imaginaryQuadratic.proofMode, "unconditional");
    const beforeResponseGrowth = memory.buffer.byteLength;
    assert.equal(memory.grow(1), beforeResponseGrowth / 65_536);
    assert.equal(memory.buffer.byteLength, beforeResponseGrowth + 65_536);
    assert.equal(allocationLength(valid.outputHandle), valid.outputLength);
    const wrongKind = invoke(valid.outputHandle, valid.outputLength);
    assert.equal(wrongKind.result.ok, false);
    dealloc(wrongKind.outputHandle, wrongKind.outputLength);
    dealloc(valid.outputHandle, valid.outputLength - 1);
    assert.equal(new Uint8Array(memory.buffer, valid.outputPointer, 1)[0], 123);
    dealloc(valid.outputHandle, valid.outputLength);
    dealloc(valid.outputHandle, valid.outputLength);
    dealloc(inputHandle, request.length);
    const stale = invoke(inputHandle, request.length);
    assert.equal(stale.result.ok, false);
    dealloc(stale.outputHandle, stale.outputLength);
    assert.equal(alloc(0), 0n);
    assert.equal(alloc(1024 * 1024 + 1), 0n);
    const replacement = alloc(request.length);
    assert.ok(replacement > 0n && replacement !== inputHandle);
    assert.equal(pointerOf(replacement), inputPointer,
      "the regression must exercise a recycled Wasm allocation address");
    new Uint8Array(memory.buffer, pointerOf(replacement), request.length).set(request);
    const staleAfterReuse = invoke(inputHandle, request.length);
    assert.equal(staleAfterReuse.result.ok, false);
    dealloc(staleAfterReuse.outputHandle, staleAfterReuse.outputLength);
    dealloc(inputHandle, request.length);
    const afterStaleDealloc = invoke(replacement, request.length);
    assert.equal(afterStaleDealloc.result.ok, true);
    dealloc(afterStaleDealloc.outputHandle, afterStaleDealloc.outputLength);
    dealloc(replacement, request.length);
    const held = Array.from({ length: 8 }, () => alloc(1));
    assert.ok(held.every((handle) => handle > 0n));
    assert.equal(alloc(1), 0n);
    for (const handle of held) dealloc(handle, 1);
    const recovered = alloc(1);
    assert.ok(recovered > 0n);
    dealloc(recovered, 1);

    // A hostile caller can supply arbitrary 64-bit handle/length pairs.  A
    // reproducible spread of forged values must not trap, expose another
    // allocation, or invalidate a still-live request.
    const live = alloc(request.length);
    assert.ok(live > 0n);
    new Uint8Array(memory.buffer, pointerOf(live), request.length).set(request);
    const rejectForged = (forged, forgedLength) => {
      assert.equal(allocationLength(forged), 0);
      const rejected = invoke(forged, forgedLength);
      assert.equal(rejected.result.ok, false);
      dealloc(rejected.outputHandle, rejected.outputLength);
      dealloc(forged, forgedLength);
    };
    for (let bit = 0n; bit < 64n; bit += 1n) {
      rejectForged(live ^ (1n << bit), request.length);
    }
    let randomState = 0x9e3779b9;
    const nextRandom = () => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState;
    };
    for (let index = 0; index < 512; index += 1) {
      let forged = (BigInt(nextRandom()) << 32n) | BigInt(nextRandom());
      if (forged === live) forged ^= 1n << 32n;
      const forgedLength = nextRandom() % (request.length + 3);
      rejectForged(forged, forgedLength);
    }
    const survived = invoke(live, request.length);
    assert.equal(survived.result.ok, true);
    dealloc(survived.outputHandle, survived.outputLength);
    dealloc(live, request.length);
  } finally {
    wasi.dispose();
  }
});
