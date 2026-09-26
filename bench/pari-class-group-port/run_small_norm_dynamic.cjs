"use strict";
// One fresh-state dynamic/packed-host timing process over a pinned fixture.
// Input conversion/allocation and result checking are outside entry clocks.
const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash}=require('node:crypto');
const manifest=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const backend=process.argv[3],repetitions=Number(process.argv[4]||1);
assert(['javascript','gmp'].includes(backend));assert(Number.isInteger(repetitions)&&repetitions>=1&&repetitions<=100000);
for(const [file,key]of [[manifest.fixturePath,'fixture'],[manifest.modulePath,'module']])assert.equal(createHash('sha256').update(fs.readFileSync(file)).digest('hex'),manifest.hashes[key]);
const fixture=JSON.parse(fs.readFileSync(manifest.fixturePath,'utf8')),moduleValue=require(manifest.modulePath),f=moduleValue[manifest.entry];
assert.equal(fixture.schema,'pari-small-norm-collector-v1');assert(f.nativeAvailable);
for(const [index,row]of fixture.cases.entries()){
 let seconds=0,actual;
 for(let rep=-3;rep<repetitions;rep++){
  const v={};for(const [name,kind]of fixture.names){
   const convert=kind==='float'||kind==='Float64Buffer'?Number:BigInt,x=row.input[name];
   v[name]=Array.isArray(x)?x.map(convert):convert(x);
   if(backend==='gmp'&&Array.isArray(x)){
    if(kind==='IntegerBuffer'){
     const words=v[name].reduce((m,x)=>Math.max(m,Math.ceil((x<0n?-x:x).toString(2).length/64)),64);
     v[name]=moduleValue.createIntegerBuffer(x.length,words,v[name]);
    }else if(kind==='Int64Buffer')v[name]=BigInt64Array.from(v[name]);
    else v[name]=Float64Array.from(v[name]);
   }
  }
  const args=fixture.names.map(([name])=>v[name]);
  const start=performance.now(),status=f[backend](...args),elapsed=(performance.now()-start)/1000;
  if(rep>=0)seconds+=elapsed;
  // Check every invocation, including warmups, outside the measured entry.
  if(backend==='gmp')for(const [name,kind]of fixture.names){
   if(kind==='IntegerBuffer')v[name]=v[name].toArray();
   else if(kind==='Int64Buffer'||kind==='Float64Buffer')v[name]=Array.from(v[name]);
  }
  const last=Number(v.relation_state[0]),size=v.relation.length,n=Number(v.n);
  actual={status:Number(status),small:Number(v.counters[1]),trials:Number(v.state[1]),attempts:Number(v.counters[0]),relid:Number(v.progress[0]),nfact:Number(v.progress[1]),fact_count:Number(v.counters[2]),last,missing:Number(v.relation_state[2]),sup:Number(v.relation_state[3]),basis:v.relation_basis.map(Number),hashes:v.relation_hashes.slice(0,last).map(Number),records:v.relation_records.slice(0,last*size).map(Number),generators:v.generators.slice(0,last*n).map(String)};
  assert.deepEqual(actual,row.expected,index+' '+backend+' repetition '+rep);
 }
 console.log(JSON.stringify({index,seconds,...actual}));
}
