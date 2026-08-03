/** Lazy SagePack codecs for exact power and Laurent series. */

import {
  codecRuntime,
  type DecodeContext,
  type EncodeContext,
  registerCodec,
  type SageCodec,
  type WireValue,
} from "../serialization";

const { callGlobal, callMethod } = codecRuntime;

function kind(value: unknown): string | undefined {
  const result = value === null || value === undefined
    ? undefined
    : Reflect.get(Object(value), "_kind");
  return typeof result === "string" ? result : undefined;
}

function parentKind(value: unknown): string | undefined {
  return kind(Reflect.get(Object(value), "_parent"));
}

const parentCodec: SageCodec = {
  type: "sage.series.parent",
  version: 1,
  test: (value) => ["PowerSeriesRing", "LaurentSeriesRing"].includes(
    kind(value) ?? "",
  ),
  encode(value: unknown, context: EncodeContext): WireValue {
    return context.encode({
      kind: kind(value),
      base: Reflect.get(Object(value), "_base"),
      variable: Reflect.get(Object(value), "_variable"),
      defaultPrecision: Reflect.get(Object(value), "_default_precision"),
    });
  },
  decode(payload: WireValue, context: DecodeContext): unknown {
    const data = context.decode(payload) as Record<string, unknown>;
    const constructor = data.kind === "LaurentSeriesRing"
      ? "LaurentSeriesRing"
      : "PowerSeriesRing";
    return callGlobal(constructor, [
      data.base,
      data.variable,
      data.defaultPrecision,
    ]);
  },
};

const elementCodec: SageCodec = {
  type: "sage.series.element",
  version: 1,
  test: (value) => ["PowerSeriesRing", "LaurentSeriesRing"].includes(
    parentKind(value) ?? "",
  ),
  encode(value: unknown, context: EncodeContext): WireValue {
    const parent = Reflect.get(Object(value), "_parent");
    return context.encode({
      parent,
      coefficients: callMethod(parent, "_serialization_coefficients", [value]),
      shift: Reflect.get(Object(value), "_shift"),
      precision: Reflect.get(Object(value), "_precision"),
    });
  },
  decode(payload: WireValue, context: DecodeContext): unknown {
    const data = context.decode(payload) as Record<string, unknown>;
    return callMethod(data.parent, "_from_serialized_series", [
      data.coefficients,
      data.shift,
      data.precision,
    ]);
  },
};

let registered = false;

export function registerSeriesCodecs(): void {
  if (registered) return;
  registered = true;
  registerCodec(parentCodec);
  registerCodec(elementCodec);
}
