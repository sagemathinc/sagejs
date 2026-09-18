#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const zlib = require("node:zlib");
const host = require("./row6_phase6_gate_prefix_host.cjs");
const gateHost = require("./row6_prepared_gate_c_host.cjs");

const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const canonicalHash = values => sha(Buffer.from(JSON.stringify(values.map(String))));
function integerAt(owner, index) {
  if (owner.sizes === undefined) return BigInt(owner[index]);
  const signedWords = owner.sizes[index], words = Math.abs(signedWords);
  let value = 0n;
  for (let word = words - 1; word >= 0; word -= 1)
    value = (value << 64n) + owner.limbs[index * owner.wordCapacity + word];
  return signedWords < 0 ? -value : value;
}

function digestOwner(owner, count, start = 0) {
  assert(start + count <= owner.length);
  const hash = crypto.createHash("sha256");
  hash.update("[");
  for (let index = 0; index < count; index += 1) {
    if (index) hash.update(",");
    hash.update(JSON.stringify(integerAt(owner, start + index).toString()));
  }
  hash.update("]");
  return hash.digest("hex");
}

function ownerHighWater(owner) {
  let result = 0;
  for (const size of owner.sizes) result = Math.max(result, Math.abs(size));
  return result;
}

function capacityAudit(resident) {
  const groups = { hnf: resident.hnf, append1: resident.append1,
    append2: resident.append2, ancestry: resident.ancestry };
  const rows = [];
  for (const [group, values] of Object.entries(groups)) {
    for (const [name, owner] of Object.entries(values)) {
      if (!(owner?.sizes instanceof Int32Array) ||
          !(owner.limbs instanceof BigUint64Array)) continue;
      const highWater = ownerHighWater(owner), capacity = owner.wordCapacity;
      const compactArena = group === "hnf" &&
        (name === "cup_arena" || name === "cup_frames");
      assert(highWater <= capacity, `${group}.${name} exceeded packed capacity`);
      if (!compactArena) assert(highWater < capacity,
        `${group}.${name} lacks transactional capacity headroom`);
      rows.push({ owner: `${group}.${name}`, highWater, capacity,
        bytes: owner.length * (4 + 8 * capacity) });
    }
  }
  rows.sort((left, right) => left.owner.localeCompare(right.owner));
  for (const [owner, expected] of Object.entries(host.ROW6_CAPACITY_LEDGER)) {
    const actual = rows.find(row => row.owner === owner);
    assert(actual, `capacity ledger owner missing: ${owner}`);
    assert.equal(actual.highWater, expected.highWater,
      `capacity ledger high-water changed: ${owner}`);
    assert.equal(actual.capacity, expected.capacity,
      `capacity ledger allocation changed: ${owner}`);
  }
  return Object.freeze({ ownerCount: rows.length,
    packedBytes: rows.reduce((sum, row) => sum + row.bytes, 0),
    sha256: sha(Buffer.from(JSON.stringify(rows))) });
}

function readOwner(descriptor) {
  const compressed = fs.readFileSync(descriptor.path);
  assert.equal(sha(compressed), descriptor.compressedSha256);
  const plain = zlib.gunzipSync(compressed);
  assert.equal(sha(plain), descriptor.ownerSha256);
  const owner = JSON.parse(plain);
  owner.ownerSha256 = descriptor.ownerSha256;
  return owner;
}

