#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const zlib = require("node:zlib");

const ROOT = path.resolve(__dirname, "../..");
const SOURCE = path.join(__dirname, "row6_prepared_initial_relations.py");
const FRONTIER_CHECK = path.join(__dirname, "check_row6_prepared_factor_base_root.cjs");
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-06-26fed17015f6479f.json";
const W0_SHA256 = "2736e19b166c11a5997a6825cd99b612ae23cf6740d2248ac3dd91bc883286a5";
const PREPARED_SHA256 = "851979721cd098271103588af037b2744b99d84ca4752161efc6ab3dd1974a08";
// The frontier is content-addressed, but its diagnostic execution time and
// RSS are intentionally part of the owner, so a fresh verified run need not
// reproduce the first audit receipt's whole-file digest.
const DEGREE = 3;
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const canonical = value => JSON.stringify(value);

function fileSha(file) {
  const run = spawnSync("sha256sum", [file], {
    cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 4096,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return run.stdout.trim().split(/\s+/)[0];
}

function jq(filter, file, maxBuffer = 4 * 1024 * 1024) {
  const run = spawnSync("jq", ["-c", filter, file], {
    cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer,
  });
  assert.equal(run.status, 0, run.stderr || String(run.error));
  return JSON.parse(run.stdout);
}

function parseSignature(source) {
  const match = source.match(
    /def pari_row6_prepared_initial_relations\(([\s\S]*?)\n\) -> int:/,
  );
  assert(match, "row6 initial-relation signature disappeared");
  return match[1].trim().split("\n").map(line => {
    const fields = line.trim().replace(/,$/, "").split(": ");
    assert.equal(fields.length, 2, line);
    return fields;
  });
}

function packedAt(buffer, index) {
  const signedWords = buffer.sizes[index];
  const words = Math.abs(signedWords);
  let value = 0n;
  for (let word = words - 1; word >= 0; word -= 1)
    value = (value << 64n) + buffer.limbs[index * buffer.wordCapacity + word];
  return signedWords < 0 ? -value : value;
}

function packedSlice(buffer, start, end) {
  return Array.from({ length: end - start }, (_, i) => String(packedAt(buffer, start + i)));
}

function sparseBuffer(buffer, rows, columns) {
  const entries = [];
  for (let column = 0; column < columns; column += 1) {
    const start = column * rows;
    for (let row = 0; row < rows; row += 1) {
      const value = packedAt(buffer, start + row);
      if (value !== 0n) entries.push([column, row, String(value)]);
    }
  }
  return entries;
}

function relationOwner(owners, count, rows) {
  const records = [];
  for (let record = 0; record < count; record += 1) {
    const entries = [];
    for (let row = 0; row < rows; row += 1) {
      const value = packedAt(owners.relation_records, record * rows + row);
      if (value !== 0n) entries.push([row, String(value)]);
    }
    records.push({
      entries,
      sourceNz: Number(packedAt(owners.relation_hashes, record)),
      multiplier: String(packedAt(owners.relation_generators, record * DEGREE)),
      generator: packedSlice(owners.relation_generators, record * DEGREE,
        (record + 1) * DEGREE),
      origin: Number(packedAt(owners.relation_metadata, record * 3 + 1)),
      automorphism: Number(packedAt(owners.relation_metadata, record * 3 + 2)),
    });
  }
  return records;
}

function publishOwner(directory, owner) {
  fs.mkdirSync(directory, { recursive: true });
  const plain = Buffer.from(`${canonical(owner)}\n`);
  const ownerSha256 = sha(plain);
  const compressed = zlib.gzipSync(plain, { level: 9, mtime: 0 });
  const compressedSha256 = sha(compressed);
  const destination = path.join(directory,
    `row6-prepared-initial-relations-${ownerSha256}.json.gz`);
  fs.writeFileSync(destination, compressed, { flag: "wx", mode: 0o400 });
  fs.chmodSync(destination, 0o444);
  return { path: destination, ownerSha256, compressedSha256,
    bytes: plain.length, compressedBytes: compressed.length };
}

function readCompressedOwner(file, ownerSha256, compressedSha256 = undefined) {
  const compressed = fs.readFileSync(file);
  if (compressedSha256 !== undefined) assert.equal(sha(compressed), compressedSha256);
  assert.equal(fs.statSync(file).mode & 0o777, 0o444);
  const plain = zlib.gunzipSync(compressed);
  assert.equal(sha(plain), ownerSha256);
  return JSON.parse(plain);
}

function validateFactorOwner(owner, ownerSha256) {
  assert.equal(sha(Buffer.from(`${canonical(owner)}\n`)), ownerSha256);
  assert.equal(owner.schema,
    "sagejs.pari-class-group/row6-prepared-factor-base-owner-v1");
  assert.equal(owner.authority.preparedSha256, PREPARED_SHA256);
  assert.equal(owner.rootState[0], "1");
  assert.equal(owner.rootState[3], "1130");
  assert.equal(owner.rootState[4], "740");
  assert.equal(owner.rootState[5], "740");
  assert.equal(owner.rootState[6], "1130");
  assert.equal(owner.factor.rationalPrimes.length, 740);
  assert.equal(owner.factor.groupOffsets.length, 740);
  assert.equal(owner.factor.groupCounts.length, 740);
  assert.equal(owner.factor.groupComplete.length, 740);
  assert.equal(owner.factor.ramification.length, 1130);
  assert.equal(owner.rng.length, 66);
  assert.equal(owner.publication.factorBaseComplete, true);
  assert.equal(owner.publication.relationCollectionExecuted, false);
}

async function runRoot() {
  const payload = JSON.parse(fs.readFileSync(0, "utf8"));
  assert.deepEqual(Object.keys(payload).sort(), ["factorOwner", "factorOwnerSha256",
    "outputDirectory", "prepared", "preparedAuthoritySha256"]);
  const auth = require("./prepared_nf_authentication.cjs");
  const authority = auth.authenticatePreparedNf(payload.prepared);
  assert.equal(authority.sha256, payload.preparedAuthoritySha256);
  const factorOwner = readCompressedOwner(payload.factorOwner, payload.factorOwnerSha256);
  validateFactorOwner(factorOwner, payload.factorOwnerSha256);
  assert.equal(factorOwner.authority.preparedAuthoritySha256,
    payload.preparedAuthoritySha256);

  const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
  const built = await compileKernel({ sourcePath: SOURCE });
  const module = require(built.modulePath);
  const fn = module.pari_row6_prepared_initial_relations;
  assert.equal(fn.nativeAvailable, true);
  const signature = parseSignature(fs.readFileSync(SOURCE, "utf8"));
  const buffer = (length, words = 1, initial = undefined) =>
    fn.createIntegerBuffer(length, words, initial);
  const prepared = payload.prepared;
  const kc = Number(factorOwner.rootState[3]);
  const kcz = Number(factorOwner.rootState[4]);
  const additional = 5 + Number(prepared.admission_real_count) - 1;
  const target = kc + additional;
  const capacity = 10 * target + 50;
  const owners = {
    polynomial: buffer(DEGREE + 1, 4, prepared.prep_polynomial.map(BigInt)),
    discriminant: BigInt(prepared.analytic_discriminant),
    real_places: BigInt(prepared.admission_real_count),
    complex_pairs: 0n,
    precision: BigInt(prepared.precision),
    equation_index: BigInt(prepared.prep_index),
    factor_state: buffer(factorOwner.rootState.length, 256,
      factorOwner.rootState.map(BigInt)),
    random_state: buffer(66, 1, factorOwner.rng.map(BigInt)),
    rational_primes: buffer(kcz, 1, factorOwner.factor.rationalPrimes.map(BigInt)),
    group_offsets: buffer(kcz, 1, factorOwner.factor.groupOffsets.map(BigInt)),
    group_counts: buffer(kcz, 1, factorOwner.factor.groupCounts.map(BigInt)),
    group_complete: buffer(kcz, 1, factorOwner.factor.groupComplete.map(BigInt)),
    ramification: buffer(kc, 1, factorOwner.factor.ramification.map(BigInt)),
    relation_state: buffer(6, 2),
    relation_basis: buffer(kc * kc, 1),
    relation_records: buffer(capacity * kc, 1),
    relation_hashes: buffer(capacity, 1),
    relation_metadata: buffer(capacity * 3, 1),
    relation: buffer(kc, 1),
    relation_scratch: buffer(kc, 1),
    relation_generators: buffer(capacity * DEGREE, 1),
    root_state: buffer(12, 2),
  };
  assert.deepEqual(signature.map(([name]) => name), Object.keys(owners));
  const args = signature.map(([name]) => owners[name]);
  const rngBefore = packedSlice(owners.random_state, 0, 66);
  const started = process.hrtime.bigint();
  const count = fn.gmp(...args);
  const elapsedNs = process.hrtime.bigint() - started;
  assert.equal(count, 203n);
  const rootState = packedSlice(owners.root_state, 0, 12);
  assert.equal(rootState[0], "1");
  const rng = packedSlice(owners.random_state, 0, 66);
  assert.deepEqual(rng, rngBefore, "initial rational relations consumed randomness");
  const relationState = packedSlice(owners.relation_state, 0, 6);
  const basisEntries = sparseBuffer(owners.relation_basis, kc, kc);
  const records = relationOwner(owners, Number(count), kc);

  const beforeRejectedReplay = canonical({ rootState, relationState, basisEntries, records, rng });
  assert.throws(() => fn.gmp(...args), /fresh publication owner/);
  assert.equal(canonical({
    rootState: packedSlice(owners.root_state, 0, 12),
    relationState: packedSlice(owners.relation_state, 0, 6),
    basisEntries: sparseBuffer(owners.relation_basis, kc, kc),
    records: relationOwner(owners, Number(count), kc),
    rng: packedSlice(owners.random_state, 0, 66),
  }), beforeRejectedReplay, "rejected replay changed the published state");

  const owner = {
    schema: "sagejs.pari-class-group/row6-prepared-initial-relations-owner-v1",
    authority: {
      preparedAuthoritySha256: payload.preparedAuthoritySha256,
      preparedSha256: PREPARED_SHA256,
      factorOwnerSha256: payload.factorOwnerSha256,
      sourceSha256: sha(fs.readFileSync(SOURCE)),
      compilerCoreSha256: sha(fs.readFileSync(built.coreSourcePath)),
    },
    inputAudit: {
      accepted: ["authenticated prepared maximal-order nfinit projection",
        "immutable authenticated row6 factor-base frontier owner",
        "fresh storage sized from the authenticated live factor dimensions"],
      forbidden: ["pristine W0", "initial relation answers", "relation schedule",
        "HNF checkpoints", "class group or unit output"],
    },
    execution: { backend: "gmp", calls: 1, rejectedReplayCalls: 1,
      elapsedNs: String(elapsedNs), maxRssKiB: process.resourceUsage().maxRSS,
      addressSpaceCeilingBytes: "4294967296", cpuLimitSeconds: 600,
      wallTimeoutSeconds: 600 },
    field: factorOwner.field,
    factorState: factorOwner.rootState,
    rootState,
    rng,
    relations: { state: relationState, basisEntries, records },
    capacity: { rows: kc, target, records: capacity,
      basisCells: kc * kc, recordCells: capacity * kc,
      fullTransformationCells: 0, hnfCheckpointCells: 0 },
    publication: { factorBaseComplete: true, initialRelationsComplete: true,
      randomCollectionExecuted: false, hnfExecuted: false,
      replayRejectedWithoutMutation: true },
  };
  const receipt = publishOwner(payload.outputDirectory, owner);
  process.stdout.write(`${canonical({ ...receipt, rootState, elapsedNs: String(elapsedNs),
    maxRssKiB: owner.execution.maxRssKiB, coreSourcePath: built.coreSourcePath })}\n`);
}

function validateInitialOwner(owner, ownerSha256, factorOwnerSha256) {
  assert.equal(sha(Buffer.from(`${canonical(owner)}\n`)), ownerSha256);
  assert.equal(owner.schema,
    "sagejs.pari-class-group/row6-prepared-initial-relations-owner-v1");
  assert.equal(owner.authority.preparedSha256, PREPARED_SHA256);
  assert.equal(owner.authority.factorOwnerSha256, factorOwnerSha256);
  assert.deepEqual(owner.field.polynomial,
    ["2000000000018", "-2000000000010", "0", "1"]);
  assert.deepEqual(owner.field.signature, [3, 0]);
  assert.deepEqual(owner.rootState,
    ["1", "203", "1137", "934", "4", "927", "11420", "1130", "740",
      "7", "1130", "0"]);
  assert.deepEqual(owner.relations.state,
    ["203", "11420", "927", "7", "0", "1137"]);
  assert.equal(owner.relations.records.length, 203);
  assert(owner.relations.basisEntries.length >= 203);
  assert.equal(owner.rng.length, 66);
  assert.equal(owner.capacity.basisCells, 1276900);
  assert.equal(owner.capacity.recordCells, 12904600);
  assert.equal(owner.capacity.fullTransformationCells, 0);
  assert.equal(owner.capacity.hnfCheckpointCells, 0);
  assert.equal(owner.publication.initialRelationsComplete, true);
  assert.equal(owner.publication.randomCollectionExecuted, false);
  assert.equal(owner.publication.hnfExecuted, false);
  assert.equal(owner.publication.replayRejectedWithoutMutation, true);
}

function main() {
  if (process.argv[2] === "--root") return runRoot();
  assert.equal(fileSha(W0), W0_SHA256, "pristine row6 W0 digest changed");
  const preparedEvent = jq(".prepared", W0, 2 * 1024 * 1024);
  assert.equal(sha(Buffer.from(canonical(preparedEvent))), PREPARED_SHA256);
  const auth = require("./prepared_nf_authentication.cjs");
  const prepared = auth.normalizePreparedBundle(preparedEvent);
  const authority = auth.authenticatePreparedNf(prepared);

  // Produce and validate the preceding immutable frontier in a completed,
  // sequential child.  Its cold W0 differential has exited before this stage
  // is admitted or its native child starts.
  const frontier = spawnSync(process.execPath, [FRONTIER_CHECK], {
    cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(frontier.status, 0, frontier.stderr || String(frontier.error));
  const frontierReceipt = JSON.parse(frontier.stdout);
  const factorOwner = readCompressedOwner(frontierReceipt.owner,
    frontierReceipt.ownerSha256, frontierReceipt.compressedSha256);
  validateFactorOwner(factorOwner, frontierReceipt.ownerSha256);

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row6-initial-relations-"));
  const outputDirectory = path.join(temporary, "owner");
  const child = spawnSync("prlimit", ["--as=4294967296", "--cpu=600", "--",
    process.execPath, __filename, "--root"], {
    cwd: ROOT, encoding: "utf8", input: canonical({ prepared,
      preparedAuthoritySha256: authority.sha256, factorOwner: frontierReceipt.owner,
      factorOwnerSha256: frontierReceipt.ownerSha256, outputDirectory }),
    timeout: 600_000, maxBuffer: 4 * 1024 * 1024,
  });
  assert.equal(child.status, 0, child.stderr || String(child.error));
  const receipt = JSON.parse(child.stdout);
  const owner = readCompressedOwner(receipt.path, receipt.ownerSha256,
    receipt.compressedSha256);
  validateInitialOwner(owner, receipt.ownerSha256, frontierReceipt.ownerSha256);

  // Only after native execution and publication, extract the answer-bearing
  // initialized event.  The projection is sparse so the 1,130-square matrix
  // is not retained as a second dense owner.
  const oracle = jq(`.events[] | select(.event=="initialized") | {
    relations, target, need, Nrelid, missing, rng,
    basisEntries: [.basis.values | to_entries[] as $column |
      $column.value.values | to_entries[] | select(.value != "0") |
      [$column.key, .key, .value]],
    records: [.relationRecords[] | {
      entries: [.R.values | to_entries[] | select(.value != "0") | [.key, .value]],
      sourceNz: .nz, multiplier: .m.value,
      generator: [.m.value, "0", "0"], origin, automorphism
    }]
  }`, W0, 16 * 1024 * 1024);
  assert.equal(oracle.relations, 203);
  assert.equal(oracle.target, 1137);
  assert.equal(oracle.need, 934);
  assert.equal(oracle.Nrelid, 4);
  assert.equal(oracle.missing, 927);
  assert.deepEqual(owner.rng, oracle.rng.map(String));
  assert.deepEqual(owner.relations.basisEntries, oracle.basisEntries);
  assert.deepEqual(owner.relations.records, oracle.records);

  let preparedMutationsRejected = 0;
  for (const mutate of [
    value => { value.prep_polynomial[0] = "2000000000019"; },
    value => { value.admission_real_count = "1"; },
  ]) {
    const changed = structuredClone(prepared); mutate(changed);
    assert.throws(() => auth.authenticatePreparedNf(changed));
    preparedMutationsRejected += 1;
  }
  let factorMutationsRejected = 0;
  for (const mutate of [
    value => { value.rootState[3] = "1129"; },
    value => { value.factor.groupOffsets[0] = "1"; },
    value => { value.rng[0] = "0"; },
  ]) {
    const changed = structuredClone(factorOwner); mutate(changed);
    assert.throws(() => validateFactorOwner(changed, frontierReceipt.ownerSha256));
    factorMutationsRejected += 1;
  }
  let ownerMutationsRejected = 0;
  for (const mutate of [
    value => { value.authority.factorOwnerSha256 = "0".repeat(64); },
    value => { value.rootState[1] = "202"; },
    value => { value.relations.records[0].entries[0][1] = "2"; },
    value => { value.relations.basisEntries[0][2] = "2"; },
    value => { value.publication.hnfExecuted = true; },
  ]) {
    const changed = structuredClone(owner); mutate(changed);
    assert.throws(() => validateInitialOwner(changed, receipt.ownerSha256,
      frontierReceipt.ownerSha256));
    ownerMutationsRejected += 1;
  }
  const secondRead = readCompressedOwner(receipt.path, receipt.ownerSha256,
    receipt.compressedSha256);
  assert.deepEqual(secondRead, owner);

  process.stdout.write(`${canonical({
    schema: "sagejs.pari-class-group/row6-prepared-initial-relations-check-v1",
    owner: receipt.path, ownerSha256: receipt.ownerSha256,
    compressedSha256: receipt.compressedSha256, bytes: receipt.bytes,
    compressedBytes: receipt.compressedBytes, elapsedNs: receipt.elapsedNs,
    maxRssKiB: receipt.maxRssKiB, factorOwnerSha256: frontierReceipt.ownerSha256,
    initialRelations: 203, target: 1137, need: 934, missing: 927,
    relationState: owner.relations.state,
    basisSha256: sha(Buffer.from(canonical(owner.relations.basisEntries))),
    recordsSha256: sha(Buffer.from(canonical(owner.relations.records))),
    rngSha256: sha(Buffer.from(canonical(owner.rng))),
    preparedMutationsRejected, factorMutationsRejected, ownerMutationsRejected,
    publicationReplayRejectedWithoutMutation: true,
    immutableOwnerSecondReadIdentical: true,
    coldOracleAfterRootExit: true, w0ResidentBesideNativeExecution: false,
    randomCollectionExecuted: false, hnfExecuted: false,
    fullTransformationCells: 0, hnfCheckpointCells: 0,
  })}\n`);
}

Promise.resolve(main()).catch(error => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
