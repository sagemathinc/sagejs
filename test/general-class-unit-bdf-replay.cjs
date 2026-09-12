// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");
const root = join(__dirname, "..");

function run(source, python = false) {
  const result = spawnSync(python ? pythonExecutable() : process.execPath,
    python ? ["-B", "-"] : [join(root, "bin/sagejs-source.cjs"), "--python", "-"],
    { input: source, cwd: root, encoding: "utf8", timeout: 300000,
      killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  return result.stdout.trim();
}

test("BDF generation accepts only an explicit bounded theorem and hypothesis", () => {
  assert.equal(run(String.raw`
import builtins, json, sys
sys.path.append(${JSON.stringify(join(root, "src/lib"))})
from sagejs.number_fields import class_unit_generation_replay as generation
from sagejs.number_fields import class_unit_replay as replay
from sagejs.number_fields.class_group_proof_contracts import BDF_CLASS_CHARACTER_GRH
identity={"field":{"defining_polynomial":[[-1,1],[0,1],[1,1]],"degree":2,"variable":"a"},"maximal_order_basis":[[[1,1],[0,1]],[[0,1],[1,1]]],"discriminant":5}
payload={"schema":generation.BDF_SCHEMA,"field_order":identity,"factor_base":[],"theorem":"bdf","assumptions":[BDF_CLASS_CHARACTER_GRH],"claimed_bound":2}
def seal(value):
    body=dict(value); body.pop("content_sha256",None)
    return replay._sealed(body)
generation._preflight(seal(payload))
original=builtins.__import__
def guarded(name,*args,**kwargs):
    if name.startswith("sagejs._baselib") or name.endswith("class_group_factor_base"):
        raise AssertionError("malformed BDF imported mathematical implementation")
    return original(name,*args,**kwargs)
builtins.__import__=guarded
for change in [lambda p:p.update(theorem="minkowski"),lambda p:p.update(theorem="pari"),lambda p:p.update(assumptions=[]),lambda p:p.update(assumptions=["GRH"]),lambda p:p.update(assumptions=[BDF_CLASS_CHARACTER_GRH]*2),lambda p:p.update(claimed_bound=1),lambda p:p.update(claimed_bound=1001),lambda p:p.update(claimed_bound=True),lambda p:p.update(schema=generation.SCHEMA),lambda p:p.update(claimed_minkowski_bound=2),lambda p:p.update(factor_base=[{}]*129)]:
    bad=json.loads(json.dumps(payload)); change(bad)
    try: generation.replay_generating_base(replay._json(seal(bad)))
    except (ValueError,replay.ComponentReplayResourceError): pass
    else: raise AssertionError("unsupported BDF policy accepted")
try: replay.export_conditional_class_unit(None,generation_theorem="pari")
except ValueError: pass
else: raise AssertionError("unsupported export theorem accepted")
print("bdf-preflight-ok")
`, true), "bdf-preflight-ok");
});

test("nontrivial rank-two groups complete only after fresh BDF and analytic replay", { timeout: 360000 }, () => {
  assert.equal(run(String.raw`
import json
from sagejs.number_fields import class_unit_replay as replay
from sagejs.number_fields import class_unit_generation_replay as generation
from sagejs.number_fields import class_unit_analytic as analytic
from sagejs.number_fields import class_group_factor_base as bases
from sagejs.number_fields.factored_elements import FactoredNumberFieldElement as Factored
from sagejs.number_fields.class_group_proof_contracts import BDF_CLASS_CHARACTER_GRH, BELABAS_FRIEDMAN_ZETA_GRH
number_fields=__import__("sagejs._baselib.number_fields",fromlist=["NumberField"])
R=PolynomialRing(QQ,"x"); x=R.gen()
expected_assumptions=sorted([BDF_CLASS_CHARACTER_GRH,BELABAS_FRIEDMAN_ZETA_GRH])
def clone(value): return json.loads(json.dumps(value))
def seal(value):
    body=dict(value); body.pop("content_sha256",None)
    return replay._sealed(body)
def encode(value):
    value["components"]=seal(value["components"])
    value["generation"]=seal(value["generation"])
    value["analytic"]["components_sha256"]=value["components"]["content_sha256"]
    value["analytic"]["generation_sha256"]=value["generation"]["content_sha256"]
    return replay._json(seal(value))
def reject(value):
    try: replay.replay_conditional_class_unit(encode(value))
    except (ValueError,ArithmeticError,analytic.AnalyticResourceError,replay.ComponentReplayCapabilityError,replay.ComponentReplayResourceError) as error: return str(error)
    else: raise AssertionError("forged BDF completeness accepted")
def forbidden(*args,**kwargs): raise AssertionError("producer authority or unit expansion reused")
for polynomial,h,invariants,bound in [(x**3-x**2-34*x-57,4,[2,2],19),(x**4-x**2-10,2,[2],16)]:
    K=NumberField(polynomial,"a"); O=K.maximal_order()
    computation=K.class_unit_group(proof=False,algorithm="buchmann-hecke")
    legacy=replay.export_conditional_class_unit(computation)
    try: replay.replay_conditional_class_unit(legacy)
    except ValueError as error: assert "generation" in str(error)
    else: raise AssertionError("Minkowski-only v1 silently gained BDF authority")
    text=replay.export_conditional_class_unit(computation,generation_theorem="bdf")
    payload=json.loads(text)
    assert payload["schema"]==replay.BDF_COMPLETION_SCHEMA
    assert payload["assumptions"]==expected_assumptions
    assert payload["generation"]["claimed_bound"]==bound
    absent=clone(payload["generation"])
    # The cubic has three distinct ideals with the same (19,1,1) descriptor.
    removed=absent["factor_base"].pop()
    if h==4:
        assert any((p["prime"],p["e"],p["f"])==(removed["prime"],removed["e"],removed["f"]) for p in absent["factor_base"])
    partial=generation.replay_generating_base(replay._json(seal(absent)))
    assert partial["generation_verified"] is False and partial["status"]=="missing-coverage"
    assert partial["complete"] is False and len(partial["missing_primes"])==1
    assert partial["assumptions"]==[BDF_CLASS_CHARACTER_GRH]
    duplicated=clone(payload["generation"])
    duplicated["factor_base"].append(duplicated["factor_base"][0])
    try: generation.replay_generating_base(replay._json(seal(duplicated)))
    except ValueError as error: assert "duplicate" in str(error)
    else: raise AssertionError("a duplicate prime ideal was accepted")
    original_constructor=number_fields.NumberField
    original_plan=bases.factor_base_plan
    original_compute=analytic._compute_unit_index_proof
    field_type=type(K)
    original_group=field_type.class_unit_group
    original_evaluate=Factored.evaluate
    original_verify=analytic.UnitSaturationIndexCertificate.verify
    original_ordinary=analytic._ordinary_unit
    original_shared=analytic.ZetaLogResidueWorkspace._restore_shared_snapshot
    original_issuance=analytic.ZetaLogResidueWorkspace.retained_regulator_issuance
    created=[]; plans=[]; indices=[]
    def fresh(*args,**kwargs):
        field=original_constructor(*args,**kwargs); assert field is not K
        created.append(field); return field
    def fresh_plan(order,**kwargs):
        assert order is not O
        assert kwargs["theorem"]=="bdf" and kwargs["proof"] is False
        assert kwargs["max_bound"]==1000 and kwargs["max_memory_bytes"]==16*1024*1024
        assert kwargs["max_rational_primes"]==500 and kwargs["max_prime_ideals"]==5000
        result=original_plan(order,**kwargs); plans.append(result); return result
    def fresh_compute(*args,**kwargs):
        assert kwargs.get("workspace") is None
        result=original_compute(*args,**kwargs); indices.append(result[0]); return result
    number_fields.NumberField=fresh
    bases.factor_base_plan=fresh_plan
    analytic._compute_unit_index_proof=fresh_compute
    field_type.class_unit_group=forbidden
    Factored.evaluate=forbidden
    analytic.UnitSaturationIndexCertificate.verify=forbidden
    analytic._ordinary_unit=forbidden
    analytic.ZetaLogResidueWorkspace._restore_shared_snapshot=forbidden
    analytic.ZetaLogResidueWorkspace.retained_regulator_issuance=forbidden
    computation.saturation_record._analytic_generation_verifier=forbidden
    computation.saturation_record._analytic_certificate._generation_verifier=forbidden
    computation.complete=False
    try:
        report=replay.replay_conditional_class_unit(text)
        assert len(created)==1 and len(plans)==1 and indices==[1]
        assert report["schema"]=="sagejs.number-fields/class-unit-conditional-report-v2"
        assert report["complete"] is True and report["live_context_authority"] is False
        assert report["class_number"]==h and report["class_invariants"]==invariants
        assert report["free_unit_rank"]==2 and report["analytic_index"]==1
        assert report["assumptions"]==expected_assumptions
        assert report["generation"]["assumptions"]==[BDF_CLASS_CHARACTER_GRH]
        for change in [lambda p:p.update(assumptions=[]),lambda p:p.update(assumptions=[BELABAS_FRIEDMAN_ZETA_GRH]),lambda p:p.update(assumptions=list(reversed(expected_assumptions))),lambda p:p.update(assumptions=expected_assumptions+[BDF_CLASS_CHARACTER_GRH]),lambda p:p["generation"].update(assumptions=[]),lambda p:p["generation"].update(theorem="minkowski"),lambda p:p["generation"]["field_order"].update(discriminant=1),lambda p:p["generation"]["factor_base"].reverse()]:
            bad=clone(payload); change(bad); count=len(created); reject(bad)
            assert len(created)==count, "hypothesis changes must fail before field construction"
        bad=clone(payload); bad["schema"]=replay.COMPLETION_SCHEMA; bad.pop("assumptions")
        count=len(created); reject(bad); assert len(created)==count
        bad=clone(payload); bad["generation"]=json.loads(legacy)["generation"]
        count=len(created); reject(bad); assert len(created)==count
        for delta in (-1,1):
            bad=clone(payload); bad["generation"]["claimed_bound"]+=delta
            count=len(indices); reject(bad)
            assert len(indices)==count and plans[-1].bound==bound
        bad=clone(payload)
        unit=Factored.from_dict(K,bad["components"]["units"][0])
        bad["components"]["units"][0]=(unit**2).to_dict()
        # Index two needs separation from one and three, not a 1/64 log-residue
        # request. A radius at most 1/8 permits at most 1/4 endpoint error from
        # the true log value; 2*exp([-1/4,1/4]) contains only the integer two.
        # Still require the actual exact interval decision below, not a hint.
        bad["analytic"]["configuration"]["zeta"]["absolute_error"]="1/8"
        bad["analytic"]["configuration"]["zeta"]["absolute_error_history"]=["1/8"]
        reason=reject(bad)
        assert indices[-1]==2, "incomplete unit subgroup must actually recompute index two: "+reason
    finally:
        number_fields.NumberField=original_constructor
        bases.factor_base_plan=original_plan
        analytic._compute_unit_index_proof=original_compute
        field_type.class_unit_group=original_group
        Factored.evaluate=original_evaluate
        analytic.UnitSaturationIndexCertificate.verify=original_verify
        analytic._ordinary_unit=original_ordinary
        analytic.ZetaLogResidueWorkspace._restore_shared_snapshot=original_shared
        analytic.ZetaLogResidueWorkspace.retained_regulator_issuance=original_issuance
print("nontrivial-bdf-completion-ok")
`), "nontrivial-bdf-completion-ok");
});

test("BDF replay preserves work-cap, precision and unrelated arithmetic failures", { timeout: 240000 }, () => {
  assert.equal(run(String.raw`
import json
from sagejs.number_fields import class_unit_replay as replay
from sagejs.number_fields import class_unit_generation_replay as generation
from sagejs.number_fields import class_group_factor_base as bases
from sagejs.number_fields import class_unit_context as context
from sagejs.number_fields.class_group_proof_contracts import BDF_CLASS_CHARACTER_GRH
R=PolynomialRing(QQ,"x"); x=R.gen()
K=NumberField(x**3-x**2-34*x-57,"a"); O=K.maximal_order()
payload={"schema":generation.BDF_SCHEMA,"field_order":context._order_fingerprint(K,O),"factor_base":[],"theorem":"bdf","assumptions":[BDF_CLASS_CHARACTER_GRH],"claimed_bound":19}
def encoded(): return replay._json(replay._sealed(payload))
def expect_error(kind,message):
    try: generation.replay_generating_base(encoded())
    except kind as error: assert message in str(error), str(error)
    else: raise AssertionError("work or precision failure became a successful coverage report")
# Exercise the actual owning work-cap exception, not an unbounded search and
# not a malformed input. Lowering this fixture's cap never widens public policy.
saved_bound=generation.MAX_BOUND
generation.MAX_BOUND=2; payload["claimed_bound"]=2
try: expect_error(ValueError,"BDF search exceeded max_bound=2")
finally: generation.MAX_BOUND=saved_bound; payload["claimed_bound"]=19
saved_inequality=bases._BDFEvaluator.inequality
def undecidable(*args,**kwargs):
    interval=bases._Interval(-bases.ONE,bases.ONE)
    return 0,interval,interval
bases._BDFEvaluator.inequality=undecidable
try: expect_error(ArithmeticError,"BDF inequality is numerically inseparable")
finally: bases._BDFEvaluator.inequality=saved_inequality
saved_plan=bases.factor_base_plan
def unrelated(*args,**kwargs): raise ArithmeticError("unrelated exact arithmetic failure")
bases.factor_base_plan=unrelated
try: expect_error(ArithmeticError,"unrelated exact arithmetic failure")
finally: bases.factor_base_plan=saved_plan
saved_memory=generation.MAX_PLAN_MEMORY
generation.MAX_PLAN_MEMORY=0
try:
    limited=generation.replay_generating_base(encoded())
    assert limited["status"]=="resource-limit" and "memory" in limited["resource_failures"]
    assert limited["complete"] is False and limited["generation_verified"] is False
finally: generation.MAX_PLAN_MEMORY=saved_memory
# Force optimistic plan metadata to meet stricter actual stream ceilings.
# The stream's exact count and retained-byte enforcement must still fail closed.
for attribute,message in [("max_prime_ideals","exact factor-base size exceeds"),("max_memory_bytes","factor-base records exceed")]:
    def limited_stream_plan(*args,**kwargs):
        result=saved_plan(*args,**kwargs)
        assert result.fits_caps
        setattr(result,attribute,0)
        return result
    bases.factor_base_plan=limited_stream_plan
    try: expect_error(ValueError,message)
    finally: bases.factor_base_plan=saved_plan
def false_hypotheses(*args,**kwargs):
    result=saved_plan(*args,**kwargs); result.assumptions=(); return result
bases.factor_base_plan=false_hypotheses
try: expect_error(ValueError,"fresh generating theorem or assumptions differ")
finally: bases.factor_base_plan=saved_plan
print("bdf-resource-failures-ok")
`), "bdf-resource-failures-ok");
});
