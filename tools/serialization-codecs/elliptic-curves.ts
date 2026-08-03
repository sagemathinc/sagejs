/** Lazy serialization codecs owned by the elliptic-curves package. */

import {
  codecRuntime,
  type DecodeContext,
  type EncodeContext,
  registerCodec,
  type SageCodec,
  SageSerializationError,
  type WireValue,
} from "../serialization";

const { callGlobal, callPython } = codecRuntime;

function kind(value: unknown): string | undefined {
  const result = value === null || value === undefined
    ? undefined
    : Reflect.get(Object(value), "_kind");
  return typeof result === "string" ? result : undefined;
}

function isPoint(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  return kind(Reflect.get(value, "_parent")) === "EllipticCurve" &&
    Reflect.has(value, "_infinity");
}

function encodeCurve(value: unknown, context: EncodeContext): WireValue {
  return context.encode({
    base: Reflect.get(Object(value), "_base"),
    ainvs: Array.from(Reflect.get(Object(value), "_ainvs") as Iterable<unknown>),
    label: Reflect.get(Object(value), "_label"),
  });
}

function decodeCurve(payload: WireValue, context: DecodeContext): unknown {
  const data = context.decode(payload) as Record<string, unknown>;
  return typeof data.label === "string"
    ? callGlobal("EllipticCurve", [data.label])
    : callGlobal("EllipticCurve", [data.base, data.ainvs]);
}

function encodePoint(value: unknown, context: EncodeContext): WireValue {
  const infinity = Boolean(Reflect.get(Object(value), "_infinity"));
  return context.encode({
    parent: Reflect.get(Object(value), "_parent"),
    infinity,
    x: infinity ? null : Reflect.get(Object(value), "_x"),
    y: infinity ? null : Reflect.get(Object(value), "_y"),
  });
}

function decodePoint(payload: WireValue, context: DecodeContext): unknown {
  const data = context.decode(payload) as Record<string, unknown>;
  if (data.infinity) return callPython(data.parent, [0]);
  return callPython(data.parent, [[data.x, data.y]]);
}

const curveCodec: SageCodec = {
  type: "sage.elliptic_curves.parent",
  version: 1,
  test: (value) => kind(value) === "EllipticCurve",
  encode: encodeCurve,
  decode: decodeCurve,
};

const pointCodec: SageCodec = {
  type: "sage.elliptic_curves.point",
  version: 1,
  test: isPoint,
  encode: encodePoint,
  decode: decodePoint,
};

let registered = false;

export function registerEllipticCurveCodecs(): void {
  if (registered) return;
  registered = true;
  registerCodec(curveCodec);
  registerCodec(pointCodec);
}
