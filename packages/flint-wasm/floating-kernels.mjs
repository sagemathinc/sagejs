import { instantiateWasmKernelPacks } from "./dist/wasm-pack-loader.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
const MAX_PACK_BYTES = 16 * 1024 * 1024;

async function boundedBytes(response, limit) {
  if (!response.ok) throw new Error(`floating pack HTTP ${response.status}`);
  const advertised = Number(response.headers.get("content-length"));
  if (advertised > limit) {
    await response.body?.cancel();
    throw new RangeError("floating pack response exceeds its byte budget");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new TypeError("floating pack response has no byte stream");
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new RangeError("floating pack response exceeds its byte budget");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

// These bindings come from the separately validated Python module bundle, not
// from the accelerator's assertion about the source it implements. Bind every
// function before fetching or instantiating a pack; a partially matching pack
// must never replace only some decorators in the same source module.
function sourceBindings(manifest, moduleSources) {
  if (manifest?.schema !== "sagejs.native-wasm-pack/v1" ||
      manifest.packs?.length !== 1 || !Array.isArray(manifest.kernels) ||
      manifest.kernels.length === 0) {
    throw new TypeError("invalid isolated floating kernel manifest");
  }
  const pack = manifest.packs[0];
  if (pack.domain !== "float64" || pack.status !== "built" ||
      !SHA256.test(pack.sha256) || !Number.isSafeInteger(pack.bytes) ||
      pack.bytes <= 0 || pack.bytes > MAX_PACK_BYTES ||
      pack.ownershipAdapter !== null ||
      !Array.isArray(pack.requiredResourceAdapters) ||
      pack.requiredResourceAdapters.length !== 0 ||
      !Array.isArray(pack.toolchain?.archives) || pack.toolchain.archives.length !== 0 ||
      !SHA256.test(pack.packKey) ||
      pack.asset !== `packs/float64/${pack.packKey}.wasm`) {
    throw new TypeError("floating pack is not a built, prefix-free binary64 pack");
  }
  const bindings = new Map();
  for (const kernel of manifest.kernels) {
    const hash = moduleSources.get(kernel.logicalSource);
    if (!hash || hash !== kernel.sourceHash || kernel.domain !== "float64" ||
        !SHA256.test(kernel.abiHash) || !SHA256.test(kernel.identityHash) ||
        !Array.isArray(kernel.foreignDeclarations) || kernel.foreignDeclarations.length !== 0 ||
        !Array.isArray(kernel.functions) || kernel.functions.length === 0) {
      throw new TypeError("floating pack source differs from the Python module bundle");
    }
    const functions = new Map();
    if (bindings.has(kernel.logicalSource)) {
      throw new TypeError("duplicate floating pack source module");
    }
    for (const fn of kernel.functions) {
      if (fn.kernelKind !== "float64" || fn.status !== "compiled-source" ||
          !SHA256.test(fn.declarationHash) || !fn.bridge || functions.has(fn.name)) {
        throw new TypeError("invalid floating kernel declaration");
      }
      functions.set(fn.name, Object.freeze({
        sourceHash: hash,
        abiHash: kernel.abiHash,
        portableIdentity: kernel.identityHash,
        declarationHash: fn.declarationHash,
      }));
    }
    bindings.set(kernel.logicalSource, functions);
  }
  return bindings;
}

/**
 * Optional, worker-owned acceleration for the statistics import family.
 *
 * prepare() finishes before decorated Python modules are imported. resolve()
 * stays synchronous and returns null before preparation or after any failure.
 * Missing/corrupt/stale resources leave the same-source Python fallback intact;
 * one failed load is cached for the session, never retried on every query.
 * This does not remove the full evaluator's existing eager exact-math backends.
 */
export function createLazyFloatingKernels({
  manifestUrl,
  moduleBundle,
  fetchResource = globalThis.fetch,
  host,
  instrument = (resolver) => resolver,
  timeoutMs = 10000,
}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60000) {
    throw new TypeError("floating pack timeout must be 1..60000 milliseconds");
  }
  const moduleSources = new Map(Object.values(moduleBundle.modules).map(
    (record) => [record.source, record.sourceSha256],
  ));
  let state = manifestUrl === undefined ? "disabled" : "unloaded";
  let resolver;
  let bindings;
  let pending;
  let controller;
  let closed = false;
  let failure;
  async function load() {
    state = "loading";
    controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = new URL(String(manifestUrl), import.meta.url);
      const bytes = await boundedBytes(
        await fetchResource(url, { signal: controller.signal }), MAX_MANIFEST_BYTES,
      );
      const manifest = JSON.parse(new TextDecoder().decode(bytes));
      const checked = sourceBindings(manifest, moduleSources);
      const loaded = await instantiateWasmKernelPacks({
        manifest,
        async load(pack) {
          const bytes = await boundedBytes(await fetchResource(
            new URL(pack.asset, url), { signal: controller.signal },
          ), Math.min(MAX_PACK_BYTES, pack.bytes));
          if (bytes.byteLength !== pack.bytes) {
            throw new TypeError("floating pack size differs from its manifest");
          }
          return bytes;
        },
        host,
      });
      if (closed) return;
      if (controller.signal.aborted) throw new Error("floating pack loading timed out");
      // Instrumentation can only accept a digest-authenticated resolver. It
      // never creates capability IDs from a caller-supplied function name.
      resolver = instrument(loaded);
      bindings = checked;
      state = "ready";
    } catch (error) {
      if (!closed) {
        state = "unavailable";
        failure = String(error?.message ?? error);
      }
    } finally {
      clearTimeout(timer);
      controller = undefined;
    }
  }
  return Object.freeze({
    async prepare(imports) {
      if (closed || state === "disabled" || !imports.some((name) =>
        name === "sagejs.numerics.statistics" ||
        name.startsWith("sagejs.numerics.statistics.")
      )) return;
      await (pending ??= load());
    },
    resolve(logicalSource, name, expected = {}) {
      if (closed || state !== "ready") return null;
      const binding = bindings.get(logicalSource)?.get(name);
      if (!binding) return null;
      for (const [key, value] of Object.entries(binding)) {
        if (expected[key] !== undefined && expected[key] !== value) return null;
      }
      return resolver.resolve(logicalSource, name, binding);
    },
    status() {
      return Object.freeze({ state, ...(failure ? { reason: failure } : {}) });
    },
    close() {
      closed = true;
      controller?.abort();
      resolver = undefined;
      bindings = undefined;
      state = "closed";
    },
  });
}
