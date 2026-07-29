import { Volume, createFsFromVolume } from "@cowasm/memfs";
import path from "path-browserify";
import wasiModule from "wasi-js/dist/wasi.js";

const decoder = new TextDecoder();
const WASI = wasiModule.default;

function randomFillSync(target) {
  globalThis.crypto.getRandomValues(target);
  return target;
}

function writeConsole(method, data) {
  const text = decoder.decode(data);
  if (text) {
    console[method](text);
  }
}

/**
 * Construct the browser-safe WASI host used by the FLINT reactor.
 *
 * CoWasm's WASI implementation translates the WASI descriptor API onto a
 * Node-compatible filesystem. Its @cowasm/memfs backend keeps files private
 * to this evaluator and supplies the temporary-file semantics used by FLINT's
 * quadratic sieve.
 */
export function createWasiHost() {
  const volume = Volume.fromJSON({ "/tmp": null });
  const fs = createFsFromVolume(volume);
  const wasi = new WASI({
    args: [],
    env: {},
    preopens: { "/": "/" },
    bindings: {
      fs,
      path,
      hrtime: () =>
        BigInt(Math.trunc(globalThis.performance.now() * 1_000_000)),
      exit: (status) => {
        throw new Error(`FLINT WASM requested process exit ${status}`);
      },
      kill: (signal) => {
        throw new Error(`FLINT WASM requested signal ${signal}`);
      },
      randomFillSync,
      isTTY: () => false,
    },
    sendStdout: (data) => writeConsole("log", data),
    sendStderr: (data) => writeConsole("error", data),
  });

  return {
    imports: wasi.wasiImport,
    initialize(instance) {
      wasi.setMemory(instance.exports.memory);
      instance.exports._initialize?.();
    },
  };
}
