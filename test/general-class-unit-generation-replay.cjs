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
    { input: source, cwd: root, encoding: "utf8", timeout: 180000,
      killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  return result.stdout.trim();
}

test("generation schema and arithmetic preflight reject before field construction", () => {
  assert.equal(run(String.raw`
import sys, json, builtins
sys.path.append(${JSON.stringify(join(root, "src/lib"))})
from sagejs.number_fields import class_unit_generation_replay as replay
from sagejs.number_fields.class_unit_replay import ComponentReplayResourceError
def encode(payload):
    body=dict(payload)
    body.pop("content_sha256",None)
    body["content_sha256"]=replay._hash(body)
    return json.dumps(body)
identity={"field":{"defining_polynomial":[[-1,1],[0,1],[1,1]],"degree":2,"variable":"a"},"maximal_order_basis":[[[1,1],[0,1]],[[0,1],[1,1]]],"discriminant":5}
payload={"schema":replay.SCHEMA,"field_order":identity,"factor_base":[],"claimed_minkowski_bound":1}
replay._preflight(replay._decode(encode(payload)))
# The schema is dimension-generic, not the component adapter's degree-four cap.
wide=json.loads(encode(payload))
wide["field_order"]["field"]["degree"]=10
wide["field_order"]["field"]["defining_polynomial"]=[[0,1]]*10+[[1,1]]
wide["field_order"]["maximal_order_basis"]=[[[int(i==j),1] for j in range(10)] for i in range(10)]
replay._preflight(replay._decode(encode(wide)))
badtexts=['{}','{"x":1,"x":2}','{"x":true}','{"x":1.5}','['*33+']'*33]
stale=json.loads(encode(payload)); stale["claimed_minkowski_bound"]=2
badtexts.append(json.dumps(stale))
for change in [lambda p:p.update(extra=1),lambda p:p.update(claimed_minkowski_bound=-1),lambda p:p.update(claimed_minkowski_bound=1001),lambda p:p.update(factor_base=[{}]*129),lambda p:p["field_order"]["field"].update(degree=11),lambda p:p["field_order"]["field"].update(defining_polynomial=[[-1,1],[0,1],[2,1]]),lambda p:p["field_order"].update(discriminant=2**128)]:
    bad=json.loads(encode(payload)); change(bad); badtexts.append(encode(bad))
original_import=builtins.__import__
def guarded(name,*args,**kwargs):
    if name.startswith("sagejs._baselib") or name.endswith("class_group_factor_base"):
        raise AssertionError("mathematics imported before preflight")
    return original_import(name,*args,**kwargs)
builtins.__import__=guarded
for text in badtexts:
    try: replay.replay_generating_base(text)
    except (ValueError,ComponentReplayResourceError): pass
    else: raise AssertionError("malformed input accepted")
print("preflight-ok")
`, true), "preflight-ok");
});

