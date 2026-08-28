// sagejs-test-tier: unit
// sagejs-test-portable: true
"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  PACKED_CONTAINER_CANDIDATE_SCHEMA,
  analyzePackedContainer,
  requirePackedContainerPlan,
} = require(
  "../dist/tools/python/optimizer/analyses/packed-containers/index.js",
);
const {
  PACKED_CONTAINER_FACT_PROVIDER_ID,
  packedContainerDomainPlugin,
} = require(
  "../dist/tools/python/optimizer/domains/packed-container/index.js",
);
const {
  replayPackedMachineContainerPlan,
  serializePackedMachineContainerPlan,
  verifyPackedMachineContainerPlan,
} = require(
  "../dist/tools/python/optimizer/verifiers/packed-machine-container.js",
);

function evidence(authority = "contract") {
  return Object.fromEntries([
    "shape", "element", "owner", "alias", "mutation", "publication",
    "cleanup", "copy", "resource",
  ].map((kind) => [kind, {
    authority: kind === "shape" ? "runtime-guard" : authority,
    evidence: `independent ${kind} evidence`,
  }]));
}

function hostOwner(ownerId, storageId, relationship = "owned") {
  return {
    ownerId,
    rootOwnerId: relationship === "owned" ? ownerId : `${ownerId}:root`,
    storageId,
    allocationDomain: "host-v8",
    relationship,
    immediateOwnerId: relationship === "owned" ? null : `${ownerId}:parent`,
    storageKind: "host-buffer",
    generation: null,
    closedState: "always-open",
  };
}

function resourceOwner(
  ownerId,
  storageId,
  storageKind = "native-resource",
  relationship = "owned",
) {
  return {
    ownerId,
    rootOwnerId: relationship === "owned" ? ownerId : `${ownerId}:root`,
    storageId,
    allocationDomain: storageKind === "wasm-memory" ? "wasm-module-A" : "native-addon-A",
    relationship,
    immediateOwnerId: relationship === "owned" ? null : `${ownerId}:parent`,
    storageKind,
    generation: 7,
    closedState: "guarded-open",
  };
}

function baseCandidate(overrides = {}) {
  return {
    schema: PACKED_CONTAINER_CANDIDATE_SCHEMA,
    analysisRevision: 11,
    containerId: "coefficients",
    fallbackId: "semantic-loop:sha256:012345",
    source: {
      filename: "packed-example.py",
      line: 4,
      column: 8,
      endLine: 6,
      endColumn: 24,
    },
    shape: {
      kind: "sequence",
      length: { kind: "guarded", symbol: "coefficient_count", minimum: 0, maximum: 32 },
      layout: "contiguous",
    },
    element: {
      scalar: "uint32",
      lanes: 1,
      byteOrder: "native",
      canonical: true,
    },
    owner: hostOwner("coefficient-view", "tuple-storage", "borrowed"),
    byteOffset: 0,
    role: { kind: "immutable-input", transfer: { kind: "borrow" } },
    peers: [{
      containerId: "second-read-view",
      storageId: "tuple-storage",
      byteOffset: 16,
      byteLength: 32,
      access: "read",
    }],
    effects: {
      guardsBeforeEffects: true,
      noCallback: true,
      noEscape: true,
    },
    evidence: evidence(),
    ...overrides,
  };
}

function detached(value) {
  return JSON.parse(JSON.stringify(value));
}

