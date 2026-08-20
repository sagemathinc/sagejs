const MAX_DEGREE = 64;
const MAX_PRIMES = 65536;
const MAX_WORD_PRIME = 0xffffffffn;

const REQUIRED_EXPORTS = Object.freeze([
  "memory",
  "sagejs_nf_zeta_residue_begin",
  "sagejs_nf_zeta_residue_input",
  "sagejs_nf_zeta_residue_input_words",
  "sagejs_nf_zeta_residue_output",
  "sagejs_nf_zeta_residue_output_words",
  "sagejs_nf_zeta_residue_compute",
  "sagejs_nf_zeta_residue_clear",
]);

function uint32(value) {
  return Number(value) >>> 0;
}

function exactInteger(value, description) {
  if (typeof value === "number" && !Number.isSafeInteger(value)) {
    throw new RangeError(`${description} must be exact; use bigint`);
  }
  try {
    return BigInt(value);
  } catch {
    throw new TypeError(`${description} must be an integer`);
  }
}

function positiveResidue(value, prime) {
  value %= prime;
  return value < 0n ? value + prime : value;
}

function batchError(status) {
  switch (status) {
    case -1:
      return new TypeError("number-field residue batch has invalid buffers");
    case -2:
      return new RangeError("polynomial degree must be between 1 and 64");
    case -3:
      return new RangeError("a factor-degree batch is limited to 65536 primes");
    case -4:
      return new RangeError("number-field residue batch size overflowed");
    case -5:
      return new RangeError("unable to allocate number-field residue buffers");
    default:
      return new Error(`number-field residue batch failed with status ${status}`);
  }
}

/**
 * Create the number-field zeta portion of the FLINT Wasm backend.
 *
 * The public operation deliberately matches the Node addon's packed API, but
 * arbitrary coefficients are reduced in JavaScript before the single packed
 * copy into Wasm. Public factor records are constructed by ordinary Sage.js,
 * not by either host adapter.
 */
export function createNumberFieldZetaBackend(
  instance,
  { recordCapability = () => {} } = {},
) {
  if (!instance || typeof instance !== "object") {
    throw new TypeError("expected an instantiated FLINT WebAssembly module");
  }
  const exports = instance.exports;
  for (const name of REQUIRED_EXPORTS) {
    if (!(name in exports)) {
      throw new Error(`FLINT WebAssembly module is missing export ${name}`);
    }
  }
  const memory = exports.memory;

  function nfFactorDegreesBatch(coefficients, primes) {
    if (!Array.isArray(coefficients)) {
      throw new TypeError("coefficients must be an Array of exact integers");
    }
    const degree = coefficients.length - 1;
    if (degree < 1 || degree > MAX_DEGREE) {
      throw new RangeError("polynomial degree must be between 1 and 64");
    }
    const exactCoefficients = coefficients.map((coefficient, index) =>
      exactInteger(coefficient, `coefficient ${index}`));
    if (exactCoefficients[degree] !== 1n) {
      throw new RangeError("polynomial must be monic");
    }
    if (!(primes instanceof BigUint64Array)) {
      throw new TypeError("primes must be a BigUint64Array");
    }
    const primeCount = primes.length;
    if (primeCount > MAX_PRIMES) {
      throw new RangeError("a factor-degree batch is limited to 65536 primes");
    }
    if (primeCount === 0) {
      return Object.freeze({
        degree,
        primeCount: 0,
        factorCounts: new Uint16Array(),
        exponents: new Uint16Array(),
        degrees: new Uint16Array(),
      });
    }

    const inputWords = primeCount + primeCount * (degree + 1);
    const packedInput = new Uint32Array(inputWords);
    for (let row = 0; row < primeCount; row += 1) {
      const prime = primes[row];
      if (prime > MAX_WORD_PRIME) {
        const error = new RangeError(
          "prime exceeds the WebAssembly word-prime factorization limit",
        );
        error.code = "SAGEJS_WASM_WORD_PRIME_UNAVAILABLE";
        throw error;
      }
      packedInput[row] = Number(prime);
      const offset = primeCount + row * (degree + 1);
      for (let index = 0; index <= degree; index += 1) {
        packedInput[offset + index] = Number(
          positiveResidue(exactCoefficients[index], prime),
        );
      }
    }

    const beginStatus = exports.sagejs_nf_zeta_residue_begin(
      degree,
      primeCount,
    );
    if (beginStatus !== 0) throw batchError(beginStatus);
    try {
      const actualInputWords = uint32(
        exports.sagejs_nf_zeta_residue_input_words(),
      );
      if (actualInputWords !== inputWords) {
        throw new Error("FLINT Wasm returned an inconsistent residue input size");
      }
      const inputPointer = uint32(exports.sagejs_nf_zeta_residue_input());
      new Uint32Array(memory.buffer, inputPointer, inputWords).set(packedInput);
      const status = exports.sagejs_nf_zeta_residue_compute();
      if (status > 0) {
        throw new RangeError(
          `unable to factor the polynomial at supplied prime index ${status - 1}`,
        );
      }
      if (status < 0) throw batchError(status);

      const factorCells = primeCount * degree;
      const outputWords = primeCount + 2 * factorCells;
      const actualOutputWords = uint32(
        exports.sagejs_nf_zeta_residue_output_words(),
      );
      if (actualOutputWords !== outputWords) {
        throw new Error("FLINT Wasm returned an inconsistent residue output size");
      }
      const outputPointer = uint32(exports.sagejs_nf_zeta_residue_output());
      // One copied egress keeps returned views valid across memory growth and
      // permits the C-owned buffers to be cleared immediately.
      const output = new Uint16Array(
        memory.buffer,
        outputPointer,
        outputWords,
      ).slice();
      recordCapability(
        "napi:@sagemath/sagejs-flint:nfFactorDegreesBatch",
        "receipt-backed-wasm-artifact",
        {
          executionTarget: "wasm-artifact",
          ingressBytes: packedInput.byteLength,
          egressBytes: output.byteLength,
        },
      );
      return Object.freeze({
        degree,
        primeCount,
        factorCounts: output.subarray(0, primeCount),
        exponents: output.subarray(primeCount, primeCount + factorCells),
        degrees: output.subarray(primeCount + factorCells),
      });
    } finally {
      exports.sagejs_nf_zeta_residue_clear();
    }
  }

  return Object.freeze({
    nfFactorDegreesBatch,
    nfFactorDegreesBatchMaxPrime: MAX_WORD_PRIME,
  });
}

export const numberFieldZetaWasmExports = REQUIRED_EXPORTS;
