const ABI_VERSION = 1;
const MAX_TRANSFER_BYTES = 16 * 1024 * 1024;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

function elapsed(started) {
  return performance.now() - started;
}

function checkedSlice(memory, pointer, length, label) {
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
    throw new TypeError(`class-group candidate does not export function ${name}`);
  }
  return exports[name];
}

function inspectModule(module) {
  return {
    imports: WebAssembly.Module.imports(module).map(({ module: namespace, name, kind }) => ({
      module: namespace,
      name,
      kind,
    })),
    exports: WebAssembly.Module.exports(module).map(({ name, kind }) => ({ name, kind })),
  };
}

export function qualificationEmptyEnvironmentImports(imports, memoryProvider) {
  const importedNames = new Set(
    imports
      .filter((item) => item.module === "wasi_snapshot_preview1")
      .map((item) => item.name),
  );
  const answer = {};
  if (importedNames.has("environ_get")) answer.environ_get = () => 0;
  if (importedNames.has("environ_sizes_get")) {
    answer.environ_sizes_get = (countPointer, bytesPointer) => {
      const memory = memoryProvider();
      if (!(memory instanceof WebAssembly.Memory)) return 21; // EFAULT
      const view = new DataView(memory.buffer);
      if (countPointer < 0 || bytesPointer < 0 ||
          countPointer + 4 > view.byteLength || bytesPointer + 4 > view.byteLength) {
        return 21;
      }
      view.setUint32(countPointer, 0, true);
      view.setUint32(bytesPointer, 0, true);
      return 0;
    };
  }
  return answer;
}

async function instantiateCandidate(module, imports) {
  const namespaces = new Set(imports.map((item) => item.module));
  for (const namespace of namespaces) {
    if (namespace !== "wasi_snapshot_preview1") {
      throw new TypeError(`unsupported Wasm import namespace ${JSON.stringify(namespace)}`);
    }
  }
  let wasi = null;
  let instance = null;
  const importObject = {};
  if (namespaces.has("wasi_snapshot_preview1")) {
    const { createWasiHost } = await import(
      "/packages/flint-wasm/src/wasi-runtime.mjs"
    );
    wasi = createWasiHost();
    importObject.wasi_snapshot_preview1 = { ...wasi.imports };
    const importedNames = new Set(
      imports
        .filter((item) => item.module === "wasi_snapshot_preview1")
        .map((item) => item.name),
    );
    const qualificationOnly = new Set(["environ_get", "environ_sizes_get"]);
    for (const name of importedNames) {
      if (typeof importObject.wasi_snapshot_preview1[name] !== "function" &&
          !qualificationOnly.has(name)) {
        wasi.dispose();
        throw new TypeError(`unsupported WASI import ${JSON.stringify(name)}`);
      }
    }
    // Rust's wasm32-wasip1 std reactor requests the process environment even
    // though this candidate never reads it. Qualification supplies a
    // deterministic empty environment; this is not a claim that the
    // unmodified production WASI host supports the import.
    Object.assign(
      importObject.wasi_snapshot_preview1,
      qualificationEmptyEnvironmentImports(imports, () => instance?.exports?.memory),
    );
  }
  const started = performance.now();
  instance = await WebAssembly.instantiate(module, importObject);
  const instantiateMs = elapsed(started);
  if (typeof instance.exports._start === "function") {
    wasi?.dispose();
    throw new TypeError("class-group candidate must be a reactor, not a WASI command");
  }
  if (wasi !== null) wasi.initialize(instance);
  return { instance, instantiateMs, wasi };
}

export async function loadClassGroupCandidate(artifactUrl) {
  if (typeof artifactUrl !== "string" || !artifactUrl.startsWith("/")) {
    throw new TypeError("artifact URL must be an absolute same-origin path");
  }
  const fetchStarted = performance.now();
  const response = await fetch(artifactUrl, { cache: "no-store", credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`candidate fetch failed with HTTP ${response.status}`);
  }
  const bytes = await response.arrayBuffer();
  const fetchMs = elapsed(fetchStarted);
  const compileStarted = performance.now();
  const module = await WebAssembly.compile(bytes);
  const compileMs = elapsed(compileStarted);
  const description = inspectModule(module);
  const { instance, instantiateMs, wasi } = await instantiateCandidate(
    module,
    description.imports,
  );
  const exports = instance.exports;
  if (!(exports.memory instanceof WebAssembly.Memory)) {
    wasi?.dispose();
    throw new TypeError("class-group candidate does not export Wasm memory");
  }
  const abiVersion = requireFunction(exports, "sagejs_class_group_abi_version");
  const alloc = requireFunction(exports, "sagejs_class_group_alloc");
  const dealloc = requireFunction(exports, "sagejs_class_group_dealloc");
  const runJson = requireFunction(exports, "sagejs_class_group_run_json");
  if (abiVersion() !== ABI_VERSION) {
    wasi?.dispose();
    throw new TypeError(`unsupported class-group ABI version ${abiVersion()}`);
  }
  let closed = false;
  return {
    route: "rust-class-group-wasm-artifact",
    description,
    timings: { fetch: fetchMs, compile: compileMs, instantiate: instantiateMs },
    memoryPages: () => exports.memory.buffer.byteLength / 65_536,
    run(request) {
      if (closed) throw new Error("class-group candidate is closed");
      const input = textEncoder.encode(JSON.stringify(request));
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
        if (outputPointer === 0 || outputLength === 0) {
          throw new Error("class-group candidate returned an empty result");
        }
        const inputEnd = inputPointer + input.byteLength;
        const outputEnd = outputPointer + outputLength;
        if (inputPointer < outputEnd && outputPointer < inputEnd) {
          throw new Error("class-group result aliases its input allocation");
        }
        const copy = checkedSlice(
          exports.memory,
          outputPointer,
          outputLength,
          "output",
        ).slice();
        return JSON.parse(textDecoder.decode(copy));
      } finally {
        if (outputPointer !== 0 && outputLength !== 0) dealloc(outputPointer, outputLength);
        dealloc(inputPointer, input.byteLength);
      }
    },
    close() {
      if (closed) return;
      closed = true;
      wasi?.dispose();
    },
  };
}

export const classGroupBrowserAbi = Object.freeze({
  version: ABI_VERSION,
  maximumTransferBytes: MAX_TRANSFER_BYTES,
});
