#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const SELF = __filename;
const composer = require("./row14_c7_result_composer.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");
const ACCEPTED_DEFAULT = path.join("/tmp/row14-accepted-owner",
  `row14-accepted-${composer.ACCEPTED_OWNER_SHA256}.json.gz`);
const POST_DEFAULT = "/tmp/row14-post806-current.json";

function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function changeInteger(values, index = 0) {
  values[index] = String(BigInt(values[index]) + 1n);
}
function changeIntegerProperty(value, property) {
  value[property] = String(BigInt(value[property]) + 1n);
}
function changeStringProperty(value, property) {
  value[property] = `${value[property]}-mutated`;
}
function stablePost806(value) {
  return {
    schema: composer.POST806_SCHEMA,
    ownerSha256: value.ownerSha256,
    metadataSha256: value.metadataSha256,
    status: String(value.status),
    regulator: value.regulator.map(String),
    unitRelations: value.unitRelations.map(String),
    unitRelationsSha256: value.unitRelationsSha256,
    invariants: value.invariants.map(String),
    classNumber: String(value.classNumber),
    terminalState: value.terminalState.map(String),
    completeness: structuredClone(value.completeness),
  };
}

function replayBoundary(owner, ownerSha256, trustedOwner = owner) {
  const trusted = structuredClone(trustedOwner);
  const evidenceSha256 = neutral.sha256Canonical(trusted);
  return {
    owner,
    authority: {
      ownerSha256,
      replaySchema: composer.INPUT_REPLAY_SCHEMA,
      replay(candidate) {
        assert.deepEqual(candidate, trusted);
        return { accepted: true, evidenceSha256, fieldId: composer.FIELD_ID,
          ownerSha256, schema: composer.INPUT_REPLAY_SCHEMA };
      },
    },
  };
}

function permissiveBoundary(owner, ownerSha256) {
  const evidenceSha256 = neutral.sha256Canonical(owner);
  return {
    owner,
    authority: {
      ownerSha256,
      replaySchema: composer.INPUT_REPLAY_SCHEMA,
      replay() { return { accepted: true, evidenceSha256, fieldId: composer.FIELD_ID,
        ownerSha256, schema: composer.INPUT_REPLAY_SCHEMA }; },
    },
  };
}

function loadInputs(classPath, acceptedPath, postPath, unitPath) {
  const acceptedPlain = zlib.gunzipSync(fs.readFileSync(acceptedPath));
  assert.equal(sha(acceptedPlain), composer.ACCEPTED_OWNER_SHA256);
  const accepted = JSON.parse(acceptedPlain);
  const post806 = stablePost806(JSON.parse(fs.readFileSync(postPath, "utf8")));
  const classBytes = fs.readFileSync(classPath);
  const classOwner = JSON.parse(classBytes);
  const unitBytes = fs.readFileSync(unitPath);
  const unitOwner = JSON.parse(unitBytes);
  return {
    owners: { accepted, post806, classOwner, unitOwner },
    hashes: {
      accepted: composer.ACCEPTED_OWNER_SHA256,
      post806: neutral.sha256Canonical(post806),
      classOwner: sha(classBytes),
      unitOwner: sha(unitBytes),
    },
  };
}

function boundaries(data, overrides = {}, permissive = new Set()) {
  const result = {};
  for (const name of ["accepted", "post806", "classOwner", "unitOwner"]) {
    const owner = overrides[name] || data.owners[name];
    result[name] = permissive.has(name) ?
      permissiveBoundary(owner, data.hashes[name]) :
      replayBoundary(owner, data.hashes[name], data.owners[name]);
  }
  return result;
}

function immutablePublish(raw, directory) {
  const digest = neutral.sha256Bytes(raw);
  fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `row14-c7-class-unit-result-${digest}.json`);
  if (fs.existsSync(destination)) {
    assert.equal(fs.statSync(destination).mode & 0o777, 0o444,
      "existing row14 C7 owner is mutable");
    assert.equal(sha(fs.readFileSync(destination)), digest,
      "existing row14 C7 owner changed");
  } else {
    const temporary = path.join(directory,
      `.${path.basename(destination)}.${process.pid}.${crypto.randomUUID()}`);
    fs.writeFileSync(temporary, raw, { flag: "wx", mode: 0o400 });
    try { fs.renameSync(temporary, destination); fs.chmodSync(destination, 0o444); }
    catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
  }
  return { bytes: raw.length, path: destination, sha256: digest };
}

