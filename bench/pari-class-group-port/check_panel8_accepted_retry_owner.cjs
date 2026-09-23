#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { verifyOwner } = require("./panel8_accepted_retry_owner_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const coordinator = path.join(__dirname, "panel8_accepted_retry_owner_coordinator.cjs");
const phase0 = "/scratch/sagejs-runtime/pari-class-group-phase0-8b33815fe-quartic/artifacts-retry-capability-reuse/stages";
const sources = {
  w0: ["/scratch/sagejs-pari-development-panel-a998/panel-08-4184b3a9e86b3cc2.json",
    "4f7535622072f1350787ca8caab417cce4023aea4ef68c67c3fb20ef65d01ca1"],
  collector: [path.join(phase0, "quartic-collector/attempts/attempt-ELVBxL/generated/sagejs-actual-initial-collector-UgfhOe/fixtures.json"),
    "be4eaadda76b1492a20150034465315ba3ed373c13ba3344b044de1c7180b294"],
  continuation: [path.join(phase0, "quartic-continuation/attempts/attempt-tM55L8/generated/sagejs-actual-collector-continuation-Pl4fAw/fixtures.json"),
    "10ce6bfb0c8ac09f0f5d85ec3249663a45420a7ea0a61b294a6d7f7ebdc4e290"],
  analytic: [path.join(phase0, "analytic/attempts/attempt-zzat0w/generated/sagejs-analytic-invhr-dXKmzQ/fixtures.json"),
    "8172519ead7d1bbcea32048b68a6c80e3f9ed050496a8ef78a859b79dffc29b7"],
  driver: [path.join(phase0, "quartic-driver/attempts/attempt-1juFAL/generated/sagejs-default-driver-lYQdj5/trace.json"),
    "aa428f629b35fb06b93164afc54ff2713414ccfdc08432bc7f17f488bd4e634b"],
  "append-trace": [path.join(phase0, "quartic-hnfadd-trace/attempts/attempt-AqBYhP/generated/sagejs-default-driver-xI82jK/trace.json"),
    "3fc311d18137213c8fb202b3e2c16ecb9ffabe30aadf3e8d6249792eabeb8c83"],
};
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function args(output) {
  const result = [coordinator];
  for (const [key, [file, digest]] of Object.entries(sources)) {
    result.push(`--${key}`, file, `--${key}-sha256`, digest);
  }
  result.push("--output-dir", output);
  return result;
}

function run(arguments_, expected = 0) {
  const result = spawnSync(process.execPath, arguments_, {
    cwd: ROOT, encoding: "utf8", timeout: 180_000, maxBuffer: 32 * 1024 * 1024,
  });
  assert.equal(result.status, expected, result.stderr || String(result.error));
  return result;
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-panel8-owner-check-"));
try {
  for (const [file, digest] of Object.values(sources)) {
    assert(fs.existsSync(file), `missing durable artifact ${file}`);
    assert.equal(sha256(fs.readFileSync(file)), digest, `changed durable artifact ${file}`);
  }
  const output = path.join(temporary, "owners");
  const first = JSON.parse(run(args(output)).stdout);
  const second = JSON.parse(run(args(output)).stdout);
  assert.deepEqual(second, first, "publication is not idempotent");
  assert.equal(fs.statSync(first.path).mode & 0o777, 0o444);
  assert.equal(sha256(fs.readFileSync(first.path)), first.sha256);
  assert.deepEqual(fs.readdirSync(output), [path.basename(first.path)]);
  const owner = JSON.parse(fs.readFileSync(first.path));
  const expectedAncestry = structuredClone(owner.ancestry);
  assert(verifyOwner(owner, expectedAncestry));
  assert.equal(owner.retryPasses.length, 3);
  assert.equal(owner.terminal.relationRecords.length, 21736);
  assert.equal(owner.terminal.generators.length, 608);
  assert.equal(owner.terminal.packedLogEmbeddings.length, 3192);
  assert.equal(owner.terminal.transformedLogs.length, 3192);

  let mutationCases = 0;
  const rejectOwner = (mutate) => {
    const changed = structuredClone(owner);
    mutate(changed);
    assert.throws(() => verifyOwner(changed, expectedAncestry));
    mutationCases += 1;
  };
  rejectOwner((value) => { value.field.id = "generated-sha256-" + "0".repeat(64); });
  rejectOwner((value) => { value.ancestry.preparedW0Sha256 = "0".repeat(64); });
  rejectOwner((value) => { value.retryPasses[0].relationCount = 149; });
  rejectOwner((value) => { value.retryPasses[1].status = 0; });
  rejectOwner((value) => { value.retryPasses[2].driverTrace[11] = 5; });
  rejectOwner((value) => { value.retryPasses[0].transformedLogs[0] = "1"; });
  rejectOwner((value) => { value.terminal.relationRecords[0] = "1"; });
  rejectOwner((value) => { value.terminal.generators[600] = "1"; });
  rejectOwner((value) => { value.terminal.packedLogEmbeddings[3000] = "1"; });
  rejectOwner((value) => { value.terminal.transformedLogs[3000] = "1"; });
  rejectOwner((value) => { value.terminal.relationLattice[17] = "6"; });
  rejectOwner((value) => { value.terminal.regulator[2] = "28"; });
  rejectOwner((value) => { value.pristineComparison.exactRegulators[2][2] = "28"; });
  rejectOwner((value) => { value.terminal.classNumber = "2"; });
  rejectOwner((value) => { value.pristineComparison.terminalStateCompared = false; });

  const before = fs.readdirSync(output);
  const badArgs = args(output);
  badArgs[badArgs.indexOf("--w0-sha256") + 1] = "0".repeat(64);
  const rejected = run(badArgs, 1);
  assert.match(rejected.stderr, /prepared W0 digest changed/);
  assert.deepEqual(fs.readdirSync(output), before, "failed input authentication published output");
  assert.equal(fs.readdirSync(output).some((entry) => entry.startsWith(".")), false,
    "failed publication left a temporary file");
  mutationCases += 1;

  process.stdout.write(`${JSON.stringify({
    schema: "sagejs.pari-class-group/panel8-accepted-retry-check-v1",
    ownerSha256: first.sha256,
    ownerBytes: first.bytes,
    relationCounts: owner.retryPasses.map((entry) => entry.relationCount),
    actions: owner.retryPasses.map((entry) => entry.driverTrace.at(-4)),
    classNumber: owner.terminal.classNumber,
    regulator: owner.terminal.regulator,
    exactPrefixComparisons: owner.pristineComparison.allThreeExactPrefixesCompared,
    mutationCases,
  })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
