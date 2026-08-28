import {
  FIXED_EXTENSION_CONSTRUCTION_CONTEXT,
  FIXED_EXTENSION_CONSTRUCTION_CONTEXT_PROPERTY,
  FIXED_EXTENSION_CONTEXT_INTRINSIC,
  FIXED_EXTENSION_CONTEXT_RUNTIME_HELPER,
  FIXED_EXTENSION_DEGREES,
  FIXED_EXTENSION_EXACTNESS_PROOFS,
  FIXED_EXTENSION_MODULUS_IDENTITY_AUTHENTICATION,
  FixedExtensionDegree,
  FixedExtensionExactnessProof,
} from "../domains/fixed-extension";

export const FIXED_EXTENSION_REPRESENTATION =
  "extension-tuple-number.fixed-shape.v1";

export interface FixedExtensionRepresentationVariant {
  readonly id: string;
  readonly representationId: typeof FIXED_EXTENSION_REPRESENTATION;
  readonly degree: FixedExtensionDegree;
  readonly tupleWidth: number;
  readonly modulusShape: {
    readonly basis: "polynomial";
    readonly leadingCoefficient: 1;
    readonly storedCoefficientCount: number;
    readonly coefficientOrder: "ascending";
  };
  readonly exactness: FixedExtensionExactnessProof;
}

export interface FixedExtensionRepresentationPlan {
  readonly id: "fixed-extension-representation-plan.v1";
  readonly dispatch: "guarded-degree-before-effects";
  readonly runtimeContext: {
    readonly id: typeof FIXED_EXTENSION_CONSTRUCTION_CONTEXT;
    readonly parentProperty: typeof FIXED_EXTENSION_CONSTRUCTION_CONTEXT_PROPERTY;
    readonly descriptor: "own-nonwritable-nonconfigurable-data";
    readonly sourceModulusIdentity: "construction-list-object-identity";
    readonly machineModulusIdentity: "construction-tuple-object-identity";
    readonly preparedContextProperty: "constructionContext";
    readonly preparedAuthenticationProperty: "modulusIdentityAuthentication";
    readonly preparedAuthenticationValue:
      typeof FIXED_EXTENSION_MODULUS_IDENTITY_AUTHENTICATION;
    readonly runtimeHelper: typeof FIXED_EXTENSION_CONTEXT_RUNTIME_HELPER;
    readonly intrinsic: typeof FIXED_EXTENSION_CONTEXT_INTRINSIC;
  };
  readonly variants: readonly FixedExtensionRepresentationVariant[];
}

function representationVariant(
  degree: FixedExtensionDegree,
): FixedExtensionRepresentationVariant {
  const exactness = FIXED_EXTENSION_EXACTNESS_PROOFS.find(
    (proof) => proof.degree === degree,
  );
  if (!exactness) throw new TypeError(`missing exactness proof for degree ${degree}`);
  return Object.freeze({
    id: `extension-tuple-number.degree-${degree}.monic-polynomial-basis.v1`,
    representationId: FIXED_EXTENSION_REPRESENTATION,
    degree,
    tupleWidth: degree,
    modulusShape: Object.freeze({
      basis: "polynomial" as const,
      leadingCoefficient: 1 as const,
      storedCoefficientCount: degree,
      coefficientOrder: "ascending" as const,
    }),
    exactness,
  });
}

/** Build the immutable degree-isolated representation alternatives. */
export function planFixedExtensionRepresentation(): FixedExtensionRepresentationPlan {
  return Object.freeze({
    id: "fixed-extension-representation-plan.v1" as const,
    dispatch: "guarded-degree-before-effects" as const,
    runtimeContext: Object.freeze({
      id: FIXED_EXTENSION_CONSTRUCTION_CONTEXT,
      parentProperty: FIXED_EXTENSION_CONSTRUCTION_CONTEXT_PROPERTY,
      descriptor: "own-nonwritable-nonconfigurable-data" as const,
      sourceModulusIdentity: "construction-list-object-identity" as const,
      machineModulusIdentity: "construction-tuple-object-identity" as const,
      preparedContextProperty: "constructionContext" as const,
      preparedAuthenticationProperty:
        "modulusIdentityAuthentication" as const,
      preparedAuthenticationValue:
        FIXED_EXTENSION_MODULUS_IDENTITY_AUTHENTICATION,
      runtimeHelper: FIXED_EXTENSION_CONTEXT_RUNTIME_HELPER,
      intrinsic: FIXED_EXTENSION_CONTEXT_INTRINSIC,
    }),
    variants: Object.freeze(FIXED_EXTENSION_DEGREES.map(representationVariant)),
  });
}
