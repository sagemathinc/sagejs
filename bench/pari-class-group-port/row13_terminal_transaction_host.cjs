"use strict";

// Connected row-13 transaction helpers.  The only mathematical inputs are the
// authenticated prepared-number-field projection and immutable prepared root.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { runPreparedGateC, validateBoundary } = require(
  "./row13_prepared_gate_c_host.cjs"
);
const {
  runRow13Post1006Terminal,
} = require("./row13_post1006_terminal_host.cjs");
const classCoordinator = require("./row13_terminal_class_coordinator.cjs");
const unitCoordinator = require("./row13_rank2_c5_c6_coordinator.cjs");
const c7 = require("./row13_c7_result_composer.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");

const ROWS = 999;
const COLUMNS = 1006;
const PLACES = 3;
const DEGREE = 4;
const RECORD_RESERVE = 10110;
// Canonical JSON digests bind this terminal transaction to the immutable
// prepared projection and owner root.  validateBoundary checks their linked
// authority fields; these checks also reject mutations to mathematical data
// outside the boundary's structural subset.
const PREPARED_CANONICAL_SHA256 =
  "8e1ca4ebfd65d2e8c138924897f7cc060e7336089ebbeb7841387899ae4b96a6";
// Root identity is mathematical/provenance identity.  Per-process telemetry
// is retained when present but cannot change the authority of the root.
const ROOT_SEMANTIC_SCHEMA =
  "sagejs.pari-class-group/row13-prepared-root-semantic-v1";
const ROOT_SEMANTIC_SHA256 =
  "989aa45eb0792587c6fa8a92d6162c899878fbd61a7a6518b32efed2457ae46c";

const sha256 = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
const hash = (value) => sha256(Buffer.from(JSON.stringify(value)));
const strings = (values) => values.map(String);

function semanticRoot(root) {
  const value = structuredClone(root);
  assert(value.execution && typeof value.execution === "object");
  const telemetry = ["elapsedNs", "maxRssKiB"].filter((key) =>
    Object.hasOwn(value.execution, key));
  assert(telemetry.length === 0 || telemetry.length === 2,
    "root execution telemetry must be wholly present or absent");
  if (telemetry.length) {
    assert.match(value.execution.elapsedNs, /^(0|[1-9][0-9]*)$/);
    assert(Number.isSafeInteger(value.execution.maxRssKiB) &&
      value.execution.maxRssKiB >= 0);
  }
  delete value.execution.elapsedNs;
  delete value.execution.maxRssKiB;
  return value;
}

function semanticRootAuthority(root) {
  return { schema: ROOT_SEMANTIC_SCHEMA, sha256: hash(semanticRoot(root)) };
}

function synthesizeMetadata(preparedEnvelope, root) {
  validateBoundary(preparedEnvelope, root);
  assert.equal(hash(preparedEnvelope), PREPARED_CANONICAL_SHA256);
  assert.equal(semanticRootAuthority(root).sha256, ROOT_SEMANTIC_SHA256);
  const prepared = structuredClone(preparedEnvelope.data);
  const descriptorGenerators = root.selectedDescriptors.flatMap(
    (row) => row.generator,
  );
  const metadata = {
    authority: {
      preparedAuthoritySha256: preparedEnvelope.authoritySha256,
      preparedRootSha256: semanticRootAuthority(root).sha256,
      tauAuthority:
        "authenticated-initial-factor-descriptor-column-to-row",
    },
    policy: {
      degree: DEGREE,
      precision: Number(prepared.precision),
      rows: ROWS,
      target: COLUMNS,
      additional: COLUMNS - ROWS,
      recordReserve: RECORD_RESERVE,
      need: Number(root.handoff.need),
      Nrelid: Number(root.handoff.Nrelid),
      failLimit: 1000,
      C1: Number(root.rootState[1]),
      C2: Number(root.rootState[2]),
      scale: 4000 / (Math.PI * Math.PI),
      hnfK0: root.factor.subfactor.length,
    },
    prepared,
    factor: {
      rationalPrimes: strings(root.factor.rationalPrimes),
      groupOffsets: strings(root.factor.groupOffsets),
      groupCounts: strings(root.factor.groupCounts),
      groupComplete: strings(root.factor.groupComplete),
      relationPrimes: strings(root.factor.relationPrimes),
      ramification: strings(root.factor.ramification),
      residueDegrees: strings(root.factor.residueDegrees),
      generators: strings(descriptorGenerators),
      inertFlags: strings(root.factor.inertFlags),
      groupTau: strings(root.factor.tau),
      packetIds: Array.from({ length: ROWS }, (_, index) => String(index + 1)),
      packetIdeals: strings(root.factor.packetIdeals),
      packetNorms: strings(root.factor.packetNorms),
      factorProduct: String(root.baseState[6]),
      permutation: strings(root.factor.permutation),
      subfactor: strings(root.factor.subfactor),
      searchIdeals: strings(root.handoff.searchIdeals),
    },
  };
  return {
    schema: "sagejs.pari-class-group/row13-connected-factor-metadata-v1",
    metadata,
    metadataSha256: hash(metadata),
  };
}

