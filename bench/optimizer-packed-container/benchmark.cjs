#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const os = require("node:os");
const { performance } = require("node:perf_hooks");

const {
  PACKED_CONTAINER_CANDIDATE_SCHEMA,
  requirePackedContainerPlan,
} = require(
  "../../dist/tools/python/optimizer/analyses/packed-containers/index.js",
);
const {
  replayPackedMachineContainerPlan,
  serializePackedMachineContainerPlan,
  verifyPackedMachineContainerPlan,
} = require(
  "../../dist/tools/python/optimizer/verifiers/packed-machine-container.js",
);

const check = process.argv.includes("--check");
const elementCount = 256 * 1024;
const samples = 9;
let observationSink = 0;

function hostOwner(ownerId, storageId) {
  return {
    ownerId,
    rootOwnerId: ownerId,
    storageId,
    allocationDomain: "host-v8",
    relationship: "owned",
    immediateOwnerId: null,
    storageKind: "host-buffer",
    generation: null,
    closedState: "always-open",
  };
}

function candidate(containerId, role) {
  return {
    schema: PACKED_CONTAINER_CANDIDATE_SCHEMA,
    analysisRevision: 1,
    containerId,
    fallbackId: `same-source:${containerId}`,
    source: {
      filename: "packed-container-benchmark.py",
      line: 1,
      column: 0,
      endLine: 3,
      endColumn: 20,
    },
    shape: {
      kind: "matrix",
      rows: { kind: "constant", value: 512 },
      columns: { kind: "constant", value: 512 },
      layout: "row-major",
    },
    element: {
      scalar: "uint32",
      lanes: 1,
      byteOrder: "native",
      canonical: true,
    },
    owner: hostOwner(`${containerId}:source-owner`, `${containerId}:source-storage`),
    byteOffset: 0,
    role,
    peers: [],
    effects: {
      guardsBeforeEffects: true,
      noCallback: true,
      noEscape: true,
    },
    evidence: Object.fromEntries([
      "shape", "element", "owner", "alias", "mutation", "publication",
      "cleanup", "copy", "resource",
    ].map((kind) => [kind, {
      authority: kind === "shape" ? "static" : "contract",
      evidence: `benchmark ${kind} contract`,
    }])),
  };
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function measure(operation, count = samples) {
  for (let index = 0; index < 3; index += 1) observationSink ^= operation();
  const elapsed = [];
  for (let index = 0; index < count; index += 1) {
    const started = performance.now();
    observationSink ^= operation();
    elapsed.push(performance.now() - started);
  }
  return median(elapsed);
}

function checksum(values) {
  let answer = 0;
  for (let index = 0; index < values.length; index += 1) {
    answer = (answer + Math.imul(values[index], index + 1)) >>> 0;
  }
  return answer;
}

const borrowCandidate = candidate("borrowed-matrix", {
  kind: "immutable-input",
  transfer: { kind: "borrow" },
});
const copyInCandidate = candidate("copied-input-matrix", {
  kind: "immutable-input",
  transfer: {
    kind: "copy-in",
    destination: hostOwner("copy-in-private-owner", "copy-in-private-storage"),
  },
});
const transferCandidate = candidate("transferred-output-matrix", {
  kind: "transactional-output",
  transfer: { kind: "owner-transfer" },
});
const copyOutCandidate = candidate("copied-output-matrix", {
  kind: "transactional-output",
  transfer: {
    kind: "copy-out",
    destination: hostOwner("copy-out-public-owner", "copy-out-public-storage"),
  },
});

const coldStarted = performance.now();
const borrowPlan = requirePackedContainerPlan(borrowCandidate);
const coldPlanMilliseconds = performance.now() - coldStarted;
const copyInPlan = requirePackedContainerPlan(copyInCandidate);
const transferPlan = requirePackedContainerPlan(transferCandidate);
const copyOutPlan = requirePackedContainerPlan(copyOutCandidate);
const serialized = serializePackedMachineContainerPlan(copyOutPlan);

const planWarmMilliseconds = measure(() => {
  const plan = requirePackedContainerPlan(borrowCandidate);
  return Number.parseInt(plan.fingerprint.slice(-8), 16);
}, 200);
const replayWarmMilliseconds = measure(() => {
  const plan = replayPackedMachineContainerPlan(serialized);
  return Number.parseInt(plan.fingerprint.slice(-8), 16);
}, 200);

const input = new Uint32Array(elementCount);
for (let index = 0; index < input.length; index += 1) {
  input[index] = (Math.imul(index, 2654435761) + 17) >>> 0;
}
const expectedChecksum = checksum(input);
const borrowMilliseconds = measure(() => checksum(input));
const copyInMilliseconds = measure(() => checksum(input.slice()));

function privateTransaction(copyResult) {
  const privateOutput = new Uint32Array(elementCount);
  for (let index = 0; index < privateOutput.length; index += 1) {
    privateOutput[index] = (input[index] ^ 0xa5a5a5a5) >>> 0;
  }
  // The benchmark never returns the mutable private array. This branch models
  // either a sealed owner transfer or the explicit copied publication cost.
  return checksum(copyResult ? privateOutput.slice() : privateOutput);
}

const expectedOutputChecksum = privateTransaction(false);
const ownerTransferMilliseconds = measure(() => privateTransaction(false));
const copyOutMilliseconds = measure(() => privateTransaction(true));

for (const plan of [borrowPlan, copyInPlan, transferPlan, copyOutPlan]) {
  verifyPackedMachineContainerPlan(plan);
  assert.equal(plan.facts.publication.value.exposesMutableArray, false);
  assert.equal(plan.facts.resource.value.rawAddressExposure, "none");
}
assert.equal(checksum(input), expectedChecksum);
assert.equal(privateTransaction(false), expectedOutputChecksum);
assert.equal(privateTransaction(true), expectedOutputChecksum);

const byteLength = input.byteLength;
const report = {
  workload: {
    shape: [512, 512],
    scalar: "uint32",
    elements: elementCount,
    bytes: byteLength,
    samples,
  },
  host: {
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    cpu: os.cpus()[0]?.model ?? "unknown",
  },
  plan_contracts: {
    borrowed_input: borrowPlan.facts.copy.value,
    copied_input: copyInPlan.facts.copy.value,
    transferred_output: transferPlan.facts.copy.value,
    copied_output: copyOutPlan.facts.copy.value,
  },
  medians_ms: {
    cold_plan: coldPlanMilliseconds,
    warm_plan: planWarmMilliseconds,
    detached_replay: replayWarmMilliseconds,
    borrowed_read_inclusive: borrowMilliseconds,
    copied_input_read_inclusive: copyInMilliseconds,
    private_compute_owner_transfer: ownerTransferMilliseconds,
    private_compute_copy_out: copyOutMilliseconds,
  },
  observed_copy_penalty: {
    input_ratio: copyInMilliseconds / borrowMilliseconds,
    output_ratio: copyOutMilliseconds / ownerTransferMilliseconds,
  },
  checksum: {
    input: expectedChecksum,
    output: expectedOutputChecksum,
    sink: observationSink >>> 0,
  },
  note: "Boundary simulation only; no executable target-speed claim.",
};

if (check) {
  assert.equal(borrowPlan.facts.copy.value.maximumTotalCopiedBytes, 0);
  assert.equal(copyInPlan.facts.copy.value.maximumEntryBytes, byteLength);
  assert.equal(transferPlan.facts.copy.value.maximumTotalCopiedBytes, 0);
  assert.equal(copyOutPlan.facts.copy.value.maximumExitBytes, byteLength);
  assert.equal(transferPlan.facts.mutation.value.policy, "transactional");
  assert.equal(copyOutPlan.facts.publication.value.policy, "sealed-deep-copy");
  assert.ok(Number.isFinite(coldPlanMilliseconds) && coldPlanMilliseconds < 100);
  assert.ok(Number.isFinite(planWarmMilliseconds) && planWarmMilliseconds < 20);
  assert.ok(Number.isFinite(replayWarmMilliseconds) && replayWarmMilliseconds < 20);
  for (const value of [
    borrowMilliseconds, copyInMilliseconds, ownerTransferMilliseconds,
    copyOutMilliseconds,
  ]) assert.ok(Number.isFinite(value) && value > 0);
}

console.log(JSON.stringify(report, null, 2));
