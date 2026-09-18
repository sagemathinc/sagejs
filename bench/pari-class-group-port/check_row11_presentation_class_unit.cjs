#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const coordinator = require("./row11_presentation_class_unit_coordinator.cjs");
const manifestAuthority = require("./row11_manifest_authority.cjs");

const HERE = __dirname;
const ROOT = path.resolve(HERE, "../..");
const PAYLOAD = "/scratch/sagejs-pari-development-panel-a998/panel-11-ce2bfa61425aa681.json";
const SHA = "6444c0501657bf0109b96fff44c50e7684b80dcb1cfa4587951d1ae4abe04165";

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function reject(owner, mutate) {
  const changed = clone(owner);
  mutate(changed);
  assert.throws(() => coordinator.verifyOwner(changed));
}

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-row11-boundary-"));
try {
  const historical = manifestAuthority.authenticateHistoricalFreshCorpusManifest(
    fs.readFileSync(path.join(HERE, "fresh-prepared-corpus-manifest.json")));
  assert.equal(historical.sourceSha256, SHA);
  assert.notEqual(manifestAuthority.ACTIVE_DRIVER_MANIFEST_SHA256,
    manifestAuthority.HISTORICAL_SOURCE_MANIFEST_SHA256);
  const run = spawnSync(process.execPath, [
    path.join(HERE, "row11_presentation_class_unit_coordinator.cjs"),
    "--pristine-w0", PAYLOAD,
    "--pristine-sha256", SHA,
    "--output-dir", temporary,
  ], { cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr);
  const receipt = JSON.parse(run.stdout);
  assert.equal(receipt.schema, coordinator.SCHEMA);
  assert.equal(receipt.presentationComplete, true);
  assert.equal(receipt.publicComplete, false);
  const owner = JSON.parse(fs.readFileSync(receipt.path));
  assert.equal(coordinator.verifyOwner(owner), true);
  assert.equal(owner.ancestry.manifestSha256,
    manifestAuthority.HISTORICAL_SOURCE_MANIFEST_SHA256);
  assert.equal(fs.statSync(receipt.path).mode & 0o777, 0o444);
  assert.deepEqual(owner.presentation.invariants, ["2", "2"]);
  assert.equal(owner.presentation.classNumber, "4");
  assert.equal(owner.presentation.rawRelationClosureReplayed, false);
  assert.equal(owner.classGenerators.available, false);
  assert.equal(owner.units.available, false);
  assert.equal(owner.units.oracleFuWasNull, true);

  reject(owner, value => { value.presentation.matrix[0] = "4"; });
  reject(owner, value => { value.classGenerators.available = true; });
  reject(owner, value => { value.units.available = true; });
  reject(owner, value => { value.completion.publicComplete = true; });

  const mutationProgram = String.raw`import copy,importlib,json,sys
w=json.load(open(sys.argv[1]));sys.path.extend(['src/lib','src/baselib'])
m=importlib.import_module('bench.pari-class-group-port.row11_presentation_class_unit_adapter')
events=w['events'];tests=[]
for kind in ('hnf','acceptance','fundamental_units'):
 x=copy.deepcopy(w);e=next(v for v in x['events'] if v['event']==kind)
 if kind=='hnf': e['precision']=193
 elif kind=='acceptance': e['code']=0
 else: e['fu']={'kind':'integer','value':'1'}
 try: m.compose_row11_boundary(x,{})
 except m.Row11BoundaryFailure: tests.append(kind)
 else: raise AssertionError('mutation accepted: '+kind)
print(json.dumps(tests))`;
  const mutations = spawnSync("python3", ["-c", mutationProgram, PAYLOAD], {
    cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(mutations.status, 0, mutations.stderr);
  assert.deepEqual(JSON.parse(mutations.stdout), ["hnf", "acceptance", "fundamental_units"]);

  const wrongHash = spawnSync(process.execPath, [
    path.join(HERE, "row11_presentation_class_unit_coordinator.cjs"),
    "--pristine-w0", PAYLOAD,
    "--pristine-sha256", "0".repeat(64),
    "--output-dir", temporary,
  ], { cwd: ROOT, encoding: "utf8", timeout: 30_000 });
  assert.notEqual(wrongHash.status, 0);

  console.log(JSON.stringify({
    schema: "sagejs.pari-class-group/row11-presentation-class-unit-check-v1",
    payloadSha256: SHA,
    retainedRelations: 430,
    factorBaseSize: 421,
    invariants: owner.presentation.invariants,
    classNumber: owner.presentation.classNumber,
    presentationComplete: true,
    classWitnessesComplete: false,
    unitsComplete: false,
    correspondenceComplete: false,
    publicComplete: false,
    rejectedMutations: 8,
  }));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