function checkpointHashes(live) {
  const records = strings(live.collectorValues.relation_records.toArray());
  const logs = strings(live.collectorValues.log_embeddings.toArray());
  return live.checkpoints.map((checkpoint) => ({
    columns: checkpoint.columns,
    state: checkpoint.state,
    hashes: {
      relations: hash(records.slice(0, ROWS * checkpoint.columns)),
      logs: hash(logs.slice(0, 7 * PLACES * checkpoint.columns)),
      h: hash(checkpoint.h),
      dep: hash(checkpoint.dep),
      b: hash(checkpoint.b),
      c: hash(checkpoint.c),
      perm: hash(checkpoint.perm),
    },
  }));
}

function acceptedOwner(preparedEnvelope, root, live, metadataReceipt) {
  const values = live.collectorValues;
  const owner = {
    schema: "sagejs.pari-class-group/row13-accepted-relation-owner-v1",
    field: {
      polynomial: strings(preparedEnvelope.data.prep_polynomial),
      degree: DEGREE,
      signature: [2, 1],
      precision: Number(preparedEnvelope.data.precision),
    },
    ancestry: {
      preparedAuthoritySha256: preparedEnvelope.authoritySha256,
      preparedRootSha256: semanticRootAuthority(root).sha256,
      factorMetadataSha256: metadataReceipt.metadataSha256,
    },
    schedule: {
      relationCounts: live.checkpoints.map((checkpoint) => checkpoint.columns),
      collectionPasses: live.collectionPasses,
      passTrace: live.passTrace,
      checkpoints: checkpointHashes(live),
    },
    capacity: {
      ownerBytesUpperBound: live.ownerBytesUpperBound,
      rssLimitBytes: 4 * 1024 ** 3,
      processLimitSeconds: 600,
    },
    acceptanceBoundary: {
      rows: ROWS,
      hRows: 1,
      bColumns: 998,
      totalColumns: COLUMNS,
      places: PLACES,
      degree: DEGREE,
      previousAcceptanceColumns: 0,
      cacheChanged: true,
    },
    final: {
      relationState: strings(values.relation_state.toArray()),
      records: strings(values.relation_records.toArray()).slice(
        0,
        ROWS * COLUMNS,
      ),
      generators: strings(values.generators.toArray()).slice(
        0,
        DEGREE * COLUMNS,
      ),
      hashes: strings(values.relation_hashes.toArray()).slice(0, COLUMNS),
      metadata: strings(values.relation_metadata.toArray()).slice(
        0,
        3 * COLUMNS,
      ),
      logs: strings(values.log_embeddings.toArray()).slice(
        0,
        7 * PLACES * COLUMNS,
      ),
      hnfState: strings(live.resident.state),
      h: strings(live.resident.h),
      dep: strings(live.resident.dep),
      b: strings(live.resident.b),
      c: strings(live.resident.c),
      perm: strings(live.resident.perm),
    },
    exclusions: [
      "terminal class group",
      "Smith invariants",
      "regulator",
      "units",
      "capacity tails",
      "frozen W0 as a runtime input",
    ],
  };
  return { owner, ownerSha256: hash(owner) };
}

async function runThroughPost1006(preparedEnvelope, root) {
  validateBoundary(preparedEnvelope, root);
  const started = process.hrtime.bigint();
  const metadata = synthesizeMetadata(preparedEnvelope, root);
  const gateStarted = process.hrtime.bigint();
  const live = await runPreparedGateC(preparedEnvelope, root);
  const gateElapsedNs = process.hrtime.bigint() - gateStarted;
  const accepted = acceptedOwner(
    preparedEnvelope,
    root,
    live,
    metadata,
  );
  const terminalStarted = process.hrtime.bigint();
  const terminal = await runRow13Post1006Terminal(
    accepted.owner,
    metadata,
  );
  const terminalElapsedNs = process.hrtime.bigint() - terminalStarted;
  assert.equal(terminal.acceptedOwnerSha256, accepted.ownerSha256);
  return {
    accepted,
    live,
    metadata,
    terminal,
    elapsedNs: String(process.hrtime.bigint() - started),
    stageElapsedNs: {
      gateC: String(gateElapsedNs),
      post1006: String(terminalElapsedNs),
    },
    maxRssKiB: process.resourceUsage().maxRSS,
  };
}

