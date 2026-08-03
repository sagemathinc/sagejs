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
      const subspaceKind = Reflect.get(Object(value), "_subspace_kind");
      const isCuspidal = Reflect.get(Object(value), "_is_cuspidal");
      const directAmbient = Reflect.get(Object(value), "_ambient");
      const canonicalCache = Reflect.get(
        Object(directAmbient),
        Reflect.get(Object(value), "_sign") === 1 ? "_plus_cache" : "_minus_cache",
      );
      // Weight-2 signed Gamma0 spaces are canonical constructor results, but
      // internally they are represented by a large sparse basis inside the
      // sign-zero ambient space.  Persist their construction instead of a
      // quadratic dense matrix (155 MiB already at level 20,000).
      const canonicalSigned = !ambient && !Boolean(isCuspidal) &&
        ["Plus", "Minus"].includes(String(subspaceKind)) &&
        canonicalCache === value;
      return context.encode({
        kind: "ModularSymbols",
        ambient,
        canonicalSigned,
        group: ambient || canonicalSigned
          ? Reflect.get(Object(value), "_group")
          : null,
        character: ambient || canonicalSigned
          ? Reflect.get(Object(value), "_character")
          : null,
        weight: Reflect.get(Object(value), "_weight"),
        sign: Reflect.get(Object(value), "_sign"),
        base: Reflect.get(Object(value), "_base"),
        ambientSpace: ambient || canonicalSigned
          ? null
          : callMethod(value, "ambient_module"),
        basis: ambient || canonicalSigned ? null : callMethod(value, "basis_matrix"),
        subspaceKind: ambient ? null : subspaceKind,
        dimension: callMethod(value, "dimension"),
        isCuspidal,
      });
    }
    case "ModularForms":
      return context.encode({
        kind: "ModularForms",
        group: Reflect.get(Object(value), "_group"),
        weight: Reflect.get(Object(value), "_weight"),
        base: Reflect.get(Object(value), "_base"),
        precision: Reflect.get(Object(value), "_precision"),
      });
    case "ModularFormsSubspace":
    case "EisensteinSubspace":
      return context.encode({
        kind: kind(value),
        ambient: Reflect.get(Object(value), "_ambient"),
        subspaceKind: Reflect.get(Object(value), "_subspace_kind"),
        dimension: Reflect.get(Object(value), "_dimension"),
        precision: Reflect.get(Object(value), "_precision"),
      });
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
      if (data.canonicalSigned) {
        return callGlobal("ModularSymbols", [
          data.character ?? data.group,
          data.weight,
          data.sign,
          data.base,
        ]);
      }
      if (data.ambient) {
        return callMethod(data.group, "_from_serialized_modular_symbols", [
          data.character,
          data.weight,
          data.sign,
          data.base,
          data.dimension,
          data.isCuspidal,
        ]);
      }
      return callMethod(data.ambientSpace, "_new_coordinate_subspace", [
        data.basis,
        data.subspaceKind,
        data.sign,
      ]);
    case "ModularForms":
      return callGlobal("ModularForms", [
        data.group,
        data.weight,
        data.base,
        true,
        data.precision,
      ]);
    case "ModularFormsSubspace":
    case "EisensteinSubspace":
      return callMethod(data.ambient, "_from_serialized_subspace", [
        data.subspaceKind,
        data.dimension,
        data.precision,
        data.kind === "EisensteinSubspace",
      ]);
    default:
      throw new SageSerializationError(
        `unsupported modular-forms parent ${String(data.kind)}`,
      );
  }
}

function encodeOperator(value: unknown, context: EncodeContext): WireValue {
  switch (kind(value)) {
    case "HeckeOperator":
      return context.encode({
        kind: "HeckeOperator",
        space: Reflect.get(Object(value), "_space"),
        index: Reflect.get(Object(value), "_index"),
        matrix: Reflect.get(Object(value), "_matrix_cache"),
      });
    case "ModularSymbolsLinearOperator":
      return context.encode({
        kind: "ModularSymbolsLinearOperator",
        space: Reflect.get(Object(value), "_space"),
        matrix: Reflect.get(Object(value), "_matrix"),
        name: Reflect.get(Object(value), "_name"),
        ambientMatrix: Reflect.get(Object(value), "_ambient_matrix"),
      });
    default:
      throw new SageSerializationError("unsupported modular-symbol operator");
  }
}

function decodeOperator(payload: WireValue, context: DecodeContext): unknown {
  const data = context.decode(payload) as Record<string, unknown>;
  switch (data.kind) {
    case "HeckeOperator":
      return callMethod(data.space, "_from_serialized_hecke_operator", [
        data.index,
        data.matrix,
      ]);
    case "ModularSymbolsLinearOperator":
      return callMethod(data.space, "_from_serialized_linear_operator", [
        data.matrix,
        data.name,
        data.ambientMatrix,
      ]);
    default:
      throw new SageSerializationError(
        `unsupported modular-symbol operator ${String(data.kind)}`,
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
    case "EisensteinSubspace":
      return context.encode({
        kind: "EisensteinSeriesElement",
        parent,
        index: Reflect.get(Object(value), "_index"),
        displayPrecision: Reflect.get(Object(value), "_display_precision"),
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
    case "EisensteinSeriesElement":
      return callMethod(data.parent, "_from_serialized_element", [
        data.index,
        data.displayPrecision,
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
  test: (value) => [
    "CongruenceSubgroup",
    "DirichletGroup",
    "ModularSymbols",
    "ModularForms",
    "ModularFormsSubspace",
    "EisensteinSubspace",
  ].includes(
    kind(value) ?? "",
  ),
  encode: encodeParent,
  decode: decodeParent,
};

const elementCodec: SageCodec = {
  type: "sage.modular_forms.element",
  version: 1,
  test: (value) => [
    "DirichletGroup",
    "ModularSymbols",
    "EisensteinSubspace",
  ].includes(
    parentKind(value) ?? "",
  ),
  encode: encodeElement,
  decode: decodeElement,
};

const operatorCodec: SageCodec = {
  type: "sage.modular_forms.operator",
  version: 1,
  test: (value) => ["HeckeOperator", "ModularSymbolsLinearOperator"].includes(
    kind(value) ?? "",
  ),
  encode: encodeOperator,
  decode: decodeOperator,
};

let registered = false;

export function registerModularFormsCodecs(): void {
  if (registered) return;
  registered = true;
  registerCodec(parentCodec);
  registerCodec(elementCodec);
  registerCodec(operatorCodec);
}