test("fresh exact Minkowski coverage checks omissions, bindings and no authority", { timeout: 240000 }, () => {
  assert.equal(run(String.raw`
import json
from sagejs.number_fields import class_unit_generation_replay as replay
from sagejs.number_fields import class_group_factor_base as bases
from sagejs.number_fields import class_unit_context as context
from sagejs.number_fields import prime_ideals
from sagejs.number_fields.class_unit_replay import ComponentReplayResourceError
number_fields=__import__("sagejs._baselib.number_fields",fromlist=["NumberField"])
R=PolynomialRing(QQ,"x"); x=R.gen()
def encode(payload):
    body=dict(payload); body.pop("content_sha256",None)
    body["content_sha256"]=replay._hash(body)
    return json.dumps(body)
def clone(payload): return json.loads(encode(payload))
def reject(payload):
    try: replay.replay_generating_base(encode(payload))
    except (ValueError,ArithmeticError,ComponentReplayResourceError): pass
    else: raise AssertionError("tampered mathematics accepted")
def forbidden(*args,**kwargs): raise AssertionError("producer authority used")
saw_nonempty=False
for polynomial in [x**3-x**2-2*x+1,x**4-x-1,x**3-10]:
    K=NumberField(polynomial,"a"); O=K.maximal_order()
    plan=bases.factor_base_plan(O,proof=True)
    primes=bases.build_factor_base(plan)
    payload={"schema":replay.SCHEMA,"field_order":context._order_fingerprint(K,O),"factor_base":[replay._portable(p.ideal()) for p in primes],"claimed_minkowski_bound":plan.bound}
    constructor=number_fields.NumberField
    made=[]
    def fresh(*args,**kwargs):
        field=constructor(*args,**kwargs)
        assert field is not K
        made.append(field)
        return field
    number_fields.NumberField=fresh
    field_type=type(K); saved=field_type.class_unit_group
    field_type.class_unit_group=forbidden
    # Poison the producer plan: replay cannot reuse its authority/cache.
    plan._factor_base_cache=()
    try: report=replay.replay_generating_base(encode(payload))
    finally:
        number_fields.NumberField=constructor
        field_type.class_unit_group=saved
    assert len(made)==1
    assert report["generation_only"] is True and report["complete"] is False
    assert report["generation_verified"] is True and report["status"]=="verified"
    assert report["assumptions"]==[] and report["bound_evidence"]["theorem"]=="Minkowski"
    assert report["missing_primes"]==[]
    assert "class_generation" not in report["pending"] and "analytic_index" in report["pending"]
    assert "field_instance" not in json.dumps(report) and "order_instance" not in json.dumps(report)
    bad=clone(payload); bad["claimed_minkowski_bound"]+=1; reject(bad)
    bad=clone(payload); bad["field_order"]["discriminant"]+=1; reject(bad)
    bad=clone(payload); bad["field_order"]["maximal_order_basis"][0][0]=[2,1]; reject(bad)
    bad=clone(payload)
    other=[1,1,-3,-1,1] if K.degree()==4 else ([-10,0,0,1] if polynomial!=x**3-10 else [1,-2,-1,1])
    bad["field_order"]["field"]["defining_polynomial"]=[[coefficient,1] for coefficient in other]
    reject(bad)
    if not primes:
        extra=clone(payload)
        extra["factor_base"]=[replay._portable(p) for p in prime_ideals.factor_rational_prime(O,2).prime_ideals()]
        superset=replay.replay_generating_base(encode(extra))
        assert superset["generation_verified"] is True and superset["required_primes"]==[]
        assert superset["factor_base_verified"]==len(extra["factor_base"])
    if primes:
        saw_nonempty=True
        absent=clone(payload); omitted=absent["factor_base"].pop()
        partial=replay.replay_generating_base(encode(absent))
        assert partial["status"]=="missing-coverage" and partial["generation_verified"] is False
        assert partial["complete"] is False and partial["missing_primes"]==[omitted]
        bad=clone(payload); bad["factor_base"].append(bad["factor_base"][0]); reject(bad)
        bad=clone(payload); p=bad["factor_base"][0]; p["e"]=1 if p["e"]!=1 else 2; reject(bad)
        bad=clone(payload); bad["factor_base"][0]["field_order_fingerprint"]["variable"]="wrong"; reject(bad)
        bad=clone(payload); bad["factor_base"][0]["basis"][0][0]=[123,1]; reject(bad)
        # Test fixed-cap boundary logic on an exposed field without expanding
        # the public policy or acquiring a large new runtime test field.
        saved_cap=replay.MAX_BASE
        replay.MAX_BASE=0
        try:
            empty=clone(payload); empty["factor_base"]=[]
            limited=replay.replay_generating_base(encode(empty))
            assert limited["status"]=="resource-limit"
            assert limited["resource_failures"]==["required-prime-count"]
            assert limited["generation_verified"] is False and limited["complete"] is False
        finally: replay.MAX_BASE=saved_cap
        saved_memory=replay.MAX_PLAN_MEMORY
        replay.MAX_PLAN_MEMORY=0
        try:
            limited=replay.replay_generating_base(encode(payload))
            assert limited["status"]=="resource-limit" and "memory" in limited["resource_failures"]
            assert limited["generation_verified"] is False and limited["complete"] is False
        finally: replay.MAX_PLAN_MEMORY=saved_memory
assert saw_nonempty
print("coverage-ok")
`), "coverage-ok");
});
