// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, readFileSync, openSync, closeSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const root = join(__dirname, "..");

function run(directory, name, source, env = {}) {
  const filename = join(directory, name + ".py");
  writeFileSync(filename, source);
  const stdoutPath = join(directory, name + ".stdout");
  const stderrPath = join(directory, name + ".stderr");
  const stdoutFile = openSync(stdoutPath, "wx");
  const stderrFile = openSync(stderrPath, "wx");
  const result = spawnSync(process.execPath, [join(root, "bin/sagejs-source.cjs"), "--python", filename], {
    cwd: root, encoding: "utf8", timeout: 180000, killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024,
    stdio: ["ignore", stdoutFile, stderrFile],
    env: { ...process.env, SAGEJS_RESUMED_MAP_DIRECTORY: directory, ...env },
  });
  closeSync(stdoutFile); closeSync(stderrFile);
  const stdout = readFileSync(stdoutPath, "utf8");
  const stderr = readFileSync(stderrPath, "utf8");
  writeFileSync(join(directory, name + ".json"), JSON.stringify({
    status: result.status, signal: result.signal, error: result.error?.message,
    stdout, stderr,
  }, null, 2));
  assert.equal(result.status, 0, `retained evidence: ${directory}\n${result.error?.message || stderr || stdout}`);
  return stdout.trim();
}

const setup = String.raw`
import json
import os
from sagejs.number_fields import class_unit_context as context
from sagejs.number_fields import class_unit_replay as replay
from sagejs.number_fields import unit_coordinates as coordinates
from sagejs.number_fields.factored_elements import FactoredNumberFieldElement as Factored
R=PolynomialRing(QQ,"x")
x=R.gen()
case=os.environ["SAGEJS_RESUMED_MAP_CASE"]
if case=="cubic":
    f,h,invariants=x**3-x**2-34*x-57,4,(2,2)
else:
    f,h,invariants=x**4-x**2-10,2,(2,)
K=NumberField(f,"a")
directory=os.environ["SAGEJS_RESUMED_MAP_DIRECTORY"]
prefix=directory+"/prefix.json"
`;

