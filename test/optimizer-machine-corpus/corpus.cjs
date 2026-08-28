"use strict";

const { createHash } = require("node:crypto");

const CORPUS_SCHEMA = "sagejs.optimizer-machine-corpus/v1";
const CORPUS_SEED = 0x5a6e2026;
const DOMAIN_IDS = Object.freeze([
  "bounded-integer",
  "strict-binary64-array",
  "prime-residue-batch",
  "fixed-extension",
  "packed-container",
]);

function generator(seed) {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return state >>> 0;
  };
}

function integers(next, length, minimum, maximum) {
  const width = maximum - minimum + 1;
  return Array.from({ length }, () => minimum + (next() % width));
}

function pythonFloat(value) {
  if (Number.isNaN(value)) return "float('nan')";
  if (value === Infinity) return "float('inf')";
  if (value === -Infinity) return "float('-inf')";
  if (Object.is(value, -0)) return "-0.0";
  const rendered = String(value);
  if (Number.isInteger(value) && !/[eE.]/.test(rendered)) return `${rendered}.0`;
  return rendered;
}

function pythonList(values, render = String) {
  return `[${values.map(render).join(", ")}]`;
}

function canonicalBigInt(value, modulus) {
  const reduced = value % modulus;
  return reduced < 0n ? reduced + modulus : reduced;
}

function boundedIntegerOracle(item) {
  let left = BigInt(item.initial[0]);
  let right = BigInt(item.initial[1]);
  const indexes = item.shadowedRange
    ? item.count === 0 ? [] : [item.count - 1, 0]
    : Array.from({ length: item.count }, (_value, index) => index);
  for (const index of indexes) {
    const value = BigInt(item.values[index]);
    left = left + value * value - right;
    right = right + value;
  }
  const reads = item.container === "callback" ? indexes.length : 0;
  return `${left},${right};reads=${reads}`;
}

function float64Hex(value) {
  const buffer = Buffer.allocUnsafe(8);
  buffer.writeDoubleLE(value);
  return buffer.toString("hex");
}

function binary64Oracle(item) {
  let accumulator = item.initial;
  for (const value of item.values) {
    accumulator = accumulator * item.multiplier + value * item.increment;
  }
  return float64Hex(accumulator);
}

function primeResidueOracle(item) {
  const modulus = BigInt(item.prime);
  const multiplier = BigInt(item.multiplier);
  const increment = BigInt(item.increment);
  const output = item.alias ? item.values.map(BigInt) : item.output.map(BigInt);
  const input = item.alias ? output : item.values.map(BigInt);
  for (let index = 0; index < item.count; index += 1) {
    output[index] = canonicalBigInt(
      input[index] * multiplier + increment,
      modulus,
    );
  }
  const checksum = output.reduce(
    (sum, value) => canonicalBigInt(sum + value, modulus),
    0n,
  );
  return `${output.join(",")};checksum=${checksum}`;
}

function extensionAdd(left, right, prime) {
  const modulus = BigInt(prime);
  return left.map((value, index) =>
    canonicalBigInt(value + right[index], modulus),
  );
}

function extensionMultiply(left, right, prime, polynomial) {
  const degree = polynomial.length;
  const modulus = BigInt(prime);
  const product = Array.from({ length: degree * 2 - 1 }, () => 0n);
  for (let leftIndex = 0; leftIndex < degree; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < degree; rightIndex += 1) {
      const index = leftIndex + rightIndex;
      product[index] = canonicalBigInt(
        product[index] + left[leftIndex] * right[rightIndex],
        modulus,
      );
    }
  }
  for (let exponent = product.length - 1; exponent >= degree; exponent -= 1) {
    const factor = product[exponent];
    for (let index = 0; index < degree; index += 1) {
      const target = exponent - degree + index;
      product[target] = canonicalBigInt(
        product[target] - factor * BigInt(polynomial[index]),
        modulus,
      );
    }
  }
  return product.slice(0, degree);
}