test("immutable owner-bound sequences permit only read-only sharing", () => {
  const candidate = baseCandidate();
  const plan = requirePackedContainerPlan(candidate);
  verifyPackedMachineContainerPlan(plan);
  assert.equal(plan.facts.shape.value.logicalElementCount.maximum, 32);
  assert.equal(plan.facts.shape.value.maximumByteLength, 128);
  assert.equal(plan.facts.element.value.elementBytes, 4);
  assert.equal(plan.facts.owner.value.activeOwnership, "borrowed");
  assert.equal(plan.facts.owner.value.rootRetainedDuringUse, true);
  assert.equal(plan.facts.alias.value.mode, "read-only-sharing");
  assert.deepEqual(plan.facts.alias.value.readOnlyAliases, ["second-read-view"]);
  assert.deepEqual(plan.facts.alias.value.writeAliases, []);
  assert.equal(plan.facts.mutation.value.policy, "immutable");
  assert.equal(plan.facts.publication.value.policy, "none");
  assert.equal(plan.facts.publication.value.exposesMutableArray, false);
  assert.equal(plan.facts.copy.value.maximumTotalCopiedBytes, 0);
  assert.equal(plan.facts.resource.value.rawAddressExposure, "none");
  assert.ok(Object.isFrozen(plan));
  assert.ok(Object.isFrozen(plan.facts.alias.value.relations));

  candidate.shape.length.maximum = 999;
  candidate.peers[0].access = "write";
  assert.equal(plan.source.shape.length.maximum, 32);
  assert.equal(plan.source.peers[0].access, "read");
});

test("matrix copy-in records exact shape, copy, allocator, and cleanup costs", () => {
  const sourceOwner = resourceOwner(
    "wasm-matrix-view", "wasm-linear-region", "wasm-memory", "borrowed",
  );
  const destination = resourceOwner("native-private-copy", "native-copy-storage");
  const plan = requirePackedContainerPlan(baseCandidate({
    containerId: "matrix-input",
    shape: {
      kind: "matrix",
      rows: { kind: "constant", value: 3 },
      columns: { kind: "constant", value: 4 },
      layout: "row-major",
    },
    element: {
      scalar: "binary64",
      lanes: 2,
      byteOrder: "native",
      canonical: true,
    },
    owner: sourceOwner,
    byteOffset: 16,
    role: {
      kind: "immutable-input",
      transfer: { kind: "copy-in", destination },
    },
    peers: [{
      containerId: "wasm-read-peer",
      storageId: "wasm-linear-region",
      byteOffset: 32,
      byteLength: 16,
      access: "read",
    }],
  }));
  verifyPackedMachineContainerPlan(plan);
  assert.deepEqual(plan.facts.shape.value.logicalElementCount, {
    formula: "rows*columns",
    exact: 12,
    maximum: 12,
  });
  assert.equal(plan.facts.shape.value.maximumByteLength, 192);
  assert.equal(plan.facts.owner.value.active.ownerId, "native-private-copy");
  assert.equal(plan.facts.alias.value.activeStoragePrivate, true);
  assert.deepEqual(plan.facts.copy.value, {
    entryCopies: 1,
    exitCopies: 0,
    maximumEntryBytes: 192,
    maximumExitBytes: 0,
    maximumTotalCopiedBytes: 192,
    byteFormula: "maximum-elements*element-bytes",
  });
  assert.equal(plan.facts.resource.value.allocatorDomainCrossing, true);
  assert.deepEqual(plan.facts.cleanup.value.owners, [
    { ownerId: "wasm-matrix-view", onFailure: "retain", onSuccess: "retain" },
    { ownerId: "native-private-copy", onFailure: "close", onSuccess: "close" },
  ]);
  assert.ok(plan.guards.some((guard) => guard.code === "packed-container.resource-open"));
  assert.ok(plan.guards.some(
    (guard) => guard.code === "packed-container.resource-generation",
  ));
});

