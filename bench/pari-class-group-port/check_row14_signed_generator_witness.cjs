"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const zlib = require("node:zlib");
const outputAdapter = require("./row14_class_unit_output_evidence_v2.cjs");

const ROOT = path.resolve(__dirname, "../..");
const FIXTURE = path.join(__dirname, "evidence", "row14-strict-v2");
const resultPath = path.join(FIXTURE, "correspondence.json.gz");
const metadataPath = path.join(FIXTURE, "factor-metadata.json.gz");
const digest = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const resultCompressed = fs.readFileSync(resultPath);
const metadataCompressed = fs.readFileSync(metadataPath);
assert.equal(digest(resultCompressed),
  "56eaa8390b3674597bbbfb4245edf3a40e9e119846bd7dc0d0a690e07a852d5e");
assert.equal(digest(metadataCompressed),
  "56352e8cf74cfbd83b2035f8a9cee141d5833538eb81cf289de87afb83644ca1");
const resultPlain = zlib.gunzipSync(resultCompressed);
const metadataPlain = zlib.gunzipSync(metadataCompressed);
assert.equal(digest(resultPlain),
  "edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2");
assert.equal(digest(metadataPlain),
  "7826088b03a22a7d902831da2add844d01dc8cceda1519ab4aed9702f6f3f568");
outputAdapter.authenticateRow14Correspondence(resultPlain);

const program = String.raw`import copy,gzip,hashlib,importlib,json,sys
sys.path[:0]=sys.argv[3:5]
module=importlib.import_module('bench.pari-class-group-port.row14_signed_generator_witness')
correspondence=json.load(gzip.open(sys.argv[1],'rt'))
metadata=json.load(gzip.open(sys.argv[2],'rt'))
answer=module.replay_row14_signed_generator_witness(correspondence,metadata)
def seal(value):
 raw=json.dumps(value['payload'],separators=(',',':'),sort_keys=True).encode()
 value['payloadSha256']=hashlib.sha256(raw).hexdigest()
def rejected(mutator,reseal=False):
 bad=copy.deepcopy(correspondence);other=copy.deepcopy(metadata);mutator(bad,other)
 if reseal:seal(bad)
 try: module.replay_row14_signed_generator_witness(bad,other)
 except Exception:return True
 return False
def owner(p,name):return next(x['entries'] for x in p['payload']['storage'] if x['name']==name)
mutations={
 'publishedGenerator0':rejected(lambda p,m:owner(p,'class-generator-ideals').__setitem__(0,str(int(owner(p,'class-generator-ideals')[0])+1)),True),
 'publishedGenerator1':rejected(lambda p,m:owner(p,'class-generator-ideals').__setitem__(16,str(int(owner(p,'class-generator-ideals')[16])+1)),True),
 'classWitness0':rejected(lambda p,m:owner(p,'class-order-principal-coefficients').__setitem__(0,str(int(owner(p,'class-order-principal-coefficients')[0])+1)),True),
 'classWitness1':rejected(lambda p,m:owner(p,'class-order-principal-coefficients').__setitem__(806,str(int(owner(p,'class-order-principal-coefficients')[806])+1)),True),
 'factorBase':rejected(lambda p,m:owner(p,'factor-base-ideals').__setitem__(16*692,str(int(owner(p,'factor-base-ideals')[16*692])+1)),True),
 'payloadSha256':rejected(lambda p,m:p.__setitem__('payloadSha256','0'*64)),
 'pariSource':rejected(lambda p,m:p['payload']['source'].__setitem__('pariSourceSha256','0'*64),True),
 'metadataSha256':rejected(lambda p,m:m.__setitem__('metadataSha256','0'*64)),
 'coreSha256':rejected(lambda p,m:m.__setitem__('coreSha256','0'*64)),
 'metadataAuthority':rejected(lambda p,m:m['metadata']['authority'].__setitem__('capsuleSha256','0'*64)),
}
print(json.dumps({'answer':answer,'mutationsRejected':mutations},sort_keys=True))`;

const run = spawnSync("/usr/bin/python3", ["-c", program, resultPath,
  metadataPath, ROOT, path.join(ROOT, "src/lib")], {
  cwd: ROOT, encoding: "utf8", timeout: 120_000, maxBuffer: 32 * 1024 * 1024,
});
assert.equal(run.status, 0, run.stderr || String(run.error));
const result = JSON.parse(run.stdout);
assert.equal(result.answer.schema,
  "sagejs.pari-class-group/row14-signed-generator-witness-v1");
assert.deepEqual(result.answer.factorMapPivots, [692, 767, 796]);
assert.deepEqual(result.answer.signedSmithQuotients,
  [[-2, -1, -1], [1, 0, 0]]);
assert.deepEqual(result.answer.publishedInvariantFactors, [8, 24]);
assert.equal(result.answer.candidateCount, 7);
assert.equal(result.answer.signedGeneratorIdealReductionsReplayed, 2);
assert.equal(result.answer.principalOrderWitnessesReplayed, 2);
assert.equal(result.answer.oppositePrincipalCorrectionsRejected, 1);
assert.equal(result.answer.rawPrincipalRelationsReplayed, 806);
assert.equal(result.answer.principalIdealMultiplications, 4962);
assert.deepEqual(result.answer.generatorWitnesses.map(value => value.order),
  [8, 24]);
assert.deepEqual(result.answer.generatorWitnesses.map(value => value.sourceIndex),
  [1, 0]);
assert.deepEqual(result.answer.generatorWitnesses.map(value => value.publishedIndex),
  [0, 1]);
assert.deepEqual(result.answer.generatorWitnesses.map(value =>
  value.reductionFactors.length), [7, 0]);
assert.deepEqual(result.answer.missingOwners, []);
assert.deepEqual(result.mutationsRejected, {
  classWitness0: true, classWitness1: true, coreSha256: true,
  factorBase: true, metadataAuthority: true, metadataSha256: true,
  pariSource: true, payloadSha256: true, publishedGenerator0: true,
  publishedGenerator1: true,
});
console.log(JSON.stringify(result));
