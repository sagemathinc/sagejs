/*
 * Canonical sparse host representation for the bounded exact multivariate
 * polynomial WebAssembly slice.  JavaScript performs construction and cheap
 * orchestration only; resultant computation is one call to FLINT's
 * fmpz_mpoly_resultant through the reviewed packed ABI.
 */

const CONTEXT = Symbol("sagejs wasm multivariate context");
const POLYNOMIAL = Symbol("sagejs wasm multivariate polynomial");
const CAPABILITY = "wasm-library:flint:fmpz-mpoly-resultant-packed-v1";

const INPUT_MAGIC = 0x49504d53;
const OUTPUT_MAGIC = 0x4f504d53;
const VERSION = 1;
const RESULTANT = 1;
const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_TERMS = 256;
const MAX_COEFFICIENT_WORDS = 16;
const MAX_ELIMINATION_DEGREE = 8;
const MAX_PARAMETER_DEGREE = 8;

const STATUS = Object.freeze({
  OK: 0,
  MALFORMED: 1,
  UNSUPPORTED: 2,
  FLINT_FAILURE: 3,
  OUTPUT_TOO_SMALL: 4,
  RESULT_LIMIT: 5,
});

const ORDER = Object.freeze({ lex: 0, deglex: 1, degrevlex: 2 });

function capabilityUnavailable(detail) {
  const suffix = detail ? `: ${detail}` : "";
  return new Error(`WebAssembly capability unavailable (${CAPABILITY})${suffix}`);
}

function assertContext(value) {
  if (!value || value[CONTEXT] !== true) {
    throw new TypeError("expected a Sage.js WebAssembly multivariate context");
  }
  return value;
}

function assertPolynomial(value) {
  if (!value || value[POLYNOMIAL] !== true) {
    throw new TypeError("expected a Sage.js WebAssembly multivariate polynomial");
  }
  return value;
}

function exponentKey(exponents) {
  return exponents.join(",");
}

function totalDegree(exponents) {
  let degree = 0;
  for (const exponent of exponents) degree += exponent;
  return degree;
}