function fixedExtensionOracle(item) {
  let state = item.initial.map(BigInt);
  const multiplier = item.multiplier.map(BigInt);
  for (const coordinates of item.values.slice(0, item.count)) {
    state = extensionAdd(
      extensionMultiply(
        state,
        multiplier,
        item.prime,
        item.modulus,
      ),
      coordinates.map(BigInt),
      item.prime,
    );
  }
  if (item.encoding !== "repr") return state.join(",");
  const pieces = [];
  for (let exponent = state.length - 1; exponent >= 0; exponent -= 1) {
    const coefficient = state[exponent];
    if (coefficient === 0n) continue;
    if (exponent === 0) pieces.push(String(coefficient));
    else {
      const monomial = exponent === 1
        ? item.displayVariable
        : `${item.displayVariable}^${exponent}`;
      pieces.push(coefficient === 1n ? monomial : `${coefficient}*${monomial}`);
    }
  }
  return pieces.length ? pieces.join(" + ") : "0";
}

function packedContainerOracle(item) {
  if (item.kind === "int64-map") {
    const output = item.alias ? item.values.map(BigInt) : item.output.map(BigInt);
    const input = item.alias ? output : item.values.map(BigInt);
    for (let index = 0; index < input.length; index += 1) {
      output[index] = input[index] * BigInt(item.multiplier) + BigInt(item.increment);
    }
    return output.join(",");
  }
  if (item.kind === "int64-record") {
    const values = item.values.map(BigInt);
    for (let index = 0; index < item.length; index += 1) {
      const target = item.start + index;
      values[target] += BigInt(index + 1);
    }
    return values.join(",");
  }
  if (item.kind === "float64-record") {
    const values = [...item.values];
    for (let index = 0; index < item.length; index += 1) {
      const target = item.start + index;
      values[target] = values[target] * item.multiplier + item.increment;
    }
    return values.map(float64Hex).join(",");
  }
  if (item.kind === "overflow-write") return "OverflowError;unchanged=7";
  throw new Error(`unknown packed-container case kind ${item.kind}`);
}

function caseOracle(item) {
  switch (item.domain) {
    case "bounded-integer":
      return boundedIntegerOracle(item);
    case "strict-binary64-array":
      return binary64Oracle(item);
    case "prime-residue-batch":
      return primeResidueOracle(item);
    case "fixed-extension":
      return fixedExtensionOracle(item);
    case "packed-container":
      return packedContainerOracle(item);
    default:
      throw new Error(`unknown optimizer machine domain ${item.domain}`);
  }
}

