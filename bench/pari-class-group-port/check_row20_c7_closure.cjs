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
const coordinator = require("./row20_c7_closure_coordinator.cjs");
const neutral = require("./class_unit_correspondence_result.cjs");

const ROOT = path.resolve(__dirname, "../..");
const PROGRAM = path.join(__dirname, "row20_c7_closure_coordinator.cjs");
const C6 = path.join("/scratch/sagejs-runtime/pari-class-group-e2e-20260917/row20-authority",
  `row20-successful-c6-${coordinator.C6_SHA256}.json`);
const W0 = "/scratch/sagejs-pari-development-panel-a998/panel-20-36db16a4e174ca1a.json";
const AUTHORITY = "/scratch/sagejs-runtime/pari-class-group-e2e-20260917/row20-authority";
const sha = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", timeout: 600_000,
    maxBuffer: 128 * 1024 * 1024, ...options });
  assert.equal(result.status, options.expectedStatus ?? 0, result.stderr || String(result.error));
  return result;
}

function common(operation) {
  return [PROGRAM, "--operation", operation, "--c6-owner", C6,
    "--c6-sha256", coordinator.C6_SHA256, "--pristine-w0", W0,
    "--pristine-sha256", coordinator.W0_SHA256];
}

function pythonMutation(kind, input) {
  const script = String.raw`import importlib,json,sys
sys.path.extend(['src/lib','src/baselib'])
m=importlib.import_module('bench.pari-class-group-port.row20_c7_closure')
value=json.load(sys.stdin);c6=value['c6'];w0=value['w0'];kind=sys.argv[1]
if kind=='raw-log':
 e=next(e for e in w0['events'] if e['event']=='hnf');e['exactEmbeddings']['values'][0]['values'][0]['mantissa']=str(int(e['exactEmbeddings']['values'][0]['values'][0]['mantissa'])+(1<<180))
elif kind=='principal':
 e=next(e for e in w0['events'] if e['event']=='hnf');e['relationRecords'][3]['m']['values'][0]['value']='2'
elif kind=='unit': c6['exactUnitBasis'][0]=str(int(c6['exactUnitBasis'][0])+1)
try:m.compose_authenticated_row20_c7(c6,w0,value['ancestry'])
except (ValueError,TypeError):print('rejected')
else:raise AssertionError('mutation accepted')`;
  return run("python3", ["-c", script, kind], { input: JSON.stringify(input) }).stdout.trim();
}

