#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const sourcePath = path.join(__dirname, "field3_full_terminal_ancestry.py");
const durable = "/scratch/sagejs-runtime/pari-class-group-e2e-20260917/field3-authority";
const authoritySha = "246bfe2af51c8be732308719773fc7d696f7dc1bf21958c91d96cd8fc448954c";
const protocolSha = "892afa9a63da8353cce50eead03b12f031812182a3229a48ed8fbdfa60b94e72";
const authorityPath = path.join(durable, `authority-${authoritySha}.json`);
const protocolPath = path.join(durable, `field3-local-hnf-protocol-${protocolSha}.json`);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root, encoding: "utf8", timeout: 600_000,
    maxBuffer: 256 * 1024 * 1024, ...options,
  });
  assert.equal(result.status, 0, result.stderr || String(result.error));
  return result.stdout;
}

assert(fs.existsSync(authorityPath));
assert(fs.existsSync(protocolPath));

const pythonProgram = String.raw`
import copy,hashlib,importlib,json,sys
sys.path.extend(sys.argv[1:3])
m=importlib.import_module('bench.pari-class-group-port.field3_full_terminal_ancestry')
h=importlib.import_module('bench.pari-class-group-port.field3_high_precision_hnf_transform')
authority=json.load(open(sys.argv[3]));protocol=json.load(open(sys.argv[4]));p=h._protocol_arrays(protocol)
terminal_h=list(map(int,authority['terminalHNF'][0]));perm=list(map(int,authority['authority']['owners']['hnfPermutation']))
size=301*15;transform=[77]*size;state=[77]*8
args=[p['initialCleanupTransform'],p['initialTransform'],p['initialFullH'],p['initialFullDep'],p['initialTrailing'],p['initialDiagonal'],p['appendMetadata'],p['appendTransform'],p['appendFullH'],p['appendFullDep'],p['appendTrailing'],p['appendDiagonal'],p['appendPermutations'],p['appendRelations'],[0]*size,[0]*size,[0]*size,[0]*(36*252),[0]*size,transform,state]
assert m.pari_field3_retain_full_terminal_transform(*args)==0
assert state==[0,301,15,293,3,4515,13,2]
image=[77]*8
assert m.pari_field3_validate_full_terminal_image(p['rawRelations'],transform,terminal_h,perm,image)==0
assert image==[0,288,301,13,2,15,3744,576]

# The additive owner preserves the exact established unit-only ancestry.
old=[0]*(301*13);old_state=[0]*8
r=importlib.import_module('bench.pari-class-group-port.field3_unit_transform_retention')
assert r.pari_field3_retain_unit_relation_transform(*args[:14],[0]*(301*13),[0]*(301*13),[0]*(301*13),[0]*(36*252),[0]*(301*13),old,old_state)==0
assert old==transform[:301*13]

# A class-column coefficient, H cell, or physical-row permutation breaks the
# exact image while leaving the caller's certificate untouched.
changed=transform[:];changed[13*301]+=1;held=[77]*8
assert m.pari_field3_validate_full_terminal_image(p['rawRelations'],changed,terminal_h,perm,held)==1 and held==[77]*8
changed_h=terminal_h[:];changed_h[0]+=1;held=[77]*8
assert m.pari_field3_validate_full_terminal_image(p['rawRelations'],transform,changed_h,perm,held)==1 and held==[77]*8
changed_perm=perm[:];changed_perm[0],changed_perm[1]=changed_perm[1],changed_perm[0];held=[77]*8
assert m.pari_field3_validate_full_terminal_image(p['rawRelations'],transform,terminal_h,changed_perm,held)==1 and held==[77]*8

# Zero exact logs make a low-cost full source-order replay.  They are not an
# answer fixture and exercise the 273/42 split without high-precision work.
entry=[1,0,-1,0,0,-1,0]
raw={'schema':h.RAW_SCHEMA,'field':h.FIELD,'runIdentity':h.RUN_IDENTITY,
 'targetBits':h.TARGET_BITS,'sourceStart':0,'sourceCount':301,'sourceStop':301,
 'totalColumns':301,'scalarColumns':26,'nonscalarColumns':275,'places':3,
 'layout':h.RAW_LAYOUT,'packedLogs':[str(x) for x in entry*(301*3)],
 'authoritySha256':h.AUTHORITY_SHA256,'initialOwnerSha256':h.INITIAL_SHA256,
 'preparedOwnerSha256':h.PREPARED_SHA256,'normConsequencesSha256':h.NORM_SHA256,
 'sourceDigests':h.SOURCE_DIGESTS,'realOwnerSha256':'0'*64,'complexOwnerSha256':'1'*64}
owner=m.transform_authenticated_owners(raw,protocol,authority)
assert len(owner['transform'])==4515 and len(owner['packedTerminal'])==315
assert len(owner['packedA'])==273 and len(owner['packedCe'])==42
assert owner['packedTerminal']==owner['packedA']+owner['packedCe']
assert owner['terminalH']==list(map(str,terminal_h))
assert owner['terminalState']==m.TERMINAL_STATE
for mutate,label in [
 (lambda d:d['terminalHNF'][0].__setitem__(0,str(int(d['terminalHNF'][0][0])+1)),'terminal H'),
 (lambda d:d['authority']['owners']['hnfState'].__setitem__(1,'14'),'terminal state'),
 (lambda d:(d['authority']['owners']['hnfPermutation'].__setitem__(0,d['authority']['owners']['hnfPermutation'][1]),d['authority']['owners']['hnfPermutation'].__setitem__(1,d['authority']['owners']['hnfPermutation'][0])),'terminal permutation')]:
 bad=copy.deepcopy(authority);mutate(bad)
 try:m.transform_authenticated_owners(raw,protocol,bad);raise AssertionError(label+' mutation accepted')
 except (m.Field3FullTerminalAncestryFailure,h.Field3HighPrecisionTransformFailure):pass
print(json.dumps({'transform':owner['transform'],'h':owner['terminalH'],'perm':owner['terminalPermutation'],'raw':raw,'state':image}))
`;
const evidence = JSON.parse(run("python3", ["-c", pythonProgram, root,
  path.join(root, "src/lib"), authorityPath, protocolPath]));