function buildCorpus(seed = CORPUS_SEED) {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError("corpus seed must be an unsigned 32-bit integer");
  }
  const next = generator(seed);
  const cases = [];
  const add = (item) => cases.push(Object.freeze({ ...item }));

  add({
    id: "bounded-generated-safe",
    domain: "bounded-integer",
    tags: ["generated", "safe-range", "negative-operands"],
    values: integers(next, 19, -47, 53),
    count: 19,
    initial: [17, -9],
    container: "list",
    shadowedRange: false,
  });
  add({
    id: "bounded-zero-trip",
    domain: "bounded-integer",
    tags: ["zero-trip", "identity"],
    values: [],
    count: 0,
    initial: [-123, 456],
    container: "list",
    shadowedRange: false,
  });
  add({
    id: "bounded-beyond-number",
    domain: "bounded-integer",
    tags: ["overflow", "exact-fallback", "adversarial"],
    values: [3_037_000_500, -3_037_000_499, 2],
    count: 3,
    initial: [9_007_199_254_740_991, -7],
    container: "list",
    shadowedRange: false,
  });
  add({
    id: "bounded-callback-sequence",
    domain: "bounded-integer",
    tags: ["callback", "observable-read", "adversarial"],
    values: integers(next, 7, -12, 19),
    count: 7,
    initial: [3, 5],
    container: "callback",
    shadowedRange: false,
  });
  add({
    id: "bounded-shadowed-range",
    domain: "bounded-integer",
    tags: ["shadowed-builtin", "iteration-order", "adversarial"],
    values: integers(next, 6, -9, 9),
    count: 6,
    initial: [11, -4],
    container: "list",
    shadowedRange: true,
  });

  add({
    id: "binary64-generated-finite",
    domain: "strict-binary64-array",
    tags: ["generated", "finite", "rounding-order"],
    values: integers(next, 13, -200, 200).map((value) => value / 64),
    initial: 0.125,
    multiplier: 1.0000001192092896,
    increment: 0.03125,
    container: "array",
  });
  add({
    id: "binary64-signed-zero",
    domain: "strict-binary64-array",
    tags: ["signed-zero", "exact-bits"],
    values: [-0],
    initial: -0,
    multiplier: 1,
    increment: 1,
    container: "array",
  });
  add({
    id: "binary64-subnormal",
    domain: "strict-binary64-array",
    tags: ["subnormal", "underflow", "exact-bits"],
    values: [5e-324, 1e-323, -5e-324],
    initial: 5e-324,
    multiplier: 0.5,
    increment: 1,
    container: "array",
  });
  add({
    id: "binary64-overflow-infinity",
    domain: "strict-binary64-array",
    tags: ["overflow", "infinity", "exact-bits"],
    values: [1e308, -1e308, Infinity],
    initial: 1e308,
    multiplier: 2,
    increment: 1,
    container: "array",
  });
  add({
    id: "binary64-nan-list-fallback",
    domain: "strict-binary64-array",
    tags: ["nan", "list-fallback", "adversarial"],
    values: [1, NaN, 2],
    initial: 0.25,
    multiplier: 0.75,
    increment: 0.5,
    container: "list",
  });

  add({
    id: "prime-generated-disjoint",
    domain: "prime-residue-batch",
    tags: ["generated", "disjoint", "transactional-output"],
    prime: 1009,
    multiplier: 37,
    increment: -19,
    values: integers(next, 17, -3000, 3000),
    output: integers(next, 17, 0, 1008),
    count: 17,
    alias: false,
  });
  add({
    id: "prime-zero-trip",
    domain: "prime-residue-batch",
    tags: ["zero-trip", "output-identity"],
    prime: 97,
    multiplier: 13,
    increment: 7,
    values: [],
    output: [],
    count: 0,
    alias: false,
  });
  add({
    id: "prime-alias",
    domain: "prime-residue-batch",
    tags: ["alias", "mutation", "adversarial"],
    prime: 65521,
    multiplier: 257,
    increment: -65523,
    values: integers(next, 11, -130000, 130000),
    output: [],
    count: 11,
    alias: true,
  });
  add({
    id: "prime-near-number-bound",
    domain: "prime-residue-batch",
    tags: ["exact-range-boundary", "large-residues"],
    prime: 67_108_859,
    multiplier: 67_108_857,
    increment: 67_108_858,
    values: [67_108_858, 67_108_857, -1, 2],
    output: [0, 0, 0, 0],
    count: 4,
    alias: false,
  });
  add({
    id: "prime-outside-number-product",
    domain: "prime-residue-batch",
    tags: ["overflow", "exact-fallback", "adversarial"],
    prime: 100_000_007,
    multiplier: 100_000_005,
    increment: 100_000_006,
    values: [100_000_006, 100_000_005, 50_000_004],
    output: [1, 2, 3],
    count: 3,
    alias: false,
  });

  const extensionCases = [
    {
      id: "extension-quadratic-generated",
      prime: 97,
      degree: 2,
      modulus: [5, 1],
      initial: [1, 2],
      multiplier: [3, 4],
      count: 9,
      tags: ["generated", "degree-2", "fixed-shape"],
    },
    {
      id: "extension-cubic-generated",
      prime: 5,
      degree: 3,
      modulus: [1, 1, 0],
      initial: [1, 2, 3],
      multiplier: [2, 1, 4],
      count: 13,
      tags: ["generated", "degree-3", "fixed-shape"],
    },
    {
      id: "extension-quartic-generated",
      prime: 3,
      degree: 4,
      modulus: [2, 1, 0, 0],
      initial: [1, 2, 1, 2],
      multiplier: [2, 1, 2, 1],
      count: 11,
      tags: ["generated", "degree-4", "fixed-shape"],
    },
    {
      id: "extension-zero-trip",
      prime: 5,
      degree: 3,
      modulus: [1, 1, 0],
      initial: [4, 3, 2],
      multiplier: [1, 1, 1],
      count: 0,
      tags: ["zero-trip", "identity"],
    },
    {
      id: "extension-outside-number-bound",
      prime: 200_003,
      degree: 2,
      modulus: [1, 1],
      initial: [200_002, 199_999],
      multiplier: [199_997, 200_001],
      count: 3,
      encoding: "repr",
      tags: ["overflow", "exact-fallback", "adversarial"],
    },
  ];
  for (let index = 0; index < extensionCases.length; index += 1) {
    const item = extensionCases[index];
    add({
      ...item,
      domain: "fixed-extension",
      displayVariable: `a_${index}`,
      values: Array.from({ length: item.count }, () =>
        integers(next, item.degree, 0, item.prime - 1)),
    });
  }

  add({
    id: "packed-int64-generated",
    domain: "packed-container",
    tags: ["generated", "int64", "disjoint", "transactional-output"],
    kind: "int64-map",
    values: integers(next, 16, -5000, 5000),
    output: Array(16).fill(0),
    multiplier: -17,
    increment: 23,
    alias: false,
  });
  add({
    id: "packed-int64-alias",
    domain: "packed-container",
    tags: ["int64", "alias", "mutation", "adversarial"],
    kind: "int64-map",
    values: integers(next, 9, -100, 100),
    output: [],
    multiplier: 3,
    increment: -5,
    alias: true,
  });
  add({
    id: "packed-owner-bound-view",
    domain: "packed-container",
    tags: ["owner-bound-view", "mutation", "negative-index-control"],
    kind: "int64-record",
    values: integers(next, 12, -20, 20),
    start: 3,
    length: 6,
  });
  add({
    id: "packed-float64-bits",
    domain: "packed-container",
    tags: ["float64", "owner-bound-view", "exact-bits"],
    kind: "float64-record",
    values: [-0, 1e-323, 0.25, -1.5, Infinity],
    start: 0,
    length: 4,
    multiplier: 0.5,
    increment: -0,
  });
  add({
    id: "packed-overflow-write",
    domain: "packed-container",
    tags: ["overflow", "transactional-failure", "adversarial"],
    kind: "overflow-write",
    values: [7],
  });

  const corpus = {
    schema: CORPUS_SCHEMA,
    seed,
    domains: [...DOMAIN_IDS],
    cases,
  };
  validateCorpus(corpus);
  return Object.freeze(corpus);
}

