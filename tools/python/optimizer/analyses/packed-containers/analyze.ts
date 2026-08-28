import { semanticFingerprint } from "../../identity";
import {
  PACKED_CONTAINER_CANDIDATE_SCHEMA,
  PackedContainerCandidate,
  PackedContainerShape,
  PackedEvidenceKind,
  PackedExtent,
  PackedPeerRegion,
  PackedStorageOwner,
} from "./contracts";
import {
  freezePackedContainerPlan,
  PACKED_CONTAINER_ANALYSIS_ID,
  PACKED_CONTAINER_GUARD_CODES,
  PACKED_CONTAINER_PLAN_SCHEMA,
  PACKED_CONTAINER_REPRESENTATION_ID,
  PACKED_CONTAINER_VERIFIER_ID,
  packedScalarBytes,
  PackedAliasRelation,
  PackedContainerAnalysisResult,
  PackedContainerFacts,
  PackedContainerGuard,
  PackedContainerRejectionCode,
  PackedMachineContainerPlan,
  PackedOwnerCleanup,
  PackedResourceOwnerFact,
} from "../../representations/packed-machine-container";

const EVIDENCE_KINDS: readonly PackedEvidenceKind[] = Object.freeze([
  "shape", "element", "owner", "alias", "mutation", "publication",
  "cleanup", "copy", "resource",
]);

const INVALIDATIONS: Readonly<Record<PackedEvidenceKind, readonly string[]>> =
  Object.freeze({
    shape: Object.freeze(["shape-change", "owner-rebind"]),
    element: Object.freeze(["element-representation-change", "owner-rebind"]),
    owner: Object.freeze(["owner-rebind", "owner-close", "resource-generation-change"]),
    alias: Object.freeze(["owner-rebind", "peer-access-change", "storage-publication"]),
    mutation: Object.freeze(["mutation-policy-change", "callback-introduction"]),
    publication: Object.freeze(["escape", "publication-policy-change"]),
    cleanup: Object.freeze(["ownership-transfer", "resource-close"]),
    copy: Object.freeze(["shape-change", "transfer-policy-change"]),
    resource: Object.freeze([
      "owner-close", "resource-generation-change", "allocator-domain-change",
    ]),
  });

class PackedContainerAnalysisFailure extends Error {
  constructor(
    readonly code: PackedContainerRejectionCode,
    message: string,
  ) {
    super(message);
  }
}

function fail(code: PackedContainerRejectionCode, message: string): never {
  throw new PackedContainerAnalysisFailure(code, message);
}

function requireDetachedData(value: unknown): void {
  const seen = new WeakSet<object>();
  const visit = (item: unknown, field: string): void => {
    if (item === null || typeof item === "string" || typeof item === "boolean" ||
        (typeof item === "number" && Number.isFinite(item))) return;
    if (!item || typeof item !== "object") {
      fail(
        "packed-container.candidate-not-detached-data",
        `${field} is not JSON-safe detached data`,
      );
    }
    if (seen.has(item)) {
      fail("packed-container.candidate-not-detached-data", `${field} contains a cycle`);
    }
    seen.add(item);
    if (Array.isArray(item)) {
      for (let index = 0; index < item.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(item, index)) {
          fail(
            "packed-container.candidate-not-detached-data",
            `${field} contains a sparse array`,
          );
        }
        visit(item[index], `${field}[${index}]`);
      }
      seen.delete(item);
      return;
    }
    const prototype = Object.getPrototypeOf(item);
    if (prototype !== Object.prototype && prototype !== null) {
      fail(
        "packed-container.candidate-not-detached-data",
        `${field} has a non-plain prototype`,
      );
    }
    if (Object.getOwnPropertySymbols(item).length !== 0) {
      fail(
        "packed-container.candidate-not-detached-data",
        `${field} has symbol properties`,
      );
    }
    for (const [key, descriptor] of Object.entries(
      Object.getOwnPropertyDescriptors(item),
    )) {
      if (!("value" in descriptor)) {
        fail(
          "packed-container.candidate-not-detached-data",
          `${field}.${key} is an accessor`,
        );
      }
      visit(descriptor.value, `${field}.${key}`);
    }
    seen.delete(item);
  };
  visit(value, "candidate");
}

