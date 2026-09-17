#!/usr/bin/env node
"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),{spawnSync}=require("node:child_process");
const root=path.resolve(__dirname,"../.."),runtimeRoot=path.resolve(process.env.SAGEJS_REPLAY_RUNTIME_ROOT||"/home/user/sagejs");
const resident=path.resolve(process.env.SAGEJS_RESIDENT_CUBIC||"/tmp/sagejs-resident-generated-class-3qtnS5/output.json");
const fixturePath=path.join(__dirname,"regulator-acceptance-replay-fixture.json");
function run(command,args,options={}){const result=spawnSync(command,args,{cwd:root,encoding:"utf8",maxBuffer:128*1024*1024,timeout:300000,...options});assert.equal(result.status,0,result.stderr||String(result.error));return result.stdout;}
async function buildRegulator(){
  const {createSage}=require(path.join(runtimeRoot,"dist/tools/kernel.js"));
  const moduleSource=fs.readFileSync(path.join(__dirname,"regulator_acceptance_replay.py"),"utf8");
  const fixture=JSON.parse(fs.readFileSync(fixturePath,"utf8"));
  const session=await createSage({mode:"python"});
  try{const source=moduleSource+String.raw`
import json
R=PolynomialRing(QQ,"x");x=R.gen();K=NumberField(x**3-20018*x+20034,"a")
fixture=json.loads(${JSON.stringify(JSON.stringify(fixture))})
payload=build_regulator_acceptance_replay(K,fixture)
raw,authority=seal_regulator_acceptance_replay(payload)
assert cold_replay_regulator_acceptance(K,raw,authority)==payload
print(json.dumps({"envelope":json.loads(raw),"sha256":authority.envelope_sha256},sort_keys=True))
`;const result=await session.evaluate(source,{filename:"build-no-oracle-root-regulator.py"});assert.equal(result.stderr||"","",result.stderr);process.stdout.write(result.stdout);}finally{session.close();}
}
function main(){
 const regulator=JSON.parse(run(process.execPath,[__filename,"--build-regulator"]));
 const program=String.raw`
import copy,dataclasses,hashlib,json,pathlib,sys,threading,typing
sys.set_int_max_str_digits(100000);sys.path[:0]=[sys.argv[1],sys.argv[1]+"/src/lib"]
import importlib
u=importlib.import_module("bench.pari-class-group-port.unit_relation_authority")
m=importlib.import_module("bench.pari-class-group-port.prepared_h1_no_oracle_root")
resident,fixture=sys.argv[2:4];regulator=json.load(sys.stdin)
# These detached sources are prepared outside the root. The root receives
# neither this fixture path nor a callback with filesystem/process authority.
unit=u.capture_unit_relation_authority(resident,fixture)
payload=m.build_prepared_h1_no_oracle_root(resident,unit,regulator["envelope"],regulator["sha256"])
assert payload["terminal"]["internal_correspondence_complete"] is True
assert payload["terminal"]["public_class_unit_complete"] is False
assert payload["class_group"]["class_number"]=="1" and payload["class_group"]["generator_ideals"]==[]
assert payload["unit_group_correspondence"]["relation_product_linked"] is True
assert payload["unit_group_correspondence"]["independent_regulator_replayed"] is True
assert payload["composition"]["fixture_reads"] is False and payload["composition"]["external_process_calls"] is False
assert payload["composition"]["retry_embedding_input"] is False and payload["composition"]["retry_log_input"] is False
publisher=m.PreparedH1RootPublisher();published,authority=publisher.publish(payload)
assert publisher.publish(copy.deepcopy(payload))[0]==published
assert m.cold_replay_prepared_h1_no_oracle_root(published,authority,resident,unit,regulator["envelope"],regulator["sha256"])==published
canonical=lambda value:json.dumps(value,sort_keys=True,separators=(",",":"),ensure_ascii=True,allow_nan=False).encode("ascii")
mutations=0
changed=copy.deepcopy(regulator["envelope"]);changed["payload"]["inputs"]["resident"]["packed_logs"][0]="1"
changed["payload_sha256"]=hashlib.sha256(canonical(changed["payload"])).hexdigest();changed_sha=hashlib.sha256(canonical(changed)).hexdigest()
try:m.build_prepared_h1_no_oracle_root(resident,unit,changed,changed_sha)
except m.PreparedH1RootFailure:mutations+=1
else:raise AssertionError("coordinated packed-log mutation accepted")
changed_unit=copy.deepcopy(unit);changed_unit["published_units_power_basis"]["entries"][0]="0"
try:m.build_prepared_h1_no_oracle_root(resident,changed_unit,regulator["envelope"],regulator["sha256"])
except Exception:mutations+=1
else:raise AssertionError("mutated exact relation product accepted")
changed_payload=copy.deepcopy(payload);changed_payload["terminal"]["public_class_unit_complete"]=True
changed_result,changed_authority=m.seal_prepared_h1_no_oracle_root(changed_payload)
try:m.cold_replay_prepared_h1_no_oracle_root(changed_result,changed_authority,resident,unit,regulator["envelope"],regulator["sha256"])
except m.PreparedH1RootFailure:mutations+=1
else:raise AssertionError("coordinated public completion mutation accepted")
conflict=copy.deepcopy(payload);conflict["terminal"]["status"]="conflict"
try:publisher.publish(conflict)
except m.PreparedH1RootFailure:mutations+=1
else:raise AssertionError("conflicting publication accepted")
print(json.dumps({"status":payload["terminal"]["status"],"sha256":published.sha256,"mutations":mutations,"retryPrecisionBits":payload["unit_group_correspondence"]["retry_precision_bits"],"fixtureInsideRoot":payload["composition"]["fixture_reads"],"publicComplete":payload["terminal"]["public_class_unit_complete"]},sort_keys=True))
`;
 const summary=JSON.parse(run("python3",["-c",program,root,resident,fixturePath],{input:JSON.stringify(regulator)}));
 assert.equal(summary.mutations,4);assert.equal(summary.fixtureInsideRoot,false);assert.equal(summary.publicComplete,false);console.log(JSON.stringify(summary,null,2));
}
if(process.argv[2]==="--build-regulator")buildRegulator().catch(error=>{console.error(error.stack||error);process.exit(1);});else main();