function validateCorpus(corpus) {
  if (!corpus || corpus.schema !== CORPUS_SCHEMA) {
    throw new Error(`unsupported optimizer machine corpus schema ${corpus?.schema}`);
  }
  if (!Number.isSafeInteger(corpus.seed)) throw new Error("invalid corpus seed");
  if (!Array.isArray(corpus.cases) || corpus.cases.length === 0) {
    throw new Error("optimizer machine corpus must contain cases");
  }
  const ids = new Set();
  const covered = new Set();
  for (const item of corpus.cases) {
    if (!/^[a-z][a-z0-9-]+$/.test(item.id)) throw new Error(`invalid case id ${item.id}`);
    if (ids.has(item.id)) throw new Error(`duplicate case id ${item.id}`);
    ids.add(item.id);
    if (!DOMAIN_IDS.includes(item.domain)) throw new Error(`invalid domain ${item.domain}`);
    covered.add(item.domain);
    if (!Array.isArray(item.tags) || item.tags.length === 0) {
      throw new Error(`${item.id} must declare evidence tags`);
    }
    caseOracle(item);
  }
  if (DOMAIN_IDS.some((domain) => !covered.has(domain))) {
    throw new Error("optimizer machine corpus does not cover every domain");
  }
  return corpus;
}

function caseLine(item, result) {
  return `CASE|${item.id}|${result}`;
}

function expectedLines(corpus) {
  validateCorpus(corpus);
  return corpus.cases.map((item) => caseLine(item, caseOracle(item)));
}

function renderBoundedCase(item) {
  const values = pythonList(item.values);
  const container = item.container === "callback"
    ? `_ObservedSequence(${values})`
    : values;
  const name = item.id.replaceAll("-", "_");
  if (item.shadowedRange) {
    return `
def _shadowed_range_${name}(size):
    return () if size == 0 else (size - 1, 0)
def bounded_${name}(values, count, left, right, range):
    for index in range(count):
        value = values[index]
        left = left + value*value - right
        right = right + value
    return left, right
_bounded_values = ${container}
_bounded_answer = bounded_${name}(_bounded_values, ${item.count}, ${item.initial[0]}, ${item.initial[1]}, _shadowed_range_${name})
print('CASE|${item.id}|' + str(_bounded_answer[0]) + ',' + str(_bounded_answer[1]) + ';reads=' + str(getattr(_bounded_values, 'reads', 0)))
`;
  }
  return `
_bounded_values = ${container}
_bounded_answer = _bounded_program(_bounded_values, ${item.count}, ${item.initial[0]}, ${item.initial[1]})
print('CASE|${item.id}|' + str(_bounded_answer[0]) + ',' + str(_bounded_answer[1]) + ';reads=' + str(getattr(_bounded_values, 'reads', 0)))
`;
}