function record(value: unknown, field: string): Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("packed-container.invalid-candidate", `${field} must be an object`);
  }
  return value as Record<string, any>;
}

function requireKeys(
  value: unknown,
  keys: readonly string[],
  field: string,
): Record<string, any> {
  const answer = record(value, field);
  const actual = Object.keys(answer).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length ||
      actual.some((key, index) => key !== expected[index])) {
    fail(
      "packed-container.invalid-candidate",
      `${field} must contain exactly ${expected.join(", ")}`,
    );
  }
  return answer;
}

function requireString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) {
    fail("packed-container.invalid-candidate", `${field} must be a nonempty string`);
  }
}

function requireSafeInteger(value: unknown, field: string, minimum = 0): void {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    fail(
      "packed-container.invalid-candidate",
      `${field} must be a safe integer at least ${minimum}`,
    );
  }
}

function verifyExtent(value: unknown, field: string): PackedExtent {
  const extent = record(value, field);
  if (extent.kind === "constant") {
    requireKeys(extent, ["kind", "value"], field);
    requireSafeInteger(extent.value, `${field}.value`);
    return extent as PackedExtent;
  }
  if (extent.kind === "guarded") {
    requireKeys(extent, ["kind", "symbol", "minimum", "maximum"], field);
    requireString(extent.symbol, `${field}.symbol`);
    requireSafeInteger(extent.minimum, `${field}.minimum`);
    requireSafeInteger(extent.maximum, `${field}.maximum`);
    if (extent.minimum > extent.maximum) {
      fail("packed-container.unsafe-shape", `${field} has reversed bounds`);
    }
    return extent as PackedExtent;
  }
  fail("packed-container.unsafe-shape", `${field} has an unsupported extent`);
}

function extentMaximum(extent: PackedExtent): number {
  return extent.kind === "constant" ? extent.value : extent.maximum;
}

function extentExact(extent: PackedExtent): number | null {
  return extent.kind === "constant" ? extent.value : null;
}

function safeProduct(left: number, right: number, field: string): number {
  const result = left * right;
  if (!Number.isSafeInteger(result)) {
    fail("packed-container.unsafe-shape", `${field} exceeds exact size arithmetic`);
  }
  return result;
}

function verifyShape(value: unknown): PackedContainerShape {
  const shape = record(value, "shape");
  if (shape.kind === "sequence") {
    requireKeys(shape, ["kind", "length", "layout"], "shape");
    if (shape.layout !== "contiguous") {
      fail("packed-container.unsafe-shape", "packed sequences must be contiguous");
    }
    verifyExtent(shape.length, "shape.length");
    return shape as PackedContainerShape;
  }
  if (shape.kind === "matrix") {
    requireKeys(shape, ["kind", "rows", "columns", "layout"], "shape");
    if (shape.layout !== "row-major" && shape.layout !== "column-major") {
      fail("packed-container.unsafe-shape", "packed matrix layout is unsupported");
    }
    verifyExtent(shape.rows, "shape.rows");
    verifyExtent(shape.columns, "shape.columns");
    return shape as PackedContainerShape;
  }
  fail("packed-container.unsafe-shape", "container shape must be sequence or matrix");
}

