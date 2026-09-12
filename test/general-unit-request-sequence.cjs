// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const test = require("node:test");
const root = join(__dirname, "..");

// Each ordering gets its own fresh process and field. Retain failures rather
// than retrying under another limit or relying on a neighboring cached field.
for (const field of ["cubic", "quartic"]) {
  for (const ordering of ["class-first", "units-first"]) {
    test(`${field} ${ordering} shares discovery across exact maps and regulator requests`, { timeout: 185000 }, (t) => {
      const directory = mkdtempSync(join(tmpdir(), `sagejs-unit-sequence-${field}-${ordering}-`));
      const filename = join(directory, "sequence.py");
      writeFileSync(filename, String.raw`
import json
import os

case=os.environ["SAGEJS_UNIT_SEQUENCE_FIELD"]
ordering=os.environ["SAGEJS_UNIT_SEQUENCE_ORDER"]
R=PolynomialRing(QQ,"x")
x=R.gen()
if case=="cubic":
    polynomial,h,invariants=x**3-x**2-34*x-57,4,(2,2)
else:
    polynomial,h,invariants=x**4-x**2-10,2,(2,)
K=NumberField(polynomial,"a")
policy={"proof":False,"algorithm":"buchmann-hecke"}

def note(stage,**details):
    print(json.dumps({"field":case,"ordering":ordering,"stage":stage,**details},sort_keys=True),flush=True)

def counters(result):
    # Use required, real producer counters, not .get values that could all be None.
    resources=result.diagnostics["resources"]
    answer={name:resources[name] for name in (
        "relation_attempts","relation_candidates","ideals_tested","relations")}
    assert all(isinstance(value,int) and not isinstance(value,bool) and value>0
               for value in answer.values()), answer
    assert answer["relations"]==len(result.conditional_relation_records)
    assert answer["relations"]==len(result.conditional_presentation_evidence.relation_rows)
    return answer

note("discovery")
first_units=None
if ordering=="class-first":
    assert K.class_number(**policy)==h
else:
    first_units=K.unit_group(**policy)
    assert first_units.complete and first_units.unit_rank==2
result=K.class_unit_group(**policy)
assert result.complete and result.proof_status=="exact-relations-conditional-grh"
assert result.class_number()==h
units=result.unit_group()
assert first_units is None or first_units is units
assert units.unit_rank==2 and units.torsion.order==2
context=result.context
presentation=result.conditional_presentation_evidence
records=result.conditional_relation_records
live=context._live_artifacts
collector=live.collector
assert live.reusable and live.sealed
assert live.presentation is presentation and collector is not None
assert len(collector.records)==len(records)>0
before=counters(result)
record_ids=tuple(id(record) for record in records)
note("discovery-complete",counters=before)

def same_discovery():
    assert K.class_unit_group(**policy) is result
    assert result.context is context
    assert result.conditional_presentation_evidence is presentation
    assert result.conditional_relation_records is records
    assert tuple(id(record) for record in collector.records)==record_ids
    assert context._live_artifacts is live and live.collector is collector
    assert live.presentation is presentation
    assert counters(result)==before

assert K.unit_group(**policy) is units
assert K.class_number(**policy)==h
same_discovery()
note("class-maps")
C=K.class_group(**policy)
order=K.maximal_order()
assert C.invariants()==invariants and C.order()==h
for index,ideal in enumerate(C.gens_ideals()):
    generator=C.gen(index)
    logarithm=C.discrete_log(ideal)
    assert C(ideal)==generator and logarithm.coordinates==generator.coordinates()
    assert logarithm.verify(ideal,C)
    assert logarithm.principal_witness.verify(order)
    assert not C.is_principal(ideal,proof=False)
    power=ideal**invariants[index]
    principal=C.principality(power)
    assert principal.is_principal and principal.witness is not None
    assert principal.witness.ideal==power and principal.witness.verify(order)
same_discovery()

note("unit-maps")
M=result.unit_coordinate_map()
assert M.proof_status==result.proof_status
assert len(M.gens())==3
for index,generator in enumerate(M.gens()):
    expected=[0,0,0]
    expected[index]=1
    assert M.log(generator)==tuple(expected)
small=M.factored_exp((1,2,-3))
assert M.log(small)==(1,2,-3)
huge=M.factored_exp((3,2**100,-2**90))
assert M.log(huge)==(1,2**100,-2**90)
assert M.log(K(1))==(0,0,0) and M.log(K(-1))==(1,0,0)
same_discovery()

boxes=[]
enclosures=[]
for precision in (100,200):
    note("regulator-request",requested_working_precision_bits=precision)
    box=K.regulator(prec=precision,**policy)
    assert box.rigorous and box.full_rank_certified
    assert box.precision_bits>=precision
    assert box.lower.numerator>0 and box.lower<box.upper
    boxes.append(box)
    enclosures.append({"requested_working_precision_bits":precision,
        "actual_working_precision_bits":box.precision_bits,
        "precision_history":list(box.precision_history),
        "lower":str(box.lower),"upper":str(box.upper)})
    assert K.regulator(prec=precision,**policy) is box
    same_discovery()
assert boxes[0].lower<boxes[1].upper and boxes[1].lower<boxes[0].upper
assert K.unit_group(**policy) is units
assert M.log(small)==(1,2,-3)
same_discovery()
# prec requests working precision; the unchanged analytic default targets
# 64 absolute-tolerance bits, not 100/200-bit absolute accuracy.
note("sequence-complete",counters=counters(result),regulator_enclosures=enclosures,
     default_absolute_tolerance_bits=64)
`);
      const stdoutFile = openSync(join(directory, "stdout"), "wx");
      const stderrFile = openSync(join(directory, "stderr"), "wx");
      const result = spawnSync(process.execPath, [join(root, "bin/sagejs-source.cjs"), "--python", filename], {
        cwd: root, timeout: 180000, killSignal: "SIGKILL",
        stdio: ["ignore", stdoutFile, stderrFile],
        env: { ...process.env, SAGEJS_UNIT_SEQUENCE_FIELD: field, SAGEJS_UNIT_SEQUENCE_ORDER: ordering },
      });
      closeSync(stdoutFile); closeSync(stderrFile);
      const stdout = readFileSync(join(directory, "stdout"), "utf8");
      const stderr = readFileSync(join(directory, "stderr"), "utf8");
      writeFileSync(join(directory, "result.json"), JSON.stringify({
        status: result.status, signal: result.signal, error: result.error?.message,
        stdout, stderr, timeout_seconds: 180, controlled_timing: false,
      }, null, 2));
      assert.equal(result.status, 0, `retained evidence: ${directory}\n${result.error?.message || stderr || stdout}`);
      const events = stdout.trim().split("\n").map((line) => JSON.parse(line));
      assert.equal(events.at(-1).stage, "sequence-complete");
      assert.deepEqual(events.filter((event) => event.stage === "regulator-request").map((event) => event.requested_working_precision_bits), [100, 200]);
      t.diagnostic(JSON.stringify(events.at(-1)));
      rmSync(directory, { recursive: true, force: true });
    });
  }
}
