import { semanticFingerprint } from "../identity";
import {
  PACKED_CONTAINER_CANDIDATE_SCHEMA,
  PackedContainerCandidate,
  PackedEvidenceKind,
  PackedExtent,
  PackedStorageOwner,
} from "../analyses/packed-containers/contracts";
import {
  freezePackedContainerPlan,
  PACKED_CONTAINER_ANALYSIS_ID,
  PACKED_CONTAINER_GUARD_CODES,
  PACKED_CONTAINER_PLAN_SCHEMA,
  PACKED_CONTAINER_REPRESENTATION_ID,
  PACKED_CONTAINER_VERIFIER_ID,
  PackedAliasRelation,
  PackedContainerFacts,
  PackedContainerGuard,
  PackedMachineContainerPlan,
  PackedOwnerCleanup,
  PackedResourceOwnerFact,
} from "../representations/packed-machine-container";

const EVIDENCE_KINDS: readonly PackedEvidenceKind[] = [
  "shape", "element", "owner", "alias", "mutation", "publication",
  "cleanup", "copy", "resource",
];

const INVALIDATIONS: Readonly<Record<PackedEvidenceKind, readonly string[]>> = {
  shape: ["shape-change", "owner-rebind"],
  element: ["element-representation-change", "owner-rebind"],
  owner: ["owner-rebind", "owner-close", "resource-generation-change"],
  alias: ["owner-rebind", "peer-access-change", "storage-publication"],
  mutation: ["mutation-policy-change", "callback-introduction"],
  publication: ["escape", "publication-policy-change"],
  cleanup: ["ownership-transfer", "resource-close"],
  copy: ["shape-change", "transfer-policy-change"],
  resource: ["owner-close", "resource-generation-change", "allocator-domain-change"],
};

function requireDetachedData(value: unknown): void {
  const seen = new WeakSet<object>();
  const visit = (item: unknown, field: string): void => {
    if (item === null || typeof item === "string" || typeof item === "boolean" ||
        (typeof item === "number" && Number.isFinite(item))) return;
    if (!item || typeof item !== "object") {
      throw new TypeError(`packed container ${field} is not detached JSON data`);
    }
    if (seen.has(item)) throw new TypeError(`packed container ${field} contains a cycle`);
    seen.add(item);
    if (Array.isArray(item)) {
      for (let index = 0; index < item.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(item, index)) {
          throw new TypeError(`packed container ${field} contains a sparse array`);
        }
        visit(item[index], `${field}[${index}]`);
      }
      seen.delete(item);
      return;
    }
    const prototype = Object.getPrototypeOf(item);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`packed container ${field} has a non-plain prototype`);
    }
    if (Object.getOwnPropertySymbols(item).length !== 0) {
      throw new TypeError(`packed container ${field} has symbol properties`);
    }
    for (const [key, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(item),
    )) {
      if (!("value" in descriptor)) {
        throw new TypeError(`packed container ${field}.${key} is an accessor`);
      }
      visit(descriptor.value, `${field}.${key}`);
    }
    seen.delete(item);
  };
  visit(value, "plan");
}

function record(value: unknown, field: string): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`packed container ${field} must be an object`);
  }
  return value as Record<string, any>;
}

function exactKeys(value: unknown, keys: readonly string[], field: string): Record<string, any> {
  const answer = record(value, field);
  const actual = Object.keys(answer).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length ||
      actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`packed container ${field} has unknown or missing fields`);
  }
  return answer;
}

function nonempty(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`packed container ${field} must be a nonempty string`);
  }
}

function safeInteger(value: unknown, field: string, minimum = 0): asserts value is number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw new TypeError(`packed container ${field} is not a safe integer`);
  }
}

function scalarBytes(value: unknown): number {
  switch (value) {
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
    default:
      throw new TypeError("packed container element scalar is unsupported");
  }
}

function verifyExtent(value: unknown, field: string): PackedExtent {
  const extent = record(value, field);
  if (extent.kind === "constant") {
    exactKeys(extent, ["kind", "value"], field);
    safeInteger(extent.value, `${field}.value`);
    return extent as PackedExtent;
  }
  if (extent.kind === "guarded") {
    exactKeys(extent, ["kind", "symbol", "minimum", "maximum"], field);
    nonempty(extent.symbol, `${field}.symbol`);
    safeInteger(extent.minimum, `${field}.minimum`);
    safeInteger(extent.maximum, `${field}.maximum`);
    if (extent.minimum > extent.maximum) {
      throw new TypeError(`packed container ${field} has reversed bounds`);
    }
    return extent as PackedExtent;
  }
  throw new TypeError(`packed container ${field} extent is unsupported`);
}

