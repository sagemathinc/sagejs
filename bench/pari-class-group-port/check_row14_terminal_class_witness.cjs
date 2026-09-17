#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const python = String.raw`
import copy, importlib, json, sys
sys.path[:0] = [sys.argv[1], sys.argv[1] + '/src/lib']
m = importlib.import_module('bench.pari-class-group-port.row14_terminal_class_witness')
rows, columns = m.ROWS, m.RAW_COLUMNS
W = [24,0,0,4,4,0,5,3,2]
factor_map = [0] * (rows * 3)
for i in range(3): factor_map[i * rows + i] = 1
relations = [0] * (rows * columns)
for column in range(3):
    for row in range(3): relations[column * rows + row] = W[column * 3 + row]
transform = [0] * (columns * 3)
for i in range(3): transform[i * columns + i] = 1
term = [{'values':['1','0','0','0'],'denominator':'1','exponent':'1'}]
owner = {
  'schema': m.LIVE_SCHEMA,
  'field': {'id':m.FIELD_ID,'coefficients':list(map(str,m.POLYNOMIAL)),'signature':[2,1]},
  'dimensions': {'factorBaseSize':rows,'relationCount':columns,'presentationDimension':3},
  'ancestry': {'sourceSha256':'1'*64,'terminalOwnerSha256':'2'*64},
  'presentation': list(map(str,W)),
  'mappedGeneratorIdeals': list(map(str,m.GENERATOR_IDEALS[0]+m.GENERATOR_IDEALS[1])),
  'smithQuotientCoordinates':['1','0','0','-2','-1','-1'],
  'factorMap':list(map(str,factor_map)), 'rawRelations':list(map(str,relations)),
  'rawToPresentation':list(map(str,transform)),
  'rawPrincipalFactors':[copy.deepcopy(term) for _ in range(columns)],
}
answer=m.compose_row14_terminal_class_witness(owner)
assert [w['order'] for w in answer['witnesses']]==['24','8']
assert [w['presentationRelation'] for w in answer['witnesses']]==[['1','0','0'],['0','1','-4']]
assert [w['properMultiplesRejected'] for w in answer['witnesses']]==[23,7]
assert answer['proof']['minimalityChecks']==32
assert answer['proof']['independenceChecks']==192
mutations=[]
def reject(label, change):
    changed=copy.deepcopy(owner); change(changed)
    try: m.compose_row14_terminal_class_witness(changed)
    except m.Row14TerminalClassWitnessFailure: mutations.append(label); return
    raise AssertionError(label+' was accepted')
reject('missing-owner',lambda x:x.__setitem__('schema','wrong'))
reject('presentation',lambda x:x['presentation'].__setitem__(0,'23'))
reject('smith-map',lambda x:x['smithQuotientCoordinates'].__setitem__(3,'-1'))
reject('mapped-ideal',lambda x:x['mappedGeneratorIdeals'].__setitem__(0,'5098'))
reject('raw-relation',lambda x:x['rawRelations'].__setitem__(0,'23'))
reject('raw-transform',lambda x:x['rawToPresentation'].__setitem__(0,'2'))
reject('missing-principals',lambda x:x.__setitem__('rawPrincipalFactors',[]))
reject('principal-term',lambda x:x['rawPrincipalFactors'][805][0].__setitem__('denominator','0'))
reject('ancestry',lambda x:x['ancestry'].__setitem__('terminalOwnerSha256','0'))
print(json.dumps({'schema':'sagejs.pari-class-group/row14-terminal-class-witness-check-v1',
 'generatedProtocolOnly':True,'authenticLiveOwnerPublished':False,
 'orders':[24,8],'presentationRelations':[[1,0,0],[0,1,-4]],
 'properMultiplesRejected':[23,7], 'checkedTransformCells':answer['proof']['checkedTransformCells'],
 'checkedRawOrderCells':answer['proof']['checkedRawOrderCells'],
 'independenceChecks':answer['proof']['independenceChecks'],
 'compactPrincipalFactorsExpanded':False,'mutations':mutations,
 'limits':{'timeoutSeconds':600,'addressSpaceGiB':4}},sort_keys=True))
`;

const result = spawnSync("prlimit", ["--as=4294967296", "--", "python3", "-c", python, root], {
  cwd: root, encoding: "utf8", timeout: 600_000, maxBuffer: 64 * 1024 * 1024,
});
assert.equal(result.status, 0, result.stderr || String(result.error));
process.stdout.write(result.stdout);
