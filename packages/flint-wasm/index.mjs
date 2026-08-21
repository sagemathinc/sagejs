import { createWasiHost } from "./dist/wasi-runtime.mjs";
import {
  createGeneratedWasmBackend,
  generatedWasmManifest,
} from "./dist/ffi-resource-backend.mjs";
import { createPortablePolynomialBackend } from "./portable-polynomial.mjs";
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
  { algebraicSource, recordCapability = () => {} } = {},
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
  const polynomialBackend = createPortablePolynomialBackend();
  const matrixBackend = createPortableMatrixBackend();
  const numericBackend = createNumericBackend();
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

  const p1Objects = new WeakSet();
  const p1Finalizer = typeof FinalizationRegistry === "undefined"
    ? undefined
    : new FinalizationRegistry((handle) => {
        instance.exports.sagejs_p1_destroy(handle);
      });

  function p1Object(value) {
    if (!p1Objects.has(value)) {
      throw new TypeError("expected a Sage.js WASM P1List");
    }
    return value;
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
    const value = Object.freeze({
      handle,
      level,
      count: uint32(instance.exports.sagejs_p1_count(handle)),
    });
    p1Objects.add(value);
    p1Finalizer?.register(value, handle);
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

  const backend = {
    factor,
    isPrime,
    nextPrime,
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
    p1ListBoundaryData,
    p1ListCuspidalBasis,
    p1ListStarMatrix,
    p1ListStarEigenspaceBasis,
    p1ListReducePath,
    ...polynomialBackend,
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
