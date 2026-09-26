#!/usr/bin/env node
"use strict";

// Detached focused gate for the bounded row-14 ideal-map boundary.  The input
// must be the immutable envelope emitted by the genuine fresh prepared run.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "../..");
const EXPECTED_ENVELOPE_SHA256 =
  "edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2";
const filename = process.argv[2];
assert.equal(typeof filename, "string",
  "usage: node check_row14_factor_reduce_combine_map.cjs ROW14_RESULT.json");
const bytes = fs.readFileSync(path.resolve(filename));
assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"),
  EXPECTED_ENVELOPE_SHA256, "row-14 fresh result envelope changed");

const program = String.raw`
import copy,hashlib,importlib,itertools,json,sys
sys.path[:0]=['src/lib','src/baselib','.']
m=importlib.import_module('bench.pari-class-group-port.row14_factor_reduce_combine_map')
with open(sys.argv[1],encoding='ascii') as stream:
    payload=json.load(stream)['payload']
receipt=m.build_row14_bounded_map_receipt(payload)
m.verify_row14_bounded_map_receipt(payload,receipt)

def reject_payload(name,mutate):
    changed=copy.deepcopy(payload);mutate(changed)
    try:m.build_row14_bounded_map_receipt(changed)
    except m.Row14IdealMapFailure:return name
    raise AssertionError('payload mutation was accepted: '+name)

def owner(value,name):
    return next(item for item in value['storage'] if item['name']==name)['entries']

payload_rejections=[]
payload_rejections.append(reject_payload('active-factor-ideal',lambda value:
    owner(value,'factor-base-ideals').__setitem__(692*16,
      str(int(owner(value,'factor-base-ideals')[692*16])+1))))
payload_rejections.append(reject_payload('raw-relation',lambda value:
    owner(value,'raw-relation-records').__setitem__(0,
      str(int(owner(value,'raw-relation-records')[0])+1))))
payload_rejections.append(reject_payload('principal-generator',lambda value:
    owner(value,'principal-generators').__setitem__(0,
      str(int(owner(value,'principal-generators')[0])+1))))
payload_rejections.append(reject_payload('multiplication-table',lambda value:
    owner(value,'field-multiplication-table').__setitem__(0,
      str(int(owner(value,'field-multiplication-table')[0])+1))))
payload_rejections.append(reject_payload('factor-map',lambda value:
    owner(value,'factor-map').__setitem__(692,'0')))
payload_rejections.append(reject_payload('presentation',lambda value:
    owner(value,'class-presentation').__setitem__(0,'25')))

def reject_receipt(name,mutate,reseal=False):
    changed=copy.deepcopy(receipt);mutate(changed)
    if reseal:
        body=dict(changed);body.pop('contentSha256',None)
        changed['contentSha256']=hashlib.sha256(json.dumps(body,separators=(',',':'),
            sort_keys=True).encode('ascii')).hexdigest()
    try:m.verify_row14_bounded_map_receipt(payload,changed)
    except m.Row14IdealMapFailure:return name
    raise AssertionError('receipt mutation was accepted: '+name)

receipt_rejections=[]
receipt_rejections.append(reject_receipt('factor-coordinate',lambda value:
    value['factor']['classCoordinatesNormalized'].__setitem__(0,'1')))
receipt_rejections.append(reject_receipt('reduce-generator',lambda value:
    value['reduce']['principalGenerator'].__setitem__(3,'2')))
receipt_rejections.append(reject_receipt('combine-principal-ideal',lambda value:
    value['combine']['principalIdealHnf'].__setitem__(0,'11')))
receipt_rejections.append(reject_receipt('round-trip',lambda value:
    value['roundTrip'].__setitem__('principalQuotientReconstructsInput',False)))
receipt_rejections.append(reject_receipt('general-map-claim',lambda value:
    value['scope'].__setitem__('generalArbitraryIdealMapReady',True),True))
receipt_rejections.append(reject_receipt('digest',lambda value:
    value.__setitem__('contentSha256','0'*64)))

# Exercise rejection at the operation boundaries, independently of receipt
# authentication.
decoded=m._decode(payload)
bad_factor=list(decoded['factor_base'][decoded['active'][0]]);bad_factor[0]+=1
try:m._factor_active_ideal(bad_factor,decoded)
except m.Row14IdealMapFailure:operation_factor_rejected=True
else:raise AssertionError('out-of-domain factor input was accepted')
bad_reduce=list(map(int,receipt['reduce']['inputIdealHnf']));bad_reduce[0]+=1
try:m._reduce_active_principal_multiple(bad_reduce,decoded)
except m.Row14IdealMapFailure:operation_reduce_rejected=True
else:raise AssertionError('out-of-domain reduction input was accepted')

print(json.dumps({
  'schema':'sagejs.pari-class-group/row14-bounded-ideal-maps-check-v1',
  'receipt':receipt,
  'payloadMutationsRejected':payload_rejections,
  'receiptMutationsRejected':receipt_rejections,
  'operationRejections':{'factor':operation_factor_rejected,
                         'reduce':operation_reduce_rejected},
},sort_keys=True))
`;

const run = spawnSync("python3", ["-c", program, path.resolve(filename)], {
  cwd: ROOT,
  encoding: "utf8",
  timeout: 120_000,
  maxBuffer: 8 * 1024 * 1024,
});
assert.equal(run.status, 0, run.stderr || String(run.error));
const report = JSON.parse(run.stdout);
assert.equal(report.schema,
  "sagejs.pari-class-group/row14-bounded-ideal-maps-check-v1");
assert.equal(report.receipt.schema,
  "sagejs.pari-class-group/row14-bounded-ideal-maps-v1");
assert.equal(report.receipt.contentSha256,
  "436bd05ebaa5f1f1d33f0b1a615b0167eec0cfe903153df83b8b287fb702a9c5");
assert.deepEqual(report.receipt.factor.classCoordinatesNormalized, ["0", "1"]);
assert.deepEqual(report.receipt.reduce.classCoordinatesNormalized, ["0", "1"]);
assert.equal(report.receipt.scope.generalArbitraryIdealMapReady, false);
assert.equal(report.receipt.source.relationsReplayed, "806");
assert.equal(report.receipt.source.principalIdealMultiplications, "4962");
assert.deepEqual(report.payloadMutationsRejected, [
  "active-factor-ideal", "raw-relation", "principal-generator",
  "multiplication-table", "factor-map", "presentation",
]);
assert.deepEqual(report.receiptMutationsRejected, [
  "factor-coordinate", "reduce-generator", "combine-principal-ideal",
  "round-trip", "general-map-claim", "digest",
]);
assert.deepEqual(report.operationRejections, { factor: true, reduce: true });
console.log(JSON.stringify({
  schema: report.schema,
  contentSha256: report.receipt.contentSha256,
  factorClassCoordinates: report.receipt.factor.classCoordinatesNormalized,
  reduceClassCoordinates: report.receipt.reduce.classCoordinatesNormalized,
  combinedAmbientSupport: report.receipt.combine.ambientSupport,
  exactPrincipalRelationsReplayed: report.receipt.source.relationsReplayed,
  exactIdealMultiplications: report.receipt.source.principalIdealMultiplications,
  payloadMutationsRejected: report.payloadMutationsRejected.length,
  receiptMutationsRejected: report.receiptMutationsRejected.length,
  operationRejections: report.operationRejections,
  generalArbitraryIdealMapReady:
    report.receipt.scope.generalArbitraryIdealMapReady,
  qualifiedTiming: report.receipt.qualifiedTiming,
}));