function worker(argv) {
  const [classPath, unitPath, acceptedPath = ACCEPTED_DEFAULT, postPath = POST_DEFAULT,
    outputDirectory =
      path.join(os.tmpdir(), "sagejs-row14-c7-owner")] = argv;
  assert(classPath && unitPath,
    "usage: check_row14_c7_result_composer.cjs CLASS_OWNER UNIT_OWNER [ACCEPTED POST OUTPUT]");
  const data = loadInputs(classPath, acceptedPath, postPath, unitPath);
  // Until the stable owner is published, its digest is deliberately supplied
  // only by the detached authority.  The other two immutable identities are
  // fixed by the composer.
  assert.equal(data.hashes.accepted, composer.ACCEPTED_OWNER_SHA256);
  assert.equal(data.hashes.unitOwner, composer.UNIT_OWNER_SHA256,
    "wrong immutable C5/C6 owner; regenerate from the committed coordinator");
  const inputs = boundaries(data);
  const prepared = composer.prepareRow14C7Result(inputs);
  assert.equal(prepared.correspondenceComplete, true);
  assert.equal(prepared.publicComplete, false);
  const raw = Buffer.from(prepared.sealedEnvelopeHex, "hex");
  const envelope = JSON.parse(raw);
  const payload = envelope.payload;
  assert.deepEqual(payload.classGroup.invariantFactors, ["8", "24"]);
  assert.equal(payload.classGroup.classNumber, "192");
  assert.deepEqual(payload.unitGroup.materialization,
    { precisionBits: "192", reason: "LARGE", tag: "not_given" });
  assert.deepEqual(payload.field.definingPolynomialAscending, composer.POLYNOMIAL);
  assert.equal(payload.terminal.correspondence_complete, true);
  assert.equal(payload.terminal.public_complete, false);
  assert.equal(payload.honesty.outcome, "equal-bound-source-skip");
  const ownerMap = new Map(payload.storage.map(owner => [owner.name, owner]));
  assert.deepEqual(ownerMap.get("class-presentation").entries,
    ["24", "0", "0", "4", "4", "0", "5", "3", "2"]);
  assert.deepEqual(ownerMap.get("class-source-invariants").entries, ["24", "8"]);
  assert.equal(ownerMap.get("raw-relation-records").entries.length, 799 * 806);
  assert.equal(ownerMap.get("raw-to-unit-kernel-transform").entries.length, 806 * 7);
  assert.equal(ownerMap.get("factored-unit-transform").entries.length, 806 * 2);
  assert.equal(ownerMap.get("class-order-principal-coefficients").entries.length,
    806 * 2);
  assert.equal(ownerMap.get("factor-base-ideals").entries.length, 799 * 16);
  assert.deepEqual(ownerMap.get("regulator-enclosure").entries,
    data.owners.post806.regulator);

  // Re-run all input replays and exact joins as the out-of-band publication
  // authority.  Merely resealing JSON never grants mathematical authority.
  const trustedPayload = structuredClone(payload);
  function finalReplay(candidate) {
    assert.deepEqual(candidate, trustedPayload);
    const replayPrepared = composer.prepareRow14C7Result(inputs);
    const replayPayload = JSON.parse(Buffer.from(
      replayPrepared.sealedEnvelopeHex, "hex")).payload;
    assert.deepEqual(candidate, replayPayload);
    return {
      correspondence_complete: true, fieldId: composer.FIELD_ID,
      mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
      payloadSha256: neutral.sha256Canonical(candidate), public_complete: false,
      schema: composer.PUBLICATION_REPLAY_SCHEMA,
    };
  }
  function finalAuthority(bytes) {
    return neutral.createDetachedClassUnitAuthority({
      envelopeSha256: neutral.sha256Bytes(bytes),
      mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
      replay: finalReplay, replaySchema: composer.PUBLICATION_REPLAY_SCHEMA,
    });
  }
  const publisher = new neutral.ClassUnitCorrespondencePublisher();
  const published = composer.publishPreparedRow14C7Result(
    prepared, finalAuthority(raw), publisher);
  assert.equal(composer.publishPreparedRow14C7Result(
    prepared, finalAuthority(raw), publisher), published);
  assert.equal(published.sha256, prepared.sealedEnvelopeSha256);

  let mutationsRejected = 0;
  function authorityMutation(name, mutate) {
    const changed = structuredClone(data.owners[name]); mutate(changed);
    assert.throws(() => composer.prepareRow14C7Result(
      boundaries(data, { [name]: changed })), composer.Row14C7CompositionFailure);
    mutationsRejected += 1;
  }
  authorityMutation("accepted", value => { changeInteger(value.final.records); });
  authorityMutation("accepted", value => { changeInteger(value.final.generators); });
  authorityMutation("accepted", value => { changeInteger(value.final.logs); });
  authorityMutation("accepted", value => { changeInteger(value.final.b); });
  authorityMutation("accepted", value => { changeInteger(value.final.c); });
  authorityMutation("accepted", value => { changeInteger(value.final.perm); });
  authorityMutation("post806", value => { changeIntegerProperty(value, "classNumber"); });
  authorityMutation("post806", value => { changeInteger(value.regulator); });
  authorityMutation("post806", value => { changeInteger(value.unitRelations); });
  authorityMutation("post806", value => { changeInteger(value.terminalState, 3); });
  authorityMutation("classOwner", value => {
    changeInteger(value.factorBase.packetIdeals);
  });
  authorityMutation("classOwner", value => {
    changeInteger(value.factorBase.packetNorms);
  });
  authorityMutation("classOwner", value => {
    changeInteger(value.factorBase.packetIds);
  });
  authorityMutation("classOwner", value => {
    changeInteger(value.factorBase.relationPrimes);
  });
  authorityMutation("classOwner", value => { changeInteger(value.rawToPresentation); });
  authorityMutation("classOwner", value => { changeInteger(value.rawToUnitKernel); });
  authorityMutation("classOwner", value => {
    changeIntegerProperty(value.classWitness.witnesses[0], "order");
  });
  authorityMutation("classOwner", value => {
    changeInteger(value.classWitness.witnesses[0].idealHnf);
  });
  authorityMutation("unitOwner", value => { changeStringProperty(value, "reason"); });
  authorityMutation("unitOwner", value => { changeInteger(value.compact.unitTransform); });
  authorityMutation("unitOwner", value => { changeInteger(value.compact.getfuFactor); });

  // Coordinated re-authorization must still fail local exact join checks.
  function semanticMutation(name, mutate, expression = composer.Row14C7CompositionFailure) {
    const changed = structuredClone(data.owners[name]); mutate(changed);
    assert.throws(() => composer.prepareRow14C7Result(
      boundaries(data, { [name]: changed }, new Set([name]))), expression);
    mutationsRejected += 1;
  }
  const firstKernelCell = data.owners.classOwner.rawToUnitKernel.findIndex(
    value => value !== "0");
  assert(firstKernelCell >= 0, "class owner has an empty unit kernel");
  const kernelParticipant = firstKernelCell % 806;
  semanticMutation("accepted", value => {
    const at = kernelParticipant * 799;
    value.final.records[at] = String(BigInt(value.final.records[at]) + 1n);
  });
  const witnessParticipant =
    data.owners.classOwner.classWitness.witnesses[0].rawPrincipalProduct[0]
      .rawRelationIndex;
  semanticMutation("accepted", value => {
    const at = Number(witnessParticipant) * 4;
    value.final.generators[at] = String(BigInt(value.final.generators[at]) + 1n);
  });
  semanticMutation("post806", value => { changeIntegerProperty(value, "classNumber"); });
  semanticMutation("classOwner", value => {
    value.rawToUnitKernel[0] = String(BigInt(value.rawToUnitKernel[0]) + 1n);
  });
  semanticMutation("classOwner", value => {
    value.rawToPresentation[0] = String(BigInt(value.rawToPresentation[0]) + 1n);
  });
  semanticMutation("classOwner", value => {
    changeIntegerProperty(value.classWitness.witnesses[1], "order");
  });
  semanticMutation("unitOwner", value => { changeStringProperty(value, "reason"); });

  function rejectReseal(mutator) {
    const changed = structuredClone(payload); mutator(changed);
    const fraudulentRaw = neutral.sealClassUnitCorrespondenceResult(changed);
    const fraudulentPrepared = { ...prepared,
      sealedEnvelopeHex: fraudulentRaw.toString("hex"),
      sealedEnvelopeSha256: neutral.sha256Bytes(fraudulentRaw) };
    assert.throws(() => composer.publishPreparedRow14C7Result(
      fraudulentPrepared, finalAuthority(fraudulentRaw)), neutral.ClassUnitResultFailure);
    mutationsRejected += 1;
  }
  rejectReseal(value => { value.storage.find(
    owner => owner.name === "factored-unit-transform").entries[0] = String(
      BigInt(value.storage.find(owner => owner.name === "factored-unit-transform")
        .entries[0]) + 1n); });
  rejectReseal(value => { value.storage.find(
    owner => owner.name === "class-order-principal-coefficients").entries[0] = String(
      BigInt(value.storage.find(
        owner => owner.name === "class-order-principal-coefficients").entries[0]) + 1n); });
  rejectReseal(value => { value.storage.find(
    owner => owner.name === "regulator-enclosure").entries[0] = String(
      BigInt(value.storage.find(owner => owner.name === "regulator-enclosure")
        .entries[0]) + 1n); });
  rejectReseal(value => { value.classGroup.invariantFactors = ["4", "48"]; });
  rejectReseal(value => { value.unitGroup.materialization.reason = "PRECI"; });
  rejectReseal(value => { value.honesty.outcome = "not-required"; });
  const promoted = structuredClone(payload); promoted.terminal.public_complete = true;
  assert.throws(() => neutral.sealClassUnitCorrespondenceResult(promoted),
    neutral.ClassUnitResultFailure); mutationsRejected += 1;

  const conflictPayload = structuredClone(payload);
  conflictPayload.storage.find(owner => owner.name === "honesty-evidence").entries[0] = "5979";
  const conflictRaw = neutral.sealClassUnitCorrespondenceResult(conflictPayload);
  const conflictAuthority = neutral.createDetachedClassUnitAuthority({
    envelopeSha256: neutral.sha256Bytes(conflictRaw),
    mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
    replay(candidate) { return { correspondence_complete: true,
      fieldId: composer.FIELD_ID,
      mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
      payloadSha256: neutral.sha256Canonical(candidate), public_complete: false,
      schema: composer.PUBLICATION_REPLAY_SCHEMA }; },
    replaySchema: composer.PUBLICATION_REPLAY_SCHEMA,
  });
  assert.throws(() => publisher.publish(conflictRaw, conflictAuthority),
    neutral.ClassUnitResultConflict); mutationsRejected += 1;

  const source = fs.readFileSync(path.join(__dirname,
    "row14_c7_result_composer.cjs"), "utf8");
  for (const forbidden of ["readFileSync", "child_process", "createDetachedClassUnitAuthority"])
    assert(!source.includes(forbidden), `composer contains forbidden ${forbidden}`);
  const immutable = immutablePublish(published.canonicalJSON(), outputDirectory);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row14-c7-result-check-v1",
    classNumber: 192, invariantFactors: [8, 24], sourceInvariantFactors: [24, 8],
    unitMaterialization: "not_given(LARGE)", compactFactoredUnitsRetained: true,
    exactUnitsPublished: false, correspondenceComplete: true, publicComplete: false,
    torsionOrder: 2, honesty: "equal-bound-source-skip", mutationsRejected,
    componentOwnerSha256: prepared.componentOwnerSha256, owner: immutable,
    publishedSha256: published.sha256,
  })}\n`);
}

function main() {
  if (process.argv[2] === "--worker") return worker(process.argv.slice(3));
  if (!process.argv[2] || !process.argv[3]) throw new Error(
    "usage: check_row14_c7_result_composer.cjs CLASS_OWNER UNIT_OWNER [ACCEPTED POST OUTPUT]");
  const child = spawnSync("timeout", ["600", "prlimit", "--as=4294967296",
    "--rss=4294967296", "--cpu=600", "--", process.execPath, SELF, "--worker",
    ...process.argv.slice(2)], { cwd: ROOT, encoding: "utf8", timeout: 610_000,
    maxBuffer: 256 * 1024 * 1024 });
  assert.equal(child.status, 0, child.stderr || String(child.error));
  process.stdout.write(child.stdout);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}
