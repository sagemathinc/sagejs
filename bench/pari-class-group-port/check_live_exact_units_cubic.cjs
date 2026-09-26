#!/usr/bin/env node
// sagejs-test-tier: specialized
// sagejs-test-platform: linux
"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const resident = path.resolve(
  process.argv[2] || "/tmp/sagejs-resident-generated-class-3qtnS5/output.json",
);
const program = String.raw`
import dataclasses,decimal,fractions,hashlib,importlib,importlib.util,json,sys,threading
root,resident_path,module_path=sys.argv[1:]
sys.set_int_max_str_digits(100000)
spec=importlib.util.spec_from_file_location('live_exact_units_cubic',module_path);m=importlib.util.module_from_spec(spec);sys.modules[spec.name]=m;spec.loader.exec_module(m)
sys.path[:0]=[root,root+'/src/lib'];b=importlib.import_module('bench.pari-class-group-port.unit_bridge_cubic')
q=json.load(open(resident_path,encoding='utf-8'));I=lambda n:[0]*n;F=lambda n:[0.0]*n;c=7;sq=49
# Produce the authentic 2x7 unit map directly from resident HNF/log/regulator
# owners. No unit fixture, high-precision log, or reconstructed answer enters.
a=[[int(x) for x in q['hnf_result_c'][:147]],[int(x) for x in q['accept_relations'][:14]],c,[int(x) for x in q['accept_regulator'][:3]],I(14),I(4),I(14),I(42),I(18),I(42),I(18),I(6),I(5),F(5),I(5),I(14),I(sq),I(sq),F(sq),I(sq),F(sq),I(sq),F(c),I(c),F(14),F(sq),I(c),I(c),I(c),F(c),F(c),F(c),I(c),I(6),I(3),I(6),I(4),I(4),F(4),I(4),F(4),I(4),F(2),I(2),F(6),F(4),I(2),I(3),I(3),F(3),F(3),F(3),I(3),I(2)]
assert b.pari_cubic_unit_bridge_prepare(*a)==0
factor=[a[10],I(4),I(18),I(6),I(4),I(2),F(4),I(4),F(4),I(4),F(2),I(2),F(6),F(4),I(2),I(3),I(2),F(3),F(3),I(4)]
assert b.pari_cubic_getfu_factor_rank_two(*factor)==0
unit_kernel=I(14);assert b.pari_cubic_unit_compose_provenance(a[6],c,factor[1],unit_kernel)==0
generators=[int(x) for x in q['generators'][:219]];cleanup=[int(x) for x in q['hnf_transform'][:5329]];active=[int(x) for x in q['hnf_hnf_transform'][:225]];tensor=[int(x) for x in q['basis_table'][:27]]
out=m.reconstruct_live_cubic_units(generators,cleanup,active,unit_kernel,tensor)
assert out.unit_norms==(-1,-1)
assert out.kernel_norms==(-1,-1,1,1,1,1,-1)
bits=[max(abs(x).bit_length() for x in unit) for unit in out.exact_units];assert bits==[1245,2115],bits
assert [sum(x!=0 for x in out.retained_relation_provenance[73*u:73*(u+1)]) for u in range(2)]==[49,46]
# The composed words cancel every factor-base row using only resident records.
capacity=int(q['relation_state'][1]);width=len(q['relation_records'])//capacity;records=[int(x) for x in q['relation_records'][:73*width]]
for unit in range(2):
 for row in range(width):
  assert sum(records[width*relation+row]*out.retained_relation_provenance[73*unit+relation] for relation in range(73))==0
# Caller mutations do not alter the immutable result.
before=out.output_sha256;generators[0]+=1;cleanup[0]+=1;active[0]+=1;unit_kernel[0]+=1;tensor[0]+=1
assert out.output_sha256==before and out.exact_units[0][0]!=generators[0]
rejected=0
for args in ((generators[:218],cleanup,active,unit_kernel,tensor),(generators,cleanup[:5328],active,unit_kernel,tensor),(generators,cleanup,active[:224],unit_kernel,tensor),(generators,cleanup,active,unit_kernel[:13],tensor),(generators,cleanup,active,unit_kernel,tensor[:26])):
 try:m.reconstruct_live_cubic_units(*args)
 except m.LiveExactUnitFailure:rejected+=1
assert rejected==5
print(json.dumps({'status':'live-exact-units','relations':73,'kernelColumns':7,'rank':2,'unitNorms':out.unit_norms,'unitBits':bits,'nonzeroProvenance':[sum(x!=0 for x in out.retained_relation_provenance[73*u:73*(u+1)]) for u in range(2)],'principalGeneratorsSha256':out.principal_generators_sha256,'transformsSha256':out.transforms_sha256,'outputSha256':out.output_sha256,'fixtureInputs':False,'oracleInputs':False,'mutationsRejected':rejected},sort_keys=True))
`;
const result = spawnSync(
  "/usr/bin/python3",
  [
    "-c",
    program,
    root,
    resident,
    path.join(__dirname, "live_exact_units_cubic.py"),
  ],
  { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 240000 },
);
assert.equal(result.status, 0, result.stderr || String(result.error));
process.stdout.write(result.stdout);