function renderBinary64Case(item) {
  const values = pythonList(item.values, pythonFloat);
  const container = item.container === "array" ? `array('d', ${values})` : values;
  return `
_float_values = ${container}
_float_answer = _binary64_program(_float_values, ${pythonFloat(item.initial)}, ${pythonFloat(item.multiplier)}, ${pythonFloat(item.increment)})
print('CASE|${item.id}|' + _binary64_bits(_float_answer))
`;
}

function renderPrimeCase(item, sage) {
  const values = pythonList(item.values);
  const output = pythonList(item.alias ? item.values : item.output);
  const setup = sage
    ? `_prime_parent = Zmod(${item.prime})\n_prime_values = [_prime_parent(value) for value in ${values}]\n_prime_output = _prime_values if ${item.alias ? "True" : "False"} else [_prime_parent(value) for value in ${output}]\n_prime_multiplier = _prime_parent(${item.multiplier})\n_prime_increment = _prime_parent(${item.increment})`
    : `_prime_values = [value % ${item.prime} for value in ${values}]\n_prime_output = _prime_values if ${item.alias ? "True" : "False"} else [value % ${item.prime} for value in ${output}]\n_prime_multiplier = ${item.multiplier}\n_prime_increment = ${item.increment}`;
  const call = sage
    ? `_prime_answer = _prime_program(_prime_values, _prime_output, ${item.count}, _prime_multiplier, _prime_increment, _prime_parent)\n_prime_encoded = ','.join(str(int(value)) for value in _prime_answer[0]) + ';checksum=' + str(int(_prime_answer[1]))`
    : `_prime_answer = _prime_program(_prime_values, _prime_output, ${item.count}, _prime_multiplier, _prime_increment, ${item.prime})\n_prime_encoded = ','.join(str(value) for value in _prime_answer[0]) + ';checksum=' + str(_prime_answer[1])`;
  return `
${setup}
${call}
print('CASE|${item.id}|' + _prime_encoded)
`;
}

function polynomialExpression(variable, coefficients) {
  const terms = [`${variable}^${coefficients.length}`];
  for (let exponent = coefficients.length - 1; exponent >= 0; exponent -= 1) {
    const coefficient = coefficients[exponent];
    if (coefficient === 0) continue;
    if (exponent === 0) terms.push(String(coefficient));
    else if (exponent === 1) terms.push(`${coefficient}*${variable}`);
    else terms.push(`${coefficient}*${variable}^${exponent}`);
  }
  return terms.join(" + ");
}

function sageExtensionElement(parent, generatorName, coordinates) {
  return coordinates.map((coefficient, exponent) => {
    if (exponent === 0) return `${parent}(${coefficient})`;
    if (exponent === 1) return `${coefficient}*${generatorName}`;
    return `${coefficient}*${generatorName}^${exponent}`;
  }).join(" + ");
}

function renderExtensionCase(item, index, sage) {
  if (!sage) {
    return `
_extension_answer = _extension_program(
    ${pythonList(item.values, (coordinates) => pythonList(coordinates))},
    ${pythonList(item.initial)},
    ${pythonList(item.multiplier)},
    ${item.count},
    ${item.prime},
    ${pythonList(item.modulus)},
)
${item.encoding === "repr"
    ? `_extension_encoded = _extension_repr(_extension_answer, '${item.displayVariable}')`
    : "_extension_encoded = ','.join(str(value) for value in _extension_answer)"}
print('CASE|${item.id}|' + _extension_encoded)
`;
  }
  const ring = `P_${index}`;
  const variable = `x_${index}`;
  const parent = `K_${index}`;
  const generatorName = `a_${index}`;
  const values = item.values.map((coordinates) =>
    sageExtensionElement(parent, generatorName, coordinates));
  return `
${ring}.<${variable}> = PolynomialRing(GF(${item.prime}))
${parent}.<${generatorName}> = GF(${item.prime}^${item.degree}, modulus=${polynomialExpression(variable, item.modulus)})
_extension_values = (${values.join(", ")}${values.length === 1 ? "," : ""})
_extension_answer = _extension_program(
    _extension_values,
    ${sageExtensionElement(parent, generatorName, item.initial)},
    ${sageExtensionElement(parent, generatorName, item.multiplier)},
    ${item.count},
)
${item.encoding === "repr"
    ? "_extension_encoded = repr(_extension_answer)"
    : "_extension_coordinates = _extension_answer._power_basis_coordinates()\n_extension_encoded = ','.join(str(int(value)) for value in _extension_coordinates)"}
print('CASE|${item.id}|' + _extension_encoded)
`;
}

