/** Lazy SagePack codecs for finite-field and multivariate polynomial data. */

import {
  codecRuntime,
  type DecodeContext,
  type EncodeContext,
  registerCodec,
  type SageCodec,
  SageSerializationError,
  type WireValue,
} from "../serialization";

const { callGlobal, callMethod, callPython, invoke } = codecRuntime;
const decodedMarkers = new WeakMap<object, string>();

function pythonAttribute(value: unknown, name: string): unknown {
  if (value === null || value === undefined) return undefined;
  const direct = Reflect.get(Object(value), name);
  if (direct !== undefined) return direct;
  const getter = Reflect.get(globalThis, "ρσ_getattr");
  if (typeof getter !== "function") return undefined;
  try {
    return invoke(getter, undefined, [value, name]);
  } catch {
    return undefined;
  }
}

function hasMethod(value: unknown, name: string): boolean {
  return pythonAttribute(value, name) !== undefined;
}

function kind(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  const result = pythonAttribute(value, "_kind");
  return typeof result === "string" ? result : undefined;
}

function parent(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  const direct = pythonAttribute(value, "_parent");
  if (direct !== undefined) return direct;
  const getter = pythonAttribute(value, "parent");
  if (typeof getter !== "function") return undefined;
  try {
    return Reflect.apply(getter, value, []);
  } catch {
    return undefined;
  }
}

function codecMarker(value: unknown): string | undefined {
  if (
    value === null || value === undefined ||
    (typeof value !== "object" && typeof value !== "function")
  ) return undefined;
  return decodedMarkers.get(value as object);
}

function mark<T>(value: T, marker: string): T {
  if (
    value !== null && value !== undefined &&
    (typeof value === "object" || typeof value === "function")
  ) decodedMarkers.set(value as object, marker);
  return value;
}

function extensionFieldDescriptor(base: unknown): Record<string, unknown> {
  const descriptor: Record<string, unknown> = {
    kind: "GF_EXTENSION",
    order: callMethod(base, "order"),
    variable: callMethod(base, "variable_name"),
  };
  if (pythonAttribute(base, "_explicitModulus") === true) {
    const modulus = callMethod(base, "modulus");
    descriptor.characteristic = callMethod(base, "characteristic");
    descriptor.modulus = Array.from(
      callMethod(modulus, "coefficients") as Iterable<unknown>,
      (coefficient) => callMethod(coefficient, "lift"),
    );
  }
  return descriptor;
}

function extensionFieldFromDescriptor(
  data: Record<string, unknown>,
): unknown {
  if (!Array.isArray(data.modulus)) {
    return callGlobal("GF", [data.order, data.variable]);
  }
  const primeField = callGlobal("GF", [data.characteristic]);
  const polynomialRing = callGlobal("PolynomialRing", [primeField, "x"]);
  const modulus = callMethod(
    polynomialRing,
    "_from_coefficients",
    [data.modulus],
  );
  return callGlobal("GF", [data.order, data.variable, modulus]);
}

function baseDescriptor(base: unknown): Record<string, unknown> {
  const baseKind = kind(base);
  const representation = String(callMethod(base, "__repr__"));
  if (baseKind === "ZZ" || representation === "Integer Ring") {
    return { kind: "ZZ" };
  }
  if (baseKind === "QQ" || representation === "Rational Field") {
    return { kind: "QQ" };
  }
  if (baseKind === "GF" || baseKind === "ZMOD") {
    return {
      kind: baseKind,
      order: callMethod(base, "order"),
    };
  }
  if (baseKind === "GF_EXTENSION") {
    return extensionFieldDescriptor(base);
  }
  throw new SageSerializationError(`unsupported polynomial base ${representation}`);
}

function baseFromDescriptor(data: Record<string, unknown>): unknown {
  if (data.kind === "ZZ" || data.kind === "QQ") {
    return Reflect.get(globalThis, String(data.kind));
  }
  if (data.kind === "GF") return callGlobal("GF", [data.order]);
  if (data.kind === "ZMOD") return callGlobal("Zmod", [data.order]);
  if (data.kind === "GF_EXTENSION") {
    return mark(extensionFieldFromDescriptor(data), "parent");
  }
  throw new SageSerializationError(`unsupported polynomial base ${String(data.kind)}`);
}

function splitTopLevel(source: string, separator: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === separator && depth === 0) {
      result.push(source.slice(start, index));
      start = index + 1;
    }
    if (depth < 0) throw new SageSerializationError("unbalanced polynomial data");
  }
  if (depth !== 0) throw new SageSerializationError("unbalanced polynomial data");
  result.push(source.slice(start));
  return result;
}