function extentMaximum(extent: PackedExtent): number {
  return extent.kind === "constant" ? extent.value : extent.maximum;
}

function extentExact(extent: PackedExtent): number | null {
  return extent.kind === "constant" ? extent.value : null;
}

function product(left: number, right: number, field: string): number {
  const answer = left * right;
  if (!Number.isSafeInteger(answer)) {
    throw new TypeError(`packed container ${field} exceeds exact size arithmetic`);
  }
  return answer;
}

function verifyOwner(value: unknown, field: string): PackedStorageOwner {
  const owner = exactKeys(value, [
    "ownerId", "rootOwnerId", "storageId", "allocationDomain", "relationship",
    "immediateOwnerId", "storageKind", "generation", "closedState",
  ], field);
  for (const key of ["ownerId", "rootOwnerId", "storageId", "allocationDomain"]) {
    nonempty(owner[key], `${field}.${key}`);
  }
  if (owner.relationship === "owned") {
    if (owner.immediateOwnerId !== null || owner.rootOwnerId !== owner.ownerId) {
      throw new TypeError(`packed container ${field} has invalid owned ancestry`);
    }
  } else if (owner.relationship === "borrowed") {
    nonempty(owner.immediateOwnerId, `${field}.immediateOwnerId`);
    if (owner.rootOwnerId === owner.ownerId) {
      throw new TypeError(`packed container ${field} borrowed owner is its own root`);
    }
  } else {
    throw new TypeError(`packed container ${field} relationship is unsupported`);
  }
  if (owner.storageKind === "host-buffer") {
    if (owner.generation !== null || owner.closedState !== "always-open") {
      throw new TypeError(`packed container ${field} has invalid host lifetime state`);
    }
  } else if (owner.storageKind === "wasm-memory" ||
             owner.storageKind === "native-resource") {
    safeInteger(owner.generation, `${field}.generation`);
    if (owner.closedState !== "guarded-open") {
      throw new TypeError(`packed container ${field} lacks an open-state guard`);
    }
  } else {
    throw new TypeError(`packed container ${field} resource kind is unsupported`);
  }
  return owner as PackedStorageOwner;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
    .join(",")}}`;
}

function equalData(actual: unknown, expected: unknown, field: string): void {
  if (canonical(actual) !== canonical(expected)) {
    throw new TypeError(`packed container ${field} does not match detached replay`);
  }
}

function overlaps(
  leftOffset: number,
  leftLength: number,
  rightOffset: number,
  rightLength: number,
): boolean {
  return leftLength !== 0 && rightLength !== 0 &&
    leftOffset < rightOffset + rightLength &&
    rightOffset < leftOffset + leftLength;
}

function discard(owner: PackedStorageOwner): "drop" | "close" {
  return owner.storageKind === "host-buffer" ? "drop" : "close";
}

/**
 * Independently recompute every safety-critical fact from the detached source
 * contract. This intentionally does not call the producing analysis.
 */
export function verifyPackedMachineContainerPlan(
  value: unknown,
): asserts value is PackedMachineContainerPlan {
  requireDetachedData(value);
  const plan = exactKeys(value, [
    "schema", "analysisId", "representationId", "verifierId", "containerId",
    "analysisRevision", "source", "guards", "facts", "fallback", "fingerprint",
  ], "plan") as unknown as PackedMachineContainerPlan;
  if (plan.schema !== PACKED_CONTAINER_PLAN_SCHEMA ||
      plan.analysisId !== PACKED_CONTAINER_ANALYSIS_ID ||
      plan.representationId !== PACKED_CONTAINER_REPRESENTATION_ID ||
      plan.verifierId !== PACKED_CONTAINER_VERIFIER_ID) {
    throw new TypeError("packed container plan has an unknown schema or component id");
  }
  nonempty(plan.containerId, "containerId");
  nonempty(plan.fingerprint, "fingerprint");
  safeInteger(plan.analysisRevision, "analysisRevision", 1);
  const source = exactKeys(plan.source, [
    "schema", "analysisRevision", "containerId", "fallbackId", "source", "shape",
    "element", "owner", "byteOffset", "role", "peers", "effects", "evidence",
  ], "source") as unknown as PackedContainerCandidate;
  if (source.schema !== PACKED_CONTAINER_CANDIDATE_SCHEMA ||
      source.analysisRevision !== plan.analysisRevision ||
      source.containerId !== plan.containerId) {
    throw new TypeError("packed container source identity or revision is stale");
  }
  nonempty(source.fallbackId, "source.fallbackId");
  if (source.fallbackId === source.containerId) {
    throw new TypeError("packed container fallback aliases its plan identity");
  }
  const sourceRange = exactKeys(source.source, [
    "filename", "line", "column", "endLine", "endColumn",
  ], "source.source");
  nonempty(sourceRange.filename, "source.source.filename");
  for (const key of ["line", "column", "endLine", "endColumn"]) {
    safeInteger(sourceRange[key], `source.source.${key}`);
  }
  if (sourceRange.endLine < sourceRange.line ||
      (sourceRange.endLine === sourceRange.line &&
       sourceRange.endColumn < sourceRange.column)) {
    throw new TypeError("packed container source range is reversed");
  }
  const shape = record(source.shape, "source.shape");
  let maximumElements: number;
  let exactElements: number | null;
  let formula: "length" | "rows*columns";
  if (shape.kind === "sequence") {
    exactKeys(shape, ["kind", "length", "layout"], "source.shape");
    if (shape.layout !== "contiguous") {
      throw new TypeError("packed container sequence is not contiguous");
    }
    const length = verifyExtent(shape.length, "source.shape.length");
    maximumElements = extentMaximum(length);
    exactElements = extentExact(length);
    formula = "length";
  } else if (shape.kind === "matrix") {
    exactKeys(shape, ["kind", "rows", "columns", "layout"], "source.shape");
    if (shape.layout !== "row-major" && shape.layout !== "column-major") {
      throw new TypeError("packed container matrix layout is unsupported");
    }
    const rows = verifyExtent(shape.rows, "source.shape.rows");
    const columns = verifyExtent(shape.columns, "source.shape.columns");
    maximumElements = product(
      extentMaximum(rows), extentMaximum(columns), "matrix maximum size",
    );
    exactElements = extentExact(rows) === null || extentExact(columns) === null
      ? null
      : product(extentExact(rows)!, extentExact(columns)!, "matrix exact size");
    formula = "rows*columns";
  } else {
    throw new TypeError("packed container shape is unsupported");
  }
  const element = exactKeys(
    source.element,
    ["scalar", "lanes", "byteOrder", "canonical"],
    "source.element",
  );
  const scalarWidth = scalarBytes(element.scalar);
  safeInteger(element.lanes, "source.element.lanes", 1);
  if (element.lanes > 16 || element.byteOrder !== "native" ||
      element.canonical !== true) {
    throw new TypeError("packed container element shape is unsupported");
  }
  const elementWidth = product(scalarWidth, element.lanes, "element width");
  const maximumBytes = product(maximumElements, elementWidth, "maximum byte length");
  safeInteger(source.byteOffset, "source.byteOffset");
  if (source.byteOffset % scalarWidth !== 0 ||
      !Number.isSafeInteger(source.byteOffset + maximumBytes)) {
    throw new TypeError("packed container source byte range is unsafe");
  }
  const sourceOwner = verifyOwner(source.owner, "source.owner");
  const role = record(source.role, "source.role");
  let input: boolean;
  let copiedInput = false;
  let copiedOutput = false;
  let active: PackedStorageOwner;
  let publicResult: PackedStorageOwner | null;
  if (role.kind === "immutable-input") {
    input = true;
    exactKeys(role, ["kind", "transfer"], "source.role");
    const transfer = record(role.transfer, "source.role.transfer");
    if (transfer.kind === "borrow") {
      exactKeys(transfer, ["kind"], "source.role.transfer");
      active = sourceOwner;
    } else if (transfer.kind === "copy-in") {
      exactKeys(transfer, ["kind", "destination"], "source.role.transfer");
      active = verifyOwner(transfer.destination, "source.role.transfer.destination");
      copiedInput = true;
      if (active.relationship !== "owned" ||
          active.ownerId === sourceOwner.ownerId ||
          active.storageId === sourceOwner.storageId) {
        throw new TypeError("packed container copy-in destination is not private");
      }
    } else {
      throw new TypeError("packed container input transfer is unsupported");
    }
    publicResult = null;
  } else if (role.kind === "transactional-output") {
    input = false;
    exactKeys(role, ["kind", "transfer"], "source.role");
    if (sourceOwner.relationship !== "owned" || source.byteOffset !== 0) {
      throw new TypeError("packed container transactional owner is not private");
    }
    active = sourceOwner;
    const transfer = record(role.transfer, "source.role.transfer");
    if (transfer.kind === "owner-transfer") {
      exactKeys(transfer, ["kind"], "source.role.transfer");
      publicResult = active;
    } else if (transfer.kind === "copy-out") {
      exactKeys(transfer, ["kind", "destination"], "source.role.transfer");
      publicResult = verifyOwner(
        transfer.destination, "source.role.transfer.destination",
      );
      copiedOutput = true;
      if (publicResult.relationship !== "owned" ||
          publicResult.ownerId === active.ownerId ||
          publicResult.storageId === active.storageId) {
        throw new TypeError("packed container copy-out destination is not distinct");
      }
    } else {
      throw new TypeError("packed container output publication is unsupported");
    }
  } else {
    throw new TypeError("packed container role is unsupported");
  }
  if (!Array.isArray(source.peers)) {
    throw new TypeError("packed container peer set is not an array");
  }
  const peerIds = new Set<string>();
  const relations: PackedAliasRelation[] = [];
  for (const [index, peerValue] of source.peers.entries()) {
    const peer = exactKeys(peerValue, [
      "containerId", "storageId", "byteOffset", "byteLength", "access",
    ], `source.peers[${index}]`);
    nonempty(peer.containerId, `source.peers[${index}].containerId`);
    nonempty(peer.storageId, `source.peers[${index}].storageId`);
    safeInteger(peer.byteOffset, `source.peers[${index}].byteOffset`);
    safeInteger(peer.byteLength, `source.peers[${index}].byteLength`);
    if (peer.access !== "read" && peer.access !== "write") {
      throw new TypeError(`packed container source.peers[${index}] access is invalid`);
    }
    if (peer.containerId === source.containerId || peerIds.has(peer.containerId) ||
        !Number.isSafeInteger(peer.byteOffset + peer.byteLength)) {
      throw new TypeError("packed container peer identity or byte range is invalid");
    }
    peerIds.add(peer.containerId);
    const sourceOverlap = peer.storageId === sourceOwner.storageId && overlaps(
      source.byteOffset, maximumBytes, peer.byteOffset, peer.byteLength,
    );
    const activeOffset = copiedInput ? 0 : source.byteOffset;
    const activeOverlap = peer.storageId === active.storageId && overlaps(
      activeOffset, maximumBytes, peer.byteOffset, peer.byteLength,
    );
    if (input && sourceOverlap && peer.access === "write") {
      throw new TypeError("packed container immutable source has a visible write alias");
    }
    if (!input && peer.storageId === active.storageId) {
      throw new TypeError("packed container transaction storage is not private");
    }
    relations.push({
      containerId: peer.containerId,
      access: peer.access,
      sourceOverlap,
      activeOverlap,
    });
  }
  if (copiedInput && (active.storageId === sourceOwner.storageId ||
      source.peers.some((peer) => peer.storageId === active.storageId))) {
    throw new TypeError("packed container copy-in storage is not private");
  }
  const effects = exactKeys(
    source.effects,
    ["guardsBeforeEffects", "noCallback", "noEscape"],
    "source.effects",
  );
  if (effects.guardsBeforeEffects !== true || effects.noCallback !== true ||
      effects.noEscape !== true) {
    throw new TypeError("packed container effect proof is incomplete");
  }
  const evidence = exactKeys(source.evidence, EVIDENCE_KINDS, "source.evidence");
  for (const kind of EVIDENCE_KINDS) {
    const item = exactKeys(
      evidence[kind], ["authority", "evidence"], `source.evidence.${kind}`,
    );
    if (!["static", "runtime-guard", "contract"].includes(item.authority)) {
      throw new TypeError(`packed container source.evidence.${kind} authority is invalid`);
    }
    nonempty(item.evidence, `source.evidence.${kind}.evidence`);
  }
  const provenance = (kind: PackedEvidenceKind) => ({
    ...source.evidence[kind],
    analysisRevision: source.analysisRevision,
    invalidatedBy: [...INVALIDATIONS[kind]],
  });
  const readOnlyAliases = relations
    .filter((relation) => relation.sourceOverlap && relation.access === "read")
    .map((relation) => relation.containerId)
    .sort();
  const cleanupOwners: PackedOwnerCleanup[] = [];
  if (input) {
    cleanupOwners.push({
      ownerId: sourceOwner.ownerId,
      onFailure: "retain",
      onSuccess: "retain",
    });
    if (copiedInput) {
      const action = discard(active);
      cleanupOwners.push({ ownerId: active.ownerId, onFailure: action, onSuccess: action });
    }
  } else if (!copiedOutput) {
    cleanupOwners.push({
      ownerId: active.ownerId,
      onFailure: discard(active),
      onSuccess: "transfer",
    });
  } else {
    const activeAction = discard(active);
    cleanupOwners.push({
      ownerId: active.ownerId,
      onFailure: activeAction,
      onSuccess: activeAction,
    });
    cleanupOwners.push({
      ownerId: publicResult!.ownerId,
      onFailure: discard(publicResult!),
      onSuccess: "transfer",
    });
  }
  const resourceOwners = new Map<string, PackedResourceOwnerFact>();
  const addResource = (
    owner: PackedStorageOwner,
    ownerRole: PackedResourceOwnerFact["roles"][number],
  ): void => {
    const found = resourceOwners.get(owner.ownerId);
    if (found) {
      if (!found.roles.includes(ownerRole)) found.roles.push(ownerRole);
      return;
    }
    resourceOwners.set(owner.ownerId, {
      ownerId: owner.ownerId,
      roles: [ownerRole],
      storageKind: owner.storageKind,
      allocationDomain: owner.allocationDomain,
      generation: owner.generation,
      openGuard: owner.closedState === "guarded-open",
      generationGuard: owner.storageKind !== "host-buffer",
    });
  };
  if (input) addResource(sourceOwner, "source");
  if (copiedInput || !input) addResource(active, "active-private");
  if (publicResult) addResource(publicResult, "public-result");
  const resourceOwnerValues = [...resourceOwners.values()];
  const expectedFacts: PackedContainerFacts = {
    shape: {
      kind: "PackedLengthAndShape",
      value: {
        shape: source.shape,
        logicalElementCount: {
          formula,
          exact: exactElements,
          maximum: maximumElements,
        },
        maximumByteLength: maximumBytes,
      },
      provenance: provenance("shape"),
    },
    element: {
      kind: "PackedElementShape",
      value: {
        ...source.element,
        scalarBytes: scalarWidth,
        elementBytes: elementWidth,
        alignmentBytes: scalarWidth,
      },
      provenance: provenance("element"),
    },
    owner: {
      kind: "PackedOwnerBinding",
      value: {
        source: sourceOwner,
        active,
        publicResult,
        sourceByteOffset: source.byteOffset,
        activeByteOffset: copiedInput ? 0 : source.byteOffset,
        activeOwnership: copiedInput || !input ? "private-owned" : "borrowed",
        rootRetainedDuringUse: true,
      },
      provenance: provenance("owner"),
    },
    alias: {
      kind: "PackedAliasPolicy",
      value: {
        relations,
        mode: !input
          ? "private-transaction"
          : readOnlyAliases.length === 0 ? "disjoint" : "read-only-sharing",
        writeAliases: [],
        readOnlyAliases,
        activeStoragePrivate: copiedInput || !input,
      },
      provenance: provenance("alias"),
    },
    mutation: {
      kind: "PackedMutationPolicy",
      value: {
        policy: input ? "immutable" : "transactional",
        optimizedWrites: input ? "none" : "private-active-owner",
        rollback: input ? "not-applicable" : "discard-private-owner",
        visibleWritesBeforeCommit: false,
        callbacks: "forbidden",
        escape: "forbidden",
      },
      provenance: provenance("mutation"),
    },
    publication: {
      kind: "PackedPublicationPolicy",
      value: {
        policy: input
          ? "none"
          : copiedOutput ? "sealed-deep-copy" : "sealed-owner-transfer",
        resultOwnerId: publicResult?.ownerId ?? null,
        publicMutability: "immutable",
        exposesMutableArray: false,
        exposesRawStorage: false,
        afterAllGuards: true,
        afterComputation: true,
      },
      provenance: provenance("publication"),
    },
    cleanup: {
      kind: "PackedCleanupPolicy",
      value: {
        owners: cleanupOwners,
        allExitsCovered: true,
        closeIsIdempotent: true,
        finalizerFallbackOwnerIds: publicResult &&
            publicResult.storageKind !== "host-buffer"
          ? [publicResult.ownerId]
          : [],
      },
      provenance: provenance("cleanup"),
    },
    copy: {
      kind: "PackedCopyCost",
      value: {
        entryCopies: copiedInput ? 1 : 0,
        exitCopies: copiedOutput ? 1 : 0,
        maximumEntryBytes: copiedInput ? maximumBytes : 0,
        maximumExitBytes: copiedOutput ? maximumBytes : 0,
        maximumTotalCopiedBytes:
          (copiedInput ? maximumBytes : 0) + (copiedOutput ? maximumBytes : 0),
        byteFormula: "maximum-elements*element-bytes",
      },
      provenance: provenance("copy"),
    },
    resource: {
      kind: "PackedResourceContract",
      value: {
        owners: resourceOwnerValues,
        retainedRootOwnerIds: [...new Set(resourceOwnerValues.map((ownerFact) => {
          const matching = [sourceOwner, active, publicResult]
            .find((owner) => owner?.ownerId === ownerFact.ownerId);
          return matching?.rootOwnerId ?? ownerFact.ownerId;
        }))].sort(),
        allocatorDomainCrossing:
          new Set(resourceOwnerValues.map((owner) => owner.allocationDomain)).size > 1,
        rawAddressExposure: "none",
      },
      provenance: provenance("resource"),
    },
  };
  exactKeys(plan.facts, [
    "shape", "element", "owner", "alias", "mutation", "publication", "cleanup",
    "copy", "resource",
  ], "facts");
  equalData(plan.facts, expectedFacts, "facts");
  const expectedGuards: PackedContainerGuard[] = [];
  const addGuard = (
    code: PackedContainerGuard["code"],
    evidenceKind: PackedEvidenceKind,
  ): void => {
    if (!expectedGuards.some((guard) => guard.code === code)) {
      expectedGuards.push({ code, evidenceKind, beforeEffects: true });
    }
  };
  addGuard(PACKED_CONTAINER_GUARD_CODES.owner, "owner");
  addGuard(PACKED_CONTAINER_GUARD_CODES.element, "element");
  if (shape.kind === "sequence" && shape.length.kind === "guarded" ||
      shape.kind === "matrix" &&
      (shape.rows.kind === "guarded" || shape.columns.kind === "guarded")) {
    addGuard(PACKED_CONTAINER_GUARD_CODES.shape, "shape");
  }
  if (source.peers.length !== 0) addGuard(PACKED_CONTAINER_GUARD_CODES.alias, "alias");
  if (copiedInput || !input) {
    addGuard(PACKED_CONTAINER_GUARD_CODES.privateStorage, "alias");
  }
  if (resourceOwnerValues.some((owner) => owner.openGuard)) {
    addGuard(PACKED_CONTAINER_GUARD_CODES.resourceOpen, "resource");
  }
  if (resourceOwnerValues.some((owner) => owner.generationGuard)) {
    addGuard(PACKED_CONTAINER_GUARD_CODES.resourceGeneration, "resource");
  }
  if (!Array.isArray(plan.guards)) {
    throw new TypeError("packed container guards must be an array");
  }
  equalData(plan.guards, expectedGuards, "guards");
  equalData(plan.fallback, {
    id: source.fallbackId,
    policy: "same-source",
    restart: "original-inputs",
    beforeVisibleEffect: true,
  }, "fallback");
  const {
    fingerprint: _fingerprint,
    ...core
  } = plan;
  if (plan.fingerprint !== semanticFingerprint(core)) {
    throw new TypeError("packed container fingerprint does not match its plan");
  }
}

export function serializePackedMachineContainerPlan(
  plan: PackedMachineContainerPlan,
): string {
  verifyPackedMachineContainerPlan(plan);
  return JSON.stringify(plan);
}

/** Parse, independently verify, and freeze a plan in another compiler process. */
export function replayPackedMachineContainerPlan(
  serialized: string,
): PackedMachineContainerPlan {
  if (typeof serialized !== "string" || serialized.length === 0) {
    throw new TypeError("packed container replay requires serialized plan text");
  }
  const parsed: unknown = JSON.parse(serialized);
  verifyPackedMachineContainerPlan(parsed);
  return freezePackedContainerPlan(parsed);
}
