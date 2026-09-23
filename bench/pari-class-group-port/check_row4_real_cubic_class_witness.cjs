#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const api = require("./row4_real_cubic_class_witness_coordinator.cjs");

const ROOT = path.resolve(__dirname, "../..");
const COORDINATOR = path.join(__dirname, "row4_real_cubic_class_witness_coordinator.cjs");

if (process.argv.length !== 4) {
  process.stderr.write("usage: check_row4_real_cubic_class_witness.cjs PRESENTATION_OWNER PRESENTATION_SHA256\n");
  process.exit(2);
}
const selected = path.resolve(process.argv[2]);
const digest = process.argv[3];
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "row4-class-witness-check-"));
const started = process.hrtime.bigint();
try {
  function runCoordinator() {
    const run = spawnSync("node", [COORDINATOR, "--presentation-owner", selected,
      "--presentation-sha256", digest, "--output-dir", temporary], {
      cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024,
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
    value => { value.generator.idealHnf[0] = "6"; },
    value => { value.quotient.generatorOrder = "1"; },
    value => { value.compactPrincipalWitness.relationExponents[0] = "0"; },
    value => { value.compactPrincipalWitness.principalGenerators[0] = "0"; },
    value => { value.orderRelation.factorBaseExponents[2] = "1"; },
    value => { value.exactIdealReplay.powerHnf[0] = "24"; },
    value => { value.completion.expandedPrincipalGeneratorMaterialized = true; },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(owner);
    mutate(changed);
    assert.throws(() => api.verifyOwner(changed, owner.ancestry), api.Row4ClassWitnessFailure);
  }

  // Exercise three semantic input mutations inside the Python proof boundary.
  // They fail before publication: one breaks R*c, one breaks a retained
  // principal relation, and one detaches the selected prime ideal.
  const program = String.raw`import copy,importlib,json,sys
sys.set_int_max_str_digits(100000);sys.path.extend(['src/lib','src/baselib'])
m=importlib.import_module('bench.pari-class-group-port.row4_real_cubic_class_witness')
owner=json.load(open(sys.argv[1])); ancestry={'presentationSha256':sys.argv[2],'sourceSha256':'0'*64}
tests=[]
for label,mutate in [
 ('class-map',lambda x:x['presentation']['rawToClassPresentation'].__setitem__(0,str(int(x['presentation']['rawToClassPresentation'][0])+1))),
 ('principal-generator',lambda x:x['relations']['principalGenerators'].__setitem__(0,str(int(x['relations']['principalGenerators'][0])+1))),
 ('generator-ideal',lambda x:x['factorBase']['ideals'].__setitem__(0,str(int(x['factorBase']['ideals'][0])+1)))]:
 changed=copy.deepcopy(owner);mutate(changed)
 try:m.compose_row4_real_cubic_class_witness(changed,ancestry)
 except m.Row4ClassWitnessFailure:tests.append(label)
 else:raise AssertionError(label+' mutation was accepted')
print(json.dumps(tests,separators=(',',':')))`;
  const semantic = spawnSync("prlimit", ["--as=4294967296", "--rss=4294967296", "--cpu=600", "--",
    "python3", "-c", program, selected, digest], {
    cwd: ROOT, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024,
  });
  if (semantic.status !== 0) throw new Error(semantic.stderr || `semantic mutations exited ${semantic.status}`);
  assert.deepEqual(JSON.parse(semantic.stdout), ["class-map", "principal-generator", "generator-ideal"]);

  // Digest authentication rejects even a well-formed resealed file at the
  // immutable input boundary.
  const changedPresentation = path.join(temporary, "changed-presentation.json");
  const presentation = JSON.parse(fs.readFileSync(selected));
  presentation.presentation.rawToClassPresentation[0] = String(
    BigInt(presentation.presentation.rawToClassPresentation[0]) + 1n);
  fs.writeFileSync(changedPresentation, `${JSON.stringify(presentation)}\n`, { mode: 0o444 });
  const rejected = spawnSync("node", [COORDINATOR, "--presentation-owner", changedPresentation,
    "--presentation-sha256", digest, "--output-dir", temporary], {
    cwd: ROOT, encoding: "utf8", timeout: 600_000,
  });
  assert.notEqual(rejected.status, 0, "mutated immutable presentation was accepted");

  process.stdout.write(`${JSON.stringify({
    ok: true,
    owner: path.basename(receipt.path),
    sha256: receipt.sha256,
    bytes: receipt.bytes,
    classGroup: ["2"],
    generatorOrder: "2",
    compactFactors: owner.compactPrincipalWitness.factorCount,
    principalRelationsReplayed: owner.exactIdealReplay.principalRelationsReplayed,
    idealMultiplications: owner.exactIdealReplay.idealMultiplications,
    expandedGeneratorMaterialized: false,
    outputMutationsRejected: mutations.length,
    semanticInputMutationsRejected: 3,
    idempotentPublication: true,
    elapsedMilliseconds: Number(process.hrtime.bigint() - started) / 1e6,
  })}\n`);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
