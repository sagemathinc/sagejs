#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const resident = path.resolve(
  process.argv[2] ||
    process.env.SAGEJS_RESIDENT_CUBIC ||
    "/tmp/sagejs-resident-generated-class-3qtnS5/output.json",
);

const program = String.raw`
import collections, copy, dataclasses, decimal, fractions, hashlib, importlib, json, pathlib, sys, typing
sys.set_int_max_str_digits(100000)
sys.path[:0] = [sys.argv[1], sys.argv[1] + "/src/lib"]
q = json.load(open(sys.argv[2], encoding="utf-8"))
def numeric(value):
    if isinstance(value,list):return [numeric(entry) for entry in value]
    if isinstance(value,dict):return {key:numeric(entry) for key,entry in value.items()}
    if isinstance(value,str):
        try:return int(value)
        except ValueError:return value
    return value
q=numeric(q)
s = importlib.import_module("bench.pari-class-group-port.h1_terminal_owner_snapshot")
w = importlib.import_module("bench.pari-class-group-port.relation_hnf_witness")
t = importlib.import_module("bench.pari-class-group-port.class_group_smith_transform")
l = importlib.import_module("bench.pari-class-group-port.log_matrix_transform")
u = importlib.import_module("bench.pari-class-group-port.unit_bridge_cubic")
e = importlib.import_module("bench.pari-class-group-port.live_exact_units_cubic")
I = lambda n: [0] * n
F = lambda n: [0.0] * n

# Recompute the live relation/HNF witnesses from the numeric owners.
inverse, augmented, inverse_state = I(225), I(450), I(5)
r2p, p2r, witness_state = I(120), I(120), I(8)
assert w.pari_relation_hnf_witness(
    q["hnf_matbnew"][:120], 8, 15, q["hnf_full_h"][:120],
    q["hnf_hnf_transform"][:225], inverse, augmented, inverse_state,
    r2p, p2r, witness_state,
) == 0

# Recompute the complete h=1 Smith/transform result and ga owner.
matrices = [I(64) for _ in range(10)]
smith,left,left_inverse,right,ur,y,uir,x,m1,m2 = matrices
invariants,class_number,column,product,smith_augmented = I(8),I(1),I(8),I(64),I(128)
states=[I(5),I(5),I(6),I(6),I(7)]
presentation=q["hnf_full_h"][56:120]
assert t.pari_class_group_smith_transform(
    presentation,8,*matrices,invariants,class_number,column,product,
    smith_augmented,*states,
) == 0
assert class_number == [1] and states[-1][1] == 0
generator_arch=I(168)
l.pari_log_matrix_transform(q["hnf_result_c"][:168],m2,3,8,8,True,generator_arch)

# Recompute the compact 2-by-7 unit provenance from the live p192 owners.
c=7; sq=49
prepare = [
    q["hnf_result_c"][:147], q["accept_relations"][:14], c,
    q["accept_regulator"][:3],
    I(14), I(4), I(14), I(42), I(18), I(42), I(18), I(6), I(5), F(5),
    I(5), I(14), I(sq), I(sq), F(sq), I(sq), F(sq), I(sq), F(c), I(c),
    F(14), F(sq), I(c), I(c), I(c), F(c), F(c), F(c), I(c), I(6), I(3),
    I(6), I(4), I(4), F(4), I(4), F(4), I(4), F(2), I(2), F(6), F(4),
    I(2), I(3), I(3), F(3), F(3), F(3), I(3), I(2),
]
assert u.pari_cubic_unit_bridge_prepare(*prepare) == 0
factor = [
    prepare[10], I(4), I(18), I(6), I(4), I(2), F(4), I(4), F(4), I(4),
    F(2), I(2), F(6), F(4), I(2), I(3), I(2), F(3), F(3), I(4),
]
assert u.pari_cubic_getfu_factor_rank_two(*factor) == 0
compact=I(14)
assert u.pari_cubic_unit_compose_provenance(prepare[6],c,factor[1],compact) == 0
component=e.reconstruct_live_cubic_units(
    q["generators"][:219],q["hnf_transform"][:5329],
    q["hnf_hnf_transform"][:225],compact,q["basis_table"][:27],
)
integral=[value for unit in component.exact_units for value in unit]
basis=list(map(int,q["prep_zk"][:9]))
power=[]
for k in range(2):
    coordinates=integral[3*k:3*k+3]
    power.extend(sum(basis[column*3+row]*coordinates[column] for column in range(3)) for row in range(3))

# Produce exact, normalized p2176 log triples whose determinant is the live
# packed regulator.  These generated values exercise the snapshot contract;
# the unified native root supplies its independently rebuilt log owners.
reg=list(map(int,q["accept_regulator"][:3]))
shift=2176-reg[1]
wide=[reg[0] << shift,2176,reg[2]]
zero=[0,-1,0]
one=[1 << 2175,2176,0]
logs=wide+[-wide[0],wide[1],wide[2]]+zero+zero+one+[-one[0],one[1],one[2]]
ulp_exponent=reg[2]-(reg[1]-1)
interval=[reg[0]-1,ulp_exponent,reg[0]+1,ulp_exponent]

owners=s.H1TerminalNumericOwners(
    terminal_state=I(8),
    polynomial=q["prep_polynomial"],integral_basis=q["prep_zk"],
    multiplication_tensor=q["basis_table"],
    factor_base_ideals=q["packet_ideals"],factor_base_norms=q["packet_norms"],
    relation_records=q["relation_records"],principal_generators=q["generators"],
    cleanup_transform=q["hnf_transform"],initial_permutation=q["search_ideals"],
    original_relation_logs=q["log_embeddings"],active_relation=q["hnf_matbnew"],
    full_hnf=q["hnf_full_h"],active_hnf_transform=q["hnf_hnf_transform"],
    transformed_relation_logs=q["hnf_result_c"],
    relation_to_presentation=r2p,presentation_to_relation=p2r,
    presentation=presentation,smith=smith,left=left,left_inverse=left_inverse,
    right=right,right_inverse=product,ur=ur,y=y,uir=uir,x=x,m2=m2,
    generator_arch=generator_arch,compact_unit_provenance=compact,
    retained_relation_provenance=component.retained_relation_provenance,
    exact_units_integral_basis=integral,exact_units_power_basis=power,
    rebuilt_unit_logs=logs,unit_phases=[0,0,1,1,1,1],packed_regulator=reg,
    regulator_interval=interval,regulator_state=[0,1,1,1,2176],
    torsion_state=[0,2,-1,1],torsion_generator=[-1,0,0],
    assumption_flags=s.EXPECTED_ASSUMPTION_FLAGS,
)
snapshot=s.capture_h1_terminal_owner_snapshot(owners)
authority=s.authority_for_h1_terminal_snapshot(snapshot)
payload=s.cold_replay_h1_terminal_snapshot(snapshot,authority)
assert payload["class_group"]["class_number"] == "1"
assert payload["terminal"]["intermediate_serializations"] == 0

def reseal(changed):
    payload_raw=s._canonical(changed)
    envelope={"schema":s.ENVELOPE_SCHEMA,"payload":changed,"payload_sha256":s._sha256(payload_raw)}
    raw=s._canonical(envelope)
    return s.ImmutableH1TerminalSnapshot(raw,s._sha256(raw))

def rejected(changed,index):
    forged=reseal(changed)
    try:s.cold_replay_h1_terminal_snapshot(forged,s.H1TerminalSnapshotAuthority(forged.sha256))
    except s.H1TerminalSnapshotFailure:return
    raise AssertionError("coordinated terminal mutation was accepted: "+str(index))

mutations=[]
changed=copy.deepcopy(payload);changed["presentation"]["relation_records"]["entries"][0]="9";mutations.append(changed)
changed=copy.deepcopy(payload);changed["presentation"]["active_relation"]["entries"][0]=str(int(changed["presentation"]["active_relation"]["entries"][0])+1);mutations.append(changed)
changed=copy.deepcopy(payload);changed["class_group"]["smith"]["entries"][0]="2";mutations.append(changed)
changed=copy.deepcopy(payload);changed["unit_group"]["compact_provenance"]["entries"][0]=str(int(changed["unit_group"]["compact_provenance"]["entries"][0])+1);mutations.append(changed)
changed=copy.deepcopy(payload);changed["unit_group"]["exact_units_power_basis"]["entries"][0]=str(int(changed["unit_group"]["exact_units_power_basis"]["entries"][0])+1);mutations.append(changed)
changed=copy.deepcopy(payload);changed["unit_group"]["rebuilt_logs"]["entries"][0]=str(int(changed["unit_group"]["rebuilt_logs"]["entries"][0])+(1 << 1024));mutations.append(changed)
changed=copy.deepcopy(payload);changed["regulator"]["packed"]["entries"][0]=str(int(changed["regulator"]["packed"]["entries"][0])+2);mutations.append(changed)
changed=copy.deepcopy(payload);changed["torsion"]["generator"]["entries"][0]="1";mutations.append(changed)
changed=copy.deepcopy(payload);changed["assumptions"]["flags"][-1]="1";mutations.append(changed)
changed=copy.deepcopy(payload);changed["terminal"]["state"]["entries"][0]="1";mutations.append(changed)
for index,changed in enumerate(mutations):rejected(changed,index)

print(json.dumps({
    "schema":payload["schema"],"sha256":snapshot.sha256,
    "relations":73,"factorBase":66,"exactUnits":2,
    "mutationsRejected":len(mutations),"fixtureInputs":0,
    "intermediateSerializations":0,"publicComplete":False,
},sort_keys=True))
`;

const result = spawnSync("python3", ["-c", program, root, resident], {
  cwd: root,
  encoding: "utf8",
  maxBuffer: 128 * 1024 * 1024,
  timeout: 600000,
});
assert.equal(result.status, 0, result.stderr || String(result.error));
const summary = JSON.parse(result.stdout);
assert.equal(summary.mutationsRejected, 10);
assert.equal(summary.fixtureInputs, 0);
assert.equal(summary.intermediateSerializations, 0);
console.log(JSON.stringify(summary, null, 2));