function verifyOwner(value: unknown, field: string): PackedStorageOwner {
  const owner = requireKeys(value, [
    "ownerId", "rootOwnerId", "storageId", "allocationDomain", "relationship",
    "immediateOwnerId", "storageKind", "generation", "closedState",
  ], field);
  for (const key of ["ownerId", "rootOwnerId", "storageId", "allocationDomain"]) {
    requireString(owner[key], `${field}.${key}`);
  }
  if (owner.relationship !== "owned" && owner.relationship !== "borrowed") {
    fail("packed-container.invalid-owner", `${field}.relationship is unsupported`);
  }
  if (owner.relationship === "owned") {
    if (owner.immediateOwnerId !== null || owner.rootOwnerId !== owner.ownerId) {
      fail(
        "packed-container.invalid-owner",
        `${field} owned storage must be its own root without an immediate owner`,
      );
    }
  } else {
    requireString(owner.immediateOwnerId, `${field}.immediateOwnerId`);
    if (owner.rootOwnerId === owner.ownerId) {
      fail("packed-container.invalid-owner", `${field} borrowed view must name its root`);
    }
  }
  if (!["host-buffer", "wasm-memory", "native-resource"].includes(owner.storageKind)) {
    fail("packed-container.invalid-resource", `${field}.storageKind is unsupported`);
  }
  if (owner.storageKind === "host-buffer") {
    if (owner.generation !== null || owner.closedState !== "always-open") {
      fail(
        "packed-container.invalid-resource",
        `${field} host buffers cannot carry close or generation state`,
      );
    }
  } else {
    requireSafeInteger(owner.generation, `${field}.generation`);
    if (owner.closedState !== "guarded-open") {
      fail(
        "packed-container.invalid-resource",
        `${field} foreign storage must carry an open-state guard`,
      );
    }
  }
  return owner as PackedStorageOwner;
}

