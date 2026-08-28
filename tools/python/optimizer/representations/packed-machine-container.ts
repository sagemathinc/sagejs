import type {
  PackedContainerCandidate,
  PackedContainerShape,
  PackedElementContract,
  PackedEvidence,
  PackedEvidenceKind,
  PackedPeerRegion,
  PackedScalarRepresentation,
  PackedStorageOwner,
} from "../analyses/packed-containers/contracts";

export const PACKED_CONTAINER_PLAN_SCHEMA =
  "sagejs.optimizing-mathematics/packed-machine-container/v1" as const;
export const PACKED_CONTAINER_ANALYSIS_ID =
  "analysis.packed-machine-container.v1" as const;
export const PACKED_CONTAINER_REPRESENTATION_ID =
  "representation.owner-bound-packed-container.v1" as const;
export const PACKED_CONTAINER_VERIFIER_ID =
  "verify.packed-machine-container.v1" as const;

export const PACKED_CONTAINER_FACT_KINDS = Object.freeze([
  "PackedLengthAndShape",
  "PackedElementShape",
  "PackedOwnerBinding",
  "PackedAliasPolicy",
  "PackedMutationPolicy",
  "PackedPublicationPolicy",
  "PackedCleanupPolicy",
  "PackedCopyCost",
  "PackedResourceContract",
] as const);

export type PackedContainerFactKind =
  typeof PACKED_CONTAINER_FACT_KINDS[number];

export const PACKED_CONTAINER_GUARD_CODES = Object.freeze({
  alias: "packed-container.alias-set",
  element: "packed-container.element-shape",
  owner: "packed-container.owner-identity",
  privateStorage: "packed-container.private-storage",
  resourceGeneration: "packed-container.resource-generation",
  resourceOpen: "packed-container.resource-open",
  shape: "packed-container.shape",
} as const);

export type PackedContainerGuardCode =
  typeof PACKED_CONTAINER_GUARD_CODES[keyof typeof PACKED_CONTAINER_GUARD_CODES];

export interface PackedFactProvenance extends PackedEvidence {
  analysisRevision: number;
  invalidatedBy: string[];
}

export interface PackedFact<TKind extends PackedContainerFactKind, TValue> {
  kind: TKind;
  value: TValue;
  provenance: PackedFactProvenance;
}

export interface PackedLogicalElementCount {
  formula: "length" | "rows*columns";
  exact: number | null;
  maximum: number;
}

export interface PackedShapeFactValue {
  shape: PackedContainerShape;
  logicalElementCount: PackedLogicalElementCount;
  maximumByteLength: number;
}

export interface PackedElementFactValue extends PackedElementContract {
  scalarBytes: number;
  elementBytes: number;
  alignmentBytes: number;
}

export interface PackedOwnerFactValue {
  source: PackedStorageOwner;
  active: PackedStorageOwner;
  publicResult: PackedStorageOwner | null;
  sourceByteOffset: number;
  activeByteOffset: number;
  activeOwnership: "borrowed" | "private-owned";
  rootRetainedDuringUse: boolean;
}

export interface PackedAliasRelation {
  containerId: string;
  access: "read" | "write";
  sourceOverlap: boolean;
  activeOverlap: boolean;
}

export interface PackedAliasFactValue {
  relations: PackedAliasRelation[];
  mode: "disjoint" | "read-only-sharing" | "private-transaction";
  writeAliases: string[];
  readOnlyAliases: string[];
  activeStoragePrivate: boolean;
}

export interface PackedMutationFactValue {
  policy: "immutable" | "transactional";
  optimizedWrites: "none" | "private-active-owner";
  rollback: "not-applicable" | "discard-private-owner";
  visibleWritesBeforeCommit: false;
  callbacks: "forbidden";
  escape: "forbidden";
}

export interface PackedPublicationFactValue {
  policy: "none" | "sealed-owner-transfer" | "sealed-deep-copy";
  resultOwnerId: string | null;
  publicMutability: "immutable";
  exposesMutableArray: false;
  exposesRawStorage: false;
  afterAllGuards: true;
  afterComputation: true;
}

export type PackedCleanupAction = "retain" | "drop" | "close" | "transfer";

export interface PackedOwnerCleanup {
  ownerId: string;
  onFailure: PackedCleanupAction;
  onSuccess: PackedCleanupAction;
}

export interface PackedCleanupFactValue {
  owners: PackedOwnerCleanup[];
  allExitsCovered: true;
  closeIsIdempotent: true;
  finalizerFallbackOwnerIds: string[];
}

