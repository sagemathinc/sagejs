/** Lazy serialization codecs owned by modular forms and modular symbols. */

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

function isDefaultDirichletGroup(value: unknown): boolean {
  const field = Reflect.get(Object(value), "_value_field");
  const generator = Reflect.get(Object(value), "_value_generator");
  const order = Reflect.get(Object(value), "_value_order");
  return kind(field) === "CyclotomicField" &&
    Reflect.get(Object(field), "_order") === order &&
    order === Reflect.get(Object(value), "_native_exponent") &&
    Reflect.get(Object(generator), "_exponent") === 1;
}

function encodeParent(value: unknown, context: EncodeContext): WireValue {
  switch (kind(value)) {
    case "CongruenceSubgroup":
      return context.encode({
        kind: "CongruenceSubgroup",
        family: Reflect.get(Object(value), "_family"),
        level: Reflect.get(Object(value), "_level"),
      });
    case "DirichletGroup": {
      const defaultGroup = isDefaultDirichletGroup(value);
      return context.encode({
        kind: "DirichletGroup",
        modulus: Reflect.get(Object(value), "_modulus"),
        defaultGroup,
        base: defaultGroup ? null : Reflect.get(Object(value), "_value_field"),
        zeta: defaultGroup ? null : Reflect.get(Object(value), "_value_generator"),
      });
    }
    case "ModularSymbols": {
      const ambient = Boolean(callMethod(value, "is_ambient"));
      return context.encode({
        kind: "ModularSymbols",
        ambient,
        group: ambient ? Reflect.get(Object(value), "_group") : null,
        character: ambient ? Reflect.get(Object(value), "_character") : null,
        weight: Reflect.get(Object(value), "_weight"),
        sign: Reflect.get(Object(value), "_sign"),
        base: Reflect.get(Object(value), "_base"),
        ambientSpace: ambient ? null : callMethod(value, "ambient_module"),
        basis: ambient ? null : callMethod(value, "basis_matrix"),
        subspaceKind: ambient ? null : Reflect.get(Object(value), "_subspace_kind"),
      });
    }
    default:
      throw new SageSerializationError("unsupported modular-forms parent");
  }
}

function decodeParent(payload: WireValue, context: DecodeContext): unknown {
  const data = context.decode(payload) as Record<string, unknown>;
  switch (data.kind) {
    case "CongruenceSubgroup":
      return callGlobal(String(data.family), [data.level]);
    case "DirichletGroup":
      return data.defaultGroup
        ? callGlobal("DirichletGroup", [data.modulus])
        : callGlobal("DirichletGroup", [data.modulus, data.base, data.zeta]);
    case "ModularSymbols":
      if (data.ambient) {
        const definition = data.character === null ? data.group : data.character;
        return callGlobal("ModularSymbols", [
          definition,
          data.weight,
          data.sign,
          data.base,
        ]);
      }
      return callMethod(data.ambientSpace, "_new_coordinate_subspace", [
        data.basis,
        data.subspaceKind,
        data.sign,
      ]);
    default:
      throw new SageSerializationError(
        `unsupported modular-forms parent ${String(data.kind)}`,
      );
  }
}

function encodeElement(value: unknown, context: EncodeContext): WireValue {
  const parent = Reflect.get(Object(value), "_parent");
  switch (kind(parent)) {
    case "DirichletGroup":
      return context.encode({
        kind: "DirichletCharacter",
        parent,
        index: Reflect.get(Object(value), "_index"),
      });
    case "ModularSymbols":
      return context.encode({
        kind: "ModularSymbolElement",
        parent,
        coordinates: callMethod(value, "vector"),
        label: Reflect.get(Object(value), "_label"),
      });
    default:
      throw new SageSerializationError("unsupported modular-forms element");
  }
}

function decodeElement(payload: WireValue, context: DecodeContext): unknown {
  const data = context.decode(payload) as Record<string, unknown>;
  switch (data.kind) {
    case "DirichletCharacter":
      return callMethod(data.parent, "__getitem__", [data.index]);
    case "ModularSymbolElement":
      return callMethod(data.parent, "_from_serialized_element", [
        data.coordinates,
        data.label,
      ]);
    default:
      throw new SageSerializationError(
        `unsupported modular-forms element ${String(data.kind)}`,
      );
  }
}

const parentCodec: SageCodec = {
  type: "sage.modular_forms.parent",
  version: 1,
  test: (value) => ["CongruenceSubgroup", "DirichletGroup", "ModularSymbols"].includes(
    kind(value) ?? "",
  ),
  encode: encodeParent,
  decode: decodeParent,
};

const elementCodec: SageCodec = {
  type: "sage.modular_forms.element",
  version: 1,
  test: (value) => ["DirichletGroup", "ModularSymbols"].includes(
    parentKind(value) ?? "",
  ),
  encode: encodeElement,
  decode: decodeElement,
};

let registered = false;

export function registerModularFormsCodecs(): void {
  if (registered) return;
  registered = true;
  registerCodec(parentCodec);
  registerCodec(elementCodec);
}
