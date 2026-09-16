"use strict";
// Short alternating diagnostic; not the plan's one-second paired samples.
const assert=require('node:assert/strict'),path=require('node:path');
const {spawnSync}=require('node:child_process');
function run(exe,args,input){const r=spawnSync(exe,args,{input,encoding:'utf8',timeout:60000,maxBuffer:8*1024*1024});assert.equal(r.status,0,r.stderr||String(r.error));return r.stdout;}
const [pari,before,after]=process.argv.slice(2).map(x=>path.resolve(x));
const fixture=JSON.parse(run(process.execPath,[path.join(__dirname,'check_compiled_ideal_collector.cjs'),pari,'--export-fixtures']));
const stream=[String(fixture.cases.length)];
for(const entry of fixture.cases)for(const [name,kind] of fixture.names){const x=entry.input[name];
 if(Array.isArray(x)){stream.push(String(x.length));if(kind==='IntegerBuffer')stream.push(String(x.reduce((m,s)=>Math.max(m,Math.ceil((BigInt(s)<0n?-BigInt(s):BigInt(s)).toString(2).length/64)),8)));stream.push(...x.map(String));}
 else stream.push(String(x));
}
const input=stream.join('\n')+'\n',samples=[];
for(let sample=0;sample<3;sample++)for(const variant of sample%2?['after','before']:['before','after']){
 const rows=run(variant==='before'?before:after,[],input).trim().split('\n').map(JSON.parse);
 assert.equal(rows.length,16);for(const {index,seconds,...actual} of rows){assert(Number.isFinite(seconds)&&seconds>=0);assert.deepEqual(actual,fixture.cases[index].expected);}
 samples.push({sample,variant,totalSeconds:rows.reduce((sum,r)=>sum+r.seconds,0)});
}
console.log(JSON.stringify({qualified:false,before,after,samples}));