function renderPackedCase(item, sage) {
  if (item.kind === "int64-map") {
    const input = pythonList(item.values);
    const output = pythonList(item.alias ? item.values : item.output);
    const setup = sage
      ? `_packed_input = int64_buffer(${input})\n_packed_output = _packed_input if ${item.alias ? "True" : "False"} else int64_buffer(${output})`
      : `_packed_input = ${input}\n_packed_output = _packed_input if ${item.alias ? "True" : "False"} else ${output}`;
    return `
${setup}
_packed_map(_packed_input, _packed_output, ${item.multiplier}, ${item.increment})
print('CASE|${item.id}|' + ','.join(str(value) for value in _packed_output))
`;
  }
  if (item.kind === "int64-record") {
    const setup = sage
      ? `_packed_values = int64_buffer(${pythonList(item.values)})\n_packed_view = int64_record(_packed_values, ${item.start}, ${item.length})`
      : `_packed_values = ${pythonList(item.values)}\n_packed_view = _ListRecord(_packed_values, ${item.start}, ${item.length})`;
    return `
${setup}
_packed_record_update(_packed_view)
print('CASE|${item.id}|' + ','.join(str(value) for value in _packed_values))
`;
  }
  if (item.kind === "float64-record") {
    const values = pythonList(item.values, pythonFloat);
    const setup = sage
      ? `_packed_float_values = float64_buffer(${values})\n_packed_float_view = float64_record(_packed_float_values, ${item.start}, ${item.length})`
      : `_packed_float_values = ${values}\n_packed_float_view = _ListRecord(_packed_float_values, ${item.start}, ${item.length})`;
    return `
${setup}
_packed_float_update(_packed_float_view, ${pythonFloat(item.multiplier)}, ${pythonFloat(item.increment)})
print('CASE|${item.id}|' + ','.join(_binary64_bits(value) for value in _packed_float_values))
`;
  }
  if (item.kind === "overflow-write") {
    const setup = sage
      ? `_packed_overflow_values = int64_buffer(${pythonList(item.values)})\n_packed_overflow_view = int64_record(_packed_overflow_values, 0, 1)`
      : `_packed_overflow_values = ${pythonList(item.values)}\n_packed_overflow_view = _CheckedInt64Record(_packed_overflow_values, 0, 1)`;
    return `
${setup}
try:
    _packed_overflow_view[0] = 1 << 63
    _packed_overflow_name = 'missing-error'
except Exception as _packed_error:
    _packed_overflow_name = type(_packed_error).__name__
print('CASE|${item.id}|' + _packed_overflow_name + ';unchanged=' + str(_packed_overflow_values[0]))
`;
  }
  throw new Error(`unknown packed kind ${item.kind}`);
}