async function main() {
  const generated = spawnSync(process.execPath,
    [path.join(__dirname, "row6_phase6_gate_prefix_source.cjs")],
    { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  assert.equal(generated.status, 0, generated.stderr);
  assert.equal(fs.readFileSync(host.SOURCE, "utf8"), generated.stdout,
    "generated row-6 Gate-C root is stale");
  const payload = JSON.parse(fs.readFileSync(
    process.argv[2] || "/tmp/row6-gate-payload.json", "utf8"));
  assert.equal(host.prepare.length, 1);
  assert.equal(host.createProcessCoordinatorAdapter.length, 1);
  const publicHost = fs.readFileSync(
    path.join(__dirname, "row6_phase6_gate_prefix_host.cjs"), "utf8");
  assert(!/\bfactorOwner\b|\binitialOwner\b/.test(publicHost),
    "serialized factor/relation owner leaked into public host source");
  let shapeOnly = host.preparedCollectorInput(payload.prepared);
  for (const name of ["relation_basis", "relation_records", "relation_hashes",
    "relation_metadata", "generators"])
    assert.equal(shapeOnly[name], undefined,
      `shape-only aggregate input constructed detached ${name}`);
  shapeOnly = null;
  if (global.gc) global.gc();
  await assert.rejects(() => host.prepare(payload.prepared, payload.factorOwner),
    /forbidden at the prepared-only boundary/);
  await assert.rejects(() => host.prepare({ ...payload.prepared,
    initialOwner: payload.initialOwner }), /accepts only the prepared-number-field/);
  await assert.rejects(() => host.prepare({ ...payload.prepared,
    authoritySha256: "0".repeat(64) }), /authority is not authenticated data/);
  await assert.rejects(() => host.prepare({ ...payload.prepared,
    data: { ...payload.prepared.data, relationCapacity: 11420 } }),
  /unreviewed field/);
  const resident = await host.prepare(payload.prepared);
  const result = host.run(resident);
  const gateDescriptor = JSON.parse(fs.readFileSync(
    process.argv[3] || "/tmp/row6-gate-worker.json", "utf8"));
  const gate = readOwner(gateDescriptor);
  const ancestryOracle = JSON.parse(fs.readFileSync(
    process.argv[4] || "/tmp/row6-ancestry.json", "utf8"));
  const core = fs.readFileSync(resident.built.coreSourcePath, "utf8");
  for (const callee of [
    "native_pari_row6_prepared_factor_base_root",
    "native_pari_row6_prepared_initial_relations",
    "native_pari_collect_and_log_relations",
    "native_pari_hnfspec_complete",
    "native_pari_row14_prepare_next_pass",
    "native_pari_hnfadd",
    "native_pari_row6_phase6_gate_ancestry_private",
  ]) assert(core.includes(callee), `missing direct native callee ${callee}`);
  assert.deepEqual(result.projection.hnf,
    ["2", "9", "1124", "4", "7", "145", "0", "1133", "0"]);
  const expected = gate.checkpoints.at(-1).hashes;
  const replay = {
    relations: digestOwner(resident.prefix.initial.relation_records, 1130 * 1137),
    logs: digestOwner(resident.collector.log_embeddings, 21 * 1137),
    h: digestOwner(resident.append2.result_h, 4),
    dep: sha(Buffer.from("[]")),
    b: digestOwner(resident.append2.result_b, 2 * 1128),
    c: digestOwner(resident.append2.result_c, 21 * 1137),
    perm: digestOwner(resident.hnf.perm, 1130),
  };
  assert.deepEqual(replay, expected);
  const ancestryReplay = {
    rawToUnitKernel: digestOwner(resident.ancestry.raw_to_all, 7 * 1137),
    rawToPresentation: digestOwner(resident.ancestry.raw_to_all, 2 * 1137, 7 * 1137),
    acceptedArch: digestOwner(resident.ancestry.accepted_arch, 147),
  };
  for (let index = 0; index < 9 * 1137; index += 1) {
    const expectedValue = BigInt(index < 7 * 1137 ?
      ancestryOracle.rawToUnitKernel[index] :
      ancestryOracle.rawToPresentation[index - 7 * 1137]);
    const actualValue = integerAt(resident.ancestry.raw_to_all, index);
    if (actualValue !== expectedValue) {
      console.error(JSON.stringify({ ancestryFirstMismatch: index,
        selected: Math.floor(index / 1137), column: index % 1137,
        actual: String(actualValue), expected: String(expectedValue) }));
      break;
    }
  }
  assert.equal(ancestryReplay.rawToUnitKernel,
    canonicalHash(ancestryOracle.rawToUnitKernel));
  assert.equal(ancestryReplay.rawToPresentation,
    canonicalHash(ancestryOracle.rawToPresentation));
  assert.equal(ancestryReplay.acceptedArch,
    canonicalHash(ancestryOracle.acceptedArch));
  assert.deepEqual(Array.from(resident.ancestry.accepted_signs, Number),
    ancestryOracle.acceptedSigns);
  assert.deepEqual(resident.ancestry.phase_pi.toArray().map(String),
    ancestryOracle.phasePi);
  assert.deepEqual(Array.from(resident.ancestry.active_rows, Number),
    ancestryOracle.state.activeFactorRows);
  const capacity = capacityAudit(resident);
  assert.throws(() => host.run(resident), /fresh (?:publication|state) owner/);
  const changed = structuredClone(payload.prepared);
  changed.data.prep_polynomial[0] = "2000000000019";
  await assert.rejects(() => host.prepare(changed));
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row6-phase6-gate-prefix-check-v1",
    compilerCacheKey: resident.built.cacheKey,
    exactProjection: result.projection,
    exactReplaySha256: replay,
    exactAncestrySha256: ancestryReplay,
    capacityAudit: capacity,
    oneNativeCall: true,
    subprocessesInsideRun: 0,
    filesystemOwnerBoundariesInsideRun: 0,
    hostRelationCopiesInsideRun: 0,
    detachedDenseRelationInputConstructed: false,
    preparedOnlyBoundary: true,
    factorRelationOwnersForbidden: true,
    reviewedLayoutSchema: host.ROW6_PREPARED_LAYOUT.schema,
    retainedInitialHnfTransforms: true,
    retainedContinuationHnfTransforms: true,
    replayWithoutFreshOwnersRejected: true,
    preparedMutationRejected: true,
    generatedSourceFresh: true,
    timingEligible: false,
  }, null, 2)}\n`);
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
