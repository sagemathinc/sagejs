import type { FactAuthority, SourceRegion } from "../../types";

export const PACKED_CONTAINER_CANDIDATE_SCHEMA =
  "sagejs.optimizing-mathematics/packed-container-candidate/v1" as const;

export type PackedScalarRepresentation =
  | "uint8"
  | "int8"
  | "uint16"
  | "int16"
  | "uint32"
  | "int32"
  | "uint64"
  | "int64"
  | "binary64";

export interface PackedConstantExtent {
  kind: "constant";
  value: number;
}

export interface PackedGuardedExtent {
  kind: "guarded";
  symbol: string;
  minimum: number;
  maximum: number;
}

export type PackedExtent = PackedConstantExtent | PackedGuardedExtent;

export interface PackedSequenceShape {
  kind: "sequence";
  length: PackedExtent;
  layout: "contiguous";
}

export interface PackedMatrixShape {
  kind: "matrix";
  rows: PackedExtent;
  columns: PackedExtent;
  layout: "row-major" | "column-major";
}

export type PackedContainerShape = PackedSequenceShape | PackedMatrixShape;

export interface PackedElementContract {
  scalar: PackedScalarRepresentation;
  lanes: number;
  byteOrder: "native";
  canonical: true;
}

export interface PackedStorageOwner {
  ownerId: string;
  rootOwnerId: string;
  storageId: string;
  allocationDomain: string;
  relationship: "owned" | "borrowed";
  immediateOwnerId: string | null;
  storageKind: "host-buffer" | "wasm-memory" | "native-resource";
  generation: number | null;
  closedState: "always-open" | "guarded-open";
}

export interface PackedPeerRegion {
  containerId: string;
  storageId: string;
  byteOffset: number;
  byteLength: number;
  access: "read" | "write";
}

export interface PackedBorrowTransfer {
  kind: "borrow";
}

export interface PackedCopyInTransfer {
  kind: "copy-in";
  destination: PackedStorageOwner;
}

export interface PackedImmutableInputRole {
  kind: "immutable-input";
  transfer: PackedBorrowTransfer | PackedCopyInTransfer;
}

export interface PackedOwnerTransfer {
  kind: "owner-transfer";
}

export interface PackedCopyOutTransfer {
  kind: "copy-out";
  destination: PackedStorageOwner;
}

export interface PackedTransactionalOutputRole {
  kind: "transactional-output";
  transfer: PackedOwnerTransfer | PackedCopyOutTransfer;
}

export type PackedContainerRole =
  | PackedImmutableInputRole
  | PackedTransactionalOutputRole;

export interface PackedRegionEffects {
  guardsBeforeEffects: true;
  noCallback: true;
  noEscape: true;
}

export interface PackedEvidence {
  authority: FactAuthority;
  evidence: string;
}

export type PackedEvidenceKind =
  | "shape"
  | "element"
  | "owner"
  | "alias"
  | "mutation"
  | "publication"
  | "cleanup"
  | "copy"
  | "resource";

export type PackedEvidenceSet = Record<PackedEvidenceKind, PackedEvidence>;

/**
 * Target-neutral source evidence for one packed container use.
 *
 * This is deliberately JSON data rather than a host object or typed-array
 * view. The compiler must authenticate the named owner, storage, shape, and
 * resource generation before a downstream lowering uses the plan.
 */
export interface PackedContainerCandidate {
  schema: typeof PACKED_CONTAINER_CANDIDATE_SCHEMA;
  analysisRevision: number;
  containerId: string;
  fallbackId: string;
  source: SourceRegion;
  shape: PackedContainerShape;
  element: PackedElementContract;
  owner: PackedStorageOwner;
  byteOffset: number;
  role: PackedContainerRole;
  peers: PackedPeerRegion[];
  effects: PackedRegionEffects;
  evidence: PackedEvidenceSet;
}
