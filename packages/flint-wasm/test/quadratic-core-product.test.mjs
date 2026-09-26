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
      sagejs_class_group_run_json: run,
      sagejs_class_group_dealloc: dealloc } = instance.exports;
    const request = new TextEncoder().encode(JSON.stringify({
      schema: "sagejs.class-groups/service-request-v1",
      abi: 1,
      id: "owned-pointer-test",
      operation: "capability",
    }));
    const inputPointer = alloc(request.length);
    assert.ok(inputPointer > 0);
    new Uint8Array(memory.buffer, inputPointer, request.length).set(request);
    const invoke = (pointer, length) => {
      const packed = BigInt.asUintN(64, run(pointer, length));
      const outputPointer = Number(packed & 0xffff_ffffn);
      const outputLength = Number(packed >> 32n);
      assert.ok(outputPointer > 0 && outputLength > 0);
      const result = JSON.parse(new TextDecoder().decode(
        new Uint8Array(memory.buffer, outputPointer, outputLength),
      ));
      return { outputPointer, outputLength, result };
    };
    const forged = invoke(inputPointer + 1, request.length - 1);
    assert.equal(forged.result.ok, false);
    dealloc(forged.outputPointer, forged.outputLength);
    const wrongLength = invoke(inputPointer, request.length - 1);
    assert.equal(wrongLength.result.ok, false);
    dealloc(wrongLength.outputPointer, wrongLength.outputLength);

    dealloc(inputPointer + 1, request.length - 1);
    dealloc(inputPointer, request.length - 1);
    const valid = invoke(inputPointer, request.length);
    assert.equal(valid.result.ok, true);
    assert.equal(valid.result.result.imaginaryQuadratic.proofMode, "unconditional");
    const wrongKind = invoke(valid.outputPointer, valid.outputLength);
    assert.equal(wrongKind.result.ok, false);
    dealloc(wrongKind.outputPointer, wrongKind.outputLength);
    dealloc(valid.outputPointer, valid.outputLength - 1);
    assert.equal(new Uint8Array(memory.buffer, valid.outputPointer, 1)[0], 123);
    dealloc(valid.outputPointer, valid.outputLength);
    dealloc(valid.outputPointer, valid.outputLength);
    dealloc(inputPointer, request.length);
    const stale = invoke(inputPointer, request.length);
    assert.equal(stale.result.ok, false);
    dealloc(stale.outputPointer, stale.outputLength);
    assert.equal(alloc(0), 0);
    assert.equal(alloc(1024 * 1024 + 1), 0);
    const held = Array.from({ length: 8 }, () => alloc(1));
    assert.ok(held.every((pointer) => pointer > 0));
    assert.equal(alloc(1), 0);
    for (const pointer of held) dealloc(pointer, 1);
    const recovered = alloc(1);
    assert.ok(recovered > 0);
    dealloc(recovered, 1);
  } finally {
    wasi.dispose();
  }
});
