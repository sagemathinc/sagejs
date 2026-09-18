#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const api = require("./row6_c7_result_composer.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");

const DEFAULTS = {
  gate: "/tmp/sagejs-row6-gate-c-eQS861/owner/row6-prepared-gate-c-6b6a4ee102f8682254470dc8e7d05f63d5e449282df248a15bc54b938adaac98.json.gz",
  factor: "/tmp/sagejs-row6-factor-base-hy2P4R/owner/row6-prepared-factor-base-1afc78df4b2ff4fe85dd3385589835095c8123da86082de0f66dce4e0897fbef.json.gz",
  prepared: "/tmp/row6-prepared-projection.json",
  post1137: "/tmp/row6-post1137-result.json",
  ancestry: "/tmp/row6-ancestry.json",
  classOwner: "/tmp/row6-terminal-class-owner-new/row6-terminal-class-c224c81bde839387cb3a0a32568acc8da0d9a1f0feec7844a0c6efb9fb80b4be.json",
  unitOwner: "/tmp/row6-unit-owner-real.json",
};
const EXPECTED_ENVELOPE =
  "b3bfd9122875729853f0421ab5ffe6220f161f07add30a9753eb79df784dad73";
const EXPECTED_AUTHORITY =
  "713b8d9e2b73b870faba7db43a8f618d283264b1c20b84c7d7703fa71decb2a8";

function options(argv) {
  const result = { ...DEFAULTS };
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index], value = argv[index + 1];
    assert(value, `missing value for ${option}`);
    const key = { "--gate": "gate", "--factor": "factor",
      "--prepared": "prepared", "--post1137": "post1137",
      "--ancestry": "ancestry", "--class-owner": "classOwner",
      "--unit-owner": "unitOwner" }[option];
    assert(key, `unknown option ${option}`);
    result[key] = path.resolve(value);
  }
  return result;
}
function read(file) {
  const bytes = fs.readFileSync(file);
  return JSON.parse((file.endsWith(".gz") ? zlib.gunzipSync(bytes) : bytes)
    .toString("utf8"));
}
function load(input) {
  return Object.fromEntries(Object.entries(input).map(([key, file]) => [key, read(file)]));
}
function rejectMutation(base, label, mutate) {
  const candidate = structuredClone(base);
  mutate(candidate);
  assert.throws(() => api.prepareRow6C7Result(candidate), undefined, label);
}

function main() {
  const started = process.hrtime.bigint();
  const inputs = load(options(process.argv.slice(2)));
  const prepared = api.prepareRow6C7Result(inputs);
  assert.equal(prepared.schema, api.COMPOSITION_SCHEMA);
  assert.equal(prepared.sealedEnvelopeSha256, EXPECTED_ENVELOPE);
  assert.equal(prepared.mathematicalAuthoritySha256, EXPECTED_AUTHORITY);
  assert.equal(prepared.correspondenceComplete, true);
  assert.equal(prepared.publicComplete, false);
  const raw = Buffer.from(prepared.sealedEnvelopeHex, "hex");
  const authority = neutral.createDetachedClassUnitAuthority({
    envelopeSha256: prepared.sealedEnvelopeSha256,
    mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
    replaySchema: api.PUBLICATION_REPLAY_SCHEMA,
    replay(payload) {
      return { schema: api.PUBLICATION_REPLAY_SCHEMA,
        payloadSha256: neutral.sha256Canonical(payload),
        fieldId: api.FIELD_ID,
        mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
        correspondence_complete: true, public_complete: false };
    },
  });
  const result = neutral.verifyClassUnitCorrespondenceResult(raw, authority);
  const payload = result.detachedPayload();
  assert.deepEqual(payload.classGroup.invariantFactors, ["2", "2"]);
  assert.equal(payload.classGroup.classNumber, "4");
  assert.equal(payload.unitGroup.rank, "2");
  assert.deepEqual(payload.unitGroup.materialization,
    { precisionBits: "192", reason: "LARGE", tag: "not_given" });
  const storage = new Map(payload.storage.map(owner => [owner.name, owner.entries]));
  assert.deepEqual(storage.get("unit-norms"), ["-1", "-1"]);
  assert.equal(storage.get("factored-unit-transform").length, 2 * 1137);
  assert.equal(storage.get("raw-relation-records").length, 1130 * 1137);
  const mutations = [
    ["Gate-C mutation", value => { value.gate.final.relations[0] = "4"; }],
    ["factor mutation", value => { value.factor.factor.packetNorms[0] =
      String(BigInt(value.factor.factor.packetNorms[0]) + 1n); }],
    ["prepared mutation", value => { value.prepared.data.basis_table[0] =
      String(BigInt(value.prepared.data.basis_table[0]) + 1n); }],
    ["post mutation", value => { value.post1137.classNumber = "5"; }],
    ["ancestry mutation", value => { value.ancestry.acceptedSigns[0] ^= 1; }],
    ["class mutation", value => { value.classOwner.classWitness.witnesses[0]
      .rawPrincipalProduct[0].exponent = "1"; },
    ],
    ["unit mutation", value => { value.unitOwner.compact.unitTransform[0] = "2"; }],
  ];
  mutations.forEach(([label, mutation]) => rejectMutation(inputs, label, mutation));
  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row6-c7-result-check-v1",
    envelopeSha256: prepared.sealedEnvelopeSha256,
    mathematicalAuthoritySha256: prepared.mathematicalAuthoritySha256,
    envelopeBytes: raw.length, classNumber: "4", invariants: ["2", "2"],
    unitRank: "2", unitNorms: ["-1", "-1"], mutationsRejected: mutations.length,
    correspondenceComplete: true, publicComplete: false,
    elapsedNs: String(process.hrtime.bigint() - started),
    maxRssKiB: process.resourceUsage().maxRSS,
  })}\n`);
}

try { main(); }
catch (error) { console.error(error.stack || error); process.exitCode = 1; }
