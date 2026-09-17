#!/usr/bin/env node
"use strict";

// sagejs-test-tier: specialized
// sagejs-test-platform: linux

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "../..");
const fixture = JSON.parse(fs.readFileSync(
  path.join(__dirname, "regulator-acceptance-replay-fixture.json"), "utf8",
));
const run = spawnSync("python3", ["-c", String.raw`
import copy,hashlib,json,pathlib,sys
from concurrent.futures import ThreadPoolExecutor
sys.path[:0]=[sys.argv[1],sys.argv[1]+"/src/lib"]
from importlib import import_module
c=import_module("bench.pari-class-group-port.class_group_live_result_assembly")
u=import_module("bench.pari-class-group-port.no_oracle_unit_regulator_completion")
k=import_module("bench.pari-class-group-port.authentic_compact_success")
t=import_module("bench.pari-class-group-port.torsion_authority")
m=import_module("bench.pari-class-group-port.final_class_unit_completion_composer")
d=json.load(sys.stdin);units=d["exact_units_power_coordinates"]
canonical=lambda x:json.dumps(x,sort_keys=True,separators=(",",":"),ensure_ascii=True,allow_nan=False).encode("ascii")
sha=lambda x:hashlib.sha256(canonical(x)).hexdigest()
resident="1"*64
def envelope(schema,payload):
 raw=canonical({"schema":schema,"payload":payload,"payload_sha256":sha(payload)})
 return raw,hashlib.sha256(raw).hexdigest()
class_payload={
 "source":{"resident_sha256":resident},
 "class_group":{"class_number":"1","invariant_factors":[],"generators":[]},
 "cleanarch":{"status":"accepted","honesty_status":"equal-bound-source-skip"},
 "terminal":{"atomic_publication":True,"unit_group_included":False}}
class_raw,class_sha=envelope(c.SCHEMA,class_payload)
class_owner=c.ImmutableLiveClassResult(class_raw,class_sha);class_auth=c.LiveClassResultAuthority(class_sha)
logs=[]
for i in range(6):logs += [str(10+i),"2176",str(i-3)]
reg={"rigorous":True,"full_rank_certified":True,"lower":"1","upper":"2"}
unit_payload={
 "schema":u.SCHEMA,
 "field":{"id":m.FIELD_ID,"polynomial_ascending":["20034","-20018","0","1"]},
 "authorities":{"resident_sha256":resident},
 "unit_group_correspondence":{"rank":"2","exact_units_power_coordinates":units,"rebuilt_packed_logs":logs,"regulator_enclosure":reg},
 "terminal":{"correspondence_complete":True,"no_pari_or_answer_oracle":True,"public_complete":False,"unit_saturation_certified":False,"missing_public_evidence":["unit-saturation-index-one"]}}
unit_raw,unit_sha=envelope(u.ENVELOPE_SCHEMA,unit_payload);unit_auth=u.NoOracleCompletionAuthority(unit_sha)
compact_payload={
 "source":{"resident_sha256":resident},
 "class_group":{"class_number":"1","invariant_factors":[]},
 "compact_units":{"rank":"2","factor_ids":[str(i) for i in range(7)],"exponent_shape":["2","7"],"exponents":["0"]*14,"materialization":"separate-qualified-resident-replay","expanded_units":None},
 "authority_links":{"regulator_power_unit_sha256":sha(units)},
 "terminal":{"public_complete":False,"unit_saturation_certified":False}}
compact_raw,compact_sha=envelope(k.SCHEMA,compact_payload)
compact_owner=k.ImmutableAuthenticCompactSuccess(compact_raw,compact_sha);compact_auth=k.AuthenticCompactSuccessAuthority(compact_sha)
torsion=t.derive_real_cubic_torsion([20034,-20018,0,1]);tp=torsion.detached_payload();torsion_auth=t.TorsionReplayAuthority(tp["field"]["polynomial_sha256"],torsion.sha256)
sources=[class_owner,class_auth,unit_raw,unit_auth,compact_owner,compact_auth,torsion,torsion_auth]
publisher=m.FinalCompletionPublisher()
with ThreadPoolExecutor(max_workers=8) as pool:published=list(pool.map(lambda _:publisher.publish(*sources),range(16)))
assert len({x.sha256 for x in published})==1 and publisher.current()==published[0]
result=published[0];auth=m.FinalCompletionAuthority(result.sha256)
assert m.cold_replay_final_internal_completion(result,auth,*sources)==result
payload=result.detached_payload();assert payload["terminal"]["correspondence_complete"] is True
assert payload["terminal"]["public"] is False and payload["terminal"]["public_complete"] is False
assert payload["policy"]=={"honesty":"equal-bound-source-skip","honesty_complete":True,"precision_retry":"completed-no-oracle-p2176","retry_precision_bits":"2176","retry_complete":True}

def owner(kind,payload):
 if kind=="class":
  raw,digest=envelope(c.SCHEMA,payload);return c.ImmutableLiveClassResult(raw,digest),c.LiveClassResultAuthority(digest)
 if kind=="unit":
  raw,digest=envelope(u.ENVELOPE_SCHEMA,payload);return raw,u.NoOracleCompletionAuthority(digest)
 raw,digest=envelope(k.SCHEMA,payload);return k.ImmutableAuthenticCompactSuccess(raw,digest),k.AuthenticCompactSuccessAuthority(digest)
def rejected(index,new_owner):
 changed=sources[:];changed[index:index+2]=new_owner
 try:m.build_final_internal_completion(*changed)
 except m.FinalCompletionFailure:return 1
 raise AssertionError("coordinated reauthorized mutation accepted")
mutations=0
changed=copy.deepcopy(class_payload);changed["cleanarch"]["honesty_status"]="verified";mutations+=rejected(0,owner("class",changed))
changed=copy.deepcopy(unit_payload);changed["unit_group_correspondence"]["rebuilt_packed_logs"][1]="2112";mutations+=rejected(2,owner("unit",changed))
changed=copy.deepcopy(unit_payload);changed["authorities"]["resident_sha256"]="2"*64;mutations+=rejected(2,owner("unit",changed))
changed=copy.deepcopy(compact_payload);changed["compact_units"]["exponents"].pop();mutations+=rejected(4,owner("compact",changed))
changed=copy.deepcopy(compact_payload);changed["authority_links"]["regulator_power_unit_sha256"]="0"*64;mutations+=rejected(4,owner("compact",changed))
final=copy.deepcopy(payload);final["terminal"]["public"]=True
raw,digest=envelope(m.ENVELOPE_SCHEMA,final);bad=m.ImmutableFinalCompletion(raw,digest)
try:m.cold_replay_final_internal_completion(bad,m.FinalCompletionAuthority(digest),*sources)
except m.FinalCompletionFailure:mutations+=1
else:raise AssertionError("reauthorized final mutation accepted")
source=pathlib.Path(m.__file__).read_text()
assert "Path(" not in source and "open(" not in source
assert "subprocess" not in source and "fixture.json" not in source
print(json.dumps({"schema":payload["schema"],"status":payload["terminal"]["status"],"correspondenceComplete":True,"public":False,"classNumber":1,"unitRank":2,"compactFactors":7,"torsionOrder":2,"honesty":payload["policy"]["honesty"],"retryBits":2176,"atomicPublications":len(published),"mutationsRejected":mutations,"sha256":result.sha256},sort_keys=True))
`, root], {
  cwd: root,
  input: JSON.stringify(fixture),
  encoding: "utf8",
  timeout: 300000,
  maxBuffer: 128 * 1024 * 1024,
});
assert.equal(run.status, 0, run.stderr || String(run.error));
const summary = JSON.parse(run.stdout);
assert.equal(summary.correspondenceComplete, true);
assert.equal(summary.public, false);
assert.equal(summary.mutationsRejected, 6);
console.log(JSON.stringify(summary));
