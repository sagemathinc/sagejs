/** Lazy serialization codecs owned by the arithmetic/number-field package. */

import {
  codecRuntime,
  type DecodeContext,
  type EncodeContext,
  registerCodec,
  type SageCodec,
  SageSerializationError,
  type WireValue,
} from "../serialization";

const { callGlobal, callMethod, callPython } = codecRuntime;

function kind(value: unknown): string | undefined {
  const result = value === null || value === undefined
    ? undefined
    : Reflect.get(Object(value), "_kind");
  return typeof result === "string" ? result : undefined;
}

function parentKind(value: unknown): string | undefined {
  return kind(Reflect.get(Object(value), "_parent"));
}

function exactScalarKey(value: unknown): string {
  const numerator = Reflect.get(Object(value), "_numerator");
  const denominator = Reflect.get(Object(value), "_denominator");
  if (numerator !== undefined && denominator !== undefined) {
    return `${String(numerator)}/${String(denominator)}`;
  }
  return String(value);
}

function exactRows(value: unknown): unknown[][] {
  if (!Array.isArray(value)) {
    throw new SageSerializationError("number-field lattice rows are not an array");
  }
  return value.map((row) => {
    if (!Array.isArray(row)) {
      throw new SageSerializationError("a number-field lattice row is not an array");
    }
    return Array.from(row);
  });
}

function sameExactRows(left: unknown, right: unknown): boolean {
  let leftRows: unknown[][];
  let rightRows: unknown[][];
  try {
    leftRows = exactRows(left);
    rightRows = exactRows(right);
  } catch {
    return false;
  }
  return leftRows.length === rightRows.length && leftRows.every((row, index) =>
    row.length === rightRows[index].length && row.every((entry, column) =>
      exactScalarKey(entry) === exactScalarKey(rightRows[index][column])
    )
  );
}

function isNumberFieldIdeal(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  const order = Reflect.get(Object(value), "_order");
  return kind(order) === "NumberFieldOrder" &&
    Array.isArray(Reflect.get(Object(value), "_basis_rows"));
}

function isNumberFieldPrimeIdeal(value: unknown): boolean {
  return isNumberFieldIdeal(value) &&
    Reflect.has(Object(value), "_rational_prime") &&
    Reflect.has(Object(value), "_ramification_index") &&
    Reflect.has(Object(value), "_residue_degree");
}

function encodeParent(value: unknown, context: EncodeContext): WireValue {
  switch (kind(value)) {
    case "NumberField": {
      const polynomial = Reflect.get(Object(value), "_polynomial");
      const polynomialParent = Reflect.get(Object(polynomial), "_parent");
      return context.encode({
        kind: "NumberField",
        polynomialCoefficients: callMethod(polynomial, "coefficients"),
        polynomialVariable: Reflect.get(Object(polynomialParent), "_variable"),
        name: Reflect.get(Object(value), "_variable"),
      });
    }
    case "QuadraticField":
      return context.encode({
        kind: "QuadraticField",
        discriminant: Reflect.get(Object(value), "_discriminant"),
      });
    case "CyclotomicField":
      return context.encode({
        kind: "CyclotomicField",
        order: Reflect.get(Object(value), "_order"),
      });
    case "NumberFieldOrder":
      return context.encode({
        kind: "NumberFieldOrder",
        field: Reflect.get(Object(value), "_field"),
        basis: exactRows(Reflect.get(Object(value), "_basis_rows")),
        maximal: Boolean(callMethod(value, "is_maximal")),
      });
    default:
      throw new SageSerializationError("unsupported number-field parent");
  }
}

