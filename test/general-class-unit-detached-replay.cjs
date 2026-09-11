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
  const directory = mkdtempSync(join(tmpdir(), "sagejs-component-replay-"));
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

test("CPython rejects malformed detached input before mathematical imports", () => {
  const source = String.raw`
import importlib.util
spec=importlib.util.spec_from_file_location("component_replay",${JSON.stringify(join(root, "src/lib/sagejs/number_fields/class_unit_replay.py"))})
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
for text in ['{"a":1,"a":2}', '['*33+']'*33, '['+'0,'*module.MAX_NODES+'0]', '{"a":1.0}', '{"a":true}', '{"a":NaN}', '{"a":'+'1'*1236+'}', ' '* (module.MAX_BYTES+1), '{}']:
    try: module.replay_terminal_components(text)
    except (ValueError,module.ComponentReplayResourceError): pass
    else: raise AssertionError("malformed payload accepted")
assert module._decode('{"a":[1,-2,"x"]}')=={"a":[1,-2,"x"]}
print("parser-ok")
`;
  assert.equal(run(source, true), "parser-ok");
});

test("fresh-field exact component replay never grants completeness or calls live authority", { timeout: 360000 }, () => {
  const source = String.raw`
import json
import hashlib
number_fields=__import__("sagejs._baselib.number_fields",fromlist=["NumberField"])
from sagejs.number_fields import class_unit_replay as replay
from sagejs.number_fields import class_group_matrix as matrix
from sagejs.number_fields.class_group_relations import FactoredPrincipalWitness as Witness
from sagejs.number_fields.factored_elements import FactoredNumberFieldElement as Factored
R=PolynomialRing(QQ,"x")
x=R.gen()
def encode(payload):
    body=dict(payload)
    body.pop("content_sha256",None)
    text=json.dumps(body,sort_keys=True,separators=(",",":"),ensure_ascii=True)
    body["content_sha256"]=hashlib.sha256(text.encode("utf-8")).hexdigest()
    return json.dumps(body,sort_keys=True,separators=(",",":"),ensure_ascii=True)
def clone(payload): return json.loads(json.dumps(payload))
def reject(payload,label="unspecified"):
    try: replay.replay_terminal_components(encode(payload))
    except (ValueError,ArithmeticError,replay.ComponentReplayCapabilityError,replay.ComponentReplayResourceError): pass
    else: raise AssertionError("rehashed bad mathematics accepted: "+str(f)+" "+label)
def forbidden(*args,**kwargs): raise AssertionError("live producer or expansion was used")
prime_checked=False
for f,rank in [(x**3-x**2-2*x+1,2),(x**4-x-1,2),(x**4-x**3-3*x**2+x+1,3),(x**3-10,1)]:
    K=NumberField(f,"a")
    computation=K.class_unit_group(proof=False,algorithm="buchmann-hecke")
    text=replay.export_terminal_components(computation)
    payload=json.loads(text)
    computation.saturation_record._analytic_generation_verifier=forbidden
    computation.complete=False
    field_type=type(K)
    saved_group=field_type.class_unit_group
    saved_evaluate=Factored.evaluate
    saved_constructor=number_fields.NumberField
    created=[]
    def fresh_field(*args,**keywords):
        fresh=saved_constructor(*args,**keywords)
        assert fresh is not K
        created.append(fresh)
        return fresh
    number_fields.NumberField=fresh_field
    field_type.class_unit_group=forbidden
    Factored.evaluate=forbidden
    try:
        report=replay.replay_terminal_components(text)
        assert report["component_only"] is True and report["complete"] is False
        assert report["source_proof_status_verified"] is False
        assert report["pending"]==["class_generation","analytic_index","unit_lattice_completeness"]
        assert report["unit_memberships_verified"]==rank
        assert report["torsion_order_verified"]==2
        assert len(created)==1
    finally:
        field_type.class_unit_group=saved_group
        Factored.evaluate=saved_evaluate
        number_fields.NumberField=saved_constructor
    if payload["factor_base"]:
        bad=clone(payload)
        original_e=bad["factor_base"][0]["e"]
        bad["factor_base"][0]["e"]=2 if original_e!=2 else 1
        reject(bad)
        reduced=clone(payload)
        reduced["units"]=[]
        reduced["relations"]=[]
        reduced["presentation"]=matrix.extract_relation_presentation([],len(payload["factor_base"])).to_dict()
        reduced["source_proof_status"]="exact-unconditional"
        partial=replay.replay_terminal_components(encode(reduced))
        assert partial["complete"] is False and partial["source_proof_status_verified"] is False
        assert partial["presentation_rank"]==0 and partial["presentation_columns"]>0
        assert partial["unit_memberships_verified"]==0
        prime_checked=True
    if K.degree()==3:
        bad=clone(payload)
        bad["field_order"]["maximal_order_basis"][0][0]=[2,1]
        reject(bad)
        bad=clone(payload)
        bad["field_order"]["field"]["defining_polynomial"][0]=[2,1]
        reject(bad)
        bad=clone(payload)
        bad["units"][0]=Factored.from_element(K,K(2)).to_dict()
        reject(bad)
        bad=clone(payload)
        bad["torsion"]["certificate"]["generator_coordinates"][0]=[1,1]
        reject(bad)
        assert payload["relations"]
        bad=clone(payload)
        witness=Witness.from_dict(K,bad["relations"][0]["witness"])
        bad["relations"][0]["witness"]=Witness(K,list(witness.factors())+[(K(2),1)]).to_dict()
        reject(bad,"relation")
        bad=clone(payload)
        bad["presentation"]["smith_left"][0]=[2*c for c in bad["presentation"]["smith_left"][0]]
        reject(bad,"presentation")
        saved_constructor=number_fields.NumberField
        number_fields.NumberField=forbidden
        try:
            bad=clone(payload)
            bad["units"][0]["factors"][0]["exponent"]=2**100
            reject(bad)
            bad=clone(payload)
            bad["presentation"]["columns"]=2**100
            reject(bad)
            bad=clone(payload)
            bad["torsion"]["certificate"]["candidate_cap"]=2**100
            reject(bad)
            bad=clone(payload)
            bad["torsion"]["certificate"]["degree"]=2**100
            reject(bad)
            try: replay.replay_terminal_components('{"schema":"bad","schema":"bad"}')
            except ValueError: pass
            else: raise AssertionError("duplicate key accepted")
        finally: number_fields.NumberField=saved_constructor
assert prime_checked
print("components-ok")
`;
  assert.equal(run(source), "components-ok");
});
