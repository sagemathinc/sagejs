"use strict";
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {performance}=require("node:perf_hooks");
const input=JSON.parse(fs.readFileSync(process.argv[2],"utf8"));
const modulePath=path.resolve(process.argv[3]),mod=require(modulePath);
const reports=[];
for(const arena of [false,true]){
 const values={};
 for(const [name,kind] of input.names){
  const convert=kind==="bool"?Boolean:kind==="float"||kind==="Float64Buffer"?Number:BigInt;
  const raw=input.inputs[0][name];values[name]=Array.isArray(raw)?raw.map(convert):convert(raw);
 }
 const args=input.names.map(([name])=>values[name]);if(arena)args.push(134217728n);
 const f=mod[arena?"pari_prepared_class_group_arena":"pari_prepared_class_group_attempt"].javascript;
 const start=performance.now(),action=f(...args),milliseconds=performance.now()-start;
 const count=Number(values.attempt_state[2]);
 const actual={action:Number(action),state:values.attempt_state.map(Number),
  invariants:values.class_invariants.slice(0,count).map(String),
  classNumber:String(values.class_number[0]),regulator:values.accept_regulator.slice(0,3).map(String)};
 for(const [key,value] of Object.entries(actual))assert.deepEqual(value,input.summary.cp[0][key],key);
 assert.equal(Number(values.relation_state[0]),58);
 assert.equal(Number(values.counters[1]),491);assert.equal(Number(values.progress[1]),54);
 assert.equal(Number(values.search_count)-Number(values.schedule[0]),12);
 const report={javascriptReplay:"pass",arena,modulePath,qualifiedTiming:false,milliseconds,actual};
 reports.push(report);console.log(JSON.stringify(report));
}
if(process.argv[4])fs.writeFileSync(process.argv[4],JSON.stringify(reports,null,2)+"\n");
