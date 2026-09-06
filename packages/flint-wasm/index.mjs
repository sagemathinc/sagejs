import { createWasiHost } from "./dist/wasi-runtime.mjs";
import {
  createGeneratedWasmBackend,
  generatedWasmManifest,
} from "./dist/ffi-resource-backend.mjs";
import { createPortablePolynomialBackend } from "./portable-polynomial.mjs";
import { createPortableExactBackend } from "./portable-exact.mjs";
import { createPortableMatrixBackend } from "./portable-matrix.mjs";
import {
  composeNumericRepresentationBackends,
  createNumericBackend,
} from "./numeric-backend.mjs";
import { createAnalyticWasmBackend } from "./analytic-backend.mjs";
import { createNumberFieldZetaBackend } from "./number-field-zeta.mjs";
import { createCurveBackend } from "./curve-backend.mjs";
import { createAlgebraicBackend } from "./algebraic.mjs";
import { createDirichletGroupBackend } from "./dirichlet-group.mjs";
import { createMultivariateBackend } from "./multivariate-backend.mjs";

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
export async function instantiateFlintFactor(
  source,
  {
    algebraicSource,
    recordCapability = () => {},
    multivariateResultant = true,
  } = {},
) {
  const module = await compile(source);
  const wasi = createWasiHost();
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.imports,
  });
  const memory = instance.exports.memory;
  wasi.initialize(instance);
  const generatedResourceBackend = createGeneratedWasmBackend(instance, {
    recordCapability,
  });
  const polynomialBackend = createPortablePolynomialBackend({ recordCapability });
  const exactBackend = createPortableExactBackend({
    recordCapability,
    primePi(value) {
      let input;
      try {
        input = BigInt(value);
      } catch {
        throw new TypeError("primePi input must be an integer");
      }
      if (input < 0n || input >= (1n << 63n)) {
        throw new RangeError("primePi input must be between 0 and 2^63 - 1");
      }
      const result = BigInt.asUintN(
        64,
        instance.exports.sagejs_wasm_prime_pi(input),
      );
      if (result === (1n << 64n) - 1n) {
        throw new Error("primePi failed to allocate its exact work tables");
      }
      return result;
    },
  });
  const multivariateBackend = createMultivariateBackend(instance, {
    recordCapability,
    enabled: multivariateResultant,
  });
  const matrixBackend = createPortableMatrixBackend();
  const numericBackend = createNumericBackend(instance, { recordCapability });
  const publicGeneratedResourceBackend = generatedResourceBackend;
  const dirichletGroupBackend = createDirichletGroupBackend(instance);
  const analyticBackend = createAnalyticWasmBackend(instance, {
    recordCapability,
    serializePoint: numericBackend.serializeAnalyticPoint,
    materialize(record, precision) {
      return numericBackend.complexFromStrings(
        record.real,
        record.imaginary,
        precision,
      );
    },
    resolveDirichletModulus(value) {
      return dirichletGroupBackend.isDirichletGroup(value)
        ? dirichletGroupBackend.dirichletGroupModulus(value)
        : value;
    },
  });
  const numberFieldZetaBackend = createNumberFieldZetaBackend(instance, {
    recordCapability,
  });
  const curveBackend = createCurveBackend(instance, { recordCapability });
  let algebraicBackend = {};
  if (algebraicSource !== undefined) {
    const algebraicModule = await compile(algebraicSource);
    const algebraicWasi = createWasiHost();
    const algebraicInstance = await WebAssembly.instantiate(algebraicModule, {
      wasi_snapshot_preview1: algebraicWasi.imports,
    });
    algebraicWasi.initialize(algebraicInstance);
    algebraicBackend = createAlgebraicBackend(algebraicInstance, {
      recordCapability,
      matrixFallback: matrixBackend,
    });
  }
  const numericRepresentationBackend = composeNumericRepresentationBackends(
    numericBackend,
    algebraicBackend,
  );

  // WebAssembly i32 results reach JavaScript as signed numbers even when the
  // C declaration is uint32_t/size_t. Normalize handles, pointers, and sizes.
  const uint32 = (value) => Number(value) >>> 0;

  const inputPointer = Number(instance.exports.sagejs_factor_input());
  const inputCapacity = Number(
    instance.exports.sagejs_factor_input_capacity(),
  );
  const outputPointer = Number(instance.exports.sagejs_factor_output());
  const outputCapacity = Number(
    instance.exports.sagejs_factor_output_capacity(),
  );

  function writeInteger(value, operation) {
    if (typeof value === "number" && !Number.isSafeInteger(value)) {
      throw new RangeError("number input must be a safe integer; use bigint");
    }
    let input;
    try {
      input = BigInt(value).toString();
    } catch {
      throw new TypeError(`${operation} input must be an integer`);
    }
    return writeText(input, operation);
  }

  function writeText(input, operation) {
    const bytes = encoder.encode(input);
    if (bytes.length + 1 > inputCapacity) {
      throw new RangeError(
        `${operation} input exceeds the ${inputCapacity - 1}-byte WASM limit`,
      );
    }

    const destination = new Uint8Array(
      memory.buffer,
      inputPointer,
      inputCapacity,
    );
    destination.set(bytes);
    destination[bytes.length] = 0;
    return bytes.length;
  }

  function factor(value) {
    const ingressBytes = writeInteger(value, "factor");
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
    recordCapability(
      "specialist:integer-factorization-wasm",
      "receipt-backed-wasm-artifact",
      {
        executionTarget: "wasm-artifact",
        ingressBytes,
        egressBytes: encoder.encode(encoded).length,
      },
    );
    return {
      sign: result.sign,
      factors: result.factors.map(([prime, exponent]) => [
        BigInt(prime),
        exponent,
      ]),
    };
  }

  function isPrime(value) {
    writeInteger(value, "isPrime");
    const result = instance.exports.sagejs_is_prime();
    if (result < 0) {
      throw new TypeError("FLINT rejected the integer input");
    }
    return result === 1;
  }

  function nextPrime(value) {
    writeInteger(value, "nextPrime");
    const status = instance.exports.sagejs_next_prime();
    if (status === 1) {
      throw new TypeError("FLINT rejected the integer input");
    }
    if (status === 2) {
      throw new RangeError("FLINT prime output buffer is too small");
    }
    if (status !== 0) {
      throw new Error(`FLINT next-prime search failed with status ${status}`);
    }
    return BigInt(readCString(memory, outputPointer, outputCapacity));
  }

  function matrixCharpoly(matrix) {
    const portable = matrixBackend.matrixCharpoly;
    let entries;
    let prefix;
    if (matrix?.kind === "ZZ") {
      entries = matrix.entries;
      prefix = "integer";
    } else if (
      matrix?.kind === "QQ" &&
      matrix.entries.every((entry) => entry.denominator === 1n)
    ) {
      entries = matrix.entries.map((entry) => entry.numerator);
      prefix = "integer";
    } else if (matrix?.kind === "QQ") {
      entries = matrix.entries;
      prefix = "rational";
    } else {
      return portable(matrix);
    }
    if (matrix.rows !== matrix.cols) {
      throw new RangeError(
        "characteristic polynomial requires a square matrix",
      );
    }
    if (instance.exports[`sagejs_${prefix}_charpoly_begin`](
      matrix.rows, matrix.cols,
    ) !== 1) {
      throw new Error("unable to initialize FLINT WASM charpoly");
    }
    try {
      for (let index = 0; index < entries.length; index += 1) {
        if (prefix === "integer") {
          writeInteger(entries[index], "matrix characteristic polynomial");
        } else {
          writeText(
            `${entries[index].numerator}/${entries[index].denominator}`,
            "matrix characteristic polynomial",
          );
        }
        if (instance.exports[`sagejs_${prefix}_charpoly_set`](index) !== 1) {
          throw new Error(
            `unable to transfer charpoly matrix entry ${index}`,
          );
        }
      }
      if (instance.exports[`sagejs_${prefix}_charpoly_compute`]() !== 1) {
        throw new Error("FLINT WASM characteristic polynomial failed");
      }
      const coefficients = [];
      for (let index = 0; index <= matrix.rows; index += 1) {
        if (
          instance.exports[`sagejs_${prefix}_charpoly_coefficient`](index) !== 1
        ) {
          throw new Error(
            `unable to read charpoly coefficient ${index}`,
          );
        }
        const text = readCString(memory, outputPointer, outputCapacity);
        if (prefix === "integer") {
          coefficients.push(BigInt(text));
        } else {
          const [numerator, denominator = "1"] = text.split("/");
          coefficients.push([BigInt(numerator), BigInt(denominator)]);
        }
      }
      if (matrix.kind === "ZZ") return coefficients;
      return matrixBackend.qqMatrix(
        1,
        coefficients.length,
        prefix === "integer"
          ? coefficients.map((coefficient) => [coefficient, 1n])
          : coefficients,
      ).entries;
    } finally {
      instance.exports[`sagejs_${prefix}_charpoly_clear`]();
    }
  }

  function modularSymbolsWeight2Info(level) {
    if (!Number.isInteger(level) || level <= 0 || level > 0x7fffffff) {
      throw new RangeError(
        "modular-symbol level must be between 1 and 2147483647",
      );
    }
    const status = instance.exports.sagejs_modsym_weight2_init(level);
    if (status !== 0) {
      throw new Error(
        `unable to construct weight-2 modular symbols (status ${status})`,
      );
    }
    try {
      return Object.freeze({
        level,
        p1Count: uint32(instance.exports.sagejs_modsym_p1_count()),
        dimension: uint32(instance.exports.sagejs_modsym_dimension()),
        fareyCusps: uint32(instance.exports.sagejs_modsym_farey_cusps()),
        p1Checksum: BigInt.asUintN(
          64,
          instance.exports.sagejs_modsym_p1_checksum(),
        ),
      });
    } finally {
      instance.exports.sagejs_modsym_clear();
    }
  }

  // Projective-line objects are immutable and can be reconstructed exactly
  // from their level.  Keep only a bounded number of C objects active: a long
  // synchronous Python loop cannot run FinalizationRegistry callbacks, so an
  // unbounded finalizer-only design retained every abandoned presentation.
  const maximumCachedP1Handles = 16;
  const p1Objects = new WeakMap();
  const activeP1States = new Set();
  const p1Finalizer = typeof FinalizationRegistry === "undefined"
    ? undefined
    : new FinalizationRegistry((state) => {
        if (state.handle !== 0) {
          instance.exports.sagejs_p1_destroy(state.handle);
          activeP1States.delete(state);
          state.handle = 0;
        }
      });

  function pruneP1Handles(protectedState) {
    while (activeP1States.size > maximumCachedP1Handles) {
      let victim;
      for (const candidate of activeP1States) {
        if (candidate !== protectedState) {
          victim = candidate;
          break;
        }
      }
      if (victim === undefined) {
        throw new Error("P1 handle cache has no evictable entry");
      }
      instance.exports.sagejs_p1_destroy(victim.handle);
      activeP1States.delete(victim);
      victim.handle = 0;
    }
  }

  function hydrateP1(state) {
    if (state.handle !== 0) {
      activeP1States.delete(state);
      activeP1States.add(state);
      return;
    }
    const handle = uint32(instance.exports.sagejs_p1_create(state.level));
    if (handle === 0) {
      throw new Error("unable to restore the WASM P1List");
    }
    const count = uint32(instance.exports.sagejs_p1_count(handle));
    if (count !== state.count) {
      instance.exports.sagejs_p1_destroy(handle);
      throw new Error("restored WASM P1List has inconsistent cardinality");
    }
    state.handle = handle;
    activeP1States.add(state);
    pruneP1Handles(state);
  }

  function p1Object(value) {
    const state = p1Objects.get(value);
    if (state === undefined) {
      throw new TypeError("expected a Sage.js WASM P1List");
    }
    hydrateP1(state);
    return state;
  }

  function wasmInt64(value, description) {
    let answer;
    try {
      answer = BigInt(value);
    } catch {
      throw new TypeError(`${description} must be an integer`);
    }
    if (answer < -(1n << 63n) || answer >= (1n << 63n)) {
      throw new RangeError(`${description} must fit in a signed 64-bit word`);
    }
    return answer;
  }

  function p1Index(value, p1) {
    if (!Number.isSafeInteger(value) || value < 0 || value >= p1.count) {
      throw new RangeError("P1List index is out of range");
    }
    return value;
  }

  function p1List(level) {
    if (!Number.isInteger(level) || level <= 0 || level > 0x7fffffff) {
      throw new RangeError("P1List level must be between 1 and 2147483647");
    }
    const handle = uint32(instance.exports.sagejs_p1_create(level));
    if (handle === 0) {
      throw new Error("unable to construct the WASM P1List");
    }
    const state = {
      handle,
      level,
      count: uint32(instance.exports.sagejs_p1_count(handle)),
    };
    const value = Object.freeze({ level, count: state.count });
    p1Objects.set(value, state);
    activeP1States.add(state);
    p1Finalizer?.register(value, state, value);
    pruneP1Handles(state);
    traceWasmP1(p1WasmCapabilities.list, 4, 8);
    return value;
  }

  function p1ListLevel(value) {
    return p1Object(value).level;
  }

  function p1ListCount(value) {
    return p1Object(value).count;
  }

  function unpackPair(packed) {
    packed = BigInt.asUintN(64, packed);
    return [
      Number((packed >> 32n) & 0xffffffffn),
      Number(packed & 0xffffffffn),
    ];
  }

  function p1ListEntry(value, index) {
    const p1 = p1Object(value);
    return unpackPair(instance.exports.sagejs_p1_entry(
      p1.handle, p1Index(index, p1),
    ));
  }

  function p1ListNormalize(value, u, v, withScalar) {
    const p1 = p1Object(value);
    const status = instance.exports.sagejs_p1_normalize(
      p1.handle,
      wasmInt64(u, "projective numerator"),
      wasmInt64(v, "projective denominator"),
      withScalar ? 1 : 0,
    );
    if (status !== 1) {
      throw new Error("unable to normalize a WASM P1List pair");
    }
    const answer = [
      uint32(instance.exports.sagejs_p1_normalized_u()),
      uint32(instance.exports.sagejs_p1_normalized_v()),
    ];
    if (withScalar) {
      answer.push(uint32(instance.exports.sagejs_p1_normalized_scalar()));
    }
    return answer;
  }

  function p1ListIndex(value, u, v) {
    const p1 = p1Object(value);
    const answer = uint32(instance.exports.sagejs_p1_index(
      p1.handle,
      wasmInt64(u, "projective numerator"),
      wasmInt64(v, "projective denominator"),
    ));
    return answer === 0xffffffff ? -1 : answer;
  }

  function p1Action(value, index, action) {
    const p1 = p1Object(value);
    const answer = uint32(instance.exports.sagejs_p1_apply(
      p1.handle, p1Index(index, p1), action,
    ));
    if (answer === 0xffffffff) {
      throw new Error("unable to apply a WASM P1List action");
    }
    return answer;
  }

  const presentationNames = [
    "level",
    "projectiveCosets",
    "cusps",
    "interiorPaths",
    "e1",
    "e2",
    "torsion2",
    "torsion3",
    "generators",
    "relations",
    "dimension",
  ];

  // These identifiers are deliberately closed over here instead of being
  // assembled from caller-controlled text.  Each operation below crosses the
  // JavaScript/Wasm boundary into src/modsym.c, whose persistent P1 handle owns
  // the exact shared C presentation and matrix computation.
  const p1WasmCapabilities = Object.freeze({
    list: "napi:@sagemath/sagejs-flint:p1List",
    presentation:
      "napi:@sagemath/sagejs-flint:p1ListManinPresentationInfo",
    hecke: "napi:@sagemath/sagejs-flint:p1ListHeckeMatrix",
    degeneracy: "napi:@sagemath/sagejs-flint:p1ListDegeneracyMatrix",
    boundary: "napi:@sagemath/sagejs-flint:p1ListBoundaryData",
    cuspidal: "napi:@sagemath/sagejs-flint:p1ListCuspidalBasis",
  });

  function traceWasmP1(capabilityId, ingressBytes, egressBytes) {
    recordCapability(
      capabilityId,
      "receipt-backed-wasm-artifact",
      { executionTarget: "wasm-artifact", ingressBytes, egressBytes },
    );
  }

  function tracePortableFallback(capabilityId) {
    recordCapability(capabilityId, "portable-fallback", {
      executionTarget: "portable-python",
      ingressBytes: 0,
      egressBytes: 0,
    });
  }

  function p1ListManinPresentationInfo(value) {
    const p1 = p1Object(value);
    const result = {};
    for (let field = 0; field < presentationNames.length; field += 1) {
      const number = uint32(
        instance.exports.sagejs_p1_presentation_field(p1.handle, field),
      );
      if (number === 0xffffffff) {
        throw new Error("unable to construct minimal Manin presentation");
      }
      result[presentationNames[field]] = number;
    }
    traceWasmP1(
      p1WasmCapabilities.presentation,
      4,
      presentationNames.length * 4,
    );
    return Object.freeze(result);
  }

  function readIntegerMatrix(operation) {
    const rows = uint32(instance.exports.sagejs_p1_matrix_rows());
    const columns = uint32(instance.exports.sagejs_p1_matrix_columns());
    const length = rows * columns;
    if (!Number.isSafeInteger(length)) {
      throw new RangeError(`${operation} matrix is too large`);
    }
    const pointer = uint32(instance.exports.sagejs_p1_matrix_data());
    if (length !== 0 && pointer === 0) {
      throw new Error(`unable to construct ${operation} matrix`);
    }
    const view = new Int32Array(memory.buffer, pointer, length);
    return matrixBackend.zzMatrix(
      rows, columns, Array.from(view, (entry) => BigInt(entry)),
    );
  }

  function runMatrixOperation(value, operation, invoke) {
    const p1 = p1Object(value);
    if (invoke(p1.handle) !== 1) {
      throw new Error(`unable to construct ${operation}`);
    }
    return readIntegerMatrix(operation);
  }

  function p1ListHeckeMatrix(value, prime) {
    prime = wasmInt64(prime, "weight-2 Hecke index");
    if (prime < 2n || prime > 0x7fffffffn || !isPrime(prime)) {
      throw new RangeError(
        "weight-2 Hecke index must be a prime fitting in 31 bits",
      );
    }
    const result = runMatrixOperation(value, "exact weight-2 Hecke matrix",
      (handle) => instance.exports.sagejs_p1_hecke_matrix(
        handle, Number(prime),
      ));
    traceWasmP1(
      p1WasmCapabilities.hecke,
      8,
      8 + result.rows * result.cols * 4,
    );
    return result;
  }

  function p1ListDegeneracyMatrix(sourceValue, targetValue, index) {
    const source = p1Object(sourceValue);
    const target = p1Object(targetValue);
    index = wasmInt64(index, "weight-2 degeneracy index");
    if (
      index <= 0n || index > 0x7fffffffn ||
      source.level % target.level !== 0 ||
      BigInt(source.level / target.level) % index !== 0n
    ) {
      throw new RangeError(
        "degeneracy index must divide the quotient of source and target levels",
      );
    }
    if (instance.exports.sagejs_p1_degeneracy_matrix(
      source.handle,
      target.handle,
      Number(index),
    ) !== 1) {
      throw new Error("unable to construct exact weight-2 degeneracy matrix");
    }
    const result = readIntegerMatrix("exact weight-2 degeneracy");
    traceWasmP1(
      p1WasmCapabilities.degeneracy,
      12,
      8 + result.rows * result.cols * 4,
    );
    return result;
  }

  function p1ListBoundaryData(value) {
    const matrix = runMatrixOperation(value, "weight-2 boundary map",
      (handle) => instance.exports.sagejs_p1_boundary_data(handle));
    const count = uint32(instance.exports.sagejs_p1_cusp_count());
    const cusps = Array.from({ length: count }, (_, index) => [
      instance.exports.sagejs_p1_cusp_numerator(index),
      instance.exports.sagejs_p1_cusp_denominator(index),
    ]);
    traceWasmP1(
      p1WasmCapabilities.boundary,
      4,
      12 + matrix.rows * matrix.cols * 4 + count * 16,
    );
    return Object.freeze({ matrix, cusps: Object.freeze(cusps) });
  }

  function p1ListCuspidalBasis(value) {
    const result = runMatrixOperation(value, "exact cuspidal cycle basis",
      (handle) => instance.exports.sagejs_p1_cuspidal_basis(handle));
    traceWasmP1(
      p1WasmCapabilities.cuspidal,
      4,
      8 + result.rows * result.cols * 4,
    );
    return result;
  }

  function p1ListStarMatrix(value) {
    return runMatrixOperation(value, "weight-2 star involution",
      (handle) => instance.exports.sagejs_p1_star_matrix(handle));
  }

  function p1ListStarEigenspaceBasis(value, sign) {
    if (sign !== -1 && sign !== 1) {
      throw new RangeError("star eigenspace sign must be -1 or 1");
    }
    const star = matrixBackend.zzMatrixToQQ(p1ListStarMatrix(value));
    const entries = [];
    for (let row = 0; row < star.rows; row += 1) {
      for (let column = 0; column < star.cols; column += 1) {
        entries.push([row === column ? BigInt(sign) : 0n, 1n]);
      }
    }
    const scalar = matrixBackend.qqMatrix(star.rows, star.cols, entries);
    const relation = matrixBackend.matrixSub(star, scalar);
    // The native star matrix stores a column action.  Its right kernel gives
    // row coordinates for the transposed action used by Matrix/ModSym.
    const matrix = matrixBackend.matrixRightKernel(relation);
    return Object.freeze({ dimension: matrix.rows, matrix });
  }

  function p1ListReducePath(value, startNumerator, startDenominator,
    stopNumerator, stopDenominator) {
    return runMatrixOperation(value, "exact weight-2 path reduction",
      (handle) => instance.exports.sagejs_p1_reduce_path(
        handle,
        wasmInt64(startNumerator, "start numerator"),
        wasmInt64(startDenominator, "start denominator"),
        wasmInt64(stopNumerator, "stop numerator"),
        wasmInt64(stopDenominator, "stop denominator"),
      ));
  }

  function binomialBigInt(n, k) {
    k = Math.min(k, n - k);
    let answer = 1n;
    for (let index = 1; index <= k; index += 1) {
      answer = answer * BigInt(n - k + index) / BigInt(index);
    }
    return answer;
  }

  function signedPresentation(value, weight, sign) {
    const p1 = p1Object(value);
    weight = Number(weight);
    sign = Number(sign);
    if (!Number.isSafeInteger(weight) || weight < 2 ||
        ![-1, 0, 1].includes(sign)) {
      throw new RangeError(
        "higher-weight presentation requires weight >= 2 and sign -1, 0, or 1",
      );
    }
    const cosets = p1.count;
    const generators = (weight - 1) * cosets;
    if (!Number.isSafeInteger(generators) || generators > 20000) {
      throw new RangeError("higher-weight presentation exceeds the portable generator limit");
    }
    const pairs = Array.from({ length: cosets }, (_, index) => p1ListEntry(value, index));
    const parent = Array.from({ length: generators }, (_, index) => index);
    const coefficient = Array.from({ length: generators }, () => 1);
    const killed = Array.from({ length: generators }, () => false);
    const find = (item) => {
      const ancestor = parent[item];
      if (ancestor !== item) {
        const root = find(ancestor);
        coefficient[item] *= coefficient[ancestor];
        parent[item] = root;
      }
      return parent[item];
    };
    const union = (left, right, relationCoefficient) => {
      const leftRoot = find(left);
      const rightRoot = find(right);
      const leftScale = coefficient[left];
      const rightScale = coefficient[right];
      if (leftRoot === rightRoot) {
        if (leftScale + relationCoefficient * rightScale !== 0) killed[leftRoot] = true;
        return;
      }
      parent[leftRoot] = rightRoot;
      coefficient[leftRoot] = -relationCoefficient * rightScale * leftScale;
      killed[rightRoot] ||= killed[leftRoot];
    };
    for (let degree = 0; degree <= weight - 2; degree += 1) {
      for (let coset = 0; coset < cosets; coset += 1) {
        const [u, v] = pairs[coset];
        const imageCoset = p1ListIndex(value, BigInt(v), -BigInt(u));
        union(
          degree * cosets + coset,
          (weight - 2 - degree) * cosets + imageCoset,
          degree & 1 ? -1 : 1,
        );
      }
    }
    if (sign !== 0) {
      for (let degree = 0; degree <= weight - 2; degree += 1) {
        for (let coset = 0; coset < cosets; coset += 1) {
          const [u, v] = pairs[coset];
          const imageCoset = p1ListIndex(value, -BigInt(u), BigInt(v));
          const imageCoefficient = degree & 1 ? -1 : 1;
          union(
            degree * cosets + coset,
            degree * cosets + imageCoset,
            -sign * imageCoefficient,
          );
        }
      }
    }
    const rootColumn = Array.from({ length: generators }, () => -1);
    const columnRoot = [];
    for (let generator = 0; generator < generators; generator += 1) {
      const root = find(generator);
      if (!killed[root] && rootColumn[root] === -1) {
        rootColumn[root] = columnRoot.length;
        columnRoot.push(root);
      }
    }
    const freeCount = columnRoot.length;
    if (generators * freeCount > 5_000_000) {
      throw new RangeError("higher-weight relation matrix exceeds the portable dense guard");
    }
    const relationIntegers = Array.from(
      { length: generators * freeCount }, () => 0n,
    );
    const addRelation = (row, original, valueCoefficient) => {
      const root = find(original);
      if (killed[root]) return;
      const column = rootColumn[root];
      relationIntegers[row * freeCount + column] +=
        valueCoefficient * BigInt(coefficient[original]);
    };
    for (let degree = 0; degree <= weight - 2; degree += 1) {
      for (let coset = 0; coset < cosets; coset += 1) {
        const row = degree * cosets + coset;
        const [u, v] = pairs[coset];
        const tCoset = p1ListIndex(value, BigInt(v), -BigInt(u) - BigInt(v));
        const ttCoset = p1ListIndex(value, -BigInt(u) - BigInt(v), BigInt(u));
        const complement = weight - 2 - degree;
        addRelation(row, row, 1n);
        for (let index = 0; index <= complement; index += 1) {
          const signValue = (weight - 2 + index) & 1 ? -1n : 1n;
          addRelation(
            row,
            index * cosets + tCoset,
            signValue * binomialBigInt(complement, index),
          );
        }
        for (let index = 0; index <= degree; index += 1) {
          const signValue = (weight - 2 - degree + index) & 1 ? -1n : 1n;
          addRelation(
            row,
            (weight - 2 - degree + index) * cosets + ttCoset,
            signValue * binomialBigInt(degree, index),
          );
        }
      }
    }
    const relations = matrixBackend.qqMatrix(
      generators,
      freeCount,
      relationIntegers.map((entry) => [entry, 1n]),
    );
    const rank = matrixBackend.matrixRank(relations);
    const reduced = matrixBackend.matrixRref(relations);
    const pivotRows = Array.from({ length: freeCount }, () => -1);
    let pivotColumn = 0;
    for (let row = 0; row < rank; row += 1) {
      while (pivotColumn < freeCount &&
             reduced.entries[row * freeCount + pivotColumn].numerator === 0n) {
        pivotColumn += 1;
      }
      if (pivotColumn >= freeCount) throw new Error("invalid higher-weight rank profile");
      pivotRows[pivotColumn++] = row;
    }
    const freeColumns = [];
    for (let column = 0; column < freeCount; column += 1) {
      if (pivotRows[column] === -1) freeColumns.push(column);
    }
    const dimension = freeColumns.length;
    const targetByColumn = new Map(freeColumns.map((column, index) => [column, index]));
    const reductionEntries = [];
    for (let original = 0; original < generators; original += 1) {
      const root = find(original);
      const column = killed[root] ? -1 : rootColumn[root];
      const scale = BigInt(coefficient[original]);
      for (const freeColumn of freeColumns) {
        if (column === -1) {
          reductionEntries.push([0n, 1n]);
        } else if (pivotRows[column] === -1) {
          reductionEntries.push([
            targetByColumn.get(column) === targetByColumn.get(freeColumn) ? scale : 0n,
            1n,
          ]);
        } else {
          const entry = reduced.entries[pivotRows[column] * freeCount + freeColumn];
          reductionEntries.push([-scale * entry.numerator, entry.denominator]);
        }
      }
    }
    const reduction = matrixBackend.qqMatrix(generators, dimension, reductionEntries);
    recordCapability(
      "napi:@sagemath/sagejs-flint:p1ListHigherWeightPresentation",
      "shared-runtime-js",
      { executionTarget: "host-runtime-js", ingressBytes: 0, egressBytes: 0 },
    );
    return Object.freeze({
      generators,
      twoTermGenerators: freeCount,
      dimension,
      basisGenerators: Object.freeze(freeColumns.map((column) => columnRoot[column])),
      rationalReductionEntries: Object.freeze(
        reductionEntries.map(([numerator, denominator]) =>
          Object.freeze([numerator, denominator])),
      ),
      reduction,
    });
  }

  function characterPresentation(value, weight, sign, group, characterIndex) {
    if (typeof algebraicBackend.qqbarRootOfUnity !== "function") {
      throw new Error(
        "character presentations require the algebraic WebAssembly module",
      );
    }
    const p1 = p1Object(value);
    weight = Number(weight);
    sign = Number(sign);
    if (!Number.isSafeInteger(weight) || weight < 2 ||
        ![-1, 0, 1].includes(sign)) {
      throw new RangeError(
        "character presentation requires weight >= 2 and sign -1, 0, or 1",
      );
    }
    const groupData = dirichletGroupBackend.dirichletGroupData(group);
    const characterData = dirichletGroupBackend.dirichletCharacterData(
      group, BigInt(characterIndex),
    );
    if (BigInt(groupData.modulus) !== BigInt(p1.level)) {
      throw new RangeError("character modulus must equal the P1List level");
    }
    const characterOrder = BigInt(characterData.order);
    const rootOrderBig = characterOrder % 2n === 0n
      ? characterOrder : 2n * characterOrder;
    if (rootOrderBig < 1n || rootOrderBig > 0xffff_ffffn) {
      throw new RangeError("character root order exceeds browser limits");
    }
    const rootOrder = Number(rootOrderBig);
    const halfOrder = rootOrder / 2;
    const groupExponent = BigInt(groupData.exponent);
    const characterExponent = (residue) => {
      const raw = dirichletGroupBackend.dirichletCharacterExponent(
        group, BigInt(characterIndex), BigInt(residue),
      );
      if (raw === null) throw new Error("character scalar is not a unit");
      const scaled = BigInt(raw) * rootOrderBig;
      if (scaled % groupExponent !== 0n) {
        throw new Error("character exponent does not lie in the root field");
      }
      return Number(scaled / groupExponent);
    };
    const moduloExponent = (value) => {
      value %= rootOrder;
      return value < 0 ? value + rootOrder : value;
    };
    const cosets = p1.count;
    const generators = (weight - 1) * cosets;
    if (!Number.isSafeInteger(generators) || generators > 20000) {
      throw new RangeError("character presentation exceeds the portable generator limit");
    }
    const pairs = Array.from(
      { length: cosets }, (_, index) => p1ListEntry(value, index),
    );
    const parent = Array.from({ length: generators }, (_, index) => index);
    const exponent = Array.from({ length: generators }, () => 0);
    const killed = Array.from({ length: generators }, () => false);
    const find = (item) => {
      const ancestor = parent[item];
      if (ancestor !== item) {
        const root = find(ancestor);
        exponent[item] = moduloExponent(exponent[item] + exponent[ancestor]);
        parent[item] = root;
      }
      return parent[item];
    };
    // Impose left + zeta^relationExponent * right = 0.
    const union = (left, right, relationExponent) => {
      const leftRoot = find(left);
      const rightRoot = find(right);
      const leftScale = exponent[left];
      const rightScale = exponent[right];
      const expectedLeft = moduloExponent(
        halfOrder + relationExponent + rightScale,
      );
      if (leftRoot === rightRoot) {
        if (leftScale !== expectedLeft) killed[leftRoot] = true;
        return;
      }
      parent[leftRoot] = rightRoot;
      exponent[leftRoot] = moduloExponent(expectedLeft - leftScale);
      killed[rightRoot] ||= killed[leftRoot];
    };
    for (let degree = 0; degree <= weight - 2; degree += 1) {
      for (let coset = 0; coset < cosets; coset += 1) {
        const [u, v] = pairs[coset];
        const [imageU, imageV, scalar] = p1ListNormalize(
          value, BigInt(v), -BigInt(u), true,
        );
        const imageCoset = p1ListIndex(
          value, BigInt(imageU), BigInt(imageV),
        );
        let relationExponent = characterExponent(scalar);
        if (degree & 1) relationExponent += halfOrder;
        union(
          degree * cosets + coset,
          (weight - 2 - degree) * cosets + imageCoset,
          moduloExponent(relationExponent),
        );
      }
    }
    if (sign !== 0) {
      for (let degree = 0; degree <= weight - 2; degree += 1) {
        for (let coset = 0; coset < cosets; coset += 1) {
          const [u, v] = pairs[coset];
          const [imageU, imageV, scalar] = p1ListNormalize(
            value, -BigInt(u), BigInt(v), true,
          );
          const imageCoset = p1ListIndex(
            value, BigInt(imageU), BigInt(imageV),
          );
          let relationExponent = characterExponent(scalar);
          if (Boolean(degree & 1) !== (sign > 0)) {
            relationExponent += halfOrder;
          }
          union(
            degree * cosets + coset,
            degree * cosets + imageCoset,
            moduloExponent(relationExponent),
          );
        }
      }
    }
    const rootColumn = Array.from({ length: generators }, () => -1);
    const columnRoot = [];
    for (let generator = 0; generator < generators; generator += 1) {
      const root = find(generator);
      if (!killed[root] && rootColumn[root] === -1) {
        rootColumn[root] = columnRoot.length;
        columnRoot.push(root);
      }
    }
    const freeCount = columnRoot.length;
    if (characterData.real) {
      if (generators * freeCount > 5_000_000) {
        throw new RangeError(
          "real-character relation matrix exceeds the portable dense guard",
        );
      }
      const realRoot = (valueExponent) => {
        const power = moduloExponent(valueExponent);
        if (power === 0) return 1n;
        if (rootOrder % 2 === 0 && power === halfOrder) return -1n;
        throw new Error("real character produced a non-real root of unity");
      };
      const relationIntegers = Array.from(
        { length: generators * freeCount }, () => 0n,
      );
      const addRealRelation = (
        row, original, integerCoefficient, valueExponent,
      ) => {
        const root = find(original);
        if (killed[root]) return;
        const column = rootColumn[root];
        relationIntegers[row * freeCount + column] +=
          integerCoefficient * realRoot(valueExponent + exponent[original]);
      };
      for (let degree = 0; degree <= weight - 2; degree += 1) {
        for (let coset = 0; coset < cosets; coset += 1) {
          const row = degree * cosets + coset;
          const [u, v] = pairs[coset];
          const [tU, tV, tScalar] = p1ListNormalize(
            value, BigInt(v), -BigInt(u) - BigInt(v), true,
          );
          const [ttU, ttV, ttScalar] = p1ListNormalize(
            value, -BigInt(u) - BigInt(v), BigInt(u), true,
          );
          const tCoset = p1ListIndex(value, BigInt(tU), BigInt(tV));
          const ttCoset = p1ListIndex(value, BigInt(ttU), BigInt(ttV));
          const tExponent = characterExponent(tScalar);
          const ttExponent = characterExponent(ttScalar);
          const complement = weight - 2 - degree;
          addRealRelation(row, row, 1n, 0);
          for (let index = 0; index <= complement; index += 1) {
            const signValue = (weight - 2 + index) & 1 ? -1n : 1n;
            addRealRelation(
              row,
              index * cosets + tCoset,
              signValue * binomialBigInt(complement, index),
              tExponent,
            );
          }
          for (let index = 0; index <= degree; index += 1) {
            const signValue = (weight - 2 - degree + index) & 1 ? -1n : 1n;
            addRealRelation(
              row,
              (weight - 2 - degree + index) * cosets + ttCoset,
              signValue * binomialBigInt(degree, index),
              ttExponent,
            );
          }
        }
      }
      const relations = matrixBackend.qqMatrix(
        generators,
        freeCount,
        relationIntegers.map((entry) => [entry, 1n]),
      );
      const rank = matrixBackend.matrixRank(relations);
      const reduced = matrixBackend.matrixRref(relations);
      const pivotRows = Array.from({ length: freeCount }, () => -1);
      let pivotColumn = 0;
      for (let row = 0; row < rank; row += 1) {
        while (pivotColumn < freeCount &&
               reduced.entries[row * freeCount + pivotColumn].numerator === 0n) {
          pivotColumn += 1;
        }
        if (pivotColumn >= freeCount) {
          throw new Error("invalid real-character rank profile");
        }
        pivotRows[pivotColumn++] = row;
      }
      const freeColumns = [];
      for (let column = 0; column < freeCount; column += 1) {
        if (pivotRows[column] === -1) freeColumns.push(column);
      }
      const dimension = freeColumns.length;
      const targetByColumn = new Map(
        freeColumns.map((column, index) => [column, index]),
      );
      const reductionEntries = [];
      for (let original = 0; original < generators; original += 1) {
        const root = find(original);
        const column = killed[root] ? -1 : rootColumn[root];
        const scale = realRoot(exponent[original]);
        for (const freeColumn of freeColumns) {
          if (column === -1) {
            reductionEntries.push([0n, 1n]);
          } else if (pivotRows[column] === -1) {
            reductionEntries.push([
              targetByColumn.get(column) === targetByColumn.get(freeColumn)
                ? scale : 0n,
              1n,
            ]);
          } else {
            const entry = reduced.entries[
              pivotRows[column] * freeCount + freeColumn
            ];
            reductionEntries.push([
              -scale * entry.numerator, entry.denominator,
            ]);
          }
        }
      }
      const reduction = matrixBackend.qqMatrix(
        generators, dimension, reductionEntries,
      );
      recordCapability(
        "napi:@sagemath/sagejs-flint:p1ListCharacterPresentation",
        "shared-runtime-js",
        { executionTarget: "host-runtime-js", ingressBytes: 0, egressBytes: 0 },
      );
      return Object.freeze({
        generators,
        twoTermGenerators: freeCount,
        dimension,
        basisGenerators: Object.freeze(
          freeColumns.map((column) => columnRoot[column]),
        ),
        rationalReductionEntries: Object.freeze(
          reductionEntries.map(([numerator, denominator]) =>
            Object.freeze([numerator, denominator])),
        ),
        reduction,
      });
    }
    if (generators * freeCount > 4095 || generators > 128 || freeCount > 128) {
      throw new RangeError(
        "character relation matrix exceeds the algebraic browser guard",
      );
    }
    const zero = algebraicBackend.qqbarFromRational(0n, 1n);
    const roots = Array.from(
      { length: rootOrder },
      (_, power) => algebraicBackend.qqbarRootOfUnity(power, rootOrder),
    );
    const relationEntries = Array.from(
      { length: generators * freeCount }, () => zero,
    );
    const addRelation = (row, original, integerCoefficient, valueExponent) => {
      const root = find(original);
      if (killed[root]) return;
      const column = rootColumn[root];
      const power = moduloExponent(valueExponent + exponent[original]);
      const coefficientValue = algebraicBackend.qqbarFromRational(
        integerCoefficient, 1n,
      );
      const term = algebraicBackend.qqbarMul(roots[power], coefficientValue);
      const offset = row * freeCount + column;
      relationEntries[offset] = algebraicBackend.qqbarAdd(
        relationEntries[offset], term,
      );
    };
    for (let degree = 0; degree <= weight - 2; degree += 1) {
      for (let coset = 0; coset < cosets; coset += 1) {
        const row = degree * cosets + coset;
        const [u, v] = pairs[coset];
        const [tU, tV, tScalar] = p1ListNormalize(
          value, BigInt(v), -BigInt(u) - BigInt(v), true,
        );
        const [ttU, ttV, ttScalar] = p1ListNormalize(
          value, -BigInt(u) - BigInt(v), BigInt(u), true,
        );
        const tCoset = p1ListIndex(value, BigInt(tU), BigInt(tV));
        const ttCoset = p1ListIndex(value, BigInt(ttU), BigInt(ttV));
        const tExponent = characterExponent(tScalar);
        const ttExponent = characterExponent(ttScalar);
        const complement = weight - 2 - degree;
        addRelation(row, row, 1n, 0);
        for (let index = 0; index <= complement; index += 1) {
          const signValue = (weight - 2 + index) & 1 ? -1n : 1n;
          addRelation(
            row,
            index * cosets + tCoset,
            signValue * binomialBigInt(complement, index),
            tExponent,
          );
        }
        for (let index = 0; index <= degree; index += 1) {
          const signValue = (weight - 2 - degree + index) & 1 ? -1n : 1n;
          addRelation(
            row,
            (weight - 2 - degree + index) * cosets + ttCoset,
            signValue * binomialBigInt(degree, index),
            ttExponent,
          );
        }
      }
    }
    const relations = algebraicBackend.qqbarMatrix(
      generators, freeCount, relationEntries, Boolean(characterData.real),
    );
    const rank = algebraicBackend.matrixRank(relations);
    const reduced = algebraicBackend.matrixRref(relations);
    const pivotRows = Array.from({ length: freeCount }, () => -1);
    let pivotColumn = 0;
    for (let row = 0; row < rank; row += 1) {
      while (pivotColumn < freeCount && algebraicBackend.qqbarEqual(
        algebraicBackend.matrixEntry(reduced, row, pivotColumn), zero,
      )) {
        pivotColumn += 1;
      }
      if (pivotColumn >= freeCount) {
        throw new Error("invalid character-presentation rank profile");
      }
      pivotRows[pivotColumn++] = row;
    }
    const freeColumns = [];
    for (let column = 0; column < freeCount; column += 1) {
      if (pivotRows[column] === -1) freeColumns.push(column);
    }
    const dimension = freeColumns.length;
    if (generators * dimension > 4095 || dimension > 128) {
      throw new RangeError(
        "character reduction matrix exceeds the algebraic browser guard",
      );
    }
    const targetByColumn = new Map(
      freeColumns.map((column, index) => [column, index]),
    );
    const reductionEntries = [];
    for (let original = 0; original < generators; original += 1) {
      const root = find(original);
      const column = killed[root] ? -1 : rootColumn[root];
      const scale = roots[exponent[original]];
      for (const freeColumn of freeColumns) {
        if (column === -1) {
          reductionEntries.push(zero);
        } else if (pivotRows[column] === -1) {
          reductionEntries.push(
            targetByColumn.get(column) === targetByColumn.get(freeColumn)
              ? scale : zero,
          );
        } else {
          const entry = algebraicBackend.matrixEntry(
            reduced, pivotRows[column], freeColumn,
          );
          reductionEntries.push(algebraicBackend.qqbarNeg(
            algebraicBackend.qqbarMul(entry, scale),
          ));
        }
      }
    }
    const reduction = algebraicBackend.qqbarMatrix(
      generators, dimension, reductionEntries, Boolean(characterData.real),
    );
    recordCapability(
      "napi:@sagemath/sagejs-flint:p1ListCharacterPresentation",
      "shared-runtime-js",
      { executionTarget: "host-runtime-js", ingressBytes: 0, egressBytes: 0 },
    );
    return Object.freeze({
      generators,
      twoTermGenerators: freeCount,
      dimension,
      basisGenerators: Object.freeze(
        freeColumns.map((column) => columnRoot[column]),
      ),
      reduction,
    });
  }

  const backend = {
    factor,
    isPrime,
    nextPrime,
    ...exactBackend,
    modularSymbolsWeight2Info,
    p1List,
    p1ListLevel,
    p1ListCount,
    p1ListEntry,
    p1ListNormalize,
    p1ListIndex,
    p1ListApplyI: (value, index) => p1Action(value, index, 0),
    p1ListApplyS: (value, index) => p1Action(value, index, 1),
    p1ListApplyR: (value, index) => p1Action(value, index, 2),
    p1ListApplyT: (value, index) => p1Action(value, index, 3),
    p1ListManinPresentationInfo,
    p1ListHeckeMatrix,
    p1ListDegeneracyMatrix,
    p1ListBoundaryData,
    p1ListCuspidalBasis,
    p1ListStarMatrix,
    tracePortableAcbMatrix() {
      tracePortableFallback("napi:@sagemath/sagejs-flint:acbMatrix");
    },
    tracePortableEcScalarMulPrime() {
      tracePortableFallback("napi:@sagemath/sagejs-flint:ecScalarMulPrime");
    },
    tracePortableFqMatrix() {
      tracePortableFallback("napi:@sagemath/sagejs-flint:fqMatrix");
    },
    p1ListStarEigenspaceBasis,
    p1ListReducePath,
    p1ListHigherWeightPresentation: signedPresentation,
    higherWeightPresentationReduction: (presentation) => presentation.reduction,
    p1ListCharacterPresentation: characterPresentation,
    characterPresentationReduction: (presentation) => presentation.reduction,
    p1ListCharacterHeckeMatrix() {
      // Character presentations are portable; their Hecke action is not yet.
      // Do not advertise a recurrence fallback that needs this same backend.
      const error = new Error(
        "Character Hecke matrices are not yet supported in WebAssembly; use the native Sage.js backend.",
      );
      error.code = "SAGEJS_WASM_CAPABILITY_UNAVAILABLE";
      throw error;
    },
    ...polynomialBackend,
    ...multivariateBackend,
    ...matrixBackend,
    ...numericBackend,
    matrixCharpoly,
    ...publicGeneratedResourceBackend,
    ...dirichletGroupBackend,
    ...numberFieldZetaBackend,
    ...analyticBackend,
    ...curveBackend,
    ...algebraicBackend,
    ...numericRepresentationBackend,
  };
  Object.defineProperty(backend, "__sagejs_wasm_resource_live_count__", {
    value: () => instance.exports.sagejs_wasm_resource_live_count(),
    enumerable: false,
  });
  Object.defineProperties(backend, {
    p1HandleCacheLimit: {
      value: maximumCachedP1Handles,
      enumerable: false,
    },
    p1ActiveHandleCount: {
      value: () => activeP1States.size,
      enumerable: false,
    },
  });
  Object.defineProperty(backend, "__sagejs_ffi_manifest__", {
    value: Object.freeze({
      ...generatedWasmManifest,
      library: generatedWasmManifest.declaration,
    }),
    enumerable: false,
  });
  return Object.freeze(backend);
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
