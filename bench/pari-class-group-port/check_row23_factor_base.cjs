#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const HERE = __dirname;
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-23-c3077e07c31ac758.json";
const W0_SHA256 = "6c4a0b2f5e74d5f156714fad24b0bbf41c8d4998de5bbd046d74c6d8a3930c89";
const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const canonical = value => JSON.stringify(value);
const iv = value => String(value?.kind === "integer" ? value.value : value);

async function main() {
  assert.equal(sha(fs.readFileSync(W0)), W0_SHA256);
  const raw = JSON.parse(fs.readFileSync(W0));
  const auth = require("./prepared_nf_authentication.cjs");
  const coordinator = require("./row23_factor_base_coordinator.cjs");
  const prepared = auth.normalizePreparedBundle(raw.prepared);
  assert.equal(auth.authenticatePreparedNf(prepared).sha256, coordinator.PREPARED_SHA256);
  const firstDirectory = fs.mkdtempSync(path.join("/scratch", "sagejs-row23-factor-a-"));
  const secondDirectory = fs.mkdtempSync(path.join("/scratch", "sagejs-row23-factor-b-"));
  const request = outputDirectory => ({ prepared, preparedAuthoritySha256:
    coordinator.PREPARED_SHA256, outputDirectory });
  const first = await coordinator.run(request(firstDirectory));
  const second = await coordinator.run(request(secondDirectory));
  assert.equal(first.ownerSha256, second.ownerSha256);
  assert.equal(first.compressedSha256, second.compressedSha256);
  assert.deepEqual(first.owner, second.owner);
  assert.equal(fs.statSync(first.path).mode & 0o777, 0o444);
  assert.equal(sha(zlib.gunzipSync(fs.readFileSync(first.path))), first.ownerSha256);
  assert.equal(first.owner.schema, coordinator.SCHEMA);
  assert.equal(first.owner.provenance.frozenAnswerInputs, false);
  assert(!fs.readFileSync(path.join(HERE, "row23_factor_base_coordinator.cjs"), "utf8")
    .includes("panel-23-c3077e07c31ac758.json"));

  // W0 becomes an assertion-only oracle after both live publications exist.
  const event = raw.events.find(value => value.event === "factor_base");
  assert(event);
  assert.deepEqual(first.owner.bounds, {
    C1: iv(event.C1), C2: iv(event.C2), KC: iv(event.KC), KCZ: iv(event.KCZ),
    KCZ2: iv(event.KCZ2), KC2: iv(event.KC),
    prodZ: "212661420005067101028135239405341",
  });
  assert.deepEqual(first.owner.factorBase.rationalPrimes, event.FB.values.map(iv));
  assert.deepEqual(first.owner.factorBase.permutation, event.perm.values.map(iv));
  assert.deepEqual(first.owner.factorBase.subfactor, event.subfactor.values.map(iv));
  const grouped = records => Object.fromEntries([...new Set(records.map(value => value[0]))]
    .map(prime => [prime, records.filter(value => value[0] === prime)
      .map(value => value.slice(1)).sort((a, b) => canonical(a).localeCompare(canonical(b)))]));
  assert.deepEqual(grouped(first.owner.factorBase.descriptors.map(value =>
    [value[0], value[1], value[2]])), grouped(event.LP.values.map(value =>
    [iv(value.values[0]), iv(value.values[2]), iv(value.values[3])])));

  const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");
  const built = await compileKernel({ sourcePath: path.join(HERE, "row21_factor_base.py") });
  const hnf = require(built.modulePath).pari_row21_prime_ideal_hnf;
  const buffer = (length, words = 16, values) =>
    hnf.createIntegerBuffer(length, words, values?.map(BigInt));
  const packedAt = (owner, index) => {
    const signedWords = owner.sizes[index], words = Math.abs(signedWords); let value = 0n;
    for (let word = words - 1; word >= 0; word -= 1)
      value = (value << 64n) + owner.limbs[index * owner.wordCapacity + word];
    return String(signedWords < 0 ? -value : value);
  };
  const table = buffer(125, 16, prepared.basis_table);
  const oracleIdeals = event.LP.values.map(descriptor => {
    const fields = descriptor.values, output = buffer(25);
    hnf.gmp(table, buffer(5, 16, fields[1].values.map(iv)), BigInt(iv(fields[0])),
      buffer(25), buffer(25), buffer(5, 4), output);
    return Array.from({ length: 25 }, (_, i) => packedAt(output, i));
  });
  const computedIdealGroups = grouped(first.owner.factorBase.ideals.map((ideal, i) =>
    [first.owner.factorBase.descriptors[i][0], ...ideal]));
  const oracleIdealGroups = grouped(oracleIdeals.map((ideal, i) =>
    [iv(event.LP.values[i].values[0]), ...ideal]));
  assert.deepEqual(computedIdealGroups, oracleIdealGroups,
    "computed row23 prime-ideal sets differ from the frozen source factor base");

  const mutations = [];
  async function rejected(label, mutate, pattern) {
    const changed = structuredClone(prepared); mutate(changed);
    const directory = fs.mkdtempSync(path.join("/scratch", `sagejs-row23-bad-${label}-`));
    await assert.rejects(coordinator.run({ prepared: changed,
      preparedAuthoritySha256: coordinator.PREPARED_SHA256, outputDirectory: directory }), pattern);
    assert.deepEqual(fs.readdirSync(directory), []); mutations.push(label);
  }
  await rejected("polynomial", value => { value.prep_polynomial[0] = "342"; },
    /discriminant|authority|basis/);
  await rejected("inverse-basis", value => {
    value.prep_invzk[24] = String(BigInt(value.prep_invzk[24]) + 1n);
  }, /basis (inverse|product)/);
  await rejected("tensor", value => {
    value.basis_table[124] = String(BigInt(value.basis_table[124]) + 1n);
  }, /basis (multiplication|product)/);
  await assert.rejects(coordinator.run({ prepared, preparedAuthoritySha256: "0".repeat(64),
    outputDirectory: fs.mkdtempSync(path.join("/scratch", "sagejs-row23-bad-auth-")) }),
  /prepared authority changed/);
  mutations.push("authority");
  await assert.rejects(coordinator.run({ prepared, preparedAuthoritySha256:
    coordinator.PREPARED_SHA256, outputDirectory: firstDirectory, extra: true }),
  /unreviewed row23 factor-base payload/);
  mutations.push("payload");

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row23-prepared-factor-base-check-v1",
    ownerSha256: first.ownerSha256,
    compressedSha256: first.compressedSha256,
    bytes: first.bytes,
    bounds: first.owner.bounds,
    descriptors: first.owner.factorBase.descriptors.length,
    exactIdealMatches: oracleIdeals.length,
    permutation: first.owner.factorBase.permutation,
    subfactor: first.owner.factorBase.subfactor,
    indexPrimePacket: first.owner.indexPrimePacket,
    mutationsRejected: mutations,
    sourceSha256: first.owner.authority.sourceSha256,
    coreSha256: first.owner.authority.coreSha256,
  })}\n`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
