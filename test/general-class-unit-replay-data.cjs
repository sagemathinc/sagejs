// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { join } = require("node:path");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");
const root = join(__dirname, "..");

const boundaries = String.raw`
import sys, json
sys.path.append(${JSON.stringify(join(root, "src/lib"))})
from sagejs.number_fields import class_unit_replay as components
from sagejs.number_fields import class_unit_generation_replay as generation
from sagejs.number_fields import _class_unit_replay_data as data
assert components.ComponentReplayResourceError is data.ComponentReplayResourceError

def identity(degree):
    return {
        "field": {"degree": degree, "variable": "a", "defining_polynomial": [[-1,1]] + [[0,1]]*(degree-1) + [[1,1]]},
        "maximal_order_basis": [[[int(i==j),1] for j in range(degree)] for i in range(degree)],
        "discriminant": 5,
    }

def portable(order):
    degree=order["field"]["degree"]
    fingerprint=dict(order)
    del fingerprint["field"]
    fingerprint.update({"defining_polynomial": order["field"]["defining_polynomial"], "variable": "a"})
    return {"schema": "sagejs.number-fields.prime-ideal.v1", "field_order_fingerprint": fingerprint,
        "prime": 997, "e": 1, "f": 1, "basis": order["maximal_order_basis"],
        "residue": {"primitive": [0]*degree, "modulus": [0,1], "quotient_matrix": [[0] for _ in range(degree)], "power_inverse": [[1]]}}

def envelope(replay, degree=4, count=0):
    order=identity(degree)
    payload={"schema": replay.SCHEMA, "field_order": order, "factor_base": [portable(order) for _ in range(count)]}
    if replay is generation:
        payload["claimed_minkowski_bound"]=1
    else:
        square=[[int(i==j) for j in range(count)] for i in range(count)]
        payload.update({"source_proof_status": "exact-unconditional", "relations": [], "units": [],
            "presentation": {"schema": "sagejs.number-fields/class-relation-presentation-v1", "columns": count, "rows": [], "hnf": [], "hnf_left": [], "smith": [], "smith_left": [], "smith_right": square, "smith_right_inverse": square, "backend": ""},
            "torsion": {"order": 2, "certificate": {"schema": "sagejs.number-fields/roots-of-unity-certificate-v1", "kind": "real-place", "degree": degree, "signature": [degree,0], "universal_prime_powers": [], "universal_exponent": 2, "generator_coordinates": [[-1,1]]+[[0,1]]*(degree-1), "prime_records": [], "coefficient_bounds": [], "candidates_checked": 0, "candidate_cap": 0, "proof_status": "exact"}}})
    return payload

def encode(payload):
    body=dict(payload)
    body.pop("content_sha256",None)
    body["content_sha256"]=components._hash(body)
    return json.dumps(body)

def check(replay,payload):
    replay._preflight(replay._decode(encode(payload)))

def rejected(replay,payload,error=data.ComponentReplayResourceError):
    try: check(replay,payload)
    except error: pass
    else: raise AssertionError("preflight accepted an out-of-policy payload")

# Synthetic schema fixtures establish only admission boundaries, not fields,
# prime ideals or completeness; the exact-object suites supply those oracles.
check(components,envelope(components,4,32))
rejected(components,envelope(components,5))
rejected(components,envelope(components,4,33))
for degree in [4,5,10]: check(generation,envelope(generation,degree,128))
rejected(generation,envelope(generation,11))
rejected(generation,envelope(generation,4,129))

for replay in [components,generation]:
    rejected(replay,envelope(replay,1))
    for bits,location in [(32,"polynomial"),(128,"discriminant"),(512,"order"),(512,"prime")]:
        for sign in [-1,1]:
            for magnitude in [(1<<bits)-1,1<<bits]:
                payload=envelope(replay,4,1)
                order=payload["field_order"]
                if location=="polynomial": order["field"]["defining_polynomial"][0]=[sign*magnitude,1]
                elif location=="discriminant":
                    order["discriminant"]=sign*magnitude
                    payload["factor_base"][0]["field_order_fingerprint"]["discriminant"]=sign*magnitude
                elif location=="order": order["maximal_order_basis"][0][0]=[sign*magnitude,1]
                else:
                    payload["factor_base"][0]["basis"]=[row[:] for row in order["maximal_order_basis"]]
                    payload["factor_base"][0]["basis"][0][0]=[sign*magnitude,1]
                if magnitude < 1<<bits: check(replay,payload)
                else: rejected(replay,payload)
    for p in [1000,1001]:
        payload=envelope(replay,4,1); payload["factor_base"][0]["prime"]=p
        if p==1000: check(replay,payload)
        else: rejected(replay,payload)
    for key in ["e","f"]:
        payload=envelope(replay,4,1); payload["factor_base"][0][key]=5
        rejected(replay,payload)
    for key in ["primitive","modulus","quotient_matrix","power_inverse"]:
        for value in [996,997]:
            payload=envelope(replay,4,1)
            vector=payload["factor_base"][0]["residue"][key]
            if key in ["quotient_matrix","power_inverse"]: vector=vector[0]
            vector[0]=value
            if value==996: check(replay,payload)
            else: rejected(replay,payload)
    for pair in [[2,2],[1,0],[1,1<<512]]:
        payload=envelope(replay)
        payload["field_order"]["maximal_order_basis"][0][0]=pair
        rejected(replay,payload,ValueError if pair==[2,2] else data.ComponentReplayResourceError)
    payload=envelope(replay); payload["field_order"]=[]
    rejected(replay,payload,ValueError)
    payload=envelope(replay,4,1)
    payload["factor_base"][0]["field_order_fingerprint"]["variable"]="wrong"
    rejected(replay,payload,ValueError)
    for text in ['{"x":true}','{"x":null}','{"x":1.0}','{"x":1,"x":2}']:
        try: replay._decode(text)
        except ValueError: pass
        else: raise AssertionError("component JSON parser policy widened")
assert components._decode('{"x":[true,null]}',proof_scalars=True)=={"x":[True,None]}
print("replay-data-boundaries-ok")
`;