for (const caseName of ["cubic", "quartic"]) {
  test(`nonempty durable ${caseName} resumption admits only freshly replayed unit maps`, { timeout: 365000 }, () => {
    const directory = mkdtempSync(join(tmpdir(), `sagejs-resumed-map-${caseName}-`));
    const env = { SAGEJS_RESUMED_MAP_CASE: caseName };
    run(directory, "cancel", setup + String.raw`
checkpoint=directory+"/checkpoint.json"
state={"cancelled":False}
def cancelled():
    if state["cancelled"]: return True
    if not os.path.exists(checkpoint): return False
    with open(checkpoint) as handle: text=handle.read()
    payload=json.loads(text)
    if payload.get("relations") and payload.get("search_state"):
        context._write_checkpoint_path(prefix,text)
        state["cancelled"]=True
        return True
    return False
result=K.class_unit_group(proof=False,algorithm="buchmann-hecke",checkpoint=checkpoint,cancelled=cancelled,max_checkpoint_bytes=4194304)
assert state["cancelled"] and not result.complete and "cancelled" in result.reason
with open(prefix) as handle: payload=json.load(handle)
assert len(payload["relations"])>0 and payload["search_state"]
print("durable-prefix-ok",len(payload["relations"]))
`, env);
    const output = run(directory, "resume", setup + String.raw`
from sagejs.number_fields import class_unit_analytic as analytic
import sagejs._baselib.number_fields as number_fields
result=K.class_unit_group(proof=False,algorithm="buchmann-hecke",resume_from=prefix,max_checkpoint_bytes=4194304)
print("resume-complete",case,flush=True)
assert result.complete and result.class_number()==h
assert result.class_group().invariants()==invariants
assert result.unit_group().unit_rank==2 and result.unit_group().torsion.order==2
assert result.context._live_artifacts.reusable is False
assert coordinates._nonreusable_terminal(result)
for export in [replay.export_terminal_components,replay.export_conditional_class_unit]:
    try: export(result)
    except coordinates.UnitCoordinateCapabilityError: pass
    else: raise AssertionError("public live export eligibility changed")

def forbidden(*args,**kwargs): raise AssertionError("producer authority, discovery or expansion used")
result.saturation_record._analytic_generation_verifier=forbidden
result.saturation_record._analytic_certificate._generation_verifier=forbidden
field_type=type(K)
field_type.class_unit_group=forbidden
Factored.evaluate=forbidden
analytic.UnitSaturationIndexCertificate.verify=forbidden
analytic._ordinary_unit=forbidden
analytic.ZetaLogResidueWorkspace._restore_shared_snapshot=forbidden
analytic.ZetaLogResidueWorkspace.retained_regulator_issuance=forbidden
saved_owned=replay._replay_conditional_owned
saved_constructor=number_fields.NumberField
saved_compute=analytic._compute_unit_index_proof
counts={"replay":0,"fresh":0,"index":0}
def owned(text):
    counts["replay"]+=1
    return saved_owned(text)
def fresh(*args,**kwargs):
    field=saved_constructor(*args,**kwargs)
    assert field is not K
    counts["fresh"]+=1
    return field
def compute(*args,**kwargs):
    assert kwargs.get("workspace") is None
    answer=saved_compute(*args,**kwargs)
    assert answer[0]==1
    counts["index"]+=1
    return answer
replay._replay_conditional_owned=owned
number_fields.NumberField=fresh
analytic._compute_unit_index_proof=compute

# Eligibility is explicit, not a catch-all retry of live authority rejection.
saved_status=result.proof_status
result.proof_status="exact-unconditional"
try: result.unit_coordinate_map()
except coordinates.UnitCoordinateCapabilityError: pass
else: raise AssertionError("proof mismatch admitted")
result.proof_status=saved_status
assert counts=={"replay":0,"fresh":0,"index":0}
saved_state=result.context.proof_state
result.context._proof_state=context.ClassUnitProofState(
    saved_state.label,factor_base_theorem=saved_state.factor_base_theorem,
    factor_base_bound=saved_state.factor_base_bound,assumptions=("unrecognized hypothesis",))
try: result.unit_coordinate_map()
except coordinates.UnitCoordinateCapabilityError: pass
else: raise AssertionError("missing named assumptions admitted")
result.context._proof_state=saved_state
assert counts=={"replay":0,"fresh":0,"index":0}
saved_units=result.unit_group().generators
result.unit_group().generators=saved_units*17
try: result.unit_coordinate_map()
except replay.ComponentReplayResourceError: pass
else: raise AssertionError("oversized producer components admitted")
result.unit_group().generators=saved_units
assert counts=={"replay":0,"fresh":0,"index":0}
record=result.conditional_relation_records[0]
old_witness=record.witness
record.witness={"factors":[{}]*1025}
try: result.unit_coordinate_map()
except replay.ComponentReplayResourceError: pass
else: raise AssertionError("unbounded source witness copied before preflight")
record.witness=old_witness
prime=result.conditional_factor_base[0]
old_residue=prime._residue_presentation
prime._residue_presentation={"primitive":[0]*1025}
try: result.unit_coordinate_map()
except replay.ComponentReplayResourceError: pass
else: raise AssertionError("unbounded source residue copied before preflight")
prime._residue_presentation=old_residue
assert counts=={"replay":0,"fresh":0,"index":0}

M=result.unit_coordinate_map()
print("admission-complete",case,flush=True)
assert counts=={"replay":1,"fresh":1,"index":1}
try: result.unit_coordinate_map(report={"complete":True})
except TypeError: pass
else: raise AssertionError("public report authority admitted")
assert result.context._live_artifacts.reusable is False
assert M.proof_status=="exact-relations-conditional-grh"
for i,g in enumerate(M.gens()):
    assert g.field() is K
    expected=[0,0,0]; expected[i]=1
    assert M.log(g)==tuple(expected)
assert all(a is not b for a,b in zip(M._basis,saved_units))
for i,g in enumerate(saved_units):
    expected=[0,0,0]; expected[i+1]=1
    assert M.log(g)==tuple(expected)
assert M._torsion is not result.unit_group().torsion
assert M.log(K(1))==(0,0,0) and M.log(K(-1))==(1,0,0)
value=M.factored_exp((1,2,-3))
assert M.log(value)==(1,2,-3)
huge=M.factored_exp((3,2**100,-2**90))
assert M.log(huge)==(1,2**100,-2**90)
try: M.exp((0,2**100,0))
except coordinates.UnitCoordinateResourceError: pass
else: raise AssertionError("explicit expansion cap widened")
try: M.log(Factored.from_element(K,K(2)))
except coordinates.UnitCoordinateCapabilityError: pass
else: raise AssertionError("unknown factored membership admitted")
assert counts=={"replay":1,"fresh":1,"index":1}

def rejected():
    for action in [M.gens,lambda:M.log(value),lambda:M.factored_exp((1,2,-3)),lambda:M.exp((0,0,0))]:
        try: action()
        except coordinates.UnitCoordinateCapabilityError: pass
        else: raise AssertionError("mutated source or map accepted")
old_state=result.context.proof_state
result.context._proof_state=context.ClassUnitProofState.unconditional()
rejected()
result.context._proof_state=old_state
result.complete=False
rejected()
result.complete=True
old_complete=result.saturation_record.complete
result.saturation_record.complete=False
rejected()
result.saturation_record.complete=old_complete
result.unit_group().generators=(Factored.from_element(K,K(2)),)+saved_units[1:]
rejected()
result.unit_group().generators=saved_units
result.unit_group().generators=(Factored.from_dict(K,saved_units[0].to_dict()),)+saved_units[1:]
rejected()
result.unit_group().generators=saved_units
record=result.conditional_relation_records[0]
old_row=record.row
record.row=tuple([old_row[0]+1]+list(old_row[1:]))
rejected()
record.row=old_row
old_presentation=result.conditional_presentation_evidence
result.conditional_presentation_evidence=None
rejected()
result.conditional_presentation_evidence=old_presentation
old_smith=old_presentation.smith
old_presentation.smith=[[2*c for c in old_smith[0]]]+[list(row) for row in old_smith[1:]]
rejected()
old_presentation.smith=old_smith
prime=result.conditional_factor_base[0]
old_prime=prime._rational_prime
prime._rational_prime=old_prime+1
rejected()
prime._rational_prime=old_prime
old_primes=result.conditional_factor_base
result.conditional_factor_base=tuple(reversed(old_primes))
rejected()
result.conditional_factor_base=old_primes
order=result.context.order
old_basis=order._basis_rows
order._basis_rows=[[2*c for c in old_basis[0]]]+[list(r) for r in old_basis[1:]]
rejected()
order._basis_rows=old_basis
old_generator=M._torsion.generator
M._torsion.generator=K(1)
rejected()
M._torsion.generator=old_generator
foreign=saved_constructor(f,"foreign")
source_torsion=result.unit_group().torsion
source_generator=source_torsion.generator
source_torsion.generator=foreign(-1)
rejected()
source_torsion.generator=source_generator
M._torsion.generator=foreign(-1)
rejected()
M._torsion.generator=old_generator
assert M.log(value)==(1,2,-3)
assert counts=={"replay":1,"fresh":1,"index":1}
print("resumed-map-ok",case)
`, env);
    assert.match(output, new RegExp(`resumed-map-ok ${caseName}`));
    rmSync(directory, { recursive: true, force: true });
  });
}