function compareMonomials(context, left, right) {
  if (context.order !== "lex") {
    const difference = totalDegree(left) - totalDegree(right);
    if (difference !== 0) return difference;
  }
  if (context.order === "degrevlex") {
    for (let index = context.variables - 1; index >= 0; index -= 1) {
      if (left[index] !== right[index]) return right[index] - left[index];
    }
    return 0;
  }
  for (let index = 0; index < context.variables; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function canonicalTerms(context, entries) {
  const combined = new Map();
  for (const entry of entries) {
    const coefficient = BigInt(entry.coefficient);
    if (coefficient === 0n) continue;
    if (!Array.isArray(entry.exponents) ||
        entry.exponents.length !== context.variables ||
        entry.exponents.some((value) =>
          !Number.isSafeInteger(value) || value < 0 || value > 0xffffffff)) {
      throw new RangeError("multivariate polynomial exponents must be u32 values");
    }
    const key = exponentKey(entry.exponents);
    const previous = combined.get(key);
    combined.set(key, {
      coefficient: (previous?.coefficient ?? 0n) + coefficient,
      exponents: previous?.exponents ?? entry.exponents.slice(),
    });
  }
  return [...combined.values()]
    .filter(({ coefficient }) => coefficient !== 0n)
    .sort((left, right) =>
      -compareMonomials(context, left.exponents, right.exponents))
    .map(({ coefficient, exponents }) => Object.freeze({
      coefficient,
      exponents: Object.freeze(exponents),
    }));
}

function polynomial(context, entries) {
  context = assertContext(context);
  return Object.freeze({
    [POLYNOMIAL]: true,
    context,
    terms: Object.freeze(canonicalTerms(context, entries)),
  });
}

function assertSameContext(left, right) {
  left = assertPolynomial(left);
  right = assertPolynomial(right);
  if (left.context !== right.context) {
    throw new TypeError("multivariate polynomials have different parents");
  }
  return [left, right];
}

function add(left, right, sign = 1n) {
  [left, right] = assertSameContext(left, right);
  return polynomial(left.context, [
    ...left.terms,
    ...right.terms.map(({ coefficient, exponents }) => ({
      coefficient: sign * coefficient,
      exponents,
    })),
  ]);
}

function negate(value) {
  value = assertPolynomial(value);
  return polynomial(value.context, value.terms.map(({ coefficient, exponents }) => ({
    coefficient: -coefficient,
    exponents,
  })));
}

function multiply(left, right) {
  [left, right] = assertSameContext(left, right);
  const entries = [];
  for (const leftTerm of left.terms) {
    for (const rightTerm of right.terms) {
      entries.push({
        coefficient: leftTerm.coefficient * rightTerm.coefficient,
        exponents: leftTerm.exponents.map(
          (exponent, index) => exponent + rightTerm.exponents[index],
        ),
      });
    }
  }
  return polynomial(left.context, entries);
}

function power(value, exponent) {
  value = assertPolynomial(value);
  exponent = BigInt(exponent);
  if (exponent < 0n || exponent > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("multivariate polynomial exponent is out of range");
  }
  let result = polynomial(value.context, [{
    coefficient: 1n,
    exponents: Array(value.context.variables).fill(0),
  }]);
  let factor = value;
  while (exponent !== 0n) {
    if ((exponent & 1n) !== 0n) result = multiply(result, factor);
    exponent >>= 1n;
    if (exponent !== 0n) factor = multiply(factor, factor);
  }
  return result;
}

function magnitudeWords(value) {
  value = value < 0n ? -value : value;
  const words = [];
  while (value !== 0n) {
    words.push(Number(value & 0xffffffffn));
    value >>= 32n;
  }
  return words;
}

function writeU32(bytes, offset, value) {
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .setUint32(offset, value, true);
}

function readU32(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.byteLength) {
    throw new Error("FLINT WebAssembly returned a truncated multivariate packet");
  }
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    .getUint32(offset, true);
}

function packetSize(polynomials) {
  let size = 32;
  for (const value of polynomials) {
    for (const term of value.terms) {
      size += 8 + 4 * magnitudeWords(term.coefficient).length +
        4 * value.context.variables;
    }
  }
  return size;
}

function validateBoundedDomain(left, right, eliminated) {
  [left, right] = assertSameContext(left, right);
  const context = left.context;
  if (context.kind !== "zz" || context.variables < 2 || context.variables > 3) {
    throw capabilityUnavailable("the reviewed slice requires ZZ and two or three variables");
  }
  if (left.terms.length > MAX_TERMS || right.terms.length > MAX_TERMS) {
    throw capabilityUnavailable(`each input is limited to ${MAX_TERMS} nonzero terms`);
  }
  if (!Number.isInteger(eliminated) || eliminated < 0 || eliminated >= context.variables) {
    throw new RangeError("multivariate resultant variable index is out of range");
  }
  for (const value of [left, right]) {
    for (const term of value.terms) {
      if (magnitudeWords(term.coefficient).length > MAX_COEFFICIENT_WORDS) {
        throw capabilityUnavailable(
          `input coefficients are limited to ${MAX_COEFFICIENT_WORDS} 32-bit words`,
        );
      }
      if (term.exponents[eliminated] > MAX_ELIMINATION_DEGREE) {
        throw capabilityUnavailable(
          `eliminated-variable degree is limited to ${MAX_ELIMINATION_DEGREE}`,
        );
      }
      const parameterDegree = term.exponents.reduce(
        (sum, exponent, index) => index === eliminated ? sum : sum + exponent,
        0,
      );
      if (parameterDegree > MAX_PARAMETER_DEGREE) {
        throw capabilityUnavailable(
          `remaining-variable term degree is limited to ${MAX_PARAMETER_DEGREE}`,
        );
      }
    }
  }
  const size = packetSize([left, right]);
  if (size > MAX_INPUT_BYTES) {
    throw capabilityUnavailable(`packed input is limited to ${MAX_INPUT_BYTES} bytes`);
  }
  return size;
}

function encodeResultant(left, right, eliminated) {
  const length = validateBoundedDomain(left, right, eliminated);
  const bytes = new Uint8Array(length);
  const context = left.context;
  const header = [
    INPUT_MAGIC, VERSION, RESULTANT, context.variables, ORDER[context.order],
    eliminated, left.terms.length, right.terms.length,
  ];
  header.forEach((value, index) => writeU32(bytes, index * 4, value));
  let offset = 32;
  for (const value of [left, right]) {
    for (const term of value.terms) {
      const words = magnitudeWords(term.coefficient);
      writeU32(bytes, offset, term.coefficient < 0n ? 2 : 1);
      writeU32(bytes, offset + 4, words.length);
      offset += 8;
      for (const word of words) {
        writeU32(bytes, offset, word);
        offset += 4;
      }
      for (const exponent of term.exponents) {
        writeU32(bytes, offset, exponent);
        offset += 4;
      }
    }
  }
  if (offset !== bytes.length) throw new Error("multivariate packet size drifted");
  return bytes;
}

function decodeResult(context, bytes) {
  if (bytes.byteLength < 24 ||
      readU32(bytes, 0) !== OUTPUT_MAGIC ||
      readU32(bytes, 4) !== VERSION ||
      readU32(bytes, 8) !== RESULTANT ||
      readU32(bytes, 12) !== context.variables ||
      readU32(bytes, 16) !== ORDER[context.order]) {
    throw new Error("FLINT WebAssembly returned an invalid multivariate header");
  }
  const count = readU32(bytes, 20);
  const entries = [];
  let offset = 24;
  for (let index = 0; index < count; index += 1) {
    const sign = readU32(bytes, offset);
    const wordCount = readU32(bytes, offset + 4);
    offset += 8;
    if ((sign !== 1 && sign !== 2) || wordCount === 0 ||
        wordCount > Math.floor((bytes.byteLength - offset) / 4)) {
      throw new Error("FLINT WebAssembly returned an invalid coefficient");
    }
    let coefficient = 0n;
    for (let word = 0; word < wordCount; word += 1) {
      coefficient |= BigInt(readU32(bytes, offset)) << BigInt(32 * word);
      offset += 4;
    }
    if (coefficient === 0n) {
      throw new Error("FLINT WebAssembly returned a zero encoded coefficient");
    }
    if (sign === 2) coefficient = -coefficient;
    const exponents = [];
    for (let variable = 0; variable < context.variables; variable += 1) {
      exponents.push(readU32(bytes, offset));
      offset += 4;
    }
    entries.push({ coefficient, exponents });
  }
  if (offset !== bytes.byteLength) {
    throw new Error("FLINT WebAssembly returned trailing multivariate bytes");
  }
  return polynomial(context, entries);
}

function format(value, names) {
  value = assertPolynomial(value);
  if (!Array.isArray(names) || names.length !== value.context.variables) {
    throw new TypeError("multivariate variable names do not match the context");
  }
  if (value.terms.length === 0) return "0";
  return value.terms.map((term, index) => {
    const negative = term.coefficient < 0n;
    const magnitude = negative ? -term.coefficient : term.coefficient;
    const monomial = term.exponents.flatMap((exponent, variable) => {
      if (exponent === 0) return [];
      return [exponent === 1 ? names[variable] : `${names[variable]}^${exponent}`];
    }).join("*");
    const body = monomial === ""
      ? String(magnitude)
      : magnitude === 1n ? monomial : `${magnitude}*${monomial}`;
    if (index === 0) return negative ? `-${body}` : body;
    return negative ? `-${body}` : `+${body}`;
  }).join("");
}

export function createMultivariateBackend(instance, {
  recordCapability = () => {},
  enabled = true,
} = {}) {
  const exports = instance?.exports ?? {};
  const requiredExports = [
    "sagejs_wasm_mpoly_input",
    "sagejs_wasm_mpoly_input_capacity",
    "sagejs_wasm_mpoly_output",
    "sagejs_wasm_mpoly_output_capacity",
    "sagejs_wasm_mpoly_output_length",
    "sagejs_wasm_mpoly_resultant",
  ];
  const available = enabled && requiredExports.every(
    (name) => typeof exports[name] === "function",
  );
  const memory = exports.memory;

  function mpolyContext(kind, variables, order, modulus) {
    if (kind !== "zz") {
      throw capabilityUnavailable("browser multivariate construction currently requires ZZ");
    }
    if (!Number.isInteger(variables) || variables < 1) {
      throw new RangeError("multivariate polynomial variable count must be positive");
    }
    if (!Object.hasOwn(ORDER, order)) {
      throw new RangeError(`unsupported multivariate monomial order ${order}`);
    }
    if (BigInt(modulus) !== 0n) {
      throw new TypeError("ZZ multivariate contexts do not have a modulus");
    }
    return Object.freeze({ [CONTEXT]: true, kind, variables, order });
  }

  function mpolyResultant(left, right, eliminated) {
    if (!available || !(memory instanceof WebAssembly.Memory)) {
      throw capabilityUnavailable("the production FLINT resultant export is absent or disabled");
    }
    const input = encodeResultant(left, right, eliminated);
    const inputPointer = Number(exports.sagejs_wasm_mpoly_input()) >>> 0;
    const inputCapacity = Number(exports.sagejs_wasm_mpoly_input_capacity()) >>> 0;
    const outputPointer = Number(exports.sagejs_wasm_mpoly_output()) >>> 0;
    const outputCapacity = Number(exports.sagejs_wasm_mpoly_output_capacity()) >>> 0;
    if (inputCapacity !== MAX_INPUT_BYTES || outputCapacity !== MAX_OUTPUT_BYTES ||
        inputPointer + input.byteLength > memory.buffer.byteLength ||
        outputPointer + outputCapacity > memory.buffer.byteLength) {
      throw new Error("FLINT WebAssembly multivariate buffer contract drifted");
    }
    new Uint8Array(memory.buffer, inputPointer, input.byteLength).set(input);
    const status = Number(exports.sagejs_wasm_mpoly_resultant(input.byteLength));
    const outputLength = Number(exports.sagejs_wasm_mpoly_output_length()) >>> 0;
    if (status === STATUS.UNSUPPORTED) {
      throw capabilityUnavailable("the valid input is outside the reviewed bounded slice");
    }
    if (status === STATUS.FLINT_FAILURE) {
      throw new RangeError("FLINT could not compute the resultant");
    }
    if (status === STATUS.RESULT_LIMIT) {
      throw new RangeError("FLINT resultant exceeds the 16 MiB WebAssembly result limit");
    }
    if (status === STATUS.OUTPUT_TOO_SMALL) {
      throw new Error("FLINT WebAssembly multivariate output reservation is defective");
    }
    if (status === STATUS.MALFORMED) {
      throw new Error("FLINT WebAssembly rejected the adapter's multivariate packet");
    }
    if (status !== STATUS.OK || outputLength > outputCapacity ||
        outputPointer + outputLength > memory.buffer.byteLength) {
      throw new Error(`FLINT WebAssembly resultant failed with status ${status}`);
    }
    const output = Uint8Array.from(
      new Uint8Array(memory.buffer, outputPointer, outputLength),
    );
    const result = decodeResult(assertPolynomial(left).context, output);
    recordCapability(CAPABILITY, "receipt-backed-wasm-artifact", {
      executionTarget: "wasm-artifact",
      ingressBytes: input.byteLength,
      egressBytes: output.byteLength,
      boundaryCrossings: 1,
      copiedBytes: input.byteLength + output.byteLength,
    });
    return result;
  }

  function unavailable(operation) {
    return () => { throw capabilityUnavailable(`${operation} is outside the reviewed slice`); };
  }

  return Object.freeze({
    mpolyContext,
    mpolyConstant(context, numerator, denominator) {
      context = assertContext(context);
      if (BigInt(denominator) !== 1n) {
        throw new TypeError("ZZ multivariate coefficients must be integral");
      }
      return polynomial(context, [{
        coefficient: BigInt(numerator),
        exponents: Array(context.variables).fill(0),
      }]);
    },
    mpolyGen(context, index) {
      context = assertContext(context);
      if (!Number.isInteger(index) || index < 0 || index >= context.variables) {
        throw new RangeError("multivariate generator index is out of range");
      }
      const exponents = Array(context.variables).fill(0);
      exponents[index] = 1;
      return polynomial(context, [{ coefficient: 1n, exponents }]);
    },
    mpolyAdd: (left, right) => add(left, right),
    mpolySub: (left, right) => add(left, right, -1n),
    mpolyMul: multiply,
    mpolyNeg: negate,
    mpolyPow: power,
    mpolyEqual(left, right) {
      [left, right] = assertSameContext(left, right);
      return left.terms.length === right.terms.length && left.terms.every(
        (term, index) => term.coefficient === right.terms[index].coefficient &&
          term.exponents.every(
            (exponent, variable) => exponent === right.terms[index].exponents[variable],
          ),
      );
    },
    mpolyCompare(left, right) {
      const difference = add(left, right, -1n);
      return difference.terms.length === 0 ? 0 :
        difference.terms[0].coefficient < 0n ? -1 : 1;
    },
    mpolyDivExact: unavailable("exact multivariate division"),
    mpolyGcd: unavailable("multivariate gcd"),
    mpolyIrreducibleFactors: unavailable("multivariate factorization"),
    mpolyResultant,
    mpolyComposeGen(value, target, mapping) {
      value = assertPolynomial(value);
      target = assertContext(target);
      if (!Array.isArray(mapping) || mapping.length !== value.context.variables ||
          mapping.some((index) =>
            !Number.isInteger(index) || index < 0 || index >= target.variables)) {
        throw new TypeError("invalid multivariate generator mapping");
      }
      return polynomial(target, value.terms.map(({ coefficient, exponents }) => {
        const mapped = Array(target.variables).fill(0);
        exponents.forEach((exponent, index) => { mapped[mapping[index]] += exponent; });
        return { coefficient, exponents: mapped };
      }));
    },
    mpolyToString: format,
    mpolyUnivariateCoefficients(value, variable) {
      value = assertPolynomial(value);
      const degree = value.terms.reduce(
        (maximum, term) => Math.max(maximum, term.exponents[variable]), -1,
      );
      const coefficients = Array(degree + 1).fill(0n);
      for (const term of value.terms) {
        if (term.exponents.some((exponent, index) => index !== variable && exponent !== 0)) {
          throw new TypeError("multivariate polynomial involves other generators");
        }
        coefficients[term.exponents[variable]] = term.coefficient;
      }
      return coefficients;
    },
    mpolyLength: (value) => assertPolynomial(value).terms.length,
    mpolyDegree(value, variable) {
      value = assertPolynomial(value);
      return value.terms.reduce(
        (maximum, term) => Math.max(maximum, term.exponents[variable]), -1,
      );
    },
    mpolyTotalDegree(value) {
      value = assertPolynomial(value);
      return value.terms.reduce(
        (maximum, term) => Math.max(maximum, totalDegree(term.exponents)), -1,
      );
    },
    mpolyGroebner: unavailable("multivariate Groebner bases"),
    mpolyReduce: unavailable("multivariate reduction"),
  });
}

export const multivariateResultantCapability = CAPABILITY;