test("transactional outputs publish only sealed owners after completion", () => {
  const owner = resourceOwner("native-result-owner", "native-result-storage");
  const plan = requirePackedContainerPlan(baseCandidate({
    containerId: "matrix-output",
    shape: {
      kind: "matrix",
      rows: { kind: "guarded", symbol: "rows", minimum: 0, maximum: 8 },
      columns: { kind: "guarded", symbol: "columns", minimum: 0, maximum: 8 },
      layout: "column-major",
    },
    element: {
      scalar: "uint64",
      lanes: 1,
      byteOrder: "native",
      canonical: true,
    },
    owner,
    role: {
      kind: "transactional-output",
      transfer: { kind: "owner-transfer" },
    },
    peers: [{
      containerId: "unrelated-input",
      storageId: "input-storage",
      byteOffset: 0,
      byteLength: 512,
      access: "read",
    }],
  }));
  verifyPackedMachineContainerPlan(plan);
  assert.equal(plan.facts.alias.value.mode, "private-transaction");
  assert.equal(plan.facts.mutation.value.optimizedWrites, "private-active-owner");
  assert.equal(plan.facts.mutation.value.visibleWritesBeforeCommit, false);
  assert.equal(plan.facts.publication.value.policy, "sealed-owner-transfer");
  assert.equal(plan.facts.publication.value.publicMutability, "immutable");
  assert.equal(plan.facts.publication.value.afterComputation, true);
  assert.deepEqual(plan.facts.cleanup.value.owners, [{
    ownerId: "native-result-owner",
    onFailure: "close",
    onSuccess: "transfer",
  }]);
  assert.deepEqual(
    plan.facts.cleanup.value.finalizerFallbackOwnerIds,
    ["native-result-owner"],
  );
  assert.equal(plan.facts.copy.value.maximumTotalCopiedBytes, 0);
});

test("transactional copy-out prices publication and closes private storage", () => {
  const plan = requirePackedContainerPlan(baseCandidate({
    containerId: "copied-output",
    shape: {
      kind: "sequence",
      length: { kind: "constant", value: 10 },
      layout: "contiguous",
    },
    owner: resourceOwner("scratch-owner", "scratch-storage"),
    role: {
      kind: "transactional-output",
      transfer: {
        kind: "copy-out",
        destination: hostOwner("sealed-host-owner", "sealed-host-storage"),
      },
    },
    peers: [],
  }));
  verifyPackedMachineContainerPlan(plan);
  assert.equal(plan.facts.publication.value.policy, "sealed-deep-copy");
  assert.equal(plan.facts.copy.value.maximumExitBytes, 40);
  assert.deepEqual(plan.facts.cleanup.value.owners, [
    { ownerId: "scratch-owner", onFailure: "close", onSuccess: "close" },
    { ownerId: "sealed-host-owner", onFailure: "drop", onSuccess: "transfer" },
  ]);
});

test("zero-trip containers and interruption keep ownership deterministic", () => {
  const zeroTrip = requirePackedContainerPlan(baseCandidate({
    containerId: "empty-input",
    shape: {
      kind: "sequence",
      length: { kind: "constant", value: 0 },
      layout: "contiguous",
    },
    peers: [{
      containerId: "same-storage-writer-after-empty-range",
      storageId: "tuple-storage",
      byteOffset: 0,
      byteLength: 128,
      access: "write",
    }],
  }));
  verifyPackedMachineContainerPlan(zeroTrip);
  assert.equal(zeroTrip.facts.shape.value.logicalElementCount.exact, 0);
  assert.equal(zeroTrip.facts.shape.value.maximumByteLength, 0);
  assert.equal(zeroTrip.facts.alias.value.relations[0].sourceOverlap, false);

  const interrupted = requirePackedContainerPlan(baseCandidate({
    containerId: "interruptible-output",
    owner: resourceOwner("interrupt-owner", "interrupt-storage"),
    role: {
      kind: "transactional-output",
      transfer: { kind: "owner-transfer" },
    },
    peers: [],
  }));
  const [cleanup] = interrupted.facts.cleanup.value.owners;
  assert.equal(cleanup.onFailure, "close");
  assert.equal(cleanup.onSuccess, "transfer");
  assert.equal(interrupted.facts.cleanup.value.allExitsCovered, true);
  assert.equal(interrupted.facts.cleanup.value.closeIsIdempotent, true);
  assert.equal(interrupted.facts.mutation.value.rollback, "discard-private-owner");
  assert.equal(interrupted.fallback.restart, "original-inputs");
});