test("live rank-three unit maps never enter detached replay", { timeout: 185000 }, () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-resumed-map-live-"));
  const output = run(directory, "live", String.raw`
from sagejs.number_fields import class_unit_replay as replay
from sagejs.number_fields.factored_elements import FactoredNumberFieldElement as Factored
R=PolynomialRing(QQ,"x"); x=R.gen()
K=NumberField(x**4-x**3-3*x**2+x+1,"a")
result=K.class_unit_group(proof=False,algorithm="buchmann-hecke")
assert result.complete and result.unit_group().unit_rank==3
def forbidden(*args,**kwargs): raise AssertionError("live map used detached replay or discovery")
replay._replay_conditional_owned=forbidden
field_type=type(K)
field_type.class_unit_group=forbidden
Factored.evaluate=forbidden
M=result.unit_coordinate_map()
assert len(M.gens())==4
value=M.factored_exp((1,2,-3,1))
assert M.log(value)==(1,2,-3,1)
assert M.log(K(-1))==(1,0,0,0)
print("live-rank-three-ok")
`);
  assert.match(output, /live-rank-three-ok/);
  rmSync(directory, { recursive: true, force: true });
});

test("proper unit and relation subgroups cannot mint a replay-admitted map", { timeout: 185000 }, () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-resumed-map-subgroups-"));
  const output = run(directory, "subgroups", String.raw`
from sagejs.number_fields import class_unit_analytic as analytic
from sagejs.number_fields import class_group_matrix as matrix
from sagejs.number_fields import class_group_relations as relations
from sagejs.number_fields import unit_coordinates as coordinates
from sagejs.number_fields import class_unit_replay as replay
from sagejs.number_fields.factored_elements import FactoredNumberFieldElement as Factored
R=PolynomialRing(QQ,"x"); x=R.gen()
K=NumberField(x**3-10,"a")
def progress(event): pass
result=K.class_unit_group(proof=False,algorithm="buchmann-hecke",progress=progress)
assert result.complete and coordinates._nonreusable_terminal(result)
width=len(result.conditional_factor_base)
assert width>0
original_h=result.class_number()
original_units=result.unit_group().generators
original_certificate=result.saturation_record._analytic_certificate
original_records=result.conditional_relation_records
original_presentation=result.conditional_presentation_evidence
# Guard the exact eager-copy cases before mathematical replay is entered.
row=original_presentation.relation_rows[0]
old_entries=row.entries
row.entries=((0,1),)*1025
try: result.unit_coordinate_map()
except replay.ComponentReplayResourceError: pass
else: raise AssertionError("unbounded sparse entries copied")
row.entries=old_entries
old_configuration=original_certificate._configuration
original_certificate._configuration={"unbound":"claim"}
try: result.unit_coordinate_map()
except ValueError as error: assert "aliases changed" in str(error)
else: raise AssertionError("rebound analytic getter admitted")
original_certificate._configuration=old_configuration
try: replay._bounded_claim_tree([["x"*4096]*1000]*90)
except replay.ComponentReplayResourceError as error: assert "encoded size" in str(error)
else: raise AssertionError("aggregate JSON size unchecked")
try: replay._bounded_claim_tree(["\U0001f600"*2048]*180)
except replay.ComponentReplayResourceError as error: assert "encoded size" in str(error)
else: raise AssertionError("surrogate-pair JSON escapes unchecked")
def certificate(h,error):
    configuration=original_certificate.configuration
    configuration["class_number"]=h
    configuration["zeta"]["absolute_error"]=error
    configuration["zeta"]["absolute_error_history"]=[error]
    return analytic.UnitSaturationIndexCertificate(
        original_certificate.field_order_identity,original_certificate.initial_units,
        configuration,1,original_certificate.analytic_proof,
        original_certificate.generation_evidence,"exact-relations-conditional-grh")
saved_compute=analytic._compute_unit_index_proof
indices=[]
def compute(*args,**kwargs):
    assert kwargs.get("workspace") is None
    answer=saved_compute(*args,**kwargs); indices.append(answer[0]); return answer
analytic._compute_unit_index_proof=compute
def forbidden(*args,**kwargs): raise AssertionError("producer authority or expansion used")
field_type=type(K); field_type.class_unit_group=forbidden
Factored.evaluate=forbidden
analytic.UnitSaturationIndexCertificate.verify=forbidden
result.saturation_record._analytic_generation_verifier=forbidden
def reject(index):
    try: result.unit_coordinate_map()
    except ValueError as error:
        assert str(error)=="fresh compact BF proof is not the claimed index one",str(error)
    else: raise AssertionError("proper subgroup granted a complete unit map")
    assert indices[-1]==index,indices

result.unit_group().generators=(original_units[0]**2,)+original_units[1:]
result.saturation_record._analytic_certificate=certificate(original_h,"1/8")
reject(2)
result.unit_group().generators=original_units
records=[]
for old in result.conditional_relation_records:
    payload=old.to_dict()
    # to_dict includes nested witness data; copy before changing the fixture.
    import json
    payload=json.loads(json.dumps(payload))
    a,b=payload["norm_smoothness"]["principal_norm"]
    norm=QQ(a)/b
    for name in ("row","source_row","quotient_row"):
        payload[name]=[2*e for e in payload[name]]
    for factor in payload["witness"]["factors"]: factor["exponent"]*=2
    payload["norm_smoothness"]=relations._norm_smoothness(norm**2,tuple(payload["row"]),result.conditional_factor_base)
    records.append(relations.RelationRecord.from_dict(payload))
presentation=matrix.extract_relation_presentation([r.row for r in records],column_count=width,require_full_rank=True)
assert presentation.order==2**width*original_h
result.conditional_relation_records=tuple(records)
result.conditional_presentation_evidence=presentation
result.saturation_record._analytic_certificate=certificate(presentation.order,"1/"+str(4*2**width))
reject(2**width)
assert indices==[2,2**width]
result.conditional_relation_records=original_records
result.conditional_presentation_evidence=original_presentation
result.saturation_record._analytic_certificate=original_certificate
old_torsion=result.unit_group().torsion.generator
result.unit_group().torsion.generator=K(1)
try: result.unit_coordinate_map()
except coordinates.UnitCoordinateCapabilityError as error:
    assert "torsion differs" in str(error)
else: raise AssertionError("pre-admission torsion substitution accepted")
result.unit_group().torsion.generator=old_torsion
assert indices==[2,2**width,1]
print("proper-subgroup-map-rejection-ok")
`);
  assert.match(output, /proper-subgroup-map-rejection-ok/);
  rmSync(directory, { recursive: true, force: true });
});