function decodeParent(payload: WireValue, context: DecodeContext): unknown {
  const data = context.decode(payload) as Record<string, unknown>;
  switch (data.kind) {
    case "NumberField": {
      // The original v1 record stored the polynomial object itself.  New
      // records use its exact coefficient data so optional compact native
      // polynomial resources cannot change canonical SagePack bytes.
      if (data.polynomial !== undefined) {
        return callGlobal("NumberField", [data.polynomial, data.name]);
      }
      if (!Array.isArray(data.polynomialCoefficients)) {
        throw new SageSerializationError(
          "serialized number-field polynomial coefficients are invalid",
        );
      }
      const polynomialRing = callGlobal("PolynomialRing", [
        Reflect.get(globalThis, "QQ"),
        String(data.polynomialVariable),
      ]);
      const polynomial = callPython(polynomialRing, [data.polynomialCoefficients]);
      return callGlobal("NumberField", [polynomial, data.name]);
    }
    case "QuadraticField": return callGlobal("QuadraticField", [data.discriminant]);
    case "CyclotomicField": return callGlobal("CyclotomicField", [data.order]);
    case "NumberFieldOrder": {
      if (typeof data.maximal !== "boolean") {
        throw new SageSerializationError(
          "serialized number-field order maximality flag is invalid",
        );
      }
      const basis = exactRows(data.basis);
      const field = data.field;
      const order = data.maximal === true
        ? callMethod(field, "maximal_order")
        : callMethod(
          field,
          "order",
          basis.map((row) => callMethod(field, "_from_coefficients", [row])),
        );
      if (!sameExactRows(Reflect.get(Object(order), "_basis_rows"), basis)) {
        throw new SageSerializationError(
          "decoded number-field order does not have the serialized exact lattice",
        );
      }
      return order;
    }
    default:
      throw new SageSerializationError(
        `unsupported number-field parent ${String(data.kind)}`,
      );
  }
}

function encodeElement(value: unknown, context: EncodeContext): WireValue {
  const parent = Reflect.get(Object(value), "_parent");
  switch (kind(parent)) {
    case "NumberField":
      return context.encode({
        kind: "NumberFieldElement",
        parent,
        coefficients: Array.from(
          Reflect.get(Object(value), "_coefficients") as Iterable<unknown>,
        ),
      });
    case "QuadraticField":
      return context.encode({
        kind: "GaussianInteger",
        parent,
        real: Reflect.get(Object(value), "_real"),
        imag: Reflect.get(Object(value), "_imag"),
      });
    case "CyclotomicField":
      return context.encode({
        kind: "CyclotomicElement",
        parent,
        coefficients: callMethod(parent, "_serialization_coefficients", [value]),
      });
    default:
      throw new SageSerializationError("unsupported number-field element");
  }
}

function decodeElement(payload: WireValue, context: DecodeContext): unknown {
  const data = context.decode(payload) as Record<string, unknown>;
  switch (data.kind) {
    case "NumberFieldElement":
    case "CyclotomicElement":
      return callMethod(data.parent, "_from_coefficients", [data.coefficients]);
    case "GaussianInteger":
      return callPython(data.parent, [data.real, data.imag]);
    default:
      throw new SageSerializationError(
        `unsupported number-field element ${String(data.kind)}`,
      );
  }
}

function encodeIdeal(value: unknown, context: EncodeContext): WireValue {
  if (kind(value) === "GaussianPrimeIdeal") {
    return context.encode({
      kind: "GaussianPrimeIdeal",
      parent: Reflect.get(Object(value), "_parent"),
      generator: Reflect.get(Object(value), "_generator"),
    });
  }
  if (!isNumberFieldIdeal(value)) {
    throw new SageSerializationError("unsupported number-field ideal");
  }
  const payload: Record<string, unknown> = {
    kind: isNumberFieldPrimeIdeal(value)
      ? "NumberFieldPrimeIdeal"
      : "NumberFieldIdeal",
    order: Reflect.get(Object(value), "_order"),
    basis: exactRows(Reflect.get(Object(value), "_basis_rows")),
  };
  if (isNumberFieldPrimeIdeal(value)) {
    payload.prime = Reflect.get(Object(value), "_rational_prime");
    payload.ramificationIndex = Reflect.get(
      Object(value),
      "_ramification_index",
    );
    payload.residueDegree = Reflect.get(Object(value), "_residue_degree");
  }
  return context.encode(payload);
}

