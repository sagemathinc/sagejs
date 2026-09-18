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
const api = require("./row11_terminal_class_closure_coordinator.cjs");
const manifestAuthority = require("./row11_manifest_authority.cjs");

const HERE = __dirname;
const ROOT = path.resolve(HERE, "../..");
const COORDINATOR = path.join(HERE, "row11_terminal_class_closure_coordinator.cjs");
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-11-ce2bfa61425aa681.json";
const W0_SHA256 = "6444c0501657bf0109b96fff44c50e7684b80dcb1cfa4587951d1ae4abe04165";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function args(output, digest = W0_SHA256) {
  return ["600", "prlimit", "--as=4294967296", "--rss=4294967296", "--cpu=600", "--",
    process.execPath, COORDINATOR, "--pristine-w0", W0, "--pristine-sha256", digest,
    "--output-dir", output];
}
function run(output, digest = W0_SHA256, expected = 0) {
  const result = spawnSync("timeout", args(output, digest), {
    cwd: ROOT, encoding: "utf8", timeout: 610_000, maxBuffer: 256 * 1024 * 1024,
  });
  assert.equal(result.status, expected, result.stderr || result.stdout || String(result.error));
  return result;
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row11-terminal-closure-check-"));
const output = path.join(temporary, "owners");
try {
  const historical = manifestAuthority.authenticateHistoricalFreshCorpusManifest(
    fs.readFileSync(path.join(HERE, "fresh-prepared-corpus-manifest.json")));
  assert.equal(historical.sourceSha256, W0_SHA256);
  assert.equal(sha(fs.readFileSync(W0)), W0_SHA256);
  const started = Date.now();
  const first = JSON.parse(run(output).stdout);
  const second = JSON.parse(run(output).stdout);
  assert.deepEqual(second, first, "cold replay publication is not idempotent");
  assert.deepEqual(fs.readdirSync(output), [path.basename(first.path)]);
  assert.equal(fs.statSync(first.path).mode & 0o777, 0o444);
  assert.equal(sha(fs.readFileSync(first.path)), first.sha256);
  const owner = JSON.parse(fs.readFileSync(first.path));
  assert.equal(api.verifyOwner(owner, owner.ancestry), true);
  assert.equal(owner.ancestry.manifestSha256,
    manifestAuthority.HISTORICAL_SOURCE_MANIFEST_SHA256);

  const records = owner.exactRelations.relationRecords.map(BigInt);
  const transform = owner.relationClosure.transform.map(BigInt);
  const permutation = owner.relationClosure.terminalPermutation.map(Number);
  for (let column = 0; column < 11; column += 1) {
    for (let row = 0; row < 421; row += 1) {
      let value = 0n;
      for (let source = 0; source < 430; source += 1)
        value += records[source * 421 + row] * transform[column * 430 + source];
      const logical = permutation.indexOf(row + 1);
      const expected = column < 9 || logical < 0 || logical >= 2
        ? 0n : BigInt(logical === column - 9 ? 2 : 0);
      assert.equal(value, expected, `R*T[${row},${column}]`);
    }
  }
  for (let witness = 0; witness < 2; witness += 1) {
    const compact = owner.witnesses[witness].compactPrincipalProduct;
    const expanded = Array(430).fill(0n);
    for (let index = 0; index < compact.factorCount; index += 1)
      expanded[Number(compact.relationIndices[index])] = BigInt(compact.relationExponents[index]);
    assert.deepEqual(expanded, transform.slice((9 + witness) * 430, (10 + witness) * 430));
  }

  let mutations = 0;
  function reject(change) {
    const changed = clone(owner); change(changed);
    assert.throws(() => api.verifyOwner(changed, owner.ancestry)); mutations += 1;
  }
  reject(value => { value.ancestry.compactTransformSha256 = "0".repeat(64); });
  reject(value => { value.relationClosure.transform[0] = String(BigInt(value.relationClosure.transform[0]) + 1n); });
  reject(value => { value.exactRelations.relationRecords[0] = "5"; });
  reject(value => { value.exactRelations.factorBaseIdeals[0] = "4"; });
  reject(value => { value.witnesses[0].order = "1"; });
  reject(value => { value.witnesses[1].compactPrincipalProduct.relationExponents[0] = "0"; });
  reject(value => { value.classGroup.classNumber = "2"; });
  reject(value => { value.comparison.terminalOracleUsedAsInput = true; });
  reject(value => { value.replay.all430PrincipalRelationsReplayed = false; });
  reject(value => { value.completion.classWitnessesComplete = false; });

  const before = fs.readdirSync(output);
  const wrongDigest = run(output, "0".repeat(64), 1);
  assert.match(wrongDigest.stderr, /wrong pristine row-11 digest/);
  assert.deepEqual(fs.readdirSync(output), before);

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/row11-terminal-class-closure-check-v1",
    ownerSha256: first.sha256,
    ownerBytes: first.bytes,
    sourceSchedule: [427, 428, 430],
    hnfStates: owner.replay.hnfStates,
    transformShape: [430, 11],
    kernelColumns: 9,
    classColumns: 2,
    exactPrincipalRelations: owner.replay.principalRelationsReplayed,
    idealMultiplications: owner.replay.idealMultiplications,
    witnessFactorCounts: owner.witnesses.map(value => value.compactPrincipalProduct.factorCount),
    equations: ["R*Tunit=0", "R*Tclass=perm^-1(diag(2,2))"],
    invariants: owner.classGroup.invariantFactors,
    classNumber: owner.classGroup.classNumber,
    mutationsRejected: mutations + 1,
    publication: "atomic-idempotent-0444",
    elapsedMs: Date.now() - started,
    limits: { timeoutSeconds: 600, addressSpaceGiB: 4, rssGiB: 4, cpuSeconds: 600 },
    unitsComplete: false,
    correspondenceComplete: false,
    publicComplete: false,
  })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
