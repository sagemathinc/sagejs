#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const MODULE = "bench.pari-class-group-port.field3_high_precision_hnf_transform";

const python = String.raw`
import importlib,sys
sys.set_int_max_str_digits(0);sys.path.append('src/lib');sys.path.append('src/baselib')
m=importlib.import_module('${MODULE}')
r=importlib.import_module('bench.pari-class-group-port.field3_unit_transform_retention')

# A 153088-bit identity transform exercises the real C1 precision without a
# low-precision checkpoint or a fabricated terminal A.
p=m.TARGET_BITS; mantissa=1<<(p-1)
entry=[1,mantissa,p,7,0,-1,0]
entries=entry*6
coefficients=[1,0,0,1]
assert m._matrix_transform(entries,coefficients,2)==entries

# The new loop agrees with the existing source port within its independently
# validated range; this is a differential schedule oracle, not answer data.
lp=4352; lm=(1<<(lp-1))+17
low=[1,lm,lp,3,0,-1,0]*6
expected=[0]*(2*m.LOG_STRIDE)
old=importlib.import_module('bench.pari-class-group-port.log_matrix_transform')
assert old.pari_log_matrix_transform(low,coefficients,3,2,2,False,expected)==0
assert m._matrix_transform(low,coefficients,2)==expected

base={
 'schema':m.RAW_SCHEMA,'field':m.FIELD,'runIdentity':m.RUN_IDENTITY,
 'targetBits':m.TARGET_BITS,'sourceStart':0,'sourceCount':301,'sourceStop':301,
 'totalColumns':301,'scalarColumns':26,'nonscalarColumns':275,'places':3,
 'layout':m.RAW_LAYOUT,'packedLogs':[str(x) for x in entry*(301*3)],
 'authoritySha256':m.AUTHORITY_SHA256,'initialOwnerSha256':m.INITIAL_SHA256,
 'preparedOwnerSha256':m.PREPARED_SHA256,'normConsequencesSha256':m.NORM_SHA256,
 'sourceDigests':m.SOURCE_DIGESTS,'realOwnerSha256':'0'*64,'complexOwnerSha256':'1'*64,
}
assert len(m._raw_logs(base))==301*3*7
changed=dict(base);changed['packedLogs']=base['packedLogs'][:];changed['packedLogs'][2]=str(p-64)
try:m._raw_logs(changed);raise AssertionError('precision mutation accepted')
except m.Field3HighPrecisionTransformFailure:pass
short=dict(base);short['sourceCount']=28;short['sourceStop']=28;short['packedLogs']=short['packedLogs'][:28*3*7]
try:m._raw_logs(short);raise AssertionError('qualified prefix published A')
except m.Field3HighPrecisionTransformFailure:pass

keys=('rawRelations','initialCleanupTransform','initialTransform','initialFullH',
 'initialFullDep','initialTrailing','initialDiagonal','appendMetadata','appendTransform',
 'appendFullH','appendFullDep','appendTrailing','appendDiagonal','appendPermutations',
 'appendRelations')
protocol={'schema':m.PROTOCOL_SCHEMA,'field':m.FIELD,
 'sourceRunId':'field3-post-rnd-live-unit-transform',**{key:[] for key in keys}}
protocol['appendMetadata']=[293,2,0,0,0,0,0,0,0,0,0,0,288,0,0,0,
 295,1,0,0,0,0,0,0,0,0,0,0,288,0,0,0,
 296,5,0,0,0,0,0,0,0,0,0,0,288,0,0,0]
bad=dict(protocol);bad['appendMetadata']=protocol['appendMetadata'][:];bad['appendMetadata'][16]=294
try:m._protocol_arrays(bad);raise AssertionError('stage order mutation accepted')
except m.Field3HighPrecisionTransformFailure:pass
try:m._protocol_arrays(protocol);raise AssertionError('owner dimension mutation accepted')
except m.Field3HighPrecisionTransformFailure:pass

# Exact R*T failure is transactional: the caller's certificate remains held.
relations=[0]*(288*301);transform=[0]*(301*13)
relations[0]=1;transform[0]=1;held=[77]*5
assert r.pari_field3_validate_unit_relation_kernel(relations,transform,held)==1
assert held==[77]*5
print('field3 high-precision local HNF protocol checks passed')
`;

const run = spawnSync("python3", ["-c", python], {
  cwd: ROOT,
  encoding: "utf8",
  maxBuffer: 1024 * 1024 * 32,
});
assert.equal(run.status, 0, run.stderr || run.stdout);

// The coordinator treats the expected content hash as a required trust input.
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "field3-hnf-check-"));
try {
  const raw = path.join(temporary, "raw.json");
  const protocol = path.join(temporary, "protocol.json");
  fs.writeFileSync(raw, "{}\n", { mode: 0o444 });
  fs.writeFileSync(protocol, "{}\n", { mode: 0o444 });
  const protocolHash = crypto.createHash("sha256").update("{}\n").digest("hex");
  const rejected = spawnSync(
    process.execPath,
    [
      path.join(__dirname, "field3_high_precision_hnf_transform_coordinator.cjs"),
      "--raw-owner", raw,
      "--raw-sha256", "0".repeat(64),
      "--protocol-owner", protocol,
      "--protocol-sha256", protocolHash,
      "--output-dir", temporary,
    ],
    { cwd: ROOT, encoding: "utf8" },
  );
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /raw owner digest changed/);
  assert.equal(fs.readdirSync(temporary).some((name) => name.startsWith("field3-high-precision-A-")), false);
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}

process.stdout.write(run.stdout);
