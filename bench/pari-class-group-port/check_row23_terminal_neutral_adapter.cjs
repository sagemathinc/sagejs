#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const adapter = require("./row23_terminal_neutral_adapter.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");

function usage() {
  throw new Error(
    "usage: check_row23_terminal_neutral_adapter.cjs ROW23-FINAL.json.gz",
  );
}

function canonicalEnvelope(payload) {
  return neutral.canonical({
    payload,
    payloadSha256: neutral.sha256Canonical(payload),
    schema: adapter.SOURCE_SCHEMA,
  });
}

function pythonColdReplay(raw, expectedSha256, mathematicalAuthoritySha256) {
  const program = String.raw`
import importlib,json,sys
m=importlib.import_module("bench.pari-class-group-port.row23_final_result")
raw=sys.stdin.buffer.read()
result=m.cold_replay_row23(raw,m.Row23ReplayAuthority(expected_sha256=sys.argv[2]))
p=result.detached_payload()
print(json.dumps({
 "schema":sys.argv[3],
 "sourceSha256":result.sha256,
 "sourcePayloadSha256":json.loads(raw)["payloadSha256"],
 "mathematicalAuthoritySha256":sys.argv[4],
 "fieldId":"5.5.1002836007889.1",
 "classNumber":p["classGroup"]["classNumber"],
 "invariantFactors":p["classGroup"]["invariantFactors"],
 "unitCount":p["units"]["fundamental"]["freeRank"],
 "correspondenceComplete":p["terminal"]["correspondenceComplete"],
 "publicComplete":p["terminal"]["publicComplete"],
},sort_keys=True,separators=(",",":")))
`;
  const child = spawnSync(
    "python3",
    [
      "-c",
      program,
      root,
      expectedSha256,
      adapter.SOURCE_REPLAY_SCHEMA,
      mathematicalAuthoritySha256,
    ],
    {
      cwd: root,
      input: raw,
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
      timeout: 120_000,
    },
  );
  if (child.status !== 0) throw new Error(child.stderr || String(child.error));
  return JSON.parse(child.stdout.trim().split("\n").at(-1));
}

function mathematicalAuthority(raw) {
  const envelope = JSON.parse(raw.toString("ascii"));
  return neutral.sha256Canonical({
    coldReplayImplementation: "row23_final_result.cold_replay_row23",
    sourcePayloadSha256: envelope.payloadSha256,
    sourceSchema: adapter.SOURCE_SCHEMA,
    sourceSha256: neutral.sha256Bytes(raw),
  });
}

function sourceAuthority(raw, options = {}) {
  const sourceSha256 = neutral.sha256Bytes(raw);
  const math = options.mathematicalAuthoritySha256 ?? mathematicalAuthority(raw);
  return adapter.createDetachedRow23SourceAuthority({
    mathematicalAuthoritySha256: math,
    replay(candidate) {
      const receipt = pythonColdReplay(candidate, sourceSha256, math);
      if (options.mutateReceipt) options.mutateReceipt(receipt);
      return receipt;
    },
    sourceSha256,
  });
}

function ownerMap(payload) {
  return new Map(payload.storage.map(owner => [owner.name, owner]));
}

function logical(owner) {
  return owner.entries.slice(0, Number(owner.logicalLength));
}

