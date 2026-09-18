#!/usr/bin/env node
// sagejs-test-tier: specialized
// sagejs-test-platform: linux
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const api = require("./row3_class_group_transaction_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const COORDINATOR = path.join(__dirname, "row3_class_group_transaction_coordinator.cjs");
if (process.argv.length !== 4) {
  process.stderr.write("usage: check_row3_class_group_transaction.cjs PRESENTATION_OWNER GENBACK_OWNER\n");
  process.exit(2);
}
const presentation = path.resolve(process.argv[2]);
const genback = path.resolve(process.argv[3]);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "row3-class-transaction-check-"));
const started = process.hrtime.bigint();
try {
  function runCoordinator() {
    const run = spawnSync("timeout", ["600", "prlimit", "--as=4294967296",
      "--rss=4294967296", "--cpu=600", "--", "node", COORDINATOR,
      "--presentation-owner", presentation, "--presentation-sha256", api.PRESENTATION_SHA256,
      "--genback-owner", genback, "--genback-sha256", api.GENBACK_SHA256,
      "--output-dir", temporary], { cwd: ROOT, encoding: "utf8", timeout: 610_000,
      maxBuffer: 64 * 1024 * 1024 });
    if (run.status !== 0) throw new Error(run.stderr || `coordinator exited ${run.status}`);
    return JSON.parse(run.stdout);
  }
  const receipt = runCoordinator();
  const repeated = runCoordinator();
  assert.deepEqual(repeated, receipt, "transaction publication is not idempotent");
  assert.equal(fs.statSync(receipt.path).mode & 0o777, 0o444);
  const owner = JSON.parse(fs.readFileSync(receipt.path));
  assert.equal(api.verifyOwner(owner, owner.ancestry), true);
  const mutations = [
    value => { value.requestJoin.smithUirColumn[0] = "0"; },
    value => { value.classGroup.classNumber = "3"; },
    value => { value.classGroup.generatorIdealHnf[0] = "3838"; },
    value => { value.clg2.Ga[0] = "2"; },
    value => { value.clg2.GD[1] = "0"; },
    value => { value.clg2.Ge.factorValues[3] = "348"; },
    value => { value.archimedean.terminalRelationLogs[1] = "0"; },
    value => { value.archimedean.ga[1] = "0"; },
    value => { value.transform.Uir[1] = "0"; },
    value => { value.finalClassState.freshPreparedInputComplete = true; },
    value => { value.stop.code = 0; },
    value => { value.completion.publicComplete = true; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(owner); mutate(changed);
    assert.throws(() => api.verifyOwner(changed, owner.ancestry),
      api.Row3ClassGroupTransactionFailure);
  }

  const program = String.raw`import copy,importlib,json,sys
sys.set_int_max_str_digits(100000);sys.path.extend(['src/lib','src/baselib'])
m=importlib.import_module('bench.pari-class-group-port.row3_class_group_transaction')
p=json.load(open(sys.argv[1]));g=json.load(open(sys.argv[2]));a={'presentationSha256':sys.argv[3],'genbackSha256':sys.argv[4],'sourceSha256':'0'*64};tests=[]
for label,target,mutate in [
 ('class-map',p,lambda x:x['presentation']['rawToClassPresentation'].__setitem__(0,str(int(x['presentation']['rawToClassPresentation'][0])+1))),
 ('principal-generator',p,lambda x:x['relations']['principalGenerators'].__setitem__(0,str(int(x['relations']['principalGenerators'][0])+1))),
 ('genback-request',g,lambda x:x['request']['signedExponents'].__setitem__(0,'0')),
 ('reduced-ideal',g,lambda x:x['reducedRepresentative']['idealHnf'].__setitem__(0,'3838'))]:
 pp=copy.deepcopy(p);gg=copy.deepcopy(g);changed=pp if target is p else gg;mutate(changed)
 try:m.compose_row3_class_group_transaction(pp,gg,a)
 except m.Row3ClassGroupTransactionFailure:tests.append(label)
 else:raise AssertionError(label+' mutation was accepted')
print(json.dumps(tests,separators=(',',':')))`;
  const semantic = spawnSync("timeout", ["600", "prlimit", "--as=4294967296",
    "--rss=4294967296", "--cpu=600", "--", "python3", "-c", program,
    presentation, genback, api.PRESENTATION_SHA256, api.GENBACK_SHA256], {
    cwd: ROOT, encoding: "utf8", timeout: 610_000, maxBuffer: 64 * 1024 * 1024 });
  assert.equal(semantic.status, 0, semantic.stderr || `semantic mutations exited ${semantic.status}`);
  assert.deepEqual(JSON.parse(semantic.stdout), ["class-map", "principal-generator",
    "genback-request", "reduced-ideal"]);
  process.stdout.write(`${JSON.stringify({ ok: true, owner: path.basename(receipt.path),
    sha256: receipt.sha256, bytes: receipt.bytes, request: owner.requestJoin,
    classGroup: owner.classGroup, clg2: { Ur: owner.clg2.Ur, M1: owner.clg2.M1,
      M2: owner.clg2.M2, geFactors: owner.clg2.Ge.factorKinds.length,
      gaCells: owner.clg2.Ga.length / 7, gdCells: owner.clg2.GD.length / 7 },
    terminalLogCells: owner.archimedean.terminalRelationLogs.length / 7,
    generatorArchCells: owner.archimedean.ga.length / 7,
    rawLogsReplayed: owner.archimedean.rawLogsReplayed,
    retainedPresentationComplete: owner.completion.retainedPresentationComplete,
    freshPreparedInputComplete: owner.completion.freshPreparedInputComplete,
    stop: owner.stop, outputMutationsRejected: mutations.length,
    semanticInputMutationsRejected: 4, idempotentPublication: true,
    qualifiedTiming: false,
    elapsedMilliseconds: Number(process.hrtime.bigint() - started) / 1e6 })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
