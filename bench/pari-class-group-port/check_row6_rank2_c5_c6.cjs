#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const { spawnSync } = require("node:child_process");
const api = require("./row6_rank2_c5_c6_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_GATE =
  "/tmp/sagejs-row6-gate-c-eQS861/owner/" +
  "row6-prepared-gate-c-6b6a4ee102f8682254470dc8e7d05f63d5e449282df248a15bc54b938adaac98.json.gz";
const DEFAULT_POST = "/tmp/row6-post1137-result.json";
const DEFAULT_PREPARED = "/tmp/row6-prepared-projection.json";
const DEFAULT_ANCESTRY = "/tmp/row6-ancestry.json";
const W0_SHA256 =
  "2736e19b166c11a5997a6825cd99b612ae23cf6740d2248ac3dd91bc883286a5";
const GATE_SHA256 =
  "6b6a4ee102f8682254470dc8e7d05f63d5e449282df248a15bc54b938adaac98";
const GATE_COMPRESSED_SHA256 =
  "526cf175619801919509bdf21d4296a31864876e3d563a3728678e66b80b813d";
const POST_SHA256 =
  "85d9f2e0fc3ac096909e78e06527ba0492de94650b661124088ec70ad9d79976";
const PREPARED_SHA256 =
  "abfa328710a3d1c2e39b3893e6f6b6cf0214b7da7a101d5360502fe56c8ac58b";
const PREPARED_AUTHORITY_SHA256 =
  "1620c2d7e9ab145eb7400c3dd0e5dc8c2c689ef88f250f2800dde05768b493a0";
const ANCESTRY_SHA256 =
  "aafbe40446e563b9b93a2d186d24a9c0f4b9908c922c24dd64ce1c78e3500ae9";
const EXPECTED_OWNER_SHA256 =
  "5308cfc9a128a1b5d1667a21c84866f0c91c8db6107e777eefd9cf88c0243551";
const EXPECTED_TRANSFORM = [
  "1", "0", "0", "0", "0", "0", "0",
  "289737766830681", "1", "1", "0", "0", "0", "0",
];
const EXPECTED_CLEAN_LOGS = [
  "3951536667455084576310059355761516743146573169259855950309", "192", "5",
  "-72892979845420388513784529064940556081802604267567431033412516651845850128585", "256", "6",
  "3951536043279602863959593487564016421410850116468489853779", "192", "5",
  "5761305202390732732449655971211743229356956092437773427840", "192", "49",
  "93881506903345174844199261197275811108630505293690768200171672225714123309056", "256", "25",
  "-5761305505738242059443242108136882020460453489277912430336", "192", "49",
];
const EXPECTED_LATTICE = [
  "6", "0", "0", "6", "-2529485940798537", "-7",
  "60039863294012304", "70", "-14275683735510315", "-15",
  "-18707463945450123", "-35", "16197072521873160", "-30",
];
const EXPECTED_REGULATOR = [
  "3626834249414306903656792336633990244294399400949119764057", "192", "56",
];

const sha = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const canonicalSha = (value) => sha(Buffer.from(JSON.stringify(value)));

function options(argv) {
  const answer = { gate: DEFAULT_GATE, post: DEFAULT_POST,
    prepared: DEFAULT_PREPARED, ancestry: DEFAULT_ANCESTRY, w0: null };
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index], value = argv[index + 1];
    assert(value, `missing value for ${flag}`);
    const key = { "--gate": "gate", "--post": "post", "--prepared": "prepared",
      "--ancestry": "ancestry", "--w0": "w0" }[flag];
    assert(key, `unknown option ${flag}`);
    answer[key] = path.resolve(value);
  }
  return answer;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file));
}