function verifyCandidate(candidate: PackedContainerCandidate): void {
  requireDetachedData(candidate);
  requireKeys(candidate, [
    "schema", "analysisRevision", "containerId", "fallbackId", "source", "shape",
    "element", "owner", "byteOffset", "role", "peers", "effects", "evidence",
  ], "candidate");
  if (candidate.schema !== PACKED_CONTAINER_CANDIDATE_SCHEMA) {
    fail("packed-container.invalid-candidate", "candidate schema is unsupported");
  }
  requireSafeInteger(candidate.analysisRevision, "analysisRevision", 1);
  requireString(candidate.containerId, "containerId");
  requireString(candidate.fallbackId, "fallbackId");
  if (candidate.containerId === candidate.fallbackId) {
    fail("packed-container.invalid-candidate", "fallback cannot name the container plan");
  }
  const source = requireKeys(candidate.source, [
    "filename", "line", "column", "endLine", "endColumn",
  ], "source");
  requireString(source.filename, "source.filename");
  for (const key of ["line", "column", "endLine", "endColumn"]) {
    requireSafeInteger(source[key], `source.${key}`);
  }
  if (source.endLine < source.line ||
      (source.endLine === source.line && source.endColumn < source.column)) {
    fail("packed-container.invalid-candidate", "source range is reversed");
  }
  const shape = verifyShape(candidate.shape);
  const element = requireKeys(
    candidate.element,
    ["scalar", "lanes", "byteOrder", "canonical"],
    "element",
  );
  if (!["uint8", "int8", "uint16", "int16", "uint32", "int32", "uint64",
    "int64", "binary64"].includes(element.scalar)) {
    fail("packed-container.unsupported-element", "element scalar is unsupported");
  }
  requireSafeInteger(element.lanes, "element.lanes", 1);
  if (element.lanes > 16 || element.byteOrder !== "native" ||
      element.canonical !== true) {
    fail(
      "packed-container.unsupported-element",
      "elements require one to sixteen canonical native-order lanes",
    );
  }
  const scalarBytes = packedScalarBytes(element.scalar);
  const elementBytes = safeProduct(scalarBytes, element.lanes, "element byte width");
  const maximumElements = shape.kind === "sequence"
    ? extentMaximum(shape.length)
    : safeProduct(
      extentMaximum(shape.rows), extentMaximum(shape.columns), "matrix element count",
    );
  const maximumBytes = safeProduct(maximumElements, elementBytes, "container byte length");
  requireSafeInteger(candidate.byteOffset, "byteOffset");
  if (candidate.byteOffset % scalarBytes !== 0 ||
      !Number.isSafeInteger(candidate.byteOffset + maximumBytes)) {
    fail(
      "packed-container.unsafe-shape",
      "container byte range is misaligned or exceeds exact address arithmetic",
    );
  }
  const owner = verifyOwner(candidate.owner, "owner");
  const role = record(candidate.role, "role");
  if (role.kind === "immutable-input") {
    requireKeys(role, ["kind", "transfer"], "role");
    const transfer = record(role.transfer, "role.transfer");
    if (transfer.kind === "borrow") {
      requireKeys(transfer, ["kind"], "role.transfer");
    } else if (transfer.kind === "copy-in") {
      requireKeys(transfer, ["kind", "destination"], "role.transfer");
      const destination = verifyOwner(transfer.destination, "role.transfer.destination");
      if (destination.relationship !== "owned" ||
          destination.ownerId === owner.ownerId ||
          destination.storageId === owner.storageId) {
        fail(
          "packed-container.private-storage-not-distinct",
          "copy-in storage must have a distinct owned destination",
        );
      }
    } else {
      fail("packed-container.unsupported-publication", "input transfer is unsupported");
    }
  } else if (role.kind === "transactional-output") {
    requireKeys(role, ["kind", "transfer"], "role");
    if (owner.relationship !== "owned" || candidate.byteOffset !== 0) {
      fail(
        "packed-container.transaction-not-private",
        "transactional output must start at a private owned allocation",
      );
    }
    const transfer = record(role.transfer, "role.transfer");
    if (transfer.kind === "owner-transfer") {
      requireKeys(transfer, ["kind"], "role.transfer");
    } else if (transfer.kind === "copy-out") {
      requireKeys(transfer, ["kind", "destination"], "role.transfer");
      const destination = verifyOwner(transfer.destination, "role.transfer.destination");
      if (destination.relationship !== "owned" ||
          destination.ownerId === owner.ownerId ||
          destination.storageId === owner.storageId) {
        fail(
          "packed-container.private-storage-not-distinct",
          "copy-out destination must have distinct owned storage",
        );
      }
    } else {
      fail(
        "packed-container.unsupported-publication",
        "transactional output must publish a sealed transfer or deep copy",
      );
    }
  } else {
    fail(
      "packed-container.unsupported-publication",
      "container role must be immutable input or transactional output",
    );
  }
  if (!Array.isArray(candidate.peers)) {
    fail("packed-container.invalid-candidate", "peers must be an array");
  }
  const peerIds = new Set<string>();
  for (const [index, peerValue] of candidate.peers.entries()) {
    const peer = requireKeys(peerValue, [
      "containerId", "storageId", "byteOffset", "byteLength", "access",
    ], `peers[${index}]`);
    requireString(peer.containerId, `peers[${index}].containerId`);
    requireString(peer.storageId, `peers[${index}].storageId`);
    requireSafeInteger(peer.byteOffset, `peers[${index}].byteOffset`);
    requireSafeInteger(peer.byteLength, `peers[${index}].byteLength`);
    if (peer.access !== "read" && peer.access !== "write") {
      fail("packed-container.invalid-candidate", `peers[${index}].access is invalid`);
    }
    if (peer.containerId === candidate.containerId || peerIds.has(peer.containerId)) {
      fail("packed-container.invalid-candidate", "peer container identities must be unique");
    }
    peerIds.add(peer.containerId);
    if (!Number.isSafeInteger(peer.byteOffset + peer.byteLength)) {
      fail("packed-container.unsafe-shape", `peers[${index}] byte range is unsafe`);
    }
  }
  const effects = requireKeys(
    candidate.effects,
    ["guardsBeforeEffects", "noCallback", "noEscape"],
    "effects",
  );
  if (effects.guardsBeforeEffects !== true || effects.noCallback !== true ||
      effects.noEscape !== true) {
    fail(
      "packed-container.effect-or-escape-unknown",
      "packed facts require pre-effect guards, no callbacks, and no escape",
    );
  }
  const evidence = requireKeys(candidate.evidence, EVIDENCE_KINDS, "evidence");
  for (const kind of EVIDENCE_KINDS) {
    const item = requireKeys(evidence[kind], ["authority", "evidence"], `evidence.${kind}`);
    if (!["static", "runtime-guard", "contract"].includes(item.authority)) {
      fail("packed-container.invalid-candidate", `evidence.${kind}.authority is invalid`);
    }
    requireString(item.evidence, `evidence.${kind}.evidence`);
  }
}

