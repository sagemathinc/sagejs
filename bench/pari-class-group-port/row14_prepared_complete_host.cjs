"use strict";

// Connected row-14 transaction: authenticated prepared input -> Gate C ->
// post-806 arithmetic -> class witnesses and compact units -> C7 envelope.
// No frozen W0 trace or previously published mathematical answer is an input.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const { runPreparedGateC, validateBoundary } =
  require("./row14_prepared_gate_c_host.cjs");
const { runRow14Post806Terminal } = require("./row14_post806_terminal_host.cjs");
const composer = require("./row14_c7_result_composer.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");

const ROOT = path.resolve(__dirname, "../..");
const ROWS = 799, COLUMNS = 806, PLACES = 3, DEGREE = 4;
const CAPSULE_SHA256 =
  "33d2606a151ecf0ba5a73c247ecf3f219ff84a2341048ebbbe374ecd9c7939b1";
const METADATA_SHA256 = composer.METADATA_SHA256;
const ACCEPTED_SHA256 = composer.ACCEPTED_OWNER_SHA256;
const INPUT_REPLAY_SCHEMA = composer.INPUT_REPLAY_SCHEMA;
const FINAL_REPLAY_SCHEMA = composer.PUBLICATION_REPLAY_SCHEMA;
// This is a conservative, predeclared allocation envelope, not a measured
// answer. Gate C also reports its smaller actual live allocation bound.
const ACCEPTED_CAPACITY_BOUND = 1_633_313_800;

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const hash = value => sha256(Buffer.from(JSON.stringify(value)));
const strings = values => values.map(String);

function synthesizeMetadata(preparedEnvelope, root, { verifyDigest = true } = {}) {
  validateBoundary(preparedEnvelope, root);
  const prepared = structuredClone(preparedEnvelope.data);
  const descriptorGenerators = root.selectedDescriptors.flatMap(row => row.generator);
  const metadata = {
    schema: "sagejs.pari-class-group/row14-connected-factor-metadata-v1",
    authority: { capsuleSha256: CAPSULE_SHA256,
      preparedAuthoritySha256: preparedEnvelope.authoritySha256,
      tauAuthority: "authenticated-initial-factor-descriptor-column-to-row" },
    policy: { degree: DEGREE, precision: Number(prepared.precision), rows: ROWS,
      target: COLUMNS, additional: COLUMNS - ROWS, recordReserve: 8110,
      need: Number(root.handoff.need), Nrelid: Number(root.handoff.Nrelid),
      failLimit: 800, C1: Number(root.rootState[1]), C2: Number(root.rootState[2]),
      scale: 4000 / (Math.PI * Math.PI), hnfK0: root.factor.subfactor.length },
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
      inertFlags: strings(root.factor.inertFlags), groupTau: strings(root.factor.tau),
      packetIds: Array.from({ length: ROWS }, (_, index) => String(index + 1)),
      packetIdeals: strings(root.factor.packetIdeals),
      packetNorms: strings(root.factor.packetNorms),
      factorProduct: String(root.baseState[6]),
      permutation: strings(root.factor.permutation),
      subfactor: strings(root.factor.subfactor),
      searchIdeals: strings(root.handoff.searchIdeals),
    },
  };
  if (verifyDigest) assert.equal(hash(metadata), METADATA_SHA256,
    "prepared projection no longer reconstructs authenticated factor metadata");
  return { metadata, metadataSha256: METADATA_SHA256 };
}

function checkpointHashes(live) {
  const records = strings(live.collectorValues.relation_records.toArray());
  const logs = strings(live.collectorValues.log_embeddings.toArray());
  return live.checkpoints.map(checkpoint => ({
    columns: checkpoint.columns, state: checkpoint.state,
    hashes: {
      relations: hash(records.slice(0, ROWS * checkpoint.columns)),
      logs: hash(logs.slice(0, 7 * PLACES * checkpoint.columns)),
      h: hash(checkpoint.h), dep: hash(checkpoint.dep), b: hash(checkpoint.b),
      c: hash(checkpoint.c), perm: hash(checkpoint.perm),
    },
  }));
}