test("detached replay authenticates every derived fact and freezes the result", () => {
  const plan = requirePackedContainerPlan(baseCandidate());
  const replayed = replayPackedMachineContainerPlan(
    serializePackedMachineContainerPlan(plan),
  );
  assert.deepEqual(replayed, plan);
  assert.ok(Object.isFrozen(replayed.facts.resource.value.owners));

  const mutations = [
    (copy) => { copy.facts.shape.value.logicalElementCount.maximum += 1; },
    (copy) => { copy.facts.element.value.elementBytes *= 2; },
    (copy) => { copy.facts.owner.value.source.ownerId = "forged-owner"; },
    (copy) => { copy.facts.alias.value.writeAliases.push("hidden-write"); },
    (copy) => { copy.facts.mutation.value.visibleWritesBeforeCommit = true; },
    (copy) => { copy.facts.publication.value.exposesMutableArray = true; },
    (copy) => { copy.facts.cleanup.value.allExitsCovered = false; },
    (copy) => { copy.facts.copy.value.maximumEntryBytes = 4; },
    (copy) => { copy.facts.resource.value.rawAddressExposure = "pointer"; },
    (copy) => { copy.guards.pop(); },
    (copy) => { copy.fallback.beforeVisibleEffect = false; },
    (copy) => { copy.source.analysisRevision += 1; },
  ];
  for (const mutate of mutations) {
    const copy = detached(plan);
    mutate(copy);
    assert.throws(
      () => verifyPackedMachineContainerPlan(copy),
      /packed container/,
    );
  }
});

test("unsafe aliases, ownership, effects, shape, and publication fail closed", () => {
  const cases = [
    {
      candidate: baseCandidate({
        peers: [{
          containerId: "writer",
          storageId: "tuple-storage",
          byteOffset: 0,
          byteLength: 4,
          access: "write",
        }],
      }),
      code: "packed-container.alias-write-visible",
    },
    {
      candidate: baseCandidate({ effects: {
        guardsBeforeEffects: true,
        noCallback: false,
        noEscape: true,
      } }),
      code: "packed-container.effect-or-escape-unknown",
    },
    {
      candidate: baseCandidate({
        shape: {
          kind: "matrix",
          rows: { kind: "constant", value: Number.MAX_SAFE_INTEGER },
          columns: { kind: "constant", value: 2 },
          layout: "row-major",
        },
      }),
      code: "packed-container.unsafe-shape",
    },
    {
      candidate: baseCandidate({
        role: { kind: "immutable-input", transfer: { kind: "mutable-view" } },
      }),
      code: "packed-container.unsupported-publication",
    },
    {
      candidate: baseCandidate({
        owner: {
          ...resourceOwner("broken-resource", "broken-storage"),
          generation: null,
        },
      }),
      code: "packed-container.invalid-candidate",
    },
    {
      candidate: baseCandidate({
        owner: hostOwner("scratch", "shared-output-storage"),
        role: {
          kind: "transactional-output",
          transfer: { kind: "owner-transfer" },
        },
        peers: [{
          containerId: "observer",
          storageId: "shared-output-storage",
          byteOffset: 4096,
          byteLength: 4,
          access: "read",
        }],
      }),
      code: "packed-container.transaction-not-private",
    },
  ];
  for (const item of cases) {
    const result = analyzePackedContainer(item.candidate);
    assert.equal(result.accepted, false);
    assert.equal(result.rejections[0].code, item.code);
  }

  const accessor = baseCandidate();
  Object.defineProperty(accessor, "byteOffset", { get: () => 0, enumerable: true });
  const result = analyzePackedContainer(accessor);
  assert.equal(result.accepted, false);
  assert.equal(
    result.rejections[0].code,
    "packed-container.candidate-not-detached-data",
  );
});

test("the standalone domain descriptor has no target emitter or public array escape", () => {
  assert.equal(packedContainerDomainPlugin.id, PACKED_CONTAINER_FACT_PROVIDER_ID);
  assert.equal(packedContainerDomainPlugin.claimSemantics, "exclusive");
  assert.equal(packedContainerDomainPlugin.publicMutableStorage, false);
  assert.deepEqual(
    [...packedContainerDomainPlugin.supportedConsumers],
    ["v8", "wasm", "native"],
  );
  assert.equal("lowering" in packedContainerDomainPlugin, false);
  assert.equal("emitter" in packedContainerDomainPlugin, false);
});