function rangesOverlap(
  leftOffset: number,
  leftLength: number,
  rightOffset: number,
  rightLength: number,
): boolean {
  return leftLength !== 0 && rightLength !== 0 &&
    leftOffset < rightOffset + rightLength &&
    rightOffset < leftOffset + leftLength;
}

function cleanupAction(owner: PackedStorageOwner): "drop" | "close" {
  return owner.storageKind === "host-buffer" ? "drop" : "close";
}

function cloneCandidate(candidate: PackedContainerCandidate): PackedContainerCandidate {
  return JSON.parse(JSON.stringify(candidate)) as PackedContainerCandidate;
}

function buildPlan(candidateInput: PackedContainerCandidate): PackedMachineContainerPlan {
  verifyCandidate(candidateInput);
  const candidate = cloneCandidate(candidateInput);
  const shape = candidate.shape;
  const maximumElements = shape.kind === "sequence"
    ? extentMaximum(shape.length)
    : safeProduct(
      extentMaximum(shape.rows), extentMaximum(shape.columns), "matrix element count",
    );
  const exactElements = shape.kind === "sequence"
    ? extentExact(shape.length)
    : extentExact(shape.rows) === null || extentExact(shape.columns) === null
      ? null
      : safeProduct(
        extentExact(shape.rows)!, extentExact(shape.columns)!, "matrix exact element count",
      );
  const scalarBytes = packedScalarBytes(candidate.element.scalar);
  const elementBytes = safeProduct(
    scalarBytes, candidate.element.lanes, "element byte width",
  );
  const maximumByteLength = safeProduct(
    maximumElements, elementBytes, "container byte length",
  );
  const input = candidate.role.kind === "immutable-input";
  let copiedInput = false;
  let copiedOutput = false;
  let active = candidate.owner;
  let publicResult: PackedStorageOwner | null = null;
  if (candidate.role.kind === "immutable-input" &&
      candidate.role.transfer.kind === "copy-in") {
    copiedInput = true;
    active = candidate.role.transfer.destination;
  } else if (candidate.role.kind === "transactional-output") {
    publicResult = active;
    if (candidate.role.transfer.kind === "copy-out") {
      copiedOutput = true;
      publicResult = candidate.role.transfer.destination;
    }
  }
  const activeByteOffset = copiedInput ? 0 : candidate.byteOffset;
  if (copiedInput) {
    const peerStorage = new Set(candidate.peers.map((peer) => peer.storageId));
    if (peerStorage.has(active.storageId)) {
      fail(
        "packed-container.private-storage-not-distinct",
        "copy-in active storage aliases a live peer",
      );
    }
  }
  if (!input && candidate.peers.some((peer) => peer.storageId === active.storageId)) {
    fail(
      "packed-container.transaction-not-private",
      "transactional output storage is visible to a live peer",
    );
  }
  const relations: PackedAliasRelation[] = candidate.peers.map((peer) => {
    const sourceOverlap = peer.storageId === candidate.owner.storageId && rangesOverlap(
      candidate.byteOffset, maximumByteLength, peer.byteOffset, peer.byteLength,
    );
    const activeOverlap = peer.storageId === active.storageId && rangesOverlap(
      activeByteOffset, maximumByteLength, peer.byteOffset, peer.byteLength,
    );
    if (input && sourceOverlap && peer.access === "write") {
      fail(
        "packed-container.alias-write-visible",
        `immutable input overlaps writable peer ${peer.containerId}`,
      );
    }
    return {
      containerId: peer.containerId,
      access: peer.access,
      sourceOverlap,
      activeOverlap,
    };
  });
  const readOnlyAliases = relations
    .filter((relation) => relation.sourceOverlap && relation.access === "read")
    .map((relation) => relation.containerId)
    .sort();
  const provenance = (kind: PackedEvidenceKind) => ({
    ...candidate.evidence[kind],
    analysisRevision: candidate.analysisRevision,
    invalidatedBy: [...INVALIDATIONS[kind]],
  });
  const copy = {
    entryCopies: (copiedInput ? 1 : 0) as 0 | 1,
    exitCopies: (copiedOutput ? 1 : 0) as 0 | 1,
    maximumEntryBytes: copiedInput ? maximumByteLength : 0,
    maximumExitBytes: copiedOutput ? maximumByteLength : 0,
    maximumTotalCopiedBytes:
      (copiedInput ? maximumByteLength : 0) +
      (copiedOutput ? maximumByteLength : 0),
    byteFormula: "maximum-elements*element-bytes" as const,
  };
  const cleanupOwners: PackedOwnerCleanup[] = [];
  if (input) {
    cleanupOwners.push({
      ownerId: candidate.owner.ownerId,
      onFailure: "retain",
      onSuccess: "retain",
    });
    if (copiedInput) {
      const action = cleanupAction(active);
      cleanupOwners.push({ ownerId: active.ownerId, onFailure: action, onSuccess: action });
    }
  } else if (!copiedOutput) {
    cleanupOwners.push({
      ownerId: active.ownerId,
      onFailure: cleanupAction(active),
      onSuccess: "transfer",
    });
  } else {
    const destination = publicResult!;
    const activeAction = cleanupAction(active);
    cleanupOwners.push({
      ownerId: active.ownerId,
      onFailure: activeAction,
      onSuccess: activeAction,
    });
    cleanupOwners.push({
      ownerId: destination.ownerId,
      onFailure: cleanupAction(destination),
      onSuccess: "transfer",
    });
  }
  const resourceOwners = new Map<string, PackedResourceOwnerFact>();
  const addResourceOwner = (
    owner: PackedStorageOwner,
    role: PackedResourceOwnerFact["roles"][number],
  ): void => {
    const found = resourceOwners.get(owner.ownerId);
    if (found) {
      if (!found.roles.includes(role)) found.roles.push(role);
      return;
    }
    resourceOwners.set(owner.ownerId, {
      ownerId: owner.ownerId,
      roles: [role],
      storageKind: owner.storageKind,
      allocationDomain: owner.allocationDomain,
      generation: owner.generation,
      openGuard: owner.closedState === "guarded-open",
      generationGuard: owner.storageKind !== "host-buffer",
    });
  };
  if (input) addResourceOwner(candidate.owner, "source");
  if (copiedInput || !input) addResourceOwner(active, "active-private");
  if (publicResult) addResourceOwner(publicResult, "public-result");
  const resourceOwnerValues = [...resourceOwners.values()];
  const facts: PackedContainerFacts = {
    shape: {
      kind: "PackedLengthAndShape",
      value: {
        shape,
        logicalElementCount: {
          formula: shape.kind === "sequence" ? "length" : "rows*columns",
          exact: exactElements,
          maximum: maximumElements,
        },
        maximumByteLength,
      },
      provenance: provenance("shape"),
    },
    element: {
      kind: "PackedElementShape",
      value: {
        ...candidate.element,
        scalarBytes,
        elementBytes,
        alignmentBytes: scalarBytes,
      },
      provenance: provenance("element"),
    },
    owner: {
      kind: "PackedOwnerBinding",
      value: {
        source: candidate.owner,
        active,
        publicResult,
        sourceByteOffset: candidate.byteOffset,
        activeByteOffset,
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
      value: copy,
      provenance: provenance("copy"),
    },
    resource: {
      kind: "PackedResourceContract",
      value: {
        owners: resourceOwnerValues,
        retainedRootOwnerIds: [...new Set(resourceOwnerValues.map((ownerFact) => {
          const matching = [candidate.owner, active, publicResult]
            .find((owner) => owner?.ownerId === ownerFact.ownerId);
          return matching?.rootOwnerId ?? ownerFact.ownerId;
        }))].sort(),
        allocatorDomainCrossing:
          new Set(resourceOwnerValues.map((ownerFact) => ownerFact.allocationDomain)).size > 1,
        rawAddressExposure: "none",
      },
      provenance: provenance("resource"),
    },
  };
  const guards: PackedContainerGuard[] = [];
  const addGuard = (
    code: PackedContainerGuard["code"],
    evidenceKind: PackedEvidenceKind,
  ): void => {
    if (!guards.some((guard) => guard.code === code)) {
      guards.push({ code, evidenceKind, beforeEffects: true });
    }
  };
  addGuard(PACKED_CONTAINER_GUARD_CODES.owner, "owner");
  addGuard(PACKED_CONTAINER_GUARD_CODES.element, "element");
  if (shape.kind === "sequence" && shape.length.kind === "guarded" ||
      shape.kind === "matrix" &&
      (shape.rows.kind === "guarded" || shape.columns.kind === "guarded")) {
    addGuard(PACKED_CONTAINER_GUARD_CODES.shape, "shape");
  }
  if (candidate.peers.length !== 0) addGuard(PACKED_CONTAINER_GUARD_CODES.alias, "alias");
  if (copiedInput || !input) {
    addGuard(PACKED_CONTAINER_GUARD_CODES.privateStorage, "alias");
  }
  if (resourceOwnerValues.some((ownerFact) => ownerFact.openGuard)) {
    addGuard(PACKED_CONTAINER_GUARD_CODES.resourceOpen, "resource");
  }
  if (resourceOwnerValues.some((ownerFact) => ownerFact.generationGuard)) {
    addGuard(PACKED_CONTAINER_GUARD_CODES.resourceGeneration, "resource");
  }
  const core = {
    schema: PACKED_CONTAINER_PLAN_SCHEMA,
    analysisId: PACKED_CONTAINER_ANALYSIS_ID,
    representationId: PACKED_CONTAINER_REPRESENTATION_ID,
    verifierId: PACKED_CONTAINER_VERIFIER_ID,
    containerId: candidate.containerId,
    analysisRevision: candidate.analysisRevision,
    source: candidate,
    guards,
    facts,
    fallback: {
      id: candidate.fallbackId,
      policy: "same-source" as const,
      restart: "original-inputs" as const,
      beforeVisibleEffect: true as const,
    },
  };
  const plan: PackedMachineContainerPlan = {
    ...core,
    fingerprint: semanticFingerprint(core),
  };
  return freezePackedContainerPlan(plan);
}

/** Analyze source evidence without ever retaining its mutable host object. */
export function analyzePackedContainer(
  candidate: PackedContainerCandidate,
): PackedContainerAnalysisResult {
  try {
    return { accepted: true, plan: buildPlan(candidate) };
  } catch (error) {
    if (error instanceof PackedContainerAnalysisFailure) {
      return { accepted: false, rejections: [{ code: error.code, detail: error.message }] };
    }
    return {
      accepted: false,
      rejections: [{
        code: "packed-container.invalid-candidate",
        detail: error instanceof Error ? error.message : String(error),
      }],
    };
  }
}

export function requirePackedContainerPlan(
  candidate: PackedContainerCandidate,
): PackedMachineContainerPlan {
  const result = analyzePackedContainer(candidate);
  if ("rejections" in result) {
    const reasons = result.rejections
      .map((rejection) => `${rejection.code}: ${rejection.detail}`).join("; ");
    throw new TypeError(`packed container analysis rejected: ${reasons}`);
  }
  return result.plan;
}

export function packedContainerMaximumByteLength(
  candidate: PackedContainerCandidate,
): number {
  return requirePackedContainerPlan(candidate).facts.shape.value.maximumByteLength;
}

export type { PackedContainerCandidate, PackedPeerRegion };