assert.equal(fs.statSync(C6).mode & 0o777, 0o444);
assert.equal(sha(fs.readFileSync(C6)), coordinator.C6_SHA256);
assert.equal(sha(fs.readFileSync(W0)), coordinator.W0_SHA256);

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row20-c7-"));
try {
  const output = path.join(temporary, "owners");
  const first = JSON.parse(run(process.execPath, [...common("compose"), "--output-dir", output]).stdout);
  const second = JSON.parse(run(process.execPath, [...common("compose"), "--output-dir", output]).stdout);
  assert.deepEqual(second, first);
  assert.equal(first.owner.sha256, sha(fs.readFileSync(first.owner.path)));
  assert.equal(fs.statSync(first.owner.path).mode & 0o777, 0o444);
  assert.deepEqual(fs.readdirSync(output), [path.basename(first.owner.path)]);

  const replayArgs = [...common("replay"), "--envelope", first.owner.path,
    "--envelope-sha256", first.owner.sha256];
  const receipt = JSON.parse(run(process.execPath, replayArgs).stdout);
  assert.equal(receipt.correspondence_complete, true);
  assert.equal(receipt.public_complete, false);
  assert.equal(receipt.mathematicalAuthoritySha256, first.mathematicalAuthoritySha256);

  const raw = fs.readFileSync(first.owner.path);
  const envelope = JSON.parse(raw);
  const payload = envelope.payload;
  assert.deepEqual(payload.classGroup, { classNumber: "1", generatorCount: "0",
    invariantFactors: [], presentationOwner: "class-presentation" });
  assert.deepEqual(payload.unitGroup.materialization, { coordinatesOwner: "exact-unit-coordinates",
    normsOwner: "exact-unit-norms", tag: "exact_units" });
  assert.equal(payload.unitGroup.rank, "2");
  assert.equal(payload.unitGroup.torsionOrder, "2");
  assert.equal(payload.terminal.correspondence_complete, true);
  assert.equal(payload.terminal.public_complete, false);
  assert.deepEqual(payload.source.assumptions.map(value => value.id),
    ["factor-base-generation", "grh-and-bounds", "pari-correspondence"]);
  const owners = new Map(payload.storage.map(value => [value.name, value.entries]));
  assert.equal(owners.get("raw-relation-records").length, 98);
  assert.equal(owners.get("raw-to-kernel").length, 98);
  assert.equal(owners.get("relation-right-inverse").length, 98);
  assert.equal(owners.get("principal-generators").length, 70);
  assert.equal(owners.get("exact-unit-coordinates").length, 10);
  assert.equal(owners.get("exact-unit-raw-transform").length, 28);
  assert.deepEqual(owners.get("torsion-generator"), ["-1", "0", "0", "0", "0"]);

  const R = owners.get("raw-relation-records").map(BigInt);
  const T = owners.get("raw-to-kernel").map(BigInt);
  const Q = owners.get("relation-right-inverse").map(BigInt);
  for (let column = 0; column < 7; column += 1) for (let row = 0; row < 7; row += 1) {
    let kernel = 0n, inverse = 0n;
    for (let source = 0; source < 14; source += 1) {
      kernel += R[source * 7 + row] * T[column * 14 + source];
      inverse += R[source * 7 + row] * Q[column * 14 + source];
    }
    assert.equal(kernel, 0n, `RT[${row},${column}]`);
    assert.equal(inverse, BigInt(row === column), `RQ[${row},${column}]`);
  }

  const authority = neutral.createDetachedClassUnitAuthority({
    envelopeSha256: first.owner.sha256,
    mathematicalAuthoritySha256: first.mathematicalAuthoritySha256,
    replaySchema: coordinator.REPLAY_SCHEMA,
    replay(candidate) {
      assert.equal(neutral.sha256Canonical(candidate), envelope.payloadSha256);
      return JSON.parse(run(process.execPath, replayArgs).stdout);
    },
  });
  const verified = neutral.verifyClassUnitCorrespondenceResult(raw, authority);
  assert.equal(verified.sha256, first.owner.sha256);

  const c6 = JSON.parse(fs.readFileSync(C6));
  const w0 = JSON.parse(fs.readFileSync(W0));
  const ancestry = { c6OwnerSha256: coordinator.C6_SHA256,
    pristineW0Sha256: coordinator.W0_SHA256,
    sourceSha256: sha(fs.readFileSync(path.join(__dirname, "row20_c7_closure.py"))) };
  const mutationInput = { c6, w0, ancestry };
  for (const kind of ["raw-log", "principal", "unit"])
    assert.equal(pythonMutation(kind, structuredClone(mutationInput)), "rejected", kind);

  let mutationsRejected = 3;
  const promoted = structuredClone(payload);
  promoted.terminal.public_complete = true;
  assert.throws(() => neutral.sealClassUnitCorrespondenceResult(promoted),
    neutral.ClassUnitResultFailure);
  mutationsRejected += 1;

  // A coordinated attacker can mutate data and recompute both envelope
  // digests.  Detached cold replay still rejects the newly sealed bytes.
  const resealedPayload = structuredClone(payload);
  const transformOwner = resealedPayload.storage.find(value => value.name === "raw-to-kernel");
  transformOwner.entries[0] = String(BigInt(transformOwner.entries[0]) + 1n);
  const fraudulentRaw = neutral.sealClassUnitCorrespondenceResult(resealedPayload);
  const fraudulentPath = path.join(temporary, "coordinated-reseal.json");
  fs.writeFileSync(fraudulentPath, fraudulentRaw, { mode: 0o444 });
  const fraudulentSha = sha(fraudulentRaw);
  const fraudulentReplay = [...common("replay"), "--envelope", fraudulentPath,
    "--envelope-sha256", fraudulentSha];
  const fraudulentAuthority = neutral.createDetachedClassUnitAuthority({
    envelopeSha256: fraudulentSha, mathematicalAuthoritySha256: first.mathematicalAuthoritySha256,
    replaySchema: coordinator.REPLAY_SCHEMA,
    replay() { return JSON.parse(run(process.execPath, fraudulentReplay).stdout); },
  });
  assert.throws(() => neutral.verifyClassUnitCorrespondenceResult(fraudulentRaw, fraudulentAuthority),
    neutral.ClassUnitResultFailure);
  mutationsRejected += 1;

  const persistent = JSON.parse(run(process.execPath,
    [...common("compose"), "--output-dir", AUTHORITY]).stdout);
  assert.equal(fs.statSync(persistent.owner.path).mode & 0o777, 0o444);
  assert.equal(persistent.owner.sha256, first.owner.sha256);
  process.stdout.write(`${JSON.stringify({ schema: "sagejs.pari-class-group/row20-c7-closure-check-v1",
    classNumber: 1, invariants: [], relationShape: [7, 14], rawKernelShape: [14, 7],
    rightInverseShape: [14, 7], exactPrincipalRelations: 14, exactMaterializedUnits: 2,
    unitRank: 2, torsionOrder: 2, correspondenceComplete: true, publicComplete: false,
    mutationsRejected, coldReplay: true, owner: persistent.owner })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