function signedTerms(source: string): Array<{ negative: boolean; body: string }> {
  const compact = source.replaceAll(" ", "");
  if (compact === "0") return [];
  const terms: Array<{ negative: boolean; body: string }> = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index <= compact.length; index += 1) {
    const character = compact[index];
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    const boundary = index === compact.length ||
      (index > start && depth === 0 && (character === "+" || character === "-"));
    if (!boundary) continue;
    let body = compact.slice(start, index);
    let negative = false;
    if (body.startsWith("+")) body = body.slice(1);
    else if (body.startsWith("-")) {
      negative = true;
      body = body.slice(1);
    }
    if (!body) throw new SageSerializationError("empty polynomial term");
    terms.push({ negative, body });
    start = index;
  }
  if (depth !== 0) throw new SageSerializationError("unbalanced polynomial data");
  return terms;
}

function stripParentheses(source: string): string {
  if (!source.startsWith("(") || !source.endsWith(")")) return source;
  let depth = 0;
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    else if (source[index] === ")") depth -= 1;
    if (depth === 0 && index !== source.length - 1) return source;
  }
  return source.slice(1, -1);
}

function add(left: unknown, right: unknown): unknown {
  return callMethod(left, "_add_", [right]);
}

function multiply(left: unknown, right: unknown): unknown {
  return callMethod(left, "_mul_", [right]);
}

function power(value: unknown, exponent: number): unknown {
  return callMethod(value, "__pow__", [exponent]);
}

function negate(value: unknown): unknown {
  return callMethod(value, "__neg__");
}

function parseFiniteFieldElement(field: unknown, source: string): unknown {
  const variable = String(callMethod(field, "variable_name"));
  let result = callPython(field, [0]);
  for (const term of signedTerms(stripParentheses(source))) {
    let coefficient = callPython(field, [1]);
    let exponent = 0;
    for (const factor of splitTopLevel(term.body, "*")) {
      if (factor === variable) exponent += 1;
      else if (factor.startsWith(`${variable}^`)) {
        exponent += Number(factor.slice(variable.length + 1));
      } else {
        coefficient = multiply(coefficient, callPython(field, [BigInt(factor)]));
      }
    }
    let value = exponent === 0
      ? coefficient
      : multiply(coefficient, power(callMethod(field, "gen"), exponent));
    if (term.negative) value = negate(value);
    result = add(result, value);
  }
  return result;
}

function scalar(base: unknown, source: string): unknown {
  const text = stripParentheses(source);
  if (kind(base) === "GF_EXTENSION") return parseFiniteFieldElement(base, text);
  const slash = text.indexOf("/");
  if (slash >= 0) {
    return callPython(base, [
      BigInt(text.slice(0, slash)),
      BigInt(text.slice(slash + 1)),
    ]);
  }
  return callPython(base, [BigInt(text)]);
}

function parseMultivariatePolynomial(ring: unknown, source: string): unknown {
  const variables = Array.from(
    callMethod(ring, "variable_names") as Iterable<unknown>,
    String,
  );
  const variableSet = new Set(variables);
  const base = callMethod(ring, "base_ring");
  let result = callPython(ring, [0]);
  for (const term of signedTerms(source)) {
    let coefficientText = "1";
    const exponents = new Array<number>(variables.length).fill(0);
    for (const factor of splitTopLevel(term.body, "*")) {
      const powerIndex = factor.lastIndexOf("^");
      const name = powerIndex < 0 ? factor : factor.slice(0, powerIndex);
      if (variableSet.has(name)) {
        exponents[variables.indexOf(name)] += powerIndex < 0
          ? 1
          : Number(factor.slice(powerIndex + 1));
      } else {
        coefficientText = factor;
      }
    }
    let value = callPython(ring, [scalar(base, coefficientText)]);
    for (let index = 0; index < exponents.length; index += 1) {
      if (exponents[index] !== 0) {
        value = multiply(
          value,
          power(callMethod(ring, "gen", [index]), exponents[index]),
        );
      }
    }
    if (term.negative) value = negate(value);
    result = add(result, value);
  }
  return result;
}

function encodeParent(value: unknown, context: EncodeContext): WireValue {
  if (kind(value) === "GF_EXTENSION") {
    const descriptor = extensionFieldDescriptor(value);
    descriptor.kind = "finite-field-extension";
    return context.encode(descriptor);
  }
  if (kind(value) === "NumberFieldPolynomialQuotient") {
    return context.encode({
      kind: "number-field-quotient",
      field: Reflect.get(Object(value), "_field"),
    });
  }
  return context.encode({
    kind: "multivariate-polynomial",
    base: baseDescriptor(callMethod(value, "base_ring")),
    variables: Array.from(
      callMethod(value, "variable_names") as Iterable<unknown>,
      String,
    ),
    order: Reflect.get(Object(value), "_order"),
  });
}

