/** Lazy, construction-authenticated modular abelian variety codecs. */
import {
  codecRuntime, type EncodeContext, SageSerializationError, type WireValue,
} from "../serialization";
const { callMethod, callGlobal } = codecRuntime;

function kind(value: unknown): string | undefined {
  const result = value === null || value === undefined
    ? undefined
    : Reflect.get(Object(value), "_kind");
  return typeof result === "string" ? result : undefined;
}

// This first format supports canonical inclusions and connected quotients,
// not arbitrary integral maps. Bind all three pieces so serialization cannot
// silently replace a different matrix or ignore a changed endpoint.
function canonicalHomologyMap(
  domain: unknown, codomain: unknown, quotient: unknown, matrix: unknown,
): unknown {
  if (typeof quotient !== "boolean" ||
      kind(domain) !== "ModularAbelianVariety" ||
      kind(codomain) !== "ModularAbelianVariety" ||
      matrix === null || matrix === undefined) {
    throw new SageSerializationError("invalid canonical homology map payload");
  }
  const canonical = quotient
    ? callMethod(codomain, "quotient_map")
    : callMethod(domain, "inclusion_map");
  for (const [name, expected] of [
    ["domain", domain], ["codomain", codomain], ["matrix", matrix],
  ] as const) {
    if (callMethod(callMethod(canonical, name), "__eq__", [expected]) !== true) {
      throw new SageSerializationError(
        "only canonical homology maps can be serialized; " + name + " differs",
      );
    }
  }
  return canonical;
}

export function encodeModularAbelianParent(value: unknown, context: EncodeContext): WireValue {
  switch (kind(value)) {
    case "ModularAbelianVariety": {
      const construction = String(callMethod(value, "construction"));
      const newform = Reflect.get(Object(value), "_newform");
      if (construction === "product") {
        return context.encode({ kind: "ModularAbelianVariety", construction,
          factors: callMethod(value, "factors") });
      }
      if (construction === "homology subvariety") {
        return context.encode({ kind: "ModularAbelianVariety", construction,
          recipe: Reflect.get(Object(value), "_recipe"),
          basis: Reflect.get(Object(value), "_relative_basis") });
      }
      return context.encode({
        kind: "ModularAbelianVariety",
        construction,
        level: callMethod(value, "level"),
        modularSymbols: construction === "modular-symbol subvariety" &&
            (newform === null || newform === undefined)
          ? callMethod(value, "modular_symbols", [])
          : null,
        newform: newform ?? null,
      });
    }
    case "AbelianVarietyHomology":
      return context.encode({
        kind: "AbelianVarietyHomology",
        variety: callMethod(value, "abelian_variety"),
        base: callMethod(value, "base_ring"),
      });
    default:
      throw new SageSerializationError("unsupported modular abelian variety payload");
  }
}

export function decodeModularAbelianParent(data: Record<string, unknown>): unknown {
  switch (data.kind) {
    case "ModularAbelianVariety":
      if (data.construction === "product") {
        return callGlobal("AbelianVariety", [data.factors]);
      }
      if (data.construction === "homology subvariety") {
        const recipe = data.recipe as unknown[];
        if (!Array.isArray(recipe) || recipe.length !== 2 ||
            !["kernel", "image"].includes(String(recipe[0]))) {
          throw new SageSerializationError("invalid homology subvariety construction");
        }
        const variety = callMethod(recipe[1], recipe[0] === "kernel" ? "connected_kernel" : "image");
        const basis = Reflect.get(Object(variety), "_relative_basis");
        if (callMethod(basis, "__eq__", [data.basis]) !== true) {
          throw new SageSerializationError("homology subvariety basis does not match its construction");
        }
        return variety;
      }
      if (data.construction === "J0") {
        return callGlobal("J0", [data.level]);
      }
      if (data.construction === "newform quotient") {
        return callGlobal("AbelianVariety", [data.newform]);
      }
      if (data.construction !== "modular-symbol subvariety") {
        throw new SageSerializationError("unknown modular abelian variety construction");
      }
      if (data.newform !== null && data.newform !== undefined) {
        return callMethod(
          callGlobal("AbelianVariety", [data.newform]),
          "embedded_subvariety",
          [],
        );
      }
      return callGlobal("AbelianVariety", [data.modularSymbols]);
    case "AbelianVarietyHomology":
      return callMethod(data.variety, "homology", [data.base]);
    default:
      throw new SageSerializationError("unsupported modular abelian variety payload");
  }
}

export function encodeModularAbelianOperator(value: unknown, context: EncodeContext): WireValue {
  switch (kind(value)) {
    case "AbelianVarietyKernelComponents":
      return context.encode({ kind: "AbelianVarietyKernelComponents",
        morphism: callMethod(value, "morphism") });
    case "AbelianVarietyHeckeOperator":
      return context.encode({
        kind: "AbelianVarietyHeckeOperator",
        parent: callMethod(value, "parent"),
        index: callMethod(value, "index"),
      });
    case "ModularAbelianVarietyMap": {
      const domain = callMethod(value, "domain");
      const codomain = callMethod(value, "codomain");
      const matrix = callMethod(value, "matrix");
      if (callMethod(value, "verify") !== true) {
        throw new SageSerializationError("invalid morphism construction certificate");
      }
      return context.encode({
        kind: "ModularAbelianVarietyMap",
        domain,
        codomain,
        recipe: callMethod(value, "construction_data"),
        matrix,
      });
    }
    case "AbelianVarietySerializationCertificate":
      return context.encode({
        kind: "AbelianVarietySerializationCertificate",
        variety: callMethod(value, "variety"),
      });
    default:
      throw new SageSerializationError("unsupported modular abelian variety payload");
  }
}

export function decodeModularAbelianOperator(data: Record<string, unknown>): unknown {
  switch (data.kind) {
    case "AbelianVarietyKernelComponents":
      return callMethod(data.morphism, "component_group");
    case "AbelianVarietyHeckeOperator":
      return callMethod(data.parent, "T", [data.index]);
    case "ModularAbelianVarietyMap":
      if (data.recipe !== undefined) {
        const morphism = callMethod(data.domain, "_replay_morphism", [data.codomain, data.recipe]);
        if (callMethod(callMethod(morphism, "matrix"), "__eq__", [data.matrix]) !== true) {
          throw new SageSerializationError("morphism matrix does not match its construction");
        }
        return morphism;
      }
      return canonicalHomologyMap(
        data.domain, data.codomain, data.quotient, data.matrix,
      );
    case "AbelianVarietySerializationCertificate":
      return callMethod(data.variety, "serialization_certificate", []);
    default:
      throw new SageSerializationError("unsupported modular abelian variety payload");
  }
}
