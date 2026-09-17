#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const durable = "/scratch/sagejs-runtime/pari-class-group-e2e-20260917/field3-authority";
const authoritySha = "246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c";
const liveSha = "b8df9b99acb501d8ea0faf3034c1059d451ffd84180735c89c982b0f014da814";
const protocolSha = "892afa9a63da8353cce50eead03b12f031812182a3229a48ed8fbdfa60b94e72";
const authorityPath = path.join(durable, `authority-${authoritySha}.json`);
const livePath = path.join(durable, `live-class-join-${liveSha}.json`);
const protocolPath = path.join(durable, `field3-local-hnf-protocol-${protocolSha}.json`);
const coordinator = path.join(__dirname, "field3_terminal_source_owners.cjs");

function sha(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function immutable(directory, name, value) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  const digest = sha(bytes);
  const selected = path.join(directory, `${name}-${digest}.json`);
  fs.writeFileSync(selected, bytes, { flag: "wx", mode: 0o444 });
  return { path: selected, sha256: digest };
}
function run(args) {
  const result = spawnSync(process.execPath, [coordinator, ...args], {
    cwd: root, encoding: "utf8", timeout: 600_000, maxBuffer: 256 * 1024 * 1024,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return JSON.parse(result.stdout);
}
function reject(args, output, label) {
  const before = new Set(fs.readdirSync(output));
  const result = spawnSync(process.execPath, [coordinator, ...args], {
    cwd: root, encoding: "utf8", timeout: 600_000, maxBuffer: 256 * 1024 * 1024,
  });
  assert.notEqual(result.status, 0, label);
  assert.deepEqual(new Set(fs.readdirSync(output)), before, `${label}: partial publication`);
}
function base(operation, output) {
  return ["--operation", operation,
    "--authority", authorityPath, "--authority-sha256", authoritySha,
    "--live-join", livePath, "--live-join-sha256", liveSha,
    "--output-dir", output];
}

for (const selected of [authorityPath, livePath, protocolPath]) {
  assert.equal(fs.statSync(selected).mode & 0o777, 0o444, selected);
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "field3-terminal-sources-"));
const output = path.join(temporary, "published");
try {
  const relationArgs = base("relation", output);
  const relation = run(relationArgs);
  assert.deepEqual(run(relationArgs), relation, "relation publication is not idempotent");
  assert.equal(fs.statSync(relation.path).mode & 0o777, 0o444);
  const relationValue = JSON.parse(fs.readFileSync(relation.path));
  assert.equal(relationValue.exactOwners.relationRecords.length, 288 * 301);
  assert.equal(relationValue.exactOwners.principalGenerators.length, 4 * 301);
  assert.equal(relationValue.replay.relationRecordsSha256,
    "5df8c4bb02cd481965fdb01bac424f58d419216e3cefd4883ac985631da0e719");
  assert.equal(relationValue.replay.principalGeneratorsSha256,
    "31e9c9b4c0245417ce9265d5233d1a67fb717206e9811975cb85a59af03ab5de");
  assert.equal(relationValue.replay.relationMetadataSha256,
    "c751a9a91b9f17fc4047d8483e36d6ac6f9a0c1fe04ad072ed405f4a9c3a9f3b");
  assert.equal(relationValue.replay.principalRelationsExact, true);

  const authority = JSON.parse(fs.readFileSync(authorityPath));
  const live = JSON.parse(fs.readFileSync(livePath));
  // This authentic discrepancy is the regression for comparing only the
  // selected prefix. Positions 2 and 5 differ, while [11,2] is identical.
  assert.deepEqual(authority.authority.owners.outerPermutation.slice(0, 2), ["11", "2"]);
  assert.deepEqual(live.live.outerPerm.slice(0, 2), ["11", "2"]);
  assert.notDeepEqual(authority.authority.owners.outerPermutation, live.live.outerPerm);

  const generateRaw = String.raw`import importlib,json,sys
sys.set_int_max_str_digits(0)
sys.path.extend(['src/lib','src/baselib'])
h=importlib.import_module('bench.pari-class-group-port.field3_high_precision_hnf_transform')
entry=[1,0,-1,0,0,-1,0]
logs=entry*(301*3);logs[:7]=[1,1<<153087,153088,0,0,-1,0]
raw={'schema':h.RAW_SCHEMA,'field':h.FIELD,'runIdentity':h.RUN_IDENTITY,
'targetBits':h.TARGET_BITS,'sourceStart':0,'sourceCount':301,'sourceStop':301,
'totalColumns':301,'scalarColumns':26,'nonscalarColumns':275,'places':3,
'layout':h.RAW_LAYOUT,'packedLogs':[str(x) for x in logs],
'authoritySha256':h.AUTHORITY_SHA256,'initialOwnerSha256':h.INITIAL_SHA256,
'preparedOwnerSha256':h.PREPARED_SHA256,'normConsequencesSha256':h.NORM_SHA256,
'sourceDigests':h.SOURCE_DIGESTS,'realOwnerSha256':'0'*64,'complexOwnerSha256':'1'*64}
json.dump(raw,sys.stdout,separators=(',',':'));print()`;
  const generatedRaw = spawnSync("python3", ["-c", generateRaw], {
    cwd: root, encoding: "utf8", timeout: 600_000,
    maxBuffer: 256 * 1024 * 1024 });
  assert.equal(generatedRaw.status, 0, generatedRaw.stderr);
  const raw = immutable(temporary, "qualified-raw", JSON.parse(generatedRaw.stdout));
  const generateFull = String.raw`import importlib,json,sys
sys.set_int_max_str_digits(0);sys.path.extend(['src/lib','src/baselib'])
m=importlib.import_module('bench.pari-class-group-port.field3_full_terminal_ancestry')
raw=json.load(open(sys.argv[1]));protocol=json.load(open(sys.argv[2]));authority=json.load(open(sys.argv[3]))
o=m.transform_authenticated_owners(raw,protocol,authority)
o.update(rawOwnerSha256=sys.argv[4],protocolOwnerSha256=sys.argv[5],authorityOwnerSha256=sys.argv[6])
json.dump(o,sys.stdout,separators=(',',':'));print()`;
  const generatedFull = spawnSync("python3", ["-c", generateFull, raw.path,
    protocolPath, authorityPath, raw.sha256, protocolSha, authoritySha], {
    cwd: root, encoding: "utf8", timeout: 600_000, maxBuffer: 256 * 1024 * 1024 });
  assert.equal(generatedFull.status, 0, generatedFull.stderr);
  const full15Value = JSON.parse(generatedFull.stdout);
  const full15 = immutable(temporary, "qualified-full15", full15Value);

  const classArgs = [...base("class", output),
    "--full15", full15.path, "--full15-sha256", full15.sha256,
    "--relation", relation.path, "--relation-sha256", relation.sha256,
    "--raw-owner", raw.path, "--raw-owner-sha256", raw.sha256,
    "--protocol-owner", protocolPath, "--protocol-owner-sha256", protocolSha];
  // Argument order is irrelevant and duplicate names are forbidden.
  const classOwner = run(classArgs);
  assert.deepEqual(run(classArgs), classOwner, "class publication is not idempotent");
  assert.equal(fs.statSync(classOwner.path).mode & 0o777, 0o444);
  const classValue = JSON.parse(fs.readFileSync(classOwner.path));
  assert.deepEqual(classValue.W, ["2", "0", "0", "2"]);
  assert.equal(sha(Buffer.from(classValue.W.join("\n"))),
    "46d6c145414df201ebf96369acdee6ba78838091d683df2c2c882927dcbeeb05");
  assert.equal(sha(Buffer.from(classValue.B.join("\n"))),
    "95d69b0ca992721014b784a38c7a9537192c25049fa4fa1b774c182a0d164717");
  assert.deepEqual(classValue.Vbase.map((entry) => [entry.packetIndex, entry.prime]),
    [["11", "13"], ["2", "3"]]);
  assert.deepEqual(classValue.retainedWitness.generatorIdeals, [
    "13", "0", "3", "6", "0", "13", "8", "1",
    "0", "0", "1", "0", "0", "0", "0", "1",
    "3", "0", "2", "1", "0", "3", "0", "2",
    "0", "0", "1", "0", "0", "0", "0", "1",
  ], "antiuniformizer tau must produce p*P^-1, not the order-two packet P");
  assert.notDeepEqual(classValue.Vbase.flatMap((entry) => entry.tau),
    live.expected.retained.tau, "live expected tau must not gate acceptance");
  assert.equal(classValue.replay.terminalBExact, true);
  assert.equal(classValue.replay.orderPrincipalIdealsExact, true);
  assert.deepEqual(classValue.invariants, ["2", "2"]);
  assert.equal(classValue.classNumber, "4");
  assert.equal(classValue.replay.wholePermutationCompared, false);

  reject(relationArgs.map((entry, index) => index === 5 ? "0".repeat(64) : entry),
    output, "digest mutation");

  const badPermutation = structuredClone(full15Value);
  badPermutation.terminalPermutation[0] = "2";
  const badPermOwner = immutable(temporary, "bad-prefix", badPermutation);
  reject(classArgs.map((entry, index) => entry === full15.path && index > 0
    ? badPermOwner.path : entry).map((entry, index) => entry === full15.sha256 && index > 0
    ? badPermOwner.sha256 : entry), output, "selected-prefix mutation");

  const badTransform = structuredClone(full15Value);
  badTransform.transform[13 * 301] = String(BigInt(badTransform.transform[13 * 301]) + 1n);
  const badTransformOwner = immutable(temporary, "bad-transform", badTransform);
  reject(classArgs.map((entry) => entry === full15.path ? badTransformOwner.path :
    entry === full15.sha256 ? badTransformOwner.sha256 : entry),
  output, "full15 image mutation");

  const badRelation = structuredClone(relationValue);
  badRelation.exactOwners.relationRecords[0] = String(
    BigInt(badRelation.exactOwners.relationRecords[0]) + 1n);
  const badRelationOwner = immutable(temporary, "bad-relation", badRelation);
  reject(classArgs.map((entry) => entry === relation.path ? badRelationOwner.path :
    entry === relation.sha256 ? badRelationOwner.sha256 : entry),
  output, "relation mutation");

  const badRawValue = JSON.parse(fs.readFileSync(raw.path));
  badRawValue.packedLogs[1] = String(BigInt(badRawValue.packedLogs[1]) + 1n);
  const badRaw = immutable(temporary, "bad-raw", badRawValue);
  reject(classArgs.map((entry) => entry === raw.path ? badRaw.path :
    entry === raw.sha256 ? badRaw.sha256 : entry), output, "raw ancestry mutation");

  const duplicateBytes = fs.readFileSync(authorityPath, "utf8").replace(
    /^\{/, '{"authority":null,');
  const duplicate = path.join(temporary, "duplicate.json");
  fs.writeFileSync(duplicate, duplicateBytes, { mode: 0o444 });
  reject(["--operation", "relation", "--authority", duplicate,
    "--authority-sha256", sha(Buffer.from(duplicateBytes)),
    "--live-join", livePath, "--live-join-sha256", liveSha,
    "--output-dir", output], output, "duplicate JSON key");

  console.log(JSON.stringify({
    schema: "field3-terminal-source-owners-check-v1",
    relationOwnerSha256: relation.sha256,
    classOwnerSha256: classOwner.sha256,
    exactPrincipalRelations: 301,
    selectedPackets: [11, 2],
    classGroup: [2, 2],
    selectedPrefixOnly: true,
    publication: "atomic-idempotent-0444",
    mutations: 6,
    authenticHighPrecisionRun: false,
  }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
