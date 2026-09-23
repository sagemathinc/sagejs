#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux-x64

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const SELF = __filename;
const composer = require("./row4_c7_result_composer.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");
const presentationApi = require("./row34_real_cubic_presentation_coordinator.cjs");
const classApi = require("./row4_real_cubic_class_witness_coordinator.cjs");
const unitApi = require("./row4_rank2_unit_authority_coordinator.cjs");

function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function load(filename, expected, label) {
  const selected = path.resolve(filename); const bytes = fs.readFileSync(selected);
  assert.equal(sha(bytes), expected, `${label} digest changed`);
  assert.equal(fs.statSync(selected).mode & 0o777, 0o444, `${label} is mutable`);
  return JSON.parse(bytes);
}
function replayBoundary(owner, ownerSha256, verify) {
  const trusted = structuredClone(owner);
  // Component owners may contain diagnostic IEEE-754 values.  Their actual
  // authority is the immutable file digest; this receipt digest only labels
  // the exact detached clone replayed below.
  const evidenceSha256 = sha(Buffer.from(JSON.stringify(trusted)));
  return { owner, authority: { ownerSha256, replaySchema: composer.INPUT_REPLAY_SCHEMA,
    replay(candidate) {
      verify(candidate); assert.deepEqual(candidate, trusted);
      return { accepted: true, evidenceSha256, fieldId: composer.FIELD_ID,
        ownerSha256, schema: composer.INPUT_REPLAY_SCHEMA };
    } } };
}
function permissiveBoundary(owner, ownerSha256) {
  return { owner, authority: { ownerSha256, replaySchema: composer.INPUT_REPLAY_SCHEMA,
    replay() { return { accepted: true,
      evidenceSha256: sha(Buffer.from(JSON.stringify(owner))), fieldId: composer.FIELD_ID,
      ownerSha256, schema: composer.INPUT_REPLAY_SCHEMA }; } } };
}
function boundaries(data, overrides = {}, permissive = new Set()) {
  const owners = { presentation: overrides.presentation || data.presentation,
    classOwner: overrides.classOwner || data.classOwner,
    unitOwner: overrides.unitOwner || data.unitOwner };
  const verifiers = {
    presentation: owner => presentationApi.verifyOwner(owner, owner.ancestry),
    classOwner: owner => classApi.verifyOwner(owner, owner.ancestry),
    unitOwner: owner => unitApi.verifyOwner(owner, owners.presentation, owner.ancestry),
  };
  const hashes = { presentation: composer.PRESENTATION_SHA256,
    classOwner: composer.CLASS_OWNER_SHA256, unitOwner: composer.UNIT_OWNER_SHA256 };
  return Object.fromEntries(Object.keys(owners).map(name => [name,
    permissive.has(name) ? permissiveBoundary(owners[name], hashes[name]) :
      replayBoundary(owners[name], hashes[name], verifiers[name])]));
}
function immutablePublish(raw, directory) {
  const digest = neutral.sha256Bytes(raw); fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `row4-c7-class-unit-result-${digest}.json`);
  if (fs.existsSync(destination)) {
    assert.equal(fs.statSync(destination).mode & 0o777, 0o444);
    assert.equal(sha(fs.readFileSync(destination)), digest);
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
  const [presentationPath, classPath, unitPath,
    outputDirectory = path.join(os.tmpdir(), "sagejs-row4-c7-owner")] = argv;
  assert(presentationPath && classPath && unitPath,
    "usage: check_row4_c7_result_composer.cjs PRESENTATION CLASS UNIT [OUTPUT]");
  const data = {
    presentation: load(presentationPath, composer.PRESENTATION_SHA256, "presentation"),
    classOwner: load(classPath, composer.CLASS_OWNER_SHA256, "class witness"),
    unitOwner: load(unitPath, composer.UNIT_OWNER_SHA256, "unit owner"),
  };
  const inputs = boundaries(data);
  const prepared = composer.prepareRow4C7Result(inputs);
  assert.equal(prepared.correspondenceComplete, true);
  assert.equal(prepared.publicComplete, false);
  assert.equal(prepared.frozenW0UsedAsInput, true);
  assert.equal(prepared.inputBoundaryComplete, false);
  assert.equal(prepared.qualifiedTiming, false);
  const raw = Buffer.from(prepared.sealedEnvelopeHex, "hex");
  const payload = JSON.parse(raw).payload;
  assert.deepEqual(payload.classGroup.invariantFactors, ["2"]);
  assert.equal(payload.classGroup.classNumber, "2");
  assert.deepEqual(payload.unitGroup.materialization,
    { precisionBits: "192", reason: "LARGE", tag: "not_given" });
  assert.equal(payload.unitGroup.rank, "2");
  assert.equal(payload.unitGroup.torsionOrder, "2");
  assert.equal(payload.honesty.outcome, "not-required");
  assert.equal(payload.terminal.correspondence_complete, true);
  assert.equal(payload.terminal.public_complete, false);
  const stores = new Map(payload.storage.map(owner => [owner.name, owner]));
  assert.deepEqual(stores.get("class-presentation").entries, ["2"]);
  assert.equal(stores.get("class-order-relation-indices").entries.length, 397);
  assert(stores.get("class-order-relation-exponents").entries.some(value => BigInt(value) < 0n));
  assert.equal(stores.get("factored-unit-provenance").entries.length, 1134);
  assert.deepEqual(stores.get("unit-norms").entries, ["-1", "1"]);
  assert.deepEqual(stores.get("regulator-enclosure").entries,
    data.unitOwner.regulator.packed);
  assert.deepEqual(stores.get("torsion-generator").entries, ["-1", "0", "0"]);
  assert.deepEqual(stores.get("source-boundary-status").entries, ["1", "0", "0"]);

  const trustedPayload = structuredClone(payload);
  function finalReplay(candidate) {
    const replay = composer.prepareRow4C7Result(inputs);
    const replayPayload = JSON.parse(Buffer.from(replay.sealedEnvelopeHex, "hex")).payload;
    assert.deepEqual(candidate, replayPayload); assert.deepEqual(candidate, trustedPayload);
    return { correspondence_complete: true, fieldId: composer.FIELD_ID,
      mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
      payloadSha256: neutral.sha256Canonical(candidate), public_complete: false,
      schema: composer.PUBLICATION_REPLAY_SCHEMA };
  }
  function authority(bytes) {
    return neutral.createDetachedClassUnitAuthority({
      envelopeSha256: neutral.sha256Bytes(bytes),
      mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
      replay: finalReplay, replaySchema: composer.PUBLICATION_REPLAY_SCHEMA });
  }
  const publisher = new neutral.ClassUnitCorrespondencePublisher();
  const published = composer.publishPreparedRow4C7Result(prepared, authority(raw), publisher);
  assert.equal(composer.publishPreparedRow4C7Result(prepared, authority(raw), publisher), published);
  assert.equal(published.sha256, prepared.sealedEnvelopeSha256);

  let mutationsRejected = 0;
  function authorityMutation(name, mutate) {
    const changed = structuredClone(data[name]); mutate(changed);
    assert.throws(() => composer.prepareRow4C7Result(boundaries(data, { [name]: changed })),
      composer.Row4C7CompositionFailure); mutationsRejected += 1;
  }
  authorityMutation("presentation", value => { value.presentation.terminalW[0] = "3"; });
  authorityMutation("classOwner", value => { value.quotient.generatorOrder = "1"; });
  authorityMutation("classOwner", value => { value.compactPrincipalWitness.relationExponents[0] = "0"; });
  authorityMutation("unitOwner", value => { value.units.reason = "PRECI"; });
  authorityMutation("unitOwner", value => { value.units.rawUnitProvenance[0] = "1"; });
  authorityMutation("unitOwner", value => { value.sourceLogs.frozenW0UsedAsInput = false; });
  function semanticMutation(name, mutate) {
    const changed = structuredClone(data[name]); mutate(changed);
    assert.throws(() => composer.prepareRow4C7Result(
      boundaries(data, { [name]: changed }, new Set([name]))),
    composer.Row4C7CompositionFailure); mutationsRejected += 1;
  }
  semanticMutation("presentation", value => { value.field.polynomial[0] = "1"; });
  semanticMutation("classOwner", value => { value.generator.idealHnf[0] = "7"; });
  semanticMutation("unitOwner", value => { value.units.unitNorms[0] = "1"; });
  semanticMutation("unitOwner", value => { value.completion.inputBoundaryComplete = true; });

  function rejectReseal(mutate) {
    const changed = structuredClone(payload); mutate(changed);
    const fraudulentRaw = neutral.sealClassUnitCorrespondenceResult(changed);
    const fraudulent = { ...prepared, sealedEnvelopeHex: fraudulentRaw.toString("hex"),
      sealedEnvelopeSha256: neutral.sha256Bytes(fraudulentRaw) };
    assert.throws(() => composer.publishPreparedRow4C7Result(
      fraudulent, authority(fraudulentRaw)), neutral.ClassUnitResultFailure);
    mutationsRejected += 1;
  }
  rejectReseal(value => { value.storage.find(owner =>
    owner.name === "factored-unit-provenance").entries[0] = "1"; });
  rejectReseal(value => { value.unitGroup.materialization.reason = "PRECI"; });
  rejectReseal(value => { value.honesty.outcome = "extended-complete"; });
  const promoted = structuredClone(payload); promoted.terminal.public_complete = true;
  assert.throws(() => neutral.sealClassUnitCorrespondenceResult(promoted),
    neutral.ClassUnitResultFailure); mutationsRejected += 1;

  const conflictPayload = structuredClone(payload);
  conflictPayload.storage.find(owner => owner.name === "honesty-evidence").entries[0] = "1";
  const conflictRaw = neutral.sealClassUnitCorrespondenceResult(conflictPayload);
  const conflictAuthority = neutral.createDetachedClassUnitAuthority({
    envelopeSha256: neutral.sha256Bytes(conflictRaw),
    mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
    replay(candidate) { return { correspondence_complete: true,
      fieldId: composer.FIELD_ID,
      mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
      payloadSha256: neutral.sha256Canonical(candidate), public_complete: false,
      schema: composer.PUBLICATION_REPLAY_SCHEMA }; },
    replaySchema: composer.PUBLICATION_REPLAY_SCHEMA });
  assert.throws(() => publisher.publish(conflictRaw, conflictAuthority),
    neutral.ClassUnitResultConflict); mutationsRejected += 1;

  const source = fs.readFileSync(path.join(__dirname,
    "row4_c7_result_composer.cjs"), "utf8");
  for (const forbidden of ["readFileSync", "child_process", "createDetachedClassUnitAuthority"])
    assert(!source.includes(forbidden), `composer contains forbidden ${forbidden}`);
  const immutable = immutablePublish(published.canonicalJSON(), outputDirectory);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row4-c7-result-check-v1",
    classNumber: 2, invariantFactors: [2], unitRank: 2,
    unitMaterialization: "not_given(LARGE)", compactFactoredUnitsRetained: true,
    exactExpandedUnitsPublished: false, torsionOrder: 2,
    honesty: "not-required", frozenW0UsedAsInput: true,
    inputBoundaryComplete: false, qualifiedTiming: false,
    correspondenceComplete: true, publicComplete: false, mutationsRejected,
    componentOwnerSha256: prepared.componentOwnerSha256,
    owner: immutable, publishedSha256: published.sha256 })}\n`);
}

function main() {
  if (process.argv[2] === "--worker") return worker(process.argv.slice(3));
  if (!process.argv[2] || !process.argv[3] || !process.argv[4]) throw new Error(
    "usage: check_row4_c7_result_composer.cjs PRESENTATION CLASS UNIT [OUTPUT]");
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
