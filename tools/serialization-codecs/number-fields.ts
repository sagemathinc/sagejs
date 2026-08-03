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

function encodeParent(value: unknown, context: EncodeContext): WireValue {
  switch (kind(value)) {
    case "NumberField":
      return context.encode({
        kind: "NumberField",
        polynomial: Reflect.get(Object(value), "_polynomial"),
        name: Reflect.get(Object(value), "_variable"),
      });
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
    default:
      throw new SageSerializationError("unsupported number-field parent");
  }
}

function decodeParent(payload: WireValue, context: DecodeContext): unknown {
  const data = context.decode(payload) as Record<string, unknown>;
  switch (data.kind) {
    case "NumberField": return callGlobal("NumberField", [data.polynomial, data.name]);
    case "QuadraticField": return callGlobal("QuadraticField", [data.discriminant]);
    case "CyclotomicField": return callGlobal("CyclotomicField", [data.order]);
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

export const numberFieldParentCodec: SageCodec = {
  type: "sage.number_fields.parent",
  version: 1,
  test: (value) => ["NumberField", "QuadraticField", "CyclotomicField"].includes(
    kind(value) ?? "",
  ),
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

let registered = false;

export function registerNumberFieldCodecs(): void {
  if (registered) return;
  registered = true;
  registerCodec(numberFieldParentCodec);
  registerCodec(numberFieldElementCodec);
}
