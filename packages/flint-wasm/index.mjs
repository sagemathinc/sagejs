const encoder = new TextEncoder();
const decoder = new TextDecoder();

const WASI_SUCCESS = 0;
const WASI_BADF = 8;
const WASI_NOSYS = 52;

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

function makeWasiImports(getMemory) {
  function view() {
    return new DataView(getMemory().buffer);
  }

  const implemented = {
    clock_time_get(_clockId, _precision, resultPointer) {
      const nanoseconds = BigInt(Date.now()) * 1_000_000n;
      view().setBigUint64(resultPointer, nanoseconds, true);
      return WASI_SUCCESS;
    },

    fd_write(fileDescriptor, iovPointer, iovCount, writtenPointer) {
      if (fileDescriptor !== 1 && fileDescriptor !== 2) {
        return WASI_BADF;
      }
      const memory = getMemory();
      const data = view();
      const chunks = [];
      let bytesWritten = 0;
      for (let index = 0; index < iovCount; index += 1) {
        const pointer = data.getUint32(iovPointer + index * 8, true);
        const length = data.getUint32(iovPointer + index * 8 + 4, true);
        chunks.push(new Uint8Array(memory.buffer, pointer, length));
        bytesWritten += length;
      }
      const output = chunks.map((chunk) => decoder.decode(chunk)).join("");
      (fileDescriptor === 2 ? console.error : console.log)(output);
      data.setUint32(writtenPointer, bytesWritten, true);
      return WASI_SUCCESS;
    },

    proc_exit(status) {
      throw new Error(`FLINT WASM requested process exit ${status}`);
    },
  };

  return new Proxy(implemented, {
    get(target, property) {
      return target[property] ?? (() => WASI_NOSYS);
    },
  });
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
  let memory;
  const wasi = makeWasiImports(() => memory);
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi,
  });
  memory = instance.exports.memory;
  instance.exports._initialize?.();

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
