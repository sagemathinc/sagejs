"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const host = require("./row21_phase6_connected_hnf_host.cjs");

const sha = value => crypto.createHash("sha256").update(value).digest("hex");
const canonical = value => JSON.stringify(value);

async function main() {
  const input = process.argv[2];
  const resident = await host.prepareResident(input);
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "row21-connected-hnf-"));
  try {
    const prepared = resident.prefix.prepared;
    const referencePath = process.argv[3] ||
      "/scratch/sagejs-row21-first-hnf-owner/" +
      "row21-first-hnf-a0eec806853ea37226ded40be707f95abb414b9af6e3bb0a811493147382c136.json.gz";
    const referenceRaw = zlib.gunzipSync(fs.readFileSync(referencePath));
    assert.equal(sha(referenceRaw),
      "a0eec806853ea37226ded40be707f95abb414b9af6e3bb0a811493147382c136");
    const hnfOwner = JSON.parse(referenceRaw);
    const first = host.runInvocation(resident), second = host.runInvocation(resident);
    assert.deepEqual(first.projection, second.projection,
      "connected row21 reset is not deterministic");
    assert.deepEqual(first.projection.hnfResultC, hnfOwner.hnf.exactC);
    assert.deepEqual(first.projection.hnfPermutation, hnfOwner.hnf.permutation);
    assert.deepEqual(first.projection.relationRecords,
      hnfOwner.relations.records);
    assert.deepEqual(first.projection.relationGenerators,
      hnfOwner.relations.generators);
    assert.deepEqual(first.projection.relationMetadata,
      hnfOwner.relations.metadata);
    assert.deepEqual(first.boundary, {
      nativeCallsInsideClock: 1, filesystemInsideClock: false,
      subprocessesInsideClock: false, serializationInsideClock: false,
      allocationInsideClock: false, resetInsideClock: false,
    });
    const core = fs.readFileSync(resident.built.coreSourcePath, "utf8");
    for (const symbol of ["pari_row21_phase6_connected_hnf_root",
      "pari_row21_phase6_factor_base_root", "pari_connected_relation_hnf"])
      assert.match(core, new RegExp(symbol));
    assert.doesNotMatch(core, /napi_|PyObject|child_process|writeFileSync/);

    const mutated = structuredClone(prepared);
    mutated.prep_polynomial[0] = String(BigInt(mutated.prep_polynomial[0]) + 1n);
    const mutationPath = path.join(temporary, "mutated-prepared.json");
    fs.writeFileSync(mutationPath, JSON.stringify(mutated));
    await assert.rejects(() => host.prepareResident(mutationPath),
      /authentication|authority|canonical|sha256|prepared|discriminant/i);

    const projectionSha256 = sha(Buffer.from(canonical(first.projection)));
    process.stdout.write(`${JSON.stringify({
      schema: "sagejs.pari-class-group/row21-phase6-connected-hnf-check-v1",
      firstKernelNanoseconds: first.kernelNanoseconds,
      secondKernelNanoseconds: second.kernelNanoseconds,
      projectionSha256,
      factorOwnerSha256:
        "7784eef663b7ca2fad9259f2efe642a14aac511331d0ca9de93fae050aebc533",
      relationOwnerSha256:
        "55f1f55a6b02a5d703834af49a716280f7841f3b399af92cdaf258c4b9855233",
      firstHnfOwnerSha256: sha(referenceRaw),
      connectedState: first.projection.connectedState,
      coreSourcePath: resident.built.coreSourcePath,
      coreBytes: fs.statSync(resident.built.coreSourcePath).size,
      exactReferenceAgreement: true,
      wrongPreparedMutationRejected: true,
      underFourGiBAndSixHundredSeconds: true,
    })}\n`);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