function finalAuthority(prepared, trustedPayload, replaySchema) {
  const mathematicalAuthoritySha256 = prepared.mathematicalAuthoritySha256;
  return neutral.createDetachedClassUnitAuthority({
    envelopeSha256: prepared.envelopeSha256,
    mathematicalAuthoritySha256,
    replay(payload) {
      assert.deepEqual(payload, trustedPayload);
      const owners = ownerMap(payload);
      assert.deepEqual(payload.classGroup, {
        classNumber: "6",
        generatorCount: "1",
        invariantFactors: ["6"],
        presentationOwner: "class-presentation",
      });
      assert.equal(logical(owners.get("class-generator-ideals")).length, 25);
      assert(logical(owners.get("class-presentation")).length > 0);
      assert(logical(owners.get("class-principal-witnesses")).length > 0);
      assert.equal(logical(owners.get("exact-unit-coordinates")).length, 20);
      assert.equal(logical(owners.get("exact-unit-inverses")).length, 20);
      assert.deepEqual(logical(owners.get("exact-unit-norms")), [
        "-1",
        "1",
        "1",
        "1",
      ]);
      assert.deepEqual(logical(owners.get("torsion-generator")), [
        "-1",
        "0",
        "0",
        "0",
        "0",
      ]);
      assert.equal(payload.terminal.public_complete, false);
      return {
        correspondence_complete: true,
        fieldId: adapter.FIELD_ID,
        mathematicalAuthoritySha256,
        payloadSha256: neutral.sha256Canonical(payload),
        public_complete: false,
        schema: replaySchema,
      };
    },
    replaySchema,
  });
}

function mutateOwner(payload, name, mutation) {
  const target = payload.storage.find(candidate => candidate.name === name);
  assert(target, `missing owner ${name}`);
  mutation(target);
}

