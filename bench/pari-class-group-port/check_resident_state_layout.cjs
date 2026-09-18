"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const directory = __dirname;
const manifestPath = path.join(directory, "resident-state-layout-v1.json");
const raw = fs.readFileSync(manifestPath);
const manifest = JSON.parse(raw);

assert.equal(manifest.schema,
  "sagejs.pari-class-group/resident-state-layout-manifest/v1");
assert.equal(manifest.name, "pari-class-unit-resident-state");
assert.equal(manifest.layoutVersion, 1);
assert.equal(manifest.contract.abiStatus, "no-generated-signature-yet");
assert.equal(manifest.signatureGeneration.status, "not-yet-connected");

const stageIds = manifest.stages.map(stage => stage.id);
assert.deepEqual(stageIds,
  ["prepared", "factor", "relation", "hnf", "acceptance", "unit", "class", "final"]);
assert.deepEqual(manifest.stages.map(stage => stage.ordinal),
  [...manifest.stages.keys()]);
assert.deepEqual(manifest.stages.filter(stage => stage.commit).map(stage => stage.id),
  ["final"]);
const stageIndex = new Map(stageIds.map((id, index) => [id, index]));

const dimensions = new Set(Object.keys(manifest.dimensions));
const domains = new Set(Object.keys(manifest.scalarDomains));
const ownerIds = new Set();
const roles = new Set();
for (const owner of manifest.owners) {
  assert(!ownerIds.has(owner.id), `duplicate owner ${owner.id}`);
  ownerIds.add(owner.id);
  roles.add(owner.role);
  assert(stageIndex.has(owner.role), `unknown role ${owner.role}`);
  assert(domains.has(owner.domain), `unknown domain ${owner.domain}`);
  assert(["borrowed-read-only", "exclusive-mutable-owner",
    "immutable-publication-owner"].includes(owner.ownership));
  assert.equal(owner.physicalShape.length, owner.logicalShape.length,
    `${owner.id} shape rank changed`);
  for (const dimension of [...owner.physicalShape, ...owner.logicalShape]) {
    assert(dimensions.has(dimension), `${owner.id} has unknown dimension ${dimension}`);
  }
  assert.equal(owner.lifetime.length, 2);
  assert(stageIndex.has(owner.lifetime[0]) && stageIndex.has(owner.lifetime[1]));
  assert(stageIndex.get(owner.lifetime[0]) <= stageIndex.get(owner.lifetime[1]),
    `${owner.id} has reversed lifetime`);
  assert(stageIndex.get(owner.lifetime[0]) <= stageIndex.get(owner.role),
    `${owner.id} begins after its role`);
  assert(stageIndex.get(owner.role) <= stageIndex.get(owner.lifetime[1]),
    `${owner.id} ends before its role`);
}
for (const role of ["prepared", "factor", "relation", "hnf", "unit", "class", "final"])
  assert(roles.has(role), `missing ${role} owner role`);

for (const [from, to, reason] of manifest.retryEdges) {
  assert(stageIndex.has(from) && stageIndex.has(to));
  assert(stageIndex.get(to) < stageIndex.get(from), `${reason} is not a retry edge`);
}

for (const specialization of manifest.currentSpecializations) {
  assert.equal(specialization.derivedFromThisManifest, false,
    `${specialization.id} incorrectly claims generated-signature authority`);
  assert(fs.existsSync(path.join(directory, specialization.evidence)),
    `${specialization.id} evidence is missing`);
}
assert(manifest.signatureGeneration.requiredWork.length >= 5);
assert(manifest.borrowingRules.some(rule => rule.includes("only the final stage")));

// JSON object order is deliberately the checked, inspectable serialization.
// Reparse/re-emit equality prevents duplicate keys, non-JSON values, and
// formatting drift from hiding the bytes whose digest is reported.
const normalized = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
assert(raw.equals(normalized), "state-layout manifest is not deterministically formatted");
const summary = {
  schema: manifest.schema,
  name: manifest.name,
  layoutVersion: manifest.layoutVersion,
  sha256: crypto.createHash("sha256").update(raw).digest("hex"),
  ownerCount: manifest.owners.length,
  stages: stageIds,
  roles: [...roles].sort(),
  generatedSignatures: manifest.currentSpecializations.filter(
    item => item.derivedFromThisManifest).length,
  signatureGenerationStatus: manifest.signatureGeneration.status,
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