assert.equal(evidence.transform.length, 4515);
assert.deepEqual(evidence.state, [0, 288, 301, 13, 2, 15, 3744, 576]);

(async () => {
  const compilerRoot = process.env.SAGEJS_REPLAY_RUNTIME_ROOT || root;
  const { compileKernel } = require(path.join(
    compilerRoot, "tools/native-kernel/compiler.cjs"));
  const built = await compileKernel({ sourcePath });
  const api = require(built.modulePath).pari_field3_validate_full_terminal_image;
  assert(api.nativeAvailable);
  const protocol = JSON.parse(fs.readFileSync(protocolPath));
  const relations = protocol.rawRelations.map(BigInt);
  const transform = evidence.transform.map(BigInt);
  const terminalH = evidence.h.map(BigInt);
  const permutation = evidence.perm.map(BigInt);
  const state = Array(8).fill(77n);
  assert.equal(api.javascript(relations, transform, terminalH, permutation, state), 0n);
  assert.deepEqual(state, [0n, 288n, 301n, 13n, 2n, 15n, 3744n, 576n]);
  const changed = transform.slice(); changed[13 * 301] += 1n;
  const held = Array(8).fill(77n);
  assert.equal(api.javascript(relations, changed, terminalH, permutation, held), 1n);
  assert.deepEqual(held, Array(8).fill(77n));

  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "field3-full15-"));
  try {
    const rawPath = path.join(temporary, "raw.json");
    const rawBytes = Buffer.from(`${JSON.stringify(evidence.raw)}\n`);
    fs.writeFileSync(rawPath, rawBytes, { mode: 0o444 });
    const rawSha = crypto.createHash("sha256").update(rawBytes).digest("hex");
    const coordinator = path.join(__dirname, "field3_full_terminal_ancestry_coordinator.cjs");
    const args = [coordinator,
      "--raw-owner", rawPath, "--raw-sha256", rawSha,
      "--protocol-owner", protocolPath, "--protocol-sha256", protocolSha,
      "--authority-owner", authorityPath, "--authority-sha256", authoritySha,
      "--output-dir", temporary];
    const first = JSON.parse(run(process.execPath, args).trim());
    const second = JSON.parse(run(process.execPath, args).trim());
    assert.deepEqual(second, first);
    assert.equal(fs.statSync(first.path).mode & 0o777, 0o444);
    const before = new Set(fs.readdirSync(temporary));
    const rejected = spawnSync(process.execPath, [coordinator,
      "--raw-owner", rawPath, "--raw-sha256", "0".repeat(64),
      "--protocol-owner", protocolPath, "--protocol-sha256", protocolSha,
      "--authority-owner", authorityPath, "--authority-sha256", authoritySha,
      "--output-dir", temporary], { cwd: root, encoding: "utf8" });
    assert.notEqual(rejected.status, 0);
    assert.deepEqual(new Set(fs.readdirSync(temporary)), before);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  const core = fs.readFileSync(built.coreSourcePath, "utf8");
  assert.doesNotMatch(core, /napi_call_function|PyObject_Call|v8::/);
  console.log(JSON.stringify({ schema: "field3-full-terminal-ancestry-check-v1",
    transformShape: [301, 15], packedShape: [3, 15], unitColumns: 13,
    classColumns: 2, cpython: true, javascript: true,
    exactImage: "R*T=[0|perm^-1(H)]", publication: "atomic-idempotent-0444" }));
})().catch((error) => { console.error(error); process.exitCode = 1; });
