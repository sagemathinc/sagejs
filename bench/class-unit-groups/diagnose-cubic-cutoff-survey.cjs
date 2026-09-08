"use strict";
const {readFileSync}=require('node:fs');
const {gunzipSync}=require('node:zlib');
const {createHash}=require('node:crypto');
const assert=require('node:assert/strict');
const {resolve}=require('node:path');
const raw=gunzipSync(readFileSync(process.argv[4]));
assert.equal(createHash('sha256').update(raw).digest('hex'),
  '81f94ea6e43023b75fd060b04072f0cf089d1bbc045fc7e5f0c97585396dd3fd');
const records=raw.toString().trim().split('\n').map(JSON.parse);
const implementations=process.argv.slice(2,4).map(filename=>{
  const m=require(resolve(filename));assert.equal(m.nativeAvailable,true);
  const k=m.certified_complex_cubic_class_group_v1;
  return {k,cacheKey:m.cacheKey,sourceHash:m.sourceHash,out:k.createIntegerBuffer(64,256),
    scratch:[k.createUInt64Buffer(4161),...[512,4,9,16,16,144,48,109,1,1,1].map(n=>k.createIntegerBuffer(n,64))]};
});
const observations=[];
for(const record of records){
  const results=implementations.map(c=>{
    try{
      const accepted=c.k(c.out,c.k.packIntegerBuffer(record.coefficients.map(BigInt)),
        ...c.scratch,0,5,1048576,3145728);
      const output=c.out.toArray().map(String);
      if(accepted){
        assert.equal(output[1],record.class_number,record.label);
        const order=x=>[...x].sort((a,b)=>BigInt(a)<BigInt(b)?-1:BigInt(a)>BigInt(b)?1:0);
        assert.deepEqual(order(output.slice(3,3+Number(output[2]))),order(record.class_group),record.label);
      }
      return {accepted,output};
    }catch(e){return {error:e.message};}
  });
  observations.push({label:record.label,results});
  if(observations.length%100===0)console.error(observations.length);
}
console.log(JSON.stringify({schema:'sagejs.diagnostic/cubic-precision-survey-v1',
  public_census:false,independent_exact_replay:false,promotion:false,
  implementations:implementations.map(({cacheKey,sourceHash})=>({cacheKey,sourceHash})),
  counts:implementations.map((_,i)=>({accepted:observations.filter(r=>r.results[i].accepted).length,
    declined:observations.filter(r=>r.results[i].accepted===false).length,
    errors:observations.filter(r=>r.results[i].error).length})),
  coverage_changes:observations.filter(r=>r.results[0].accepted!==r.results[1].accepted).map(r=>({
    label:r.label,statuses:r.results.map(x=>x.error??(x.accepted?'accepted':`decline:${x.output[63]}`))})),
  observations},null,2));
