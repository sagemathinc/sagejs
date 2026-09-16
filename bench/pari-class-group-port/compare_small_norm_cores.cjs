"use strict";
// Local before/after comparison of two pinned native segment builds.
const fs=require("node:fs"),assert=require("node:assert/strict");
const {spawnSync}=require("node:child_process"),{createHash}=require("node:crypto");
const manifests=process.argv.slice(2,4).map(p=>JSON.parse(fs.readFileSync(p)));
const cpu=Number(process.argv[4]),output=process.argv[5];
assert(Number.isInteger(cpu)&&cpu>=0);assert(output&&!fs.existsSync(output));
const hash=p=>createHash("sha256").update(fs.readFileSync(p)).digest("hex");
for(const m of manifests)for(const [key,file]of Object.entries({exe:m.exe,input:m.inputPath,fixture:m.fixturePath,core:m.core}))assert.equal(hash(file),m.hashes[key]);
assert.equal(manifests[0].fixtureSha256,manifests[1].fixtureSha256);
assert.equal(manifests[0].hashes.input,manifests[1].hashes.input);
const fixtures=manifests.map(m=>JSON.parse(fs.readFileSync(m.fixturePath)));
assert.deepEqual(fixtures[0].cases,fixtures[1].cases);
const report={qualified:false,scope:"Local native segment before/after; not full-engine or cross-host qualification",cpu,repetitions:64,warmups:3,manifests,results:[]};
for(let round=0;round<3;round++)for(const variant of round%2?[1,0]:[0,1]){
 const m=manifests[variant],before=fs.readFileSync("/proc/stat","utf8");
 const r=spawnSync("prlimit",["--as=4294967296","--cpu=120","--","taskset","-c",String(cpu),m.exe,"64"],{input:fs.readFileSync(m.inputPath),encoding:"utf8",timeout:120000,maxBuffer:4000000});
 assert.equal(r.status,0,r.stderr||String(r.error));
 const rows=r.stdout.trim().split("\n").map(JSON.parse);assert.equal(rows.length,fixtures[variant].cases.length);
 for(const [i,{index,seconds,...actual}]of rows.entries()){
  assert.equal(index,i);assert(Number.isFinite(seconds)&&seconds>=0);
  assert.deepEqual(actual,fixtures[variant].cases[i].expected);
 }
 const result={round,variant,seconds:rows.reduce((s,r)=>s+r.seconds,0),before,after:fs.readFileSync("/proc/stat","utf8")};
 report.results.push(result);fs.writeFileSync(output,JSON.stringify(report,null,2));
 console.log(JSON.stringify({round,variant,seconds:result.seconds}));
}
report.allSamplesAtLeastOneSecond=report.results.every(r=>r.seconds>=1);
fs.writeFileSync(output,JSON.stringify(report,null,2));