function acceptedOwner(preparedEnvelope, root, live, metadata,
  { verifyDigest = true } = {}) {
  const values = live.collectorValues;
  const records = strings(values.relation_records.toArray()).slice(0, ROWS * COLUMNS);
  const logs = strings(values.log_embeddings.toArray()).slice(0, 7 * PLACES * COLUMNS);
  const owner = {
    schema: "sagejs.pari-class-group/row14-accepted-relation-owner-v1",
    field: { polynomial: strings(preparedEnvelope.data.prep_polynomial), degree: DEGREE },
    ancestry: { capsuleSha256: metadata.metadata.authority.capsuleSha256,
      factorMetadataSha256: metadata.metadataSha256 },
    schedule: { relationCounts: [42, 802, 804, 805, 806], collectionPasses: 8,
      passTrace: live.passTrace, checkpoints: checkpointHashes(live) },
    capacity: { ownerBytesUpperBound: ACCEPTED_CAPACITY_BOUND,
      rssLimitBytes: 4 * 1024 ** 3, processLimitSeconds: 600 },
    acceptanceBoundary: { rows: ROWS, hRows: 3, bColumns: 796,
      totalColumns: COLUMNS, places: PLACES, degree: DEGREE,
      previousAcceptanceColumns: 0, cacheChanged: true },
    final: {
      relationState: strings(values.relation_state.toArray()), records,
      generators: strings(values.generators.toArray()).slice(0, DEGREE * COLUMNS),
      hashes: strings(values.relation_hashes.toArray()).slice(0, COLUMNS),
      metadata: strings(values.relation_metadata.toArray()).slice(0, 3 * COLUMNS),
      logs, hnfState: strings(live.resident.state), h: strings(live.resident.h),
      dep: strings(live.resident.dep), b: strings(live.resident.b),
      c: strings(live.resident.c), perm: strings(live.resident.perm),
    },
    exclusions: ["terminal class group", "Smith invariants", "regulator", "units",
      "capacity tails", "frozen W0 as a runtime input"],
  };
  const plain = verifyDigest ? Buffer.from(JSON.stringify(owner)) : null;
  if (verifyDigest) assert.equal(sha256(plain), ACCEPTED_SHA256,
    "connected Gate C owner diverged from the accepted relation boundary");
  return { owner, plain };
}

function writeImmutable(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    assert(fs.readFileSync(file).equals(bytes), `immutable collision at ${file}`);
    assert.equal(fs.statSync(file).mode & 0o222, 0, `${file} became mutable`);
    return;
  }
  const temporary = path.join(path.dirname(file),
    `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}`);
  fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o400 });
  try { fs.renameSync(temporary, file); fs.chmodSync(file, 0o444); }
  catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
}

function runChecked(script, args, label, maxBuffer = 256 * 1024 * 1024) {
  const run = spawnSync(process.execPath, [path.join(__dirname, script), ...args], {
    cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer,
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=3072" },
  });
  assert.equal(run.status, 0, `${label}: ${run.stderr || run.stdout || run.error}`);
  return JSON.parse(run.stdout.trim().split(/\r?\n/).at(-1));
}

function replayBoundary(owner, ownerSha256) {
  const trusted = structuredClone(owner);
  const evidenceSha256 = neutral.sha256Canonical(trusted);
  return { owner, authority: { ownerSha256, replaySchema: INPUT_REPLAY_SCHEMA,
    replay(candidate) {
      assert.deepEqual(candidate, trusted);
      return { accepted: true, evidenceSha256, fieldId: composer.FIELD_ID,
        ownerSha256, schema: INPUT_REPLAY_SCHEMA };
    } } };
}