function readGate(file) {
  assert.equal(fs.statSync(file).mode & 0o222, 0, "Gate-C owner is mutable");
  const compressed = fs.readFileSync(file);
  assert.equal(sha(compressed), GATE_COMPRESSED_SHA256);
  const plain = zlib.gunzipSync(compressed);
  assert.equal(sha(plain), GATE_SHA256);
  const gate = JSON.parse(plain);
  assert.equal(gate.schema,
    "sagejs.pari-class-group/row6-prepared-gate-c-owner-v1");
  return gate;
}

function readPost(file) {
  const post = readJson(file);
  assert.equal(canonicalSha(post), POST_SHA256, "post-1137 result changed");
  assert.equal(post.schema, "sagejs.pari-class-group/row6-post1137-terminal-v1");
  assert.equal(post.status, 0);
  assert.equal(post.gateOwnerSha256, GATE_SHA256);
  assert.deepEqual(post.regulator, EXPECTED_REGULATOR);
  assert.deepEqual(post.unitRelations, EXPECTED_LATTICE);
  return post;
}

function readPrepared(file) {
  const prepared = readJson(file);
  assert.equal(canonicalSha(prepared), PREPARED_SHA256,
    "prepared projection changed");
  assert.equal(prepared.authoritySha256, PREPARED_AUTHORITY_SHA256);
  const auth = require("./prepared_nf_authentication.cjs");
  assert.equal(auth.authenticatePreparedNf(prepared.data).sha256,
    PREPARED_AUTHORITY_SHA256);
  return prepared;
}

function validateAncestry(ancestry) {
  assert.equal(canonicalSha(ancestry), ANCESTRY_SHA256,
    "full terminal ancestry changed");
  assert.equal(ancestry.schema,
    "sagejs.pari-class-group/row6-column-ancestry-v1");
  assert.equal(ancestry.rawToUnitKernel.length, 7 * 1137);
  assert.equal(ancestry.rawToPresentation.length, 2 * 1137);
  assert.equal(ancestry.acceptedArch.length, 147);
  assert.equal(ancestry.acceptedSigns.length, 21);
  assert.equal(ancestry.phasePi.length, 3);
  assert(ancestry.acceptedSigns.every((value) => value === 0 || value === 1));
  assert.equal(canonicalSha(ancestry.rawToUnitKernel),
    "80c6f56bbd1b46bd99efa54bd438229571d40295e9c1493c1545f338c12ff0f4");
  assert.equal(canonicalSha(ancestry.rawToPresentation),
    "bb82abc1ef9212e640c019b3ef9106b332881d89cff88b5ad599029522da7014");
  assert.equal(canonicalSha(ancestry.acceptedArch),
    "e18c0202fdd5e8ef6c2f7337663da78b912ed924c6b50bf73465b01abec7df15");
  assert.equal(canonicalSha(ancestry.acceptedSigns),
    "573ff08663a44524a8823a0b037d2c96c84237267755aa064dc9b53916f5badc");
  assert.equal(canonicalSha(ancestry.phasePi),
    "23c3fe32481a8f557fd3abc171dfd572a9efd711f26e9a6419ad257514827b1e");
  assert.equal(ancestry.state.packedLogProvenance.acceptedArchSha256,
    canonicalSha(ancestry.acceptedArch));
  assert.equal(ancestry.state.packedLogProvenance.terminalPackedEquality, true);
  assert.deepEqual(ancestry.state.activeFactorRows, [1092, 1094]);
  assert.deepEqual(ancestry.state.acceptedActiveFactorRows, [1092, 1094]);
  assert.equal(ancestry.state.frozenW0UsedAsInput, false);
  return ancestry;
}

function ancestryEvidence(ancestry) {
  return { acceptedArch: ancestry.acceptedArch,
    acceptedSigns: ancestry.acceptedSigns, phasePi: ancestry.phasePi,
    acceptedArchSha256: canonicalSha(ancestry.acceptedArch),
    acceptedSignsSha256: canonicalSha(ancestry.acceptedSigns),
    phasePiSha256: canonicalSha(ancestry.phasePi) };
}

