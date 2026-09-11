// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { mkdtempSync, writeFileSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");
const root = join(__dirname, "..");

function run(source, python = false) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-conditional-replay-"));
  try {
    const filename = join(directory, "check.py");
    writeFileSync(filename, source);
    const result = spawnSync(python ? pythonExecutable() : process.execPath,
      python ? ["-B", filename] : [join(root, "bin/sagejs-source.cjs"), "--python", filename],
      { cwd: root, encoding: "utf8", timeout: 300000, killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024 });
    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
    return result.stdout.trim();
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test("conditional envelope rejects malformed input before mathematical imports", () => {
  const source = String.raw`
import importlib.util
spec=importlib.util.spec_from_file_location("replay",${JSON.stringify(join(root, "src/lib/sagejs/number_fields/class_unit_replay.py"))})
replay=importlib.util.module_from_spec(spec)
spec.loader.exec_module(replay)
for text in ['{}','{"a":1,"a":2}','['*33+']'*33,'{"a":NaN}','{"a":1.2}',' '* (replay.MAX_BYTES+1)]:
    try: replay.replay_conditional_class_unit(text)
    except (ValueError,replay.ComponentReplayResourceError): pass
    else: raise AssertionError("malformed completion envelope accepted")
assert replay._decode('{"a":true}',proof_scalars=True)=={"a":True}
try: replay._decode('{"a":true}')
except ValueError: pass
else: raise AssertionError("legacy component parser gained boolean scalars")
print("preflight-ok")
`;
  assert.equal(run(source, true), "preflight-ok");
});

test("fresh compact index-one composition proves only conditional completeness", { timeout: 360000 }, () => {
  const source = String.raw`
import json
from sagejs.number_fields import class_unit_replay as replay
from sagejs.number_fields import class_unit_analytic as analytic
from sagejs.number_fields.factored_elements import FactoredNumberFieldElement as Factored
from sagejs.number_fields.class_group_proof_contracts import BELABAS_FRIEDMAN_ZETA_GRH
number_fields=__import__("sagejs._baselib.number_fields",fromlist=["NumberField"])
R=PolynomialRing(QQ,"x")
x=R.gen()
def clone(value): return json.loads(json.dumps(value))
def seal(value):
    body=dict(value)
    body.pop("content_sha256",None)
    return replay._sealed(body)
def encoded(value,rebind=False):
    if rebind:
        value["components"]=seal(value["components"])
        value["generation"]=seal(value["generation"])
        value["analytic"]["components_sha256"]=value["components"]["content_sha256"]
        value["analytic"]["generation_sha256"]=value["generation"]["content_sha256"]
    return replay._json(seal(value))
def reject(value,rebind=False):
    try: replay.replay_conditional_class_unit(encoded(value,rebind))
    except (ValueError,ArithmeticError,analytic.AnalyticResourceError,replay.ComponentReplayCapabilityError,replay.ComponentReplayResourceError) as error: return str(error)
    else: raise AssertionError("forged conditional completeness accepted")
def forbidden(*args,**kwargs): raise AssertionError("live discovery, certificate callback or unit expansion used")
for polynomial, expected_rank in [(x**3-x**2-2*x+1,2),(x**4-x-1,2),(x**4-x**3-3*x**2+x+1,3)]:
    K=NumberField(polynomial,"a")
    computation=K.class_unit_group(proof=False,algorithm="buchmann-hecke")
    text=replay.export_conditional_class_unit(computation)
    payload=json.loads(text)
    assert payload["analytic"]["schema"]==replay.COMPACT_INDEX_SCHEMA
    assert computation.saturation_record._analytic_certificate.to_dict()["schema"].endswith(".v1")
    bad_square=clone(payload)
    unit=Factored.from_dict(K,bad_square["components"]["units"][0])
    bad_square["components"]["units"][0]=(unit**2).to_dict()
    # A coarse interval isolating index one need not isolate index two after
    # doubling. Ask the existing verifier for a tighter error, within its caps.
    bad_square["analytic"]["configuration"]["zeta"]["absolute_error"]="1/64"
    bad_square["analytic"]["configuration"]["zeta"]["absolute_error_history"]=["1/64"]
    computation.saturation_record._analytic_generation_verifier=forbidden
    computation.saturation_record._analytic_certificate._generation_verifier=forbidden
    computation.complete=False
    field_type=type(K)
    saved_group=field_type.class_unit_group
    saved_evaluate=Factored.evaluate
    saved_ordinary=analytic._ordinary_unit
    saved_verify=analytic.UnitSaturationIndexCertificate.verify
    saved_constructor=number_fields.NumberField
    saved_compute=analytic._compute_unit_index_proof
    saved_shared=analytic.ZetaLogResidueWorkspace._restore_shared_snapshot
    saved_issuance=analytic.ZetaLogResidueWorkspace.retained_regulator_issuance
    created=[]
    indices=[]
    def fresh(*args,**kwargs):
        result=saved_constructor(*args,**kwargs)
        assert result is not K
        created.append(result)
        return result
    def checked_compute(*args,**kwargs):
        assert kwargs.get("workspace") is None
        result=saved_compute(*args,**kwargs)
        indices.append(result[0])
        return result
    number_fields.NumberField=fresh
    field_type.class_unit_group=forbidden
    Factored.evaluate=forbidden
    analytic._ordinary_unit=forbidden
    analytic.UnitSaturationIndexCertificate.verify=forbidden
    analytic._compute_unit_index_proof=checked_compute
    analytic.ZetaLogResidueWorkspace._restore_shared_snapshot=forbidden
    analytic.ZetaLogResidueWorkspace.retained_regulator_issuance=forbidden
    try:
        report=replay.replay_conditional_class_unit(text)
        assert len(created)==1 and indices==[1]
        assert report["complete"] is True
        assert report["proof_status"]=="exact-relations-conditional-grh"
        assert report["assumptions"]==[BELABAS_FRIEDMAN_ZETA_GRH]
        assert report["class_number"]==1 and report["free_unit_rank"]==expected_rank
        assert report["analytic_index"]==1 and report["live_context_authority"] is False
        square_reason=reject(bad_square,True)
        assert indices[-1]==2, "squared basis must actually recompute index two: "+square_reason+str(indices)
        bad=clone(payload)
        bad["analytic"]["configuration"]["class_number"]=2
        count=len(indices)
        reject(bad)
        assert len(indices)==count, "h-prime mismatch must fail before analytic work"
        bad=clone(payload)
        bad["analytic"]["analytic_proof"]["hr_index"]["unique_index"]=2
        reject(bad)
        bad=clone(payload)
        bad["analytic"]["schema"]="sagejs.number-fields.unit-saturation-index-certificate.v1"
        reject(bad)
        bad=clone(payload)
        bad["generation"]["claimed_minkowski_bound"]+=1
        count=len(indices)
        reject(bad,True)
        assert len(indices)==count, "the generation theorem must be recomputed"
        bad=clone(payload)
        bad["components"]["units"]=[]
        before=len(created)
        reject(bad,True)
        assert len(created)==before
        bad=clone(payload)
        bad["analytic"]["configuration"]["zeta"]["limits"]["maximum_prime_bound"]=1_000_001
        reject(bad)
        assert len(created)==before
        bad=clone(payload)
        bad["components"]["field_order"]["field"]["defining_polynomial"][0]=[1<<32,1]
        reject(bad,True)
        assert len(created)==before, "the existing coefficient cap must not widen"
    finally:
        number_fields.NumberField=saved_constructor
        field_type.class_unit_group=saved_group
        Factored.evaluate=saved_evaluate
        analytic._ordinary_unit=saved_ordinary
        analytic.UnitSaturationIndexCertificate.verify=saved_verify
        analytic._compute_unit_index_proof=saved_compute
        analytic.ZetaLogResidueWorkspace._restore_shared_snapshot=saved_shared
        analytic.ZetaLogResidueWorkspace.retained_regulator_issuance=saved_issuance
print("conditional-completion-ok")
`;
  assert.equal(run(source), "conditional-completion-ok");
});