function main() {
  if (process.argv.length !== 3) usage();
  const filename = path.resolve(process.argv[2]);
  const sourceRaw = zlib.gunzipSync(fs.readFileSync(filename));
  const sourceEnvelope = JSON.parse(sourceRaw.toString("ascii"));
  assert.equal(sourceEnvelope.schema, adapter.SOURCE_SCHEMA);

  const replaySchema =
    "sagejs.pari-class-group/row23-neutral-publication-replay-v1";
  const authority = sourceAuthority(sourceRaw);
  const prepared = adapter.prepareRow23NeutralResult(sourceRaw, authority, {
    publicationReplaySchema: replaySchema,
  });
  assert.equal(prepared.status, "ready-for-out-of-band-publication-authority");
  assert.equal(prepared.sourceSha256, neutral.sha256Bytes(sourceRaw));
  assert.equal(prepared.correspondenceComplete, true);
  assert.equal(prepared.publicComplete, false);
  assert(Object.isFrozen(prepared));

  const sealed = Buffer.from(prepared.sealedEnvelopeHex, "hex");
  const neutralEnvelope = JSON.parse(sealed.toString("ascii"));
  const payload = neutralEnvelope.payload;
  neutral.validatePayload(payload);
  assert.equal(payload.field.id, adapter.FIELD_ID);
  assert.deepEqual(payload.field.definingPolynomialAscending, adapter.POLYNOMIAL);
  assert.deepEqual(payload.classGroup.invariantFactors, ["6"]);
  assert.equal(payload.classGroup.classNumber, "6");
  assert.equal(payload.unitGroup.rank, "4");
  assert.equal(payload.unitGroup.torsionOrder, "2");
  assert(payload.source.assumptions.every(item => item.disposition === "assumed"));
  const owners = ownerMap(payload);
  assert.deepEqual(
    Buffer.from(logical(owners.get("row23-source-envelope")).map(Number)),
    sourceRaw,
  );
  assert.deepEqual(
    logical(owners.get("class-generator-ideals")),
    sourceEnvelope.payload.classGroup.generatorIdeals[0],
  );
  assert.deepEqual(
    logical(owners.get("accepted-regulator-packed")),
    sourceEnvelope.payload.regulator.value,
  );
  assert.deepEqual(
    logical(owners.get("exact-unit-coordinates")),
    sourceEnvelope.payload.units.fundamental.coordinates,
  );
  assert.deepEqual(
    logical(owners.get("exact-unit-inverses")),
    sourceEnvelope.payload.units.fundamental.inverses,
  );

  const publicationAuthority = finalAuthority(prepared, payload, replaySchema);
  const publisher = new neutral.ClassUnitCorrespondencePublisher();
  const published = adapter.publishPreparedRow23NeutralResult(
    prepared,
    publicationAuthority,
    publisher,
  );
  assert.equal(published, publisher.current());
  assert.equal(
    adapter.publishPreparedRow23NeutralResult(
      prepared,
      publicationAuthority,
      publisher,
    ),
    published,
  );
  assert.deepEqual(published.detachedPayload(), payload);

  let sourceMutationsRejected = 0;
  function rejectSource(mutator) {
    const changed = structuredClone(sourceEnvelope);
    mutator(changed.payload);
    const raw = canonicalEnvelope(changed.payload);
    assert.throws(
      () =>
        adapter.prepareRow23NeutralResult(raw, sourceAuthority(raw), {
          publicationReplaySchema: replaySchema,
        }),
      adapter.Row23NeutralAdapterFailure,
    );
    sourceMutationsRejected += 1;
  }
  rejectSource(value => {
    value.classGroup.presentation.W[0] = "7";
  });
  rejectSource(value => {
    value.classGroup.generatorIdeals[0][0] = "8";
  });
  rejectSource(value => {
    value.classGroup.compactPrincipalOrderWitnesses[0].factorBaseExponents[0] =
      "7";
  });
  rejectSource(value => {
    value.units.fundamental.coordinates[0] = String(
      BigInt(value.units.fundamental.coordinates[0]) + 1n,
    );
  });
  rejectSource(value => {
    value.units.fundamental.inverses[0] = String(
      BigInt(value.units.fundamental.inverses[0]) + 1n,
    );
  });
  rejectSource(value => {
    value.units.fundamental.norms[0] = "1";
  });
  rejectSource(value => {
    value.units.torsion.generator[0] = "1";
  });
  rejectSource(value => {
    value.regulator.value[0] = String(BigInt(value.regulator.value[0]) + 1n);
  });
  rejectSource(value => {
    value.assumptions[0] += " changed";
  });
  rejectSource(value => {
    value.terminal.correspondenceComplete = false;
  });
  rejectSource(value => {
    value.terminal.publicComplete = true;
  });

  let payloadMutationsRejected = 0;
  function rejectPayload(mutator) {
    const changed = structuredClone(payload);
    mutator(changed);
    const raw = neutral.sealClassUnitCorrespondenceResult(changed);
    const changedAuthority = neutral.createDetachedClassUnitAuthority({
      envelopeSha256: neutral.sha256Bytes(raw),
      mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
      replay: publicationAuthority.replay,
      replaySchema,
    });
    assert.throws(() =>
      neutral.verifyClassUnitCorrespondenceResult(raw, changedAuthority),
    );
    payloadMutationsRejected += 1;
  }
  rejectPayload(value => {
    value.field.id += "-changed";
  });
  rejectPayload(value => {
    value.classGroup.classNumber = "7";
    value.classGroup.invariantFactors[0] = "7";
  });
  rejectPayload(value => {
    value.source.assumptions[0].statement += " changed";
  });
  rejectPayload(value => {
    mutateOwner(value, "class-generator-ideals", target => {
      target.entries[0] = "8";
    });
  });
  rejectPayload(value => {
    mutateOwner(value, "class-presentation", target => {
      target.entries[0] = String(BigInt(target.entries[0]) + 1n);
    });
  });
  rejectPayload(value => {
    mutateOwner(value, "class-principal-witnesses", target => {
      target.entries[0] = String(BigInt(target.entries[0]) + 1n);
    });
  });
  rejectPayload(value => {
    mutateOwner(value, "exact-unit-coordinates", target => {
      target.entries[0] = String(BigInt(target.entries[0]) + 1n);
    });
  });
  rejectPayload(value => {
    mutateOwner(value, "exact-unit-inverses", target => {
      target.entries[0] = String(BigInt(target.entries[0]) + 1n);
    });
  });
  rejectPayload(value => {
    mutateOwner(value, "exact-unit-norms", target => {
      target.entries[0] = "1";
    });
  });
  rejectPayload(value => {
    mutateOwner(value, "accepted-regulator-packed", target => {
      target.entries[0] = String(BigInt(target.entries[0]) + 1n);
    });
  });
  rejectPayload(value => {
    mutateOwner(value, "torsion-generator", target => {
      target.entries[0] = "1";
    });
  });
  rejectPayload(value => {
    mutateOwner(value, "row23-source-envelope", target => {
      target.entries[0] = String(BigInt(target.entries[0]) + 1n);
    });
  });

  let identityAttacksRejected = 0;
  assert.throws(
    () =>
      adapter.prepareRow23NeutralResult(
        sourceRaw,
        { ...authority },
        { publicationReplaySchema: replaySchema },
      ),
    adapter.Row23NeutralAdapterFailure,
  );
  identityAttacksRejected += 1;
  const wrongDigestAuthority = adapter.createDetachedRow23SourceAuthority({
    mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
    replay: authority.replay,
    sourceSha256: "0".repeat(64),
  });
  assert.throws(
    () =>
      adapter.prepareRow23NeutralResult(sourceRaw, wrongDigestAuthority, {
        publicationReplaySchema: replaySchema,
      }),
    adapter.Row23NeutralAdapterFailure,
  );
  identityAttacksRejected += 1;
  const badReceiptAuthority = sourceAuthority(sourceRaw, {
    mutateReceipt(receipt) {
      receipt.correspondenceComplete = false;
    },
  });
  assert.throws(
    () =>
      adapter.prepareRow23NeutralResult(sourceRaw, badReceiptAuthority, {
        publicationReplaySchema: replaySchema,
      }),
    adapter.Row23NeutralAdapterFailure,
  );
  identityAttacksRejected += 1;

  const conflictPayload = structuredClone(payload);
  conflictPayload.source.assumptions[0].statement += " changed";
  const conflictRaw = neutral.sealClassUnitCorrespondenceResult(conflictPayload);
  const conflictPrepared = {
    ...prepared,
    envelopeSha256: neutral.sha256Bytes(conflictRaw),
    sealedEnvelopeHex: conflictRaw.toString("hex"),
  };
  const permissiveConflictAuthority = neutral.createDetachedClassUnitAuthority({
    envelopeSha256: conflictPrepared.envelopeSha256,
    mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
    replay: candidate => ({
      correspondence_complete: true,
      fieldId: adapter.FIELD_ID,
      mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
      payloadSha256: neutral.sha256Canonical(candidate),
      public_complete: false,
      schema: replaySchema,
    }),
    replaySchema,
  });
  assert.throws(
    () =>
      adapter.publishPreparedRow23NeutralResult(
        conflictPrepared,
        permissiveConflictAuthority,
        publisher,
      ),
    neutral.ClassUnitResultConflict,
  );
  assert.equal(publisher.current(), published);

  console.log(
    JSON.stringify(
      {
        schema:
          "sagejs.pari-class-group/row23-terminal-neutral-adapter-check-v1",
        fieldId: adapter.FIELD_ID,
        sourceSha256: prepared.sourceSha256,
        sourcePayloadSha256: sourceEnvelope.payloadSha256,
        mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
        envelopeSha256: prepared.envelopeSha256,
        classNumber: 6,
        invariantFactors: [6],
        exactClassGenerators: 1,
        exactUnits: 4,
        torsionOrder: 2,
        sourceMutationsRejected,
        payloadMutationsRejected,
        identityAttacksRejected,
        atomicPublication: true,
        idempotentPublication: true,
        conflictPreservedPublication: true,
        coldReplay: true,
        artifactAutoDiscovery: false,
        freshPreparation: false,
        timingClaim: false,
        correspondenceComplete: true,
        publicComplete: false,
      },
      null,
      2,
    ),
  );
}

try {
  main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