function prelude(sage) {
  return `from array import array
${sage ? "from sagejs.native import float64_buffer, float64_record, int64_buffer, int64_record" : ""}

class _ObservedSequence:
    def __init__(self, values):
        self.values = values
        self.reads = 0
    def __getitem__(self, index):
        self.reads += 1
        return self.values[index]

def _bounded_program(values, count, left, right):
    for index in range(count):
        value = values[index]
        left = left + value*value - right
        right = right + value
    return left, right

def _binary64_program(values, accumulator: float, multiplier: float, increment: float):
    for index in range(len(values)):
        accumulator = accumulator*multiplier + values[index]*increment
    return accumulator

def _binary64_bits(value):
    return array('d', [value]).tobytes().hex()

def _prime_program(values, output, count, multiplier, increment, parent):
    for index in range(count):
        output[index] = ${sage ? "values[index]*multiplier + increment" : "(values[index]*multiplier + increment) % parent"}
    checksum = ${sage ? "parent(0)" : "0"}
    for value in output:
        checksum = ${sage ? "checksum + value" : "(checksum + value) % parent"}
    return output, checksum

def _extension_multiply(left, right, prime, modulus):
    degree = len(modulus)
    product = [0 for _index in range(2*degree - 1)]
    for left_index in range(degree):
        for right_index in range(degree):
            index = left_index + right_index
            product[index] = (product[index] + left[left_index]*right[right_index]) % prime
    for exponent in range(2*degree - 2, degree - 1, -1):
        factor = product[exponent]
        for index in range(degree):
            target = exponent - degree + index
            product[target] = (product[target] - factor*modulus[index]) % prime
    return product[:degree]

def _extension_program(values, state, multiplier, count${sage ? "" : ", prime, modulus"}):
    for index in range(count):
        ${sage ? "state = state*multiplier + values[index]" : "state = [(left + right) % prime for left, right in zip(_extension_multiply(state, multiplier, prime, modulus), values[index]) ]"}
    return state

def _extension_repr(coordinates, variable):
    pieces = []
    for exponent in range(len(coordinates) - 1, -1, -1):
        coefficient = coordinates[exponent]
        if coefficient == 0:
            continue
        if exponent == 0:
            pieces.append(str(coefficient))
        else:
            monomial = variable if exponent == 1 else variable + '^' + str(exponent)
            pieces.append(monomial if coefficient == 1 else str(coefficient) + '*' + monomial)
    return ' + '.join(pieces) if len(pieces) != 0 else '0'

def _packed_map(values, output, multiplier, increment):
    for index in range(len(values)):
        output[index] = values[index]*multiplier + increment

def _packed_record_update(record):
    for index in range(len(record)):
        record[index] = record[index] + index + 1

def _packed_float_update(record, multiplier, increment):
    for index in range(len(record)):
        record[index] = record[index]*multiplier + increment

${sage ? "" : `class _ListRecord:
    def __init__(self, values, start, length):
        if start < 0 or length < 0 or start > len(values) - length:
            raise IndexError('record is outside its buffer')
        self.values = values
        self.start = start
        self.length = length
    def __len__(self):
        return self.length
    def __getitem__(self, index):
        return self.values[self.start + index]
    def __setitem__(self, index, value):
        self.values[self.start + index] = value

class _CheckedInt64Record(_ListRecord):
    def __setitem__(self, index, value):
        if value < -(1 << 63) or value >= (1 << 63):
            raise OverflowError('Int64Buffer value is outside signed 64-bit')
        super().__setitem__(index, value)
`}
`;
}

function renderProgram(corpus, sage) {
  validateCorpus(corpus);
  const parts = [prelude(sage)];
  let extensionIndex = 0;
  for (const item of corpus.cases) {
    if (item.domain === "bounded-integer") parts.push(renderBoundedCase(item));
    else if (item.domain === "strict-binary64-array") parts.push(renderBinary64Case(item));
    else if (item.domain === "prime-residue-batch") parts.push(renderPrimeCase(item, sage));
    else if (item.domain === "fixed-extension") {
      parts.push(renderExtensionCase(item, extensionIndex++, sage));
    } else if (item.domain === "packed-container") {
      parts.push(renderPackedCase(item, sage));
    }
  }
  return `${parts.join("\n")}\n`;
}

function renderSageProgram(corpus = buildCorpus()) {
  return renderProgram(corpus, true);
}

function renderCPythonProgram(corpus = buildCorpus()) {
  return renderProgram(corpus, false);
}

function parseCaseLines(stdout) {
  return stdout.replaceAll("\r\n", "\n").split("\n")
    .filter((line) => line.startsWith("CASE|"));
}

function corpusFingerprint(corpus = buildCorpus()) {
  const stable = {
    schema: corpus.schema,
    seed: corpus.seed,
    domains: corpus.domains,
    cases: corpus.cases,
    expected: expectedLines(corpus),
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

module.exports = {
  CORPUS_SCHEMA,
  CORPUS_SEED,
  DOMAIN_IDS,
  buildCorpus,
  caseOracle,
  corpusFingerprint,
  expectedLines,
  parseCaseLines,
  renderCPythonProgram,
  renderSageProgram,
  validateCorpus,
};
