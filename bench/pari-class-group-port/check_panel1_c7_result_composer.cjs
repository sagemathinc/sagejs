#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

if (process.env.SAGEJS_PANEL1_C7_BOUNDED !== "1") {
  const child = spawnSync("prlimit", ["--as=4294967296", "--", process.execPath,
    __filename], {
    cwd: path.resolve(__dirname, "../.."), encoding: "utf8", timeout: 600_000,
    maxBuffer: 256 * 1024 * 1024,
    env: { ...process.env, SAGEJS_PANEL1_C7_BOUNDED: "1" },
  });
  if (child.stdout) process.stdout.write(child.stdout);
  if (child.stderr) process.stderr.write(child.stderr);
  if (child.error) throw child.error;
  process.exit(child.status ?? 1);
}

const composer = require("./panel1_c7_result_composer.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");
const presentationApi = require("./panel1_presentation_authority_coordinator.cjs");
const witnessApi = require("./panel1_c3_class_witness_coordinator.cjs");
const unitApi = require("./panel1_exact_unit_authority_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const authorityRoot = process.env.SAGEJS_PANEL1_AUTHORITY_ROOT ||
  "/scratch/sagejs-runtime/pari-class-group-e2e-20260917/panel1-authority";
const w0Path = process.env.SAGEJS_PANEL1_W0 ||
  "/scratch/sagejs-pari-development-panel-a998/panel-01-394cce5d99f0e9f8.json";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function loadImmutable(prefix, digest) {
  const filename = path.join(authorityRoot, `${prefix}-${digest}.json`);
  assert.equal(fs.statSync(filename).mode & 0o777, 0o444, `${prefix} owner is mutable`);
  const raw = fs.readFileSync(filename);
  assert.equal(sha(raw), digest, `${prefix} owner digest changed`);
  return JSON.parse(raw);
}

const presentation = loadImmutable("panel1-presentation",
  composer.PRESENTATION_OWNER_SHA256);
const classWitness = loadImmutable("panel1-c3-class-witness",
  composer.CLASS_WITNESS_OWNER_SHA256);
const exactUnits = loadImmutable("panel1-exact-units",
  composer.EXACT_UNIT_OWNER_SHA256);
const w0Raw = fs.readFileSync(w0Path);
assert.equal(sha(w0Raw), composer.W0_SHA256, "pristine W0 digest changed");
const w0 = JSON.parse(w0Raw);

const commit = spawnSync("git", ["rev-parse", composer.EXACT_UNIT_SOURCE_COMMIT], {
  cwd: ROOT, encoding: "utf8", timeout: 30_000,
});
assert.equal(commit.status, 0, commit.stderr);
assert.equal(commit.stdout.trim(), composer.EXACT_UNIT_SOURCE_COMMIT);
const sourceAtCommit = spawnSync("git", ["show",
  `${composer.EXACT_UNIT_SOURCE_COMMIT}:bench/pari-class-group-port/panel1_exact_unit_authority.py`], {
  cwd: ROOT, encoding: null, timeout: 30_000, maxBuffer: 32 * 1024 * 1024,
});
assert.equal(sourceAtCommit.status, 0, sourceAtCommit.stderr?.toString());
assert(sourceAtCommit.stdout.equals(fs.readFileSync(path.join(__dirname,
  "panel1_exact_unit_authority.py"))), "bound exact-unit source differs from commit");

const torsionProgram = String.raw`
import hashlib,importlib,json,sys
m=importlib.import_module('bench.pari-class-group-port.torsion_authority')
polynomial=['20018','-20010','0','1']
authority=m.TorsionReplayAuthority(m.prepared_polynomial_sha256(polynomial))
if sys.argv[1]=='derive':
 result=m.derive_real_cubic_torsion(polynomial)
 sys.stdout.buffer.write(result.canonical_json)
else:
 raw=sys.stdin.buffer.read()
 result=m.cold_replay_torsion(raw,authority)
 print(json.dumps({'sha256':result.sha256,'accepted':True},separators=(',',':')))
`;
function torsionPython(mode, input = undefined) {
  const result = spawnSync("python3", ["-c", torsionProgram, mode], {
    cwd: ROOT, input, encoding: mode === "derive" ? null : "utf8", timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr?.toString() || String(result.error));
  return result.stdout;
}
const torsionRaw = torsionPython("derive");
const torsion = JSON.parse(torsionRaw);
const torsionSha256 = sha(torsionRaw);

function evidence(value) { return sha(Buffer.from(JSON.stringify(value))); }
function receipt(ownerSha256, evidenceSha256) {
  return {
    accepted: true, evidenceSha256, fieldId: composer.FIELD_ID,
    ownerSha256, pristineW0Sha256: composer.W0_SHA256,
    schema: composer.OWNER_REPLAY_SCHEMA,
  };
}

function boundary(owner, ownerSha256, replay) {
  return {
    authority: {
      ownerSha256, replay, replaySchema: composer.OWNER_REPLAY_SCHEMA,
    },
    owner,
  };
}

const trusted = {
  presentation: structuredClone(presentation), classWitness: structuredClone(classWitness),
  exactUnits: structuredClone(exactUnits), w0: structuredClone(w0),
  torsion: structuredClone(torsion),
};

function inputs(overrides = {}) {
  const values = { ...trusted, ...overrides };
  return {
    presentation: boundary(values.presentation, composer.PRESENTATION_OWNER_SHA256,
      candidate => {
        assert.deepEqual(candidate, trusted.presentation);
        assert.equal(presentationApi.verifyOwner(candidate, candidate.ancestry), true);
        return receipt(composer.PRESENTATION_OWNER_SHA256, evidence(candidate));
      }),
    classWitness: boundary(values.classWitness, composer.CLASS_WITNESS_OWNER_SHA256,
      candidate => {
        assert.deepEqual(candidate, trusted.classWitness);
        assert.equal(witnessApi.verifyWitness(candidate, candidate.ancestry), true);
        return receipt(composer.CLASS_WITNESS_OWNER_SHA256, evidence(candidate));
      }),
    exactUnits: boundary(values.exactUnits, composer.EXACT_UNIT_OWNER_SHA256,
      candidate => {
        assert.deepEqual(candidate, trusted.exactUnits);
        unitApi.verifyOwner(candidate);
        return receipt(composer.EXACT_UNIT_OWNER_SHA256, evidence(candidate));
      }),
    w0: boundary(values.w0, composer.W0_SHA256, candidate => {
      assert.deepEqual(candidate, trusted.w0);
      const factor = candidate.events.find(entry => entry.event === "factor_base");
      assert.deepEqual([factor.C1, factor.C2, factor.KC, factor.KCZ, factor.KCZ2],
        [259, 259, 51, 36, 36]);
      return receipt(composer.W0_SHA256, sha(w0Raw));
    }),
    torsion: boundary(values.torsion, torsionSha256, candidate => {
      assert.deepEqual(candidate, trusted.torsion);
      const replay = JSON.parse(torsionPython("replay", Buffer.from(JSON.stringify(candidate))));
      assert.equal(replay.accepted, true);
      assert.equal(replay.sha256, torsionSha256);
      return receipt(torsionSha256, replay.sha256);
    }),
  };
}

const prepared = composer.preparePanel1C7Result(inputs());
const coldPrepared = composer.preparePanel1C7Result(inputs({
  presentation: structuredClone(presentation), classWitness: structuredClone(classWitness),
  exactUnits: structuredClone(exactUnits), w0: structuredClone(w0),
  torsion: structuredClone(torsion),
}));
assert.deepEqual(coldPrepared, prepared, "detached cold composition changed");
assert(Object.isFrozen(prepared));
assert.equal(prepared.exactUnitSourceCommit, composer.EXACT_UNIT_SOURCE_COMMIT);
assert.equal(prepared.correspondenceComplete, true);
assert.equal(prepared.publicComplete, false);

const raw = Buffer.from(prepared.sealedEnvelopeHex, "hex");
assert.equal(neutral.sha256Bytes(raw), prepared.sealedEnvelopeSha256);
const payload = JSON.parse(raw.toString("ascii")).payload;
assert.deepEqual(payload.classGroup, {
  classNumber: "3", generatorCount: "1", invariantFactors: ["3"],
  presentationOwner: "factor-base-presentation",
});
assert.deepEqual(payload.unitGroup.materialization, {
  coordinatesOwner: "exact-unit-coordinates", normsOwner: "exact-unit-norms",
  tag: "exact_units",
});
assert.equal(payload.unitGroup.rank, "2");
assert.equal(payload.unitGroup.torsionOrder, "2");
assert.equal(payload.honesty.outcome, "equal-bound-source-skip");
assert.deepEqual(payload.source.assumptions.map(entry => entry.id),
  ["factor-base-bounds", "grh-bounds", "pari-correspondence"]);
assert.equal(payload.terminal.correspondence_complete, true);
assert.equal(payload.terminal.public_complete, false);

const owners = new Map(payload.storage.map(entry => [entry.name, entry]));
assert.deepEqual(owners.get("class-generator-ideal").entries,
  classWitness.descriptor.idealHnf);
assert.deepEqual(owners.get("exact-unit-coordinates").entries, exactUnits.exactUnits.flat());
assert.deepEqual(owners.get("exact-unit-norms").entries, ["1", "1"]);
assert.deepEqual(owners.get("unit-sign-phases").entries, ["0", "1", "1", "1", "1", "0"]);
assert.deepEqual(owners.get("regulator-enclosure").entries, exactUnits.packedRegulator);
assert.deepEqual(owners.get("torsion-generator").entries, ["-1", "0", "0"]);
assert.deepEqual(owners.get("factor-base-bound-counters").entries,
  ["259", "259", "51", "36", "36"]);
const orderOwner = owners.get("class-generator-order-principal").entries;
assert.deepEqual(orderOwner.slice(0, 58), classWitness.orderRelation.rawRelationCoefficients);
assert.deepEqual(orderOwner.slice(58, 61), classWitness.orderRelation.principalGenerator);
assert.deepEqual(orderOwner.slice(61), classWitness.exactIdealReplay.powerHnf);

const trustedPayload = structuredClone(payload);
function finalReplay(candidate) {
  assert.deepEqual(candidate, trustedPayload);
  assert.equal(candidate.classGroup.classNumber, "3");
  assert.deepEqual(candidate.classGroup.invariantFactors, ["3"]);
  const candidateOwners = new Map(candidate.storage.map(entry => [entry.name, entry]));
  assert.deepEqual(candidateOwners.get("exact-unit-coordinates").entries,
    exactUnits.exactUnits.flat());
  assert.deepEqual(candidateOwners.get("exact-unit-norms").entries, ["1", "1"]);
  assert.deepEqual(candidateOwners.get("unit-sign-phases").entries,
    ["0", "1", "1", "1", "1", "0"]);
  assert.deepEqual(candidateOwners.get("regulator-enclosure").entries,
    exactUnits.packedRegulator);
  assert.deepEqual(candidateOwners.get("class-generator-order-principal").entries,
    orderOwner);
  assert.equal(candidate.honesty.outcome, "equal-bound-source-skip");
  assert.equal(candidate.terminal.correspondence_complete, true);
  assert.equal(candidate.terminal.public_complete, false);
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
const published = composer.publishPreparedPanel1C7Result(
  prepared, finalAuthority(raw), publisher);
assert.equal(composer.publishPreparedPanel1C7Result(
  prepared, finalAuthority(raw), publisher), published);

let mutationsRejected = 0;
function rejectInput(name, mutate) {
  const changed = structuredClone(trusted[name]);
  mutate(changed);
  assert.throws(() => composer.preparePanel1C7Result(inputs({ [name]: changed })),
    composer.Panel1C7CompositionFailure);
  mutationsRejected += 1;
}
rejectInput("presentation", value => { value.presentation.matrix[0] = "2"; });
rejectInput("classWitness", value => { value.smithCoordinate.generatorCoordinate = "0"; });
rejectInput("classWitness", value => { value.orderRelation.principalGenerator[0] = "0"; });
rejectInput("exactUnits", value => { value.exactUnits[0][0] = "6672"; });
rejectInput("exactUnits", value => { value.signPhases[0] = 1; });
rejectInput("exactUnits", value => { value.packedRegulator[0] = "1"; });
rejectInput("w0", value => { value.events.find(e => e.event === "factor_base").KCZ2 = 37; });
rejectInput("torsion", value => { value.payload.torsion.order = "1"; });

const promoted = structuredClone(payload);
promoted.terminal.public_complete = true;
assert.throws(() => neutral.sealClassUnitCorrespondenceResult(promoted),
  neutral.ClassUnitResultFailure);
mutationsRejected += 1;

function rejectReseal(mutator) {
  const changed = structuredClone(payload);
  mutator(changed);
  const fraudulentRaw = neutral.sealClassUnitCorrespondenceResult(changed);
  const fraudulentPrepared = {
    ...prepared, sealedEnvelopeHex: fraudulentRaw.toString("hex"),
    sealedEnvelopeSha256: neutral.sha256Bytes(fraudulentRaw),
  };
  assert.throws(() => composer.publishPreparedPanel1C7Result(
    fraudulentPrepared, finalAuthority(fraudulentRaw)), neutral.ClassUnitResultFailure);
  mutationsRejected += 1;
}
rejectReseal(value => {
  value.storage.find(entry => entry.name === "exact-unit-coordinates").entries[0] = "6672";
});
rejectReseal(value => {
  value.storage.find(entry => entry.name === "class-generator-order-principal").entries[58] = "0";
});
rejectReseal(value => { value.honesty.outcome = "not-required"; });

const source = fs.readFileSync(path.join(__dirname, "panel1_c7_result_composer.cjs"), "utf8");
assert(!source.includes("createDetachedClassUnitAuthority"));
assert(!source.includes("readFileSync"));
assert(!source.includes("child_process"));

function publishImmutable(bytes) {
  const digest = neutral.sha256Bytes(bytes);
  const filename = path.join(authorityRoot, `panel1-c7-class-unit-result-${digest}.json`);
  if (fs.existsSync(filename)) {
    assert.equal(fs.statSync(filename).mode & 0o777, 0o444, "existing C7 owner is mutable");
    assert.equal(sha(fs.readFileSync(filename)), digest, "existing C7 owner changed");
  } else {
    const temporary = path.join(authorityRoot,
      `.${path.basename(filename)}.${process.pid}.${crypto.randomUUID()}`);
    fs.writeFileSync(temporary, bytes, { flag: "wx", mode: 0o400 });
    try { fs.renameSync(temporary, filename); fs.chmodSync(filename, 0o444); }
    catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
  }
  return { bytes: bytes.length, path: filename, sha256: digest };
}

const immutableOwner = publishImmutable(published.canonicalJSON());
console.log(JSON.stringify({
  classNumber: 3, coldReplay: true, correspondenceComplete: true,
  exactUnitOwnerSha256: composer.EXACT_UNIT_OWNER_SHA256,
  exactUnitSourceCommit: composer.EXACT_UNIT_SOURCE_COMMIT,
  field: composer.FIELD_ID, honesty: "equal-bound-source-skip",
  invariantFactors: [3], mutationsRejected, owner: immutableOwner,
  publicComplete: false, publishedSha256: published.sha256,
  status: "pari-correspondence-complete-internal", torsionOrder: 2,
  unitMaterialization: "exact_units", unitNorms: [1, 1], unitRank: 2,
  unitSigns: ["+--", "--+"], limits: { timeoutSeconds: 600, addressSpaceGiB: 4 },
}));
