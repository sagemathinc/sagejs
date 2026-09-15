"use strict";
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const assert=require("node:assert/strict"),{spawnSync}=require("node:child_process");
const input=path.resolve(process.argv[2]),reference=path.resolve(process.argv[3]);
const cpu=process.argv[4];assert(/^\d+$/.test(cpu),"explicit CPU required");
const directory=fs.mkdtempSync(path.join(os.tmpdir(),"sagejs-arena-pair-"));
const records=[];
for(const order of [[true,false],[false,true],[true,false]])for(const baseline of order){
 const args=["-c",cpu,process.execPath,path.join(__dirname,"probe_resident_class_attempt.cjs"),input,
  "--backend","gmp","--arena-bytes","134217728","--profile-symbols","--samples","1",
  "--repetitions","20","--reference-fixtures",reference,...(baseline?["--arena-baseline"]:[])];
 const result=spawnSync("taskset",args,{encoding:"utf8",timeout:120000,maxBuffer:2*1024*1024,
  env:{...process.env,OPENBLAS_NUM_THREADS:"1"}});
 assert.equal(result.status,0,result.stderr||String(result.error));
 const report=JSON.parse(result.stdout.trim());
 assert.equal(report.arenaBaseline,baseline);assert.equal(report.samples.length,1);
 if(records.length){
  for(const key of ["inputSha256","sourceSha256","coreSha256","ownerBytes","resetSnapshotBytes","ordinaryWordCapacity","cupWordCapacity"])
   assert.deepEqual(report[key],records[0].report[key],key);
  assert.deepEqual(report.answer,records[0].report.answer);
 }
 records.push({baseline,args,report});
 fs.writeFileSync(path.join(directory,`run-${records.length}.json`),JSON.stringify(records.at(-1)));
 console.log(JSON.stringify({run:records.length,baseline,millisecondsPerCall:report.samples[0].milliseconds/20}));
}
const ratios=[];for(let i=0;i<records.length;i+=2){const pair=records.slice(i,i+2);ratios.push(pair.find(r=>!r.baseline).report.samples[0].milliseconds/pair.find(r=>r.baseline).report.samples[0].milliseconds);}
const report={qualifiedTiming:false,boundary:"Same compiled GMP module, alternating baseline/arena fresh-state calls; shared host diagnostic, not PARI qualification.",
 cpu,node:process.version,openblasThreads:1,repetitions:20,records,arenaToBaselineRatios:ratios,
 geometricMeanRatio:Math.exp(ratios.reduce((s,r)=>s+Math.log(r),0)/ratios.length)};
const output=path.join(directory,"result.json");fs.writeFileSync(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({output,ratios,geometricMeanRatio:report.geometricMeanRatio}));