function decodeParent(payload: WireValue, context: DecodeContext): unknown {
  const data = context.decode(payload) as Record<string, unknown>;
  if (data.kind === "finite-field-extension") {
    return extensionFieldFromDescriptor(data);
  }
  if (data.kind === "number-field-quotient") {
    return mark(
      callMethod(data.field, "polynomial_quotient_ring"),
      "parent",
    );
  }
  if (data.kind === "multivariate-polynomial") {
    const result = callGlobal("PolynomialRing", [
      baseFromDescriptor(data.base as Record<string, unknown>),
      data.variables,
      null,
      false,
      null,
      data.order,
    ]);
    Reflect.set(Object(result), "_kind", "MULTIVARIATE_POLYNOMIAL");
    return mark(result, "parent");
  }
  throw new SageSerializationError(`unsupported polynomial parent ${String(data.kind)}`);
}

function encodeElement(value: unknown, context: EncodeContext): WireValue {
  return context.encode({
    parent: parent(value),
    representation: String(callMethod(value, "__repr__")),
  });
}

function decodeElement(payload: WireValue, context: DecodeContext): unknown {
  const data = context.decode(payload) as Record<string, unknown>;
  const representation = String(data.representation);
  const result = kind(data.parent) === "GF_EXTENSION"
    ? parseFiniteFieldElement(data.parent, representation)
    : parseMultivariatePolynomial(data.parent, representation);
  return mark(result, "element");
}

function encodeIdeal(value: unknown, context: EncodeContext): WireValue {
  return context.encode({
    ring: callMethod(value, "ring"),
    generators: Array.from(callMethod(value, "gens") as Iterable<unknown>),
  });
}

function decodeIdeal(payload: WireValue, context: DecodeContext): unknown {
  const data = context.decode(payload) as Record<string, unknown>;
  return mark(
    callMethod(data.ring, "ideal", data.generators as unknown[]),
    "ideal",
  );
}

function encodeSequence(value: unknown, context: EncodeContext): WireValue {
  const length = Number(callMethod(value, "__len__"));
  const values = new Array<unknown>(length);
  for (let index = 0; index < length; index += 1) {
    values[index] = callMethod(value, "__getitem__", [index]);
  }
  return context.encode({
    universe: callMethod(value, "universe"),
    values,
  });
}

function decodeSequence(payload: WireValue, context: DecodeContext): unknown {
  const data = context.decode(payload) as Record<string, unknown>;
  return mark(
    callGlobal("PolynomialSequence", [data.values, data.universe]),
    "sequence",
  );
}

export const polynomialParentCodec: SageCodec = {
  type: "sage.polynomial.parent",
  version: 1,
  test: (value) => codecMarker(value) === "parent" ||
    kind(value) === "GF_EXTENSION" ||
    kind(value) === "NumberFieldPolynomialQuotient" ||
    kind(value) === "MULTIVARIATE_POLYNOMIAL" ||
    (hasMethod(value, "variable_names") && hasMethod(value, "ideal")),
  encode: encodeParent,
  decode: decodeParent,
};

export const polynomialElementCodec: SageCodec = {
  type: "sage.polynomial.element",
  version: 1,
  test: (value) => codecMarker(value) === "element" ||
    kind(parent(value)) === "GF_EXTENSION" ||
    kind(parent(value)) === "MULTIVARIATE_POLYNOMIAL" ||
    (hasMethod(value, "number_of_terms") && hasMethod(value, "total_degree")),
  encode: encodeElement,
  decode: decodeElement,
};

export const polynomialIdealCodec: SageCodec = {
  type: "sage.polynomial.ideal",
  version: 1,
  test: (value) => codecMarker(value) === "ideal" ||
    kind(value) === "PolynomialIdeal" ||
    (hasMethod(value, "ring") && hasMethod(value, "groebner_basis")),
  encode: encodeIdeal,
  decode: decodeIdeal,
};

export const polynomialSequenceCodec: SageCodec = {
  type: "sage.polynomial.sequence",
  version: 1,
  test: (value) => codecMarker(value) === "sequence" ||
    kind(value) === "PolynomialSequence" ||
    (hasMethod(value, "universe") && hasMethod(value, "__len__") &&
      !hasMethod(value, "number_of_terms")),
  encode: encodeSequence,
  decode: decodeSequence,
};

let registered = false;

export function registerPolynomialCodecs(): void {
  if (registered) return;
  registered = true;
  registerCodec(polynomialParentCodec);
  registerCodec(polynomialElementCodec);
  registerCodec(polynomialIdealCodec);
  registerCodec(polynomialSequenceCodec);
}
