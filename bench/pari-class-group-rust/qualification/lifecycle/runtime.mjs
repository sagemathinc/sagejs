import fs from "node:fs";

import { createWasiHost } from "../../../../packages/flint-wasm/src/wasi-runtime.mjs";

const ABI_VERSION = 1;
const MAX_TRANSFER_BYTES = 16 * 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function checkedRange(memory, pointer, length, label) {
  if (!Number.isInteger(pointer) || pointer < 0 ||
      !Number.isInteger(length) || length < 0 || length > MAX_TRANSFER_BYTES) {
    throw new RangeError(`${label} has an invalid Wasm32 range`);
  }
  const end = pointer + length;
  if (!Number.isSafeInteger(end) || end > memory.buffer.byteLength) {
    throw new RangeError(`${label} is outside Wasm memory`);
  }
  return new Uint8Array(memory.buffer, pointer, length);
}

function requireFunction(exports, name) {
  if (typeof exports[name] !== "function") {
    throw new TypeError(`candidate does not export ${name}`);
  }
  return exports[name];
}

/**
 * Qualification-only Node host for the existing browser reactor ABI.
 *
 * This intentionally does not improve or wrap the mathematical algorithm.  It
 * gives the lifecycle tests direct access to the same alloc/run/dealloc ABI as
 * the browser loader while using Sage.js's bounded first-party WASI host.
 */
export async function instantiateLifecycleCandidate(artifactPath) {
  const bytes = fs.readFileSync(artifactPath);
  const module = await WebAssembly.compile(bytes);
  const imports = WebAssembly.Module.imports(module);
  const namespaces = new Set(imports.map((item) => item.module));
  if ([...namespaces].some((name) => name !== "wasi_snapshot_preview1")) {
    throw new TypeError("candidate imports an unsupported namespace");
  }

  const wasi = createWasiHost({ stdout() {}, stderr() {} });
  let instance = null;
  const importObject = {
    wasi_snapshot_preview1: {
      ...wasi.imports,
      environ_get() {
        return 0;
      },
      environ_sizes_get(countPointer, bytesPointer) {
        const memory = instance?.exports?.memory;
        if (!(memory instanceof WebAssembly.Memory)) return 21;
        const view = new DataView(memory.buffer);
        if (countPointer < 0 || bytesPointer < 0 ||
            countPointer + 4 > view.byteLength || bytesPointer + 4 > view.byteLength) {
          return 21;
        }
        view.setUint32(countPointer, 0, true);
        view.setUint32(bytesPointer, 0, true);
        return 0;
      },
    },
  };
  instance = await WebAssembly.instantiate(module, importObject);
  wasi.initialize(instance);

  const exports = instance.exports;
  if (!(exports.memory instanceof WebAssembly.Memory)) {
    wasi.dispose();
    throw new TypeError("candidate does not export memory");
  }
  const abiVersion = requireFunction(exports, "sagejs_class_group_abi_version");
  const alloc = requireFunction(exports, "sagejs_class_group_alloc");
  const dealloc = requireFunction(exports, "sagejs_class_group_dealloc");
  const runJson = requireFunction(exports, "sagejs_class_group_run_json");
  if (abiVersion() !== ABI_VERSION) {
    wasi.dispose();
    throw new TypeError(`unsupported ABI version ${abiVersion()}`);
  }

  let closed = false;
  let closeCount = 0;

  function assertLive() {
    if (closed) throw new Error("lifecycle candidate is closed");
  }

  function copyOutput(packed) {
    const value = BigInt.asUintN(64, packed);
    const pointer = Number(value & 0xffff_ffffn);
    const length = Number(value >> 32n);
    if (pointer === 0 || length === 0) {
      throw new Error("candidate returned an empty output");
    }
    try {
      return checkedRange(exports.memory, pointer, length, "output").slice();
    } finally {
      dealloc(pointer, length);
    }
  }

  function runBytes(input) {
    assertLive();
    if (!(input instanceof Uint8Array) || input.byteLength === 0 ||
        input.byteLength > MAX_TRANSFER_BYTES) {
      throw new RangeError("input is outside the transfer policy");
    }
    const pointer = alloc(input.byteLength) >>> 0;
    if (pointer === 0) throw new Error("input allocation failed");
    try {
      checkedRange(exports.memory, pointer, input.byteLength, "input").set(input);
      const output = copyOutput(runJson(pointer, input.byteLength));
      return decoder.decode(output);
    } finally {
      dealloc(pointer, input.byteLength);
    }
  }

  return Object.freeze({
    run(request) {
      return JSON.parse(runBytes(encoder.encode(JSON.stringify(request))));
    },
    runBytes,
    runNullInput() {
      assertLive();
      return JSON.parse(decoder.decode(copyOutput(runJson(0, 0))));
    },
    rejectsOversizedAllocation() {
      assertLive();
      return (alloc(MAX_TRANSFER_BYTES + 1) >>> 0) === 0;
    },
    memoryPages() {
      assertLive();
      return exports.memory.buffer.byteLength / 65_536;
    },
    close() {
      closeCount += 1;
      if (closed) return;
      closed = true;
      wasi.dispose();
    },
    testing: Object.freeze({
      closeCount: () => closeCount,
      isClosed: () => closed,
      imports,
    }),
  });
}

export const lifecycleAbiPolicy = Object.freeze({
  version: ABI_VERSION,
  maximumTransferBytes: MAX_TRANSFER_BYTES,
  guestHandleRegistry: false,
  cooperativeCancellation: false,
});