function validateOwner(owner, ancestry) {
  assert.equal(api.verifyOwner(owner, owner.ancestry), true);
  assert.equal(canonicalSha(owner), EXPECTED_OWNER_SHA256,
    "row-6 C5/C6 arithmetic changed");
  assert.deepEqual(owner.field, { polynomial: ["2000000000018", "-2000000000010", "0", "1"],
    degree: 3, signature: [3, 0], unitRank: 2 });
  assert.equal(owner.precision, 192);
  assert.equal(owner.status, "not_given");
  assert.equal(owner.reason, "LARGE");
  assert.equal(owner.materialization, "not_given(LARGE)");
  assert.equal(owner.matchedFlagZero, true);
  assert.equal(owner.exactUnitsPublished, false);
  assert.equal(owner.compactFactoredUnitsRetained, true);
  assert.equal(owner.correspondenceComplete, true);
  assert.deepEqual(owner.compact.unitTransformShape, [7, 2]);
  assert.deepEqual(owner.compact.unitTransform, EXPECTED_TRANSFORM);
  assert.deepEqual(owner.compact.bridgeTransform, EXPECTED_TRANSFORM);
  assert.deepEqual(owner.compact.getfuFactorShape, [2, 2]);
  assert.deepEqual(owner.compact.getfuFactor, ["1", "0", "0", "1"]);
  assert.deepEqual(owner.compact.cleanLogShape, [3, 2]);
  assert.deepEqual(owner.compact.cleanLogs, EXPECTED_CLEAN_LOGS);
  assert.deepEqual(owner.compact.signPhases, [1, 0, 0, 1, 0, 0]);
  assert.deepEqual(owner.compact.relationLatticeShape, [7, 2]);
  assert.deepEqual(owner.compact.relationLattice, EXPECTED_LATTICE);
  assert.deepEqual(owner.compact.regulator, EXPECTED_REGULATOR);
  assert.deepEqual(owner.c5State, [0, 0, 0, 2, 7]);
  assert.deepEqual(owner.c5Trace,
    [1.0195788231247695e-56, 1.1914390535142598e-33, 83268030694439630, 0, 0]);
  assert.deepEqual(owner.factorState, [0, 0]);
  assert.equal(owner.c6Status, 2);
  assert.deepEqual(owner.c6State, [2, 49, 0, 0, 0, 0, 0, 1]);
  assert.deepEqual(owner.provenance,
    { frozenW0RuntimeInput: false, postcomputeDifferentialOnly: true });
  assert.deepEqual(owner.ancestry.acceptedArch, ancestry.acceptedArch);
  assert.deepEqual(owner.ancestry.acceptedSigns, ancestry.acceptedSigns);
  assert.deepEqual(owner.ancestry.phasePi, ancestry.phasePi);
  return owner;
}

function rejectMutations(owner, ancestry) {
  let rejected = 0;
  const rejectAncestry = (change) => {
    const changed = structuredClone(ancestry);
    change(changed);
    assert.throws(() => validateAncestry(changed));
    rejected += 1;
  };
  rejectAncestry((value) => { value.acceptedSigns[0] ^= 1; });
  rejectAncestry((value) => {
    value.phasePi[0] = String(BigInt(value.phasePi[0]) + 1n);
  });
  rejectAncestry((value) => {
    value.acceptedArch[1] = String(BigInt(value.acceptedArch[1]) + 1n);
  });
  const rejectOwner = (change) => {
    const changed = structuredClone(owner);
    change(changed);
    assert.throws(() => validateOwner(changed, ancestry));
    rejected += 1;
  };
  rejectOwner((value) => { value.compact.unitTransform[7] = "0"; });
  rejectOwner((value) => { value.compact.cleanLogs[0] = "0"; });
  rejectOwner((value) => { value.compact.signPhases[0] = 0; });
  rejectOwner((value) => { value.c5State[3] = 1; });
  rejectOwner((value) => { value.c6State[1] = 48; });
  rejectOwner((value) => { value.reason = "PRECI"; });
  rejectOwner((value) => { value.exactUnitsPublished = true; });
  return rejected;
}