for (const python of [true, false]) {
  test(`${python ? "CPython" : "Sage.js"} preserves distinct replay admission caps`, () => {
    const result = spawnSync(python ? pythonExecutable() : process.execPath,
      python ? ["-B", "-"] : [join(root, "bin/sagejs-source.cjs"), "--python", "-"],
      { input: boundaries, cwd: root, encoding: "utf8", timeout: 180000,
        killSignal: "SIGKILL", maxBuffer: 8 * 1024 * 1024 });
    assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
    assert.equal(result.stdout.trim(), "replay-data-boundaries-ok");
  });
}

test("shared data and malformed replay stay ahead of mathematical imports", () => {
  const source = String.raw`
import sys, builtins
sys.path.append(${JSON.stringify(join(root, "src/lib"))})
original_import=builtins.__import__
allowed={"sagejs", "sagejs.number_fields", "sagejs.number_fields._class_unit_replay_data", "sagejs.number_fields.class_unit_replay", "sagejs.number_fields.class_unit_generation_replay"}
def guarded(name,*args,**kwargs):
    if name.startswith("sagejs") and name not in allowed:
        raise AssertionError("mathematics imported before complete preflight: "+name)
    if name=="sagejs.number_fields":
        fromlist=args[2] if len(args)>2 else kwargs.get("fromlist",())
        assert all("sagejs.number_fields."+item in allowed for item in fromlist)
    return original_import(name,*args,**kwargs)
builtins.__import__=guarded
from sagejs.number_fields import class_unit_replay as components
from sagejs.number_fields import class_unit_generation_replay as generation
for replay in [components.replay_terminal_components,components.replay_conditional_class_unit,generation.replay_generating_base]:
    for text in ['{}','{"x":1,"x":2}','{"x":1.5}','['*33+']'*33]:
        try: replay(text)
        except (ValueError,components.ComponentReplayResourceError): pass
        else: raise AssertionError("malformed input accepted")
print("cheap-preflight-ok")
`;
  const result = spawnSync(pythonExecutable(), ["-B", "-"],
    { input: source, cwd: root, encoding: "utf8", timeout: 30000 });
  assert.equal(result.status, 0, result.error?.message || result.stderr || result.stdout);
  assert.equal(result.stdout.trim(), "cheap-preflight-ok");
});