async function runPreparedComplete(preparedEnvelope, root, outputDirectory) {
  validateBoundary(preparedEnvelope, root);
  const started = process.hrtime.bigint();
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row14-prepared-complete-"));
  try {
    const metadata = synthesizeMetadata(preparedEnvelope, root);
    const metadataPath = path.join(temporary, "metadata.json");
    fs.writeFileSync(metadataPath, JSON.stringify(metadata));
    const gateStarted = process.hrtime.bigint();
    const live = await runPreparedGateC(preparedEnvelope, root);
    const gateElapsedNs = process.hrtime.bigint() - gateStarted;
    const accepted = acceptedOwner(preparedEnvelope, root, live, metadata);
    const acceptedPath = path.join(temporary, `row14-accepted-${ACCEPTED_SHA256}.json.gz`);
    writeImmutable(acceptedPath, zlib.gzipSync(accepted.plain, { level: 9, mtime: 0 }));

    const postStarted = process.hrtime.bigint();
    const post806 = await runRow14Post806Terminal(acceptedPath, metadataPath);
    const postElapsedNs = process.hrtime.bigint() - postStarted;
    const postPath = path.join(temporary, "post806.json");
    fs.writeFileSync(postPath, JSON.stringify(post806));

    const unitDirectory = path.join(temporary, "unit");
    const unitStarted = process.hrtime.bigint();
    const unitReceipt = runChecked("row14_rank2_c5_c6_coordinator.cjs",
      ["--accepted-owner", acceptedPath, "--post806-output", postPath,
        "--metadata", metadataPath, "--output-dir", unitDirectory], "C5/C6");
    const unitElapsedNs = process.hrtime.bigint() - unitStarted;
    assert.equal(unitReceipt.sha256, composer.UNIT_OWNER_SHA256);

    const classDirectory = path.join(temporary, "class");
    const classStarted = process.hrtime.bigint();
    const classReceipt = runChecked("row14_terminal_class_witness_coordinator.cjs",
      [acceptedPath, metadataPath, classDirectory], "terminal class ancestry");
    const classElapsedNs = process.hrtime.bigint() - classStarted;
    const classOwner = JSON.parse(fs.readFileSync(classReceipt.path));
    const unitOwner = JSON.parse(fs.readFileSync(unitReceipt.path));
    const stablePost = { schema: composer.POST806_SCHEMA,
      ownerSha256: post806.ownerSha256, metadataSha256: post806.metadataSha256,
      status: String(post806.status), regulator: strings(post806.regulator),
      unitRelations: strings(post806.unitRelations),
      unitRelationsSha256: post806.unitRelationsSha256,
      invariants: strings(post806.invariants), classNumber: String(post806.classNumber),
      terminalState: strings(post806.terminalState),
      completeness: structuredClone(post806.completeness) };
    const inputs = {
      accepted: replayBoundary(accepted.owner, ACCEPTED_SHA256),
      post806: replayBoundary(stablePost, neutral.sha256Canonical(stablePost)),
      classOwner: replayBoundary(classOwner, classReceipt.sha256),
      unitOwner: replayBoundary(unitOwner, unitReceipt.sha256),
    };
    const prepared = composer.prepareRow14C7Result(inputs);
    assert.equal(prepared.correspondenceComplete, true);
    assert.equal(prepared.publicComplete, false);
    const raw = Buffer.from(prepared.sealedEnvelopeHex, "hex");
    const trustedPayload = structuredClone(JSON.parse(raw).payload);
    const replay = candidate => {
      assert.deepEqual(candidate, trustedPayload);
      const repeated = composer.prepareRow14C7Result(inputs);
      assert.deepEqual(JSON.parse(Buffer.from(repeated.sealedEnvelopeHex, "hex")).payload,
        trustedPayload);
      return { correspondence_complete: true, fieldId: composer.FIELD_ID,
        mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
        payloadSha256: neutral.sha256Canonical(candidate), public_complete: false,
        schema: FINAL_REPLAY_SCHEMA };
    };
    const authority = neutral.createDetachedClassUnitAuthority({
      envelopeSha256: neutral.sha256Bytes(raw),
      mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
      replay, replaySchema: FINAL_REPLAY_SCHEMA });
    const publisher = new neutral.ClassUnitCorrespondencePublisher();
    const published = composer.publishPreparedRow14C7Result(prepared, authority, publisher);
    assert.equal(composer.publishPreparedRow14C7Result(prepared, authority, publisher), published);
    const outputPath = path.join(outputDirectory,
      `row14-prepared-complete-${prepared.sealedEnvelopeSha256}.json`);
    writeImmutable(outputPath, raw);
    return { schema: "sagejs.pari-class-group/row14-prepared-complete-receipt-v1",
      path: outputPath, sha256: prepared.sealedEnvelopeSha256, bytes: raw.length,
      acceptedOwnerSha256: ACCEPTED_SHA256, metadataSha256: METADATA_SHA256,
      classOwnerSha256: classReceipt.sha256, unitOwnerSha256: unitReceipt.sha256,
      mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
      correspondenceComplete: true, publicComplete: false,
      frozenW0RuntimeInput: false, ownerBytesUpperBound: live.ownerBytesUpperBound,
      elapsedNs: String(process.hrtime.bigint() - started),
      stageElapsedNs: { gateC: String(gateElapsedNs), post806: String(postElapsedNs),
        units: String(unitElapsedNs), classWitnesses: String(classElapsedNs) },
      maxRssKiB: process.resourceUsage().maxRSS,
      relationState: strings(live.collectorValues.relation_state.toArray()),
      collectionPasses: live.collectionPasses };
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
}

module.exports = { ACCEPTED_CAPACITY_BOUND, acceptedOwner, runPreparedComplete,
  synthesizeMetadata };