function postcomputeDifferential(w0Path, owner) {
  if (w0Path === null) return null;
  const digest = spawnSync("sha256sum", [w0Path], { cwd: ROOT, encoding: "utf8",
    timeout: 600_000 });
  assert.equal(digest.status, 0, digest.stderr || String(digest.error));
  assert.equal(digest.stdout.split(/\s+/)[0], W0_SHA256);
  const query = spawnSync("jq", ["-c",
    ".events[]|select(.event==\"fundamental_units\")|{A,U,CU,fu,regulator}",
    w0Path], { cwd: ROOT, encoding: "utf8", timeout: 600_000,
    maxBuffer: 4 * 1024 * 1024 });
  assert.equal(query.status, 0, query.stderr || String(query.error));
  const reference = JSON.parse(query.stdout);
  assert.equal(reference.fu, null);
  assert.equal(reference.CU.values.length, 0);
  assert.deepEqual([reference.A.values.length, reference.A.values[0].values.length], [2, 3]);
  assert.deepEqual([reference.U.values.length, reference.U.values[0].values.length], [2, 7]);
  assert.deepEqual(owner.compact.regulator,
    [String(reference.regulator.mantissa), String(reference.regulator.precision),
      String(reference.regulator.exponent)]);
  return { w0Sha256: W0_SHA256, fu: null, regulator: true,
    publicAShape: [3, 2], publicUShape: [7, 2], publicCUColumns: 0,
    // Alternate valid compact bases occur; equality to frozen U is not claimed.
    compactBasisComparedByShapeOnly: true };
}

function main() {
  const input = options(process.argv.slice(2));
  const gate = readGate(input.gate), post = readPost(input.post);
  const prepared = readPrepared(input.prepared);
  const ancestry = validateAncestry(readJson(input.ancestry));
  const started = process.hrtime.bigint();
  const result = api.composeInMemory(gate, post, prepared, ancestryEvidence(ancestry));
  const elapsedNs = process.hrtime.bigint() - started;
  assert.equal(result.ownerSha256, EXPECTED_OWNER_SHA256);
  const owner = validateOwner(result.owner, ancestry);
  const mutationsRejected = rejectMutations(owner, ancestry);

  // W0, when requested, is first opened after live C5/C6 has completed.
  const differential = postcomputeDifferential(input.w0, owner);
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row6-rank2-c5-c6-check-v1",
    ownerSha256: result.ownerSha256, ownerBytes: Buffer.byteLength(JSON.stringify(owner)),
    c5State: owner.c5State, factorState: owner.factorState,
    c6Status: owner.c6Status, c6State: owner.c6State,
    unitTransformSha256: canonicalSha(owner.compact.unitTransform),
    cleanLogsSha256: canonicalSha(owner.compact.cleanLogs),
    fullAncestrySha256: canonicalSha(ancestry),
    acceptedArchSha256: canonicalSha(ancestry.acceptedArch),
    acceptedSignsSha256: canonicalSha(ancestry.acceptedSigns),
    phasePiSha256: canonicalSha(ancestry.phasePi),
    mutationsRejected, elapsedNs: String(elapsedNs),
    correspondenceComplete: true, publicComplete: false,
    runtimeInputs: ["immutable Gate-C owner", "post-1137 terminal result",
      "authenticated prepared projection", "full source-replayed ancestry"],
    frozenW0RuntimeInput: false, postcomputeDifferential: differential,
    limits: { addressSpaceBytes: 4 * 1024 ** 3, rssBytes: 4 * 1024 ** 3,
      cpuSeconds: 600, wallTimeoutSeconds: 600 },
  })}\n`);
}

try {
  main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