function writeImmutable(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    assert(fs.readFileSync(file).equals(bytes), `immutable collision at ${file}`);
    assert.equal(fs.statSync(file).mode & 0o222, 0, `${file} became mutable`);
    return;
  }
  const temporary = path.join(
    path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}`,
  );
  fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o400 });
  try {
    fs.renameSync(temporary, file);
    fs.chmodSync(file, 0o444);
  } catch (error) {
    fs.rmSync(temporary, { force: true });
    throw error;
  }
}

function rejectTerminalMutations(inputs) {
  let rejected = 0;
  const reject = (mutate) => {
    const candidate = structuredClone(inputs);
    mutate(candidate);
    assert.throws(() => c7.prepareRow13C7Result(candidate));
    rejected += 1;
  };
  reject((candidate) => {
    candidate.accepted.field.polynomial[0] = "-20000000009";
  });
  reject((candidate) => {
    candidate.post1006.acceptedOwnerSha256 = "0".repeat(64);
  });
  reject((candidate) => {
    candidate.post1006.invariants = ["3"];
  });
  reject((candidate) => {
    candidate.classOwner.ancestry.acceptedOwnerSha256 = "0".repeat(64);
  });
  reject((candidate) => {
    candidate.classOwner.classWitness.classGroup.classNumber = "3";
  });
  reject((candidate) => {
    candidate.unitOwner.ancestry.acceptedOwnerSha256 = "0".repeat(64);
  });
  reject((candidate) => {
    candidate.unitOwner.status = "given";
  });
  reject((candidate) => {
    candidate.unitOwner.precision = 128;
  });
  return rejected;
}

async function runPreparedComplete(preparedEnvelope, root, outputDirectory) {
  const started = process.hrtime.bigint();
  const connected = await runThroughPost1006(preparedEnvelope, root);
  const accepted = connected.accepted.owner;
  const metadata = connected.metadata;
  const post1006 = connected.terminal;
  connected.live = null;
  if (global.gc) global.gc();

  const classStarted = process.hrtime.bigint();
  const klass = await classCoordinator.composeInMemory(accepted, metadata);
  const classElapsedNs = process.hrtime.bigint() - classStarted;
  const unitStarted = process.hrtime.bigint();
  const unit = unitCoordinator.composeInMemory(accepted, post1006, metadata);
  const unitElapsedNs = process.hrtime.bigint() - unitStarted;
  const terminalInputs = {
    accepted,
    post1006,
    classOwner: klass.owner,
    unitOwner: unit.owner,
  };
  const mutationChecks = rejectTerminalMutations(terminalInputs);
  const prepared = c7.prepareRow13C7Result(terminalInputs);
  const raw = Buffer.from(prepared.sealedEnvelopeHex, "hex");
  const trustedPayload = structuredClone(JSON.parse(raw).payload);
  const replay = (candidate) => {
    assert.deepEqual(candidate, trustedPayload);
    const repeated = c7.prepareRow13C7Result({
      accepted,
      post1006,
      classOwner: klass.owner,
      unitOwner: unit.owner,
    });
    assert.deepEqual(
      JSON.parse(Buffer.from(repeated.sealedEnvelopeHex, "hex")).payload,
      trustedPayload,
    );
    return {
      correspondence_complete: true,
      fieldId: c7.FIELD_ID,
      mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
      payloadSha256: neutral.sha256Canonical(candidate),
      public_complete: false,
      schema: c7.PUBLICATION_REPLAY_SCHEMA,
    };
  };
  const authority = neutral.createDetachedClassUnitAuthority({
    envelopeSha256: neutral.sha256Bytes(raw),
    mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
    replay,
    replaySchema: c7.PUBLICATION_REPLAY_SCHEMA,
  });
  const publisher = new neutral.ClassUnitCorrespondencePublisher();
  const publication = publisher.publish(raw, authority);
  assert.equal(publisher.publish(raw, authority), publication);
  const outputPath = path.join(
    outputDirectory,
    `row13-prepared-complete-${prepared.sealedEnvelopeSha256}.json`,
  );
  writeImmutable(outputPath, raw);
  return {
    schema: "sagejs.pari-class-group/row13-prepared-complete-receipt-v1",
    path: outputPath,
    sha256: prepared.sealedEnvelopeSha256,
    bytes: raw.length,
    acceptedOwnerSha256: connected.accepted.ownerSha256,
    metadataSha256: metadata.metadataSha256,
    classOwnerSha256: neutral.sha256Canonical(klass.owner),
    unitOwnerSha256: unit.ownerSha256,
    mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
    correspondenceComplete: true,
    publicComplete: false,
    frozenW0RuntimeInput: false,
    elapsedNs: String(process.hrtime.bigint() - started),
    stageElapsedNs: {
      ...connected.stageElapsedNs,
      classWitnesses: String(classElapsedNs),
      units: String(unitElapsedNs),
    },
    maxRssKiB: process.resourceUsage().maxRSS,
    relationState: accepted.final.relationState,
    collectionPasses: accepted.schedule.collectionPasses,
    classGroup: { invariantFactors: ["2"], classNumber: "2" },
    unitMaterialization: "not_given(LARGE)",
    mutationChecks,
  };
}

module.exports = {
  acceptedOwner,
  runPreparedComplete,
  runThroughPost1006,
  semanticRoot,
  semanticRootAuthority,
  synthesizeMetadata,
};
