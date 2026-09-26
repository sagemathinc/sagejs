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
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-11-ce2bfa61425aa681.json";
const CLASS_COORDINATOR = path.join(__dirname, "row11_terminal_class_closure_coordinator.cjs");
const UNIT_COORDINATOR = path.join(__dirname, "row11_rank2_c5_c6_coordinator.cjs");
const composer = require("./row11_c7_result_composer.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");
const classApi = require("./row11_terminal_class_closure_coordinator.cjs");
const unitApi = require("./row11_rank2_c5_c6_coordinator.cjs");

function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8",
    timeout: 600_000, maxBuffer: 256 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr || result.stdout || String(result.error));
  return JSON.parse(result.stdout);
}
function generateInputs(stage) {
  const classReceipt = run([CLASS_COORDINATOR, "--pristine-w0", W0,
    "--pristine-sha256", composer.W0_SHA256, "--output-dir", path.join(stage, "class")]);
  assert.equal(classReceipt.sha256, composer.CLASS_OWNER_SHA256);
  const unitReceipt = run([UNIT_COORDINATOR, "--lane-a-owner", classReceipt.path,
    "--pristine-w0", W0, "--output-dir", path.join(stage, "unit")]);
  assert.equal(unitReceipt.sha256, composer.UNIT_OWNER_SHA256);
  return [classReceipt.path, unitReceipt.path];
}
function load(filename, expected, label) {
  const selected = path.resolve(filename); const bytes = fs.readFileSync(selected);
  assert.equal(sha(bytes), expected, `${label} digest changed`);
  assert.equal(fs.statSync(selected).mode & 0o777, 0o444, `${label} is mutable`);
  return JSON.parse(bytes);
}
function replayBoundary(owner, ownerSha256, verify) {
  const trusted = structuredClone(owner);
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
  const owners = { classOwner: overrides.classOwner || data.classOwner,
    unitOwner: overrides.unitOwner || data.unitOwner };
  const verifiers = { classOwner: owner => classApi.verifyOwner(owner, owner.ancestry),
    unitOwner: owner => unitApi.verifyOwner(owner, owner.ancestry) };
  const hashes = { classOwner: composer.CLASS_OWNER_SHA256,
    unitOwner: composer.UNIT_OWNER_SHA256 };
  return Object.fromEntries(Object.keys(owners).map(name => [name,
    permissive.has(name) ? permissiveBoundary(owners[name], hashes[name]) :
      replayBoundary(owners[name], hashes[name], verifiers[name])]));
}
function immutablePublish(raw, directory) {
  const digest = neutral.sha256Bytes(raw); fs.mkdirSync(directory, { recursive: true });
  const destination = path.join(directory, `row11-c7-class-unit-result-${digest}.json`);
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
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row11-c7-check-"));
  try {
    let [classPath, unitPath, outputDirectory] = argv;
    if (!classPath && !unitPath) [classPath, unitPath] = generateInputs(stage);
    assert(classPath && unitPath,
      "usage: check_row11_c7_result_composer.cjs [CLASS_OWNER UNIT_OWNER [OUTPUT]]");
    outputDirectory ||= path.join(stage, "result");
    const data = {
      classOwner: load(classPath, composer.CLASS_OWNER_SHA256, "class owner"),
      unitOwner: load(unitPath, composer.UNIT_OWNER_SHA256, "unit owner"),
    };
    const inputs = boundaries(data);
    const prepared = composer.prepareRow11C7Result(inputs);
    assert.equal(prepared.correspondenceComplete, true);
    assert.equal(prepared.publicComplete, false);
    assert.equal(prepared.frozenW0UsedAsInput, true);
    assert.equal(prepared.inputBoundaryComplete, false);
    assert.equal(prepared.qualifiedTiming, false);
    const raw = Buffer.from(prepared.sealedEnvelopeHex, "hex");
    const payload = JSON.parse(raw).payload;
    assert.deepEqual(payload.field.definingPolynomialAscending, composer.POLYNOMIAL);
    assert.deepEqual(payload.classGroup.invariantFactors, ["2", "2"]);
    assert.equal(payload.classGroup.classNumber, "4");
    assert.deepEqual(payload.unitGroup.materialization,
      { precisionBits: "192", reason: "LARGE", tag: "not_given" });
    assert.equal(payload.unitGroup.rank, "2");
    assert.equal(payload.unitGroup.torsionOrder, "2");
    assert.equal(payload.honesty.outcome, "not-required");
    assert.equal(payload.terminal.correspondence_complete, true);
    assert.equal(payload.terminal.public_complete, false);
    const stores = new Map(payload.storage.map(owner => [owner.name, owner]));
    assert.deepEqual(stores.get("class-presentation").entries, ["2", "0", "0", "2"]);
    assert.equal(stores.get("class-generator-ideals").entries.length, 32);
    assert.deepEqual(stores.get("class-order-factor-counts").entries, ["336", "330"]);
    assert.equal(stores.get("principal-generators").entries.length, 1720);
    assert.equal(stores.get("raw-relation-records").entries.length, 181030);
    assert.equal(stores.get("factored-unit-provenance").entries.length, 860);
    assert.equal(stores.get("factored-unit-principal-generators").entries.length, 2640);
    assert.deepEqual(stores.get("unit-norms").entries, ["1", "1"]);
    assert.deepEqual(stores.get("unit-real-signs").entries, ["1", "1", "-1", "-1"]);
    assert.deepEqual(stores.get("unit-relation-factor-counts").entries, ["330", "330"]);
    assert.deepEqual(stores.get("regulator-enclosure").entries,
      data.unitOwner.regulator.acceptedPacked);
    assert.deepEqual(stores.get("torsion-generator").entries, ["-1", "0", "0", "0"]);
    assert.deepEqual(stores.get("source-boundary-status").entries, ["1", "0", "0"]);

    const trustedPayload = structuredClone(payload);
    function finalReplay(candidate) {
      const replay = composer.prepareRow11C7Result(inputs);
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
    const published = composer.publishPreparedRow11C7Result(prepared, authority(raw), publisher);
    assert.equal(composer.publishPreparedRow11C7Result(prepared, authority(raw), publisher), published);
    assert.equal(published.sha256, prepared.sealedEnvelopeSha256);

    let mutationsRejected = 0;
    function authorityMutation(name, mutate) {
      const changed = structuredClone(data[name]); mutate(changed);
      assert.throws(() => composer.prepareRow11C7Result(boundaries(data, { [name]: changed })),
        composer.Row11C7CompositionFailure); mutationsRejected += 1;
    }
    authorityMutation("classOwner", value => { value.classGroup.classNumber = "2"; });
    authorityMutation("classOwner", value => {
      value.witnesses[0].compactPrincipalProduct.relationExponents[0] = "0";
    });
    authorityMutation("unitOwner", value => { value.c6.reason = "PRECI"; });
    authorityMutation("unitOwner", value => { value.units.rawUnitProvenance[0] = "1"; });
    authorityMutation("unitOwner", value => { value.sourceLogs.frozenW0UsedAsInput = false; });
    function semanticMutation(name, mutate) {
      const changed = structuredClone(data[name]); mutate(changed);
      assert.throws(() => composer.prepareRow11C7Result(
        boundaries(data, { [name]: changed }, new Set([name]))),
      composer.Row11C7CompositionFailure); mutationsRejected += 1;
    }
    semanticMutation("classOwner", value => { value.field.polynomial[0] = "-1"; });
    semanticMutation("classOwner", value => {
      value.witnesses[0].compactPrincipalProduct.principalGenerators[0] = "0";
    });
    semanticMutation("unitOwner", value => { value.units.unitNorms[0] = "-1"; });
    semanticMutation("unitOwner", value => {
      value.units.compactFactoredUnits[1].principalGenerators[0] = "0";
    });
    semanticMutation("unitOwner", value => { value.completion.inputBoundaryComplete = true; });

    function rejectReseal(mutate) {
      const changed = structuredClone(payload); mutate(changed);
      const fraudulentRaw = neutral.sealClassUnitCorrespondenceResult(changed);
      const fraudulent = { ...prepared, sealedEnvelopeHex: fraudulentRaw.toString("hex"),
        sealedEnvelopeSha256: neutral.sha256Bytes(fraudulentRaw) };
      assert.throws(() => composer.publishPreparedRow11C7Result(
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

    const source = fs.readFileSync(path.join(__dirname,
      "row11_c7_result_composer.cjs"), "utf8");
    for (const forbidden of ["readFileSync", "child_process", "createDetachedClassUnitAuthority"])
      assert(!source.includes(forbidden), `composer contains forbidden ${forbidden}`);
    const first = immutablePublish(published.canonicalJSON(), outputDirectory);
    const second = immutablePublish(published.canonicalJSON(), outputDirectory);
    assert.deepEqual(second, first);
    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.pari-class-group/row11-c7-result-check-v1",
      classNumber: 4, invariantFactors: [2, 2], unitRank: 2,
      unitMaterialization: "not_given(LARGE)", compactFactoredUnitsRetained: true,
      exactExpandedUnitsPublished: false, torsionOrder: 2, honesty: "not-required",
      frozenW0UsedAsInput: true, inputBoundaryComplete: false, qualifiedTiming: false,
      correspondenceComplete: true, publicComplete: false, mutationsRejected,
      componentOwnerSha256: prepared.componentOwnerSha256,
      mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
      owner: first, publishedSha256: published.sha256 })}\n`);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

function main() {
  if (process.argv[2] === "--worker") return worker(process.argv.slice(3));
  if (process.argv.length !== 2 && process.argv.length !== 4 && process.argv.length !== 5)
    throw new Error("usage: check_row11_c7_result_composer.cjs [CLASS_OWNER UNIT_OWNER [OUTPUT]]");
  const child = spawnSync("timeout", ["600", "prlimit", "--as=4294967296",
    "--rss=4294967296", "--cpu=600", "--", process.execPath, SELF, "--worker",
    ...process.argv.slice(2)], { cwd: ROOT, encoding: "utf8", timeout: 610_000,
    maxBuffer: 256 * 1024 * 1024 });
  assert.equal(child.status, 0, child.stderr || child.stdout || String(child.error));
  process.stdout.write(child.stdout);
}
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}
