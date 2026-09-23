#!/usr/bin/env node
// sagejs-test-tier: specialized
// sagejs-test-platform: linux
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const api = require("./row3_reduced_genback_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const COORDINATOR = path.join(__dirname, "row3_reduced_genback_coordinator.cjs");
if (process.argv.length !== 3) {
  process.stderr.write("usage: check_row3_reduced_genback_owner.cjs PRESENTATION_OWNER\n");
  process.exit(2);
}
const selected = path.resolve(process.argv[2]);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "row3-reduced-genback-check-"));
const started = process.hrtime.bigint();

try {
  function runCoordinator() {
    const run = spawnSync("timeout", ["600", "prlimit", "--as=4294967296",
      "--rss=4294967296", "--cpu=600", "--", "node", COORDINATOR,
      "--presentation-owner", selected, "--presentation-sha256", api.PRESENTATION_SHA256,
      "--output-dir", temporary], {
      cwd: ROOT, encoding: "utf8", timeout: 610_000, maxBuffer: 64 * 1024 * 1024,
    });
    if (run.status !== 0) throw new Error(run.stderr || `coordinator exited ${run.status}`);
    return JSON.parse(run.stdout);
  }
  const receipt = runCoordinator();
  const repeated = runCoordinator();
  assert.deepEqual(repeated, receipt, "publication is not idempotent");
  assert.equal(fs.statSync(receipt.path).mode & 0o777, 0o444);
  const owner = JSON.parse(fs.readFileSync(receipt.path));
  assert.equal(api.verifyOwner(owner, owner.ancestry), true);

  const mutations = [
    value => { value.request.signedExponents[0] = "0"; },
    value => { value.prepared.roundedT2[1] = "-70710"; },
    value => { value.prepared.candidateTrace[2][0] = "3838"; },
    value => { value.reducedRepresentative.idealHnf[0] = "3838"; },
    value => { value.reducedRepresentative.factorValues[3] = "348"; },
    value => { value.principalWitness.leftHnf[0] = "0"; },
    value => { value.orderWitness.factorBaseExponents[74] = "0"; },
    value => { value.completion.unitsComplete = true; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(owner); mutate(changed);
    assert.throws(() => api.verifyOwner(changed, owner.ancestry), api.Row3ReducedGenbackFailure);
  }

  // Recompute after three source-owner mutations.  These checks exercise the
  // candidate dependency itself rather than merely the immutable JSON verifier.
  const program = String.raw`import copy,importlib,json,sys
sys.set_int_max_str_digits(100000);sys.path.extend(['src/lib','src/baselib'])
m=importlib.import_module('bench.pari-class-group-port.row3_reduced_genback_owner')
owner=json.load(open(sys.argv[1])); ancestry={'presentationSha256':sys.argv[2],'sourceSha256':'0'*64}; tests=[]
for label,mutate in [
 ('embedding',lambda x:x['field']['embeddingG'].__setitem__(1,str(int(x['field']['embeddingG'][1])+1))),
 ('selected-ideal',lambda x:x['factorBase']['ideals'].__setitem__(0,str(int(x['factorBase']['ideals'][0])+1))),
 ('class-map',lambda x:x['presentation']['rawToClassPresentation'].__setitem__(0,str(int(x['presentation']['rawToClassPresentation'][0])+1)))]:
 changed=copy.deepcopy(owner);mutate(changed)
 try:m.compose_row3_reduced_genback_owner(changed,ancestry)
 except m.Row3ReducedGenbackFailure:tests.append(label)
 else:raise AssertionError(label+' mutation was accepted')
print(json.dumps(tests,separators=(',',':')))`;
  const semantic = spawnSync("timeout", ["600", "prlimit", "--as=4294967296",
    "--rss=4294967296", "--cpu=600", "--", "python3", "-c", program,
    selected, api.PRESENTATION_SHA256], { cwd: ROOT, encoding: "utf8", timeout: 610_000,
    maxBuffer: 64 * 1024 * 1024 });
  assert.equal(semantic.status, 0, semantic.stderr || `semantic mutations exited ${semantic.status}`);
  assert.deepEqual(JSON.parse(semantic.stdout), ["embedding", "selected-ideal", "class-map"]);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    owner: path.basename(receipt.path),
    sha256: receipt.sha256,
    bytes: receipt.bytes,
    request: owner.request.signedExponents,
    sourceIndices: owner.request.sourceIndices,
    roundedT2: owner.prepared.roundedT2,
    candidates: owner.prepared.candidateTrace,
    reducedIdealHnf: owner.reducedRepresentative.idealHnf,
    compactFactor: {
      kind: owner.reducedRepresentative.factorKinds[0],
      value: owner.reducedRepresentative.factorValues,
      exponent: owner.reducedRepresentative.factorExponents[0],
    },
    exactPrincipalIdentity: owner.principalWitness.identity,
    exactOrder: owner.orderWitness.order,
    outputMutationsRejected: mutations.length,
    semanticInputMutationsRejected: 3,
    idempotentPublication: true,
    qualifiedTiming: false,
    elapsedMilliseconds: Number(process.hrtime.bigint() - started) / 1e6,
  })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
