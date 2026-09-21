import { createWasiHost } from "./src/wasi-runtime.mjs";

const ABI_VERSION = 1;
const MAX_TRANSFER_BYTES = 1024 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true });

function checkedSlice(memory, pointer, length, label) {
  const end = pointer + length;
  if (
    !Number.isInteger(pointer) ||
    pointer <= 0 ||
    !Number.isInteger(length) ||
    length <= 0 ||
    length > MAX_TRANSFER_BYTES ||
    !Number.isSafeInteger(end) ||
    end > memory.buffer.byteLength
  ) {
    throw new RangeError(`${label} is outside Wasm memory`);
  }
  return new Uint8Array(memory.buffer, pointer, length);
}

function requiredFunction(exports, name) {
  if (typeof exports[name] !== "function") {
    throw new TypeError(`class-group core does not export ${name}`);
  }
  return exports[name];
}

function emptyEnvironmentImports(imports, memoryProvider) {
  const names = new Set(
    imports
      .filter(({ module }) => module === "wasi_snapshot_preview1")
      .map(({ name }) => name),
  );
  const result = {};
  if (names.has("environ_get")) result.environ_get = () => 0;
  if (names.has("environ_sizes_get")) {
    result.environ_sizes_get = (countPointer, bytesPointer) => {
      const memory = memoryProvider();
      if (!(memory instanceof WebAssembly.Memory)) return 21;
      const view = new DataView(memory.buffer);
      if (
        countPointer < 0 ||
        bytesPointer < 0 ||
        countPointer + 4 > view.byteLength ||
        bytesPointer + 4 > view.byteLength
      ) {
        return 21;
      }
      view.setUint32(countPointer, 0, true);
      view.setUint32(bytesPointer, 0, true);
      return 0;
    };
  }
  return result;
}

/** Instantiate the authenticated class-group reactor inside its owning worker. */
export async function instantiateClassGroupCore(bytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) {
    throw new TypeError("class-group artifact must be nonempty bytes");
  }
  const compileStarted = performance.now();
  const module = await WebAssembly.compile(bytes);
  const compileMilliseconds = performance.now() - compileStarted;
  const imports = WebAssembly.Module.imports(module);
  if (imports.some(({ module: namespace }) => namespace !== "wasi_snapshot_preview1")) {
    throw new TypeError("class-group core has an unsupported import namespace");
  }

  let instance;
  const wasi = createWasiHost({ stdout() {}, stderr() {} });
  const wasiImports = {
    ...wasi.imports,
    ...emptyEnvironmentImports(imports, () => instance?.exports?.memory),
  };
  for (const { module: namespace, name } of imports) {
    if (namespace === "wasi_snapshot_preview1" && typeof wasiImports[name] !== "function") {
      wasi.dispose();
      throw new TypeError(`class-group core requires unsupported WASI import ${name}`);
    }
  }
  const instantiateStarted = performance.now();
  instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasiImports,
  });
  const instantiateMilliseconds = performance.now() - instantiateStarted;
  if (typeof instance.exports._start === "function") {
    wasi.dispose();
    throw new TypeError("class-group core must be a reactor, not a command");
  }
  wasi.initialize(instance);

  const exports = instance.exports;
  if (!(exports.memory instanceof WebAssembly.Memory)) {
    wasi.dispose();
    throw new TypeError("class-group core does not export memory");
  }
  const abiVersion = requiredFunction(exports, "sagejs_class_group_abi_version");
  const alloc = requiredFunction(exports, "sagejs_class_group_alloc");
  const dealloc = requiredFunction(exports, "sagejs_class_group_dealloc");
  const runJson = requiredFunction(exports, "sagejs_class_group_run_json");
  if (abiVersion() !== ABI_VERSION) {
    wasi.dispose();
    throw new TypeError(`unsupported class-group ABI version ${abiVersion()}`);
  }

  let closed = false;
  function invoke(request) {
    if (closed) throw new Error("class-group core is closed");
    const input = encoder.encode(JSON.stringify(request));
    if (input.byteLength === 0 || input.byteLength > MAX_TRANSFER_BYTES) {
      throw new RangeError("class-group request exceeds the transfer limit");
    }
    const inputPointer = alloc(input.byteLength) >>> 0;
    if (inputPointer === 0) throw new Error("class-group input allocation failed");
    let outputPointer = 0;
    let outputLength = 0;
    try {
      checkedSlice(exports.memory, inputPointer, input.byteLength, "input").set(input);
      const packed = BigInt.asUintN(64, runJson(inputPointer, input.byteLength));
      outputPointer = Number(packed & 0xffff_ffffn);
      outputLength = Number(packed >> 32n);
      const inputEnd = inputPointer + input.byteLength;
      const outputEnd = outputPointer + outputLength;
      if (inputPointer < outputEnd && outputPointer < inputEnd) {
        throw new Error("class-group result aliases its input allocation");
      }
      const output = checkedSlice(
        exports.memory,
        outputPointer,
        outputLength,
        "output",
      ).slice();
      return JSON.parse(decoder.decode(output));
    } finally {
      if (outputPointer !== 0 && outputLength !== 0) dealloc(outputPointer, outputLength);
      dealloc(inputPointer, input.byteLength);
    }
  }

  return Object.freeze({
    invoke,
    diagnostics() {
      return Object.freeze({
        abiVersion: ABI_VERSION,
        imports: imports.map(({ module, name, kind }) => ({ module, name, kind })),
        exports: WebAssembly.Module.exports(module),
        compileMilliseconds,
        instantiateMilliseconds,
        memoryPages: exports.memory.buffer.byteLength / 65_536,
        cancellation: "worker-termination",
      });
    },
    close() {
      if (closed) return;
      closed = true;
      wasi.dispose();
    },
  });
}

export const classGroupCoreAbi = Object.freeze({
  version: ABI_VERSION,
  maximumTransferBytes: MAX_TRANSFER_BYTES,
});