export interface PackedCopyCostFactValue {
  entryCopies: 0 | 1;
  exitCopies: 0 | 1;
  maximumEntryBytes: number;
  maximumExitBytes: number;
  maximumTotalCopiedBytes: number;
  byteFormula: "maximum-elements*element-bytes";
}

export interface PackedResourceOwnerFact {
  ownerId: string;
  roles: Array<"source" | "active-private" | "public-result">;
  storageKind: PackedStorageOwner["storageKind"];
  allocationDomain: string;
  generation: number | null;
  openGuard: boolean;
  generationGuard: boolean;
}

export interface PackedResourceFactValue {
  owners: PackedResourceOwnerFact[];
  retainedRootOwnerIds: string[];
  allocatorDomainCrossing: boolean;
  rawAddressExposure: "none";
}

export interface PackedContainerFacts {
  shape: PackedFact<"PackedLengthAndShape", PackedShapeFactValue>;
  element: PackedFact<"PackedElementShape", PackedElementFactValue>;
  owner: PackedFact<"PackedOwnerBinding", PackedOwnerFactValue>;
  alias: PackedFact<"PackedAliasPolicy", PackedAliasFactValue>;
  mutation: PackedFact<"PackedMutationPolicy", PackedMutationFactValue>;
  publication: PackedFact<"PackedPublicationPolicy", PackedPublicationFactValue>;
  cleanup: PackedFact<"PackedCleanupPolicy", PackedCleanupFactValue>;
  copy: PackedFact<"PackedCopyCost", PackedCopyCostFactValue>;
  resource: PackedFact<"PackedResourceContract", PackedResourceFactValue>;
}

export interface PackedContainerGuard {
  code: PackedContainerGuardCode;
  evidenceKind: PackedEvidenceKind;
  beforeEffects: true;
}

export interface PackedContainerFallback {
  id: string;
  policy: "same-source";
  restart: "original-inputs";
  beforeVisibleEffect: true;
}

export interface PackedMachineContainerPlan {
  schema: typeof PACKED_CONTAINER_PLAN_SCHEMA;
  analysisId: typeof PACKED_CONTAINER_ANALYSIS_ID;
  representationId: typeof PACKED_CONTAINER_REPRESENTATION_ID;
  verifierId: typeof PACKED_CONTAINER_VERIFIER_ID;
  containerId: string;
  analysisRevision: number;
  source: PackedContainerCandidate;
  guards: PackedContainerGuard[];
  facts: PackedContainerFacts;
  fallback: PackedContainerFallback;
  fingerprint: string;
}

export type PackedContainerRejectionCode =
  | "packed-container.alias-write-visible"
  | "packed-container.candidate-not-detached-data"
  | "packed-container.effect-or-escape-unknown"
  | "packed-container.invalid-candidate"
  | "packed-container.invalid-owner"
  | "packed-container.invalid-resource"
  | "packed-container.private-storage-not-distinct"
  | "packed-container.transaction-not-private"
  | "packed-container.unsafe-shape"
  | "packed-container.unsupported-element"
  | "packed-container.unsupported-publication";

export interface PackedContainerRejection {
  code: PackedContainerRejectionCode;
  detail: string;
}

export type PackedContainerAnalysisResult =
  | { accepted: true; plan: PackedMachineContainerPlan }
  | { accepted: false; rejections: PackedContainerRejection[] };

export interface PackedContainerDetachedEnvelope {
  schema: typeof PACKED_CONTAINER_PLAN_SCHEMA;
  plan: PackedMachineContainerPlan;
}

/** Deep-freeze detached plan data so downstream passes cannot mutate proofs. */
export function freezePackedContainerPlan(
  plan: PackedMachineContainerPlan,
): PackedMachineContainerPlan {
  const visit = (value: unknown): void => {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) return;
    for (const child of Object.values(value as Record<string, unknown>)) visit(child);
    Object.freeze(value);
  };
  visit(plan);
  return plan;
}

export function packedScalarBytes(scalar: PackedScalarRepresentation): number {
  switch (scalar) {
    case "uint8":
    case "int8":
      return 1;
    case "uint16":
    case "int16":
      return 2;
    case "uint32":
    case "int32":
      return 4;
    case "uint64":
    case "int64":
    case "binary64":
      return 8;
  }
}

export type { PackedContainerCandidate, PackedPeerRegion };