/*
 * `ideal.to_dict()` intentionally carries live instance tokens and therefore
 * cannot be its own durable SagePack payload: a decoded field is necessarily
 * a new live instance.  The codec instead records the exact field/order as a
 * graph parent.  Every ideal referring to that record receives the same
 * decoded order object, while an unrelated isomorphic field is never used as
 * an implicit transport target.
 */

function decodeNumberFieldIdeal(data: Record<string, unknown>): unknown {
  const order = data.order;
  const basis = exactRows(data.basis);
  const field = callMethod(order, "number_field");
  const generators = basis.map((row) =>
    callMethod(field, "_from_coefficients", [row])
  );
  const ideal = callMethod(order, "ideal", generators);
  if (!sameExactRows(Reflect.get(Object(ideal), "_basis_rows"), basis)) {
    throw new SageSerializationError(
      "decoded number-field ideal does not have the serialized exact lattice",
    );
  }
  return ideal;
}

function decodeNumberFieldPrimeIdeal(data: Record<string, unknown>): unknown {
  const order = data.order;
  const basis = exactRows(data.basis);
  const decomposition = callMethod(order, "factor_rational_prime", [data.prime]);
  const factors = Reflect.get(Object(decomposition), "_factors");
  if (!Array.isArray(factors)) {
    throw new SageSerializationError(
      "certified prime decomposition returned no factor list",
    );
  }
  for (const pair of factors) {
    if (!Array.isArray(pair) || pair.length !== 2) continue;
    const primeIdeal = pair[0];
    if (
      sameExactRows(Reflect.get(Object(primeIdeal), "_basis_rows"), basis) &&
      Number(Reflect.get(Object(primeIdeal), "_rational_prime")) ===
        Number(data.prime) &&
      Number(Reflect.get(Object(primeIdeal), "_ramification_index")) ===
        Number(data.ramificationIndex) &&
      Number(Reflect.get(Object(primeIdeal), "_residue_degree")) ===
        Number(data.residueDegree)
    ) {
      // Return the independently authenticated object, including its certified
      // residue presentation.  Serialized metadata never constructs a prime.
      return primeIdeal;
    }
  }
  throw new SageSerializationError(
    "serialized prime-ideal lattice or local metadata failed authentication",
  );
}

function decodeIdeal(payload: WireValue, context: DecodeContext): unknown {
  const data = context.decode(payload) as Record<string, unknown>;
  if (
    data.kind === "GaussianPrimeIdeal" ||
    (data.kind === undefined && data.parent !== undefined)
  ) {
    return callMethod(data.parent, "_from_serialized_prime_ideal", [data.generator]);
  }
  if (data.kind === "NumberFieldIdeal") return decodeNumberFieldIdeal(data);
  if (data.kind === "NumberFieldPrimeIdeal") {
    return decodeNumberFieldPrimeIdeal(data);
  }
  throw new SageSerializationError(
    `unsupported number-field ideal ${String(data.kind)}`,
  );
}

export const numberFieldParentCodec: SageCodec = {
  type: "sage.number_fields.parent",
  version: 1,
  test: (value) => [
    "NumberField",
    "QuadraticField",
    "CyclotomicField",
    "NumberFieldOrder",
  ].includes(kind(value) ?? ""),
  encode: encodeParent,
  decode: decodeParent,
};

export const numberFieldElementCodec: SageCodec = {
  type: "sage.number_fields.element",
  version: 1,
  test: (value) => ["NumberField", "QuadraticField", "CyclotomicField"].includes(
    parentKind(value) ?? "",
  ),
  encode: encodeElement,
  decode: decodeElement,
};

export const numberFieldIdealCodec: SageCodec = {
  type: "sage.number_fields.ideal",
  version: 1,
  test: (value) => kind(value) === "GaussianPrimeIdeal" ||
    isNumberFieldIdeal(value),
  encode: encodeIdeal,
  decode: decodeIdeal,
};

let registered = false;

export function registerNumberFieldCodecs(): void {
  if (registered) return;
  registered = true;
  registerCodec(numberFieldParentCodec);
  registerCodec(numberFieldIdealCodec);
  registerCodec(numberFieldElementCodec);
}
