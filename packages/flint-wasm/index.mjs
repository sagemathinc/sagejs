import { createWasiHost } from "./dist/wasi-runtime.mjs";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

async function compile(source) {
  if (source instanceof WebAssembly.Module) {
    return source;
  }
  if (source instanceof Response) {
    return WebAssembly.compileStreaming(Promise.resolve(source));
  }
  if (
    typeof source === "string" ||
    (typeof URL !== "undefined" && source instanceof URL)
  ) {
    return WebAssembly.compileStreaming(fetch(source));
  }
  return WebAssembly.compile(source);
}

function readCString(memory, pointer, capacity) {
  const bytes = new Uint8Array(memory.buffer, pointer, capacity);
  const end = bytes.indexOf(0);
  if (end < 0) {
    throw new Error("FLINT WASM returned an unterminated result");
  }
  return decoder.decode(bytes.subarray(0, end));
}

/**
 * Instantiate the browser-compatible FLINT factorization kernel.
 *
 * `source` may be a URL, Response, ArrayBuffer, typed-array view, or an
 * already compiled WebAssembly.Module.
 */
export async function instantiateFlintFactor(source) {
  const module = await compile(source);
  const wasi = createWasiHost();
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.imports,
  });
  const memory = instance.exports.memory;
  wasi.initialize(instance);

  const inputPointer = Number(instance.exports.sagejs_factor_input());
  const inputCapacity = Number(
    instance.exports.sagejs_factor_input_capacity(),
  );
  const outputPointer = Number(instance.exports.sagejs_factor_output());
  const outputCapacity = Number(
    instance.exports.sagejs_factor_output_capacity(),
  );

  function factor(value) {
    if (typeof value === "number" && !Number.isSafeInteger(value)) {
      throw new RangeError("number input must be a safe integer; use bigint");
    }
    let input;
    try {
      input = BigInt(value).toString();
    } catch {
      throw new TypeError("factor input must be an integer");
    }
    const bytes = encoder.encode(input);
    if (bytes.length + 1 > inputCapacity) {
      throw new RangeError(
        `factor input exceeds the ${inputCapacity - 1}-byte WASM limit`,
      );
    }

    const destination = new Uint8Array(
      memory.buffer,
      inputPointer,
      inputCapacity,
    );
    destination.set(bytes);
    destination[bytes.length] = 0;

    const status = instance.exports.sagejs_factor();
    if (status === 1) {
      throw new TypeError("FLINT rejected the integer input");
    }
    if (status === 2) {
      throw new RangeError("FLINT factorization output buffer is too small");
    }
    if (status === 3) {
      throw new RangeError("cannot factor zero");
    }
    if (status !== 0) {
      throw new Error(`FLINT factorization failed with status ${status}`);
    }

    const encoded = readCString(memory, outputPointer, outputCapacity);
    const result = JSON.parse(encoded);
    return {
      sign: result.sign,
      factors: result.factors.map(([prime, exponent]) => [
        BigInt(prime),
        exponent,
      ]),
    };
  }

  return Object.freeze({ factor });
}

export function formatFactorization({ sign, factors }) {
  const terms = factors.map(([prime, exponent]) =>
    exponent === 1 ? `${prime}` : `${prime}^${exponent}`,
  );
  if (sign < 0) {
    terms.unshift("-1");
  }
  return terms.length === 0 ? "1" : terms.join(" * ");
}
